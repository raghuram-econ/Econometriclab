import * as math from 'mathjs';
import jStat from 'jstat';
import { runPoissonMLE, runNegBinomialMLE } from './count';
import { RegressionResult } from '../../types';
import { computeRobustCovariance } from './robust';
import { preprocessDataAndVars } from './ols';

// Standard normal PDF helper
function phi(z: number): number {
  return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
}

// Standard normal CDF helper
function Phi(z: number): number {
  return (1.0 + jStat.erf(z / Math.sqrt(2))) / 2.0;
}

export interface EstimationParams {
  data: any[];
  yVar: string;
  xVars: string[];
  includeIntercept?: boolean;
  // Panel specific
  entityVar?: string;
  timeVar?: string;
  // IV specific
  endogenousVar?: string;
  instruments?: string[];
  // DiD specific
  treatedVar?: string;
  postVar?: string;
  // Robust options
  robust?: boolean;
  robustType?: 'HC0' | 'HC1' | 'HC2' | 'HC3' | 'NW';
  clusterVar?: string;
}

export function solveQR(X_in: number[][], Y_in: number[], labels?: string[], tol = 1e-15) {
  const n = X_in.length;
  if (n === 0) {
    return { beta: [], XtX_inv: [], droppedVariables: [], activeIndices: [], droppedIndices: [] };
  }
  const firstRow = X_in[0];
  if (!firstRow) {
    return { beta: [], XtX_inv: [], droppedVariables: [], activeIndices: [], droppedIndices: [] };
  }
  const k = firstRow.length;
  
  // 1. Column scaling
  const colNorms = new Array(k).fill(0);
  for (let j = 0; j < k; j++) {
    let s = 0;
    for (let i = 0; i < n; i++) {
      const val = X_in[i]?.[j] ?? 0;
      s += val * val;
    }
    colNorms[j] = Math.sqrt(s);
  }

  const R = X_in.map(row => row.map((val, j) => {
    const norm = colNorms[j] ?? 0;
    return norm > 1e-30 ? val / norm : val;
  }));
  const QTY = [...Y_in];
  
  const p = new Array(k).fill(0).map((_, i) => i);
  const currentNormsSq = new Array(k).fill(0);
  for (let j = 0; j < k; j++) {
    for (let i = 0; i < n; i++) {
      const rVal = R[i]?.[j] ?? 0;
      currentNormsSq[j] = (currentNormsSq[j] ?? 0) + rVal * rVal;
    }
  }

  let r = 0;
  for (let j = 0; j < Math.min(n, k); j++) {
    let maxNormSq = -1;
    let pivotCol = -1;
    for (let col = j; col < k; col++) {
      const cNorm = currentNormsSq[col] ?? 0;
      if (cNorm > maxNormSq) {
        maxNormSq = cNorm;
        pivotCol = col;
      }
    }
    
    if (maxNormSq < tol * tol) break;
    
    if (pivotCol !== j && pivotCol !== -1) {
      for (let i = 0; i < n; i++) {
        const rowR = R[i];
        if (rowR) {
          const tmp = rowR[j] ?? 0;
          rowR[j] = rowR[pivotCol] ?? 0;
          rowR[pivotCol] = tmp;
        }
      }
      const tmpP = p[j] ?? 0;
      p[j] = p[pivotCol] ?? 0;
      p[pivotCol] = tmpP;

      const tmpNorm = currentNormsSq[j] ?? 0;
      currentNormsSq[j] = currentNormsSq[pivotCol] ?? 0;
      currentNormsSq[pivotCol] = tmpNorm;
    }

    const norm = Math.sqrt(maxNormSq);
    const v = new Array(n - r);
    for (let i = 0; i < v.length; i++) {
      v[i] = R[r + i]?.[j] ?? 0;
    }
    
    const alpha = ((v[0] ?? 0) >= 0) ? -norm : norm;
    if (v[0] !== undefined) {
      v[0] -= alpha;
    }
    
    let vv = 0;
    for (let i = 0; i < v.length; i++) {
      const vVal = v[i] ?? 0;
      vv += vVal * vVal;
    }
    
    if (vv > 1e-30) {
      const factor = 2 / vv;
      for (let col = j; col < k; col++) {
        let dot = 0;
        for (let i = 0; i < v.length; i++) {
          dot += (v[i] ?? 0) * (R[r + i]?.[col] ?? 0);
        }
        const b_dot = factor * dot;
        for (let i = 0; i < v.length; i++) {
          const rowR = R[r + i];
          if (rowR) {
            rowR[col] = (rowR[col] ?? 0) - b_dot * (v[i] ?? 0);
          }
        }
      }
      let dotY = 0;
      for (let i = 0; i < v.length; i++) {
        dotY += (v[i] ?? 0) * (QTY[r + i] ?? 0);
      }
      const b_dotY = factor * dotY;
      for (let i = 0; i < v.length; i++) {
        QTY[r + i] = (QTY[r + i] ?? 0) - b_dotY * (v[i] ?? 0);
      }
    }
    
    const rRow = R[r];
    if (rRow) {
      rRow[j] = alpha;
    }
    for (let i = r + 1; i < n; i++) {
      const iRow = R[i];
      if (iRow) {
        iRow[j] = 0;
      }
    }
    for (let col = j + 1; col < k; col++) {
      let sSq = 0;
      for (let i = r + 1; i < n; i++) {
        const rVal = R[i]?.[col] ?? 0;
        sSq += rVal * rVal;
      }
      currentNormsSq[col] = sSq;
    }
    r++;
  }
  
  const beta_active = new Array(r).fill(0);
  for (let i = r - 1; i >= 0; i--) {
    let sum = 0;
    for (let m = i + 1; m < r; m++) {
      sum += (R[i]?.[m] ?? 0) * (beta_active[m] ?? 0);
    }
    const r_ii = R[i]?.[i] ?? 1;
    beta_active[i] = r_ii !== 0 ? ((QTY[i] ?? 0) - sum) / r_ii : 0;
  }
  
  const beta = new Array(k).fill(0);
  for (let i = 0; i < r; i++) {
    const originalIdx = p[i];
    if (originalIdx !== undefined) {
      const cNorm = colNorms[originalIdx] ?? 0;
      const bAct = beta_active[i] ?? 0;
      beta[originalIdx] = cNorm > 1e-30 ? bAct / cNorm : bAct;
    }
  }
  
  const R_inv = Array(r).fill(0).map(() => Array(r).fill(0));
  for (let j = 0; j < r; j++) {
    const r_jj = R[j]?.[j] ?? 1;
    const rowR_inv = R_inv[j];
    if (rowR_inv) {
      rowR_inv[j] = r_jj !== 0 ? 1 / r_jj : 0;
    }
    for (let i = j - 1; i >= 0; i--) {
      let sum = 0;
      for (let m = i + 1; m <= j; m++) {
        sum += (R[i]?.[m] ?? 0) * (R_inv[m]?.[j] ?? 0);
      }
      const r_ii = R[i]?.[i] ?? 1;
      const rowR_inv_i = R_inv[i];
      if (rowR_inv_i) {
        rowR_inv_i[j] = r_ii !== 0 ? -sum / r_ii : 0;
      }
    }
  }
  
  const XtX_inv = Array(k).fill(0).map(() => Array(k).fill(0));
  for (let i = 0; i < r; i++) {
    const idxI = p[i];
    if (idxI === undefined) continue;
    for (let j = 0; j < r; j++) {
      const idxJ = p[j];
      if (idxJ === undefined) continue;
      let sum = 0;
      for (let m = 0; m < r; m++) {
        const rowR = R_inv[i];
        const rowRj = R_inv[j];
        if (rowR && rowRj) {
          sum += (rowR[m] ?? 0) * (rowRj[m] ?? 0);
        }
      }
      const normI = colNorms[idxI] ?? 0;
      const normJ = colNorms[idxJ] ?? 0;
      const den = normI * normJ;
      const targetRow = XtX_inv[idxI];
      if (targetRow) {
        targetRow[idxJ] = den !== 0 ? sum / den : 0;
      }
    }
  }
  
  const droppedVariables: string[] = [];
  const droppedIndices: number[] = [];
  for (let i = r; i < k; i++) {
    const idx = p[i];
    if (idx !== undefined) {
      droppedIndices.push(idx);
      if (labels && labels[idx]) {
        droppedVariables.push(labels[idx]);
      }
    }
  }
  if (droppedVariables.length > 0) console.warn("Dropped:", droppedVariables.join(", "));
  
  return { beta, XtX_inv, droppedVariables, activeIndices: p.slice(0, r), droppedIndices };
}

