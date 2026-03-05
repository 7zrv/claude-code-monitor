use serde_json::json;
use std::sync::atomic::Ordering;
use time::format_description::well_known::Rfc3339;
use time::OffsetDateTime;

use crate::types::{
    AgentRow, AlertRow, App, Event, SessionRow, Snapshot, SourceRow, State, TokenSample,
    ToolCallStat, WorkflowRow,
};
use crate::utils::now_iso;

fn elapsed_secs_from(last_seen: &str, now: OffsetDateTime) -> Option<i64> {
    let parsed = OffsetDateTime::parse(last_seen, &Rfc3339).ok()?;
    Some((now - parsed).whole_seconds())
}

pub fn calc_token_burn_rate(samples: &[TokenSample]) -> f64 {
    if samples.len() < 2 {
        return 0.0;
    }
    let first = &samples[0];
    let last = &samples[samples.len() - 1];
    let elapsed_secs = (last.sampled_at_dt - first.sampled_at_dt).whole_seconds();
    if elapsed_secs <= 0 {
        return 0.0;
    }
    let token_diff = last.tokens as f64 - first.tokens as f64;
    token_diff / (elapsed_secs as f64 / 60.0)
}

pub fn calc_time_to_limit(token_total: u64, plan_limit: u64, burn_rate: f64) -> Option<f64> {
    if plan_limit == 0 || burn_rate <= 0.0 {
        return None;
    }
    let remaining = plan_limit as f64 - token_total as f64;
    Some(remaining / burn_rate)
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

    let burn_rate = calc_token_burn_rate(&state.token_samples);
    let plan_usage_percent = if state.plan_limit > 0 {
        json!(state.token_total as f64 / state.plan_limit as f64 * 100.0)
    } else {
        json!(null)
    };
    let minutes_to_limit = match calc_time_to_limit(state.token_total, state.plan_limit, burn_rate)
    {
        Some(m) => json!(m),
        None => json!(null),
    };

    let totals = agents.iter().fold(
        json!({
            "agents": agents.len(),
            "total": 0, "ok": 0, "warning": 0, "error": 0,
            "tokenTotal": 0,
            "costTotalUsd": state.cost_total_usd,
            "sessions": state.by_session.len(),
            "tokenBurnRate": burn_rate,
            "planLimit": state.plan_limit,
            "planUsagePercent": plan_usage_percent,
            "minutesToLimit": minutes_to_limit,
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
            && row.display_name.is_empty()
            && !evt.message.is_empty()
        {
            let mut chars = evt.message.chars();
            let truncated: String = chars.by_ref().take(40).collect();
            if chars.next().is_some() {
                row.display_name = format!("{}...", truncated);
            } else {
                row.display_name = truncated;
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

            // Record token sample and prune old ones (>10 min)
            if let Ok(now_time) = OffsetDateTime::parse(&evt.received_at, &Rfc3339) {
                let cutoff = now_time - time::Duration::minutes(10);
                state.token_samples.retain(|s| s.sampled_at_dt >= cutoff);
                let cumulative = state.token_total;
                state.token_samples.push(TokenSample {
                    tokens: cumulative,
                    sampled_at_dt: now_time,
                });
            }
        }
        if cost_delta > 0.0 {
            state.cost_total_usd += cost_delta;
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

    fn parse_time(s: &str) -> OffsetDateTime {
        OffsetDateTime::parse(s, &Rfc3339).unwrap()
    }

    fn make_token_sample(tokens: u64, at: &str) -> TokenSample {
        TokenSample {
            tokens,
            sampled_at_dt: parse_time(at),
        }
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

    #[test]
    fn test_build_snapshot_includes_burn_rate_fields() {
        let mut state = State::default();
        state.token_total = 5000;
        state.plan_limit = 100_000;
        state.token_samples = vec![
            make_token_sample(3000, "2025-01-01T00:00:00Z"),
            make_token_sample(5000, "2025-01-01T00:05:00Z"),
        ];
        let snap = build_snapshot(&state);
        // burn rate = (5000 - 3000) / 5 = 400 tok/min
        assert!((snap.totals["tokenBurnRate"].as_f64().unwrap() - 400.0).abs() < 0.01);
        assert_eq!(snap.totals["planLimit"], 100_000);
        // usage percent = 5000 / 100000 * 100 = 5.0
        assert!((snap.totals["planUsagePercent"].as_f64().unwrap() - 5.0).abs() < 0.01);
        // minutes to limit = (100000 - 5000) / 400 = 237.5
        assert!((snap.totals["minutesToLimit"].as_f64().unwrap() - 237.5).abs() < 0.01);
    }

    #[test]
    fn test_build_snapshot_no_plan_limit_fields_null() {
        let mut state = State::default();
        state.token_total = 5000;
        state.plan_limit = 0;
        let snap = build_snapshot(&state);
        assert_eq!(snap.totals["tokenBurnRate"], 0.0);
        assert_eq!(snap.totals["planLimit"], 0);
        assert!(snap.totals["planUsagePercent"].is_null());
        assert!(snap.totals["minutesToLimit"].is_null());
    }

    #[test]
    fn test_append_event_records_token_sample() {
        let app = make_test_app();
        let meta = json!({ "tokenUsage": { "totalTokens": 500 } });
        let mut evt = make_test_event("ok", "msg", "a1", meta);
        evt.received_at = "2025-01-01T00:00:00Z".to_string();
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert_eq!(state.token_samples.len(), 1);
        assert_eq!(state.token_samples[0].tokens, 500);
        assert_eq!(
            state.token_samples[0].sampled_at_dt,
            parse_time("2025-01-01T00:00:00Z")
        );
    }

    #[test]
    fn test_append_event_no_sample_when_zero_tokens() {
        let app = make_test_app();
        let evt = make_test_event("ok", "msg", "a1", json!({}));
        append_event(&app, evt);
        let state = app.state.lock().unwrap();
        assert!(state.token_samples.is_empty());
    }

    #[test]
    fn test_append_event_prunes_old_samples() {
        let app = make_test_app();
        // Old sample: 15 minutes ago
        let meta1 = json!({ "tokenUsage": { "totalTokens": 100 } });
        let mut evt1 = make_test_event("ok", "msg", "a1", meta1);
        evt1.received_at = "2025-01-01T00:00:00Z".to_string();
        append_event(&app, evt1);

        // Recent sample: 5 minutes later (still within 10 min window of next event)
        let meta2 = json!({ "tokenUsage": { "totalTokens": 200 } });
        let mut evt2 = make_test_event("ok", "msg", "a1", meta2);
        evt2.received_at = "2025-01-01T00:05:00Z".to_string();
        append_event(&app, evt2);

        // New sample: 11 minutes after first → first should be pruned
        let meta3 = json!({ "tokenUsage": { "totalTokens": 300 } });
        let mut evt3 = make_test_event("ok", "msg", "a1", meta3);
        evt3.received_at = "2025-01-01T00:11:00Z".to_string();
        append_event(&app, evt3);

        let state = app.state.lock().unwrap();
        // First sample (00:00) should be pruned (>10 min before 00:11)
        // Cumulative totals: evt1=100, evt2=100+200=300, evt3=100+200+300=600
        assert_eq!(state.token_samples.len(), 2);
        assert_eq!(state.token_samples[0].tokens, 300);
        assert_eq!(state.token_samples[1].tokens, 600);
    }

    #[test]
    fn test_calc_token_burn_rate_empty_samples() {
        let samples: Vec<TokenSample> = vec![];
        assert_eq!(calc_token_burn_rate(&samples), 0.0);
    }

    #[test]
    fn test_calc_token_burn_rate_single_sample() {
        let samples = vec![make_token_sample(1000, "2025-01-01T00:00:00Z")];
        assert_eq!(calc_token_burn_rate(&samples), 0.0);
    }

    #[test]
    fn test_calc_token_burn_rate_two_samples() {
        let samples = vec![
            make_token_sample(1000, "2025-01-01T00:00:00Z"),
            make_token_sample(2000, "2025-01-01T00:05:00Z"),
        ];
        // (2000 - 1000) / 5 minutes = 200.0 tok/min
        assert!((calc_token_burn_rate(&samples) - 200.0).abs() < 0.01);
    }

    #[test]
    fn test_calc_token_burn_rate_zero_elapsed() {
        let samples = vec![
            make_token_sample(1000, "2025-01-01T00:00:00Z"),
            make_token_sample(2000, "2025-01-01T00:00:00Z"),
        ];
        assert_eq!(calc_token_burn_rate(&samples), 0.0);
    }

    #[test]
    fn test_calc_time_to_limit_normal() {
        // 100 tok/min burn rate, 8000 remaining → 80 min
        let result = calc_time_to_limit(2000, 10000, 100.0);
        assert!((result.unwrap() - 80.0).abs() < 0.01);
    }

    #[test]
    fn test_calc_time_to_limit_no_plan() {
        assert!(calc_time_to_limit(2000, 0, 100.0).is_none());
    }

    #[test]
    fn test_calc_time_to_limit_zero_burn_rate() {
        assert!(calc_time_to_limit(2000, 10000, 0.0).is_none());
    }

    #[test]
    fn test_calc_time_to_limit_negative_burn_rate() {
        assert!(calc_time_to_limit(2000, 10000, -5.0).is_none());
    }

    #[test]
    fn test_calc_time_to_limit_already_exceeded() {
        // token_total > plan_limit
        let result = calc_time_to_limit(15000, 10000, 100.0);
        assert!(result.unwrap() < 0.0);
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
}
