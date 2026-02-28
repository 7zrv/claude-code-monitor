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
    cost_usd: f64,
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
    cost_total_usd: f64,
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
        json!({ "agents": agents.len(), "total": 0, "ok": 0, "warning": 0, "error": 0, "tokenTotal": 0, "costTotalUsd": state.cost_total_usd }),
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
        workflow_progress: {
            let mut keys: Vec<&String> = state.by_agent.keys().collect();
            keys.sort();
            keys.iter().map(|k| workflow_row(state, k)).collect()
        },
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
                cost_usd: 0.0,
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
        let cost_delta = if evt.event == "cost_update" {
            evt.metadata
                .get("costDelta")
                .and_then(|v| v.as_f64())
                .filter(|&d| d > 0.0)
                .unwrap_or(0.0)
        } else {
            0.0
        };

        if token_total > 0 {
            row.token_total += token_total;
        }
        if cost_delta > 0.0 {
            row.cost_usd += cost_delta;
        }

        // row is no longer used — update state-level accumulators
        if token_total > 0 {
            state.token_total += token_total;
        }
        if cost_delta > 0.0 {
            state.cost_total_usd += cost_delta;
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
    let text = v.get("text")?.as_str()?.to_string();
    let ts = v.get("ts").and_then(|x| x.as_i64()).unwrap_or(0);
    let dt = OffsetDateTime::from_unix_timestamp(ts)
        .ok()
        .and_then(|d| d.format(&Rfc3339).ok())
        .unwrap_or_else(now_iso);

    Some(Event {
        id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
        agent_id: "lead".to_string(),
        event: "user_request".to_string(),
        status: "ok".to_string(),
        latency_ms: None,
        message: text.chars().take(120).collect(),
        metadata: json!({
            "source": "claude_history",
            "sessionId": v.get("session_id").and_then(|x| x.as_str()).unwrap_or(""),
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

fn poll_stats_cache(
    path: &Path,
    app: &App,
    last_mtime: &mut Option<SystemTime>,
    last_cost: &mut f64,
) -> Option<Event> {
    let meta = metadata(path).ok()?;
    let mtime = meta.modified().ok()?;

    if *last_mtime == Some(mtime) {
        return None;
    }

    // If read/parse fails, last_mtime stays unchanged so we retry on next poll
    let content = std::fs::read_to_string(path).ok()?;
    let v: Value = serde_json::from_str(&content).ok()?;

    let total_cost = v
        .get("modelUsage")
        .and_then(|u| u.as_object())
        .map(|models| {
            models
                .values()
                .filter_map(|m| m.get("costUSD").and_then(|c| c.as_f64()))
                .sum::<f64>()
        })
        .unwrap_or(0.0);

    // is_first is true only when initialization failed (stats-cache.json absent at startup)
    let is_first = last_mtime.is_none();
    *last_mtime = Some(mtime);

    if is_first {
        *last_cost = total_cost;
        return None;
    }

    let delta = total_cost - *last_cost;
    if delta <= 0.0 {
        return None;
    }

    *last_cost = total_cost;

    Some(Event {
        id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
        agent_id: "lead".to_string(),
        event: "cost_update".to_string(),
        status: "ok".to_string(),
        latency_ms: None,
        message: format!("cost +${:.6}", delta),
        metadata: json!({
            "source": "stats_cache",
            "costDelta": delta,
            "costTotalUsd": total_cost,
        }),
        timestamp: now_iso(),
        received_at: now_iso(),
    })
}

fn spawn_claude_collector(app: App, claude_home: PathBuf, poll_ms: u64, backfill_lines: usize) {
    thread::spawn(move || {
        let history = claude_home.join("history.jsonl");
        let projects_dir = claude_home.join("projects");
        let stats_cache = claude_home.join("stats-cache.json");
        let mut history_cursor = (0_u64, String::new());
        let mut session_cursors: HashMap<PathBuf, (u64, String)> = HashMap::new();
        let mut stats_last_mtime: Option<SystemTime> = None;
        let mut stats_last_cost: f64 = 0.0;

        // initialize cost_total_usd from stats-cache.json (no event generated)
        if let Ok(content) = std::fs::read_to_string(&stats_cache) {
            if let Ok(v) = serde_json::from_str::<Value>(&content) {
                let initial: f64 = v
                    .get("modelUsage")
                    .and_then(|u| u.as_object())
                    .map(|m| {
                        m.values()
                            .filter_map(|e| e.get("costUSD").and_then(|c| c.as_f64()))
                            .sum()
                    })
                    .unwrap_or(0.0);
                stats_last_cost = initial;
                if let Ok(mut state) = app.state.lock() {
                    state.cost_total_usd = initial;
                }
                if let Ok(meta) = metadata(&stats_cache) {
                    if let Ok(mtime) = meta.modified() {
                        stats_last_mtime = Some(mtime);
                    }
                }
            }
        }

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

            if let Some(evt) = poll_stats_cache(
                &stats_cache,
                &app,
                &mut stats_last_mtime,
                &mut stats_last_cost,
            ) {
                append_event(&app, evt);
            }

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

#[cfg(test)]
mod tests {
    use super::*;

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

    fn make_test_event(status: &str, event: &str, agent_id: &str, metadata: Value) -> Event {
        Event {
            id: "e0".to_string(),
            agent_id: agent_id.to_string(),
            event: event.to_string(),
            status: status.to_string(),
            latency_ms: None,
            message: "test".to_string(),
            metadata,
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            received_at: "2025-01-01T00:00:00Z".to_string(),
        }
    }

    // ── A. 순수 함수 테스트 ──

    #[test]
    fn test_now_iso_returns_nonempty_rfc3339() {
        let result = now_iso();
        assert!(!result.is_empty());
        assert!(result.contains('T'));
        assert!(result.ends_with('Z') || result.contains('+'));
    }

    #[test]
    fn test_status_norm_error() {
        assert_eq!(status_norm("error"), "error");
        assert_eq!(status_norm("ERROR"), "error");
        assert_eq!(status_norm("Error"), "error");
    }

    #[test]
    fn test_status_norm_warning() {
        assert_eq!(status_norm("warning"), "warning");
        assert_eq!(status_norm("WARNING"), "warning");
        assert_eq!(status_norm("Warning"), "warning");
    }

    #[test]
    fn test_status_norm_ok_default() {
        assert_eq!(status_norm("ok"), "ok");
        assert_eq!(status_norm(""), "ok");
        assert_eq!(status_norm("success"), "ok");
        assert_eq!(status_norm("anything"), "ok");
    }

    #[test]
    fn test_json_response_format() {
        let resp = json_response("200 OK", r#"{"ok":true}"#);
        let text = String::from_utf8(resp).unwrap();
        assert!(text.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(text.contains("Content-Type: application/json"));
        assert!(text.contains("Content-Length: 11"));
        assert!(text.ends_with(r#"{"ok":true}"#));
    }

    #[test]
    fn test_json_response_404() {
        let resp = json_response("404 Not Found", r#"{"error":"nope"}"#);
        let text = String::from_utf8(resp).unwrap();
        assert!(text.starts_with("HTTP/1.1 404 Not Found\r\n"));
        assert!(text.contains(r#"{"error":"nope"}"#));
    }

    #[test]
    fn test_bytes_response_format() {
        let body = b"hello world";
        let resp = bytes_response("200 OK", body, "text/plain");
        let text = String::from_utf8(resp).unwrap();
        assert!(text.starts_with("HTTP/1.1 200 OK\r\n"));
        assert!(text.contains("Content-Type: text/plain"));
        assert!(text.contains("Content-Length: 11"));
        assert!(text.ends_with("hello world"));
    }

    #[test]
    fn test_content_type_for_html() {
        assert_eq!(content_type_for("index.html"), "text/html; charset=utf-8");
    }

    #[test]
    fn test_content_type_for_css() {
        assert_eq!(content_type_for("style.css"), "text/css; charset=utf-8");
    }

    #[test]
    fn test_content_type_for_js() {
        assert_eq!(
            content_type_for("app.js"),
            "application/javascript; charset=utf-8"
        );
    }

    #[test]
    fn test_content_type_for_json() {
        assert_eq!(
            content_type_for("data.json"),
            "application/json; charset=utf-8"
        );
    }

    #[test]
    fn test_content_type_for_unknown() {
        assert_eq!(content_type_for("file.bin"), "application/octet-stream");
        assert_eq!(content_type_for("archive.tar"), "application/octet-stream");
    }

    // ── B. State 기반 함수 테스트 ──

    #[test]
    fn test_workflow_row_idle_when_agent_missing() {
        let state = State::default();
        let row = workflow_row(&state, "missing-agent");
        assert_eq!(row.role_id, "missing-agent");
        assert!(!row.active);
        assert_eq!(row.status, "idle");
        assert_eq!(row.total, 0);
        assert!(row.last_seen.is_none());
    }

    #[test]
    fn test_workflow_row_running() {
        let mut state = State::default();
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: "2025-01-01T00:00:00Z".to_string(),
                total: 5,
                ok: 5,
                warning: 0,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "heartbeat".to_string(),
                latency_ms: None,
            },
        );
        let row = workflow_row(&state, "agent-1");
        assert!(row.active);
        assert_eq!(row.status, "running");
        assert_eq!(row.total, 5);
    }

    #[test]
    fn test_workflow_row_at_risk() {
        let mut state = State::default();
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: "2025-01-01T00:00:00Z".to_string(),
                total: 3,
                ok: 1,
                warning: 2,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "warn".to_string(),
                latency_ms: None,
            },
        );
        let row = workflow_row(&state, "agent-1");
        assert_eq!(row.status, "at-risk");
    }

    #[test]
    fn test_workflow_row_blocked() {
        let mut state = State::default();
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: "2025-01-01T00:00:00Z".to_string(),
                total: 2,
                ok: 0,
                warning: 1,
                error: 1,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "error".to_string(),
                latency_ms: None,
            },
        );
        let row = workflow_row(&state, "agent-1");
        assert_eq!(row.status, "blocked");
    }

    #[test]
    fn test_build_snapshot_empty_state() {
        let state = State::default();
        let snap = build_snapshot(&state);
        assert!(snap.agents.is_empty());
        assert!(snap.sources.is_empty());
        assert!(snap.recent.is_empty());
        assert!(snap.alerts.is_empty());
        assert!(snap.workflow_progress.is_empty());
        assert_eq!(snap.totals["agents"], 0);
    }

    #[test]
    fn test_build_snapshot_with_agents() {
        let mut state = State::default();
        state.by_agent.insert(
            "a1".to_string(),
            AgentRow {
                agent_id: "a1".to_string(),
                last_seen: now_iso(),
                total: 10,
                ok: 7,
                warning: 2,
                error: 1,
                token_total: 100,
                cost_usd: 0.5,
                last_event: "test".to_string(),
                latency_ms: Some(42),
            },
        );
        state.by_agent.insert(
            "a2".to_string(),
            AgentRow {
                agent_id: "a2".to_string(),
                last_seen: now_iso(),
                total: 5,
                ok: 5,
                warning: 0,
                error: 0,
                token_total: 50,
                cost_usd: 0.1,
                last_event: "ok".to_string(),
                latency_ms: None,
            },
        );
        let snap = build_snapshot(&state);
        assert_eq!(snap.agents.len(), 2);
        assert_eq!(snap.totals["agents"], 2);
        assert_eq!(snap.totals["total"], 15);
        assert_eq!(snap.totals["ok"], 12);
        assert_eq!(snap.totals["warning"], 2);
        assert_eq!(snap.totals["error"], 1);
        assert_eq!(snap.totals["tokenTotal"], 150);
        assert_eq!(snap.workflow_progress.len(), 2);
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
    fn test_append_event_adds_to_recent() {
        let app = make_test_app();
        let evt = make_test_event("ok", "ping", "agent-1", json!({}));
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.recent.len(), 1);
        assert_eq!(state.recent[0].event, "ping");
    }

    #[test]
    fn test_append_event_updates_agent_counters() {
        let app = make_test_app();
        append_event(&app, make_test_event("ok", "e1", "a1", json!({})));
        append_event(&app, make_test_event("error", "e2", "a1", json!({})));
        append_event(&app, make_test_event("warning", "e3", "a1", json!({})));
        let state = app.state.lock().unwrap();
        let row = &state.by_agent["a1"];
        assert_eq!(row.total, 3);
        assert_eq!(row.ok, 1);
        assert_eq!(row.error, 1);
        assert_eq!(row.warning, 1);
    }

    #[test]
    fn test_append_event_creates_alerts_for_error_and_warning() {
        let app = make_test_app();
        append_event(&app, make_test_event("ok", "e1", "a1", json!({})));
        append_event(&app, make_test_event("error", "e2", "a1", json!({})));
        append_event(&app, make_test_event("warning", "e3", "a1", json!({})));
        let state = app.state.lock().unwrap();
        assert_eq!(state.alerts.len(), 2);
        assert_eq!(state.alerts[0].severity, "warning");
        assert_eq!(state.alerts[1].severity, "error");
    }

    #[test]
    fn test_append_event_recent_truncates_at_200() {
        let app = make_test_app();
        for i in 0..210 {
            append_event(
                &app,
                make_test_event("ok", &format!("e{}", i), "a1", json!({})),
            );
        }
        let state = app.state.lock().unwrap();
        assert_eq!(state.recent.len(), 200);
    }

    #[test]
    fn test_append_event_alerts_truncates_at_120() {
        let app = make_test_app();
        for i in 0..130 {
            append_event(
                &app,
                make_test_event("error", &format!("e{}", i), "a1", json!({})),
            );
        }
        let state = app.state.lock().unwrap();
        assert_eq!(state.alerts.len(), 120);
    }

    #[test]
    fn test_append_event_token_and_cost_accumulation() {
        let app = make_test_app();
        let meta = json!({
            "tokenUsage": { "totalTokens": 100 }
        });
        append_event(&app, make_test_event("ok", "msg", "a1", meta));
        let cost_meta = json!({ "costDelta": 0.05 });
        append_event(&app, make_test_event("ok", "cost_update", "a1", cost_meta));
        let state = app.state.lock().unwrap();
        assert_eq!(state.token_total, 100);
        assert!((state.cost_total_usd - 0.05).abs() < 1e-9);
        let row = &state.by_agent["a1"];
        assert_eq!(row.token_total, 100);
        assert!((row.cost_usd - 0.05).abs() < 1e-9);
    }

    #[test]
    fn test_append_event_source_tracking() {
        let app = make_test_app();
        let meta = json!({ "source": "claude_session" });
        append_event(&app, make_test_event("ok", "e1", "a1", meta.clone()));
        append_event(&app, make_test_event("error", "e2", "a1", meta));
        let state = app.state.lock().unwrap();
        let src = &state.by_source["claude_session"];
        assert_eq!(src.total, 2);
        assert_eq!(src.ok, 1);
        assert_eq!(src.error, 1);
    }

    #[test]
    fn test_append_event_default_source_is_manual() {
        let app = make_test_app();
        append_event(&app, make_test_event("ok", "e1", "a1", json!({})));
        let state = app.state.lock().unwrap();
        assert!(state.by_source.contains_key("manual"));
    }

    #[test]
    fn test_append_event_empty_message_becomes_no_message_in_alert() {
        let app = make_test_app();
        let mut evt = make_test_event("error", "e1", "a1", json!({}));
        evt.message = "".to_string();
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.alerts[0].message, "No message");
    }

    #[test]
    fn test_broadcast_sse_delivers_to_clients() {
        let app = make_test_app();
        let (tx, rx) = mpsc::channel::<String>();
        app.sse_clients.lock().unwrap().push(tx);
        broadcast_sse(&app, "hello".to_string());
        assert_eq!(rx.recv().unwrap(), "hello");
    }

    #[test]
    fn test_broadcast_sse_removes_disconnected_clients() {
        let app = make_test_app();
        let (tx, rx) = mpsc::channel::<String>();
        app.sse_clients.lock().unwrap().push(tx);
        drop(rx);
        broadcast_sse(&app, "hello".to_string());
        assert_eq!(app.sse_clients.lock().unwrap().len(), 0);
    }

    // ── C. 파일 I/O 함수 테스트 ──

    fn unique_tmp_dir(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ccm_test_{}_{}", name, std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn test_read_delta_lines_empty_file() {
        let dir = unique_tmp_dir("rdl_empty");
        let path = dir.join("empty.log");
        File::create(&path).unwrap();
        let mut cursor = (0u64, String::new());
        let lines = read_delta_lines(&path, &mut cursor, 1024);
        assert!(lines.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_delta_lines_new_lines() {
        let dir = unique_tmp_dir("rdl_new");
        let path = dir.join("data.log");
        {
            let mut f = File::create(&path).unwrap();
            writeln!(f, "line1").unwrap();
            writeln!(f, "line2").unwrap();
        }
        let mut cursor = (0u64, String::new());
        let lines = read_delta_lines(&path, &mut cursor, 1024);
        assert_eq!(lines, vec!["line1", "line2"]);

        // second call returns nothing
        let lines2 = read_delta_lines(&path, &mut cursor, 1024);
        assert!(lines2.is_empty());

        // append more
        {
            let mut f = std::fs::OpenOptions::new()
                .append(true)
                .open(&path)
                .unwrap();
            writeln!(f, "line3").unwrap();
        }
        let lines3 = read_delta_lines(&path, &mut cursor, 1024);
        assert_eq!(lines3, vec!["line3"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_delta_lines_file_shrink_resets_cursor() {
        let dir = unique_tmp_dir("rdl_shrink");
        let path = dir.join("data.log");
        {
            let mut f = File::create(&path).unwrap();
            writeln!(f, "aaaaaa").unwrap();
            writeln!(f, "bbbbbb").unwrap();
        }
        let mut cursor = (0u64, String::new());
        read_delta_lines(&path, &mut cursor, 1024);
        assert!(cursor.0 > 0);

        // shrink file
        {
            let mut f = File::create(&path).unwrap();
            writeln!(f, "cc").unwrap();
        }
        let lines = read_delta_lines(&path, &mut cursor, 1024);
        assert_eq!(lines, vec!["cc"]);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_delta_lines_max_bytes_limit() {
        let dir = unique_tmp_dir("rdl_max");
        let path = dir.join("data.log");
        {
            let mut f = File::create(&path).unwrap();
            for i in 0..100 {
                writeln!(f, "line{:03}", i).unwrap();
            }
        }
        // read with very small max_read_bytes — only tail portion
        let mut cursor = (0u64, String::new());
        let lines = read_delta_lines(&path, &mut cursor, 30);
        assert!(!lines.is_empty());
        assert!(lines.len() < 100);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_read_delta_lines_nonexistent_file() {
        let path = std::env::temp_dir().join("ccm_nonexistent_file_xyz.log");
        let mut cursor = (0u64, String::new());
        let lines = read_delta_lines(&path, &mut cursor, 1024);
        assert!(lines.is_empty());
    }

    #[test]
    fn test_walk_jsonl_files_finds_nested() {
        let dir = unique_tmp_dir("walk");
        let sub = dir.join("session1");
        std::fs::create_dir_all(&sub).unwrap();
        File::create(sub.join("data.jsonl")).unwrap();
        File::create(sub.join("other.json")).unwrap(); // should be ignored
        File::create(sub.join("log.jsonl")).unwrap();

        let files = walk_jsonl_files(&dir);
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|p| p.extension().unwrap() == "jsonl"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_walk_jsonl_files_ignores_top_level_files() {
        let dir = unique_tmp_dir("walk_top");
        File::create(dir.join("top.jsonl")).unwrap(); // top-level, should be ignored
        let files = walk_jsonl_files(&dir);
        assert!(files.is_empty());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_walk_jsonl_files_nonexistent_dir() {
        let files = walk_jsonl_files(&std::env::temp_dir().join("ccm_nonexistent_dir_xyz"));
        assert!(files.is_empty());
    }

    #[test]
    fn test_parse_history_event_valid() {
        let app = make_test_app();
        let line = r#"{"text":"hello world","ts":1700000000,"session_id":"s1"}"#;
        let evt = parse_history_event(line, &app);
        assert!(evt.is_some());
        let evt = evt.unwrap();
        assert_eq!(evt.agent_id, "lead");
        assert_eq!(evt.event, "user_request");
        assert_eq!(evt.message, "hello world");
        assert!(evt.metadata["sessionId"].as_str().unwrap() == "s1");
    }

    #[test]
    fn test_parse_history_event_invalid_json() {
        let app = make_test_app();
        assert!(parse_history_event("not json", &app).is_none());
    }

    #[test]
    fn test_parse_history_event_missing_text() {
        let app = make_test_app();
        assert!(parse_history_event(r#"{"ts":0}"#, &app).is_none());
    }

    #[test]
    fn test_parse_history_event_truncates_at_120_chars() {
        let app = make_test_app();
        let long_text = "a".repeat(200);
        let line = format!(r#"{{"text":"{}","ts":0}}"#, long_text);
        let evt = parse_history_event(&line, &app).unwrap();
        assert_eq!(evt.message.len(), 120);
    }

    #[test]
    fn test_parse_session_line_user_message() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":"hi"},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "user_message");
        assert_eq!(events[0].message, "hi");
    }

    #[test]
    fn test_parse_session_line_user_empty_content_ignored() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":""},"sessionId":"s1"}"#;
        let events = parse_session_line(line, &app);
        assert!(events.is_empty());
    }

    #[test]
    fn test_parse_session_line_assistant_text_and_tool() {
        let app = make_test_app();
        let line = r#"{"type":"assistant","message":{"model":"claude-3","content":[{"type":"text","text":"hello"},{"type":"tool_use","name":"bash","input":{}}]},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].event, "assistant_message");
        assert_eq!(events[0].message, "hello");
        assert_eq!(events[1].event, "tool_call");
        assert_eq!(events[1].message, "bash");
    }

    #[test]
    fn test_parse_session_line_assistant_with_usage() {
        let app = make_test_app();
        let line = r#"{"type":"assistant","message":{"model":"claude-3","content":[{"type":"text","text":"hi"}],"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":10}},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 2); // text + token_usage
        assert_eq!(events[1].event, "token_usage");
        assert!(events[1].message.contains("150"));
    }

    #[test]
    fn test_parse_session_line_unknown_type_ignored() {
        let app = make_test_app();
        let line = r#"{"type":"system","message":{},"sessionId":"s1"}"#;
        let events = parse_session_line(line, &app);
        assert!(events.is_empty());
    }

    #[test]
    fn test_parse_session_line_invalid_json() {
        let app = make_test_app();
        let events = parse_session_line("not json", &app);
        assert!(events.is_empty());
    }

    #[test]
    fn test_parse_session_line_assistant_empty_text_ignored() {
        let app = make_test_app();
        let line = r#"{"type":"assistant","message":{"model":"m","content":[{"type":"text","text":""}]},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert!(events.is_empty());
    }

    #[test]
    fn test_poll_stats_cache_first_read_returns_none() {
        let dir = unique_tmp_dir("psc_first");
        let path = dir.join("stats-cache.json");
        {
            let mut f = File::create(&path).unwrap();
            write!(f, r#"{{"modelUsage":{{"m1":{{"costUSD":1.5}}}}}}"#).unwrap();
        }
        let app = make_test_app();
        let mut last_mtime: Option<SystemTime> = None;
        let mut last_cost = 0.0_f64;
        let result = poll_stats_cache(&path, &app, &mut last_mtime, &mut last_cost);
        assert!(result.is_none());
        assert!(last_mtime.is_some());
        assert!((last_cost - 1.5).abs() < 1e-9);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_poll_stats_cache_no_change_returns_none() {
        let dir = unique_tmp_dir("psc_nochange");
        let path = dir.join("stats-cache.json");
        {
            let mut f = File::create(&path).unwrap();
            write!(f, r#"{{"modelUsage":{{"m1":{{"costUSD":1.0}}}}}}"#).unwrap();
        }
        let app = make_test_app();
        let mut last_mtime: Option<SystemTime> = None;
        let mut last_cost = 0.0_f64;
        poll_stats_cache(&path, &app, &mut last_mtime, &mut last_cost);
        // second call without file change
        let result = poll_stats_cache(&path, &app, &mut last_mtime, &mut last_cost);
        assert!(result.is_none());
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_poll_stats_cache_cost_increase_returns_event() {
        let dir = unique_tmp_dir("psc_increase");
        let path = dir.join("stats-cache.json");
        {
            let mut f = File::create(&path).unwrap();
            write!(f, r#"{{"modelUsage":{{"m1":{{"costUSD":1.0}}}}}}"#).unwrap();
        }
        let app = make_test_app();
        let mut last_mtime: Option<SystemTime> = None;
        let mut last_cost = 0.0_f64;
        poll_stats_cache(&path, &app, &mut last_mtime, &mut last_cost);

        // simulate file update with cost increase — sleep 1s to guarantee mtime change
        thread::sleep(Duration::from_secs(1));
        {
            let mut f = File::create(&path).unwrap();
            write!(f, r#"{{"modelUsage":{{"m1":{{"costUSD":2.5}}}}}}"#).unwrap();
        }
        let result = poll_stats_cache(&path, &app, &mut last_mtime, &mut last_cost);
        assert!(result.is_some());
        let evt = result.unwrap();
        assert_eq!(evt.event, "cost_update");
        assert!((last_cost - 2.5).abs() < 1e-9);
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_poll_stats_cache_nonexistent_returns_none() {
        let app = make_test_app();
        let mut last_mtime: Option<SystemTime> = None;
        let mut last_cost = 0.0_f64;
        let result = poll_stats_cache(
            &std::env::temp_dir().join("ccm_nonexistent_stats.json"),
            &app,
            &mut last_mtime,
            &mut last_cost,
        );
        assert!(result.is_none());
    }

    #[test]
    fn test_poll_session_files_integrates_events() {
        let dir = unique_tmp_dir("psf");
        let sub = dir.join("proj1");
        std::fs::create_dir_all(&sub).unwrap();
        {
            let mut f = File::create(sub.join("session.jsonl")).unwrap();
            writeln!(f, r#"{{"type":"user","message":{{"content":"hello"}},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}}"#).unwrap();
        }
        let app = make_test_app();
        let mut cursors: HashMap<PathBuf, (u64, String)> = HashMap::new();
        poll_session_files(&dir, &app, &mut cursors);
        let state = app.state.lock().unwrap();
        assert_eq!(state.recent.len(), 1);
        assert_eq!(state.recent[0].event, "user_message");
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── D. serve_static 테스트 ──

    #[test]
    fn test_serve_static_200_ok() {
        let dir = unique_tmp_dir("ss_200");
        {
            let mut f = File::create(dir.join("hello.html")).unwrap();
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
            let mut f = File::create(dir.join("index.html")).unwrap();
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
            let mut f = File::create(dir.join("safe.html")).unwrap();
            write!(f, "safe").unwrap();
        }
        let app = make_test_app_with_dir(dir.clone());
        let resp = String::from_utf8(serve_static(&app, "/../../../etc/passwd")).unwrap();
        assert!(resp.contains("403") || resp.contains("404"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── E. handle_client 통합 테스트 ──

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
    fn test_workflow_row_idle_with_zero_total() {
        let mut state = State::default();
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: "2025-01-01T00:00:00Z".to_string(),
                total: 0,
                ok: 0,
                warning: 0,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "-".to_string(),
                latency_ms: None,
            },
        );
        let row = workflow_row(&state, "agent-1");
        assert!(row.active);
        assert_eq!(row.status, "idle");
    }

    #[test]
    fn test_parse_session_line_assistant_unknown_content_item() {
        let app = make_test_app();
        let line = r#"{"type":"assistant","message":{"model":"m","content":[{"type":"image","url":"x"}]},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert!(events.is_empty());
    }

    #[test]
    fn test_poll_stats_cache_cost_decrease_returns_none() {
        let dir = unique_tmp_dir("psc_decrease");
        let path = dir.join("stats-cache.json");
        {
            let mut f = File::create(&path).unwrap();
            write!(f, r#"{{"modelUsage":{{"m1":{{"costUSD":5.0}}}}}}"#).unwrap();
        }
        let app = make_test_app();
        let mut last_mtime: Option<SystemTime> = None;
        let mut last_cost = 0.0_f64;
        poll_stats_cache(&path, &app, &mut last_mtime, &mut last_cost);

        // write a lower cost — sleep 1s to guarantee mtime change on all filesystems
        thread::sleep(Duration::from_secs(1));
        {
            let mut f = File::create(&path).unwrap();
            write!(f, r#"{{"modelUsage":{{"m1":{{"costUSD":3.0}}}}}}"#).unwrap();
        }
        let result = poll_stats_cache(&path, &app, &mut last_mtime, &mut last_cost);
        assert!(result.is_none());
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
    fn test_handle_client_static_file() {
        let dir = unique_tmp_dir("hc_static");
        {
            let mut f = File::create(dir.join("page.html")).unwrap();
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
