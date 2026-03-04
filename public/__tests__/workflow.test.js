import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recalcWorkflow, splitWorkflow } from '../lib/workflow.js';

describe('recalcWorkflow', () => {
  it('returns empty array when agents is empty', () => {
    const result = recalcWorkflow([]);
    assert.deepStrictEqual(result, []);
  });

  it('returns empty array when agents is undefined (default)', () => {
    const result = recalcWorkflow();
    assert.deepStrictEqual(result, []);
  });

  it('maps agent with errors to blocked status', () => {
    const agents = [
      { agentId: 'builder', error: 2, warning: 0, total: 5, lastEvent: 'build', lastSeen: '2026-01-01T00:00:00Z' }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result.length, 1);
    assert.equal(result[0].roleId, 'builder');
    assert.equal(result[0].status, 'blocked');
    assert.equal(result[0].active, true);
    assert.equal(result[0].total, 5);
  });

  it('maps agent with warnings (no errors) to at-risk status', () => {
    const agents = [
      { agentId: 'reviewer', error: 0, warning: 3, total: 10, lastEvent: 'review', lastSeen: '2026-01-01T00:00:00Z' }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result[0].status, 'at-risk');
  });

  it('maps agent with total > 0 and recent lastSeen to running status', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 10_000; // 10초 후
    const agents = [
      { agentId: 'coder', error: 0, warning: 0, total: 7, lastEvent: 'code', lastSeen }
    ];
    const result = recalcWorkflow(agents, now);
    assert.equal(result[0].status, 'running');
  });

  it('maps agent with total 0 and no lastSeen to idle status', () => {
    const agents = [
      { agentId: 'idle-agent', error: 0, warning: 0, total: 0, lastEvent: '-', lastSeen: null }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result[0].status, 'idle');
  });

  it('preserves all agent fields in output', () => {
    const lastSeen = '2026-02-28T12:00:00Z';
    const now = new Date(lastSeen).getTime() + 5_000; // 5초 후
    const agents = [
      { agentId: 'alpha', error: 0, warning: 0, total: 3, lastEvent: 'ping', lastSeen, model: 'claude-opus-4-6' }
    ];
    const result = recalcWorkflow(agents, now);
    assert.deepStrictEqual(result[0], {
      roleId: 'alpha',
      active: true,
      status: 'running',
      total: 3,
      lastEvent: 'ping',
      lastSeen,
      model: 'claude-opus-4-6',
      displayName: ''
    });
  });

  it('handles multiple agents with different statuses', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 5_000;
    const agents = [
      { agentId: 'a', error: 1, warning: 0, total: 5, lastEvent: 'e1', lastSeen },
      { agentId: 'b', error: 0, warning: 2, total: 3, lastEvent: 'e2', lastSeen },
      { agentId: 'c', error: 0, warning: 0, total: 1, lastEvent: 'e3', lastSeen }
    ];
    const result = recalcWorkflow(agents, now);
    assert.equal(result.length, 3);
    assert.equal(result[0].status, 'blocked');
    assert.equal(result[1].status, 'at-risk');
    assert.equal(result[2].status, 'running');
  });

  it('status priority: error > warning > total > idle', () => {
    const agent = { agentId: 'x', error: 1, warning: 5, total: 10, lastEvent: 'e', lastSeen: '2026-01-01T00:00:00Z' };
    const result = recalcWorkflow([agent]);
    assert.equal(result[0].status, 'blocked');
  });

  it('passes displayName from agent row', () => {
    const agents = [
      { agentId: 'a1', error: 0, warning: 0, total: 1, lastEvent: 'e', lastSeen: 't', displayName: 'Fix login bug' }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result[0].displayName, 'Fix login bug');
  });

  it('defaults displayName to empty string when missing', () => {
    const agents = [
      { agentId: 'a1', error: 0, warning: 0, total: 1, lastEvent: 'e', lastSeen: 't' }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result[0].displayName, '');
  });

  // --- 시간 기반 상태 테스트 ---

  it('completed when last_seen over 2 minutes', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 180_000; // 3분 후
    const agents = [
      { agentId: 'done', error: 0, warning: 0, total: 5, lastEvent: 'msg', lastSeen }
    ];
    const result = recalcWorkflow(agents, now);
    assert.equal(result[0].status, 'completed');
  });

  it('idle when last_seen between 30s and 2min', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 60_000; // 60초 후
    const agents = [
      { agentId: 'paused', error: 0, warning: 0, total: 5, lastEvent: 'msg', lastSeen }
    ];
    const result = recalcWorkflow(agents, now);
    assert.equal(result[0].status, 'idle');
  });

  it('running when last_seen under 30s', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 10_000; // 10초 후
    const agents = [
      { agentId: 'active', error: 0, warning: 0, total: 3, lastEvent: 'msg', lastSeen }
    ];
    const result = recalcWorkflow(agents, now);
    assert.equal(result[0].status, 'running');
  });

  it('blocked overrides time', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 600_000; // 10분 후
    const agents = [
      { agentId: 'err', error: 1, warning: 0, total: 5, lastEvent: 'err', lastSeen }
    ];
    const result = recalcWorkflow(agents, now);
    assert.equal(result[0].status, 'blocked');
  });

  it('at-risk overrides time', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 600_000; // 10분 후
    const agents = [
      { agentId: 'warn', error: 0, warning: 2, total: 5, lastEvent: 'warn', lastSeen }
    ];
    const result = recalcWorkflow(agents, now);
    assert.equal(result[0].status, 'at-risk');
  });

  it('invalid lastSeen string falls back to idle', () => {
    const agents = [
      { agentId: 'bad', error: 0, warning: 0, total: 5, lastEvent: 'msg', lastSeen: 'invalid-date' }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result[0].status, 'idle');
  });
});

