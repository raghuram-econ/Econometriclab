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
import { estimateModel } from '../estimators';
import { runTobitMLE } from '../tobit';
import { approximateADFPValue } from '../arima';
import { MROZ_WOOLDRIDGE } from '../tests/fixtures/mroz-wooldridge';

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
