let streamRef = null;
let pollTimer = null;
let lastSuccessAt = null;

function formatConnectionTime(iso) {
  if (!iso) return '';
  const ts = new Date(iso);
  return Number.isNaN(ts.getTime()) ? '' : ts.toLocaleTimeString();
}

export function buildConnectionView(status, { lastSuccessAt: successAt } = {}) {
  const lastSuccess = formatConnectionTime(successAt);
  const suffix = lastSuccess ? ` · 마지막 성공 ${lastSuccess}` : '';

  switch (status) {
    case 'connected':
      return { label: 'connected', detail: `실시간 스트림 연결됨${suffix}` };
    case 'reconnecting':
      return { label: 'reconnecting', detail: `스트림 재연결 중 · 스냅샷 폴링 유지${suffix}` };
    case 'offline':
      return { label: 'offline', detail: `스트림 끊김 · 재시도 대기${suffix}` };
    default:
      return { label: status, detail: '상태 정보를 확인할 수 없습니다.' };
  }
}

export function setConnectionStatus(el, status, { metaEl = null, lastSuccessAt: successAt = lastSuccessAt } = {}) {
  const view = buildConnectionView(status, { lastSuccessAt: successAt });
  el.dataset.status = status;
  el.textContent = view.label;
  el.title = view.detail;
  if (metaEl) {
    metaEl.textContent = view.detail;
  }
}

function markSuccess() {
  lastSuccessAt = new Date().toISOString();
}

export function startPolling(callback) {
  if (pollTimer) return;
  pollTimer = setInterval(() => callback().catch(console.error), 10000);
}

export function stopPolling() {
  if (!pollTimer) return;
  clearInterval(pollTimer);
  pollTimer = null;
}

export async function loadSnapshot() {
  const res = await fetch('/api/events');
  return res.json();
}

export function connectStream({ connectionEl, connectionMetaEl, onSnapshot, onEvent, onFallback }) {
  if (streamRef) {
    streamRef.close();
  }

  setConnectionStatus(connectionEl, 'reconnecting', { metaEl: connectionMetaEl });
  startPolling(async () => {
    const snapshot = await loadSnapshot();
    markSuccess();
    setConnectionStatus(connectionEl, 'reconnecting', { metaEl: connectionMetaEl });
    onSnapshot(snapshot);
  });

  const es = new EventSource('/api/stream');
  streamRef = es;

  es.onopen = () => {
    markSuccess();
    setConnectionStatus(connectionEl, 'connected', { metaEl: connectionMetaEl });
    stopPolling();
  };

  es.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data);
      markSuccess();
      setConnectionStatus(connectionEl, 'connected', { metaEl: connectionMetaEl });
      if (parsed.type === 'snapshot' && parsed.payload) {
        onSnapshot(parsed.payload);
        return;
      }
      if (parsed.type === 'event' && parsed.payload) {
        onEvent(parsed.payload);
        return;
      }
    } catch {
      // fallback below
    }
    onFallback();
  };

  es.onerror = () => {
    setConnectionStatus(connectionEl, 'offline', { metaEl: connectionMetaEl });
    startPolling(async () => {
      const snapshot = await loadSnapshot();
      markSuccess();
      setConnectionStatus(connectionEl, 'reconnecting', { metaEl: connectionMetaEl });
      onSnapshot(snapshot);
    });
    es.close();
    setTimeout(() => connectStream({ connectionEl, connectionMetaEl, onSnapshot, onEvent, onFallback }), 1500);
  };
}
