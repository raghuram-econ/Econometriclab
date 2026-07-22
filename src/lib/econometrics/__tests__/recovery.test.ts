/**
 * Parameter-recovery tests.
 *
 * Each test simulates data from a model whose true parameters we choose, then
 * checks the estimator recovers them. This catches optimizers that silently fail
 * to converge — the failure mode behind three separate defects in this codebase
 * (Tobit, GARCH, and the propensity-score fit), none of which produced an error
 * or an obviously wrong-looking number.
 *
 * The generator is a fixed-seed LCG so results are identical on every run.
 */
import { estimateModel } from '../estimators';
import { runPoissonMLE, runNegBinomialMLE } from '../count';
import { ridgeRegression, lassoRegression, elasticNet } from '../penalized';
import { runQuantileRegression } from '../quantile';
import { runOLS } from '../ols';
import { runFixedEffects, runRandomEffects, runHausmanTest } from '../fixed_effects';
import {
  runADFTest, runKPSSTest, runPhillipsPerronTest, runVAR,
  runGARCH, runGrangerCausality, calculateLjungBox, runARIMA,
} from '../arima';

let seed = 1;
const setSeed = (s: number) => { seed = s; };
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
const nrm = () => {
  let u = 0, v = 0;
  while (u === 0) u = rnd();
  while (v === 0) v = rnd();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};
const rpois = (lambda: number) => {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rnd(); } while (p > L);
  return k - 1;
};
const coef = (res: any, name: string) =>
  res.coefficients.find((c: any) => c.variable === name || c.name === name);
const est = (res: any, name: string) => coef(res, name)?.estimate as number;

describe('count models recover known parameters', () => {
  // y ~ Poisson(exp(0.5 + 0.8*x - 0.6*z))
  const build = () => {
    setSeed(22);
    const rows: any[] = [];
    for (let i = 0; i < 2000; i++) {
      const x = rnd() * 2, z = rnd();
      rows.push({ x, z, y: rpois(Math.exp(0.5 + 0.8 * x - 0.6 * z)) });
    }
    return rows;
  };

  it('Poisson recovers all three coefficients within sampling error', () => {
    const res = runPoissonMLE(build(), 'y', ['x', 'z']);
    // Compare against the true value in units of the estimator's own standard
    // error, rather than a fixed decimal tolerance. A coefficient more than 4 SE
    // from truth indicates a real estimation problem, not sampling noise.
    for (const [name, truth] of [['Intercept', 0.5], ['x', 0.8], ['z', -0.6]] as Array<[string, number]>) {
      const c = coef(res, name);
      expect(c.stdError).toBeGreaterThan(0);
      expect(Math.abs(c.estimate - truth) / c.stdError).toBeLessThan(4);
    }
    expect(Number.isFinite(res.logLikelihood as number)).toBe(true);
  });

  it('negative binomial recovers coefficients under overdispersion', () => {
    setSeed(33);
    const rows: any[] = [];
    for (let i = 0; i < 1500; i++) {
      const x = rnd() * 2;
      const gamma = Math.exp(nrm() * 0.7);          // multiplicative heterogeneity
      rows.push({ x, y: rpois(Math.exp(0.4 + 0.9 * x) * gamma) });
    }
    const res = runNegBinomialMLE(rows, 'y', ['x']);
    expect(Math.abs(est(res, 'x') - 0.9)).toBeLessThan(0.15);
  });
});

