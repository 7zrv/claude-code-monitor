use serde_json::{json, Value};
use std::collections::HashMap;
use std::fs::{metadata, File};
use std::io::{Read, Seek, SeekFrom};
use std::path::{Path, PathBuf};
use std::sync::atomic::Ordering;
use std::thread;
use std::time::{Duration, SystemTime};
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::state::append_event;
use crate::types::{App, Event};
use crate::utils::now_iso;

pub fn read_delta_lines(
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

pub fn parse_history_event(line: &str, app: &App) -> Option<Event> {
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
        model: String::new(),
        is_sidechain: false,
        session_id: String::new(),
    })
}

pub fn parse_session_line(line: &str, app: &App) -> Vec<Event> {
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
    let is_sidechain = v
        .get("isSidechain")
        .and_then(|b| b.as_bool())
        .unwrap_or(false);
    let agent_id = v
        .get("agentId")
        .and_then(|a| a.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            let prefix: String = session_id.chars().take(8).collect();
            format!("lead-{}", prefix)
        });
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
                agent_id: agent_id.clone(),
                event: "user_message".to_string(),
                status: "ok".to_string(),
                latency_ms: None,
                message: content.chars().take(120).collect(),
                metadata: json!({
                    "source": "claude_session",
                    "sessionId": session_id,
                    "isSidechain": is_sidechain,
                }),
                timestamp,
                received_at: now_iso(),
                model: String::new(),
                is_sidechain,
                session_id: session_id.clone(),
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
                                    agent_id: agent_id.clone(),
                                    event: "assistant_message".to_string(),
                                    status: "ok".to_string(),
                                    latency_ms: None,
                                    message: text.chars().take(120).collect(),
                                    metadata: json!({
                                        "source": "claude_session",
                                        "sessionId": session_id,
                                        "model": model,
                                        "isSidechain": is_sidechain,
                                    }),
                                    timestamp: timestamp.clone(),
                                    received_at: now_iso(),
                                    model: model.clone(),
                                    is_sidechain,
                                    session_id: session_id.clone(),
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
                                agent_id: agent_id.clone(),
                                event: "tool_call".to_string(),
                                status: "ok".to_string(),
                                latency_ms: None,
                                message: name.to_string(),
                                metadata: json!({
                                    "source": "claude_session",
                                    "sessionId": session_id,
                                    "model": model,
                                    "isSidechain": is_sidechain,
                                    "toolInput": input,
                                }),
                                timestamp: timestamp.clone(),
                                received_at: now_iso(),
                                model: model.clone(),
                                is_sidechain,
                                session_id: session_id.clone(),
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
                        agent_id: agent_id.clone(),
                        event: "token_usage".to_string(),
                        status: "ok".to_string(),
                        latency_ms: None,
                        message: format!("tokens +{}", total),
                        metadata: json!({
                            "source": "claude_session",
                            "sessionId": session_id,
                            "model": model,
                            "isSidechain": is_sidechain,
                            "tokenUsage": {
                                "inputTokens": input_tokens,
                                "outputTokens": output_tokens,
                                "cacheReadInputTokens": cache_read,
                                "totalTokens": total,
                            }
                        }),
                        timestamp: timestamp.clone(),
                        received_at: now_iso(),
                        model: model.clone(),
                        is_sidechain,
                        session_id: session_id.clone(),
                    });
                }
            }

            events
        }
        _ => vec![],
    }
}

pub fn walk_jsonl_files(dir: &Path) -> Vec<PathBuf> {
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
                    } else if sub_path.is_dir()
                        && sub_path
                            .file_name()
                            .map(|n| n == "subagents")
                            .unwrap_or(false)
                    {
                        if let Ok(agent_entries) = std::fs::read_dir(&sub_path) {
                            for agent_entry in agent_entries.flatten() {
                                let agent_path = agent_entry.path();
                                if agent_path.is_file()
                                    && agent_path
                                        .extension()
                                        .map(|e| e == "jsonl")
                                        .unwrap_or(false)
                                {
                                    result.push(agent_path);
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    result
}

pub fn poll_session_files(
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

pub fn poll_stats_cache(
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
        model: String::new(),
        is_sidechain: false,
        session_id: String::new(),
    })
}

pub fn spawn_claude_collector(app: App, claude_home: PathBuf, poll_ms: u64, backfill_lines: usize) {
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::State;
    use std::io::Write;
    use std::sync::atomic::AtomicU64;
    use std::sync::{Arc, Mutex};

    fn make_test_app() -> App {
        App {
            state: Arc::new(Mutex::new(State::default())),
            sse_clients: Arc::new(Mutex::new(Vec::new())),
            event_seq: Arc::new(AtomicU64::new(1)),
            public_dir: Arc::new(PathBuf::from("public")),
        }
    }

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
    fn test_walk_jsonl_files_finds_subagent_files() {
        let dir = unique_tmp_dir("walk_sub");
        let session = dir.join("session1");
        let subagents = session.join("subagents");
        std::fs::create_dir_all(&subagents).unwrap();
        File::create(session.join("lead.jsonl")).unwrap();
        File::create(subagents.join("agent-abc.jsonl")).unwrap();
        File::create(subagents.join("agent-def.jsonl")).unwrap();
        File::create(subagents.join("notes.txt")).unwrap(); // should be ignored

        let files = walk_jsonl_files(&dir);
        assert_eq!(files.len(), 3); // lead + 2 sub-agents
        assert!(files.iter().all(|p| p.extension().unwrap() == "jsonl"));
        let sub_files: Vec<_> = files
            .iter()
            .filter(|p| p.to_string_lossy().contains("subagents"))
            .collect();
        assert_eq!(sub_files.len(), 2);
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
    fn test_parse_history_event_keeps_lead() {
        let app = make_test_app();
        let line = r#"{"text":"hello","ts":1700000000,"session_id":"s1"}"#;
        let evt = parse_history_event(line, &app).unwrap();
        assert_eq!(evt.agent_id, "lead");
        assert!(!evt.is_sidechain);
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
    fn test_parse_session_line_subagent_uses_agent_id() {
        let app = make_test_app();
        let line = r#"{"type":"assistant","agentId":"agent-abc","isSidechain":true,"message":{"model":"claude-haiku-4-5","content":[{"type":"text","text":"hi"}]},"sessionId":"abcdef1234567890","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events[0].agent_id, "agent-abc");
        assert!(events[0].is_sidechain);
        assert_eq!(events[0].model, "claude-haiku-4-5");
        assert_eq!(events[0].session_id, "abcdef1234567890");
    }

    #[test]
    fn test_parse_session_line_lead_uses_session_prefix() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":"hi"},"sessionId":"abcdef1234567890","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events[0].agent_id, "lead-abcdef12");
        assert!(!events[0].is_sidechain);
        assert_eq!(events[0].session_id, "abcdef1234567890");
    }

    #[test]
    fn test_parse_session_line_is_sidechain_false_by_default() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":"hi"},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert!(!events[0].is_sidechain);
    }

    #[test]
    fn test_parse_session_line_assistant_unknown_content_item() {
        let app = make_test_app();
        let line = r#"{"type":"assistant","message":{"model":"m","content":[{"type":"image","url":"x"}]},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert!(events.is_empty());
    }

    #[test]
    fn test_parse_session_line_multibyte_session_id_no_panic() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":"hi"},"sessionId":"한글세션아이디입니다","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert!(!events.is_empty());
        // Must not panic on multi-byte chars; prefix should be first 8 chars
        assert_eq!(events[0].agent_id, "lead-한글세션아이디입");
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
}
