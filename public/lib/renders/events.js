import { escapeHtml, statusPill, normalizeText } from '../utils.js';
import { displayNameFor } from '../agent-display.js';

export function getFilteredEvents(events = [], filters = {}) {
  const status = filters.status || 'all';
  const limit = Number(filters.limit) || 50;
  const query = normalizeText(filters.query).trim();

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

export function renderEventMeta(total, filtered, el, options = {}) {
  const label = String(options.scopeLabel || '').trim();
  el.textContent = label ? `events: ${filtered}/${total} · ${label}` : `events: ${filtered}/${total}`;
}

export function renderEventDetail(evt) {
  const meta = evt.metadata;
  if (!meta || typeof meta !== 'object' || Object.keys(meta).length === 0) {
    return '<div class="event-detail-inner"><p class="event-detail-empty">No metadata</p></div>';
  }

  if (evt.event === 'tool_call') {
    const toolInput = meta.toolInput ?? {};
    return `<div class="event-detail-inner">
      <div class="event-detail-label">Tool: <strong>${escapeHtml(evt.message)}</strong></div>
      <div class="event-detail-label">Input</div>
      <pre class="event-detail-json">${escapeHtml(JSON.stringify(toolInput, null, 2))}</pre>
      <button class="event-detail-copy" type="button">Copy JSON</button>
    </div>`;
  }

  if (evt.event === 'token_usage') {
    const usage = meta.tokenUsage ?? {};
    return `<div class="event-detail-inner">
      <div class="event-detail-tokens">
        <div class="event-detail-label">Input</div><div><strong>${usage.inputTokens ?? 0}</strong></div>
        <div class="event-detail-label">Output</div><div><strong>${usage.outputTokens ?? 0}</strong></div>
        <div class="event-detail-label">Cache Read</div><div><strong>${usage.cacheReadInputTokens ?? 0}</strong></div>
        <div class="event-detail-label">Total</div><div><strong>${usage.totalTokens ?? 0}</strong></div>
      </div>
      <button class="event-detail-copy" type="button">Copy JSON</button>
    </div>`;
  }

  if (evt.status === 'error') {
    return `<div class="event-detail-inner event-detail--error">
      <div class="event-detail-label">Error</div>
      <pre class="event-detail-json">${escapeHtml(evt.message)}\n\n${escapeHtml(JSON.stringify(meta, null, 2))}</pre>
      <button class="event-detail-copy" type="button">Copy JSON</button>
    </div>`;
  }

  return `<div class="event-detail-inner">
    <pre class="event-detail-json">${escapeHtml(JSON.stringify(meta, null, 2))}</pre>
    <button class="event-detail-copy" type="button">Copy JSON</button>
  </div>`;
}

const eventDataMap = new Map();

export function renderEvents(events, el) {
  eventDataMap.clear();
  for (const evt of events) {
    eventDataMap.set(evt.id, evt);
  }

  el.innerHTML = events
    .map(
      (evt) => `
      <div class="event" data-event-id="${escapeHtml(evt.id)}">
        <div class="event-summary">
          <span>${new Date(evt.receivedAt).toLocaleTimeString()}</span>
          <span title="${escapeHtml(evt.agentId)}"><strong>${escapeHtml(displayNameFor(evt.agentId, evt.model))}</strong></span>
          <span>${escapeHtml(evt.event)}</span>
          <span>${escapeHtml(evt.message || '')}</span>
          ${statusPill(evt.status)}
        </div>
        <div class="event-detail">${renderEventDetail(evt)}</div>
      </div>
    `
    )
    .join('');

  if (!el.dataset.listenerAttached) {
    el.dataset.listenerAttached = '1';
    el.addEventListener('click', (e) => {
      if (e.target.closest('.event-detail-copy')) {
        const card = e.target.closest('.event[data-event-id]');
        if (card) {
          const evt = eventDataMap.get(card.dataset.eventId);
          if (evt) {
            const json = JSON.stringify(evt.metadata, null, 2);
            const btn = e.target.closest('.event-detail-copy');
            navigator.clipboard.writeText(json).then(() => {
              btn.textContent = 'Copied!';
              setTimeout(() => { btn.textContent = 'Copy JSON'; }, 1500);
            }).catch(() => {});
          }
        }
        return;
      }
      const card = e.target.closest('.event[data-event-id]');
      if (!card) return;
      card.classList.toggle('event--expanded');
    });
  }
}
