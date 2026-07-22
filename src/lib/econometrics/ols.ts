import * as math from 'mathjs';
import jStat from 'jstat';
import { RegressionResult } from '../../types';
import { computeRobustCovariance } from './robust';
import { solveQR } from './estimators';

// B=500 minimum for stable SEs; increase to 1000 for publication-quality results
export function bootstrapOLS(X: number[][], y: number[], B = 500, seed = 42): number[][] {
  if (!X || X.length === 0 || !X[0]) {
    return [];
  }
  let st = seed >>> 0;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };
  const n = X.length;
  const k = X[0].length;
  const bootstrapBetas: number[][] = [];
  
  for (let b = 0; b < B; b++) {
    const subX: number[][] = [];
    const subY: number[] = [];
    for (let i = 0; i < n; i++) {
      const idx = Math.floor(rand() * n);
      const rowX = X[idx];
      const valY = y[idx];
      if (rowX && valY !== undefined) {
        subX.push(rowX);
        subY.push(valY);
      }
    }
    
    try {
      const qrRes = solveQR(subX, subY);
      bootstrapBetas.push(qrRes.beta);
    } catch (e) {
      // Skip singular samples
    }
  }
  
  // Variance-Covariance Matrix of betas
  const varCov = Array(k).fill(0).map(() => Array(k).fill(0));
  const means = Array(k).fill(0);
  for (let j = 0; j < k; j++) {
    const jBetas = bootstrapBetas.map(b => b[j] ?? 0);
    means[j] = jBetas.reduce((a, b) => a + b, 0) / (jBetas.length || 1);
  }

  for (let j = 0; j < k; j++) {
    for (let m = 0; m < k; m++) {
      let cov = 0;
      for (let b = 0; b < bootstrapBetas.length; b++) {
        const beta = bootstrapBetas[b];
        if (beta) {
          cov += ((beta[j] ?? 0) - means[j]) * ((beta[m] ?? 0) - means[m]);
        }
      }
      const varCovRow = varCov[j];
      if (varCovRow) {
        varCovRow[m] = cov / Math.max(1, bootstrapBetas.length - 1);
      }
    }
  }
  
  return varCov;
}

export function preprocessDataAndVars(data: any[], yVar: string, xVars: string[]) {
  const isMissing = (v: any) => v === undefined || v === null || v === "" || v === "N/A" || v === "null" || v === "missing";

  // Check yVar
  const yValues = (data || []).map(r => r?.[yVar]).filter(v => !isMissing(v));
  const uniqueY = Array.from(new Set(yValues));
  
  const yNumericCount = yValues.filter(val => !isNaN(Number(val))).length;
  // If we have values and >50% are numeric, treat it as numeric (not categorical)
  const isYCategorical = yValues.length > 0 && (yNumericCount / yValues.length) < 0.5;

  let mappedData = (data || []).map(r => ({ ...r }));
  let finalYVar = yVar;
  
  if (isYCategorical) {
    if (uniqueY.length === 2) {
      const sortedY = [...uniqueY].sort();
      const baseline = sortedY[0];
      finalYVar = `${yVar}_encoded`;
      mappedData = mappedData.map(r => {
        if (isMissing(r[yVar])) {
          r[finalYVar] = null;
        } else {
          r[finalYVar] = r[yVar] === baseline ? 0 : 1;
        }
        return r;
      });
    } else {
      throw new Error(`Dependent variable '${yVar}' is categorical with ${uniqueY.length} levels. OLS requires a continuous or binary dependent variable.`);
    }
  }

  let finalXVars: string[] = [];
  xVars.forEach(v => {
    const xValues = (data || []).map(r => r?.[v]).filter(val => !isMissing(val));
    const uniqueX = Array.from(new Set(xValues));
    
    const xNumericCount = xValues.filter(val => !isNaN(Number(val))).length;
    const isCategoricalString = xValues.length > 0 && (xNumericCount / xValues.length) < 0.5;
    
    // Prevent dummy column explosion by ensuring reasonable cardinality (<= 15 levels and <= 50% of row count)
    if (isCategoricalString) {
      if (uniqueX.length > 15) {
        throw new Error(`Variable '${v}' is a string/categorical variable with ${uniqueX.length} levels (maximum allowed is 15). Please reduce levels or select a different control.`);
      }
      if (uniqueX.length > 1) {
        const sortedCategories = [...uniqueX].sort();
        const otherCategories = sortedCategories.slice(1);
        otherCategories.forEach(cat => {
          const dummyName = `${v}_${cat}`.replace(/[^a-zA-Z0-9_]/g, '_');
          finalXVars.push(dummyName);
          mappedData = mappedData.map(r => {
            if (isMissing(r[v])) {
              r[dummyName] = null;
            } else {
              r[dummyName] = r[v] === cat ? 1 : 0;
            }
            return r;
          });
        });
      } else {
        finalXVars.push(v);
      }
    } else {
      finalXVars.push(v);
    }
  });

  return { mappedData, finalYVar, finalXVars };
}

