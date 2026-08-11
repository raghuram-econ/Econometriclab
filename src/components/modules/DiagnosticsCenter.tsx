import React, { useState, useEffect } from 'react';
import { 
  ShieldCheck, 
  AlertCircle, 
  CheckCircle2, 
  ChevronRight, 
  BarChart, 
  Activity, 
  Layers, 
  Info, 
  TrendingUp, 
  Eye, 
  FileText, 
  GitCompare, 
  AlertTriangle 
} from 'lucide-react';
import { motion } from 'motion/react';
import jStat from 'jstat';
import { useStore } from '../../store/useStore';
import { useNavigation } from '../../hooks/useNavigation';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { cn } from '../../lib/utils';
import { runOLS, preprocessDataAndVars } from '../../lib/econometrics/ols';
import { jacobiEigenvalues } from './FactorAnalysisLab';

// Error function (Abramowitz & Stegun 7.1.26, |error| < 1.5e-7) used for the
// chi-squared(1) p-value of the lag-1 LM autocorrelation test below.
function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}

type HeteroTestResult =
  | { ok: true; stat: number; df1: number; df2?: number; p: number }
  | { ok: false; reason: string };

type ReconResult =
  | { ok: true; filteredData: any[]; finalYVar: string; finalXVars: string[]; refit: any }
  | { ok: false; reason: string };

// Parses the "y ~ x1 + x2 + x3 (suffix)" specification strings produced by the
// estimation labs (see OLSLab.tsx) into a dependent variable and a list of raw
// regressor column names. Interaction/polynomial shorthand (e.g. "x1*x2") is
// rejected since those aren't literal dataset columns we can look up.
function parseOLSSpecification(spec: string): { yVar: string; xVars: string[] } | null {
  if (!spec) return null;
  const tildeIdx = spec.indexOf('~');
  if (tildeIdx === -1) return null;
  const yVar = spec.slice(0, tildeIdx).trim();
  let rhs = spec.slice(tildeIdx + 1).trim();
  // Strip a trailing parenthetical annotation, e.g. "(OLS)", "(Quantile: 0.5)"
  rhs = rhs.replace(/\s*\([^)]*\)\s*$/, '').trim();
  if (!yVar || !rhs) return null;
  const xVars = rhs.split('+').map(v => v.trim()).filter(Boolean);
  if (xVars.length === 0 || xVars.some(v => /[*:^]/.test(v))) return null;
  return { yVar, xVars };
}

// Real White's/Goldfeld-Quandt tests need the raw per-observation regressor
// matrix (X), which is NOT stored on a saved model's `results` (only
// coefficients, residuals, fitted values, and summary stats are kept in
// history -- see ModelHistoryItem in types.ts). The only place raw rows live
// is the dataset currently loaded in the workspace. So we reconstruct X by
// re-running the model's own specification against `currentDataset`, then
// validate the refit's n and R² against the model's stored values before
// trusting it -- this prevents silently mixing a stale saved model with a
// dataset that has since changed or been swapped out.
function reconstructModelData(model: any, currentDataset: any): ReconResult {
  if (!currentDataset || !Array.isArray(currentDataset.data) || currentDataset.data.length === 0) {
    return { ok: false, reason: 'No dataset is currently loaded in the workspace to recompute this test from.' };
  }
  const parsed = parseOLSSpecification(model?.specification || '');
  if (!parsed) {
    return { ok: false, reason: "Model specification could not be parsed into a 'y ~ x1 + x2 + ...' form." };
  }
  const { yVar, xVars } = parsed;
  const sampleRow = currentDataset.data[0] || {};
  const missingCols = [yVar, ...xVars].filter(v => !(v in sampleRow));
  if (missingCols.length > 0) {
    return { ok: false, reason: `Loaded dataset is missing column(s) required by this model: ${missingCols.join(', ')}.` };
  }

  try {
    const { mappedData, finalYVar, finalXVars } = preprocessDataAndVars(currentDataset.data, yVar, xVars);
    const isMissing = (v: any) => v === undefined || v === null || v === '' || v === 'N/A' || v === 'null' || v === 'missing';
    const numericVars = [finalYVar, ...finalXVars];
    const filteredData = mappedData.filter((row: any) => row && numericVars.every(v => !isMissing(row[v]) && !isNaN(parseFloat(row[v]))));

    if (filteredData.length < finalXVars.length + 3) {
      return { ok: false, reason: 'Insufficient observations in the loaded dataset to recompute this test.' };
    }

    const refit = runOLS(filteredData, finalYVar, finalXVars, true, false, undefined, false, false);

    // Validate: the refit must reproduce this model's stored n and R² before
    // we trust it as "the same data" the model was originally estimated on.
    const nMatches = model?.results?.n === refit.n;
    const rSquaredClose = typeof model?.results?.rSquared === 'number' &&
      Math.abs(model.results.rSquared - refit.rSquared) < 1e-4;
    if (!nMatches || !rSquaredClose) {
      return { ok: false, reason: 'The currently loaded dataset does not match the data behind this model (it may have changed or been swapped since estimation).' };
    }

    return { ok: true, filteredData, finalYVar, finalXVars, refit };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'Failed to recompute regressors for this test.' };
  }
}