describe('penalized regression behaves correctly at the limits', () => {
  const build = () => {
    setSeed(44);
    const X: number[][] = [], y: number[] = [];
    for (let i = 0; i < 400; i++) {
      const a = rnd() * 4, b = rnd() * 3, c = rnd() * 2;
      X.push([a, b, c]);
      y.push(1 + 2 * a - 1.5 * b + 0 * c + nrm() * 0.5);   // c is truly zero
    }
    const rows = X.map((r, i) => ({ a: r[0], b: r[1], c: r[2], y: y[i] }));
    return { X, y, rows };
  };
  const pick = (res: any, v: string) =>
    res.coefficients.find((c: any) => c.variable === v)?.estimate ?? 0;

  it('ridge with lambda = 0 equals OLS', () => {
    const { X, y, rows } = build();
    const olsA = est(runOLS(rows, 'y', ['a', 'b', 'c'], true, false, undefined), 'a');
    const r = ridgeRegression(X.map(row => [1, ...row]), [...y], 0, ['a', 'b', 'c']);
    expect(Math.abs(pick(r, 'a') - olsA)).toBeLessThan(1e-3);
  });

  it('ridge with a very large lambda shrinks coefficients toward zero', () => {
    const { X, y, rows } = build();
    const olsA = est(runOLS(rows, 'y', ['a', 'b', 'c'], true, false, undefined), 'a');
    const r = ridgeRegression(X.map(row => [1, ...row]), [...y], 1e6, ['a', 'b', 'c']);
    expect(Math.abs(pick(r, 'a'))).toBeLessThan(Math.abs(olsA) / 10);
  });

  it('lasso with lambda = 0 approximates OLS', () => {
    const { X, y, rows } = build();
    const olsA = est(runOLS(rows, 'y', ['a', 'b', 'c'], true, false, undefined), 'a');
    const l = lassoRegression(X.map(r => [...r]), [...y], 0, ['a', 'b', 'c']);
    expect(Math.abs(pick(l, 'a') - olsA)).toBeLessThan(0.05);
  });

  it('lasso eliminates the irrelevant variable before the relevant ones', () => {
    const { X, y } = build();
    const l = lassoRegression(X.map(r => [...r]), [...y], 0.05, ['a', 'b', 'c']);
    expect(Math.abs(pick(l, 'c'))).toBeLessThan(Math.abs(pick(l, 'a')));
    expect(Math.abs(pick(l, 'c'))).toBeLessThan(Math.abs(pick(l, 'b')));
  });

  it('elastic net with lambda = 0 approximates OLS', () => {
    const { X, y, rows } = build();
    const olsA = est(runOLS(rows, 'y', ['a', 'b', 'c'], true, false, undefined), 'a');
    const e = elasticNet(X.map(r => [...r]), [...y], 0, 0.5, ['a', 'b', 'c']);
    expect(Math.abs(pick(e, 'a') - olsA)).toBeLessThan(0.05);
  });
});

describe('quantile regression', () => {
  const build = () => {
    setSeed(11);
    const rows: any[] = [];
    for (let i = 0; i < 800; i++) {
      const x = rnd() * 10;
      rows.push({ x, y: 4 + 2.5 * x + nrm() * 2 });
    }
    return rows;
  };

  it('median regression recovers the true slope', () => {
    expect(Math.abs(est(runQuantileRegression(build(), 'y', ['x'], 0.5), 'x') - 2.5)).toBeLessThan(0.15);
  });

  it('quantile intercepts are ordered across tau', () => {
    const rows = build();
    const q25 = est(runQuantileRegression(rows, 'y', ['x'], 0.25), 'Intercept');
    const q50 = est(runQuantileRegression(rows, 'y', ['x'], 0.50), 'Intercept');
    const q75 = est(runQuantileRegression(rows, 'y', ['x'], 0.75), 'Intercept');
    expect(q25).toBeLessThan(q50);
    expect(q50).toBeLessThan(q75);
  });
});

