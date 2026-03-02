import { recalcWorkflow } from './lib/workflow.js';
import { buildCardData } from './lib/cards.js';
import { escapeHtml, statusPill } from './lib/utils.js';
import { applyIncrementalEvent } from './lib/state.js';
import { saveFilters, loadFilters } from './lib/persistence.js';
import { connectStream, loadSnapshot } from './lib/connection.js';
import { renderGraphs } from './lib/renders/charts.js';
import { getFilteredEvents, renderEventMeta, renderEvents } from './lib/renders/events.js';
import { renderAgents, populateAgentFilter } from './lib/renders/agents.js';
import { renderAlerts } from './lib/renders/alerts.js';

const cardsRoot = document.getElementById('cards');
const workflowRoot = document.getElementById('workflow');
const agentsBody = document.getElementById('agentsBody');
const eventsRoot = document.getElementById('events');
const alertsRoot = document.getElementById('alerts');
const clock = document.getElementById('clock');
const connectionEl = document.getElementById('connection');
const agentFilter = document.getElementById('agentFilter');
const eventStatusFilter = document.getElementById('eventStatusFilter');
const eventLimit = document.getElementById('eventLimit');
const eventSearch = document.getElementById('eventSearch');
const eventMetaEl = document.getElementById('eventMeta');

const chartEls = {
  throughputChart: document.getElementById('throughputChart'),
  throughputTooltip: document.getElementById('throughputTooltip'),
  tokenTrendChart: document.getElementById('tokenTrendChart'),
  tokenTrendLegend: document.getElementById('tokenTrendLegend')
};

const numberFmt = new Intl.NumberFormat('ko-KR');
let snapshotState = null;
let renderQueued = false;
const storageKey = 'agent_monitor_event_filters_v1';

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

function renderCards(totals) {
  const cards = buildCardData(totals, numberFmt);
  cardsRoot.innerHTML = cards
    .map(
      ([label, value, type]) =>
        `<article class="card card--${type}"><div class="label">${label}</div><div class="value">${value}</div></article>`
    )
    .join('');
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

function getFilters() {
  return { status: eventStatusFilter.value, limit: Number(eventLimit.value) || 50, query: eventSearch.value };
}

function renderSnapshot(snapshot) {
  snapshotState = snapshot;
  renderCards(snapshot.totals);
  populateAgentFilter(snapshot.agents || [], agentFilter);
  renderWorkflow(snapshot.workflowProgress || recalcWorkflow(snapshot.agents));
  renderAgents(snapshot.agents || [], agentsBody, agentFilter.value);
  const allEvents = snapshot.recent || [];
  renderGraphs(allEvents, chartEls, numberFmt);
  const filteredEvents = getFilteredEvents(allEvents, getFilters());
  renderEvents(filteredEvents, eventsRoot);
  renderEventMeta(allEvents.length, filteredEvents.length, eventMetaEl);
  renderAlerts(snapshot.alerts || [], alertsRoot);
  clock.textContent = `Last refresh: ${new Date(snapshot.generatedAt).toLocaleTimeString()}`;
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

agentFilter.addEventListener('change', () => {
  if (snapshotState) renderAgents(snapshotState.agents || [], agentsBody, agentFilter.value);
});

for (const el of [eventStatusFilter, eventLimit]) {
  el.addEventListener('change', () => { doSaveFilters(); refilterEvents(); });
}

eventSearch.addEventListener('input', () => { doSaveFilters(); refilterEvents(); });

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (snapshotState) renderGraphs(snapshotState.recent || [], chartEls, numberFmt);
});

applyLoadedFilters();

loadSnapshot()
  .then((snapshot) => renderSnapshot(snapshot))
  .catch(console.error);

connectStream({
  connectionEl,
  onSnapshot(snapshot) { snapshotState = snapshot; queueRender(); },
  onEvent(evt) {
    if (snapshotState) { applyIncrementalEvent(snapshotState, evt); queueRender(); }
  },
  onFallback() { loadSnapshot().then((snapshot) => renderSnapshot(snapshot)).catch(console.error); }
});
