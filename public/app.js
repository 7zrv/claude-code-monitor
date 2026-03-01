import { recalcWorkflow } from './lib/workflow.js';

const cardsRoot = document.getElementById('cards');
const throughputChart = document.getElementById('throughputChart');
const throughputTooltip = document.getElementById('throughputTooltip');
const tokenTrendChart = document.getElementById('tokenTrendChart');
const tokenTrendLegend = document.getElementById('tokenTrendLegend');
const workflowRoot = document.getElementById('workflow');
const sourcesRoot = document.getElementById('sources');
const agentsBody = document.getElementById('agentsBody');
const eventsRoot = document.getElementById('events');
const alertsRoot = document.getElementById('alerts');
const clock = document.getElementById('clock');
const connection = document.getElementById('connection');
const agentFilter = document.getElementById('agentFilter');
const eventStatusFilter = document.getElementById('eventStatusFilter');
const eventLimit = document.getElementById('eventLimit');
const eventSearch = document.getElementById('eventSearch');
const eventMeta = document.getElementById('eventMeta');

const numberFmt = new Intl.NumberFormat('ko-KR');
let snapshotState = null;
let streamRef = null;
let renderQueued = false;
const storageKey = 'agent_monitor_event_filters_v1';
let pollTimer = null;

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function setConnectionStatus(status) {
  connection.dataset.status = status;
  connection.textContent = status;
}

function queueRender() {
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    if (snapshotState) {
      renderSnapshot(snapshotState);
    }
  });
}

function startPolling() {
  if (pollTimer) return;
  pollTimer = setInterval(() => loadSnapshot().catch(console.error), 10000);
}

function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

function renderCards(totals) {
  const cards = [
    ['Agents', totals.agents],
    ['Total Events', totals.total],
    ['Total Tokens', totals.tokenTotal || 0],
    ['OK', totals.ok],
    ['Warning', totals.warning],
    ['Error', totals.error]
  ];

  cardsRoot.innerHTML = cards
    .map(
      ([label, value]) =>
        `<article class="card"><div class="label">${label}</div><div class="value">${numberFmt.format(value || 0)}</div></article>`
    )
    .join('');
}

function statusPill(status) {
  const safe = escapeHtml(status);
  return `<span class="status-pill" data-status="${safe}">${safe}</span>`;
}

function renderWorkflow(rows = []) {
  workflowRoot.innerHTML = rows
    .map(
      (row) => `
      <article class="workflow-item">
        <div><strong>${escapeHtml(row.roleId)}</strong></div>
        <div>${statusPill(row.status)}</div>
        <div>events: ${Number(row.total) || 0}</div>
        <div>last: ${escapeHtml(row.lastEvent)}</div>
      </article>
    `
    )
    .join('');
}

function renderSources(rows = []) {
  if (!rows.length) {
    sourcesRoot.innerHTML = '<article class="workflow-item"><div>No source data</div></article>';
    return;
  }

  sourcesRoot.innerHTML = rows
    .map(
      (row) => `
      <article class="workflow-item">
        <div><strong>${escapeHtml(row.source)}</strong></div>
        <div>total: ${Number(row.total) || 0}</div>
        <div>ok/warn/error: ${Number(row.ok) || 0}/${Number(row.warning) || 0}/${Number(row.error) || 0}</div>
        <div>last: ${new Date(row.lastSeen).toLocaleTimeString()}</div>
      </article>
    `
    )
    .join('');
}

function renderAgents(agents) {
  const filtered =
    agentFilter.value === 'all'
      ? agents
      : agents.filter((row) => row.agentId === agentFilter.value);

  agentsBody.innerHTML = filtered
    .map(
      (row) => `
      <tr>
        <td><span class="badge">${escapeHtml(row.agentId)}</span></td>
        <td>${new Date(row.lastSeen).toLocaleTimeString()}</td>
        <td>${Number(row.total) || 0}</td>
        <td>${Number(row.ok) || 0}</td>
        <td>${Number(row.warning) || 0}</td>
        <td>${Number(row.error) || 0}</td>
        <td>${numberFmt.format(row.tokenTotal || 0)}</td>
        <td>${escapeHtml(row.lastEvent)}</td>
        <td>${row.latencyMs == null ? '-' : `${row.latencyMs} ms`}</td>
      </tr>
    `
    )
    .join('');
}

