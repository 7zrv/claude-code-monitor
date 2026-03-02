import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getFilteredEvents, renderEventDetail } from '../lib/renders/events.js';

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

describe('renderEventDetail', () => {
  it('renders tool_call with tool name and input JSON', () => {
    const evt = makeEvt({
      event: 'tool_call',
      message: 'Read',
      metadata: {
        source: 'claude_session',
        toolInput: { file_path: '/tmp/test.js' }
      }
    });
    const html = renderEventDetail(evt);
    assert.ok(html.includes('Read'), 'should include tool name');
    assert.ok(html.includes('file_path'), 'should include input param key');
    assert.ok(html.includes('/tmp/test.js'), 'should include input param value');
    assert.ok(html.includes('event-detail-json'), 'should use json style class');
  });

  it('renders token_usage with separated token counts', () => {
    const evt = makeEvt({
      event: 'token_usage',
      message: 'tokens +1500',
      metadata: {
        source: 'claude_session',
        tokenUsage: {
          inputTokens: 1000,
          outputTokens: 400,
          cacheReadInputTokens: 100,
          totalTokens: 1500
        }
      }
    });
    const html = renderEventDetail(evt);
    assert.ok(html.includes('1000'), 'should show input tokens');
    assert.ok(html.includes('400'), 'should show output tokens');
    assert.ok(html.includes('100'), 'should show cache read tokens');
    assert.ok(html.includes('1500'), 'should show total tokens');
    assert.ok(html.includes('event-detail-tokens'), 'should use tokens grid class');
    assert.ok(html.includes('event-detail-copy'), 'should include copy button');
  });

  it('renders error event with error highlight', () => {
    const evt = makeEvt({
      event: 'api_error',
      status: 'error',
      message: 'Rate limit exceeded',
      metadata: { source: 'claude_session', errorCode: 429 }
    });
    const html = renderEventDetail(evt);
    assert.ok(html.includes('Rate limit exceeded'), 'should show error message');
    assert.ok(html.includes('event-detail--error'), 'should use error highlight class');
    assert.ok(html.includes('429'), 'should include metadata details');
  });

  it('renders generic metadata as formatted JSON', () => {
    const evt = makeEvt({
      event: 'session_start',
      metadata: { source: 'claude_session', sessionId: 'abc-123' }
    });
    const html = renderEventDetail(evt);
    assert.ok(html.includes('abc-123'), 'should include metadata value');
    assert.ok(html.includes('event-detail-json'), 'should use json style class');
  });

  it('shows no metadata message when metadata is empty', () => {
    const evt = makeEvt({ metadata: {} });
    const html = renderEventDetail(evt);
    assert.ok(html.includes('No metadata'), 'should show no metadata message');
  });

  it('escapes HTML in metadata values to prevent XSS', () => {
    const evt = makeEvt({
      metadata: { payload: '<script>alert("xss")</script>' }
    });
    const html = renderEventDetail(evt);
    assert.ok(!html.includes('<script>'), 'should not contain raw script tag');
    assert.ok(html.includes('&lt;script&gt;'), 'should contain escaped script tag');
  });

  it('includes copy button for tool_call events', () => {
    const evt = makeEvt({
      event: 'tool_call',
      message: 'Bash',
      metadata: { toolInput: { command: 'ls' } }
    });
    const html = renderEventDetail(evt);
    assert.ok(html.includes('event-detail-copy'), 'should include copy button');
  });
});
