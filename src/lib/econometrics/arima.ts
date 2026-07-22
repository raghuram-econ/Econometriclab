import jStat from 'jstat';
import { ARIMAResult } from '../../types';
import { runOLS } from './ols';

/**
 * Simplified ARIMA implementation
 * Supports differencing (d) and Auto-regression (p)
 * Moving Average (q) is approximated using residual feedback if needed, 
 * but for this lab version we focus on AR(p) + Differencing.
 */
export function runARIMA(
  series: number[],
  p: number,
  d: number,
  q: number,
  horizon: number
): ARIMAResult {
  if (series.length < p + d + 5) {
    throw new Error('Series too short for selected parameters.');
  }

  // STAGE 1 — Minimum safe fix
  if (q > 2) {
    throw new Error(
      `ARIMA MA(q) terms are not yet supported in the browser engine. ` +
      `Set q=0, or use the Python backend route /api/python/arima-full for full ARIMA(${p},${d},${q}).`
    );
  }

  // 1. Differencing
  let workingSeries = [...series];
  for (let i = 0; i < d; i++) {
    const diffed = [];
    for (let j = 1; j < workingSeries.length; j++) {
      diffed.push((workingSeries[j] ?? 0) - (workingSeries[j - 1] ?? 0));
    }
    workingSeries = diffed;
  }

  // 2. Prepare AR data
  const n = workingSeries.length;
  const arData = [];
  for (let i = p; i < n; i++) {
    const row: any = { y: workingSeries[i] };
    for (let j = 1; j <= p; j++) {
      row[`lag${j}`] = workingSeries[i - j];
    }
    arData.push(row);
  }

  // 3. Estimate using OLS (AR part)
  const lags = Array.from({ length: p }, (_, i) => `lag${i + 1}`);
  const regression = runOLS(arData, 'y', lags, true);

  const coefficients: Record<string, number> = {};
  regression.coefficients.forEach(c => {
    coefficients[c.variable] = c.estimate;
  });

  const startIdx = Math.max(p, q);
  const theta = new Array(q).fill(0);

  // STAGE 2 — Implement MA via Conditional Sum of Squares
  if (q > 0) {
    for (let iter = 0; iter < 50; iter++) {
      // Compute residuals from current AR+MA fit
      const tempResiduals = new Array(n).fill(0);
      for (let t = startIdx; t < n; t++) {
        let arPart = coefficients['Intercept'] || 0;
        for (let i = 1; i <= p; i++) {
          arPart += (coefficients[`lag${i}`] || 0) * (workingSeries[t - i] ?? 0);
        }
        let maPart = 0;
        for (let j = 1; j <= q; j++) {
          maPart += theta[j - 1] * tempResiduals[t - j];
        }
        tempResiduals[t] = (workingSeries[t] ?? 0) - arPart - maPart;
      }

      // Build regressor matrix using lagged residuals
      const maData = [];
      for (let t = startIdx; t < n; t++) {
        let arPart = coefficients['Intercept'] || 0;
        for (let i = 1; i <= p; i++) {
          arPart += (coefficients[`lag${i}`] || 0) * (workingSeries[t - i] ?? 0);
        }
        const target = (workingSeries[t] ?? 0) - arPart;
        
        const row: any = { target };
        for (let j = 1; j <= q; j++) {
          row[`lagResid${j}`] = tempResiduals[t - j];
        }
        maData.push(row);
      }

      // OLS update of MA coefficients
      const maLags = Array.from({ length: q }, (_, i) => `lagResid${i + 1}`);
      let maRegression;
      try {
        maRegression = runOLS(maData, 'target', maLags, false);
      } catch (err) {
        break;
      }

      const newTheta = maLags.map(lag => {
        const coeff = maRegression.coefficients.find(c => c.variable === lag);
        return coeff ? coeff.estimate : 0;
      });

      // Repeat until convergence
      let diff = 0;
      for (let j = 0; j < q; j++) {
        diff = Math.max(diff, Math.abs((newTheta[j] ?? 0) - theta[j]));
      }

      for (let j = 0; j < q; j++) {
        theta[j] = newTheta[j];
      }

      if (diff < 1e-6) {
        break;
      }
    }
  }

  // Save MA coefficients to final coefficients record
  if (q > 0) {
    for (let j = 1; j <= q; j++) {
      coefficients[`ma${j}`] = theta[j - 1];
    }
  }

  // Compute final residuals using final estimated AR and MA coefficients
  const finalResiduals = new Array(n).fill(0);
  for (let t = startIdx; t < n; t++) {
    let arPart = coefficients['Intercept'] || 0;
    for (let i = 1; i <= p; i++) {
      arPart += (coefficients[`lag${i}`] || 0) * (workingSeries[t - i] ?? 0);
    }
    let maPart = 0;
    for (let j = 1; j <= q; j++) {
      maPart += (coefficients[`ma${j}`] || 0) * finalResiduals[t - j];
    }
    finalResiduals[t] = (workingSeries[t] ?? 0) - arPart - maPart;
  }

  // 4. Fitted values
  const fittedDiffed = new Array(startIdx).fill(null);
  for (let i = startIdx; i < n; i++) {
    let val = coefficients['Intercept'] || 0;
    for (let j = 1; j <= p; j++) {
      val += (coefficients[`lag${j}`] || 0) * (workingSeries[i - j] ?? 0);
    }
    for (let j = 1; j <= q; j++) {
      val += (coefficients[`ma${j}`] || 0) * finalResiduals[i - j];
    }
    fittedDiffed.push(val);
  }

  // 5. Forecast
  const forecastDiffed = [];
  const forecastSource = [...workingSeries];
  for (let h = 0; h < horizon; h++) {
    let nextVal = coefficients['Intercept'] || 0;
    for (let j = 1; j <= p; j++) {
      nextVal += (coefficients[`lag${j}`] || 0) * (forecastSource[forecastSource.length - j] ?? 0);
    }
    for (let j = 1; j <= q; j++) {
      const resIdx = finalResiduals.length + h - j;
      const resVal = resIdx < finalResiduals.length ? finalResiduals[resIdx] : 0;
      nextVal += (coefficients[`ma${j}`] || 0) * resVal;
    }
    forecastDiffed.push(nextVal);
    forecastSource.push(nextVal);
  }

  // 6. Undifferencing (Integrate back)
  const forecastFinal = [];
  let lastVal = series[series.length - 1];
  for (const fDiff of forecastDiffed) {
    const nextFinal = (lastVal ?? 0) + fDiff;
    forecastFinal.push(nextFinal);
    lastVal = nextFinal;
  }

  // Compute final RMSE, AIC, and BIC
  let finalRSS = 0;
  for (let t = startIdx; t < n; t++) {
    finalRSS += finalResiduals[t] * finalResiduals[t];
  }
  const df = n - startIdx - (p + q + 1);
  const finalRMSE = df > 0 ? Math.sqrt(finalRSS / df) : Math.sqrt(finalRSS / Math.max(1, n - startIdx));

  // Prediction Intervals (Simplified using finalRMSE)
  const forecastCI: [number, number][] = forecastFinal.map((val, h) => {
    const stepRMSE = finalRMSE * Math.sqrt(h + 1);
    return [val - 1.96 * stepRMSE, val + 1.96 * stepRMSE];
  });

  const effectiveN = n - startIdx;
  const numParams = p + q + 1;
  const aic = 2 * numParams + effectiveN * Math.log(finalRMSE ** 2 || 1e-10);
  const bic = Math.log(effectiveN) * numParams + effectiveN * Math.log(finalRMSE ** 2 || 1e-10);

  return {
    order: [p, d, q],
    coefficients,
    aic,
    bic,
    rmse: finalRMSE,
    fitted: fittedDiffed, 
    forecast: forecastFinal,
    forecastCI,
    residuals: finalResiduals
  };
}

