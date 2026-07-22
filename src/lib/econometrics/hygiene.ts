function getCorrelation(arr1: number[], arr2: number[]): number {
  const n = arr1.length;
  if (n < 3) return 0;
  let sum1 = 0;
  let sum2 = 0;
  for (let i = 0; i < n; i++) {
    sum1 += arr1[i] ?? 0;
    sum2 += arr2[i] ?? 0;
  }
  const mean1 = sum1 / n;
  const mean2 = sum2 / n;

  let num = 0;
  let den1 = 0;
  let den2 = 0;
  for (let i = 0; i < n; i++) {
    const val1 = arr1[i] ?? 0;
    const val2 = arr2[i] ?? 0;
    const d1 = val1 - mean1;
    const d2 = val2 - mean2;
    num += d1 * d2;
    den1 += d1 * d1;
    den2 += d2 * d2;
  }
  if (den1 === 0 || den2 === 0) return 0;
  return num / Math.sqrt(den1 * den2);
}

export function getVariableTransformationWarning(
  var1: string,
  var2: string,
  data: any[] = []
): string | null {
  if (!var1 || !var2 || var1 === var2) return null;

  // 1. Name checks as a quick strong indicator
  const clean1 = var1.toLowerCase();
  const clean2 = var2.toLowerCase();
  
  const isLoggedNamePair = (n1: string, n2: string) => {
    return (
      n1 === 'l' + n2 ||
      n1 === 'ln' + n2 ||
      n1 === 'ln_' + n2 ||
      n1 === 'log_' + n2 ||
      n1 === 'log' + n2 ||
      n1 === 'l_' + n2
    );
  };

  const nameMatch = isLoggedNamePair(clean1, clean2) || isLoggedNamePair(clean2, clean1);

  if (nameMatch) {
    return `${var1} and ${var2} are likely the same variable in levels and logs.`;
  }

  if (!data || data.length === 0) return null;

  // 2. Statistical checks (correlation of log pairs)
  const xVals: number[] = [];
  const yVals: number[] = [];

  for (let i = 0; i < data.length; i++) {
    const row = data[i];
    if (row) {
      const val1 = Number(row[var1]);
      const val2 = Number(row[var2]);
      if (!isNaN(val1) && !isNaN(val2) && row[var1] !== null && row[var2] !== null) {
        xVals.push(val1);
        yVals.push(val2);
      }
    }
  }

  if (xVals.length < 5) {
    if (nameMatch) {
      return `${var1} and ${var2} are likely the same variable in levels and logs.`;
    }
    return null;
  }

  const rRaw = Math.abs(getCorrelation(xVals, yVals));

  // Pair 1: ln(X) and Y (for X > 0)
  const lnX: number[] = [];
  const yForLnX: number[] = [];
  for (let i = 0; i < xVals.length; i++) {
    const xv = xVals[i] ?? 0;
    const yv = yVals[i] ?? 0;
    if (xv > 0) {
      lnX.push(Math.log(xv));
      yForLnX.push(yv);
    }
  }
  const rLnX_Y = lnX.length >= 5 ? Math.abs(getCorrelation(lnX, yForLnX)) : 0;

  // Pair 2: X and ln(Y) (for Y > 0)
  const xForLnY: number[] = [];
  const lnY: number[] = [];
  for (let i = 0; i < yVals.length; i++) {
    const xv = xVals[i] ?? 0;
    const yv = yVals[i] ?? 0;
    if (yv > 0) {
      xForLnY.push(xv);
      lnY.push(Math.log(yv));
    }
  }
  const rX_LnY = lnY.length >= 5 ? Math.abs(getCorrelation(xForLnY, lnY)) : 0;

  // Pair 3: ln(X) and ln(Y) (for both > 0)
  const lnX_both: number[] = [];
  const lnY_both: number[] = [];
  for (let i = 0; i < xVals.length; i++) {
    const xv = xVals[i] ?? 0;
    const yv = yVals[i] ?? 0;
    if (xv > 0 && yv > 0) {
      lnX_both.push(Math.log(xv));
      lnY_both.push(Math.log(yv));
    }
  }
  const rLnX_LnY = lnX_both.length >= 5 ? Math.abs(getCorrelation(lnX_both, lnY_both)) : 0;

  const maxLogR = Math.max(rLnX_Y, rX_LnY, rLnX_LnY);

  if (maxLogR >= 0.98 || nameMatch) {
    return `${var1} and ${var2} are likely the same variable in levels and logs.`;
  }

  if (rRaw >= 0.99) {
    return `${var1} and ${var2} are extremely collinear (correlation: ${(rRaw * 100).toFixed(1)}%).`;
  }

  return null;
}

export function getAllVariableSelectionWarnings(
  dependentVar: string,
  regressors: string[],
  data: any[]
): string[] {
  const warnings: string[] = [];
  if (!dependentVar || !regressors || regressors.length === 0 || !data || data.length === 0) return warnings;

  // Compare dependent vs regressors
  regressors.forEach(reg => {
    if (reg) {
      const warning = getVariableTransformationWarning(dependentVar, reg, data);
      if (warning) {
        warnings.push(`Warning: Dependent variable "${dependentVar}" and regressor "${reg}" are likely levels and logs (or highly collinear).`);
      }
    }
  });

  // Compare regressors vs other regressors
  for (let i = 0; i < regressors.length; i++) {
    for (let j = i + 1; j < regressors.length; j++) {
      const reg1 = regressors[i];
      const reg2 = regressors[j];
      if (reg1 && reg2) {
        const warning = getVariableTransformationWarning(reg1, reg2, data);
        if (warning) {
          warnings.push(`Warning: Regressors "${reg1}" and "${reg2}" are likely levels and logs (or highly collinear).`);
        }
      }
    }
  }

  return warnings;
}
