import jStat from 'jstat';
import { runOLS } from './ols';
import { solveQR } from './estimators';
import { RegressionResult } from '../../types';

export function runFixedEffects(
  data: any[],
  yVar: string,
  xVars: string[],
  entityId: string,
  timeVar: string
): RegressionResult {
  // 1. Filter missing rows entirely before groups or de-meaning (Stata style listwise deletion)
  const isMissing = (v: any) => v === undefined || v === null || v === "" || v === "N/A" || v === "null" || v === "missing";
  const validData = (data || []).filter(row => {
    if (!row) return false;
    if (isMissing(row[entityId])) return false;
    if (isMissing(row[yVar]) || isNaN(parseFloat(row[yVar]))) return false;
    for (let v of xVars) {
      if (isMissing(row[v]) || isNaN(parseFloat(row[v]))) return false;
    }
    return true;
  });

  // 2. Group by entityId
  const groups: Record<string, any[]> = {};
  validData.forEach(row => {
    const id = row[entityId];
    if (!groups[id]) groups[id] = [];
    groups[id].push(row);
  });
  
  const numEntities = Object.keys(groups).length;

  // 3. De-mean the data
  const transformedData = validData.map(row => {
    const entityRows = groups[row[entityId]] || [];
    const newRow = { ...row };

    [yVar, ...xVars].forEach(v => {
      const denom = entityRows.length || 1;
      const groupMean = entityRows.reduce((sum, r) => sum + parseFloat(r[v] ?? 0), 0) / denom;
      newRow[v] = parseFloat(row[v] ?? 0) - groupMean;
    });

    return newRow;
  });

  // 4. Run OLS on de-meaned data (no intercept in pure de-meaned model)
  const result = runOLS(transformedData, yVar, xVars, false);

  // 5. Adjust degrees of freedom for fixed effects
  // In a within model, we lose (N) degrees of freedom where N is number of entities
  const n = result.n;
  const k = xVars.length;
  let dfAdjusted = n - k - numEntities;
  if (dfAdjusted <= 0) dfAdjusted = 1; // Fallback to avoid NaN/Infinity SEs

  // Correct standard errors: sqrt( (rss / dfAdjusted) * inv(X'X)_ii )
  const scaleFactor = Math.sqrt((n - k) / dfAdjusted);

  const adjustedCoefficients = result.coefficients.map(c => {
    const stdError = isNaN(scaleFactor) ? NaN : c.stdError * scaleFactor;
    const tStat = isNaN(stdError) ? NaN : c.estimate / stdError;
    const pValue = isNaN(tStat) ? NaN : 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), dfAdjusted));

    return {
      ...c,
      stdError,
      tStat,
      pValue,
      confLow: c.estimate - jStat.studentt.inv(0.975, dfAdjusted) * stdError,
      confHigh: c.estimate + jStat.studentt.inv(0.975, dfAdjusted) * stdError
    };
  });

  const rss = result.rss || 0;
  const aic = n * Math.log(rss / n) + 2 * (k + numEntities);
  const bic = n * Math.log(rss / n) + (k + numEntities) * Math.log(n);

  const scaledVarCov = (result.varCov || []).map(row => 
    row.map(val => val * scaleFactor * scaleFactor)
  );

  return {
    ...result,
    coefficients: adjustedCoefficients,
    df: dfAdjusted,
    aic,
    bic,
    varCov: scaledVarCov
  };
}

export function runRandomEffects(
  data: any[],
  yVar: string,
  xVars: string[],
  entityId: string,
  timeVar: string
): RegressionResult {
  // 1. Filter missing rows entirely before groups or de-meaning (Stata style listwise deletion)
  const isMissing = (v: any) => v === undefined || v === null || v === "" || v === "N/A" || v === "null" || v === "missing";
  const validData = (data || []).filter(row => {
    if (!row) return false;
    if (isMissing(row[entityId])) return false;
    if (isMissing(row[yVar]) || isNaN(parseFloat(row[yVar]))) return false;
    for (let v of xVars) {
      if (isMissing(row[v]) || isNaN(parseFloat(row[v]))) return false;
    }
    return true;
  });

  // 2. Group by entityId
  const groups: Record<string, any[]> = {};
  const entities = Array.from(new Set(validData.map(row => row[entityId])));
  validData.forEach(row => {
    const id = row[entityId];
    if (!groups[id]) groups[id] = [];
    groups[id].push(row);
  });

  const n = validData.length;
  const numEntities = entities.length;
  const k = xVars.length;
  const T = n / numEntities; // Average periods per entity

  // Step A: Estimate FE model to get within residual variance (sigma_e_squared)
  const feModel = runFixedEffects(validData, yVar, xVars, entityId, timeVar);
  const rss_fe = feModel.rss || 1e-6;
  const df_fe = n - k - numEntities;
  const sigma_e_2 = rss_fe / (df_fe > 0 ? df_fe : 1);

  // Step B: Estimate Between regression (on group means) to get sigma_between_squared
  const betweenData = entities.map(id => {
    const groupRows = groups[id] ?? [];
    const meanRow: any = { [entityId]: id };
    [yVar, ...xVars].forEach(v => {
      const len = groupRows.length;
      meanRow[v] = len > 0 
        ? groupRows.reduce((sum, r) => sum + parseFloat(r[v]), 0) / len
        : 0;
    });
    return meanRow;
  });

  const betweenModel = runOLS(betweenData, yVar, xVars, true);
  const rss_between = betweenModel.rss || 1e-6;
  const df_between = numEntities - k - 1;
  const sigma_between_2 = rss_between / (df_between > 0 ? df_between : 1);

  // Step C: Compute theta (Swamy-Arora)
  // sigma_u^2 = max(0, sigma_between^2 - sigma_e^2 / T)
  const sigma_u_2 = Math.max(0, sigma_between_2 - sigma_e_2 / T);
  const thetaDenominator = sigma_e_2 + T * sigma_u_2;
  const theta = thetaDenominator > 0 
    ? 1 - Math.sqrt(sigma_e_2 / thetaDenominator)
    : 0;

  // 3. Quasi-demean the data: X* = X - theta * X_mean
  const transformedData = validData.map(row => {
    const entityRows = groups[row[entityId]] || [];
    const newRow = { ...row };

    [yVar, ...xVars].forEach(v => {
      const groupMean = entityRows.length > 0 
        ? entityRows.reduce((sum, r) => sum + parseFloat(r[v]), 0) / entityRows.length
        : 0;
      newRow[v] = parseFloat(row[v]) - theta * groupMean;
    });

    // The intercept is also transformed: (1 - theta)
    return newRow;
  });

  // Run standard OLS with Intercept on the quasi-demeaned data
  // Note: we need to handle the intercept transformation specifically if we want to match exact Stata values
  // But runOLS already includes a constant. Stata's intercept is scaled.
  const result = runOLS(transformedData, yVar, xVars, true);

  // Rescale intercept if needed: Stata reports alpha_hat = beta_0 / (1 - theta)? 
  // No, actually Stata's intercept in RE is just the coefficient on the constant vector (1-theta, 1-theta, ...)
  // But our runOLS uses (1, 1, ...).
  // So we should adjust the intercept result.
  const firstCoeff = result.coefficients[0];
  if (firstCoeff && firstCoeff.variable === 'Intercept' && Math.abs(1 - theta) > 1e-5) {
    firstCoeff.estimate = (firstCoeff.estimate ?? 0) / (1 - theta);
    // Standard error also needs adjustment
    firstCoeff.stdError = (firstCoeff.stdError ?? 0) / (1 - theta);
  }

  return result;
}

