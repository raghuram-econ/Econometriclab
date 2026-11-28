import jStat from 'jstat';

export interface ChiSquareIndependenceResult {
  rowVariable: string;
  columnVariable: string;
  rowCategories: string[];
  columnCategories: string[];
  observed: number[][];
  chiSquare: number;
  df: number;
  pValue: number;
  sampleSize: number;
  minimumExpectedCount: number;
  cramersV: number;
  excludedRows: number;
}

/** Pearson chi-square test of independence for two categorical columns. */
export function calculateChiSquareIndependence(
  data: unknown[],
  rowVariable: string,
  columnVariable: string
): ChiSquareIndependenceResult {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('The selected dataset has no rows to analyze.');
  }
  if (!rowVariable || !columnVariable) {
    throw new Error('Choose both categorical variables for the Chi-square test.');
  }
  if (rowVariable === columnVariable) {
    throw new Error('Choose two different categorical variables.');
  }

  const rowValues = new Map<string, string>();
  const columnValues = new Map<string, string>();
  const pairs: Array<{ row: string; column: string }> = [];
  let excludedRows = 0;
  const category = (value: unknown) => `${typeof value}:${String(value).trim()}`;

  for (const item of data) {
    if (!item || typeof item !== 'object') {
      excludedRows++;
      continue;
    }
    const record = item as Record<string, unknown>;
    const rawRow = record[rowVariable];
    const rawColumn = record[columnVariable];
    if (rawRow == null || rawColumn == null || String(rawRow).trim() === '' || String(rawColumn).trim() === '') {
      excludedRows++;
      continue;
    }
    const row = category(rawRow);
    const column = category(rawColumn);
    rowValues.set(row, String(rawRow).trim());
    columnValues.set(column, String(rawColumn).trim());
    pairs.push({ row, column });
  }

  const rowKeys = Array.from(rowValues.keys()).sort((a, b) => (rowValues.get(a) ?? '').localeCompare(rowValues.get(b) ?? ''));
  const columnKeys = Array.from(columnValues.keys()).sort((a, b) => (columnValues.get(a) ?? '').localeCompare(columnValues.get(b) ?? ''));
  if (rowKeys.length < 2 || columnKeys.length < 2) {
    throw new Error('The Chi-square test needs at least two observed categories in each selected variable.');
  }

  const rowIndex = new Map(rowKeys.map((key, index) => [key, index]));
  const columnIndex = new Map(columnKeys.map((key, index) => [key, index]));
  const observed = rowKeys.map(() => columnKeys.map(() => 0));
  for (const pair of pairs) {
    const i = rowIndex.get(pair.row);
    const j = columnIndex.get(pair.column);
    if (i !== undefined && j !== undefined) observed[i]![j]!++;
  }

  const rowTotals = observed.map(row => row.reduce((sum, count) => sum + count, 0));
  const columnTotals = columnKeys.map((_, j) => observed.reduce((sum, row) => sum + (row[j] ?? 0), 0));
  const sampleSize = pairs.length;
  let chiSquare = 0;
  let minimumExpectedCount = Number.POSITIVE_INFINITY;
  for (let i = 0; i < rowKeys.length; i++) {
    for (let j = 0; j < columnKeys.length; j++) {
      const expected = (rowTotals[i]! * columnTotals[j]!) / sampleSize;
      minimumExpectedCount = Math.min(minimumExpectedCount, expected);
      if (expected > 0) chiSquare += ((observed[i]![j]! - expected) ** 2) / expected;
    }
  }

  const df = (rowKeys.length - 1) * (columnKeys.length - 1);
  const pValue = Math.max(0, Math.min(1, 1 - jStat.chisquare.cdf(chiSquare, df)));
  const dimensionCorrection = Math.min(rowKeys.length - 1, columnKeys.length - 1);
  const cramersV = dimensionCorrection > 0 && sampleSize > 0
    ? Math.sqrt(chiSquare / (sampleSize * dimensionCorrection))
    : 0;

  return {
    rowVariable,
    columnVariable,
    rowCategories: rowKeys.map(key => rowValues.get(key) ?? key),
    columnCategories: columnKeys.map(key => columnValues.get(key) ?? key),
    observed,
    chiSquare,
    df,
    pValue,
    sampleSize,
    minimumExpectedCount,
    cramersV,
    excludedRows
  };
}
