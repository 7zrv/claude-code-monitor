import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ALERT_RULES } from '../lib/alert-rules.js';
import { annotateSessionsWithState, deriveRiskSignals, deriveSessionState, toWorkflowStatus } from '../lib/session-status.js';

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

  it('keeps warning-only sessions active when work is recent', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 10_000;
    const row = { error: 0, warning: 2, total: 4, lastSeen, lastEvent: 'assistant_message' };
    assert.equal(deriveSessionState(row, now), 'active');
  });

  it('returns stuck when work is older than two minutes without a terminal hint', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 180_000;
    const row = { error: 0, warning: 0, total: 5, lastSeen, lastEvent: 'assistant_message' };
    assert.equal(deriveSessionState(row, now), 'stuck');
  });

  it('returns completed when work is older than two minutes with a terminal hint', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 180_000;
    const row = { error: 0, warning: 0, total: 5, lastSeen, lastEvent: 'done' };
    assert.equal(deriveSessionState(row, now), 'completed');
  });

  it('returns completed after the long fallback window without a terminal hint', () => {
    const lastSeen = '2026-01-01T00:00:00Z';
    const now = new Date(lastSeen).getTime() + 960_000;
    const row = { error: 0, warning: 0, total: 5, lastSeen, lastEvent: 'assistant_message' };
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

describe('deriveRiskSignals', () => {
  it('marks failed sessions as needing attention', () => {
    const signals = deriveRiskSignals({ sessionState: 'failed', warning: 0, costUsd: 0.01, tokenTotal: 100 });
    assert.equal(signals.needsAttention, true);
    assert.deepEqual(signals.needsAttentionReasons, ['failed']);
    assert.equal(signals.needsAttentionRank, 400);
    assert.equal(signals.isCostSpike, false);
  });

  it('marks stuck sessions as needing attention', () => {
    const signals = deriveRiskSignals({ sessionState: 'stuck', warning: 0, costUsd: 0.01, tokenTotal: 100 });
    assert.equal(signals.needsAttention, true);
    assert.deepEqual(signals.needsAttentionReasons, ['stuck']);
    assert.equal(signals.needsAttentionRank, 300);
  });

  it('marks high-cost sessions as cost spikes even when active', () => {
    const signals = deriveRiskSignals({ sessionState: 'active', warning: 0, costUsd: 0.75, tokenTotal: 100 });
    assert.equal(signals.needsAttention, true);
    assert.deepEqual(signals.needsAttentionReasons, ['cost_spike']);
    assert.equal(signals.needsAttentionRank, 100);
    assert.equal(signals.isCostSpike, true);
  });

  it('sums composite reasons in priority order', () => {
    const signals = deriveRiskSignals({ sessionState: 'stuck', warning: 1, costUsd: 0.75, tokenTotal: 25_000 });
    assert.equal(signals.needsAttention, true);
    assert.deepEqual(signals.needsAttentionReasons, ['stuck', 'warning', 'cost_spike']);
    assert.equal(signals.needsAttentionRank, 600);
    assert.equal(signals.isCostSpike, true);
  });

  it('uses custom warning thresholds without changing stuck state semantics', () => {
    const signals = deriveRiskSignals(
      { sessionState: 'stuck', warning: 1, costUsd: 0.01, tokenTotal: 100 },
      Date.now(),
      { ...DEFAULT_ALERT_RULES, warningCountThreshold: 2 }
    );
    assert.equal(signals.needsAttention, true);
    assert.deepEqual(signals.needsAttentionReasons, ['stuck']);
    assert.equal(signals.needsAttentionRank, 300);
  });

  it('uses custom cost thresholds when evaluating cost spikes', () => {
    const signals = deriveRiskSignals(
      { sessionState: 'active', warning: 0, costUsd: 0.4, tokenTotal: 18_000 },
      Date.now(),
      { costUsdThreshold: 0.3, tokenTotalThreshold: 25_000, warningCountThreshold: 1 }
    );
    assert.equal(signals.needsAttention, true);
    assert.deepEqual(signals.needsAttentionReasons, ['cost_spike']);
    assert.equal(signals.isCostSpike, true);
  });

  it('falls back to low-risk values when data is sparse', () => {
    const signals = deriveRiskSignals({ sessionState: 'idle', warning: 0, costUsd: 0, tokenTotal: 0 });
    assert.equal(signals.needsAttention, false);
    assert.deepEqual(signals.needsAttentionReasons, []);
    assert.equal(signals.needsAttentionRank, 0);
    assert.equal(signals.isCostSpike, false);
  });
});

describe('annotateSessionsWithState', () => {
  it('aggregates agent totals by session and annotates active state', () => {
    const sessions = [{ sessionId: 'sess-1', lastSeen: '2026-01-01T00:00:00Z', tokenTotal: 100, costUsd: 0.01, agentIds: ['a1', 'a2'] }];
    const agents = [
      { agentId: 'a1', sessionId: 'sess-1', total: 2, warning: 0, error: 0, lastEvent: 'assistant_message', lastSeen: '2026-01-01T00:00:00Z' },
      { agentId: 'a2', sessionId: 'sess-1', total: 1, warning: 0, error: 0, lastEvent: 'tool_call', lastSeen: '2026-01-01T00:00:00Z' }
    ];
    const rows = annotateSessionsWithState(sessions, agents, new Date('2026-01-01T00:00:10Z').getTime());

    assert.equal(rows[0].total, 3);
    assert.equal(rows[0].warning, 0);
    assert.equal(rows[0].error, 0);
    assert.equal(rows[0].sessionState, 'active');
    assert.equal(rows[0].needsAttention, false);
    assert.equal(rows[0].needsAttentionRank, 0);
    assert.deepEqual(rows[0].needsAttentionReasons, []);
    assert.equal(rows[0].isCostSpike, false);
  });

  it('keeps a warning session active when activity is recent', () => {
    const sessions = [{ sessionId: 'sess-1', lastSeen: '2026-01-01T00:00:00Z', tokenTotal: 100, costUsd: 0.01, agentIds: ['a1'] }];
    const agents = [{ agentId: 'a1', sessionId: 'sess-1', total: 2, warning: 1, error: 0, lastEvent: 'assistant_message', lastSeen: '2026-01-01T00:00:00Z' }];
    const rows = annotateSessionsWithState(sessions, agents, new Date('2026-01-01T00:00:10Z').getTime());

    assert.equal(rows[0].sessionState, 'active');
    assert.equal(rows[0].needsAttention, true);
    assert.equal(rows[0].needsAttentionRank, 200);
    assert.deepEqual(rows[0].needsAttentionReasons, ['warning']);
  });

  it('marks a session as stuck after prolonged inactivity without a terminal hint', () => {
    const sessions = [{ sessionId: 'sess-1', lastSeen: '2026-01-01T00:00:00Z', tokenTotal: 100, costUsd: 0.01, agentIds: ['a1'] }];
    const agents = [{ agentId: 'a1', sessionId: 'sess-1', total: 2, warning: 1, error: 0, lastEvent: 'assistant_message', lastSeen: '2026-01-01T00:00:00Z' }];
    const rows = annotateSessionsWithState(sessions, agents, new Date('2026-01-01T00:03:00Z').getTime());

    assert.equal(rows[0].sessionState, 'stuck');
    assert.equal(rows[0].needsAttention, true);
    assert.equal(rows[0].needsAttentionRank, 500);
    assert.deepEqual(rows[0].needsAttentionReasons, ['stuck', 'warning']);
  });

  it('marks a session as completed when the latest agent event is terminal', () => {
    const sessions = [{ sessionId: 'sess-1', lastSeen: '2026-01-01T00:00:00Z', tokenTotal: 100, costUsd: 0.01, agentIds: ['a1'] }];
    const agents = [{ agentId: 'a1', sessionId: 'sess-1', total: 2, warning: 0, error: 0, lastEvent: 'done', lastSeen: '2026-01-01T00:00:00Z' }];
    const rows = annotateSessionsWithState(sessions, agents, new Date('2026-01-01T00:03:00Z').getTime());

    assert.equal(rows[0].sessionState, 'completed');
    assert.equal(rows[0].needsAttention, false);
  });

  it('marks a session as a cost spike from accumulated session fields', () => {
    const sessions = [{ sessionId: 'sess-1', lastSeen: '2026-01-01T00:00:00Z', tokenTotal: 21_000, costUsd: 0.51, agentIds: ['a1'] }];
    const agents = [{ agentId: 'a1', sessionId: 'sess-1', total: 2, warning: 0, error: 0, lastEvent: 'assistant_message', lastSeen: '2026-01-01T00:00:00Z' }];
    const rows = annotateSessionsWithState(sessions, agents, new Date('2026-01-01T00:00:10Z').getTime());

    assert.equal(rows[0].sessionState, 'active');
    assert.equal(rows[0].needsAttention, true);
    assert.equal(rows[0].isCostSpike, true);
    assert.equal(rows[0].needsAttentionRank, 100);
    assert.deepEqual(rows[0].needsAttentionReasons, ['cost_spike']);
  });

  it('threads custom rules through annotateSessionsWithState', () => {
    const sessions = [{ sessionId: 'sess-1', lastSeen: '2026-01-01T00:00:00Z', tokenTotal: 19_000, costUsd: 0.35, agentIds: ['a1'] }];
    const agents = [{ agentId: 'a1', sessionId: 'sess-1', total: 2, warning: 1, error: 0, lastEvent: 'assistant_message', lastSeen: '2026-01-01T00:00:00Z' }];
    const rows = annotateSessionsWithState(
      sessions,
      agents,
      new Date('2026-01-01T00:00:10Z').getTime(),
      { costUsdThreshold: 0.3, tokenTotalThreshold: 30_000, warningCountThreshold: 2 }
    );

    assert.equal(rows[0].sessionState, 'active');
    assert.equal(rows[0].needsAttention, true);
    assert.equal(rows[0].isCostSpike, true);
    assert.deepEqual(rows[0].needsAttentionReasons, ['cost_spike']);
    assert.equal(rows[0].needsAttentionRank, 100);
  });
});
