import { recalcWorkflow, splitWorkflow } from './lib/workflow.js';
import { buildCardData } from './lib/cards.js';
import { sumByRange, rangeLabel } from './lib/time-range.js';
import { escapeHtml, statusPill, getActivityStatus, activityDotHtml, countActiveAgents } from './lib/utils.js';
import { applyIncrementalEvent } from './lib/state.js';
import { saveFilters, loadFilters, saveToggle, loadToggle } from './lib/persistence.js';
import { connectStream, loadSnapshot } from './lib/connection.js';
import { annotateSessionsWithState } from './lib/session-status.js';
import { renderGraphs } from './lib/renders/charts.js';
import { getFilteredEvents, renderEventMeta, renderEvents } from './lib/renders/events.js';
import { renderAgents, populateAgentFilter } from './lib/renders/agents.js';
import { renderAlerts } from './lib/renders/alerts.js';
import { renderTimeline } from './lib/renders/timeline.js';
import { renderSessionsList, renderSessionDetail, fetchSessionEvents } from './lib/renders/sessions.js';

const cardsRoot = document.getElementById('cards');
const workflowRoot = document.getElementById('workflow');
const agentsBody = document.getElementById('agentsBody');
const eventsRoot = document.getElementById('events');
const alertsRoot = document.getElementById('alerts');
const alertDrilldownRoot = document.getElementById('alertDrilldown');
const clock = document.getElementById('clock');
const connectionEl = document.getElementById('connection');
const connectionMetaEl = document.getElementById('connectionMeta');
const agentFilter = document.getElementById('agentFilter');
const eventStatusFilter = document.getElementById('eventStatusFilter');
const eventLimit = document.getElementById('eventLimit');
const eventSearch = document.getElementById('eventSearch');
const eventMetaEl = document.getElementById('eventMeta');
const timelineRoot = document.getElementById('timeline');
const timelineTooltip = document.getElementById('timelineTooltip');

const sessionsListRoot = document.getElementById('sessionsList');
const sessionDetailRoot = document.getElementById('sessionDetail');
const sessionDetailBack = document.getElementById('sessionDetailBack');
const sessionDetailTitle = document.getElementById('sessionDetailTitle');
const sessionDetailEvents = document.getElementById('sessionDetailEvents');

const chartEls = {
  throughputChart: document.getElementById('throughputChart'),
  throughputTooltip: document.getElementById('throughputTooltip'),
  tokenTrendChart: document.getElementById('tokenTrendChart'),
  tokenTrendLegend: document.getElementById('tokenTrendLegend'),
  toolCallChart: document.getElementById('toolCallChart'),
  toolCallTooltip: document.getElementById('toolCallTooltip')
};

const workflowToggle = document.getElementById('workflowToggle');
const workflowCompletedRoot = document.getElementById('workflowCompleted');

const timeRangeBar = document.getElementById('timeRangeBar');

const numberFmt = new Intl.NumberFormat('ko-KR');
let snapshotState = null;
let renderQueued = false;
const RANGE_KEY = 'agent_monitor_range_v1';
let currentRange = localStorage.getItem(RANGE_KEY) || '1h';
const storageKey = 'agent_monitor_event_filters_v1';
const WORKFLOW_TOGGLE_KEY = 'agent_monitor_workflow_toggle_v1';
let showCompleted = loadToggle(WORKFLOW_TOGGLE_KEY);

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

function renderCards(totals, agents = [], buckets = [], startedAt = '') {
  const activeAgents = countActiveAgents(agents);
  const rangeResult = sumByRange(buckets, currentRange, Date.now());
  let rangeInfo = null;
  if (rangeResult) {
    rangeInfo = { label: rangeLabel(currentRange, startedAt), ...rangeResult };
  } else if (currentRange === 'all') {
    rangeInfo = { label: rangeLabel('all', startedAt), tokenTotal: totals.tokenTotal || 0, costUsd: totals.costTotalUsd || 0 };
  }
  const cards = buildCardData(totals, numberFmt, activeAgents, rangeInfo);
  cardsRoot.innerHTML = cards
    .map(
      (c) =>
        `<article class="card card--${c.type}"><div class="label">${escapeHtml(c.label)}</div><div class="value">${escapeHtml(c.value)}</div></article>`
    )
    .join('');
}

function renderWorkflowItem(row, now) {
  return `<article class="workflow-item">
    <div>${activityDotHtml(getActivityStatus(row.lastSeen, now))}<strong>${escapeHtml(row.displayName || row.roleId)}</strong></div>
    <div>${statusPill(row.status)}</div>
    <div>events: ${Number(row.total) || 0}</div>
    <div>last: ${escapeHtml(row.lastEvent)}</div>
  </article>`;
}

function renderWorkflow(rows = []) {
  const now = Date.now();
  const { active, completed } = splitWorkflow(rows);

  workflowRoot.innerHTML = active.length > 0
    ? active.map((row) => renderWorkflowItem(row, now)).join('')
    : '<p class="workflow-empty">활성 세션 없음</p>';

  workflowToggle.textContent = `완료된 세션 (${completed.length})`;
  workflowToggle.classList.toggle('active', showCompleted);
  workflowCompletedRoot.classList.toggle('open', showCompleted);
  workflowCompletedRoot.innerHTML = completed.map((row) => renderWorkflowItem(row, now)).join('');
}

function getFilters() {
  return { status: eventStatusFilter.value, limit: Number(eventLimit.value) || 50, query: eventSearch.value };
}

