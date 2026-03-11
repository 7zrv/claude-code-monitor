import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSessionExportAttrs,
  renderSessionsList,
  renderSessionDetail,
  renderSessionDetailMeta,
  selectSessionsForList
} from '../lib/renders/sessions.js';
import { resetDisplayNames } from '../lib/agent-display.js';

function makeRoot() {
  return { innerHTML: '', dataset: {}, onclick: null };
}

const baseSessions = [
  {
    sessionId: 's1',
    lastSeen: '2025-01-01T00:00:10Z',
    tokenTotal: 500,
    costUsd: 0.05,
    agentIds: ['a1'],
    sessionState: 'active',
    needsAttention: false,
    needsAttentionRank: 0,
    needsAttentionReasons: []
  },
  {
    sessionId: 's2',
    lastSeen: '2025-01-01T00:00:20Z',
    tokenTotal: 1000,
    costUsd: 0.1,
    agentIds: ['a1', 'a2'],
    sessionState: 'completed',
    needsAttention: true,
    needsAttentionRank: 300,
    needsAttentionReasons: ['stuck']
  }
];

describe('selectSessionsForList', () => {
  it('sorts sessions by risk, recency, cost, then token total', () => {
    const sessions = [
      {
        sessionId: 'idle-most-recent',
        lastSeen: '2025-01-01T00:00:50Z',
        costUsd: 1.5,
        tokenTotal: 5000,
        needsAttentionRank: 0,
        needsAttention: false,
        sessionState: 'idle',
        agentIds: []
      },
      {
        sessionId: 'higher-cost',
        lastSeen: '2025-01-01T00:00:20Z',
        costUsd: 0.6,
        tokenTotal: 50,
        needsAttentionRank: 300,
        needsAttention: true,
        sessionState: 'active',
        agentIds: []
      },
      {
        sessionId: 'same-cost-more-tokens',
        lastSeen: '2025-01-01T00:00:20Z',
        costUsd: 0.4,
        tokenTotal: 900,
        needsAttentionRank: 300,
        needsAttention: true,
        sessionState: 'active',
        agentIds: []
      },
      {
        sessionId: 'same-cost-fewer-tokens',
        lastSeen: '2025-01-01T00:00:20Z',
        costUsd: 0.4,
        tokenTotal: 200,
        needsAttentionRank: 300,
        needsAttention: true,
        sessionState: 'active',
        agentIds: []
      },
      {
        sessionId: 'recent-warning',
        lastSeen: '2025-01-01T00:00:30Z',
        costUsd: 0.05,
        tokenTotal: 100,
        needsAttentionRank: 300,
        needsAttention: true,
        sessionState: 'active',
        agentIds: []
      },
      {
        sessionId: 'critical',
        lastSeen: '2025-01-01T00:00:00Z',
        costUsd: 0.01,
        tokenTotal: 10,
        needsAttentionRank: 500,
        needsAttention: true,
        sessionState: 'failed',
        agentIds: []
      }
    ];

    const result = selectSessionsForList(sessions);

    assert.deepEqual(
      result.map((session) => session.sessionId),
      ['critical', 'recent-warning', 'higher-cost', 'same-cost-more-tokens', 'same-cost-fewer-tokens', 'idle-most-recent']
    );
  });

  it('filters sessions by quick filter and search query', () => {
    const sessions = [
      {
        sessionId: 'alpha-risk',
        lastSeen: '2025-01-01T00:00:10Z',
        costUsd: 0.7,
        tokenTotal: 25000,
        needsAttentionRank: 100,
        needsAttention: true,
        needsAttentionReasons: ['cost_spike'],
        sessionState: 'active',
        agentIds: ['writer-1']
      },
      {
        sessionId: 'beta-done',
        lastSeen: '2025-01-01T00:00:20Z',
        costUsd: 0.1,
        tokenTotal: 1000,
        needsAttentionRank: 0,
        needsAttention: false,
        needsAttentionReasons: [],
        sessionState: 'completed',
        agentIds: ['reviewer-2']
      }
    ];

    assert.deepEqual(
      selectSessionsForList(sessions, { quickFilter: 'needs-attention' }).map((session) => session.sessionId),
      ['alpha-risk']
    );
    assert.deepEqual(
      selectSessionsForList(sessions, { quickFilter: 'completed' }).map((session) => session.sessionId),
      ['beta-done']
    );
    assert.deepEqual(
      selectSessionsForList(sessions, { query: 'WRITER-1' }).map((session) => session.sessionId),
      ['alpha-risk']
    );
    assert.deepEqual(
      selectSessionsForList(sessions, { query: 'cost_spike' }).map((session) => session.sessionId),
      ['alpha-risk']
    );
  });
});

