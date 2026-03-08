import { deriveSessionState, toWorkflowStatus } from './session-status.js';

const ACTIVE_STATUSES = new Set(['running', 'blocked', 'at-risk']);
const MAX_COMPLETED = 20;

function sortByLastSeenDesc(a, b) {
  const aTime = a.lastSeen || '';
  const bTime = b.lastSeen || '';
  return bTime < aTime ? -1 : bTime > aTime ? 1 : 0;
}

export function splitWorkflow(rows = []) {
  const active = [];
  const completed = [];
  for (const row of rows) {
    if (ACTIVE_STATUSES.has(row.status)) {
      active.push(row);
    } else {
      completed.push(row);
    }
  }
  active.sort(sortByLastSeenDesc);
  completed.sort(sortByLastSeenDesc);
  return { active, completed: completed.slice(0, MAX_COMPLETED) };
}

export function recalcWorkflow(agents = [], now = Date.now()) {
  return agents.map((row) => {
    const sessionState = deriveSessionState(row, now);
    const status = toWorkflowStatus(sessionState);
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
