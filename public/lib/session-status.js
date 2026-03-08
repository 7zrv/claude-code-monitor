const ACTIVE_WINDOW_MS = 30_000;
const COMPLETED_WINDOW_MS = 120_000;
const COST_SPIKE_USD_THRESHOLD = 0.5;
const COST_SPIKE_TOKEN_THRESHOLD = 20_000;

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

export function deriveSessionState(row = {}, now = Date.now()) {
  const error = Number(row.error) || 0;
  const warning = Number(row.warning) || 0;
  const total = Number(row.total) || 0;
  const elapsed = elapsedSince(row.lastSeen, now);

  if (error > 0) return 'failed';
  if (warning > 0) return 'stuck';
  if (elapsed !== null && total > 0 && elapsed < ACTIVE_WINDOW_MS) return 'active';
  if (elapsed !== null && total > 0 && elapsed >= COMPLETED_WINDOW_MS) return 'completed';
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

export function deriveRiskSignals(row = {}, now = Date.now()) {
  const sessionState = row.sessionState || deriveSessionState(row, now);
  const warning = Number(row.warning) || 0;
  const costUsd = Number(row.costUsd) || 0;
  const tokenTotal = Number(row.tokenTotal) || 0;
  const isCostSpike = costUsd >= COST_SPIKE_USD_THRESHOLD || tokenTotal >= COST_SPIKE_TOKEN_THRESHOLD;

  const reasons = [];
  if (sessionState === 'failed') reasons.push('failed');
  if (sessionState === 'stuck') reasons.push('stuck');
  if (warning > 0) reasons.push('warning');
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

export function annotateSessionsWithState(sessions = [], agents = [], now = Date.now()) {
  const totalsBySession = new Map();

  for (const agent of agents) {
    const sessionId = agent.sessionId || '';
    if (!sessionId) continue;
    const row = totalsBySession.get(sessionId) || { total: 0, warning: 0, error: 0 };
    row.total += Number(agent.total) || 0;
    row.warning += Number(agent.warning) || 0;
    row.error += Number(agent.error) || 0;
    totalsBySession.set(sessionId, row);
  }

  return sessions.map((session) => {
    const totals = totalsBySession.get(session.sessionId) || { total: 0, warning: 0, error: 0 };
    const derivedState = deriveSessionState(
      {
        total: totals.total,
        warning: totals.warning,
        error: totals.error,
        lastSeen: session.lastSeen
      },
      now
    );
    const riskSignals = deriveRiskSignals(
      {
        ...session,
        total: totals.total,
        warning: totals.warning,
        error: totals.error,
        sessionState: derivedState
      },
      now
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
