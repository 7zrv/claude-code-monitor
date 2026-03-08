import { escapeHtml, relativeTime, statusPill } from './utils.js';

const REASON_ORDER = ['failed', 'stuck', 'warning', 'cost_spike'];

const REASON_SCORES = {
  failed: 400,
  stuck: 300,
  warning: 200,
  cost_spike: 100
};

const REASON_LABELS = {
  failed: '오류 발생',
  stuck: '응답 지연',
  warning: '경고 누적',
  cost_spike: '비용 급증'
};

function normalizeReasons(reasons = []) {
  const items = Array.isArray(reasons) ? reasons : [];
  const set = new Set(items.filter((reason) => REASON_ORDER.includes(reason)));
  return REASON_ORDER.filter((reason) => set.has(reason));
}

function fallbackReasons(sessionState = 'idle') {
  if (sessionState === 'failed') return ['failed'];
  if (sessionState === 'stuck') return ['stuck'];
  return [];
}

function lastSeenTs(lastSeen) {
  const ts = new Date(lastSeen || '').getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function countRank(reasons = []) {
  return reasons.reduce((sum, reason) => sum + (REASON_SCORES[reason] || 0), 0);
}

export function normalizeNeedsAttentionSession(session = {}) {
  const sessionState = session.sessionState || 'idle';
  const reasons = normalizeReasons(session.needsAttentionReasons);
  const fallback = fallbackReasons(sessionState);
  const needsAttentionReasons = reasons.length > 0 ? reasons : fallback;
  const explicitRank = Number(session.needsAttentionRank);
  const needsAttentionRank = Number.isFinite(explicitRank) ? explicitRank : countRank(needsAttentionReasons);
  const fallbackVisible = fallback.length > 0;
  const needsAttention = typeof session.needsAttention === 'boolean'
    ? session.needsAttention
    : needsAttentionRank > 0 || fallbackVisible;

  return {
    ...session,
    sessionState,
    needsAttention,
    needsAttentionRank,
    needsAttentionReasons
  };
}

export function compareNeedsAttentionSessions(a, b) {
  if (a.needsAttentionRank !== b.needsAttentionRank) {
    return b.needsAttentionRank - a.needsAttentionRank;
  }
  const lastSeenDelta = lastSeenTs(b.lastSeen) - lastSeenTs(a.lastSeen);
  if (lastSeenDelta !== 0) return lastSeenDelta;
  const costDelta = (Number(b.costUsd) || 0) - (Number(a.costUsd) || 0);
  if (costDelta !== 0) return costDelta;
  return (Number(b.tokenTotal) || 0) - (Number(a.tokenTotal) || 0);
}

export function selectNeedsAttentionSessions(sessions = []) {
  return sessions
    .map((session) => normalizeNeedsAttentionSession(session))
    .filter((session) => session.needsAttention)
    .sort(compareNeedsAttentionSessions);
}

function reasonBadgeHtml(reason) {
  const label = REASON_LABELS[reason] || reason;
  return `<span class="attention-reason attention-reason--${escapeHtml(reason)}">${escapeHtml(label)}</span>`;
}

export function renderNeedsAttention(sessions, root, onSelect) {
  const rows = selectNeedsAttentionSessions(sessions);

  if (!rows.length) {
    root.innerHTML = '<p class="needs-attention-empty">현재 바로 개입이 필요한 세션이 없습니다.</p>';
    root.onclick = null;
    return;
  }

  root.innerHTML = rows
    .map(
      (session) => `<button type="button" class="attention-item" data-session-id="${escapeHtml(session.sessionId)}">
        <div class="attention-item-main">
          <div class="attention-item-title">
            <div class="attention-item-head">
              <strong class="attention-item-id">${escapeHtml(session.displayName || session.sessionId)}</strong>
              ${statusPill(session.sessionState)}
            </div>
            <div class="attention-reasons">
              ${session.needsAttentionReasons.map((reason) => reasonBadgeHtml(reason)).join('')}
            </div>
          </div>
          <div class="attention-item-score">rank ${session.needsAttentionRank}</div>
        </div>
        <div class="attention-item-meta">
          <span>last: ${relativeTime(session.lastSeen)}</span>
          <span>tokens: ${Number(session.tokenTotal || 0)}</span>
          <span>cost: $${Number(session.costUsd || 0).toFixed(4)}</span>
          <span>agents: ${Array.isArray(session.agentIds) ? session.agentIds.length : 0}</span>
        </div>
      </button>`
    )
    .join('');

  root.onclick = (event) => {
    const item = event.target.closest('.attention-item[data-session-id]');
    if (item) onSelect(item.dataset.sessionId);
  };
}
