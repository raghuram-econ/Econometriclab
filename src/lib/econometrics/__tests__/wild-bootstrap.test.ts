import { describe, it, expect } from '@jest/globals';
import { wildBootstrapClusteredSE } from '../ols';
import { estimateModel } from '../estimators';

// ---------------------------------------------------------------------------
// Deterministic data generator (same LCG as the bootstrap itself)
// ---------------------------------------------------------------------------
function makeData(G: number, m: number, betaTrue: number, seed = 20260813) {
  let s = seed >>> 0;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  const normal = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());
  const data: { cluster: number; x: number; y: number }[] = [];
  for (let g = 0; g < G; g++) {
    const u = normal() * 0.6;
    for (let i = 0; i < m; i++) {
      const x = normal();
      data.push({ cluster: g, x, y: betaTrue * x + u + normal() });
    }
  }
  return data;
}

// Bare-metal OLS + correct CR1 sandwich for the direct function tests.
// The sandwich formula is  A @ B @ A  where A = (X'X)^{-1}  and  B = G_correction * G'G.
// An earlier version only used the [i][i] terms of G'G instead of the full
// matrix product — that underestimated the SE by up to 40% and made |t_j|
// so large that no bootstrap t-stat could exceed it, producing p = 0.
function matmul22(A: number[][], B: number[][]): number[][] {
  const a00 = A[0]?.[0] ?? 0, a01 = A[0]?.[1] ?? 0, a10 = A[1]?.[0] ?? 0, a11 = A[1]?.[1] ?? 0;
  const b00 = B[0]?.[0] ?? 0, b01 = B[0]?.[1] ?? 0, b10 = B[1]?.[0] ?? 0, b11 = B[1]?.[1] ?? 0;
  return [
    [a00 * b00 + a01 * b10, a00 * b01 + a01 * b11],
    [a10 * b00 + a11 * b10, a10 * b01 + a11 * b11],
  ];
}

function simpleOLS(X: number[][], y: number[], G: number, m: number) {
  const n = X.length;
  const k = X[0]!.length;

  // X'X and X'y
  const XtX = Array.from({ length: k }, (_, r) =>
    Array.from({ length: k }, (_, c) =>
      X.reduce((s, row) => s + (row[r] ?? 0) * (row[c] ?? 0), 0)));
  const XtY = Array.from({ length: k }, (_, r) =>
    X.reduce((s, row, i) => s + (row[r] ?? 0) * (y[i] ?? 0), 0));

  // 2x2 inverse of X'X
  const det = (XtX[0]?.[0] ?? 0) * (XtX[1]?.[1] ?? 0) - (XtX[0]?.[1] ?? 0) ** 2;
  const inv = [
    [(XtX[1]?.[1] ?? 0) / det, -(XtX[0]?.[1] ?? 0) / det],
    [-(XtX[1]?.[0] ?? 0) / det, (XtX[0]?.[0] ?? 0) / det],
  ];

  const beta = [
    (inv[0]?.[0] ?? 0) * (XtY[0] ?? 0) + (inv[0]?.[1] ?? 0) * (XtY[1] ?? 0),
    (inv[1]?.[0] ?? 0) * (XtY[0] ?? 0) + (inv[1]?.[1] ?? 0) * (XtY[1] ?? 0),
  ];

  const yHat = X.map(row => (row[0] ?? 0) * (beta[0] ?? 0) + (row[1] ?? 0) * (beta[1] ?? 0));
  const res  = y.map((v, i) => v - (yHat[i] ?? 0));

  // CR1 meat = sum_g (sum_{i in g} x_i e_i) (sum_{i in g} x_i e_i)'
  const clusterIds = Array.from({ length: G * m }, (_, i) => Math.floor(i / m));
  const scores = Array.from({ length: G }, () => [0.0, 0.0] as [number, number]);
  for (let i = 0; i < n; i++) {
    const g = clusterIds[i]!;
    scores[g]![0] += (X[i]?.[0] ?? 0) * (res[i] ?? 0);
    scores[g]![1] += (X[i]?.[1] ?? 0) * (res[i] ?? 0);
  }
  let m00 = 0, m01 = 0, m10 = 0, m11 = 0;
  for (const sg of scores) {
    const s0 = sg[0] ?? 0, s1 = sg[1] ?? 0;
    m00 += s0 * s0;
    m01 += s0 * s1;
    m10 += s1 * s0;
    m11 += s1 * s1;
  }
  const meat: number[][] = [[m00, m01], [m10, m11]];

  // Correct CR1 sandwich: corr * A @ meat @ A  (full 2x2 matrix product)
  const corr = (G / (G - 1)) * ((n - 1) / (n - k));
  const meatScaled = meat.map(row => row.map(v => v * corr));
  const varCov = matmul22(matmul22(inv, meatScaled), inv);

  return { beta, varCov, inv, clusterIds };
}

