export function buildCardData(totals, numberFmt, activeAgents = 0) {
  return [
    ['Active', numberFmt.format(activeAgents), activeAgents > 0 ? 'ok' : 'neutral'],
    ['Error', numberFmt.format(totals.error || 0), (totals.error || 0) > 0 ? 'error' : 'neutral'],
    ['Total Tokens', numberFmt.format(totals.tokenTotal || 0), 'neutral'],
    ['Cost (USD)', Number(totals.costTotalUsd || 0).toFixed(4), 'neutral']
  ];
}
