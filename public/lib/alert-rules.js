export const ALERT_RULES_STORAGE_KEY = 'agent_monitor_alert_rules_v1';

export const DEFAULT_ALERT_RULES = Object.freeze({
  costUsdThreshold: 0.5,
  tokenTotalThreshold: 20_000,
  warningCountThreshold: 1
});

function cloneAlertRules(rules = DEFAULT_ALERT_RULES) {
  return {
    costUsdThreshold: rules.costUsdThreshold,
    tokenTotalThreshold: rules.tokenTotalThreshold,
    warningCountThreshold: rules.warningCountThreshold
  };
}

function toPositiveNumber(value) {
  if (typeof value === 'string' && value.trim() === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toPositiveInteger(value, minimum = 0) {
  const parsed = toPositiveNumber(value);
  if (parsed === null) return null;
  return Math.max(minimum, Math.round(parsed));
}

export function sanitizeAlertRules(rules = {}, defaults = DEFAULT_ALERT_RULES) {
  const source = rules && typeof rules === 'object' ? rules : {};
  const fallback = cloneAlertRules(defaults);

  const costUsdThreshold = toPositiveNumber(source.costUsdThreshold);
  const tokenTotalThreshold = toPositiveInteger(source.tokenTotalThreshold, 0);
  const warningCountThreshold = toPositiveInteger(source.warningCountThreshold, 1);

  return {
    costUsdThreshold: costUsdThreshold ?? fallback.costUsdThreshold,
    tokenTotalThreshold: tokenTotalThreshold ?? fallback.tokenTotalThreshold,
    warningCountThreshold: warningCountThreshold ?? fallback.warningCountThreshold
  };
}

export function describeAlertRules(rules = DEFAULT_ALERT_RULES) {
  const resolved = sanitizeAlertRules(rules);
  return [
    `warn ${resolved.warningCountThreshold}+`,
    `cost $${resolved.costUsdThreshold.toFixed(2)}+`,
    `tokens ${new Intl.NumberFormat('en-US').format(resolved.tokenTotalThreshold)}+`
  ].join(' · ');
}
