import { describe, it, expect } from '@jest/globals';
import { estimateModel } from '../estimators';
import jStat from 'jstat';

/**
 * Cluster-robust inference: degrees of freedom
 * ============================================
 *
 * With cluster-robust standard errors, the reference sampling
 * distribution is t with G - 1 degrees of freedom, where G is the number
 * of clusters -- NOT n - k. This is Stata's convention for `vce(cluster)`
 * and linearmodels' convention for `cov_type='clustered'`.
 *
 * The standard errors themselves are already correct in this engine
 * (they agree with statsmodels to ~10 significant digits). What differs
 * is the degrees of freedom used to turn those standard errors into
 * p-values and confidence intervals.
 *
 * Why it matters here: with 34 clusters the t critical value is 2.0345,
 * not 1.9615. Confidence intervals computed on n - k are about 3.6% too
 * narrow, and p-values are correspondingly too small. A coefficient at
 * t = 2.0 reports p = 0.046 (significant) where Stata reports p = 0.054
 * (not significant).
 *
 * These tests currently FAIL. They pin the intended behaviour.
 */

function makeClusteredData(G: number, m: number, seed = 42) {
  // Deterministic LCG so the fixture is reproducible without a dependency.
  let s = seed;
  const rand = () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
  const normal = () => {
    const u1 = Math.max(rand(), 1e-12);
    const u2 = rand();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  };

  const data: any[] = [];
  for (let g = 0; g < G; g++) {
    const u = normal() * 0.6;                 // cluster-level shock
    for (let i = 0; i < m; i++) {
      const x = normal();
      // Small slope on purpose: t lands near 2, where the two
      // degrees-of-freedom conventions straddle the 5% threshold.
      data.push({ cluster: g, x, y: 0.5 + 0.06 * x + u + normal() });
    }
  }
  return data;
}

describe('Cluster-robust inference: degrees of freedom', () => {
  const G = 34;
  const m = 45;
  const data = makeClusteredData(G, m);
  const n = G * m;
  const k = 2; // intercept + x

  it('uses G - 1 degrees of freedom for the clustered p-value', () => {
    const res: any = estimateModel('OLS', {
      data, yVar: 'y', xVars: ['x'],
      clusterVar: 'cluster', includeIntercept: true,
    });
    const c = res.coefficients.find((z: any) => z.variable === 'x');
    expect(c).toBeDefined();

    const expectedP =
      2 * (1 - jStat.studentt.cdf(Math.abs(c.tStat), G - 1));
    const wrongP =
      2 * (1 - jStat.studentt.cdf(Math.abs(c.tStat), n - k));

    // Guard: the two must actually differ, or the test proves nothing.
    expect(Math.abs(expectedP - wrongP)).toBeGreaterThan(1e-9);

    expect(c.pValue).toBeCloseTo(expectedP, 10);
  });

  it('uses G - 1 degrees of freedom for the clustered confidence interval', () => {
    const res: any = estimateModel('OLS', {
      data, yVar: 'y', xVars: ['x'],
      clusterVar: 'cluster', includeIntercept: true,
    });
    const c = res.coefficients.find((z: any) => z.variable === 'x');

    const tCrit = jStat.studentt.inv(0.975, G - 1);
    const lower = c.estimate - tCrit * c.stdError;
    const upper = c.estimate + tCrit * c.stdError;

    // Assert on confLow/confHigh, which carry full precision. ciLower and
    // ciUpper are .toFixed(4) display strings and cannot be compared at
    // this tolerance.
    expect(c.confLow).toBeCloseTo(lower, 10);
    expect(c.confHigh).toBeCloseTo(upper, 10);

    // The display strings should still agree to their own precision.
    expect(Number(c.ciLower)).toBeCloseTo(lower, 4);
    expect(Number(c.ciUpper)).toBeCloseTo(upper, 4);
  });

  it('reports the cluster count and the degrees of freedom it used', () => {
    // Reproducibility: a reader of the output should be able to see which
    // convention produced the p-value without reading the source.
    const res: any = estimateModel('OLS', {
      data, yVar: 'y', xVars: ['x'],
      clusterVar: 'cluster', includeIntercept: true,
    });
    expect(res.nClusters).toBe(G);
    expect(res.dfInference).toBe(G - 1);
  });

  it('leaves non-clustered inference on n - k', () => {
    // Regression guard: the fix must not change the unclustered path.
    const res: any = estimateModel('OLS', {
      data, yVar: 'y', xVars: ['x'], includeIntercept: true,
    });
    const c = res.coefficients.find((z: any) => z.variable === 'x');
    const expectedP =
      2 * (1 - jStat.studentt.cdf(Math.abs(c.tStat), n - k));
    expect(c.pValue).toBeCloseTo(expectedP, 10);
  });
});

describe('Panel FE with clustering: degrees of freedom', () => {
  it('uses G - 1 when clustered, not n - entities - k', () => {
    const G = 30;   // entities, also the cluster variable
    const T = 8;
    const data: any[] = [];
    let s = 7;
    const rand = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
    const normal = () => Math.sqrt(-2 * Math.log(Math.max(rand(), 1e-12))) * Math.cos(2 * Math.PI * rand());

    for (let e = 0; e < G; e++) {
      const alpha = normal() * 1.5;
      for (let t = 0; t < T; t++) {
        const x = normal() + 0.5 * alpha;
        data.push({ firm: e, period: t, x, y: 0.08 * x + alpha + normal() });
      }
    }

    const res: any = estimateModel('Panel FE', {
      data, yVar: 'y', xVars: ['x'],
      entityVar: 'firm', clusterVar: 'firm',
    });
    const c = res.coefficients.find((z: any) => z.variable === 'x');

    const expectedP = 2 * (1 - jStat.studentt.cdf(Math.abs(c.tStat), G - 1));
    expect(c.pValue).toBeCloseTo(expectedP, 10);
  });
});
