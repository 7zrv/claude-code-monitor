import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildConnectionView, setConnectionStatus } from '../lib/connection.js';

describe('buildConnectionView', () => {
  it('returns connected copy with success detail', () => {
    const view = buildConnectionView('connected', { lastSuccessAt: '2026-01-01T12:34:56Z' });
    assert.equal(view.label, 'connected');
    assert.match(view.detail, /실시간 스트림 연결됨/);
    assert.match(view.detail, /마지막 성공/);
  });

  it('returns reconnecting copy', () => {
    const view = buildConnectionView('reconnecting');
    assert.equal(view.label, 'reconnecting');
    assert.match(view.detail, /재연결 중/);
  });

  it('returns offline copy', () => {
    const view = buildConnectionView('offline');
    assert.equal(view.label, 'offline');
    assert.match(view.detail, /스트림 끊김/);
  });

  it('falls back safely for unknown status', () => {
    const view = buildConnectionView('mystery');
    assert.equal(view.label, 'mystery');
    assert.equal(view.detail, '상태 정보를 확인할 수 없습니다.');
  });
});

describe('setConnectionStatus', () => {
  it('updates badge and meta elements', () => {
    const badgeEl = { dataset: {}, textContent: '', title: '' };
    const metaEl = { textContent: '' };

    setConnectionStatus(badgeEl, 'connected', { metaEl, lastSuccessAt: '2026-01-01T12:34:56Z' });

    assert.equal(badgeEl.dataset.status, 'connected');
    assert.equal(badgeEl.textContent, 'connected');
    assert.match(badgeEl.title, /마지막 성공/);
    assert.match(metaEl.textContent, /실시간 스트림 연결됨/);
  });
});
