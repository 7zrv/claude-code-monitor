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

export function renderEventMeta(total, filtered, el) {
  el.textContent = `events: ${filtered}/${total}`;
}

export function renderEvents(events, el) {
  el.innerHTML = events
    .map(
      (evt) => `
      <div class="event">
        <span>${new Date(evt.receivedAt).toLocaleTimeString()}</span>
        <span title="${escapeHtml(evt.agentId)}"><strong>${escapeHtml(displayNameFor(evt.agentId))}</strong></span>
        <span>${escapeHtml(evt.event)}</span>
        <span>${escapeHtml(evt.message || '')}</span>
        ${statusPill(evt.status)}
      </div>
    `
    )
    .join('');
}
