import { DEFAULT_ALERT_RULES, sanitizeAlertRules } from './alert-rules.js';

const ACTIVE_WINDOW_MS = 30_000;
const STUCK_WINDOW_MS = 120_000;
const COMPLETED_FALLBACK_WINDOW_MS = 900_000;
const TERMINAL_EVENT_HINTS = new Set([
  'done',
  'complete',
  'completed',
  'finish',
  'finished',
  'session_complete',
  'session_completed',
  'session_end',
  'stop',
  'stopped',
  'exit',
  'exited'
]);

const NEEDS_ATTENTION_SCORES = {
  failed: 400,
  stuck: 300,
  warning: 200,
  cost_spike: 100
};

export function elapsedSince(lastSeen, now = Date.now()) {
  if (!lastSeen) return null;
  const ts = new Date(lastSeen).getTime();
  return Number.isFinite(ts) ? now - ts : null;
}

function normalizeEventHint(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
}

function hasTerminalEventHint(row = {}) {
  const candidates = [
    row.lastEvent,
    row.last_event,
    ...(Array.isArray(row.agentLastEvents) ? row.agentLastEvents : []),
    ...(Array.isArray(row.lastEventCandidates) ? row.lastEventCandidates : [])
  ];
  return candidates.some((value) => TERMINAL_EVENT_HINTS.has(normalizeEventHint(value)));
}

export function deriveSessionState(row = {}, now = Date.now()) {
  const error = Number(row.error) || 0;
  const total = Number(row.total) || 0;
  const elapsed = elapsedSince(row.lastSeen, now);
  const terminalHint = hasTerminalEventHint(row);

  if (error > 0) return 'failed';
  if (total <= 0 || elapsed === null) return 'idle';
  if (elapsed < ACTIVE_WINDOW_MS) return 'active';
  if (terminalHint && elapsed >= STUCK_WINDOW_MS) return 'completed';
  if (elapsed >= COMPLETED_FALLBACK_WINDOW_MS) return 'completed';
  if (elapsed >= STUCK_WINDOW_MS) return 'stuck';
  return 'idle';
}

function orderedReasons(reasons = []) {
  const seen = new Set();
  const result = [];
  for (const reason of ['failed', 'stuck', 'warning', 'cost_spike']) {
    if (reasons.includes(reason) && !seen.has(reason)) {
      seen.add(reason);
      result.push(reason);
    }
  }
  return result;
}

function resolveRiskInputs(nowOrRules = Date.now(), maybeRules) {
  if (typeof nowOrRules === 'number' && Number.isFinite(nowOrRules)) {
    return { now: nowOrRules, rules: sanitizeAlertRules(maybeRules) };
  }
  if (nowOrRules && typeof nowOrRules === 'object') {
    return { now: Date.now(), rules: sanitizeAlertRules(nowOrRules) };
  }
  return { now: Date.now(), rules: sanitizeAlertRules(maybeRules) };
}

function deriveRiskSignalsWithRules(row = {}, now = Date.now(), rules = DEFAULT_ALERT_RULES) {
  const sessionState = row.sessionState || deriveSessionState(row, now);
  const warning = Number(row.warning) || 0;
  const costUsd = Number(row.costUsd) || 0;
  const tokenTotal = Number(row.tokenTotal) || 0;
  const warningCountThreshold = rules.warningCountThreshold;
  const isCostSpike = costUsd >= rules.costUsdThreshold || tokenTotal >= rules.tokenTotalThreshold;

  const reasons = [];
  if (sessionState === 'failed') reasons.push('failed');
  if (sessionState === 'stuck') reasons.push('stuck');
  if (warning >= warningCountThreshold) reasons.push('warning');
  if (isCostSpike) reasons.push('cost_spike');

  const needsAttentionReasons = orderedReasons(reasons);
  const needsAttentionRank = needsAttentionReasons
    .reduce((sum, reason) => sum + (NEEDS_ATTENTION_SCORES[reason] || 0), 0);

  return {
    sessionState,
    needsAttention: needsAttentionRank > 0,
    needsAttentionRank,
    needsAttentionReasons,
    isCostSpike
  };
}

export function deriveRiskSignals(row = {}, nowOrRules = Date.now(), maybeRules) {
  const { now, rules } = resolveRiskInputs(nowOrRules, maybeRules);
  return deriveRiskSignalsWithRules(row, now, rules);
}

export function toWorkflowStatus(sessionState) {
  switch (sessionState) {
    case 'active':
      return 'running';
    case 'stuck':
      return 'at-risk';
    case 'failed':
      return 'blocked';
    case 'completed':
      return 'completed';
    default:
      return 'idle';
  }
}

export function annotateSessionsWithState(sessions = [], agents = [], nowOrRules = Date.now(), maybeRules) {
  const { now, rules } = resolveRiskInputs(nowOrRules, maybeRules);
  const totalsBySession = new Map();

  for (const agent of agents) {
    const sessionId = agent.sessionId || '';
    if (!sessionId) continue;
    const row = totalsBySession.get(sessionId) || {
      total: 0,
      warning: 0,
      error: 0,
      agentLastEvents: [],
      latestAgentEvent: '',
      latestAgentSeenTs: 0
    };
    row.total += Number(agent.total) || 0;
    row.warning += Number(agent.warning) || 0;
    row.error += Number(agent.error) || 0;
    const agentLastEvent = agent.lastEvent || agent.last_event || '';
    if (agentLastEvent) {
      row.agentLastEvents.push(agentLastEvent);
    }
    const agentLastSeenTs = new Date(agent.lastSeen || agent.last_seen || '').getTime();
    if (agentLastEvent && Number.isFinite(agentLastSeenTs) && agentLastSeenTs >= row.latestAgentSeenTs) {
      row.latestAgentSeenTs = agentLastSeenTs;
      row.latestAgentEvent = agentLastEvent;
    } else if (!row.latestAgentEvent && agentLastEvent) {
      row.latestAgentEvent = agentLastEvent;
    }
    totalsBySession.set(sessionId, row);
  }

  return sessions.map((session) => {
    const totals = totalsBySession.get(session.sessionId) || {
      total: 0,
      warning: 0,
      error: 0,
      agentLastEvents: [],
      latestAgentEvent: ''
    };
    const derivedState = deriveSessionState(
      {
        total: totals.total,
        warning: totals.warning,
        error: totals.error,
        lastSeen: session.lastSeen,
        lastEvent: totals.latestAgentEvent,
        agentLastEvents: totals.agentLastEvents
      },
      now
    );
    const riskSignals = deriveRiskSignalsWithRules(
      {
        ...session,
        total: totals.total,
        warning: totals.warning,
        error: totals.error,
        lastEvent: totals.latestAgentEvent,
        agentLastEvents: totals.agentLastEvents,
        sessionState: derivedState
      },
      now,
      rules
    );
    return {
      ...session,
      total: totals.total,
      warning: totals.warning,
      error: totals.error,
      ...riskSignals
    };
  });
}
