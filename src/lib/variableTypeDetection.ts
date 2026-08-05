import { DataType } from '../types';

/**
 * Attempts to coerce a raw cell value into a clean numeric value.
 * Handles common formatting like "$1,000", "50%", " 12.3 ".
 * Returns null if the value cannot be interpreted as a number.
 */
export function cleanNumeric(val: any): number | null {
  if (typeof val === 'number') return val;
  if (typeof val !== 'string') return null;

  // Remove common non-numeric characters for financial/econometric data
  // Handles: $1,000, 50%, " 12.3 ", 1,000.50
  const cleaned = val.replace(/[$,%\s]/g, '').replace(/,/g, '');
  if (cleaned === '') return null;
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Normalizes a raw column header into a safe, consistent variable name.
 */
export function normalizeHeader(header: string): string {
  return header
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]/g, '_')   // Replace non-alphanumeric with _
    .replace(/_+/g, '_')          // Collapse multiple _
    .replace(/^_|_$/g, '');       // Trim leading/trailing _
}

export interface VariableTypeInference {
  type: DataType;
  isAmbiguous: boolean;
  isCleaned: boolean;
  description: string;
}

/**
 * Infers the data type of a column by sampling up to 200 rows and applying
 * tiered thresholds on the proportion of numeric / date-like / invalid values.
 *
 * This is the single source of truth for column type detection so that every
 * data-ingestion path (DataLab's processData, DataUploadLab's handleUseDataset,
 * etc.) agrees on how a given column should be classified.
 */
export function inferVariableType(data: any[], key: string): VariableTypeInference {
  let rawNumericCount = 0;
  let cleanedNumericCount = 0;
  let dateCount = 0;
  let totalNonEmpty = 0;
  const invalidSamples: string[] = [];

  // Sample up to 200 rows for robust threshold-based inference
  const sampleSize = Math.min(data.length, 200);
  for (let i = 0; i < sampleSize; i++) {
    const val = data[i][key];
    if (val === null || val === undefined || String(val).trim() === '') continue;

    totalNonEmpty++;

    const valStr = String(val).trim();
    const isStrictlyNumeric = typeof val === 'number' || (!isNaN(Number(valStr)) && !valStr.includes(',') && !valStr.includes('$') && !valStr.includes('%'));

    const num = cleanNumeric(val);
    if (num !== null) {
      if (isStrictlyNumeric) {
        rawNumericCount++;
      } else {
        cleanedNumericCount++;
      }
    } else if (invalidSamples.length < 3) {
      invalidSamples.push(String(val).slice(0, 15));
    }

    if (typeof val === 'string' && val.length > 5 && !isNaN(Date.parse(val))) {
      dateCount++;
    }
  }

  let type: DataType = 'categorical';
  let isAmbiguous = false;
  let isCleaned = false;
  let description = "";

  if (totalNonEmpty > 0) {
    const totalNumeric = rawNumericCount + cleanedNumericCount;
    const numericRatio = totalNumeric / totalNonEmpty;
    const dateRatio = dateCount / totalNonEmpty;

    if (numericRatio >= 0.8) {
      type = 'numeric';
      if (cleanedNumericCount > 0) {
        isCleaned = true;
        description = `Successfully cleaned and converted ${cleanedNumericCount} entries to numeric.`;
      }
    } else if (dateRatio >= 0.8) {
      type = 'date';
    } else if (numericRatio > 0.4) {
      // This case: looks like a number but too many dirty entries
      isAmbiguous = true;
      const percentInvalid = Math.round((1 - numericRatio) * 100);
      description = `Predominantly numeric but failed to clean ${percentInvalid}% of values (e.g., ${invalidSamples.join(', ')}). Flagged as ambiguous.`;
    } else if (numericRatio > 0.1) {
      isAmbiguous = true;
      description = "Mixed types: Contains numeric values but primarily categorical.";
    }
  } else {
    type = 'unknown';
    description = "Column appears empty.";
  }

  return { type, isAmbiguous, isCleaned, description };
}
