export function buildCardData(totals, numberFmt) {
  return [
    ['Agents', numberFmt.format(totals.agents || 0), 'neutral'],
    ['Total Events', numberFmt.format(totals.total || 0), 'neutral'],
    ['Total Tokens', numberFmt.format(totals.tokenTotal || 0), 'neutral'],
    ['OK', numberFmt.format(totals.ok || 0), 'ok'],
    ['Warning', numberFmt.format(totals.warning || 0), 'warning'],
    ['Error', numberFmt.format(totals.error || 0), 'error'],
    ['Cost (USD)', Number(totals.costTotalUsd || 0).toFixed(4), 'neutral']
  ];
}
