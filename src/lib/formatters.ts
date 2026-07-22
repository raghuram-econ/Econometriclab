export function safeNumber(val: any): number {
  if (val === null || val === undefined || isNaN(Number(val))) return 0;
  return Number(val);
}

export function formatNum(val: any, digits: number = 3): string {
  return safeNumber(val).toFixed(digits);
}

export function formatPValue(val: any): string {
  const p = safeNumber(val);
  if (p < 0.001) return "< 0.001";
  return p.toFixed(3);
}

export function formatPercent(val: any, digits: number = 2): string {
  return (safeNumber(val) * 100).toFixed(digits) + "%";
}
