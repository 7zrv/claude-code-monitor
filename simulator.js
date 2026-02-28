const TARGET = process.env.MONITOR_URL || 'http://localhost:5050/api/events';
const AGENTS = ['lead', 'designer', 'frontend', 'backend'];
const EVENTS = ['heartbeat', 'task_started', 'task_completed', 'tool_call'];

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

console.log(`Sending sample events to ${TARGET}`);
setInterval(() => {
  postEvent().catch((err) => {
    console.error(err.message);
  });
}, 1500);
