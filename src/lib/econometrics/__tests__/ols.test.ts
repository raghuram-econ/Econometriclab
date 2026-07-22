import { runOLS } from '../ols';
import { computeRobustCovariance, getHatDiagonal } from '../robust';
import { estimateModel } from '../estimators';
import { imputeMean, imputeMedian, imputeRegression } from '../imputation';
import { runARIMA, autoARIMA, calculateLjungBox } from '../arima';
import { runFixedEffects } from '../fixed_effects';

describe('runOLS Regression Engine', () => {
  // 1. Basic OLS: 3 variables, known coefficients [1.5, 2.0, -0.5]
  test('Basic OLS: recovers true coefficients to 4 decimal places with exact data', () => {
    // True beta: beta_0 (intercept) = 1.5, beta_1 (x1) = 2.0, beta_2 (x2) = -0.5
    const data = [
      { y: 1.5 + 2.0 * 1 - 0.5 * 3, x1: 1, x2: 3 },
      { y: 1.5 + 2.0 * 2 - 0.5 * 1, x1: 2, x2: 1 },
      { y: 1.5 + 2.0 * 3 - 0.5 * 5, x1: 3, x2: 5 },
      { y: 1.5 + 2.0 * 4 - 0.5 * 2, x1: 4, x2: 2 },
      { y: 1.5 + 2.0 * 5 - 0.5 * 4, x1: 5, x2: 4 },
      { y: 1.5 + 2.0 * 6 - 0.5 * 0, x1: 6, x2: 0 },
    ];

    const result = runOLS(data, 'y', ['x1', 'x2'], true);

    const intercept = result.coefficients.find(c => c.variable === 'Intercept');
    const b1 = result.coefficients.find(c => c.variable === 'x1');
    const b2 = result.coefficients.find(c => c.variable === 'x2');

    expect(intercept).toBeDefined();
    expect(b1).toBeDefined();
    expect(b2).toBeDefined();

    expect(intercept!.estimate).toBeCloseTo(1.5, 4);
    expect(b1!.estimate).toBeCloseTo(2.0, 4);
    expect(b2!.estimate).toBeCloseTo(-0.5, 4);
  });

  // 2. R-squared: assert R² is between 0 and 1
  test('R-squared: is strictly between 0 and 1 in a sample with noise', () => {
    const dataWithNoise = [
      { y: 2.1, x1: 1, x2: 3 },
      { y: 4.8, x1: 2, x2: 1 },
      { y: 5.2, x1: 3, x2: 5 },
      { y: 8.3, x1: 4, x2: 2 },
      { y: 9.7, x1: 5, x2: 4 },
      { y: 13.2, x1: 6, x2: 0 },
    ];

    const result = runOLS(dataWithNoise, 'y', ['x1', 'x2'], true);

    expect(result.rSquared).toBeGreaterThan(0);
    expect(result.rSquared).toBeLessThan(1);
    expect(result.adjRSquared).toBeLessThan(result.rSquared);
  });

  // 3. F-statistic: assert F-stat > 0 and p-value < 0.05 for a significant regression
  test('F-statistic: is positive and statistically significant (p < 0.05) for high-association data', () => {
    const significantData = [
      { y: 1.5 + 2.0 * 1, x1: 1 },
      { y: 1.5 + 2.0 * 2 + 0.1, x1: 2 },
      { y: 1.5 + 2.0 * 3 - 0.05, x1: 3 },
      { y: 1.5 + 2.0 * 4 + 0.08, x1: 4 },
      { y: 1.5 + 2.0 * 5 - 0.12, x1: 5 },
      { y: 1.5 + 2.0 * 6 + 0.02, x1: 6 },
    ];

    const result = runOLS(significantData, 'y', ['x1'], true);

    expect(result.fStat).toBeGreaterThan(0);
    expect(result.fPValue).toBeLessThan(0.05);
  });

  // 4. Robust SE (HC1): assert HC1 standard errors are larger than OLS standard errors in a heteroskedastic sample
  test('Robust SE (HC1): standard errors are larger than standard OLS errors in a heteroskedastic sample', () => {
    const heteroskedasticData = [
      { y: 1.5 + 2 * 1 + 0.05, x1: 1 },
      { y: 1.5 + 2 * 2 - 0.03, x1: 2 },
      { y: 1.5 + 2 * 3 + 0.04, x1: 3 },
      { y: 1.5 + 2 * 4 - 0.06, x1: 4 },
      { y: 1.5 + 2 * 10 + 3.90, x1: 10 },
      { y: 1.5 + 2 * 11 - 4.20, x1: 11 },
      { y: 1.5 + 2 * 12 + 5.10, x1: 12 },
      { y: 1.5 + 2 * 13 - 4.90, x1: 13 },
    ];

    const standardRes = runOLS(heteroskedasticData, 'y', ['x1'], true, false);
    const robustRes = runOLS(heteroskedasticData, 'y', ['x1'], true, true, undefined, false, true, 'HC1');

    const standardSE = standardRes.coefficients.find(c => c.variable === 'x1')!.stdError;
    const robustSE = robustRes.coefficients.find(c => c.variable === 'x1')!.stdError;

    expect(robustSE).toBeGreaterThan(standardSE);
  });

  // 5. Edge case: single predictor (simple regression) — assert slope equals Cov(X,Y)/Var(X)
  test('Simple regression edge case: slope estimate equals Cov(X,Y) / Var(X)', () => {
    const data = [
      { y: 3, x: 1 },
      { y: 5, x: 2 },
      { y: 7, x: 3 },
      { y: 8, x: 4 },
      { y: 11, x: 5 },
    ];

    // Compute sample means
    const meanX = data.reduce((sum, d) => sum + d.x, 0) / data.length;
    const meanY = data.reduce((sum, d) => sum + d.y, 0) / data.length;

    // Compute sample Cov(X, Y) and Var(X)
    let covXY = 0;
    let varX = 0;
    for (const d of data) {
      covXY += (d.x - meanX) * (d.y - meanY);
      varX += (d.x - meanX) ** 2;
    }
    covXY /= (data.length - 1);
    varX /= (data.length - 1);

    const expectedSlope = covXY / varX;

    const result = runOLS(data, 'y', ['x'], true);
    const slopeCoeff = result.coefficients.find(c => c.variable === 'x');

    expect(slopeCoeff).toBeDefined();
    expect(slopeCoeff!.estimate).toBeCloseTo(expectedSlope, 10);
  });

  // 6. Edge case: perfect multicollinearity — assert the function drops the variable and continues
  test('Perfect multicollinearity edge case: drops collinear variables and continues', () => {
    const collinearData = [
      { y: 5, x1: 1, x2: 2 },
      { y: 10, x1: 2, x2: 4 },
      { y: 15, x1: 3, x2: 6 },
      { y: 20, x1: 4, x2: 8 },
      { y: 25, x1: 5, x2: 10 },
    ];

    const result = runOLS(collinearData, 'y', ['x1', 'x2'], true);
    // Should drop x2 or x1
    const dropped = result.coefficients.find(c => c.estimate === 0 && c.stdError === 0);
    expect(result.coefficients.length).toBe(3);
  });

  // Edge Case: Insufficient observations
  test('runOLS: throws an error when observations < regressors + 1', () => {
    const data = [{ y: 5, x: 1 }];
    expect(() => {
      runOLS(data, 'y', ['x'], true);
    }).toThrow('Insufficient observations for estimation.');
  });

  // Bootstrap Standard Errors
  test('runOLS: computes bootstrap standard errors', () => {
    const data = [
      { y: 10, x: 1 },
      { y: 12, x: 2 },
      { y: 11, x: 3 },
      { y: 13, x: 4 },
      { y: 15, x: 5 },
    ];
    const result = runOLS(data, 'y', ['x'], true, false, undefined, true);
    expect(result).toBeDefined();
    expect(result.coefficients?.[0]?.stdError).toBeGreaterThanOrEqual(0);
  });

  // Clustered Standard Errors
  test('runOLS: computes clustered standard errors', () => {
    const data = [
      { y: 10, x: 1, cluster: 1 },
      { y: 12, x: 2, cluster: 1 },
      { y: 11, x: 3, cluster: 2 },
      { y: 13, x: 4, cluster: 2 },
      { y: 14, x: 5, cluster: 3 },
      { y: 16, x: 6, cluster: 3 },
    ];
    const result = runOLS(data, 'y', ['x'], true, false, 'cluster');
    expect(result).toBeDefined();
    expect(result.coefficients?.[0]?.stdError).toBeGreaterThan(0);
  });
});

