export const CHART_PALETTE = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2',
  '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7'
];

export function colorForIndex(idx) {
  const fallback = CHART_PALETTE[idx % CHART_PALETTE.length];
  if (typeof document === 'undefined') return fallback;
  const i = (idx % CHART_PALETTE.length) + 1;
  const cssVar = getComputedStyle(document.documentElement)
    .getPropertyValue(`--chart-${i}`)
    .trim();
  return cssVar || fallback;
}
