import React, { useState, useMemo } from 'react';
import { 
  FlaskConical, 
  HelpCircle, 
  Info, 
  AlertCircle, 
  CheckCircle2, 
  Play, 
  TrendingUp, 
  Binary, 
  RefreshCw, 
  BrainCircuit,
  Scale
} from 'lucide-react';
import { Dataset } from '../../types';
import { generateMasterDataset } from '../../lib/dataGenerators';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { runADFTest, runKPSSTest, runPhillipsPerronTest } from '../../lib/econometrics/arima';
import { standaloneJarqueBera, standaloneDurbinWatson, ramseyReset } from '../../lib/econometrics/diagnostics';
import { runUnitRoot } from '../../services/apiClient';

interface StatTestsLabProps {
  dataset: Dataset | null;
  onRunComplete?: (results: any, spec: string) => void;
}

export default function StatTestsLab({ dataset: propDataset, onRunComplete }: StatTestsLabProps) {
  // Use loaded dataset or fallback to generating a local copy of the Master Econometrics dataset
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

  // Selected variables and test settings
  const [testType, setTestType] = useState<'normality' | 'stationarity' | 'kpss' | 'phillips' | 'autocorrelation' | 'specification'>('normality');
  const [selectedVar, setSelectedVar] = useState<string>('');
  const [selectedVarX, setSelectedVarX] = useState<string>(''); // For specification / autocorrelation auxiliary OLS
  const [lagLength, setLagLength] = useState<number>(1);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [researchGrade, setResearchGrade] = useState<boolean>(false);

  // Automatically pick a variable when dataset is loaded
  React.useEffect(() => {
    if (numericVariables.length > 0) {
      // Resolve the effective Y up front rather than reading the (possibly
      // stale, not-yet-committed) `selectedVar` closure below - otherwise X
      // can be left equal to the just-reset Y.
      let effectiveVar = selectedVar;
      if (!selectedVar || !numericVariables.includes(selectedVar)) {
        effectiveVar = numericVariables[0] || '';
        if (effectiveVar) setSelectedVar(effectiveVar);
      }
      // Also re-pick X whenever it collides with Y (e.g. the user changes Y
      // to the variable X was already set to) - not just when X no longer
      // exists in the dataset. The X dropdown's option list always excludes
      // the current Y, so a stale X === Y silently desyncs the visible
      // dropdown (which falls back to displaying its first remaining option)
      // from the real X state, and Ramsey RESET then fails with a confusing
      // "select a different X" error despite the dropdown showing two
      // different-looking selections.
      if (numericVariables.length > 1 && (!selectedVarX || selectedVarX === effectiveVar || !numericVariables.includes(selectedVarX))) {
        const fallback = numericVariables.find(v => v !== effectiveVar);
        if (fallback) setSelectedVarX(fallback);
      }
    }
  }, [numericVariables, selectedVar, selectedVarX]);

  const handleRunTest = async () => {
    if (!activeDataset || !selectedVar) return;
    setIsRunning(true);

    // Research-grade path: route unit-root tests to the Python backend
    // (statsmodels ADF/KPSS, arch Phillips-Perron) instead of the browser engine.
    const isUnitRoot = testType === 'stationarity' || testType === 'kpss' || testType === 'phillips';
    if (researchGrade && isUnitRoot) {
      try {
        const series = activeDataset.data.map(row => parseFloat(row[selectedVar])).filter(v => !isNaN(v));
        if (series.length < 12) throw new Error('Insufficient observations (need at least 12).');
        const testMap: Record<string, 'adf' | 'kpss' | 'pp'> = { stationarity: 'adf', kpss: 'kpss', phillips: 'pp' };
        const test = testMap[testType] ?? 'adf';
        const res = await runUnitRoot({ series, test, regression: 'c' });
        const cv = res.critValues || {};
        const isKpss = testType === 'kpss';
        const reject = typeof res.pValue === 'number' ? res.pValue < 0.05 : false;
        setTestResult({
          type: testType,
          variable: selectedVar,
          n: res.nobs ?? series.length,
          stat: res.stat,
          pValue: res.pValue,
          reject: isKpss ? reject : undefined,
          criticalValues: { '1%': cv['1%'] ?? 0, '5%': cv['5%'] ?? 0, '10%': cv['10%'] ?? 0 },
          engine: 'python',
          nullHypothesis: isKpss ? 'The variable is (trend-)stationary.' : 'The variable has a unit root (is non-stationary).',
          altHypothesis: isKpss ? 'The variable has a unit root (is non-stationary).' : 'The variable is stationary (has no unit root).',
          decision: isKpss
            ? (reject ? 'Reject Null (Non-Stationary)' : 'Fail to Reject Null (Stationary)')
            : (reject ? 'Reject Null (Stationary)' : 'Fail to Reject Null (Non-Stationary)'),
        });
        if (onRunComplete) onRunComplete({ testType, selectedVar, engine: 'python' }, `STAT_TEST(python): ${testType.toUpperCase()} on ${selectedVar}`);
      } catch (err: any) {
        alert(err?.message || 'Python unit-root test failed. Ensure the backend is running and you are signed in.');
      } finally {
        setIsRunning(false);
      }
      return;
    }

    setTimeout(() => {
      try {
        const values = activeDataset.data
          .map(row => parseFloat(row[selectedVar]))
          .filter(val => !isNaN(val));

        if (values.length < 5) {
          throw new Error("Insufficient observations in selected variable (need at least 5).");
        }

        const N = values.length;

        if (testType === 'normality') {
          const jb = standaloneJarqueBera(values);

          setTestResult({
            type: 'normality',
            variable: selectedVar,
            n: N,
            mean: jb.mean,
            stdDev: jb.stdDev,
            skewness: jb.skewness,
            kurtosis: jb.kurtosis,
            stat: jb.stat,
            pValue: jb.pValue,
            nullHypothesis: "The variable is normally distributed.",
            altHypothesis: "The variable is NOT normally distributed.",
            decision: jb.pValue < 0.05 ? "Reject Null Hypothesis" : "Fail to Reject Null Hypothesis"
          });
        }
        else if (testType === 'stationarity') {
          // Augmented Dickey-Fuller (ADF) test via the certified estimator
          // (verified against statsmodels.tsa.stattools.adfuller in reference.test.ts
          // and directly exercised in recovery.test.ts).
          const adf = runADFTest(values, lagLength);

          setTestResult({
            type: 'stationarity',
            variable: selectedVar,
            n: N,
            stat: adf.adfStat,
            pValue: adf.pValue,
            criticalValues: { '1%': adf.criticalValues.pct1, '5%': adf.criticalValues.pct5, '10%': adf.criticalValues.pct10 },
            nullHypothesis: "The variable has a unit root (is non-stationary).",
            altHypothesis: "The variable is stationary (has no unit root).",
            decision: adf.isStationary ? "Reject Null (Stationary)" : "Fail to Reject Null (Non-Stationary)"
          });
        }
        else if (testType === 'autocorrelation') {
          const dw = standaloneDurbinWatson(values);

          setTestResult({
            type: 'autocorrelation',
            variable: selectedVar,
            n: N,
            stat: dw.stat,
            pValue: null, // DW uses critical bound tables instead of a direct analytical p-value
            diagnosis: dw.diagnosis,
            nullHypothesis: "No first-order serial correlation in errors.",
            altHypothesis: "Errors exhibit first-order serial correlation.",
            decision: (dw.stat < 1.5 || dw.stat > 2.5) ? "Reject Null Hypothesis" : "Fail to Reject Null Hypothesis"
          });
        }
        else if (testType === 'specification') {
          // Ramsey RESET Test
          // 1. Fit OLS: Y = b0 + b1 * X
          // 2. Fit auxiliary: Y = b0 + b1 * X + c1 * Y_hat^2 + c2 * Y_hat^3
          // 3. F-test on restriction c1 = c2 = 0
          if (!selectedVarX || selectedVar === selectedVarX) {
            throw new Error("Please select a different independent variable (X) to estimate.");
          }

          const Y_val = values;
          const X_val = activeDataset.data
            .map(row => parseFloat(row[selectedVarX]))
            .filter((_, idx) => {
              const r = activeDataset.data[idx];
              return r && !isNaN(parseFloat(r[selectedVar])) && !isNaN(parseFloat(r[selectedVarX]));
            });

          const reset = ramseyReset(Y_val, X_val);

          setTestResult({
            type: 'specification',
            variable: selectedVar,
            varX: selectedVarX,
            n: reset.n,
            stat: reset.stat,
            pValue: reset.pValue,
            rssRestricted: reset.rssRestricted,
            rssUnrestricted: reset.rssUnrestricted,
            nullHypothesis: "The functional specification is correct (no omitted non-linear terms).",
            altHypothesis: "The specification is incorrect (omitted non-linear powers of fitted values).",
            decision: reset.pValue < 0.05 ? "Reject Null (Omitted non-linearities exist)" : "Fail to Reject (No model specification issues)"
          });
        }
        else if (testType === 'kpss') {
          const kpss = runKPSSTest(values, lagLength, true);
          const rejectNull = !kpss.isStationary;
          setTestResult({
            type: 'kpss',
            variable: selectedVar,
            n: N,
            stat: kpss.kpssStat,
            pValue: null,
            reject: rejectNull,
            criticalValues: { '1%': kpss.criticalValues.pct1, '5%': kpss.criticalValues.pct5, '10%': kpss.criticalValues.pct10 },
            nullHypothesis: "The variable is (trend-)stationary.",
            altHypothesis: "The variable has a unit root (is non-stationary).",
            decision: rejectNull ? "Reject Null (Non-Stationary)" : "Fail to Reject Null (Stationary)"
          });
        }
        else if (testType === 'phillips') {
          const pp = runPhillipsPerronTest(values, lagLength);
          setTestResult({
            type: 'phillips',
            variable: selectedVar,
            n: N,
            stat: pp.ppStat,
            pValue: pp.pValue,
            criticalValues: { '1%': -3.46, '5%': -2.88, '10%': -2.57 },
            nullHypothesis: "The variable has a unit root (is non-stationary).",
            altHypothesis: "The variable is stationary (has no unit root).",
            decision: pp.isStationary ? "Reject Null (Stationary)" : "Fail to Reject Null (Non-Stationary)"
          });
        }

        if (onRunComplete) {
          onRunComplete(
            { testType, selectedVar, n: N },
            `STAT_TEST: ${testType.toUpperCase()} on ${selectedVar}`
          );
        }
      } catch (err: any) {
        alert(err.message || "An error occurred while executing the statistical test.");
      } finally {
        setIsRunning(false);
      }
    }, 600);
  };

  return (
    <div id="stat-tests-lab" className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700">
      <ModuleIntroCard 
        title="Statistical Tests Lab"
        description="Verify Gauss-Markov axioms, model specifications, and series properties using classical hypothesis tests. Rigorous diagnostics prevent spurious regressions."
        useWhen="You need to validate the statistical properties of variables or residuals (e.g. testing for stationarity, normality, or Ramsey's functional specification)."
        requires={["A continuous numeric variable", "Clean series without missing values", "Basic knowledge of Null and Alternative hypotheses"]}
        youWillGet={["Test statistics (JB, ADF, DW, F)", "Asymptotic or Exact p-values", "Clear decisions regarding Null Hypotheses", "Scholastic interpretations"]}
        pitfalls={["p-hacking via multi-testing", "Low statistical power in small samples", "Confusing association with causality"]}
        example="H₀: S = 0, K = 3 (Normality)"
      />

      {!activeDataset ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4 max-w-xl mx-auto">
          <FlaskConical className="w-12 h-12 text-indigo-500 mx-auto animate-pulse" />
          <h3 className="text-lg font-serif font-bold text-stone-900">Active Dataset Required</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Please load the active dataset from the Data module or click the button below to instantly load the Master Econometrics sample dataset.
          </p>
          <button 
            onClick={handleLoadSample}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-mono tracking-wider uppercase rounded-xl transition shadow-sm"
          >
            Load Master Econometrics Dataset
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Test Setup Form */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
              <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">Test Parameters</h3>
              
              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700">1. Select Hypothesis Test</label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { id: 'normality', label: 'Jarque-Bera Normality Test' },
                    { id: 'stationarity', label: 'Augmented Dickey-Fuller (ADF)' },
                    { id: 'kpss', label: 'KPSS Stationarity Test' },
                    { id: 'phillips', label: 'Phillips-Perron (PP) Test' },
                    { id: 'autocorrelation', label: 'Durbin-Watson Autocorrelation' },
                    { id: 'specification', label: 'Ramsey RESET Specification' },
                  ].map((test) => (
                    <button
                      key={test.id}
                      onClick={() => {
                        setTestType(test.id as any);
                        setTestResult(null);
                      }}
                      className={`text-left p-3 rounded-xl border text-xs font-medium transition ${
                        testType === test.id 
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-900 font-bold' 
                          : 'border-stone-200 hover:bg-stone-50 text-stone-600'
                      }`}
                    >
                      {test.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-bold text-stone-700">2. Dependent Variable (Y)</label>
                <select
                  value={selectedVar}
                  onChange={(e) => {
                    setSelectedVar(e.target.value);
                    setTestResult(null);
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {numericVariables.map(v => (
                    <option key={v} value={v}>{v}</option>
                  ))}
                </select>
              </div>

              {testType === 'specification' && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-700">3. Independent Variable (X)</label>
                  <select
                    value={selectedVarX}
                    onChange={(e) => {
                      setSelectedVarX(e.target.value);
                      setTestResult(null);
                    }}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    {numericVariables.filter(v => v !== selectedVar).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {(testType === 'stationarity' || testType === 'kpss' || testType === 'phillips') && !researchGrade && (
                <div className="space-y-2">
                  <label className="text-xs font-bold text-stone-700">3. Lag Length</label>
                  <input
                    type="number"
                    min={0}
                    max={20}
                    step={1}
                    value={lagLength}
                    onChange={(e) => {
                      const parsed = parseInt(e.target.value, 10);
                      setLagLength(Number.isFinite(parsed) ? Math.max(0, Math.min(20, parsed)) : 0);
                      setTestResult(null);
                    }}
                    className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  <p className="text-[10px] text-stone-400 leading-relaxed">
                    Number of lagged difference terms (ADF) or truncation lags (KPSS/PP) used by the fast browser engine. Too few lags can leave residual autocorrelation and bias the test; switch to the Research-grade Python engine below for automatic AIC/auto lag selection instead of guessing.
                  </p>
                </div>
              )}

              <label className="flex items-start gap-2 text-[11px] text-stone-600 cursor-pointer bg-stone-50 border border-stone-100 rounded-lg p-2.5">
                <input type="checkbox" checked={researchGrade} onChange={e => setResearchGrade(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 mt-0.5" />
                <span>Research-grade engine (Python) <span className="text-stone-400">— routes ADF / KPSS / PP to statsmodels + arch. Requires sign-in.</span></span>
              </label>
              <button
                onClick={handleRunTest}
                disabled={isRunning || !selectedVar}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isRunning ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Estimating...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5" /> Execute Hypothesis Test
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Test Results and Diagnostic Dashboard */}
          <div className="lg:col-span-8 space-y-6">
            {testResult ? (
              <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
                <div className="flex items-center justify-between border-b border-stone-100 pb-4">
                  <div>
                    <h4 className="text-lg font-serif font-bold text-stone-900">
                      {testResult.type === 'normality' && 'Jarque-Bera Normality Test Output'}
                      {testResult.type === 'stationarity' && 'Augmented Dickey-Fuller Test Output'}
                      {testResult.type === 'kpss' && 'KPSS Stationarity Test Output'}
                      {testResult.type === 'phillips' && 'Phillips-Perron Test Output'}
                      {testResult.type === 'autocorrelation' && 'Durbin-Watson Autocorrelation Output'}
                      {testResult.type === 'specification' && 'Ramsey RESET Specification Output'}
                    </h4>
                    <p className="text-xs text-stone-500 font-mono mt-1">Series: {testResult.variable} | N = {testResult.n}{testResult.engine === 'python' ? ' | Engine: Python (research-grade)' : ''}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider ${
                    (testResult.reject !== undefined
                      ? !testResult.reject
                      : (testResult.pValue === null || testResult.pValue >= 0.05))
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-150'
                      : 'bg-rose-50 text-rose-700 border border-rose-150'
                  }`}>
                    {testResult.decision}
                  </div>
                </div>

                {/* Hypotheses */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-stone-50 p-4 rounded-xl border border-stone-100">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Null Hypothesis (H₀)</span>
                    <p className="text-xs text-stone-700 font-medium mt-1">{testResult.nullHypothesis}</p>
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Alternative Hypothesis (H₁)</span>
                    <p className="text-xs text-stone-700 font-medium mt-1">{testResult.altHypothesis}</p>
                  </div>
                </div>

                {/* Test Metrics Matrix */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4">
                  <div className="bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Test Statistic</span>
                    <div className="text-lg font-mono font-bold text-stone-900">{testResult.stat.toFixed(4)}</div>
                  </div>
                  <div className="bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                    <span className="text-[10px] font-mono font-bold uppercase text-stone-400">P-Value</span>
                    <div className="text-lg font-mono font-bold text-stone-900">
                      {testResult.pValue !== null ? testResult.pValue.toFixed(4) : "N/A"}
                    </div>
                  </div>
                  {testResult.type === 'normality' && (
                    <>
                      <div className="bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Skewness</span>
                        <div className="text-lg font-mono font-bold text-stone-900">{testResult.skewness.toFixed(3)}</div>
                      </div>
                      <div className="bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Kurtosis</span>
                        <div className="text-lg font-mono font-bold text-stone-900">{testResult.kurtosis.toFixed(3)}</div>
                      </div>
                    </>
                  )}
                  {(testResult.type === 'stationarity' || testResult.type === 'phillips' || testResult.type === 'kpss') && (
                    <>
                      <div className="bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-stone-400">1% Critical Value</span>
                        <div className="text-lg font-mono font-bold text-stone-900">{testResult.criticalValues['1%'].toFixed(2)}</div>
                      </div>
                      <div className="bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-stone-400">5% Critical Value</span>
                        <div className="text-lg font-mono font-bold text-stone-900">{testResult.criticalValues['5%'].toFixed(2)}</div>
                      </div>
                    </>
                  )}
                  {testResult.type === 'autocorrelation' && (
                    <div className="col-span-2 bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                      <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Diagnosis</span>
                      <div className="text-sm font-serif font-bold text-indigo-900">{testResult.diagnosis}</div>
                    </div>
                  )}
                  {testResult.type === 'specification' && (
                    <>
                      <div className="bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Restricted RSS</span>
                        <div className="text-sm font-mono font-bold text-stone-900 truncate">{testResult.rssRestricted.toFixed(2)}</div>
                      </div>
                      <div className="bg-white border border-stone-100 p-4 rounded-xl text-center space-y-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-stone-400">Unrestricted RSS</span>
                        <div className="text-sm font-mono font-bold text-stone-900 truncate">{testResult.rssUnrestricted.toFixed(2)}</div>
                      </div>
                    </>
                  )}
                </div>

                {/* Scholastic Coach Explanation */}
                <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <BrainCircuit className="w-4 h-4 text-indigo-600" />
                    <h5 className="text-xs font-bold text-indigo-900 font-mono uppercase tracking-wider">Academic Coach Interpretation</h5>
                  </div>
                  <p className="text-xs text-stone-700 leading-relaxed font-serif italic">
                    {testResult.type === 'normality' && (
                      testResult.pValue < 0.05 
                        ? `The Jarque-Bera statistic of ${testResult.stat.toFixed(2)} is statistically significant (p < 0.05). We reject the null hypothesis of normality. This indicates that our residuals may have fat tails (skewness of ${testResult.skewness.toFixed(2)}, kurtosis of ${testResult.kurtosis.toFixed(2)}). Standard errors calculated using conventional OLS assumptions may be biased in small samples.`
                        : `The Jarque-Bera statistic is ${testResult.stat.toFixed(2)} with a p-value of ${testResult.pValue.toFixed(4)}. We fail to reject the null hypothesis; the series resembles a standard bell curve. Classic OLS inference tools can be applied with asymptotic confidence.`
                    )}
                    {testResult.type === 'stationarity' && (
                      testResult.stat < testResult.criticalValues['5%']
                        ? `The Augmented Dickey-Fuller statistic of ${testResult.stat.toFixed(2)} is less than the 5% critical value of ${testResult.criticalValues['5%']}. We reject the null hypothesis of a unit root; the series is stationary. You may estimate models with this series without fear of spurious regression.`
                        : `The Augmented Dickey-Fuller statistic of ${testResult.stat.toFixed(2)} is greater than the 5% critical value of ${testResult.criticalValues['5%']}. We fail to reject the null hypothesis of a unit root; the series is non-stationary. Regressing this variable against another non-stationary series might yield spurious coefficients with inflated R-squared. Consider differencing the variable first.`
                    )}
                    {testResult.type === 'phillips' && (
                      testResult.stat < testResult.criticalValues['5%']
                        ? `The Phillips-Perron statistic of ${testResult.stat.toFixed(2)} is below the 5% critical value of ${testResult.criticalValues['5%']}. We reject the unit-root null; the series is stationary. Unlike ADF, the PP test corrects for autocorrelation and heteroskedasticity non-parametrically rather than by adding lagged differences.`
                        : `The Phillips-Perron statistic of ${testResult.stat.toFixed(2)} exceeds the 5% critical value of ${testResult.criticalValues['5%']}. We fail to reject the unit-root null; the series appears non-stationary. Consider differencing before using it in a levels regression.`
                    )}
                    {testResult.type === 'kpss' && (
                      testResult.reject
                        ? `The KPSS statistic of ${testResult.stat.toFixed(3)} exceeds the 5% critical value of ${testResult.criticalValues['5%']}. Note the null is reversed for KPSS: we reject stationarity, so the series is non-stationary. When ADF/PP fail to reject a unit root AND KPSS rejects stationarity, the evidence for non-stationarity is strong.`
                        : `The KPSS statistic of ${testResult.stat.toFixed(3)} is below the 5% critical value of ${testResult.criticalValues['5%']}. We fail to reject the null of stationarity, so the series is consistent with being (trend-)stationary. KPSS is a useful confirmatory complement to ADF/PP because its null hypothesis is the opposite.`
                    )}
                    {testResult.type === 'autocorrelation' && (
                      testResult.stat < 1.5
                        ? `A Durbin-Watson statistic of ${testResult.stat.toFixed(2)} indicates positive serial autocorrelation. Standard errors might be severely underestimated, inflating t-statistics and leading to false-positive significance. Try using robust standard errors (HAC / Newey-West) or dynamic specifications.`
                        : testResult.stat > 2.5
                        ? `A Durbin-Watson statistic of ${testResult.stat.toFixed(2)} indicates negative serial autocorrelation. This suggests systematic alternating pattern in the errors.`
                        : `A Durbin-Watson statistic of ${testResult.stat.toFixed(2)} lies in the safe range (around 2.0). First-order serial correlation is not an immediate concern.`
                    )}
                    {testResult.type === 'specification' && (
                      testResult.pValue < 0.05
                        ? `The Ramsey RESET F-statistic is ${testResult.stat.toFixed(2)} (p = ${testResult.pValue.toFixed(4)}). We reject the null hypothesis of correct specification. This indicates significant non-linear relationships (e.g. quadratic or cubic curves) or omitted variables. Consider transforming the independent variable or adding polynomial terms.`
                        : `The Ramsey RESET test fails to reject the null hypothesis of correct functional form (p = ${testResult.pValue.toFixed(4)}). The linear specification is structurally sufficient to map the conditional expectation.`
                    )}
                  </p>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-stone-200 rounded-2xl p-12 shadow-sm text-center space-y-4 flex flex-col items-center justify-center min-h-[350px]">
                <FlaskConical className="w-10 h-10 text-stone-300" />
                <h4 className="text-base font-serif font-bold text-stone-700">Hypothesis Test Ready</h4>
                <p className="text-xs text-stone-400 max-w-sm mx-auto">
                  Select your model parameters and click the run button to execute the econometric tests.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
