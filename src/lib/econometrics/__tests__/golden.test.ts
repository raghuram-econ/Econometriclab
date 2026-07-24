import { describe, it, expect } from '@jest/globals';
import fs from 'fs';
import path from 'path';
import Papa from 'papaparse';
import { estimateModel } from '../estimators';
import { runQuantileRegression } from '../quantile';

const FIXTURES_DIR = path.join(process.cwd(), 'src/lib/econometrics/__tests__/fixtures');

function loadCSV(filename: string): any[] {
  const content = fs.readFileSync(path.join(FIXTURES_DIR, filename), 'utf8');
  return Papa.parse(content, { header: true, skipEmptyLines: true, dynamicTyping: true }).data;
}

const goldenFixtures = JSON.parse(fs.readFileSync(path.join(FIXTURES_DIR, 'golden-fixtures.json'), 'utf8')).fixtures;

function assertClose(actual: number, expected: number, tolerance: number, label: string) {
  if (expected === 0) {
    if (Math.abs(actual) >= tolerance) {
      throw new Error(`${label}: expected close to 0, got ${actual} (tol: ${tolerance})`);
    }
    return;
  }
  const relErr = Math.abs(actual - expected) / Math.abs(expected);
  if (relErr > tolerance) {
    throw new Error(`${label} FAILED: expected ${expected}, got ${actual} (relErr: ${relErr}, tol: ${tolerance})`);
  }
}

