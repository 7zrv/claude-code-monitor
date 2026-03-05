export function buildCardData(totals, numberFmt, activeAgents = 0) {
  return [
    { label: 'Active', value: numberFmt.format(activeAgents), type: activeAgents > 0 ? 'ok' : 'neutral' },
    { label: 'Error', value: numberFmt.format(totals.error || 0), type: (totals.error || 0) > 0 ? 'error' : 'neutral' },
    { label: 'Sessions', value: numberFmt.format(totals.sessions || 0), type: 'neutral' },
    { label: 'Total Tokens', value: numberFmt.format(totals.tokenTotal || 0), type: 'neutral' },
    { label: 'Cost (USD)', value: Number(totals.costTotalUsd || 0).toFixed(4), type: 'neutral' }
  ];
}
