import React, { useState } from 'react';
import { Play, TrendingUp, FlaskConical, Info, Sparkles, ShieldCheck, FileDown, CheckCircle2 } from 'lucide-react';
import { Dataset, ARIMAResult } from '../../types';
import { runARIMA, autoARIMA, calculateLjungBox } from '../../lib/econometrics/arima';
import { cn, exportToCSV } from '../../lib/utils';
import { getAuthHeaders, runFullARIMA } from '../../services/apiClient';

// Lazy load chart to reduce bundle size
const EconometricsPlot = React.lazy(() => import('../shared/EconometricsPlot'));

import { DiagnosticCoach } from '../shared/DiagnosticCoach';
import { ModelAssistant } from '../shared/ModelAssistant';
import { CoefficientTranslator } from '../shared/CoefficientTranslator';
import { MistakeDetector, Mistake } from '../shared/MistakeDetector';
import { LearningOverlay, LearningPoint } from '../shared/LearningOverlay';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { TeachingChecklist } from '../shared/TeachingChecklist';
import { useStore } from '../../store/useStore';
import { CodeBridge } from '../shared/CodeBridge';
import ShowCode from '../shared/ShowCode';
import { formatNum, formatPValue } from '../../lib/formatters';

interface ARIMALabProps {
  dataset: Dataset | null;
  onRunComplete: (results: any, spec: string) => void;
  isLoading: boolean;
}

interface PythonARIMACoefficient {
  variable: string;
  estimate: number;
  stdError: number;
  tStat: number;
  pValue: number;
  stars: string;
}

interface PythonARIMAResult {
  coefficients: PythonARIMACoefficient[];
  aic: number;
  bic: number;
  logLikelihood: number;
  n_obs: number;
  forecast: number[];
  forecastCI: [number, number][];
}