export function autoARIMA(series: number[]): [number, number, number] {
  let bestOrder: [number, number, number] = [1, 1, 0];
  let minAIC = Infinity;

  // Grid search: p in [0, 4], d in [0, 2], q in [0, 2]
  for (let d = 0; d <= 2; d++) {
    for (let p = 0; p <= 4; p++) {
      for (let q = 0; q <= 2; q++) {
        try {
          // Basic check for degrees of freedom: n > p + d + q + 5
          if (series.length < p + d + q + 8) continue;
          
          const res = runARIMA(series, p, d, q, 1);
          if (res.aic < minAIC) {
            minAIC = res.aic;
            bestOrder = [p, d, q];
          }
        } catch (e) {
          // Skip invalid configs
        }
      }
    }
  }

  return bestOrder;
}

export function calculateLjungBox(residuals: number[], lags: number): { qStat: number; pValue: number } {
  const n = residuals.length;
  if (n === 0) return { qStat: 0, pValue: 1 };
  
  let qStat = 0;
  const mean = residuals.reduce((a, b) => a + b, 0) / n;
  const c0 = residuals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;

  for (let k = 1; k <= lags; k++) {
    let ck = 0;
    for (let t = k; t < n; t++) {
      ck += ((residuals[t] ?? 0) - mean) * ((residuals[t - k] ?? 0) - mean);
    }
    ck /= n;
    const rhoK = ck / c0;
    qStat += (rhoK * rhoK) / (n - k);
  }

  qStat *= n * (n + 2);
  
  // Chi-sq p-value using jStat
  const pValue = 1 - jStat.chisquare.cdf(qStat, lags); 
  
  return { qStat, pValue };
}

