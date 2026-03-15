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

export function relativeTime(isoString, now = Date.now()) {
  if (!isoString) return '-';
  const ms = new Date(isoString).getTime();
  if (isNaN(ms)) return '-';
  const elapsed = Math.floor((now - ms) / 1000);
  if (elapsed < 5) return '방금';
  if (elapsed < 60) return `${elapsed}초 전`;
  if (elapsed < 3600) return `${Math.floor(elapsed / 60)}분 전`;
  if (elapsed < 86400) return `${Math.floor(elapsed / 3600)}시간 전`;
  return `${Math.floor(elapsed / 86400)}일 전`;
}

export function countDuplicateLabels(labels) {
  const counts = new Map();
  for (const label of labels) {
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  return counts;
}

export function countActiveAgents(agents, now = Date.now()) {
  return agents.filter((a) => now - new Date(a.lastSeen).getTime() < 30_000).length;
}
