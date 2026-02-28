use serde::Serialize;
use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{metadata, read, File};
use std::io::{Read, Seek, SeekFrom, Write};
use std::net::{TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, SystemTime};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

#[derive(Clone)]
struct App {
    state: Arc<Mutex<State>>,
    sse_clients: Arc<Mutex<Vec<Sender<String>>>>,
    event_seq: Arc<AtomicU64>,
    public_dir: Arc<PathBuf>,
    api_key: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct Event {
    id: String,
    agent_id: String,
    event: String,
    status: String,
    latency_ms: Option<i64>,
    message: String,
    metadata: Value,
    timestamp: String,
    received_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AgentRow {
    agent_id: String,
    last_seen: String,
    total: u64,
    ok: u64,
    warning: u64,
    error: u64,
    token_total: u64,
    last_event: String,
    latency_ms: Option<i64>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct AlertRow {
    id: String,
    severity: String,
    agent_id: String,
    event: String,
    message: String,
    created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SourceRow {
    source: String,
    total: u64,
    ok: u64,
    warning: u64,
    error: u64,
    last_seen: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorkflowRow {
    role_id: String,
    active: bool,
    status: String,
    total: u64,
    last_event: String,
    last_seen: Option<String>,
}

#[derive(Default)]
struct State {
    recent: Vec<Event>,
    alerts: Vec<AlertRow>,
    by_agent: HashMap<String, AgentRow>,
    by_source: HashMap<String, SourceRow>,
    token_total: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Snapshot {
    generated_at: String,
    totals: Value,
    agents: Vec<AgentRow>,
    sources: Vec<SourceRow>,
    recent: Vec<Event>,
    alerts: Vec<AlertRow>,
    workflow_progress: Vec<WorkflowRow>,
}

struct ParsedRequest {
    method: String,
    path: String,
    headers: HashMap<String, String>,
    body: Vec<u8>,
}

fn now_iso() -> String {
    OffsetDateTime::now_utc()
        .format(&Rfc3339)
        .unwrap_or_else(|_| "1970-01-01T00:00:00Z".to_string())
}

fn json_response(code: &str, body: &str) -> Vec<u8> {
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: application/json; charset=utf-8\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        code,
        body.len()
    );
    [header.as_bytes(), body.as_bytes()].concat()
}

fn bytes_response(code: &str, body: &[u8], content_type: &str) -> Vec<u8> {
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-cache\r\nConnection: close\r\n\r\n",
        code,
        content_type,
        body.len()
    );
    [header.as_bytes(), body].concat()
}

fn status_norm(status: &str) -> String {
    match status.to_lowercase().as_str() {
        "error" => "error".to_string(),
        "warning" => "warning".to_string(),
        _ => "ok".to_string(),
    }
}

fn workflow_row(state: &State, role_id: &str) -> WorkflowRow {
    if let Some(row) = state.by_agent.get(role_id) {
        let status = if row.error > 0 {
            "blocked"
        } else if row.warning > 0 {
            "at-risk"
        } else if row.total > 0 {
            "running"
        } else {
            "idle"
        };

        WorkflowRow {
            role_id: role_id.to_string(),
            active: true,
            status: status.to_string(),
            total: row.total,
            last_event: row.last_event.clone(),
            last_seen: Some(row.last_seen.clone()),
        }
    } else {
        WorkflowRow {
            role_id: role_id.to_string(),
            active: false,
            status: "idle".to_string(),
            total: 0,
            last_event: "-".to_string(),
            last_seen: None,
        }
    }
}

fn build_snapshot(state: &State) -> Snapshot {
    let mut agents: Vec<AgentRow> = state.by_agent.values().cloned().collect();
    agents.sort_by(|a, b| a.agent_id.cmp(&b.agent_id));

    let mut sources: Vec<SourceRow> = state.by_source.values().cloned().collect();
    sources.sort_by(|a, b| a.source.cmp(&b.source));

    let totals = agents.iter().fold(
        json!({ "agents": agents.len(), "total": 0, "ok": 0, "warning": 0, "error": 0, "tokenTotal": 0 }),
        |mut acc, row| {
            acc["total"] = json!(acc["total"].as_u64().unwrap_or(0) + row.total);
            acc["ok"] = json!(acc["ok"].as_u64().unwrap_or(0) + row.ok);
            acc["warning"] = json!(acc["warning"].as_u64().unwrap_or(0) + row.warning);
            acc["error"] = json!(acc["error"].as_u64().unwrap_or(0) + row.error);
            acc["tokenTotal"] = json!(acc["tokenTotal"].as_u64().unwrap_or(0) + row.token_total);
            acc
        },
    );

    Snapshot {
        generated_at: now_iso(),
        totals,
        agents,
        sources,
        recent: state.recent.iter().take(300).cloned().collect(),
        alerts: state.alerts.iter().take(20).cloned().collect(),
        workflow_progress: vec![
            workflow_row(state, "lead"),
            workflow_row(state, "designer"),
            workflow_row(state, "frontend"),
            workflow_row(state, "backend"),
        ],
    }
}

fn append_event(app: &App, evt: Event) {
    {
        let mut state = app.state.lock().unwrap_or_else(|e| e.into_inner());
        state.recent.insert(0, evt.clone());
        if state.recent.len() > 200 {
            state.recent.truncate(200);
        }

        let row = state
            .by_agent
            .entry(evt.agent_id.clone())
            .or_insert(AgentRow {
                agent_id: evt.agent_id.clone(),
                last_seen: evt.received_at.clone(),
                total: 0,
                ok: 0,
                warning: 0,
                error: 0,
                token_total: 0,
                last_event: evt.event.clone(),
                latency_ms: None,
            });

        row.last_seen = evt.received_at.clone();
        row.total += 1;
        row.last_event = evt.event.clone();
        row.latency_ms = evt.latency_ms;
        match evt.status.as_str() {
            "error" => row.error += 1,
            "warning" => row.warning += 1,
            _ => row.ok += 1,
        }

        let token_total = evt
            .metadata
            .get("tokenUsage")
            .and_then(|v| v.get("totalTokens"))
            .and_then(|v| v.as_u64())
            .unwrap_or(0);
        if token_total > 0 {
            row.token_total += token_total;
            state.token_total += token_total;
        }

        let source = evt
            .metadata
            .get("source")
            .and_then(|v| v.as_str())
            .unwrap_or("manual")
            .to_string();

        let source_row = state.by_source.entry(source.clone()).or_insert(SourceRow {
            source,
            total: 0,
            ok: 0,
            warning: 0,
            error: 0,
            last_seen: evt.received_at.clone(),
        });

        source_row.total += 1;
        source_row.last_seen = evt.received_at.clone();
        match evt.status.as_str() {
            "error" => source_row.error += 1,
            "warning" => source_row.warning += 1,
            _ => source_row.ok += 1,
        }

        if evt.status == "warning" || evt.status == "error" {
            state.alerts.insert(
                0,
                AlertRow {
                    id: format!("a{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
                    severity: evt.status.clone(),
                    agent_id: evt.agent_id.clone(),
                    event: evt.event.clone(),
                    message: if evt.message.is_empty() {
                        "No message".to_string()
                    } else {
                        evt.message.clone()
                    },
                    created_at: evt.received_at.clone(),
                },
            );
            if state.alerts.len() > 120 {
                state.alerts.truncate(120);
            }
        }
    }

    let payload = json!({ "type": "event", "payload": evt }).to_string();
    broadcast_sse(app, format!("data: {}\n\n", payload));
}

fn broadcast_sse(app: &App, message: String) {
    let mut clients = app.sse_clients.lock().unwrap_or_else(|e| e.into_inner());
    clients.retain(|tx| tx.send(message.clone()).is_ok());
}

fn parse_request(stream: &mut TcpStream) -> Option<ParsedRequest> {
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

fn normalize_incoming(payload: &Value, app: &App) -> Event {
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
        metadata: payload
            .get("metadata")
            .cloned()
            .unwrap_or_else(|| json!({})),
        timestamp: ts,
        received_at: now,
    }
}

fn content_type_for(path: &str) -> &'static str {
    if path.ends_with(".html") {
        "text/html; charset=utf-8"
    } else if path.ends_with(".css") {
        "text/css; charset=utf-8"
    } else if path.ends_with(".js") {
        "application/javascript; charset=utf-8"
    } else if path.ends_with(".json") {
        "application/json; charset=utf-8"
    } else {
        "application/octet-stream"
    }
}

fn serve_static(app: &App, path: &str) -> Vec<u8> {
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

    match read(canonical) {
        Ok(bytes) => bytes_response("200 OK", &bytes, content_type_for(clean)),
        Err(_) => json_response(
            "404 Not Found",
            &json!({ "error": "Not found" }).to_string(),
        ),
    }
}

fn handle_sse(mut stream: TcpStream, rx: Receiver<String>, snapshot: String) {
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

fn spawn_sse_sweeper(app: App) {
    thread::spawn(move || loop {
        thread::sleep(Duration::from_secs(30));
        let mut clients = app.sse_clients.lock().unwrap_or_else(|e| e.into_inner());
        clients.retain(|tx| tx.send(": keepalive\n\n".to_string()).is_ok());
    });
}

fn handle_client(mut stream: TcpStream, app: App) {
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

fn read_delta_lines(
    file_path: &Path,
    cursor: &mut (u64, String),
    max_read_bytes: u64,
) -> Vec<String> {
    let meta = match metadata(file_path) {
        Ok(m) => m,
        Err(_) => return vec![],
    };

    if meta.len() < cursor.0 {
        cursor.0 = 0;
        cursor.1.clear();
    }

    if meta.len() == cursor.0 {
        return vec![];
    }

    let mut start = cursor.0;
    if meta.len().saturating_sub(cursor.0) > max_read_bytes {
        start = meta.len().saturating_sub(max_read_bytes);
    }

    let mut file = match File::open(file_path) {
        Ok(f) => f,
        Err(_) => return vec![],
    };

    if file.seek(SeekFrom::Start(start)).is_err() {
        return vec![];
    }

    let mut bytes = Vec::new();
    if file.read_to_end(&mut bytes).is_err() {
        return vec![];
    }

    cursor.0 = meta.len();

    let text = format!("{}{}", cursor.1, String::from_utf8_lossy(&bytes));
    let mut lines: Vec<String> = text.split('\n').map(|s| s.to_string()).collect();
    cursor.1 = lines.pop().unwrap_or_default();
    lines.into_iter().filter(|s| !s.is_empty()).collect()
}

fn parse_history_event(line: &str, app: &App) -> Option<Event> {
    let v: Value = serde_json::from_str(line).ok()?;
    let text = v.get("display")?.as_str()?.to_string();
    let ts_ms = v.get("timestamp").and_then(|x| x.as_i64()).unwrap_or(0);
    let dt = OffsetDateTime::from_unix_timestamp(ts_ms / 1000)
        .ok()
        .and_then(|d| d.format(&Rfc3339).ok())
        .unwrap_or_else(now_iso);

    Some(Event {
        id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
        agent_id: "user".to_string(),
        event: "user_message".to_string(),
        status: "ok".to_string(),
        latency_ms: None,
        message: text.chars().take(120).collect(),
        metadata: json!({
            "source": "claude_history",
            "sessionId": v.get("sessionId").and_then(|x| x.as_str()).unwrap_or(""),
            "project": v.get("project").and_then(|x| x.as_str()).unwrap_or(""),
            "textLength": text.len()
        }),
        timestamp: dt,
        received_at: now_iso(),
    })
}

fn parse_session_line(line: &str, app: &App) -> Vec<Event> {
    let v: Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => return vec![],
    };

    let msg_type = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let session_id = v
        .get("sessionId")
        .and_then(|s| s.as_str())
        .unwrap_or("")
        .to_string();
    let timestamp = v
        .get("timestamp")
        .and_then(|t| t.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(now_iso);

    match msg_type {
        "user" => {
            let content = v
                .get("message")
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("");

            if content.is_empty() {
                return vec![];
            }

            vec![Event {
                id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
                agent_id: "lead".to_string(),
                event: "user_message".to_string(),
                status: "ok".to_string(),
                latency_ms: None,
                message: content.chars().take(120).collect(),
                metadata: json!({
                    "source": "claude_session",
                    "sessionId": session_id,
                }),
                timestamp,
                received_at: now_iso(),
            }]
        }
        "assistant" => {
            let mut events = Vec::new();
            let message = v.get("message").unwrap_or(&Value::Null);
            let model = message
                .get("model")
                .and_then(|m| m.as_str())
                .unwrap_or("")
                .to_string();

            if let Some(content_arr) = message.get("content").and_then(|c| c.as_array()) {
                for item in content_arr {
                    let item_type = item.get("type").and_then(|t| t.as_str()).unwrap_or("");
                    match item_type {
                        "text" => {
                            let text = item.get("text").and_then(|t| t.as_str()).unwrap_or("");
                            if !text.is_empty() {
                                events.push(Event {
                                    id: format!(
                                        "e{}",
                                        app.event_seq.fetch_add(1, Ordering::Relaxed)
                                    ),
                                    agent_id: "lead".to_string(),
                                    event: "assistant_message".to_string(),
                                    status: "ok".to_string(),
                                    latency_ms: None,
                                    message: text.chars().take(120).collect(),
                                    metadata: json!({
                                        "source": "claude_session",
                                        "sessionId": session_id,
                                        "model": model,
                                    }),
                                    timestamp: timestamp.clone(),
                                    received_at: now_iso(),
                                });
                            }
                        }
                        "tool_use" => {
                            let name = item
                                .get("name")
                                .and_then(|n| n.as_str())
                                .unwrap_or("unknown_tool");
                            let input = item.get("input").cloned().unwrap_or(json!({}));
                            events.push(Event {
                                id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
                                agent_id: "lead".to_string(),
                                event: "tool_call".to_string(),
                                status: "ok".to_string(),
                                latency_ms: None,
                                message: name.to_string(),
                                metadata: json!({
                                    "source": "claude_session",
                                    "sessionId": session_id,
                                    "model": model,
                                    "toolInput": input,
                                }),
                                timestamp: timestamp.clone(),
                                received_at: now_iso(),
                            });
                        }
                        _ => {}
                    }
                }
            }

            if let Some(usage) = message.get("usage") {
                let input_tokens = usage
                    .get("input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let output_tokens = usage
                    .get("output_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let cache_read = usage
                    .get("cache_read_input_tokens")
                    .and_then(|v| v.as_u64())
                    .unwrap_or(0);
                let total = input_tokens + output_tokens;

                if total > 0 {
                    events.push(Event {
                        id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
                        agent_id: "lead".to_string(),
                        event: "token_usage".to_string(),
                        status: "ok".to_string(),
                        latency_ms: None,
                        message: format!("tokens +{}", total),
                        metadata: json!({
                            "source": "claude_session",
                            "sessionId": session_id,
                            "model": model,
                            "tokenUsage": {
                                "inputTokens": input_tokens,
                                "outputTokens": output_tokens,
                                "cacheReadInputTokens": cache_read,
                                "totalTokens": total,
                            }
                        }),
                        timestamp: timestamp.clone(),
                        received_at: now_iso(),
                    });
                }
            }

            events
        }
        _ => vec![],
    }
}

fn walk_jsonl_files(dir: &Path) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let entries = match std::fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return result,
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            if let Ok(sub_entries) = std::fs::read_dir(&path) {
                for sub_entry in sub_entries.flatten() {
                    let sub_path = sub_entry.path();
                    if sub_path.is_file()
                        && sub_path.extension().map(|e| e == "jsonl").unwrap_or(false)
                    {
                        result.push(sub_path);
                    }
                }
            }
        }
    }
    result
}

fn poll_session_files(
    projects_dir: &Path,
    app: &App,
    cursors: &mut HashMap<PathBuf, (u64, String)>,
) {
    let files = walk_jsonl_files(projects_dir);
    for file in files {
        let cursor = cursors.entry(file.clone()).or_insert((0, String::new()));
        let lines = read_delta_lines(&file, cursor, 512 * 1024);
        for line in lines {
            let events = parse_session_line(&line, app);
            for evt in events {
                append_event(app, evt);
            }
        }
    }
}

#[allow(dead_code)]
fn poll_stats_cache(path: &Path, app: &App, last_mtime: &mut Option<SystemTime>) -> Option<Event> {
    let meta = metadata(path).ok()?;
    let mtime = meta.modified().ok()?;

    if *last_mtime == Some(mtime) {
        return None;
    }
    *last_mtime = Some(mtime);

    let content = std::fs::read_to_string(path).ok()?;
    let v: Value = serde_json::from_str(&content).ok()?;

    Some(Event {
        id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
        agent_id: "lead".to_string(),
        event: "cost_update".to_string(),
        status: "ok".to_string(),
        latency_ms: None,
        message: "stats cache updated".to_string(),
        metadata: json!({
            "source": "claude_session",
            "stats": v,
        }),
        timestamp: now_iso(),
        received_at: now_iso(),
    })
}

fn spawn_claude_collector(app: App, claude_home: PathBuf, poll_ms: u64, backfill_lines: usize) {
    thread::spawn(move || {
        let history = claude_home.join("history.jsonl");
        let projects_dir = claude_home.join("projects");

        let mut history_cursor = (0_u64, String::new());
        let mut session_cursors: HashMap<PathBuf, (u64, String)> = HashMap::new();

        // initial backfill from history.jsonl
        if let Ok(contents) = std::fs::read_to_string(&history) {
            for line in contents
                .lines()
                .rev()
                .take(backfill_lines)
                .collect::<Vec<_>>()
                .into_iter()
                .rev()
            {
                if let Some(evt) = parse_history_event(line, &app) {
                    append_event(&app, evt);
                }
            }
        }

        if let Ok(meta) = metadata(&history) {
            history_cursor.0 = meta.len();
        }

        loop {
            for line in read_delta_lines(&history, &mut history_cursor, 512 * 1024) {
                if let Some(evt) = parse_history_event(&line, &app) {
                    append_event(&app, evt);
                }
            }

            poll_session_files(&projects_dir, &app, &mut session_cursors);

            thread::sleep(Duration::from_millis(poll_ms));
        }
    });
}

fn main() {
    let host = std::env::var("HOST").unwrap_or_else(|_| "127.0.0.1".to_string());
    let port = std::env::var("PORT").unwrap_or_else(|_| "5050".to_string());
    let poll_ms = std::env::var("CLAUDE_POLL_MS")
        .ok()
        .and_then(|v| v.parse::<u64>().ok())
        .unwrap_or(2500);
    let backfill_lines = std::env::var("CLAUDE_BACKFILL_LINES")
        .ok()
        .and_then(|v| v.parse::<usize>().ok())
        .unwrap_or(25);

    let claude_home = std::env::var("CLAUDE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home).join(".claude")
        });
    let api_key = std::env::var("MONITOR_API_KEY")
        .ok()
        .filter(|v| !v.is_empty());

    let listener = TcpListener::bind(format!("{}:{}", host, port)).expect("bind failed");

    let app = App {
        state: Arc::new(Mutex::new(State::default())),
        sse_clients: Arc::new(Mutex::new(Vec::new())),
        event_seq: Arc::new(AtomicU64::new(1)),
        public_dir: Arc::new(
            std::env::var("PUBLIC_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("public")),
        ),
        api_key,
    };

    spawn_claude_collector(app.clone(), claude_home, poll_ms, backfill_lines);
    spawn_sse_sweeper(app.clone());

    println!("Claude Code Monitor listening on http://{}:{}", host, port);

    for stream in listener.incoming() {
        match stream {
            Ok(stream) => {
                let app_clone = app.clone();
                thread::spawn(move || handle_client(stream, app_clone));
            }
            Err(err) => {
                eprintln!("[server] accept error: {}", err);
            }
        }
    }
}