// Helper to approximate MacKinnon ADF critical and p-values
/**
 * MacKinnon (1994, 2010) response-surface approximation of the ADF p-value.
 *
 * Case: regression with a constant and no trend ("c"), single series (N = 1) —
 * which is what runADFTest estimates. Same approximation used by Stata's
 * `dfuller` and statsmodels' `adfuller`.
 *
 * Validated against the published asymptotic critical values:
 *   tau = -3.43 -> p = 0.00998 (1%)
 *   tau = -2.86 -> p = 0.05020 (5%)
 *   tau = -2.57 -> p = 0.09936 (10%)
 */
const ADF_TAU_STAR = -1.61;
const ADF_TAU_MIN = -18.83;
const ADF_TAU_MAX = 2.74;
const ADF_SMALL_P = [2.1659, 1.4412, 0.038269];
const ADF_LARGE_P = [1.7339, 0.93202, -0.012745, -0.010368];

export function approximateADFPValue(stat: number): number {
  if (!Number.isFinite(stat)) return NaN;
  if (stat > ADF_TAU_MAX) return 1.0;
  if (stat < ADF_TAU_MIN) return 0.0;

  const coefs = stat <= ADF_TAU_STAR ? ADF_SMALL_P : ADF_LARGE_P;
  let arg = 0;
  for (let i = 0; i < coefs.length; i++) {
    arg += (coefs[i] as number) * Math.pow(stat, i);
  }
  return jStat.normal.cdf(arg, 0, 1);
}

/**
 * Run Augmented Dickey-Fuller (ADF) Test
 */
export function runADFTest(series: number[], lags: number): {
  adfStat: number;
  pValue: number;
  criticalValues: { pct1: number; pct5: number; pct10: number };
  isStationary: boolean;
} {
  const n = series.length;
  if (n < lags + 5) {
    return {
      adfStat: 0,
      pValue: 1.0,
      criticalValues: { pct1: -3.43, pct5: -2.86, pct10: -2.57 },
      isStationary: false
    };
  }

  // Delta Y series
  const dy: number[] = [];
  for (let i = 1; i < n; i++) {
    dy.push((series[i] ?? 0) - (series[i - 1] ?? 0));
  }

  // OLS: dy_t = c + beta * y_{t-1} + gamma_1 * dy_{t-1} + ... + gamma_p * dy_{t-p}
  const olsData: any[] = [];
  for (let t = lags + 1; t < n; t++) {
    const row: any = {
      dy_target: (series[t] ?? 0) - (series[t - 1] ?? 0),
      y_lagged: series[t - 1] ?? 0
    };
    for (let j = 1; j <= lags; j++) {
      row[`dy_lag${j}`] = (series[t - j] ?? 0) - (series[t - j - 1] ?? 0);
    }
    olsData.push(row);
  }

  const regressors = ['y_lagged'];
  for (let j = 1; j <= lags; j++) {
    regressors.push(`dy_lag${j}`);
  }

  try {
    const regression = runOLS(olsData, 'dy_target', regressors, true);
    const betaCoeff = regression.coefficients.find(c => c.variable === 'y_lagged');
    const adfStat = betaCoeff ? betaCoeff.tStat : 0;
    const pValue = approximateADFPValue(adfStat);

    return {
      adfStat,
      pValue,
      criticalValues: { pct1: -3.43, pct5: -2.86, pct10: -2.57 },
      isStationary: adfStat < -2.86 // reject null of unit root at 5%
    };
  } catch (err) {
    return {
      adfStat: 0,
      pValue: 1.0,
      criticalValues: { pct1: -3.43, pct5: -2.86, pct10: -2.57 },
      isStationary: false
    };
  }
}