function renderSnapshot(snapshot) {
  snapshotState = snapshot;
  const sessionRows = annotateSessionsWithState(snapshot.sessions || [], snapshot.agents || []);
  renderCards(snapshot.totals, snapshot.agents || [], snapshot.hourlyBuckets || [], snapshot.startedAt || '');
  populateAgentFilter(snapshot.agents || [], agentFilter);
  renderWorkflow(snapshot.workflowProgress || recalcWorkflow(snapshot.agents));
  renderAgents(snapshot.agents || [], agentsBody, agentFilter.value);
  const allEvents = snapshot.recent || [];
  renderGraphs(allEvents, chartEls, numberFmt, snapshot.toolCallStats);
  renderTimeline(allEvents, timelineRoot, timelineTooltip, agentFilter.value);
  const filteredEvents = getFilteredEvents(allEvents, getFilters());
  renderEvents(filteredEvents, eventsRoot);
  renderEventMeta(allEvents.length, filteredEvents.length, eventMetaEl);
  renderAlerts(snapshot.alerts || [], alertsRoot, alertDrilldownRoot, snapshot);
  if (!sessionDetailRoot.hidden) {
    // keep detail view open; don't overwrite
  } else {
    renderSessionsList(sessionRows, sessionsListRoot, openSessionDetail);
  }
  clock.textContent = `마지막 갱신 ${new Date(snapshot.generatedAt).toLocaleTimeString()}`;
}

function doSaveFilters() {
  saveFilters(storageKey, { status: eventStatusFilter.value, limit: eventLimit.value, search: eventSearch.value });
}

function applyLoadedFilters() {
  const filters = loadFilters(storageKey);
  if (!filters) return;
  if (filters.status) eventStatusFilter.value = filters.status;
  if (filters.limit) eventLimit.value = filters.limit;
  if (typeof filters.search === 'string') eventSearch.value = filters.search;
}

function refilterEvents() {
  if (!snapshotState) return;
  const allEvents = snapshotState.recent || [];
  const filtered = getFilteredEvents(allEvents, getFilters());
  renderEvents(filtered, eventsRoot);
  renderEventMeta(allEvents.length, filtered.length, eventMetaEl);
}

function openSessionDetail(sessionId) {
  sessionsListRoot.hidden = true;
  sessionDetailRoot.hidden = false;
  sessionDetailTitle.textContent = sessionId;
  sessionDetailEvents.innerHTML = '<p>로딩 중...</p>';
  fetchSessionEvents(sessionId).then((events) => {
    renderSessionDetail(events, sessionDetailEvents);
  }).catch(() => {
    sessionDetailEvents.innerHTML = '<p>이벤트를 불러올 수 없습니다.</p>';
  });
}

sessionDetailBack.addEventListener('click', () => {
  sessionDetailRoot.hidden = true;
  sessionsListRoot.hidden = false;
  if (snapshotState) {
    renderSessionsList(
      annotateSessionsWithState(snapshotState.sessions || [], snapshotState.agents || []),
      sessionsListRoot,
      openSessionDetail
    );
  }
});

workflowToggle.addEventListener('click', () => {
  showCompleted = !showCompleted;
  saveToggle(WORKFLOW_TOGGLE_KEY, showCompleted);
  queueRender();
});

timeRangeBar.addEventListener('click', (e) => {
  const btn = e.target.closest('.range-btn');
  if (!btn) return;
  currentRange = btn.dataset.range;
  localStorage.setItem(RANGE_KEY, currentRange);
  for (const b of timeRangeBar.querySelectorAll('.range-btn')) {
    b.classList.toggle('active', b === btn);
  }
  queueRender();
});

agentFilter.addEventListener('change', () => {
  if (snapshotState) {
    renderAgents(snapshotState.agents || [], agentsBody, agentFilter.value);
    renderTimeline(snapshotState.recent || [], timelineRoot, timelineTooltip, agentFilter.value);
  }
});

for (const el of [eventStatusFilter, eventLimit]) {
  el.addEventListener('change', () => { doSaveFilters(); refilterEvents(); });
}

eventSearch.addEventListener('input', () => { doSaveFilters(); refilterEvents(); });

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (snapshotState) renderGraphs(snapshotState.recent || [], chartEls, numberFmt, snapshotState.toolCallStats);
});

applyLoadedFilters();

for (const b of timeRangeBar.querySelectorAll('.range-btn')) {
  b.classList.toggle('active', b.dataset.range === currentRange);
}

loadSnapshot()
  .then((snapshot) => renderSnapshot(snapshot))
  .catch(console.error);

connectStream({
  connectionEl,
  connectionMetaEl,
  onSnapshot(snapshot) { snapshotState = snapshot; queueRender(); },
  onEvent(evt) {
    if (snapshotState) { applyIncrementalEvent(snapshotState, evt); queueRender(); }
  },
  onFallback() { loadSnapshot().then((snapshot) => renderSnapshot(snapshot)).catch(console.error); }
});

setInterval(() => {
  if (!snapshotState || renderQueued) return;
  renderCards(snapshotState.totals, snapshotState.agents || [], snapshotState.hourlyBuckets || [], snapshotState.startedAt || '');
  renderWorkflow(snapshotState.workflowProgress || recalcWorkflow(snapshotState.agents));
  renderAgents(snapshotState.agents || [], agentsBody, agentFilter.value);
}, 1000);