function normalizeText(v) {
  return String(v || '').toLowerCase();
}

function getFilteredEvents(events = []) {
  const status = eventStatusFilter.value;
  const limit = Number(eventLimit.value) || 50;
  const query = normalizeText(eventSearch.value).trim();

  return events
    .filter((evt) => (status === 'all' ? true : evt.status === status))
    .filter((evt) => {
      if (!query) return true;
      return (
        normalizeText(evt.event).includes(query) ||
        normalizeText(evt.message).includes(query) ||
        normalizeText(evt.agentId).includes(query)
      );
    })
    .slice(0, limit);
}

function renderEventMeta(total, filtered) {
  eventMeta.textContent = `events: ${filtered}/${total}`;
}

function renderEvents(events) {
  eventsRoot.innerHTML = events
    .map(
      (evt) => `
      <div class="event">
        <span>${new Date(evt.receivedAt).toLocaleTimeString()}</span>
        <span><strong>${escapeHtml(evt.agentId)}</strong></span>
        <span>${escapeHtml(evt.event)}</span>
        <span>${escapeHtml(evt.message || '')}</span>
        ${statusPill(evt.status)}
      </div>
    `
    )
    .join('');
}

function renderAlerts(alerts = []) {
  if (!alerts.length) {
    alertsRoot.innerHTML = '<div class="event">No active alerts</div>';
    return;
  }

  alertsRoot.innerHTML = alerts
    .map(
      (alert) => `
      <div class="event">
        <span>${new Date(alert.createdAt).toLocaleTimeString()}</span>
        <span><strong>${escapeHtml(alert.agentId)}</strong></span>
        <span>${escapeHtml(alert.event)}</span>
        <span>${escapeHtml(alert.message)}</span>
        ${statusPill(alert.severity)}
      </div>
    `
    )
    .join('');
}

function buildMinuteBuckets(events = [], minutes = 30) {
  const now = Date.now();
  const buckets = Array.from({ length: minutes }, (_, idx) => {
    const ts = now - (minutes - idx - 1) * 60_000;
    return { ts, events: 0, tokensByAgent: {} };
  });

  for (const evt of events) {
    const t = new Date(evt.receivedAt || evt.timestamp).getTime();
    if (!Number.isFinite(t)) continue;
    const diffMin = Math.floor((now - t) / 60_000);
    if (diffMin < 0 || diffMin >= minutes) continue;
    const idx = minutes - diffMin - 1;
    const b = buckets[idx];
    b.events += 1;
    const tokenDelta = Number(evt.metadata?.tokenUsage?.totalTokens || 0);
    if (tokenDelta > 0) {
      const agent = evt.agentId || 'unknown';
      b.tokensByAgent[agent] = (b.tokensByAgent[agent] || 0) + tokenDelta;
    }
  }

  return buckets;
}

function renderThroughputChart(events = []) {
  const buckets = buildMinuteBuckets(events, 30);
  const max = Math.max(1, ...buckets.map((b) => b.events));
  const width = 640;
  const top = 20;
  const bottom = 190;
  const left = 36;
  const right = 620;
  const chartHeight = bottom - top;
  const slot = (right - left) / buckets.length;
  const midY = top + chartHeight / 2;

  const bars = buckets
    .map((b, idx) => {
      const barH = Math.max(1, (b.events / max) * chartHeight);
      const x = left + idx * slot + 1;
      const y = bottom - barH;
      const w = Math.max(1, slot - 2);
      const title = `${new Date(b.ts).toLocaleTimeString()} : ${b.events} events/min`;
      return `<rect class="throughput-bar" data-label="${escapeHtml(title)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${barH.toFixed(2)}" fill="rgb(226 109 92 / 70%)"></rect>`;
    })
    .join('');

  throughputChart.innerHTML = `
    <title>분당 이벤트 처리량 바 차트</title>
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="rgb(226 109 92 / 45%)" stroke-width="1" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="rgb(226 109 92 / 30%)" stroke-width="1" />
    <line x1="${left}" y1="${midY}" x2="${right}" y2="${midY}" stroke="rgb(226 109 92 / 15%)" stroke-width="1" stroke-dasharray="4 4" />
    ${bars}
    <text x="${left}" y="${top - 4}" font-size="10" fill="rgb(226 109 92 / 80%)">max ${max}</text>
    <text x="${left}" y="${midY - 4}" font-size="9" fill="rgb(226 109 92 / 55%)">${Math.round(max / 2)}</text>
    ${[25, 20, 15, 10, 5, 0]
      .map((minAgo) => {
        const idx = buckets.length - minAgo - 1;
        if (idx < 0 || idx >= buckets.length) return '';
        const x = left + idx * slot + slot / 2;
        const label = minAgo === 0 ? 'now' : `-${minAgo}m`;
        return `<text x="${x.toFixed(2)}" y="${bottom + 14}" font-size="9" text-anchor="middle" fill="rgb(226 109 92 / 60%)">${label}</text>`;
      })
      .join('')}
  `;

  throughputChart.querySelectorAll('.throughput-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', () => {
      throughputTooltip.hidden = false;
      throughputTooltip.textContent = bar.dataset.label || '';
    });
    bar.addEventListener('mouseleave', () => {
      throughputTooltip.hidden = true;
    });
    bar.addEventListener('mousemove', (e) => {
      const rect = throughputChart.getBoundingClientRect();
      const x = e.clientX - rect.left + 12;
      const y = e.clientY - rect.top - 8;
      throughputTooltip.style.left = `${Math.max(8, x)}px`;
      throughputTooltip.style.top = `${Math.max(8, y)}px`;
    });
  });
}

