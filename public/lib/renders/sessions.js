import { escapeHtml, relativeTime, statusPill } from '../utils.js';

const REASON_LABELS = {
  failed: '오류 발생',
  stuck: '응답 지연',
  warning: '경고 누적',
  cost_spike: '비용 급증'
};

function sessionReasonBadges(session = {}) {
  const reasons = Array.isArray(session.needsAttentionReasons) ? session.needsAttentionReasons : [];
  if (!reasons.length) return '';
  return `<div class="session-item-reasons">${reasons
    .map((reason) => `<span class="attention-reason attention-reason--${escapeHtml(reason)}">${escapeHtml(REASON_LABELS[reason] || reason)}</span>`)
    .join('')}</div>`;
}

function sessionMetaHtml(session = {}) {
  return `<span>tokens: ${Number(session.tokenTotal || 0)}</span>
    <span>cost: $${Number(session.costUsd || 0).toFixed(4)}</span>
    <span>agents: ${Array.isArray(session.agentIds) ? session.agentIds.length : 0}</span>
    <span>last: ${relativeTime(session.lastSeen)}</span>`;
}

export function renderSessionsList(sessions, root, onSelect, options = {}) {
  const { selectedSessionId = '' } = options;
  if (!sessions || sessions.length === 0) {
    root.innerHTML = `<p class="sessions-empty">아직 세션이 없습니다. Claude Code를 실행하면 세션이 여기에 표시됩니다.<br><small>수집 경로: <code>~/.claude/projects/</code></small></p>`;
    return;
  }

  root.innerHTML = sessions
    .map(
      (s) => `<div class="session-item${s.sessionId === selectedSessionId ? ' session-item--selected' : ''}" data-session-id="${escapeHtml(s.sessionId)}">
        <div class="session-item-main">
          <div class="session-item-id">${escapeHtml(s.sessionId)}</div>
          ${statusPill(s.sessionState || 'idle')}
        </div>
        <div class="session-item-meta">
          ${sessionMetaHtml(s)}
        </div>
        ${sessionReasonBadges(s)}
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

function summaryStat(label, value) {
  return `<div class="session-detail-stat">
    <div class="session-detail-stat-label">${escapeHtml(label)}</div>
    <div class="session-detail-stat-value">${escapeHtml(value)}</div>
  </div>`;
}

export function renderSessionDetailMeta(session, root) {
  if (!session) {
    root.innerHTML = `<div class="session-detail-empty">
      <strong>세션을 선택하세요</strong>
      <p>문제 세션을 선택하면 상태, 비용, 이벤트를 이 영역에서 바로 진단할 수 있습니다.</p>
    </div>`;
    return;
  }

  const reasonBadges = sessionReasonBadges(session);
  root.innerHTML = `
    <div class="session-detail-summary">
      <div class="session-detail-summary-main">
        ${statusPill(session.sessionState || 'idle')}
        <span class="session-detail-summary-last">마지막 활동 ${escapeHtml(relativeTime(session.lastSeen))}</span>
      </div>
      ${reasonBadges}
      <div class="session-detail-stats">
        ${summaryStat('Tokens', String(Number(session.tokenTotal || 0)))}
        ${summaryStat('Cost', `$${Number(session.costUsd || 0).toFixed(4)}`)}
        ${summaryStat('Agents', String(Array.isArray(session.agentIds) ? session.agentIds.length : 0))}
        ${summaryStat('Attention Rank', String(Number(session.needsAttentionRank || 0)))}
      </div>
    </div>`;
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
