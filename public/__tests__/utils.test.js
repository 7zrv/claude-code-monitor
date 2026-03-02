import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml, statusPill, normalizeText } from '../lib/utils.js';

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
