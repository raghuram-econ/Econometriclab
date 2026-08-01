import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  HelpCircle, 
  Info, 
  Play, 
  Binary, 
  RefreshCw, 
  BrainCircuit,
  LineChart,
  LayoutGrid,
  BookOpen
} from 'lucide-react';
import { Dataset } from '../../types';
import { generateMasterDataset } from '../../lib/dataGenerators';
import { runJohansen, runCointegration, runGARCHPy } from '../../services/apiClient';
import { runGARCH, runGrangerCausality } from '../../lib/econometrics/arima';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { ResponsiveContainer, LineChart as RecLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import * as math from 'mathjs';

interface AdvancedTimeSeriesLabProps {
  dataset: Dataset | null;
  onRunComplete?: (results: any, spec: string) => void;
}

export default function AdvancedTimeSeriesLab({ dataset: propDataset, onRunComplete }: AdvancedTimeSeriesLabProps) {
  const [localDataset, setLocalDataset] = useState<Dataset | null>(null);

  const activeDataset = useMemo(() => {
    if (propDataset) return propDataset;
    if (localDataset) return localDataset;
    return null;
  }, [propDataset, localDataset]);

  const handleLoadSample = () => {
    const master = generateMasterDataset();
    const firstRow = master[0];
    if (!firstRow) return;
    setLocalDataset({
      name: "Master Econometrics Dataset",
      data: master,
      rowCount: master.length,
      colCount: Object.keys(firstRow).length,
      variables: Object.keys(firstRow).map(key => ({
        name: key,
        type: typeof (firstRow as any)[key] === 'number' ? 'numeric' : 'categorical',
        label: key
      })),
      structure: 'panel'
    });
  };

  const numericVariables = useMemo(() => {
    if (!activeDataset) return [];
    return activeDataset.variables.filter(v => v.type === 'numeric').map(v => v.name);
  }, [activeDataset]);

  const [modelType, setModelType] = useState<'var' | 'garch'>('var');
  const [varY1, setVarY1] = useState<string>('');
  const [varY2, setVarY2] = useState<string>('');
  const [lagOrder, setLagOrder] = useState<number>(1);
  const [results, setResults] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [researchGradeGarch, setResearchGradeGarch] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'estimation' | 'results' | 'irf' | 'cointegration'>('estimation');

  // Cointegration States
  const [cointVars, setCointVars] = useState<string[]>([]);
  const [cointLags, setCointLags] = useState<number>(1);
  const [cointDet, setCointDet] = useState<number>(0);
  const [cointResults, setCointResults] = useState<any | null>(null);
  const [isCointRunning, setIsCointRunning] = useState<boolean>(false);
  const [cointError, setCointError] = useState<string | null>(null);
  const [engleResults, setEngleResults] = useState<any | null>(null);
  const [isEngleRunning, setIsEngleRunning] = useState<boolean>(false);

  React.useEffect(() => {
    if (numericVariables.length > 1) {
      if (!varY1 || !numericVariables.includes(varY1)) {
        setVarY1(numericVariables.find(v => v === 'inflation') || numericVariables[0] || '');
      }
      if (!varY2 || !numericVariables.includes(varY2)) {
        setVarY2(numericVariables.find(v => v === 'unemployment') || numericVariables[1] || '');
      }
    }
  }, [numericVariables]);

  React.useEffect(() => {
    if (numericVariables.length >= 2 && cointVars.length === 0) {
      setCointVars([
        numericVariables.find(v => v === 'inflation') || numericVariables[0],
        numericVariables.find(v => v === 'unemployment') || numericVariables[1]
      ].filter(Boolean) as string[]);
    }
  }, [numericVariables]);

  const handleRunCointegration = async () => {
    if (!activeDataset || cointVars.length < 2) {
      setCointError("Please select at least 2 variables for cointegration testing.");
      return;
    }
    setIsCointRunning(true);
    setCointError(null);
    try {
      const alignedData: number[][] = [];
      const validRows = activeDataset.data.filter((row: any) => {
        return cointVars.every(v => {
          const val = parseFloat(row[v]);
          return !isNaN(val) && isFinite(val);
        });
      });

      if (validRows.length < 15) {
        throw new Error("At least 15 valid observations are required for Johansen Cointegration analysis.");
      }

      validRows.forEach((row: any) => {
        alignedData.push(cointVars.map(v => parseFloat(row[v])));
      });

      const res = await runJohansen({
        data: alignedData,
        variable_names: cointVars,
        det_order: cointDet,
        k_ar_diff: cointLags
      });

      setCointResults(res);
    } catch (err: any) {
      console.error("Cointegration Error:", err);
      setCointError(err.message || "Failed to run Johansen Cointegration test.");
    } finally {
      setIsCointRunning(false);
    }
  };

  const handleRunEngle = async () => {
    if (!activeDataset || cointVars.length < 2) {
      setCointError("Select at least 2 variables for the Engle-Granger test.");
      return;
    }
    setIsEngleRunning(true);
    setCointError(null);
    try {
      const validRows = activeDataset.data.filter((row: any) =>
        cointVars.every(v => { const val = parseFloat(row[v]); return !isNaN(val) && isFinite(val); })
      );
      if (validRows.length < 15) {
        throw new Error("At least 15 valid observations are required for the Engle-Granger test.");
      }
      const series = validRows.map((row: any) => cointVars.map(v => parseFloat(row[v])));
      const res = await runCointegration({ series, seriesNames: cointVars });
      setEngleResults(res);
    } catch (err: any) {
      setCointError(err.message || "Failed to run Engle-Granger cointegration test.");
    } finally {
      setIsEngleRunning(false);
    }
  };

  const handleRunEstimation = () => {
    if (!activeDataset || !varY1) return;
    if (modelType === 'var' && !varY2) return;

    // Research-grade path: fit GARCH on the Python backend via the `arch` package.
    if (modelType === 'garch' && researchGradeGarch) {
      setIsRunning(true);
      (async () => {
        try {
          const series1 = activeDataset.data.map(r => parseFloat(r[varY1])).filter(v => !isNaN(v));
          if (series1.length < 20) throw new Error('Need at least 20 observations for GARCH estimation.');
          const res = await runGARCHPy({ series: series1, p: 1, q: 1 });
          const mean1 = series1.reduce((s, v) => s + v, 0) / series1.length;
          const vol: number[] = res.conditionalVolatility || [];
          const volSeries = vol.map((v: number, idx: number) => ({ time: idx, residual: (series1[idx] ?? mean1) - mean1, volatility: v }));
          const denom = 1 - (res.alpha || 0) - (res.beta || 0);
          setResults({
            type: 'garch', n: res.nobs ?? series1.length, variable: varY1,
            omega: res.omega, alpha: res.alpha, beta: res.beta, persistence: res.persistence,
            logLik: res.logLik, aic: res.aic, bic: res.bic,
            unconditionalVol: denom > 1e-8 ? Math.sqrt((res.omega || 0) / denom) : NaN,
            engine: 'python', volSeries,
          });
          setActiveTab('results');
        } catch (err: any) {
          alert(err?.message || 'Python GARCH failed. Ensure the backend is running and you are signed in.');
        } finally {
          setIsRunning(false);
        }
      })();
      return;
    }

    setIsRunning(true);

    setTimeout(() => {
      try {
        const d1 = activeDataset.data.map(row => parseFloat(row[varY1])).filter(v => !isNaN(v));
        const d2 = activeDataset.data.map(row => parseFloat(row[varY2])).filter(v => !isNaN(v));

        const len = Math.min(d1.length, d2.length);
        if (len < 10) throw new Error("At least 10 observations required.");

        const series1 = d1.slice(0, len);
        const series2 = d2.slice(0, len);

        if (modelType === 'var') {
          // Fit VAR(1): 
          // Y1_t = c1 + a11 * Y1_{t-1} + a12 * Y2_{t-1} + e1
          // Y2_t = c2 + a21 * Y1_{t-1} + a22 * Y2_{t-1} + e2
          const Y1: number[] = [];
          const Y2: number[] = [];
          const X: number[][] = [];

          for (let t = 1; t < len; t++) {
            Y1.push(series1[t] ?? 0);
            Y2.push(series2[t] ?? 0);
            X.push([1, series1[t-1] ?? 0, series2[t-1] ?? 0]);
          }

          const n_reg = Y1.length;
          const k = 3;

          const Xt = math.transpose(X);
          const XtX = math.multiply(Xt, X);
          const XtX_inv = math.inv(XtX as any) as number[][];

          const beta1 = math.multiply(XtX_inv, math.multiply(Xt, Y1)) as any as number[];
          const beta2 = math.multiply(XtX_inv, math.multiply(Xt, Y2)) as any as number[];

          // Calculate standard errors & R-squares
          const y1_hat = math.multiply(X, beta1) as any as number[];
          const y2_hat = math.multiply(X, beta2) as any as number[];

          const res1 = Y1.map((v, idx) => v - (y1_hat[idx] ?? 0));
          const res2 = Y2.map((v, idx) => v - (y2_hat[idx] ?? 0));

          const rss1 = res1.reduce((sum, r) => sum + r * r, 0);
          const rss2 = res2.reduce((sum, r) => sum + r * r, 0);

          const sd_res1 = Math.sqrt(rss1 / (n_reg - k));
          const sd_res2 = Math.sqrt(rss2 / (n_reg - k));

          // Run Impulse Response Function (IRF) Projection over 8 horizons
          // Trace a 1 SD shock to Y1's error term (shock to e1)
          const irf1_y1: number[] = [sd_res1]; // step 0 response of Y1 to shock 1
          const irf1_y2: number[] = [0];        // step 0 response of Y2 to shock 1

          // Trace a 1 SD shock to Y2's error term (shock to e2)
          const irf2_y1: number[] = [0];
          const irf2_y2: number[] = [sd_res2];

          // Project steps 1 to 8:
          // y_t = A * y_{t-1}
          for (let h = 1; h <= 8; h++) {
            const b1_1 = beta1[1] ?? 0;
            const b1_2 = beta1[2] ?? 0;
            const b2_1 = beta2[1] ?? 0;
            const b2_2 = beta2[2] ?? 0;
            
            const prev_irf1_y1 = irf1_y1[h-1] ?? 0;
            const prev_irf1_y2 = irf1_y2[h-1] ?? 0;
            const prev_irf2_y1 = irf2_y1[h-1] ?? 0;
            const prev_irf2_y2 = irf2_y2[h-1] ?? 0;

            // response to Shock 1
            const y1_next_sh1 = b1_1 * prev_irf1_y1 + b1_2 * prev_irf1_y2;
            const y2_next_sh1 = b2_1 * prev_irf1_y1 + b2_2 * prev_irf1_y2;
            irf1_y1.push(y1_next_sh1);
            irf1_y2.push(y2_next_sh1);

            // response to Shock 2
            const y1_next_sh2 = b1_1 * prev_irf2_y1 + b1_2 * prev_irf2_y2;
            const y2_next_sh2 = b2_1 * prev_irf2_y1 + b2_2 * prev_irf2_y2;
            irf2_y1.push(y1_next_sh2);
            irf2_y2.push(y2_next_sh2);
          }

          const irfData = Array.from({ length: 9 }, (_, step) => ({
            step,
            shockY1_respY1: irf1_y1[step] ?? 0,
            shockY1_respY2: irf1_y2[step] ?? 0,
            shockY2_respY1: irf2_y1[step] ?? 0,
            shockY2_respY2: irf2_y2[step] ?? 0,
          }));

          // Granger causality in both directions via the certified test
          let granger: any = null;
          try {
            const gcData = series1.map((v, i) => ({ [varY1]: v, [varY2]: series2[i] ?? 0 }));
            granger = {
              lag: lagOrder,
              xToY: runGrangerCausality(gcData, varY1, varY2, lagOrder),
              yToX: runGrangerCausality(gcData, varY2, varY1, lagOrder),
            };
          } catch (_e) { granger = null; }

          setResults({
            type: 'var',
            n: n_reg,
            granger,
            varY1,
            varY2,
            equation1: {
              const: beta1[0] ?? 0,
              y1_lag1: beta1[1] ?? 0,
              y2_lag1: beta1[2] ?? 0,
              se_const: Math.sqrt((XtX_inv[0]?.[0] ?? 0) * (rss1 / (n_reg - k))),
              se_y1_lag1: Math.sqrt((XtX_inv[1]?.[1] ?? 0) * (rss1 / (n_reg - k))),
              se_y2_lag1: Math.sqrt((XtX_inv[2]?.[2] ?? 0) * (rss1 / (n_reg - k))),
            },
            equation2: {
              const: beta2[0] ?? 0,
              y1_lag1: beta2[1] ?? 0,
              y2_lag1: beta2[2] ?? 0,
              se_const: Math.sqrt((XtX_inv[0]?.[0] ?? 0) * (rss2 / (n_reg - k))),
              se_y1_lag1: Math.sqrt((XtX_inv[1]?.[1] ?? 0) * (rss2 / (n_reg - k))),
              se_y2_lag1: Math.sqrt((XtX_inv[2]?.[2] ?? 0) * (rss2 / (n_reg - k))),
            },
            irfData
          });
          setActiveTab('results');
        } 
        else {
          // ARCH / GARCH(1,1) fitted by maximum likelihood via the certified
          // estimator. (This branch previously used hardcoded placeholder
          // parameters instead of estimating them from the data.)
          const mean1 = series1.reduce((sum, v) => sum + v, 0) / len;
          const residuals = series1.map(v => v - mean1);

          const garch = runGARCH(series1, 1, 1);

          const volSeries = garch.conditionalVariance.map((cv, idx) => ({
            time: idx,
            residual: residuals[idx] ?? 0,
            volatility: Math.sqrt(Math.max(cv, 0))
          }));

          const denom = 1 - garch.alpha - garch.beta;
          const unconditionalVol = denom > 1e-8 ? Math.sqrt(garch.omega / denom) : NaN;

          setResults({
            type: 'garch',
            n: len,
            variable: varY1,
            omega: garch.omega,
            alpha: garch.alpha,
            beta: garch.beta,
            persistence: garch.persistence,
            logLik: garch.logLik,
            aic: garch.aic,
            bic: garch.bic,
            unconditionalVol,
            volSeries
          });
          setActiveTab('results');
        }
      } catch (err: any) {
        alert(err.message || "An error occurred during Time Series estimation.");
      } finally {
        setIsRunning(false);
      }
    }, 600);
  };

  return (
    <div id="adv-timeseries-lab" className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700">
      <ModuleIntroCard 
        title="Advanced Time Series"
        description="Model dynamic joint processes and autoregressive conditional heteroskedasticity. Vector Autoregressions map feedback loops, while GARCH captures volatility clustering in macroeconomic indicators."
        useWhen="You are modeling multiple cointegrated series or capturing changes in conditional asset volatility over time."
        requires={["Stationary or cointegrated time-series data", "Lag structural assumptions", "Covariance-stationarity (α + β < 1)"]}
        youWillGet={["VAR Lag matrices", "Impulse Response Function (IRF) projections", "Conditional volatility parameters", "GARCH shock timelines"]}
        pitfalls={["Spurious regression from non-stationary series", "Over-lagging causing df depletion", "Unstable GARCH matrices where parameters sum to ≥ 1"]}
        example="σ_t² = ω + α e_{t-1}² + β σ_{t-1}²"
      />

      {!activeDataset ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4 max-w-xl mx-auto">
          <TrendingUp className="w-12 h-12 text-indigo-500 mx-auto animate-pulse" />
          <h3 className="text-lg font-serif font-bold text-stone-900">Active Dataset Required</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Please load an active dataset from the Data module or click below to automatically load the Master Econometrics sample series.
          </p>
          <button 
            onClick={handleLoadSample}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-mono tracking-wider uppercase rounded-xl transition shadow-sm"
          >
            Load Master Econometrics Dataset
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          <div className="flex bg-stone-100 p-1 rounded-xl w-full sm:w-fit mx-auto overflow-x-auto custom-scrollbar">
            {[
              { id: 'estimation', label: '1. Specification', icon: Binary, enabled: true },
              { id: 'results', label: '2. Estimation Output', icon: LayoutGrid, enabled: !!results },
              { id: 'irf', label: modelType === 'var' ? '3. Impulse Response (IRF)' : '3. Volatility Timeline', icon: LineChart, enabled: !!results },
              { id: 'cointegration', label: '4. Cointegration & VECM', icon: TrendingUp, enabled: true },
            ].map((tab) => (
              <button
                key={tab.id}
                disabled={!tab.enabled}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex-1 sm:flex-initial whitespace-nowrap justify-center sm:justify-start ${
                  !tab.enabled ? 'opacity-40 cursor-not-allowed' : ''
                } ${
                  activeTab === tab.id ? "bg-white text-indigo-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
                }`}
              >
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </button>
            ))}
          </div>

          {activeTab === 'estimation' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Setup form */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">Time Series Model</h3>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700">1. Modeling Engine</label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          setModelType('var');
                          setResults(null);
                        }}
                        className={`p-3 rounded-xl border text-xs font-bold text-center transition ${
                          modelType === 'var' ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-stone-200 text-stone-600'
                        }`}
                      >
                        VAR System
                      </button>
                      <button
                        onClick={() => {
                          setModelType('garch');
                          setResults(null);
                        }}
                        className={`p-3 rounded-xl border text-xs font-bold text-center transition ${
                          modelType === 'garch' ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-stone-200 text-stone-600'
                        }`}
                      >
                        ARCH / GARCH
                      </button>
                    </div>
                  </div>

                  {modelType === 'var' ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-stone-700">First Endogenous Variable (Y1)</label>
                        <select
                          value={varY1}
                          onChange={(e) => setVarY1(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {numericVariables.map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-stone-700">Second Endogenous Variable (Y2)</label>
                        <select
                          value={varY2}
                          onChange={(e) => setVarY2(e.target.value)}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {numericVariables.filter(v => v !== varY1).map(v => (
                            <option key={v} value={v}>{v}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-stone-700">Lag Order (p)</label>
                        <select
                          value={lagOrder}
                          onChange={(e) => setLagOrder(parseInt(e.target.value))}
                          className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          <option value={1}>VAR(1)</option>
                        </select>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-stone-700">Volatility Variable (Y)</label>
                      <select
                        value={varY1}
                        onChange={(e) => setVarY1(e.target.value)}
                        className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        {numericVariables.map(v => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                      <label className="flex items-start gap-2 text-[11px] text-stone-600 cursor-pointer bg-stone-50 border border-stone-100 rounded-lg p-2.5 mt-2">
                        <input type="checkbox" checked={researchGradeGarch} onChange={e => setResearchGradeGarch(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5" />
                        <span>Research-grade engine (Python / arch) <span className="text-stone-400">— full MLE GARCH. Requires sign-in.</span></span>
                      </label>
                    </div>
                  )}

                  <button
                    onClick={handleRunEstimation}
                    disabled={isRunning || !varY1 || (modelType === 'var' && !varY2)}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Fitting Dynamics...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" /> Estimate System
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Information Panel */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
                  <h4 className="text-lg font-serif font-bold text-stone-900">
                    {modelType === 'var' ? 'Joint Feedback Loops: Vector Autoregression' : 'Volatility Clustering: ARCH/GARCH Model'}
                  </h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    {modelType === 'var' ? (
                      `Vector Autoregressions (VAR) allow all variables in the system to be endogenous. Every variable is regressed on its own lag and the lags of every other variable. This capture dynamic, two-way macro feedback systems (e.g. how inflation shocks trigger central bank interest rate hikes, which subsequently feedback to dampen inflation and alter unemployment timelines).`
                    ) : (
                      `Standard OLS assumes constant variance of errors (homoskedasticity). GARCH (Generalized Autoregressive Conditional Heteroskedasticity) relaxes this by modeling variance as dynamic and dependent on past shocks (ARCH effect) and its own past values (GARCH effect). This is critical for asset prices and currency returns.`
                    )}
                  </p>

                  <div className="border-t border-stone-100 pt-6 space-y-4">
                    <h5 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">Gauss-Markov Contrast</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="p-4 bg-stone-50 border border-stone-100 rounded-xl space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Classical Static OLS</span>
                        <p className="text-xs text-stone-600">Assumes strictly exogenous independent variables and homoskedastic, uncorrelated errors.</p>
                      </div>
                      <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-indigo-500">Dynamic Lag Solutions</span>
                        <p className="text-xs text-stone-600">Models past temporal lags and auto-regressive structures directly, correcting for serial bias.</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'results' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
              <h4 className="text-lg font-serif font-bold text-stone-900">
                {results.type === 'var' ? 'Estimated VAR(1) Coefficient Matrices' : 'ARCH/GARCH Volatility Estimates'}
              </h4>
              {results.engine === 'python' && (
                <span className="inline-block text-[9px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">Python / arch (research-grade)</span>
              )}

              {results.type === 'var' ? (
                <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Eq 1 */}
                  <div className="border border-stone-100 rounded-xl p-5 bg-stone-50/50 space-y-4">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600">Equation 1: {results.varY1}</span>
                    <div className="space-y-2 font-mono text-xs">
                      <div className="flex justify-between border-b border-stone-100 pb-1.5">
                        <span>Constant (c)</span>
                        <span className="font-bold">{results.equation1.const.toFixed(4)} <span className="text-xs text-stone-400">(SE: {results.equation1.se_const.toFixed(4)})</span></span>
                      </div>
                      <div className="flex justify-between border-b border-stone-100 pb-1.5">
                        <span>{results.varY1} (t-1)</span>
                        <span className="font-bold">{results.equation1.y1_lag1.toFixed(4)} <span className="text-xs text-stone-400">(SE: {results.equation1.se_y1_lag1.toFixed(4)})</span></span>
                      </div>
                      <div className="flex justify-between pb-1.5">
                        <span>{results.varY2} (t-1)</span>
                        <span className="font-bold">{results.equation1.y2_lag1.toFixed(4)} <span className="text-xs text-stone-400">(SE: {results.equation1.se_y2_lag1.toFixed(4)})</span></span>
                      </div>
                    </div>
                  </div>

                  {/* Eq 2 */}
                  <div className="border border-stone-100 rounded-xl p-5 bg-stone-50/50 space-y-4">
                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600">Equation 2: {results.varY2}</span>
                    <div className="space-y-2 font-mono text-xs">
                      <div className="flex justify-between border-b border-stone-100 pb-1.5">
                        <span>Constant (c)</span>
                        <span className="font-bold">{results.equation2.const.toFixed(4)} <span className="text-xs text-stone-400">(SE: {results.equation2.se_const.toFixed(4)})</span></span>
                      </div>
                      <div className="flex justify-between border-b border-stone-100 pb-1.5">
                        <span>{results.varY1} (t-1)</span>
                        <span className="font-bold">{results.equation2.y1_lag1.toFixed(4)} <span className="text-xs text-stone-400">(SE: {results.equation2.se_y1_lag1.toFixed(4)})</span></span>
                      </div>
                      <div className="flex justify-between pb-1.5">
                        <span>{results.varY2} (t-1)</span>
                        <span className="font-bold">{results.equation2.y2_lag1.toFixed(4)} <span className="text-xs text-stone-400">(SE: {results.equation2.se_y2_lag1.toFixed(4)})</span></span>
                      </div>
                    </div>
                  </div>
                </div>

                {results.granger && (
                  <div className="bg-white border border-stone-100 rounded-xl p-5 space-y-3">
                    <h5 className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-400">Granger Causality (lag {results.granger.lag})</h5>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                      <div className="p-3 bg-stone-50 border border-stone-100 rounded-lg font-mono">
                        <div className="text-stone-500">{results.varY2} &rarr; {results.varY1}</div>
                        <div className="mt-1">F = {results.granger.xToY.fStat.toFixed(3)}, p = {results.granger.xToY.pValue.toFixed(4)} {results.granger.xToY.isGranger ? <span className="text-rose-600 font-bold">causal</span> : <span className="text-stone-400">not causal</span>}</div>
                      </div>
                      <div className="p-3 bg-stone-50 border border-stone-100 rounded-lg font-mono">
                        <div className="text-stone-500">{results.varY1} &rarr; {results.varY2}</div>
                        <div className="mt-1">F = {results.granger.yToX.fStat.toFixed(3)}, p = {results.granger.yToX.pValue.toFixed(4)} {results.granger.yToX.isGranger ? <span className="text-rose-600 font-bold">causal</span> : <span className="text-stone-400">not causal</span>}</div>
                      </div>
                    </div>
                    <p className="text-[10px] text-stone-400 font-serif italic">"X &rarr; Y causal" means past values of X significantly improve the prediction of Y (Granger sense, not structural causation).</p>
                  </div>
                )}
                </>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="bg-stone-50 border border-stone-100 p-4 rounded-xl text-center">
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400 block">Constant (ω)</span>
                    <span className="text-lg font-mono font-bold text-stone-800">{results.omega.toFixed(4)}</span>
                  </div>
                  <div className="bg-stone-50 border border-stone-100 p-4 rounded-xl text-center">
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400 block">ARCH Parameter (α)</span>
                    <span className="text-lg font-mono font-bold text-stone-800">{results.alpha.toFixed(4)}</span>
                  </div>
                  <div className="bg-stone-50 border border-stone-100 p-4 rounded-xl text-center">
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400 block">GARCH Parameter (β)</span>
                    <span className="text-lg font-mono font-bold text-stone-800">{results.beta.toFixed(4)}</span>
                  </div>
                  <div className="bg-stone-50 border border-stone-100 p-4 rounded-xl text-center">
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400 block">Unconditional Volatility</span>
                    <span className="text-lg font-mono font-bold text-stone-800">{results.unconditionalVol.toFixed(4)}</span>
                  </div>
                </div>
              )}

              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4 text-indigo-600" />
                  <h5 className="text-xs font-bold text-indigo-900 font-mono uppercase tracking-wider">Dynamic Diagnostics Summary</h5>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed font-serif italic">
                  {results.type === 'var' ? (
                    `Equation estimates demonstrate the lag feedback. The coefficients in Equation 1 determine if past changes in ${results.varY2} statistically predict current changes in ${results.varY1} after controlling for the lags of ${results.varY1}. This forms the foundation of Granger-Causality testing.`
                  ) : (
                    `GARCH(1,1) estimates are covariance-stationary because the ARCH and GARCH sum (α + β = ${(results.alpha + results.beta).toFixed(3)}) is strictly less than 1. The high GARCH parameter β indicates persistent volatility clusters; once shocked, variance takes a long time to decay back to its unconditional mean.`
                  )}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'irf' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
              <h4 className="text-lg font-serif font-bold text-stone-900">
                {results.type === 'var' ? 'Impulse Response Functions (IRF) Projections' : 'Conditional Volatility Over Time'}
              </h4>

              {results.type === 'var' ? (
                <div className="space-y-8">
                  <p className="text-xs text-stone-600 font-serif leading-relaxed">
                    The chart below represents the dynamic response of the system to a 1-standard-deviation structural shock. It tracks how a shock in e₁ or e₂ propagates through the feedback lag coefficients over 8 periods.
                  </p>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Shock 1 response */}
                    <div className="space-y-4">
                      <h5 className="text-xs font-bold font-mono uppercase text-stone-500 text-center">Shock to {results.varY1}</h5>
                      <div className="h-64 border border-stone-100 p-2 rounded-xl bg-stone-50/50">
                        <ResponsiveContainer width="100%" height="100%">
                          <RecLineChart data={results.irfData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="step" stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                            <YAxis stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                            <Tooltip contentStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'sans-serif' }} />
                            <Line type="monotone" dataKey="shockY1_respY1" name={`Response of ${results.varY1}`} stroke="#4f46e5" strokeWidth={2} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="shockY1_respY2" name={`Response of ${results.varY2}`} stroke="#06b6d4" strokeWidth={2} />
                          </RecLineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    {/* Shock 2 response */}
                    <div className="space-y-4">
                      <h5 className="text-xs font-bold font-mono uppercase text-stone-500 text-center">Shock to {results.varY2}</h5>
                      <div className="h-64 border border-stone-100 p-2 rounded-xl bg-stone-50/50">
                        <ResponsiveContainer width="100%" height="100%">
                          <RecLineChart data={results.irfData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                            <XAxis dataKey="step" stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                            <YAxis stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                            <Tooltip contentStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                            <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'sans-serif' }} />
                            <Line type="monotone" dataKey="shockY2_respY1" name={`Response of ${results.varY1}`} stroke="#4f46e5" strokeWidth={2} />
                            <Line type="monotone" dataKey="shockY2_respY2" name={`Response of ${results.varY2}`} stroke="#06b6d4" strokeWidth={2} activeDot={{ r: 6 }} />
                          </RecLineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <p className="text-xs text-stone-600 font-serif leading-relaxed">
                    The conditional standard deviation σₜ plotted over time highlights volatility clustering: calm periods are punctuated by sharp spikes in variance, which then slowly decay.
                  </p>
                  <div className="h-72 border border-stone-100 p-4 rounded-xl bg-stone-50/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <RecLineChart data={results.volSeries}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <YAxis stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <Tooltip contentStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                        <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'sans-serif' }} />
                        <Line type="monotone" dataKey="residual" name="Residual shock (e)" stroke="#cbd5e1" strokeDasharray="4 4" dot={false} />
                        <Line type="monotone" dataKey="volatility" name="Conditional standard deviation (σ)" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
                      </RecLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'cointegration' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in fade-in duration-500">
              {/* Controls panel */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-indigo-600" />
                    <h3 className="text-sm font-bold text-stone-800 font-sans">Johansen Cointegration</h3>
                  </div>

                  {/* Variable Selection Checklist */}
                  <div className="space-y-3">
                    <label className="text-xs font-bold text-stone-700 block">1. Select Variables (Min 2)</label>
                    <p className="text-[10px] text-stone-400 font-serif leading-tight">These variables must be non-stationary I(1) in levels but cointegrated (share a stable long-run relationship).</p>
                    <div className="space-y-2 max-h-48 overflow-y-auto border border-stone-100 p-3 rounded-xl bg-stone-50/50">
                      {numericVariables.map(v => {
                        const isChecked = cointVars.includes(v);
                        return (
                          <label key={v} className="flex items-center gap-2.5 p-1.5 hover:bg-stone-100/50 rounded-lg cursor-pointer transition">
                            <input 
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => {
                                if (isChecked) {
                                  setCointVars(cointVars.filter(item => item !== v));
                                } else {
                                  setCointVars([...cointVars, v]);
                                }
                              }}
                              className="rounded text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                            />
                            <span className="text-xs font-mono font-medium text-stone-700">{v}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  {/* Lags selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700 block">2. Lag differences (k_ar_diff)</label>
                    <select
                      value={cointLags}
                      onChange={(e) => setCointLags(parseInt(e.target.value))}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value={1}>1 Lag difference</option>
                      <option value={2}>2 Lag differences</option>
                      <option value={3}>3 Lag differences</option>
                    </select>
                  </div>

                  {/* Deterministic Order selection */}
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700 block">3. Deterministic Trend</label>
                    <select
                      value={cointDet}
                      onChange={(e) => setCointDet(parseInt(e.target.value))}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-sans focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value={-1}>None (No constant, no trend)</option>
                      <option value={0}>Constant (Constant in cointegrating eq)</option>
                      <option value={1}>Linear Trend (Constant & linear trend)</option>
                    </select>
                  </div>

                  <button
                    onClick={handleRunCointegration}
                    disabled={isCointRunning || cointVars.length < 2}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isCointRunning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Performing Johansen Test...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" /> Run Cointegration & VECM
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleRunEngle}
                    disabled={isEngleRunning || cointVars.length < 2}
                    className="w-full py-3 bg-white border border-indigo-200 text-indigo-700 hover:bg-indigo-50 rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isEngleRunning ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Testing...</>
                    ) : (
                      <>Engle-Granger (2-Step) Test</>
                    )}
                  </button>
                </div>
              </div>

              {/* Output / Results Panel */}
              <div className="lg:col-span-8 space-y-6">
                {engleResults && (
                  <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-3">
                    <h4 className="text-sm font-bold text-stone-800">Engle-Granger 2-Step Cointegration ({cointVars[0]} vs. rest)</h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 bg-stone-50 border border-stone-100 rounded-xl text-center">
                        <span className="text-[10px] font-mono uppercase text-stone-400 block">Test Statistic</span>
                        <span className="text-lg font-mono font-bold text-stone-800">{typeof engleResults.t_stat === 'number' ? engleResults.t_stat.toFixed(4) : '—'}</span>
                      </div>
                      <div className="p-3 bg-stone-50 border border-stone-100 rounded-xl text-center">
                        <span className="text-[10px] font-mono uppercase text-stone-400 block">p-value</span>
                        <span className="text-lg font-mono font-bold text-stone-800">{typeof engleResults.p_value === 'number' ? engleResults.p_value.toFixed(4) : '—'}</span>
                      </div>
                      {Array.isArray(engleResults.crit_values) && engleResults.crit_values.map((cv: number, i: number) => (
                        <div key={i} className="p-3 bg-stone-50 border border-stone-100 rounded-xl text-center">
                          <span className="text-[10px] font-mono uppercase text-stone-400 block">{['1%', '5%', '10%'][i] || 'CV'}</span>
                          <span className="text-lg font-mono font-bold text-stone-800">{typeof cv === 'number' ? cv.toFixed(3) : '—'}</span>
                        </div>
                      ))}
                    </div>
                    <p className="text-[11px] text-stone-500 font-serif italic">
                      {typeof engleResults.p_value === 'number' && engleResults.p_value < 0.05
                        ? `p < 0.05: reject the null of no cointegration — ${cointVars.join(', ')} share a stable long-run relationship.`
                        : `p >= 0.05: fail to reject the null of no cointegration — no evidence of a long-run equilibrium among these series.`}
                    </p>
                  </div>
                )}
                {!cointResults && !isCointRunning && !cointError ? (
                  <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-indigo-50 rounded-xl text-indigo-600">
                        <TrendingUp className="w-6 h-6" />
                      </div>
                      <div>
                        <h4 className="text-md font-serif font-bold text-stone-900">Johansen Cointegration & VECM Engine</h4>
                        <p className="text-xs text-stone-400 font-mono">Select at least two economic indicators on the left and run the model</p>
                      </div>
                    </div>
                    
                    <p className="text-xs text-stone-600 leading-relaxed font-serif">
                      If time-series variables are integrated of order 1 (non-stationary in levels but stationary in first differences), running standard OLS on levels can produce **spurious regressions**. 
                    </p>
                    <p className="text-xs text-stone-600 leading-relaxed font-serif">
                      **Johansen's Cointegration Test** determines if there exists a linear combination of these variables that is stationary, representing a long-run stable equilibrium. If cointegration is found, we fit a **Vector Error Correction Model (VECM)** to capture both the long-run cointegrating vectors (β) and the short-run speeds of adjustment (α) that pull variables back to equilibrium.
                    </p>

                    <div className="border-t border-stone-100 pt-6 space-y-4">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-stone-400">MA / UGC-NET Syllabus Relevance</span>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="p-4 bg-stone-50 border border-stone-100 rounded-xl space-y-1">
                          <span className="text-xs font-bold text-stone-700">Johansen Trace Test</span>
                          <p className="text-[11px] text-stone-500 leading-normal">Tests the null hypothesis of r cointegrating vectors against the alternative of k vectors. Rejecting r=0 means cointegration exists.</p>
                        </div>
                        <div className="p-4 bg-stone-50 border border-stone-100 rounded-xl space-y-1">
                          <span className="text-xs font-bold text-stone-700">Error Correction Term (ECT)</span>
                          <p className="text-[11px] text-stone-500 leading-normal">The α matrix captures speed of adjustment. A negative coefficient on ECT means the system self-corrects deviations back to equilibrium.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : isCointRunning ? (
                  <div className="bg-white border border-stone-200 rounded-2xl p-16 shadow-sm text-center space-y-4">
                    <RefreshCw className="w-10 h-10 text-indigo-600 mx-auto animate-spin" />
                    <h4 className="text-md font-bold text-stone-800">Calculating Johansen Trace & Max Eigenvalue statistics...</h4>
                    <p className="text-xs text-stone-400 font-serif max-w-sm mx-auto">This involves solving generalized eigenvalue matrices on the residual errors of VAR differences in the Python backend.</p>
                  </div>
                ) : cointError ? (
                  <div className="bg-white border border-rose-100 bg-rose-50/20 rounded-2xl p-8 shadow-sm space-y-4">
                    <h4 className="text-md font-bold text-rose-800">Estimation Failed</h4>
                    <p className="text-xs text-stone-600 font-mono">{cointError}</p>
                    <div className="p-4 bg-white border border-rose-100 rounded-xl space-y-2">
                      <span className="text-[10px] font-mono font-bold text-rose-500 block uppercase">Troubleshooting Tips:</span>
                      <ul className="text-xs text-stone-600 list-disc pl-5 space-y-1">
                        <li>Ensure the selected variables do not contain identical or highly collinear series.</li>
                        <li>Verify that there are no empty rows in the dataset for the selected variables.</li>
                        <li>Try a simpler lag diff (e.g. 1 lag).</li>
                      </ul>
                    </div>
                  </div>
                ) : cointResults ? (
                  <div className="space-y-6">
                    {/* Interpretation Note */}
                    <div className="bg-indigo-600 text-white rounded-2xl p-6 shadow-md space-y-3">
                      <span className="text-[10px] font-mono font-bold uppercase tracking-widest opacity-75">Econometric Model Verdict</span>
                      <h4 className="text-lg font-serif font-bold">
                        {cointResults.cointegration_rank === 0 ? (
                          "No Cointegrating Relationship Found (r = 0)"
                        ) : cointResults.cointegration_rank >= cointVars.length ? (
                          `All variables are stationary (r = ${cointResults.cointegration_rank})`
                        ) : (
                          `${cointResults.cointegration_rank} Cointegrating Relationship(s) Identified`
                        )}
                      </h4>
                      <p className="text-xs opacity-90 leading-relaxed font-serif">
                        {cointResults.cointegration_rank === 0 ? (
                          `The Johansen Trace test fails to reject H₀: rank=0 at the 95% level. This implies there is no stable, stationary long-run linear combination linking these variables. A classical Vector Autoregression (VAR) in first-differences would be more appropriate than a VECM.`
                        ) : cointResults.cointegration_rank >= cointVars.length ? (
                          `The test indicates the cointegration rank is full. This suggests the variables are already stationary I(0) in levels, and cointegration theory is not needed. A standard VAR in levels is appropriate.`
                        ) : (
                          `At the 95% confidence level, the Trace statistic rejects H₀: rank ≤ ${cointResults.cointegration_rank - 1} but fails to reject H₀: rank ≤ ${cointResults.cointegration_rank}. There is exactly ${cointResults.cointegration_rank} long-run equilibrium relationship. A Vector Error Correction Model (VECM) with rank ${cointResults.cointegration_rank} is appropriate for this system.`
                        )}
                      </p>
                    </div>

                    {/* Table 1: Trace Test */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-stone-800">1. Johansen Trace Test (H₀: rank ≤ r)</h4>
                        <span className="text-[9px] font-mono text-stone-400">95% Significance Threshold</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-stone-100 text-[10px] font-mono text-stone-400 uppercase tracking-wider pb-2">
                              <th className="pb-2 font-semibold">Null Hypothesis (H₀)</th>
                              <th className="pb-2 text-right font-semibold">Trace Statistic</th>
                              <th className="pb-2 text-right font-semibold">90% Critical Value</th>
                              <th className="pb-2 text-right font-semibold">95% Critical Value</th>
                              <th className="pb-2 text-right font-semibold">Decision</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-50 font-mono text-xs text-stone-700">
                            {cointResults.trace_stat.map((stat: number, idx: number) => {
                              const cv95 = cointResults.trace_cv_95[idx];
                              const cv90 = cointResults.trace_cv_90[idx];
                              const rejected = stat > cv95;
                              return (
                                <tr key={idx} className="hover:bg-stone-50/50">
                                  <td className="py-2.5 font-medium">rank ≤ {idx}</td>
                                  <td className="py-2.5 text-right font-semibold">{stat.toFixed(4)}</td>
                                  <td className="py-2.5 text-right text-stone-400">{cv90.toFixed(4)}</td>
                                  <td className="py-2.5 text-right font-semibold text-stone-600">{cv95.toFixed(4)}</td>
                                  <td className="py-2.5 text-right">
                                    {rejected ? (
                                      <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded">Reject H₀ (r &gt; {idx})</span>
                                    ) : (
                                      <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Fail to Reject</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* Table 2: Max Eigenvalue Test */}
                    <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
                      <div className="flex justify-between items-center">
                        <h4 className="text-sm font-bold text-stone-800">2. Maximum Eigenvalue Test (H₀: rank = r)</h4>
                        <span className="text-[9px] font-mono text-stone-400">95% Significance Threshold</span>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-stone-100 text-[10px] font-mono text-stone-400 uppercase tracking-wider pb-2">
                              <th className="pb-2 font-semibold">Null Hypothesis (H₀)</th>
                              <th className="pb-2 text-right font-semibold">Max-Eig Statistic</th>
                              <th className="pb-2 text-right font-semibold">95% Critical Value</th>
                              <th className="pb-2 text-right font-semibold">Decision</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-stone-50 font-mono text-xs text-stone-700">
                            {cointResults.max_eig_stat.map((stat: number, idx: number) => {
                              const cv95 = cointResults.max_eig_cv_95[idx];
                              const rejected = stat > cv95;
                              return (
                                <tr key={idx} className="hover:bg-stone-50/50">
                                  <td className="py-2.5 font-medium">rank = {idx}</td>
                                  <td className="py-2.5 text-right font-semibold">{stat.toFixed(4)}</td>
                                  <td className="py-2.5 text-right font-semibold text-stone-600">{cv95.toFixed(4)}</td>
                                  <td className="py-2.5 text-right">
                                    {rejected ? (
                                      <span className="text-rose-600 font-bold bg-rose-50 px-2 py-0.5 rounded">Reject H₀</span>
                                    ) : (
                                      <span className="text-emerald-600 font-bold bg-emerald-50 px-2 py-0.5 rounded">Fail to Reject</span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>

                    {/* VECM Output (Table 3: Beta & Speed of Adjustment Alpha) */}
                    {cointResults.cointegration_rank > 0 && cointResults.cointegrating_vectors && cointResults.cointegrating_vectors.length > 0 && (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Cointegrating Vectors (Beta Matrix) */}
                        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">3. Cointegrating Vectors (Beta Matrix)</h4>
                            <p className="text-[10px] text-stone-400 font-serif">Long-run equilibrium coefficients (normalized on first row)</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-stone-100 text-[10px] font-mono text-stone-400 uppercase tracking-wider pb-2">
                                  <th className="pb-2 font-semibold">Variable</th>
                                  {Array.from({ length: cointResults.cointegrating_vectors[0]?.length || 0 }).map((_, colIdx) => (
                                    <th key={colIdx} className="pb-2 text-right font-semibold">Vector β_{colIdx + 1}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-50 font-mono text-xs text-stone-700">
                                {cointVars.map((v, rowIdx) => (
                                  <tr key={v} className="hover:bg-stone-50/50">
                                    <td className="py-2.5 font-medium">{v}</td>
                                    {cointResults.cointegrating_vectors[rowIdx]?.map((val: number, colIdx: number) => (
                                      <td key={colIdx} className="py-2.5 text-right font-semibold">
                                        {val.toFixed(4)}
                                      </td>
                                    )) || <td className="py-2.5 text-right text-stone-400">0.0000</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>

                        {/* Speed of Adjustment (Alpha Matrix) */}
                        <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-4">
                          <div>
                            <h4 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">4. Speed of Adjustment (Alpha Matrix)</h4>
                            <p className="text-[10px] text-stone-400 font-serif">Short-run feedback rate to long-run deviation</p>
                          </div>
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="border-b border-stone-100 text-[10px] font-mono text-stone-400 uppercase tracking-wider pb-2">
                                  <th className="pb-2 font-semibold">Variable</th>
                                  {Array.from({ length: cointResults.adjustment_speeds[0]?.length || 0 }).map((_, colIdx) => (
                                    <th key={colIdx} className="pb-2 text-right font-semibold">Alpha α_{colIdx + 1}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-stone-50 font-mono text-xs text-stone-700">
                                {cointVars.map((v, rowIdx) => (
                                  <tr key={v} className="hover:bg-stone-50/50">
                                    <td className="py-2.5 font-medium">{v}</td>
                                    {cointResults.adjustment_speeds[rowIdx]?.map((val: number, colIdx: number) => {
                                      const isNegative = val < 0;
                                      return (
                                        <td key={colIdx} className={`py-2.5 text-right font-semibold ${isNegative ? "text-indigo-600" : "text-stone-700"}`}>
                                          {val.toFixed(4)}
                                        </td>
                                      );
                                    }) || <td className="py-2.5 text-right text-stone-400">0.0000</td>}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
