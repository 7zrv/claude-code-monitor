use serde_json::json;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

#[cfg(test)]
use crate::state::broadcast_sse;
use crate::state::{build_snapshot, get_session_events, get_session_export};
use crate::types::{App, ParsedRequest};
use crate::utils::{bytes_response, content_type_for, json_response, now_iso};

pub fn parse_request(stream: &mut TcpStream) -> Option<ParsedRequest> {
    let timeout_secs = std::env::var("HTTP_READ_TIMEOUT_SEC")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(5);
    let _ = stream.set_read_timeout(Some(Duration::from_secs(timeout_secs)));
    let mut buf = [0_u8; 8192];
    let mut data = Vec::new();

    loop {
        let n = stream.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        data.extend_from_slice(&buf[..n]);
        if data.windows(4).any(|w| w == b"\r\n\r\n") {
            break;
        }
        if data.len() > 2 * 1024 * 1024 {
            return None;
        }
    }

    let headers_end = data.windows(4).position(|w| w == b"\r\n\r\n")? + 4;
    let header_text = String::from_utf8_lossy(&data[..headers_end]);
    let mut lines = header_text.split("\r\n");
    let request_line = lines.next()?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next()?.to_string();
    let mut path = parts.next()?.to_string();
    if let Some(idx) = path.find('?') {
        path = path[..idx].to_string();
    }

    Some(ParsedRequest { method, path })
}

pub fn serve_static(app: &App, path: &str) -> Vec<u8> {
    let clean = if path == "/" { "/index.html" } else { path };
    let rel = clean.trim_start_matches('/');
    let full = app.public_dir.join(rel);
    let canonical = match full.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return json_response(
                "404 Not Found",
                &json!({ "error": "Not found" }).to_string(),
            )
        }
    };
    let base = match app.public_dir.canonicalize() {
        Ok(p) => p,
        Err(_) => {
            return json_response(
                "500 Internal Server Error",
                &json!({ "error": "Internal error" }).to_string(),
            )
        }
    };
    if !canonical.starts_with(&base) {
        return json_response(
            "403 Forbidden",
            &json!({ "error": "Forbidden" }).to_string(),
        );
    }

    match std::fs::read(canonical) {
        Ok(bytes) => bytes_response("200 OK", &bytes, content_type_for(clean)),
        Err(_) => json_response(
            "404 Not Found",
            &json!({ "error": "Not found" }).to_string(),
        ),
    }
}

pub fn handle_sse(mut stream: TcpStream, rx: Receiver<String>, snapshot: String) {
    let header = "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream; charset=utf-8\r\nCache-Control: no-cache, no-transform\r\nConnection: keep-alive\r\n\r\n";
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(format!("data: {}\n\n", snapshot).as_bytes());
    let _ = stream.flush();

    loop {
        match rx.recv_timeout(Duration::from_secs(15)) {
            Ok(msg) => {
                if stream.write_all(msg.as_bytes()).is_err() {
                    break;
                }
                let _ = stream.flush();
            }
            Err(mpsc::RecvTimeoutError::Timeout) => {
                if stream.write_all(b": keepalive\n\n").is_err() {
                    break;
                }
                let _ = stream.flush();
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
        }
    }
}

pub fn spawn_sse_sweeper(app: App) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(30));
        let mut clients = app.sse_clients.lock().unwrap_or_else(|e| e.into_inner());
        clients.retain(|tx| tx.send(": keepalive\n\n".to_string()).is_ok());
    });
}

fn session_route_id<'a>(path: &'a str, suffix: &str) -> Option<&'a str> {
    path.strip_prefix("/api/sessions/")?.strip_suffix(suffix)
}