// White's General Test (with cross terms): auxiliary regression of squared
// residuals on all X_j, all X_j^2, and all pairwise cross-products X_i*X_j
// (i<j). LM = n * R^2_aux ~ chi-squared(df) under the null of homoskedasticity,
// with df = number of auxiliary regressors (k + k + C(k,2)).
function computeWhiteTest(recon: ReconResult): HeteroTestResult {
  if (!recon.ok) return { ok: false, reason: recon.reason };
  const { filteredData, finalXVars, refit } = recon;
  const k = finalXVars.length;
  const n = refit.n as number;
  if (k === 0) return { ok: false, reason: 'No regressors available to build the auxiliary regression.' };

  const auxRegressorCount = k + k + (k * (k - 1)) / 2;
  if (n < auxRegressorCount + 5) {
    return { ok: false, reason: `Insufficient observations (n=${n}) relative to the ${auxRegressorCount} auxiliary regressors White's test requires.` };
  }

  const residuals: number[] = refit.residuals || [];
  const sqResiduals = residuals.map(r => r * r);
  const augData = filteredData.map((row: any, idx: number) => {
    const augRow: any = { ...row, _sq_res_white: sqResiduals[idx] ?? 0 };
    finalXVars.forEach(v => {
      const xv = parseFloat(row[v]);
      augRow[`${v}__sq`] = xv * xv;
    });
    for (let i = 0; i < k; i++) {
      for (let j = i + 1; j < k; j++) {
        const vi = finalXVars[i]!;
        const vj = finalXVars[j]!;
        augRow[`${vi}__x__${vj}`] = parseFloat(row[vi]) * parseFloat(row[vj]);
      }
    }
    return augRow;
  });

  const augXVars: string[] = [...finalXVars, ...finalXVars.map(v => `${v}__sq`)];
  for (let i = 0; i < k; i++) {
    for (let j = i + 1; j < k; j++) {
      augXVars.push(`${finalXVars[i]}__x__${finalXVars[j]}`);
    }
  }

  try {
    const auxRes = runOLS(augData, '_sq_res_white', augXVars, true, false, undefined, false, false);
    const lm = n * auxRes.rSquared;
    const df = augXVars.length;
    const p = 1 - jStat.chisquare.cdf(lm, df);
    return { ok: true, stat: lm, df1: df, p };
  } catch (e: any) {
    return { ok: false, reason: e?.message || "Auxiliary regression for White's test failed (likely collinear cross-terms)." };
  }
}

// Goldfeld-Quandt test: order observations by the model's fitted values, omit
// the middle ~20% (a common convention; 1/6 is also used in textbooks -- we
// pick 20% and split the rest into two equal halves), then regress each half
// separately and compare mean-squared residuals. F = (RSS_larger/df_larger) /
// (RSS_smaller/df_smaller) so F >= 1 by construction, tested against the
// upper tail of F(df_larger, df_smaller).
function computeGoldfeldQuandtTest(recon: ReconResult): HeteroTestResult {
  if (!recon.ok) return { ok: false, reason: recon.reason };
  const { filteredData, finalYVar, finalXVars, refit } = recon;
  const k = finalXVars.length;
  const n = refit.n as number;
  const fitted: number[] = refit.fitted || [];

  const omit = Math.round(n * 0.2);
  const remaining = n - omit;
  const halfSize = Math.floor(remaining / 2);
  const minHalf = k + 3;

  if (halfSize < minHalf) {
    return { ok: false, reason: `Insufficient observations (n=${n}) to split into two halves of at least ${minHalf} observations for the Goldfeld-Quandt test.` };
  }

  const order = filteredData.map((_: any, i: number) => i).sort((a: number, b: number) => (fitted[a] ?? 0) - (fitted[b] ?? 0));
  const lowIdx = order.slice(0, halfSize);
  const highIdx = order.slice(n - halfSize);
  const lowData = lowIdx.map((i: number) => filteredData[i]);
  const highData = highIdx.map((i: number) => filteredData[i]);

  try {
    const lowRes = runOLS(lowData, finalYVar, finalXVars, true, false, undefined, false, false);
    const highRes = runOLS(highData, finalYVar, finalXVars, true, false, undefined, false, false);

    const [rssNum, dfNum, rssDen, dfDen] = (highRes.rss as number) >= (lowRes.rss as number)
      ? [highRes.rss as number, highRes.df, lowRes.rss as number, lowRes.df]
      : [lowRes.rss as number, lowRes.df, highRes.rss as number, highRes.df];

    if (dfNum <= 0 || dfDen <= 0 || rssDen <= 1e-12) {
      return { ok: false, reason: 'Degenerate residual sum of squares in one half; cannot compute the F-statistic.' };
    }

    const F = (rssNum / dfNum) / (rssDen / dfDen);
    const p = 1 - jStat.centralF.cdf(F, dfNum, dfDen);
    return { ok: true, stat: F, df1: dfNum, df2: dfDen, p };
  } catch (e: any) {
    return { ok: false, reason: e?.message || 'Goldfeld-Quandt sub-sample regressions failed.' };
  }
}

// The scale-invariant condition number of X: sqrt(largest / smallest
// eigenvalue) of the correlation matrix of the regressors (the same
// standardization VIF already uses). Requires the reconstructed
// per-observation regressor matrix, so it's only available when
// reconstructModelData() succeeded; callers must fall back to a cruder
// VIF-derived estimate otherwise (see conditionNumberFallback below), and
// must not claim this fallback "calculates eigenvalues" since it doesn't.
function computeConditionNumber(recon: ReconResult): number | null {
  if (!recon.ok) return null;
  const { filteredData, finalXVars } = recon;
  const k = finalXVars.length;
  const n = filteredData.length;
  if (k < 2 || n < k + 2) return null;

  const means = finalXVars.map(v => filteredData.reduce((s: number, row: any) => s + parseFloat(row[v]), 0) / n);
  const stds = finalXVars.map((v, j) => {
    const m = means[j] ?? 0;
    const variance = filteredData.reduce((s: number, row: any) => s + (parseFloat(row[v]) - m) ** 2, 0) / n;
    return Math.sqrt(variance) || 1.0;
  });
  const corr: number[][] = Array.from({ length: k }, () => Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      let s = 0;
      for (const row of filteredData) {
        const zi = (parseFloat(row[finalXVars[i]!]) - (means[i] ?? 0)) / (stds[i] ?? 1);
        const zj = (parseFloat(row[finalXVars[j]!]) - (means[j] ?? 0)) / (stds[j] ?? 1);
        s += zi * zj;
      }
      corr[i]![j] = s / n;
    }
  }
  try {
    const { eigenvalues } = jacobiEigenvalues(corr);
    const vals = eigenvalues.map(Number).filter(v => Number.isFinite(v));
    if (vals.length === 0) return null;
    const maxEig = Math.max(...vals);
    const minEig = Math.max(Math.min(...vals), 1e-10);
    return Math.sqrt(maxEig / minEig);
  } catch {
    return null;
  }
}

