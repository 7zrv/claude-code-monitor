const TARGET = process.env.MONITOR_URL || 'http://localhost:5050/api/events';
export const AGENTS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];
export const EVENTS = ['heartbeat', 'session_start', 'session_end', 'tool_call', 'user_message', 'token_usage'];

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomStatus() {
  const r = Math.random();
  if (r < 0.08) return 'error';
  if (r < 0.22) return 'warning';
  return 'ok';
}

async function postEvent() {
  const status = randomStatus();
  const payload = {
    agentId: pick(AGENTS),
    event: pick(EVENTS),
    status,
    latencyMs: Math.floor(Math.random() * 1500) + 50,
    message:
      status === 'error'
        ? 'Unhandled tool exception'
        : status === 'warning'
          ? 'Retrying transient error'
          : 'Cycle complete',
    metadata: {
      runId: Math.random().toString(36).slice(2, 10)
    }
  };

  const res = await fetch(TARGET, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed ${res.status}: ${text}`);
  }

  const body = await res.json();
  console.log(`[${new Date().toISOString()}] sent ${payload.agentId}/${payload.event}/${payload.status} -> ${body.id}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`Sending sample events to ${TARGET}`);
  setInterval(() => {
    postEvent().catch((err) => {
      console.error(err.message);
    });
  }, 1500);
}
