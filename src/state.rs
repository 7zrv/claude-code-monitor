use serde_json::json;
use std::sync::atomic::Ordering;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::types::{
    AgentRow, AlertRow, App, Event, HourBucket, SessionRow, Snapshot, SourceRow, State,
    ToolCallStat, WorkflowRow,
};
use crate::utils::now_iso;

fn elapsed_secs_from(last_seen: &str, now: OffsetDateTime) -> Option<i64> {
    let parsed = OffsetDateTime::parse(last_seen, &Rfc3339).ok()?;
    Some((now - parsed).whole_seconds())
}

pub fn workflow_row(state: &State, role_id: &str) -> WorkflowRow {
    workflow_row_at(state, role_id, OffsetDateTime::now_utc())
}

fn workflow_row_at(state: &State, role_id: &str, now: OffsetDateTime) -> WorkflowRow {
    if let Some(row) = state.by_agent.get(role_id) {
        let elapsed = elapsed_secs_from(&row.last_seen, now);

        let status = if row.error > 0 {
            "blocked"
        } else if row.warning > 0 {
            "at-risk"
        } else {
            match elapsed {
                Some(s) if s < 30 && row.total > 0 => "running",
                Some(s) if s >= 120 => "completed",
                Some(_) => "idle",
                None if row.total > 0 => "running",
                None => "idle",
            }
        };

        WorkflowRow {
            role_id: role_id.to_string(),
            active: true,
            status: status.to_string(),
            total: row.total,
            last_event: row.last_event.clone(),
            last_seen: Some(row.last_seen.clone()),
            display_name: row.display_name.clone(),
        }
    } else {
        WorkflowRow {
            role_id: role_id.to_string(),
            active: false,
            status: "idle".to_string(),
            total: 0,
            last_event: "-".to_string(),
            last_seen: None,
            display_name: String::new(),
        }
    }
}

pub fn get_session_events(state: &State, session_id: &str) -> Vec<Event> {
    state
        .events_by_session
        .get(session_id)
        .cloned()
        .unwrap_or_default()
}

pub fn build_snapshot(state: &State) -> Snapshot {
    let mut agents: Vec<AgentRow> = state.by_agent.values().cloned().collect();
    agents.sort_by(|a, b| a.agent_id.cmp(&b.agent_id));

    let mut sources: Vec<SourceRow> = state.by_source.values().cloned().collect();
    sources.sort_by(|a, b| a.source.cmp(&b.source));

    let totals = agents.iter().fold(
        json!({
            "agents": agents.len(),
            "total": 0,
            "ok": 0,
            "warning": 0,
            "error": 0,
            "tokenTotal": 0,
            "costTotalUsd": state.cost_total_usd,
            "sessions": state.by_session.len(),
        }),
        |mut acc, row| {
            acc["total"] = json!(acc["total"].as_u64().unwrap_or(0) + row.total);
            acc["ok"] = json!(acc["ok"].as_u64().unwrap_or(0) + row.ok);
            acc["warning"] = json!(acc["warning"].as_u64().unwrap_or(0) + row.warning);
            acc["error"] = json!(acc["error"].as_u64().unwrap_or(0) + row.error);
            acc["tokenTotal"] = json!(acc["tokenTotal"].as_u64().unwrap_or(0) + row.token_total);
            acc
        },
    );

    let mut tool_counts: Vec<(&String, &u64)> = state.tool_use_counts.iter().collect();
    tool_counts.sort_by(|a, b| b.1.cmp(a.1));
    let tool_call_stats: Vec<ToolCallStat> = tool_counts
        .into_iter()
        .take(10)
        .map(|(name, count)| ToolCallStat {
            name: name.clone(),
            count: *count,
        })
        .collect();

    Snapshot {
        generated_at: now_iso(),
        totals,
        agents,
        sources,
        recent: state.recent.iter().take(300).cloned().collect(),
        alerts: state.alerts.iter().take(20).cloned().collect(),
        started_at: state.started_at.clone(),
        hourly_buckets: state.hourly_buckets.clone(),
        workflow_progress: {
            let mut rows: Vec<WorkflowRow> = state
                .by_agent
                .keys()
                .map(|k| workflow_row(state, k))
                .collect();
            rows.sort_by(|a, b| {
                let a_seen = a.last_seen.as_deref().unwrap_or("");
                let b_seen = b.last_seen.as_deref().unwrap_or("");
                b_seen.cmp(a_seen)
            });
            rows
        },
        tool_call_stats,
        sessions: {
            let mut sessions: Vec<SessionRow> = state.by_session.values().cloned().collect();
            sessions.sort_by(|a, b| b.last_seen.cmp(&a.last_seen));
            sessions.truncate(50);
            sessions
        },
    }
}

