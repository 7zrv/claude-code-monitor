export function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function statusPill(status) {
  const safe = escapeHtml(status);
  return `<span class="status-pill" data-status="${safe}">${safe}</span>`;
}

export function normalizeText(v) {
  return String(v || '').toLowerCase();
}
