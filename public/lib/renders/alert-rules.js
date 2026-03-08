import { describeAlertRules, sanitizeAlertRules } from '../alert-rules.js';
import { escapeHtml } from '../utils.js';

export function alertRulesHtml(rules = {}) {
  const resolved = sanitizeAlertRules(rules);
  return `
    <div class="alert-rules-card">
      <div class="alert-rules-grid">
        <label class="alert-rules-field">
          <span>경고 횟수</span>
          <input data-alert-rule="warningCountThreshold" type="number" min="1" step="1" value="${escapeHtml(String(resolved.warningCountThreshold))}" />
        </label>
        <label class="alert-rules-field">
          <span>비용 spike (USD)</span>
          <input data-alert-rule="costUsdThreshold" type="number" min="0" step="0.01" value="${escapeHtml(String(resolved.costUsdThreshold))}" />
        </label>
        <label class="alert-rules-field">
          <span>토큰 spike</span>
          <input data-alert-rule="tokenTotalThreshold" type="number" min="0" step="1000" value="${escapeHtml(String(resolved.tokenTotalThreshold))}" />
        </label>
      </div>
      <div class="alert-rules-actions">
        <small class="alert-rules-hint">사용자 규칙이 기본 규칙을 덮어씁니다. ${escapeHtml(describeAlertRules(resolved))}</small>
        <button class="alert-rules-reset-btn" type="button" data-alert-rules-reset>기본값 복원</button>
      </div>
    </div>
  `;
}

function readRulesFromRoot(root) {
  return sanitizeAlertRules({
    warningCountThreshold: root.querySelector('[data-alert-rule="warningCountThreshold"]')?.value,
    costUsdThreshold: root.querySelector('[data-alert-rule="costUsdThreshold"]')?.value,
    tokenTotalThreshold: root.querySelector('[data-alert-rule="tokenTotalThreshold"]')?.value
  });
}

export function renderAlertRules(root, rules = {}, options = {}) {
  const { onChange, onReset } = options;
  root.innerHTML = alertRulesHtml(rules);

  root.onchange = (event) => {
    if (!event.target?.dataset?.alertRule || typeof onChange !== 'function') return;
    onChange(readRulesFromRoot(root));
  };

  root.onclick = (event) => {
    if (!event.target?.closest?.('[data-alert-rules-reset]') || typeof onReset !== 'function') return;
    onReset();
  };
}