export function runOLS(
  data: any[],
  yVar: string,
  xVars: string[],
  includeIntercept = true,
  robust = false,
  clusterVar?: string,
  bootstrap: boolean | number = false,
  calculateDiagnostics = true,
  robustType: 'HC0' | 'HC1' | 'HC2' | 'HC3' | 'NW' = 'HC1',
  useWildBootstrap = false,
  wildBootstrapB = 999
): RegressionResult {
  if (bootstrap && (robust || clusterVar)) {
    throw new Error("Bootstrap standard errors cannot be combined with analytical Robust or Clustered standard errors. Please select either Bootstrap or Robust/Cluster SE estimation.");
  }

  // Preprocess for categorical variables
  const { mappedData, finalYVar, finalXVars } = preprocessDataAndVars(data || [], yVar, xVars);

  // Filter out any rows with missing values for selected numeric variables
  const numericVarsToObserve = [finalYVar, ...finalXVars];

  const filteredData = mappedData.filter(row => {
    if (!row) return false;
    const numOk = numericVarsToObserve.every(v => row[v] !== undefined && row[v] !== null && !isNaN(parseFloat(row[v])));
    if (!numOk) return false;
    if (clusterVar && (row[clusterVar] === undefined || row[clusterVar] === null)) return false;
    return true;
  });

  if (filteredData.length < finalXVars.length + 1) {
    throw new Error('Insufficient observations for estimation.');
  }

  const n = filteredData.length;
  const k = finalXVars.length + (includeIntercept ? 1 : 0);

  // Construct Y matrix (n x 1)
  const Y = filteredData.map(row => parseFloat(row[finalYVar]));

  const yMean_check = Y.reduce((sum, val) => sum + val, 0) / n;
  const tss_check = Y.reduce((sum, val) => sum + (val - yMean_check) * (val - yMean_check), 0);
  if (tss_check < 1e-12) {
    throw new Error('The dependent variable has zero variance (is constant across all observations). Estimation is undefined.');
  }

  // Construct X matrix (n x k)
  const X = filteredData.map(row => {
    const rowValues = finalXVars.map(v => parseFloat(row[v]));
    return includeIntercept ? [1, ...rowValues] : rowValues;
  });

  const labels = includeIntercept ? ['Intercept', ...finalXVars] : finalXVars;
  const qrRes = solveQR(X, Y, labels);
  const beta = qrRes.beta;
  const XtX_inv = qrRes.XtX_inv;
  const droppedVariables = qrRes.droppedVariables;

  // Calculate residuals
  const Y_hat = math.multiply(X, beta) as any as number[];
  const residuals = Y.map((val, i) => val - (Y_hat[i] ?? 0));

  // RSS, TSS, RMSE
  const rss = residuals.reduce((sum, res) => sum + res * res, 0);
  const yMean = Y.reduce((sum, val) => sum + val, 0) / n;
  const tss = includeIntercept 
    ? Y.reduce((sum, val) => sum + (val - yMean) * (val - yMean), 0)
    : Y.reduce((sum, val) => sum + val * val, 0);
  const rSquared = 1 - rss / tss;
  const adjRSquared = includeIntercept 
    ? 1 - (rss / (n - k)) / (tss / (n - 1))
    : 1 - (rss / (n - k)) / (tss / n);
  const rmse = Math.sqrt(rss / (n - k));
  const aic = n * Math.log(rss / n) + 2 * k;
  const bic = n * Math.log(rss / n) + k * Math.log(n);

  // Log Likelihood (Assuming normal errors)
  const logLikelihood = -(n / 2) * (1 + Math.log(2 * Math.PI) + Math.log(rss / n));

  // F-Statistic for Joint Significance
  const fNumeratorDf = includeIntercept ? k - 1 : k;
  const fDenominatorDf = n - k;
  const fStat = ((tss - rss) / fNumeratorDf) / (rss / fDenominatorDf);
  const fPValue = 1 - jStat.centralF.cdf(fStat, fNumeratorDf, fDenominatorDf);

  // Variance-Covariance Matrix
  let varCov: number[][];
  if (bootstrap) {
    const B_val = typeof bootstrap === 'number' ? bootstrap : undefined;
    varCov = bootstrapOLS(X, Y, B_val);

  } else if (clusterVar) {
    // Clustered Standard Errors
    const clusters = Array.from(new Set(filteredData.map(r => r[clusterVar])));
    if (clusters.length <= 1) {
      throw new Error("Clustering requires at least 2 distinct clusters.");
    }
    const G = math.zeros(clusters.length, k) as any;
    
    clusters.forEach((clusterId, g) => {
      const clusterIndices = filteredData.reduce((acc, row, i) => {
        if (row[clusterVar] === clusterId) acc.push(i);
        return acc;
      }, [] as number[]);
      
      let sum_ei_xi = math.zeros(k) as any;
      clusterIndices.forEach((idx: number) => {
        const xi = X[idx];
        const ei = residuals[idx] ?? 0;
        if (xi) {
          sum_ei_xi = math.add(sum_ei_xi, math.multiply(xi, ei)) as any;
        }
      });
      
      for (let j = 0; j < k; j++) {
        G.set([g, j], sum_ei_xi.get([j]) ?? 0);
      }
    });

    const Gt = math.transpose(G);
    const Meat = math.multiply(Gt, G);
    const correction = (clusters.length / (clusters.length - 1)) * ((n - 1) / (n - k));
    const MeatCorrected = math.multiply(Meat, correction);
    const temp = math.multiply(XtX_inv, MeatCorrected);
    const mCov = math.multiply(temp, XtX_inv) as any;
    varCov = mCov.toArray ? mCov.toArray() : mCov;

  } else if (robust) {
    varCov = computeRobustCovariance(X, XtX_inv, residuals, robustType);
  } else {
    const sigmaSquared = rss / (n - k);
    varCov = math.multiply(XtX_inv, sigmaSquared) as any;
  }

  // Calculate VIF for each regressor (if > 1 regressor)
  const vifs: { [key: string]: number } = {};
  if (calculateDiagnostics && finalXVars.length > 1) {
    finalXVars.forEach(v => {
      const otherX = finalXVars.filter(ox => ox !== v);
      try {
        const auxRes = runOLS(filteredData, v, otherX, true, false, undefined, false, false);
        vifs[v] = 1 / (1 - Math.min(0.999, auxRes.rSquared));
      } catch (e) {
        vifs[v] = 999;
      }
    });
  }

  // Coefficient Details
  const coefficients: any[] = labels.map((label, i) => {
    const estimate = (beta as any)[i] ?? 0;
    const v = varCov[i]?.[i] ?? 0;
    const stdError = v > 0 ? Math.sqrt(v) : NaN;
    const tStat = isNaN(stdError) || stdError === 0 ? NaN : estimate / stdError;
    
    const df = n - k;
    const pValue = isNaN(tStat) ? NaN : 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));
    const tCrit = jStat.studentt.inv(0.975, df);
    
    return {
      variable: label,
      estimate,
      stdError: isNaN(stdError) ? 0 : stdError,
      tStat: isNaN(tStat) ? 0 : tStat,
      pValue: isNaN(pValue) ? 1 : pValue,
      confLow: isNaN(stdError) ? 0 : estimate - tCrit * stdError,
      confHigh: isNaN(stdError) ? 0 : estimate + tCrit * stdError,
      vif: vifs[label]
    };
  });

  let wildBootstrapResults: any = undefined;
  if (useWildBootstrap && clusterVar) {
    try {
      const clusterIds = filteredData.map(r => r[clusterVar]);
      const betaArr = Array.from(beta as any) as number[];
      const varCovArr = (varCov as any).toArray ? (varCov as any).toArray() : varCov;
      const XtX_inv_arr = (XtX_inv as any).toArray ? (XtX_inv as any).toArray() : XtX_inv;
      wildBootstrapResults = wildBootstrapClusteredSE(X, Y, clusterIds, betaArr, varCovArr, XtX_inv_arr, wildBootstrapB);
      
      // Update each coefficient with wild bootstrap metrics
      coefficients.forEach((coef, idx) => {
        if (wildBootstrapResults && wildBootstrapResults.wild_bootstrap_pvalues[idx] !== undefined) {
          coef.wildBootstrapPValue = wildBootstrapResults.wild_bootstrap_pvalues[idx];
          coef.wildBootstrapConfLow = wildBootstrapResults.wild_bootstrap_ci_low[idx];
          coef.wildBootstrapConfHigh = wildBootstrapResults.wild_bootstrap_ci_high[idx];
        }
      });
    } catch (e) {
      console.error("Wild bootstrap failed:", e);
    }
  }

  // Mathematically Accurate Diagnostics Computation
  let durbinWatson = NaN;
  let jarqueBeraStat = NaN;
  let jarqueBeraPValue = NaN;
  let breuschPaganStat = NaN;
  let breuschPaganPValue = NaN;

  if (calculateDiagnostics) {
    let dwNumerator = 0;
    let dwDenominator = 0;
    for (let i = 0; i < n; i++) {
      const resVal = residuals[i] ?? 0;
      dwDenominator += resVal * resVal;
      if (i > 0) {
        const diff = resVal - (residuals[i - 1] ?? 0);
        dwNumerator += diff * diff;
      }
    }
    durbinWatson = dwDenominator > 0 ? dwNumerator / dwDenominator : 2;

    const meanRes = residuals.reduce((a, b) => a + b, 0) / n;
    const varRes = residuals.reduce((sum, val) => sum + (val - meanRes) ** 2, 0) / n;
    let skewness = 0;
    let kurtosis = 3;
    if (varRes > 0) {
      const sumCubed = residuals.reduce((sum, val) => sum + (val - meanRes) ** 3, 0);
      const sumFourth = residuals.reduce((sum, val) => sum + (val - meanRes) ** 4, 0);
      skewness = (sumCubed / n) / (varRes ** 1.5);
      kurtosis = (sumFourth / n) / (varRes ** 2);
    }
    jarqueBeraStat = (n / 6) * (skewness * skewness + ((kurtosis - 3) * (kurtosis - 3)) / 4);
    jarqueBeraPValue = 1 - jStat.chisquare.cdf(jarqueBeraStat, 2);

    if (finalXVars.length > 0) {
      try {
        const sqResiduals = residuals.map(r => r * r);
        const auxData = filteredData.map((row, idx) => ({ ...row, _sq_res: sqResiduals[idx] ?? 0 }));
        const auxRes = runOLS(
          auxData,
          '_sq_res',
          finalXVars,
          includeIntercept,
          false,
          undefined,
          false,
          false
        );
        breuschPaganStat = n * auxRes.rSquared;
        const dfBP = finalXVars.length;
        breuschPaganPValue = 1 - jStat.chisquare.cdf(breuschPaganStat, dfBP);
      } catch (e) {
      }
    }
  }

  const seType = clusterVar 
    ? "Clustered SE" 
    : (bootstrap 
      ? "Bootstrap SE" 
      : (robust 
        ? `Robust SE (${robustType})` 
        : "Classical SE"));

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
    isRobust: robust,
    seType,
    robustType: robust ? robustType : undefined,
    vifs,
    residuals,
    fitted: Y_hat,
    yActual: Y,
    durbinWatson,
    jarqueBeraStat,
    jarqueBeraPValue,
    breuschPaganStat,
    breuschPaganPValue,
    varCov,
    wildBootstrapResults,
    droppedVariables
  };
}

