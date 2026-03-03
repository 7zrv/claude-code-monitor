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

export function getActivityStatus(lastSeen, now = Date.now()) {
  if (!lastSeen) return 'idle';
  const elapsed = now - new Date(lastSeen).getTime();
  if (elapsed < 30_000) return 'active';
  if (elapsed < 120_000) return 'recent';
  return 'idle';
}

export function activityDotHtml(status) {
  const safe = escapeHtml(status);
  return `<span class="activity-dot activity-dot--${safe}" aria-label="${safe}"></span>`;
}

export function countActiveAgents(agents, now = Date.now()) {
  return agents.filter((a) => now - new Date(a.lastSeen).getTime() < 30_000).length;
}
