import { performance } from 'node:perf_hooks';
import { buildCardData } from '../public/lib/cards.js';
import { annotateSessionsWithState } from '../public/lib/session-status.js';
import { getFilteredEvents, renderEvents } from '../public/lib/renders/events.js';
import { buildToolCallStats, renderGraphs } from '../public/lib/renders/charts.js';
import { renderSessionDetail, renderSessionsList } from '../public/lib/renders/sessions.js';

const numberFmt = new Intl.NumberFormat('ko-KR');
const now = Date.now();

const config = {
  iterations: Number(process.env.PERF_GATE_ITERATIONS || 25),
  sessionCount: Number(process.env.PERF_GATE_SESSIONS || 80),
  agentsPerSession: Number(process.env.PERF_GATE_AGENTS_PER_SESSION || 3),
  eventCount: Number(process.env.PERF_GATE_EVENTS || 2500),
  detailEvents: Number(process.env.PERF_GATE_DETAIL_EVENTS || 160),
  thresholds: {
    dashboardP95: Number(process.env.PERF_GATE_DASHBOARD_P95_MS || 150),
    filterP95: Number(process.env.PERF_GATE_FILTER_P95_MS || 100),
    detailP95: Number(process.env.PERF_GATE_DETAIL_P95_MS || 75)
  }
};

globalThis.document = { documentElement: {} };
globalThis.getComputedStyle = () => ({ getPropertyValue: () => '#999999' });

function makeElement() {
  return {
    innerHTML: '',
    textContent: '',
    hidden: false,
    dataset: {},
    style: {},
    addEventListener() {},
    querySelectorAll() {
      return [];
    },
    getBoundingClientRect() {
      return { left: 0, top: 0 };
    }
  };
}

function iso(ms) {
  return new Date(ms).toISOString();
}

function makeSessions() {
  return Array.from({ length: config.sessionCount }, (_, index) => {
    const sessionNumber = index + 1;
    const lastSeen = now - (index % 12) * 12_000;
    const tokenTotal = 3_500 + index * 220;
    const costUsd = tokenTotal / 45_000;
    return {
      sessionId: `sess-${String(sessionNumber).padStart(3, '0')}`,
      displayName: `session ${sessionNumber}`,
      lastSeen: iso(lastSeen),
      tokenTotal,
      costUsd,
      agentIds: Array.from({ length: config.agentsPerSession }, (_, agentIndex) => `agent-${sessionNumber}-${agentIndex + 1}`)
    };
  });
}

function makeAgents(sessions) {
  const agents = [];

  for (const [sessionIndex, session] of sessions.entries()) {
    for (let agentIndex = 0; agentIndex < config.agentsPerSession; agentIndex += 1) {
      const warning = sessionIndex % 9 === 0 && agentIndex === 0 ? 1 : 0;
      const error = sessionIndex % 23 === 0 && agentIndex === 0 ? 1 : 0;
      agents.push({
        agentId: `${session.sessionId}-agent-${agentIndex + 1}`,
        roleId: `worker-${agentIndex + 1}`,
        sessionId: session.sessionId,
        total: 20 + (sessionIndex % 7) * 5 + agentIndex,
        warning,
        error,
        lastSeen: session.lastSeen,
        lastEvent: warning ? 'warning' : 'message',
        tokenTotal: Math.round(session.tokenTotal / config.agentsPerSession),
        costUsd: session.costUsd / config.agentsPerSession
      });
    }
  }

  return agents;
}

