import { escapeHtml, statusPill } from '../utils.js';
import { displayNameFor } from '../agent-display.js';

let _selectedAlertId = null;

export function resetAlertSelection() {
  _selectedAlertId = null;
}

export function resolveAlertSessionId(alert = {}, snapshot) {
  if (!snapshot || !alert.agentId) return '';
  const agentState = (snapshot.agents || []).find((agent) => agent.agentId === alert.agentId);
  if (agentState?.sessionId) return agentState.sessionId;
  const recentEvent = (snapshot.recent || []).find((event) => event.agentId === alert.agentId && event.sessionId);
  return recentEvent?.sessionId || '';
}

export function alertItemHtml(alert, isSelected = false, sessionId = '') {
  const cls = isSelected ? 'event alert-item alert-item--selected' : 'event alert-item';
  return `
      <div class="${cls}" data-alert-id="${escapeHtml(alert.id)}"${sessionId ? ` data-session-id="${escapeHtml(sessionId)}"` : ''}>
        <span>${new Date(alert.createdAt).toLocaleTimeString()}</span>
        <span title="${escapeHtml(alert.agentId)}"><strong>${escapeHtml(displayNameFor(alert.agentId))}</strong></span>
        <span>${escapeHtml(alert.event)}</span>
        <span>${escapeHtml(alert.message)}</span>
        ${statusPill(alert.severity)}
      </div>`;
}

export function getAlertContext(agentId, snapshot) {
  if (!snapshot) return { recentEvents: [], agentState: null, linkedSessionId: '' };
  const recentEvents = (snapshot.recent || [])
    .filter((e) => e.agentId === agentId)
    .slice(0, 5);
  const agentState = (snapshot.agents || []).find((a) => a.agentId === agentId) || null;
  const linkedSessionId = agentState?.sessionId || recentEvents.find((event) => event.sessionId)?.sessionId || '';
  return { recentEvents, agentState, linkedSessionId };
}

export function drilldownHtml(alert, context) {
  const { recentEvents, agentState, linkedSessionId } = context;

  const agentSection = agentState
    ? `<div class="drilldown-section">
        <h3>Agent State</h3>
        <div class="drilldown-agent-state">
          <span>Model: <strong>${escapeHtml(agentState.model || '-')}</strong></span>
          <span>Tokens: <strong>${agentState.tokenTotal ?? 0}</strong></span>
          <span>Events: ${agentState.total ?? 0} (ok: ${agentState.ok ?? 0}, warn: ${agentState.warning ?? 0}, err: ${agentState.error ?? 0})</span>
        </div>
      </div>`
    : '';

  const sessionSection = linkedSessionId
    ? `<div class="drilldown-section">
        <h3>Linked Session</h3>
        <div class="drilldown-session-link">
          <strong>${escapeHtml(linkedSessionId)}</strong>
          <button class="drilldown-session-open" data-session-open="${escapeHtml(linkedSessionId)}">세션 열기</button>
        </div>
      </div>`
    : '';

  const eventsSection = recentEvents.length
    ? recentEvents.map((evt) => {
        const toolInfo = evt.event === 'tool_call' && evt.metadata?.toolInput
          ? `<pre class="drilldown-tool-input">${escapeHtml(JSON.stringify(evt.metadata.toolInput, null, 2))}</pre>`
          : '';
        return `
        <div class="drilldown-event">
          <span>${new Date(evt.receivedAt).toLocaleTimeString()}</span>
          <span>${escapeHtml(evt.event)}</span>
          <span>${escapeHtml(evt.message || '')}</span>
          ${statusPill(evt.status)}
          ${toolInfo}
        </div>`;
      }).join('')
    : '<div class="drilldown-event">No recent events for this agent</div>';

  return `
    <div class="drilldown-header">
      <h3>${statusPill(alert.severity)} ${escapeHtml(alert.event)}</h3>
      <button class="drilldown-close" data-drilldown-close>✕</button>
    </div>
    <div class="drilldown-section">
      <h3>Message</h3>
      <p>${escapeHtml(alert.message)}</p>
    </div>
    ${sessionSection}
    ${agentSection}
    <div class="drilldown-section">
      <h3>Recent Events (${escapeHtml(alert.agentId)})</h3>
      ${eventsSection}
    </div>`;
}

export function renderAlerts(alerts, el, drilldownEl, snapshot, options = {}) {
  const { onOpenSession } = options;
  if (!alerts || !alerts.length) {
    el.innerHTML = '<div class="event">No active alerts</div>';
    if (drilldownEl) drilldownEl.setAttribute('hidden', '');
    _selectedAlertId = null;
    return;
  }

  // If selected alert no longer exists, deselect
  if (_selectedAlertId && !alerts.find((a) => a.id === _selectedAlertId)) {
    _selectedAlertId = null;
    if (drilldownEl) drilldownEl.setAttribute('hidden', '');
  }

  el.innerHTML = alerts
    .map((alert) => alertItemHtml(alert, alert.id === _selectedAlertId, resolveAlertSessionId(alert, snapshot)))
    .join('');

  // Update drilldown if open
  if (_selectedAlertId && drilldownEl) {
    const selected = alerts.find((a) => a.id === _selectedAlertId);
    if (selected) {
      const ctx = getAlertContext(selected.agentId, snapshot);
      drilldownEl.innerHTML = drilldownHtml(selected, ctx);
      drilldownEl.removeAttribute('hidden');
    }
  }

  el.onclick = (event) => {
    const item = event.target.closest('[data-alert-id]');
    if (!item) return;

    const alertId = item.dataset.alertId;
    const alert = alerts.find((a) => a.id === alertId);
    if (!alert) return;

    // Toggle selection
    if (_selectedAlertId === alertId) {
      _selectedAlertId = null;
      item.classList.remove('alert-item--selected');
      if (drilldownEl) drilldownEl.setAttribute('hidden', '');
      return;
    }

    // Deselect previous
    el.querySelectorAll('.alert-item--selected').forEach((prev) => prev.classList.remove('alert-item--selected'));
    _selectedAlertId = alertId;
    item.classList.add('alert-item--selected');

    if (drilldownEl) {
      const ctx = getAlertContext(alert.agentId, snapshot);
      drilldownEl.innerHTML = drilldownHtml(alert, ctx);
      drilldownEl.removeAttribute('hidden');
    }

    const linkedSessionId = item.dataset.sessionId || resolveAlertSessionId(alert, snapshot);
    if (linkedSessionId && typeof onOpenSession === 'function') {
      onOpenSession(linkedSessionId);
    }
  };

  if (drilldownEl) {
    drilldownEl.onclick = (event) => {
      const openBtn = event.target.closest('[data-session-open]');
      if (openBtn && typeof onOpenSession === 'function') {
        onOpenSession(openBtn.dataset.sessionOpen);
        return;
      }
      if (event.target.closest('[data-drilldown-close]')) {
        _selectedAlertId = null;
        drilldownEl.setAttribute('hidden', '');
        el.querySelectorAll('.alert-item--selected').forEach((item) => item.classList.remove('alert-item--selected'));
      }
    };
  }
}
