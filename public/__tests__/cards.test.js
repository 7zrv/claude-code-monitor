import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardData } from '../lib/cards.js';

const numberFmt = new Intl.NumberFormat('ko-KR');

describe('buildCardData', () => {
  it('returns 5 cards total', () => {
    const totals = { agents: 1, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 1.5, sessions: 2 };
    const cards = buildCardData(totals, numberFmt);
    assert.equal(cards.length, 5);
  });

  it('includes Active, Error, Sessions, Total Tokens, Cost (USD) cards', () => {
    const totals = { agents: 2, total: 10, tokenTotal: 500, ok: 7, warning: 2, error: 1, costTotalUsd: 0.05, sessions: 3 };
    const cards = buildCardData(totals, numberFmt, 1);
    const labels = cards.map((c) => c.label);
    assert.deepEqual(labels, ['Active', 'Error', 'Sessions', 'Total Tokens', 'Cost (USD)']);
  });

  it('does not include removed cards', () => {
    const totals = { agents: 2, total: 10, tokenTotal: 500, ok: 7, warning: 2, error: 1, costTotalUsd: 0.05 };
    const cards = buildCardData(totals, numberFmt);
    const labels = cards.map((c) => c.label);
    for (const removed of ['Agents', 'Total Events', 'OK', 'Warning']) {
      assert.ok(!labels.includes(removed), `${removed} card should not exist`);
    }
  });

  it('includes Sessions card with session count', () => {
    const totals = { agents: 1, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 0, sessions: 5 };
    const cards = buildCardData(totals, numberFmt);
    const sessCard = cards.find((c) => c.label === 'Sessions');
    assert.ok(sessCard, 'Sessions card should exist');
    assert.equal(sessCard.value, '5');
    assert.equal(sessCard.type, 'neutral');
  });

  it('includes Cost (USD) card with 4 decimal places', () => {
    const totals = {
      agents: 2,
      total: 10,
      tokenTotal: 500,
      ok: 7,
      warning: 2,
      error: 1,
      costTotalUsd: 0.0523
    };
    const cards = buildCardData(totals, numberFmt);
    const costCard = cards.find((c) => c.label === 'Cost (USD)');
    assert.ok(costCard, 'Cost (USD) card should exist');
    assert.equal(costCard.value, '0.0523');
  });

  it('shows 0.0000 when costTotalUsd is missing', () => {
    const totals = { agents: 1, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0 };
    const cards = buildCardData(totals, numberFmt);
    const costCard = cards.find((c) => c.label === 'Cost (USD)');
    assert.ok(costCard, 'Cost (USD) card should exist');
    assert.equal(costCard.value, '0.0000');
  });

  it('shows 0.0000 when costTotalUsd is null', () => {
    const totals = { agents: 0, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0, costTotalUsd: null };
    const cards = buildCardData(totals, numberFmt);
    const costCard = cards.find((c) => c.label === 'Cost (USD)');
    assert.equal(costCard.value, '0.0000');
  });

  it('formats token values with numberFmt', () => {
    const totals = { agents: 1, total: 5000, tokenTotal: 50000, ok: 0, warning: 0, error: 0, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt);
    const tokenCard = cards.find((c) => c.label === 'Total Tokens');
    assert.equal(tokenCard.value, '50,000');
  });

  it('shows 0 for undefined numeric fields', () => {
    const totals = {};
    const cards = buildCardData(totals, numberFmt);
    const activeCard = cards.find((c) => c.label === 'Active');
    const errorCard = cards.find((c) => c.label === 'Error');
    const tokenCard = cards.find((c) => c.label === 'Total Tokens');
    const costCard = cards.find((c) => c.label === 'Cost (USD)');
    assert.equal(activeCard.value, '0');
    assert.equal(errorCard.value, '0');
    assert.equal(tokenCard.value, '0');
    assert.equal(costCard.value, '0.0000');
  });

  it('assigns error type to Error card when error > 0', () => {
    const totals = { agents: 1, total: 1, tokenTotal: 0, ok: 0, warning: 0, error: 1, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt);
    const errorCard = cards.find((c) => c.label === 'Error');
    assert.equal(errorCard.type, 'error');
  });

  it('assigns neutral type to Error card when error is 0', () => {
    const totals = { agents: 1, total: 1, tokenTotal: 0, ok: 0, warning: 0, error: 0, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt);
    const errorCard = cards.find((c) => c.label === 'Error');
    assert.equal(errorCard.type, 'neutral');
  });

  it('assigns neutral type to Total Tokens and Cost cards', () => {
    const totals = { agents: 1, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 1.5 };
    const cards = buildCardData(totals, numberFmt);
    for (const label of ['Total Tokens', 'Cost (USD)']) {
      const card = cards.find((c) => c.label === label);
      assert.equal(card.type, 'neutral', `${label} should have neutral type`);
    }
  });

  it('includes Active card with ok type when activeAgents > 0', () => {
    const totals = { agents: 2, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt, 2);
    const activeCard = cards.find((c) => c.label === 'Active');
    assert.ok(activeCard, 'Active card should exist');
    assert.equal(activeCard.value, '2');
    assert.equal(activeCard.type, 'ok');
  });

  it('includes Active card with neutral type when activeAgents is 0', () => {
    const totals = { agents: 2, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt, 0);
    const activeCard = cards.find((c) => c.label === 'Active');
    assert.ok(activeCard, 'Active card should exist');
    assert.equal(activeCard.value, '0');
    assert.equal(activeCard.type, 'neutral');
  });

  it('defaults activeAgents to 0 when not provided', () => {
    const totals = { agents: 1, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0 };
    const cards = buildCardData(totals, numberFmt);
    const activeCard = cards.find((c) => c.label === 'Active');
    assert.ok(activeCard, 'Active card should exist');
    assert.equal(activeCard.value, '0');
    assert.equal(activeCard.type, 'neutral');
  });

  it('uses rangeInfo for Tokens card when provided', () => {
    const totals = { tokenTotal: 9999, costTotalUsd: 5.0 };
    const rangeInfo = { label: '최근 1시간', tokenTotal: 100, costUsd: 0.05 };
    const cards = buildCardData(totals, numberFmt, 0, rangeInfo);
    const tokenCard = cards.find((c) => c.label === '최근 1시간 Tokens');
    assert.ok(tokenCard, 'range Tokens card should exist');
    assert.equal(tokenCard.value, '100');
  });

  it('uses rangeInfo for Cost card when provided', () => {
    const totals = { tokenTotal: 9999, costTotalUsd: 5.0 };
    const rangeInfo = { label: '최근 1시간', tokenTotal: 100, costUsd: 0.05 };
    const cards = buildCardData(totals, numberFmt, 0, rangeInfo);
    const costCard = cards.find((c) => c.label === '최근 1시간 Cost');
    assert.ok(costCard, 'range Cost card should exist');
    assert.equal(costCard.value, '0.0500');
  });

  it('uses totals when rangeInfo is null', () => {
    const totals = { tokenTotal: 500, costTotalUsd: 1.5 };
    const cards = buildCardData(totals, numberFmt, 0, null);
    const tokenCard = cards.find((c) => c.label === 'Total Tokens');
    assert.ok(tokenCard, 'Total Tokens card should exist');
    assert.equal(tokenCard.value, '500');
  });
});
