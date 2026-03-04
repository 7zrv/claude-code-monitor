import { escapeHtml, getActivityStatus, activityDotHtml } from '../utils.js';
import { displayNameFor } from '../agent-display.js';
import { buildAgentTree } from '../agent-tree.js';

const numberFmt = new Intl.NumberFormat('ko-KR');

export function agentRowHtml(row, isChild, isLastChild, now = Date.now()) {
  const prefix = isChild ? '<span class="tree-branch"></span>' : '';
  const classes = [isChild && 'tree-child', isLastChild && 'tree-last'].filter(Boolean).join(' ');
  const cls = classes ? ` class="${classes}"` : '';
  const modelBadge = row.model
    ? `<span class="model-badge">${escapeHtml(row.model)}</span>`
    : '-';
  const dot = activityDotHtml(getActivityStatus(row.lastSeen, now));
  return `
    <tr${cls}>
      <td>${prefix}${dot}<span class="badge" title="${escapeHtml(row.agentId)}">${escapeHtml(row.displayName || displayNameFor(row.agentId, row.model))}</span></td>
      <td>${modelBadge}</td>
      <td>${new Date(row.lastSeen).toLocaleTimeString()}</td>
      <td>${Number(row.total) || 0}</td>
      <td>${Number(row.ok) || 0}</td>
      <td>${Number(row.warning) || 0}</td>
      <td>${Number(row.error) || 0}</td>
      <td>${numberFmt.format(row.tokenTotal || 0)}</td>
      <td>${escapeHtml(row.lastEvent)}</td>
      <td>${row.latencyMs == null ? '-' : `${row.latencyMs} ms`}</td>
    </tr>`;
}

export function renderAgents(agents, el, filterValue) {
  const filtered =
    filterValue === 'all'
      ? agents
      : agents.filter((row) => row.agentId === filterValue);

  const tree = buildAgentTree(filtered);
  const rows = [];
  for (const node of tree) {
    rows.push(agentRowHtml(node.agent, false, false));
    for (let i = 0; i < node.children.length; i++) {
      const isLast = i === node.children.length - 1;
      rows.push(agentRowHtml(node.children[i], true, isLast));
    }
  }
  el.innerHTML = rows.join('');
}

export function populateAgentFilter(agents, filterEl) {
  const prev = filterEl.value;
  const ids = agents.map((row) => row.agentId);
  filterEl.querySelectorAll('option:not([value="all"])').forEach((o) => o.remove());
  for (const agent of agents) {
    const opt = document.createElement('option');
    opt.value = agent.agentId;
    opt.textContent = agent.isSidechain ? `\u21b3 ${displayNameFor(agent.agentId, agent.model)}` : displayNameFor(agent.agentId, agent.model);
    filterEl.appendChild(opt);
  }
  if (ids.includes(prev) || prev === 'all') {
    filterEl.value = prev;
  } else {
    filterEl.value = 'all';
  }
}
