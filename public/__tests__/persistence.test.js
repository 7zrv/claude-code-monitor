import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { saveFilters, loadFilters } from '../lib/persistence.js';

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
