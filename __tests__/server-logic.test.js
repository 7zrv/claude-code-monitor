import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { roleProgressRow, buildSnapshot } from '../server-logic.js';

describe('roleProgressRow', () => {
  it('returns idle when roleId is not in byAgent', () => {
    const byAgent = new Map();
    const result = roleProgressRow(byAgent, 'unknown');
    assert.deepStrictEqual(result, {
      roleId: 'unknown',
      active: false,
      status: 'idle',
      total: 0,
      lastEvent: '-',
      lastSeen: null
    });
  });

  it('returns blocked when agent has errors', () => {
    const byAgent = new Map([
      ['agent-a', { agentId: 'agent-a', lastSeen: '2026-01-01T00:00:00Z', total: 5, ok: 3, warning: 1, error: 1, lastEvent: 'deploy', latencyMs: 100 }]
    ]);
    const result = roleProgressRow(byAgent, 'agent-a');
    assert.equal(result.status, 'blocked');
    assert.equal(result.active, true);
    assert.equal(result.total, 5);
  });

  it('returns at-risk when agent has warnings but no errors', () => {
    const byAgent = new Map([
      ['agent-b', { agentId: 'agent-b', lastSeen: '2026-01-01T00:00:00Z', total: 3, ok: 2, warning: 1, error: 0, lastEvent: 'build', latencyMs: 50 }]
    ]);
    const result = roleProgressRow(byAgent, 'agent-b');
    assert.equal(result.status, 'at-risk');
    assert.equal(result.active, true);
  });

  it('returns running when agent has only ok events', () => {
    const byAgent = new Map([
      ['agent-c', { agentId: 'agent-c', lastSeen: '2026-01-01T00:00:00Z', total: 10, ok: 10, warning: 0, error: 0, lastEvent: 'heartbeat', latencyMs: 20 }]
    ]);
    const result = roleProgressRow(byAgent, 'agent-c');
    assert.equal(result.status, 'running');
    assert.equal(result.active, true);
    assert.equal(result.total, 10);
  });
});

describe('buildSnapshot', () => {
  it('returns empty workflowProgress when byAgent is empty', () => {
    const state = {
      recent: [],
      alerts: [],
      byAgent: new Map(),
      bySource: new Map()
    };
    const snap = buildSnapshot(state);
    assert.deepStrictEqual(snap.workflowProgress, []);
    assert.equal(snap.totals.agents, 0);
  });

  it('generates workflowProgress dynamically from byAgent keys', () => {
    const state = {
      recent: [],
      alerts: [],
      byAgent: new Map([
        ['frontend', { agentId: 'frontend', lastSeen: '2026-01-01T00:00:00Z', total: 2, ok: 2, warning: 0, error: 0, lastEvent: 'render', latencyMs: 10 }],
        ['backend', { agentId: 'backend', lastSeen: '2026-01-01T00:00:00Z', total: 3, ok: 3, warning: 0, error: 0, lastEvent: 'query', latencyMs: 30 }]
      ]),
      bySource: new Map()
    };
    const snap = buildSnapshot(state);
    assert.equal(snap.workflowProgress.length, 2);
    assert.equal(snap.workflowProgress[0].roleId, 'backend');
    assert.equal(snap.workflowProgress[1].roleId, 'frontend');
  });

  it('sorts workflowProgress alphabetically by agent key', () => {
    const state = {
      recent: [],
      alerts: [],
      byAgent: new Map([
        ['zulu', { agentId: 'zulu', lastSeen: '2026-01-01T00:00:00Z', total: 1, ok: 1, warning: 0, error: 0, lastEvent: 'ping', latencyMs: 5 }],
        ['alpha', { agentId: 'alpha', lastSeen: '2026-01-01T00:00:00Z', total: 1, ok: 1, warning: 0, error: 0, lastEvent: 'ping', latencyMs: 5 }],
        ['mike', { agentId: 'mike', lastSeen: '2026-01-01T00:00:00Z', total: 1, ok: 1, warning: 0, error: 0, lastEvent: 'ping', latencyMs: 5 }]
      ]),
      bySource: new Map()
    };
    const snap = buildSnapshot(state);
    const ids = snap.workflowProgress.map(r => r.roleId);
    assert.deepStrictEqual(ids, ['alpha', 'mike', 'zulu']);
  });
});
