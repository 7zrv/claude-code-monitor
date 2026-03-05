mod collector;
mod http;
mod state;
mod types;
mod utils;

use std::path::PathBuf;
use std::sync::atomic::AtomicU64;
use std::sync::{Arc, Mutex};
use std::thread;

use collector::spawn_claude_collector;
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
    let claude_home = std::env::var("CLAUDE_HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|_| {
            let home = std::env::var("HOME")
                .or_else(|_| std::env::var("USERPROFILE"))
                .unwrap_or_else(|_| ".".to_string());
            PathBuf::from(home).join(".claude")
        });
    let listener = std::net::TcpListener::bind(format!("{}:{}", host, port)).expect("bind failed");

    let app = App {
        state: Arc::new(Mutex::new(State {
            started_at: now_iso(),
            ..State::default()
        })),
        sse_clients: Arc::new(Mutex::new(Vec::new())),
        event_seq: Arc::new(AtomicU64::new(1)),
        public_dir: Arc::new(
            std::env::var("PUBLIC_DIR")
                .map(PathBuf::from)
                .unwrap_or_else(|_| PathBuf::from("public")),
        ),
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
