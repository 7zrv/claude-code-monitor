import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveSessionSelection } from '../lib/session-selection.js';

const rows = [
  { sessionId: 's1' },
  { sessionId: 's2' }
];

describe('resolveSessionSelection', () => {
  it('keeps a valid explicit selection', () => {
    const result = resolveSessionSelection(rows, rows, 's2', true);
    assert.equal(result.selectedSession?.sessionId, 's2');
    assert.equal(result.selectedSessionId, 's2');
  });

  it('falls back to the first visible row when auto-select is enabled', () => {
    const result = resolveSessionSelection(rows, [rows[1]], '', true);
    assert.equal(result.selectedSession?.sessionId, 's2');
    assert.equal(result.selectedSessionId, 's2');
  });

  it('preserves no selection when auto-select is disabled', () => {
    const result = resolveSessionSelection(rows, rows, '', false);
    assert.equal(result.selectedSession, null);
    assert.equal(result.selectedSessionId, '');
    assert.equal(result.allowAutoSelect, false);
  });
});
