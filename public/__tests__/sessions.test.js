import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { getSessionExportAttrs, renderSessionsList, renderSessionDetail, renderSessionDetailMeta } from '../lib/renders/sessions.js';

function makeRoot() {
  return { innerHTML: '', dataset: {}, onclick: null };
}

const baseSessions = [
  { sessionId: 's1', lastSeen: '2025-01-01T00:00:10Z', tokenTotal: 500, costUsd: 0.05, agentIds: ['a1'], sessionState: 'active' },
  { sessionId: 's2', lastSeen: '2025-01-01T00:00:20Z', tokenTotal: 1000, costUsd: 0.10, agentIds: ['a1', 'a2'], sessionState: 'completed' }
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
    assert.ok(root.innerHTML.includes('아직 세션이 없습니다'));
  });

  it('shows collection path guidance in empty sessions state', () => {
    renderSessionsList([], root, () => {});
    assert.ok(root.innerHTML.includes('~/.claude/projects/'));
  });

  it('includes session cost and token info', () => {
    renderSessionsList(baseSessions, root, () => {});
    assert.ok(root.innerHTML.includes('500'));
    assert.ok(root.innerHTML.includes('0.05'));
  });

  it('includes session state badge', () => {
    renderSessionsList(baseSessions, root, () => {});
    assert.ok(root.innerHTML.includes('data-status="active"'));
    assert.ok(root.innerHTML.includes('data-status="completed"'));
  });

  it('marks the selected session row', () => {
    renderSessionsList(baseSessions, root, () => {}, { selectedSessionId: 's2' });
    assert.ok(root.innerHTML.includes('session-item--selected'));
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

describe('renderSessionDetailMeta', () => {
  let root;
  beforeEach(() => { root = makeRoot(); });

  it('renders empty workspace guidance when no session is selected', () => {
    renderSessionDetailMeta(null, root);
    assert.ok(root.innerHTML.includes('세션을 선택하세요'));
  });

  it('renders summary stats and attention reasons for the selected session', () => {
    renderSessionDetailMeta({
      sessionId: 's1',
      sessionState: 'failed',
      lastSeen: '2025-01-01T00:00:10Z',
      tokenTotal: 500,
      costUsd: 0.05,
      agentIds: ['a1', 'a2'],
      needsAttentionRank: 400,
      needsAttentionReasons: ['failed']
    }, root);
    assert.ok(root.innerHTML.includes('Attention Rank'));
    assert.ok(root.innerHTML.includes('오류 발생'));
    assert.ok(root.innerHTML.includes('data-status="failed"'));
  });
});

describe('getSessionExportAttrs', () => {
  it('builds a same-origin export link and safe filename', () => {
    const attrs = getSessionExportAttrs('sess 1/alpha');
    assert.equal(attrs.href, '/api/sessions/sess%201%2Falpha/export');
    assert.equal(attrs.download, 'session-sess_1_alpha.json');
  });

  it('falls back to a stable filename when session id is blank', () => {
    const attrs = getSessionExportAttrs('   ');
    assert.equal(attrs.download, 'session-detail.json');
  });
});
