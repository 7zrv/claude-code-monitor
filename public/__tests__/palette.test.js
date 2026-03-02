import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { CHART_PALETTE, colorForIndex } from '../lib/palette.js';

describe('CHART_PALETTE', () => {
  it('has exactly 8 colors', () => {
    assert.equal(CHART_PALETTE.length, 8);
  });

  it('contains only valid hex color codes', () => {
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    for (const color of CHART_PALETTE) {
      assert.match(color, hexPattern, `${color} is not a valid hex code`);
    }
  });

  it('contains all unique colors', () => {
    const unique = new Set(CHART_PALETTE);
    assert.equal(unique.size, CHART_PALETTE.length);
  });
});

describe('colorForIndex', () => {
  it('returns the first color for index 0', () => {
    assert.equal(colorForIndex(0), CHART_PALETTE[0]);
  });

  it('returns the last color for index 7', () => {
    assert.equal(colorForIndex(7), CHART_PALETTE[7]);
  });

  it('wraps around when index exceeds palette length', () => {
    assert.equal(colorForIndex(8), CHART_PALETTE[0]);
    assert.equal(colorForIndex(10), CHART_PALETTE[2]);
    assert.equal(colorForIndex(16), CHART_PALETTE[0]);
  });
});
