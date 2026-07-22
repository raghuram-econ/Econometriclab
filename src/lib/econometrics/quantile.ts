import * as math from 'mathjs';
import jStat from 'jstat';
import { runOLS, preprocessDataAndVars } from './ols';
import { RegressionResult } from '../../types';
import { solveQR } from './estimators';

export function runQuantileRegression(
  data: any[],
  yVar: string,
  xVars: string[],
  quantile = 0.5
): RegressionResult {
  const { mappedData, finalYVar, finalXVars } = preprocessDataAndVars(data || [], yVar, xVars);

  const varsToObserve = [finalYVar, ...finalXVars];
  const filteredData = mappedData.filter(row => {
    return row && varsToObserve.every(v => row[v] !== undefined && row[v] !== null && !isNaN(parseFloat(row[v])));
  });

  const n = filteredData.length;
  const k = finalXVars.length + 1;

  if (n < k + 1) {
    throw new Error('Insufficient observations for Quantile Regression.');
  }

  // Construct Y and X
  const Y = filteredData.map(row => parseFloat(row[finalYVar]));
  const X = filteredData.map(row => {
    const rowValues = finalXVars.map(v => parseFloat(row[v]));
    return [1, ...rowValues]; // always include intercept
  });

  // Initialize with standard OLS
  const olsInit = runOLS(filteredData, finalYVar, finalXVars, true, false, undefined, false, false);
  let beta = olsInit.coefficients.map(c => c.estimate);

  let iter = 0;
  const maxIter = 200;
  const tolerance = 1e-10;
  const epsilon = 1e-12;

  let W_diag = new Array(n).fill(1.0);

  while (iter < maxIter) {
    iter++;
    const oldBeta = [...beta];

    // Compute residuals and weights
    const residuals = Y.map((yi, i) => {
      const row = X[i];
      if (!row) return 0;
      const xBeta = row.reduce((sum, val, idx) => {
        const b = beta[idx];
        return sum + val * (b !== undefined ? b : 0);
      }, 0);
      return yi - xBeta;
    });

    W_diag = residuals.map(res => {
      const absRes = Math.abs(res);
      const densityWeight = res >= 0 ? quantile : (1.0 - quantile);
      return densityWeight / Math.max(epsilon, absRes);
    });

    // Solve WLS: beta = (X' W X)^-1 X' W Y
    // X_sqrtW = sqrt(W) * X
    const X_sqrtW = X.map((row, i) => {
      const weight = W_diag[i];
      const w = weight !== undefined ? weight : 1.0;
      return row.map(val => val * Math.sqrt(w));
    });
    const Y_sqrtW = Y.map((yi, i) => {
      const weight = W_diag[i];
      const w = weight !== undefined ? weight : 1.0;
      return yi * Math.sqrt(w);
    });
    const qrResult = solveQR(X_sqrtW, Y_sqrtW);
    beta = qrResult.beta;

    // Check convergence
    const diff = beta.reduce((sum, b, idx) => {
      const ob = oldBeta[idx];
      return sum + Math.abs(b - (ob !== undefined ? ob : 0));
    }, 0);
    if (diff < tolerance) {
      break;
    }
  }

  // Final residuals
  const residuals = Y.map((yi, i) => {
    const row = X[i];
    if (!row) return 0;
    const xBeta = row.reduce((sum, val, idx) => {
      const b = beta[idx];
      return sum + val * (b !== undefined ? b : 0);
    }, 0);
    return yi - xBeta;
  });

  // Calculate Huber sandwich standard errors for IRLS (vcov="robust") matching statsmodels default
  const alpha = 0.05;
  const z_alpha = jStat.normal.inv(1 - alpha / 2, 0, 1);
  const q_inv = jStat.normal.inv(quantile, 0, 1);
  const f_q_inv = jStat.normal.pdf(q_inv, 0, 1);
  const num_bw = 1.5 * f_q_inv * f_q_inv;
  const den_bw = 2 * q_inv * q_inv + 1;
  const h_bw = Math.pow(n, -1/3) * Math.pow(z_alpha, 2/3) * Math.pow(num_bw / den_bw, 1/3);

  const sortedRes = [...residuals].sort((a, b) => a - b);
  
  function getEmpiricalQuantile(q: number): number {
    const pos = q * (n - 1);
    const base = Math.floor(pos);
    const rest = pos - base;
    if (base >= n - 1) return sortedRes[n - 1] ?? 0;
    if (base < 0) return sortedRes[0] ?? 0;
    const sBase = sortedRes[base];
    const sNext = sortedRes[base + 1];
    if (sBase === undefined || sNext === undefined) return 0;
    return sBase + rest * (sNext - sBase);
  }

  const q25 = getEmpiricalQuantile(0.25);
  const q75 = getEmpiricalQuantile(0.75);
  const iqre = q75 - q25;

  const yMean = Y.reduce((sum, val) => sum + val, 0) / n;
  const yVariance = Y.reduce((sum, val) => sum + (val - yMean) * (val - yMean), 0) / (n - 1);
  const yStd = Math.sqrt(yVariance);

  const h_up = Math.min(quantile + h_bw, 0.999);
  const h_low = Math.max(quantile - h_bw, 0.001);
  const h_final = Math.min(yStd, iqre / 1.34) * (jStat.normal.inv(h_up, 0, 1) - jStat.normal.inv(h_low, 0, 1));

  // Epanechnikov kernel sum
  let sumKernel = 0;
  for (let i = 0; i < n; i++) {
    const res = residuals[i];
    const u = (res !== undefined ? res : 0) / (h_final || 1e-6);
    const kVal = Math.abs(u) <= 1 ? 0.75 * (1 - u * u) : 0;
    sumKernel += kVal;
  }
  const fhat0 = sumKernel / (n * (h_final || 1e-6));
  const sparsity = 1.0 / (fhat0 || 1e-6);

  // robust covariance matrix
  const d = residuals.map(res => {
    const r = res !== undefined ? res : 0;
    const val = r > 0 ? quantile / (fhat0 || 1e-6) : (1.0 - quantile) / (fhat0 || 1e-6);
    return val * val;
  });

  const Meat = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        const row = X[i];
        if (row) {
          const valR = row[r];
          const valC = row[c];
          const dVal = d[i];
          if (valR !== undefined && valC !== undefined && dVal !== undefined) {
            sum += valR * dVal * valC;
          }
        }
      }
      const meatRow = Meat[r];
      if (meatRow) meatRow[c] = sum;
    }
  }

  // X'X inverse
  const qrX = solveQR(X, new Array(X.length).fill(0));
  const XtX_inv = qrX.XtX_inv;

  // varCov = XtX_inv * Meat * XtX_inv
  const tempCov = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      let sum = 0;
      for (let j = 0; j < k; j++) {
        const invRow = XtX_inv[r];
        const meatRow = Meat[j];
        if (invRow && meatRow) {
          const invVal = invRow[j];
          const meatVal = meatRow[c];
          if (invVal !== undefined && meatVal !== undefined) {
            sum += invVal * meatVal;
          }
        }
      }
      const tempCovRow = tempCov[r];
      if (tempCovRow) tempCovRow[c] = sum;
    }
  }

  const varCov = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let r = 0; r < k; r++) {
    for (let c = 0; c < k; c++) {
      let sum = 0;
      for (let j = 0; j < k; j++) {
        const tempRow = tempCov[r];
        const invRow = XtX_inv[j];
        if (tempRow && invRow) {
          const tempVal = tempRow[j];
          const invVal = invRow[c];
          if (tempVal !== undefined && invVal !== undefined) {
            sum += tempVal * invVal;
          }
        }
      }
      const varCovRow = varCov[r];
      if (varCovRow) varCovRow[c] = sum;
    }
  }

  // Construct coefficient array
  const labels = ['Intercept', ...finalXVars];
  const coefficients = labels.map((label, i) => {
    const estimate = beta[i] !== undefined ? beta[i]! : 0;
    const rowCov = varCov[i];
    const cellCov = rowCov !== undefined ? rowCov[i] : 0;
    const stdError = Math.sqrt(Math.abs(cellCov !== undefined ? cellCov! : 0));
    const tStat = estimate / (stdError || 1e-6);
    const df = n - k;
    const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));

    return {
      variable: label,
      estimate,
      stdError,
      tStat,
      pValue,
      confLow: estimate - jStat.studentt.inv(0.975, df) * stdError,
      confHigh: estimate + jStat.studentt.inv(0.975, df) * stdError
    };
  });

  const rss = residuals.reduce((sum, res) => sum + res * res, 0);
  const tss = Y.reduce((sum, val) => sum + (val - yMean) * (val - yMean), 0);
  const rSquared = 1 - rss / tss; // Pseudo-R^2 in terms of variance explained

  const Y_hat = Y.map((yi, i) => yi - (residuals[i] !== undefined ? residuals[i]! : 0));

  return {
    coefficients,
    rSquared,
    adjRSquared: 1 - (rss / (n - k)) / (tss / (n - 1)),
    n,
    df: n - k,
    rmse: Math.sqrt(rss / (n - k)),
    aic: n * Math.log(rss / n) + 2 * k,
    bic: n * Math.log(rss / n) + k * Math.log(n),
    isRobust: true,
    residuals,
    fitted: Y_hat,
    yActual: Y,
    varCov
  };
}
