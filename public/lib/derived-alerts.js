const DERIVED_ALERT_BUILDERS = {
  cost_spike: {
    event: 'SessionCostSpike',
    severity: 'warning',
    buildMessage(session) {
      const costUsd = Number(session.costUsd) || 0;
      const tokenTotal = Number(session.tokenTotal) || 0;
      return `Configured cost/token threshold exceeded ($${costUsd.toFixed(4)}, ${tokenTotal} tokens)`;
    }
  }
};

function toTimestamp(value) {
  const ts = new Date(value || '').getTime();
  return Number.isFinite(ts) ? ts : 0;
}

function compareAlertEntries(a, b) {
  const createdAtDelta = toTimestamp(b.alert.createdAt) - toTimestamp(a.alert.createdAt);
  if (createdAtDelta !== 0) return createdAtDelta;
  if (a.sourceRank !== b.sourceRank) return a.sourceRank - b.sourceRank;
  return a.index - b.index;
}

function buildDerivedAlert(session = {}, reason, createdAtFallback) {
  const config = DERIVED_ALERT_BUILDERS[reason];
  if (!config || !session.sessionId) return null;

  return {
    id: `derived:${reason}:${session.sessionId}`,
    source: 'derived-session',
    severity: config.severity,
    event: config.event,
    message: config.buildMessage(session),
    createdAt: session.lastSeen || createdAtFallback,
    sessionId: session.sessionId,
    agentId: '',
    derivedReason: reason
  };
}

export function buildDerivedSessionAlerts(sessionRows = [], options = {}) {
  const createdAtFallback = options.generatedAt || new Date(0).toISOString();

  return sessionRows
    .flatMap((session) => {
      const reasons = Array.isArray(session.needsAttentionReasons) ? session.needsAttentionReasons : [];
      return reasons
        .filter((reason) => Object.hasOwn(DERIVED_ALERT_BUILDERS, reason))
        .map((reason) => buildDerivedAlert(session, reason, createdAtFallback))
        .filter(Boolean);
    })
    .sort((a, b) => compareAlertEntries(
      { alert: a, sourceRank: 1, index: 0 },
      { alert: b, sourceRank: 1, index: 0 }
    ));
}

export function mergeAlertsForPanel(rawAlerts = [], sessionRows = [], options = {}) {
  const derivedAlerts = buildDerivedSessionAlerts(sessionRows, options);
  return [
    ...rawAlerts.map((alert, index) => ({ alert, index, sourceRank: 0 })),
    ...derivedAlerts.map((alert, index) => ({ alert, index, sourceRank: 1 }))
  ]
    .sort(compareAlertEntries)
    .map(({ alert }) => alert);
}
