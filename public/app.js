import { recalcWorkflow, splitWorkflow } from './lib/workflow.js';
import { buildCardData } from './lib/cards.js';
import { sumByRange, rangeLabel } from './lib/time-range.js';
import { escapeHtml, statusPill, getActivityStatus, activityDotHtml } from './lib/utils.js';
import { applyIncrementalEvent } from './lib/state.js';
import { ALERT_RULES_STORAGE_KEY } from './lib/alert-rules.js';
import { saveFilters, loadFilters, saveToggle, loadToggle, loadAlertRules, saveAlertRules, resetAlertRules } from './lib/persistence.js';
import { connectStream, loadSnapshot } from './lib/connection.js';
import { annotateSessionsWithState } from './lib/session-status.js';
import { mergeAlertsForPanel } from './lib/derived-alerts.js';
import { renderNeedsAttention } from './lib/needs-attention.js';
import { renderAlertRules } from './lib/renders/alert-rules.js';
import { renderGraphs } from './lib/renders/charts.js';
import { getFilteredEvents, renderEventMeta, renderEvents } from './lib/renders/events.js';
import { renderAgents, populateAgentFilter, toggleAgentTreeNode } from './lib/renders/agents.js';
import { renderAlerts } from './lib/renders/alerts.js';
import { renderTimeline } from './lib/renders/timeline.js';
import {
  renderSessionsList,
  renderSessionDetail,
  renderSessionDetailMeta,
  fetchSessionEvents,
  getSessionExportAttrs,
  selectSessionsForList
} from './lib/renders/sessions.js';
import { isEmptySnapshot, renderEmptyState } from './lib/empty-state.js';

const cardsRoot = document.getElementById('cards');
const workflowRoot = document.getElementById('workflow');
const agentsBody = document.getElementById('agentsBody');
const eventsRoot = document.getElementById('events');
const alertsRoot = document.getElementById('alerts');
const alertDrilldownRoot = document.getElementById('alertDrilldown');
const alertRulesRoot = document.getElementById('alertRules');
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
const sessionDetailMeta = document.getElementById('sessionDetailMeta');
const sessionDetailExport = document.getElementById('sessionDetailExport');
const sessionDetailEvents = document.getElementById('sessionDetailEvents');
const sessionQuickFilter = document.getElementById('sessionQuickFilter');
const sessionSearch = document.getElementById('sessionSearch');
const sessionMetaEl = document.getElementById('sessionMeta');

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

const emptyStateEl = document.getElementById('emptyState');
const timeRangeBar = document.getElementById('timeRangeBar');
const needsAttentionRoot = document.getElementById('needsAttention');

const numberFmt = new Intl.NumberFormat('ko-KR');
let snapshotState = null;
let renderQueued = false;
const RANGE_KEY = 'agent_monitor_range_v1';
let currentRange = localStorage.getItem(RANGE_KEY) || '1h';
const EVENT_FILTERS_KEY = 'agent_monitor_event_filters_v1';
const SESSION_FILTERS_KEY = 'agent_monitor_session_filters_v1';
const WORKFLOW_TOGGLE_KEY = 'agent_monitor_workflow_toggle_v1';
let showCompleted = loadToggle(WORKFLOW_TOGGLE_KEY);
let selectedSessionId = '';
const sessionEventsCache = new Map();
let sessionDetailState = { sessionId: '', loading: false, error: false };
let alertRules = loadAlertRules(ALERT_RULES_STORAGE_KEY);

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

