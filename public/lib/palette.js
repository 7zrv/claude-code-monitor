export const CHART_PALETTE = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2',
  '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7'
];

export function colorForIndex(idx) {
  return CHART_PALETTE[idx % CHART_PALETTE.length];
}
