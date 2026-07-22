import { ridgeRegression, lassoRegression, elasticNet, crossValidateLambda } from '../penalized';

describe('Penalized Shrinkage Regression Engine', () => {
  // Setup synthetic data
  const X_raw = [
    [1.1, 2.3],
    [1.9, 0.8],
    [3.2, 5.1],
    [4.0, 2.2],
    [4.8, 3.9],
    [6.1, 0.1]
  ];
  const y = [
    1.5 + 2.0 * 1.1 - 0.5 * 2.3 + 0.1,
    1.5 + 2.0 * 1.9 - 0.5 * 0.8 - 0.05,
    1.5 + 2.0 * 3.2 - 0.5 * 5.1 + 0.12,
    1.5 + 2.0 * 4.0 - 0.5 * 2.2 - 0.08,
    1.5 + 2.0 * 4.8 - 0.5 * 3.9 + 0.05,
    1.5 + 2.0 * 6.1 - 0.5 * 0.1 - 0.15
  ];
  const xVars = ['x1', 'x2'];

  test('Ridge Regression: Estimates are shrunk as lambda increases', () => {
    const X_with_intercept = X_raw.map(row => [1, ...row]);

    // OLS equivalent (lambda = 0)
    const ols = ridgeRegression(X_with_intercept, y, 0, xVars);
    
    // Ridge (lambda = 10)
    const ridgeStrong = ridgeRegression(X_with_intercept, y, 10, xVars);

    const b1_ols = ols.coefficients.find(c => c.variable === 'x1')!.estimate;
    const b1_ridge = ridgeStrong.coefficients.find(c => c.variable === 'x1')!.estimate;

    const b2_ols = ols.coefficients.find(c => c.variable === 'x2')!.estimate;
    const b2_ridge = ridgeStrong.coefficients.find(c => c.variable === 'x2')!.estimate;

    // Standard shrinkage expectations: estimates are closer to 0
    expect(Math.abs(b1_ridge)).toBeLessThan(Math.abs(b1_ols));
    expect(Math.abs(b2_ridge)).toBeLessThan(Math.abs(b2_ols));
    expect(ridgeStrong.method).toBe('Ridge');
  });

  test('LASSO Regression: Selects variables by driving coefficients exactly to zero at high lambda', () => {
    // LASSO (high lambda = 10.0 should drive both coefficients to zero)
    const lassoStrong = lassoRegression(X_raw, y, 10, xVars);

    const b1_lasso = lassoStrong.coefficients.find(c => c.variable === 'x1')!.estimate;
    const b2_lasso = lassoStrong.coefficients.find(c => c.variable === 'x2')!.estimate;

    expect(b1_lasso).toBe(0);
    expect(b2_lasso).toBe(0);
    expect(lassoStrong.selectedVars).toHaveLength(0);
    expect(lassoStrong.method).toBe('LASSO');
  });

  test('Elastic Net: Mixes L1 and L2 penalties correctly', () => {
    const enet = elasticNet(X_raw, y, 0.5, 0.5, xVars);
    
    expect(enet.method).toBe('ElasticNet');
    expect(enet.alpha).toBe(0.5);
    expect(enet.coefficients).toBeDefined();
    expect(enet.rSquared).toBeGreaterThan(0);
  });

  test('crossValidateLambda: Identifies best lambda minimizing mean squared error', () => {
    const cv = crossValidateLambda(X_raw, y, 'lasso', xVars, [0.01, 0.1, 1, 10], 3);
    
    expect(cv.bestLambda).toBeDefined();
    expect(cv.cvResults).toHaveLength(4);
    expect(cv.cvResults?.[0]?.mse).toBeGreaterThan(0);
  });
});
