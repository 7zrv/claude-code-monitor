export function resolveSessionSelection(sessionRows = [], visibleSessionRows = sessionRows, selectedSessionId = '', allowAutoSelect = true) {
  const rows = Array.isArray(sessionRows) ? sessionRows : [];
  const visible = Array.isArray(visibleSessionRows) ? visibleSessionRows : rows;

  if (selectedSessionId && rows.some((row) => row.sessionId === selectedSessionId)) {
    return {
      selectedSession: rows.find((row) => row.sessionId === selectedSessionId) || null,
      selectedSessionId,
      allowAutoSelect
    };
  }

  if (!allowAutoSelect) {
    return {
      selectedSession: null,
      selectedSessionId: '',
      allowAutoSelect: false
    };
  }

  const fallback = visible[0] || null;
  return {
    selectedSession: fallback,
    selectedSessionId: fallback?.sessionId || '',
    allowAutoSelect: true
  };
}
