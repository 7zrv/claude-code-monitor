import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardData } from '../lib/cards.js';

const numberFmt = new Intl.NumberFormat('ko-KR');

describe('buildCardData', () => {
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
    const costCard = cards.find(([label]) => label === 'Cost (USD)');
    assert.ok(costCard, 'Cost (USD) card should exist');
    assert.equal(costCard[1], '0.0523');
  });

  it('shows 0.0000 when costTotalUsd is missing', () => {
    const totals = { agents: 1, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0 };
    const cards = buildCardData(totals, numberFmt);
    const costCard = cards.find(([label]) => label === 'Cost (USD)');
    assert.ok(costCard, 'Cost (USD) card should exist');
    assert.equal(costCard[1], '0.0000');
  });

  it('shows 0.0000 when costTotalUsd is null', () => {
    const totals = { agents: 0, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0, costTotalUsd: null };
    const cards = buildCardData(totals, numberFmt);
    const costCard = cards.find(([label]) => label === 'Cost (USD)');
    assert.equal(costCard[1], '0.0000');
  });

  it('returns 7 cards total', () => {
    const totals = { agents: 1, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 1.5 };
    const cards = buildCardData(totals, numberFmt);
    assert.equal(cards.length, 7);
  });

  it('formats non-cost values with numberFmt', () => {
    const totals = { agents: 1000, total: 5000, tokenTotal: 0, ok: 0, warning: 0, error: 0, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt);
    assert.equal(cards[0][1], '1,000');
    assert.equal(cards[1][1], '5,000');
  });

  it('shows 0 for undefined numeric fields', () => {
    const totals = {};
    const cards = buildCardData(totals, numberFmt);
    assert.equal(cards[0][1], '0');   // Agents
    assert.equal(cards[3][1], '0');   // OK
    assert.equal(cards[6][1], '0.0000'); // Cost (USD)
  });
});