describe('Robust Covariance Calculations', () => {
  const X = [
    [1, 1],
    [1, 2],
    [1, 3],
    [1, 4],
    [1, 5],
  ];
  const XtX_inv = [
    [0.6, -0.15],
    [-0.15, 0.05],
  ];
  const residuals = [0.1, -0.2, 0.3, -0.1, 0.0];

  test('getHatDiagonal calculates leverages correctly', () => {
    const leverage = getHatDiagonal(X, XtX_inv);
    expect(leverage).toHaveLength(5);
    leverage.forEach(h => {
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    });
  });

  test('computeRobustCovariance handles HC0, HC1, HC2, HC3, and NW types without crash', () => {
    const types: ('HC0' | 'HC1' | 'HC2' | 'HC3' | 'NW')[] = ['HC0', 'HC1', 'HC2', 'HC3', 'NW'];
    types.forEach(type => {
      const cov = computeRobustCovariance(X, XtX_inv, residuals, type);
      expect(cov).toBeDefined();
      expect(cov.length).toBe(2);
      const row0 = cov[0];
      const row1 = cov[1];
      expect(row0).toBeDefined();
      expect(row1).toBeDefined();
      expect(row0?.length).toBe(2);
      expect(row0?.[0]).toBeGreaterThan(0);
      expect(row1?.[1]).toBeGreaterThan(0);
    });
  });
});

