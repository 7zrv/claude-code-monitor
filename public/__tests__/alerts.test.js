import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  alertItemHtml,
  getAlertContext,
  drilldownHtml,
  renderAlerts,
  resolveAlertSessionId,
  resetAlertSelection
} from '../lib/renders/alerts.js';

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

  it('includes linked session id when available', () => {
    const html = alertItemHtml(makeAlert(), false, 'sess-1');
    assert.ok(html.includes('data-session-id="sess-1"'));
  });

  it('uses a session label for session-derived alerts', () => {
    const html = alertItemHtml(makeAlert({ agentId: '', sessionId: 'sess-1' }), false, 'sess-1');
    assert.ok(html.includes('Session sess-1'));
  });
});

describe('resolveAlertSessionId', () => {
  it('prefers a direct session id on the alert', () => {
    const alert = makeAlert({ sessionId: 'sess-direct' });
    assert.equal(resolveAlertSessionId(alert, makeSnapshot()), 'sess-direct');
  });

  it('prefers agent state session id', () => {
    const alert = makeAlert();
    const snapshot = makeSnapshot({
      agents: [{ agentId: 'agent-abc', sessionId: 'sess-agent' }],
      recent: [{ agentId: 'agent-abc', sessionId: 'sess-event' }]
    });
    assert.equal(resolveAlertSessionId(alert, snapshot), 'sess-agent');
  });

  it('falls back to recent event session id', () => {
    const alert = makeAlert();
    const snapshot = makeSnapshot({
      agents: [],
      recent: [{ agentId: 'agent-abc', sessionId: 'sess-event' }]
    });
    assert.equal(resolveAlertSessionId(alert, snapshot), 'sess-event');
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
    assert.deepEqual(ctx, { recentEvents: [], agentState: null, linkedSessionId: '', contextLabel: '' });
  });

  it('includes linked session id in context when available', () => {
    const snapshot = makeSnapshot({
      agents: [{ agentId: 'agent-abc', sessionId: 'sess-1' }]
    });
    const ctx = getAlertContext('agent-abc', snapshot);
    assert.equal(ctx.linkedSessionId, 'sess-1');
  });

  it('uses session context for session-derived alerts', () => {
    const snapshot = makeSnapshot({
      recent: [
        makeEvent({ sessionId: 'sess-1', event: 'TaskStart' }),
        makeEvent({ agentId: 'agent-other', sessionId: 'sess-1', event: 'TaskProgress' }),
        makeEvent({ sessionId: 'sess-2', event: 'TaskOther' })
      ]
    });
    const ctx = getAlertContext({ sessionId: 'sess-1' }, snapshot);

    assert.equal(ctx.agentState, null);
    assert.equal(ctx.linkedSessionId, 'sess-1');
    assert.equal(ctx.contextLabel, 'sess-1');
    assert.deepEqual(ctx.recentEvents.map((event) => event.event), ['TaskStart', 'TaskProgress']);
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

  it('includes linked session section and open button when session exists', () => {
    const html = drilldownHtml(makeAlert(), { recentEvents: [], agentState: null, linkedSessionId: 'sess-1' });
    assert.ok(html.includes('Linked Session'));
    assert.ok(html.includes('data-session-open="sess-1"'));
  });

  it('uses the session id as recent-events context for derived alerts', () => {
    const html = drilldownHtml(
      makeAlert({ agentId: '', sessionId: 'sess-1' }),
      { recentEvents: [], agentState: null, linkedSessionId: 'sess-1', contextLabel: 'sess-1' }
    );
    assert.ok(html.includes('Recent Events (sess-1)'));
  });
});

describe('renderAlerts', () => {
  beforeEach(() => {
    resetAlertSelection();
  });

  function makeAlertsRoot() {
    return {
      innerHTML: '',
      onclick: null,
      querySelectorAll() {
        return [];
      }
    };
  }

  function makeDrilldownRoot() {
    return {
      innerHTML: '',
      hidden: true,
      onclick: null,
      setAttribute(name) {
        if (name === 'hidden') this.hidden = true;
      },
      removeAttribute(name) {
        if (name === 'hidden') this.hidden = false;
      }
    };
  }

  it('opens linked session on primary alert click when a session is resolvable', () => {
    const alertsRoot = makeAlertsRoot();
    const drilldownRoot = makeDrilldownRoot();
    const snapshot = makeSnapshot({
      agents: [{ agentId: 'agent-abc', sessionId: 'sess-1' }]
    });
    let openedSessionId = '';

    renderAlerts([makeAlert()], alertsRoot, drilldownRoot, snapshot, {
      onOpenSession(sessionId) {
        openedSessionId = sessionId;
      }
    });

    alertsRoot.onclick({
      target: {
        closest(selector) {
          if (selector === '[data-alert-id]') {
            return {
              dataset: { alertId: 'alert-1', sessionId: 'sess-1' },
              classList: { add() {}, remove() {} }
            };
          }
          return null;
        }
      }
    });

    assert.equal(openedSessionId, 'sess-1');
    assert.equal(drilldownRoot.hidden, false);
    assert.ok(drilldownRoot.innerHTML.includes('sess-1'));
  });

  it('keeps drilldown-only behavior when no linked session exists', () => {
    const alertsRoot = makeAlertsRoot();
    const drilldownRoot = makeDrilldownRoot();
    let openedSessionId = '';

    renderAlerts([makeAlert()], alertsRoot, drilldownRoot, makeSnapshot(), {
      onOpenSession(sessionId) {
        openedSessionId = sessionId;
      }
    });

    alertsRoot.onclick({
      target: {
        closest(selector) {
          if (selector === '[data-alert-id]') {
            return {
              dataset: { alertId: 'alert-1' },
              classList: { add() {}, remove() {} }
            };
          }
          return null;
        }
      }
    });

    assert.equal(openedSessionId, '');
    assert.equal(drilldownRoot.hidden, false);
  });

  it('opens a session-derived alert through its direct session link', () => {
    const alertsRoot = makeAlertsRoot();
    const drilldownRoot = makeDrilldownRoot();
    let openedSessionId = '';

    renderAlerts([makeAlert({
      id: 'derived:cost_spike:sess-derived',
      agentId: '',
      sessionId: 'sess-derived',
      event: 'SessionCostSpike'
    })], alertsRoot, drilldownRoot, makeSnapshot({
      recent: [makeEvent({ sessionId: 'sess-derived' })]
    }), {
      onOpenSession(sessionId) {
        openedSessionId = sessionId;
      }
    });

    alertsRoot.onclick({
      target: {
        closest(selector) {
          if (selector === '[data-alert-id]') {
            return {
              dataset: { alertId: 'derived:cost_spike:sess-derived', sessionId: 'sess-derived' },
              classList: { add() {}, remove() {} }
            };
          }
          return null;
        }
      }
    });

    assert.equal(openedSessionId, 'sess-derived');
    assert.equal(drilldownRoot.hidden, false);
    assert.ok(drilldownRoot.innerHTML.includes('sess-derived'));
  });
});
