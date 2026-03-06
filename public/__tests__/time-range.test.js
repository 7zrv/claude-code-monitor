import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { sumByRange, rangeLabel } from '../lib/time-range.js';

describe('sumByRange', () => {
  const now = new Date('2025-01-02T14:30:00Z').getTime();

  it('sums buckets within 1h range', () => {
    const buckets = [
      { hourKey: '2025-01-02T14', tokenTotal: 100, costUsd: 0.05 },
      { hourKey: '2025-01-02T13', tokenTotal: 200, costUsd: 0.10 },
    ];
    const result = sumByRange(buckets, '1h', now);
    // cutoff = 13:30, T14 (14:00) >= cutoff, T13 (13:00) < cutoff
    assert.equal(result.tokenTotal, 100);
    assert.equal(result.costUsd, 0.05);
  });

  it('sums buckets within 1d range', () => {
    const buckets = [
      { hourKey: '2025-01-02T14', tokenTotal: 100, costUsd: 0.05 },
      { hourKey: '2025-01-01T15', tokenTotal: 200, costUsd: 0.10 },
      { hourKey: '2025-01-01T14', tokenTotal: 300, costUsd: 0.15 },
    ];
    const result = sumByRange(buckets, '1d', now);
    // cutoff = 2025-01-01T14:30, T15 (15:00) >= cutoff, T14 (14:00) < cutoff
    assert.equal(result.tokenTotal, 300);
    assert.ok(Math.abs(result.costUsd - 0.15) < 0.0001);
  });

  it('returns null for all range', () => {
    const buckets = [
      { hourKey: '2025-01-02T14', tokenTotal: 100, costUsd: 0.05 },
    ];
    const result = sumByRange(buckets, 'all', now);
    assert.equal(result, null);
  });

  it('returns null for empty buckets', () => {
    const result = sumByRange([], '1h', now);
    assert.equal(result, null);
  });

  it('excludes buckets outside range', () => {
    const buckets = [
      { hourKey: '2025-01-02T14', tokenTotal: 100, costUsd: 0.05 },
      { hourKey: '2025-01-01T10', tokenTotal: 999, costUsd: 9.99 },
    ];
    const result = sumByRange(buckets, '1h', now);
    assert.deepEqual(result, { tokenTotal: 100, costUsd: 0.05 });
  });

  it('returns null when no buckets match range', () => {
    const buckets = [
      { hourKey: '2024-01-01T00', tokenTotal: 500, costUsd: 1.0 },
    ];
    const result = sumByRange(buckets, '1h', now);
    assert.equal(result, null);
  });

  it('skips buckets with malformed hourKey', () => {
    const buckets = [
      { hourKey: 'invalid', tokenTotal: 999, costUsd: 9.99 },
      { hourKey: '2025-01-02T14', tokenTotal: 100, costUsd: 0.05 },
    ];
    const result = sumByRange(buckets, '1h', now);
    assert.equal(result.tokenTotal, 100);
    assert.equal(result.costUsd, 0.05);
  });
});

describe('rangeLabel', () => {
  it('returns "최근 1시간" for 1h', () => {
    assert.equal(rangeLabel('1h'), '최근 1시간');
  });

  it('returns "최근 1일" for 1d', () => {
    assert.equal(rangeLabel('1d'), '최근 1일');
  });

  it('returns "최근 1주" for 1w', () => {
    assert.equal(rangeLabel('1w'), '최근 1주');
  });

  it('returns "최근 1달" for 1m', () => {
    assert.equal(rangeLabel('1m'), '최근 1달');
  });

  it('returns elapsed time label for all', () => {
    const startedAt = new Date(Date.now() - (2 * 3600000 + 30 * 60000)).toISOString();
    const label = rangeLabel('all', startedAt);
    assert.match(label, /^전체 \(\d+시간 \d+분\)$/);
  });
});
