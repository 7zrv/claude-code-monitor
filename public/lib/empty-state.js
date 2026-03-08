/**
 * Detects a zero-data first-run state.
 * Distinct from a connection failure: the server responded but no Claude Code
 * activity has been collected yet.
 *
 * @param {object|null} snapshot
 * @returns {boolean}
 */
export function isEmptySnapshot(snapshot) {
  if (!snapshot) return true;
  const hasAgents = Array.isArray(snapshot.agents) && snapshot.agents.length > 0;
  const hasSessions = Array.isArray(snapshot.sessions) && snapshot.sessions.length > 0;
  const hasEvents = Array.isArray(snapshot.recent) && snapshot.recent.length > 0;
  return !hasAgents && !hasSessions && !hasEvents;
}

/**
 * Renders a first-run empty state panel into el.
 * Shows collection path guidance and what will appear once data arrives.
 *
 * @param {HTMLElement} el
 */
export function renderEmptyState(el) {
  el.innerHTML = `<div class="empty-state">
  <div class="empty-state-icon" aria-hidden="true">
    <svg width="52" height="52" viewBox="0 0 52 52" fill="none" xmlns="http://www.w3.org/2000/svg">
      <circle cx="26" cy="26" r="24" stroke="currentColor" stroke-width="1.5" stroke-dasharray="5 4" opacity="0.45"/>
      <path d="M18 26h16M26 18v16" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.55"/>
    </svg>
  </div>
  <h3 class="empty-state-title">아직 수집된 데이터가 없습니다</h3>
  <p class="empty-state-desc">Claude Code를 실행하면 세션 이벤트가 자동으로 수집됩니다.</p>
  <div class="empty-state-paths">
    <p class="empty-state-paths-label">수집 대상 경로</p>
    <code class="empty-state-path">~/.claude/projects/</code>
    <code class="empty-state-path">~/.claude/history.jsonl</code>
  </div>
  <p class="empty-state-hint">수집이 시작되면 아래 섹션에 다음 정보가 표시됩니다:</p>
  <ul class="empty-state-list">
    <li>세션 타임라인 및 실시간 이벤트 피드</li>
    <li>토큰 사용량 · 비용 추이 그래프</li>
    <li>에이전트 상태 및 도구 호출 통계</li>
  </ul>
  <p class="empty-state-hint">Claude Code를 실행한 뒤 이 화면은 자동으로 업데이트됩니다.</p>
</div>`;
}
