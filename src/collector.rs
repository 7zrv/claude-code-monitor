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

use crate::state::{append_event, hydrate_event};
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

fn truncate_message(text: &str) -> String {
    text.chars().take(120).collect()
}

fn format_unix_ts(ts: i64) -> Option<String> {
    let seconds = if ts.abs() > 10_000_000_000 {
        ts / 1000
    } else {
        ts
    };
    OffsetDateTime::from_unix_timestamp(seconds)
        .ok()
        .and_then(|d| d.format(&Rfc3339).ok())
}

fn normalize_rfc3339(ts: &str) -> Option<String> {
    OffsetDateTime::parse(ts, &Rfc3339)
        .ok()
        .and_then(|dt| dt.format(&Rfc3339).ok())
}

fn parse_event_timestamp(v: &Value) -> String {
    if let Some(ts) = v
        .get("timestamp")
        .and_then(|x| x.as_i64())
        .or_else(|| v.get("ts").and_then(|x| x.as_i64()))
    {
        if let Some(dt) = format_unix_ts(ts) {
            return dt;
        }
    }

    if let Some(ts) = v
        .get("timestamp")
        .and_then(|x| x.as_str())
        .or_else(|| v.get("ts").and_then(|x| x.as_str()))
    {
        if let Some(dt) = normalize_rfc3339(ts) {
            return dt;
        }
    }

    now_iso()
}

pub fn parse_history_event(line: &str, app: &App) -> Option<Event> {
    let v: Value = serde_json::from_str(line).ok()?;
    let text = v
        .get("display")
        .or_else(|| v.get("text"))
        .and_then(|x| x.as_str())?
        .to_string();
    let dt = parse_event_timestamp(&v);

    let session_id = v
        .get("sessionId")
        .or_else(|| v.get("session_id"))
        .and_then(|x| x.as_str())
        .unwrap_or("");

    Some(Event {
        id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
        agent_id: "lead".to_string(),
        event: "user_request".to_string(),
        status: "ok".to_string(),
        latency_ms: None,
        message: truncate_message(&text),
        metadata: json!({
            "source": "claude_history",
            "sessionId": session_id,
            "textLength": text.len()
        }),
        timestamp: dt.clone(),
        received_at: dt,
        model: String::new(),
        is_sidechain: false,
        session_id: String::new(),
        cwd: String::new(),
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
    let timestamp = parse_event_timestamp(&v);
    let cwd = v
        .get("cwd")
        .and_then(|c| c.as_str())
        .unwrap_or("")
        .to_string();

    match msg_type {
        "user" => {
            let content_val = v.get("message").and_then(|m| m.get("content"));
            let content = match content_val {
                Some(Value::String(s)) => s.clone(),
                Some(Value::Array(arr)) => arr
                    .iter()
                    .filter_map(|item| {
                        item.get("content")
                            .and_then(|c| match c {
                                Value::String(s) => Some(s.as_str()),
                                Value::Array(nested) => nested
                                    .first()
                                    .and_then(|x| x.get("text"))
                                    .and_then(|t| t.as_str()),
                                _ => None,
                            })
                            .or_else(|| item.get("text").and_then(|t| t.as_str()))
                    })
                    .collect::<Vec<_>>()
                    .join(" "),
                _ => String::new(),
            };

            if content.is_empty() {
                return vec![];
            }

            vec![Event {
                id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
                agent_id: agent_id.clone(),
                event: "user_message".to_string(),
                status: "ok".to_string(),
                latency_ms: None,
                message: truncate_message(&content),
                metadata: json!({
                    "source": "claude_session",
                    "sessionId": session_id,
                    "isSidechain": is_sidechain,
                }),
                timestamp: timestamp.clone(),
                received_at: timestamp.clone(),
                model: String::new(),
                is_sidechain,
                session_id: session_id.clone(),
                cwd: cwd.clone(),
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
                                    message: truncate_message(text),
                                    metadata: json!({
                                        "source": "claude_session",
                                        "sessionId": session_id,
                                        "model": model,
                                        "isSidechain": is_sidechain,
                                    }),
                                    timestamp: timestamp.clone(),
                                    received_at: timestamp.clone(),
                                    model: model.clone(),
                                    is_sidechain,
                                    session_id: session_id.clone(),
                                    cwd: cwd.clone(),
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
                                received_at: timestamp.clone(),
                                model: model.clone(),
                                is_sidechain,
                                session_id: session_id.clone(),
                                cwd: cwd.clone(),
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
                        received_at: timestamp.clone(),
                        model: model.clone(),
                        is_sidechain,
                        session_id: session_id.clone(),
                        cwd: cwd.clone(),
                    });
                }
            }

            events
        }
        "progress" | "queue-operation" => {
            let label = v
                .get("label")
                .or_else(|| v.get("op"))
                .and_then(|x| x.as_str())
                .unwrap_or(msg_type);

            vec![Event {
                id: format!("e{}", app.event_seq.fetch_add(1, Ordering::Relaxed)),
                agent_id: agent_id.clone(),
                event: "agent_activity".to_string(),
                status: "ok".to_string(),
                latency_ms: None,
                message: label.chars().take(120).collect(),
                metadata: json!({
                    "source": "claude_session",
                    "sessionId": session_id,
                    "activityType": msg_type,
                    "isSidechain": is_sidechain,
                }),
                timestamp: timestamp.clone(),
                received_at: timestamp,
                model: String::new(),
                is_sidechain,
                session_id: session_id.clone(),
                cwd: cwd.clone(),
            }]
        }
        _ => vec![],
    }
}

