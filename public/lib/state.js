import { recalcWorkflow } from './workflow.js';

export function extractAgentMeta(evt) {
  return {
    model: evt.model || evt.metadata?.model || '',
    isSidechain: evt.isSidechain ?? evt.metadata?.isSidechain ?? false,
    sessionId: evt.sessionId || evt.metadata?.sessionId || ''
  };
}

export function applyIncrementalEvent(state, evt) {
  const totals = state.totals;
  totals.total += 1;
  const evtTokenTotal = evt.metadata?.tokenUsage?.totalTokens || 0;
  totals.tokenTotal = (totals.tokenTotal || 0) + evtTokenTotal;
  if (evt.status === 'error') totals.error += 1;
  else if (evt.status === 'warning') totals.warning += 1;
  else totals.ok += 1;

  const meta = extractAgentMeta(evt);
  const agents = state.agents;
  const agent = agents.find((row) => row.agentId === evt.agentId);
  if (!agent) {
    agents.push({
      agentId: evt.agentId,
      lastSeen: evt.receivedAt,
      total: 1,
      ok: evt.status === 'ok' ? 1 : 0,
      warning: evt.status === 'warning' ? 1 : 0,
      error: evt.status === 'error' ? 1 : 0,
      tokenTotal: evtTokenTotal,
      lastEvent: evt.event,
      latencyMs: evt.latencyMs ?? null,
      model: meta.model,
      isSidechain: meta.isSidechain,
      sessionId: meta.sessionId
    });
    totals.agents = agents.length;
  } else {
    agent.lastSeen = evt.receivedAt;
    agent.total += 1;
    agent.lastEvent = evt.event;
    agent.latencyMs = evt.latencyMs ?? null;
    agent.tokenTotal = (agent.tokenTotal || 0) + evtTokenTotal;
    if (meta.model) agent.model = meta.model;
    if (meta.isSidechain) agent.isSidechain = meta.isSidechain;
    if (meta.sessionId) agent.sessionId = meta.sessionId;
    if (evt.status === 'error') agent.error += 1;
    else if (evt.status === 'warning') agent.warning += 1;
    else agent.ok += 1;
  }

  state.agents.sort((a, b) => a.agentId.localeCompare(b.agentId));

  const sourceName = evt.metadata?.source || 'manual';
  const source = state.sources.find((row) => row.source === sourceName);
  if (!source) {
    state.sources.push({
      source: sourceName,
      total: 1,
      ok: evt.status === 'ok' ? 1 : 0,
      warning: evt.status === 'warning' ? 1 : 0,
      error: evt.status === 'error' ? 1 : 0,
      lastSeen: evt.receivedAt
    });
  } else {
    source.total += 1;
    source.lastSeen = evt.receivedAt;
    if (evt.status === 'error') source.error += 1;
    else if (evt.status === 'warning') source.warning += 1;
    else source.ok += 1;
  }

  state.sources.sort((a, b) => a.source.localeCompare(b.source));

  state.recent.unshift(evt);
  state.recent = state.recent.slice(0, 200);

  if (evt.status === 'warning' || evt.status === 'error') {
    state.alerts.unshift({
      id: `inline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      severity: evt.status,
      agentId: evt.agentId,
      event: evt.event,
      message: evt.message || 'No message',
      createdAt: evt.receivedAt
    });
    state.alerts = state.alerts.slice(0, 20);
  }

  state.workflowProgress = recalcWorkflow(state.agents);
  state.generatedAt = new Date().toISOString();
}
