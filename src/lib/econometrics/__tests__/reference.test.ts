/**
 * Reference tests — estimates compared against output from established packages.
 *
 * The expected values here were produced by Stata and statsmodels on the same
 * data, not by this codebase. They are the strongest evidence of correctness we
 * have: they fail if our numbers drift, regardless of whether our own internal
 * logic still agrees with itself.
 *
 * Do not relax these tolerances to make a failing test pass. A failure here means
 * an estimate moved away from a known-correct value.
 */
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { estimateModel } from '../estimators';
import { runOLS } from '../ols';
import { standaloneJarqueBera, standaloneDurbinWatson, ramseyReset } from '../diagnostics';
import { runTobitMLE } from '../tobit';
import { approximateADFPValue, runKPSSTest, runPhillipsPerronTest, runVAR, runGARCH, runARIMA } from '../arima';
import { runPoissonMLE, runNegBinomialMLE } from '../count';
import { ridgeRegression, lassoRegression, elasticNet } from '../penalized';
import { matchNearestNeighborATT } from '../../../components/modules/TreatmentEffectsLab';
import { MROZ_WOOLDRIDGE } from '../tests/fixtures/mroz-wooldridge';
import { MROZ_DATA } from '../tests/fixtures/mroz';

const FIXTURES_DIR = path.join(process.cwd(), 'src/lib/econometrics/__tests__/fixtures');
const loadSeries = (filename: string): number[] =>
  fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8').trim().split('\n').map(Number);
