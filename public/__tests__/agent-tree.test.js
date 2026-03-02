import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildAgentTree } from '../lib/agent-tree.js';

describe('buildAgentTree', () => {
  it('returns empty array for empty agents', () => {
    assert.deepStrictEqual(buildAgentTree([]), []);
  });

  it('groups lead and sub-agents by sessionId', () => {
    const agents = [
      { agentId: 'lead-abcdef12', sessionId: 'abcdef1234567890', isSidechain: false, model: 'claude-opus-4-6' },
      { agentId: 'agent-abc', sessionId: 'abcdef1234567890', isSidechain: true, model: 'claude-haiku-4-5' },
      { agentId: 'agent-def', sessionId: 'abcdef1234567890', isSidechain: true, model: 'claude-sonnet-4-6' }
    ];
    const tree = buildAgentTree(agents);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].agent.agentId, 'lead-abcdef12');
    assert.equal(tree[0].children.length, 2);
    assert.ok(tree[0].children.some((c) => c.agentId === 'agent-abc'));
    assert.ok(tree[0].children.some((c) => c.agentId === 'agent-def'));
  });

  it('handles standalone agents without sessionId', () => {
    const agents = [
      { agentId: 'solo', sessionId: '', isSidechain: false }
    ];
    const tree = buildAgentTree(agents);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].agent.agentId, 'solo');
    assert.equal(tree[0].children.length, 0);
  });

  it('handles multiple sessions', () => {
    const agents = [
      { agentId: 'lead-sess1aaa', sessionId: 'sess1aaa12345678', isSidechain: false },
      { agentId: 'agent-a', sessionId: 'sess1aaa12345678', isSidechain: true },
      { agentId: 'lead-sess2bbb', sessionId: 'sess2bbb12345678', isSidechain: false },
      { agentId: 'agent-b', sessionId: 'sess2bbb12345678', isSidechain: true }
    ];
    const tree = buildAgentTree(agents);
    assert.equal(tree.length, 2);
  });

  it('does not overwrite multiple leads with empty sessionId', () => {
    const agents = [
      { agentId: 'lead-aaa', sessionId: '', isSidechain: false },
      { agentId: 'lead-bbb', sessionId: '', isSidechain: false },
      { agentId: 'lead-ccc', sessionId: '', isSidechain: false }
    ];
    const tree = buildAgentTree(agents);
    assert.equal(tree.length, 3);
    const ids = tree.map((n) => n.agent.agentId).sort();
    assert.deepStrictEqual(ids, ['lead-aaa', 'lead-bbb', 'lead-ccc']);
  });

  it('treats sidechain without lead as standalone root', () => {
    const agents = [
      { agentId: 'agent-orphan', sessionId: 'orphan1234567890', isSidechain: true }
    ];
    const tree = buildAgentTree(agents);
    assert.equal(tree.length, 1);
    assert.equal(tree[0].agent.agentId, 'agent-orphan');
    assert.equal(tree[0].children.length, 0);
  });
});