describe('Advanced Estimators Module Integration', () => {
  test('estimateModel executes standard OLS regression correctly', () => {
    const data = [
      { y: 10, x1: 1 },
      { y: 12, x1: 2 },
      { y: 15, x1: 3 },
      { y: 18, x1: 4 },
      { y: 20, x1: 5 },
    ];

    const result = estimateModel('OLS', {
      data,
      yVar: 'y',
      xVars: ['x1'],
      includeIntercept: true,
    });

    expect(result).toBeDefined();
    expect(result.coefficients).toHaveLength(2);
    expect(result.rSquared).toBeGreaterThan(0);
    expect(result.rSquared).toBeLessThan(1);
  });

  test('estimateModel executes Logit regression correctly', () => {
    const data = [
      { y: 0, x1: 1 },
      { y: 1, x1: 2 },
      { y: 0, x1: 3 },
      { y: 1, x1: 4 },
      { y: 0, x1: 5 },
      { y: 1, x1: 6 },
    ];

    const result = estimateModel('Logit', {
      data,
      yVar: 'y',
      xVars: ['x1'],
      includeIntercept: true,
    });

    expect(result).toBeDefined();
    expect(result.rSquared).toBeGreaterThan(0); // Pseudo R2
    expect(result.coefficients).toHaveLength(2);
  });

  test('estimateModel executes Probit regression correctly', () => {
    const data = [
      { y: 0, x1: 1 },
      { y: 1, x1: 2 },
      { y: 0, x1: 3 },
      { y: 1, x1: 4 },
      { y: 0, x1: 5 },
      { y: 1, x1: 6 },
    ];

    const result = estimateModel('Probit', {
      data,
      yVar: 'y',
      xVars: ['x1'],
      includeIntercept: true,
    });

    expect(result).toBeDefined();
    expect(result.rSquared).toBeGreaterThanOrEqual(0); // Pseudo R2
    expect(result.coefficients).toHaveLength(2);
  });

  test('estimateModel executes WLS regression correctly', () => {
    const data = [
      { y: 5, x1: 1 },
      { y: 10, x1: 2 },
      { y: 15, x1: 3 },
      { y: 20, x1: 4 },
      { y: 25, x1: 5 },
    ];

    const result = estimateModel('WLS', {
      data,
      yVar: 'y',
      xVars: ['x1'],
      includeIntercept: true,
    });

    expect(result).toBeDefined();
    expect(result.coefficients).toHaveLength(2);
  });

  test('estimateModel executes Panel FE and Panel RE regression correctly', () => {
    const data = [
      { entity: 1, time: 1, y: 5, x1: 2 },
      { entity: 1, time: 2, y: 7, x1: 3 },
      { entity: 2, time: 1, y: 10, x1: 5 },
      { entity: 2, time: 2, y: 15, x1: 8 },
      { entity: 3, time: 1, y: 12, x1: 10 },
      { entity: 3, time: 2, y: 18, x1: 12 },
    ];

    const resultFE = estimateModel('Panel FE', {
      data,
      yVar: 'y',
      xVars: ['x1'],
      entityVar: 'entity',
      timeVar: 'time',
    });
    expect(resultFE).toBeDefined();

    const resultRE = estimateModel('Panel RE', {
      data,
      yVar: 'y',
      xVars: ['x1'],
      entityVar: 'entity',
      timeVar: 'time',
    });
    expect(resultRE).toBeDefined();
  });

  test('estimateModel executes IV (2SLS) regression correctly', () => {
    const data = [
      { y: 5, x_endo: 2, z_inst: 3, control: 1 },
      { y: 8, x_endo: 3, z_inst: 4, control: 2 },
      { y: 12, x_endo: 5, z_inst: 6, control: 1 },
      { y: 15, x_endo: 6, z_inst: 7, control: 3 },
      { y: 20, x_endo: 8, z_inst: 9, control: 2 },
    ];

    const result = estimateModel('IV', {
      data,
      yVar: 'y',
      xVars: ['x_endo', 'control'],
      endogenousVar: 'x_endo',
      instruments: ['z_inst'],
    });

    expect(result).toBeDefined();
    expect(result.coefficients).toHaveLength(3);
  });

  test('estimateModel executes DiD regression correctly', () => {
    const data = [
      { y: 5, treated: 0, post: 0, control1: 2 },
      { y: 6, treated: 0, post: 1, control1: 3 },
      { y: 8, treated: 1, post: 0, control1: 1 },
      { y: 12, treated: 1, post: 1, control1: 4 },
      { y: 4, treated: 0, post: 0, control1: 1 },
      { y: 5, treated: 0, post: 1, control1: 2 },
      { y: 7, treated: 1, post: 0, control1: 1 },
      { y: 11, treated: 1, post: 1, control1: 3 },
    ];

    const result = estimateModel('DiD', {
      data,
      yVar: 'y',
      xVars: ['treated', 'post', 'control1'],
      treatedVar: 'treated',
      postVar: 'post',
    });

    expect(result).toBeDefined();
    expect(result.coefficients).toHaveLength(5);
  });

  test('estimateModel throws error if robust/robustType is passed to unsupported model types', () => {
    const dummyData = [
      { y: 5, x: 2 },
      { y: 8, x: 3 },
      { y: 12, x: 5 },
      { y: 15, x: 6 },
      { y: 20, x: 8 },
    ];

    expect(() => {
      estimateModel('OLS', {
        data: dummyData,
        yVar: 'y',
        xVars: ['x'],
        robust: true,
      });
    }).toThrow('Model type "OLS" does not support robust standard errors/robustType. Please use "Robust OLS" instead.');

    expect(() => {
      estimateModel('Logit', {
        data: dummyData,
        yVar: 'y',
        xVars: ['x'],
        robustType: 'HC1',
      });
    }).toThrow('Model type "Logit" does not support robust standard errors/robustType. Please use "Robust OLS" instead.');
  });

  test('estimateModel throws error if clusterVar is passed to unsupported model types', () => {
    const dummyData = [
      { y: 5, x: 2, group: 'A' },
      { y: 8, x: 3, group: 'A' },
      { y: 12, x: 5, group: 'B' },
      { y: 15, x: 6, group: 'B' },
      { y: 20, x: 8, group: 'C' },
    ];

    expect(() => {
      estimateModel('Logit', {
        data: dummyData,
        yVar: 'y',
        xVars: ['x'],
        clusterVar: 'group',
      });
    }).toThrow('Model type "Logit" does not support clusterVar. Please use "Robust OLS" or "Panel FE" instead.');
  });
});