/**
 * Run KPSS Stationarity Test
 */
export function runKPSSTest(series: number[], lags: number, hasTrend: boolean = true): {
  kpssStat: number;
  criticalValues: { pct1: number; pct5: number; pct10: number };
  isStationary: boolean;
} {
  const n = series.length;
  const levelCrit = { pct1: 0.739, pct5: 0.463, pct10: 0.347 };
  const trendCrit = { pct1: 0.216, pct5: 0.146, pct10: 0.119 };
  const crit = hasTrend ? trendCrit : levelCrit;

  if (n < 10) {
    return {
      kpssStat: 0,
      criticalValues: crit,
      isStationary: true
    };
  }

  try {
    let e: number[] = [];

    if (hasTrend) {
      // Regress series on a constant and a time trend: y_t = c + delta * t + e_t
      const data: any[] = [];
      for (let i = 0; i < n; i++) {
        data.push({ y: series[i] ?? 0, trend: i + 1 });
      }
      const regression = runOLS(data, 'y', ['trend'], true);
      const intercept = regression.coefficients.find(c => c.variable === 'Intercept')?.estimate ?? 0;
      const trendCoeff = regression.coefficients.find(c => c.variable === 'trend')?.estimate ?? 0;

      for (let i = 0; i < n; i++) {
        const tVal = i + 1;
        e.push((series[i] ?? 0) - (intercept + trendCoeff * tVal));
      }
    } else {
      // Level stationarity: subtract mean only
      const mean = series.reduce((sum, v) => sum + (v ?? 0), 0) / n;
      for (let i = 0; i < n; i++) {
        e.push((series[i] ?? 0) - mean);
      }
    }

    // Partial sums S_t
    const S: number[] = [];
    let currentSum = 0;
    for (let i = 0; i < n; i++) {
      currentSum += e[i] ?? 0;
      S.push(currentSum);
    }

    // Long-run variance estimation using Bartlett kernel (Newey-West)
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      s2 += (e[i] ?? 0) * (e[i] ?? 0);
    }
    s2 /= n;

    for (let j = 1; j <= lags; j++) {
      let gamma_j = 0;
      for (let t = j; t < n; t++) {
        gamma_j += (e[t] ?? 0) * (e[t - j] ?? 0);
      }
      gamma_j /= n;
      const weight = 1 - j / (lags + 1);
      s2 += 2 * weight * gamma_j;
    }

    if (s2 <= 1e-10) s2 = 1e-10;

    // KPSS statistic
    let sumS2 = 0;
    for (let i = 0; i < n; i++) {
      sumS2 += (S[i] ?? 0) * (S[i] ?? 0);
    }
    const kpssStat = sumS2 / (n * n * s2);

    return {
      kpssStat,
      criticalValues: crit,
      isStationary: kpssStat < crit.pct5 // Null of stationarity is not rejected at 5%
    };
  } catch (err) {
    return {
      kpssStat: 0,
      criticalValues: crit,
      isStationary: false
    };
  }
}

/**
 * Run Phillips-Perron (PP) Test
 */
