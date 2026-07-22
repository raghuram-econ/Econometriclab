import * as math from 'mathjs';

/**
 * Calculates the diagonal elements of the hat matrix H = X (X'X)^-1 X'
 * without materializing the full N x N matrix, which is highly efficient.
 */
export function getHatDiagonal(X: number[][], XtX_inv: number[][]): number[] {
  if (!X || X.length === 0 || !X[0]) return [];
  const n = X.length;
  const k = X[0].length;
  const h = new Array(n);
  
  for (let i = 0; i < n; i++) {
    let sum = 0;
    const xi = X[i];
    if (!xi) {
      h[i] = 0;
      continue;
    }
    for (let j = 0; j < k; j++) {
      let inner = 0;
      const invRow = XtX_inv[j];
      if (!invRow) continue;
      for (let l = 0; l < k; l++) {
        inner += (invRow[l] ?? 0) * (xi[l] ?? 0);
      }
      sum += (xi[j] ?? 0) * inner;
    }
    // Cap leverage at 0.9999 to avoid division by zero in HC2/HC3
    h[i] = Math.min(0.9999, Math.max(0, sum));
  }
  return h;
}

/**
 * Computes the White (HC0/HC1/HC2/HC3) or Newey-West HAC covariance matrix.
 */
export function computeRobustCovariance(
  X: number[][],
  XtX_inv: number[][],
  residuals: number[],
  type: 'HC0' | 'HC1' | 'HC2' | 'HC3' | 'NW'
): number[][] {
  if (!X || X.length === 0 || !X[0]) return [];
  const n = X.length;
  const k = X[0].length;

  // Initialize central sandwich matrix S (k x k)
  const S: number[][] = Array(k).fill(0).map(() => Array(k).fill(0));

  if (type === 'HC0' || type === 'HC1' || type === 'HC2' || type === 'HC3') {
    const h = (type === 'HC2' || type === 'HC3') ? getHatDiagonal(X, XtX_inv) : [];
    
    // Degrees of freedom correction for HC1
    const dfCorrection = type === 'HC1' ? n / (n - k) : 1;

    for (let i = 0; i < n; i++) {
      const xi = X[i];
      if (!xi) continue;
      const residualVal = residuals[i] ?? 0;
      let eiSq = residualVal * residualVal;
      
      if (type === 'HC2') {
        const hi = h[i] ?? 0;
        eiSq = eiSq / (1 - hi);
      } else if (type === 'HC3') {
        const hi = h[i] ?? 0;
        eiSq = eiSq / Math.pow(1 - hi, 2);
      }

      const weight = eiSq * dfCorrection;

      for (let r = 0; r < k; r++) {
        const sRow = S[r];
        if (!sRow) continue;
        const xir = xi[r] ?? 0;
        for (let c = 0; c < k; c++) {
          sRow[c] = (sRow[c] ?? 0) + xir * (xi[c] ?? 0) * weight;
        }
      }
    }
  } else if (type === 'NW') {
    // Newey-West HAC Covariance
    // Determine bandwidth (standard rule of thumb: L = floor(4 * (n / 100)^(2/9)))
    const L = Math.max(1, Math.floor(4 * Math.pow(n / 100, 2 / 9)));

    // 1. Lag 0 (White/HC0 meat)
    for (let i = 0; i < n; i++) {
      const xi = X[i];
      if (!xi) continue;
      const residI = residuals[i] ?? 0;
      const eiSq = residI * residI;
      for (let r = 0; r < k; r++) {
        const sRow = S[r];
        if (!sRow) continue;
        const xir = xi[r] ?? 0;
        for (let c = 0; c < k; c++) {
          sRow[c] = (sRow[c] ?? 0) + xir * (xi[c] ?? 0) * eiSq;
        }
      }
    }

    // 2. Lags 1 to L
    for (let l = 1; l <= L; l++) {
      const weight = 1 - l / (L + 1);
      
      // Compute cross-products of lagged residuals
      for (let t = l; t < n; t++) {
        const xt = X[t];
        const xt_lag = X[t - l];
        if (!xt || !xt_lag) continue;
        const residT = residuals[t] ?? 0;
        const residTLag = residuals[t - l] ?? 0;
        const et_et_lag = residT * residTLag * weight;

        for (let r = 0; r < k; r++) {
          const sRow = S[r];
          if (!sRow) continue;
          const xt_r = xt[r] ?? 0;
          const xt_lag_r = xt_lag[r] ?? 0;
          for (let c = 0; c < k; c++) {
            const xt_lag_c = xt_lag[c] ?? 0;
            const xt_c = xt[c] ?? 0;
            // S_l = et * et-l * (xt * xt-l' + xt-l * xt')
            sRow[c] = (sRow[c] ?? 0) + (xt_r * xt_lag_c + xt_lag_r * xt_c) * et_et_lag;
          }
        }
      }
    }
  }

  // Sandwich formulation: V = (X'X)^-1 * S * (X'X)^-1
  // Standard matrix multiplication for speed
  const temp: number[][] = Array(k).fill(0).map(() => Array(k).fill(0));
  for (let r = 0; r < k; r++) {
    const tempRow = temp[r];
    const invRow = XtX_inv[r];
    if (!tempRow || !invRow) continue;
    for (let c = 0; c < k; c++) {
      let sum = 0;
      for (let m = 0; m < k; m++) {
        const sRow = S[m];
        sum += (invRow[m] ?? 0) * (sRow ? (sRow[c] ?? 0) : 0);
      }
      tempRow[c] = sum;
    }
  }

  const varCov: number[][] = Array(k).fill(0).map(() => Array(k).fill(0));
  for (let r = 0; r < k; r++) {
    const varCovRow = varCov[r];
    const tempRow = temp[r];
    if (!varCovRow || !tempRow) continue;
    for (let c = 0; c < k; c++) {
      let sum = 0;
      for (let m = 0; m < k; m++) {
        const invRow = XtX_inv[m];
        sum += (tempRow[m] ?? 0) * (invRow ? (invRow[c] ?? 0) : 0);
      }
      varCovRow[c] = sum;
    }
  }

  return varCov;
}