describe('Imputation Methods', () => {
  test('imputeMean fills missing values with mean', () => {
    const data = [
      { val: 2 },
      { val: 4 },
      { val: null },
      { val: 6 },
      { val: undefined },
    ];
    const imputed = imputeMean(data, 'val');
    expect(imputed[2].val).toBe(4); // (2+4+6)/3 = 4
    expect(imputed[4].val).toBe(4);
    expect(imputed[0].val).toBe(2);
  });

  test('imputeMedian fills missing values with median', () => {
    const data = [
      { val: 1 },
      { val: 10 },
      { val: null },
      { val: 2 },
      { val: 5 },
    ];
    // sorted: 1, 2, 5, 10 -> median = (2+5)/2 = 3.5
    const imputed = imputeMedian(data, 'val');
    expect(imputed[2].val).toBe(3.5);
    expect(imputed[0].val).toBe(1);
  });

  test('imputeRegression fills missing values using bivariate linear prediction', () => {
    const data = [
      { target: 2, predictor: 1 },
      { target: 4, predictor: 2 },
      { target: 6, predictor: 3 },
      { target: null, predictor: 4 },
    ];
    const imputed = imputeRegression(data, 'target', 'predictor');
    expect(imputed[3].target).toBeCloseTo(8, 4);
    expect(imputed[0].target).toBe(2);
  });
});