export function runPhillipsPerronTest(series: number[], lags: number): {
  ppStat: number;
  pValue: number;
  isStationary: boolean;
} {
  const n = series.length;
  if (n < 10) {
    return { ppStat: 0, pValue: 1.0, isStationary: false };
  }

  // Regress y_t = c + rho * y_{t-1} + e_t
  const data: any[] = [];
  for (let i = 1; i < n; i++) {
    data.push({ y: series[i] ?? 0, y_lag: series[i - 1] ?? 0 });
  }

  try {
    const regression = runOLS(data, 'y', ['y_lag'], true);
    const intercept = regression.coefficients.find(c => c.variable === 'Intercept')?.estimate ?? 0;
    const rhoCoeff = regression.coefficients.find(c => c.variable === 'y_lag');
    const rhoHat = rhoCoeff ? rhoCoeff.estimate : 0;
    const seRho = rhoCoeff ? (rhoCoeff.stdError ?? 0.1) : 0.1;

    // Residuals
    const m = n - 1;
    const e: number[] = [];
    for (let i = 1; i < n; i++) {
      e.push((series[i] ?? 0) - (intercept + rhoHat * (series[i - 1] ?? 0)));
    }

    // Standard residual variance s_0^2
    let s0_2 = 0;
    for (let i = 0; i < m; i++) {
      s0_2 += (e[i] ?? 0) * (e[i] ?? 0);
    }
    s0_2 /= m;

    // Long-run variance s^2 using Bartlett kernel
    let s2 = s0_2;
    for (let j = 1; j <= lags; j++) {
      let gamma_j = 0;
      for (let t = j; t < m; t++) {
        gamma_j += (e[t] ?? 0) * (e[t - j] ?? 0);
      }
      gamma_j /= m;
      const weight = 1 - j / (lags + 1);
      s2 += 2 * weight * gamma_j;
    }

    if (s2 <= 1e-10) s2 = 1e-10;
    if (s0_2 <= 1e-10) s0_2 = 1e-10;

    const tRho = (rhoHat - 1) / seRho;
    const s0 = Math.sqrt(s0_2);

    // Phillips-Perron t-stat formula
    const ppStat = Math.sqrt(s0_2 / s2) * tRho - ((s2 - s0_2) * m * seRho) / (2 * Math.sqrt(s2) * s0);
    const pValue = approximateADFPValue(ppStat);

    return {
      ppStat,
      pValue,
      isStationary: ppStat < -2.86
    };
  } catch (err) {
    return { ppStat: 0, pValue: 1.0, isStationary: false };
  }
}

/**
 * Run Vector Autoregression (VAR) Model
 */
export function runVAR(data: any[], vars: string[], lags: number): {
  equations: Record<string, { coefficients: Record<string, number>; rSquared: number }>;
  residualCovariance: number[][];
  aic: number;
  bic: number;
} {
  const nTotal = data.length;
  const k = vars.length;
  const nEffective = nTotal - lags;

  const equations: Record<string, { coefficients: Record<string, number>; rSquared: number }> = {};
  const residuals: Record<string, number[]> = {};

  // Build the OLS dataset
  const olsData: any[] = [];
  for (let t = lags; t < nTotal; t++) {
    const row: any = {};
    vars.forEach(v => {
      row[v] = data[t][v];
    });
    // Lags
    vars.forEach(v => {
      for (let l = 1; l <= lags; l++) {
        row[`${v}_lag${l}`] = data[t - l][v];
      }
    });
    olsData.push(row);
  }

  // Regressors are all lags of all variables
  const regressors: string[] = [];
  vars.forEach(v => {
    for (let l = 1; l <= lags; l++) {
      regressors.push(`${v}_lag${l}`);
    }
  });

  // Run OLS for each equation
  vars.forEach(v => {
    try {
      const reg = runOLS(olsData, v, regressors, true);
      const coeffs: Record<string, number> = {};
      reg.coefficients.forEach(c => {
        coeffs[c.variable] = c.estimate;
      });

      equations[v] = {
        coefficients: coeffs,
        rSquared: reg.rSquared
      };

      // Compute residuals
      const eqResid: number[] = [];
      olsData.forEach(row => {
        let fit = coeffs['Intercept'] ?? 0;
        regressors.forEach(regVar => {
          fit += (coeffs[regVar] ?? 0) * (row[regVar] ?? 0);
        });
        eqResid.push(row[v] - fit);
      });
      residuals[v] = eqResid;
    } catch (err) {
      // Fallback
      equations[v] = { coefficients: {}, rSquared: 0 };
      residuals[v] = new Array(nEffective).fill(0);
    }
  });

  // Compute residual covariance matrix
  const sigma: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      const vI = vars[i];
      const vJ = vars[j];
      let sum = 0;
      if (vI && vJ) {
        for (let t = 0; t < nEffective; t++) {
          sum += (residuals[vI]?.[t] ?? 0) * (residuals[vJ]?.[t] ?? 0);
        }
      }
      const row = sigma[i];
      if (row) {
        row[j] = sum / nEffective;
      }
    }
  }

  // Simple determinant for k=1, 2, or general using mathjs if possible
  let detSigma = 1;
  try {
    const { det } = require('mathjs'); // safe load or custom simple solver
    detSigma = det(sigma);
  } catch (e) {
    if (k === 1) {
      detSigma = sigma[0]?.[0] ?? 1e-10;
    } else if (k === 2) {
      detSigma = (sigma[0]?.[0] ?? 0) * (sigma[1]?.[1] ?? 0) - (sigma[0]?.[1] ?? 0) * (sigma[1]?.[0] ?? 0);
    } else {
      // Product of diagonals as approximation
      detSigma = 1;
      for (let i = 0; i < k; i++) detSigma *= (sigma[i]?.[i] ?? 1e-6) || 1e-6;
    }
  }

  if (detSigma <= 0) detSigma = 1e-10;

  // AIC and BIC
  const numParams = k * (k * lags + 1); // k equations, each has k*lags + 1 parameters
  const aic = Math.log(detSigma) + (2 * numParams) / nEffective;
  const bic = Math.log(detSigma) + (Math.log(nEffective) * numParams) / nEffective;

  return {
    equations,
    residualCovariance: sigma,
    aic,
    bic
  };
}