fn walk_jsonl_recursive(dir: &Path, result: &mut Vec<PathBuf>) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_symlink() {
            continue;
        }
        if path.is_dir() {
            walk_jsonl_recursive(&path, result);
        } else if path.is_file() && path.extension().map(|e| e == "jsonl").unwrap_or(false) {
            result.push(path);
        }
    }
}

pub fn walk_jsonl_files(dir: &Path) -> Vec<PathBuf> {
    let mut result = Vec::new();
    let Ok(entries) = std::fs::read_dir(dir) else {
        return result;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if path.is_dir() {
            walk_jsonl_recursive(&path, &mut result);
        }
    }
    result.sort();
    result
}

pub fn hydrate_session_files(
    projects_dir: &Path,
    app: &App,
    cursors: &mut HashMap<PathBuf, (u64, String)>,
    include_aggregates: bool,
) {
    let files = walk_jsonl_files(projects_dir);
    for file in files {
        let mut cursor = (0_u64, String::new());
        let lines = read_delta_lines(&file, &mut cursor, 512 * 1024);
        for line in lines {
            let events = parse_session_line(&line, app);
            for evt in events {
                if include_aggregates {
                    append_event(app, evt);
                } else {
                    hydrate_event(app, evt);
                }
            }
        }
        cursor.1.clear();
        cursors.insert(file, cursor);
    }
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
        cwd: String::new(),
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

        let hydrate_with_aggregates = app
            .state
            .lock()
            .map(|state| state.hourly_buckets.is_empty())
            .unwrap_or(true);
        hydrate_session_files(
            &projects_dir,
            &app,
            &mut session_cursors,
            hydrate_with_aggregates,
        );

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
            db: None,
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
        assert_eq!(events[0].received_at, "2025-01-01T00:00:00Z");
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

    #[test]
    fn test_hydrate_session_files_sets_cursor_and_skips_aggregate_buckets() {
        let dir = unique_tmp_dir("hydrate_session_files");
        let sub = dir.join("proj1");
        std::fs::create_dir_all(&sub).unwrap();
        let session_file = sub.join("session.jsonl");
        {
            let mut f = File::create(&session_file).unwrap();
            writeln!(
                f,
                r#"{{"type":"assistant","message":{{"model":"claude-3","content":[{{"type":"text","text":"hello"}}],"usage":{{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":0}}}},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}}"#
            )
            .unwrap();
        }

        let app = make_test_app();
        let mut cursors: HashMap<PathBuf, (u64, String)> = HashMap::new();
        hydrate_session_files(&dir, &app, &mut cursors, false);

        let state = app.state.lock().unwrap();
        assert!(state.hourly_buckets.is_empty());
        assert_eq!(state.by_session["s1"].token_total, 150);
        assert_eq!(state.by_agent["lead-s1"].token_total, 150);
        drop(state);

        let cursor = cursors.get(&session_file).unwrap();
        let meta = metadata(&session_file).unwrap();
        assert_eq!(cursor.0, meta.len());
        assert!(cursor.1.is_empty());

        let _ = std::fs::remove_dir_all(&dir);
    }

    // ── cwd parsing tests ──

    #[test]
    fn test_parse_session_line_user_includes_cwd() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":"hi"},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z","cwd":"/home/user/my-project"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].cwd, "/home/user/my-project");
    }

    #[test]
    fn test_parse_session_line_assistant_includes_cwd() {
        let app = make_test_app();
        let line = r#"{"type":"assistant","message":{"model":"m","content":[{"type":"text","text":"hi"}]},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z","cwd":"/home/user/proj"}"#;
        let events = parse_session_line(line, &app);
        assert!(!events.is_empty());
        assert_eq!(events[0].cwd, "/home/user/proj");
    }

    #[test]
    fn test_parse_session_line_missing_cwd_defaults_empty() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":"hi"},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events[0].cwd, "");
    }

    #[test]
    fn test_parse_session_line_progress_event() {
        let app = make_test_app();
        let line = r#"{"type":"progress","label":"Reading file...","sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "agent_activity");
        assert_eq!(events[0].message, "Reading file...");
    }

    #[test]
    fn test_parse_session_line_queue_operation_event() {
        let app = make_test_app();
        let line = r#"{"type":"queue-operation","op":"enqueue","sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "agent_activity");
        assert_eq!(events[0].message, "enqueue");
    }

    #[test]
    fn test_parse_session_line_progress_no_label_uses_type() {
        let app = make_test_app();
        let line = r#"{"type":"progress","sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].message, "progress");
    }

    #[test]
    fn test_parse_session_line_user_array_content() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":[{"type":"tool_result","content":"result text"},{"type":"text","text":"follow up"}]},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "user_message");
        assert!(events[0].message.contains("result text"));
        assert!(events[0].message.contains("follow up"));
    }

    #[test]
    fn test_parse_session_line_user_tool_result_nested_array_content() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":[{"type":"tool_result","content":[{"type":"text","text":"nested output"}]}]},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "user_message");
        assert!(events[0].message.contains("nested output"));
    }

    #[test]
    fn test_parse_session_line_user_array_content_empty_skipped() {
        let app = make_test_app();
        let line = r#"{"type":"user","message":{"content":[]},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z"}"#;
        let events = parse_session_line(line, &app);
        assert!(events.is_empty());
    }

    #[test]
    fn test_parse_history_event_invalid_timestamp_falls_back() {
        let app = make_test_app();
        let line = r#"{"display":"msg","timestamp":"not-a-date","sessionId":"s1"}"#;
        let evt = parse_history_event(line, &app).unwrap();
        // invalid timestamp should fall back to now_iso(), not use "not-a-date"
        assert_ne!(evt.timestamp, "not-a-date");
    }

    #[test]
    fn test_parse_history_event_new_schema() {
        let app = make_test_app();
        let line =
            r#"{"display":"new format msg","timestamp":"2025-06-01T12:00:00Z","sessionId":"s2"}"#;
        let evt = parse_history_event(line, &app);
        assert!(evt.is_some());
        let evt = evt.unwrap();
        assert_eq!(evt.message, "new format msg");
        assert_eq!(evt.timestamp, "2025-06-01T12:00:00Z");
        assert_eq!(evt.metadata["sessionId"].as_str().unwrap(), "s2");
    }

    #[test]
    fn test_parse_history_event_legacy_schema_still_works() {
        let app = make_test_app();
        let line = r#"{"text":"legacy msg","ts":1700000000,"session_id":"s1"}"#;
        let evt = parse_history_event(line, &app);
        assert!(evt.is_some());
        let evt = evt.unwrap();
        assert_eq!(evt.message, "legacy msg");
        assert_eq!(evt.metadata["sessionId"].as_str().unwrap(), "s1");
    }

    #[test]
    fn test_walk_jsonl_files_ignores_symlinks() {
        let dir = unique_tmp_dir("walk_symlink");
        let proj = dir.join("proj");
        let session = proj.join("sess");
        std::fs::create_dir_all(&session).unwrap();
        File::create(session.join("lead.jsonl")).unwrap();

        // create symlink loop: proj/sess/loop -> proj
        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(&proj, session.join("loop")).unwrap();
            let files = walk_jsonl_files(&dir);
            // should find lead.jsonl but not infinite loop
            assert_eq!(files.len(), 1);
        }
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_walk_jsonl_files_deep_nesting() {
        let dir = unique_tmp_dir("walk_deep");
        let deep = dir.join("proj").join("sess").join("sub1").join("sub2");
        std::fs::create_dir_all(&deep).unwrap();
        File::create(deep.join("agent.jsonl")).unwrap();
        File::create(dir.join("proj").join("sess").join("lead.jsonl")).unwrap();

        let files = walk_jsonl_files(&dir);
        assert_eq!(files.len(), 2);
        assert!(files.iter().all(|p| p.extension().unwrap() == "jsonl"));
        let _ = std::fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_parse_session_line_cwd_in_all_generated_events() {
        let app = make_test_app();
        let line = r#"{"type":"assistant","message":{"model":"m","content":[{"type":"text","text":"hi"},{"type":"tool_use","name":"bash","input":{}}],"usage":{"input_tokens":100,"output_tokens":50,"cache_read_input_tokens":0}},"sessionId":"s1","timestamp":"2025-01-01T00:00:00Z","cwd":"/home/user/proj"}"#;
        let events = parse_session_line(line, &app);
        assert!(events.len() >= 3); // text + tool_use + token_usage
        for evt in &events {
            assert_eq!(
                evt.cwd, "/home/user/proj",
                "event {} missing cwd",
                evt.event
            );
        }
    }
}
