/**
 * Pure single-value transform helpers used by DataLab's variable transform
 * feature (LN / SQR buttons). Extracted from
 * src/components/modules/DataLab.tsx's handleTransform so the math can be
 * unit tested without pulling in the component's React/store dependencies.
 *
 * Behavior (unchanged from the inline version):
 *  - Only `number` inputs are transformed; anything else yields `null`.
 *  - LN of a non-positive number yields `null` (not `0`, not `NaN`) --
 *    downstream regressions treat null/undefined as "exclude this row" via
 *    listwise deletion, so a fabricated 0 would silently corrupt results.
 *  - SQR always squares (never square-roots), regardless of sign.
 */
export type TransformMethod = 'ln' | 'sq';

export function applyVariableTransform(val: unknown, method: TransformMethod): number | null {
  if (typeof val !== 'number') return null;

  if (method === 'ln') {
    return val > 0 ? Math.log(val) : null;
  }

  return Math.pow(val, 2);
}
