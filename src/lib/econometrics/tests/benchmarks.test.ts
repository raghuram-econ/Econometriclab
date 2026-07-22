import { describe, it, expect } from '@jest/globals';
import { estimateModel } from '../estimators';
import { GRUNFELD_DATA } from './fixtures/grunfeld';
import { MROZ_DATA } from './fixtures/mroz';

describe('Econometrics Benchmarks (Stata Validation)', () => {
  it('OLS with HC1 on Mroz (Labor Supply)', () => {
    const result = estimateModel('Robust OLS', {
      data: MROZ_DATA,
      yVar: 'hoursw',
      xVars: ['income', 'educw', 'experience', 'agew', 'child6', 'child618'],
      includeIntercept: true,
      robustType: 'HC1'
    });

    // Validated OLS coefficients with HC1 standard errors on Mroz (raw data specification)
    const ref = {
      'Intercept': 1615.90045,
      'income': 0.011927,
      'educw': 0.724403,
      'experience': 48.664049,
      'agew': -35.719522,
      'child6': -447.302479,
      'child618': -37.754720
    };

    result.coefficients.forEach(c => {
      const expected = ref[c.variable as keyof typeof ref];
      expect(c.estimate).toBeCloseTo(expected, 4);
    });
  });

  it('Panel Fixed Effects on Grunfeld (Investment)', () => {
    // Slicing to 200 rows matches the classic 10-firm Grunfeld dataset
    const result = estimateModel('Panel FE', {
      data: GRUNFELD_DATA.slice(0, 200),
      yVar: 'invest',
      xVars: ['value', 'capital'],
      entityVar: 'firm',
      timeVar: 'year'
    });

    // Stata reference results (xtreg inv value capital, fe) on 10 firms
    const ref = {
      'value': 0.110124,
      'capital': 0.310065,
      'Intercept': -58.7439
    };

    result.coefficients.forEach(c => {
      const expected = ref[c.variable as keyof typeof ref];
      expect(c.estimate).toBeCloseTo(expected, 4);
    });
  });

  it('Panel Random Effects on Grunfeld (Investment)', () => {
    // Slicing to 200 rows matches the classic 10-firm Grunfeld dataset
    const result = estimateModel('Panel RE', {
      data: GRUNFELD_DATA.slice(0, 200),
      yVar: 'invest',
      xVars: ['value', 'capital'],
      entityVar: 'firm',
      timeVar: 'year'
    });

    // Swamy-Arora GLS random effects on 10-firm Grunfeld dataset
    const ref = {
      'value': 0.109781,
      'capital': 0.308113,
      'Intercept': -57.834415
    };

    result.coefficients.forEach(c => {
      const expected = ref[c.variable as keyof typeof ref];
      expect(c.estimate).toBeCloseTo(expected, 4);
    });
  });
});
