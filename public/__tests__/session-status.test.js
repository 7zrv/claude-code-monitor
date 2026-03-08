import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { annotateSessionsWithState, deriveSessionState, toWorkflowStatus } from '../lib/session-status.js';

describe('deriveSessionState', () => {
  it('returns failed when error count is present', () => {
    const row = { error: 1, warning: 0, total: 3, lastSeen: '2026-01-01T00:00:00Z' };
    assert.equal(deriveSessionState(row), 'failed');
  });

  it('returns active when work is recent', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 10_000;
    const row = { error: 0, warning: 0, total: 2, lastSeen };
    assert.equal(deriveSessionState(row, now), 'active');
  });

  it('returns stuck when warning count is present', () => {
    const row = { error: 0, warning: 2, total: 4, lastSeen: '2026-01-01T00:00:00Z' };
    assert.equal(deriveSessionState(row), 'stuck');
  });

  it('returns completed when work is older than two minutes', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 180_000;
    const row = { error: 0, warning: 0, total: 5, lastSeen };
    assert.equal(deriveSessionState(row, now), 'completed');
  });

  it('returns idle when work is between 30 seconds and two minutes old', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 60_000;
    const row = { error: 0, warning: 0, total: 5, lastSeen };
    assert.equal(deriveSessionState(row, now), 'idle');
  });

  it('returns idle when lastSeen is missing', () => {
    const row = { error: 0, warning: 0, total: 0, lastSeen: null };
    assert.equal(deriveSessionState(row), 'idle');
  });
});

describe('toWorkflowStatus', () => {
  it('maps active to running', () => {
    assert.equal(toWorkflowStatus('active'), 'running');
  });

  it('maps stuck to at-risk', () => {
    assert.equal(toWorkflowStatus('stuck'), 'at-risk');
  });

  it('maps failed to blocked', () => {
    assert.equal(toWorkflowStatus('failed'), 'blocked');
  });

  it('maps completed to completed', () => {
    assert.equal(toWorkflowStatus('completed'), 'completed');
  });

  it('maps idle to idle', () => {
    assert.equal(toWorkflowStatus('idle'), 'idle');
  });
});

describe('annotateSessionsWithState', () => {
  it('aggregates agent totals by session and annotates active state', () => {
    const sessions = [{ sessionId: 'sess-1', lastSeen: '2026-01-01T00:00:00Z', tokenTotal: 100, costUsd: 0.01, agentIds: ['a1', 'a2'] }];
    const agents = [
      { agentId: 'a1', sessionId: 'sess-1', total: 2, warning: 0, error: 0 },
      { agentId: 'a2', sessionId: 'sess-1', total: 1, warning: 0, error: 0 }
    ];
    const rows = annotateSessionsWithState(sessions, agents, new Date('2026-01-01T00:00:10Z').getTime());

    assert.equal(rows[0].total, 3);
    assert.equal(rows[0].warning, 0);
    assert.equal(rows[0].error, 0);
    assert.equal(rows[0].sessionState, 'active');
  });

  it('marks a session as stuck when any agent warning exists', () => {
    const sessions = [{ sessionId: 'sess-1', lastSeen: '2026-01-01T00:00:00Z', tokenTotal: 100, costUsd: 0.01, agentIds: ['a1'] }];
    const agents = [{ agentId: 'a1', sessionId: 'sess-1', total: 2, warning: 1, error: 0 }];
    const rows = annotateSessionsWithState(sessions, agents);

    assert.equal(rows[0].sessionState, 'stuck');
  });
});