describe('panel estimators', () => {
  const buildPanel = (correlateEffect: boolean) => {
    setSeed(5);
    const rows: any[] = [];
    for (let f = 1; f <= 12; f++) {
      const alpha = (f - 6.5) * 9;
      for (let t = 1; t <= 15; t++) {
        const x1 = 10 + 5 * rnd() + 0.3 * t + (correlateEffect ? alpha * 0.8 : 0);
        const x2 = 20 + 8 * rnd();
        rows.push({ id: `F${f}`, yr: 2000 + t, x1, x2, y: 3 + alpha + 1.5 * x1 - 0.7 * x2 + (rnd() - 0.5) * 2 });
      }
    }
    return rows;
  };

  it('fixed effects recovers the true slopes', () => {
    const res = runFixedEffects(buildPanel(false), 'y', ['x1', 'x2'], 'id', 'yr');
    expect(est(res, 'x1')).toBeCloseTo(1.5, 1);
    expect(est(res, 'x2')).toBeCloseTo(-0.7, 1);
  });

  it('random effects recovers the true slopes', () => {
    const res = runRandomEffects(buildPanel(false), 'y', ['x1', 'x2'], 'id', 'yr');
    expect(est(res, 'x1')).toBeCloseTo(1.5, 1);
    expect(est(res, 'x2')).toBeCloseTo(-0.7, 1);
  });

  it('Hausman favours random effects when effects are uncorrelated', () => {
    const d = buildPanel(false);
    const h = runHausmanTest(
      runFixedEffects(d, 'y', ['x1', 'x2'], 'id', 'yr'),
      runRandomEffects(d, 'y', ['x1', 'x2'], 'id', 'yr'),
      ['x1', 'x2'],
    );
    expect(h.pValue).toBeGreaterThan(0.05);
  });

  it('Hausman favours fixed effects when effects correlate with regressors', () => {
    const d = buildPanel(true);
    const h = runHausmanTest(
      runFixedEffects(d, 'y', ['x1', 'x2'], 'id', 'yr'),
      runRandomEffects(d, 'y', ['x1', 'x2'], 'id', 'yr'),
      ['x1', 'x2'],
    );
    expect(h.pValue).toBeLessThan(0.05);
  });
});

