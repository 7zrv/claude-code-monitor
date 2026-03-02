import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getFilteredEvents } from '../lib/renders/events.js';

function makeEvt(overrides = {}) {
  return {
    status: 'ok',
    event: 'test',
    message: 'msg',
    agentId: 'agent-1',
    receivedAt: new Date().toISOString(),
    ...overrides
  };
}

describe('getFilteredEvents', () => {
  it('returns all events when filters are neutral', () => {
    const events = [makeEvt(), makeEvt()];
    const result = getFilteredEvents(events, { status: 'all', limit: 50, query: '' });
    assert.equal(result.length, 2);
  });

  it('filters by status', () => {
    const events = [
      makeEvt({ status: 'ok' }),
      makeEvt({ status: 'warning' }),
      makeEvt({ status: 'error' })
    ];
    const result = getFilteredEvents(events, { status: 'warning', limit: 50, query: '' });
    assert.equal(result.length, 1);
    assert.equal(result[0].status, 'warning');
  });

  it('limits result count', () => {
    const events = Array.from({ length: 10 }, () => makeEvt());
    const result = getFilteredEvents(events, { status: 'all', limit: 3, query: '' });
    assert.equal(result.length, 3);
  });

  it('searches event field (case-insensitive)', () => {
    const events = [
      makeEvt({ event: 'TaskComplete' }),
      makeEvt({ event: 'SessionStart' })
    ];
    const result = getFilteredEvents(events, { status: 'all', limit: 50, query: 'task' });
    assert.equal(result.length, 1);
    assert.equal(result[0].event, 'TaskComplete');
  });

  it('searches message field', () => {
    const events = [
      makeEvt({ message: 'Build succeeded' }),
      makeEvt({ message: 'Test failed' })
    ];
    const result = getFilteredEvents(events, { status: 'all', limit: 50, query: 'failed' });
    assert.equal(result.length, 1);
  });

  it('searches agentId field', () => {
    const events = [
      makeEvt({ agentId: 'lead-001' }),
      makeEvt({ agentId: 'sub-002' })
    ];
    const result = getFilteredEvents(events, { status: 'all', limit: 50, query: 'lead' });
    assert.equal(result.length, 1);
  });

  it('returns empty for no matches', () => {
    const events = [makeEvt()];
    const result = getFilteredEvents(events, { status: 'all', limit: 50, query: 'zzz' });
    assert.equal(result.length, 0);
  });

  it('handles empty events array', () => {
    const result = getFilteredEvents([], { status: 'all', limit: 50, query: '' });
    assert.equal(result.length, 0);
  });
});
