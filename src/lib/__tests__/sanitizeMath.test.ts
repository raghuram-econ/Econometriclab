import { sanitizeMath } from '../sanitizeMath';

describe('sanitizeMath', () => {
  it('converts \\frac{a}{b} to (a)/(b)', () => {
    expect(sanitizeMath('\\frac{\\partial Y}{\\partial K}')).toBe('(∂ Y)/(∂ K)');
  });

  it('converts greek letter commands to unicode', () => {
    expect(sanitizeMath('\\alpha + \\beta = 1')).toBe('α + β = 1');
  });

  it('strips $$...$$ delimiters, keeping the inner content', () => {
    expect(sanitizeMath('$$Y = C(Y - T) + I(r) + G$$')).toBe('Y = C(Y - T) + I(r) + G');
  });

  it('strips $...$ delimiters, keeping the inner content', () => {
    expect(sanitizeMath('$Y = C + I + G$')).toBe('Y = C + I + G');
  });

  it('handles a full Euler theorem statement', () => {
    const input = 'K \\frac{\\partial Y}{\\partial K} + L \\frac{\\partial Y}{\\partial L} = rY';
    expect(sanitizeMath(input)).toBe('K (∂ Y)/(∂ K) + L (∂ Y)/(∂ L) = rY');
  });

  it('leaves plain text untouched', () => {
    expect(sanitizeMath('Ordinary Least Squares with robust standard errors')).toBe(
      'Ordinary Least Squares with robust standard errors'
    );
  });

  it('handles empty and null-ish input safely', () => {
    expect(sanitizeMath('')).toBe('');
  });
});
