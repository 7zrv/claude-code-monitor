import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildMinuteBuckets, pathForSeries } from '../lib/renders/charts.js';

describe('buildMinuteBuckets', () => {
  it('returns requested number of buckets', () => {
    const buckets = buildMinuteBuckets([], 10);
    assert.equal(buckets.length, 10);
  });

  it('initialises each bucket with zero events', () => {
    const buckets = buildMinuteBuckets([], 5);
    for (const b of buckets) {
      assert.equal(b.events, 0);
      assert.deepEqual(b.tokensByAgent, {});
    }
  });

  it('counts events into correct buckets', () => {
    const now = Date.now();
    const events = [
      { receivedAt: new Date(now).toISOString(), status: 'ok' },
      { receivedAt: new Date(now).toISOString(), status: 'ok' }
    ];
    const buckets = buildMinuteBuckets(events, 5);
    const last = buckets[buckets.length - 1];
    assert.equal(last.events, 2);
  });

  it('ignores events outside the window', () => {
    const now = Date.now();
    const events = [
      { receivedAt: new Date(now - 60 * 60_000).toISOString(), status: 'ok' }
    ];
    const buckets = buildMinuteBuckets(events, 30);
    const total = buckets.reduce((s, b) => s + b.events, 0);
    assert.equal(total, 0);
  });

  it('accumulates token usage by agent', () => {
    const now = Date.now();
    const events = [
      { receivedAt: new Date(now).toISOString(), agentId: 'a1', metadata: { tokenUsage: { totalTokens: 100 } } }
    ];
    const buckets = buildMinuteBuckets(events, 5);
    const last = buckets[buckets.length - 1];
    assert.equal(last.tokensByAgent['a1'], 100);
  });

  it('skips events with invalid timestamps', () => {
    const events = [{ receivedAt: 'not-a-date', status: 'ok' }];
    const buckets = buildMinuteBuckets(events, 5);
    const total = buckets.reduce((s, b) => s + b.events, 0);
    assert.equal(total, 0);
  });
});

describe('pathForSeries', () => {
  it('returns empty string for empty array', () => {
    assert.equal(pathForSeries([], { left: 0, right: 100 }, { top: 0, bottom: 100 }, 1), '');
  });

  it('starts with M for single value', () => {
    const d = pathForSeries([50], { left: 0, right: 100 }, { top: 0, bottom: 100 }, 100);
    assert.ok(d.startsWith('M'));
    assert.ok(!d.includes('L'));
  });

  it('uses L for subsequent points', () => {
    const d = pathForSeries([10, 20], { left: 0, right: 100 }, { top: 0, bottom: 100 }, 100);
    assert.ok(d.startsWith('M'));
    assert.ok(d.includes('L'));
  });

  it('maps zero value to bottom of chart', () => {
    const d = pathForSeries([0], { left: 0, right: 100 }, { top: 10, bottom: 90 }, 100);
    // y should be at bottom (90)
    assert.ok(d.includes('90.00'));
  });

  it('maps max value to top of chart', () => {
    const d = pathForSeries([100], { left: 0, right: 100 }, { top: 10, bottom: 90 }, 100);
    // y should be at top (10)
    assert.ok(d.includes('10.00'));
  });
});
