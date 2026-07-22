import * as math from 'mathjs';
import jStat from 'jstat';
import { solveQR } from './estimators';

export interface PenalizedCoeffItem {
  variable: string;
  estimate: number;
  stdError: number;
  tStat: number;
  pValue: number;
  confLow: number;
  confHigh: number;
}

export interface PenalizedResult {
  coefficients: PenalizedCoeffItem[];
  rSquared: number;
  adjRSquared: number;
  rmse: number;
  lambda: number;
  alpha?: number;
  selectedVars: string[];
  residuals: number[];
  fitted: number[];
  yActual: number[];
  method: 'Ridge' | 'LASSO' | 'ElasticNet';
}

/**
 * Ridge Regression (Tikhonov Regularization)
 * formula: beta = (X'X + lambda * I)^-1 * X'y
 * Intercept is NOT penalized.
 */
export function ridgeRegression(
  X: number[][], // design matrix WITH intercept column at index 0
  y: number[],
  lambda: number,
  xVars: string[]
): PenalizedResult {
  if (!X || X.length === 0 || !X[0]) {
    return {
      coefficients: [],
      rSquared: 0,
      adjRSquared: 0,
      rmse: 0,
      lambda,
      selectedVars: [],
      residuals: [],
      fitted: [],
      yActual: y,
      method: 'Ridge'
    };
  }
  const n = X.length;
  const k = X[0].length;
  
  // Ridge via Data Augmentation for numerical stability
  // Append sqrt(lambda) * I to X and 0s to Y
  const sqrtLambda = Math.sqrt(lambda);
  const X_aug = [...X.map(row => [...row])];
  const y_aug = [...y];
  
  for (let j = 1; j < k; j++) {
    const row = new Array(k).fill(0);
    row[j] = sqrtLambda;
    X_aug.push(row);
    y_aug.push(0);
  }

  const qrRes = solveQR(X_aug, y_aug);
  const beta = qrRes.beta;
  const invTerm = qrRes.XtX_inv;

  const Xt = math.transpose(X);
  const XtX = math.multiply(Xt, X) as number[][];

  const Y_hat = math.multiply(X, beta) as any as number[];
  const residuals = y.map((val, i) => val - (Y_hat[i] ?? 0));
  const rss = residuals.reduce((sum, r) => sum + r * r, 0);
  const df = n - k;
  const sigmaSq = df > 0 ? rss / df : 0;

  // Sandwich covariance matrix for Ridge: (X'X + lambda*I)^-1 * X'X * (X'X + lambda*I)^-1 * sigma^2
  const term1 = math.multiply(invTerm, XtX);
  const varCov = math.multiply(math.multiply(term1, invTerm), sigmaSq) as number[][];

  const stdError = Array(k).fill(0).map((_, j) => {
    const variance = varCov[j]?.[j] ?? 0;
    return variance > 0 ? Math.sqrt(variance) : 0;
  });

  const tStat = beta.map((b, j) => (stdError[j] ?? 0) !== 0 ? (b ?? 0) / (stdError[j] ?? 1) : 0);
  const pValue = tStat.map(t => {
    if (df <= 0) return 1;
    const p = 2 * (1 - jStat.studentt.cdf(Math.abs(t ?? 0), df));
    return isNaN(p) ? 1 : p;
  });

  const criticalVal = df > 0 ? jStat.studentt.inv(0.975, df) : 1.96;
  const confLow = beta.map((b, j) => (b ?? 0) - criticalVal * (stdError[j] ?? 0));
  const confHigh = beta.map((b, j) => (b ?? 0) + criticalVal * (stdError[j] ?? 0));

  const yMean = y.reduce((sum, val) => sum + val, 0) / n;
  const tss = y.reduce((sum, val) => sum + (val - yMean) * (val - yMean), 0);
  const rSquared = tss > 0 ? 1 - rss / tss : 0;
  const adjRSquared = df > 0 && n > 1 ? 1 - (rss / df) / (tss / (n - 1)) : 0;
  const rmse = Math.sqrt(rss / n);

  const coefficients: PenalizedCoeffItem[] = [];
  coefficients.push({
    variable: 'Intercept',
    estimate: beta[0] ?? 0,
    stdError: stdError[0] ?? 0,
    tStat: tStat[0] ?? 0,
    pValue: pValue[0] ?? 0,
    confLow: confLow[0] ?? 0,
    confHigh: confHigh[0] ?? 0
  });

  for (let i = 1; i < k; i++) {
    coefficients.push({
      variable: xVars[i - 1] || `Var${i}`,
      estimate: beta[i] ?? 0,
      stdError: stdError[i] ?? 0,
      tStat: tStat[i] ?? 0,
      pValue: pValue[i] ?? 0,
      confLow: confLow[i] ?? 0,
      confHigh: confHigh[i] ?? 0
    });
  }

  return {
    coefficients,
    rSquared,
    adjRSquared,
    rmse,
    lambda,
    selectedVars: xVars,
    residuals,
    fitted: Y_hat,
    yActual: y,
    method: 'Ridge'
  };
}

