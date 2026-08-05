/**
 * Reference test for calculateKM (Kaplan-Meier product-limit estimator).
 *
 * Prior to this file, calculateKM had zero automated test coverage anywhere
 * in the repo, unlike the other estimators (Cox PH, GMM, Synthetic Control,
 * OLS, ...) which are all pinned against a reference implementation. This
 * closes that gap.
 *
 * calculateKM originally lived inline in
 * src/components/modules/SurvivalAnalysisLab.tsx (still its only call site).
 * It has been extracted, verbatim, into src/lib/econometrics/survival.ts so
 * it can be imported here without dragging in the component's dependency on
 * services/apiClient.ts, which uses `import.meta.env` and cannot be loaded
 * under Jest's CommonJS transform (the same class of issue that already
 * disables src/lib/__tests__/interpreter-fidelity.test.ts).
 *
 * Reference values were computed live via `lifelines` (already a backend
 * dependency, used by backend/main.py for Cox PH), against the toy dataset
 * below, which is deliberately small but includes both a tie in event times
 * (two events at t=6) and a censored observation (t=4) that falls strictly
 * before the final event (t=9):
 *
 *   from lifelines import KaplanMeierFitter
 *   durations = [2, 3, 4, 6, 6, 7, 8, 9]
 *   events    = [1, 1, 0, 1, 1, 0, 1, 1]
 *   kmf = KaplanMeierFitter()
 *   kmf.fit(durations, event_observed=events)
 *   print(kmf.survival_function_)
 *   print(kmf.event_table)
 *
 * lifelines 0.30.3 output (via the repo's backend/.venv):
 *
 *   timeline  KM_estimate      event_at  removed  observed  censored  at_risk
 *   0.0       1.000            0.0       0        0         0         8
 *   2.0       0.875            2.0       1        1         0         8
 *   3.0       0.750            3.0       1        1         0         7
 *   4.0       0.750            4.0       1        0         1         6
 *   6.0       0.450            6.0       2        2         0         5
 *   7.0       0.450            7.0       1        0         1         3
 *   8.0       0.225            8.0       1        1         0         2
 *   9.0       0.000            9.0       1        1         0         1
 *
 * i.e. S(2)=0.875, S(3)=0.75, S(4)=0.75 (censoring-only step, no drop),
 * S(6)=0.45 (tie: 2 events / 5 at risk), S(7)=0.45 (censoring-only step),
 * S(8)=0.225, S(9)=0.
 */
import { calculateKM } from '../survival';

const TOL = 1e-9;

// duration (t) / event indicator (d, 1 = event, 0 = censored)
const TOY_ROWS = [
  { t: 2, d: 1 },
  { t: 3, d: 1 },
  { t: 4, d: 0 }, // censored, before the final event
  { t: 6, d: 1 }, // tie
  { t: 6, d: 1 }, // tie
  { t: 7, d: 0 }, // censored
  { t: 8, d: 1 },
  { t: 9, d: 1 },
];

describe('calculateKM against lifelines (toy dataset with ties + censoring)', () => {
  const { kmPoints } = calculateKM(TOY_ROWS, 't', 'd');

  it('produces one row per distinct event/censoring time', () => {
    expect(kmPoints).toHaveLength(7); // distinct times: 2,3,4,6,7,8,9
    expect(kmPoints.map((p: any) => p.time)).toEqual([2, 3, 4, 6, 7, 8, 9]);
  });

  it('matches lifelines at-risk counts at each time', () => {
    const expectedAtRisk: Record<number, number> = { 2: 8, 3: 7, 4: 6, 6: 5, 7: 3, 8: 2, 9: 1 };
    kmPoints.forEach((p: any) => {
      expect(p.atRisk).toBe(expectedAtRisk[p.time]);
    });
  });

  it('matches lifelines survival probabilities S(t)', () => {
    const expectedSurvival: Record<number, number> = {
      2: 0.875,
      3: 0.75,
      4: 0.75,   // censoring-only step: no drop
      6: 0.45,   // tie: 2 events out of 5 at risk
      7: 0.45,   // censoring-only step: no drop
      8: 0.225,
      9: 0,
    };
    kmPoints.forEach((p: any) => {
      expect(Math.abs(p.survival - expectedSurvival[p.time]!)).toBeLessThan(TOL);
    });
  });

  it('does not count censored observations as events', () => {
    // t=4 and t=7 are censored-only times: the event count at those times
    // must be exactly 0, and the survival curve must NOT drop there (the
    // trickiest part of KM to get wrong -- treating censoring as an event
    // would understate survival).
    const censoredTimePoints = kmPoints.filter((p: any) => p.time === 4 || p.time === 7);
    censoredTimePoints.forEach((p: any) => {
      expect(p.events).toBe(0);
    });

    const s3 = kmPoints.find((p: any) => p.time === 3)!.survival;
    const s4 = kmPoints.find((p: any) => p.time === 4)!.survival;
    expect(s4).toBe(s3); // no drop across the censored time t=4

    const s6 = kmPoints.find((p: any) => p.time === 6)!.survival;
    const s7 = kmPoints.find((p: any) => p.time === 7)!.survival;
    expect(s7).toBe(s6); // no drop across the censored time t=7
  });

  it('matches lifelines event counts at each time, including the tie at t=6', () => {
    const expectedEvents: Record<number, number> = { 2: 1, 3: 1, 4: 0, 6: 2, 7: 0, 8: 1, 9: 1 };
    kmPoints.forEach((p: any) => {
      expect(p.events).toBe(expectedEvents[p.time]);
    });
  });

  it('final survival reaches exactly 0 after the last subject at risk experiences the event', () => {
    expect(kmPoints[kmPoints.length - 1].survival).toBe(0);
  });
});
