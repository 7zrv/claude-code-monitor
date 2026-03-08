import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardData } from '../lib/cards.js';

const numberFmt = new Intl.NumberFormat('ko-KR');

const makeSessions = (states) => states.map((sessionState) => ({ sessionState }));

describe('buildCardData', () => {
  it('returns 5 cards total', () => {
    const cards = buildCardData([], {}, numberFmt);
    assert.equal(cards.length, 5);
  });

  it('returns correct Korean labels', () => {
    const cards = buildCardData([], {}, numberFmt);
    const labels = cards.map((c) => c.label);
    assert.deepEqual(labels, ['활성 세션', '주의 필요', '세션', '전체 토큰', '비용 (USD)']);
  });

  it('does not include old agent-centric card labels', () => {
    const cards = buildCardData([], {}, numberFmt);
    const labels = cards.map((c) => c.label);
    for (const removed of ['Active', 'Error', 'Sessions', 'Total Tokens', 'Cost (USD)', 'Agents']) {
      assert.ok(!labels.includes(removed), `${removed} card should not exist`);
    }
  });

  it('counts active sessions correctly', () => {
    const sessions = makeSessions(['active', 'active', 'completed', 'idle']);
    const cards = buildCardData(sessions, {}, numberFmt);
    const card = cards.find((c) => c.label === '활성 세션');
    assert.equal(card.value, '2');
    assert.equal(card.type, 'ok');
  });

  it('assigns neutral type to 활성 세션 when count is 0', () => {
    const sessions = makeSessions(['completed', 'idle']);
    const cards = buildCardData(sessions, {}, numberFmt);
    const card = cards.find((c) => c.label === '활성 세션');
    assert.equal(card.value, '0');
    assert.equal(card.type, 'neutral');
  });

  it('counts stuck + failed sessions as 주의 필요', () => {
    const sessions = makeSessions(['active', 'stuck', 'failed', 'completed']);
    const cards = buildCardData(sessions, {}, numberFmt);
    const card = cards.find((c) => c.label === '주의 필요');
    assert.equal(card.value, '2');
    assert.equal(card.type, 'warning');
  });

  it('assigns neutral type to 주의 필요 when count is 0', () => {
    const sessions = makeSessions(['active', 'completed']);
    const cards = buildCardData(sessions, {}, numberFmt);
    const card = cards.find((c) => c.label === '주의 필요');
    assert.equal(card.value, '0');
    assert.equal(card.type, 'neutral');
  });

  it('shows total session count in 세션 card', () => {
    const sessions = makeSessions(['active', 'stuck', 'completed', 'idle', 'failed']);
    const cards = buildCardData(sessions, {}, numberFmt);
    const card = cards.find((c) => c.label === '세션');
    assert.equal(card.value, '5');
    assert.equal(card.type, 'neutral');
  });

  it('shows 0 for all counts when sessions is empty', () => {
    const cards = buildCardData([], {}, numberFmt);
    assert.equal(cards.find((c) => c.label === '활성 세션').value, '0');
    assert.equal(cards.find((c) => c.label === '주의 필요').value, '0');
    assert.equal(cards.find((c) => c.label === '세션').value, '0');
  });

  it('shows 전체 토큰 with totals when no rangeInfo', () => {
    const totals = { tokenTotal: 50000, costTotalUsd: 0 };
    const cards = buildCardData([], totals, numberFmt);
    const card = cards.find((c) => c.label === '전체 토큰');
    assert.ok(card, '전체 토큰 card should exist');
    assert.equal(card.value, '50,000');
    assert.equal(card.type, 'neutral');
  });

  it('shows 비용 (USD) with 4 decimal places when no rangeInfo', () => {
    const totals = { tokenTotal: 0, costTotalUsd: 0.0523 };
    const cards = buildCardData([], totals, numberFmt);
    const card = cards.find((c) => c.label === '비용 (USD)');
    assert.ok(card, '비용 (USD) card should exist');
    assert.equal(card.value, '0.0523');
    assert.equal(card.type, 'neutral');
  });

  it('shows 0.0000 when costTotalUsd is missing', () => {
    const cards = buildCardData([], {}, numberFmt);
    const card = cards.find((c) => c.label === '비용 (USD)');
    assert.equal(card.value, '0.0000');
  });

  it('shows 0.0000 when costTotalUsd is null', () => {
    const cards = buildCardData([], { costTotalUsd: null }, numberFmt);
    const card = cards.find((c) => c.label === '비용 (USD)');
    assert.equal(card.value, '0.0000');
  });

  it('shows 0 tokens when tokenTotal is missing', () => {
    const cards = buildCardData([], {}, numberFmt);
    const card = cards.find((c) => c.label === '전체 토큰');
    assert.equal(card.value, '0');
  });

  it('uses rangeInfo for token card label and value', () => {
    const totals = { tokenTotal: 9999, costTotalUsd: 5.0 };
    const rangeInfo = { label: '최근 1시간', tokenTotal: 100, costUsd: 0.05 };
    const cards = buildCardData([], totals, numberFmt, rangeInfo);
    const card = cards.find((c) => c.label === '최근 1시간 토큰');
    assert.ok(card, 'range 토큰 card should exist');
    assert.equal(card.value, '100');
  });

  it('uses rangeInfo for cost card label and value', () => {
    const totals = { tokenTotal: 9999, costTotalUsd: 5.0 };
    const rangeInfo = { label: '최근 1시간', tokenTotal: 100, costUsd: 0.05 };
    const cards = buildCardData([], totals, numberFmt, rangeInfo);
    const card = cards.find((c) => c.label === '최근 1시간 비용');
    assert.ok(card, 'range 비용 card should exist');
    assert.equal(card.value, '0.0500');
  });

  it('falls back to totals when rangeInfo is null', () => {
    const totals = { tokenTotal: 500, costTotalUsd: 1.5 };
    const cards = buildCardData([], totals, numberFmt, null);
    const card = cards.find((c) => c.label === '전체 토큰');
    assert.ok(card, '전체 토큰 card should exist');
    assert.equal(card.value, '500');
  });

  it('formats large token values with locale separators', () => {
    const totals = { tokenTotal: 1234567 };
    const cards = buildCardData([], totals, numberFmt);
    const card = cards.find((c) => c.label === '전체 토큰');
    assert.equal(card.value, '1,234,567');
  });
});
