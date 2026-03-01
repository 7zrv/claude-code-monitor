export function recalcWorkflow(agents = []) {
  return agents.map((row) => {
    const status = row.error > 0 ? 'blocked' : row.warning > 0 ? 'at-risk' : row.total > 0 ? 'running' : 'idle';
    return {
      roleId: row.agentId,
      active: true,
      status,
      total: row.total,
      lastEvent: row.lastEvent,
      lastSeen: row.lastSeen
    };
  });
}
