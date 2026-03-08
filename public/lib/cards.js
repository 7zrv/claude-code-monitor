export function buildCardData(sessions = [], totals = {}, numberFmt, rangeInfo = null) {
  const activeSessions = sessions.filter((s) => s.sessionState === 'active').length;
  const needsAttention = sessions.filter((s) => Boolean(s.needsAttention)).length;

  const tokenLabel = rangeInfo ? `${rangeInfo.label} 토큰` : '전체 토큰';
  const tokenValue = rangeInfo ? rangeInfo.tokenTotal : (totals.tokenTotal || 0);
  const costLabel = rangeInfo ? `${rangeInfo.label} 비용` : '비용 (USD)';
  const costValue = rangeInfo ? rangeInfo.costUsd : (totals.costTotalUsd || 0);

  return [
    { label: '활성 세션', value: numberFmt.format(activeSessions), type: activeSessions > 0 ? 'ok' : 'neutral' },
    { label: '주의 필요', value: numberFmt.format(needsAttention), type: needsAttention > 0 ? 'warning' : 'neutral' },
    { label: '세션', value: numberFmt.format(sessions.length), type: 'neutral' },
    { label: tokenLabel, value: numberFmt.format(tokenValue), type: 'neutral' },
    { label: costLabel, value: Number(costValue).toFixed(4), type: 'neutral' }
  ];
}
