import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ALERT_RULES } from '../lib/alert-rules.js';
import { saveFilters, loadFilters, saveToggle, loadToggle, saveAlertRules, loadAlertRules, resetAlertRules } from '../lib/persistence.js';

// minimal localStorage mock
function createStorageMock() {
  const store = {};
  return {
    getItem(key) { return store[key] ?? null; },
    setItem(key, val) { store[key] = String(val); },
    removeItem(key) { delete store[key]; },
    _store: store
  };
}

const KEY = 'test_key';

describe('saveFilters', () => {
  it('serialises filters to JSON in storage', () => {
    const storage = createStorageMock();
    const filters = { status: 'warning', limit: '100', search: 'hello' };
    saveFilters(KEY, filters, storage);
    const raw = storage.getItem(KEY);
    assert.deepEqual(JSON.parse(raw), filters);
  });
});

describe('loadFilters', () => {
  it('returns null when key is missing', () => {
    const storage = createStorageMock();
    assert.equal(loadFilters(KEY, storage), null);
  });

  it('parses stored JSON', () => {
    const storage = createStorageMock();
    storage.setItem(KEY, JSON.stringify({ status: 'ok', limit: '50', search: '' }));
    const result = loadFilters(KEY, storage);
    assert.deepEqual(result, { status: 'ok', limit: '50', search: '' });
  });

  it('returns null for broken JSON', () => {
    const storage = createStorageMock();
    storage.setItem(KEY, '{broken');
    assert.equal(loadFilters(KEY, storage), null);
  });
});

describe('saveToggle', () => {
  it('stores boolean true as "true"', () => {
    const storage = createStorageMock();
    saveToggle('toggle_key', true, storage);
    assert.equal(storage.getItem('toggle_key'), 'true');
  });

  it('stores boolean false as "false"', () => {
    const storage = createStorageMock();
    saveToggle('toggle_key', false, storage);
    assert.equal(storage.getItem('toggle_key'), 'false');
  });
});

describe('loadToggle', () => {
  it('returns false when key is missing', () => {
    const storage = createStorageMock();
    assert.equal(loadToggle('toggle_key', storage), false);
  });

  it('returns true when stored value is "true"', () => {
    const storage = createStorageMock();
    storage.setItem('toggle_key', 'true');
    assert.equal(loadToggle('toggle_key', storage), true);
  });

  it('returns false when stored value is "false"', () => {
    const storage = createStorageMock();
    storage.setItem('toggle_key', 'false');
    assert.equal(loadToggle('toggle_key', storage), false);
  });

  it('returns false for unexpected value', () => {
    const storage = createStorageMock();
    storage.setItem('toggle_key', 'maybe');
    assert.equal(loadToggle('toggle_key', storage), false);
  });
});

describe('alert rule persistence', () => {
  it('stores sanitized alert rules', () => {
    const storage = createStorageMock();
    saveAlertRules('alert_rules', { costUsdThreshold: '0.75', tokenTotalThreshold: '25000', warningCountThreshold: '2' }, storage);
    assert.deepEqual(JSON.parse(storage.getItem('alert_rules')), {
      costUsdThreshold: 0.75,
      tokenTotalThreshold: 25000,
      warningCountThreshold: 2
    });
  });

  it('loads defaults when storage is empty', () => {
    const storage = createStorageMock();
    assert.deepEqual(loadAlertRules('alert_rules', storage), { ...DEFAULT_ALERT_RULES });
  });

  it('falls back to defaults for invalid stored values', () => {
    const storage = createStorageMock();
    storage.setItem('alert_rules', JSON.stringify({ costUsdThreshold: -1, tokenTotalThreshold: 'bad', warningCountThreshold: 0 }));
    assert.deepEqual(loadAlertRules('alert_rules', storage), { ...DEFAULT_ALERT_RULES });
  });

  it('removes stored alert rules on reset', () => {
    const storage = createStorageMock();
    storage.setItem('alert_rules', JSON.stringify(DEFAULT_ALERT_RULES));
    resetAlertRules('alert_rules', storage);
    assert.equal(storage.getItem('alert_rules'), null);
  });
});
