export function recalcWorkflow(agents = [], now = Date.now()) {
  return agents.map((row) => {
    const raw = row.lastSeen ? now - new Date(row.lastSeen).getTime() : null;
    const elapsed = raw !== null && !isNaN(raw) ? raw : null;
    const status = row.error > 0
      ? 'blocked'
      : row.warning > 0
        ? 'at-risk'
        : elapsed !== null && elapsed < 30_000 && row.total > 0
          ? 'running'
          : elapsed !== null && elapsed >= 120_000
            ? 'completed'
            : 'idle';
    return {
      roleId: row.agentId,
      active: true,
      status,
      total: row.total,
      lastEvent: row.lastEvent,
      lastSeen: row.lastSeen,
      model: row.model || '',
      displayName: row.displayName || ''
    };
  });
}