pub fn handle_client(mut stream: TcpStream, app: App) {
    let req = match parse_request(&mut stream) {
        Some(r) => r,
        None => {
            let _ = stream.write_all(&json_response(
                "400 Bad Request",
                &json!({ "error": "Invalid request" }).to_string(),
            ));
            return;
        }
    };

    match (req.method.as_str(), req.path.as_str()) {
        ("GET", "/api/health") => {
            let body = json!({ "ok": true, "now": now_iso() }).to_string();
            let _ = stream.write_all(&json_response("200 OK", &body));
        }
        ("GET", "/api/events") => {
            let snapshot = {
                let state = app.state.lock().unwrap_or_else(|e| e.into_inner());
                serde_json::to_string(&build_snapshot(&state)).unwrap_or_else(|_| "{}".to_string())
            };
            let _ = stream.write_all(&json_response("200 OK", &snapshot));
        }
        ("GET", "/api/alerts") => {
            let body = {
                let state = app.state.lock().unwrap_or_else(|e| e.into_inner());
                json!({ "alerts": state.alerts.iter().take(50).cloned().collect::<Vec<_>>() })
                    .to_string()
            };
            let _ = stream.write_all(&json_response("200 OK", &body));
        }
        ("GET", path) if session_route_id(path, "/events").is_some() => {
            let session_id = session_route_id(path, "/events").unwrap_or_default();
            let body = {
                let state = app.state.lock().unwrap_or_else(|e| e.into_inner());
                let events = get_session_events(&state, session_id);
                serde_json::to_string(&events).unwrap_or_else(|_| "[]".to_string())
            };
            let _ = stream.write_all(&json_response("200 OK", &body));
        }
        ("GET", path) if session_route_id(path, "/export").is_some() => {
            let session_id = session_route_id(path, "/export").unwrap_or_default();
            let export = {
                let state = app.state.lock().unwrap_or_else(|e| e.into_inner());
                get_session_export(&state, session_id)
            };
            match export {
                Some(export) => {
                    let body = serde_json::to_string(&export).unwrap_or_else(|_| "{}".to_string());
                    let _ = stream.write_all(&json_response("200 OK", &body));
                }
                None => {
                    let _ = stream.write_all(&json_response(
                        "404 Not Found",
                        &json!({ "error": "Session not found" }).to_string(),
                    ));
                }
            }
        }
        ("GET", "/api/stream") => {
            let snapshot = {
                let state = app.state.lock().unwrap_or_else(|e| e.into_inner());
                json!({ "type": "snapshot", "payload": build_snapshot(&state) }).to_string()
            };
            let (tx, rx) = mpsc::channel::<String>();
            app.sse_clients
                .lock()
                .unwrap_or_else(|e| e.into_inner())
                .push(tx);
            handle_sse(stream, rx, snapshot);
        }
        ("GET", _) => {
            let resp = serve_static(&app, &req.path);
            let _ = stream.write_all(&resp);
        }
        _ => {
            let _ = stream.write_all(&json_response(
                "405 Method Not Allowed",
                &json!({ "error": "Method not allowed" }).to_string(),
            ));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::State;
    use std::io::Write;
    use std::net::TcpListener;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicU64;
    use std::sync::{Arc, Mutex};

    fn make_test_app() -> App {
        make_test_app_with_dir(PathBuf::from("public"))
    }

    fn make_test_app_with_dir(path: PathBuf) -> App {
        App {
            state: Arc::new(Mutex::new(State::default())),
            sse_clients: Arc::new(Mutex::new(Vec::new())),
            event_seq: Arc::new(AtomicU64::new(1)),
            public_dir: Arc::new(path),
            db: None,
        }
    }

    fn spawn_test_server(app: App) -> (String, thread::JoinHandle<()>) {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = listener.local_addr().unwrap().to_string();
        let handle = thread::spawn(move || {
            let (stream, _) = listener.accept().unwrap();
            handle_client(stream, app);
        });
        (addr, handle)
    }

    fn http_request(addr: &str, request: &str) -> String {
        let mut stream = TcpStream::connect(addr).unwrap();
        stream
            .set_write_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream.write_all(request.as_bytes()).unwrap();
        let mut buf = Vec::new();
        let _ = stream.read_to_end(&mut buf);
        String::from_utf8_lossy(&buf).to_string()
    }

    fn response_body(resp: &str) -> &str {
        resp.split("\r\n\r\n").nth(1).unwrap_or("")
    }

    fn unique_tmp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ccm_test_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_serve_static_200_ok() {
        let dir = unique_tmp_dir("ss_200");
        {
            let mut f = std::fs::File::create(dir.join("hello.html")).unwrap();
            write!(f, "<h1>Hi</h1>").unwrap();
        }
        let app = make_test_app_with_dir(dir.clone());
        let resp = String::from_utf8(serve_static(&app, "/hello.html")).unwrap();
        assert!(resp.starts_with("HTTP/1.1 200 OK"));
        assert!(resp.contains("text/html"));
        assert!(resp.contains("<h1>Hi</h1>"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_serve_static_index_redirect() {
        let dir = unique_tmp_dir("ss_index");
        {
            let mut f = std::fs::File::create(dir.join("index.html")).unwrap();
            write!(f, "index").unwrap();
        }
        let app = make_test_app_with_dir(dir.clone());
        let resp = String::from_utf8(serve_static(&app, "/")).unwrap();
        assert!(resp.starts_with("HTTP/1.1 200 OK"));
        assert!(resp.contains("index"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_serve_static_404() {
        let dir = unique_tmp_dir("ss_404");
        let app = make_test_app_with_dir(dir.clone());
        let resp = String::from_utf8(serve_static(&app, "/missing.html")).unwrap();
        assert!(resp.contains("404 Not Found"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_serve_static_403_path_traversal() {
        let dir = unique_tmp_dir("ss_403");
        std::fs::create_dir_all(&dir).unwrap();
        {
            let mut f = std::fs::File::create(dir.join("safe.html")).unwrap();
            write!(f, "safe").unwrap();
        }
        let app = make_test_app_with_dir(dir.clone());
        let resp = String::from_utf8(serve_static(&app, "/../../../etc/passwd")).unwrap();
        assert!(resp.contains("403") || resp.contains("404"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_serve_static_nonexistent_public_dir() {
        let nonexistent = std::env::temp_dir().join("ccm_nonexistent_public_xyz");
        let app = make_test_app_with_dir(nonexistent);
        let resp = String::from_utf8(serve_static(&app, "/index.html")).unwrap();
        assert!(resp.contains("404") || resp.contains("500"));
    }

    #[test]
    fn test_handle_client_health() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let resp = http_request(&addr, "GET /api/health HTTP/1.1\r\nHost: localhost\r\n\r\n");
        handle.join().unwrap();
        assert!(resp.contains("200 OK"));
        assert!(resp.contains("\"ok\":true"));
    }

    #[test]
    fn test_handle_client_get_events() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let resp = http_request(&addr, "GET /api/events HTTP/1.1\r\nHost: localhost\r\n\r\n");
        handle.join().unwrap();
        assert!(resp.contains("200 OK"));
        assert!(resp.contains("generatedAt"));
    }

    #[test]
    fn test_handle_client_get_alerts() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let resp = http_request(&addr, "GET /api/alerts HTTP/1.1\r\nHost: localhost\r\n\r\n");
        handle.join().unwrap();
        assert!(resp.contains("200 OK"));
        assert!(resp.contains("alerts"));
    }

    #[test]
    fn test_handle_client_static_file() {
        let dir = unique_tmp_dir("hc_static");
        {
            let mut f = std::fs::File::create(dir.join("page.html")).unwrap();
            write!(f, "<p>hello</p>").unwrap();
        }
        let app = make_test_app_with_dir(dir.clone());
        let (addr, handle) = spawn_test_server(app);
        let resp = http_request(&addr, "GET /page.html HTTP/1.1\r\nHost: localhost\r\n\r\n");
        handle.join().unwrap();
        assert!(resp.contains("200 OK"));
        assert!(resp.contains("<p>hello</p>"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_handle_client_query_string_stripped() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let resp = http_request(
            &addr,
            "GET /api/health?ts=123 HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        handle.join().unwrap();
        assert!(resp.contains("200 OK"));
        assert!(resp.contains("\"ok\":true"));
    }

    #[test]
    fn test_handle_client_sse_stream() {
        let app = make_test_app();
        let app_ref = app.clone();
        let (addr, handle) = spawn_test_server(app);

        let mut stream = TcpStream::connect(&addr).unwrap();
        stream
            .set_read_timeout(Some(Duration::from_secs(2)))
            .unwrap();
        stream
            .write_all(b"GET /api/stream HTTP/1.1\r\nHost: localhost\r\n\r\n")
            .unwrap();

        // read all available data (header + initial snapshot)
        let mut all = Vec::new();
        let mut buf = [0u8; 8192];
        loop {
            match stream.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    all.extend_from_slice(&buf[..n]);
                    let s = String::from_utf8_lossy(&all);
                    if s.contains("text/event-stream") && s.contains("data:") {
                        break;
                    }
                }
                Err(_) => break,
            }
        }
        let resp = String::from_utf8_lossy(&all);
        assert!(resp.contains("text/event-stream"));

        // disconnect client then trigger broadcast to exit handle_sse
        drop(stream);
        broadcast_sse(&app_ref, "trigger_exit".to_string());

        handle.join().unwrap();
    }

    #[test]
    fn test_handle_client_post_events_rejected() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let resp = http_request(
            &addr,
            "POST /api/events HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        handle.join().unwrap();
        assert!(resp.contains("405 Method Not Allowed"));
    }

    #[test]
    fn test_handle_client_session_events_200() {
        use crate::state::append_event;
        use crate::types::Event;

        let app = make_test_app();
        let evt = Event {
            id: "e1".to_string(),
            agent_id: "a1".to_string(),
            event: "msg".to_string(),
            status: "ok".to_string(),
            latency_ms: None,
            message: "hello".to_string(),
            metadata: serde_json::json!({}),
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            received_at: "2025-01-01T00:00:00Z".to_string(),
            model: String::new(),
            is_sidechain: false,
            session_id: "sess-abc".to_string(),
            cwd: String::new(),
        };
        append_event(&app, evt);

        let (addr, handle) = spawn_test_server(app);
        let resp = http_request(
            &addr,
            "GET /api/sessions/sess-abc/events HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        handle.join().unwrap();
        assert!(resp.contains("200 OK"));
        assert!(resp.contains("\"event\":\"msg\""));
    }

    #[test]
    fn test_handle_client_session_events_empty_for_unknown() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let resp = http_request(
            &addr,
            "GET /api/sessions/nonexistent/events HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        handle.join().unwrap();
        assert!(resp.contains("200 OK"));
        assert!(resp.contains("[]"));
    }

    #[test]
    fn test_handle_client_session_export_200() {
        use crate::state::append_event;
        use crate::types::Event;

        let app = make_test_app();
        append_event(
            &app,
            Event {
                id: "e1".to_string(),
                agent_id: "a1".to_string(),
                event: "token_usage".to_string(),
                status: "ok".to_string(),
                latency_ms: None,
                message: "tokens +200".to_string(),
                metadata: serde_json::json!({
                    "tokenUsage": { "totalTokens": 200 }
                }),
                timestamp: "2025-01-01T00:00:00Z".to_string(),
                received_at: "2025-01-01T00:00:00Z".to_string(),
                model: String::new(),
                is_sidechain: false,
                session_id: "sess-abc".to_string(),
                cwd: String::new(),
            },
        );
        append_event(
            &app,
            Event {
                id: "e2".to_string(),
                agent_id: "a2".to_string(),
                event: "cost_update".to_string(),
                status: "ok".to_string(),
                latency_ms: None,
                message: "cost +0.03".to_string(),
                metadata: serde_json::json!({
                    "costDelta": 0.03
                }),
                timestamp: "2025-01-01T00:00:01Z".to_string(),
                received_at: "2025-01-01T00:00:01Z".to_string(),
                model: String::new(),
                is_sidechain: false,
                session_id: "sess-abc".to_string(),
                cwd: String::new(),
            },
        );

        let (addr, handle) = spawn_test_server(app);
        let resp = http_request(
            &addr,
            "GET /api/sessions/sess-abc/export HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        handle.join().unwrap();

        assert!(resp.contains("200 OK"));

        let body: serde_json::Value = serde_json::from_str(response_body(&resp)).unwrap();
        assert_eq!(body["summary"]["sessionId"], "sess-abc");
        assert_eq!(body["summary"]["tokenTotal"], 200);
        assert_eq!(
            body["events"].as_array().map(|events| events.len()),
            Some(2)
        );
        assert_eq!(
            body["summary"]["agentIds"].as_array().map(|ids| ids.len()),
            Some(2)
        );
        assert!(body["summary"]["costUsd"].as_f64().unwrap_or_default() > 0.0);
        assert!(body["exportedAt"].as_str().is_some());
    }

    #[test]
    fn test_handle_client_session_export_404_for_unknown() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let resp = http_request(
            &addr,
            "GET /api/sessions/nonexistent/export HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        handle.join().unwrap();

        assert!(resp.contains("404 Not Found"));
        let body: serde_json::Value = serde_json::from_str(response_body(&resp)).unwrap();
        assert_eq!(body["error"], "Session not found");
    }

    #[test]
    fn test_handle_client_method_not_allowed() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let resp = http_request(
            &addr,
            "DELETE /api/events HTTP/1.1\r\nHost: localhost\r\n\r\n",
        );
        handle.join().unwrap();
        assert!(resp.contains("405 Method Not Allowed"));
    }
}
