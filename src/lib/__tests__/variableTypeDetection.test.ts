/**
 * Tests for src/lib/variableTypeDetection.ts -- the shared column-type
 * inference used by both DataLab.tsx and DataUploadLab.tsx. This file had
 * zero test coverage prior to this change, despite being a single point of
 * failure for variable classification app-wide: a wrong classification here
 * corrupts which columns get offered as numeric vs categorical everywhere
 * downstream.
 *
 * The threshold tiers under test (per inferVariableType's own logic):
 *   numericRatio >= 0.8                => 'numeric'
 *   dateRatio    >= 0.8                => 'date'
 *   numericRatio >  0.4  (else)        => ambiguous, numeric-leaning
 *   numericRatio >  0.1  (else)        => ambiguous, categorical-leaning
 *   otherwise                          => 'categorical'
 *   totalNonEmpty === 0                => 'unknown' ("Column appears empty.")
 */
import { cleanNumeric, normalizeHeader, inferVariableType } from '../variableTypeDetection';

// Builds `count` rows of { [key]: value } for a single column, to match the
// `data: any[]` / `key: string` shape inferVariableType expects.
function buildColumn(key: string, values: any[]): any[] {
  return values.map(v => ({ [key]: v }));
}

describe('cleanNumeric', () => {
  it('passes through numbers unchanged', () => {
    expect(cleanNumeric(42)).toBe(42);
    expect(cleanNumeric(0)).toBe(0);
    expect(cleanNumeric(-3.5)).toBe(-3.5);
  });

  it('cleans dollar-formatted strings', () => {
    expect(cleanNumeric('$1,000')).toBe(1000);
  });

  it('cleans percent-formatted strings', () => {
    expect(cleanNumeric('50%')).toBe(50);
  });

  it('trims surrounding whitespace', () => {
    expect(cleanNumeric(' 12.3 ')).toBe(12.3);
  });

  it('cleans combined comma + decimal formatted strings', () => {
    expect(cleanNumeric('1,234.56')).toBe(1234.56);
  });

  it('returns null for non-numeric strings', () => {
    expect(cleanNumeric('abc')).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(cleanNumeric('')).toBeNull();
  });

  it('returns null for non-string, non-number values', () => {
    expect(cleanNumeric(null)).toBeNull();
    expect(cleanNumeric(undefined)).toBeNull();
    expect(cleanNumeric({})).toBeNull();
  });
});

describe('normalizeHeader', () => {
  it('lowercases and replaces spaces/punctuation with underscores', () => {
    expect(normalizeHeader('Age (Years)')).toBe('age_years');
  });

  it('collapses repeated separators into a single underscore', () => {
    expect(normalizeHeader('Wage -- Level')).toBe('wage_level');
  });

  it('trims leading/trailing underscores', () => {
    expect(normalizeHeader('  %Income%  ')).toBe('income');
  });

  it('leaves an already-normalized header unchanged', () => {
    expect(normalizeHeader('educ_years')).toBe('educ_years');
  });
});

