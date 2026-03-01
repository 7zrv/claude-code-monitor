import { createServer } from 'node:http';
import crypto from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { extname, join } from 'node:path';

const PORT = process.env.PORT || 5050;
const HOST = process.env.HOST || '127.0.0.1';
const PUBLIC_DIR = join(process.cwd(), 'public');
const PUBLIC_DIR_ABS = path.resolve(PUBLIC_DIR);
const API_KEY = process.env.MONITOR_API_KEY || '';

const state = {
  recent: [],
  maxRecent: 200,
  alerts: [],
  maxAlerts: 120,
  byAgent: new Map(),
  bySource: new Map(),
  clients: new Set()
};

const contentType = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon'
};

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';

    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });

    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });

    req.on('error', reject);
  });
}

function normalizeEvent(payload) {
  const now = new Date().toISOString();
  const latencyMs = Number(payload.latencyMs);
  const parsed = payload.timestamp ? new Date(payload.timestamp) : null;
  const timestamp = parsed && !Number.isNaN(parsed.valueOf()) ? parsed.toISOString() : now;

  return {
    id: crypto.randomUUID(),
    agentId: String(payload.agentId || 'unknown-agent'),
    event: String(payload.event || 'heartbeat'),
    status: String(payload.status || 'ok'),
    latencyMs: Number.isFinite(latencyMs) ? latencyMs : null,
    message: payload.message ? String(payload.message) : '',
    metadata: payload.metadata && typeof payload.metadata === 'object' ? payload.metadata : {},
    timestamp,
    receivedAt: now
  };
}

function appendEvent(evt) {
  state.recent.unshift(evt);
  if (state.recent.length > state.maxRecent) {
    state.recent.length = state.maxRecent;
  }

  const prev = state.byAgent.get(evt.agentId) || {
    agentId: evt.agentId,
    lastSeen: evt.receivedAt,
    total: 0,
    ok: 0,
    warning: 0,
    error: 0,
    lastEvent: evt.event,
    latencyMs: null
  };

  prev.lastSeen = evt.receivedAt;
  prev.total += 1;
  prev.lastEvent = evt.event;
  prev.latencyMs = evt.latencyMs;

  if (evt.status === 'error') prev.error += 1;
  else if (evt.status === 'warning') prev.warning += 1;
  else prev.ok += 1;

  state.byAgent.set(evt.agentId, prev);
  const source = evt.metadata?.source ? String(evt.metadata.source) : 'manual';
  const sourcePrev = state.bySource.get(source) || {
    source,
    total: 0,
    ok: 0,
    warning: 0,
    error: 0,
    lastSeen: evt.receivedAt
  };
  sourcePrev.total += 1;
  sourcePrev.lastSeen = evt.receivedAt;
  if (evt.status === 'error') sourcePrev.error += 1;
  else if (evt.status === 'warning') sourcePrev.warning += 1;
  else sourcePrev.ok += 1;
  state.bySource.set(source, sourcePrev);
  if (evt.status === 'warning' || evt.status === 'error') {
    const alert = {
      id: crypto.randomUUID(),
      severity: evt.status,
      agentId: evt.agentId,
      event: evt.event,
      message: evt.message || 'No message',
      createdAt: evt.receivedAt
    };
    state.alerts.unshift(alert);
    if (state.alerts.length > state.maxAlerts) {
      state.alerts.length = state.maxAlerts;
    }
  }

  const data = `data: ${JSON.stringify({ type: 'event', payload: evt })}\n\n`;
  for (const client of state.clients) {
    client.write(data);
  }
}

function roleProgressRow(roleId) {
  const row = state.byAgent.get(roleId);
  if (!row) {
    return {
      roleId,
      active: false,
      status: 'idle',
      total: 0,
      lastEvent: '-',
      lastSeen: null
    };
  }

  const status =
    row.error > 0 ? 'blocked' :
    row.warning > 0 ? 'at-risk' :
    row.total > 0 ? 'running' :
    'idle';

  return {
    roleId,
    active: true,
    status,
    total: row.total,
    lastEvent: row.lastEvent,
    lastSeen: row.lastSeen
  };
}

function buildSnapshot() {
  const agentRows = [...state.byAgent.values()].sort((a, b) =>
    a.agentId.localeCompare(b.agentId)
  );

  const totals = agentRows.reduce(
    (acc, row) => {
      acc.total += row.total;
      acc.ok += row.ok;
      acc.warning += row.warning;
      acc.error += row.error;
      return acc;
    },
    { agents: agentRows.length, total: 0, ok: 0, warning: 0, error: 0 }
  );
  const sources = [...state.bySource.values()].sort((a, b) => a.source.localeCompare(b.source));

  return {
    generatedAt: new Date().toISOString(),
    totals,
    agents: agentRows,
    sources,
    recent: state.recent.slice(0, 50),
    alerts: state.alerts.slice(0, 20),
    workflowProgress: agentRows.map((row) => roleProgressRow(row.agentId))
  };
}

async function serveStatic(pathname, res) {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(path.join(PUBLIC_DIR, safePath));

  if (!filePath.startsWith(PUBLIC_DIR_ABS)) {
    res.writeHead(403, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = extname(filePath);
    res.writeHead(200, {
      'content-type': contentType[ext] || 'application/octet-stream',
      'cache-control': 'no-cache'
    });
    res.end(file);
  } catch {
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);

  if (req.method === 'GET' && url.pathname === '/api/health') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ ok: true, now: new Date().toISOString() }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/events') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(buildSnapshot()));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/alerts') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ alerts: state.alerts.slice(0, 50) }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/stream') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    });

    res.write(`data: ${JSON.stringify({ type: 'snapshot', payload: buildSnapshot() })}\n\n`);
    state.clients.add(res);

    const keepAlive = setInterval(() => {
      res.write(': keepalive\n\n');
    }, 15000);

    req.on('close', () => {
      clearInterval(keepAlive);
      state.clients.delete(res);
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/events') {
    try {
      if (API_KEY && req.headers['x-api-key'] !== API_KEY) {
        res.writeHead(401, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return;
      }

      const payload = await parseJsonBody(req);
      const evt = normalizeEvent(payload);
      appendEvent(evt);

      res.writeHead(202, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ accepted: true, id: evt.id }));
    } catch (err) {
      res.writeHead(400, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  if (req.method === 'GET') {
    await serveStatic(url.pathname, res);
    return;
  }

  res.writeHead(405, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Method not allowed' }));
});

server.listen(PORT, HOST, () => {
  console.log(`Codex Pulse listening on http://${HOST}:${PORT}`);
});
