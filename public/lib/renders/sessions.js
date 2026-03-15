import { escapeHtml, relativeTime, statusPill, countDuplicateLabels } from '../utils.js';
import { displayNameFor } from '../agent-display.js';
import { sanitizeAlertRules } from '../alert-rules.js';

function sessionDisplayLabel(session = {}) {
  return session.displayName || session.shortSessionId || session.sessionId || '';
}

function sessionSecondaryHtml(session = {}, options = {}) {
  const parts = [session.projectName, session.sessionState || 'idle', relativeTime(session.lastSeen)].filter(Boolean);
  if (options.showShortId && session.shortSessionId) {
    parts.push(session.shortSessionId);
  }
  return `<div class="session-item-secondary">${parts.map(escapeHtml).join(' · ')}</div>`;
}

const REASON_LABELS = {
  failed: '오류 발생',
  stuck: '응답 지연',
  warning: '경고 누적',
  cost_spike: '비용 급증'
};

const SESSION_QUICK_FILTERS = new Set(['all', 'needs-attention', 'active', 'completed']);

function safeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function safeTimestamp(value) {
  const parsed = new Date(value || '').getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeQuickFilter(value) {
  return SESSION_QUICK_FILTERS.has(value) ? value : 'all';
}

function sessionSearchText(session = {}) {
  return [
    session.sessionId,
    session.displayName,
    session.projectName,
    session.shortSessionId,
    session.sessionState,
    ...(Array.isArray(session.agentIds) ? session.agentIds : []),
    ...(Array.isArray(session.needsAttentionReasons) ? session.needsAttentionReasons : [])
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

function sessionReasonBadges(session = {}) {
  const reasons = Array.isArray(session.needsAttentionReasons) ? session.needsAttentionReasons : [];
  if (!reasons.length) return '';
  return `<div class="session-item-reasons">${reasons
    .map((reason) => `<span class="attention-reason attention-reason--${escapeHtml(reason)}">${escapeHtml(REASON_LABELS[reason] || reason)}</span>`)
    .join('')}</div>`;
}

function sessionMetaHtml(session = {}) {
  return `<span>tokens: ${safeNumber(session.tokenTotal)}</span>
    <span>cost: $${safeNumber(session.costUsd).toFixed(4)}</span>
    <span>agents: ${Array.isArray(session.agentIds) ? session.agentIds.length : 0}</span>
    <span>last: ${relativeTime(session.lastSeen)}</span>`;
}

export function normalizeSessionListFilters(filters = {}) {
  return {
    query: String(filters.query ?? '').trim().toLowerCase(),
    quickFilter: normalizeQuickFilter(filters.quickFilter)
  };
}

export function compareSessionsByPriority(a = {}, b = {}) {
  const rankDelta = safeNumber(b.needsAttentionRank) - safeNumber(a.needsAttentionRank);
  if (rankDelta !== 0) return rankDelta;

  const lastSeenDelta = safeTimestamp(b.lastSeen) - safeTimestamp(a.lastSeen);
  if (lastSeenDelta !== 0) return lastSeenDelta;

  const costDelta = safeNumber(b.costUsd) - safeNumber(a.costUsd);
  if (costDelta !== 0) return costDelta;

  const tokenDelta = safeNumber(b.tokenTotal) - safeNumber(a.tokenTotal);
  if (tokenDelta !== 0) return tokenDelta;

  return String(a.sessionId || '').localeCompare(String(b.sessionId || ''));
}

export function matchesSessionFilters(session = {}, filters = {}) {
  const { query, quickFilter } = normalizeSessionListFilters(filters);
  const needsAttention = typeof session.needsAttention === 'boolean'
    ? session.needsAttention
    : safeNumber(session.needsAttentionRank) > 0;

  if (quickFilter === 'needs-attention' && !needsAttention) return false;
  if (quickFilter === 'active' && session.sessionState !== 'active') return false;
  if (quickFilter === 'completed' && session.sessionState !== 'completed') return false;
  if (query && !sessionSearchText(session).includes(query)) return false;
  return true;
}

export function selectSessionsForList(sessions = [], filters = {}) {
  return sessions.filter((session) => matchesSessionFilters(session, filters)).sort(compareSessionsByPriority);
}

function renderSessionsEmptyState(root, sourceCount = 0) {
  root.innerHTML = sourceCount > 0
    ? '<p class="sessions-empty">조건에 맞는 세션이 없습니다. 검색어나 필터를 조정해 보세요.</p>'
    : `<p class="sessions-empty">아직 세션이 없습니다. Claude Code를 실행하면 세션이 여기에 표시됩니다.<br><small>수집 경로: <code>~/.claude/projects/</code></small></p>`;
  root.onclick = null;
}

export function renderSessionsList(sessions, root, onSelect, options = {}) {
  const rows = Array.isArray(sessions) ? sessions : [];
  const { selectedSessionId = '', sourceCount = rows.length } = options;
  if (rows.length === 0) {
    renderSessionsEmptyState(root, sourceCount);
    return;
  }

  const nameCounts = countDuplicateLabels(rows.map(sessionDisplayLabel));

  root.innerHTML = rows
    .map(
      (s) => {
        const label = sessionDisplayLabel(s);
        const showShortId = (nameCounts.get(label) || 0) > 1;
        return `<div class="session-item${s.sessionId === selectedSessionId ? ' session-item--selected' : ''}" data-session-id="${escapeHtml(s.sessionId)}">
        <div class="session-item-main">
          <div class="session-item-name">${escapeHtml(label)}</div>
          ${statusPill(s.sessionState || 'idle')}
        </div>
        ${sessionSecondaryHtml(s, { showShortId })}
        <div class="session-item-meta">
          ${sessionMetaHtml(s)}
        </div>
        ${sessionReasonBadges(s)}
      </div>`;
      }
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

function renderSessionParticipants(session = {}, sessionAgents = []) {
  const participants = sessionAgents.length
    ? sessionAgents.map((agent) => ({
        agentId: agent.agentId,
        label: displayNameFor(agent.agentId, agent.model || '')
      }))
    : (Array.isArray(session.agentIds) ? session.agentIds : []).map((agentId) => ({
        agentId,
        label: displayNameFor(agentId)
      }));

  if (!participants.length) {
    return '<p class="session-detail-note">참여 agent 정보가 아직 없습니다.</p>';
  }

  return `<div class="session-detail-chip-list">${participants
    .map(
      (agent) => `<span class="session-detail-chip" title="${escapeHtml(agent.agentId)}">${escapeHtml(agent.label)}</span>`
    )
    .join('')}</div>`;
}

function renderSessionAlerts(sessionAlerts = []) {
  if (!sessionAlerts.length) {
    return '<p class="session-detail-note">연결된 alert가 없습니다.</p>';
  }

  return `<div class="session-detail-alert-list">${sessionAlerts
    .map(
      (alert) => `<button type="button" class="session-detail-alert-item" data-session-alert-id="${escapeHtml(alert.id)}">
        ${statusPill(alert.severity || 'warning')}
        <span class="session-detail-alert-text">
          <strong>${escapeHtml(alert.event || 'Alert')}</strong>
          <span>${escapeHtml(alert.message || '')}</span>
        </span>
      </button>`
    )
    .join('')}</div>`;
}

export function renderSessionDetailMeta(session, root, options = {}) {
  if (!session) {
    root.innerHTML = `<div class="session-detail-empty">
      <strong>세션을 선택하세요</strong>
      <p>문제 세션을 선택하면 상태, 비용, 이벤트를 이 영역에서 바로 진단할 수 있습니다.</p>
    </div>`;
    return;
  }

  const { sessionAgents = [], sessionAlerts = [] } = options;
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
      <div class="session-detail-section">
        <h3>Session ID</h3>
        <span class="session-detail-session-id" title="${escapeHtml(session.sessionId)}">${escapeHtml(session.sessionId)}</span>
      </div>
      <div class="session-detail-section">
        <h3>Participants</h3>
        ${renderSessionParticipants(session, sessionAgents)}
      </div>
      <div class="session-detail-section">
        <h3>Linked Alerts</h3>
        ${renderSessionAlerts(sessionAlerts)}
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

export function getSessionExportAttrs(sessionId, alertRules = null) {
  const resolvedRules = sanitizeAlertRules(alertRules || {});
  const query = new URLSearchParams({
    costUsdThreshold: String(resolvedRules.costUsdThreshold),
    tokenTotalThreshold: String(resolvedRules.tokenTotalThreshold),
    warningCountThreshold: String(resolvedRules.warningCountThreshold)
  });
  return {
    href: `/api/sessions/${encodeURIComponent(sessionId)}/export?${query.toString()}`,
    download: `session-${sanitizeExportSegment(sessionId)}.json`
  };
}

export async function fetchSessionEvents(sessionId) {
  const resp = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
  if (!resp.ok) return [];
  return resp.json();
}
