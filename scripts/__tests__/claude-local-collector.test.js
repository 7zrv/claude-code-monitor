import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  historyToEvent,
  sessionLineToEvent,
  walkJsonlFiles,
  readDelta,
  getCursor,
  cursors
} from '../claude-local-collector.js';

// ---------------------------------------------------------------------------
// historyToEvent
// ---------------------------------------------------------------------------
describe('historyToEvent', () => {
  it('returns null for invalid JSON', () => {
    assert.equal(historyToEvent('not json'), null);
  });

  it('returns null when display field is missing', () => {
    assert.equal(historyToEvent(JSON.stringify({ foo: 'bar' })), null);
  });

  it('parses a normal history line', () => {
    const line = JSON.stringify({
      display: 'hello world',
      timestamp: '2025-01-01T00:00:00Z',
      sessionId: 'sess-1'
    });
    const evt = historyToEvent(line);
    assert.equal(evt.agentId, 'lead');
    assert.equal(evt.event, 'user_request');
    assert.equal(evt.status, 'ok');
    assert.equal(evt.message, 'hello world');
    assert.equal(evt.timestamp, '2025-01-01T00:00:00Z');
    assert.equal(evt.metadata.source, 'claude_history');
    assert.equal(evt.metadata.sessionId, 'sess-1');
    assert.equal(evt.metadata.textLength, 11);
  });

  it('truncates message to 120 chars', () => {
    const long = 'a'.repeat(200);
    const evt = historyToEvent(JSON.stringify({ display: long }));
    assert.equal(evt.message.length, 120);
  });

  it('handles synthetic collector_warning lines', () => {
    const line = JSON.stringify({
      synthetic: true,
      kind: 'collector_warning',
      message: 'some warning'
    });
    const evt = historyToEvent(line);
    assert.equal(evt.event, 'collector_warning');
    assert.equal(evt.status, 'warning');
    assert.equal(evt.message, 'some warning');
    assert.equal(evt.metadata.kind, 'collector_warning');
  });

  it('uses fallback timestamp when missing', () => {
    const evt = historyToEvent(JSON.stringify({ display: 'hi' }));
    assert.ok(evt.timestamp);
  });

  it('sets sessionId to null when missing', () => {
    const evt = historyToEvent(JSON.stringify({ display: 'hi' }));
    assert.equal(evt.metadata.sessionId, null);
  });
});