/**
 * Granger Causality Test
 */
export function runGrangerCausality(
  data: any[],
  y: string,
  x: string,
  maxLags: number
): { fStat: number; pValue: number; isGranger: boolean } {
  const nTotal = data.length;
  if (nTotal < maxLags + 5) {
    return { fStat: 0, pValue: 1.0, isGranger: false };
  }

  const nEffective = nTotal - maxLags;

  // Align OLS datasets
  const olsData: any[] = [];
  for (let t = maxLags; t < nTotal; t++) {
    const row: any = { y_target: data[t][y] };
    for (let l = 1; l <= maxLags; l++) {
      row[`y_lag${l}`] = data[t - l][y];
      row[`x_lag${l}`] = data[t - l][x];
    }
    olsData.push(row);
  }

  const yLags: string[] = [];
  const xLags: string[] = [];
  for (let l = 1; l <= maxLags; l++) {
    yLags.push(`y_lag${l}`);
    xLags.push(`x_lag${l}`);
  }

  try {
    // 1. Restricted Model (y on y lags)
    const restrictedReg = runOLS(olsData, 'y_target', yLags, true);
    
    // 2. Unrestricted Model (y on y lags + x lags)
    const unrestrictedReg = runOLS(olsData, 'y_target', [...yLags, ...xLags], true);

    // Compute residual sum of squares
    const rssRestricted = restrictedReg.coefficients.map(() => 0) // We can compute it from RMSE
    // Note: OLS returns rmse. RSS = rmse^2 * degrees_of_freedom
    // df_r = nEffective - (maxLags + 1)
    // df_u = nEffective - (2 * maxLags + 1)
    const dfR = nEffective - (maxLags + 1);
    const dfU = nEffective - (2 * maxLags + 1);

    const rssR = restrictedReg.rmse * restrictedReg.rmse * dfR;
    const rssU = unrestrictedReg.rmse * unrestrictedReg.rmse * dfU;

    if (rssU <= 0) {
      throw new Error('Granger causality test is undefined: the unrestricted model fits perfectly (zero residual variance). This usually means too few observations relative to the lag count.');
    }

    const fStat = ((rssR - rssU) / maxLags) / (rssU / dfU);
    const pValue = 1 - jStat.centralF.cdf(fStat, maxLags, dfU);

    return {
      fStat,
      pValue,
      isGranger: pValue < 0.05
    };
  } catch (err) {
    throw err;
  }
}

/**
 * Run GARCH(1,1) Volatility Model
 */
