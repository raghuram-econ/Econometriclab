import * as math from 'mathjs';
import jStat from 'jstat';
import { solveQR } from './estimators';
import { RegressionResult } from '../../types';

// Helper for standard normal CDF
function Phi(z: number): number {
  return (1.0 + jStat.erf(z / Math.sqrt(2))) / 2.0;
}

// Helper for factorial log
function logFactorial(n: number): number {
  if (n <= 1) return 0;
  let logSum = 0;
  for (let i = 2; i <= n; i++) {
    logSum += Math.log(i);
  }
  return logSum;
}

export function runPoissonMLE(
  data: any[],
  yVar: string,
  xVars: string[],
  includeIntercept = true
): RegressionResult {
  // 1. Strict Listwise Deletion for missing or invalid values (Stata/R style)
  const isMissing = (v: any) => v === undefined || v === null || v === "" || v === "N/A" || v === "null" || v === "missing";
  const cleanData = (data || []).filter(row => {
    if (!row) return false;
    if (isMissing(row[yVar]) || isNaN(parseFloat(row[yVar]))) return false;
    for (let v of xVars) {
      if (isMissing(row[v]) || isNaN(parseFloat(row[v]))) return false;
    }
    return true;
  });

  const n = cleanData.length;
  if (n === 0) {
    throw new Error("No valid observations remaining after listwise deletion.");
  }
  const k = xVars.length + (includeIntercept ? 1 : 0);
  const df = n - k;

  // Extract vectors
  const Y = cleanData.map(row => parseFloat(row[yVar]));
  const X: number[][] = cleanData.map(row => {
    const xRow = xVars.map(v => parseFloat(row[v]));
    if (includeIntercept) {
      return [1, ...xRow];
    }
    return xRow;
  });

  // Initial estimate via OLS on ln(Y + 0.5) to get highly stable initial beta
  let beta = Array(k).fill(0.1);
  try {
    const Y_log = Y.map(y => Math.log(Math.max(1e-5, y + 0.5)));
    const olsInit = solveQR(X, Y_log);
    if (olsInit && olsInit.beta && olsInit.beta.length === k) {
      beta = olsInit.beta;
    }
  } catch (e) {
    // fallback to 0.1 if OLS fails
  }

  // Newton-Raphson iterations
  let converged = false;
  const maxIter = 50;
  const tolerance = 1e-6;

  let Hessian = Array(k).fill(0).map(() => Array(k).fill(0));
  let logLikelihood = 0;

  for (let iter = 0; iter < maxIter; iter++) {
    // Score vector (gradient)
    const score = Array(k).fill(0);
    // Hessian matrix
    const H = Array(k).fill(0).map(() => Array(k).fill(0));
    let currentLL = 0;

    for (let i = 0; i < n; i++) {
      const xi = X[i];
      const yi = Y[i] ?? 0;
      if (!xi) continue;
      
      // dot product
      let xb = 0;
      for (let j = 0; j < k; j++) xb += (xi[j] ?? 0) * (beta[j] ?? 0);
      
      // Cap xb to avoid overflow
      xb = Math.min(50, Math.max(-50, xb));
      const mu = Math.exp(xb);
      currentLL += yi * xb - mu - logFactorial(Math.round(yi));

      const diff = yi - mu;
      for (let j = 0; j < k; j++) {
        score[j] = (score[j] ?? 0) + diff * (xi[j] ?? 0);
        const rowH = H[j];
        if (rowH) {
          for (let l = 0; l < k; l++) {
            rowH[l] = (rowH[l] ?? 0) - mu * (xi[j] ?? 0) * (xi[l] ?? 0);
          }
        }
      }
    }

    logLikelihood = currentLL;

    // Check convergence by gradient size
    const scoreNorm = Math.sqrt(score.reduce((sum, s) => sum + s * s, 0));
    
    // Compute current mu values for QR step
    const currentMu = X.map(row => {
      let xb = 0;
      for (let j = 0; j < k; j++) xb += (row[j] ?? 0) * (beta[j] ?? 0);
      xb = Math.min(50, Math.max(-50, xb));
      return Math.exp(xb);
    });

    if (scoreNorm < tolerance) {
      converged = true;
      Hessian = H;
      break;
    }

    // NR Step via solving negH * delta = score
    try {
      const negH = H.map(row => row.map(v => -v));
      const qrNR = solveQR(negH, score);
      const delta = qrNR.beta;
      
      // Backtracking Line Search (Step halving)
      let updatedBeta = beta.map((b, idx) => b + (delta[idx] ?? 0));
      let stepSize = 1.0;
      let hasNaN = false;
      while (stepSize > 0.001) {
        hasNaN = false;
        const testBeta = beta.map((b, idx) => b + stepSize * (delta[idx] ?? 0));
        
        let testLL = 0;
        for (let i = 0; i < n; i++) {
          let xb = 0;
          const xRow = X[i];
          if (xRow) {
            for (let j = 0; j < k; j++) xb += (xRow[j] ?? 0) * (testBeta[j] ?? 0);
          }
          if (isNaN(xb) || !isFinite(xb) || xb > 50) {
            hasNaN = true;
            break;
          }
          const mu = Math.exp(xb);
          const yi = Y[i] ?? 0;
          testLL += yi * xb - mu - logFactorial(Math.round(yi));
        }
        
        if (!hasNaN && (testLL > logLikelihood - 1e-3 || stepSize < 0.01)) {
          updatedBeta = testBeta;
          break;
        }
        stepSize *= 0.5;
      }

      const betaChange = Math.sqrt(delta.reduce((sum, d) => sum + (d ?? 0) * (d ?? 0), 0));
      beta = updatedBeta;

      if (betaChange < tolerance) {
        converged = true;
        Hessian = H;
        break;
      }
    } catch (e) {
      break;
    }
  }

  // Calculate standard errors from negative Hessian inverse
  let stdErrors = Array(k).fill(NaN);
  let cov: number[][] = [];
  try {
    const finalMu = X.map(row => {
      let xb = 0;
      for (let j = 0; j < k; j++) xb += (row[j] ?? 0) * (beta[j] ?? 0);
      xb = Math.min(50, Math.max(-50, xb));
      return Math.exp(xb);
    });
    const sqrtW = finalMu.map(m => Math.sqrt(m));
    const X_star = X.map((row, i) => row.map(v => v * (sqrtW[i] ?? 1)));
    const qrFinal = solveQR(X_star, Y);
    cov = qrFinal.XtX_inv;

    stdErrors = Array(k).fill(0).map((_, i) => {
      const val = cov[i]?.[i] ?? 0;
      return val > 0 ? Math.sqrt(val) : NaN;
    });
  } catch (e) {
    // leave as NaN
  }

  // Format coefficients output
  const varNames = includeIntercept ? ['Intercept', ...xVars] : xVars;
  const coefficients = varNames.map((name, idx) => {
    const est = beta[idx] ?? 0;
    const se = stdErrors[idx];
    const tStat = isNaN(se) || se === 0 ? NaN : est / se;
    const pVal = isNaN(tStat) ? NaN : 2 * (1 - Phi(Math.abs(tStat)));
    const critVal = 1.959963984540054; // Normal 95% CI

    return {
      variable: name,
      estimate: est,
      stdError: isNaN(se) ? 0 : se,
      tStat: isNaN(tStat) ? 0 : tStat,
      pValue: isNaN(pVal) ? 1 : pVal,
      confLow: isNaN(se) ? 0 : est - critVal * se,
      confHigh: isNaN(se) ? 0 : est + critVal * se
    };
  });

  // Calculate pseudo R-squared (McFadden's)
  const meanY = Y.reduce((a, b) => a + (b ?? 0), 0) / n;
  let nullLL = 0;
  for (let i = 0; i < n; i++) {
    const valY = Y[i] ?? 0;
    nullLL += valY * Math.log(Math.max(1e-9, meanY)) - meanY - logFactorial(Math.round(valY));
  }
  const pseudoR2 = 1 - (logLikelihood / nullLL);

  const aic = -2 * logLikelihood + 2 * k;
  const bic = -2 * logLikelihood + k * Math.log(n);

  return {
    coefficients,
    rSquared: pseudoR2,
    adjRSquared: pseudoR2,
    n,
    df: n - k,
    rmse: Math.sqrt(Y.reduce((sum, y, i) => {
      let xb = 0;
      const xRow = X[i];
      if (xRow) {
        for (let j = 0; j < k; j++) xb += (xRow[j] ?? 0) * (beta[j] ?? 0);
      }
      xb = Math.min(50, Math.max(-50, xb));
      return sum + Math.pow((y ?? 0) - Math.exp(xb), 2);
    }, 0) / n),
    rss: Y.reduce((sum, y, i) => {
      let xb = 0;
      const xRow = X[i];
      if (xRow) {
        for (let j = 0; j < k; j++) xb += (xRow[j] ?? 0) * (beta[j] ?? 0);
      }
      xb = Math.min(50, Math.max(-50, xb));
      return sum + Math.pow((y ?? 0) - Math.exp(xb), 2);
    }, 0),
    logLikelihood,
    aic,
    bic,
    isRobust: false,
    residuals: Y.map((y, i) => {
      let xb = 0;
      const xRow = X[i];
      if (xRow) {
        for (let j = 0; j < k; j++) xb += (xRow[j] ?? 0) * (beta[j] ?? 0);
      }
      xb = Math.min(50, Math.max(-50, xb));
      return (y ?? 0) - Math.exp(xb);
    })
  };
}

