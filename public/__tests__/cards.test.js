import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildCardData } from '../lib/cards.js';

const numberFmt = new Intl.NumberFormat('ko-KR');

describe('buildCardData', () => {
  it('returns 5 base cards when no plan limit', () => {
    const totals = { agents: 1, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 1.5, sessions: 2 };
    const cards = buildCardData(totals, numberFmt);
    assert.equal(cards.length, 5);
  });

  it('includes Active, Error, Sessions, Burn Rate, Cost (USD) cards', () => {
    const totals = { agents: 2, total: 10, tokenTotal: 500, ok: 7, warning: 2, error: 1, costTotalUsd: 0.05, sessions: 3 };
    const cards = buildCardData(totals, numberFmt, 1);
    const labels = cards.map((c) => c.label);
    assert.deepEqual(labels, ['Active', 'Error', 'Sessions', 'Burn Rate', 'Cost (USD)']);
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
    const totals = { agents: 2, total: 10, tokenTotal: 500, ok: 7, warning: 2, error: 1, costTotalUsd: 0.0523 };
    const cards = buildCardData(totals, numberFmt);
    const costCard = cards.find((c) => c.label === 'Cost (USD)');
    assert.ok(costCard);
    assert.equal(costCard.value, '0.0523');
  });

  it('shows 0.0000 when costTotalUsd is missing', () => {
    const totals = { agents: 1, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0 };
    const cards = buildCardData(totals, numberFmt);
    const costCard = cards.find((c) => c.label === 'Cost (USD)');
    assert.equal(costCard.value, '0.0000');
  });

  it('shows 0.0000 when costTotalUsd is null', () => {
    const totals = { agents: 0, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0, costTotalUsd: null };
    const cards = buildCardData(totals, numberFmt);
    const costCard = cards.find((c) => c.label === 'Cost (USD)');
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

  it('includes Active card with ok type when activeAgents > 0', () => {
    const totals = { agents: 2, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt, 2);
    const activeCard = cards.find((c) => c.label === 'Active');
    assert.ok(activeCard);
    assert.equal(activeCard.value, '2');
    assert.equal(activeCard.type, 'ok');
  });

  it('includes Active card with neutral type when activeAgents is 0', () => {
    const totals = { agents: 2, total: 5, tokenTotal: 100, ok: 3, warning: 1, error: 1, costTotalUsd: 0 };
    const cards = buildCardData(totals, numberFmt, 0);
    const activeCard = cards.find((c) => c.label === 'Active');
    assert.equal(activeCard.value, '0');
    assert.equal(activeCard.type, 'neutral');
  });

  it('defaults activeAgents to 0 when not provided', () => {
    const totals = { agents: 1, total: 0, tokenTotal: 0, ok: 0, warning: 0, error: 0 };
    const cards = buildCardData(totals, numberFmt);
    const activeCard = cards.find((c) => c.label === 'Active');
    assert.equal(activeCard.value, '0');
    assert.equal(activeCard.type, 'neutral');
  });

  it('shows burn rate as 0 tok/min when no rate', () => {
    const totals = { tokenBurnRate: 0 };
    const cards = buildCardData(totals, numberFmt);
    const burnCard = cards.find((c) => c.label === 'Burn Rate');
    assert.equal(burnCard.value, '0 tok/min');
  });

  it('formats burn rate with 1 decimal', () => {
    const totals = { tokenBurnRate: 123.456 };
    const cards = buildCardData(totals, numberFmt);
    const burnCard = cards.find((c) => c.label === 'Burn Rate');
    assert.equal(burnCard.value, '123.5 tok/min');
  });

  it('formats large burn rate in k tok/min', () => {
    const totals = { tokenBurnRate: 2500 };
    const cards = buildCardData(totals, numberFmt);
    const burnCard = cards.find((c) => c.label === 'Burn Rate');
    assert.equal(burnCard.value, '2.5k tok/min');
  });

  it('adds Plan Usage card when planLimit is set', () => {
    const totals = { planUsagePercent: 45.0, planLimit: 100000, minutesToLimit: 120 };
    const cards = buildCardData(totals, numberFmt);
    const usageCard = cards.find((c) => c.label === 'Plan Usage');
    assert.ok(usageCard);
    assert.equal(usageCard.value, '45.0%');
    assert.equal(usageCard.type, 'ok');
    assert.equal(usageCard.progress, 45.0);
    assert.equal(usageCard.sub, '120min left');
  });

  it('Plan Usage type is warning at 80%+', () => {
    const totals = { planUsagePercent: 85, planLimit: 100000 };
    const cards = buildCardData(totals, numberFmt);
    const usageCard = cards.find((c) => c.label === 'Plan Usage');
    assert.equal(usageCard.type, 'warning');
  });

  it('Plan Usage type is error at 90%+', () => {
    const totals = { planUsagePercent: 95, planLimit: 100000 };
    const cards = buildCardData(totals, numberFmt);
    const usageCard = cards.find((c) => c.label === 'Plan Usage');
    assert.equal(usageCard.type, 'error');
  });

  it('does not add Plan Usage card when planLimit is 0', () => {
    const totals = { planUsagePercent: null, planLimit: 0 };
    const cards = buildCardData(totals, numberFmt);
    const usageCard = cards.find((c) => c.label === 'Plan Usage');
    assert.equal(usageCard, undefined);
  });

  it('does not add Plan Usage card when planUsagePercent is null', () => {
    const totals = { planUsagePercent: null, planLimit: 100000 };
    const cards = buildCardData(totals, numberFmt);
    const usageCard = cards.find((c) => c.label === 'Plan Usage');
    assert.equal(usageCard, undefined);
  });

  it('Plan Usage shows empty sub when minutesToLimit is null', () => {
    const totals = { planUsagePercent: 50, planLimit: 100000, minutesToLimit: null };
    const cards = buildCardData(totals, numberFmt);
    const usageCard = cards.find((c) => c.label === 'Plan Usage');
    assert.equal(usageCard.sub, '');
  });

  it('Plan Usage shows Limit exceeded when minutesToLimit is negative', () => {
    const totals = { planUsagePercent: 110, planLimit: 100000, minutesToLimit: -30 };
    const cards = buildCardData(totals, numberFmt);
    const usageCard = cards.find((c) => c.label === 'Plan Usage');
    assert.equal(usageCard.sub, 'Limit exceeded');
  });
});
