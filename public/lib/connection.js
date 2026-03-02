let streamRef = null;
let pollTimer = null;

export function setConnectionStatus(el, status) {
  el.dataset.status = status;
  el.textContent = status;
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

export function connectStream({ connectionEl, onSnapshot, onEvent, onFallback }) {
  if (streamRef) {
    streamRef.close();
  }

  setConnectionStatus(connectionEl, 'reconnecting');
  startPolling(async () => {
    const snapshot = await loadSnapshot();
    onSnapshot(snapshot);
  });

  const es = new EventSource('/api/stream');
  streamRef = es;

  es.onopen = () => {
    setConnectionStatus(connectionEl, 'connected');
    stopPolling();
  };

  es.onmessage = (message) => {
    try {
      const parsed = JSON.parse(message.data);
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
    setConnectionStatus(connectionEl, 'offline');
    startPolling(async () => {
      const snapshot = await loadSnapshot();
      onSnapshot(snapshot);
    });
    es.close();
    setTimeout(() => connectStream({ connectionEl, onSnapshot, onEvent, onFallback }), 1500);
  };
}
