import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, statusPill, normalizeText, getActivityStatus, activityDotHtml, countActiveAgents } from '../lib/utils.js';

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
