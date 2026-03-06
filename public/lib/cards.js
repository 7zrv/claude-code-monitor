export function buildCardData(totals, numberFmt, activeAgents = 0, rangeInfo = null) {
  const tokenLabel = rangeInfo ? `${rangeInfo.label} Tokens` : 'Total Tokens';
  const tokenValue = rangeInfo ? rangeInfo.tokenTotal : (totals.tokenTotal || 0);
  const costLabel = rangeInfo ? `${rangeInfo.label} Cost` : 'Cost (USD)';
  const costValue = rangeInfo ? rangeInfo.costUsd : (totals.costTotalUsd || 0);

  return [
    { label: 'Active', value: numberFmt.format(activeAgents), type: activeAgents > 0 ? 'ok' : 'neutral' },
    { label: 'Error', value: numberFmt.format(totals.error || 0), type: (totals.error || 0) > 0 ? 'error' : 'neutral' },
    { label: 'Sessions', value: numberFmt.format(totals.sessions || 0), type: 'neutral' },
    { label: tokenLabel, value: numberFmt.format(tokenValue), type: 'neutral' },
    { label: costLabel, value: Number(costValue).toFixed(4), type: 'neutral' }
  ];
}