describe('time series', () => {
  const randomWalk = (n = 400, s = 42) => {
    setSeed(s); const x: number[] = [0];
    for (let i = 1; i < n; i++) x.push((x[i - 1] as number) + nrm());
    return x;
  };
  const stationaryAR = (phi = 0.2, n = 400, s = 7) => {
    setSeed(s); const x: number[] = [0];
    for (let i = 1; i < n; i++) x.push(phi * (x[i - 1] as number) + nrm());
    return x;
  };

  it('ADF: stationary series rejects the unit root, random walk does not', () => {
    expect(runADFTest(stationaryAR(), 4).isStationary).toBe(true);
    expect(runADFTest(randomWalk(), 4).isStationary).toBe(false);
  });

  it('KPSS: random walk is judged non-stationary', () => {
    expect(runKPSSTest(randomWalk(), 6, false).isStationary).toBe(false);
  });

  it('KPSS: false-rejection rate on white noise stays near nominal size', () => {
    let rejected = 0;
    const R = 40;
    for (let r = 0; r < R; r++) {
      setSeed(5000 + r * 91);
      const wn: number[] = [];
      for (let i = 0; i < 400; i++) wn.push(nrm());
      if (!runKPSSTest(wn, 6, false).isStationary) rejected++;
    }
    expect(rejected / R).toBeLessThan(0.20);
  });

  it('Phillips-Perron agrees with ADF on direction', () => {
    expect(runPhillipsPerronTest(stationaryAR(), 6).isStationary).toBe(true);
    expect(runPhillipsPerronTest(randomWalk(), 6).isStationary).toBe(false);
  });

  it('Ljung-Box distinguishes white noise from autocorrelation', () => {
    setSeed(77);
    const wn: number[] = [];
    for (let i = 0; i < 500; i++) wn.push(nrm());
    setSeed(88);
    const ar: number[] = [0];
    for (let i = 1; i < 500; i++) ar.push(0.85 * (ar[i - 1] as number) + nrm());
    expect(calculateLjungBox(wn, 10).pValue).toBeGreaterThan(0.05);
    expect(calculateLjungBox(ar, 10).pValue).toBeLessThan(0.05);
  });

  it('ARIMA recovers a known AR(1) coefficient', () => {
    setSeed(246);
    const x: number[] = [0];
    for (let i = 1; i < 500; i++) x.push(5 + 0.7 * ((x[i - 1] as number) - 5) + nrm());
    const m: any = runARIMA(x, 1, 0, 0, 5);
    expect(Math.abs(Number(m.coefficients['lag1']) - 0.7)).toBeLessThan(0.10);
  });

  it('VAR recovers a known own-lag coefficient', () => {
    setSeed(99);
    const rows: any[] = []; let y1 = 0, y2 = 0;
    for (let i = 0; i < 500; i++) {
      const n1 = 0.6 * y1 + 0.2 * y2 + nrm() * 0.5;
      const n2 = 0.3 * y2 - 0.1 * y1 + nrm() * 0.5;
      y1 = n1; y2 = n2; rows.push({ a: y1, b: y2 });
    }
    const v = runVAR(rows, ['a', 'b'], 1);
    const ownLag = Number(
      Object.entries((v.equations['a'] as any).coefficients).find(([k]) => k.includes('a'))?.[1],
    );
    expect(Math.abs(ownLag - 0.6)).toBeLessThan(0.15);
  });

  it('Granger detects true causality and not the reverse direction', () => {
    setSeed(321);
    const rows: any[] = []; let x = 0, y = 0;
    for (let i = 0; i < 400; i++) {
      const nx = 0.5 * x + nrm();
      const ny = 0.4 * y + 0.7 * x + nrm();   // x causes y
      x = nx; y = ny; rows.push({ x, y });
    }
    // signature is (data, y, x, lags): does x Granger-cause y?
    const forward = runGrangerCausality(rows, 'y', 'x', 2);
    const reverse = runGrangerCausality(rows, 'x', 'y', 2);
    expect(forward.isGranger).toBe(true);
    expect(reverse.isGranger).toBe(false);
    expect(forward.fStat).toBeGreaterThan(reverse.fStat);
  });

  /**
   * The optimizer starts at alpha = 0.1, beta = 0.8. Testing recovery of a
   * process whose true parameters are near those starting values cannot
   * distinguish a converged fit from one that never moved — an earlier version
   * of this test passed even with the simplex crippled to two iterations.
   * The primary case below is therefore deliberately far from initialization.
   */
  const simulateGarch = (s: number, omega: number, alpha: number, beta: number) => {
    setSeed(s);
    const r: number[] = []; let h = omega / (1 - alpha - beta);
    for (let i = 0; i < 3500; i++) {
      h = omega + alpha * ((r[i - 1] ?? 0) ** 2) + beta * h;
      r.push(Math.sqrt(h) * nrm());
    }
    return r.slice(500);   // discard burn-in
  };

  it('GARCH moves away from its starting values to recover the true parameters', () => {
    // True (0.20, 0.25, 0.60) vs initialization (-, 0.10, 0.80): the optimizer
    // must travel a long way in both alpha and beta to pass this.
    const fits = [77, 88, 99].map(s => runGARCH(simulateGarch(s, 0.20, 0.25, 0.60), 1, 1));
    const mean = (f: (g: any) => number) => fits.reduce((a, g) => a + f(g), 0) / fits.length;
    expect(Math.abs(mean(g => g.alpha) - 0.25)).toBeLessThan(0.08);
    expect(Math.abs(mean(g => g.beta) - 0.60)).toBeLessThan(0.12);
    expect(Math.abs(mean(g => g.omega) - 0.20)).toBeLessThan(0.10);
    // and specifically not still sitting at the initial alpha/beta
    expect(Math.abs(mean(g => g.alpha) - 0.10)).toBeGreaterThan(0.05);
    expect(Math.abs(mean(g => g.beta) - 0.80)).toBeGreaterThan(0.05);
  });

  it('GARCH respects its parameter constraints without resting on them', () => {
    // Regression guard: the previous optimizer always returned omega at its
    // 1e-4 floor and persistence at the 0.99 rescale ceiling, for every input.
    const fits = [123, 456, 789].map(s => runGARCH(simulateGarch(s, 0.05, 0.10, 0.85), 1, 1));
    for (const g of fits) {
      expect(g.omega).toBeGreaterThan(1.5e-4);
      expect(Math.abs(g.persistence - 0.99)).toBeGreaterThan(1e-6);
      expect(g.persistence).toBeLessThan(1);
      expect(g.alpha).toBeGreaterThan(0);
      expect(g.beta).toBeGreaterThan(0);
      expect(g.conditionalVariance.every(v => v > 0)).toBe(true);
    }
    // estimates must differ across samples; identical values indicate a boundary
    expect(new Set(fits.map(g => g.omega.toFixed(6))).size).toBeGreaterThan(1);
  });

  it('GARCH estimates are deterministic for the same input', () => {
    setSeed(555);
    const r: number[] = []; let h = 1;
    for (let i = 0; i < 1200; i++) { h = 0.05 + 0.1 * ((r[i - 1] ?? 0) ** 2) + 0.85 * h; r.push(Math.sqrt(h) * nrm()); }
    const a = runGARCH(r, 1, 1), b = runGARCH(r, 1, 1);
    expect(a.omega).toBe(b.omega);
    expect(a.alpha).toBe(b.alpha);
    expect(a.beta).toBe(b.beta);
  });
});

