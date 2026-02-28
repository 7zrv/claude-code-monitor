import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { recalcWorkflow } from '../lib/workflow.js';

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

  it('maps agent with total > 0 (no errors/warnings) to running status', () => {
    const agents = [
      { agentId: 'coder', error: 0, warning: 0, total: 7, lastEvent: 'code', lastSeen: '2026-01-01T00:00:00Z' }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result[0].status, 'running');
  });

  it('maps agent with total 0 to idle status', () => {
    const agents = [
      { agentId: 'idle-agent', error: 0, warning: 0, total: 0, lastEvent: '-', lastSeen: null }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result[0].status, 'idle');
  });

  it('preserves all agent fields in output', () => {
    const agents = [
      { agentId: 'alpha', error: 0, warning: 0, total: 3, lastEvent: 'ping', lastSeen: '2026-02-28T12:00:00Z' }
    ];
    const result = recalcWorkflow(agents);
    assert.deepStrictEqual(result[0], {
      roleId: 'alpha',
      active: true,
      status: 'running',
      total: 3,
      lastEvent: 'ping',
      lastSeen: '2026-02-28T12:00:00Z'
    });
  });

  it('handles multiple agents with different statuses', () => {
    const agents = [
      { agentId: 'a', error: 1, warning: 0, total: 5, lastEvent: 'e1', lastSeen: 't1' },
      { agentId: 'b', error: 0, warning: 2, total: 3, lastEvent: 'e2', lastSeen: 't2' },
      { agentId: 'c', error: 0, warning: 0, total: 1, lastEvent: 'e3', lastSeen: 't3' }
    ];
    const result = recalcWorkflow(agents);
    assert.equal(result.length, 3);
    assert.equal(result[0].status, 'blocked');
    assert.equal(result[1].status, 'at-risk');
    assert.equal(result[2].status, 'running');
  });

  it('status priority: error > warning > total > idle', () => {
    const agent = { agentId: 'x', error: 1, warning: 5, total: 10, lastEvent: 'e', lastSeen: 't' };
    const result = recalcWorkflow([agent]);
    assert.equal(result[0].status, 'blocked');
  });
});
