import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { AGENTS, EVENTS } from '../../simulator.js';

describe('simulator constants', () => {
  describe('AGENTS', () => {
    it('contains exactly 3 Claude model names', () => {
      assert.equal(AGENTS.length, 3);
    });

    it('includes claude-opus-4-6', () => {
      assert.ok(AGENTS.includes('claude-opus-4-6'));
    });

    it('includes claude-sonnet-4-6', () => {
      assert.ok(AGENTS.includes('claude-sonnet-4-6'));
    });

    it('includes claude-haiku-4-5', () => {
      assert.ok(AGENTS.includes('claude-haiku-4-5'));
    });
  });

  describe('EVENTS', () => {
    it('contains exactly 6 event types', () => {
      assert.equal(EVENTS.length, 6);
    });

    it('includes heartbeat', () => {
      assert.ok(EVENTS.includes('heartbeat'));
    });

    it('includes session_start', () => {
      assert.ok(EVENTS.includes('session_start'));
    });

    it('includes session_end', () => {
      assert.ok(EVENTS.includes('session_end'));
    });

    it('includes tool_call', () => {
      assert.ok(EVENTS.includes('tool_call'));
    });

    it('includes user_message', () => {
      assert.ok(EVENTS.includes('user_message'));
    });

    it('includes token_usage', () => {
      assert.ok(EVENTS.includes('token_usage'));
    });
  });
});