// ---------------------------------------------------------------------------
// sessionLineToEvent
// ---------------------------------------------------------------------------
describe('sessionLineToEvent', () => {
  it('returns empty array for invalid JSON', () => {
    assert.deepEqual(sessionLineToEvent('bad json'), []);
  });

  it('returns empty array for unknown type', () => {
    assert.deepEqual(
      sessionLineToEvent(JSON.stringify({ type: 'system' })),
      []
    );
  });

  // -- user messages --
  describe('user messages', () => {
    it('parses string content', () => {
      const line = JSON.stringify({
        type: 'user',
        sessionId: 's1',
        timestamp: '2025-01-01T00:00:00Z',
        message: { content: 'hello' }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 1);
      assert.equal(events[0].event, 'user_message');
      assert.equal(events[0].message, 'hello');
      assert.equal(events[0].metadata.sessionId, 's1');
    });

    it('parses array content', () => {
      const line = JSON.stringify({
        type: 'user',
        message: { content: [{ text: 'part1' }, { content: 'part2' }] }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 1);
      assert.equal(events[0].message, 'part1 part2');
    });

    it('returns empty array when content is missing', () => {
      const line = JSON.stringify({ type: 'user', message: {} });
      assert.deepEqual(sessionLineToEvent(line), []);
    });

    it('returns empty array when message is missing', () => {
      const line = JSON.stringify({ type: 'user' });
      assert.deepEqual(sessionLineToEvent(line), []);
    });

    it('returns empty array when array content is all empty', () => {
      const line = JSON.stringify({
        type: 'user',
        message: { content: [{ text: '' }, { content: '' }] }
      });
      assert.deepEqual(sessionLineToEvent(line), []);
    });
  });

  // -- assistant messages --
  describe('assistant messages', () => {
    it('parses text content', () => {
      const line = JSON.stringify({
        type: 'assistant',
        sessionId: 's2',
        timestamp: '2025-01-01T00:00:00Z',
        message: {
          model: 'claude-3',
          content: [{ type: 'text', text: 'response' }]
        }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 1);
      assert.equal(events[0].event, 'assistant_message');
      assert.equal(events[0].message, 'response');
      assert.equal(events[0].metadata.model, 'claude-3');
    });

    it('parses tool_use content', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'read_file', input: { path: '/tmp' } }]
        }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 1);
      assert.equal(events[0].event, 'tool_call');
      assert.equal(events[0].message, 'read_file');
      assert.deepEqual(events[0].metadata.toolInput, { path: '/tmp' });
    });

    it('truncates large tool input', () => {
      const largeInput = { data: 'x'.repeat(600) };
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [{ type: 'tool_use', name: 'write', input: largeInput }]
        }
      });
      const events = sessionLineToEvent(line);
      assert.deepEqual(events[0].metadata.toolInput, { _truncated: true });
    });

    it('defaults tool name to unknown_tool', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'tool_use', input: {} }] }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events[0].message, 'unknown_tool');
    });

    it('emits token_usage event when usage present', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-3',
          content: [],
          usage: {
            input_tokens: 100,
            output_tokens: 50,
            cache_read_input_tokens: 10
          }
        }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 1);
      assert.equal(events[0].event, 'token_usage');
      assert.equal(events[0].message, 'tokens +150');
      assert.deepEqual(events[0].metadata.tokenUsage, {
        inputTokens: 100,
        outputTokens: 50,
        cacheReadInputTokens: 10,
        totalTokens: 150
      });
    });

    it('skips token_usage when total is 0', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [],
          usage: { input_tokens: 0, output_tokens: 0 }
        }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 0);
    });

    it('handles mixed content (text + tool_use + usage)', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          model: 'claude-3',
          content: [
            { type: 'text', text: 'thinking...' },
            { type: 'tool_use', name: 'bash', input: { cmd: 'ls' } }
          ],
          usage: { input_tokens: 10, output_tokens: 20 }
        }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 3);
      assert.equal(events[0].event, 'assistant_message');
      assert.equal(events[1].event, 'tool_call');
      assert.equal(events[2].event, 'token_usage');
    });

    it('ignores tool_result content type silently', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: {
          content: [
            { type: 'tool_result', tool_use_id: 'abc', content: 'ok' }
          ]
        }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 0);
    });

    it('skips text items with empty text', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: { content: [{ type: 'text', text: '' }] }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 0);
    });

    it('handles missing content array gracefully', () => {
      const line = JSON.stringify({
        type: 'assistant',
        message: { model: 'claude-3' }
      });
      const events = sessionLineToEvent(line);
      assert.equal(events.length, 0);
    });
  });
});

