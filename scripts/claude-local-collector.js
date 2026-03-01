import { stat, open, readdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MONITOR_URL = process.env.MONITOR_URL || 'http://localhost:5050/api/events';
const POLL_MS = Math.max(100, Number(process.env.CLAUDE_POLL_MS) || 2500);
const MAX_READ_BYTES = 512 * 1024;
const BACKFILL_LINES = process.env.CLAUDE_BACKFILL_LINES !== undefined
  ? Math.max(0, Number(process.env.CLAUDE_BACKFILL_LINES) || 0)
  : 25;

const CLAUDE_HOME = process.env.CLAUDE_HOME || join(homedir(), '.claude');
const HISTORY_FILE = join(CLAUDE_HOME, 'history.jsonl');
const PROJECTS_DIR = join(CLAUDE_HOME, 'projects');
const STATS_CACHE = join(CLAUDE_HOME, 'stats-cache.json');

const cursors = new Map();
let statsCacheMtime = null;

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
    cursor.partial = '';
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
      metadata: { source: 'claude_history', kind: parsed.kind }
    };
  }

  if (!parsed.display) return null;

  const text = String(parsed.display);
  return {
    agentId: 'lead',
    event: 'user_request',
    status: 'ok',
    message: text.slice(0, 120),
    timestamp: parsed.timestamp || new Date().toISOString(),
    metadata: {
      source: 'claude_history',
      sessionId: parsed.sessionId || null,
      textLength: text.length
    }
  };
}

function sessionLineToEvent(line) {
  let parsed;
  try {
    parsed = JSON.parse(line);
  } catch {
    return [];
  }

  const msgType = parsed.type || '';
  const sessionId = parsed.sessionId || '';
  const timestamp = parsed.timestamp || new Date().toISOString();

  if (msgType === 'user') {
    const raw = parsed.message?.content;
    if (!raw) return [];

    const content = Array.isArray(raw)
      ? raw.map((c) => c.text || c.content || '').join(' ').trim()
      : String(raw);
    if (!content) return [];

    return [
      {
        agentId: 'lead',
        event: 'user_message',
        status: 'ok',
        message: content.slice(0, 120),
        timestamp,
        metadata: {
          source: 'claude_session',
          sessionId
        }
      }
    ];
  }

  if (msgType === 'assistant') {
    const events = [];
    const message = parsed.message || {};
    const model = message.model || '';
    const contentArr = Array.isArray(message.content) ? message.content : [];

    for (const item of contentArr) {
      const itemType = item.type || '';

      if (itemType === 'text' && item.text) {
        events.push({
          agentId: 'lead',
          event: 'assistant_message',
          status: 'ok',
          message: String(item.text).slice(0, 120),
          timestamp,
          metadata: {
            source: 'claude_session',
            sessionId,
            model
          }
        });
      }

      if (itemType === 'tool_use') {
        const inputStr = JSON.stringify(item.input || {});
        events.push({
          agentId: 'lead',
          event: 'tool_call',
          status: 'ok',
          message: item.name || 'unknown_tool',
          timestamp,
          metadata: {
            source: 'claude_session',
            sessionId,
            model,
            toolInput: inputStr.length > 512 ? { _truncated: true } : (item.input || {})
          }
        });
      }

      if (itemType && itemType !== 'text' && itemType !== 'tool_use' && itemType !== 'tool_result') {
        console.debug(`[collector] unhandled content type: ${itemType}`);
      }
    }

    const usage = message.usage;
    if (usage) {
      const inputTokens = usage.input_tokens || 0;
      const outputTokens = usage.output_tokens || 0;
      const cacheRead = usage.cache_read_input_tokens || 0;
      const total = inputTokens + outputTokens;

      if (total > 0) {
        events.push({
          agentId: 'lead',
          event: 'token_usage',
          status: 'ok',
          message: `tokens +${total}`,
          timestamp,
          metadata: {
            source: 'claude_session',
            sessionId,
            model,
            tokenUsage: {
              inputTokens,
              outputTokens,
              cacheReadInputTokens: cacheRead,
              totalTokens: total
            }
          }
        });
      }
    }

    return events;
  }

  return [];
}

