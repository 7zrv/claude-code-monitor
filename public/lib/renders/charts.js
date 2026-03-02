import { colorForIndex } from '../palette.js';
import { displayNameFor } from '../agent-display.js';
import { cssVar, escapeHtml } from '../utils.js';

export function buildMinuteBuckets(events = [], minutes = 30) {
  const now = Date.now();
  const buckets = Array.from({ length: minutes }, (_, idx) => {
    const ts = now - (minutes - idx - 1) * 60_000;
    return { ts, events: 0, tokensByAgent: {} };
  });

  for (const evt of events) {
    const t = new Date(evt.receivedAt || evt.timestamp).getTime();
    if (!Number.isFinite(t)) continue;
    const diffMin = Math.floor((now - t) / 60_000);
    if (diffMin < 0 || diffMin >= minutes) continue;
    const idx = minutes - diffMin - 1;
    const b = buckets[idx];
    b.events += 1;
    const tokenDelta = Number(evt.metadata?.tokenUsage?.totalTokens || 0);
    if (tokenDelta > 0) {
      const agent = evt.agentId || 'unknown';
      b.tokensByAgent[agent] = (b.tokensByAgent[agent] || 0) + tokenDelta;
    }
  }

  return buckets;
}

export function pathForSeries(values, width, height, max) {
  if (!values.length) return '';
  return values
    .map((v, idx) => {
      const x = width.left + (idx / (values.length - 1 || 1)) * (width.right - width.left);
      const y = height.bottom - (v / max) * (height.bottom - height.top);
      return `${idx === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(' ');
}

export function renderThroughputChart(events, el, tooltip) {
  const buckets = buildMinuteBuckets(events, 30);
  const max = Math.max(1, ...buckets.map((b) => b.events));
  const width = 640;
  const top = 20;
  const bottom = 190;
  const left = 36;
  const right = 620;
  const chartHeight = bottom - top;
  const slot = (right - left) / buckets.length;
  const midY = top + chartHeight / 2;

  const barColor = cssVar('--chart-bar');
  const axisColor = cssVar('--chart-axis');
  const axisSecondary = cssVar('--chart-axis-secondary');
  const axisMid = cssVar('--chart-axis-mid');
  const labelColor = cssVar('--chart-label');
  const sublabelColor = cssVar('--chart-sublabel');
  const timescaleColor = cssVar('--chart-timescale');

  const bars = buckets
    .map((b, idx) => {
      const barH = Math.max(1, (b.events / max) * chartHeight);
      const x = left + idx * slot + 1;
      const y = bottom - barH;
      const w = Math.max(1, slot - 2);
      const title = `${new Date(b.ts).toLocaleTimeString()} : ${b.events} events/min`;
      return `<rect class="throughput-bar" data-label="${escapeHtml(title)}" x="${x.toFixed(2)}" y="${y.toFixed(2)}" width="${w.toFixed(2)}" height="${barH.toFixed(2)}" fill="${barColor}"></rect>`;
    })
    .join('');

  el.innerHTML = `
    <title>분당 이벤트 처리량 바 차트</title>
    <line x1="${left}" y1="${bottom}" x2="${right}" y2="${bottom}" stroke="${axisColor}" stroke-width="1" />
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="${axisSecondary}" stroke-width="1" />
    <line x1="${left}" y1="${midY}" x2="${right}" y2="${midY}" stroke="${axisMid}" stroke-width="1" stroke-dasharray="4 4" />
    ${bars}
    <text x="${left}" y="${top - 4}" font-size="10" fill="${labelColor}">max ${max}</text>
    <text x="${left}" y="${midY - 4}" font-size="9" fill="${sublabelColor}">${Math.round(max / 2)}</text>
    ${[25, 20, 15, 10, 5, 0]
      .map((minAgo) => {
        const idx = buckets.length - minAgo - 1;
        if (idx < 0 || idx >= buckets.length) return '';
        const x = left + idx * slot + slot / 2;
        const label = minAgo === 0 ? 'now' : `-${minAgo}m`;
        return `<text x="${x.toFixed(2)}" y="${bottom + 14}" font-size="9" text-anchor="middle" fill="${timescaleColor}">${label}</text>`;
      })
      .join('')}
  `;

  el.querySelectorAll('.throughput-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', () => {
      tooltip.hidden = false;
      tooltip.textContent = bar.dataset.label || '';
    });
    bar.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
    bar.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + 12;
      const y = e.clientY - rect.top - 8;
      tooltip.style.left = `${Math.max(8, x)}px`;
      tooltip.style.top = `${Math.max(8, y)}px`;
    });
  });
}

export function renderTokenTrendChart(events, el, legend, numberFmt) {
  const buckets = buildMinuteBuckets(events, 30);
  const agents = Array.from(
    new Set(
      buckets.flatMap((b) => Object.keys(b.tokensByAgent))
    )
  ).sort();

  const axisColor = cssVar('--chart-axis');

  if (!agents.length) {
    el.innerHTML = `
      <title>모델별 분당 토큰 사용량 추이 차트</title>
      <line x1="36" y1="190" x2="620" y2="190" stroke="${axisColor}" stroke-width="1" />
    `;
    legend.innerHTML = '<span>No token data</span>';
    return;
  }

  const axisSecondary = cssVar('--chart-axis-secondary');
  const axisMid = cssVar('--chart-axis-mid');
  const labelColor = cssVar('--chart-label');
  const sublabelColor = cssVar('--chart-sublabel');
  const timescaleColor = cssVar('--chart-timescale');

  const width = { left: 36, right: 620 };
  const height = { top: 20, bottom: 190 };
  const seriesByAgent = Object.fromEntries(
    agents.map((agent) => [
      agent,
      buckets.map((b) => Number(b.tokensByAgent[agent] || 0))
    ])
  );
  const max = Math.max(1, ...Object.values(seriesByAgent).flat());
  const midY = height.top + (height.bottom - height.top) / 2;
  const slotWidth = (width.right - width.left) / (buckets.length - 1 || 1);
  const lineWidths = [2.6, 2.2, 2, 1.8, 1.6];

  const lineSvg = agents
    .map((agent, idx) => {
      const d = pathForSeries(seriesByAgent[agent], width, height, max);
      const strokeWidth = lineWidths[idx % lineWidths.length];
      return `<path d="${d}" fill="none" stroke="${colorForIndex(idx)}" stroke-width="${strokeWidth}" />`;
    })
    .join('');

  const endLabels = agents
    .map((agent, idx) => {
      const values = seriesByAgent[agent];
      const last = values[values.length - 1] || 0;
      const x = width.right - 2;
      const y = height.bottom - (last / max) * (height.bottom - height.top);
      return `<text x="${x}" y="${Math.max(height.top + 8, y - idx * 2).toFixed(2)}" text-anchor="end" font-size="10" fill="${colorForIndex(idx)}"><title>${escapeHtml(agent)}</title>${escapeHtml(displayNameFor(agent))}</text>`;
    })
    .join('');

  el.innerHTML = `
    <title>모델별 분당 토큰 사용량 추이 차트</title>
    <line x1="${width.left}" y1="${height.bottom}" x2="${width.right}" y2="${height.bottom}" stroke="${axisColor}" stroke-width="1" />
    <line x1="${width.left}" y1="${height.top}" x2="${width.left}" y2="${height.bottom}" stroke="${axisSecondary}" stroke-width="1" />
    <line x1="${width.left}" y1="${midY}" x2="${width.right}" y2="${midY}" stroke="${axisMid}" stroke-width="1" stroke-dasharray="4 4" />
    ${lineSvg}
    ${endLabels}
    <text x="${width.left}" y="${height.top - 4}" font-size="10" fill="${labelColor}">max ${max}</text>
    <text x="${width.left}" y="${midY - 4}" font-size="9" fill="${sublabelColor}">${Math.round(max / 2)}</text>
    ${[25, 20, 15, 10, 5, 0]
      .map((minAgo) => {
        const idx = buckets.length - minAgo - 1;
        if (idx < 0 || idx >= buckets.length) return '';
        const x = width.left + idx * slotWidth;
        const label = minAgo === 0 ? 'now' : `-${minAgo}m`;
        return `<text x="${x.toFixed(2)}" y="${height.bottom + 14}" font-size="9" text-anchor="middle" fill="${timescaleColor}">${label}</text>`;
      })
      .join('')}
  `;

  legend.innerHTML = agents
    .map((agent, idx) => {
      const latest = seriesByAgent[agent][seriesByAgent[agent].length - 1] || 0;
      const strokeWidth = lineWidths[idx % lineWidths.length];
      const color = colorForIndex(idx);
      return `
        <span class="legend-item">
          <svg class="legend-line" viewBox="0 0 22 8" preserveAspectRatio="none">
            <line x1="0" y1="4" x2="22" y2="4" stroke="${color}" stroke-width="${strokeWidth}" />
          </svg>
          <strong title="${escapeHtml(agent)}">${escapeHtml(displayNameFor(agent))}</strong>
          <em>${numberFmt.format(latest)} tok/min</em>
        </span>
      `;
    })
    .join('');
}

export function buildToolCallStats(events = []) {
  const counts = {};
  for (const evt of events) {
    if (evt.event !== 'tool_call') continue;
    const name = evt.message || 'unknown';
    counts[name] = (counts[name] || 0) + 1;
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export function renderToolCallChart(stats, el, tooltip) {
  const top = 10;
  const bottom = 210;
  const left = 100;
  const right = 620;
  const chartWidth = right - left;
  const max = Math.max(1, ...stats.map((s) => s.count));
  const rowH = Math.min(28, (bottom - top) / Math.max(1, stats.length));

  const axisColor = cssVar('--chart-axis');
  const labelColor = cssVar('--chart-label');

  if (!stats.length) {
    el.innerHTML = `
      <title>도구별 호출 빈도 가로 바 차트</title>
      <text x="${left}" y="${(top + bottom) / 2}" font-size="12" fill="${labelColor}">No tool call data</text>
    `;
    return;
  }

  const bars = stats
    .map((s, idx) => {
      const y = top + idx * rowH;
      const barW = Math.max(2, (s.count / max) * chartWidth);
      const title = `${escapeHtml(s.name)}: ${s.count} calls`;
      return `
        <text x="${left - 6}" y="${y + rowH / 2 + 4}" font-size="11" text-anchor="end" fill="${labelColor}">${escapeHtml(s.name)}</text>
        <rect class="tool-bar" data-label="${escapeHtml(title)}" x="${left}" y="${y + 2}" width="${barW.toFixed(2)}" height="${(rowH - 4).toFixed(2)}" rx="3" fill="${colorForIndex(idx)}" opacity="0.85"></rect>
        <text x="${Math.min(left + barW + 4, right - 5)}" y="${y + rowH / 2 + 4}" font-size="10" fill="${labelColor}">${s.count}</text>
      `;
    })
    .join('');

  el.innerHTML = `
    <title>도구별 호출 빈도 가로 바 차트</title>
    <line x1="${left}" y1="${top}" x2="${left}" y2="${bottom}" stroke="${axisColor}" stroke-width="1" />
    ${bars}
  `;

  el.querySelectorAll('.tool-bar').forEach((bar) => {
    bar.addEventListener('mouseenter', () => {
      tooltip.hidden = false;
      tooltip.textContent = bar.dataset.label || '';
    });
    bar.addEventListener('mouseleave', () => {
      tooltip.hidden = true;
    });
    bar.addEventListener('mousemove', (e) => {
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left + 12;
      const y = e.clientY - rect.top - 8;
      tooltip.style.left = `${Math.max(8, x)}px`;
      tooltip.style.top = `${Math.max(8, y)}px`;
    });
  });
}

export function renderGraphs(events, els, numberFmt, toolCallStats) {
  renderThroughputChart(events, els.throughputChart, els.throughputTooltip);
  renderTokenTrendChart(events, els.tokenTrendChart, els.tokenTrendLegend, numberFmt);
  const stats = toolCallStats || buildToolCallStats(events);
  renderToolCallChart(stats, els.toolCallChart, els.toolCallTooltip);
}
