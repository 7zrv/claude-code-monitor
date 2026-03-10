function filterSessionEvents(events = [], sessionId = '') {
  return (Array.isArray(events) ? events : []).filter((event) => event.sessionId === sessionId);
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

  if (sessionEventsCache?.has?.(selectedSessionId)) {
    const cachedEvents = sessionEventsCache.get(selectedSessionId);
    const resolved = Array.isArray(cachedEvents) ? cachedEvents : [];
    return {
      events: resolved,
      total: resolved.length,
      sessionId: selectedSessionId,
      source: 'session-cache',
      isSessionScoped: true
    };
  }

  const filtered = filterSessionEvents(globalEvents, selectedSessionId);
  return {
    events: filtered,
    total: filtered.length,
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
