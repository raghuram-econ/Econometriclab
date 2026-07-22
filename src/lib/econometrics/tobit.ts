import * as math from 'mathjs';
import jStat from 'jstat';
import { runOLS } from './ols';
import { RegressionResult } from '../../types';

// Standard normal PDF helper
function phi(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF helper
function Phi(z: number): number {
  return (1.0 + jStat.erf(z / Math.sqrt(2))) / 2.0;
}

export function runTobitMLE(
  data: any[],
  yVar: string,
  xVars: string[],
  cutoff = 0
): RegressionResult & { uncensoredCount: number; totalCount: number; uncensoredFraction: number; logLikelihood: number } {
  const varsToObserve = [yVar, ...xVars];
  const filteredData = (data || []).filter(row => {
    return varsToObserve.every(v => row && row[v] !== undefined && row[v] !== null && !isNaN(parseFloat(row[v])));
  });

  const n = filteredData.length;
  if (n < xVars.length + 5) {
    throw new Error('Insufficient observations for Tobit MLE (requires at least k + 5).');
  }

  // Construct Y and X
  const Y = filteredData.map(row => parseFloat(row[yVar]));
  const X = filteredData.map(row => {
    const rowValues = xVars.map(v => parseFloat(row[v]));
    return [1, ...rowValues]; // always include intercept in Tobit MLE
  });

  const k = xVars.length + 1; // plus intercept

  const uncensoredIndices = Y.reduce((acc, y, i) => {
    if (y > cutoff) acc.push(i);
    return acc;
  }, [] as number[]);

  const censoredIndices = Y.reduce((acc, y, i) => {
    if (y <= cutoff) acc.push(i);
    return acc;
  }, [] as number[]);

  const totalCount = n;
  const uncensoredCount = uncensoredIndices.length;
  const uncensoredFraction = uncensoredCount / totalCount;

  if (uncensoredCount < k + 2) {
    throw new Error('Too few uncensored observations to run Tobit MLE.');
  }

  // Initialize beta and sigma using OLS on uncensored data
  const uncensoredRows = filteredData.filter(r => parseFloat(r[yVar]) > cutoff);
  const olsInit = runOLS(uncensoredRows, yVar, xVars, true, false, undefined, false, false);
  
  let beta = olsInit.coefficients.map(c => c.estimate);
  let sigma = olsInit.rmse || 1.0;

  let iter = 0;
  const maxIter = 2000;
  const tolerance = 1e-7;
  let converged = false;

  let varCov = Array(k + 2).fill(0).map(() => Array(k + 2).fill(0));
  let logLikelihood = -Infinity;

  while (iter < maxIter) {
    iter++;
    
    // Accumulators for log-likelihood, gradient, and BHHH Hessian
    let sumLL = 0;
    const grad = new Array(k + 1).fill(0); // [grad_beta (size k), grad_sigma]
    const outerGrads: number[][] = [];

    for (let i = 0; i < n; i++) {
      const xi = X[i];
      const yi = Y[i];
      if (!xi || yi === undefined) continue;
      const xBeta = xi.reduce((sum, val, idx) => sum + val * (beta[idx] ?? 0), 0);

      // Gradient vector for single observation i
      const grad_i = new Array(k + 1).fill(0);

      if (yi > cutoff) {
        // Uncensored
        const z = (yi - xBeta) / sigma;
        const logL_i = -Math.log(sigma) - 0.5 * Math.log(2 * Math.PI) - 0.5 * z * z;
        sumLL += logL_i;

        // dL / dbeta = xi * z / sigma
        for (let j = 0; j < k; j++) {
          grad_i[j] = ((xi[j] ?? 0) * z) / sigma;
        }
        // dL / dsigma = -1/sigma + z^2 / sigma
        grad_i[k] = -1 / sigma + (z * z) / sigma;

      } else {
        // Censored
        const a = (cutoff - xBeta) / sigma;
        const phiVal = phi(a);
        const PhiVal = Math.max(1e-15, Phi(a));
        const lambda = phiVal / PhiVal; // inverse mills ratio

        const logL_i = Math.log(PhiVal);
        sumLL += logL_i;

        // dL / dbeta = -xi * lambda / sigma
        for (let j = 0; j < k; j++) {
          grad_i[j] = -((xi[j] ?? 0) * lambda) / sigma;
        }
        // dL / dsigma = -a * lambda / sigma
        grad_i[k] = -(a * lambda) / sigma;
      }

      outerGrads.push(grad_i);
      for (let j = 0; j <= k; j++) {
        grad[j] = (grad[j] ?? 0) + (grad_i[j] ?? 0);
      }
    }

    // BHHH information matrix: H = sum_i g_i g_i^T  ((k+1) x (k+1))
    const P = k + 1;
    const H: number[][] = Array.from({ length: P }, () => new Array(P).fill(0));
    for (const gi of outerGrads) {
      for (let a = 0; a < P; a++) {
        const ga = gi[a] ?? 0;
        if (ga === 0) continue;
        const rowH = H[a] as number[];
        for (let b = 0; b < P; b++) {
          rowH[b] = (rowH[b] ?? 0) + ga * (gi[b] ?? 0);
        }
      }
    }

    // Ridge for numerical stability (scaled to each diagonal element)
    for (let a = 0; a < P; a++) {
      const rowH = H[a] as number[];
      rowH[a] = (rowH[a] ?? 0) + 1e-10 * (Math.abs(rowH[a] ?? 0) + 1);
    }

    // Newton/BHHH direction: solve H * step = grad
    let step: number[];
    let Hinv: number[][] | null = null;
    try {
      Hinv = math.inv(H) as unknown as number[][];
      step = Hinv.map(row => row.reduce((s, v, j) => s + v * (grad[j] ?? 0), 0));
      if (step.some(s => !Number.isFinite(s))) throw new Error('non-finite step');
      varCov = Hinv;
    } catch (e) {
      // Fall back to a small gradient-ascent step; mark SEs unavailable
      step = grad.map(g => g * 1e-6);
      varCov = Array.from({ length: P }, () => new Array(P).fill(NaN));
    }

    // Backtracking line search: only accept a step that increases the log-likelihood
    const evalLL = (bTry: number[], sTry: number): number => {
      if (!(sTry > 0) || !Number.isFinite(sTry)) return -Infinity;
      let ll = 0;
      for (let i = 0; i < n; i++) {
        const xi = X[i];
        const yi = Y[i];
        if (!xi || yi === undefined) continue;
        const xb = xi.reduce((sum, val, idx) => sum + val * (bTry[idx] ?? 0), 0);
        if (yi > cutoff) {
          const z = (yi - xb) / sTry;
          ll += -Math.log(sTry) - 0.5 * Math.log(2 * Math.PI) - 0.5 * z * z;
        } else {
          ll += Math.log(Math.max(1e-300, Phi((cutoff - xb) / sTry)));
        }
      }
      return Number.isFinite(ll) ? ll : -Infinity;
    };

    let t = 1.0;
    let accepted = false;
    let newBeta = beta;
    let newSigma = sigma;
    let newLL = sumLL;
    for (let ls = 0; ls < 40; ls++) {
      const bTry = beta.map((b, j) => b + t * (step[j] ?? 0));
      const sTry = sigma + t * (step[k] ?? 0);
      const llTry = evalLL(bTry, sTry);
      if (llTry > sumLL) {
        newBeta = bTry;
        newSigma = sTry;
        newLL = llTry;
        accepted = true;
        break;
      }
      t *= 0.5;
    }

    const prevLL = logLikelihood;
    beta = newBeta;
    sigma = Math.max(1e-8, newSigma);
    logLikelihood = accepted ? newLL : sumLL;

    // Convergence: require BOTH a small gradient AND a negligible relative
    // improvement. A damped step alone must never be read as convergence.
    const gradNorm = Math.sqrt(grad.reduce((sum, g) => sum + g * g, 0)) / n;
    const relImprove = Number.isFinite(prevLL)
      ? Math.abs(logLikelihood - prevLL) / (Math.abs(prevLL) + 1)
      : Infinity;

    if (!accepted) {
      // No uphill step exists along this direction — we are at a local optimum
      converged = true;
      break;
    }
    if (gradNorm < tolerance && relImprove < 1e-12) {
      converged = true;
      break;
    }
  }

  // Recompute the log-likelihood at the FINAL parameters so that the reported
  // fit statistics correspond to the reported coefficients.
  {
    let ll = 0;
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      const yi = Y[i];
      if (!xi || yi === undefined) continue;
      const xb = xi.reduce((sum, val, idx) => sum + val * (beta[idx] ?? 0), 0);
      if (yi > cutoff) {
        const z = (yi - xb) / sigma;
        ll += -Math.log(sigma) - 0.5 * Math.log(2 * Math.PI) - 0.5 * z * z;
      } else {
        ll += Math.log(Math.max(1e-300, Phi((cutoff - xb) / sigma)));
      }
    }
    logLikelihood = ll;
  }

  // Remove invented Pseudo-R2 and residuals for Tobit
  const pseudoRSquared = NaN;
  const adjRSquared = NaN;
  const residuals: number[] = [];
  const fitted: number[] = [];

  // Construct coefficient array
  const labels = ['Intercept', ...xVars, 'sigma (Error SD)'];
  const coefficients = labels.map((label, i) => {
    const estimate = i === k ? sigma : (beta[i] ?? 0);
    const stdError = Math.sqrt(Math.abs(varCov[i]?.[i] ?? 0));
    const tStat = estimate / (stdError || 1e-6);
    const df = n - k - 1;
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

  // Calculate AIC, BIC
  const df = n - k - 1;
  const aic = -2 * logLikelihood + 2 * (k + 1);
  const bic = -2 * logLikelihood + (k + 1) * Math.log(n);

  return {
    coefficients,
    rSquared: pseudoRSquared,
    adjRSquared,
    n,
    df,
    rmse: sigma,
    logLikelihood,
    aic,
    bic,
    uncensoredCount,
    totalCount,
    uncensoredFraction,
    isRobust: false,
    residuals,
    fitted
  };
}
