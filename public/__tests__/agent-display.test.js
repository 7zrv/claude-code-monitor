import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { displayNameFor, resetDisplayNames } from '../lib/agent-display.js';

describe('displayNameFor', () => {
  beforeEach(() => {
    resetDisplayNames();
  });

  it('converts lead prefix to Lead #N', () => {
    assert.equal(displayNameFor('lead-01660f97'), 'Lead #1');
  });

  it('assigns incremental numbers for same role', () => {
    assert.equal(displayNameFor('lead-01660f97'), 'Lead #1');
    assert.equal(displayNameFor('lead-067ce384'), 'Lead #2');
  });

  it('converts sub prefix to Sub #N', () => {
    assert.equal(displayNameFor('sub-067ce384'), 'Sub #1');
  });

  it('converts agent prefix to Agent #N', () => {
    assert.equal(displayNameFor('agent-abc'), 'Agent #1');
  });

  it('converts unknown-agent to Agent #N', () => {
    assert.equal(displayNameFor('unknown-agent'), 'Agent #1');
  });

  it('returns same name for repeated calls with same id (idempotent)', () => {
    const first = displayNameFor('lead-aaa');
    const second = displayNameFor('lead-aaa');
    assert.equal(first, second);
    assert.equal(first, 'Lead #1');
  });

  it('capitalizes unknown prefixes', () => {
    assert.equal(displayNameFor('worker-abc123'), 'Worker #1');
    assert.equal(displayNameFor('worker-def456'), 'Worker #2');
  });

  it('handles id without hyphen', () => {
    assert.equal(displayNameFor('standalone'), 'Standalone #1');
  });

  it('counts roles independently', () => {
    assert.equal(displayNameFor('lead-aaa'), 'Lead #1');
    assert.equal(displayNameFor('sub-bbb'), 'Sub #1');
    assert.equal(displayNameFor('lead-ccc'), 'Lead #2');
    assert.equal(displayNameFor('sub-ddd'), 'Sub #2');
  });

  it('shares Agent counter between agent-* and unknown-agent', () => {
    assert.equal(displayNameFor('agent-abc'), 'Agent #1');
    assert.equal(displayNameFor('unknown-agent'), 'Agent #2');
  });
});
