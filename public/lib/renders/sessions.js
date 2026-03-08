import { escapeHtml, relativeTime, statusPill } from '../utils.js';

export function renderSessionsList(sessions, root, onSelect) {
  if (!sessions || sessions.length === 0) {
    root.innerHTML = '<p class="sessions-empty">세션 없음</p>';
    return;
  }

  root.innerHTML = sessions
    .map(
      (s) => `<div class="session-item" data-session-id="${escapeHtml(s.sessionId)}">
        <div class="session-item-main">
          <div class="session-item-id">${escapeHtml(s.sessionId)}</div>
          ${statusPill(s.sessionState || 'idle')}
        </div>
        <div class="session-item-meta">
          <span>tokens: ${s.tokenTotal}</span>
          <span>cost: $${s.costUsd.toFixed(4)}</span>
          <span>agents: ${s.agentIds.length}</span>
          <span>last: ${relativeTime(s.lastSeen)}</span>
        </div>
      </div>`
    )
    .join('');

  root.onclick = (e) => {
    const item = e.target.closest('.session-item[data-session-id]');
    if (item) onSelect(item.dataset.sessionId);
  };
}

export function renderSessionDetail(events, root) {
  if (!events || events.length === 0) {
    root.innerHTML = '<p class="sessions-empty">이벤트 없음</p>';
    return;
  }

  root.innerHTML = events
    .map(
      (evt) => `<div class="event">
        <div class="event-summary">
          <span>${new Date(evt.receivedAt).toLocaleTimeString()}</span>
          <span><strong>${escapeHtml(evt.agentId)}</strong></span>
          <span>${escapeHtml(evt.event)}</span>
          <span>${escapeHtml(evt.message || '')}</span>
          ${statusPill(evt.status)}
        </div>
      </div>`
    )
    .join('');
}

function sanitizeExportSegment(value) {
  const safe = String(value ?? '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return safe || 'detail';
}

export function getSessionExportAttrs(sessionId) {
  return {
    href: `/api/sessions/${encodeURIComponent(sessionId)}/export`,
    download: `session-${sanitizeExportSegment(sessionId)}.json`
  };
}

export async function fetchSessionEvents(sessionId) {
  const resp = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
  if (!resp.ok) return [];
  return resp.json();
}
