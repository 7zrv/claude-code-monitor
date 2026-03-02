/**
 * Build a hierarchical tree from a flat agents array.
 * Groups agents by sessionId — lead (isSidechain === false) becomes root,
 * sub-agents (isSidechain === true) become children.
 *
 * @param {Array} agents - flat array of agent rows
 * @returns {Array<{agent: object, children: object[]}>}
 */
export function buildAgentTree(agents) {
  const bySession = new Map();

  for (const agent of agents) {
    const sid = agent.sessionId || '';
    const key = sid || agent.agentId || '';
    if (!bySession.has(key)) {
      bySession.set(key, { lead: null, children: [] });
    }
    const group = bySession.get(key);
    if (!agent.isSidechain) {
      group.lead = agent;
    } else {
      group.children.push(agent);
    }
  }

  const tree = [];
  for (const [, group] of bySession) {
    if (group.lead) {
      tree.push({ agent: group.lead, children: group.children });
    } else {
      for (const child of group.children) {
        tree.push({ agent: child, children: [] });
      }
    }
  }

  return tree;
}