export function runGARCH(
  series: number[],
  p = 1,
  q = 1
): {
  omega: number;
  alpha: number;
  beta: number;
  persistence: number;
  conditionalVariance: number[];
  logLik: number;
  aic: number;
  bic: number;
} {
  const n = series.length;
  const mean = series.reduce((a, b) => a + (b ?? 0), 0) / n;
  const e = series.map(x => (x ?? 0) - mean);
  const variance = e.reduce((sum, x) => sum + (x ?? 0) * (x ?? 0), 0) / n;

  // Initial guesses
  let omega = 0.1 * variance;
  let alpha = 0.1;
  let beta = 0.8;

  const computeLogLik = (om: number, al: number, be: number) => {
    const h = new Array(n).fill(0);
    h[0] = variance;
    let loglik = 0;
    for (let t = 1; t < n; t++) {
      h[t] = om + al * (e[t - 1] ?? 0) * (e[t - 1] ?? 0) + be * (h[t - 1] ?? 0);
      if ((h[t] ?? 0) <= 1e-6) h[t] = 1e-6;
      loglik += -0.5 * (Math.log(2 * Math.PI) + Math.log(h[t] ?? 1e-6) + ((e[t] ?? 0) * (e[t] ?? 0)) / (h[t] ?? 1e-6));
    }
    return { loglik, h };
  };

  // Unconstrained reparameterisation. The constraints omega > 0, alpha,beta > 0
  // and alpha + beta < 1 are enforced by construction rather than by clamping, so
  // no parameter can be pinned against a boundary by the optimiser.
  //   omega       = exp(t0)
  //   persistence = sigmoid(t1)          in (0, 1)  -> stationarity guaranteed
  //   share       = sigmoid(t2)          in (0, 1)
  //   alpha = persistence * share,  beta = persistence * (1 - share)
  const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));
  const logit = (x: number) => Math.log(x / (1 - x));

  const unpack = (t: number[]): [number, number, number] => {
    const om = Math.exp(Math.max(-40, Math.min(40, t[0] as number)));
    const per = sigmoid(t[1] as number);
    const sh = sigmoid(t[2] as number);
    return [om, per * sh, per * (1 - sh)];
  };

  const negLL = (t: number[]): number => {
    const [om, al, be] = unpack(t);
    const r = computeLogLik(om, al, be);
    return Number.isFinite(r.loglik) ? -r.loglik : Infinity;
  };

  // Nelder-Mead simplex
  const t0Init = [
    Math.log(Math.max(1e-8, 0.1 * variance)),
    logit(0.9),
    logit(0.1 / 0.9),
  ];
  let simplex: number[][] = [t0Init];
  for (let i = 0; i < 3; i++) {
    const pt = [...t0Init];
    pt[i] = (pt[i] as number) + 0.6;
    simplex.push(pt);
  }
  let fvals = simplex.map(negLL);

  const ALPHA_R = 1, GAMMA = 2, RHO = 0.5, SIGMA = 0.5;
  for (let iter = 0; iter < 800; iter++) {
    const order = fvals.map((f, i) => i).sort((a, b) => (fvals[a] as number) - (fvals[b] as number));
    simplex = order.map(i => simplex[i] as number[]);
    fvals = order.map(i => fvals[i] as number);

    const fBest = fvals[0] as number;
    const fWorst = fvals[3] as number;
    if (Math.abs(fWorst - fBest) < 1e-10 * (Math.abs(fBest) + 1)) break;

    const centroid = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) centroid[j] = (centroid[j] as number) + ((simplex[i] as number[])[j] as number) / 3;
    }

    const worst = simplex[3] as number[];
    const refl = centroid.map((c, j) => c + ALPHA_R * (c - (worst[j] as number)));
    const fRefl = negLL(refl);

    if (fRefl < (fvals[0] as number)) {
      const exp2 = centroid.map((c, j) => c + GAMMA * ((refl[j] as number) - c));
      const fExp = negLL(exp2);
      if (fExp < fRefl) { simplex[3] = exp2; fvals[3] = fExp; }
      else { simplex[3] = refl; fvals[3] = fRefl; }
    } else if (fRefl < (fvals[2] as number)) {
      simplex[3] = refl; fvals[3] = fRefl;
    } else {
      const contr = centroid.map((c, j) => c + RHO * ((worst[j] as number) - c));
      const fContr = negLL(contr);
      if (fContr < fWorst) { simplex[3] = contr; fvals[3] = fContr; }
      else {
        const best = simplex[0] as number[];
        for (let i = 1; i < 4; i++) {
          simplex[i] = (simplex[i] as number[]).map((v, j) => (best[j] as number) + SIGMA * (v - (best[j] as number)));
          fvals[i] = negLL(simplex[i] as number[]);
        }
      }
    }
  }

  const bestIdx = fvals.indexOf(Math.min(...fvals));
  [omega, alpha, beta] = unpack(simplex[bestIdx] as number[]);

  const finalLL = computeLogLik(omega, alpha, beta);
  const numParams = 3;
  const aic = -2 * finalLL.loglik + 2 * numParams;
  const bic = -2 * finalLL.loglik + Math.log(n) * numParams;

  return {
    omega,
    alpha,
    beta,
    persistence: alpha + beta,
    conditionalVariance: finalLL.h,
    logLik: finalLL.loglik,
    aic,
    bic
  };
}