describe('splitWorkflow', () => {
  it('separates active and completed sessions', () => {
    const rows = [
      { roleId: 'a', status: 'running', lastSeen: '2026-01-01T00:00:10Z' },
      { roleId: 'b', status: 'completed', lastSeen: '2026-01-01T00:00:05Z' },
      { roleId: 'c', status: 'blocked', lastSeen: '2026-01-01T00:00:08Z' },
      { roleId: 'd', status: 'idle', lastSeen: '2026-01-01T00:00:03Z' },
      { roleId: 'e', status: 'at-risk', lastSeen: '2026-01-01T00:00:07Z' },
    ];
    const { active, completed } = splitWorkflow(rows);
    assert.deepStrictEqual(active.map(r => r.roleId), ['a', 'c', 'e']);
    assert.deepStrictEqual(completed.map(r => r.roleId), ['b', 'd']);
  });

  it('sorts each group by lastSeen descending', () => {
    const rows = [
      { roleId: 'a', status: 'running', lastSeen: '2026-01-01T00:00:01Z' },
      { roleId: 'b', status: 'running', lastSeen: '2026-01-01T00:00:10Z' },
      { roleId: 'c', status: 'completed', lastSeen: '2026-01-01T00:00:05Z' },
      { roleId: 'd', status: 'completed', lastSeen: '2026-01-01T00:00:09Z' },
    ];
    const { active, completed } = splitWorkflow(rows);
    assert.deepStrictEqual(active.map(r => r.roleId), ['b', 'a']);
    assert.deepStrictEqual(completed.map(r => r.roleId), ['d', 'c']);
  });

  it('limits completed to 20', () => {
    const rows = Array.from({ length: 25 }, (_, i) => ({
      roleId: `c${i}`,
      status: 'completed',
      lastSeen: `2026-01-01T00:00:${String(i).padStart(2, '0')}Z`,
    }));
    const { completed } = splitWorkflow(rows);
    assert.equal(completed.length, 20);
    // newest first
    assert.equal(completed[0].roleId, 'c24');
  });

  it('returns empty arrays when no rows', () => {
    const { active, completed } = splitWorkflow([]);
    assert.deepStrictEqual(active, []);
    assert.deepStrictEqual(completed, []);
  });

  it('handles rows with null lastSeen', () => {
    const rows = [
      { roleId: 'a', status: 'running', lastSeen: '2026-01-01T00:00:10Z' },
      { roleId: 'b', status: 'idle', lastSeen: null },
    ];
    const { active, completed } = splitWorkflow(rows);
    assert.equal(active.length, 1);
    assert.equal(completed.length, 1);
  });
});