/**
 * Executes the requested advanced econometric model type using rigorous matrix algebra.
 */
export function estimateModel(
  modelType: 'OLS' | 'Robust OLS' | 'WLS' | 'Logit' | 'Probit' | 'Panel FE' | 'Panel RE' | 'IV' | 'DiD' | 'Poisson' | 'Negative Binomial',
  params: EstimationParams
): RegressionResult {
  // Validate unsupported estimation options before doing anything else
  const hasRobustOption = params.robust || (params.robustType !== undefined && params.robustType !== null);
  if (hasRobustOption && modelType !== 'Robust OLS') {
    throw new Error(`Model type "${modelType}" does not support robust standard errors/robustType. Please use "Robust OLS" instead.`);
  }

  const hasClusterOption = params.clusterVar !== undefined && params.clusterVar !== null && params.clusterVar !== '';
  if (hasClusterOption) {
    const supportedClusterModels = ['OLS', 'Robust OLS', 'Panel FE'];
    if (!supportedClusterModels.includes(modelType)) {
      throw new Error(`Model type "${modelType}" does not support clusterVar. Please use "Robust OLS" or "Panel FE" instead.`);
    }
  }

  let {
    data,
    yVar,
    xVars,
    includeIntercept = true,
    entityVar,
    timeVar,
    endogenousVar,
    instruments,
    treatedVar,
    postVar,
    robustType = 'HC1',
    clusterVar
  } = params;

  // Preprocess for categorical variables
  const { mappedData: preprocessedData, finalYVar, finalXVars } = preprocessDataAndVars(data || [], yVar, xVars);

  data = preprocessedData;
  yVar = finalYVar;
  xVars = finalXVars;

  // Filter missing data
  const numericVars = [yVar, ...xVars];
  if (endogenousVar) numericVars.push(endogenousVar);
  if (instruments) numericVars.push(...instruments);

  const groupingVars: string[] = [];
  if (entityVar) groupingVars.push(entityVar);
  if (timeVar) groupingVars.push(timeVar);
  if (treatedVar) groupingVars.push(treatedVar);
  if (postVar) groupingVars.push(postVar);

  const cleanData = data.filter(row => {
    if (!row) return false;
    const numOk = numericVars.every(v => row[v] !== undefined && row[v] !== null && !isNaN(parseFloat(row[v])));
    if (!numOk) return false;
    const groupOk = groupingVars.every(v => row[v] !== undefined && row[v] !== null);
    return groupOk;
  });

  if (cleanData.length < xVars.length + 3) {
    throw new Error(`Insufficient clean observations. Found ${cleanData.length}, required at least ${xVars.length + 3}.`);
  }

  const n = cleanData.length;

  const Y_all = cleanData.map(row => parseFloat(row[yVar] ?? '0'));
  const yMean_all = Y_all.reduce((sum, val) => sum + val, 0) / n;
  const tss_all = Y_all.reduce((sum, val) => sum + (val - yMean_all) * (val - yMean_all), 0);
  if (tss_all < 1e-12) {
    throw new Error('The dependent variable has zero variance (is constant across all observations). Estimation is undefined.');
  }

  if (modelType === 'OLS' || modelType === 'Robust OLS') {
    const isRobust = modelType === 'Robust OLS' || !!clusterVar;
    
    // Construct X and Y
    const Y = cleanData.map(row => parseFloat(row[yVar] ?? '0'));
    const X = cleanData.map(row => {
      const vals = xVars.map(v => parseFloat(row[v] ?? '0'));
      return includeIntercept ? [1, ...vals] : vals;
    });

    const labels = includeIntercept ? ['Intercept', ...xVars] : xVars;

    if (X.length === 0 || !X[0]) {
      throw new Error("Empty dataset for estimation.");
    }
    const k = X[0].length;
    const qrRes = solveQR(X, Y, labels);
    const beta = qrRes.beta;
    const XtX_inv = qrRes.XtX_inv;

    // Residuals
    const Y_hat = math.multiply(X as any, beta as any) as any as number[];
    const residuals = Y.map((val, i) => val - (Y_hat[i] ?? 0));

    const rss = residuals.reduce((sum, r) => sum + r * r, 0);
    const yMean = Y.reduce((sum, v) => sum + v, 0) / n;
    const tss = includeIntercept ? Y.reduce((sum, v) => sum + (v - yMean) ** 2, 0) : Y.reduce((sum, v) => sum + v * v, 0);
    const rSquared = 1 - rss / tss;
    const adjRSquared = includeIntercept ? 1 - (rss / (n - k)) / (tss / (n - 1)) : 1 - (rss / (n - k)) / (tss / n);
    const rmse = Math.sqrt(rss / (n - k));
    const aic = n * Math.log(rss / n) + 2 * k;
    const bic = n * Math.log(rss / n) + k * Math.log(n);
    const logLikelihood = -(n / 2) * (1 + Math.log(2 * Math.PI) + Math.log(rss / n));

    const fNumeratorDf = includeIntercept ? k - 1 : k;
    const fDenominatorDf = n - k;
    const fStat = fNumeratorDf > 0 ? (((tss - rss) / fNumeratorDf) / (rss / fDenominatorDf)) : 0;
    const fPValue = fNumeratorDf > 0 ? (1 - jStat.centralF.cdf(fStat, fNumeratorDf, fDenominatorDf)) : 0;

    let varCov: number[][];
    if (clusterVar) {
      const clusters = Array.from(new Set(cleanData.map(r => r[clusterVar])));
      const G = math.zeros(clusters.length, k) as any;
      clusters.forEach((clusterId, g) => {
        const clusterIndices: number[] = [];
        for (let i = 0; i < cleanData.length; i++) {
          if (cleanData[i]?.[clusterVar] === clusterId) clusterIndices.push(i);
        }
        let sum_ei_xi = math.zeros(k) as any;
        clusterIndices.forEach(idx => {
          const xi = X[idx];
          const ei = residuals[idx] ?? 0;
          if (xi) {
            sum_ei_xi = math.add(sum_ei_xi, math.multiply(xi as any, ei as any)) as any;
          }
        });
        for (let j = 0; j < k; j++) G.set([g, j], sum_ei_xi.get([j]) ?? 0);
      });
      const Gt = math.transpose(G);
      const Meat = math.multiply(Gt, G);
      const correction = (clusters.length / (clusters.length - 1)) * ((n - 1) / (n - k));
      const MeatCorrected = math.multiply(Meat, correction);
      const temp = math.multiply(XtX_inv, MeatCorrected);
      const mCov = math.multiply(temp, XtX_inv) as any;
      varCov = mCov.toArray ? mCov.toArray() : mCov;
    } else if (isRobust) {
      varCov = computeRobustCovariance(X, XtX_inv, residuals, robustType);
    } else {
      varCov = math.multiply(XtX_inv, rss / (n - k)) as number[][];
    }

    const coefficients = labels.map((label, i) => {
      const estimate = beta[i] ?? 0;
      const stdError = Math.sqrt(varCov[i]?.[i] ?? 0);
      const tStat = stdError !== 0 ? estimate / stdError : 0;
      const df = n - k;
      const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));
      const tCrit = jStat.studentt.inv(0.975, df);
      
      let stars = '';
      if (pValue < 0.001) stars = '***';
      else if (pValue < 0.01) stars = '**';
      else if (pValue < 0.05) stars = '*';
      else if (pValue < 0.1) stars = '.';

      return {
        variable: label,
        estimate: estimate,
        stdError: stdError,
        tStat: tStat,
        pValue: pValue,
        confLow: estimate - tCrit * stdError,
        confHigh: estimate + tCrit * stdError,
        ciLower: (estimate - tCrit * stdError).toFixed(4),
        ciUpper: (estimate + tCrit * stdError).toFixed(4),
        stars
      };
    });

    // BP test
    let bpStat = 0;
    let bpP = 0.5;
    if (xVars.length > 0) {
      try {
        const sqRes = residuals.map(r => r * r);
        const auxY = sqRes;
        const auxX = X;
        const qrAux = solveQR(auxX, auxY, labels);
        const auxBeta = qrAux.beta;
        const auxYHat = math.multiply(auxX as any, auxBeta as any) as any as number[];
        const auxRes = auxY.map((val, i) => val - (auxYHat[i] ?? 0));
        const auxRss = auxRes.reduce((s, r) => s + r * r, 0);
        const auxYMean = auxY.reduce((s, v) => s + v, 0) / n;
        const auxTss = auxY.reduce((s, v) => s + (v - auxYMean) ** 2, 0);
        const auxR2 = 1 - auxRss / auxTss;
        bpStat = n * auxR2;
        bpP = 1 - jStat.chisquare.cdf(bpStat, xVars.length);
      } catch(e) {}
    }

    // DW Test
    let dwDen = residuals.reduce((sum, r) => sum + r * r, 0);
    let dwNum = 0;
    for (let i = 1; i < n; i++) {
      dwNum += ((residuals[i] ?? 0) - (residuals[i - 1] ?? 0)) ** 2;
    }
    const durbinWatson = dwDen > 0 ? dwNum / dwDen : 2.0;

    return {
      coefficients,
      rSquared,
      adjRSquared,
      fStat,
      fPValue,
      logLikelihood,
      n,
      df: n - k,
      rmse,
      rss,
      aic,
      bic,
      isRobust,
      residuals,
      durbinWatson,
      breuschPaganStat: bpStat,
      breuschPaganPValue: bpP
    };
  }

  if (modelType === 'WLS') {
    // Feasible GLS WLS:
    // 1. OLS
    const Y = cleanData.map(row => parseFloat(row[yVar] ?? '0'));
    const X = cleanData.map(row => {
      const vals = xVars.map(v => parseFloat(row[v] ?? '0'));
      return includeIntercept ? [1, ...vals] : vals;
    });
    const labels = includeIntercept ? ['Intercept', ...xVars] : xVars;

    if (X.length === 0 || !X[0]) {
      throw new Error("Empty dataset for estimation.");
    }
    const k = X[0].length;
    const qrOLS = solveQR(X, Y, labels);
    const betaOLS = qrOLS.beta;
    const XtX_inv = qrOLS.XtX_inv;
    const hatY = math.multiply(X as any, betaOLS as any) as any as number[];
    const resOLS = Y.map((val, i) => val - (hatY[i] ?? 0));

    // 2. Regress log(e^2) on X to model heteroscedasticity
    const logESq = resOLS.map(r => Math.log(Math.max(1e-10, (r ?? 0) * (r ?? 0))));
    const betaHetero = solveQR(X, logESq, labels).beta;
    const fittedG = math.multiply(X as any, betaHetero as any) as any as number[];
    
    // 3. Construct weights w = exp(-fittedG)
    const weights = fittedG.map(g => Math.exp(-(g ?? 0)));

    // 4. Run Weighted OLS: multiply rows by sqrt(w)
    const sqrtW = weights.map(w => Math.sqrt(w));
    const Y_star = Y.map((y, i) => y * (sqrtW[i] ?? 1));
    const X_star = X.map((row, i) => row.map(v => v * (sqrtW[i] ?? 1)));

    const qrWLS = solveQR(X_star, Y_star, labels);
    const betaWLS = qrWLS.beta;
    const XtX_star_inv = qrWLS.XtX_inv;

    // Calculate original residuals
    const Y_hat = math.multiply(X as any, betaWLS as any) as any as number[];
    const residuals = Y.map((val, i) => val - (Y_hat[i] ?? 0));

    // Weighted residuals for goodness of fit
    const residuals_star = Y_star.map((val, i) => val - (math.multiply(X_star[i] as any, betaWLS as any) as any as number));
    const rss = residuals_star.reduce((sum, r) => sum + r * r, 0);
    const yMean_star = Y_star.reduce((sum, v) => sum + v, 0) / n;
    const tss = includeIntercept ? Y_star.reduce((sum, v) => sum + (v - yMean_star) ** 2, 0) : Y_star.reduce((sum, v) => sum + v * v, 0);
    const rSquared = 1 - rss / tss;
    const adjRSquared = includeIntercept ? 1 - (rss / (n - k)) / (tss / (n - 1)) : 1 - (rss / (n - k)) / (tss / n);
    const rmse = Math.sqrt(rss / (n - k));
    const aic = n * Math.log(rss / n) + 2 * k;
    const bic = n * Math.log(rss / n) + k * Math.log(n);
    const logLikelihood = -(n / 2) * (1 + Math.log(2 * Math.PI) + Math.log(rss / n));

    const fNumeratorDf = includeIntercept ? k - 1 : k;
    const fDenominatorDf = n - k;
    const fStat = fNumeratorDf > 0 ? (((tss - rss) / fNumeratorDf) / (rss / fDenominatorDf)) : 0;
    const fPValue = fNumeratorDf > 0 ? (1 - jStat.centralF.cdf(fStat, fNumeratorDf, fDenominatorDf)) : 0;

    const varCov = math.multiply(XtX_star_inv, rss / (n - k)) as number[][];

    const coefficients = labels.map((label, i) => {
      const estimate = betaWLS[i] ?? 0;
      const stdError = Math.sqrt(varCov[i]?.[i] ?? 0);
      const tStat = stdError !== 0 ? estimate / stdError : 0;
      const df = n - k;
      const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));
      const tCrit = jStat.studentt.inv(0.975, df);
      
      let stars = '';
      if (pValue < 0.001) stars = '***';
      else if (pValue < 0.01) stars = '**';
      else if (pValue < 0.05) stars = '*';
      else if (pValue < 0.1) stars = '.';

      return {
        variable: label,
        estimate: estimate,
        stdError: stdError,
        tStat: tStat,
        pValue: pValue,
        confLow: estimate - tCrit * stdError,
        confHigh: estimate + tCrit * stdError,
        ciLower: (estimate - tCrit * stdError).toFixed(4),
        ciUpper: (estimate + tCrit * stdError).toFixed(4),
        stars
      };
    });

    return {
      coefficients,
      rSquared,
      adjRSquared,
      fStat,
      fPValue,
      logLikelihood,
      n,
      df: n - k,
      rmse,
      rss,
      aic,
      bic,
      isRobust: false,
      residuals
    };
  }

  if (modelType === 'Logit' || modelType === 'Probit') {
    // Binary Choice Models using IRLS
    const rawY = cleanData.map(row => parseFloat(row[yVar] ?? '0'));
    const uniqueY = Array.from(new Set(rawY)).sort((a, b) => a - b);
    if (uniqueY.length !== 2) {
      throw new Error(`Model requires a binary outcome. '${yVar}' has ${uniqueY.length} unique values.`);
    }
    const Y: number[] = rawY.map(val => val === uniqueY[1] ? 1 : 0);
    const uniqueCleanY = Array.from(new Set(Y));
    if (uniqueCleanY.length < 2) {
      throw new Error("Outcome does not vary; the dependent variable is constant in the estimation sample.");
    }

    const X = cleanData.map(row => {
      const vals = xVars.map(v => parseFloat(row[v] ?? '0'));
      return includeIntercept ? [1, ...vals] : vals;
    });

    if (X.length === 0 || !X[0]) {
      throw new Error("Empty dataset for estimation.");
    }
    const k = X[0].length;
    let beta = Array(k).fill(0);
    let converged = false;
    let maxIter = 25;
    let XtWX_inv: number[][] = [];
    let p = Array(n).fill(0.5);

    for (let iter = 0; iter < maxIter; iter++) {
      const W = Array(n).fill(0);
      const Z = Array(n).fill(0);

      for (let i = 0; i < n; i++) {
        let eta = 0;
        const xRow = X[i];
        if (xRow) {
          for (let j = 0; j < k; j++) eta += (xRow[j] ?? 0) * (beta[j] ?? 0);
        }

        if (modelType === 'Logit') {
          const pi = 1.0 / (1.0 + Math.exp(-Math.max(-20, Math.min(20, eta))));
          p[i] = pi;
          const w = Math.max(1e-5, pi * (1.0 - pi));
          W[i] = w;
          Z[i] = eta + ((Y[i] ?? 0) - pi) / w;
        } else {
          // Probit
          const pi = Phi(eta);
          p[i] = Math.max(1e-5, Math.min(1 - 1e-5, pi));
          const f = phi(eta);
          const w = Math.max(1e-5, (f * f) / (pi * (1.0 - pi)));
          W[i] = w;
          Z[i] = eta + ((Y[i] ?? 0) - pi) / Math.max(1e-5, f);
        }
      }

      // Compute (X' W X)^-1 X' W Z
      // X_star = sqrt(W) * X
      // Y_star = sqrt(W) * Z
      const sqrtW = W.map(w => Math.sqrt(w));
      const X_star = X.map((row, i) => row.map(v => v * (sqrtW[i] ?? 1)));
      const Y_star = Z.map((z, i) => z * (sqrtW[i] ?? 1));

      try {
        const qrLogit = solveQR(X_star, Y_star, includeIntercept ? ['Intercept', ...xVars] : xVars);
        XtWX_inv = qrLogit.XtX_inv;
        const nextBeta = qrLogit.beta;

        // Check convergence
        let diff = 0;
        for (let j = 0; j < k; j++) diff += Math.abs((nextBeta[j] ?? 0) - (beta[j] ?? 0));
        beta = nextBeta;

        if (diff < 1e-6) {
          converged = true;
          break;
        }
      } catch (e) {
        break; // Singular matrix
      }
    }

    // Covariance matrix is (X' W X)^-1
    const varCov = XtWX_inv.length > 0 ? XtWX_inv : Array(k).fill(0).map(() => Array(k).fill(0));

    // Calculate Log Likelihood
    let logLikelihood = 0;
    let nullLogLikelihood = 0;
    const yMean = Y.reduce((s, v) => s + v, 0) / n;

    for (let i = 0; i < n; i++) {
      const pi = p[i] ?? 0.5;
      const yVal = Y[i] ?? 0;
      logLikelihood += yVal * Math.log(pi) + (1 - yVal) * Math.log(1 - pi);
      nullLogLikelihood += yVal * Math.log(yMean) + (1 - yVal) * Math.log(1 - yMean);
    }

    const pseudoR2 = 1 - logLikelihood / nullLogLikelihood;
    const adjPseudoR2 = 1 - ((logLikelihood - k) / nullLogLikelihood);

    const labels = includeIntercept ? ['Intercept', ...xVars] : xVars;
    const coefficients = labels.map((label, i) => {
      const estimate = beta[i] ?? 0;
      const v = varCov[i]?.[i] ?? 0;
      const stdError = v > 0 ? Math.sqrt(v) : NaN;
      const zStat = isNaN(stdError) ? NaN : estimate / stdError;
      const pValue = isNaN(zStat) ? NaN : 2 * (1 - Phi(Math.abs(zStat)));
      const df = n - k;
      const tCrit = jStat.studentt.inv(0.975, df);
      
      let stars = '';
      if (pValue < 0.001) stars = '***';
      else if (pValue < 0.01) stars = '**';
      else if (pValue < 0.05) stars = '*';
      else if (pValue < 0.1) stars = '.';

      return {
        variable: label,
        estimate: estimate,
        stdError: isNaN(stdError) ? 0 : stdError,
        tStat: isNaN(zStat) ? 0 : zStat,
        pValue: isNaN(pValue) ? 1 : pValue,
        confLow: isNaN(stdError) ? 0 : estimate - tCrit * stdError,
        confHigh: isNaN(stdError) ? 0 : estimate + tCrit * stdError,
        ciLower: isNaN(stdError) ? 'NaN' : (estimate - tCrit * stdError).toFixed(4),
        ciUpper: isNaN(stdError) ? 'NaN' : (estimate + tCrit * stdError).toFixed(4),
        stars
      };
    });

    const residuals = Y.map((val, i) => val - (p[i] ?? 0.5));
    const aic = -2 * logLikelihood + 2 * k;
    const bic = -2 * logLikelihood + k * Math.log(n);

    return {
      coefficients,
      rSquared: pseudoR2, // Reported as Pseudo R^2
      adjRSquared: adjPseudoR2, // McFadden pseudo adjusted
      logLikelihood,
      n,
      df: n - k,
      rmse: Math.sqrt(residuals.reduce((s, r) => s + r * r, 0) / (n - k)),
      aic,
      bic,
      isRobust: false,
      residuals
    };
  }

  if (modelType === 'Panel FE') {
    if (!entityVar) throw new Error("Entity identifier variable is required for Panel FE.");
    
    // Within Estimator (De-meaning by entity)
    const entities = Array.from(new Set(cleanData.map(row => row[entityVar] ?? '')));
    
    // Compute entity means
    const entityMeans: Record<string, Record<string, number>> = {};
    entities.forEach(ent => {
      const entRows = cleanData.filter(row => row[entityVar] === ent);
      const means: Record<string, number> = {};
      [yVar, ...xVars].forEach(v => {
        means[v] = entRows.reduce((sum, r) => sum + parseFloat(r[v] ?? '0'), 0) / (entRows.length || 1);
      });
      entityMeans[ent] = means;
    });

    // Quasi-de-mean the variables
    const Y_de = cleanData.map(row => {
      const ent = row[entityVar] ?? '';
      return parseFloat(row[yVar] ?? '0') - (entityMeans[ent]?.[yVar] ?? 0);
    });

    const X_de = cleanData.map(row => {
      const ent = row[entityVar] ?? '';
      return xVars.map(v => parseFloat(row[v] ?? '0') - (entityMeans[ent]?.[v] ?? 0));
    });

    const k = xVars.length;

    // Rank-revealing QR. The within transformation leaves floating-point noise in
    // collinear columns, so the default 1e-15 tolerance fails to detect exact
    // collinearity and returns an arbitrary split across the dependent columns.
    const qrFE = solveQR(X_de, Y_de, xVars, 1e-10);
    const betaFE = qrFE.beta;
    const XtX_inv = qrFE.XtX_inv;
    const droppedFE = qrFE.droppedVariables;
    const rankFE = qrFE.activeIndices.length;

    // df must reflect the estimated rank, not the requested regressor count
    const df = n - entities.length - rankFE;

    // Fitted values & residuals
    const Y_hat = math.multiply(X_de as any, betaFE as any) as any as number[];
    const residuals = Y_de.map((val, i) => val - (Y_hat[i] ?? 0));

    const rss = residuals.reduce((sum, r) => sum + r * r, 0);
    const yMean = Y_de.reduce((sum, v) => sum + v, 0) / n;
    const tss = Y_de.reduce((sum, v) => sum + (v - yMean) ** 2, 0);
    const rSquared = 1 - rss / tss;
    const adjRSquared = 1 - (rss / df) / (tss / (n - 1));
    const rmse = Math.sqrt(rss / df);

    const varCovBase = math.multiply(XtX_inv, rss / df) as number[][];
    let varCov = varCovBase;

    // Calculate average intercept (mean of individual effects)
    const yMeanOrig = cleanData.reduce((s, r) => s + parseFloat(r[yVar] ?? '0'), 0) / n;
    const xMeansOrig = xVars.map(v => cleanData.reduce((s, r) => s + parseFloat(r[v] ?? '0'), 0) / n);
    const avgIntercept = yMeanOrig - xMeansOrig.reduce((sum, mx, i) => sum + mx * (betaFE[i] ?? 0), 0);

    if (clusterVar) {
      const clusters = Array.from(new Set(cleanData.map(r => r[clusterVar])));
      const G = math.zeros(clusters.length, k) as any;
      clusters.forEach((clusterId, g) => {
        const clusterIndices: number[] = [];
        for (let i = 0; i < cleanData.length; i++) {
          if (cleanData[i]?.[clusterVar] === clusterId) clusterIndices.push(i);
        }
        let sum_ei_xi = math.zeros(k) as any;
        clusterIndices.forEach(idx => {
          const xi = X_de[idx];
          const ei = residuals[idx] ?? 0;
          if (xi) {
            sum_ei_xi = math.add(sum_ei_xi, math.multiply(xi as any, ei as any)) as any;
          }
        });
        for (let j = 0; j < k; j++) G.set([g, j], sum_ei_xi.get([j]) ?? 0);
      });
      const Gt = math.transpose(G);
      const Meat = math.multiply(Gt, G);
      // linearmodels debiased convention: c = G/(G-1) * (N-1)/(N - k_within)
      const kWithin = xVars.length + 1; // within regressors + intercept
      const correction = (clusters.length / (clusters.length - 1)) * ((n - 1) / (n - kWithin));
      const MeatCorrected = math.multiply(Meat, correction);
      const temp = math.multiply(XtX_inv, MeatCorrected);
      const mCov = math.multiply(temp, XtX_inv) as any;
      varCov = mCov.toArray ? mCov.toArray() : mCov;
    }

    const coefficients = xVars.map((label, i) => {
      const estimate = betaFE[i] ?? 0;
      const stdError = Math.sqrt(varCov[i]?.[i] ?? 0);
      const tStat = stdError !== 0 ? estimate / stdError : 0;
      const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));
      const tCrit = jStat.studentt.inv(0.975, df);
      
      let stars = '';
      if (pValue < 0.001) stars = '***';
      else if (pValue < 0.01) stars = '**';
      else if (pValue < 0.05) stars = '*';
      else if (pValue < 0.1) stars = '.';

      return {
        variable: label,
        estimate: estimate,
        stdError: stdError,
        tStat: tStat,
        pValue: pValue,
        confLow: estimate - tCrit * stdError,
        confHigh: estimate + tCrit * stdError,
        ciLower: (estimate - tCrit * stdError).toFixed(4),
        ciUpper: (estimate + tCrit * stdError).toFixed(4),
        stars
      };
    });

    // Intercept SE via delta method: Var(â) = σ²/N + x̄' V(β̂) x̄
    const sigma2FE = rss / df;
    const xVx = xMeansOrig.reduce((acc, mi, i) =>
      acc + xMeansOrig.reduce((inner, mj, j) =>
        inner + mi * (varCov[i]?.[j] ?? 0) * mj, 0), 0);
    const interceptSE = Math.sqrt(Math.max(sigma2FE / n + xVx, 0));
    const interceptT = interceptSE > 0 ? avgIntercept / interceptSE : NaN;
    const interceptP = interceptSE > 0
      ? 2 * (1 - jStat.studentt.cdf(Math.abs(interceptT), df))
      : NaN;
    const tCritInt = jStat.studentt.inv(0.975, df);

    let interceptStars = '';
    if (interceptP < 0.001) interceptStars = '***';
    else if (interceptP < 0.01) interceptStars = '**';
    else if (interceptP < 0.05) interceptStars = '*';
    else if (interceptP < 0.1) interceptStars = '.';

    coefficients.unshift({
      variable: 'Intercept',
      estimate: avgIntercept,
      stdError: interceptSE,
      tStat: interceptT,
      pValue: interceptP,
      confLow: avgIntercept - tCritInt * interceptSE,
      confHigh: avgIntercept + tCritInt * interceptSE,
      ciLower: (avgIntercept - tCritInt * interceptSE).toFixed(4),
      ciUpper: (avgIntercept + tCritInt * interceptSE).toFixed(4),
      stars: interceptStars
    });

    return {
      coefficients,
      rSquared,
      adjRSquared,
      n,
      df,
      rmse,
      rss,
      isRobust: false,
      residuals,
      droppedVariables: droppedFE
    };
  }

  if (modelType === 'Panel RE') {
    if (!entityVar) throw new Error("Entity identifier variable is required for Panel RE.");
    
    // Panel RE GLS estimation
    // To implement a standard Swamy-Arora RE model:
    // We compute within error variance (sigma_e^2) and between error variance (sigma_u^2).
    // Then theta is computed: theta = 1 - sqrt(sigma_e^2 / (sigma_e^2 + T * sigma_u^2)).
    const entities = Array.from(new Set(cleanData.map(row => row[entityVar] ?? '')));
    const T = n / (entities.length || 1); // Average time-periods

    // Let's run a simple OLS on de-meaned FE first to get sigma_e^2
    const entityMeans: Record<string, Record<string, number>> = {};
    entities.forEach(ent => {
      const entRows = cleanData.filter(row => row[entityVar] === ent);
      const means: Record<string, number> = {};
      [yVar, ...xVars].forEach(v => {
        means[v] = entRows.reduce((sum, r) => sum + parseFloat(r[v] ?? '0'), 0) / (entRows.length || 1);
      });
      entityMeans[ent] = means;
    });

    const Y_de = cleanData.map(row => parseFloat(row[yVar] ?? '0') - (entityMeans[row[entityVar] ?? '']?.[yVar] ?? 0));
    const X_de = cleanData.map(row => xVars.map(v => parseFloat(row[v] ?? '0') - (entityMeans[row[entityVar] ?? '']?.[v] ?? 0)));
    
    const k_fe = xVars.length;
    const qrFE = solveQR(X_de, Y_de, xVars);
    const betaFE = qrFE.beta;
    const hatY_fe = math.multiply(X_de as any, betaFE as any) as any as number[];
    const resFE = Y_de.map((val, i) => val - (hatY_fe[i] ?? 0));
    const rssFE = resFE.reduce((s, r) => s + r * r, 0);
    const sigma_e_sq = rssFE / Math.max(1, n - entities.length - k_fe);

    // Let's run Between regression (OLS on means) to get Between residuals
    const BetweenY = entities.map(ent => entityMeans[ent]?.[yVar] ?? 0);
    const BetweenX = entities.map(ent => {
      const vals = xVars.map(v => entityMeans[ent]?.[v] ?? 0);
      return includeIntercept ? [1, ...vals] : vals;
    });
    const labelsBetween = includeIntercept ? ['Intercept', ...xVars] : xVars;

    if (BetweenX.length === 0 || !BetweenX[0]) {
      throw new Error("Empty dataset for Between regression.");
    }
    const k_between = BetweenX[0].length;
    const qrBetween = solveQR(BetweenX, BetweenY, labelsBetween);
    const betaBetween = qrBetween.beta;
    const hatY_between = math.multiply(BetweenX as any, betaBetween as any) as any as number[];
    const resBetween = BetweenY.map((val, i) => val - (hatY_between[i] ?? 0));
    const rssBetween = resBetween.reduce((s, r) => s + r * r, 0);
    const sigma_between_sq = rssBetween / Math.max(1, entities.length - k_between);

    // Theta Swamy-Arora
    const sigma_u_sq = Math.max(1e-6, sigma_between_sq - sigma_e_sq / T);
    const theta = 1 - Math.sqrt(sigma_e_sq / (sigma_e_sq + T * sigma_u_sq));

    // Quasi-de-mean the data: w_it* = w_it - theta * bar(w)_i
    const Y_re = cleanData.map(row => {
      const ent = row[entityVar] ?? '';
      return parseFloat(row[yVar] ?? '0') - theta * (entityMeans[ent]?.[yVar] ?? 0);
    });

    const X_re = cleanData.map(row => {
      const ent = row[entityVar] ?? '';
      const rowVals = xVars.map(v => parseFloat(row[v] ?? '0') - theta * (entityMeans[ent]?.[v] ?? 0));
      return includeIntercept ? [1 - theta, ...rowVals] : rowVals;
    });

    const labels = includeIntercept ? ['Intercept', ...xVars] : xVars;

    if (X_re.length === 0 || !X_re[0]) {
      throw new Error("Empty dataset for Random Effects.");
    }
    const k = X_re[0].length;
    const qrRE = solveQR(X_re, Y_re, labels);
    const betaRE = qrRE.beta;
    const XtX_re_inv = qrRE.XtX_inv;

    // residuals on quasi-demeaned model
    const Y_hat = math.multiply(X_re as any, betaRE as any) as any as number[];
    const residuals = Y_re.map((val, i) => val - (Y_hat[i] ?? 0));
    const rss = residuals.reduce((sum, r) => sum + r * r, 0);

    const yMean = Y_re.reduce((sum, v) => sum + v, 0) / n;
    const tss = Y_re.reduce((sum, v) => sum + (v - yMean) ** 2, 0);
    const rSquared = 1 - rss / tss;
    const adjRSquared = 1 - (rss / (n - k)) / (tss / (n - 1));
    const rmse = Math.sqrt(rss / (n - k));

    const varCov = math.multiply(XtX_re_inv, rss / (n - k)) as number[][];

    const coefficients = labels.map((label, i) => {
      const estimate = betaRE[i] ?? 0;
      const stdError = Math.sqrt(varCov[i]?.[i] ?? 0);
      const tStat = stdError !== 0 ? estimate / stdError : 0;
      const df = n - k;
      const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));
      const tCrit = jStat.studentt.inv(0.975, df);
      
      let stars = '';
      if (pValue < 0.001) stars = '***';
      else if (pValue < 0.01) stars = '**';
      else if (pValue < 0.05) stars = '*';
      else if (pValue < 0.1) stars = '.';

      return {
        variable: label,
        estimate: estimate,
        stdError: stdError,
        tStat: tStat,
        pValue: pValue,
        confLow: estimate - tCrit * stdError,
        confHigh: estimate + tCrit * stdError,
        ciLower: (estimate - tCrit * stdError).toFixed(4),
        ciUpper: (estimate + tCrit * stdError).toFixed(4),
        stars
      };
    });

    return {
      coefficients,
      rSquared,
      adjRSquared,
      n,
      df: n - k,
      rmse,
      rss,
      isRobust: false,
      residuals
    };
  }

  if (modelType === 'IV') {
    if (!endogenousVar || !instruments || instruments.length === 0) {
      throw new Error("Endogenous regressor and at least one instrumental variable (IV) are required.");
    }

    // 2-Stage Least Squares (2SLS)
    const exoRegressors = xVars.filter(v => v !== endogenousVar);
    
    // First Stage: regress endogenous variable X_endo on instruments Z and exogenous variables X_exo
    // Regressors for Stage 1: [Intercept, ...exoRegressors, ...instruments]
    const Y1 = cleanData.map(row => parseFloat(row[endogenousVar] ?? '0'));
    const X1 = cleanData.map(row => {
      const exoVals = exoRegressors.map(v => parseFloat(row[v] ?? '0'));
      const instVals = instruments.map(v => parseFloat(row[v] ?? '0'));
      return includeIntercept ? [1, ...exoVals, ...instVals] : [...exoVals, ...instVals];
    });

    const labels1 = includeIntercept ? ['Intercept', ...exoRegressors, ...instruments] : [...exoRegressors, ...instruments];
    
    if (X1.length === 0 || !X1[0]) {
      throw new Error("Empty dataset for IV first stage.");
    }
    const k1 = X1[0].length;
    const qr1 = solveQR(X1, Y1, labels1);
    const beta1 = qr1.beta;
    const fittedX_endo = math.multiply(X1 as any, beta1 as any) as any as number[];

    // Second Stage: regress Y on fitted endogenous variable and exogenous variables
    const Y2 = cleanData.map(row => parseFloat(row[yVar] ?? '0'));
    const X2_fitted = cleanData.map((row, i) => {
      const exoVals = exoRegressors.map(v => parseFloat(row[v] ?? '0'));
      return includeIntercept ? [1, fittedX_endo[i] ?? 0, ...exoVals] : [fittedX_endo[i] ?? 0, ...exoVals];
    });

    const labels = includeIntercept ? ['Intercept', endogenousVar, ...exoRegressors] : [endogenousVar, ...exoRegressors];
    const qr2 = solveQR(X2_fitted, Y2, labels);
    const beta2 = qr2.beta;
    const XtX2_fit_inv = qr2.XtX_inv;

    // IMPORTANT: standard errors must be computed using original endogenous variable
    const X2_original = cleanData.map(row => {
      const endoVal = parseFloat(row[endogenousVar] ?? '0');
      const exoVals = exoRegressors.map(v => parseFloat(row[v] ?? '0'));
      return includeIntercept ? [1, endoVal, ...exoVals] : [endoVal, ...exoVals];
    });

    const Y_hat = math.multiply(X2_original as any, beta2 as any) as any as number[];
    const residuals = Y2.map((val, i) => val - (Y_hat[i] ?? 0));
    const rss = residuals.reduce((sum, r) => sum + r * r, 0);

    if (X2_original.length === 0 || !X2_original[0]) {
      throw new Error("Empty dataset for IV second stage.");
    }
    const k2 = X2_original[0].length;
    const rmse = Math.sqrt(rss / (n - k2));
    const varCov = math.multiply(XtX2_fit_inv, rss / (n - k2)) as number[][];

    const yMean = Y2.reduce((sum, v) => sum + v, 0) / n;
    const tss = Y2.reduce((sum, v) => sum + (v - yMean) ** 2, 0);
    const rSquared = 1 - rss / tss;
    const adjRSquared = 1 - (rss / (n - k2)) / (tss / (n - 1));

    const coefficients = labels.map((label, i) => {
      const estimate = beta2[i] ?? 0;
      const stdError = Math.sqrt(varCov[i]?.[i] ?? 0);
      const tStat = stdError !== 0 ? estimate / stdError : 0;
      const df = n - k2;
      const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));
      const tCrit = jStat.studentt.inv(0.975, df);
      
      let stars = '';
      if (pValue < 0.001) stars = '***';
      else if (pValue < 0.01) stars = '**';
      else if (pValue < 0.05) stars = '*';
      else if (pValue < 0.1) stars = '.';

      return {
        variable: label,
        estimate: estimate,
        stdError: stdError,
        tStat: tStat,
        pValue: pValue,
        confLow: estimate - tCrit * stdError,
        confHigh: estimate + tCrit * stdError,
        ciLower: (estimate - tCrit * stdError).toFixed(4),
        ciUpper: (estimate + tCrit * stdError).toFixed(4),
        stars
      };
    });

    return {
      coefficients,
      rSquared,
      adjRSquared,
      n,
      df: n - k2,
      rmse,
      rss,
      isRobust: false,
      residuals
    };
  }

  if (modelType === 'DiD') {
    if (!treatedVar || !postVar) {
      throw new Error("Treated group indicator and post-treatment indicator are required for DiD.");
    }

    // Difference-in-Differences
    // regress Y on Treated, Post, Treated * Post, and other control covariates
    const getBinaryValues = (varName: string) => {
      const vals = cleanData.map(row => {
        const val = row[varName];
        if (val === undefined || val === null || val === "") {
          throw new Error(`Variable '${varName}' contains missing values in the estimation sample.`);
        }
        const num = parseFloat(val);
        if (isNaN(num)) {
          throw new Error(`The DiD variable '${varName}' contains non-numeric/string values. DiD variables must be numeric binary indicators (0/1 or 1/2).`);
        }
        return num;
      });
      const uniqueVals = Array.from(new Set(vals)).sort((a, b) => a - b);
      if (uniqueVals.length !== 2) {
        throw new Error(`The DiD variable '${varName}' must be binary (have exactly 2 unique values). It has ${uniqueVals.length} unique values.`);
      }
      return { uniqueVals, vals };
    };

    const trData = getBinaryValues(treatedVar);
    const poData = getBinaryValues(postVar);

    const Y = cleanData.map(row => parseFloat(row[yVar]));
    const X = cleanData.map((row, idx) => {
      const tr = trData.vals[idx] === trData.uniqueVals[1] ? 1 : 0;
      const po = poData.vals[idx] === poData.uniqueVals[1] ? 1 : 0;
      const inter = tr * po;
      const controls = xVars.filter(v => v !== treatedVar && v !== postVar).map(v => parseFloat(row[v]));
      return includeIntercept ? [1, tr, po, inter, ...controls] : [tr, po, inter, ...controls];
    });

    const controlsNames = xVars.filter(v => v !== treatedVar && v !== postVar);
    const labels = includeIntercept 
      ? ['Intercept', treatedVar, postVar, `${treatedVar} × ${postVar} (DiD)`, ...controlsNames]
      : [treatedVar, postVar, `${treatedVar} × ${postVar} (DiD)`, ...controlsNames];

    if (X.length === 0 || !X[0]) {
      throw new Error('No valid observations for DiD.');
    }
    const k = X[0].length;
    const qrDiD = solveQR(X, Y, labels);
    const betaDiD = qrDiD.beta;
    const XtX_inv = qrDiD.XtX_inv;

    const Y_hat = math.multiply(X, betaDiD) as any as number[];
    const residuals = Y.map((val, i) => val - (Y_hat[i] ?? 0));
    const rss = residuals.reduce((sum, r) => sum + r * r, 0);

    const yMean = Y.reduce((sum, v) => sum + v, 0) / n;
    const tss = Y.reduce((sum, v) => sum + (v - yMean) ** 2, 0);
    const rSquared = 1 - rss / tss;
    const adjRSquared = 1 - (rss / (n - k)) / (tss / (n - 1));
    const rmse = Math.sqrt(rss / (n - k));

    const varCov = math.multiply(XtX_inv, rss / (n - k)) as number[][];

    const coefficients = labels.map((label, i) => {
      const estimate = betaDiD[i] ?? 0;
      const stdError = Math.sqrt(varCov[i]?.[i] ?? 0);
      const tStat = stdError !== 0 ? estimate / stdError : 0;
      const df = n - k;
      const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));
      const tCrit = jStat.studentt.inv(0.975, df);
      
      let stars = '';
      if (pValue < 0.001) stars = '***';
      else if (pValue < 0.01) stars = '**';
      else if (pValue < 0.05) stars = '*';
      else if (pValue < 0.1) stars = '.';

      return {
        variable: label,
        estimate: estimate,
        stdError: stdError,
        tStat: tStat,
        pValue: pValue,
        confLow: estimate - tCrit * stdError,
        confHigh: estimate + tCrit * stdError,
        ciLower: (estimate - tCrit * stdError).toFixed(4),
        ciUpper: (estimate + tCrit * stdError).toFixed(4),
        stars
      };
    });

    return {
      coefficients,
      rSquared,
      adjRSquared,
      n,
      df: n - k,
      rmse,
      rss,
      isRobust: false,
      residuals
    };
  }

  if (modelType === 'Poisson') {
    return runPoissonMLE(cleanData, yVar, xVars);
  }

  if (modelType === 'Negative Binomial') {
    return runNegBinomialMLE(cleanData, yVar, xVars);
  }

  throw new Error(`Model type ${modelType} is not implemented.`);
}
