import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { alertItemHtml, getAlertContext, drilldownHtml, resetAlertSelection } from '../lib/renders/alerts.js';

function makeAlert(overrides = {}) {
  return {
    id: 'alert-1',
    severity: 'error',
    agentId: 'agent-abc',
    event: 'TaskFailed',
    message: 'Something went wrong',
    createdAt: '2025-01-01T12:00:00Z',
    ...overrides
  };
}

function makeEvent(overrides = {}) {
  return {
    id: 'e1',
    agentId: 'agent-abc',
    event: 'TaskStart',
    status: 'ok',
    message: 'started',
    receivedAt: '2025-01-01T11:59:00Z',
    metadata: {},
    model: 'claude-3',
    ...overrides
  };
}

function makeSnapshot(overrides = {}) {
  return {
    recent: [],
    agents: [],
    ...overrides
  };
}

// ── resetAlertSelection ──

describe('resetAlertSelection', () => {
  it('does not throw when called', () => {
    assert.doesNotThrow(() => resetAlertSelection());
  });
});

// ── alertItemHtml ──

describe('alertItemHtml', () => {
  it('includes time, agentId, event, message, and severity pill', () => {
    const html = alertItemHtml(makeAlert());
    assert.ok(html.includes('data-alert-id="alert-1"'));
    assert.ok(html.includes('agent-abc'));
    assert.ok(html.includes('TaskFailed'));
    assert.ok(html.includes('Something went wrong'));
    assert.ok(html.includes('data-status="error"'));
  });

  it('adds selected class when isSelected is true', () => {
    const html = alertItemHtml(makeAlert(), true);
    assert.ok(html.includes('alert-item--selected'));
  });

  it('does not add selected class when isSelected is false', () => {
    const html = alertItemHtml(makeAlert(), false);
    assert.ok(!html.includes('alert-item--selected'));
  });

  it('escapes XSS in alert fields', () => {
    const html = alertItemHtml(makeAlert({
      agentId: '<script>alert(1)</script>',
      event: '<img onerror=x>',
      message: '"><b>xss</b>'
    }));
    assert.ok(!html.includes('<script>'));
    assert.ok(!html.includes('<img'));
    assert.ok(!html.includes('"><b>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

// ── getAlertContext ──

describe('getAlertContext', () => {
  it('returns recent events for the same agentId (max 5)', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent({ id: `e${i}`, agentId: 'agent-abc' })
    );
    const snapshot = makeSnapshot({ recent: events });
    const ctx = getAlertContext('agent-abc', snapshot);
    assert.equal(ctx.recentEvents.length, 5);
  });

  it('filters only matching agentId events', () => {
    const events = [
      makeEvent({ agentId: 'agent-abc' }),
      makeEvent({ agentId: 'agent-xyz' }),
      makeEvent({ agentId: 'agent-abc' })
    ];
    const snapshot = makeSnapshot({ recent: events });
    const ctx = getAlertContext('agent-abc', snapshot);
    assert.equal(ctx.recentEvents.length, 2);
    assert.ok(ctx.recentEvents.every((e) => e.agentId === 'agent-abc'));
  });

  it('finds agentState from snapshot.agents', () => {
    const agents = [
      { agentId: 'agent-abc', model: 'claude-3', tokenTotal: 5000 },
      { agentId: 'agent-xyz', model: 'opus', tokenTotal: 100 }
    ];
    const snapshot = makeSnapshot({ agents });
    const ctx = getAlertContext('agent-abc', snapshot);
    assert.deepEqual(ctx.agentState, agents[0]);
  });

  it('returns null agentState when agent not found', () => {
    const snapshot = makeSnapshot({ agents: [] });
    const ctx = getAlertContext('agent-abc', snapshot);
    assert.equal(ctx.agentState, null);
  });

  it('returns empty context when snapshot is null', () => {
    const ctx = getAlertContext('agent-abc', null);
    assert.deepEqual(ctx, { recentEvents: [], agentState: null });
  });
});

// ── drilldownHtml ──

describe('drilldownHtml', () => {
  it('includes the full alert message', () => {
    const alert = makeAlert({ message: 'Detailed error description' });
    const ctx = { recentEvents: [], agentState: null };
    const html = drilldownHtml(alert, ctx);
    assert.ok(html.includes('Detailed error description'));
  });

  it('includes a close button with data-drilldown-close', () => {
    const html = drilldownHtml(makeAlert(), { recentEvents: [], agentState: null });
    assert.ok(html.includes('data-drilldown-close'));
  });

  it('renders recent context events', () => {
    const events = [
      makeEvent({ event: 'TaskStart', message: 'begin' }),
      makeEvent({ event: 'ToolCall', message: 'bash' })
    ];
    const html = drilldownHtml(makeAlert(), { recentEvents: events, agentState: null });
    assert.ok(html.includes('TaskStart'));
    assert.ok(html.includes('ToolCall'));
  });

  it('shows agent state when available', () => {
    const agentState = { agentId: 'agent-abc', model: 'claude-3', tokenTotal: 5000, total: 10, ok: 8, warning: 1, error: 1 };
    const html = drilldownHtml(makeAlert(), { recentEvents: [], agentState });
    assert.ok(html.includes('claude-3'));
    assert.ok(html.includes('5000'));
  });

  it('shows tool name and input for tool_call events', () => {
    const events = [
      makeEvent({
        event: 'tool_call',
        message: 'bash',
        metadata: { toolInput: { command: 'ls -la' } }
      })
    ];
    const html = drilldownHtml(makeAlert(), { recentEvents: events, agentState: null });
    assert.ok(html.includes('bash'));
    assert.ok(html.includes('ls -la'));
  });

  it('escapes HTML in all fields', () => {
    const alert = makeAlert({ message: '<script>xss</script>' });
    const html = drilldownHtml(alert, { recentEvents: [], agentState: null });
    assert.ok(!html.includes('<script>xss</script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });

  it('shows empty state message when no context events', () => {
    const html = drilldownHtml(makeAlert(), { recentEvents: [], agentState: null });
    assert.ok(html.includes('data-drilldown-close'));
  });
});