async function walkJsonlFiles(dir) {
  const result = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return result;
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const subDir = join(dir, entry.name);
    let subEntries;
    try {
      subEntries = await readdir(subDir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const subEntry of subEntries) {
      if (subEntry.isFile() && subEntry.name.endsWith('.jsonl')) {
        result.push(join(subDir, subEntry.name));
      }
    }
  }

  return result;
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

async function pollHistory() {
  let lines;
  try {
    lines = await readDelta(HISTORY_FILE);
  } catch (err) {
    const errorMessage = String(err.message || err);
    try {
      await postEvent({
        agentId: 'lead',
        event: 'collector_error',
        status: 'error',
        message: `${HISTORY_FILE}: ${errorMessage}`,
        metadata: { source: 'collector' }
      });
    } catch {
      console.error(`[collector] collector_error send failed: ${errorMessage}`);
    }
    return;
  }

  for (const line of lines) {
    const evt = historyToEvent(line);
    if (!evt) continue;
    try {
      await postEvent(evt);
    } catch (err) {
      console.error(`[collector] failed to send event: ${err.message}`);
    }
  }
}

async function pollSessionFiles() {
  const files = await walkJsonlFiles(PROJECTS_DIR);

  const activeFiles = new Set(files);
  for (const key of cursors.keys()) {
    if (key !== HISTORY_FILE && !activeFiles.has(key)) {
      cursors.delete(key);
    }
  }

  await Promise.all(files.map(async (filePath) => {
    let lines;
    try {
      lines = await readDelta(filePath);
    } catch (err) {
      console.warn(`[collector] session file read failed: ${filePath}: ${err.message}`);
      return;
    }

    for (const line of lines) {
      const events = sessionLineToEvent(line);
      for (const evt of events) {
        try {
          await postEvent(evt);
        } catch (err) {
          console.error(`[collector] failed to send session event: ${err.message}`);
        }
      }
    }
  }));
}

async function pollStatsCache() {
  let fileStat;
  try {
    fileStat = await stat(STATS_CACHE);
  } catch {
    return;
  }

  const mtime = fileStat.mtimeMs;
  if (statsCacheMtime === mtime) return;
  statsCacheMtime = mtime;

  try {
    const content = await readFile(STATS_CACHE, 'utf8');
    if (content.length > 512 * 1024) {
      console.warn(`[collector] stats cache too large (${content.length} bytes), skipping`);
      return;
    }
    const stats = JSON.parse(content);
    await postEvent({
      agentId: 'lead',
      event: 'cost_update',
      status: 'ok',
      message: 'stats cache updated',
      metadata: {
        source: 'claude_session',
        stats
      }
    });
  } catch (err) {
    console.error(`[collector] stats cache read failed: ${err.message}`);
  }
}

async function boot() {
  console.log('[collector] claude local collector booting');
  console.log(`[collector] monitor: ${MONITOR_URL}`);
  console.log(`[collector] history: ${HISTORY_FILE}`);
  console.log(`[collector] projects: ${PROJECTS_DIR}`);
  console.log(`[collector] stats cache: ${STATS_CACHE}`);
  console.log(`[collector] backfill lines: ${BACKFILL_LINES}`);

  if (BACKFILL_LINES > 0) {
    try {
      await emitBackfill(HISTORY_FILE, historyToEvent, BACKFILL_LINES);
    } catch (err) {
      console.warn(`[collector] history backfill skipped: ${err.message}`);
    }
  }

  try {
    await initializeCursorAtEnd(HISTORY_FILE);
  } catch (err) {
    console.warn(`[collector] history file not found, will retry on poll: ${err.message}`);
  }

  const sessionFiles = await walkJsonlFiles(PROJECTS_DIR);
  for (const filePath of sessionFiles) {
    try {
      await initializeCursorAtEnd(filePath);
    } catch {
      // file may have been removed between walk and init
    }
  }

  setInterval(() => {
    pollHistory().catch((err) => {
      console.error(`[collector] history poll error: ${err.message}`);
    });

    pollSessionFiles().catch((err) => {
      console.error(`[collector] session poll error: ${err.message}`);
    });

    pollStatsCache().catch((err) => {
      console.error(`[collector] stats cache poll error: ${err.message}`);
    });
  }, POLL_MS);
}

export { historyToEvent, sessionLineToEvent, walkJsonlFiles, readDelta, getCursor, cursors };

const isMain = process.argv[1] === fileURLToPath(import.meta.url);
if (isMain) {
  boot().catch((err) => {
    console.error(`[collector] boot failed: ${err.message}`);
    process.exit(1);
  });
}
