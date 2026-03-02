use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::atomic::Ordering;
use std::sync::mpsc::{self, Receiver};
use std::thread;
use std::time::Duration;

#[cfg(test)]
use crate::state::broadcast_sse;
use crate::state::{append_event, build_snapshot};
use crate::types::{App, Event, ParsedRequest};
use crate::utils::{bytes_response, content_type_for, json_response, now_iso, status_norm};

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

    let mut content_length = 0usize;
    let mut headers = HashMap::new();
    for line in lines {
        let lower = line.to_lowercase();
        if lower.starts_with("content-length:") {
            let v = line.split(':').nth(1).unwrap_or("0").trim();
            content_length = v.parse::<usize>().unwrap_or(0);
        }
        if let Some((k, v)) = line.split_once(':') {
            headers.insert(k.trim().to_lowercase(), v.trim().to_string());
        }
    }
    if headers
        .get("transfer-encoding")
        .map(|v| v.to_lowercase().contains("chunked"))
        .unwrap_or(false)
    {
        return None;
    }

    if content_length > 1024 * 1024 {
        return None;
    }

    let mut body = data[headers_end..].to_vec();
    while body.len() < content_length {
        let n = stream.read(&mut buf).ok()?;
        if n == 0 {
            break;
        }
        body.extend_from_slice(&buf[..n]);
    }

    Some(ParsedRequest {
        method,
        path,
        headers,
        body,
    })
}

pub fn normalize_incoming(payload: &Value, app: &App) -> Event {
    let now = now_iso();
    let ts = payload
        .get("timestamp")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| now.clone());

    let status = payload
        .get("status")
        .and_then(|v| v.as_str())
        .map(status_norm)
        .unwrap_or_else(|| "ok".to_string());

    let meta = payload
        .get("metadata")
        .cloned()
        .unwrap_or_else(|| json!({}));

    Event {
        id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
        agent_id: payload
            .get("agentId")
            .and_then(|v| v.as_str())
            .unwrap_or("unknown-agent")
            .to_string(),
        event: payload
            .get("event")
            .and_then(|v| v.as_str())
            .unwrap_or("heartbeat")
            .to_string(),
        status,
        latency_ms: payload.get("latencyMs").and_then(|v| v.as_i64()),
        message: payload
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        model: meta
            .get("model")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        is_sidechain: meta
            .get("isSidechain")
            .and_then(|v| v.as_bool())
            .unwrap_or(false),
        session_id: meta
            .get("sessionId")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string(),
        metadata: meta,
        timestamp: ts,
        received_at: now,
    }
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
        ("POST", "/api/events") => {
            if let Some(expected) = &app.api_key {
                let provided = req.headers.get("x-api-key").cloned().unwrap_or_default();
                if &provided != expected {
                    let _ = stream.write_all(&json_response(
                        "401 Unauthorized",
                        &json!({ "error": "Unauthorized" }).to_string(),
                    ));
                    return;
                }
            }

            let payload: Value = match serde_json::from_slice(&req.body) {
                Ok(v) => v,
                Err(_) => {
                    let _ = stream.write_all(&json_response(
                        "400 Bad Request",
                        &json!({ "error": "Invalid JSON" }).to_string(),
                    ));
                    return;
                }
            };

            let evt = normalize_incoming(&payload, &app);
            let id = evt.id.clone();
            append_event(&app, evt);
            let body = json!({ "accepted": true, "id": id }).to_string();
            let _ = stream.write_all(&json_response("202 Accepted", &body));
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
    use serde_json::json;
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
            api_key: None,
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

    fn unique_tmp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ccm_test_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_normalize_incoming_full_payload() {
        let app = make_test_app();
        let payload = json!({
            "agentId": "bot-1",
            "event": "task_complete",
            "status": "ok",
            "latencyMs": 123,
            "message": "done",
            "timestamp": "2025-06-01T00:00:00Z",
            "metadata": { "source": "test" }
        });
        let evt = normalize_incoming(&payload, &app);
        assert_eq!(evt.agent_id, "bot-1");
        assert_eq!(evt.event, "task_complete");
        assert_eq!(evt.status, "ok");
        assert_eq!(evt.latency_ms, Some(123));
        assert_eq!(evt.message, "done");
        assert_eq!(evt.timestamp, "2025-06-01T00:00:00Z");
        assert!(evt.id.starts_with('e'));
    }

    #[test]
    fn test_normalize_incoming_missing_fields() {
        let app = make_test_app();
        let payload = json!({});
        let evt = normalize_incoming(&payload, &app);
        assert_eq!(evt.agent_id, "unknown-agent");
        assert_eq!(evt.event, "heartbeat");
        assert_eq!(evt.status, "ok");
        assert_eq!(evt.latency_ms, None);
        assert_eq!(evt.message, "");
    }

    #[test]
    fn test_normalize_incoming_status_normalized() {
        let app = make_test_app();
        let payload = json!({ "status": "ERROR" });
        let evt = normalize_incoming(&payload, &app);
        assert_eq!(evt.status, "error");
    }

    #[test]
    fn test_normalize_incoming_extracts_model_from_metadata() {
        let app = make_test_app();
        let payload = json!({
            "agentId": "agent-x",
            "event": "test",
            "metadata": {
                "model": "claude-opus-4-6",
                "isSidechain": true,
                "sessionId": "sess123"
            }
        });
        let evt = normalize_incoming(&payload, &app);
        assert_eq!(evt.model, "claude-opus-4-6");
        assert!(evt.is_sidechain);
        assert_eq!(evt.session_id, "sess123");
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
    fn test_handle_client_post_events_valid() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let body = r#"{"agentId":"a1","event":"test","status":"ok"}"#;
        let req = format!(
            "POST /api/events HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let resp = http_request(&addr, &req);
        handle.join().unwrap();
        assert!(resp.contains("202 Accepted"));
        assert!(resp.contains("\"accepted\":true"));
    }

    #[test]
    fn test_handle_client_post_events_invalid_json() {
        let (addr, handle) = spawn_test_server(make_test_app());
        let body = "not json";
        let req = format!(
            "POST /api/events HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\n\r\n{}",
            body.len(),
            body
        );
        let resp = http_request(&addr, &req);
        handle.join().unwrap();
        assert!(resp.contains("400 Bad Request"));
    }

    #[test]
    fn test_handle_client_post_events_auth_required() {
        let mut app = make_test_app();
        app.api_key = Some("secret123".to_string());
        let (addr, handle) = spawn_test_server(app);
        let body = r#"{"agentId":"a1"}"#;
        let req = format!(
            "POST /api/events HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\nX-Api-Key: wrong\r\n\r\n{}",
            body.len(),
            body
        );
        let resp = http_request(&addr, &req);
        handle.join().unwrap();
        assert!(resp.contains("401 Unauthorized"));
    }

    #[test]
    fn test_handle_client_post_events_auth_success() {
        let mut app = make_test_app();
        app.api_key = Some("secret123".to_string());
        let (addr, handle) = spawn_test_server(app);
        let body = r#"{"agentId":"a1"}"#;
        let req = format!(
            "POST /api/events HTTP/1.1\r\nHost: localhost\r\nContent-Length: {}\r\nX-Api-Key: secret123\r\n\r\n{}",
            body.len(),
            body
        );
        let resp = http_request(&addr, &req);
        handle.join().unwrap();
        assert!(resp.contains("202 Accepted"));
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
