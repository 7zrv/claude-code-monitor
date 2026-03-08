import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ALERT_RULES, describeAlertRules, sanitizeAlertRules } from '../lib/alert-rules.js';

describe('sanitizeAlertRules', () => {
  it('returns defaults when values are missing', () => {
    assert.deepEqual(sanitizeAlertRules(), { ...DEFAULT_ALERT_RULES });
  });

  it('normalizes numeric strings and rounds integer fields', () => {
    assert.deepEqual(
      sanitizeAlertRules({ costUsdThreshold: '0.75', tokenTotalThreshold: '25499.6', warningCountThreshold: '2.4' }),
      { costUsdThreshold: 0.75, tokenTotalThreshold: 25500, warningCountThreshold: 2 }
    );
  });

  it('falls back to defaults for invalid values', () => {
    assert.deepEqual(
      sanitizeAlertRules({ costUsdThreshold: -1, tokenTotalThreshold: 'nope', warningCountThreshold: 0 }),
      { ...DEFAULT_ALERT_RULES }
    );
  });
});

describe('describeAlertRules', () => {
  it('formats a compact human-readable summary', () => {
    assert.equal(
      describeAlertRules({ costUsdThreshold: 0.6, tokenTotalThreshold: 25000, warningCountThreshold: 3 }),
      'warn 3+ · cost $0.60+ · tokens 25,000+'
    );
  });
});
