/**
 * Pure descriptive-statistics calculations.
 *
 * Extracted from src/components/modules/DescriptiveStatsLab.tsx so they can be
 * unit tested in isolation (that component file transitively imports React /
 * chart.js / the app store and cannot easily be exercised under Jest). The
 * math below is byte-for-byte identical to what previously lived inline in
 * that component -- this is a refactor for testability, not a behavior
 * change. See src/lib/econometrics/survival.ts for the precedent this
 * follows (calculateKM extracted from SurvivalAnalysisLab.tsx).
 */
import jStat from 'jstat';

/**
 * Linear-interpolation percentile (R type-7 / Excel PERCENTILE.INC
 * convention). `sorted` must already be sorted ascending.
 */
export function getPercentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0] ?? 0;
  const idx = (sorted.length - 1) * p;
  const low = Math.floor(idx);
  const high = Math.ceil(idx);
  const lowVal = sorted[low] ?? 0;
  if (low === high) return lowVal;
  const highVal = sorted[high] ?? 0;
  return lowVal + (idx - low) * (highVal - lowVal);
}

/** Sample variance: sum((v - mean)^2) / (N - 1) (Bessel's correction). */
export function sampleVariance(vals: number[], mean: number): number {
  const N = vals.length;
  return N > 1 ? vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (N - 1) : 0;
}

/**
 * Adjusted Fisher-Pearson G1 skewness coefficient (SAS/SPSS convention).
 * `sorted` need not actually be sorted for the math to be correct (the
 * component happened to pass the sorted array), but the parameter name is
 * kept to mirror the original inline call site exactly.
 */
export function skewness(sorted: number[], mean: number, stdDev: number): number {
  const N = sorted.length;
  if (N >= 3 && stdDev > 0) {
    const sumCubed = sorted.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 3), 0);
    return (N / ((N - 1) * (N - 2))) * sumCubed;
  }
  return 0;
}

/**
 * Adjusted excess-kurtosis G2 coefficient (SAS/SPSS convention).
 */
export function kurtosis(sorted: number[], mean: number, stdDev: number): number {
  const N = sorted.length;
  if (N >= 4 && stdDev > 0) {
    const sumFourth = sorted.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 4), 0);
    const term1 = (N * (N + 1)) / ((N - 1) * (N - 2) * (N - 3));
    const term2 = (3 * Math.pow(N - 1, 2)) / ((N - 2) * (N - 3));
    return term1 * sumFourth - term2;
  }
  return 0;
}

export interface PearsonResult {
  r: number;
  p: number;
  n: number;
}

/**
 * Pearson product-moment correlation coefficient with a two-tailed t-test
 * (n - 2 degrees of freedom).
 */
export function pearsonCorrelation(xVals: number[], yVals: number[]): PearsonResult {
  const n = xVals.length;
  if (n < 2) return { r: 0, p: 1, n };

  const xMean = xVals.reduce((a, b) => a + b, 0) / n;
  const yMean = yVals.reduce((a, b) => a + b, 0) / n;

  let num = 0;
  let denX = 0;
  let denY = 0;

  for (let idx = 0; idx < n; idx++) {
    const dx = (xVals[idx] ?? 0) - xMean;
    const dy = (yVals[idx] ?? 0) - yMean;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }

  if (denX === 0 || denY === 0) {
    return { r: 0, p: 1, n };
  }

  const r = num / Math.sqrt(denX * denY);
  let p = 1.0;

  if (n > 2 && Math.abs(r) < 1) {
    const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
    p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 2));
  } else if (Math.abs(r) === 1) {
    p = 0.0;
  }

  return { r, p, n };
}

export interface ChiSquareGoodnessOfFitResult {
  chiSquare: number;
  df: number;
  pValue: number;
  k: number;
}

/**
 * Chi-square goodness-of-fit test against a uniform distribution (equal
 * expected frequencies across the k observed categories).
 */
export function chiSquareGoodnessOfFit(counts: number[], n: number): ChiSquareGoodnessOfFitResult {
  const k = counts.length;
  let chiSquare = 0;
  const df = k - 1;
  let pValue = 1;

  if (k > 1) {
    const expected = n / k;
    counts.forEach(count => {
      chiSquare += Math.pow(count - expected, 2) / expected;
    });
    pValue = 1 - jStat.chisquare.cdf(chiSquare, df);
  }

  return { chiSquare, df, pValue, k };
}

export interface TukeyFenceResult {
  q1: number;
  median: number;
  q3: number;
  iqr: number;
  lowerFence: number;
  upperFence: number;
  whiskerMin: number;
  whiskerMax: number;
  outliers: number[];
}

/**
 * Tukey-fence outlier detection: 1.5x IQR fences, with whiskers drawn to the
 * nearest actual observation that still falls within the fences (not the
 * fence value itself).
 */
export function tukeyFenceOutliers(sorted: number[]): TukeyFenceResult {
  const q1 = getPercentile(sorted, 0.25);
  const median = getPercentile(sorted, 0.50);
  const q3 = getPercentile(sorted, 0.75);
  const iqr = q3 - q1;

  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const valuesInFence = sorted.filter(v => v >= lowerFence && v <= upperFence);
  const whiskerMin = (valuesInFence.length > 0 ? valuesInFence[0] : q1) ?? q1;
  const whiskerMax = (valuesInFence.length > 0 ? valuesInFence[valuesInFence.length - 1] : q3) ?? q3;

  const outliers = sorted.filter(v => v < whiskerMin || v > whiskerMax);

  return { q1, median, q3, iqr, lowerFence, upperFence, whiskerMin, whiskerMax, outliers };
}
