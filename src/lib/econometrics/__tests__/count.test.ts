import { runPoissonMLE, runNegBinomialMLE } from '../count';

describe('Count Data Econometric Models', () => {
  const testData = [
    { y: 1, x1: 0.5, x2: 1.2 },
    { y: 2, x1: 1.1, x2: 0.8 },
    { y: 0, x1: -0.2, x2: 1.5 },
    { y: 4, x1: 1.8, x2: 0.5 },
    { y: 1, x1: 0.4, x2: 1.1 },
    { y: 5, x1: 2.2, x2: 0.3 },
    { y: 0, x1: -0.5, x2: 1.8 },
    { y: 3, x1: 1.5, x2: 0.9 },
    { y: 2, x1: 0.8, x2: 1.0 },
    { y: 7, x1: 2.5, x2: 0.2 },
  ];

  test('Poisson MLE: Estimates convergent parameters and handles listwise deletion', () => {
    const result = runPoissonMLE(testData, 'y', ['x1', 'x2'], true);

    expect(result.n).toBe(10);
    expect(result.df).toBe(7);
    expect(result.coefficients.length).toBe(3);

    const intercept = result.coefficients.find(c => c.variable === 'Intercept');
    const x1 = result.coefficients.find(c => c.variable === 'x1');
    const x2 = result.coefficients.find(c => c.variable === 'x2');

    expect(intercept).toBeDefined();
    expect(x1).toBeDefined();
    expect(x2).toBeDefined();

    expect(intercept!.estimate).not.toBeNaN();
    expect(x1!.estimate).toBeGreaterThan(0); // positive relationship with y
    expect(x2!.estimate).toBeLessThan(0);    // negative relationship with y

    expect(result.logLikelihood).toBeLessThan(0);
    expect(result.aic).toBeGreaterThan(0);
    expect(result.bic).toBeGreaterThan(0);
    expect(result.residuals!.length).toBe(10);
  });

  test('Negative Binomial MLE: Alternating joint optimization produces proper estimates and SEs', () => {
    const result = runNegBinomialMLE(testData, 'y', ['x1', 'x2'], true);

    expect(result.n).toBe(10);
    expect(result.df).toBe(7);
    expect(result.coefficients.length).toBe(3);

    const intercept = result.coefficients.find(c => c.variable === 'Intercept');
    const x1 = result.coefficients.find(c => c.variable === 'x1');
    const x2 = result.coefficients.find(c => c.variable === 'x2');

    expect(intercept).toBeDefined();
    expect(x1).toBeDefined();
    expect(x2).toBeDefined();

    expect(intercept!.estimate).not.toBeNaN();
    expect(x1!.estimate).toBeGreaterThan(0);
    expect(x2!.estimate).toBeLessThan(0);

    // Standard errors must be non-zero and non-NaN
    expect(intercept!.stdError).toBeGreaterThan(0);
    expect(x1!.stdError).toBeGreaterThan(0);
    expect(x2!.stdError).toBeGreaterThan(0);

    expect(result.logLikelihood).toBeLessThan(0);
    expect(result.aic).toBeGreaterThan(0);
    expect(result.bic).toBeGreaterThan(0);
  });
});