export function runNegBinomialMLE(
  data: any[],
  yVar: string,
  xVars: string[],
  includeIntercept = true
): RegressionResult {
  // 1. Run Poisson MLE first to get consistent starting values and base predictions
  const poissonRes = runPoissonMLE(data, yVar, xVars, includeIntercept);
  
  const n = poissonRes.n;
  const k = xVars.length + (includeIntercept ? 1 : 0);
  const df = n - k;

  // Extract variables (strict listwise deletion)
  const isMissing = (v: any) => v === undefined || v === null || v === "" || v === "N/A" || v === "null" || v === "missing";
  const cleanData = (data || []).filter(row => {
    if (!row) return false;
    if (isMissing(row[yVar]) || isNaN(parseFloat(row[yVar]))) return false;
    for (let v of xVars) {
      if (isMissing(row[v]) || isNaN(parseFloat(row[v]))) return false;
    }
    return true;
  });

  const Y = cleanData.map(row => parseFloat(row[yVar]));
  const X: number[][] = cleanData.map(row => {
    const xRow = xVars.map(v => parseFloat(row[v]));
    if (includeIntercept) {
      return [1, ...xRow];
    }
    return xRow;
  });

  // Get initial beta from Poisson MLE
  let beta = poissonRes.coefficients.map(c => c.estimate);

  // Helper to compute mu values for current beta
  const getMu = (b: number[]) => {
    return X.map(row => {
      let xb = 0;
      for (let j = 0; j < k; j++) xb += (row[j] ?? 0) * (b[j] ?? 0);
      xb = Math.min(50, Math.max(-50, xb));
      return Math.exp(xb);
    });
  };

  let muValues = getMu(beta);

  // Helper to compute NB2 Log-Likelihood
  const getLL = (b: number[], a: number) => {
    const mu = getMu(b);
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const y = Y[i] ?? 0;
      const m = mu[i] ?? 1e-4;
      ll += jStat.gammaln(y + 1/a) - jStat.gammaln(y + 1) - jStat.gammaln(1/a) +
            y * Math.log((a * m) / (1 + a * m)) - (1/a) * Math.log(1 + a * m);
    }
    return ll;
  };

  // Initial estimate of alpha via Pearson residuals
  const poissonResiduals = poissonRes.residuals || [];
  let pearsonSum = 0;
  for (let i = 0; i < n; i++) {
    const e = poissonResiduals[i] ?? 0;
    const mu = Math.max(1e-10, (Y[i] ?? 0) - e);
    pearsonSum += (e * e - mu) / (mu * mu);
  }
  let alpha = Math.max(1e-4, pearsonSum / (n - k));

  // Alternating MLE Estimation Loop
  let converged = false;
  let logLikelihood = getLL(beta, alpha);
  
  for (let iter = 0; iter < 30; iter++) {
    const oldLL = logLikelihood;
    const oldBeta = [...beta];
    const oldAlpha = alpha;

    // Step A: Optimize beta given alpha via Fisher scoring (up to 10 sub-iterations)
    for (let sub = 0; sub < 10; sub++) {
      const currentMu = getMu(beta);
      
      // Compute score vector (gradient)
      const score = Array(k).fill(0);
      // Compute negative expected Hessian: X' W X where W_ii = mu_i / (1 + alpha * mu_i)
      const negH = Array(k).fill(0).map(() => Array(k).fill(0));

      for (let i = 0; i < n; i++) {
        const xi = X[i];
        if (!xi) continue;
        const mu = currentMu[i] ?? 1e-4;
        const y = Y[i] ?? 0;
        const denom = 1 + alpha * mu;
        const w = mu / denom;
        const diff = (y - mu) / denom;

        for (let j = 0; j < k; j++) {
          score[j] += diff * (xi[j] ?? 0);
          const rowH = negH[j];
          if (rowH) {
            for (let l = 0; l < k; l++) {
              rowH[l] += w * (xi[j] ?? 0) * (xi[l] ?? 0);
            }
          }
        }
      }

      // Solve negH * delta = score
      try {
        const qrNR = solveQR(negH, score);
        const delta = qrNR.beta;
        const stepNorm = Math.sqrt(delta.reduce((sum, d) => sum + d * d, 0));
        
        if (stepNorm < 1e-6) {
          break;
        }

        // Backtracking line search for beta
        let stepSize = 1.0;
        let bestBeta = [...beta];
        let maxSubLL = -Infinity;
        while (stepSize > 0.005) {
          const testBeta = beta.map((b, idx) => b + stepSize * (delta[idx] ?? 0));
          const testLL = getLL(testBeta, alpha);
          if (testLL > logLikelihood - 1e-4) {
            bestBeta = testBeta;
            maxSubLL = testLL;
            break;
          }
          stepSize *= 0.5;
        }
        beta = bestBeta;
        if (maxSubLL > -Infinity) {
          logLikelihood = maxSubLL;
        } else {
          logLikelihood = getLL(beta, alpha);
        }
      } catch (e) {
        break;
      }
    }

    // Step B: Optimize alpha given beta via 1D Golden Section Search
    const getLLAlphaOnly = (a: number) => getLL(beta, a);
    let aMin = 1e-5;
    let aMax = 20.0;
    const phi_const = (Math.sqrt(5) - 1) / 2;
    let a1 = aMax - phi_const * (aMax - aMin);
    let a2 = aMin + phi_const * (aMax - aMin);
    let f1 = getLLAlphaOnly(a1);
    let f2 = getLLAlphaOnly(a2);
    for (let sIter = 0; sIter < 25; sIter++) {
      if (f1 > f2) {
        aMax = a2;
        a2 = a1;
        f2 = f1;
        a1 = aMax - phi_const * (aMax - aMin);
        f1 = getLLAlphaOnly(a1);
      } else {
        aMin = a1;
        a1 = a2;
        f1 = f2;
        a2 = aMin + phi_const * (aMax - aMin);
        f2 = getLLAlphaOnly(a2);
      }
    }
    alpha = 0.5 * (aMin + aMax);
    logLikelihood = getLL(beta, alpha);

    // Check alternating convergence
    const llChange = Math.abs(logLikelihood - oldLL);
    const betaChange = Math.sqrt(beta.reduce((sum, b, idx) => sum + (b - (oldBeta[idx] ?? 0)) ** 2, 0));
    const alphaChange = Math.abs(alpha - oldAlpha);

    if (llChange < 1e-6 && betaChange < 1e-6 && alphaChange < 1e-6) {
      converged = true;
      break;
    }
  }

  // Final prediction mu values
  muValues = getMu(beta);

  // Compute proper asymptotic covariance matrix of beta using joint NB2 Fisher Information weights:
  // w_i = mu_i / (1 + alpha * mu_i)
  let stdErrors = Array(k).fill(NaN);
  let cov: number[][] = [];
  try {
    const sqrtW_nb = muValues.map(mu => Math.sqrt(mu / (1 + alpha * mu)));
    const X_star_nb = X.map((row, i) => row.map(v => v * (sqrtW_nb[i] ?? 1)));
    const qrFinal_nb = solveQR(X_star_nb, Y);
    cov = qrFinal_nb.XtX_inv;
    
    stdErrors = Array(k).fill(0).map((_, i) => {
      const val = cov[i]?.[i] ?? 0;
      return val > 0 ? Math.sqrt(val) : NaN;
    });
  } catch (e) {
    stdErrors = poissonRes.coefficients.map(c => c.stdError);
  }

  const nbCoefficients = poissonRes.coefficients.map((coef, idx) => {
    const est = beta[idx] ?? 0;
    const se = stdErrors[idx] ?? coef.stdError;
    const tStat = se !== 0 ? est / se : 0;
    const pVal = 2 * (1 - Phi(Math.abs(tStat)));
    return {
      variable: coef.variable,
      estimate: est,
      stdError: se,
      tStat,
      pValue: pVal,
      confLow: est - jStat.studentt.inv(0.975, df) * se,
      confHigh: est + jStat.studentt.inv(0.975, df) * se
    };
  });

  const aic = -2 * logLikelihood + 2 * (k + 1); // +1 for alpha
  const bic = -2 * logLikelihood + (k + 1) * Math.log(n);

  return {
    ...poissonRes,
    coefficients: nbCoefficients,
    logLikelihood,
    aic,
    bic,
    residuals: Y.map((y, i) => (y ?? 0) - (muValues[i] ?? 0))
  };
}