function makeEvent(index, sessions, agents) {
  const session = sessions[index % sessions.length];
  const agent = agents[index % agents.length];
  const ageMs = (index % 30) * 45_000;
  const receivedAt = iso(now - ageMs);
  const status = index % 37 === 0 ? 'error' : index % 11 === 0 ? 'warning' : 'ok';

  if (index % 5 === 0) {
    const totalTokens = 400 + (index % 40) * 15;
    return {
      id: `evt-token-${index}`,
      sessionId: session.sessionId,
      agentId: agent.agentId,
      model: 'claude-sonnet',
      event: 'token_usage',
      status,
      message: 'token usage',
      receivedAt,
      metadata: {
        tokenUsage: {
          inputTokens: Math.round(totalTokens * 0.55),
          outputTokens: Math.round(totalTokens * 0.35),
          cacheReadInputTokens: Math.round(totalTokens * 0.1),
          totalTokens
        }
      }
    };
  }

  if (index % 3 === 0) {
    return {
      id: `evt-tool-${index}`,
      sessionId: session.sessionId,
      agentId: agent.agentId,
      model: 'claude-sonnet',
      event: 'tool_call',
      status,
      message: `tool-${index % 12}`,
      receivedAt,
      metadata: {
        toolInput: { path: `/tmp/file-${index}.txt`, recursive: index % 2 === 0 }
      }
    };
  }

  return {
    id: `evt-msg-${index}`,
    sessionId: session.sessionId,
    agentId: agent.agentId,
    model: 'claude-sonnet',
    event: 'message',
    status,
    message: `event ${index}`,
    receivedAt,
    metadata: {
      payload: `payload-${index}`
    }
  };
}

function makeEvents(sessions, agents) {
  return Array.from({ length: config.eventCount }, (_, index) => makeEvent(index, sessions, agents));
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const avg = values.reduce((sum, value) => sum + value, 0) / values.length;
  const p95Index = Math.max(0, Math.ceil(sorted.length * 0.95) - 1);
  return {
    avg,
    p95: sorted[p95Index],
    max: sorted[sorted.length - 1]
  };
}

function formatMetric(name, stats) {
  return `${name}: avg=${stats.avg.toFixed(2)}ms p95=${stats.p95.toFixed(2)}ms max=${stats.max.toFixed(2)}ms`;
}

function benchmark(iterations, fn) {
  const values = [];
  for (let index = 0; index < iterations; index += 1) {
    const start = performance.now();
    fn();
    values.push(performance.now() - start);
  }
  return summarize(values);
}

function failIfAbove(label, value, threshold) {
  if (value > threshold) {
    throw new Error(`${label} exceeded threshold: ${value.toFixed(2)}ms > ${threshold.toFixed(2)}ms`);
  }
}

const sessions = makeSessions();
const agents = makeAgents(sessions);
const events = makeEvents(sessions, agents);
const annotatedSessions = annotateSessionsWithState(sessions, agents, now);
const totals = {
  tokenTotal: sessions.reduce((sum, session) => sum + session.tokenTotal, 0),
  costTotalUsd: sessions.reduce((sum, session) => sum + session.costUsd, 0)
};
const filteredScenario = {
  status: 'warning',
  limit: 200,
  query: 'tool'
};
const detailEvents = events.slice(0, config.detailEvents);
const chartEls = {
  throughputChart: makeElement(),
  throughputTooltip: makeElement(),
  tokenTrendChart: makeElement(),
  tokenTrendLegend: makeElement(),
  toolCallChart: makeElement(),
  toolCallTooltip: makeElement()
};

const dashboardStats = benchmark(config.iterations, () => {
  const cardsRoot = makeElement();
  const sessionsRoot = makeElement();
  const eventsRoot = makeElement();
  const cards = buildCardData(annotatedSessions, totals, numberFmt);
  cardsRoot.innerHTML = cards.map((card) => card.label).join('|');
  renderSessionsList(annotatedSessions, sessionsRoot, () => {});
  renderEvents(events.slice(0, 250), eventsRoot);
  renderGraphs(events, chartEls, numberFmt, buildToolCallStats(events));
});

const filterStats = benchmark(config.iterations, () => {
  const filtered = getFilteredEvents(events, filteredScenario);
  const eventsRoot = makeElement();
  renderEvents(filtered, eventsRoot);
});

const detailStats = benchmark(config.iterations, () => {
  const detailRoot = makeElement();
  renderSessionDetail(detailEvents, detailRoot);
});

console.log(formatMetric('dashboard-pass', dashboardStats));
console.log(formatMetric('filter-refresh', filterStats));
console.log(formatMetric('session-detail', detailStats));

failIfAbove('dashboard-pass p95', dashboardStats.p95, config.thresholds.dashboardP95);
failIfAbove('filter-refresh p95', filterStats.p95, config.thresholds.filterP95);
failIfAbove('session-detail p95', detailStats.p95, config.thresholds.detailP95);

console.log('perf-gate: pass');
