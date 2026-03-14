import { beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  compareNeedsAttentionSessions,
  normalizeNeedsAttentionSession,
  renderNeedsAttention,
  selectNeedsAttentionSessions
} from '../lib/needs-attention.js';

function makeRoot() {
  return { innerHTML: '', onclick: null };
}

describe('normalizeNeedsAttentionSession', () => {
  it('falls back to failed session state when shared fields are missing', () => {
    const row = normalizeNeedsAttentionSession({ sessionId: 's1', sessionState: 'failed' });
    assert.equal(row.needsAttention, true);
    assert.equal(row.needsAttentionRank, 400);
    assert.deepEqual(row.needsAttentionReasons, ['failed']);
  });

  it('preserves explicit shared contract fields when present', () => {
    const row = normalizeNeedsAttentionSession({
      sessionId: 's2',
      sessionState: 'active',
      needsAttention: true,
      needsAttentionRank: 300,
      needsAttentionReasons: ['warning', 'cost_spike']
    });
    assert.equal(row.needsAttention, true);
    assert.equal(row.needsAttentionRank, 300);
    assert.deepEqual(row.needsAttentionReasons, ['warning', 'cost_spike']);
  });
});

describe('compareNeedsAttentionSessions', () => {
  it('sorts by rank, then lastSeen, then cost, then tokens', () => {
    const rows = [
      { sessionId: 'tokens', needsAttentionRank: 300, lastSeen: '2025-01-01T00:00:00Z', costUsd: 0.1, tokenTotal: 900 },
      { sessionId: 'recent', needsAttentionRank: 300, lastSeen: '2025-01-01T00:01:00Z', costUsd: 0.1, tokenTotal: 100 },
      { sessionId: 'cost', needsAttentionRank: 300, lastSeen: '2025-01-01T00:00:00Z', costUsd: 0.3, tokenTotal: 100 },
      { sessionId: 'top', needsAttentionRank: 500, lastSeen: '2025-01-01T00:00:00Z', costUsd: 0.1, tokenTotal: 100 }
    ];

    const ordered = [...rows].sort(compareNeedsAttentionSessions).map((row) => row.sessionId);
    assert.deepEqual(ordered, ['top', 'recent', 'cost', 'tokens']);
  });
});

describe('selectNeedsAttentionSessions', () => {
  it('filters out non-attention sessions and applies fallback state sorting', () => {
    const rows = selectNeedsAttentionSessions([
      { sessionId: 'idle', sessionState: 'idle' },
      { sessionId: 'stuck', sessionState: 'stuck', lastSeen: '2025-01-01T00:01:00Z' },
      { sessionId: 'failed', sessionState: 'failed', lastSeen: '2025-01-01T00:00:00Z' }
    ]);

    assert.deepEqual(rows.map((row) => row.sessionId), ['failed', 'stuck']);
  });
});

describe('renderNeedsAttention', () => {
  let root;

  beforeEach(() => {
    root = makeRoot();
  });

  it('renders empty copy when there are no matching sessions', () => {
    renderNeedsAttention([{ sessionId: 'idle', sessionState: 'idle' }], root, () => {});
    assert.ok(root.innerHTML.includes('현재 바로 개입이 필요한 세션이 없습니다'));
    assert.equal(root.onclick, null);
  });

  it('renders attention rows with reasons and metadata', () => {
    renderNeedsAttention([
      {
        sessionId: 'sess-1',
        sessionState: 'active',
        needsAttention: true,
        needsAttentionRank: 300,
        needsAttentionReasons: ['warning', 'cost_spike'],
        lastSeen: '2025-01-01T00:00:00Z',
        tokenTotal: 1234,
        costUsd: 0.75,
        agentIds: ['a1', 'a2']
      }
    ], root, () => {});

    assert.ok(root.innerHTML.includes('sess-1'));
    assert.ok(root.innerHTML.includes('경고 누적'));
    assert.ok(root.innerHTML.includes('비용 급증'));
    assert.ok(root.innerHTML.includes('tokens: 1234'));
    assert.ok(root.innerHTML.includes('cost: $0.7500'));
  });

  it('renders displayName as the primary label when provided', () => {
    renderNeedsAttention([
      {
        sessionId: 'sess-uuid-1234',
        displayName: '로그인 버그 수정',
        sessionState: 'stuck',
        needsAttention: true,
        needsAttentionRank: 300,
        needsAttentionReasons: ['stuck'],
        lastSeen: '2025-01-01T00:00:00Z',
        tokenTotal: 100,
        costUsd: 0.01,
        agentIds: []
      }
    ], root, () => {});

    assert.ok(root.innerHTML.includes('로그인 버그 수정'));
    assert.ok(!root.innerHTML.includes('>sess-uuid-1234<'));
  });

  it('shows shortSessionId when duplicate displayNames exist', () => {
    renderNeedsAttention([
      {
        sessionId: 'sess-uuid-1',
        displayName: '버그 수정',
        shortSessionId: 'abcd1234',
        sessionState: 'failed',
        needsAttention: true,
        needsAttentionRank: 400,
        needsAttentionReasons: ['failed'],
        lastSeen: '2025-01-01T00:00:00Z',
        tokenTotal: 100,
        costUsd: 0.01,
        agentIds: []
      },
      {
        sessionId: 'sess-uuid-2',
        displayName: '버그 수정',
        shortSessionId: 'efgh5678',
        sessionState: 'stuck',
        needsAttention: true,
        needsAttentionRank: 300,
        needsAttentionReasons: ['stuck'],
        lastSeen: '2025-01-01T00:00:00Z',
        tokenTotal: 200,
        costUsd: 0.02,
        agentIds: []
      }
    ], root, () => {});

    assert.ok(root.innerHTML.includes('abcd1234'));
    assert.ok(root.innerHTML.includes('efgh5678'));
  });

  it('does not show shortSessionId when displayNames are unique', () => {
    renderNeedsAttention([
      {
        sessionId: 'sess-uuid-1',
        displayName: '로그인 에러',
        shortSessionId: 'abcd1234',
        sessionState: 'failed',
        needsAttention: true,
        needsAttentionRank: 400,
        needsAttentionReasons: ['failed'],
        lastSeen: '2025-01-01T00:00:00Z',
        tokenTotal: 100,
        costUsd: 0.01,
        agentIds: []
      },
      {
        sessionId: 'sess-uuid-2',
        displayName: '빌드 실패',
        shortSessionId: 'efgh5678',
        sessionState: 'stuck',
        needsAttention: true,
        needsAttentionRank: 300,
        needsAttentionReasons: ['stuck'],
        lastSeen: '2025-01-01T00:00:00Z',
        tokenTotal: 200,
        costUsd: 0.02,
        agentIds: []
      }
    ], root, () => {});

    assert.ok(!root.innerHTML.includes('abcd1234'));
    assert.ok(!root.innerHTML.includes('efgh5678'));
  });

  it('wires row click back to the existing session detail handler', () => {
    let selected = '';
    renderNeedsAttention([{ sessionId: 'sess-2', sessionState: 'failed' }], root, (sessionId) => {
      selected = sessionId;
    });

    root.onclick({
      target: {
        closest(selector) {
          if (selector === '.attention-item[data-session-id]') {
            return { dataset: { sessionId: 'sess-2' } };
          }
          return null;
        }
      }
    });

    assert.equal(selected, 'sess-2');
  });
});
