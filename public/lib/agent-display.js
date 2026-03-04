/** @type {Map<string, {role: string, model: string, seq: number, comboKey: string}>} */
let agentRegistry = new Map();

/** @type {Map<string, number>} comboKey → next sequence number */
let comboCounters = new Map();

/** @type {Map<string, Set<string>>} comboKey → Set of agentIds */
let comboMembers = new Map();

/**
 * Extract a normalised role label from an agent ID.
 *
 * - "lead-01660f97"  → "Lead"
 * - "sub-067ce384"   → "Sub"
 * - "agent-abc"      → "Agent"
 * - "unknown-agent"  → "Agent"
 * - "worker-abc123"  → "Worker"
 * - "standalone"     → "Standalone"
 *
 * @param {string} agentId
 * @returns {string}
 */
function extractRole(agentId) {
  if (agentId === 'unknown-agent') return 'Agent';

  const hyphenIdx = agentId.indexOf('-');
  const prefix = hyphenIdx === -1 ? agentId : agentId.slice(0, hyphenIdx);
  if (prefix === 'agent') return 'Agent';

  return prefix.charAt(0).toUpperCase() + prefix.slice(1).toLowerCase();
}

/**
 * Convert a full model identifier to a short display name.
 *
 * - "claude-opus-4-6"   → "Opus"
 * - "claude-sonnet-4-6" → "Sonnet"
 * - "claude-haiku-4-5"  → "Haiku"
 * - ""                  → ""
 * - undefined           → ""
 * - "gpt-4"             → "gpt-4"
 *
 * @param {string|undefined} model
 * @returns {string}
 */
export function shortModelName(model) {
  if (!model) return '';
  const lower = model.toLowerCase();
  if (lower.includes('opus')) return 'Opus';
  if (lower.includes('sonnet')) return 'Sonnet';
  if (lower.includes('haiku')) return 'Haiku';
  return model;
}

/**
 * Convert an agent ID to a human-friendly display name.
 *
 * Format: "Role (Model)" when model is known, with "#N" suffix only
 * when multiple agents share the same role+model combination.
 *
 * Falls back to "Role #N" when no model information is available.
 *
 * The mapping is stable within a page session — the same agentId always
 * returns the same display name (though the suffix may appear when a
 * duplicate combo is registered).
 *
 * @param {string} agentId
 * @param {string} [model] - Full model identifier (e.g. "claude-opus-4-6")
 * @returns {string}
 */
export function displayNameFor(agentId, model) {
  let info = agentRegistry.get(agentId);

  if (!info) {
    const role = extractRole(agentId);
    const shortModel = shortModelName(model);
    const comboKey = `${role}|${shortModel}`;
    const seq = (comboCounters.get(comboKey) || 0) + 1;
    comboCounters.set(comboKey, seq);

    if (!comboMembers.has(comboKey)) comboMembers.set(comboKey, new Set());
    comboMembers.get(comboKey).add(agentId);

    info = { role, model: shortModel, seq, comboKey };
    agentRegistry.set(agentId, info);
  }

  const count = comboMembers.get(info.comboKey)?.size || 1;

  if (!info.model) {
    return `${info.role} #${info.seq}`;
  }

  return count > 1
    ? `${info.role} (${info.model}) #${info.seq}`
    : `${info.role} (${info.model})`;
}

/**
 * Reset all cached display names and counters.
 * Mainly used for testing.
 */
export function resetDisplayNames() {
  agentRegistry = new Map();
  comboCounters = new Map();
  comboMembers = new Map();
}