// normalCDF removed as we use jStat now

export function mulMatrices(A: number[][], B: number[][]): number[][] {
  if (A.length === 0 || !A[0] || B.length === 0 || !B[0]) return [];
  const rA = A.length;
  const cA = A[0].length;
  const cB = B[0].length;
  const out = Array(rA).fill(0).map(() => Array(cB).fill(0));
  for (let i = 0; i < rA; i++) {
    const rowA = A[i];
    const rowOut = out[i];
    if (!rowA || !rowOut) continue;
    for (let j = 0; j < cB; j++) {
      let s = 0;
      for (let m = 0; m < cA; m++) {
        s += (rowA[m] ?? 0) * (B[m]?.[j] ?? 0);
      }
      rowOut[j] = s;
    }
  }
  return out;
}

export function wildBootstrapClusteredSE(
  X: number[][],
  y: number[],
  clusterIds: any[],
  beta_hat: number[],
  varCov: number[][],
  XtX_inv_arr: number[][],
  B = 999,
  seed = 42
) {
  if (!X || X.length === 0 || !X[0]) {
    return {
      wild_bootstrap_pvalues: [],
      wild_bootstrap_ci_low: [],
      wild_bootstrap_ci_high: [],
      n_clusters: 0,
      B
    };
  }
  const n = X.length;
  const k = X[0].length;

  const Xt = math.transpose(X);
  const Xt_arr = (Xt as any).toArray ? (Xt as any).toArray() : Xt;

  const H_matrix = mulMatrices(XtX_inv_arr, Xt_arr);

  const Y_hat = math.multiply(X, beta_hat) as number[];
  const residuals = y.map((val, i) => val - (Y_hat[i] ?? 0));

  const uniqueClusters = Array.from(new Set(clusterIds));
  const numClusters = uniqueClusters.length;
  const clusterToIndexMap = new Map<any, number>();
  uniqueClusters.forEach((id, idx) => clusterToIndexMap.set(id, idx));
  const obsClusterIndex = clusterIds.map(id => clusterToIndexMap.get(id) ?? 0);

  const clusterIndices: number[][] = Array(numClusters).fill(0).map(() => []);
  for (let i = 0; i < n; i++) {
    const clusterIdx = obsClusterIndex[i];
    if (clusterIdx !== undefined && clusterIndices[clusterIdx]) {
      clusterIndices[clusterIdx].push(i);
    }
  }

  // Pre-allocate bootstrap arrays for each coefficient
  const bootstrapTStats: number[][] = Array(k).fill(0).map(() => []);
  const bootstrapBetas: number[][] = Array(k).fill(0).map(() => []);

  let st = seed >>> 0;
  const rand = () => { st = (st * 1664525 + 1013904223) >>> 0; return st / 4294967296; };

  // For each bootstrap iteration
  for (let b = 0; b < B; b++) {
    // Draw Rademacher weights for each cluster
    const vg = Array(numClusters);
    for (let g = 0; g < numClusters; g++) {
      vg[g] = rand() < 0.5 ? -1 : 1;
    }

    // Create wild residuals and Y_star
    const Y_star = Array(n);
    for (let i = 0; i < n; i++) {
      const wild_res = (residuals[i] ?? 0) * (vg[obsClusterIndex[i] ?? 0] ?? 1);
      Y_star[i] = (Y_hat[i] ?? 0) + wild_res;
    }

    // Compute beta_hat_star_b = H_matrix * Y_star
    const beta_hat_star_b = Array(k).fill(0);
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) {
        s += (H_matrix[j]?.[i] ?? 0) * (Y_star[i] ?? 0);
      }
      beta_hat_star_b[j] = s;
    }

    // Compute Y_hat_star_b and residuals_star_b
    const Y_hat_star_b = Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      const xi = X[i];
      if (xi) {
        for (let j = 0; j < k; j++) {
          s += (xi[j] ?? 0) * beta_hat_star_b[j];
        }
      }
      Y_hat_star_b[i] = s;
    }

    const residuals_star_b = Array(n);
    for (let i = 0; i < n; i++) {
      residuals_star_b[i] = (Y_star[i] ?? 0) - (Y_hat_star_b[i] ?? 0);
    }

    // Compute G matrix (numClusters x k) for cluster standard errors
    const G = Array(numClusters).fill(0).map(() => new Float64Array(k));
    for (let g = 0; g < numClusters; g++) {
      const indices = clusterIndices[g] ?? [];
      const sum_ei_xi = G[g];
      if (sum_ei_xi) {
        for (let idx = 0; idx < indices.length; idx++) {
          const obsIdx = indices[idx];
          if (obsIdx !== undefined) {
            const xi = X[obsIdx];
            const ei = residuals_star_b[obsIdx] ?? 0;
            if (xi) {
              for (let j = 0; j < k; j++) {
                sum_ei_xi[j] = (sum_ei_xi[j] ?? 0) + (xi[j] ?? 0) * ei;
              }
            }
          }
        }
      }
    }

    // Compute Meat = G'G
    const Meat = Array(k).fill(0).map(() => new Float64Array(k));
    for (let r = 0; r < k; r++) {
      for (let c = 0; c < k; c++) {
        let sum = 0;
        for (let g = 0; g < numClusters; g++) {
          sum += (G[g]?.[r] ?? 0) * (G[g]?.[c] ?? 0);
        }
        const meatRow = Meat[r];
        if (meatRow) {
          meatRow[c] = sum;
        }
      }
    }

    const correction = (numClusters / (numClusters - 1)) * ((n - 1) / (n - k));
    const MeatCorrected = Meat.map(row => Array.from(row).map(v => v * correction));
    const tempMatrix = mulMatrices(XtX_inv_arr, MeatCorrected);
    const varCov_b = mulMatrices(tempMatrix, XtX_inv_arr);

    // Compute t-statistics and store
    for (let j = 0; j < k; j++) {
      const varCovRow = varCov_b[j];
      const se_b = Math.sqrt(varCovRow?.[j] ?? 0) || 1e-10;
      const t_star_bj = ((beta_hat_star_b[j] ?? 0) - (beta_hat[j] ?? 0)) / se_b;
      bootstrapTStats[j]?.push(t_star_bj);
      bootstrapBetas[j]?.push(beta_hat_star_b[j] ?? 0);
    }
  }

  // Calculate p-values and confidence intervals
  const wild_bootstrap_pvalues: number[] = [];
  const wild_bootstrap_ci_low: number[] = [];
  const wild_bootstrap_ci_high: number[] = [];

  for (let j = 0; j < k; j++) {
    const varCovRow = varCov?.[j];
    const se = Math.sqrt(varCovRow?.[j] ?? 0) || 1e-10;
    const t_j = (beta_hat[j] ?? 0) / se;

    // Proportion of |t*_bj| > |t_j|
    let count = 0;
    const abs_t_j = Math.abs(t_j);
    const tStats_j = bootstrapTStats[j] ?? [];
    for (let b = 0; b < B; b++) {
      if (Math.abs(tStats_j[b] ?? 0) > abs_t_j) {
        count++;
      }
    }
    const p_value = count / B;
    wild_bootstrap_pvalues.push(p_value);

    // Percentiles of beta_hat_star_bj
    const sortedBetas_j = [...(bootstrapBetas[j] ?? [])].sort((a, b) => a - b);
    const lowIdx = Math.floor(0.025 * B);
    const highIdx = Math.min(B - 1, Math.ceil(0.975 * B) - 1);
    wild_bootstrap_ci_low.push(sortedBetas_j[lowIdx] ?? 0);
    wild_bootstrap_ci_high.push(sortedBetas_j[highIdx] ?? 0);
  }

  return {
    wild_bootstrap_pvalues,
    wild_bootstrap_ci_low,
    wild_bootstrap_ci_high,
    n_clusters: numClusters,
    B
  };
}
