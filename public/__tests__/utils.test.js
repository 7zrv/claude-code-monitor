import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, statusPill, normalizeText, getActivityStatus, activityDotHtml, countActiveAgents, relativeTime } from '../lib/utils.js';

describe('escapeHtml', () => {
  it('escapes & < > " \'', () => {
    assert.equal(escapeHtml('&<>"\''), '&amp;&lt;&gt;&quot;&#39;');
  });

  it('handles null and undefined', () => {
    assert.equal(escapeHtml(null), '');
    assert.equal(escapeHtml(undefined), '');
  });

  it('converts numbers to strings', () => {
    assert.equal(escapeHtml(42), '42');
  });

  it('returns empty string for empty input', () => {
    assert.equal(escapeHtml(''), '');
  });

  it('leaves safe text unchanged', () => {
    assert.equal(escapeHtml('hello world'), 'hello world');
  });
});

describe('statusPill', () => {
  it('returns span with data-status attribute', () => {
    const html = statusPill('ok');
    assert.ok(html.includes('data-status="ok"'));
    assert.ok(html.includes('class="status-pill"'));
    assert.ok(html.includes('>ok<'));
  });

  it('escapes status value in attribute and content', () => {
    const html = statusPill('<script>');
    assert.ok(html.includes('&lt;script&gt;'));
    assert.ok(!html.includes('<script>'));
  });
});

describe('normalizeText', () => {
  it('converts to lowercase', () => {
    assert.equal(normalizeText('Hello World'), 'hello world');
  });

  it('handles empty string', () => {
    assert.equal(normalizeText(''), '');
  });

  it('handles null and undefined', () => {
    assert.equal(normalizeText(null), '');
    assert.equal(normalizeText(undefined), '');
  });
});

describe('getActivityStatus', () => {
  it('returns active when lastSeen is within 30 seconds', () => {
    const now = Date.now();
    const lastSeen = new Date(now - 10_000).toISOString();
    assert.equal(getActivityStatus(lastSeen, now), 'active');
  });

  it('returns recent when lastSeen is between 30s and 2min', () => {
    const now = Date.now();
    const lastSeen = new Date(now - 60_000).toISOString();
    assert.equal(getActivityStatus(lastSeen, now), 'recent');
  });

  it('returns idle when lastSeen is over 2 minutes ago', () => {
    const now = Date.now();
    const lastSeen = new Date(now - 180_000).toISOString();
    assert.equal(getActivityStatus(lastSeen, now), 'idle');
  });

  it('returns recent at exactly 30 seconds boundary', () => {
    const now = Date.now();
    const lastSeen = new Date(now - 30_000).toISOString();
    assert.equal(getActivityStatus(lastSeen, now), 'recent');
  });

  it('returns idle at exactly 120 seconds boundary', () => {
    const now = Date.now();
    const lastSeen = new Date(now - 120_000).toISOString();
    assert.equal(getActivityStatus(lastSeen, now), 'idle');
  });

  it('returns idle when lastSeen is null', () => {
    assert.equal(getActivityStatus(null, Date.now()), 'idle');
  });

  it('returns idle when lastSeen is undefined', () => {
    assert.equal(getActivityStatus(undefined, Date.now()), 'idle');
  });
});

describe('activityDotHtml', () => {
  it('returns span with activity-dot class for active status', () => {
    const html = activityDotHtml('active');
    assert.ok(html.includes('activity-dot'));
    assert.ok(html.includes('activity-dot--active'));
  });

  it('returns span with recent modifier', () => {
    const html = activityDotHtml('recent');
    assert.ok(html.includes('activity-dot--recent'));
  });

  it('returns span with idle modifier', () => {
    const html = activityDotHtml('idle');
    assert.ok(html.includes('activity-dot--idle'));
  });

  it('escapes malicious status to prevent XSS', () => {
    const html = activityDotHtml('<script>');
    assert.ok(!html.includes('<script>'));
    assert.ok(html.includes('&lt;script&gt;'));
  });
});

describe('countActiveAgents', () => {
  it('counts agents with lastSeen within 30 seconds', () => {
    const now = Date.now();
    const agents = [
      { lastSeen: new Date(now - 5_000).toISOString() },
      { lastSeen: new Date(now - 10_000).toISOString() },
      { lastSeen: new Date(now - 60_000).toISOString() }
    ];
    assert.equal(countActiveAgents(agents, now), 2);
  });

  it('returns 0 when no agents are active', () => {
    const now = Date.now();
    const agents = [
      { lastSeen: new Date(now - 120_000).toISOString() },
      { lastSeen: new Date(now - 300_000).toISOString() }
    ];
    assert.equal(countActiveAgents(agents, now), 0);
  });

  it('returns 0 for empty array', () => {
    assert.equal(countActiveAgents([], Date.now()), 0);
  });

  it('excludes agent at exactly 30 seconds boundary', () => {
    const now = Date.now();
    const agents = [{ lastSeen: new Date(now - 30_000).toISOString() }];
    assert.equal(countActiveAgents(agents, now), 0);
  });
});

describe('relativeTime', () => {
  it('returns "방금" for less than 5 seconds', () => {
    const now = Date.now();
    assert.equal(relativeTime(new Date(now - 3_000).toISOString(), now), '방금');
  });

  it('returns "N초 전" for less than 60 seconds', () => {
    const now = Date.now();
    assert.equal(relativeTime(new Date(now - 30_000).toISOString(), now), '30초 전');
  });

  it('returns "N분 전" for less than 60 minutes', () => {
    const now = Date.now();
    assert.equal(relativeTime(new Date(now - 90_000).toISOString(), now), '1분 전');
  });

  it('returns "N시간 전" for less than 24 hours', () => {
    const now = Date.now();
    assert.equal(relativeTime(new Date(now - 7_200_000).toISOString(), now), '2시간 전');
  });

  it('returns "N일 전" for 24 hours or more', () => {
    const now = Date.now();
    assert.equal(relativeTime(new Date(now - 259_200_000).toISOString(), now), '3일 전');
  });

  it('returns "-" for null', () => {
    assert.equal(relativeTime(null), '-');
  });

  it('returns "-" for undefined', () => {
    assert.equal(relativeTime(undefined), '-');
  });

  it('returns "방금" at exactly 0 seconds', () => {
    const now = Date.now();
    assert.equal(relativeTime(new Date(now).toISOString(), now), '방금');
  });

  it('returns "5초 전" at exactly 5 seconds boundary', () => {
    const now = Date.now();
    assert.equal(relativeTime(new Date(now - 5_000).toISOString(), now), '5초 전');
  });

  it('returns "-" for invalid date string', () => {
    assert.equal(relativeTime('not-a-date'), '-');
  });
});
