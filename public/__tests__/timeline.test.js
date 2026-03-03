import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTimelineData, getEventColor } from '../lib/renders/timeline.js';

describe('buildTimelineData', () => {
  it('returns empty map for empty events', () => {
    const result = buildTimelineData([]);
    assert.equal(result.size, 0);
  });

  it('groups events by agentId', () => {
    const events = [
      { id: '1', agentId: 'a1', event: 'user_message', receivedAt: '2026-03-03T10:00:00Z' },
      { id: '2', agentId: 'a2', event: 'tool_call', receivedAt: '2026-03-03T10:00:01Z' },
      { id: '3', agentId: 'a1', event: 'assistant_message', receivedAt: '2026-03-03T10:00:02Z' }
    ];
    const result = buildTimelineData(events);
    assert.equal(result.size, 2);
    assert.equal(result.get('a1').length, 2);
    assert.equal(result.get('a2').length, 1);
  });

  it('limits to maxEvents most recent events', () => {
    const events = [];
    for (let i = 0; i < 10; i++) {
      events.push({
        id: String(i),
        agentId: 'a1',
        event: 'tool_call',
        receivedAt: new Date(Date.now() - (10 - i) * 1000).toISOString()
      });
    }
    const result = buildTimelineData(events, 5);
    const a1 = result.get('a1');
    assert.equal(a1.length, 5);
    // should keep the 5 most recent
    assert.equal(a1[0].id, '5');
    assert.equal(a1[4].id, '9');
  });

  it('defaults maxEvents to 50', () => {
    const events = [];
    for (let i = 0; i < 60; i++) {
      events.push({
        id: String(i),
        agentId: 'a1',
        event: 'tool_call',
        receivedAt: new Date(Date.now() - (60 - i) * 1000).toISOString()
      });
    }
    const result = buildTimelineData(events);
    const a1 = result.get('a1');
    assert.equal(a1.length, 50);
  });

  it('sorts events within each agent by receivedAt ascending', () => {
    const events = [
      { id: '1', agentId: 'a1', event: 'user_message', receivedAt: '2026-03-03T10:00:05Z' },
      { id: '2', agentId: 'a1', event: 'tool_call', receivedAt: '2026-03-03T10:00:01Z' },
      { id: '3', agentId: 'a1', event: 'assistant_message', receivedAt: '2026-03-03T10:00:03Z' }
    ];
    const result = buildTimelineData(events);
    const a1 = result.get('a1');
    assert.equal(a1[0].id, '2');
    assert.equal(a1[1].id, '3');
    assert.equal(a1[2].id, '1');
  });

  it('handles events with missing agentId', () => {
    const events = [
      { id: '1', event: 'user_message', receivedAt: '2026-03-03T10:00:00Z' }
    ];
    const result = buildTimelineData(events);
    assert.equal(result.size, 1);
    assert.ok(result.has('unknown'));
  });
});

describe('getEventColor', () => {
  it('returns blue for user_message', () => {
    assert.equal(getEventColor('user_message', 'ok'), '#4E79A7');
  });

  it('returns purple for tool_call', () => {
    assert.equal(getEventColor('tool_call', 'ok'), '#B07AA1');
  });

  it('returns green for assistant_message', () => {
    assert.equal(getEventColor('assistant_message', 'ok'), '#59A14F');
  });

  it('returns red for error status regardless of event type', () => {
    assert.equal(getEventColor('user_message', 'error'), '#C93A3A');
    assert.equal(getEventColor('tool_call', 'error'), '#C93A3A');
    assert.equal(getEventColor('assistant_message', 'error'), '#C93A3A');
  });

  it('returns gray fallback for unknown event type', () => {
    const color = getEventColor('unknown_type', 'ok');
    assert.equal(color, '#888888');
  });

  it('returns warning color for warning status', () => {
    assert.equal(getEventColor('user_message', 'warning'), '#D4850A');
  });
});
