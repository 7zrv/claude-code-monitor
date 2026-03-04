import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { displayNameFor, shortModelName, resetDisplayNames } from '../lib/agent-display.js';

describe('shortModelName', () => {
  it('extracts Opus from claude-opus model string', () => {
    assert.equal(shortModelName('claude-opus-4-6'), 'Opus');
  });

  it('extracts Sonnet from claude-sonnet model string', () => {
    assert.equal(shortModelName('claude-sonnet-4-6'), 'Sonnet');
  });

  it('extracts Haiku from claude-haiku model string', () => {
    assert.equal(shortModelName('claude-haiku-4-5'), 'Haiku');
  });

  it('returns empty string for empty input', () => {
    assert.equal(shortModelName(''), '');
  });

  it('returns empty string for undefined', () => {
    assert.equal(shortModelName(undefined), '');
  });

  it('returns original string for unknown model', () => {
    assert.equal(shortModelName('gpt-4'), 'gpt-4');
  });
});

describe('displayNameFor', () => {
  beforeEach(() => {
    resetDisplayNames();
  });

  it('shows role with model for a single lead agent', () => {
    assert.equal(displayNameFor('lead-abc', 'claude-opus-4-6'), 'Lead (Opus)');
  });

  it('shows role with model for a single sub agent', () => {
    assert.equal(displayNameFor('sub-abc', 'claude-sonnet-4-6'), 'Sub (Sonnet)');
  });

  it('adds sequence number when same role+model combo appears twice', () => {
    displayNameFor('sub-aaa', 'claude-sonnet-4-6');
    displayNameFor('sub-bbb', 'claude-sonnet-4-6');
    assert.equal(displayNameFor('sub-aaa'), 'Sub (Sonnet) #1');
    assert.equal(displayNameFor('sub-bbb'), 'Sub (Sonnet) #2');
  });

  it('does not add number for different models of same role', () => {
    assert.equal(displayNameFor('sub-aaa', 'claude-sonnet-4-6'), 'Sub (Sonnet)');
    assert.equal(displayNameFor('sub-bbb', 'claude-haiku-4-5'), 'Sub (Haiku)');
  });

  it('is idempotent for same agentId', () => {
    const first = displayNameFor('lead-aaa', 'claude-opus-4-6');
    const second = displayNameFor('lead-aaa');
    assert.equal(first, second);
  });

  it('uses cached model on subsequent calls without model param', () => {
    displayNameFor('lead-aaa', 'claude-opus-4-6');
    assert.equal(displayNameFor('lead-aaa'), 'Lead (Opus)');
  });

  it('falls back to role #N when no model provided', () => {
    assert.equal(displayNameFor('lead-aaa'), 'Lead #1');
    assert.equal(displayNameFor('lead-bbb'), 'Lead #2');
  });

  it('counts roles independently across different role+model combos', () => {
    assert.equal(displayNameFor('lead-aaa', 'claude-opus-4-6'), 'Lead (Opus)');
    assert.equal(displayNameFor('sub-bbb', 'claude-sonnet-4-6'), 'Sub (Sonnet)');
  });

  it('handles unknown-agent as Agent role', () => {
    assert.equal(displayNameFor('unknown-agent', 'claude-opus-4-6'), 'Agent (Opus)');
  });

  it('handles agent prefix as Agent role', () => {
    assert.equal(displayNameFor('agent-abc', 'claude-sonnet-4-6'), 'Agent (Sonnet)');
  });

  it('shares Agent counter between agent-* and unknown-agent with same model', () => {
    displayNameFor('agent-abc', 'claude-opus-4-6');
    displayNameFor('unknown-agent', 'claude-opus-4-6');
    assert.equal(displayNameFor('agent-abc'), 'Agent (Opus) #1');
    assert.equal(displayNameFor('unknown-agent'), 'Agent (Opus) #2');
  });

  it('handles id without hyphen', () => {
    assert.equal(displayNameFor('standalone', 'claude-opus-4-6'), 'Standalone (Opus)');
  });

  it('capitalizes unknown role prefixes', () => {
    assert.equal(displayNameFor('worker-abc', 'claude-opus-4-6'), 'Worker (Opus)');
  });
});
