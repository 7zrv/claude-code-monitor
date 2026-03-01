import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { MODELS } from '../frontend-load-test.js';

describe('frontend-load-test constants', () => {
  describe('MODELS', () => {
    it('contains exactly 3 Claude model names', () => {
      assert.equal(MODELS.length, 3);
    });

    it('includes claude-opus-4-6', () => {
      assert.ok(MODELS.includes('claude-opus-4-6'));
    });

    it('includes claude-sonnet-4-6', () => {
      assert.ok(MODELS.includes('claude-sonnet-4-6'));
    });

    it('includes claude-haiku-4-5', () => {
      assert.ok(MODELS.includes('claude-haiku-4-5'));
    });
  });
});
