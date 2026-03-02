import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resetDisplayNames } from '../lib/agent-display.js';
import { agentRowHtml } from '../lib/renders/agents.js';

describe('agentRowHtml', () => {
  it('renders a root agent row', () => {
    resetDisplayNames();
    const row = {
      agentId: 'lead-abc',
      model: 'claude-3',
      lastSeen: '2024-01-01T00:00:00Z',
      total: 10,
      ok: 8,
      warning: 1,
      error: 1,
      tokenTotal: 5000,
      lastEvent: 'TaskComplete',
      latencyMs: 42
    };
    const html = agentRowHtml(row, false, false);
    assert.ok(html.includes('<tr>'));
    assert.ok(html.includes('lead-abc'));
    assert.ok(html.includes('claude-3'));
    assert.ok(html.includes('42 ms'));
  });

  it('renders child agent row with tree-branch prefix', () => {
    resetDisplayNames();
    const row = {
      agentId: 'sub-xyz',
      model: '',
      lastSeen: '2024-01-01T00:00:00Z',
      total: 3,
      ok: 3,
      warning: 0,
      error: 0,
      tokenTotal: 0,
      lastEvent: 'Run',
      latencyMs: null
    };
    const html = agentRowHtml(row, true, false);
    assert.ok(html.includes('tree-child'));
    assert.ok(html.includes('tree-branch'));
  });

  it('renders last-child with tree-last class', () => {
    resetDisplayNames();
    const row = {
      agentId: 'sub-xyz',
      model: '',
      lastSeen: '2024-01-01T00:00:00Z',
      total: 1,
      ok: 1,
      warning: 0,
      error: 0,
      tokenTotal: 0,
      lastEvent: 'Done',
      latencyMs: null
    };
    const html = agentRowHtml(row, true, true);
    assert.ok(html.includes('tree-last'));
  });

  it('shows dash when model is empty', () => {
    resetDisplayNames();
    const row = {
      agentId: 'agent-1',
      model: '',
      lastSeen: '2024-01-01T00:00:00Z',
      total: 1,
      ok: 1,
      warning: 0,
      error: 0,
      tokenTotal: 0,
      lastEvent: 'X',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false);
    assert.ok(html.includes('<td>-</td>'));
  });

  it('shows dash when latencyMs is null', () => {
    resetDisplayNames();
    const row = {
      agentId: 'agent-2',
      model: 'opus',
      lastSeen: '2024-01-01T00:00:00Z',
      total: 1,
      ok: 1,
      warning: 0,
      error: 0,
      tokenTotal: 0,
      lastEvent: 'Y',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false);
    assert.ok(html.includes('<td>-</td>'));
  });

  it('escapes agentId in title attribute', () => {
    resetDisplayNames();
    const row = {
      agentId: '<xss>',
      model: '',
      lastSeen: '2024-01-01T00:00:00Z',
      total: 1,
      ok: 1,
      warning: 0,
      error: 0,
      tokenTotal: 0,
      lastEvent: 'Z',
      latencyMs: null
    };
    const html = agentRowHtml(row, false, false);
    assert.ok(html.includes('&lt;xss&gt;'));
    assert.ok(!html.includes('<xss>'));
  });
});
