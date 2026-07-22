import { getVariableTransformationWarning, getAllVariableSelectionWarnings } from '../econometrics/hygiene';

describe('Variable Selection Hygiene', () => {
  const dummyData = [
    { wage: 10, lwage: Math.log(10), age: 25, educ: 12 },
    { wage: 20, lwage: Math.log(20), age: 30, educ: 16 },
    { wage: 30, lwage: Math.log(30), age: 35, educ: 18 },
    { wage: 15, lwage: Math.log(15), age: 40, educ: 12 },
    { wage: 25, lwage: Math.log(25), age: 45, educ: 14 },
    { wage: 50, lwage: Math.log(50), age: 50, educ: 20 },
  ];

  test('detects level and log transformation by correlation', () => {
    const warning = getVariableTransformationWarning('wage', 'lwage', dummyData);
    expect(warning).not.toBeNull();
    expect(warning).toContain('likely the same variable in levels and logs');
  });

  test('detects level and log transformation by names as a fallback', () => {
    const warning = getVariableTransformationWarning('some_var', 'lsome_var', []);
    expect(warning).not.toBeNull();
    expect(warning).toContain('likely the same variable in levels and logs');
  });

  test('returns warning list for combinations of selected variables', () => {
    const warnings = getAllVariableSelectionWarnings('wage', ['lwage', 'educ'], dummyData);
    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0]).toContain('wage');
    expect(warnings[0]).toContain('lwage');
  });
});