pub fn extract_project_name(cwd: &str) -> &str {
    if cwd.is_empty() {
        return "";
    }
    // Detect .claude/worktrees/<prefix>/<name> pattern
    if let Some(pos) = cwd.find("/.claude/worktrees/") {
        let after = &cwd[pos + "/.claude/worktrees/".len()..];
        // Take the second segment (after prefix like feat/, fix/, etc.)
        let mut segments = after.split('/');
        let first = segments.next().unwrap_or("");
        let second = segments.next().unwrap_or("");
        if !second.is_empty() {
            return second;
        }
        if !first.is_empty() {
            return first;
        }
    }
    // Fallback: last path component
    std::path::Path::new(cwd)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("")
}

pub fn append_event(app: &App, evt: Event) {
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
                model: evt.model.clone(),
                is_sidechain: evt.is_sidechain,
                session_id: evt.session_id.clone(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            });

        row.last_seen = evt.received_at.clone();
        row.total += 1;
        row.last_event = evt.event.clone();
        row.latency_ms = evt.latency_ms;
        if !evt.model.is_empty() {
            row.model = evt.model.clone();
        }
        row.is_sidechain = evt.is_sidechain;
        if !evt.session_id.is_empty() {
            row.session_id = evt.session_id.clone();
        }
        if (evt.event == "user_message" || evt.event == "user_request")
            && !evt.message.is_empty()
            && !row.display_name_from_user
        {
            let mut chars = evt.message.chars();
            let truncated: String = chars.by_ref().take(40).collect();
            if chars.next().is_some() {
                row.display_name = format!("{}...", truncated);
            } else {
                row.display_name = truncated;
            }
            row.display_name_from_user = true;
        } else if !row.display_name_from_user && !evt.cwd.is_empty() {
            let project = extract_project_name(&evt.cwd);
            if !project.is_empty() {
                row.display_name = if evt.is_sidechain {
                    format!("{} (Agent)", project)
                } else {
                    project.to_string()
                };
            }
        }

        match evt.status.as_str() {
            "error" => row.error += 1,
            "warning" => row.warning += 1,
            _ => row.ok += 1,
        }

        if evt.event == "tool_call" {
            *row.tool_use_counts.entry(evt.message.clone()).or_insert(0) += 1;
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

        if (token_total > 0 || cost_delta > 0.0) && evt.received_at.len() >= 13 {
            let hour_key = &evt.received_at[..13];
            // rev() scan is O(1) in normal operation (latest bucket matches);
            // worst-case O(744) for backfilled events, acceptable for bounded vec.
            if let Some(bucket) = state
                .hourly_buckets
                .iter_mut()
                .rev()
                .find(|b| b.hour_key == hour_key)
            {
                bucket.token_total += token_total;
                bucket.cost_usd += cost_delta;
            } else {
                state.hourly_buckets.push(HourBucket {
                    hour_key: hour_key.to_string(),
                    token_total,
                    cost_usd: cost_delta,
                });
                if state.hourly_buckets.len() > 744 {
                    state.hourly_buckets.remove(0);
                }
            }

            if let Some(db_arc) = &app.db {
                if let Ok(db) = db_arc.lock() {
                    if let Err(e) = db.upsert_bucket(hour_key, token_total, cost_delta) {
                        eprintln!("[db] upsert_bucket error: {e}");
                    }
                }
            }
        }

        if evt.event == "tool_call" {
            *state
                .tool_use_counts
                .entry(evt.message.clone())
                .or_insert(0) += 1;
        }

        if !evt.session_id.is_empty() {
            let session = state
                .by_session
                .entry(evt.session_id.clone())
                .or_insert(SessionRow {
                    session_id: evt.session_id.clone(),
                    last_seen: evt.received_at.clone(),
                    token_total: 0,
                    cost_usd: 0.0,
                    agent_ids: vec![],
                });
            session.last_seen = evt.received_at.clone();
            if token_total > 0 {
                session.token_total += token_total;
            }
            if cost_delta > 0.0 {
                session.cost_usd += cost_delta;
            }
            if !session.agent_ids.contains(&evt.agent_id) {
                session.agent_ids.push(evt.agent_id.clone());
            }

            let session_events = state
                .events_by_session
                .entry(evt.session_id.clone())
                .or_default();
            session_events.push(evt.clone());
            if session_events.len() > 500 {
                let excess = session_events.len() - 500;
                session_events.drain(..excess);
            }

            if state.by_session.len() > 200 {
                if let Some(oldest_key) = state
                    .by_session
                    .iter()
                    .filter(|(k, _)| k.as_str() != evt.session_id.as_str())
                    .min_by(|a, b| a.1.last_seen.cmp(&b.1.last_seen))
                    .map(|(k, _)| k.clone())
                {
                    state.events_by_session.remove(&oldest_key);
                    state.by_session.remove(&oldest_key);
                }
            }
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

pub fn broadcast_sse(app: &App, message: String) {
    let mut clients = app.sse_clients.lock().unwrap_or_else(|e| e.into_inner());
    clients.retain(|tx| tx.send(message.clone()).is_ok());
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::path::PathBuf;
    use std::sync::atomic::AtomicU64;
    use std::sync::mpsc;
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

    fn make_test_event(
        status: &str,
        event: &str,
        agent_id: &str,
        metadata: serde_json::Value,
    ) -> Event {
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
            model: String::new(),
            is_sidechain: false,
            session_id: String::new(),
            cwd: String::new(),
        }
    }

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

    fn parse_time(s: &str) -> OffsetDateTime {
        OffsetDateTime::parse(s, &Rfc3339).unwrap()
    }

    #[test]
    fn test_workflow_row_running() {
        let mut state = State::default();
        let last_seen = "2025-01-01T00:00:00Z";
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: last_seen.to_string(),
                total: 5,
                ok: 5,
                warning: 0,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "heartbeat".to_string(),
                latency_ms: None,
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // 10초 후 → running
        let now = parse_time(last_seen) + time::Duration::seconds(10);
        let row = workflow_row_at(&state, "agent-1", now);
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
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // at-risk는 시간 무관
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
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // blocked는 시간 무관
        let row = workflow_row(&state, "agent-1");
        assert_eq!(row.status, "blocked");
    }

    #[test]
    fn test_workflow_row_completed_when_zero_total() {
        let mut state = State::default();
        let last_seen = "2025-01-01T00:00:00Z";
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: last_seen.to_string(),
                total: 0,
                ok: 0,
                warning: 0,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "-".to_string(),
                latency_ms: None,
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // 3분 경과, total=0 → completed
        let now = parse_time(last_seen) + time::Duration::seconds(180);
        let row = workflow_row_at(&state, "agent-1", now);
        assert!(row.active);
        assert_eq!(row.status, "completed");
    }

    #[test]
    fn test_workflow_row_completed_when_last_seen_over_2min() {
        let mut state = State::default();
        let last_seen = "2025-01-01T00:00:00Z";
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: last_seen.to_string(),
                total: 5,
                ok: 5,
                warning: 0,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "done".to_string(),
                latency_ms: None,
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // 3분 경과 → completed
        let now = parse_time(last_seen) + time::Duration::seconds(180);
        let row = workflow_row_at(&state, "agent-1", now);
        assert_eq!(row.status, "completed");
    }

    #[test]
    fn test_workflow_row_idle_when_last_seen_30s_to_2min() {
        let mut state = State::default();
        let last_seen = "2025-01-01T00:00:00Z";
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: last_seen.to_string(),
                total: 5,
                ok: 5,
                warning: 0,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "msg".to_string(),
                latency_ms: None,
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // 60초 경과 → idle
        let now = parse_time(last_seen) + time::Duration::seconds(60);
        let row = workflow_row_at(&state, "agent-1", now);
        assert_eq!(row.status, "idle");
    }

    #[test]
    fn test_workflow_row_running_when_last_seen_recent() {
        let mut state = State::default();
        let last_seen = "2025-01-01T00:00:00Z";
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: last_seen.to_string(),
                total: 3,
                ok: 3,
                warning: 0,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "ping".to_string(),
                latency_ms: None,
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // 5초 경과 → running
        let now = parse_time(last_seen) + time::Duration::seconds(5);
        let row = workflow_row_at(&state, "agent-1", now);
        assert_eq!(row.status, "running");
    }

    #[test]
    fn test_workflow_row_blocked_overrides_time() {
        let mut state = State::default();
        let last_seen = "2025-01-01T00:00:00Z";
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: last_seen.to_string(),
                total: 5,
                ok: 3,
                warning: 1,
                error: 1,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "err".to_string(),
                latency_ms: None,
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // 10분 경과해도 error면 blocked
        let now = parse_time(last_seen) + time::Duration::seconds(600);
        let row = workflow_row_at(&state, "agent-1", now);
        assert_eq!(row.status, "blocked");
    }

    #[test]
    fn test_workflow_row_at_risk_overrides_time() {
        let mut state = State::default();
        let last_seen = "2025-01-01T00:00:00Z";
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: last_seen.to_string(),
                total: 5,
                ok: 3,
                warning: 2,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "warn".to_string(),
                latency_ms: None,
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
            },
        );
        // 10분 경과해도 warning이면 at-risk
        let now = parse_time(last_seen) + time::Duration::seconds(600);
        let row = workflow_row_at(&state, "agent-1", now);
        assert_eq!(row.status, "at-risk");
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
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
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
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: String::new(),
                display_name_from_user: false,
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

    #[test]
    fn test_append_event_tracks_tool_use_counts() {
        let app = make_test_app();
        let mut evt1 = make_test_event("ok", "tool_call", "a1", json!({}));
        evt1.message = "Read".to_string();
        let mut evt2 = make_test_event("ok", "tool_call", "a1", json!({}));
        evt2.message = "Read".to_string();
        let mut evt3 = make_test_event("ok", "tool_call", "a1", json!({}));
        evt3.message = "Bash".to_string();
        append_event(&app, evt1);
        append_event(&app, evt2);
        append_event(&app, evt3);
        let state = app.state.lock().unwrap();
        assert_eq!(state.tool_use_counts["Read"], 2);
        assert_eq!(state.tool_use_counts["Bash"], 1);
    }

    #[test]
    fn test_append_event_tracks_per_agent_tool_counts() {
        let app = make_test_app();
        let mut evt1 = make_test_event("ok", "tool_call", "a1", json!({}));
        evt1.message = "Read".to_string();
        let mut evt2 = make_test_event("ok", "tool_call", "a2", json!({}));
        evt2.message = "Read".to_string();
        let mut evt3 = make_test_event("ok", "tool_call", "a1", json!({}));
        evt3.message = "Edit".to_string();
        append_event(&app, evt1);
        append_event(&app, evt2);
        append_event(&app, evt3);
        let state = app.state.lock().unwrap();
        let a1 = &state.by_agent["a1"];
        assert_eq!(a1.tool_use_counts["Read"], 1);
        assert_eq!(a1.tool_use_counts["Edit"], 1);
        let a2 = &state.by_agent["a2"];
        assert_eq!(a2.tool_use_counts["Read"], 1);
        assert!(!a2.tool_use_counts.contains_key("Edit"));
    }

    #[test]
    fn test_build_snapshot_includes_tool_call_stats() {
        let mut state = State::default();
        state.tool_use_counts.insert("Read".to_string(), 15);
        state.tool_use_counts.insert("Bash".to_string(), 10);
        state.tool_use_counts.insert("Edit".to_string(), 5);
        let snap = build_snapshot(&state);
        assert_eq!(snap.tool_call_stats.len(), 3);
        assert_eq!(snap.tool_call_stats[0].name, "Read");
        assert_eq!(snap.tool_call_stats[0].count, 15);
        assert_eq!(snap.tool_call_stats[1].name, "Bash");
        assert_eq!(snap.tool_call_stats[1].count, 10);
        assert_eq!(snap.tool_call_stats[2].name, "Edit");
        assert_eq!(snap.tool_call_stats[2].count, 5);
    }

    #[test]
    fn test_build_snapshot_tool_call_stats_top_10_limit() {
        let mut state = State::default();
        for i in 0..15 {
            state
                .tool_use_counts
                .insert(format!("tool_{}", i), 100 - i as u64);
        }
        let snap = build_snapshot(&state);
        assert_eq!(snap.tool_call_stats.len(), 10);
        assert!(snap.tool_call_stats[0].count >= snap.tool_call_stats[9].count);
    }

    #[test]
    fn test_build_snapshot_empty_tool_call_stats() {
        let state = State::default();
        let snap = build_snapshot(&state);
        assert!(snap.tool_call_stats.is_empty());
    }

    #[test]
    fn test_append_event_non_tool_call_does_not_affect_tool_counts() {
        let app = make_test_app();
        append_event(
            &app,
            make_test_event("ok", "assistant_message", "a1", json!({})),
        );
        append_event(&app, make_test_event("ok", "user_message", "a1", json!({})));
        let state = app.state.lock().unwrap();
        assert!(state.tool_use_counts.is_empty());
    }

    #[test]
    fn test_append_event_sets_display_name_on_first_user_message() {
        let app = make_test_app();
        let mut evt = make_test_event("ok", "user_message", "a1", json!({}));
        evt.message = "Fix the login bug".to_string();
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "Fix the login bug");
    }

    #[test]
    fn test_append_event_sets_display_name_on_user_request() {
        let app = make_test_app();
        let mut evt = make_test_event("ok", "user_request", "a1", json!({}));
        evt.message = "Add dark mode".to_string();
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "Add dark mode");
    }

    #[test]
    fn test_append_event_truncates_display_name_at_40_chars() {
        let app = make_test_app();
        let mut evt = make_test_event("ok", "user_message", "a1", json!({}));
        evt.message = "This is a very long message that exceeds forty characters limit".to_string();
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(
            state.by_agent["a1"].display_name,
            "This is a very long message that exceeds..."
        );
    }

    #[test]
    fn test_append_event_does_not_overwrite_existing_display_name() {
        let app = make_test_app();
        let mut evt1 = make_test_event("ok", "user_message", "a1", json!({}));
        evt1.message = "First message".to_string();
        append_event(&app, evt1);
        let mut evt2 = make_test_event("ok", "user_message", "a1", json!({}));
        evt2.message = "Second message".to_string();
        append_event(&app, evt2);
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "First message");
    }

    #[test]
    fn test_workflow_row_includes_display_name() {
        let mut state = State::default();
        state.by_agent.insert(
            "agent-1".to_string(),
            AgentRow {
                agent_id: "agent-1".to_string(),
                last_seen: "2025-01-01T00:00:00Z".to_string(),
                total: 1,
                ok: 1,
                warning: 0,
                error: 0,
                token_total: 0,
                cost_usd: 0.0,
                last_event: "ping".to_string(),
                latency_ms: None,
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
                tool_use_counts: std::collections::HashMap::new(),
                display_name: "Fix login bug".to_string(),
                display_name_from_user: false,
            },
        );
        let row = workflow_row(&state, "agent-1");
        assert_eq!(row.display_name, "Fix login bug");
    }

    #[test]
    fn test_elapsed_secs_from_valid_iso() {
        let iso = now_iso();
        let now = OffsetDateTime::now_utc();
        let result = elapsed_secs_from(&iso, now);
        assert!(result.is_some());
        let secs = result.unwrap();
        assert!(secs >= 0 && secs < 2);
    }

    #[test]
    fn test_elapsed_secs_from_invalid_returns_none() {
        let now = OffsetDateTime::now_utc();
        assert!(elapsed_secs_from("not-a-date", now).is_none());
        assert!(elapsed_secs_from("", now).is_none());
    }

    // ── Session aggregation tests ──

    fn make_test_event_with_session(
        status: &str,
        event: &str,
        agent_id: &str,
        session_id: &str,
        metadata: serde_json::Value,
    ) -> Event {
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
            model: String::new(),
            is_sidechain: false,
            session_id: session_id.to_string(),
            cwd: String::new(),
        }
    }

    #[test]
    fn test_append_event_skips_session_when_session_id_empty() {
        let app = make_test_app();
        append_event(
            &app,
            make_test_event_with_session("ok", "msg", "a1", "", json!({})),
        );
        let state = app.state.lock().unwrap();
        assert!(state.by_session.is_empty());
    }

    #[test]
    fn test_append_event_creates_session_row() {
        let app = make_test_app();
        append_event(
            &app,
            make_test_event_with_session("ok", "msg", "a1", "sess-1", json!({})),
        );
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_session.len(), 1);
        let sess = &state.by_session["sess-1"];
        assert_eq!(sess.session_id, "sess-1");
        assert!(sess.agent_ids.contains(&"a1".to_string()));
    }

    #[test]
    fn test_append_event_session_accumulates_tokens_and_cost() {
        let app = make_test_app();
        let meta_tok = json!({ "tokenUsage": { "totalTokens": 200 } });
        append_event(
            &app,
            make_test_event_with_session("ok", "msg", "a1", "sess-1", meta_tok),
        );
        let meta_cost = json!({ "costDelta": 0.03 });
        append_event(
            &app,
            make_test_event_with_session("ok", "cost_update", "a1", "sess-1", meta_cost),
        );
        let state = app.state.lock().unwrap();
        let sess = &state.by_session["sess-1"];
        assert_eq!(sess.token_total, 200);
        assert!((sess.cost_usd - 0.03).abs() < 1e-9);
    }

    #[test]
    fn test_append_event_session_tracks_multiple_agent_ids() {
        let app = make_test_app();
        append_event(
            &app,
            make_test_event_with_session("ok", "msg", "a1", "sess-1", json!({})),
        );
        append_event(
            &app,
            make_test_event_with_session("ok", "msg", "a2", "sess-1", json!({})),
        );
        // duplicate agent should not add again
        append_event(
            &app,
            make_test_event_with_session("ok", "msg", "a1", "sess-1", json!({})),
        );
        let state = app.state.lock().unwrap();
        let sess = &state.by_session["sess-1"];
        assert_eq!(sess.agent_ids.len(), 2);
        assert!(sess.agent_ids.contains(&"a1".to_string()));
        assert!(sess.agent_ids.contains(&"a2".to_string()));
    }

    #[test]
    fn test_append_event_session_evicts_oldest_when_over_200() {
        let app = make_test_app();
        for i in 0..201 {
            let mut evt =
                make_test_event_with_session("ok", "msg", "a1", &format!("sess-{}", i), json!({}));
            evt.received_at = format!("2025-01-01T00:00:{:02}Z", i.min(59));
            append_event(&app, evt);
        }
        let state = app.state.lock().unwrap();
        assert!(state.by_session.len() <= 200);
    }

    #[test]
    fn test_build_snapshot_includes_sessions() {
        let mut state = State::default();
        state.by_session.insert(
            "sess-1".to_string(),
            crate::types::SessionRow {
                session_id: "sess-1".to_string(),
                last_seen: "2025-01-01T00:00:10Z".to_string(),
                token_total: 100,
                cost_usd: 0.05,
                agent_ids: vec!["a1".to_string()],
            },
        );
        let snap = build_snapshot(&state);
        assert_eq!(snap.sessions.len(), 1);
        assert_eq!(snap.sessions[0].session_id, "sess-1");
    }

    #[test]
    fn test_build_snapshot_sessions_sorted_by_last_seen_desc() {
        let mut state = State::default();
        let sessions = [
            ("s1", "2025-01-01T00:00:01Z"),
            ("s2", "2025-01-01T00:00:10Z"),
            ("s3", "2025-01-01T00:00:05Z"),
        ];
        for (id, last_seen) in sessions {
            state.by_session.insert(
                id.to_string(),
                crate::types::SessionRow {
                    session_id: id.to_string(),
                    last_seen: last_seen.to_string(),
                    token_total: 0,
                    cost_usd: 0.0,
                    agent_ids: vec![],
                },
            );
        }
        let snap = build_snapshot(&state);
        let ids: Vec<&str> = snap
            .sessions
            .iter()
            .map(|s| s.session_id.as_str())
            .collect();
        assert_eq!(ids, vec!["s2", "s3", "s1"]);
    }

    #[test]
    fn test_build_snapshot_sessions_limited_to_50() {
        let mut state = State::default();
        for i in 0..80 {
            state.by_session.insert(
                format!("s-{}", i),
                crate::types::SessionRow {
                    session_id: format!("s-{}", i),
                    last_seen: format!("2025-01-01T00:{:02}:00Z", i.min(59)),
                    token_total: 0,
                    cost_usd: 0.0,
                    agent_ids: vec![],
                },
            );
        }
        let snap = build_snapshot(&state);
        assert_eq!(snap.sessions.len(), 50);
    }

    #[test]
    fn test_build_snapshot_totals_includes_session_count() {
        let mut state = State::default();
        state.by_session.insert(
            "sess-1".to_string(),
            crate::types::SessionRow {
                session_id: "sess-1".to_string(),
                last_seen: "2025-01-01T00:00:00Z".to_string(),
                token_total: 0,
                cost_usd: 0.0,
                agent_ids: vec![],
            },
        );
        let snap = build_snapshot(&state);
        assert_eq!(snap.totals["sessions"], 1);
    }

    // ── Session events (drill-down) tests ──

    #[test]
    fn test_append_event_stores_event_in_events_by_session() {
        let app = make_test_app();
        append_event(
            &app,
            make_test_event_with_session("ok", "msg", "a1", "sess-1", json!({})),
        );
        append_event(
            &app,
            make_test_event_with_session("ok", "msg2", "a1", "sess-1", json!({})),
        );
        let state = app.state.lock().unwrap();
        let events = &state.events_by_session["sess-1"];
        assert_eq!(events.len(), 2);
    }

    #[test]
    fn test_append_event_events_by_session_truncates_at_500() {
        let app = make_test_app();
        for i in 0..510 {
            append_event(
                &app,
                make_test_event_with_session("ok", &format!("e{}", i), "a1", "sess-1", json!({})),
            );
        }
        let state = app.state.lock().unwrap();
        let events = &state.events_by_session["sess-1"];
        assert_eq!(events.len(), 500);
        // newest event should be last
        assert_eq!(events[499].event, "e509");
    }

    #[test]
    fn test_append_event_skips_events_by_session_when_empty_id() {
        let app = make_test_app();
        append_event(
            &app,
            make_test_event_with_session("ok", "msg", "a1", "", json!({})),
        );
        let state = app.state.lock().unwrap();
        assert!(state.events_by_session.is_empty());
    }

    #[test]
    fn test_get_session_events_returns_events() {
        let mut state = State::default();
        let evt = make_test_event_with_session("ok", "msg", "a1", "sess-1", json!({}));
        state
            .events_by_session
            .entry("sess-1".to_string())
            .or_default()
            .push(evt);
        let events = get_session_events(&state, "sess-1");
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "msg");
    }

    #[test]
    fn test_get_session_events_empty_for_unknown() {
        let state = State::default();
        let events = get_session_events(&state, "nonexistent");
        assert!(events.is_empty());
    }

    #[test]
    fn test_build_snapshot_workflow_sorted_by_last_seen_desc() {
        let mut state = State::default();
        let agents = [
            ("agent-a", "2026-01-01T00:00:01Z"),
            ("agent-b", "2026-01-01T00:00:10Z"),
            ("agent-c", "2026-01-01T00:00:05Z"),
        ];
        for (id, last_seen) in agents {
            state.by_agent.insert(
                id.to_string(),
                AgentRow {
                    agent_id: id.to_string(),
                    last_seen: last_seen.to_string(),
                    total: 1,
                    ok: 1,
                    warning: 0,
                    error: 0,
                    token_total: 0,
                    cost_usd: 0.0,
                    last_event: "ping".to_string(),
                    latency_ms: None,
                    model: String::new(),
                    is_sidechain: false,
                    session_id: String::new(),
                    tool_use_counts: std::collections::HashMap::new(),
                    display_name: String::new(),
                    display_name_from_user: false,
                },
            );
        }
        let snap = build_snapshot(&state);
        let ids: Vec<&str> = snap
            .workflow_progress
            .iter()
            .map(|r| r.role_id.as_str())
            .collect();
        assert_eq!(ids, vec!["agent-b", "agent-c", "agent-a"]);
    }

    // ── extract_project_name tests ──

    #[test]
    fn test_extract_project_name_normal_path() {
        assert_eq!(extract_project_name("/home/user/my-project"), "my-project");
    }

    #[test]
    fn test_extract_project_name_worktree() {
        assert_eq!(
            extract_project_name("/home/user/repo/.claude/worktrees/feat/foo-123"),
            "foo-123"
        );
    }

    #[test]
    fn test_extract_project_name_root() {
        assert_eq!(extract_project_name("/"), "");
    }

    #[test]
    fn test_extract_project_name_empty() {
        assert_eq!(extract_project_name(""), "");
    }

    // ── display_name fallback tests ──

    fn make_event_with_cwd(
        event: &str,
        agent_id: &str,
        message: &str,
        cwd: &str,
        is_sidechain: bool,
    ) -> Event {
        Event {
            id: "e0".to_string(),
            agent_id: agent_id.to_string(),
            event: event.to_string(),
            status: "ok".to_string(),
            latency_ms: None,
            message: message.to_string(),
            metadata: json!({}),
            timestamp: "2025-01-01T00:00:00Z".to_string(),
            received_at: "2025-01-01T00:00:00Z".to_string(),
            model: String::new(),
            is_sidechain,
            session_id: String::new(),
            cwd: cwd.to_string(),
        }
    }

    #[test]
    fn test_display_name_cwd_fallback() {
        let app = make_test_app();
        let evt = make_event_with_cwd(
            "assistant_message",
            "a1",
            "hello",
            "/home/user/my-project",
            false,
        );
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "my-project");
        assert!(!state.by_agent["a1"].display_name_from_user);
    }

    #[test]
    fn test_display_name_user_message_overrides_cwd() {
        let app = make_test_app();
        // First: assistant with cwd → cwd fallback
        append_event(
            &app,
            make_event_with_cwd("assistant_message", "a1", "hi", "/home/user/proj", false),
        );
        // Then: user message → overrides
        append_event(
            &app,
            make_event_with_cwd(
                "user_message",
                "a1",
                "Fix the bug",
                "/home/user/proj",
                false,
            ),
        );
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "Fix the bug");
        assert!(state.by_agent["a1"].display_name_from_user);
    }

    #[test]
    fn test_display_name_user_message_first() {
        let app = make_test_app();
        append_event(
            &app,
            make_event_with_cwd(
                "user_message",
                "a1",
                "Do something",
                "/home/user/proj",
                false,
            ),
        );
        append_event(
            &app,
            make_event_with_cwd("assistant_message", "a1", "ok", "/home/user/proj", false),
        );
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "Do something");
        assert!(state.by_agent["a1"].display_name_from_user);
    }

    #[test]
    fn test_display_name_sidechain_suffix() {
        let app = make_test_app();
        let evt = make_event_with_cwd(
            "assistant_message",
            "agent-sub",
            "hi",
            "/home/user/my-project",
            true,
        );
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(
            state.by_agent["agent-sub"].display_name,
            "my-project (Agent)"
        );
    }

    #[test]
    fn test_display_name_worktree_cwd() {
        let app = make_test_app();
        let evt = make_event_with_cwd(
            "tool_call",
            "a1",
            "bash",
            "/home/user/repo/.claude/worktrees/feat/foo-123",
            false,
        );
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "foo-123");
    }

    #[test]
    fn test_display_name_empty_cwd_falls_back_to_empty() {
        let app = make_test_app();
        let evt = make_event_with_cwd("assistant_message", "a1", "hi", "", false);
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "");
    }

    #[test]
    fn test_display_name_not_overwritten_by_cwd_after_user_message() {
        let app = make_test_app();
        append_event(
            &app,
            make_event_with_cwd("user_message", "a1", "Fix login", "/home/user/proj", false),
        );
        append_event(
            &app,
            make_event_with_cwd(
                "assistant_message",
                "a1",
                "ok",
                "/home/user/other-proj",
                false,
            ),
        );
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "Fix login");
    }

    #[test]
    fn test_display_name_multiple_agents_independent() {
        let app = make_test_app();
        append_event(
            &app,
            make_event_with_cwd("assistant_message", "a1", "hi", "/home/user/proj-a", false),
        );
        append_event(
            &app,
            make_event_with_cwd("user_message", "a2", "Build it", "/home/user/proj-b", false),
        );
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "proj-a");
        assert_eq!(state.by_agent["a2"].display_name, "Build it");
    }

    #[test]
    fn test_display_name_user_request_same_as_user_message() {
        let app = make_test_app();
        append_event(
            &app,
            make_event_with_cwd("assistant_message", "a1", "hi", "/home/user/proj", false),
        );
        append_event(
            &app,
            make_event_with_cwd("user_request", "a1", "Deploy app", "/home/user/proj", false),
        );
        let state = app.state.lock().unwrap();
        assert_eq!(state.by_agent["a1"].display_name, "Deploy app");
        assert!(state.by_agent["a1"].display_name_from_user);
    }

    #[test]
    fn test_extract_project_name_nested_worktree() {
        assert_eq!(
            extract_project_name("/home/user/repo/.claude/worktrees/fix/bug-42/subdir"),
            "bug-42"
        );
    }

    // ── Hourly bucket tests ──

    fn make_event_with_received_at(
        event: &str,
        received_at: &str,
        metadata: serde_json::Value,
    ) -> Event {
        Event {
            id: "e0".to_string(),
            agent_id: "a1".to_string(),
            event: event.to_string(),
            status: "ok".to_string(),
            latency_ms: None,
            message: "test".to_string(),
            metadata,
            timestamp: received_at.to_string(),
            received_at: received_at.to_string(),
            model: String::new(),
            is_sidechain: false,
            session_id: String::new(),
            cwd: String::new(),
        }
    }

    #[test]
    fn test_hourly_bucket_created_on_token_event() {
        let app = make_test_app();
        let meta = json!({ "tokenUsage": { "totalTokens": 100 } });
        let evt = make_event_with_received_at("msg", "2025-01-01T14:00:00Z", meta);
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.hourly_buckets.len(), 1);
        assert_eq!(state.hourly_buckets[0].hour_key, "2025-01-01T14");
        assert_eq!(state.hourly_buckets[0].token_total, 100);
    }

    #[test]
    fn test_hourly_bucket_accumulates_same_hour() {
        let app = make_test_app();
        let meta1 = json!({ "tokenUsage": { "totalTokens": 100 } });
        let evt1 = make_event_with_received_at("msg", "2025-01-01T14:00:00Z", meta1);
        let meta2 = json!({ "tokenUsage": { "totalTokens": 200 } });
        let evt2 = make_event_with_received_at("msg", "2025-01-01T14:30:00Z", meta2);
        append_event(&app, evt1);
        append_event(&app, evt2);
        let state = app.state.lock().unwrap();
        assert_eq!(state.hourly_buckets.len(), 1);
        assert_eq!(state.hourly_buckets[0].token_total, 300);
    }

    #[test]
    fn test_hourly_bucket_new_hour_creates_new() {
        let app = make_test_app();
        let meta1 = json!({ "tokenUsage": { "totalTokens": 100 } });
        let evt1 = make_event_with_received_at("msg", "2025-01-01T14:00:00Z", meta1);
        let meta2 = json!({ "tokenUsage": { "totalTokens": 200 } });
        let evt2 = make_event_with_received_at("msg", "2025-01-01T15:00:00Z", meta2);
        append_event(&app, evt1);
        append_event(&app, evt2);
        let state = app.state.lock().unwrap();
        assert_eq!(state.hourly_buckets.len(), 2);
        assert_eq!(state.hourly_buckets[0].hour_key, "2025-01-01T14");
        assert_eq!(state.hourly_buckets[1].hour_key, "2025-01-01T15");
    }

    #[test]
    fn test_hourly_bucket_max_744() {
        let app = make_test_app();
        for i in 0..745 {
            let hour = i % 24;
            let day = 1 + i / 24;
            let received_at = format!(
                "2025-{:02}-{:02}T{:02}:00:00Z",
                (day / 28) + 1,
                (day % 28) + 1,
                hour
            );
            let meta = json!({ "tokenUsage": { "totalTokens": 1 } });
            let evt = make_event_with_received_at("msg", &received_at, meta);
            append_event(&app, evt);
        }
        let state = app.state.lock().unwrap();
        assert_eq!(state.hourly_buckets.len(), 744);
    }

    #[test]
    fn test_hourly_bucket_cost_only() {
        let app = make_test_app();
        let meta = json!({ "costDelta": 0.05 });
        let evt = make_event_with_received_at("cost_update", "2025-01-01T14:00:00Z", meta);
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.hourly_buckets.len(), 1);
        assert_eq!(state.hourly_buckets[0].token_total, 0);
        assert!((state.hourly_buckets[0].cost_usd - 0.05).abs() < 1e-9);
    }

    #[test]
    fn test_hourly_bucket_no_token_no_cost_skipped() {
        let app = make_test_app();
        let evt = make_event_with_received_at("msg", "2025-01-01T14:00:00Z", json!({}));
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert!(state.hourly_buckets.is_empty());
    }

    #[test]
    fn test_snapshot_includes_started_at() {
        let mut state = State::default();
        state.started_at = "2025-01-01T00:00:00Z".to_string();
        let snap = build_snapshot(&state);
        assert_eq!(snap.started_at, "2025-01-01T00:00:00Z");
    }

    #[test]
    fn test_snapshot_includes_hourly_buckets() {
        let mut state = State::default();
        state.hourly_buckets.push(HourBucket {
            hour_key: "2025-01-01T14".to_string(),
            token_total: 500,
            cost_usd: 0.10,
        });
        let snap = build_snapshot(&state);
        assert_eq!(snap.hourly_buckets.len(), 1);
        assert_eq!(snap.hourly_buckets[0].hour_key, "2025-01-01T14");
        assert_eq!(snap.hourly_buckets[0].token_total, 500);
    }

    #[test]
    fn test_append_event_persists_bucket_to_db() {
        use crate::db::Db;
        let dir = tempfile::tempdir().unwrap();
        let db = Db::open(&dir.path().join("test.db")).unwrap();
        let db_arc = Arc::new(Mutex::new(db));
        let app = App {
            state: Arc::new(Mutex::new(State::default())),
            sse_clients: Arc::new(Mutex::new(Vec::new())),
            event_seq: Arc::new(std::sync::atomic::AtomicU64::new(1)),
            public_dir: Arc::new(PathBuf::from("public")),
            db: Some(db_arc.clone()),
        };
        let meta = json!({ "tokenUsage": { "totalTokens": 100 } });
        let evt = make_event_with_received_at("msg", "2025-01-01T14:00:00Z", meta);
        append_event(&app, evt);

        let db = db_arc.lock().unwrap();
        let rows = db.query_since("").unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].hour_key, "2025-01-01T14");
        assert_eq!(rows[0].token_total, 100);
    }
}
