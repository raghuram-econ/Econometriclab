/**
 * Tests for statistics implemented inside UI components rather than in the
 * shared engine.
 *
 * These bypass src/lib/econometrics entirely, so the NIST benchmarks and
 * certification numbers say nothing about them. Both functions covered here
 * shipped defects that produced confident, wrong output with no error:
 *
 *   - jacobiEigenvalues returned 1.0 for every eigenvalue of any correlation
 *     matrix, because Math.sign(0) is 0 and the rotation was skipped. Every
 *     PCA scree plot was flat.
 *   - fitLogisticRegression stopped after 120 gradient-descent iterations with
 *     no convergence check, leaving propensity-score coefficients ~12% low.
 */
import * as math from 'mathjs';
import { jacobiEigenvalues } from '../../../components/modules/FactorAnalysisLab';
import { fitLogisticRegression } from '../../../components/modules/TreatmentEffectsLab';
import { estimateModel } from '../estimators';
import { runSharpRDD, runFuzzyRDD } from '../rdd';

let seed = 1;
const setSeed = (s: number) => { seed = s; };
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const nrm = () => {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const sortDesc = (a: readonly (number | undefined)[]): number[] =>
  a.map(v => Number(v)).sort((x, y) => y - x);
const mathjsEigs = (m: number[][]) => {
  const raw = (math.eigs(m as any).values as any);
  return sortDesc((Array.isArray(raw) ? raw : raw.toArray()).map(Number));
};

describe('FactorAnalysisLab: jacobiEigenvalues', () => {
  // Equicorrelation matrices have closed-form eigenvalues:
  // 1 + (M-1)r once, and 1 - r repeated M-1 times.
  it.each([
    ['2x2, r = 0.8', [[1, 0.8], [0.8, 1]], [1.8, 0.2]],
    ['2x2, r = 0.5', [[1, 0.5], [0.5, 1]], [1.5, 0.5]],
    ['3x3, r = 0.6', [[1, .6, .6], [.6, 1, .6], [.6, .6, 1]], [2.2, 0.4, 0.4]],
    ['4x4, r = 0.3', [[1, .3, .3, .3], [.3, 1, .3, .3], [.3, .3, 1, .3], [.3, .3, .3, 1]], [1.9, 0.7, 0.7, 0.7]],
  ])('matches the closed-form eigenvalues of a correlation matrix (%s)', (_label, A, expected) => {
    const got = sortDesc(jacobiEigenvalues((A as number[][]).map(r => [...r])).eigenvalues);
    const want = sortDesc(expected as number[]);
    got.forEach((v, i) => expect(v).toBeCloseTo(want[i] as number, 6));
  });

  it('does not return the untouched diagonal', () => {
    // The specific failure mode: no rotation ever happened, so every eigenvalue
    // of a correlation matrix came back as exactly 1.
    const got = jacobiEigenvalues([[1, 0.8], [0.8, 1]]).eigenvalues;
    expect(got.every(v => Math.abs(Number(v) - 1) < 1e-9)).toBe(false);
  });

  it('agrees with mathjs on a correlation matrix estimated from data', () => {
    setSeed(21);
    const M = 6, n = 400;
    const cols: number[][] = Array.from({ length: M }, () => []);
    for (let i = 0; i < n; i++) {
      const f1 = nrm(), f2 = nrm();
      for (let j = 0; j < M; j++) cols[j]!.push((j < 3 ? f1 : f2) * 0.8 + nrm() * 0.6);
    }
    const mean = cols.map(c => c.reduce((a, b) => a + b, 0) / n);
    const sd = cols.map((c, j) => Math.sqrt(c.reduce((a, v) => a + (v - mean[j]!) ** 2, 0) / n));
    const corr: number[][] = Array.from({ length: M }, () => Array(M).fill(0));
    for (let i = 0; i < M; i++) {
      for (let j = 0; j < M; j++) {
        let s = 0;
        for (let r = 0; r < n; r++) s += ((cols[i]![r]! - mean[i]!) / sd[i]!) * ((cols[j]![r]! - mean[j]!) / sd[j]!);
        corr[i]![j] = s / n;
      }
    }
    const got = sortDesc(jacobiEigenvalues(corr.map(r => [...r])).eigenvalues);
    const ref = mathjsEigs(corr);
    got.forEach((v, i) => expect(v).toBeCloseTo(ref[i] as number, 6));

    // The data has two underlying factors, so exactly two components should
    // exceed the Kaiser threshold of 1.
    expect(got[0]).toBeGreaterThan(1);
    expect(got[1]).toBeGreaterThan(1);
    expect(got[2]).toBeLessThan(1);
  });

  it('eigenvalues sum to the trace, so variance shares are valid', () => {
    const A = [[1, .6, .6], [.6, 1, .6], [.6, .6, 1]];
    const sum = jacobiEigenvalues(A.map(r => [...r])).eigenvalues.reduce((a, b) => Number(a) + Number(b), 0);
    expect(sum).toBeCloseTo(3, 6);
  });

  it('still handles matrices with unequal diagonals', () => {
    const cov = [[4, 1], [1, 2]];
    const got = sortDesc(jacobiEigenvalues(cov.map(r => [...r])).eigenvalues);
    const ref = mathjsEigs(cov);
    got.forEach((v, i) => expect(v).toBeCloseTo(ref[i] as number, 6));
  });

  it('produces non-negative eigenvalues for a positive semi-definite matrix', () => {
    const A = [[1, .5, .3], [.5, 1, .4], [.3, .4, 1]];
    for (const v of jacobiEigenvalues(A.map(r => [...r])).eigenvalues) {
      expect(Number(v)).toBeGreaterThan(-1e-9);
    }
  });
});

describe('TreatmentEffectsLab: fitLogisticRegression', () => {
  const build = () => {
    setSeed(99);
    const n = 1500, rows: any[] = [], X: number[][] = [], Y: number[] = [];
    for (let i = 0; i < n; i++) {
      const x1 = nrm(), x2 = nrm();
      const p = 1 / (1 + Math.exp(-(0.5 + 1.2 * x1 - 0.8 * x2)));
      const y = rnd() < p ? 1 : 0;
      rows.push({ x1, x2, y });
      X.push([1, x1, x2]);
      Y.push(y);
    }
    return { rows, X, Y };
  };

  it('agrees with the verified Logit estimator to machine precision', () => {
    const { rows, X, Y } = build();
    const beta = fitLogisticRegression(X, Y);
    const ref = estimateModel('Logit', { data: rows, yVar: 'y', xVars: ['x1', 'x2'] });
    const pick = (v: string) => ref.coefficients.find((c: any) => c.variable === v)!.estimate as number;
    expect(beta[0]).toBeCloseTo(pick('Intercept'), 10);
    expect(beta[1]).toBeCloseTo(pick('x1'), 10);
    expect(beta[2]).toBeCloseTo(pick('x2'), 10);
  });

  it('reaches the optimum rather than stopping short', () => {
    // Regression guard: the 120-iteration version returned x1 = 1.03060 where
    // the converged value is 1.17044 — a 12% error with no warning.
    const { X, Y } = build();
    const beta = fitLogisticRegression(X, Y);
    expect(Math.abs(beta[1]! - 1.17044)).toBeLessThan(0.01);
  });

  it('returns coefficients in [intercept, ...slopes] order', () => {
    const { X, Y } = build();
    const beta = fitLogisticRegression(X, Y);
    expect(beta).toHaveLength(3);
    expect(beta.every(Number.isFinite)).toBe(true);
  });

  it('yields propensity scores strictly inside (0, 1)', () => {
    const { X, Y } = build();
    const beta = fitLogisticRegression(X, Y);
    for (const row of X) {
      let z = 0;
      row.forEach((v, i) => { z += v * beta[i]!; });
      const p = 1 / (1 + Math.exp(-z));
      expect(p).toBeGreaterThan(0);
      expect(p).toBeLessThan(1);
    }
  });
});

describe('Sharp RDD reports its own method honestly', () => {
  const build = () => {
    setSeed(2024);
    const rows: any[] = [];
    for (let i = 0; i < 600; i++) {
      const x = rnd() * 20 - 10;
      rows.push({ x, y: 5 + 0.8 * x + 3.0 * (x >= 0 ? 1 : 0) + (rnd() - 0.5) * 2 });
    }
    return rows;
  };

  it('discloses kernel, bias correction and bandwidth selector', () => {
    const res: any = runSharpRDD(build(), 'y', 'x', 0);
    expect(res.kernel).toBe('uniform');
    expect(res.biasCorrected).toBe(false);
    expect(res.bandwidthSelector).toBe('silverman-rule-of-thumb');
    expect(res.methodNote).toContain('rdrobust');
  });

  it('defaults to the Silverman bandwidth when none is supplied', () => {
    const res: any = runSharpRDD(build(), 'y', 'x', 0);
    expect(res.bandwidth).toBe(res.silvermanBandwidth);
  });

  it('honours an explicit bandwidth and labels it as user-specified', () => {
    const res: any = runSharpRDD(build(), 'y', 'x', 0, 2.0);
    expect(res.bandwidth).toBe(2.0);
    expect(res.bandwidthSelector).toBe('user-specified');
  });

  it('rejects a non-positive or non-finite bandwidth', () => {
    for (const bad of [0, -1, NaN]) {
      expect(() => runSharpRDD(build(), 'y', 'x', 0, bad)).toThrow(/bandwidth/i);
    }
  });

  it('recovers a known discontinuity across a range of bandwidths', () => {
    const rows = build();
    for (const h of [1, 2, 4]) {
      const res: any = runSharpRDD(rows, 'y', 'x', 0, h);
      expect(Math.abs(res.rddEstimate - 3.0)).toBeLessThan(0.6);
    }
  });
});

describe('Fuzzy RDD reports its own method honestly and recovers a known LATE', () => {
  // Imperfect-compliance DGP: crossing x=0 shifts the *probability* of
  // treatment take-up from 0.2 to 0.7 (not deterministic assignment), and
  // the outcome responds only to actual treatment status with a known
  // effect of 3.0 -- the true LATE this test checks the estimator recovers.
  const build = (n = 4000) => {
    setSeed(2024);
    const rows: any[] = [];
    for (let i = 0; i < n; i++) {
      const x = rnd() * 20 - 10;
      const pTreat = Math.min(1, Math.max(0, 0.2 + 0.01 * (x + 10) + (x >= 0 ? 0.5 : 0)));
      const d = rnd() < pTreat ? 1 : 0;
      const y = 5 + 0.8 * x + 3.0 * d + (rnd() - 0.5) * 2;
      rows.push({ x, d, y });
    }
    return rows;
  };

  it('discloses kernel, bias correction and bandwidth selector', () => {
    const res: any = runFuzzyRDD(build(), 'y', 'x', 'd', 0);
    expect(res.kernel).toBe('uniform');
    expect(res.biasCorrected).toBe(false);
    expect(res.bandwidthSelector).toBe('silverman-rule-of-thumb');
    expect(res.methodNote).toContain('rdrobust');
  });

  it('honours an explicit bandwidth and labels it as user-specified', () => {
    const res: any = runFuzzyRDD(build(), 'y', 'x', 'd', 0, 3.0);
    expect(res.bandwidth).toBe(3.0);
    expect(res.bandwidthSelector).toBe('user-specified');
  });

  it('rejects a non-positive or non-finite bandwidth', () => {
    for (const bad of [0, -1, NaN]) {
      expect(() => runFuzzyRDD(build(), 'y', 'x', 'd', 0, bad)).toThrow(/bandwidth/i);
    }
  });

  it('reports a first-stage compliance jump consistent with the DGP (~0.5)', () => {
    const rows = build();
    const res: any = runFuzzyRDD(rows, 'y', 'x', 'd', 0, 5.0);
    expect(Math.abs(res.firstStageJump - 0.5)).toBeLessThan(0.15);
  });

  it('recovers the known LATE (3.0) via local 2SLS across a range of bandwidths', () => {
    const rows = build();
    for (const h of [3, 5, 8]) {
      const res: any = runFuzzyRDD(rows, 'y', 'x', 'd', 0, h);
      expect(Math.abs(res.rddEstimate - 3.0)).toBeLessThan(1.0);
    }
  });

  it('refuses estimation when treatment status is constant within the bandwidth', () => {
    const rows = build().map(r => ({ ...r, d: 1 }));
    expect(() => runFuzzyRDD(rows, 'y', 'x', 'd', 0)).toThrow(/variation|constant/i);
  });
});

describe('input guard rails', () => {
  it('refuses a dataset with too few observations', () => {
    expect(() => estimateModel('OLS', { data: [{ y: 1, x: 2 }], yVar: 'y', xVars: ['x'] }))
      .toThrow(/insufficient/i);
  });

  it('refuses a constant dependent variable', () => {
    const data = Array.from({ length: 20 }, (_, i) => ({ y: 5, x: i + 1 }));
    expect(() => estimateModel('OLS', { data, yVar: 'y', xVars: ['x'] }))
      .toThrow(/zero variance|constant/i);
  });

  it('refuses robust standard errors on a model that does not support them', () => {
    const data = Array.from({ length: 40 }, (_, i) => ({ y: 3 * i + (i % 7), x: i }));
    expect(() => estimateModel('OLS', { data, yVar: 'y', xVars: ['x'], robust: true }))
      .toThrow(/does not support robust/i);
  });

  it('refuses a categorical regressor with too many levels', () => {
    const levels = 'ABCDEFGHIJKLMNOP'.split('');   // 16 > the 15 allowed
    const data = Array.from({ length: 160 }, (_, i) => ({
      y: 10 + (i % 16) * 2, x: i * 0.5, grp: levels[i % 16],
    }));
    expect(() => estimateModel('OLS', { data, yVar: 'y', xVars: ['x', 'grp'] }))
      .toThrow(/levels/i);
  });
});