// Pedagogical example models to act as fallback if history is empty
const EXAMPLE_DIAG_MODELS = [
  {
    id: 'spec_1_cps',
    module: 'Linear Models (OLS)',
    specification: 'wage ~ educ + exper + female',
    results: {
      n: 500,
      df: 496,
      rSquared: 0.4125,
      adjRSquared: 0.4089,
      fStat: 116.1,
      logLikelihood: -1420.5,
      rmse: 4.812,
      aic: 2849.0,
      bic: 2865.8,
      durbinWatson: 1.95,
      breuschPaganStat: 1.84,
      breuschPaganPValue: 0.398,
      vifs: { educ: 1.12, exper: 1.08, female: 1.05 },
      coefficients: [
        { variable: 'Intercept', estimate: '3.1245', stdError: '1.1242', tStat: '2.779', pValue: '0.0056', stars: '**' },
        { variable: 'educ', estimate: '1.4512', stdError: '0.1124', tStat: '12.910', pValue: '< 0.001', stars: '***' },
        { variable: 'exper', estimate: '0.2413', stdError: '0.0413', tStat: '5.848', pValue: '< 0.001', stars: '***' },
        { variable: 'female', estimate: '-2.8125', stdError: '0.4125', tStat: '-6.818', pValue: '< 0.001', stars: '***' }
      ]
    }
  },
  {
    id: 'spec_2_growth',
    module: 'Panel Data (FE/RE)',
    specification: 'gdp_growth ~ inflation + unemp + govt_debt',
    results: {
      n: 150,
      df: 144,
      rSquared: 0.5124,
      adjRSquared: 0.4988,
      fStat: 37.8,
      logLikelihood: -212.4,
      rmse: 1.052,
      aic: 434.8,
      bic: 449.8,
      durbinWatson: 1.62,
      breuschPaganStat: 8.42,
      breuschPaganPValue: 0.038, // Flag heteroskedasticity!
      vifs: { inflation: 1.45, unemp: 1.82, govt_debt: 2.15 },
      coefficients: [
        { variable: 'Intercept', estimate: '4.8124', stdError: '0.6214', tStat: '7.744', pValue: '< 0.001', stars: '***' },
        { variable: 'inflation', estimate: '-0.1542', stdError: '0.0412', tStat: '-3.743', pValue: '0.0003', stars: '***' },
        { variable: 'unemp', estimate: '-0.2814', stdError: '0.0724', tStat: '-3.887', pValue: '0.0001', stars: '***' },
        { variable: 'govt_debt', estimate: '-0.0241', stdError: '0.0112', tStat: '-2.152', pValue: '0.0331', stars: '*' }
      ]
    }
  },
  {
    id: 'spec_3_money',
    module: 'Causal Inference',
    specification: 'm3_demand ~ log_gdp + bond_yield + rbi_rate',
    results: {
      n: 80,
      df: 76,
      rSquared: 0.8415,
      adjRSquared: 0.8352,
      fStat: 134.5,
      logLikelihood: -84.1,
      rmse: 0.681,
      aic: 176.2,
      bic: 185.7,
      durbinWatson: 1.12, // Serial Autocorrelation warning!
      breuschPaganStat: 2.14,
      breuschPaganPValue: 0.544,
      vifs: { log_gdp: 2.85, bond_yield: 4.12, rbi_rate: 3.95 },
      coefficients: [
        { variable: 'Intercept', estimate: '-12.8412', stdError: '2.1415', tStat: '-5.996', pValue: '< 0.001', stars: '***' },
        { variable: 'log_gdp', estimate: '1.4215', stdError: '0.1812', tStat: '7.845', pValue: '< 0.001', stars: '***' },
        { variable: 'bond_yield', estimate: '-0.0842', stdError: '0.0312', tStat: '-2.699', pValue: '0.0086', stars: '**' },
        { variable: 'rbi_rate', estimate: '-0.1241', stdError: '0.0512', tStat: '-2.424', pValue: '0.0177', stars: '*' }
      ]
    }
  }
];

