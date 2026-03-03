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

  it('returns 8 cards total', () => {
    const totals = { agents: 1, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 1.5 };
    const cards = buildCardData(totals, numberFmt);
    assert.equal(cards.length, 8);
  });

  it('formats non-cost values with numberFmt', () => {
    const totals = { agents: 1000, total: 5000, tokenTotal: 0, ok: 0, warning: 0, error: 0, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt);
    const agentsCard = cards.find(([l]) => l === 'Agents');
    const totalCard = cards.find(([l]) => l === 'Total Events');
    assert.equal(agentsCard[1], '1,000');
    assert.equal(totalCard[1], '5,000');
  });

  it('shows 0 for undefined numeric fields', () => {
    const totals = {};
    const cards = buildCardData(totals, numberFmt);
    const agentsCard = cards.find(([l]) => l === 'Agents');
    const okCard = cards.find(([l]) => l === 'OK');
    const costCard = cards.find(([l]) => l === 'Cost (USD)');
    assert.equal(agentsCard[1], '0');
    assert.equal(okCard[1], '0');
    assert.equal(costCard[1], '0.0000');
  });

  it('assigns ok type to OK card', () => {
    const totals = { agents: 1, total: 1, tokenTotal: 0, ok: 1, warning: 0, error: 0, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt);
    const okCard = cards.find(([label]) => label === 'OK');
    assert.equal(okCard[2], 'ok');
  });

  it('assigns warning type to Warning card', () => {
    const totals = { agents: 1, total: 1, tokenTotal: 0, ok: 0, warning: 1, error: 0, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt);
    const warningCard = cards.find(([label]) => label === 'Warning');
    assert.equal(warningCard[2], 'warning');
  });

  it('assigns error type to Error card', () => {
    const totals = { agents: 1, total: 1, tokenTotal: 0, ok: 0, warning: 0, error: 1, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt);
    const errorCard = cards.find(([label]) => label === 'Error');
    assert.equal(errorCard[2], 'error');
  });

  it('assigns neutral type to non-status cards', () => {
    const totals = { agents: 1, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 1.5 };
    const cards = buildCardData(totals, numberFmt);
    const neutralLabels = ['Agents', 'Total Events', 'Total Tokens', 'Cost (USD)'];
    for (const label of neutralLabels) {
      const card = cards.find(([l]) => l === label);
      assert.equal(card[2], 'neutral', `${label} should have neutral type`);
    }
  });

  it('includes Active card with ok type when activeAgents > 0', () => {
    const totals = { agents: 2, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt, 2);
    const activeCard = cards.find(([label]) => label === 'Active');
    assert.ok(activeCard, 'Active card should exist');
    assert.equal(activeCard[1], '2');
    assert.equal(activeCard[2], 'ok');
  });

  it('includes Active card with neutral type when activeAgents is 0', () => {
    const totals = { agents: 2, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt, 0);
    const activeCard = cards.find(([label]) => label === 'Active');
    assert.ok(activeCard, 'Active card should exist');
    assert.equal(activeCard[1], '0');
    assert.equal(activeCard[2], 'neutral');
  });

  it('defaults activeAgents to 0 when not provided', () => {
    const totals = { agents: 1, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0 };
    const cards = buildCardData(totals, numberFmt);
    const activeCard = cards.find(([label]) => label === 'Active');
    assert.ok(activeCard, 'Active card should exist');
    assert.equal(activeCard[1], '0');
    assert.equal(activeCard[2], 'neutral');
  });
});
