import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetDisplayNames } from '../lib/agent-display.js';
import { agentRowHtml, renderAgents, toggleAgentTreeNode } from '../lib/renders/agents.js';

function makeRoot() {
  return { innerHTML: '', dataset: {} };
}

const treeAgents = [
  {
    agentId: 'lead-abcdef12',
    sessionId: 'abcdef1234567890',
    isSidechain: false,
    model: 'claude-opus-4-6',
    lastSeen: '2025-01-01T00:00:00Z',
    lastEvent: 'LeadRun',
    tokenTotal: 1200,
    costUsd: 0.22,
    error: 0,
    latencyMs: 30
  },
  {
    agentId: 'agent-abc',
    sessionId: 'abcdef1234567890',
    isSidechain: true,
    model: 'claude-haiku-4-5',
    lastSeen: '2025-01-01T00:00:01Z',
    lastEvent: 'ChildRun',
    tokenTotal: 200,
    costUsd: 0.02,
    error: 0,
    latencyMs: 20
  },
  {
    agentId: 'solo-agent',
    sessionId: '',
    isSidechain: false,
    model: 'claude-sonnet-4-6',
    lastSeen: '2025-01-01T00:00:02Z',
    lastEvent: 'SoloRun',
    tokenTotal: 500,
    costUsd: 0.05,
    error: 0,
    latencyMs: 15
  }
];

describe('agentRowHtml', () => {
  it('renders a root agent row with cost and relative time', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'lead-abc',
      model: 'claude-3',
      lastSeen: new Date(now - 30_000).toISOString(),
      error: 1,
      tokenTotal: 5000,
      costUsd: 0.1234,
      lastEvent: 'TaskComplete',
      latencyMs: 42
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('<tr>'));
    assert.ok(html.includes('lead-abc'));
    assert.ok(html.includes('42 ms'));
    assert.ok(html.includes('$0.1234'));
    assert.ok(html.includes('30초 전'));
    // model should be in tooltip, not as separate column
    assert.ok(html.includes('claude-3'));
    assert.ok(!html.includes('<span class="model-badge">'));
  });

  it('renders child agent row with tree-branch prefix', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'sub-xyz',
      model: '',
      lastSeen: new Date(now - 3_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'Run',
      latencyMs: null
    };
    const html = agentRowHtml(row, true, false, now);
    assert.ok(html.includes('tree-child'));
    assert.ok(html.includes('tree-branch'));
  });

  it('renders last-child with tree-last class', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'sub-xyz',
      model: '',
      lastSeen: new Date(now - 3_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'Done',
      latencyMs: null
    };
    const html = agentRowHtml(row, true, true, now);
    assert.ok(html.includes('tree-last'));
  });

  it('shows model in agent title tooltip', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'agent-1',
      model: 'opus-4',
      lastSeen: new Date(now - 3_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'X',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('title="agent-1 | opus-4"'));
  });

  it('shows dash when latencyMs is null', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'agent-2',
      model: 'opus',
      lastSeen: new Date(now - 3_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'Y',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('<td>-</td>'));
  });

  it('escapes agentId in title attribute', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: '<xss>',
      model: '',
      lastSeen: new Date(now - 3_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'Z',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('&lt;xss&gt;'));
    assert.ok(!html.includes('<xss>'));
  });

  it('includes active activity dot when lastSeen is recent', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'agent-1',
      model: 'claude-3',
      lastSeen: new Date(now - 3_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'Run',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('activity-dot--active'));
  });

  it('includes idle activity dot when lastSeen is old', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'agent-2',
      model: '',
      lastSeen: new Date(now - 300_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'Done',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('activity-dot--idle'));
  });

  it('includes recent activity dot between 30s and 2min', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'agent-3',
      model: '',
      lastSeen: new Date(now - 60_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'X',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('activity-dot--recent'));
  });

  it('shows last seen absolute time in tooltip', () => {
    resetDisplayNames();
    const now = Date.now();
    const lastSeen = new Date(now - 90_000).toISOString();
    const row = {
      agentId: 'agent-4',
      model: '',
      lastSeen,
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'X',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('1분 전'));
    // tooltip should contain a title attribute (absolute time)
    assert.match(html, /title="[^"]+"/);
  });

  it('shows empty tooltip when lastSeen is null', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'agent-null',
      model: '',
      lastSeen: null,
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'X',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('title=""'));
    assert.ok(html.includes('>-<'));
  });

  it('renders cost as $0.0000 when costUsd is zero', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'agent-5',
      model: '',
      lastSeen: new Date(now - 3_000).toISOString(),
      error: 0,
      tokenTotal: 0,
      costUsd: 0,
      lastEvent: 'X',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    assert.ok(html.includes('$0.0000'));
  });

  it('does not render Total, OK, Warn columns', () => {
    resetDisplayNames();
    const now = Date.now();
    const row = {
      agentId: 'agent-6',
      model: '',
      lastSeen: new Date(now - 3_000).toISOString(),
      total: 10,
      ok: 8,
      warning: 1,
      error: 1,
      tokenTotal: 100,
      costUsd: 0,
      lastEvent: 'X',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false, now);
    // should have exactly 7 <td> columns
    const tdCount = (html.match(/<td/g) || []).length;
    assert.equal(tdCount, 7);
  });
});

describe('renderAgents', () => {
  it('renders a collapsible tree root for session leads and keeps standalone agents visible', () => {
    resetDisplayNames();
    const root = makeRoot();
    renderAgents(treeAgents, root, 'all');

    assert.ok(root.innerHTML.includes('class="tree-toggle"'));
    assert.ok(root.innerHTML.includes('aria-expanded="true"'));
    assert.ok(root.innerHTML.includes('세션 abcdef12... · 하위 1개'));
    assert.ok(root.innerHTML.includes('solo-agent'));
    assert.ok(root.innerHTML.includes('data-tree-parent="abcdef1234567890"'));
    assert.equal((root.innerHTML.match(/\shidden(?=[\s>])/g) || []).length, 0);
  });

  it('hides child rows for collapsed tree keys and prunes stale keys', () => {
    resetDisplayNames();
    const root = makeRoot();
    root.dataset.collapsedTreeKeys = JSON.stringify(['abcdef1234567890', 'stale-key']);

    renderAgents(treeAgents, root, 'all');

    assert.equal(root.dataset.collapsedTreeKeys, JSON.stringify(['abcdef1234567890']));
    assert.ok(root.innerHTML.includes('aria-expanded="false"'));
    assert.equal((root.innerHTML.match(/\shidden(?=[\s>])/g) || []).length, 1);
  });
});

describe('toggleAgentTreeNode', () => {
  it('toggles collapsed tree state on the render root dataset', () => {
    const root = makeRoot();

    toggleAgentTreeNode(root, 'abcdef1234567890');
    assert.equal(root.dataset.collapsedTreeKeys, JSON.stringify(['abcdef1234567890']));

    toggleAgentTreeNode(root, 'abcdef1234567890');
    assert.equal(root.dataset.collapsedTreeKeys, undefined);
  });
});
