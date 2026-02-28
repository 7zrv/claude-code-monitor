import { stat, open } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

const MONITOR_URL = process.env.MONITOR_URL || 'http://localhost:5050/api/events';
const POLL_MS = Number(process.env.CODEX_POLL_MS || 2500);
const MAX_READ_BYTES = 512 * 1024;
const BACKFILL_LINES = Number(process.env.CODEX_BACKFILL_LINES || 25);

const CODEX_HOME = process.env.CODEX_HOME || join(homedir(), '.codex');
const HISTORY_FILE = process.env.CODEX_HISTORY_FILE || join(CODEX_HOME, 'history.jsonl');
const LOG_FILE = process.env.CODEX_LOG_FILE || join(CODEX_HOME, 'log', 'codex-tui.log');

const cursors = new Map();

function getCursor(filePath) {
  if (!cursors.has(filePath)) {
    cursors.set(filePath, { offset: 0, partial: '' });
  }
  return cursors.get(filePath);
}

async function postEvent(payload) {
  const res = await fetch(MONITOR_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`monitor post failed ${res.status}: ${text}`);
  }
}

function detectRole(text) {
  const normalized = String(text || '').toLowerCase();
  if (normalized.includes('design') || normalized.includes('디자인') || normalized.includes('ui')) {
    return 'designer';
  }
  if (
    normalized.includes('front') ||
    normalized.includes('프론트') ||
    normalized.includes('css') ||
    normalized.includes('component')
  ) {
    return 'frontend';
  }
  if (
    normalized.includes('api') ||
    normalized.includes('backend') ||
    normalized.includes('백엔드') ||
    normalized.includes('database') ||
    normalized.includes('기능')
  ) {
    return 'backend';
  }
  return 'lead';
}

function toIsoFromUnixSeconds(ts) {
  const num = Number(ts);
  if (!Number.isFinite(num)) return new Date().toISOString();
  return new Date(num * 1000).toISOString();
}

async function readDelta(filePath) {
  const cursor = getCursor(filePath);
  const fileStat = await stat(filePath);

  if (fileStat.size < cursor.offset) {
    cursor.offset = 0;
    cursor.partial = '';
  }

  if (fileStat.size === cursor.offset) {
    return [];
  }

  let start = cursor.offset;
  let dropped = false;

  if (fileStat.size - cursor.offset > MAX_READ_BYTES) {
    start = fileStat.size - MAX_READ_BYTES;
    dropped = true;
  }

  const fh = await open(filePath, 'r');
  try {
    const length = fileStat.size - start;
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, start);
    cursor.offset = fileStat.size;

    const text = cursor.partial + buf.toString('utf8');
    const lines = text.split('\n');
    cursor.partial = lines.pop() || '';

    if (dropped) {
      lines.unshift(
        JSON.stringify({
          synthetic: true,
          kind: 'collector_warning',
          message: `collector skipped old bytes for ${filePath}`
        })
      );
    }

    return lines.filter(Boolean);
  } finally {
    await fh.close();
  }
}

function historyToEvent(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }

  if (parsed.synthetic) {
    return {
      agentId: 'lead',
      event: 'collector_warning',
      status: 'warning',
      message: parsed.message,
      metadata: { source: 'history', kind: parsed.kind }
    };
  }

  if (!parsed.text) return null;

  const text = String(parsed.text);
  return {
    agentId: detectRole(text),
    event: 'user_request',
    status: 'ok',
    message: text.slice(0, 120),
    timestamp: toIsoFromUnixSeconds(parsed.ts),
    metadata: {
      source: 'codex_history',
      sessionId: parsed.session_id || null,
      textLength: text.length
    }
  };
}

function parseLogTimestamp(line) {
  const match = line.match(/^(\d{4}-\d{2}-\d{2}T[^\s]+)/);
  if (!match) return new Date().toISOString();
  const dt = new Date(match[1]);
  return Number.isNaN(dt.valueOf()) ? new Date().toISOString() : dt.toISOString();
}

