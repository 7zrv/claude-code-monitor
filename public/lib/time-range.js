const RANGE_MS = {
  '1h': 3600000,
  '1d': 86400000,
  '1w': 604800000,
  '1m': 2592000000,
};

const RANGE_LABELS = {
  '1h': '최근 1시간',
  '1d': '최근 1일',
  '1w': '최근 1주',
  '1m': '최근 1달',
};

export function sumByRange(buckets, range, now) {
  if (range === 'all' || !buckets || buckets.length === 0) return null;

  const ms = RANGE_MS[range];
  if (!ms) return null;

  const cutoff = now - ms;
  let tokenTotal = 0;
  let costUsd = 0;
  let matched = false;

  for (const b of buckets) {
    const bucketTime = new Date(b.hourKey + ':00:00Z').getTime();
    if (Number.isNaN(bucketTime)) continue;
    if (bucketTime >= cutoff) {
      tokenTotal += b.tokenTotal;
      costUsd += b.costUsd;
      matched = true;
    }
  }

  return matched ? { tokenTotal, costUsd } : null;
}

export function rangeLabel(range, startedAt) {
  if (range !== 'all') return RANGE_LABELS[range] || range;

  if (!startedAt) return '전체';
  const elapsed = Date.now() - new Date(startedAt).getTime();
  if (Number.isNaN(elapsed) || elapsed < 0) return '전체';
  const hours = Math.floor(elapsed / 3600000);
  const minutes = Math.floor((elapsed % 3600000) / 60000);
  return `전체 (${hours}시간 ${minutes}분)`;
}
