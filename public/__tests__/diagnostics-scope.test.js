import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { diagnosticsEmptyMessage, diagnosticsScopeLabel, selectDiagnosticsEvents } from '../lib/diagnostics-scope.js';

function makeSnapshot(events = []) {
  return { recent: events };
}

describe('selectDiagnosticsEvents', () => {
  it('returns global events when no session is selected', () => {
    const snapshot = makeSnapshot([{ id: '1', sessionId: 's1' }, { id: '2', sessionId: 's2' }]);
    const result = selectDiagnosticsEvents(snapshot, '', new Map());
    assert.equal(result.isSessionScoped, false);
    assert.equal(result.total, 2);
    assert.equal(result.source, 'global');
  });

  it('uses cached session events when available', () => {
    const cache = new Map([['s1', [{ id: 'cached-1', sessionId: 's1' }]]]);
    const result = selectDiagnosticsEvents(makeSnapshot([{ id: '1', sessionId: 's1' }]), 's1', cache);
    assert.equal(result.isSessionScoped, true);
    assert.equal(result.source, 'session-cache');
    assert.deepEqual(result.events.map((event) => event.id), ['cached-1']);
  });

  it('falls back to snapshot filtering before session events are cached', () => {
    const snapshot = makeSnapshot([
      { id: '1', sessionId: 's1' },
      { id: '2', sessionId: 's2' },
      { id: '3', sessionId: 's1' }
    ]);
    const result = selectDiagnosticsEvents(snapshot, 's1', new Map());
    assert.equal(result.source, 'snapshot');
    assert.deepEqual(result.events.map((event) => event.id), ['1', '3']);
  });
});

describe('diagnostics scope labels', () => {
  it('describes the global scope', () => {
    assert.equal(diagnosticsScopeLabel({ isSessionScoped: false }), '전체 세션 기준');
    assert.equal(diagnosticsEmptyMessage({ isSessionScoped: false }), 'No timeline data');
  });

  it('describes the selected session scope', () => {
    const scope = { isSessionScoped: true, sessionId: 'sess-123' };
    assert.equal(diagnosticsScopeLabel(scope), '선택 세션 sess-123 기준');
    assert.equal(diagnosticsEmptyMessage(scope), '선택 세션 sess-123의 타임라인 데이터가 없습니다.');
  });
});