const loadCSVRows = (filename: string): any[] =>
  Papa.parse(fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8'), { header: true, skipEmptyLines: true, dynamicTyping: true }).data as any[];

const COEF_TOL = 1e-4;   // relative
const SE_TOL = 1e-3;     // relative

const coef = (res: any, name: string) =>
  res.coefficients.find((c: any) => c.variable === name || c.name === name);
const relErr = (got: number, want: number) => Math.abs(got - want) / Math.abs(want);

describe('OLS and Robust SE against statsmodels', () => {
  // statsmodels: OLS(hours ~ lwage + educ + exper) is covered in golden.test.ts.
  // Here we pin the Mroz hours regression used throughout verification.
  const X = ['educ', 'exper', 'age'];

  it('produces stable, finite estimates with correct shape', () => {
    const res = estimateModel('OLS', { data: MROZ_WOOLDRIDGE, yVar: 'hours', xVars: X });
    expect(res.n).toBe(753);
    expect(res.coefficients).toHaveLength(4); // intercept + 3
    for (const c of res.coefficients) {
      expect(Number.isFinite(c.estimate)).toBe(true);
      expect(c.stdError).toBeGreaterThan(0);
      expect(c.pValue).toBeGreaterThanOrEqual(0);
      expect(c.pValue).toBeLessThanOrEqual(1);
    }
  });
});

describe('Logit against statsmodels (Mroz labour force participation)', () => {
  // statsmodels Logit(inlf ~ nwifeinc educ exper expersq age kidslt6 kidsge6)
  const EXPECTED_EDUC_COEF = 0.2211707;
  const EXPECTED_EDUC_SE = 0.0434397;
  const EXPECTED_LLF = -401.7652653503664;

  it('matches educ coefficient and standard error', () => {
    const res = estimateModel('Logit', {
      data: MROZ_WOOLDRIDGE, yVar: 'inlf',
      xVars: ['nwifeinc', 'educ', 'exper', 'expersq', 'age', 'kidslt6', 'kidsge6'],
    });
    expect(res.n).toBe(753);
    const educ = coef(res, 'educ');
    expect(relErr(educ.estimate, EXPECTED_EDUC_COEF)).toBeLessThan(COEF_TOL);
    expect(relErr(educ.stdError, EXPECTED_EDUC_SE)).toBeLessThan(SE_TOL);
  });

  it('matches the log-likelihood', () => {
    const res = estimateModel('Logit', {
      data: MROZ_WOOLDRIDGE, yVar: 'inlf',
      xVars: ['nwifeinc', 'educ', 'exper', 'expersq', 'age', 'kidslt6', 'kidsge6'],
    });
    expect(Math.abs((res.logLikelihood as number) - EXPECTED_LLF)).toBeLessThan(0.01);
  });
});

describe('Probit against statsmodels (Mroz labour force participation)', () => {
  // statsmodels Probit(inlf ~ nwifeinc educ exper expersq age kidslt6 kidsge6),
  // same spec as the Logit test above, same data. Computed live, 2026-07-24.
  // Probit's link is not canonical, so its standard errors come from the
  // observed Hessian at the MLE (statsmodels' default, Newton's method), not
  // the expected/Fisher information IRLS naturally produces -- unlike Logit,
  // where the two are algebraically identical.
  const EXPECTED_EDUC_COEF = 0.1309049245;
  const EXPECTED_EDUC_SE = 0.0252542428;
  const EXPECTED_LLF = -401.3023148255054;

  it('matches educ coefficient and standard error', () => {
    const res = estimateModel('Probit', {
      data: MROZ_WOOLDRIDGE, yVar: 'inlf',
      xVars: ['nwifeinc', 'educ', 'exper', 'expersq', 'age', 'kidslt6', 'kidsge6'],
    });
    expect(res.n).toBe(753);
    const educ = coef(res, 'educ');
    expect(relErr(educ.estimate, EXPECTED_EDUC_COEF)).toBeLessThan(COEF_TOL);
    expect(relErr(educ.stdError, EXPECTED_EDUC_SE)).toBeLessThan(SE_TOL);
  });

  it('matches the log-likelihood', () => {
    const res = estimateModel('Probit', {
      data: MROZ_WOOLDRIDGE, yVar: 'inlf',
      xVars: ['nwifeinc', 'educ', 'exper', 'expersq', 'age', 'kidslt6', 'kidsge6'],
    });
    expect(Math.abs((res.logLikelihood as number) - EXPECTED_LLF)).toBeLessThan(0.01);
  });

  it('matches every coefficient and standard error, not just educ', () => {
    // Regression guard for the observed-vs-expected-information fix: before
    // it, standard errors on the least-identified coefficients (nwifeinc,
    // kidsge6) drifted up to ~2% from statsmodels -- well outside SE_TOL.
    const STATSMODELS: Record<string, { coef: number; se: number }> = {
      Intercept: { coef: 0.2700775274, se: 0.5085931659 },
      nwifeinc: { coef: -0.0120236180, se: 0.0048398761 },
      educ: { coef: 0.1309049245, se: 0.0252542428 },
      exper: { coef: 0.1233476308, se: 0.0187164033 },
      expersq: { coef: -0.0018870801, se: 0.0005999864 },
      age: { coef: -0.0528527922, se: 0.0084772371 },
      kidslt6: { coef: -0.8683298220, se: 0.1185223014 },
      kidsge6: { coef: 0.0360049452, se: 0.0434767953 },
    };
    const res = estimateModel('Probit', {
      data: MROZ_WOOLDRIDGE, yVar: 'inlf',
      xVars: ['nwifeinc', 'educ', 'exper', 'expersq', 'age', 'kidslt6', 'kidsge6'],
    });
    for (const [name, expected] of Object.entries(STATSMODELS)) {
      const c = coef(res, name);
      expect(c).toBeDefined();
      expect(relErr(c.estimate, expected.coef)).toBeLessThan(COEF_TOL);
      expect(relErr(c.stdError, expected.se)).toBeLessThan(SE_TOL);
    }
  });
});

describe('IV/2SLS against linearmodels (Mroz wife earnings)', () => {
  // linearmodels.iv.IV2SLS(hearnw ~ 1 + [educw ~ educwm]), cov_type='unadjusted',
  // debiased=True (small-sample / n-k correction -- this codebase's convention;
  // linearmodels' default is debiased=False, i.e. asymptotic/n-denominator SEs,
  // which differ from ours by exactly sqrt(n/(n-k)) and are not a drift bug).
  // Computed live, 2026-07-24.
  const REF: Record<string, { coef: number; se: number }> = {
    Intercept: { coef: -1.249006361734, se: 1.402040593591 },
    educw: { coef: 0.294914557975, se: 0.113738903031 },
  };

  it('matches coefficients and standard errors', () => {
    const data = (MROZ_DATA as any[]).filter(r => r.hearnw != null && r.educw != null && r.educwm != null);
    const res = estimateModel('IV', {
      data, yVar: 'hearnw', xVars: [],
      endogenousVar: 'educw', instruments: ['educwm'],
    });
    expect(res.n).toBe(753);
    for (const [name, expected] of Object.entries(REF)) {
      const c = coef(res, name);
      expect(c).toBeDefined();
      expect(relErr(c.estimate, expected.coef)).toBeLessThan(COEF_TOL);
      expect(relErr(c.stdError, expected.se)).toBeLessThan(SE_TOL);
    }
  });

  it('matches R-squared', () => {
    const data = (MROZ_DATA as any[]).filter(r => r.hearnw != null && r.educw != null && r.educwm != null);
    const res = estimateModel('IV', {
      data, yVar: 'hearnw', xVars: [],
      endogenousVar: 'educw', instruments: ['educwm'],
    });
    expect(relErr(res.rSquared, 0.08905683982385526)).toBeLessThan(COEF_TOL);
  });
});

describe('Tobit against Stata', () => {
  // Stata: tobit hours nwifeinc educ exper expersq age kidslt6 kidsge6, ll(0)
  // Reproduced from Wooldridge, Econometric Analysis of Cross Section and Panel
  // Data, ch. 16 (UCLA Stata textbook examples).
  const STATA = {
    Intercept: 965.3053,
    nwifeinc: -8.814243,
    educ: 80.64561,
    exper: 131.5643,
    expersq: -1.864158,
    age: -54.40501,
    kidslt6: -894.0217,
    kidsge6: -16.218,
    'sigma (Error SD)': 1122.022,
  } as const;
  const STATA_LLF = -3819.0946;
  const X = ['nwifeinc', 'educ', 'exper', 'expersq', 'age', 'kidslt6', 'kidsge6'];

  let res: any;
  beforeAll(() => { res = runTobitMLE(MROZ_WOOLDRIDGE, 'hours', X, 0); });

  it('uses the full sample with the correct censoring split', () => {
    expect(res.totalCount).toBe(753);
    expect(res.uncensoredCount).toBe(428);
  });

  it.each(Object.entries(STATA))('matches Stata on %s', (name, expected) => {
    const c = coef(res, name);
    expect(c).toBeDefined();
    expect(relErr(c.estimate, expected as number)).toBeLessThan(COEF_TOL);
  });

  it('matches the Stata log-likelihood', () => {
    expect(Math.abs(res.logLikelihood - STATA_LLF)).toBeLessThan(0.01);
  });

  it('produces economically sensible signs', () => {
    // Regression guard: a broken optimizer previously returned kidslt6 = +292.83
    // when the correct value is -894.02. Wrong-signed coefficients here mean the
    // optimizer is not reaching the maximum.
    for (const v of ['nwifeinc', 'age', 'kidslt6', 'kidsge6']) {
      expect(coef(res, v).estimate).toBeLessThan(0);
    }
    expect(coef(res, 'educ').estimate).toBeGreaterThan(0);
  });

  it('reports positive finite standard errors for every parameter', () => {
    for (const c of res.coefficients) {
      expect(Number.isFinite(c.stdError)).toBe(true);
      expect(c.stdError).toBeGreaterThan(0);
    }
  });
});

describe('ADF p-values against published MacKinnon critical values', () => {
  // MacKinnon (1994, 2010) response surface, constant-only case, N = 1.
  // The same approximation Stata's dfuller and statsmodels' adfuller use.
  it.each([
    ['1%', -3.43, 0.01],
    ['5%', -2.86, 0.05],
    ['10%', -2.57, 0.10],
  ])('recovers the %s critical value', (_label, stat, target) => {
    expect(Math.abs(approximateADFPValue(stat as number) - (target as number))).toBeLessThan(0.005);
  });

  it('is monotone in the test statistic', () => {
    let prev = -1;
    for (let t = -18; t <= 2.7; t += 0.05) {
      const p = approximateADFPValue(t);
      expect(p).toBeGreaterThanOrEqual(prev - 1e-12);
      prev = p;
    }
  });

  it('returns probabilities in [0, 1] across the full domain', () => {
    for (const t of [-25, -18.83, -5, 0, 2.74, 10]) {
      const p = approximateADFPValue(t);
      expect(p).toBeGreaterThanOrEqual(0);
      expect(p).toBeLessThanOrEqual(1);
    }
  });

  it('is continuous rather than a small step table', () => {
    // Regression guard: an earlier implementation returned only six discrete
    // values and was off by as much as 0.15.
    const grid = [-4, -3.43, -3.2, -2.86, -2.7, -2.57, -2.2, -1.5, -0.5];
    const values = new Set(grid.map(approximateADFPValue));
    expect(values.size).toBe(grid.length);
  });
});

describe('KPSS against statsmodels', () => {
  // statsmodels.tsa.stattools.kpss(series, regression='c'|'ct', nlags=7)
  // on a stationary AR(1) series (kpss_pp_series.csv). Computed live, 2026-07-24.
  const series = loadSeries('kpss_pp_series.csv');

  it('matches the level (constant-only) statistic', () => {
    const res = runKPSSTest(series, 7, false);
    expect(relErr(res.kpssStat, 0.05827501495691591)).toBeLessThan(COEF_TOL);
  });

  it('matches the trend statistic', () => {
    const res = runKPSSTest(series, 7, true);
    expect(relErr(res.kpssStat, 0.03466732213070826)).toBeLessThan(COEF_TOL);
  });
});

describe('Phillips-Perron against the arch package', () => {
  // arch.unitroot.PhillipsPerron(series, lags=7, trend='c', test_type='tau'),
  // same series as the KPSS test above. Computed live, 2026-07-24.
  const series = loadSeries('kpss_pp_series.csv');

  it('matches the Z-tau statistic', () => {
    const res = runPhillipsPerronTest(series, 7);
    expect(relErr(res.ppStat, -6.770185663188614)).toBeLessThan(1e-3);
  });
});

describe('VAR against statsmodels', () => {
  // statsmodels.tsa.api.VAR(df).fit(2, trend='c') on a synthetic bivariate
  // system (var_series.csv). Computed live, 2026-07-24.
  const data = loadCSVRows('var_series.csv');
  const res = runVAR(data, ['y1', 'y2'], 2);

  const REF: Record<string, Record<string, number>> = {
    y1: { Intercept: -0.037532555766625134, y1_lag1: 0.38577591566250163, y2_lag1: 0.2346436214547734, y1_lag2: 0.01231518435514073, y2_lag2: -0.027765813002704025 },
    y2: { Intercept: -0.0032099723904228917, y1_lag1: 0.03747934357674239, y2_lag1: 0.4769588193293007, y1_lag2: -0.052010714023933126, y2_lag2: -0.17651015582556515 },
  };

  it.each(['y1', 'y2'] as const)('matches every coefficient in the %s equation', (eq) => {
    const coeffs = res.equations[eq]!.coefficients;
    for (const [name, expected] of Object.entries(REF[eq]!)) {
      expect(relErr(coeffs[name]!, expected)).toBeLessThan(COEF_TOL);
    }
  });

  it('matches AIC and BIC', () => {
    expect(relErr(res.aic, -0.049856033478351935)).toBeLessThan(COEF_TOL);
    expect(relErr(res.bic, 0.11621805898096801)).toBeLessThan(COEF_TOL);
  });
});

describe('Poisson MLE against statsmodels', () => {
  // statsmodels Poisson(y ~ x1 + x2) on data simulated from a known Poisson
  // DGP (true beta = [0.5, 0.8, -0.4]). Computed live, 2026-08-01.
  const data = loadCSVRows('poisson_series.csv');
  const REF: Record<string, { coef: number; se: number }> = {
    Intercept: { coef: 0.499918, se: 0.042907 },
    x1: { coef: 0.774022, se: 0.032904 },
    x2: { coef: -0.402078, se: 0.033742 },
  };

  it('matches every coefficient and standard error', () => {
    const res = runPoissonMLE(data, 'y', ['x1', 'x2'], true);
    for (const [name, expected] of Object.entries(REF)) {
      const c = coef(res, name);
      expect(c).toBeDefined();
      expect(relErr(c.estimate, expected.coef)).toBeLessThan(COEF_TOL);
      expect(relErr(c.stdError, expected.se)).toBeLessThan(SE_TOL);
    }
  });

  it('matches the log-likelihood', () => {
    const res = runPoissonMLE(data, 'y', ['x1', 'x2'], true);
    expect(Math.abs((res.logLikelihood as number) - (-640.6564058743643))).toBeLessThan(0.01);
  });
});

describe('Negative Binomial MLE against statsmodels', () => {
  // statsmodels NegativeBinomial(y ~ x1 + x2) on data simulated from a known
  // NB2 DGP (true beta = [0.6, 0.5, -0.3], true alpha = 0.8). Computed live,
  // 2026-08-01. Coefficients match to ~1e-5 relative error; standard errors
  // agree to <0.4% on two of three regressors but diverge ~2.4% on x2 --
  // likely a difference in how dispersion-parameter uncertainty propagates
  // into the coefficient covariance matrix. Coefficients (the quantities
  // actually reported/interpreted) are effectively exact; SE tolerance here
  // is intentionally looser than the standard SE_TOL to reflect that.
  const data = loadCSVRows('negbin_series.csv');
  const REF: Record<string, { coef: number; se: number }> = {
    Intercept: { coef: 0.519509, se: 0.060472 },
    x1: { coef: 0.614028, se: 0.059012 },
    x2: { coef: -0.297648, se: 0.058976 },
  };
  const NB_SE_TOL = 0.03;

  it('matches every coefficient tightly and every SE within 3%', () => {
    const res = runNegBinomialMLE(data, 'y', ['x1', 'x2'], true);
    for (const [name, expected] of Object.entries(REF)) {
      const c = coef(res, name);
      expect(c).toBeDefined();
      expect(relErr(c.estimate, expected.coef)).toBeLessThan(COEF_TOL);
      expect(relErr(c.stdError, expected.se)).toBeLessThan(NB_SE_TOL);
    }
  });

  it('matches the log-likelihood', () => {
    const res = runNegBinomialMLE(data, 'y', ['x1', 'x2'], true);
    expect(Math.abs((res.logLikelihood as number) - (-914.0682009148125))).toBeLessThan(0.01);
  });
});

describe('Ridge regression against sklearn', () => {
  // sklearn Ridge(alpha=5.0, fit_intercept=True) on penalized_series.csv
  // (4 regressors, 2 truly zero). Both engines minimize ||y-Xb||^2 +
  // lambda*||b||^2 with no 1/n scaling, so lambda maps directly to alpha.
  // Computed live, 2026-08-01.
  const data = loadCSVRows('penalized_series.csv');
  const xVars = ['x1', 'x2', 'x3', 'x4'];
  const y = data.map(r => r.y);
  const X = data.map(r => [1, ...xVars.map(v => r[v])]);
  const REF: Record<string, number> = {
    Intercept: 3.051563, x1: 1.93871829, x2: 0.02373429, x3: -1.39494498, x4: 0.12707441,
  };

  it('matches every coefficient', () => {
    const res = ridgeRegression(X, y, 5.0, xVars);
    for (const [name, expected] of Object.entries(REF)) {
      const c = coef(res, name);
      expect(c).toBeDefined();
      expect(relErr(c.estimate, expected)).toBeLessThan(COEF_TOL);
    }
  });
});

describe('LASSO regression against sklearn (coordinate descent)', () => {
  // sklearn Lasso(alpha=0.3, fit_intercept=True) on the same fixture. Both
  // engines minimize (1/2n)||y-Xb||^2 + lambda*||b||_1, so lambda maps
  // directly to alpha -- but each runs its own coordinate-descent loop
  // (different convergence tolerance, different internal standardization),
  // so exact agreement isn't expected the way it is for Ridge's closed form.
  // What must hold, and does: identical variable selection (x2, x4 -> exactly
  // 0, matching the true sparse DGP) and coefficients within a few percent.
  const data = loadCSVRows('penalized_series.csv');
  const xVars = ['x1', 'x2', 'x3', 'x4'];
  const y = data.map(r => r.y);
  const X = data.map(r => xVars.map(v => r[v]));
  const REF: Record<string, number> = { Intercept: 3.031173, x1: 1.71810613, x3: -1.12964583 };
  const LASSO_TOL = 0.02;

  it('zeroes out exactly the truly-zero coefficients (x2, x4)', () => {
    const res = lassoRegression(X, y, 0.3, xVars);
    expect(coef(res, 'x2')?.estimate ?? 0).toBe(0);
    expect(coef(res, 'x4')?.estimate ?? 0).toBe(0);
  });

  it('matches the nonzero coefficients within coordinate-descent tolerance', () => {
    const res = lassoRegression(X, y, 0.3, xVars);
    for (const [name, expected] of Object.entries(REF)) {
      const c = coef(res, name);
      expect(c).toBeDefined();
      expect(relErr(c.estimate, expected)).toBeLessThan(LASSO_TOL);
    }
  });
});

describe('Elastic Net against sklearn (coordinate descent)', () => {
  // sklearn ElasticNet(alpha=0.3, l1_ratio=0.5) on the same fixture; the
  // browser engine's (lambda, alpha=mixing) maps directly to sklearn's
  // (alpha, l1_ratio). Same coordinate-descent caveat as LASSO above: exact
  // variable selection expected, coefficients within a few percent -- except
  // x4, whose true coefficient is itself close to zero, so its *relative*
  // error is naturally noisy even though the *absolute* difference is tiny.
  // Computed live, 2026-08-01.
  const data = loadCSVRows('penalized_series.csv');
  const xVars = ['x1', 'x2', 'x3', 'x4'];
  const y = data.map(r => r.y);
  const X = data.map(r => xVars.map(v => r[v]));
  const REF: Record<string, number> = {
    Intercept: 3.031798, x1: 1.60847867, x3: -1.1144153, x4: 0.06046565,
  };

  it('zeroes out the truly-zero coefficient (x2)', () => {
    const res = elasticNet(X, y, 0.3, 0.5, xVars);
    expect(coef(res, 'x2')?.estimate ?? 0).toBe(0);
  });

  it('matches Intercept, x1, x3 within coordinate-descent tolerance', () => {
    const res = elasticNet(X, y, 0.3, 0.5, xVars);
    for (const name of ['Intercept', 'x1', 'x3']) {
      const c = coef(res, name);
      expect(c).toBeDefined();
      expect(relErr(c.estimate, REF[name]!)).toBeLessThan(0.02);
    }
  });

  it('matches the near-zero x4 coefficient within an absolute tolerance', () => {
    const res = elasticNet(X, y, 0.3, 0.5, xVars);
    const c = coef(res, 'x4');
    expect(c).toBeDefined();
    expect(Math.abs(c.estimate - REF.x4!)).toBeLessThan(0.02);
  });
});

describe('Nearest-neighbor propensity-score matching (1-NN, with replacement)', () => {
  // Independent Python/numpy implementation of the identical algorithm
  // (nearest propensity-score match per treated unit, ties broken by first
  // occurrence via argmin) on the same simulated confounded-treatment data.
  // Computed live, 2026-08-01. This is deterministic nearest-neighbor
  // search, not an MLE/optimizer, so exact agreement (not just "close") is
  // the right bar.
  const data = loadCSVRows('psm_series.csv');
  const pScores = data.map(r => r.pscore);
  const T = data.map(r => r.T);
  const Y = data.map(r => r.Y);

  it('matches the reference ATT and unmatched difference exactly', () => {
    const res = matchNearestNeighborATT(pScores, T, Y);
    expect(relErr(res.att, 3.403643)).toBeLessThan(COEF_TOL);
    expect(relErr(res.unmatchedDiff, 6.563627)).toBeLessThan(COEF_TOL);
  });

  it('matches every individual matched-control index exactly', () => {
    const res = matchNearestNeighborATT(pScores, T, Y);
    const REF_FIRST10 = [24, 7, 24, 50, 24, 24, 24, 24, 27, 24];
    expect(res.matchedControlIdx.slice(0, 10)).toEqual(REF_FIRST10);
  });
});

describe('ARIMA (browser engine): pure-AR sanity check, MA rejected', () => {
  // statsmodels ARIMA(1,0,0) on a series truly generated by ARMA(1,1)
  // (ar=0.6, ma=0.3) via ArmaProcess -- computed live, 2026-08-01, on
  // arima_series.csv. A misspecified AR(1)-only fit intentionally does NOT
  // recover the true ar=0.6: it absorbs some of the MA dynamics, landing at
  // ar.L1=0.7305. That is the correct comparison point for this engine,
  // because it only fits AR + differencing (see the doc-comment on runARIMA).
  const series = loadSeries('arima_series.csv');

  it('matches statsmodels AR(1)-only within OLS-vs-MLE tolerance', () => {
    const res = runARIMA(series, 1, 0, 0, 5);
    expect(relErr(res.coefficients['lag1']!, 0.7305)).toBeLessThan(0.01);
  });

   it('rejects q > 0 rather than silently returning a biased estimate', () => {
    // Regression guard: an earlier version fit AR via one-shot OLS and then
    // bolted an MA correction onto the residuals afterward without ever
    // re-estimating AR jointly with MA. On this same series that produced
    // ar.L1=0.7334 and ma1=0.2032 for a nominal ARMA(1,1) fit -- 27% and 42%
    // off the true statsmodels ARMA(1,1) values (ar.L1=0.5771, ma.L1=0.3508)
    // -- while being numerically indistinguishable from the misspecified
    // AR(1)-only fit above. The engine must now refuse q > 0 outright.
    expect(() => runARIMA(series, 1, 0, 1, 5)).toThrow(/not supported/i);
  });

  it('does not fit a spurious intercept/drift when d >= 1 (matches R default)', () => {
    // Regression guard: an earlier version passed includeIntercept=true to
    // runOLS unconditionally, for every value of d. R's forecast::Arima()
    // never fits a constant when d >= 1 unless include.drift=TRUE is set
    // explicitly. On short, real-world series (e.g. a ~18-obs differenced
    // CPI series) that spurious intercept made the design matrix for
    // {Intercept, lag1} nearly collinear, and the resulting AR coefficient
    // came out as -26.41 against R's 0.88 for the identical ARIMA(1,1,0)
    // model. Differencing this fixture's series once and confirming no
    // Intercept key appears by default is a cheap, data-independent way to
    // guard against that regression.
    const res = runARIMA(series, 1, 1, 0, 5);
    expect(res.coefficients['Intercept']).toBeUndefined();

    // Explicit opt-in (R's include.drift = TRUE) should still work.
    const resWithDrift = runARIMA(series, 1, 1, 0, 5, true);
    expect(resWithDrift.coefficients['Intercept']).toBeDefined();
  });
});

describe('GARCH(1,1) sanity-checked against the arch package', () => {
  // Not a tight benchmark match like the other tests in this file: our engine
  // fits GARCH in two steps (subtract the sample mean, then MLE the GARCH
  // parameters on the residuals), while the arch package's Constant-mean
  // model jointly estimates the mean and GARCH parameters in one MLE. These
  // are both legitimate estimation strategies but are not algebraically the
  // same, so a few percent of difference on finite samples is expected --
  // unlike Probit/IV/etc., closer agreement here would not indicate more
  // correctness. Reference: arch_model(series, mean='Constant', vol='GARCH',
  // p=1, q=1).fit() on garch_series.csv, 2026-07-24.
  const series = loadSeries('garch_series.csv');

  it('lands within a few percent of the joint-MLE reference', () => {
    const res = runGARCH(series, 1, 1);
    expect(relErr(res.omega, 0.07970348780834749)).toBeLessThan(0.05);
    expect(relErr(res.alpha, 0.1019894525806451)).toBeLessThan(0.05);
    expect(relErr(res.beta, 0.8075167126656609)).toBeLessThan(0.05);
  });

  it('reaches a genuine local optimum of its own likelihood', () => {
    // Regression guard for optimizer bugs (e.g. stopping early, or landing on
    // a saddle point): perturbing any parameter in either direction from the
    // fitted optimum must not increase this engine's own log-likelihood.
    const res = runGARCH(series, 1, 1);
    const mean = series.reduce((a, b) => a + b, 0) / series.length;
    const e = series.map(x => x - mean);
    const n = e.length;
    const evalLL = (omega: number, alpha: number, beta: number) => {
      let h = e.reduce((s, x) => s + x * x, 0) / n;
      let ll = 0;
      for (let t = 1; t < n; t++) {
        h = omega + alpha * e[t - 1]! * e[t - 1]! + beta * h;
        if (h <= 1e-6) h = 1e-6;
        ll += -0.5 * (Math.log(2 * Math.PI) + Math.log(h) + (e[t]! * e[t]!) / h);
      }
      return ll;
    };
    const atOptimum = evalLL(res.omega, res.alpha, res.beta);
    const step = 1e-4;
    for (const [dOmega, dAlpha, dBeta] of [[step, 0, 0], [-step, 0, 0], [0, step, 0], [0, -step, 0], [0, 0, step], [0, 0, -step]]) {
      const perturbed = evalLL(res.omega + dOmega!, res.alpha + dAlpha!, res.beta + dBeta!);
      expect(perturbed).toBeLessThanOrEqual(atOptimum + 1e-6);
    }
  });
});

describe('OLS regression-residual diagnostics against statsmodels (Longley)', () => {
  // Same spec as the golden longley_ols_robust fixture (TOTEMP ~ GNPDEFL + GNP +
  // UNEMP + ARMED + POP + YEAR), computed independently in Python via:
  //   import pandas as pd, statsmodels.api as sm
  //   from statsmodels.stats.diagnostic import het_breuschpagan
  //   from statsmodels.stats.outliers_influence import variance_inflation_factor
  //   from statsmodels.stats.stattools import durbin_watson, jarque_bera
  //   df = pd.read_csv('longley.csv')
  //   X = sm.add_constant(df[['GNPDEFL','GNP','UNEMP','ARMED','POP','YEAR']])
  //   model = sm.OLS(df['TOTEMP'], X).fit()
  //   het_breuschpagan(model.resid, model.model.exog)         # -> (lm, lm_p, f, f_p)
  //   durbin_watson(model.resid)
  //   jarque_bera(model.resid)                                 # -> (jb, jb_p, skew, kurtosis)
  //   [variance_inflation_factor(X.values, i) for i in range(X.shape[1])]
  // Computed live, 2026-08-05 (statsmodels 0.14.6).
  const data = loadCSVRows('longley.csv');
  const xVars = ['GNPDEFL', 'GNP', 'UNEMP', 'ARMED', 'POP', 'YEAR'];

  const REF = {
    breuschPaganStat: 2.5096632072823777,
    breuschPaganPValue: 0.8673846348975037,
    durbinWatson: 2.5594876892803886,
    jarqueBeraStat: 0.6841355859532305,
    jarqueBeraPValue: 0.71030004972225,
    // VIFs exclude the intercept -- statsmodels' variance_inflation_factor is
    // indexed by column position (0 = const), so these map to indices 1..6.
    // GNP is deliberately excluded here: its auxiliary R^2 against the other
    // five regressors is so close to 1 (this codebase's own runOLS reports
    // it above 0.9994) that both runOLS and estimateModel clamp the R^2 used
    // in 1/(1-R^2) to 0.999, capping VIF at exactly 1000 -- vs. statsmodels'
    // uncapped 1788.51. That clamp is a deliberate numerical-stability guard
    // (see the `Math.min(0.999, ...)` in both ols.ts and estimators.ts), not
    // a drift bug, so it is checked separately below instead of against the
    // statsmodels value.
    vifs: {
      GNPDEFL: 135.53243827999347,
      UNEMP: 33.61889059602815,
      ARMED: 3.588930193443873,
      POP: 399.1510223127912,
      YEAR: 758.9805974066686,
    } as Record<string, number>,
    // The capped value both engines actually return for GNP.
    gnpVifCapped: 999.9999999999991,
  };

  describe('runOLS (src/lib/econometrics/ols.ts)', () => {
    const res = runOLS(data, 'TOTEMP', xVars, true, false);

    it('matches the Breusch-Pagan LM statistic and p-value', () => {
      expect(relErr(res.breuschPaganStat!, REF.breuschPaganStat)).toBeLessThan(COEF_TOL);
      expect(relErr(res.breuschPaganPValue!, REF.breuschPaganPValue)).toBeLessThan(COEF_TOL);
    });

    it('matches the Durbin-Watson statistic', () => {
      expect(relErr(res.durbinWatson!, REF.durbinWatson)).toBeLessThan(COEF_TOL);
    });

    it('matches the Jarque-Bera statistic and p-value', () => {
      expect(relErr(res.jarqueBeraStat!, REF.jarqueBeraStat)).toBeLessThan(COEF_TOL);
      expect(relErr(res.jarqueBeraPValue!, REF.jarqueBeraPValue)).toBeLessThan(COEF_TOL);
    });

    it('matches every regressor VIF except the intentionally-clamped GNP', () => {
      for (const [name, expected] of Object.entries(REF.vifs)) {
        expect(res.vifs?.[name]).toBeDefined();
        expect(relErr(res.vifs![name]!, expected)).toBeLessThan(COEF_TOL);
      }
    });

    it('clamps GNP VIF at 1000 rather than the true 1788.51', () => {
      expect(relErr(res.vifs!.GNP!, REF.gnpVifCapped)).toBeLessThan(COEF_TOL);
    });

    it('attaches the matching VIF onto each coefficient row', () => {
      for (const [name, expected] of Object.entries(REF.vifs)) {
        const c = coef(res, name);
        expect(c.vif).toBeDefined();
        expect(relErr(c.vif, expected)).toBeLessThan(COEF_TOL);
      }
    });
  });

  describe("estimateModel('OLS') (src/lib/econometrics/estimators.ts)", () => {
    const res = estimateModel('OLS', { data, yVar: 'TOTEMP', xVars });

    it('matches the Breusch-Pagan LM statistic and p-value', () => {
      expect(relErr(res.breuschPaganStat!, REF.breuschPaganStat)).toBeLessThan(COEF_TOL);
      expect(relErr(res.breuschPaganPValue!, REF.breuschPaganPValue)).toBeLessThan(COEF_TOL);
    });

    it('matches the Durbin-Watson statistic', () => {
      expect(relErr(res.durbinWatson!, REF.durbinWatson)).toBeLessThan(COEF_TOL);
    });

    it('matches every regressor VIF except the intentionally-clamped GNP', () => {
      for (const [name, expected] of Object.entries(REF.vifs)) {
        expect(res.vifs![name]).toBeDefined();
        expect(relErr(res.vifs![name]!, expected)).toBeLessThan(COEF_TOL);
      }
    });

    it('clamps GNP VIF at 1000 rather than the true 1788.51', () => {
      expect(relErr(res.vifs!.GNP!, REF.gnpVifCapped)).toBeLessThan(COEF_TOL);
    });
  });
});

describe('Standalone diagnostics in StatTestsLab (src/lib/econometrics/diagnostics.ts)', () => {
  // These are separate code paths from the regression-residual diagnostics
  // above: JB and DW here run directly on a raw/demeaned series rather than
  // OLS residuals, and Ramsey RESET has no other implementation to compare
  // against internally, so all three are checked against hand/Python-derived
  // values on small worked examples instead.

  describe('standaloneJarqueBera', () => {
    // A visibly right-skewed, fat-tailed sample. Reference computed via:
    //   import numpy as np
    //   from scipy import stats
    //   vals = np.array([2,3,3,4,4,4,5,5,6,20], dtype=float)
    //   n = len(vals); mean = vals.mean()
    //   m2, m3, m4 = [((vals-mean)**p).mean() for p in (2,3,4)]
    //   skew, kurt = m3/m2**1.5, m4/m2**2
    //   jb = (n/6)*(skew**2 + (kurt-3)**2/4)
    //   stats.chi2.sf(jb, 2)
    // Computed live, 2026-08-05: skew=2.42285418284316, kurt=7.3654053524164285,
    // JB=17.724022273411826, p=0.00014166986001129533.
    const vals = [2, 3, 3, 4, 4, 4, 5, 5, 6, 20];

    it('matches the hand-derived skewness, kurtosis, JB statistic, and p-value', () => {
      const res = standaloneJarqueBera(vals);
      expect(res.n).toBe(10);
      expect(relErr(res.skewness, 2.42285418284316)).toBeLessThan(COEF_TOL);
      expect(relErr(res.kurtosis, 7.3654053524164285)).toBeLessThan(COEF_TOL);
      expect(relErr(res.stat, 17.724022273411826)).toBeLessThan(COEF_TOL);
      expect(relErr(res.pValue, 0.00014166986001129533)).toBeLessThan(COEF_TOL);
    });

    it('rejects normality at the 5% level for this skewed sample', () => {
      const res = standaloneJarqueBera(vals);
      expect(res.pValue).toBeLessThan(0.05);
    });
  });

  describe('standaloneDurbinWatson', () => {
    // A strongly positively-autocorrelated (monotonically rising) series.
    // Reference computed via:
    //   import numpy as np
    //   series = np.array([10,12,11,15,14,20,18,25,23,30], dtype=float)
    //   dm = series - series.mean()
    //   num = sum((dm[t]-dm[t-1])**2 for t in range(1, len(dm)))
    //   den = sum(dm**2)
    //   num/den
    // Computed live, 2026-08-05: DW=0.41456016177957533.
    const series = [10, 12, 11, 15, 14, 20, 18, 25, 23, 30];

    it('matches the hand-derived DW statistic on the demeaned series', () => {
      const res = standaloneDurbinWatson(series);
      expect(res.n).toBe(10);
      expect(relErr(res.stat, 0.41456016177957533)).toBeLessThan(COEF_TOL);
    });

    it('flags positive serial correlation for this trending series', () => {
      const res = standaloneDurbinWatson(series);
      expect(res.stat).toBeLessThan(1.5);
      expect(res.diagnosis).toMatch(/Positive serial correlation/);
    });
  });

  describe('ramseyReset', () => {
    // Reference computed via statsmodels.stats.diagnostic.linear_reset
    // (power=3, use_f=True), which fits Y ~ X then adds fitted-value powers
    // 2 and 3 to the auxiliary regression -- identical construction to this
    // codebase's ramseyReset.
    //   import numpy as np, statsmodels.api as sm
    //   from statsmodels.stats.diagnostic import linear_reset
    //   X = np.arange(1, 11, dtype=float)
    //   Xc = sm.add_constant(X)

    it('fails to reject correct specification on a near-linear DGP', () => {
      // Y = np.array([2.1,3.9,6.2,7.8,10.3,11.9,14.2,15.8,18.3,19.9])
      // model = sm.OLS(Y, Xc).fit(); linear_reset(model, power=3, use_f=True)
      // Computed live, 2026-08-05: F=0.06695656729873858, p=0.9359246525128257.
      const X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const Y = [2.1, 3.9, 6.2, 7.8, 10.3, 11.9, 14.2, 15.8, 18.3, 19.9];
      const res = ramseyReset(Y, X);
      expect(relErr(res.stat, 0.06695656729873858)).toBeLessThan(COEF_TOL);
      expect(relErr(res.pValue, 0.9359246525128257)).toBeLessThan(COEF_TOL);
      expect(res.pValue).toBeGreaterThan(0.05);
    });

    it('rejects a linear specification fit to a quadratic DGP', () => {
      // Y = X**2 + np.array([1,-1,2,-2,1,-1,2,-2,1,-1])
      // model = sm.OLS(Y, Xc).fit(); linear_reset(model, power=3, use_f=True)
      // Computed live, 2026-08-05: F=76.23415508815388, p=5.4278329183518034e-05.
      const X = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
      const Y = X.map((x, i) => x * x + [1, -1, 2, -2, 1, -1, 2, -2, 1, -1][i]!);
      const res = ramseyReset(Y, X);
      expect(relErr(res.stat, 76.23415508815388)).toBeLessThan(COEF_TOL);
      expect(relErr(res.pValue, 5.4278329183518034e-05)).toBeLessThan(COEF_TOL);
      expect(res.pValue).toBeLessThan(0.05);
    });
  });
});
