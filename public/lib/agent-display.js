/** @type {Map<string, string>} agentId → display name */
let nameCache = new Map();

/** @type {Map<string, number>} role → next sequence number */
let roleCounters = new Map();

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
 * Convert an agent ID to a human-friendly display name.
 * The mapping is stable within a page session — the same agentId always
 * returns the same display name. Sequence numbers are assigned per-role
 * in first-seen order.
 *
 * @param {string} agentId
 * @returns {string} e.g. "Lead #1", "Sub #2"
 */
export function displayNameFor(agentId) {
  const cached = nameCache.get(agentId);
  if (cached) return cached;

  const role = extractRole(agentId);
  const seq = (roleCounters.get(role) || 0) + 1;
  roleCounters.set(role, seq);

  const name = `${role} #${seq}`;
  nameCache.set(agentId, name);
  return name;
}

/**
 * Reset all cached display names and counters.
 * Mainly used for testing.
 */
export function resetDisplayNames() {
  nameCache = new Map();
  roleCounters = new Map();
}
