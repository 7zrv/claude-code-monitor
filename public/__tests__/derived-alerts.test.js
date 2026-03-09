import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { annotateSessionsWithState } from '../lib/session-status.js';
import { buildDerivedSessionAlerts, mergeAlertsForPanel } from '../lib/derived-alerts.js';

describe('buildDerivedSessionAlerts', () => {
  it('surfaces stuck and failed session state reasons as derived alerts', () => {
    const alerts = buildDerivedSessionAlerts([
      {
        sessionId: 'sess-failed',
        lastSeen: '2026-01-01T00:00:20Z',
        error: 2,
        needsAttentionReasons: ['failed']
      },
      {
        sessionId: 'sess-stuck',
        lastSeen: '2026-01-01T00:00:10Z',
        needsAttentionReasons: ['stuck', 'warning']
      }
    ], { generatedAt: '2026-01-01T00:00:30Z' });

    assert.deepEqual(alerts, [
      {
        id: 'derived:failed:sess-failed',
        source: 'derived-session',
        severity: 'error',
        event: 'SessionFailed',
        message: 'Session entered failed state (2 errors)',
        createdAt: '2026-01-01T00:00:20Z',
        sessionId: 'sess-failed',
        agentId: '',
        derivedReason: 'failed'
      },
      {
        id: 'derived:stuck:sess-stuck',
        source: 'derived-session',
        severity: 'warning',
        event: 'SessionStuck',
        message: 'No session activity for 2m+ without a terminal event',
        createdAt: '2026-01-01T00:00:10Z',
        sessionId: 'sess-stuck',
        agentId: '',
        derivedReason: 'stuck'
      }
    ]);
  });

  it('surfaces custom-rule cost spikes from annotated session rows', () => {
    const sessions = [{
      sessionId: 'sess-risk',
      lastSeen: '2026-01-01T00:00:20Z',
      tokenTotal: 19_000,
      costUsd: 0.35,
      agentIds: ['agent-1']
    }];
    const agents = [{
      agentId: 'agent-1',
      sessionId: 'sess-risk',
      total: 3,
      warning: 0,
      error: 0
    }];
    const sessionRows = annotateSessionsWithState(
      sessions,
      agents,
      new Date('2026-01-01T00:00:25Z').getTime(),
      { costUsdThreshold: 0.3, tokenTotalThreshold: 30_000, warningCountThreshold: 2 }
    );

    const alerts = buildDerivedSessionAlerts(sessionRows, { generatedAt: '2026-01-01T00:00:30Z' });

    assert.equal(alerts.length, 1);
    assert.deepEqual(alerts[0], {
      id: 'derived:cost_spike:sess-risk',
      source: 'derived-session',
      severity: 'warning',
      event: 'SessionCostSpike',
      message: 'Configured cost/token threshold exceeded ($0.3500, 19000 tokens)',
      createdAt: '2026-01-01T00:00:20Z',
      sessionId: 'sess-risk',
      agentId: '',
      derivedReason: 'cost_spike'
    });
  });

  it('ignores session reasons without a derived alert builder', () => {
    const alerts = buildDerivedSessionAlerts([
      {
        sessionId: 'sess-stuck',
        lastSeen: '2026-01-01T00:00:00Z',
        needsAttentionReasons: ['warning']
      }
    ]);

    assert.deepEqual(alerts, []);
  });
});

describe('mergeAlertsForPanel', () => {
  it('merges raw alerts with derived session alerts by recency', () => {
    const rawAlerts = [{
      id: 'raw-1',
      severity: 'error',
      agentId: 'agent-1',
      event: 'TaskFailed',
      message: 'boom',
      createdAt: '2026-01-01T00:00:10Z'
    }];
    const sessionRows = [
      {
        sessionId: 'sess-risk',
        lastSeen: '2026-01-01T00:00:20Z',
        costUsd: 0.6,
        tokenTotal: 22_000,
        needsAttentionReasons: ['cost_spike']
      },
      {
        sessionId: 'sess-stuck',
        lastSeen: '2026-01-01T00:00:08Z',
        needsAttentionReasons: ['stuck']
      }
    ];

    const merged = mergeAlertsForPanel(rawAlerts, sessionRows, {
      generatedAt: '2026-01-01T00:00:30Z'
    });

    assert.deepEqual(merged.map((alert) => alert.id), ['derived:cost_spike:sess-risk', 'raw-1', 'derived:stuck:sess-stuck']);
    assert.equal(merged[1], rawAlerts[0]);
  });

  it('keeps raw alerts ahead of derived alerts when timestamps tie', () => {
    const rawAlerts = [{
      id: 'raw-1',
      severity: 'warning',
      agentId: 'agent-1',
      event: 'TaskWarning',
      message: 'warn',
      createdAt: '2026-01-01T00:00:20Z'
    }];
    const sessionRows = [{
      sessionId: 'sess-risk',
      lastSeen: '2026-01-01T00:00:20Z',
      costUsd: 0.6,
      tokenTotal: 22_000,
      needsAttentionReasons: ['cost_spike']
    }];

    const merged = mergeAlertsForPanel(rawAlerts, sessionRows);

    assert.deepEqual(merged.map((alert) => alert.id), ['raw-1', 'derived:cost_spike:sess-risk']);
  });
});
