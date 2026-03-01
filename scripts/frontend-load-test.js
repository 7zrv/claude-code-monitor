export const MODELS = ['claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5'];

const base = process.env.MONITOR_BASE_URL || 'http://localhost:5050';
const durationSec = Number(process.env.LOAD_DURATION_SEC || 20);
const eventsPerSec = Number(process.env.LOAD_EVENTS_PER_SEC || 10);
const totalEvents = durationSec * eventsPerSec;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function postEvent(i) {
  const status = i % 15 === 0 ? 'error' : i % 6 === 0 ? 'warning' : 'ok';
  const payload = {
    agentId: MODELS[i % MODELS.length],
    event: i % 2 === 0 ? 'tool_call' : 'session_end',
    status,
    message: `load-test-${i}`,
    metadata: { source: 'load_test' }
  };

  const res = await fetch(`${base}/api/events`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`POST failed: ${res.status}`);
  }
}

async function main() {
  console.log(`[load-test] target=${base}`);
  console.log(`[load-test] durationSec=${durationSec} eventsPerSec=${eventsPerSec} total=${totalEvents}`);

  const started = Date.now();
  let sent = 0;
  const perTick = 1000 / eventsPerSec;

  for (let i = 0; i < totalEvents; i += 1) {
    const now = Date.now();
    const expected = started + i * perTick;
    if (now < expected) {
      await delay(expected - now);
    }
    await postEvent(i);
    sent += 1;
  }

  const snapshotRes = await fetch(`${base}/api/events`);
  const snapshot = await snapshotRes.json();

  const result = {
    sent,
    totals: snapshot.totals,
    sources: snapshot.sources,
    recentCount: snapshot.recent?.length || 0,
    alertsCount: snapshot.alerts?.length || 0
  };

  console.log('[load-test] result');
  console.log(JSON.stringify(result, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(`[load-test] failed: ${err.message}`);
    process.exit(1);
  });
}
