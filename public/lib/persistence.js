import { DEFAULT_ALERT_RULES, sanitizeAlertRules } from './alert-rules.js';

export function saveFilters(storageKey, filters, storage = localStorage) {
  storage.setItem(storageKey, JSON.stringify(filters));
}

export function loadFilters(storageKey, storage = localStorage) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function saveToggle(storageKey, value, storage = localStorage) {
  storage.setItem(storageKey, String(value));
}

export function loadToggle(storageKey, storage = localStorage) {
  return storage.getItem(storageKey) === 'true';
}

export function saveAlertRules(storageKey, rules, storage = localStorage) {
  storage.setItem(storageKey, JSON.stringify(sanitizeAlertRules(rules)));
}

export function loadAlertRules(storageKey, storage = localStorage) {
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return { ...DEFAULT_ALERT_RULES };
    return sanitizeAlertRules(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_ALERT_RULES };
  }
}

export function resetAlertRules(storageKey, storage = localStorage) {
  storage.removeItem(storageKey);
  return { ...DEFAULT_ALERT_RULES };
}
