import { escapeHtml, statusPill } from '../utils.js';
import { displayNameFor } from '../agent-display.js';

export function renderAlerts(alerts, el) {
  if (!alerts || !alerts.length) {
    el.innerHTML = '<div class="event">No active alerts</div>';
    return;
  }

  el.innerHTML = alerts
    .map(
      (alert) => `
      <div class="event">
        <span>${new Date(alert.createdAt).toLocaleTimeString()}</span>
        <span title="${escapeHtml(alert.agentId)}"><strong>${escapeHtml(displayNameFor(alert.agentId))}</strong></span>
        <span>${escapeHtml(alert.event)}</span>
        <span>${escapeHtml(alert.message)}</span>
        ${statusPill(alert.severity)}
      </div>
    `
    )
    .join('');
}