describe('inferVariableType', () => {
  it('classifies a clearly numeric column (raw numbers)', () => {
    const data = buildColumn('x', [10, 20, 30, 40, 15, 25, 35, 45, 12, 18]);
    const result = inferVariableType(data, 'x');
    expect(result.type).toBe('numeric');
    expect(result.isAmbiguous).toBe(false);
    expect(result.isCleaned).toBe(false);
  });

  it('classifies a clearly categorical (text) column', () => {
    const data = buildColumn('x', ['Alice', 'Bob', 'Charlie', 'Dana', 'Eve', 'Frank', 'Grace', 'Heidi', 'Ivan', 'Judy']);
    const result = inferVariableType(data, 'x');
    expect(result.type).toBe('categorical');
    expect(result.isAmbiguous).toBe(false);
  });

  it('classifies $-formatted and %-formatted numeric strings as numeric via cleaning', () => {
    const data = buildColumn('x', ['$1,000', '50%', ' 12.3 ', '1,234.56', '$999.99', '25%', '$42', '10%', '3,000', '75%']);
    const result = inferVariableType(data, 'x');
    expect(result.type).toBe('numeric');
    expect(result.isCleaned).toBe(true);
    expect(result.description).toContain('cleaned');
  });

  it('classifies a mostly-empty column as unknown', () => {
    const data = buildColumn('x', [null, undefined, '', '  ', null, undefined, '', null, undefined, '']);
    const result = inferVariableType(data, 'x');
    expect(result.type).toBe('unknown');
    expect(result.description).toBe('Column appears empty.');
  });

  it('ignores missing values when computing the ratio (numeric survives many blanks)', () => {
    const data = buildColumn('x', [
      null, undefined, '', null, undefined, '', null, undefined, '', null, undefined, '', null, undefined, '',
      1, 2, 3, 4, 5
    ]);
    const result = inferVariableType(data, 'x');
    expect(result.type).toBe('numeric');
  });

  it('classifies a column of date-like strings as date', () => {
    const data = buildColumn('x', [
      'Jan 1, 2024', 'Jan 2, 2024', 'Jan 3, 2024', 'Jan 4, 2024', 'Jan 5, 2024',
      'Jan 6, 2024', 'Jan 7, 2024', 'Jan 8, 2024', 'Jan 9, 2024', 'Jan 10, 2024'
    ]);
    const result = inferVariableType(data, 'x');
    expect(result.type).toBe('date');
  });

  describe('threshold boundaries', () => {
    // 20-row samples so ratios land on exact, easy-to-reason-about fractions.
    const makeMixed = (numericCount: number, total = 20) => {
      const values: any[] = [];
      for (let i = 0; i < numericCount; i++) values.push(i + 1);
      for (let i = numericCount; i < total; i++) values.push(`cat_${i}`);
      return buildColumn('x', values);
    };

    it('numericRatio = 0.85 (>= 0.8) is classified numeric, not ambiguous', () => {
      const data = makeMixed(17); // 17/20 = 0.85
      const result = inferVariableType(data, 'x');
      expect(result.type).toBe('numeric');
      expect(result.isAmbiguous).toBe(false);
    });

    it('numericRatio = 0.5 (> 0.4, < 0.8) is ambiguous, numeric-leaning', () => {
      const data = makeMixed(10); // 10/20 = 0.5
      const result = inferVariableType(data, 'x');
      expect(result.type).toBe('categorical');
      expect(result.isAmbiguous).toBe(true);
      expect(result.description).toContain('Predominantly numeric but failed to clean');
    });

    it('numericRatio = 0.3 (> 0.1, <= 0.4) is ambiguous, categorical-leaning', () => {
      const data = makeMixed(6); // 6/20 = 0.3
      const result = inferVariableType(data, 'x');
      expect(result.type).toBe('categorical');
      expect(result.isAmbiguous).toBe(true);
      expect(result.description).toBe('Mixed types: Contains numeric values but primarily categorical.');
    });

    it('numericRatio = 0.05 (<= 0.1) is plain categorical, not ambiguous', () => {
      const data = makeMixed(1); // 1/20 = 0.05
      const result = inferVariableType(data, 'x');
      expect(result.type).toBe('categorical');
      expect(result.isAmbiguous).toBe(false);
    });

    it('numericRatio = 0.8 exactly is classified numeric (boundary is inclusive)', () => {
      const data = makeMixed(16); // 16/20 = 0.8
      const result = inferVariableType(data, 'x');
      expect(result.type).toBe('numeric');
      expect(result.isAmbiguous).toBe(false);
    });

    it('numericRatio = 0.4 exactly falls to the categorical-leaning tier (boundary is exclusive)', () => {
      const data = makeMixed(8); // 8/20 = 0.4
      const result = inferVariableType(data, 'x');
      expect(result.type).toBe('categorical');
      expect(result.isAmbiguous).toBe(true);
      expect(result.description).toBe('Mixed types: Contains numeric values but primarily categorical.');
    });

    it('numericRatio = 0.1 exactly is plain categorical (boundary is exclusive)', () => {
      const data = makeMixed(2); // 2/20 = 0.1
      const result = inferVariableType(data, 'x');
      expect(result.type).toBe('categorical');
      expect(result.isAmbiguous).toBe(false);
    });
  });
});