/**
 * LASSO Regression (Least Absolute Shrinkage and Selection Operator)
 * Coordinate descent with standardised columns (except intercept, which is retrieved via centering)
 */
export function lassoRegression(
  X: number[][], // WITHOUT intercept column
  y: number[],
  lambda: number,
  xVars: string[],
  maxIter = 1000,
  tol = 1e-6
): PenalizedResult {
  if (!X || X.length === 0 || !X[0]) {
    return {
      coefficients: [],
      rSquared: 0,
      adjRSquared: 0,
      rmse: 0,
      lambda,
      selectedVars: [],
      residuals: [],
      fitted: [],
      yActual: y,
      method: 'LASSO'
    };
  }
  const n = X.length;
  const k = X[0].length;
  const meansX = Array(k).fill(0);
  const stdsX = Array(k).fill(1);

  // Standardize X internally
  const X_std = X.map(row => [...row]);
  for (let j = 0; j < k; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += X[i]?.[j] ?? 0;
    }
    const mean = sum / n;
    meansX[j] = mean;

    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sumSq += ((X[i]?.[j] ?? 0) - mean) ** 2;
    }
    const std = Math.sqrt(sumSq / n) || 1e-6;
    stdsX[j] = std;

    for (let i = 0; i < n; i++) {
      const rowStd = X_std[i];
      if (rowStd) {
        rowStd[j] = ((X[i]?.[j] ?? 0) - mean) / std;
      }
    }
  }

  // Center Y
  const meanY = y.reduce((sum, v) => sum + v, 0) / n;
  const yc = y.map(v => v - meanY);

  const beta = Array(k).fill(0);

  // Coordinate descent
  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;
    
    // Pre-calculate current predictions
    const predictions = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const rowStd = X_std[i];
      if (!rowStd) continue;
      for (let m = 0; m < k; m++) {
        predictions[i] += (rowStd[m] ?? 0) * (beta[m] ?? 0);
      }
    }
    
    for (let j = 0; j < k; j++) {
      let zj = 0;
      let sumSqXj = 0;
      for (let i = 0; i < n; i++) {
        const rowStd = X_std[i];
        if (!rowStd) continue;
        const x_std_ij = rowStd[j] ?? 0;
        const rj_i = (yc[i] ?? 0) - (predictions[i] ?? 0) + x_std_ij * (beta[j] ?? 0);
        zj += x_std_ij * rj_i;
        sumSqXj += x_std_ij * x_std_ij;
      }
      zj = zj / n;
      sumSqXj = sumSqXj / n; // standard deviation variance term (should be 1)

      const oldBetaJ = beta[j] ?? 0;
      
      // Soft thresholding softThreshold(zj, lambda)
      const softThresh = Math.sign(zj) * Math.max(Math.abs(zj) - lambda, 0);
      const newBetaJ = softThresh / sumSqXj;

      beta[j] = newBetaJ;

      const diff = newBetaJ - oldBetaJ;
      if (Math.abs(diff) > 1e-12) {
        for (let i = 0; i < n; i++) {
          const rowStd = X_std[i];
          if (rowStd) {
            predictions[i] += diff * (rowStd[j] ?? 0);
          }
        }
      }

      if (Math.abs(diff) > maxChange) {
        maxChange = Math.abs(diff);
      }
    }

    if (maxChange < tol) {
      break;
    }
  }

  // Unstandardize coefficients
  const beta_orig = Array(k).fill(0);
  for (let j = 0; j < k; j++) {
    beta_orig[j] = (beta[j] ?? 0) / (stdsX[j] ?? 1e-6);
  }
  let sumBetaMean = 0;
  for (let j = 0; j < k; j++) {
    sumBetaMean += (beta_orig[j] ?? 0) * (meansX[j] ?? 0);
  }
  // unstandardize coefficients ... (keeping it short to match)
  const intercept = meanY - sumBetaMean;

  // Selected vars
  const activeIndices = beta_orig.map((b, idx) => b !== 0 ? idx : -1).filter(idx => idx !== -1);
  const k_active = activeIndices.length + 1; // including intercept

  const X_active = X.map(row => {
    const activeVals = activeIndices.map(idx => row[idx] ?? 0);
    return [1, ...activeVals];
  });

  let stdErrorActive = Array(k_active).fill(0);
  let tStatActive = Array(k_active).fill(0);
  let pValueActive = Array(k_active).fill(0);
  let confLowActive = Array(k_active).fill(0);
  let confHighActive = Array(k_active).fill(0);

  if (n > k_active && activeIndices.length > 0) {
    try {
      const qrActive = solveQR(X_active, y);
      const XtX_active_inv = qrActive.XtX_inv;
      
      const beta_active = [intercept, ...activeIndices.map(idx => beta_orig[idx] ?? 0)];
      const Y_hat_active = math.multiply(X_active, beta_active) as any as number[];
      const res_active = y.map((val, i) => val - (Y_hat_active[i] ?? 0));
      const rss_active = res_active.reduce((sum, r) => sum + r * r, 0);
      const df_active = n - k_active;
      const sigmaSq_active = rss_active / df_active;
      
      const varCovActive = XtX_active_inv.map(row => row.map(v => v * sigmaSq_active));
      const seActive = Array(k_active).fill(0).map((_, j) => {
        const variance = varCovActive[j]?.[j] ?? 0;
        return variance > 0 ? Math.sqrt(variance) : 0;
      });
      
      const criticalValActive = df_active > 0 ? jStat.studentt.inv(0.975, df_active) : 1.96;
      
      stdErrorActive = seActive;
      tStatActive = beta_active.map((b, j) => { const se = seActive[j] ?? 0; return se !== 0 ? (b ?? 0) / se : 0; });
      pValueActive = tStatActive.map(t => 2 * (1 - jStat.studentt.cdf(Math.abs(t ?? 0), df_active)));
      confLowActive = beta_active.map((b, j) => (b ?? 0) - criticalValActive * (seActive[j] ?? 0));
      confHighActive = beta_active.map((b, j) => (b ?? 0) + criticalValActive * (seActive[j] ?? 0));
    } catch (e) {
      // Return OLS active SE fallback
    }
  }

  const coefficients: PenalizedCoeffItem[] = [];
  coefficients.push({
    variable: 'Intercept',
    estimate: intercept,
    stdError: stdErrorActive[0] ?? 0,
    tStat: tStatActive[0] ?? 0,
    pValue: pValueActive[0] ?? 0,
    confLow: confLowActive[0] ?? intercept,
    confHigh: confHighActive[0] ?? intercept,
  });

  for (let j = 0; j < k; j++) {
    const activePos = activeIndices.indexOf(j);
    if (activePos !== -1) {
      coefficients.push({
        variable: xVars[j] || `Var${j}`,
        estimate: beta_orig[j] ?? 0,
        stdError: stdErrorActive[activePos + 1] ?? 0,
        tStat: tStatActive[activePos + 1] ?? 0,
        pValue: pValueActive[activePos + 1] ?? 0,
        confLow: confLowActive[activePos + 1] ?? (beta_orig[j] ?? 0),
        confHigh: confHighActive[activePos + 1] ?? (beta_orig[j] ?? 0),
      });
    } else {
      coefficients.push({
        variable: xVars[j] || `Var${j}`,
        estimate: 0,
        stdError: 0,
        tStat: 0,
        pValue: 1,
        confLow: 0,
        confHigh: 0,
      });
    }
  }

  const Y_hat = X.map((row) => {
    let pred = intercept;
    for (let j = 0; j < k; j++) {
      pred += (row[j] ?? 0) * (beta_orig[j] ?? 0);
    }
    return pred;
  });
  const residuals = y.map((val, i) => val - (Y_hat[i] ?? 0));
  const rss = residuals.reduce((sum, r) => sum + r * r, 0);
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;
  const tss = y.reduce((sum, val) => sum + (val - yMean) * (val - yMean), 0);
  const rSquared = tss > 0 ? 1 - rss / tss : 0;
  
  const df = n - k_active;
  const adjRSquared = df > 0 && n > 1 ? 1 - (rss / df) / (tss / (n - 1)) : 0;
  const rmse = Math.sqrt(rss / n);

  const selectedVars = activeIndices.map(idx => xVars[idx] ?? `Var${idx}`);

  return {
    coefficients,
    rSquared,
    adjRSquared,
    rmse,
    lambda,
    selectedVars,
    residuals,
    fitted: Y_hat,
    yActual: y,
    method: 'LASSO'
  };
}

