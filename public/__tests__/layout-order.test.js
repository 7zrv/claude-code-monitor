import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const indexHtml = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('dashboard panel order', () => {
  it('places Sessions Workspace before Needs Attention in the main layout', () => {
    const sessionsIndex = indexHtml.indexOf('<h2>Sessions Workspace</h2>');
    const needsAttentionIndex = indexHtml.indexOf('<h2>Needs Attention</h2>');

    assert.notEqual(sessionsIndex, -1);
    assert.notEqual(needsAttentionIndex, -1);
    assert.ok(sessionsIndex < needsAttentionIndex);
  });
});
