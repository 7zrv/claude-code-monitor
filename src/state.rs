use serde_json::json;
use std::sync::atomic::Ordering;

use crate::types::{AgentRow, AlertRow, App, Event, Snapshot, SourceRow, State, WorkflowRow};
use crate::utils::now_iso;

pub fn workflow_row(state: &State, role_id: &str) -> WorkflowRow {
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

pub fn build_snapshot(state: &State) -> Snapshot {
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
            api_key: None,
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
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
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
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
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
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
            },
        );
        let row = workflow_row(&state, "agent-1");
        assert_eq!(row.status, "blocked");
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
                model: String::new(),
                is_sidechain: false,
                session_id: String::new(),
            },
        );
        let row = workflow_row(&state, "agent-1");
        assert!(row.active);
        assert_eq!(row.status, "idle");
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
}