function pathForSeries(values, width, height, max) {
  if (!values.length) return '';
  return values
    .map((v, idx) => {
      const x = width.left + (idx / (values.length - 1 || 1)) * (width.right - width.left);
      const y = height.bottom - (v / max) * (height.bottom - height.top);
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

function renderTokenTrendChart(events = []) {
  const buckets = buildMinuteBuckets(events, 30);
  const agents = Array.from(
    new Set(
      buckets.flatMap((b) => Object.keys(b.tokensByAgent))
    )
  ).sort();

  if (!agents.length) {
    tokenTrendChart.innerHTML = `
      <title>에이전트별 분당 토큰 사용량 추이 차트</title>
      <line x1="36" y1="190" x2="620" y2="190" stroke="rgb(226 109 92 / 45%)" stroke-width="1" />
    `;
    tokenTrendLegend.innerHTML = '<span>No token data</span>';
    return;
  }

  const width = { left: 36, right: 620 };
  const height = { top: 20, bottom: 190 };
  const seriesByAgent = Object.fromEntries(
    agents.map((agent) => [
      agent,
      buckets.map((b) => Number(b.tokensByAgent[agent] || 0))
    ])
  );
  const max = Math.max(1, ...Object.values(seriesByAgent).flat());
  const midY = height.top + (height.bottom - height.top) / 2;
  const slotWidth = (width.right - width.left) / (buckets.length - 1 || 1);
  const dashPatterns = ['0', '6 3', '2 2', '10 4', '1 3'];
  const lineWidths = [2.6, 2.2, 2, 1.8, 1.6];

  const lineSvg = agents
    .map((agent, idx) => {
      const d = pathForSeries(seriesByAgent[agent], width, height, max);
      const dash = dashPatterns[idx % dashPatterns.length];
      const strokeWidth = lineWidths[idx % lineWidths.length];
      return `<path d="${d}" fill="none" stroke="rgb(226 109 92 / 82%)" stroke-width="${strokeWidth}" stroke-dasharray="${dash}" />`;
    })
    .join('');

  const endLabels = agents
    .map((agent, idx) => {
      const values = seriesByAgent[agent];
      const last = values[values.length - 1] || 0;
      const x = width.right - 2;
      const y = height.bottom - (last / max) * (height.bottom - height.top);
      return `<text x="${x}" y="${Math.max(height.top + 8, y - idx * 2).toFixed(2)}" text-anchor="end" font-size="10" fill="rgb(226 109 92 / 90%)">${escapeHtml(agent)}</text>`;
    })
    .join('');

  tokenTrendChart.innerHTML = `
    <title>에이전트별 분당 토큰 사용량 추이 차트</title>
    <line x1="${width.left}" y1="${height.bottom}" x2="${width.right}" y2="${height.bottom}" stroke="rgb(226 109 92 / 45%)" stroke-width="1" />
    <line x1="${width.left}" y1="${height.top}" x2="${width.left}" y2="${height.bottom}" stroke="rgb(226 109 92 / 30%)" stroke-width="1" />
    <line x1="${width.left}" y1="${midY}" x2="${width.right}" y2="${midY}" stroke="rgb(226 109 92 / 15%)" stroke-width="1" stroke-dasharray="4 4" />
    ${lineSvg}
    ${endLabels}
    <text x="${width.left}" y="${height.top - 4}" font-size="10" fill="rgb(226 109 92 / 80%)">max ${max}</text>
    <text x="${width.left}" y="${midY - 4}" font-size="9" fill="rgb(226 109 92 / 55%)">${Math.round(max / 2)}</text>
    ${[25, 20, 15, 10, 5, 0]
      .map((minAgo) => {
        const idx = buckets.length - minAgo - 1;
        if (idx < 0 || idx >= buckets.length) return '';
        const x = width.left + idx * slotWidth;
        const label = minAgo === 0 ? 'now' : `-${minAgo}m`;
        return `<text x="${x.toFixed(2)}" y="${height.bottom + 14}" font-size="9" text-anchor="middle" fill="rgb(226 109 92 / 60%)">${label}</text>`;
      })
      .join('')}
  `;

  tokenTrendLegend.innerHTML = agents
    .map((agent, idx) => {
      const dash = dashPatterns[idx % dashPatterns.length];
      const latest = seriesByAgent[agent][seriesByAgent[agent].length - 1] || 0;
      const strokeWidth = lineWidths[idx % lineWidths.length];
      return `
        <span class="legend-item" title="dash:${dash}">
          <svg class="legend-line" viewBox="0 0 22 8" preserveAspectRatio="none">
            <line x1="0" y1="4" x2="22" y2="4" stroke="rgb(226 109 92 / 90%)" stroke-width="${strokeWidth}" stroke-dasharray="${dash}" />
          </svg>
          <strong>${escapeHtml(agent)}</strong>
          <em>${numberFmt.format(latest)} tok/min</em>
        </span>
      `;
    })
    .join('');
}

function renderGraphs(events = []) {
  renderThroughputChart(events);
  renderTokenTrendChart(events);
}

function populateAgentFilter(agents = []) {
  const prev = agentFilter.value;
  const ids = agents.map((row) => row.agentId);
  agentFilter.querySelectorAll('option:not([value="all"])').forEach((o) => o.remove());
  for (const id of ids) {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = id;
    agentFilter.appendChild(opt);
  }
  if (ids.includes(prev) || prev === 'all') {
    agentFilter.value = prev;
  } else {
    agentFilter.value = 'all';
  }
}


function applyIncrementalEvent(evt) {
  if (!snapshotState) return;

  const totals = snapshotState.totals;
  totals.total += 1;
  const evtTokenTotal = evt.metadata?.tokenUsage?.totalTokens || 0;
  totals.tokenTotal = (totals.tokenTotal || 0) + evtTokenTotal;
  if (evt.status === 'error') totals.error += 1;
  else if (evt.status === 'warning') totals.warning += 1;
  else totals.ok += 1;

  const agents = snapshotState.agents;
  const agent = agents.find((row) => row.agentId === evt.agentId);
  if (!agent) {
    agents.push({
      agentId: evt.agentId,
      lastSeen: evt.receivedAt,
      total: 1,
      ok: evt.status === 'ok' ? 1 : 0,
      warning: evt.status === 'warning' ? 1 : 0,
      error: evt.status === 'error' ? 1 : 0,
      tokenTotal: evtTokenTotal,
      lastEvent: evt.event,
      latencyMs: evt.latencyMs ?? null
    });
    totals.agents = agents.length;
    populateAgentFilter(agents);
  } else {
    agent.lastSeen = evt.receivedAt;
    agent.total += 1;
    agent.lastEvent = evt.event;
    agent.latencyMs = evt.latencyMs ?? null;
    agent.tokenTotal = (agent.tokenTotal || 0) + evtTokenTotal;
    if (evt.status === 'error') agent.error += 1;
    else if (evt.status === 'warning') agent.warning += 1;
    else agent.ok += 1;
  }

  snapshotState.agents.sort((a, b) => a.agentId.localeCompare(b.agentId));

  const sourceName = evt.metadata?.source || 'manual';
  const source = snapshotState.sources.find((row) => row.source === sourceName);
  if (!source) {
    snapshotState.sources.push({
      source: sourceName,
      total: 1,
      ok: evt.status === 'ok' ? 1 : 0,
      warning: evt.status === 'warning' ? 1 : 0,
      error: evt.status === 'error' ? 1 : 0,
      lastSeen: evt.receivedAt
    });
  } else {
    source.total += 1;
    source.lastSeen = evt.receivedAt;
    if (evt.status === 'error') source.error += 1;
    else if (evt.status === 'warning') source.warning += 1;
    else source.ok += 1;
  }

  snapshotState.sources.sort((a, b) => a.source.localeCompare(b.source));

  snapshotState.recent.unshift(evt);
  snapshotState.recent = snapshotState.recent.slice(0, 200);

  if (evt.status === 'warning' || evt.status === 'error') {
    snapshotState.alerts.unshift({
      id: `inline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity: evt.status,
      agentId: evt.agentId,
      event: evt.event,
      message: evt.message || 'No message',
      createdAt: evt.receivedAt
    });
    snapshotState.alerts = snapshotState.alerts.slice(0, 20);
  }

  snapshotState.workflowProgress = recalcWorkflow(snapshotState.agents);
  snapshotState.generatedAt = new Date().toISOString();
}

function renderSnapshot(snapshot) {
  snapshotState = snapshot;
  renderCards(snapshot.totals);
  populateAgentFilter(snapshot.agents || []);
  renderWorkflow(snapshot.workflowProgress || recalcWorkflow(snapshot.agents));
  renderSources(snapshot.sources || []);
  renderAgents(snapshot.agents || []);
  const allEvents = snapshot.recent || [];
  renderGraphs(allEvents);
  const filteredEvents = getFilteredEvents(allEvents);
  renderEvents(filteredEvents);
  renderEventMeta(allEvents.length, filteredEvents.length);
  renderAlerts(snapshot.alerts || []);
  clock.textContent = `Last refresh: ${new Date(snapshot.generatedAt).toLocaleTimeString()}`;
}

async function loadSnapshot() {
  const res = await fetch('/api/events');
  const snapshot = await res.json();
  renderSnapshot(snapshot);
}

function connectStream() {
  if (streamRef) {
    streamRef.close();
  }

  setConnectionStatus('reconnecting');
  startPolling();
  const es = new EventSource('/api/stream');
  streamRef = es;

  es.onopen = () => {
    setConnectionStatus('connected');
    stopPolling();
  };

  es.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data);
      if (parsed.type === 'snapshot' && parsed.payload) {
        snapshotState = parsed.payload;
        queueRender();
        return;
      }
      if (parsed.type === 'event' && parsed.payload) {
        applyIncrementalEvent(parsed.payload);
        queueRender();
        return;
      }
    } catch {
      // fallback below
    }
    loadSnapshot().catch(console.error);
  };

  es.onerror = () => {
    setConnectionStatus('offline');
    startPolling();
    es.close();
    setTimeout(connectStream, 1500);
  };
}

function saveFilters() {
  const payload = {
    status: eventStatusFilter.value,
    limit: eventLimit.value,
    search: eventSearch.value
  };
  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function loadFilters() {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed.status) eventStatusFilter.value = parsed.status;
    if (parsed.limit) eventLimit.value = parsed.limit;
    if (typeof parsed.search === 'string') eventSearch.value = parsed.search;
  } catch {
    // ignore broken local storage
  }
}

agentFilter.addEventListener('change', () => {
  if (snapshotState) {
    renderAgents(snapshotState.agents || []);
  }
});

for (const el of [eventStatusFilter, eventLimit]) {
  el.addEventListener('change', () => {
    saveFilters();
    if (snapshotState) {
      const allEvents = snapshotState.recent || [];
      const filtered = getFilteredEvents(allEvents);
      renderEvents(filtered);
      renderEventMeta(allEvents.length, filtered.length);
    }
  });
}

eventSearch.addEventListener('input', () => {
  saveFilters();
  if (snapshotState) {
    const allEvents = snapshotState.recent || [];
    const filtered = getFilteredEvents(allEvents);
    renderEvents(filtered);
    renderEventMeta(allEvents.length, filtered.length);
  }
});

loadFilters();
loadSnapshot().catch(console.error);
connectStream();