function logToEvent(line) {
  if (line.includes('task_started')) {
    return {
      agentId: 'lead',
      event: 'task_started',
      status: 'ok',
      timestamp: parseLogTimestamp(line),
      message: 'Codex task started',
      metadata: { source: 'codex_log' }
    };
  }

  if (line.includes('task_complete')) {
    return {
      agentId: 'lead',
      event: 'task_complete',
      status: 'ok',
      timestamp: parseLogTimestamp(line),
      message: 'Codex task completed',
      metadata: { source: 'codex_log' }
    };
  }

  if (line.includes('ToolCall:')) {
    const toolCall = line.match(/ToolCall:\s+([^\s]+)\s+(\{.*\})/);
    const tool = toolCall?.[1] || 'unknown_tool';
    let args = '';

    if (toolCall?.[2]) {
      try {
        const parsedArgs = JSON.parse(toolCall[2]);
        args = JSON.stringify(parsedArgs);
      } catch {
        args = toolCall[2];
      }
    }

    return {
      agentId: detectRole(args),
      event: 'tool_call',
      status: 'ok',
      timestamp: parseLogTimestamp(line),
      message: tool,
      metadata: { source: 'codex_log', args: args.slice(0, 180) }
    };
  }

  if (line.includes('needs_follow_up=true')) {
    return {
      agentId: 'lead',
      event: 'follow_up_required',
      status: 'warning',
      timestamp: parseLogTimestamp(line),
      message: 'needs_follow_up=true',
      metadata: { source: 'codex_log' }
    };
  }

  if (line.includes(' ERROR ') || line.includes('error=')) {
    return {
      agentId: 'backend',
      event: 'runtime_error',
      status: 'error',
      timestamp: parseLogTimestamp(line),
      message: line.slice(0, 120),
      metadata: { source: 'codex_log' }
    };
  }

  return null;
}

async function initializeCursorAtEnd(filePath) {
  const fileStat = await stat(filePath);
  cursors.set(filePath, { offset: fileStat.size, partial: '' });
}

async function readTailLines(filePath, limit) {
  const fileStat = await stat(filePath);
  const start = Math.max(0, fileStat.size - MAX_READ_BYTES);
  const fh = await open(filePath, 'r');
  try {
    const length = fileStat.size - start;
    if (length <= 0) return [];
    const buf = Buffer.alloc(length);
    await fh.read(buf, 0, length, start);
    return buf
      .toString('utf8')
      .split('\n')
      .filter(Boolean)
      .slice(-limit);
  } finally {
    await fh.close();
  }
}

async function emitBackfill(filePath, transform, limit) {
  const lines = await readTailLines(filePath, limit);
  for (const line of lines) {
    const evt = transform(line);
    if (!evt) continue;
    try {
      await postEvent(evt);
    } catch (err) {
      console.error(`[collector] backfill send failed: ${err.message}`);
    }
  }
}

async function pollFile(filePath, transform) {
  let lines;
  try {
    lines = await readDelta(filePath);
  } catch (err) {
    const errorMessage = String(err.message || err);
    await postEvent({
      agentId: 'backend',
      event: 'collector_error',
      status: 'error',
      message: `${filePath}: ${errorMessage}`,
      metadata: { source: 'collector' }
    });
    return;
  }

  for (const line of lines) {
    const evt = transform(line);
    if (!evt) continue;
    try {
      await postEvent(evt);
    } catch (err) {
      console.error(`[collector] failed to send event: ${err.message}`);
    }
  }
}

async function boot() {
  console.log('[collector] codex local collector booting');
  console.log(`[collector] monitor: ${MONITOR_URL}`);
  console.log(`[collector] history: ${HISTORY_FILE}`);
  console.log(`[collector] log: ${LOG_FILE}`);
  console.log(`[collector] backfill lines: ${BACKFILL_LINES}`);

  if (BACKFILL_LINES > 0) {
    await emitBackfill(HISTORY_FILE, historyToEvent, BACKFILL_LINES);
    await emitBackfill(LOG_FILE, logToEvent, BACKFILL_LINES);
  }

  await initializeCursorAtEnd(HISTORY_FILE);
  await initializeCursorAtEnd(LOG_FILE);

  setInterval(() => {
    pollFile(HISTORY_FILE, historyToEvent).catch((err) => {
      console.error(`[collector] history poll error: ${err.message}`);
    });

    pollFile(LOG_FILE, logToEvent).catch((err) => {
      console.error(`[collector] log poll error: ${err.message}`);
    });
  }, POLL_MS);
}

boot().catch((err) => {
  console.error(`[collector] boot failed: ${err.message}`);
  process.exit(1);
});