describe('Econometrics Golden Fixtures', () => {
  it('longley_ols_robust: Classic and HC1/2/3', () => {
    const data = loadCSV('longley.csv');
    const f = goldenFixtures.longley_ols_robust;
    const xVars = ['GNPDEFL', 'GNP', 'UNEMP', 'ARMED', 'POP', 'YEAR'];
    
    // Classic OLS
    const resClassic = estimateModel('OLS', { data, yVar: f.depvar, xVars });
    Object.entries(f.classic).forEach(([varName, val]: [string, any]) => {
      const coef = resClassic.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.estimate, val.coef, 1e-6, `Longley Coef ${varName}`);
      assertClose(coef.stdError, val.se, 1e-4, `Longley SE ${varName}`);
    });
    assertClose(resClassic.rSquared, f.r2, 1e-6, 'Longley R2');

    // HC1 Robust
    const resHC1 = estimateModel('Robust OLS', { data, yVar: f.depvar, xVars, robustType: 'HC1' });
    Object.entries(f.HC1).forEach(([varName, expectedSE]: [string, any]) => {
      const coef = resHC1.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.stdError, expectedSE, 1e-4, `Longley HC1 SE ${varName}`);
    });

    // HC2 Robust
    const resHC2 = estimateModel('Robust OLS', { data, yVar: f.depvar, xVars, robustType: 'HC2' });
    Object.entries(f.HC2).forEach(([varName, expectedSE]: [string, any]) => {
      const coef = resHC2.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.stdError, expectedSE, 1e-4, `Longley HC2 SE ${varName}`);
    });

    // HC3 Robust
    const resHC3 = estimateModel('Robust OLS', { data, yVar: f.depvar, xVars, robustType: 'HC3' });
    Object.entries(f.HC3).forEach(([varName, expectedSE]: [string, any]) => {
      const coef = resHC3.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.stdError, expectedSE, 1e-4, `Longley HC3 SE ${varName}`);
    });
  });

  it('grunfeld_fe: Within Estimator', () => {
    const data = loadCSV('grunfeld.csv');
    const f = goldenFixtures.grunfeld_fe;
    const res = estimateModel('Panel FE', { data, yVar: 'invest', xVars: ['value', 'capital'], entityVar: 'firm' });
    
    Object.entries(f.coefficients).forEach(([varName, val]: [string, any]) => {
      const coef = res.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.estimate, val.coef, 1e-6, `Grunfeld FE Coef ${varName}`);
      if (varName !== 'const') {
        assertClose(coef.stdError, val.se, 1e-4, `Grunfeld FE SE ${varName}`);
      }
    });
    assertClose(res.rSquared, f.r2_within, 1e-6, 'Grunfeld FE R2');
  });

  it('grunfeld_fe_clustered: Clustered by firm', () => {
    const data = loadCSV('grunfeld.csv');
    const res = estimateModel('Panel FE', { data, yVar: 'invest', xVars: ['value', 'capital'], entityVar: 'firm', clusterVar: 'firm' });
    
    const valueCoef = res.coefficients.find(c => c.variable === 'value');
    const capitalCoef = res.coefficients.find(c => c.variable === 'capital');
    
    if (!valueCoef || !capitalCoef) throw new Error("Missing value or capital coefficient");
    assertClose(valueCoef.stdError, 0.01510827, 1e-4, 'Grunfeld FE Clustered SE value');
    assertClose(capitalCoef.stdError, 0.05247240, 1e-4, 'Grunfeld FE Clustered SE capital');
  });

  it('grunfeld_re: Swamy-Arora', () => {
    const data = loadCSV('grunfeld.csv');
    const f = goldenFixtures.grunfeld_re;
    const res = estimateModel('Panel RE', { data, yVar: 'invest', xVars: ['value', 'capital'], entityVar: 'firm' });
    
    Object.entries(f.coefficients).forEach(([varName, val]: [string, any]) => {
      const coef = res.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.estimate, val.coef, 1e-6, `Grunfeld RE Coef ${varName}`);
      assertClose(coef.stdError, val.se, 1e-4, `Grunfeld RE SE ${varName}`);
    });
  });

  it('mroz_logit: Logistic Regression', () => {
    const data = loadCSV('mroz.csv');
    const f = goldenFixtures.mroz_logit;
    const res = estimateModel('Logit', { data, yVar: 'lfp', xVars: ['educ', 'exper', 'age', 'kidslt6'] });
    
    Object.entries(f.coefficients).forEach(([varName, val]: [string, any]) => {
      const coef = res.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.estimate, val.coef, 1e-6, `Mroz Logit Coef ${varName}`);
      assertClose(coef.stdError, val.se, 1e-4, `Mroz Logit SE ${varName}`);
    });
    assertClose(res.logLikelihood!, f.llf, 1e-6, 'Mroz Logit LLF');
  });

  it('mroz_probit: Probit Regression', () => {
    const data = loadCSV('mroz.csv');
    const f = goldenFixtures.mroz_probit;
    const res = estimateModel('Probit', { data, yVar: 'lfp', xVars: ['educ', 'exper', 'age', 'kidslt6'] });

    Object.entries(f.coefficients).forEach(([varName, val]: [string, any]) => {
      const coef = res.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.estimate, val.coef, 1e-6, `Mroz Probit Coef ${varName}`);
      assertClose(coef.stdError, val.se, 1e-4, `Mroz Probit SE ${varName}`);
    });
    assertClose(res.logLikelihood!, f.llf, 1e-6, 'Mroz Probit LLF');
  });

  it('grunfeld_ols_clustered: OLS Clustered', () => {
    const data = loadCSV('grunfeld.csv');
    const f = goldenFixtures.grunfeld_ols_clustered;
    const res = estimateModel('OLS', { data, yVar: 'invest', xVars: ['value', 'capital'], clusterVar: 'firm' });
    
    Object.entries(f.coefficients).forEach(([varName, val]: [string, any]) => {
      const coef = res.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.estimate, val.coef, 1e-6, `Grunfeld OLS Clustered Coef ${varName}`);
      assertClose(coef.stdError, val.se, 1e-4, `Grunfeld OLS Clustered SE ${varName}`);
    });
  });

  it('engel_quantile_median: Median Regression', () => {
    const data = loadCSV('engel.csv');
    const f = goldenFixtures.engel_quantile_median;
    const res = runQuantileRegression(data, 'foodexp', ['income'], 0.5);
    
    Object.entries(f.coefficients).forEach(([varName, val]: [string, any]) => {
      const coef = res.coefficients.find(c => c.variable === (varName === 'const' ? 'Intercept' : varName));
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.estimate, val.coef, 1e-6, `Engel Quantile Coef ${varName}`);
      // Hall-Sheather bandwidth and linear interpolation match statsmodels within ~1.5%
      assertClose(coef.stdError, val.se, 1e-3, `Engel Quantile SE ${varName}`);
    });
  });

  it('did_synthetic: Difference-in-Differences', () => {
    const data = loadCSV('did_synthetic.csv');
    const f = goldenFixtures.did_synthetic;
    const res = estimateModel('DiD', {
      data, yVar: 'y', xVars: ['treated', 'post', 'x'],
      treatedVar: 'treated', postVar: 'post',
    });

    const labelMap: Record<string, string> = {
      const: 'Intercept',
      treated: 'treated',
      post: 'post',
      did: 'treated × post (DiD)',
      x: 'x',
    };
    Object.entries(f.coefficients).forEach(([varName, val]: [string, any]) => {
      const coef = res.coefficients.find(c => c.variable === labelMap[varName]);
      if (!coef) throw new Error(`Missing coefficient for ${varName}`);
      assertClose(coef.estimate, val.coef, 1e-6, `DiD Coef ${varName}`);
      assertClose(coef.stdError, val.se, 1e-4, `DiD SE ${varName}`);
    });
    assertClose(res.rSquared, f.r2, 1e-6, 'DiD R2');
  });
});
