import { runOLS } from './ols';

/**
 * Sharp Regression Discontinuity via local linear regression.
 *
 * Specification: Y ~ D + (X - c) + D*(X - c), estimated on observations within
 * `bandwidth` of the cutoff, with a UNIFORM kernel (every included observation
 * weighted equally).
 *
 * IMPORTANT — this does not replicate Stata's `rdrobust` or R's rdrobust package.
 * Those use an MSE-optimal bandwidth selector (IK / CCT), a triangular kernel, and
 * a bias-corrected point estimate with robust confidence intervals. Estimates here
 * will differ, and the difference is driven mainly by the bandwidth. Report the
 * bandwidth and selector alongside any estimate, and prefer supplying an explicit
 * `bandwidthOverride` when you need results comparable to another package.
 *
 * @param bandwidthOverride Explicit bandwidth. When omitted, a Silverman
 *   rule-of-thumb value is used, which is NOT an RDD-optimal selector.
 */
export function runSharpRDD(
  data: any[],
  yVar: string,
  xVar: string,
  cutoff: number,
  bandwidthOverride?: number
) {
  // Filter out missing data
  const filteredData = (data || []).filter(row => {
    return row && row[yVar] !== undefined && row[yVar] !== null && !isNaN(parseFloat(row[yVar])) &&
           row[xVar] !== undefined && row[xVar] !== null && !isNaN(parseFloat(row[xVar]));
  });

  if (filteredData.length < 5) {
    throw new Error('Insufficient observations for RDD estimation.');
  }

  // Calculate bandwidth using standard deviation of forcing variable (Silverman rule of thumb)
  const xValues = filteredData.map(r => parseFloat(r[xVar]));
  const meanX = xValues.reduce((sum, val) => sum + val, 0) / xValues.length;
  const varianceX = xValues.reduce((sum, val) => sum + Math.pow(val - meanX, 2), 0) / (xValues.length - 1);
  const stdX = Math.sqrt(varianceX) || 1.0;
  
  // NOTE: Silverman's rule is a kernel-DENSITY selector, not an RDD MSE-optimal
  // selector. It is retained only as a fallback default; see the function docblock.
  const silvermanBandwidth = 1.06 * stdX * Math.pow(filteredData.length, -0.2);

  let bandwidth = silvermanBandwidth;
  let bandwidthSelector: 'user-specified' | 'silverman-rule-of-thumb' = 'silverman-rule-of-thumb';

  if (bandwidthOverride !== undefined && bandwidthOverride !== null) {
    if (!Number.isFinite(bandwidthOverride) || bandwidthOverride <= 0) {
      throw new Error(`Invalid bandwidth: ${bandwidthOverride}. Bandwidth must be a positive finite number.`);
    }
    bandwidth = bandwidthOverride;
    bandwidthSelector = 'user-specified';
  }

  // Filter observations within bandwidth of cutoff
  const localData = filteredData.filter(row => {
    const xVal = parseFloat(row[xVar]);
    return Math.abs(xVal - cutoff) <= bandwidth;
  });

  if (localData.length < 4) {
    throw new Error(`Insufficient observations within local RDD bandwidth (${bandwidth.toFixed(3)}). Please choose a different cutoff or expand the dataset.`);
  }

  // Construct local regression variables
  // D_treatment = 1 if X >= cutoff, 0 otherwise
  // X_tilde = X - cutoff
  // D_X_tilde = D_treatment * X_tilde
  const rddData = localData.map((row, idx) => {
    const xVal = parseFloat(row[xVar]);
    const dVal = xVal >= cutoff ? 1 : 0;
    const xTilde = xVal - cutoff;
    return {
      ...row,
      _rdd_idx: idx,
      _D_treatment: dVal,
      _X_tilde: xTilde,
      _D_X_tilde: dVal * xTilde
    };
  });

  // Run local linear OLS of Y on D_treatment, X_tilde, D_X_tilde
  const xVars = ['_D_treatment', '_X_tilde', '_D_X_tilde'];
  const olsResult = runOLS(rddData, yVar, xVars, true, false);

  // Extract treatment effect coefficient (associated with _D_treatment)
  const treatmentCoef = olsResult.coefficients.find(c => c.variable === '_D_treatment');
  if (!treatmentCoef) {
    throw new Error('Could not identify treatment coefficient from RDD local regression.');
  }

  // Rename variables in coefficients list for academic output
  olsResult.coefficients = olsResult.coefficients.map(c => {
    if (c.variable === '_D_treatment') return { ...c, variable: `Treatment Effect (D_t)` };
    if (c.variable === '_X_tilde') return { ...c, variable: `Forcing Variable (Centered)` };
    if (c.variable === '_D_X_tilde') return { ...c, variable: `Treatment x Forcing Interaction` };
    return c;
  });

  return {
    olsResult,
    rddEstimate: treatmentCoef.estimate,
    rddStdError: treatmentCoef.stdError,
    rddTStat: treatmentCoef.tStat,
    rddPValue: treatmentCoef.pValue,
    bandwidth,
    bandwidthSelector,
    silvermanBandwidth,
    kernel: 'uniform' as const,
    biasCorrected: false,
    methodNote:
      'Local linear RDD, uniform kernel, no bias correction. Bandwidth selector: ' +
      bandwidthSelector +
      '. Not directly comparable to rdrobust (IK/CCT bandwidth, triangular kernel, bias-corrected).',
    cutoff,
    totalObs: filteredData.length,
    includedObs: localData.length
  };
}