describe('renderSessionsList', () => {
  let root;

  beforeEach(() => {
    root = makeRoot();
  });

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

  it('shows filtered-empty copy when sessions exist but no rows match', () => {
    renderSessionsList([], root, () => {}, { sourceCount: 2 });
    assert.ok(root.innerHTML.includes('조건에 맞는 세션이 없습니다'));
  });

  it('includes session cost and token info', () => {
    renderSessionsList(baseSessions, root, () => {});
    assert.ok(root.innerHTML.includes('500'));
    assert.ok(root.innerHTML.includes('0.0500'));
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

  it('keeps click-through wired to the selected session id', () => {
    let selectedSessionId = '';
    renderSessionsList(baseSessions, root, (sessionId) => {
      selectedSessionId = sessionId;
    });

    root.onclick({
      target: {
        closest(selector) {
          assert.equal(selector, '.session-item[data-session-id]');
          return { dataset: { sessionId: 's2' } };
        }
      }
    });

    assert.equal(selectedSessionId, 's2');
  });
});

describe('renderSessionDetail', () => {
  let root;

  beforeEach(() => {
    root = makeRoot();
  });

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

  beforeEach(() => {
    root = makeRoot();
    resetDisplayNames();
  });

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

  it('renders session participants and linked alerts in the detail summary', () => {
    renderSessionDetailMeta({
      sessionId: 's1',
      sessionState: 'active',
      lastSeen: '2025-01-01T00:00:10Z',
      tokenTotal: 500,
      costUsd: 0.05,
      agentIds: ['lead-1', 'sub-2'],
      needsAttentionRank: 100,
      needsAttentionReasons: ['cost_spike']
    }, root, {
      sessionAgents: [
        { agentId: 'lead-1', model: 'claude-opus-4-6' },
        { agentId: 'sub-2', model: 'claude-sonnet-4-6' }
      ],
      sessionAlerts: [
        {
          id: 'derived:stuck:s1',
          severity: 'warning',
          event: 'SessionStuck',
          message: 'No session activity for 2m+ without a terminal event'
        }
      ]
    });

    assert.ok(root.innerHTML.includes('Participants'));
    assert.ok(root.innerHTML.includes('Lead (Opus)'));
    assert.ok(root.innerHTML.includes('Sub (Sonnet)'));
    assert.ok(root.innerHTML.includes('Linked Alerts'));
    assert.ok(root.innerHTML.includes('data-session-alert-id="derived:stuck:s1"'));
    assert.ok(root.innerHTML.includes('SessionStuck'));
  });
});

describe('getSessionExportAttrs', () => {
  it('builds a same-origin export link and safe filename', () => {
    const attrs = getSessionExportAttrs('sess 1/alpha');
    assert.equal(
      attrs.href,
      '/api/sessions/sess%201%2Falpha/export?costUsdThreshold=0.5&tokenTotalThreshold=20000&warningCountThreshold=1'
    );
    assert.equal(attrs.download, 'session-sess_1_alpha.json');
  });

  it('includes sanitized custom alert rules in the export link', () => {
    const attrs = getSessionExportAttrs('sess-1', {
      costUsdThreshold: '1.25',
      tokenTotalThreshold: '30000.4',
      warningCountThreshold: 2
    });
    assert.equal(
      attrs.href,
      '/api/sessions/sess-1/export?costUsdThreshold=1.25&tokenTotalThreshold=30000&warningCountThreshold=2'
    );
  });

  it('falls back to a stable filename when session id is blank', () => {
    const attrs = getSessionExportAttrs('   ');
    assert.equal(attrs.download, 'session-detail.json');
  });
});
