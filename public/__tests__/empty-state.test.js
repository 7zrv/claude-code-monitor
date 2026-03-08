import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { isEmptySnapshot, renderEmptyState } from '../lib/empty-state.js';

describe('isEmptySnapshot', () => {
  it('returns true for null', () => {
    assert.equal(isEmptySnapshot(null), true);
  });

  it('returns true for undefined', () => {
    assert.equal(isEmptySnapshot(undefined), true);
  });

  it('returns true when agents, sessions, and recent are all empty arrays', () => {
    assert.equal(isEmptySnapshot({ agents: [], sessions: [], recent: [] }), true);
  });

  it('returns true when all fields are missing', () => {
    assert.equal(isEmptySnapshot({}), true);
  });

  it('returns false when agents has entries', () => {
    assert.equal(isEmptySnapshot({ agents: [{ agentId: 'a1' }], sessions: [], recent: [] }), false);
  });

  it('returns false when sessions has entries', () => {
    assert.equal(isEmptySnapshot({ agents: [], sessions: [{ sessionId: 's1' }], recent: [] }), false);
  });

  it('returns false when recent has entries', () => {
    assert.equal(isEmptySnapshot({ agents: [], sessions: [], recent: [{ id: 'e1' }] }), false);
  });

  it('returns false when all sections have data', () => {
    assert.equal(
      isEmptySnapshot({
        agents: [{ agentId: 'a1' }],
        sessions: [{ sessionId: 's1' }],
        recent: [{ id: 'e1' }]
      }),
      false
    );
  });

  it('treats non-array agents as empty', () => {
    assert.equal(isEmptySnapshot({ agents: null, sessions: [], recent: [] }), true);
  });
});

describe('renderEmptyState', () => {
  let el;
  beforeEach(() => {
    el = { innerHTML: '' };
  });

  it('renders content into the element', () => {
    renderEmptyState(el);
    assert.ok(el.innerHTML.length > 0);
  });

  it('includes the no-data title', () => {
    renderEmptyState(el);
    assert.ok(el.innerHTML.includes('아직 수집된 데이터가 없습니다'));
  });

  it('includes the projects collection path', () => {
    renderEmptyState(el);
    assert.ok(el.innerHTML.includes('~/.claude/projects/'));
  });

  it('includes the history.jsonl collection path', () => {
    renderEmptyState(el);
    assert.ok(el.innerHTML.includes('~/.claude/history.jsonl'));
  });

  it('mentions Claude Code', () => {
    renderEmptyState(el);
    assert.ok(el.innerHTML.includes('Claude Code'));
  });

  it('includes the empty-state class', () => {
    renderEmptyState(el);
    assert.ok(el.innerHTML.includes('class="empty-state"'));
  });

  it('does not include raw HTML-unsafe characters unescaped', () => {
    renderEmptyState(el);
    // No script tags injected
    assert.ok(!el.innerHTML.includes('<script'));
  });
});
