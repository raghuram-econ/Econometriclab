import jStat from 'jstat';

export interface OneWayAnovaGroup {
  group: string;
  n: number;
  mean: number;
  standardDeviation: number | null;
}

export interface OneWayAnovaResult {
  outcome: string;
  factor: string;
  n: number;
  excludedRows: number;
  dfBetween: number;
  dfWithin: number;
  dfTotal: number;
  ssBetween: number;
  ssWithin: number;
  ssTotal: number;
  msBetween: number;
  msWithin: number;
  fStatistic: number;
  pValue: number;
  etaSquared: number;
  groups: OneWayAnovaGroup[];
}

/** Classical one-way ANOVA. Missing outcomes/groups are omitted listwise. */
export function calculateOneWayAnova(
  data: unknown[],
  outcomeVar: string,
  factorVar: string
): OneWayAnovaResult {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('The selected dataset has no rows to analyze.');
  }
  if (!outcomeVar || !factorVar) {
    throw new Error('Choose both a numeric outcome and a grouping variable.');
  }
  if (outcomeVar === factorVar) {
    throw new Error('Choose different variables for the outcome and grouping factor.');
  }

  const grouped = new Map<string, { label: string; values: number[] }>();
  let excludedRows = 0;
  for (const row of data) {
    if (!row || typeof row !== 'object') {
      excludedRows++;
      continue;
    }
    const record = row as Record<string, unknown>;
    const rawY = record[outcomeVar];
    const rawGroup = record[factorVar];
    const y = typeof rawY === 'number'
      ? rawY
      : typeof rawY === 'string' && rawY.trim() !== ''
        ? Number(rawY)
        : Number.NaN;
    const groupLabel = rawGroup == null ? '' : String(rawGroup).trim();
    if (!Number.isFinite(y) || groupLabel === '') {
      excludedRows++;
      continue;
    }
    const key = `${typeof rawGroup}:${groupLabel}`;
    const group = grouped.get(key) ?? { label: groupLabel, values: [] };
    group.values.push(y);
    grouped.set(key, group);
  }

  if (grouped.size < 2) {
    throw new Error('One-way ANOVA needs at least two non-empty groups with numeric outcome values.');
  }
  const n = Array.from(grouped.values()).reduce((sum, group) => sum + group.values.length, 0);
  const k = grouped.size;
  const dfBetween = k - 1;
  const dfWithin = n - k;
  if (dfWithin <= 0) {
    throw new Error('There are too few complete observations to estimate within-group variation. Add more observations to the groups.');
  }

  const allValues = Array.from(grouped.values()).flatMap(group => group.values);
  const grandMean = allValues.reduce((sum, value) => sum + value, 0) / n;
  const groupSummaries = Array.from(grouped.values())
    .map(group => {
      const mean = group.values.reduce((sum, value) => sum + value, 0) / group.values.length;
      const withinSumSquares = group.values.reduce((sum, value) => sum + (value - mean) ** 2, 0);
      const standardDeviation = group.values.length > 1
        ? Math.sqrt(withinSumSquares / (group.values.length - 1))
        : null;
      return { ...group, mean, withinSumSquares, standardDeviation };
    })
    .sort((a, b) => a.label.localeCompare(b.label));

  const ssBetween = groupSummaries.reduce(
    (sum, group) => sum + group.values.length * (group.mean - grandMean) ** 2,
    0
  );
  const ssWithin = groupSummaries.reduce((sum, group) => sum + group.withinSumSquares, 0);
  const ssTotal = allValues.reduce((sum, value) => sum + (value - grandMean) ** 2, 0);
  const msBetween = ssBetween / dfBetween;
  const msWithin = ssWithin / dfWithin;

  let fStatistic: number;
  let pValue: number;
  if (msWithin === 0) {
    fStatistic = msBetween === 0 ? 0 : Number.POSITIVE_INFINITY;
    pValue = msBetween === 0 ? 1 : 0;
  } else {
    fStatistic = Math.max(0, msBetween / msWithin);
    const cdf = jStat.centralF.cdf(fStatistic, dfBetween, dfWithin);
    pValue = Number.isFinite(cdf) ? Math.min(1, Math.max(0, 1 - cdf)) : Number.NaN;
    if (!Number.isFinite(pValue)) {
      throw new Error('The F-distribution calculation failed for these group sizes and outcome values.');
    }
  }

  return {
    outcome: outcomeVar,
    factor: factorVar,
    n,
    excludedRows,
    dfBetween,
    dfWithin,
    dfTotal: n - 1,
    ssBetween,
    ssWithin,
    ssTotal,
    msBetween,
    msWithin,
    fStatistic,
    pValue,
    etaSquared: ssTotal > 0 ? Math.min(1, Math.max(0, ssBetween / ssTotal)) : 0,
    groups: groupSummaries.map(group => ({
      group: group.label,
      n: group.values.length,
      mean: group.mean,
      standardDeviation: group.standardDeviation
    }))
  };
}
