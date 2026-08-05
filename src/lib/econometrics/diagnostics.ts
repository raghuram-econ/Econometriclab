/**
 * Standalone diagnostic tests used by src/components/modules/StatTestsLab.tsx.
 *
 * Extracted so they can be unit tested in isolation (that component file
 * transitively imports services/apiClient.ts, which uses `import.meta.env`
 * and cannot be loaded under Jest's CommonJS transform) -- same precedent as
 * calculateKM's extraction into survival.ts.
 *
 * These are deliberately separate code paths from the regression-residual
 * diagnostics in ols.ts/estimators.ts:
 *  - standaloneJarqueBera runs directly on a raw variable, not OLS residuals.
 *  - standaloneDurbinWatson runs on a mean-demeaned series, not OLS residuals.
 *  - ramseyReset is the only RESET implementation anywhere in the codebase.
 */
import jStat from 'jstat';
import * as math from 'mathjs';

export function standaloneJarqueBera(values: number[]) {
  const N = values.length;
  const mean = values.reduce((sum, v) => sum + v, 0) / N;
  const m2 = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / N;
  const m3 = values.reduce((sum, v) => sum + (v - mean) ** 3, 0) / N;
  const m4 = values.reduce((sum, v) => sum + (v - mean) ** 4, 0) / N;

  const variance = m2;
  const stdDev = Math.sqrt(variance);

  // Skewness and Kurtosis (unbiased/standard formulas)
  const skewness = m3 / (stdDev ** 3);
  const kurtosis = m4 / (stdDev ** 4);

  // Jarque-Bera statistic
  const jbStat = (N / 6) * (skewness ** 2 + ((kurtosis - 3) ** 2) / 4);

  // Chi-square p-value with 2 d.f.
  const pValue = 1 - jStat.chisquare.cdf(jbStat, 2);

  return { n: N, mean, stdDev, skewness, kurtosis, stat: jbStat, pValue };
}

export function standaloneDurbinWatson(values: number[]) {
  const N = values.length;
  // Durbin-Watson statistic calculation
  // DW = sum_{t=2}^N (e_t - e_{t-1})^2 / sum_{t=1}^N e_t^2
  // Run on the mean-demeaned series directly (not OLS residuals).
  const mean = values.reduce((sum, v) => sum + v, 0) / N;
  const residuals = values.map(v => v - mean);

  let num = 0;
  let den = 0;

  for (let t = 0; t < N; t++) {
    den += (residuals[t] ?? 0) ** 2;
    if (t > 0) {
      num += ((residuals[t] ?? 0) - (residuals[t - 1] ?? 0)) ** 2;
    }
  }

  const dwStat = den > 0 ? num / den : 2.0;

  let diagnosis = "No significant autocorrelation";
  if (dwStat < 1.5) diagnosis = "Positive serial correlation detected (DW < 1.5)";
  else if (dwStat > 2.5) diagnosis = "Negative serial correlation detected (DW > 2.5)";

  return { n: N, stat: dwStat, diagnosis };
}

export function ramseyReset(Y_val: number[], X_val: number[]) {
  // Ramsey RESET Test
  // 1. Fit OLS: Y = b0 + b1 * X
  // 2. Fit auxiliary: Y = b0 + b1 * X + c1 * Y_hat^2 + c2 * Y_hat^3
  // 3. F-test on restriction c1 = c2 = 0
  const N_spec = Y_val.length;
  const X_mat = X_val.map(x => [1, x]);

  // Run OLS 1
  const Xt1 = math.transpose(X_mat);
  const XtX1 = math.multiply(Xt1, X_mat);
  const XtX1_inv = math.inv(XtX1 as any) as any as number[][];
  const beta1 = math.multiply(XtX1_inv, math.multiply(Xt1, Y_val)) as any as number[];

  const Y_hat = math.multiply(X_mat, beta1) as any as number[];
  const res1 = Y_val.map((y, idx) => y - (Y_hat[idx] ?? 0));
  const rss1 = res1.reduce((sum, r) => sum + r * r, 0);

  // Run OLS 2 (Ramsey auxiliary regression with Y_hat^2 and Y_hat^3)
  const X_aux = X_val.map((x, idx) => [1, x, (Y_hat[idx] ?? 0) ** 2, (Y_hat[idx] ?? 0) ** 3]) as any as number[][];
  const k_aux = 4;

  const Xt2 = math.transpose(X_aux);
  const XtX2 = math.multiply(Xt2, X_aux);
  const XtX2_inv = math.inv(XtX2 as any) as any as number[][];
  const beta2 = math.multiply(XtX2_inv, math.multiply(Xt2, Y_val)) as any as number[];

  const Y_hat2 = math.multiply(X_aux, beta2) as any as number[];
  const res2 = Y_val.map((y, idx) => y - (Y_hat2[idx] ?? 0));
  const rss2 = res2.reduce((sum, r) => sum + r * r, 0);

  // F-statistic for the two restricted parameters
  const numDf = 2;
  const denDf = N_spec - k_aux;
  const fStat = ((rss1 - rss2) / numDf) / (rss2 / denDf);
  const pValue = 1 - jStat.centralF.cdf(fStat, numDf, denDf);

  return { n: N_spec, stat: fStat, pValue, rssRestricted: rss1, rssUnrestricted: rss2 };
}
