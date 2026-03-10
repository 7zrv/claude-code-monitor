function filterSessionEvents(events = [], sessionId = '') {
  return (Array.isArray(events) ? events : []).filter((event) => event.sessionId === sessionId);
}

function eventIdentity(event = {}) {
  return String(event.id || `${event.receivedAt || ''}:${event.agentId || ''}:${event.event || ''}:${event.message || ''}`);
}

function eventTimestamp(event = {}) {
  const ts = new Date(event.receivedAt || '').getTime();
  return Number.isFinite(ts) ? ts : 0;
}

export function mergeSessionEvents(cachedEvents = [], snapshotEvents = []) {
  const merged = new Map();

  for (const event of Array.isArray(cachedEvents) ? cachedEvents : []) {
    merged.set(eventIdentity(event), event);
  }
  for (const event of Array.isArray(snapshotEvents) ? snapshotEvents : []) {
    merged.set(eventIdentity(event), event);
  }

  return [...merged.values()].sort((a, b) => {
    const tsDelta = eventTimestamp(b) - eventTimestamp(a);
    if (tsDelta !== 0) return tsDelta;
    return String(b.id || '').localeCompare(String(a.id || ''));
  });
}

export function selectDiagnosticsEvents(snapshot = {}, selectedSessionId = '', sessionEventsCache = new Map()) {
  const globalEvents = Array.isArray(snapshot.recent) ? snapshot.recent : [];
  if (!selectedSessionId) {
    return {
      events: globalEvents,
      total: globalEvents.length,
      sessionId: '',
      source: 'global',
      isSessionScoped: false
    };
  }

  const snapshotScopedEvents = filterSessionEvents(globalEvents, selectedSessionId);
  if (sessionEventsCache?.has?.(selectedSessionId)) {
    const cachedEvents = sessionEventsCache.get(selectedSessionId);
    const resolved = mergeSessionEvents(cachedEvents, snapshotScopedEvents);
    return {
      events: resolved,
      total: resolved.length,
      sessionId: selectedSessionId,
      source: 'session-merged',
      isSessionScoped: true
    };
  }

  return {
    events: snapshotScopedEvents,
    total: snapshotScopedEvents.length,
    sessionId: selectedSessionId,
    source: 'snapshot',
    isSessionScoped: true
  };
}

export function diagnosticsScopeLabel(scope = {}) {
  if (!scope?.isSessionScoped || !scope.sessionId) return '전체 세션 기준';
  return `선택 세션 ${scope.sessionId} 기준`;
}

export function diagnosticsEmptyMessage(scope = {}) {
  if (!scope?.isSessionScoped || !scope.sessionId) return 'No timeline data';
  return `선택 세션 ${scope.sessionId}의 타임라인 데이터가 없습니다.`;
}
