mod collector;
mod db;
mod http;
mod state;
mod types;
mod utils;

use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};
use std::thread;

use collector::spawn_claude_collector;
use db::Db;
use http::{handle_client, spawn_sse_sweeper};
use types::{App, State};
use utils::now_iso;

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
    let retention_days: i64 = std::env::var("MONITOR_RETENTION_DAYS")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(90);
    let claude_home = std::env::var("CLAUDE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home).join(".claude")
        });
    let listener = std::net::TcpListener::bind(format!("{}:{}", host, port)).expect("bind failed");

    let db_path = claude_home.join("monitor.db");
    let db = match Db::open(&db_path) {
        Ok(d) => {
            println!("[db] opened {}", db_path.display());
            Some(d)
        }
        Err(e) => {
            eprintln!(
                "[db] failed to open {}: {} — running without persistence",
                db_path.display(),
                e
            );
            None
        }
    };

    let mut initial_state = State {
        started_at: now_iso(),
        ..State::default()
    };
    if let Some(ref db) = db {
        if let Ok(buckets) = db.restore_buckets(744) {
            initial_state.hourly_buckets = buckets;
        }
        if let Ok((tokens, cost)) = db.query_totals() {
            initial_state.token_total = tokens;
            initial_state.cost_total_usd = cost;
        }
    }

    let db_arc = db.map(|d| Arc::new(Mutex::new(d)));

    let app = App {
        state: Arc::new(Mutex::new(initial_state)),
        sse_clients: Arc::new(Mutex::new(Vec::new())),
        event_seq: Arc::new(AtomicU64::new(1)),
        public_dir: Arc::new(
            std::env::var("PUBLIC_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("public")),
        ),
        db: db_arc.clone(),
    };

    if let Some(db_arc) = db_arc {
        thread::spawn(move || {
            let interval = std::time::Duration::from_secs(24 * 60 * 60);
            loop {
                thread::sleep(interval);
                let before_key = {
                    let now = time::OffsetDateTime::now_utc();
                    let cutoff = now - time::Duration::days(retention_days);
                    cutoff
                        .format(&time::format_description::well_known::Rfc3339)
                        .unwrap_or_default()
                };
                let before_hour = if before_key.len() >= 13 {
                    &before_key[..13]
                } else {
                    ""
                };
                if let Ok(db) = db_arc.lock() {
                    match db.prune_before(before_hour) {
                        Ok(n) if n > 0 => println!("[db] pruned {} old buckets", n),
                        _ => {}
                    }
                }
            }
        });
    }

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