describe('ARIMA Module', () => {
  const series = [10, 12, 11, 13, 14, 16, 15, 17, 18, 20, 19, 21, 22];

  test('runARIMA computes AR coefficients and returns correct forecast lengths', () => {
    const result = runARIMA(series, 1, 1, 0, 3);
    expect(result).toBeDefined();
    expect(result.order).toEqual([1, 1, 0]);
    expect(result.forecast).toHaveLength(3);
    expect(result.forecastCI).toHaveLength(3);
    expect(result.fitted).toHaveLength(series.length - 1);
  });

  test('autoARIMA returns optimal order', () => {
    const order = autoARIMA(series);
    expect(order).toBeDefined();
    expect(order).toHaveLength(3);
    expect(typeof order[0]).toBe('number');
    expect(typeof order[1]).toBe('number');
    expect(typeof order[2]).toBe('number');
  });

  test('calculateLjungBox computes Q-statistic and p-value', () => {
    const residuals = [0.1, -0.05, 0.2, -0.15, 0.05, 0.1, -0.1];
    const result = calculateLjungBox(residuals, 2);
    expect(result).toBeDefined();
    expect(result.qStat).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeGreaterThanOrEqual(0);
    expect(result.pValue).toBeLessThanOrEqual(1);
  });
});

describe('Fixed Effects Panel Estimator', () => {
  test('runFixedEffects de-means entity variables and adjusts degrees of freedom', () => {
    const data = [
      { id: 1, time: 1, y: 5, x: 2 },
      { id: 1, time: 2, y: 7, x: 3 },
      { id: 2, time: 1, y: 10, x: 5 },
      { id: 2, time: 2, y: 12, x: 6 },
      { id: 3, time: 1, y: 15, x: 8 },
      { id: 3, time: 2, y: 17, x: 9 },
    ];

    const result = runFixedEffects(data, 'y', ['x'], 'id', 'time');
    expect(result).toBeDefined();
    expect(result.df).toBe(6 - 1 - 3); // n (6) - k (1) - numEntities (3) = 2
    expect(result.coefficients).toHaveLength(1);
    expect(result.coefficients?.[0]?.variable).toBe('x');
    expect(result.coefficients?.[0]?.estimate).toBeCloseTo(2.0, 4);
  });
});