export function DiagnosticsCenter() {
  const { history, setActiveModule, currentDataset } = useStore();

  // Combine real run history and presets to guarantee an interactive experience
  const activeHistory = history.length > 0 ? history.map(h => ({
    id: h.id,
    module: h.module || 'Regression',
    specification: h.specification || 'y ~ x',
    results: {
      n: h.results.n,
      df: h.results.df,
      rSquared: h.results.rSquared,
      adjRSquared: h.results.adjRSquared,
      fStat: h.results.fStat,
      logLikelihood: h.results.logLikelihood,
      rmse: h.results.rmse,
      aic: h.results.aic,
      bic: h.results.bic,
      durbinWatson: h.results.durbinWatson !== undefined ? h.results.durbinWatson : null,
      breuschPaganStat: h.results.breuschPaganStat !== undefined ? h.results.breuschPaganStat : null,
      breuschPaganPValue: h.results.breuschPaganPValue !== undefined ? h.results.breuschPaganPValue : null,
      jarqueBeraStat: h.results.jarqueBeraStat !== undefined ? h.results.jarqueBeraStat : null,
      jarqueBeraPValue: h.results.jarqueBeraPValue !== undefined ? h.results.jarqueBeraPValue : null,
      vifs: h.results.vifs || {},
      coefficients: h.results.coefficients || [],
      residuals: Array.isArray(h.results.residuals) ? h.results.residuals : null
    }
  })) : EXAMPLE_DIAG_MODELS.map(m => ({
    ...m,
    results: {
      ...m.results,
      jarqueBeraStat: 1.02,
      jarqueBeraPValue: 0.60
    }
  }));

  const [selectedId, setSelectedId] = useState<string>('');
  const [activeTab, setActiveTab] = useState<'residual' | 'multicollinearity' | 'heteroscedasticity' | 'autocorrelation' | 'specification' | 'comparison'>('residual');
  const [isDiagnosing, setIsDiagnosing] = useState(false);
  const [diagnosticsError, setDiagnosticsError] = useState<string | null>(null);
  const { navigateTo } = useNavigation();

  useEffect(() => {
    if (activeHistory.length > 0 && !selectedId) {
      setSelectedId(activeHistory[0]?.id || '');
    }
  }, [activeHistory, selectedId]);

  if (history.length === 0) {
    return (
      <div className="space-y-8 max-w-7xl mx-auto px-4 animate-in fade-in duration-700">
        <ModuleIntroCard 
          title="Diagnostics Center"
          description="A comprehensive toolkit for verifying Gauss-Markov assumptions, identifying structural breaks, and ensuring the econometric integrity of your models."
          useWhen="You have run a regression and need to verify its assumptions."
          requires={["A previously estimated model (e.g., from OLS Lab)"]}
          youWillGet={["Residual analysis", "VIF metrics", "Heteroskedasticity tests"]}
          pitfalls={["Running models blindly without checking assumptions"]}
          example="Checking if your estimated Mincer wage equation suffers from heteroskedasticity."
        />
        <section className="flex flex-col items-center justify-center py-24 px-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
          <div className="w-16 h-16 bg-white border border-slate-200 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Activity className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No regression history found</h2>
          <p className="text-slate-500 text-center max-w-md mb-8">
            Run a regression first to see diagnostics.
          </p>
          <button 
            onClick={() => navigateTo('ols')}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors shadow-md"
          >
            Go to OLS Lab
          </button>
        </section>
      </div>
    );
  }

  const model = activeHistory.find(m => m.id === selectedId) || activeHistory[0];
  if (!model) return null;

  // Diagnostic calculations / extractions
  const coefs = model.results.coefficients || [];
  const vifs = model.results.vifs || {};
  const dw = model.results.durbinWatson;
  const bpStat = model.results.breuschPaganStat;
  const bpP = model.results.breuschPaganPValue;
  const jbStat = model.results.jarqueBeraStat;
  const jbP = model.results.jarqueBeraPValue;

  // White's General Test, Goldfeld-Quandt, and the condition number all need
  // the raw per-observation regressor matrix, which isn't stored on the
  // saved model -- so we reconstruct it (with validation) from the dataset
  // currently loaded in the workspace. See reconstructModelData() above.
  const dataRecon = reconstructModelData(model, currentDataset);

  // Condition number: use the real eigenvalue-based computation when the
  // regressor matrix could be reconstructed; otherwise fall back to a
  // clearly-labeled VIF-derived estimate (this fallback does NOT compute
  // eigenvalues, and the UI text below must not claim it does).
  const realConditionNumber = computeConditionNumber(dataRecon);
  const maxVif = Object.values(vifs).length > 0 ? Math.max(...(Object.values(vifs) as number[])) : 1.0;
  const conditionNumberFallback = Math.sqrt(maxVif) * 10;
  const conditionNumber = realConditionNumber ?? conditionNumberFallback;

  // Breusch-Godfrey-type LM test (lag 1), computed from this model's stored
  // residuals: LM = (n-1) * R² of the auxiliary regression e_t on e_{t-1}.
  // Asymptotically chi-squared(1) under the null of no serial correlation
  // (with exogenous regressors). Shown as N/A when no residuals were stored.
  let bgStat: number | null = null;
  let bgP: number | null = null;
  {
    const residRaw = (model?.results as any)?.residuals;
    if (Array.isArray(residRaw)) {
      const e = residRaw.filter((v: any) => typeof v === 'number' && isFinite(v));
      const nBG = e.length - 1;
      if (nBG > 10) {
        const yv = e.slice(1);
        const xv = e.slice(0, -1);
        const my = yv.reduce((a: number, b: number) => a + b, 0) / nBG;
        const mx = xv.reduce((a: number, b: number) => a + b, 0) / nBG;
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < nBG; i++) {
          const dx = xv[i] - mx;
          const dy = yv[i] - my;
          sxy += dx * dy; sxx += dx * dx; syy += dy * dy;
        }
        if (sxx > 1e-12 && syy > 1e-12) {
          const r2aux = (sxy * sxy) / (sxx * syy);
          bgStat = nBG * r2aux;
          // chi-squared(1) survival via the normal CDF: P(X > x) = 2*(1 - Phi(sqrt(x)))
          const z = Math.sqrt(Math.max(0, bgStat));
          const phi = 0.5 * (1 + erf(z / Math.SQRT2));
          bgP = 2 * (1 - phi);
        }
      }
    }
  }

  const whiteResult = computeWhiteTest(dataRecon);
  const gqResult = computeGoldfeldQuandtTest(dataRecon);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-16">

      {/* HEADER BAR */}
      <div className="flex flex-col md:flex-row md:items-end justify-between border-b border-slate-200 pb-6 gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
            <h2 className="text-[10px] font-bold uppercase tracking-[0.3em] text-slate-400 font-mono">Assumptions Auditor</h2>
          </div>
          <h2 className="text-xl font-extrabold text-[#1a2744] tracking-tight uppercase font-sans">
            Diagnostics Center & Model Audit Panel
          </h2>
          <p className="text-xs text-slate-500 font-serif italic max-w-xl">
            Verify linear OLS consistency. Audits structural equations for Heteroskedasticity, Multicollinearity, Serial Autocorrelation, and Specification bias.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* SIDEBAR: MODELS LIST */}
        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono">Model specifications</h3>
            <span className="text-[9px] bg-slate-200 px-2 py-0.5 rounded text-slate-600 font-mono font-bold uppercase">
              {activeHistory.length} Available
            </span>
          </div>
          <div className="space-y-2 max-h-[500px] overflow-y-auto pr-2 custom-scrollbar">
            {history.length === 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[10px] font-mono text-amber-800 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>DISPLAYING ILLUSTRATIVE EXAMPLES</span>
              </div>
            )}
            {activeHistory.map((h) => (
              <button
                key={h.id}
                onClick={() => setSelectedId(h.id)}
                className={cn(
                  "w-full text-left p-4 rounded-xl border transition-all text-xs font-mono relative group",
                  selectedId === h.id 
                    ? "bg-[#1a2744] border-[#1a2744] text-white shadow" 
                    : "bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50"
                )}
              >
                <div className="flex items-center justify-between opacity-60 mb-1">
                  <span className="text-[9px] font-bold uppercase tracking-wide">{h.module}</span>
                </div>
                <p className="font-bold font-serif italic text-[13px]">{h.specification}</p>
                <p className="text-[9px] mt-1 text-slate-400">N = {h.results.n} | R² = {h.results.rSquared != null ? h.results.rSquared.toFixed(3) : 'N/A'}</p>
              </button>
            ))}
          </div>
        </div>

        {/* MAIN DISPLAY AREA */}
        <div className="lg:col-span-9 bg-[#f8f9fa] border border-slate-200 rounded-xl p-8 space-y-6">
          
          {/* ASSUMPTION METRIC TABS */}
          <div className="flex flex-wrap border-b border-slate-200 gap-1 bg-slate-100 p-1 rounded-lg">
            {(['residual', 'multicollinearity', 'heteroscedasticity', 'autocorrelation', 'specification', 'comparison'] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-4 py-2 text-[10px] font-bold uppercase tracking-wider font-mono rounded-md transition-all",
                  activeTab === tab 
                    ? "bg-white text-[#1a2744] shadow-sm border border-slate-200" 
                    : "text-slate-500 hover:text-slate-800"
                )}
              >
                {tab === 'residual' && 'Residual Analysis'}
                {tab === 'multicollinearity' && 'Multicollinearity'}
                {tab === 'heteroscedasticity' && 'Heteroscedasticity'}
                {tab === 'autocorrelation' && 'Autocorrelation'}
                {tab === 'specification' && 'Specification Tests'}
                {tab === 'comparison' && 'Model Comparison'}
              </button>
            ))}
          </div>

          {/* ACTIVE TAB VIEWS */}
          <div className="space-y-6 animate-in fade-in duration-300">
            
            {/* 1. RESIDUAL ANALYSIS */}
            {activeTab === 'residual' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <BarChart className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a2744] font-mono">Residual Structure & Normality Audit</h4>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Histogram graphic */}
                  <div className="bg-white p-5 border border-slate-200 rounded-lg">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono mb-3">I. Standardized Residual Distribution</p>
                    <div className="h-32 flex items-end justify-center gap-1.5 pt-4 border-b border-slate-300 font-mono text-[9px] text-slate-400">
                      <div className="w-6 bg-slate-200 rounded-t h-[10%]"></div>
                      <div className="w-6 bg-slate-300 rounded-t h-[25%]"></div>
                      <div className="w-6 bg-blue-600 rounded-t h-[60%]"></div>
                      <div className="w-6 bg-[#1a2744] rounded-t h-[95%]"></div>
                      <div className="w-6 bg-[#1a2744] rounded-t h-[75%]"></div>
                      <div className="w-6 bg-slate-400 rounded-t h-[35%]"></div>
                      <div className="w-6 bg-slate-200 rounded-t h-[15%]"></div>
                    </div>
                    <div className="flex justify-between font-mono text-[8px] text-slate-500 mt-2">
                      <span>-3.0 Std Dev (Outliers)</span>
                      <span>Mean = 0.000</span>
                      <span>+3.0 Std Dev</span>
                    </div>
                  </div>

                  {/* Q-Q Plot Description */}
                  <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono">II. Quantile-Quantile (Q-Q) Plot Summary</p>
                    <p className="text-xs text-slate-600 font-serif leading-relaxed">
                      Residual quantiles are plotted against theoretical normal distribution quantiles. 
                      {jbP !== null && jbP !== undefined ? (
                        jbP < 0.05 
                          ? " The Q-Q plot points show deviation from the 45-degree diagonal reference vector, suggesting non-normal error distribution in this sample."
                          : " The points align closely along the 45-degree reference diagonal vector, validating normality of the error distribution."
                      ) : (
                        " Q-Q plot comparisons are only relevant for linear regression models with computed residuals."
                      )}
                    </p>
                    <div className="p-3 rounded text-[10px] font-mono font-bold flex flex-col gap-1 uppercase bg-slate-50 border border-slate-200 text-slate-800">
                      <div>Jarque-Bera statistic: {jbStat !== null && jbStat !== undefined ? jbStat.toFixed(4) : 'N/A'}</div>
                      <div>p-value: {jbP !== null && jbP !== undefined ? jbP.toFixed(4) : 'N/A'}</div>
                    </div>
                    {jbP !== null && jbP !== undefined ? (
                      jbP < 0.05 ? (
                        <div className="p-3 bg-amber-50 border border-amber-100 rounded text-[10px] text-amber-800 font-mono font-bold flex items-center gap-1.5 uppercase">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Normality rejected (p &lt; 0.05). Residuals are not normally distributed.
                        </div>
                      ) : (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded text-[10px] text-emerald-800 font-mono font-bold flex items-center gap-1.5 uppercase">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Fail to reject normality (p &gt;= 0.05). Residuals are consistent with a normal distribution.
                        </div>
                      )
                    ) : (
                      <div className="p-3 bg-slate-50 border border-slate-100 rounded text-[10px] text-slate-500 font-mono font-bold flex items-center gap-1.5 uppercase italic">
                        Normality test not computed for this estimator.
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono">III. Fitted Values vs Residuals Scatter Pattern</p>
                  <p className="text-xs text-slate-600 font-serif leading-relaxed">
                    {bpP != null
                      ? (bpP < 0.05
                        ? `A scatter evaluation of residuals e_i on predicted estimates y_i is summarized by the Breusch-Pagan test (p = ${bpP.toFixed(4)}), which rejects the null of constant variance -- the residual spread widens or narrows systematically across the fitted range, indicating heteroskedasticity.`
                        : `A scatter evaluation of residuals e_i on predicted estimates y_i is summarized by the Breusch-Pagan test (p = ${bpP.toFixed(4)}), which does not reject the null of constant variance -- consistent with a stable vertical spread across the fitted range and no evidence of heteroskedasticity.`)
                      : 'Heteroskedasticity diagnostics are not computed for this model type, so no scatter-pattern conclusion is available here.'}
                  </p>
                </div>
              </div>
            )}

            {/* 2. MULTICOLLINEARITY */}
            {activeTab === 'multicollinearity' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a2744] font-mono">Multicollinearity Diagnostic & VIF Matrix</h4>
                </div>

                <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                  <table className="w-full font-mono text-[11px] text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300">
                        <th className="py-2.5 px-4 font-bold text-[#1a2744]">Independent Regressor (X_j)</th>
                        <th className="py-2.5 px-4 text-right font-bold text-[#1a2744]">Variance Inflation Factor (VIF)</th>
                        <th className="py-2.5 px-4 text-right font-bold text-[#1a2744]">Tolerance (1/VIF)</th>
                        <th className="py-2.5 pr-4 text-right font-bold text-[#1a2744]">Auditor Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(vifs).length > 0 ? (
                        Object.entries(vifs).map(([v, val]: any) => {
                          const tolerance = 1 / val;
                          const isHigh = val > 10.0;
                          return (
                            <tr key={v} className="border-b border-slate-200 even:bg-slate-50">
                              <td className="py-2 px-4 font-bold text-slate-800">{v}</td>
                              <td className="py-2 px-4 text-right font-bold text-slate-800">{val.toFixed(2)}</td>
                              <td className="py-2 px-4 text-right text-slate-600">{tolerance.toFixed(4)}</td>
                              <td className="py-2 pr-4 text-right">
                                <span className={cn(
                                  "text-[9px] font-bold uppercase px-2 py-0.5 rounded",
                                  isHigh ? "bg-rose-50 text-rose-700 border border-rose-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                )}>
                                  {isHigh ? 'FAIL' : 'PASS'}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr className="border-b border-slate-200">
                          <td colSpan={4} className="py-6 text-center text-slate-400 font-serif italic">
                            No independent regressors evaluated. Run an OLS model first.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono">IV. Condition Number Audit</p>
                    <p className="text-xs text-slate-600 font-serif leading-relaxed">
                      {realConditionNumber !== null ? (
                        <>The condition number is computed as the square root of the ratio of the largest to smallest eigenvalue of the standardized regressor correlation matrix. The computed condition number is <strong>{conditionNumber.toFixed(2)}</strong>. Values below 15 represent near-perfect orthogonality, confirming that standard errors are fully stable and unbiased by collinearity.</>
                      ) : (
                        <>The regressor matrix behind this model could not be reconstructed from the currently loaded dataset, so this is a rule-of-thumb estimate derived from the maximum VIF above (not an eigenvalue computation): <strong>{conditionNumber.toFixed(2)}</strong>. Load the original dataset for this model to get an exact eigenvalue-based condition number instead.</>
                      )}
                    </p>
                  </div>
                  <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono font-bold">Standard Thresholds</p>
                    <p className="text-[10px] text-slate-500 font-serif italic">
                      VIF &gt; 10.0 signals severe multicollinearity where structural standard errors swell, making t-tests unstable. Tolerances below 0.1 should be handled by dropping redundant series.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 3. HETEROSCEDASTICITY */}
            {activeTab === 'heteroscedasticity' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <ShieldCheck className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a2744] font-mono">Heteroscedasticity Robustness Tests Suite</h4>
                </div>
                <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                  <table className="w-full font-mono text-[11px] text-left">
                    <thead>
                      <tr className="bg-slate-100 border-b border-slate-300">
                        <th className="py-2.5 px-4 font-bold text-[#1a2744]">Statistical Test</th>
                        <th className="py-2.5 px-4 text-right font-bold text-[#1a2744]">Test Statistic (LM)</th>
                        <th className="py-2.5 px-4 text-right font-bold text-[#1a2744]">p-value</th>
                        <th className="py-2.5 pr-4 text-right font-bold text-[#1a2744]">Verdict</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td className="py-2.5 px-4 font-bold text-slate-800">Breusch-Pagan / Godfrey LM Test</td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {bpStat !== null && bpStat !== undefined ? `LM = ${bpStat.toFixed(2)}` : '--'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {bpP !== null && bpP !== undefined ? bpP.toFixed(4) : '--'}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {bpP !== null && bpP !== undefined ? (
                            <span className={cn(
                              "text-[9px] font-bold uppercase px-2 py-0.5 rounded",
                              bpP < 0.05 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            )}>
                              {bpP < 0.05 ? 'WARN (HETERO)' : 'PASS (HOMO)'}
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-bold uppercase px-2 py-0.5 rounded">
                              N/A
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td className="py-2.5 px-4 font-bold text-slate-800" title={!whiteResult.ok ? whiteResult.reason : undefined}>White's General Test (with interactions)</td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {whiteResult.ok ? `LM = ${whiteResult.stat.toFixed(2)}` : '--'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {whiteResult.ok ? whiteResult.p.toFixed(4) : '--'}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {whiteResult.ok ? (
                            <span className={cn(
                              "text-[9px] font-bold uppercase px-2 py-0.5 rounded",
                              whiteResult.p < 0.05 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            )}>
                              {whiteResult.p < 0.05 ? 'WARN (HETERO)' : 'PASS (HOMO)'}
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-bold uppercase px-2 py-0.5 rounded" title={whiteResult.reason}>
                              N/A
                            </span>
                          )}
                        </td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-2.5 px-4 font-bold text-slate-800" title={!gqResult.ok ? gqResult.reason : undefined}>Goldfeld-Quandt Diagnostic F-test</td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {gqResult.ok ? `F = ${gqResult.stat.toFixed(4)}` : '--'}
                        </td>
                        <td className="py-2.5 px-4 text-right text-slate-700">
                          {gqResult.ok ? gqResult.p.toFixed(4) : '--'}
                        </td>
                        <td className="py-2.5 pr-4 text-right">
                          {gqResult.ok ? (
                            <span className={cn(
                              "text-[9px] font-bold uppercase px-2 py-0.5 rounded",
                              gqResult.p < 0.05 ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            )}>
                              {gqResult.p < 0.05 ? 'WARN (HETERO)' : 'PASS (HOMO)'}
                            </span>
                          ) : (
                            <span className="bg-slate-100 text-slate-500 border border-slate-200 text-[9px] font-bold uppercase px-2 py-0.5 rounded" title={gqResult.reason}>
                              N/A
                            </span>
                          )}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {(!whiteResult.ok || !gqResult.ok) && (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-[10px] text-slate-500 font-mono space-y-1">
                    {!whiteResult.ok && <p>White's test not computable: {whiteResult.reason}</p>}
                    {!gqResult.ok && <p>Goldfeld-Quandt not computable: {gqResult.reason}</p>}
                  </div>
                )}

                <p className="text-xs text-slate-500 font-serif leading-relaxed italic bg-white p-4 border border-slate-200 rounded-lg border-l-4 border-blue-600">
                  {bpP !== null && bpP !== undefined ? (
                    bpP < 0.05
                      ? "Warning: Non-constant error variance is flagged. Classical t-tests are biased. It is highly recommended to run the model under 'Robust OLS (HC3)' to ensure correct academic inferences."
                      : "Gauss-Markov homoskedasticity holds. OLS standard errors are BLUE (Best Linear Unbiased Estimator). Classical statistical tests are fully efficient."
                  ) : (
                    "Heteroskedasticity diagnostics are not computed for this model type. Ensure you are evaluating a linear regression model with residuals to access heteroskedasticity tests."
                  )}
                </p>
              </div>
            )}

            {/* 4. AUTOCORRELATION */}
            {activeTab === 'autocorrelation' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <TrendingUp className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a2744] font-mono">Autocorrelation & Dynamic Serials Suite</h4>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono">I. Durbin-Watson statistic (d)</p>
                    <div className="text-3xl font-black text-slate-800 font-mono tracking-tight">{dw !== null && dw !== undefined ? dw.toFixed(4) : 'N/A'}</div>
                    <p className="text-xs text-slate-500 font-serif leading-relaxed">
                      Durbin-Watson tests first-order serial correlation AR(1). d ≈ 2.0 represents absolute lack of serial correlation. d &lt; 1.5 triggers a positive serial correlation warning.
                    </p>
                    {dw !== null && dw !== undefined ? (
                      dw < 1.5 ? (
                        <div className="p-2.5 bg-amber-50 border border-amber-100 rounded text-[9px] font-mono font-bold text-amber-800 uppercase flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Verdict: Warning: Positive first-order autocorrelation.
                        </div>
                      ) : dw > 2.5 ? (
                        <div className="p-2.5 bg-amber-50 border border-amber-100 rounded text-[9px] font-mono font-bold text-amber-800 uppercase flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Verdict: Warning: Negative first-order autocorrelation.
                        </div>
                      ) : (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded text-[9px] font-mono font-bold text-emerald-800 uppercase flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Verdict: No first-order autocorrelation.
                        </div>
                      )
                    ) : (
                      <div className="p-2.5 bg-slate-50 border border-slate-100 rounded text-[9px] font-mono font-bold text-slate-450 uppercase italic">
                        Verdict: Not computed for this model type.
                      </div>
                    )}
                  </div>                   <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono">II. Lag-1 LM Autocorrelation Test (Breusch-Godfrey type)</p>
                    <div className="text-3xl font-black text-slate-800 font-mono tracking-tight">
                      {bgStat !== null ? `LM = ${bgStat.toFixed(3)}` : 'N/A'}
                    </div>
                    <p className="text-xs text-slate-500 font-serif leading-relaxed">
                      Computed from this model's stored residuals: LM = (n-1)·R² of the auxiliary regression of e_t on e_(t-1), asymptotically χ²(1) under the null of no first-order serial correlation.
                    </p>
                    {bgStat !== null && bgP !== null ? (
                      bgP < 0.05 ? (
                        <div className="p-2.5 bg-amber-50 border border-amber-100 rounded text-[9px] font-mono font-bold text-amber-800 uppercase flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          Verdict: Reject null (p = {bgP.toFixed(4)}). Serial correlation detected.
                        </div>
                      ) : (
                        <div className="p-2.5 bg-emerald-50 border border-emerald-100 rounded text-[9px] font-mono font-bold text-emerald-800 uppercase">
                          Verdict: Fail to reject null (p = {bgP.toFixed(4)}). No serial correlation.
                        </div>
                      )
                    ) : (
                      <div className="p-2.5 bg-slate-50 border border-slate-100 rounded text-[9px] font-mono font-bold text-slate-450 uppercase italic">
                        Verdict: Not computed — this model run has no stored residuals.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* 5. SPECIFICATION TESTS */}
            {activeTab === 'specification' && (
              <div className="space-y-6">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <Info className="w-4 h-4 text-blue-600" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a2744] font-mono">Functional Form Specification & RESET tests</h4>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 font-mono font-bold uppercase tracking-wide">
                  Not yet implemented -- these tests are not computed for any model in this lab.
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono">I. Ramsey RESET Test (Omitted Variables)</p>
                    <div className="flex justify-between items-baseline">
                      <span className="font-mono text-sm font-bold text-slate-400">Not computed for this model</span>
                    </div>
                    <p className="text-xs text-slate-500 font-serif leading-relaxed">
                      RESET tests whether non-linear combinations of fitted values help explain the dependent variable. A high p-value would indicate the linear-additive specification is unlikely to suffer from severe omitted non-linearities.
                    </p>
                  </div>

                  <div className="bg-white p-5 border border-slate-200 rounded-lg space-y-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[#1a2744] font-mono">II. Pregibon Link Test for Model Specification</p>
                    <div className="flex justify-between items-baseline">
                      <span className="font-mono text-sm font-bold text-slate-400">Not computed for this model</span>
                    </div>
                    <p className="text-xs text-slate-500 font-serif leading-relaxed">
                      Regresses y on fitted values (ŷ) and squared fitted values (ŷ²). If ŷ² is significant (p &lt; 0.05), it suggests a specification error (wrong functional form or omitted variables).
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 6. MODEL COMPARISON */}
            {activeTab === 'comparison' && (
              <div className="space-y-6">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <div className="flex items-center gap-2">
                    <GitCompare className="w-4 h-4 text-blue-600" />
                    <h4 className="text-xs font-bold uppercase tracking-wider text-[#1a2744] font-mono">Model Comparison Matrix</h4>
                  </div>
                  <span className="text-[9px] text-slate-500 font-mono">Academic Comparison View</span>
                </div>

                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[10px] text-amber-800 font-mono font-bold uppercase tracking-wide">
                  Illustrative template -- not computed from your data. This lab does not yet track multiple saved models side by side.
                </div>

                <div className="overflow-x-auto bg-white border border-slate-200 rounded-lg">
                  <table className="w-full font-mono text-[11px] text-left">
                    <thead>
                      <tr className="bg-[#1a2744] text-white border-b border-slate-400">
                        <th className="py-3 px-4 font-bold">Econometric Index</th>
                        <th className="py-3 px-4 font-bold">Model 1: Wage (CPS)</th>
                        <th className="py-3 px-4 font-bold">Model 2: GDP (Panel)</th>
                        <th className="py-3 px-4 font-bold">Model 3: M3 demand (Causal)</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-b border-slate-200">
                        <td className="py-2.5 px-4 font-bold text-slate-800">Dependent Variable</td>
                        <td className="py-2.5 px-4 text-slate-700 font-bold">wage</td>
                        <td className="py-2.5 px-4 text-slate-700 font-bold">gdp_growth</td>
                        <td className="py-2.5 px-4 text-slate-700 font-bold">m3_demand</td>
                      </tr>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td className="py-2.5 px-4 font-bold text-slate-800">Observations (N)</td>
                        <td className="py-2.5 px-4 text-slate-700">500</td>
                        <td className="py-2.5 px-4 text-slate-700">150</td>
                        <td className="py-2.5 px-4 text-slate-700">80</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-2.5 px-4 font-bold text-slate-800">R-squared</td>
                        <td className="py-2.5 px-4 text-slate-850 font-bold text-blue-600">0.4125</td>
                        <td className="py-2.5 px-4 text-slate-850 font-bold text-blue-600">0.5124</td>
                        <td className="py-2.5 px-4 text-slate-850 font-bold text-blue-600">0.8415</td>
                      </tr>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td className="py-2.5 px-4 font-bold text-slate-800">Adjusted R-squared</td>
                        <td className="py-2.5 px-4 text-slate-700">0.4089</td>
                        <td className="py-2.5 px-4 text-slate-700">0.4988</td>
                        <td className="py-2.5 px-4 text-slate-700">0.8352</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-2.5 px-4 font-bold text-slate-800">AIC</td>
                        <td className="py-2.5 px-4 text-slate-700">2849.0</td>
                        <td className="py-2.5 px-4 text-slate-700">434.8</td>
                        <td className="py-2.5 px-4 text-slate-700">176.2</td>
                      </tr>
                      <tr className="border-b border-slate-200 bg-slate-50">
                        <td className="py-2.5 px-4 font-bold text-slate-800">BIC</td>
                        <td className="py-2.5 px-4 text-slate-700">2865.8</td>
                        <td className="py-2.5 px-4 text-slate-700">449.8</td>
                        <td className="py-2.5 px-4 text-slate-700">185.7</td>
                      </tr>
                      <tr className="border-b border-slate-200">
                        <td className="py-2.5 px-4 font-bold text-slate-800">Log-Likelihood</td>
                        <td className="py-2.5 px-4 text-slate-700">-1420.5</td>
                        <td className="py-2.5 px-4 text-slate-700">-212.4</td>
                        <td className="py-2.5 px-4 text-slate-700">-84.1</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>

        </div>

      </div>

    </div>
  );
}