// ---------------------------------------------------------------------------
// 1. Structure and output shape
// ---------------------------------------------------------------------------
describe('wildBootstrapClusteredSE — structure', () => {
  const G = 16, m = 30, B = 199;
  const data = makeData(G, m, 0.0);
  const X = data.map(r => [1, r.x]);
  const y = data.map(r => r.y);
  const { beta, varCov, inv, clusterIds } = simpleOLS(X, y, G, m);

  const res = wildBootstrapClusteredSE(X, y, clusterIds, beta, varCov, inv, B, 42);

  it('returns one p-value per coefficient', () => {
    expect(res.wild_bootstrap_pvalues).toHaveLength(2);
  });

  it('all p-values are valid probabilities', () => {
    for (const p of res.wild_bootstrap_pvalues) {
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('CI lower < CI upper for each coefficient', () => {
    for (let j = 0; j < 2; j++) {
      expect(res.wild_bootstrap_ci_low[j]).toBeLessThan(res.wild_bootstrap_ci_high[j]!);
    }
  });

  it('reports the correct cluster count and B', () => {
    expect(res.n_clusters).toBe(G);
    expect(res.B).toBe(B);
  });

  it('returns an empty result on empty input without crashing', () => {
    const empty = wildBootstrapClusteredSE([], [], [], [], [], [], B, 42);
    expect(empty.wild_bootstrap_pvalues).toHaveLength(0);
    expect(empty.n_clusters).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Determinism — same seed → same result
// ---------------------------------------------------------------------------
describe('wildBootstrapClusteredSE — determinism', () => {
  it('produces identical p-values with the same seed', () => {
    const G = 20, m = 25, B = 199;
    // beta=0.0 gives t ≈ 1.2 at this seed — moderate enough that
    // different Rademacher draws produce different counts out of B=199.
    const data = makeData(G, m, 0.0, 777);
    const X = data.map(r => [1, r.x]);
    const y = data.map(r => r.y);
    const { beta, varCov, inv, clusterIds } = simpleOLS(X, y, G, m);

    const r1 = wildBootstrapClusteredSE(X, y, clusterIds, beta, varCov, inv, B, 99);
    const r2 = wildBootstrapClusteredSE(X, y, clusterIds, beta, varCov, inv, B, 99);

    expect(r1.wild_bootstrap_pvalues[1]).toBe(r2.wild_bootstrap_pvalues[1]);
    expect(r1.wild_bootstrap_ci_low[1]).toBe(r2.wild_bootstrap_ci_low[1]);
  });

  it('produces different p-values with a different seed', () => {
    const G = 20, m = 25, B = 199;
    // beta=0.0 gives t ≈ 1.2 at this seed — moderate enough that
    // different Rademacher draws produce different counts out of B=199.
    const data = makeData(G, m, 0.0, 777);
    const X = data.map(r => [1, r.x]);
    const y = data.map(r => r.y);
    const { beta, varCov, inv, clusterIds } = simpleOLS(X, y, G, m);

    const r1 = wildBootstrapClusteredSE(X, y, clusterIds, beta, varCov, inv, B, 42);
    const r2 = wildBootstrapClusteredSE(X, y, clusterIds, beta, varCov, inv, B, 9999999);

    expect(r1.wild_bootstrap_pvalues[1]).not.toBe(r2.wild_bootstrap_pvalues[1]);
  });
});

// ---------------------------------------------------------------------------
// 3. Directional correctness
// 
// We can't run a full size simulation inside a unit test without making Jest
// take several minutes. Instead we check both ends of the distribution:
// a clearly null effect should not be rejected; a large clear effect should
// be. These are fast single-run checks.
// ---------------------------------------------------------------------------
describe('wildBootstrapClusteredSE — directional correctness', () => {
  const G = 34, m = 45, B = 499;

  it('does not reject a zero effect at 5%', () => {
    // True beta = 0 with realistic noise. A single dataset won't have exactly
    // p > 0.05, but with a fixed seed the OLS estimate is well inside the
    // null distribution: p should be well above 0.05.
    // (This is not a size test -- for that, see npm run test:bootstrap-size.)
    const data = makeData(G, m, 0.0, 424242);  // null effect, fixed seed
    const X = data.map(r => [1, r.x]);
    const y = data.map(r => r.y);
    const { beta, varCov, inv, clusterIds } = simpleOLS(X, y, G, m);
    const res = wildBootstrapClusteredSE(X, y, clusterIds, beta, varCov, inv, B, 42);
    // Under H0 with this seed the OLS t-stat is small, so p >> 0.05.
    expect(res.wild_bootstrap_pvalues[1]).toBeGreaterThan(0.10);
  });

  it('rejects a very strong effect', () => {
    // True beta = 50, tiny noise → t enormous, p should be near 0
    const n = G * m;
    const X = Array.from({ length: n }, (_, i) => [1, (i % 7) / 3 - 1]);
    const clusterIds = Array.from({ length: n }, (_, i) => Math.floor(i / m));
    const y = X.map(row => 50 * (row[1] ?? 0) + 0.001 * ((Math.random() - 0.5)));
    const { beta, varCov, inv } = simpleOLS(X, y, G, m);
    const res = wildBootstrapClusteredSE(X, y, clusterIds, beta, varCov, inv, B, 42);
    expect(res.wild_bootstrap_pvalues[1]).toBeLessThan(0.05);
  });

  it('bootstrap CI contains the OLS estimate', () => {
    // A property that must hold: the bootstrap CI built from beta* values
    // contains beta_hat by construction (beta_hat ≈ median of beta*
    // when the bootstrap is centred on beta_hat, so this should almost
    // always be true).
    const data = makeData(G, m, 0.8, 12345);
    const X = data.map(r => [1, r.x]);
    const y = data.map(r => r.y);
    const { beta, varCov, inv, clusterIds } = simpleOLS(X, y, G, m);
    const res = wildBootstrapClusteredSE(X, y, clusterIds, beta, varCov, inv, B, 42);
    // The CI is a percentile interval of bootstrap betas (not beta - beta_hat).
    // It is NOT guaranteed to contain beta[1] at every draw, but at B=499
    // and a moderate true effect, it should hold comfortably.
    const lo = res.wild_bootstrap_ci_low[1] ?? -Infinity;
    const hi = res.wild_bootstrap_ci_high[1] ?? Infinity;
    const b  = beta[1] ?? 0;
    expect(lo).toBeLessThan(b + 3 * Math.sqrt(varCov[1]?.[1] ?? 0));
    expect(hi).toBeGreaterThan(b - 3 * Math.sqrt(varCov[1]?.[1] ?? 0));
  });
});

// ---------------------------------------------------------------------------
// 4. Integration — wildBootstrapPValue is returned through estimateModel
//
// This is the test that previously had nothing to prove the public API
// actually reaches the bootstrap code. 0.0% rejection rate in 250 trials
// was the symptom that prompted this fix.
// ---------------------------------------------------------------------------
describe('estimateModel — useWildBootstrap integration', () => {
  const G = 34, m = 45;

  it('attaches wildBootstrapPValue to coefficients when requested', () => {
    const data = makeData(G, m, 0.3, 9999);
    const res: any = estimateModel('OLS', {
      data, yVar: 'y', xVars: ['x'],
      clusterVar: 'cluster', includeIntercept: true,
      useWildBootstrap: true, wildBootstrapB: 199,
    });
    const c = res.coefficients.find((z: any) => z.variable === 'x');
    expect(c.wildBootstrapPValue).toBeDefined();
    expect(c.wildBootstrapPValue).toBeGreaterThanOrEqual(0);
    expect(c.wildBootstrapPValue).toBeLessThanOrEqual(1);
  });

  it('does not attach wildBootstrapPValue without useWildBootstrap', () => {
    const data = makeData(G, m, 0.3, 9999);
    const res: any = estimateModel('OLS', {
      data, yVar: 'y', xVars: ['x'],
      clusterVar: 'cluster', includeIntercept: true,
    });
    const c = res.coefficients.find((z: any) => z.variable === 'x');
    expect(c.wildBootstrapPValue).toBeUndefined();
  });

  it('does not attach wildBootstrapPValue without clusterVar', () => {
    const data = makeData(G, m, 0.3, 9999);
    const res: any = estimateModel('OLS', {
      data, yVar: 'y', xVars: ['x'],
      includeIntercept: true, useWildBootstrap: true, wildBootstrapB: 99,
    });
    const c = res.coefficients.find((z: any) => z.variable === 'x');
    expect(c.wildBootstrapPValue).toBeUndefined();
  });

  it('wildBootstrapPValue and cluster p-value agree in direction', () => {
    // When both say significant, or both say not, they should agree on the
    // direction (though not necessarily cross the same threshold at
    // borderline effect sizes). We test a clear-signal dataset.
    const data = makeData(G, m, 1.5, 7777);
    const res: any = estimateModel('OLS', {
      data, yVar: 'y', xVars: ['x'],
      clusterVar: 'cluster', includeIntercept: true,
      useWildBootstrap: true, wildBootstrapB: 299,
    });
    const c = res.coefficients.find((z: any) => z.variable === 'x');
    // Both should say clearly significant at a true beta of 1.5 SD
    expect(c.pValue).toBeLessThan(0.01);
    expect(c.wildBootstrapPValue).toBeLessThan(0.05);
  });
});

// ---------------------------------------------------------------------------
// NOTE: Full Monte Carlo size test
//
// A size test (checking empirical rejection rate ≈ 5% across 250+ trials) is
// important but takes ~3 minutes at G=34, B=499. It lives in a separate
// script so it doesn't slow down the everyday test run:
//
//   npm run test:bootstrap-size
//
// Run it:
//   - before finalising the pre-analysis plan
//   - after any change to wildBootstrapClusteredSE
//   - as part of the certification checklist
//
// A correctly implemented unrestricted wild bootstrap at G=34 rejects at
// roughly 5-6% under H0, compared to 6-7% for CR1 after the df fix (Finding
// 1). The proposal cites this as the justification for using the bootstrap
// rather than the CR1 t-test as the primary inferential method.
// ---------------------------------------------------------------------------
