import { cssVar, escapeHtml } from '../utils.js';
import { displayNameFor } from '../agent-display.js';

const EVENT_COLORS = {
  user_message: '#4E79A7',
  tool_call: '#B07AA1',
  assistant_message: '#59A14F'
};

const STATUS_COLORS = {
  error: '#C93A3A',
  warning: '#D4850A'
};

const FALLBACK_COLOR = '#888888';

export function getEventColor(eventType, status) {
  if (STATUS_COLORS[status]) return STATUS_COLORS[status];
  return EVENT_COLORS[eventType] || FALLBACK_COLOR;
}

export function buildTimelineData(events, maxEvents = 50) {
  const sorted = [...events].sort(
    (a, b) => new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime()
  );
  const recent = sorted.slice(-maxEvents);

  const grouped = new Map();
  for (const evt of recent) {
    const agent = evt.agentId || 'unknown';
    if (!grouped.has(agent)) grouped.set(agent, []);
    grouped.get(agent).push(evt);
  }
  return grouped;
}

export function renderTimeline(events, el, tooltip, agentFilter) {
  const data = buildTimelineData(events);

  const agents = agentFilter && agentFilter !== 'all'
    ? (data.has(agentFilter) ? [[agentFilter, data.get(agentFilter)]] : [])
    : [...data.entries()];

  if (!agents.length) {
    el.innerHTML = '<div class="timeline-empty">No timeline data</div>';
    return;
  }

  const labelWidth = 120;
  const rowHeight = 40;
  const dotRadius = 6;
  const padding = { top: 10, right: 20, bottom: 10, left: 8 };

  const maxEventsInRow = Math.max(...agents.map(([, evts]) => evts.length));
  const svgWidth = Math.max(400, labelWidth + padding.left + maxEventsInRow * 30 + padding.right);
  const svgHeight = agents.length * rowHeight + padding.top + padding.bottom;

  const rows = agents
    .map(([agentId, agentEvents], rowIdx) => {
      const y = padding.top + rowIdx * rowHeight + rowHeight / 2;
      const timelineLeft = labelWidth + padding.left;
      const timelineWidth = svgWidth - timelineLeft - padding.right;
      const step = agentEvents.length > 1
        ? timelineWidth / (agentEvents.length - 1)
        : 0;

      const label = `<text x="${labelWidth - 4}" y="${y + 4}" font-size="11" text-anchor="end" fill="currentColor"><title>${escapeHtml(agentId)}</title>${escapeHtml(displayNameFor(agentId))}</text>`;

      const lineX1 = timelineLeft;
      const lineX2 = agentEvents.length > 1
        ? timelineLeft + (agentEvents.length - 1) * step
        : timelineLeft;
      const lineColor = cssVar('--border') || '#ccc';
      const connLine = agentEvents.length > 1
        ? `<line x1="${lineX1}" y1="${y}" x2="${lineX2}" y2="${y}" stroke="${lineColor}" stroke-width="1.5" />`
        : '';

      const dots = agentEvents
        .map((evt, i) => {
          const cx = timelineLeft + i * step;
          const color = getEventColor(evt.event, evt.status);
          const ts = new Date(evt.receivedAt).toLocaleTimeString();
          const tip = `${escapeHtml(displayNameFor(evt.agentId || 'unknown', evt.model))} | ${escapeHtml(evt.event)} | ${escapeHtml(evt.message || '')} | ${escapeHtml(ts)}`;
          return `<circle class="timeline-dot" cx="${cx.toFixed(1)}" cy="${y}" r="${dotRadius}" fill="${color}" data-tip="${tip}" />`;
        })
        .join('');

      return `${label}${connLine}${dots}`;
    })
    .join('');

  el.innerHTML = `<svg class="timeline-svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" role="img" aria-label="세션 타임라인">${rows}</svg>`;

  el.querySelectorAll('.timeline-dot').forEach((dot) => {
    dot.addEventListener('mouseenter', () => {
      tooltip.hidden = false;
      tooltip.textContent = dot.dataset.tip || '';
    });
    dot.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
    dot.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      tooltip.style.left = `${Math.max(8, e.clientX - rect.left + 12)}px`;
      tooltip.style.top = `${Math.max(8, e.clientY - rect.top - 8)}px`;
    });
  });
}