describe('Panel FE inside estimateModel', () => {
  const wellConditioned = () => {
    setSeed(12345);
    const rows: any[] = [];
    for (let f = 1; f <= 10; f++) {
      const alpha = (f - 5.5) * 12;
      for (let t = 1; t <= 20; t++) {
        const cap = 100 + 40 * rnd() + t * 1.5;
        const val = 200 + 60 * rnd() - t * 0.8;
        rows.push({ firm: `F${f}`, year: 1980 + t, cap, val, inv: 20 + alpha + 0.60 * cap + 0.30 * val + (rnd() - 0.5) * 6 });
      }
    }
    return rows;
  };

  it('recovers the true within-slopes', () => {
    const res = estimateModel('Panel FE', {
      data: wellConditioned(), yVar: 'inv', xVars: ['cap', 'val'], entityVar: 'firm', timeVar: 'year',
    });
    expect(est(res, 'cap')).toBeCloseTo(0.60, 1);
    expect(est(res, 'val')).toBeCloseTo(0.30, 1);
  });

  it('reports a usable intercept standard error', () => {
    // Regression guard: the intercept previously carried stdError = 0 and
    // pValue = 0, which rendered as a perfectly significant constant.
    const res = estimateModel('Panel FE', {
      data: wellConditioned(), yVar: 'inv', xVars: ['cap', 'val'], entityVar: 'firm', timeVar: 'year',
    });
    const ic = coef(res, 'Intercept');
    expect(ic.stdError).toBeGreaterThan(0);
    expect(Number.isFinite(ic.stdError)).toBe(true);
    expect(ic.tStat).toBeCloseTo(ic.estimate / ic.stdError, 9);
    expect(ic.pValue).toBeGreaterThanOrEqual(0);
    expect(ic.pValue).toBeLessThanOrEqual(1);
    expect(ic.confLow).toBeLessThan(ic.confHigh);
  });

  it('detects and reports perfectly collinear regressors', () => {
    // Regression guard: the default 1e-15 tolerance failed to detect exact
    // collinearity after the within transformation, and the estimator returned
    // an arbitrary split of the effect across the two dependent columns.
    setSeed(1);
    const rows: any[] = [];
    for (let f = 1; f <= 10; f++) {
      for (let t = 1; t <= 20; t++) {
        const cap = 100 + f * 5 + t * 3;
        rows.push({ firm: `F${f}`, year: 1980 + t, cap, val: 2 * cap + 7, inv: 50 + f * 10 + t * 2 });
      }
    }
    const res = estimateModel('Panel FE', {
      data: rows, yVar: 'inv', xVars: ['cap', 'val'], entityVar: 'firm', timeVar: 'year',
    });
    expect(res.droppedVariables).toHaveLength(1);
    expect(est(res, 'cap')).toBeCloseTo(2 / 3, 6);   // the identified combined effect
    expect(res.df).toBe(200 - 10 - 1);                // rank-adjusted, not k-adjusted
  });
});
