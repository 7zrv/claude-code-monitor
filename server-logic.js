export function roleProgressRow(byAgent, roleId) {
  const row = byAgent.get(roleId);
  if (!row) {
    return {
      roleId,
      active: false,
      status: 'idle',
      total: 0,
      lastEvent: '-',
      lastSeen: null
    };
  }

  const status =
    row.error > 0 ? 'blocked' :
    row.warning > 0 ? 'at-risk' :
    row.total > 0 ? 'running' :
    'idle';

  return {
    roleId,
    active: true,
    status,
    total: row.total,
    lastEvent: row.lastEvent,
    lastSeen: row.lastSeen
  };
}

export function buildSnapshot(state) {
  const agentRows = [...state.byAgent.values()].sort((a, b) =>
    a.agentId.localeCompare(b.agentId)
  );

  const totals = agentRows.reduce(
    (acc, row) => {
      acc.total += row.total;
      acc.ok += row.ok;
      acc.warning += row.warning;
      acc.error += row.error;
      return acc;
    },
    { agents: agentRows.length, total: 0, ok: 0, warning: 0, error: 0 }
  );
  const sources = [...state.bySource.values()].sort((a, b) => a.source.localeCompare(b.source));

  return {
    generatedAt: new Date().toISOString(),
    totals,
    agents: agentRows,
    sources,
    recent: state.recent.slice(0, 50),
    alerts: state.alerts.slice(0, 20),
    workflowProgress: agentRows.map((row) => roleProgressRow(state.byAgent, row.agentId))
  };
}
