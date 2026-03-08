import { escapeHtml, getActivityStatus, activityDotHtml, relativeTime } from '../utils.js';
import { displayNameFor } from '../agent-display.js';
import { buildAgentTree } from '../agent-tree.js';

const numberFmt = new Intl.NumberFormat('ko-KR');
const COLLAPSED_TREE_KEYS_DATASET = 'collapsedTreeKeys';

function filterAgents(agents, filterValue) {
  return filterValue === 'all'
    ? agents
    : agents.filter((row) => row.agentId === filterValue);
}

function treeNodeKey(row) {
  return row.sessionId || row.agentId || '';
}

function readCollapsedTreeKeys(el) {
  const raw = el?.dataset?.[COLLAPSED_TREE_KEYS_DATASET];
  if (!raw) return new Set();

  try {
    const keys = JSON.parse(raw);
    return Array.isArray(keys)
      ? new Set(keys.filter((key) => typeof key === 'string' && key))
      : new Set();
  } catch {
    return new Set();
  }
}

function writeCollapsedTreeKeys(el, keys) {
  if (!el?.dataset) return;
  if (keys.size === 0) {
    delete el.dataset[COLLAPSED_TREE_KEYS_DATASET];
    return;
  }
  el.dataset[COLLAPSED_TREE_KEYS_DATASET] = JSON.stringify([...keys]);
}

function syncCollapsedTreeKeys(el, validKeys) {
  const next = new Set();
  for (const key of readCollapsedTreeKeys(el)) {
    if (validKeys.has(key)) {
      next.add(key);
    }
  }
  writeCollapsedTreeKeys(el, next);
  return next;
}

function treeToggleHtml(key, expanded, childCount) {
  const actionLabel = expanded ? '접기' : '펼치기';
  const label = `하위 에이전트 ${childCount}개 ${actionLabel}`;
  const icon = expanded ? '&#9662;' : '&#9656;';
  return `<button type="button" class="tree-toggle" data-tree-key="${escapeHtml(key)}" aria-expanded="${expanded}" aria-label="${escapeHtml(label)}" title="${escapeHtml(label)}"><span class="tree-toggle-icon" aria-hidden="true">${icon}</span></button>`;
}

function treeMetaHtml(sessionId, childCount) {
  const shortSessionId = sessionId.length > 8 ? `${sessionId.slice(0, 8)}...` : sessionId;
  return `<span class="tree-session-meta" title="${escapeHtml(sessionId)}">세션 ${escapeHtml(shortSessionId)} · 하위 ${childCount}개</span>`;
}

export function toggleAgentTreeNode(el, key) {
  if (!key) return;
  const keys = readCollapsedTreeKeys(el);
  if (keys.has(key)) {
    keys.delete(key);
  } else {
    keys.add(key);
  }
  writeCollapsedTreeKeys(el, keys);
}

export function agentRowHtml(row, isChild, isLastChild, now = Date.now(), options = {}) {
  const {
    hidden = false,
    parentKey = '',
    toggleHtml = '',
    metaHtml = ''
  } = options;
  const prefix = isChild ? '<span class="tree-branch"></span>' : '';
  const classes = [isChild && 'tree-child', isLastChild && 'tree-last'].filter(Boolean).join(' ');
  const attrs = [];
  if (classes) attrs.push(`class="${classes}"`);
  if (hidden) attrs.push('hidden');
  if (parentKey) attrs.push(`data-tree-parent="${escapeHtml(parentKey)}"`);
  const attrHtml = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
  const titleAttr = row.model
    ? `${escapeHtml(row.agentId)} | ${escapeHtml(row.model)}`
    : escapeHtml(row.agentId);
  const dot = activityDotHtml(getActivityStatus(row.lastSeen, now));
  const leading = [toggleHtml, prefix, dot].filter(Boolean).join('');
  return `
    <tr${attrHtml}>
      <td><div class="agent-name-cell">${leading}<span class="agent-name-labels"><span class="badge" title="${titleAttr}">${escapeHtml(row.displayName || displayNameFor(row.agentId, row.model))}</span>${metaHtml}</span></div></td>
      <td title="${row.lastSeen ? new Date(row.lastSeen).toLocaleTimeString() : ''}">${relativeTime(row.lastSeen, now)}</td>
      <td>${Number(row.error) || 0}</td>
      <td>${numberFmt.format(row.tokenTotal || 0)}</td>
      <td>$${(row.costUsd || 0).toFixed(4)}</td>
      <td>${escapeHtml(row.lastEvent)}</td>
      <td>${row.latencyMs == null ? '-' : `${row.latencyMs} ms`}</td>
    </tr>`;
}

export function renderAgents(agents, el, filterValue) {
  const filtered = filterAgents(agents, filterValue);
  const tree = buildAgentTree(filtered);
  const expandableKeys = new Set(
    tree
      .filter((node) => node.children.length > 0)
      .map((node) => treeNodeKey(node.agent))
      .filter(Boolean)
  );
  const collapsedKeys = syncCollapsedTreeKeys(el, expandableKeys);
  const now = Date.now();
  const rows = [];
  for (const node of tree) {
    const key = treeNodeKey(node.agent);
    const expanded = !collapsedKeys.has(key);
    rows.push(agentRowHtml(node.agent, false, false, now, {
      toggleHtml: node.children.length > 0 ? treeToggleHtml(key, expanded, node.children.length) : '',
      metaHtml: node.children.length > 0 && node.agent.sessionId ? treeMetaHtml(node.agent.sessionId, node.children.length) : ''
    }));
    for (let i = 0; i < node.children.length; i++) {
      const isLast = i === node.children.length - 1;
      rows.push(agentRowHtml(node.children[i], true, isLast, now, {
        hidden: !expanded,
        parentKey: key
      }));
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
