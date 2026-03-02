import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractAgentMeta, applyIncrementalEvent } from '../lib/state.js';

describe('extractAgentMeta', () => {
  it('extracts top-level model, isSidechain, sessionId', () => {
    const evt = { model: 'claude-3', isSidechain: true, sessionId: 'sess-1' };
    const meta = extractAgentMeta(evt);
    assert.equal(meta.model, 'claude-3');
    assert.equal(meta.isSidechain, true);
    assert.equal(meta.sessionId, 'sess-1');
  });

  it('falls back to metadata fields', () => {
    const evt = { metadata: { model: 'opus', isSidechain: false, sessionId: 's2' } };
    const meta = extractAgentMeta(evt);
    assert.equal(meta.model, 'opus');
    assert.equal(meta.isSidechain, false);
    assert.equal(meta.sessionId, 's2');
  });

  it('returns defaults when no metadata', () => {
    const meta = extractAgentMeta({});
    assert.equal(meta.model, '');
    assert.equal(meta.isSidechain, false);
    assert.equal(meta.sessionId, '');
  });
});

function makeState() {
  return {
    totals: { total: 0, ok: 0, warning: 0, error: 0, agents: 0, tokenTotal: 0 },
    agents: [],
    sources: [],
    recent: [],
    alerts: [],
    workflowProgress: [],
    generatedAt: ''
  };
}

function makeEvent(overrides = {}) {
  return {
    agentId: 'agent-1',
    status: 'ok',
    event: 'test-event',
    message: 'hello',
    receivedAt: new Date().toISOString(),
    metadata: {},
    ...overrides
  };
}

describe('applyIncrementalEvent', () => {
  it('increments totals for ok event', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ status: 'ok' }));
    assert.equal(state.totals.total, 1);
    assert.equal(state.totals.ok, 1);
    assert.equal(state.totals.warning, 0);
    assert.equal(state.totals.error, 0);
  });

  it('increments totals for warning event', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ status: 'warning' }));
    assert.equal(state.totals.warning, 1);
    assert.equal(state.totals.ok, 0);
  });

  it('increments totals for error event', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ status: 'error' }));
    assert.equal(state.totals.error, 1);
    assert.equal(state.totals.ok, 0);
  });

  it('creates new agent entry', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ agentId: 'a1', status: 'ok' }));
    assert.equal(state.agents.length, 1);
    assert.equal(state.agents[0].agentId, 'a1');
    assert.equal(state.agents[0].total, 1);
    assert.equal(state.agents[0].ok, 1);
    assert.equal(state.totals.agents, 1);
  });

  it('updates existing agent entry', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ agentId: 'a1', status: 'ok' }));
    applyIncrementalEvent(state, makeEvent({ agentId: 'a1', status: 'warning' }));
    assert.equal(state.agents.length, 1);
    assert.equal(state.agents[0].total, 2);
    assert.equal(state.agents[0].ok, 1);
    assert.equal(state.agents[0].warning, 1);
  });

  it('accumulates token totals', () => {
    const state = makeState();
    const evt = makeEvent({ metadata: { tokenUsage: { totalTokens: 500 } } });
    applyIncrementalEvent(state, evt);
    assert.equal(state.totals.tokenTotal, 500);
    assert.equal(state.agents[0].tokenTotal, 500);
  });

  it('creates source entry', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ metadata: { source: 'sse' }, status: 'ok' }));
    assert.equal(state.sources.length, 1);
    assert.equal(state.sources[0].source, 'sse');
    assert.equal(state.sources[0].total, 1);
    assert.equal(state.sources[0].ok, 1);
  });

  it('updates existing source entry', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ metadata: { source: 'sse' }, status: 'ok' }));
    applyIncrementalEvent(state, makeEvent({ metadata: { source: 'sse' }, status: 'error' }));
    assert.equal(state.sources.length, 1);
    assert.equal(state.sources[0].total, 2);
    assert.equal(state.sources[0].ok, 1);
    assert.equal(state.sources[0].error, 1);
  });

  it('defaults source to manual', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent());
    assert.equal(state.sources[0].source, 'manual');
  });

  it('adds event to recent list', () => {
    const state = makeState();
    const evt = makeEvent();
    applyIncrementalEvent(state, evt);
    assert.equal(state.recent.length, 1);
    assert.deepEqual(state.recent[0], evt);
  });

  it('caps recent at 200 entries', () => {
    const state = makeState();
    state.recent = Array.from({ length: 200 }, (_, i) => makeEvent({ event: `e-${i}` }));
    applyIncrementalEvent(state, makeEvent({ event: 'new' }));
    assert.equal(state.recent.length, 200);
    assert.equal(state.recent[0].event, 'new');
  });

  it('creates alert for warning event', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ status: 'warning', agentId: 'a1' }));
    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0].severity, 'warning');
    assert.equal(state.alerts[0].agentId, 'a1');
  });

  it('creates alert for error event', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ status: 'error' }));
    assert.equal(state.alerts.length, 1);
    assert.equal(state.alerts[0].severity, 'error');
  });

  it('does not create alert for ok event', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ status: 'ok' }));
    assert.equal(state.alerts.length, 0);
  });

  it('caps alerts at 20', () => {
    const state = makeState();
    state.alerts = Array.from({ length: 20 }, () => ({ id: 'old' }));
    applyIncrementalEvent(state, makeEvent({ status: 'error' }));
    assert.equal(state.alerts.length, 20);
    assert.equal(state.alerts[0].severity, 'error');
  });

  it('sorts agents by agentId', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ agentId: 'b-agent' }));
    applyIncrementalEvent(state, makeEvent({ agentId: 'a-agent' }));
    assert.equal(state.agents[0].agentId, 'a-agent');
    assert.equal(state.agents[1].agentId, 'b-agent');
  });

  it('sorts sources by source name', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent({ metadata: { source: 'z-src' } }));
    applyIncrementalEvent(state, makeEvent({ metadata: { source: 'a-src' } }));
    assert.equal(state.sources[0].source, 'a-src');
    assert.equal(state.sources[1].source, 'z-src');
  });

  it('updates generatedAt timestamp', () => {
    const state = makeState();
    applyIncrementalEvent(state, makeEvent());
    assert.ok(state.generatedAt);
  });
});
