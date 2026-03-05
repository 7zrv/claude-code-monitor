export function buildCardData(totals, numberFmt, activeAgents = 0) {
  const cards = [
    { label: 'Active', value: numberFmt.format(activeAgents), type: activeAgents > 0 ? 'ok' : 'neutral' },
    { label: 'Error', value: numberFmt.format(totals.error || 0), type: (totals.error || 0) > 0 ? 'error' : 'neutral' },
    { label: 'Sessions', value: numberFmt.format(totals.sessions || 0), type: 'neutral' },
    { label: 'Burn Rate', value: formatBurnRate(totals.tokenBurnRate), type: 'neutral' },
    { label: 'Cost (USD)', value: Number(totals.costTotalUsd || 0).toFixed(4), type: 'neutral' }
  ];

  const usage = totals.planUsagePercent;
  if (usage != null && totals.planLimit > 0) {
    const type = usage >= 90 ? 'error' : usage >= 80 ? 'warning' : 'ok';
    const minutesToLimit = totals.minutesToLimit;
    const sub = minutesToLimit != null
      ? (minutesToLimit < 0 ? 'Limit exceeded' : `${Math.round(minutesToLimit)}min left`)
      : '';
    cards.push({ label: 'Plan Usage', value: `${usage.toFixed(1)}%`, type, progress: usage, sub });
  }

  return cards;
}

function formatBurnRate(rate) {
  if (!rate || rate <= 0) return '0 tok/min';
  if (rate >= 1000) return `${(rate / 1000).toFixed(1)}k tok/min`;
  return `${rate.toFixed(1)} tok/min`;
}