// ---------------------------------------------------------------------------
// walkJsonlFiles
// ---------------------------------------------------------------------------
describe('walkJsonlFiles', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `collector-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns empty array for non-existent directory', async () => {
    const result = await walkJsonlFiles('/tmp/does-not-exist-' + Date.now());
    assert.deepEqual(result, []);
  });

  it('returns empty array for empty directory', async () => {
    const result = await walkJsonlFiles(tmpDir);
    assert.deepEqual(result, []);
  });

  it('finds .jsonl files in 2-level structure', async () => {
    const subDir = join(tmpDir, 'hash1');
    await mkdir(subDir);
    await writeFile(join(subDir, 'session1.jsonl'), '');
    await writeFile(join(subDir, 'session2.jsonl'), '');

    const result = await walkJsonlFiles(tmpDir);
    assert.equal(result.length, 2);
    assert.ok(result.some((f) => f.endsWith('session1.jsonl')));
    assert.ok(result.some((f) => f.endsWith('session2.jsonl')));
  });

  it('ignores non-.jsonl files', async () => {
    const subDir = join(tmpDir, 'hash2');
    await mkdir(subDir);
    await writeFile(join(subDir, 'notes.txt'), '');
    await writeFile(join(subDir, 'data.json'), '');
    await writeFile(join(subDir, 'real.jsonl'), '');

    const result = await walkJsonlFiles(tmpDir);
    assert.equal(result.length, 1);
    assert.ok(result[0].endsWith('real.jsonl'));
  });

  it('ignores files at root level (only 2-level)', async () => {
    await writeFile(join(tmpDir, 'root.jsonl'), '');

    const result = await walkJsonlFiles(tmpDir);
    assert.deepEqual(result, []);
  });

  it('handles multiple subdirectories', async () => {
    const sub1 = join(tmpDir, 'proj1');
    const sub2 = join(tmpDir, 'proj2');
    await mkdir(sub1);
    await mkdir(sub2);
    await writeFile(join(sub1, 'a.jsonl'), '');
    await writeFile(join(sub2, 'b.jsonl'), '');

    const result = await walkJsonlFiles(tmpDir);
    assert.equal(result.length, 2);
  });
});

// ---------------------------------------------------------------------------
// readDelta — cursor.partial clearing on large skip
// ---------------------------------------------------------------------------
describe('readDelta', () => {
  let tmpDir;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `delta-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await mkdir(tmpDir, { recursive: true });
    cursors.clear();
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
    cursors.clear();
  });

  it('reads new lines from a file', async () => {
    const file = join(tmpDir, 'test.jsonl');
    await writeFile(file, '{"a":1}\n{"a":2}\n');

    const lines = await readDelta(file);
    assert.equal(lines.length, 2);
    assert.equal(lines[0], '{"a":1}');
    assert.equal(lines[1], '{"a":2}');
  });

  it('returns empty array when no new data', async () => {
    const file = join(tmpDir, 'test.jsonl');
    await writeFile(file, '{"a":1}\n');

    await readDelta(file);
    const lines = await readDelta(file);
    assert.deepEqual(lines, []);
  });

  it('handles partial lines across reads', async () => {
    const file = join(tmpDir, 'test.jsonl');
    await writeFile(file, '{"a":1}\n{"a":');

    const lines1 = await readDelta(file);
    assert.equal(lines1.length, 1);
    assert.equal(lines1[0], '{"a":1}');

    await writeFile(file, '{"a":1}\n{"a":2}\n');
    const lines2 = await readDelta(file);
    assert.equal(lines2.length, 1);
    assert.equal(lines2[0], '{"a":2}');
  });

  it('resets cursor when file is truncated', async () => {
    const file = join(tmpDir, 'test.jsonl');
    await writeFile(file, '{"a":1}\n{"a":2}\n');
    await readDelta(file);

    await writeFile(file, '{"b":1}\n');
    const lines = await readDelta(file);
    assert.equal(lines.length, 1);
    assert.equal(lines[0], '{"b":1}');
  });

  it('clears cursor.partial on large skip (dropped=true)', async () => {
    const file = join(tmpDir, 'test.jsonl');
    const stalePartial = '{"start":"partial_dat';

    // Write a small file first, read it to set partial
    await writeFile(file, stalePartial);
    await readDelta(file);

    const cursor = getCursor(file);
    assert.equal(cursor.partial, stalePartial);

    // Now write a file larger than MAX_READ_BYTES to trigger drop
    // We simulate by setting cursor offset far behind
    cursor.offset = 0;
    const bigContent = '{"line":1}\n'.repeat(60000); // ~660KB > 512KB
    await writeFile(file, bigContent);

    const lines = await readDelta(file);
    // First line should be the synthetic warning
    const firstParsed = JSON.parse(lines[0]);
    assert.equal(firstParsed.synthetic, true);
    assert.equal(firstParsed.kind, 'collector_warning');

    // The stale partial from old offset must NOT appear in any line
    for (const line of lines) {
      assert.ok(!line.includes(stalePartial),
        `Stale partial should not appear but found in: ${line.slice(0, 80)}`
      );
    }

    // Lines from index 2 onward should be valid JSON
    // (index 1 is a partial line from reading mid-file, which is expected)
    for (let i = 2; i < lines.length; i++) {
      assert.doesNotThrow(() => JSON.parse(lines[i]),
        `Line ${i} should be valid JSON but got: ${lines[i].slice(0, 50)}`
      );
    }
  });
});