export function runHausmanTest(
  fe: RegressionResult,
  re: RegressionResult,
  xVars: string[]
): { hStat: number; df: number; pValue: number; recommendation: string } {
  const k = xVars.length;
  if (k === 0) {
    return { hStat: 0, df: 1, pValue: 1.0, recommendation: "Specify regressors to run Hausman Test" };
  }

  // Extract coefficients (excluding Intercept)
  const b_fe = xVars.map(v => fe.coefficients.find(c => c.variable === v)?.estimate ?? 0);
  const b_re = xVars.map(v => re.coefficients.find(c => c.variable === v)?.estimate ?? 0);

  // Covariance matrices (excluding Intercept)
  const V_fe = fe.varCov || []; // already K x K
  const V_re_full = re.varCov || []; // (K+1) x (K+1) because RE has intercept

  // Extract submatrix for RE (exclude Intercept at index 0)
  const V_re: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    const row = V_re[i];
    if (row) {
      for (let j = 0; j < k; j++) {
        row[j] = V_re_full[i + 1]?.[j + 1] ?? 0;
      }
    }
  }

  const diff_b = b_fe.map((fe_val, idx) => fe_val - (b_re[idx] ?? 0));
  const df = k;

  let hStat = 0;
  let computed = false;

  try {
    // V_diff = V_fe - V_re
    const V_diff = Array.from({ length: k }, () => new Array(k).fill(0));
    for (let i = 0; i < k; i++) {
      const rowDiff = V_diff[i];
      const rowRe = V_re[i];
      if (rowDiff && rowRe) {
        for (let j = 0; j < k; j++) {
          rowDiff[j] = (V_fe[i]?.[j] ?? 0) - (rowRe[j] ?? 0);
        }
      }
    }

    const qrHausman = solveQR(V_diff, diff_b);
    const beta_h = qrHausman.beta;

    // H = diff_b^T * V_diff_inv * diff_b
    // which is diff_b^T * solve(V_diff, diff_b)
    let sum = 0;
    for (let i = 0; i < k; i++) {
      sum += (diff_b[i] ?? 0) * (beta_h[i] ?? 0);
    }

    hStat = sum;
    if (!isNaN(hStat) && isFinite(hStat) && hStat > 0) {
      computed = true;
    }
  } catch (e) {
    // Fallback
  }

  if (!computed) {
    // If we cannot solve the system using QR because V_diff is singular, set hStat to NaN
    hStat = NaN;
  }

  let hStatFinal = hStat;
  let pValue = NaN;
  let recommendation = "";

  if (isNaN(hStatFinal) || !isFinite(hStatFinal)) {
    hStatFinal = NaN;
    recommendation = "Hausman test failed to compute (covariance matrix difference is not positive definite).";
    pValue = NaN;
  } else if (hStatFinal < 0) {
    pValue = 1.0; // Fail to reject the null
    recommendation = "Test statistic is negative (hStat < 0). Model assumptions are violated, but statistically this is treated as failing to reject the null hypothesis (Random Effects is consistent and efficient, though interpret with caution).";
  } else {
    pValue = 1 - jStat.chisquare.cdf(hStatFinal, df);
    if (pValue < 0.05) {
      recommendation = "Reject null hypothesis (individual effects correlate with regressors, p < 0.05). Use Fixed Effects.";
    } else {
      recommendation = "Fail to reject null hypothesis (p >= 0.05). Random Effects is consistent and efficient.";
    }
  }

  return {
    hStat: hStatFinal,
    df,
    pValue,
    recommendation
  };
}