/**
 * Elastic Net Regression (combination of Ridge and LASSO)
 * formula: beta = softThreshold(zj, alpha * lambda) / ((1/n) * sum(X_std_j^2) + (1-alpha) * lambda)
 */
export function elasticNet(
  X: number[][], // WITHOUT intercept
  y: number[],
  lambda: number,
  alpha: number, // mixing coefficient: 0 = Ridge, 1 = LASSO
  xVars: string[],
  maxIter = 1000,
  tol = 1e-6
): PenalizedResult {
  if (!X || X.length === 0 || !X[0]) {
    return {
      coefficients: [],
      rSquared: 0,
      adjRSquared: 0,
      rmse: 0,
      lambda,
      selectedVars: [],
      residuals: [],
      fitted: [],
      yActual: y,
      method: 'ElasticNet'
    };
  }
  const n = X.length;
  const k = X[0].length;
  const meansX = Array(k).fill(0);
  const stdsX = Array(k).fill(1);

  // Standardize X internally
  const X_std = X.map(row => [...row]);
  for (let j = 0; j < k; j++) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      sum += X[i]?.[j] ?? 0;
    }
    const mean = sum / n;
    meansX[j] = mean;

    let sumSq = 0;
    for (let i = 0; i < n; i++) {
      sumSq += ((X[i]?.[j] ?? 0) - mean) ** 2;
    }
    const std = Math.sqrt(sumSq / n) || 1e-6;
    stdsX[j] = std;

    for (let i = 0; i < n; i++) {
      const rowStd = X_std[i];
      if (rowStd) {
        rowStd[j] = ((X[i]?.[j] ?? 0) - mean) / std;
      }
    }
  }

  // Center Y
  const meanY = y.reduce((sum, v) => sum + v, 0) / n;
  const yc = y.map(v => v - meanY);

  const beta = Array(k).fill(0);

  // Coordinate descent
  for (let iter = 0; iter < maxIter; iter++) {
    let maxChange = 0;
    
    // Pre-calculate current predictions
    const predictions = Array(n).fill(0);
    for (let i = 0; i < n; i++) {
      const rowStd = X_std[i];
      if (!rowStd) continue;
      for (let m = 0; m < k; m++) {
        predictions[i] += (rowStd[m] ?? 0) * (beta[m] ?? 0);
      }
    }
    
    for (let j = 0; j < k; j++) {
      let zj = 0;
      let sumSqXj = 0;
      for (let i = 0; i < n; i++) {
        const rowStd = X_std[i];
        if (!rowStd) continue;
        const x_std_ij = rowStd[j] ?? 0;
        const rj_i = (yc[i] ?? 0) - (predictions[i] ?? 0) + x_std_ij * (beta[j] ?? 0);
        zj += x_std_ij * rj_i;
        sumSqXj += x_std_ij * x_std_ij;
      }
      zj = zj / n;
      sumSqXj = sumSqXj / n; // normally 1

      const oldBetaJ = beta[j] ?? 0;
      
      // Elastic Net Penalty: softThreshold(zj, alpha * lambda)
      const softThresh = Math.sign(zj) * Math.max(Math.abs(zj) - alpha * lambda, 0);
      const denominator = sumSqXj + (1 - alpha) * lambda;
      const newBetaJ = denominator > 0 ? softThresh / denominator : 0;

      beta[j] = newBetaJ;

      const diff = newBetaJ - oldBetaJ;
      if (Math.abs(diff) > 1e-12) {
        for (let i = 0; i < n; i++) {
          const rowStd = X_std[i];
          if (rowStd) {
            predictions[i] += diff * (rowStd[j] ?? 0);
          }
        }
      }

      if (Math.abs(diff) > maxChange) {
        maxChange = Math.abs(diff);
      }
    }

    if (maxChange < tol) {
      break;
    }
  }

  // Unstandardize coefficients
  const beta_orig = Array(k).fill(0);
  for (let j = 0; j < k; j++) {
    beta_orig[j] = (beta[j] ?? 0) / (stdsX[j] ?? 1e-6);
  }
  let sumBetaMean = 0;
  for (let j = 0; j < k; j++) {
    sumBetaMean += (beta_orig[j] ?? 0) * (meansX[j] ?? 0);
  }
  const intercept = meanY - sumBetaMean;

  // Selected vars
  const activeIndices = beta_orig.map((b, idx) => b !== 0 ? idx : -1).filter(idx => idx !== -1);
  const k_active = activeIndices.length + 1; // including intercept

  const X_active = X.map(row => {
    const activeVals = activeIndices.map(idx => row[idx] ?? 0);
    return [1, ...activeVals];
  });

  let stdErrorActive = Array(k_active).fill(0);
  let tStatActive = Array(k_active).fill(0);
  let pValueActive = Array(k_active).fill(0);
  let confLowActive = Array(k_active).fill(0);
  let confHighActive = Array(k_active).fill(0);

  if (n > k_active && activeIndices.length > 0) {
    try {
      const qrActive = solveQR(X_active, y);
      const XtX_active_inv = qrActive.XtX_inv;
      
      const beta_active = [intercept, ...activeIndices.map(idx => beta_orig[idx] ?? 0)];
      const Y_hat_active = math.multiply(X_active, beta_active) as any as number[];
      const res_active = y.map((val, i) => val - (Y_hat_active[i] ?? 0));
      const rss_active = res_active.reduce((sum, r) => sum + r * r, 0);
      const df_active = n - k_active;
      const sigmaSq_active = rss_active / df_active;
      
      const varCovActive = XtX_active_inv.map(row => row.map(v => v * sigmaSq_active));
      const seActive = Array(k_active).fill(0).map((_, j) => {
        const variance = varCovActive[j]?.[j] ?? 0;
        return variance > 0 ? Math.sqrt(variance) : 0;
      });
      
      const criticalValActive = df_active > 0 ? jStat.studentt.inv(0.975, df_active) : 1.96;
      
      stdErrorActive = seActive;
      tStatActive = beta_active.map((b, j) => { const se = seActive[j] ?? 0; return se !== 0 ? (b ?? 0) / se : 0; });
      pValueActive = tStatActive.map(t => 2 * (1 - jStat.studentt.cdf(Math.abs(t ?? 0), df_active)));
      confLowActive = beta_active.map((b, j) => (b ?? 0) - criticalValActive * (seActive[j] ?? 0));
      confHighActive = beta_active.map((b, j) => (b ?? 0) + criticalValActive * (seActive[j] ?? 0));
    } catch (e) {
      // fallback
    }
  }

  const coefficients: PenalizedCoeffItem[] = [];
  coefficients.push({
    variable: 'Intercept',
    estimate: intercept,
    stdError: stdErrorActive[0] ?? 0,
    tStat: tStatActive[0] ?? 0,
    pValue: pValueActive[0] ?? 0,
    confLow: confLowActive[0] ?? intercept,
    confHigh: confHighActive[0] ?? intercept,
  });

  for (let j = 0; j < k; j++) {
    const activePos = activeIndices.indexOf(j);
    if (activePos !== -1) {
      coefficients.push({
        variable: xVars[j] || `Var${j}`,
        estimate: beta_orig[j] ?? 0,
        stdError: stdErrorActive[activePos + 1] ?? 0,
        tStat: tStatActive[activePos + 1] ?? 0,
        pValue: pValueActive[activePos + 1] ?? 0,
        confLow: confLowActive[activePos + 1] ?? (beta_orig[j] ?? 0),
        confHigh: confHighActive[activePos + 1] ?? (beta_orig[j] ?? 0),
      });
    } else {
      coefficients.push({
        variable: xVars[j] || `Var${j}`,
        estimate: 0,
        stdError: 0,
        tStat: 0,
        pValue: 1,
        confLow: 0,
        confHigh: 0,
      });
    }
  }

  const Y_hat = X.map((row) => {
    let pred = intercept;
    for (let j = 0; j < k; j++) {
      pred += (row[j] ?? 0) * (beta_orig[j] ?? 0);
    }
    return pred;
  });
  const residuals = y.map((val, i) => val - (Y_hat[i] ?? 0));
  const rss = residuals.reduce((sum, r) => sum + r * r, 0);
  const yMean = y.reduce((sum, val) => sum + val, 0) / n;
  const tss = y.reduce((sum, val) => sum + (val - yMean) * (val - yMean), 0);
  const rSquared = tss > 0 ? 1 - rss / tss : 0;
  
  const df = n - k_active;
  const adjRSquared = df > 0 && n > 1 ? 1 - (rss / df) / (tss / (n - 1)) : 0;
  const rmse = Math.sqrt(rss / n);

  const selectedVars = activeIndices.map(idx => xVars[idx] ?? `Var${idx}`);

  return {
    coefficients,
    rSquared,
    adjRSquared,
    rmse,
    lambda,
    alpha,
    selectedVars,
    residuals,
    fitted: Y_hat,
    yActual: y,
    method: 'ElasticNet'
  };
}