function renderCards(totals, sessionRows = [], buckets = [], startedAt = '') {
  const rangeResult = sumByRange(buckets, currentRange, Date.now());
  let rangeInfo = null;
  if (rangeResult) {
    rangeInfo = { label: rangeLabel(currentRange, startedAt), ...rangeResult };
  } else if (currentRange === 'all') {
    rangeInfo = { label: rangeLabel('all', startedAt), tokenTotal: totals.tokenTotal || 0, costUsd: totals.costTotalUsd || 0 };
  }
  const cards = buildCardData(sessionRows, totals, numberFmt, rangeInfo);
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

function getEventFilters() {
  return { status: eventStatusFilter.value, limit: Number(eventLimit.value) || 50, query: eventSearch.value };
}

function getSessionFilters() {
  return { quickFilter: sessionQuickFilter.value, query: sessionSearch.value };
}

function getVisibleSessionRows(sessionRows = []) {
  return selectSessionsForList(sessionRows, getSessionFilters());
}

function renderSessionMeta(totalCount, visibleCount) {
  if (totalCount === 0) {
    sessionMetaEl.hidden = true;
    sessionMetaEl.textContent = '';
    return;
  }

  const filters = getSessionFilters();
  const hasFilters = filters.quickFilter !== 'all' || filters.query.trim().length > 0;
  sessionMetaEl.hidden = false;
  sessionMetaEl.textContent = hasFilters ? `${visibleCount} / ${totalCount} sessions` : `${totalCount} sessions`;
}

function renderSessionListPanel(sessionRows = []) {
  const visibleRows = getVisibleSessionRows(sessionRows);
  renderSessionMeta(sessionRows.length, visibleRows.length);
  renderSessionsList(visibleRows, sessionsListRoot, openSessionDetail, {
    selectedSessionId,
    sourceCount: sessionRows.length
  });
  return visibleRows;
}

function renderSnapshot(snapshot) {
  snapshotState = snapshot;
  const empty = isEmptySnapshot(snapshot);
  if (emptyStateEl) {
    emptyStateEl.hidden = !empty;
    if (empty) renderEmptyState(emptyStateEl);
  }
  const sessionRows = annotateSessionsWithState(snapshot.sessions || [], snapshot.agents || [], Date.now(), alertRules);
  const visibleSessionRows = getVisibleSessionRows(sessionRows);
  const selectedSession = resolveSelectedSession(sessionRows, visibleSessionRows);
  const alerts = mergeAlertsForPanel(snapshot.alerts || [], sessionRows, { generatedAt: snapshot.generatedAt });
  const alertSnapshot = { ...snapshot, sessions: sessionRows };
  renderCards(snapshot.totals, sessionRows, snapshot.hourlyBuckets || [], snapshot.startedAt || '');
  renderNeedsAttention(sessionRows, needsAttentionRoot, openSessionDetail);
  populateAgentFilter(snapshot.agents || [], agentFilter);
  renderWorkflow(snapshot.workflowProgress || recalcWorkflow(snapshot.agents));
  renderAgents(snapshot.agents || [], agentsBody, agentFilter.value);
  const allEvents = snapshot.recent || [];
  renderGraphs(allEvents, chartEls, numberFmt, snapshot.toolCallStats);
  renderTimeline(allEvents, timelineRoot, timelineTooltip, agentFilter.value);
  const filteredEvents = getFilteredEvents(allEvents, getEventFilters());
  renderEvents(filteredEvents, eventsRoot);
  renderEventMeta(allEvents.length, filteredEvents.length, eventMetaEl);
  renderAlerts(alerts, alertsRoot, alertDrilldownRoot, alertSnapshot, { onOpenSession: openSessionDetail });
  renderSessionListPanel(sessionRows);
  if (selectedSession && !sessionEventsCache.has(selectedSession.sessionId) && sessionDetailState.sessionId !== selectedSession.sessionId) {
    openSessionDetail(selectedSession.sessionId);
  }
  renderSelectedSessionDetail(selectedSession);
  clock.textContent = `마지막 갱신 ${new Date(snapshot.generatedAt).toLocaleTimeString()}`;
}

function resolveSelectedSession(sessionRows = [], visibleSessionRows = sessionRows) {
  const hasSelected = selectedSessionId && sessionRows.some((row) => row.sessionId === selectedSessionId);
  if (hasSelected) {
    return sessionRows.find((row) => row.sessionId === selectedSessionId) || null;
  }
  const fallback = visibleSessionRows[0] || null;
  selectedSessionId = fallback?.sessionId || '';
  return fallback;
}

function renderSelectedSessionDetail(session) {
  sessionDetailTitle.textContent = session?.sessionId || '선택된 세션 없음';
  renderSessionDetailMeta(session, sessionDetailMeta);
  const hasSession = Boolean(session?.sessionId);
  sessionDetailBack.hidden = !hasSession;
  sessionDetailExport.hidden = !hasSession;
  if (!hasSession) {
    sessionDetailExport.removeAttribute('href');
    sessionDetailExport.removeAttribute('download');
    sessionDetailEvents.innerHTML = '<p class="sessions-empty">선택된 세션이 없습니다.</p>';
    return;
  }

  const attrs = getSessionExportAttrs(session.sessionId);
  sessionDetailExport.href = attrs.href;
  sessionDetailExport.download = attrs.download;

  if (sessionDetailState.loading && sessionDetailState.sessionId === session.sessionId) {
    sessionDetailEvents.innerHTML = '<p>이벤트를 불러오는 중...</p>';
    return;
  }

  if (sessionDetailState.error && sessionDetailState.sessionId === session.sessionId) {
    sessionDetailEvents.innerHTML = '<p>이벤트를 불러올 수 없습니다.</p>';
    return;
  }

  renderSessionDetail(sessionEventsCache.get(session.sessionId) || [], sessionDetailEvents);
}

function doSaveFilters() {
  saveFilters(EVENT_FILTERS_KEY, { status: eventStatusFilter.value, limit: eventLimit.value, search: eventSearch.value });
}

function doSaveSessionFilters() {
  saveFilters(SESSION_FILTERS_KEY, { quickFilter: sessionQuickFilter.value, query: sessionSearch.value });
}

function applyLoadedFilters() {
  const filters = loadFilters(EVENT_FILTERS_KEY);
  if (!filters) return;
  if (filters.status) eventStatusFilter.value = filters.status;
  if (filters.limit) eventLimit.value = filters.limit;
  if (typeof filters.search === 'string') eventSearch.value = filters.search;
}

function applyLoadedSessionFilters() {
  const filters = loadFilters(SESSION_FILTERS_KEY);
  if (!filters) return;
  if (filters.quickFilter) {
    sessionQuickFilter.value = filters.quickFilter;
    if (!sessionQuickFilter.value) sessionQuickFilter.value = 'all';
  }
  if (typeof filters.query === 'string') sessionSearch.value = filters.query;
}

function renderAlertRulesPanel() {
  if (!alertRulesRoot) return;
  renderAlertRules(alertRulesRoot, alertRules, {
    onChange(nextRules) {
      alertRules = nextRules;
      saveAlertRules(ALERT_RULES_STORAGE_KEY, alertRules);
      renderAlertRulesPanel();
      queueRender();
    },
    onReset() {
      alertRules = resetAlertRules(ALERT_RULES_STORAGE_KEY);
      renderAlertRulesPanel();
      queueRender();
    }
  });
}

function refilterEvents() {
  if (!snapshotState) return;
  const allEvents = snapshotState.recent || [];
  const filtered = getFilteredEvents(allEvents, getEventFilters());
  renderEvents(filtered, eventsRoot);
  renderEventMeta(allEvents.length, filtered.length, eventMetaEl);
}

function refilterSessions() {
  if (!snapshotState) return;
  queueRender();
}

function openSessionDetail(sessionId) {
  selectedSessionId = sessionId;
  sessionDetailState = { sessionId, loading: true, error: false };
  queueRender();
  fetchSessionEvents(sessionId).then((events) => {
    sessionEventsCache.set(sessionId, events);
    if (selectedSessionId === sessionId) {
      sessionDetailState = { sessionId, loading: false, error: false };
      queueRender();
    }
  }).catch(() => {
    if (selectedSessionId === sessionId) {
      sessionDetailState = { sessionId, loading: false, error: true };
      queueRender();
    }
  });
}

sessionDetailBack.addEventListener('click', () => {
  selectedSessionId = '';
  sessionDetailState = { sessionId: '', loading: false, error: false };
  queueRender();
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

agentsBody.addEventListener('click', (e) => {
  const toggle = e.target.closest('.tree-toggle');
  if (!toggle || !snapshotState) return;
  const { treeKey } = toggle.dataset;
  if (!treeKey) return;
  toggleAgentTreeNode(agentsBody, treeKey);
  renderAgents(snapshotState.agents || [], agentsBody, agentFilter.value);
});

for (const el of [eventStatusFilter, eventLimit]) {
  el.addEventListener('change', () => { doSaveFilters(); refilterEvents(); });
}

eventSearch.addEventListener('input', () => { doSaveFilters(); refilterEvents(); });
sessionQuickFilter.addEventListener('change', () => { doSaveSessionFilters(); refilterSessions(); });
sessionSearch.addEventListener('input', () => { doSaveSessionFilters(); refilterSessions(); });

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (snapshotState) renderGraphs(snapshotState.recent || [], chartEls, numberFmt, snapshotState.toolCallStats);
});

applyLoadedFilters();
applyLoadedSessionFilters();
renderAlertRulesPanel();

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
  const intervalSessionRows = annotateSessionsWithState(snapshotState.sessions || [], snapshotState.agents || [], Date.now(), alertRules);
  renderCards(snapshotState.totals, intervalSessionRows, snapshotState.hourlyBuckets || [], snapshotState.startedAt || '');
  renderWorkflow(snapshotState.workflowProgress || recalcWorkflow(snapshotState.agents));
  renderAgents(snapshotState.agents || [], agentsBody, agentFilter.value);
  renderSessionListPanel(intervalSessionRows);
}, 1000);