export default function ARIMALab({ dataset, onRunComplete, isLoading }: ARIMALabProps) {
  const [targetVar, setTargetVar] = useState<string>('');
  const [p, setP] = useState(1);
  const [d, setD] = useState(1);
  const [q, setQ] = useState(0);
  const [horizon, setHorizon] = useState(12);
  const [stationarityConfirmed, setStationarityConfirmed] = useState(false);
  const [results, setResults] = useState<ARIMAResult | null>(null);
  const [activeStep, setActiveStep] = useState<'projection' | 'diagnostics' | 'explanation'>('projection');
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pythonResult, setPythonResult] = useState<PythonARIMAResult | null>(null);
  const [isPythonRunning, setIsPythonRunning] = useState(false);
  const [pythonError, setPythonError] = useState<string | null>(null);
  const [isAutoSelecting, setIsAutoSelecting] = useState(false);
  const { teachingState, updateTeachingStep, history } = useStore();

  const numericVarsForReset = React.useMemo(
    () => (dataset?.variables || []).filter(v => v.type === 'numeric').map(v => v.name),
    [dataset]
  );

  // Clear a stale target series when it no longer exists in the active
  // dataset (e.g. after switching datasets) - otherwise targetVar silently
  // keeps pointing at a column from the previous dataset (invisible in the
  // picker, which only lists the new dataset's columns), producing an
  // all-NaN series with no error shown rather than an obvious blank picker.
  React.useEffect(() => {
    if (targetVar && !numericVarsForReset.includes(targetVar)) {
      setTargetVar('');
    }
  }, [numericVarsForReset]);

  // Clear stale results whenever the active dataset changes, so a previous
  // dataset's forecast never lingers on screen looking current.
  const datasetKey = dataset?.name ?? null;
  React.useEffect(() => {
    setResults(null);
    setPythonResult(null);
    setError(null);
    setPythonError(null);
  }, [datasetKey]);

  if (!dataset) {
    return (
      <div className="h-96 flex flex-col items-center justify-center text-center border-2 border-dashed border-[#141414]/10">
        <FlaskConical className="w-12 h-12 mb-4 opacity-20" />
        <p className="font-mono text-xs uppercase opacity-50">Please load a dataset in the Data Workspace first</p>
      </div>
    );
  }

  const numericVars = (dataset.variables || []).filter(v => v.type === 'numeric').map(v => v.name);

  const handleSuggest = () => {
    if (!targetVar) {
      alert("Select target series first");
      return;
    }
    setIsAutoSelecting(true);
    // Use setTimeout to allow UI to update if grid search takes a few ms
    setTimeout(() => {
      const data = dataset.data || [];
      const series = data.map(r => parseFloat(r[targetVar]));
      const [bestP, bestD, bestQ] = autoARIMA(series);
      setP(bestP);
      setD(bestD);
      setQ(bestQ);
      setIsAutoSelecting(false);
    }, 100);
  };

  const activeHistoryItem = history.find(h => h.results === results);

  const handleDownloadForecast = () => {
    if (!results) return;
    const data = chartData.map(d => ({
      Index: d.index,
      Actual: ('actual' in d) ? d.actual : '',
      Fitted: ('fitted' in d) ? d.fitted : '',
      Forecast: ('forecast' in d) ? d.forecast : '',
      LowerCI: ('lower' in d) ? d.lower : '',
      UpperCI: ('upper' in d) ? d.upper : ''
    }));
    exportToCSV(data, `arima_forecast_${targetVar}`);
  };

  const handleRun = async () => {
    const issues: Mistake[] = [];

    if (!targetVar) {
      issues.push({
        id: 'missing-y',
        level: 'error',
        problem: 'No Target Series Selected',
        whyItMatters: 'Univariate forecasting requires a time-ordered sequence of values.',
        howToFix: 'Select a series (e.g., "price", "temperature") from the dropdown.',
        nextStep: 'Choose your dependent series.'
      });
    }

    if (horizon <= 0) {
      issues.push({
        id: 'bad-horizon',
        level: 'error',
        problem: 'Invalid Forecast Horizon',
        whyItMatters: 'Forecasts must project at least one period into the future.',
        howToFix: 'Enter a positive integer (e.g., 4, 12, 24).',
        nextStep: 'Specify a valid projection length.'
      });
    }

    if ((dataset.data || []).length < (p + d + q + 10)) {
      issues.push({
        id: 'arima-data-low',
        level: 'warning',
        problem: 'Insufficient Time Series Samples',
        whyItMatters: 'Reliable estimation of ARIMA parameters requires enough observations to identify lags and noise patterns.',
        howToFix: 'Provide a longer historical series or reduce model complexity.',
        nextStep: 'Simplify p, d, or q parameters.'
      });
    }

    setError(null);
    setMistakes(issues);
    if (issues.some(i => i.level === 'error')) return;

    if (!stationarityConfirmed && d === 0) {
      issues.push({
        id: 'stationarity-unconfirmed',
        level: 'warning',
        problem: 'Stationarity Not Confirmed',
        whyItMatters: 'Running ARIMA on non-stationary levels (d=0) without a unit-root check often leads to "Spurious Regression" where the model captures a trend but no true signal.',
        howToFix: 'Ensure your data is stationary or set d=1 to difference the series.',
        nextStep: 'Confirm stationarity in the check panel below.'
      });
      setMistakes(issues);
      return;
    }

    try {
      const series = (dataset.data || []).map(r => parseFloat(r[targetVar]));
      
      // Call the server API for Research-Grade ARIMA Estimation
      const headers = await getAuthHeaders();
      const response = await fetch('/api/estimate/arima', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          series,
          p,
          d,
          q,
          horizon
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'ARIMA Estimation failed');
      }

      const res = await response.json();
      setResults(res);
      const spec = `ARIMA(${p},${d},${q}) on ${targetVar} | Horizon: ${horizon}`;
      onRunComplete(res, spec);

      if (teachingState.isActive) {
        updateTeachingStep('Run projection');
      }
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
    }
  };

  const handleRunPythonBackend = async () => {
    if (!targetVar) {
      setPythonError('Select a target series first.');
      return;
    }
    setIsPythonRunning(true);
    setPythonError(null);
    try {
      const series = (dataset.data || []).map(r => parseFloat(r[targetVar]));
      const res = await runFullARIMA({ series, p, d, q, horizon });
      setPythonResult(res);
    } catch (err: any) {
      setPythonError(err.message || 'Failed to run the full ARIMA model on the Python backend.');
    } finally {
      setIsPythonRunning(false);
    }
  };

  const chartData = results ? [
    ...(dataset.data || []).map((r, i) => ({
      index: i,
      actual: r[targetVar],
      fitted: (results.fitted || [])[i] || null,
    })),
    ...(results.forecast || []).map((f, i) => ({
      index: (dataset.data || []).length + i,
      forecast: f,
      lower: (results.forecastCI || [])[i]?.[0],
      upper: (results.forecastCI || [])[i]?.[1]
    }))
  ] : [];

  const teachingChecklistSteps = [
    { label: 'Inspect the data', isDone: teachingState.completedSteps.includes('Inspect the data') },
    { label: 'Identify series stationarity', isDone: d > 0 }, 
    { label: 'Set p, d, q parameters', isDone: !!targetVar },
    { label: 'Run projection', isDone: !!results },
    { label: 'Evaluate Forecast bands', isDone: false },
    { label: 'Finalize report', isDone: false }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {teachingState.isActive && teachingState.templateId === 'climate' && (
        <TeachingChecklist 
          steps={teachingChecklistSteps}
          notice="Observe the fan-shaped widening of confidence bands. In stationary processes, these eventually stabilize, but in trending data (d > 0), uncertainty grows as errors propagate across the horizon."
          typicalMistake="Ignoring the 'Stochastic Trend' (Unit Root). Modeling non-stationary levels (d=0) instead of changes (d=1) often leads to spurious results that simply follow a path rather than capturing true dynamics."
          discussionQuestion="If we observe p=12 in monthly data, what does that suggest about 'seasonal memory' versus simple autoregressive momentum?"
          nextExtension="Examine the residuals using a Ljung-Box test; if the p-value is low, your ARIMA order might still leave systematic 'signal' in the noise."
        />
      )}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Time-Series Forecast</h2>
          <p className="text-sm text-slate-500 mt-1 italic font-serif">Estimate Autoregressive models to project future values through time.</p>
        </div>
        <div className="flex gap-3">
          <button
            disabled={isLoading}
            onClick={handleRun}
            className="btn-primary flex items-center gap-2"
          >
            <Play className="w-4 h-4 fill-current" />
            {isLoading ? 'Projecting...' : 'Run Projection'}
          </button>
          <button
            disabled={isPythonRunning || !targetVar}
            onClick={handleRunPythonBackend}
            title="Full Kalman-filter MLE via statsmodels on the Python backend -- real coefficient standard errors, MA terms of any order, and correctly-derived forecast intervals."
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-semibold border border-indigo-200 text-indigo-700 bg-indigo-50 hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <ShieldCheck className="w-4 h-4" />
            {isPythonRunning ? 'Running on backend...' : 'Run Benchmark-Grade (Python)'}
          </button>
        </div>
      </div>

      <ModuleIntroCard 
        title="ARIMA"
        description="ARIMA (AutoRegressive Integrated Moving Average) is used for univariate time-series forecasting. It captures the momentum (AR), the trend/stationarity (I), and the noise-shock patterns (MA) of a series."
        useWhen="You have a single variable measured over time and want to predict its future path based strictly on its own historical patterns."
        requires={[
          "Time-ordered numeric series",
          "Stationary or stationarity-corrected (differenced) data",
          "Constant time frequency (e.g., monthly, daily)"
        ]}
        youWillGet={[
          "Fitted values (In-sample)",
          "Point forecasts (Out-of-sample)",
          "95% Confidence Projection intervals",
          "p, d, q parameter estimates"
        ]}
        pitfalls={[
          "Spurious regressions (random walks)",
          "Ignoring structural breaks (regime shifts)",
          "Overfitting with too many lags"
        ]}
        example="Forecasting global temperature anomalies for the next 12 months based on the last 10 years of monthly data."
      />

      <MistakeDetector mistakes={mistakes} />

      {error && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3 items-start">
          <div className="mt-0.5 text-amber-500">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" 
              viewBox="0 0 24 24" fill="none" stroke="currentColor" 
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 
                3.86a2 2 0 00-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/>
              <line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800 mb-1">
              Browser Engine Limitation
            </p>
            <p className="text-sm text-amber-700">
              {error}
            </p>
            <p className="text-xs text-amber-600 mt-2 mb-2">
              Set q = 0 to use the browser preview engine, or run this
              specification on the Python backend below for full ARIMA(p,d,q) support.
            </p>
            <button
              disabled={isPythonRunning || !targetVar}
              onClick={handleRunPythonBackend}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border border-amber-300 text-amber-800 bg-white hover:bg-amber-100 disabled:opacity-50 transition-colors"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              {isPythonRunning ? 'Running on backend...' : `Run ARIMA(${p},${d},${q}) on Python Backend`}
            </button>
          </div>
        </div>
      )}

      {pythonError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          {pythonError}
        </div>
      )}

      {pythonResult && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/40 p-5 space-y-4">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <p className="text-sm font-bold text-indigo-900">
                Benchmark-Grade Results -- Python backend (statsmodels, Kalman-filter MLE)
              </p>
            </div>
            <button
              onClick={() => setPythonResult(null)}
              className="text-xs text-indigo-500 hover:text-indigo-700"
            >
              Dismiss
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="bg-white rounded-lg border border-indigo-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">AIC</p>
              <p className="text-sm font-mono font-bold text-slate-900">{formatNum(pythonResult.aic, 4)}</p>
            </div>
            <div className="bg-white rounded-lg border border-indigo-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">BIC</p>
              <p className="text-sm font-mono font-bold text-slate-900">{formatNum(pythonResult.bic, 4)}</p>
            </div>
            <div className="bg-white rounded-lg border border-indigo-100 p-3">
              <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold">Log-Likelihood</p>
              <p className="text-sm font-mono font-bold text-slate-900">{formatNum(pythonResult.logLikelihood, 4)}</p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-white text-slate-400 font-bold border-b border-indigo-100">
                  <th className="p-2 text-left uppercase tracking-tight">Parameter</th>
                  <th className="p-2 text-right uppercase tracking-tight">Estimate</th>
                  <th className="p-2 text-right uppercase tracking-tight">Std. Error</th>
                  <th className="p-2 text-right uppercase tracking-tight">z</th>
                  <th className="p-2 text-right uppercase tracking-tight">p-value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-indigo-50">
                {pythonResult.coefficients.map(c => (
                  <tr key={c.variable}>
                    <td className="p-2 font-semibold text-slate-700 font-mono">{c.variable}</td>
                    <td className="p-2 text-right tabular-nums font-mono">{formatNum(c.estimate, 4)}</td>
                    <td className="p-2 text-right tabular-nums font-mono">{formatNum(c.stdError, 4)}</td>
                    <td className="p-2 text-right tabular-nums font-mono">{formatNum(c.tStat, 3)}</td>
                    <td className="p-2 text-right tabular-nums font-mono">{formatPValue(c.pValue)}{c.stars}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wide text-slate-400 font-bold mb-1.5">
              Forecast (next {pythonResult.forecast.length} periods, 95% CI)
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-white text-slate-400 font-bold border-b border-indigo-100">
                    <th className="p-2 text-left uppercase tracking-tight">h</th>
                    <th className="p-2 text-right uppercase tracking-tight">Forecast</th>
                    <th className="p-2 text-right uppercase tracking-tight">Lower 95%</th>
                    <th className="p-2 text-right uppercase tracking-tight">Upper 95%</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-indigo-50">
                  {pythonResult.forecast.map((f, i) => (
                    <tr key={i}>
                      <td className="p-2 font-mono text-slate-500">{i + 1}</td>
                      <td className="p-2 text-right tabular-nums font-mono font-bold">{formatNum(f, 4)}</td>
                      <td className="p-2 text-right tabular-nums font-mono text-slate-500">{formatNum(pythonResult.forecastCI[i]?.[0], 4)}</td>
                      <td className="p-2 text-right tabular-nums font-mono text-slate-500">{formatNum(pythonResult.forecastCI[i]?.[1], 4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Config Panel */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card-premium p-6 space-y-6">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4 font-mono">Univariate Target</h3>
              <select value={targetVar} onChange={(e) => setTargetVar(e.target.value)} className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded outline-none font-medium">
                <option value="">Select Target Series...</option>
                {numericVars.map(v => <option key={v} value={v}>{v}</option>)}
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">ARIMA Weights</h3>
                <button 
                  onClick={handleSuggest}
                  disabled={isAutoSelecting}
                  className={cn(
                    "text-[10px] font-bold flex items-center gap-1 transition-colors",
                    isAutoSelecting ? "text-slate-400" : "text-blue-600 hover:underline"
                  )}
                >
                  <Sparkles className={cn("w-3 h-3", isAutoSelecting && "animate-pulse")} /> 
                  {isAutoSelecting ? 'Searching...' : 'Auto-Order'}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                 <div className="space-y-1">
                   <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">p (AR)</label>
                   <input type="number" value={isNaN(p) ? "" : p} onChange={(e) => { const val = parseInt(e.target.value); setP(isNaN(val) ? 0 : val); }} className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded font-mono" />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">d (Diff)</label>
                   <input type="number" value={isNaN(d) ? "" : d} onChange={(e) => { const val = parseInt(e.target.value); setD(isNaN(val) ? 0 : val); }} className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded font-mono" />
                 </div>
                 <div className="space-y-1">
                   <label className="text-[9px] font-bold text-slate-500 uppercase tracking-tight">q (MA)</label>
                   <input type="number" value={isNaN(q) ? "" : q} onChange={(e) => { const val = parseInt(e.target.value); setQ(isNaN(val) ? 0 : val); }} className="w-full p-2 text-xs bg-slate-50 border border-slate-200 rounded font-mono" />
                 </div>
              </div>
            </div>

            <div className="pt-6 border-t border-slate-100 space-y-4">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Statistical Guard</h3>
              <div 
                onClick={() => setStationarityConfirmed(!stationarityConfirmed)}
                className={cn(
                  "p-4 rounded-xl border-2 border-dashed transition-all cursor-pointer group",
                  stationarityConfirmed 
                    ? "bg-emerald-50 border-emerald-200" 
                    : "bg-slate-50 border-slate-200 hover:border-blue-200"
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "p-1.5 rounded-full transition-colors",
                    stationarityConfirmed ? "bg-emerald-500 text-white" : "bg-slate-200 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500"
                  )}>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <p className={cn("text-[10px] font-bold uppercase tracking-tight", stationarityConfirmed ? "text-emerald-700" : "text-slate-600")}>
                      Confirm Stationarity
                    </p>
                    <p className="text-[9px] text-slate-400 leading-tight mt-1 font-serif italic">
                      "I have inspected the series and verified it has no unit-root (d={d})."
                    </p>
                  </div>
                </div>
              </div>
              {!stationarityConfirmed && d === 0 && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 text-amber-700 rounded-lg">
                  <Info className="w-3 h-3 mt-0.5 shrink-0" />
                  <p className="text-[9px] leading-relaxed">
                    Most economic levels (prices, GDP) are <strong>non-stationary</strong>. If the plot shows a trend, you MUST difference (d=1) or justify d=0.
                  </p>
                </div>
              )}
            </div>

            <div className="pt-6 border-t border-slate-100">
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-4 font-mono">Forecast Horizon</h3>
              <input type="number" value={isNaN(horizon) ? "" : horizon} onChange={(e) => { const val = parseInt(e.target.value); setHorizon(isNaN(val) ? 1 : val); }} className="w-full p-2.5 text-xs bg-slate-50 border border-slate-200 rounded font-mono" />
              <p className="mt-2 text-[10px] text-slate-400 italic font-serif">Periods into the future to project from last observed data point.</p>
            </div>
          </div>

          <div className="card-premium p-6 bg-slate-50 border-none">
             <div className="flex gap-3">
               <Info className="w-4 h-4 text-blue-600 shrink-0" />
               <div className="space-y-2">
                 <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-600 font-mono">Structural Note</h3>
                 <p className="text-xs text-slate-500 leading-relaxed font-serif">
                   Differencing (d) is applied to achieve unit-root stability. Models are fit using ordinary least squares on lagged levels and differences.
                 </p>
               </div>
             </div>
          </div>
        </div>

        {/* Results / Plot Area */}
        <div className="lg:col-span-2 space-y-6 min-h-[500px]">
          {!results ? (
            <div className="space-y-6">
              <ModelAssistant dataset={dataset} activeModule="ARIMA" />
              <div className="card-premium h-full min-h-[300px] flex flex-col items-center justify-center p-20 text-center border-dashed border-slate-200 bg-slate-50/30">
                 <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                  <TrendingUp className="w-10 h-10 text-slate-200" />
                 </div>
                 <h3 className="text-slate-900 font-semibold tracking-tight">Time-Series Forecast Pending</h3>
                 <p className="text-sm text-slate-500 max-w-xs mt-2 font-serif">Specify your target variable and ARIMA orders to generate a structural projection into the future.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
               {/* Internal Workflow Navigation */}
               <div className="flex border-b border-slate-100 mb-8 overflow-x-auto custom-scrollbar">
                 {[
                   { id: 'projection', label: '1. Projection' },
                   { id: 'diagnostics', label: '2. Diagnostics' },
                   { id: 'explanation', label: '3. Technical' }
                 ].map(step => (
                   <button
                     key={step.id}
                     onClick={() => setActiveStep(step.id as any)}
                     className={cn(
                       "px-6 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap",
                       activeStep === step.id 
                         ? "border-blue-600 text-blue-600" 
                         : "border-transparent text-slate-400 hover:text-slate-600"
                     )}
                   >
                     {step.label}
                   </button>
                 ))}
               </div>

               {activeStep === 'projection' && (
                 <div className="space-y-6 animate-in fade-in duration-300">
                    {/* Plot Card */}
                    <div className="card-premium p-4 sm:p-8">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
                          <div className="space-y-1">
                            <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Structural Projection</h3>
                            <p className="text-[10px] text-slate-400 italic">Historical actual vs ARIMA({results.order.join(',')}) projection</p>
                          </div>
                          <div className="flex items-center gap-4">
                             <div className="flex items-center gap-1.5 focus:outline-none">
                                <div className="w-2 h-2 rounded-full bg-slate-900" />
                                <span className="text-[9px] uppercase font-bold text-slate-500">Actual</span>
                             </div>
                             <div className="flex items-center gap-1.5 focus:outline-none">
                                <div className="w-2 h-0.5 bg-blue-500 border-t border-dashed border-blue-500" />
                                <span className="text-[9px] uppercase font-bold text-slate-500">Forecast</span>
                             </div>
                          </div>
                        </div>
                        
                        <div className="h-64 sm:h-80">
                          <React.Suspense fallback={<div className="h-full w-full bg-slate-50 animate-pulse rounded-xl" />}>
                            <EconometricsPlot 
                              type="arima"
                              data={chartData}
                            />
                          </React.Suspense>
                        </div>
                    </div>

                    <div className="card-premium overflow-hidden">
                        <div className="p-4 bg-slate-50/80 border-b border-slate-100 flex items-center justify-between">
                          <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Process Parameters</h3>
                          <button
                            onClick={handleDownloadForecast}
                            className="text-[10px] font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors"
                          >
                            <FileDown className="w-3 h-3" /> Export Forecast
                          </button>
                        </div>
                        <div className="px-4 pt-3 pb-1 text-[10px] text-slate-400 leading-relaxed">
                          Simplified preview engine (conditional sum-of-squares) -- point estimates only, no
                          standard errors or significance. For inference-grade output, use "Run Benchmark-Grade
                          (Python)" above.
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="bg-slate-50 text-slate-400 font-bold border-b border-slate-100">
                                <th className="p-4 font-bold uppercase tracking-tighter">Parameter</th>
                                <th className="p-4 font-bold uppercase tracking-tighter text-right">Estimate (Φ/Θ)</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 text-[11px]">
                              {Object.entries(results.coefficients).map(([variable, estimate]) => (
                                <tr key={variable} className="hover:bg-slate-50/50 transition-colors">
                                  <td className="p-4 font-semibold text-slate-700 font-mono">{variable}</td>
                                  <td className="p-4 text-right tabular-nums text-slate-900 font-bold font-mono">{formatNum(estimate, 4)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                    </div>

                    {/* Stat Tiles */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                      {[
                        { label: 'AIC', value: formatNum(results.aic, 2) },
                        { label: 'BIC', value: formatNum(results.bic, 2) },
                        { label: 'Root MSE', value: formatNum((results.fitted || []).length > 0 ? (results as any).rmse || 0 : 0, 4) },
                        { label: 'D_Order', value: (results.order[1] || 0).toString(), color: 'text-blue-600' }
                      ].map((stat) => (
                        <div key={stat.label} className="card-premium p-3 sm:p-4 min-h-[70px] flex flex-col justify-center">
                            <p className="text-[9px] uppercase font-bold text-slate-400 mb-1 font-mono tracking-tight">{stat.label}</p>
                            <p className={cn("text-base sm:text-lg font-bold tabular-nums", stat.color || "text-slate-900")}>{stat.value}</p>
                        </div>
                      ))}
                    </div>
                 </div>
               )}

               {activeStep === 'diagnostics' && (
                 <div className="space-y-6 animate-in fade-in duration-300">
                    <DiagnosticCoach 
                      modelType="ARIMA" 
                      results={results} 
                      specification={`${targetVar} ~ ARIMA(${results.order.join(',')})`} 
                      modelId={activeHistoryItem?.id || ''}
                    />
                 </div>
               )}

               {activeStep === 'explanation' && (
                 <div className="space-y-6 animate-in fade-in duration-300">
                    <LearningOverlay 
                      title="Forecast Mechanics"
                      subtitle="Understanding the ARIMA(p, d, q) Process"
                      points={[
                        {
                          title: "Autoregressive (p)",
                          icon: FlaskConical,
                          color: "bg-blue-500",
                          description: p === 0 ? "No structural lags are used." : `The model uses the previous ${p} period(s) as predictors for the current step.`,
                          context: "Think of 'p' as structural momentum. It assumes today's value is a weighted proportion of recent history plus a random shock. High 'p' values can capture complex cycles but risk 'overfitting' to past noise."
                        },
                        {
                          title: "Integration (d)",
                          icon: ShieldCheck,
                          color: "bg-indigo-500",
                          description: d === 0 ? "Raw levels are stationary." : `The series was differenced ${d} time(s) to remove trends and stabilize the mean.`,
                          context: "We use 'd' to transform 'path-dependent' levels into 'independent' changes (returns). This is vital for data like prices or temperatures that lack a fixed mean and 'drift' over time."
                        },
                        {
                          title: "Moving Average (q)",
                          icon: Sparkles,
                          color: "bg-emerald-500",
                          description: q === 0 ? "No error feedback is used." : `The model accounts for the persistence of ${q} previous random 'shocks'.`,
                          context: "While 'p' looks at previous values, 'q' looks at previous 'surprises'. It helps the model distinguish between a fundamental shift and a temporary idiosyncratic spike or measurement error."
                        },
                        {
                          title: "Horizon Uncertainty",
                          icon: Info,
                          color: "bg-amber-500",
                          description: "The 'fan chart' represents the growing variance of our probabilistic forecast.",
                          context: "As we project further, errors propagate. Because 'tomorrow' depends on an estimated 'today', uncertainty compounds. Widening bands signal that long-term predictions should be viewed as ranges, not points."
                        }
                      ]}
                    />

                    <CoefficientTranslator 
                      coefficients={Object.entries(results.coefficients).map(([v, e]) => {
                        const match = v.match(/\d+/);
                        const lag = match ? parseInt(match[0], 10) : 1;
                        const residuals = results.residuals || [];
                        const ljungBoxResult = calculateLjungBox(residuals, lag);
                        return {
                          variable: v,
                          estimate: e,
                          stdError: 0,
                          tStat: 0,
                          pValue: ljungBoxResult.pValue
                        } as any;
                      })}
                      yVar={targetVar}
                      xVars={[]}
                      modelType="ARIMA"
                    />

                    <div className="pt-6 border-t border-slate-100">
                      <ShowCode 
                        parameters={{
                          modelType: "arima",
                          yVariable: targetVar,
                          xVariables: [],
                          options: {
                            orders: [p, d, q]
                          }
                        }}
                      />
                    </div>
                 </div>
               )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
