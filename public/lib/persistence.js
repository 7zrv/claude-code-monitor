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
