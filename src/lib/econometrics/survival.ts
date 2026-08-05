/**
 * Kaplan-Meier product-limit survival estimator.
 *
 * Extracted from src/components/modules/SurvivalAnalysisLab.tsx so it can be
 * unit tested in isolation (that component file transitively imports
 * services/apiClient.ts, which uses `import.meta.env` and cannot be loaded
 * under Jest's CommonJS transform).
 */

// Helper to calculate Kaplan-Meier curve
export function calculateKM(data: any[], timeVar: string, eventVar: string) {
  // Filter and sort by time
  const cleanData = data
    .map(row => ({
      t: parseFloat(row[timeVar]),
      d: parseInt(row[eventVar])
    }))
    .filter(row => !isNaN(row.t) && !isNaN(row.d))
    .sort((a, b) => a.t - b.t);

  if (cleanData.length === 0) return { kmPoints: [], plotPoints: [] };

  // Group by distinct event times
  const distinctTimes = Array.from(new Set(cleanData.map(row => row.t)));
  const kmPoints: any[] = [];
  let s_prev = 1.0;
  let remaining = cleanData.length;

  distinctTimes.forEach((time) => {
    // Number at risk is the count of items with t >= time
    const n_at_risk = cleanData.filter(row => row.t >= time).length;
    // Number of events at exactly this time
    const n_events = cleanData.filter(row => row.t === time && row.d === 1).length;

    let s_t = s_prev;
    if (n_at_risk > 0) {
      s_t = s_prev * (1 - n_events / n_at_risk);
    }

    kmPoints.push({
      time,
      atRisk: n_at_risk,
      events: n_events,
      survival: s_t
    });

    s_prev = s_t;
  });

  // Generate continuous step-function plotting points
  const plotPoints: any[] = [{ time: 0, survival: 1.0 }];
  kmPoints.forEach((pt) => {
    // To make it look like a step function, we add a point just before the change
    plotPoints.push({ time: pt.time, survival: plotPoints[plotPoints.length - 1].survival });
    plotPoints.push({ time: pt.time, survival: pt.survival });
  });

  return { kmPoints, plotPoints };
}
