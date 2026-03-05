import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { renderSessionsList, renderSessionDetail } from '../lib/renders/sessions.js';

function makeRoot() {
  return { innerHTML: '', dataset: {} };
}

const baseSessions = [
  { sessionId: 's1', lastSeen: '2025-01-01T00:00:10Z', tokenTotal: 500, costUsd: 0.05, agentIds: ['a1'] },
  { sessionId: 's2', lastSeen: '2025-01-01T00:00:20Z', tokenTotal: 1000, costUsd: 0.10, agentIds: ['a1', 'a2'] }
];

describe('renderSessionsList', () => {
  let root;
  beforeEach(() => { root = makeRoot(); });

  it('renders session items for each session', () => {
    renderSessionsList(baseSessions, root, () => {});
    assert.ok(root.innerHTML.includes('s1'));
    assert.ok(root.innerHTML.includes('s2'));
  });

  it('renders empty message when no sessions', () => {
    renderSessionsList([], root, () => {});
    assert.ok(root.innerHTML.includes('세션 없음'));
  });

  it('includes session cost and token info', () => {
    renderSessionsList(baseSessions, root, () => {});
    assert.ok(root.innerHTML.includes('500'));
    assert.ok(root.innerHTML.includes('0.05'));
  });
});

describe('renderSessionDetail', () => {
  let root;
  beforeEach(() => { root = makeRoot(); });

  it('renders event list', () => {
    const events = [
      { id: 'e1', agentId: 'a1', event: 'msg', status: 'ok', message: 'hello', receivedAt: '2025-01-01T00:00:00Z', model: '', metadata: {} }
    ];
    renderSessionDetail(events, root);
    assert.ok(root.innerHTML.includes('msg'));
    assert.ok(root.innerHTML.includes('hello'));
  });

  it('renders empty message when no events', () => {
    renderSessionDetail([], root);
    assert.ok(root.innerHTML.includes('이벤트 없음'));
  });
});
