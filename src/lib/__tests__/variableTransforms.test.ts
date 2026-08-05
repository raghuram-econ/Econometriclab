/**
 * Tests for src/lib/variableTransforms.ts, extracted from DataLab.tsx's
 * handleTransform (the LN / SQR variable-transform buttons).
 *
 * Regression coverage for a bug fixed earlier in this effort: the LN
 * transform used to set log(non-positive) to 0, silently fabricating a data
 * point; it now returns null so the row is excluded from downstream
 * regressions via listwise deletion, matching how the rest of the app
 * already treats missing values.
 */
import { applyVariableTransform } from '../variableTransforms';

describe('applyVariableTransform', () => {
  describe('ln', () => {
    it('returns Math.log(x) for positive values', () => {
      expect(applyVariableTransform(1, 'ln')).toBe(Math.log(1));
      expect(applyVariableTransform(10, 'ln')).toBeCloseTo(Math.log(10), 12);
      expect(applyVariableTransform(0.5, 'ln')).toBeCloseTo(Math.log(0.5), 12);
    });

    it('returns null (not 0, not NaN) for zero', () => {
      const result = applyVariableTransform(0, 'ln');
      expect(result).toBeNull();
      expect(result).not.toBe(0);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('returns null (not 0, not NaN) for negative values', () => {
      const result = applyVariableTransform(-5, 'ln');
      expect(result).toBeNull();
      expect(result).not.toBe(0);
      expect(Number.isNaN(result)).toBe(false);
    });

    it('returns null for non-numeric input', () => {
      expect(applyVariableTransform('10', 'ln')).toBeNull();
      expect(applyVariableTransform(null, 'ln')).toBeNull();
      expect(applyVariableTransform(undefined, 'ln')).toBeNull();
      expect(applyVariableTransform(NaN, 'ln')).toBeNull();
    });
  });

  describe('sq', () => {
    it('squares positive values', () => {
      expect(applyVariableTransform(4, 'sq')).toBe(16);
    });

    it('squares negative values to a positive result (never square-roots)', () => {
      expect(applyVariableTransform(-4, 'sq')).toBe(16);
    });

    it('squares zero to zero', () => {
      expect(applyVariableTransform(0, 'sq')).toBe(0);
    });

    it('returns null for non-numeric input', () => {
      expect(applyVariableTransform('4', 'sq')).toBeNull();
      expect(applyVariableTransform(null, 'sq')).toBeNull();
      expect(applyVariableTransform(undefined, 'sq')).toBeNull();
    });
  });
});