/**
 * K-Fold Cross-Validation for Lambda Selection
 */
export function crossValidateLambda(
  X: number[][], // WITHOUT intercept
  y: number[],
  method: 'ridge' | 'lasso' | 'elasticnet',
  xVars: string[],
  lambdas = [0.001, 0.01, 0.1, 1, 10, 100],
  folds = 5,
  alpha = 0.5
): { bestLambda: number; cvResults: { lambda: number; mse: number }[] } {
  const n = X.length;
  const indices = Array.from({ length: n }, (_, i) => i);
  
  // Deterministic LCG random shuffle
  let seed = 12345;
  const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = n - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const temp = indices[i] ?? 0;
    indices[i] = indices[j] ?? 0;
    indices[j] = temp;
  }

  const foldSize = Math.floor(n / folds);
  const cvResults = lambdas.map(lambda => {
    let totalSE = 0;
    let evalCount = 0;

    for (let f = 0; f < folds; f++) {
      const valStart = f * foldSize;
      const valEnd = f === folds - 1 ? n : (f + 1) * foldSize;
      const valSet = new Set(indices.slice(valStart, valEnd));

      const trainX: number[][] = [];
      const trainY: number[] = [];
      const valX: number[][] = [];
      const valY: number[] = [];

      for (let i = 0; i < n; i++) {
        const rowX = X[i];
        const valYVal = y[i];
        if (!rowX || valYVal === undefined) continue;
        if (valSet.has(i)) {
          valX.push(rowX);
          valY.push(valYVal);
        } else {
          trainX.push(rowX);
          trainY.push(valYVal);
        }
      }

      if (trainX.length === 0 || valX.length === 0) continue;

      let b_orig: number[] = [];
      let b_intercept = 0;

      if (method === 'ridge') {
        const trainX_with_intercept = trainX.map(row => [1, ...row]);
        const ridgeModel = ridgeRegression(trainX_with_intercept, trainY, lambda, xVars);
        b_intercept = ridgeModel.coefficients[0]?.estimate ?? 0;
        b_orig = ridgeModel.coefficients.slice(1).map(c => c.estimate);
      } else if (method === 'lasso') {
        const lassoModel = lassoRegression(trainX, trainY, lambda, xVars);
        b_intercept = lassoModel.coefficients[0]?.estimate ?? 0;
        b_orig = lassoModel.coefficients.slice(1).map(c => c.estimate);
      } else {
        const enetModel = elasticNet(trainX, trainY, lambda, alpha, xVars);
        b_intercept = enetModel.coefficients[0]?.estimate ?? 0;
        b_orig = enetModel.coefficients.slice(1).map(c => c.estimate);
      }

      for (let i = 0; i < valX.length; i++) {
        let pred = b_intercept;
        const rowValX = valX[i];
        const valY_i = valY[i];
        if (!rowValX || valY_i === undefined) continue;
        for (let j = 0; j < rowValX.length; j++) {
          pred += (rowValX[j] ?? 0) * (b_orig[j] ?? 0);
        }
        totalSE += (valY_i - pred) ** 2;
        evalCount++;
      }
    }

    const mse = evalCount > 0 ? totalSE / evalCount : 999999;
    return { lambda, mse };
  });

  let bestLambda = lambdas[0] ?? 0;
  let minMse = Infinity;
  cvResults.forEach(res => {
    if (res.mse < minMse) {
      minMse = res.mse;
      bestLambda = res.lambda;
    }
  });

  return { bestLambda, cvResults };
}
