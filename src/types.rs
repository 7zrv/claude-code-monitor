use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use crate::db::Db;

#[derive(Clone)]
pub struct App {
    pub state: Arc<Mutex<State>>,
    pub sse_clients: Arc<Mutex<Vec<Sender<String>>>>,
    pub event_seq: Arc<AtomicU64>,
    pub public_dir: Arc<PathBuf>,
    pub db: Option<Arc<Mutex<Db>>>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Event {
    pub id: String,
    pub agent_id: String,
    pub event: String,
    pub status: String,
    pub latency_ms: Option<i64>,
    pub message: String,
    pub metadata: Value,
    pub timestamp: String,
    pub received_at: String,
    pub model: String,
    pub is_sidechain: bool,
    pub session_id: String,
    #[serde(skip)]
    pub cwd: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AgentRow {
    pub agent_id: String,
    pub last_seen: String,
    pub total: u64,
    pub ok: u64,
    pub warning: u64,
    pub error: u64,
    pub token_total: u64,
    pub cost_usd: f64,
    pub last_event: String,
    pub latency_ms: Option<i64>,
    pub model: String,
    pub is_sidechain: bool,
    pub session_id: String,
    pub tool_use_counts: HashMap<String, u64>,
    pub display_name: String,
    #[serde(skip)]
    pub display_name_from_user: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AlertRow {
    pub id: String,
    pub severity: String,
    pub agent_id: String,
    pub event: String,
    pub message: String,
    pub created_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceRow {
    pub source: String,
    pub total: u64,
    pub ok: u64,
    pub warning: u64,
    pub error: u64,
    pub last_seen: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowRow {
    pub role_id: String,
    pub active: bool,
    pub status: String,
    pub total: u64,
    pub last_event: String,
    pub last_seen: Option<String>,
    pub display_name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionRow {
    pub session_id: String,
    pub last_seen: String,
    pub token_total: u64,
    pub cost_usd: f64,
    pub agent_ids: Vec<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionExportRisk {
    pub session_state: String,
    pub needs_attention: bool,
    pub needs_attention_rank: u64,
    pub needs_attention_reasons: Vec<String>,
    pub is_cost_spike: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionExportAlert {
    pub id: String,
    pub source: String,
    pub severity: String,
    pub event: String,
    pub message: String,
    pub created_at: String,
    pub agent_id: String,
    pub session_id: String,
    pub derived_reason: Option<String>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionExportContext {
    pub risk: SessionExportRisk,
    pub alerts: Vec<SessionExportAlert>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionExport {
    pub exported_at: String,
    pub summary: SessionRow,
    pub context: SessionExportContext,
    pub events: Vec<Event>,
}

#[derive(Clone, Serialize, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct HourBucket {
    pub hour_key: String,
    pub token_total: u64,
    pub cost_usd: f64,
}

#[derive(Default)]
pub struct State {
    pub recent: Vec<Event>,
    pub alerts: Vec<AlertRow>,
    pub by_agent: HashMap<String, AgentRow>,
    pub by_source: HashMap<String, SourceRow>,
    pub by_session: HashMap<String, SessionRow>,
    pub events_by_session: HashMap<String, Vec<Event>>,
    pub token_total: u64,
    pub cost_total_usd: f64,
    pub tool_use_counts: HashMap<String, u64>,
    pub started_at: String,
    pub hourly_buckets: Vec<HourBucket>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolCallStat {
    pub name: String,
    pub count: u64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Snapshot {
    pub generated_at: String,
    pub totals: Value,
    pub agents: Vec<AgentRow>,
    pub sources: Vec<SourceRow>,
    pub recent: Vec<Event>,
    pub alerts: Vec<AlertRow>,
    pub workflow_progress: Vec<WorkflowRow>,
    pub tool_call_stats: Vec<ToolCallStat>,
    pub sessions: Vec<SessionRow>,
    pub started_at: String,
    pub hourly_buckets: Vec<HourBucket>,
}

pub struct ParsedRequest {
    pub method: String,
    pub path: String,
}
