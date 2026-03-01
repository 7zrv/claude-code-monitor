export function buildCardData(totals, numberFmt) {
  return [
    ['Agents', numberFmt.format(totals.agents || 0)],
    ['Total Events', numberFmt.format(totals.total || 0)],
    ['Total Tokens', numberFmt.format(totals.tokenTotal || 0)],
    ['OK', numberFmt.format(totals.ok || 0)],
    ['Warning', numberFmt.format(totals.warning || 0)],
    ['Error', numberFmt.format(totals.error || 0)],
    ['Cost (USD)', Number(totals.costTotalUsd || 0).toFixed(4)]
  ];
}
