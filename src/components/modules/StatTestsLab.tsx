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
import jStat from 'jstat';
import * as math from 'mathjs';
import { approximateADFPValue } from '../../lib/econometrics/arima';

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
  const [testType, setTestType] = useState<'normality' | 'stationarity' | 'autocorrelation' | 'specification'>('normality');
  const [selectedVar, setSelectedVar] = useState<string>('');
  const [selectedVarX, setSelectedVarX] = useState<string>(''); // For specification / autocorrelation auxiliary OLS
  const [lagLength, setLagLength] = useState<number>(1);
  const [testResult, setTestResult] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);

  // Automatically pick a variable when dataset is loaded
  React.useEffect(() => {
    if (numericVariables.length > 0) {
      if (!selectedVar || !numericVariables.includes(selectedVar)) {
        const first = numericVariables[0];
        if (first) setSelectedVar(first);
      }
      if (numericVariables.length > 1 && (!selectedVarX || !numericVariables.includes(selectedVarX))) {
        const second = numericVariables[1];
        if (second) setSelectedVarX(second);
      }
    }
  }, [numericVariables, selectedVar, selectedVarX]);

  const handleRunTest = () => {
    if (!activeDataset || !selectedVar) return;
    setIsRunning(true);

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
          // Calculate mean, variance, skewness, kurtosis for Jarque-Bera
          const mean = values.reduce((sum, v) => sum + v, 0) / N;
          const m2 = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / N;
          const m3 = values.reduce((sum, v) => sum + (v - mean) ** 3, 0) / N;
          const m4 = values.reduce((sum, v) => sum + (v - mean) ** 4, 0) / N;

          const variance = m2;
          const stdDev = Math.sqrt(variance);
          
          // Skewness and Kurtosis (unbiased/standard formulas)
          const skewness = m3 / (stdDev ** 3);
          const kurtosis = m4 / (stdDev ** 4);

          // Jarque-Bera statistic
          const jbStat = (N / 6) * (skewness ** 2 + ((kurtosis - 3) ** 2) / 4);
          
          // Chi-square p-value with 2 d.f.
          const pValue = 1 - jStat.chisquare.cdf(jbStat, 2);

          setTestResult({
            type: 'normality',
            variable: selectedVar,
            n: N,
            mean,
            stdDev,
            skewness,
            kurtosis,
            stat: jbStat,
            pValue,
            nullHypothesis: "The variable is normally distributed.",
            altHypothesis: "The variable is NOT normally distributed.",
            decision: pValue < 0.05 ? "Reject Null Hypothesis" : "Fail to Reject Null Hypothesis"
          });
        } 
        else if (testType === 'stationarity') {
          // Augmented Dickey-Fuller (ADF) approximation
          // Let's run a real Dickey-Fuller regression: dy = alpha + beta * y_{t-1} + gamma * dy_{t-1} + e
          const dy: number[] = [];
          const y_lag1: number[] = [];
          const dy_lag1: number[] = [];

          for (let t = 2; t < N; t++) {
            const current = values[t] ?? 0;
            const prev = values[t-1] ?? 0;
            const prev2 = values[t-2] ?? 0;

            dy.push(current - prev);
            y_lag1.push(prev);
            dy_lag1.push(prev - prev2);
          }

          // Build regression matrix
          // dy = b0 + b1 * y_lag1 + b2 * dy_lag1
          const Y = dy;
          const X = y_lag1.map((val, idx) => [1, val, dy_lag1[idx] ?? 0]) as any as number[][];

          const k = 3;
          const n_reg = Y.length;

          const Xt = math.transpose(X);
          const XtX = math.multiply(Xt, X);
          const XtX_inv = math.inv(XtX as any) as any as number[][];
          const XtY = math.multiply(Xt, Y);
          const beta = math.multiply(XtX_inv, XtY) as any as number[];

          const Y_hat = math.multiply(X, beta) as any as number[];
          const residuals = Y.map((val, i) => val - (Y_hat[i] ?? 0));
          const rss = residuals.reduce((sum, r) => sum + r * r, 0);
          const s2 = rss / (n_reg - k);
          const varCov = math.multiply(XtX_inv, s2) as any as number[][];

          // ADF test statistic is the t-statistic on y_lag1 (which is beta[1])
          const beta_y = beta[1] ?? 0;
          const se_y = Math.sqrt(varCov[1]?.[1] ?? 1e-10);
          const adfStat = beta_y / se_y;

          // Standard MacKinnon critical values for N ~ 100-500
          const crit1 = -3.46;
          const crit5 = -2.88;
          const crit10 = -2.57;

          
                    // MacKinnon response-surface p-value, shared with the ARIMA engine.
          // This replaces a six-value step table that was off by as much as 0.15.
          const adfPValue = approximateADFPValue(adfStat);
          
          
          
          
          
  

          setTestResult({
            type: 'stationarity',
            variable: selectedVar,
            n: N,
            stat: adfStat,
            pValue: adfPValue,
            criticalValues: { '1%': crit1, '5%': crit5, '10%': crit10 },
            nullHypothesis: "The variable has a unit root (is non-stationary).",
            altHypothesis: "The variable is stationary (has no unit root).",
            decision: adfStat < crit5 ? "Reject Null (Stationary)" : "Fail to Reject Null (Non-Stationary)"
          });
        }
        else if (testType === 'autocorrelation') {
          // Durbin-Watson statistic calculation
          // DW = sum_{t=2}^N (e_t - e_{t-1})^2 / sum_{t=1}^N e_t^2
          // If we run OLS on a simple AR(1) or residuals of selected var vs trend
          const mean = values.reduce((sum, v) => sum + v, 0) / N;
          const residuals = values.map(v => v - mean);

          let num = 0;
          let den = 0;

          for (let t = 0; t < N; t++) {
            den += (residuals[t] ?? 0) ** 2;
            if (t > 0) {
              num += ((residuals[t] ?? 0) - (residuals[t-1] ?? 0)) ** 2;
            }
          }

          const dwStat = den > 0 ? num / den : 2.0;

          let diagnosis = "No significant autocorrelation";
          if (dwStat < 1.5) diagnosis = "Positive serial correlation detected (DW < 1.5)";
          else if (dwStat > 2.5) diagnosis = "Negative serial correlation detected (DW > 2.5)";

          setTestResult({
            type: 'autocorrelation',
            variable: selectedVar,
            n: N,
            stat: dwStat,
            pValue: null, // DW uses critical bound tables instead of a direct analytical p-value
            diagnosis,
            nullHypothesis: "No first-order serial correlation in errors.",
            altHypothesis: "Errors exhibit first-order serial correlation.",
            decision: (dwStat < 1.5 || dwStat > 2.5) ? "Reject Null Hypothesis" : "Fail to Reject Null Hypothesis"
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

          const N_spec = Y_val.length;
          const X_mat = X_val.map(x => [1, x]);

          // Run OLS 1
          const Xt1 = math.transpose(X_mat);
          const XtX1 = math.multiply(Xt1, X_mat);
          const XtX1_inv = math.inv(XtX1 as any) as any as number[][];
          const beta1 = math.multiply(XtX1_inv, math.multiply(Xt1, Y_val)) as any as number[];

          const Y_hat = math.multiply(X_mat, beta1) as any as number[];
          const res1 = Y_val.map((y, idx) => y - (Y_hat[idx] ?? 0));
          const rss1 = res1.reduce((sum, r) => sum + r * r, 0);

          // Run OLS 2 (Ramsey auxiliary regression with Y_hat^2 and Y_hat^3)
          const X_aux = X_val.map((x, idx) => [1, x, (Y_hat[idx] ?? 0) ** 2, (Y_hat[idx] ?? 0) ** 3]) as any as number[][];
          const k_aux = 4;

          const Xt2 = math.transpose(X_aux);
          const XtX2 = math.multiply(Xt2, X_aux);
          const XtX2_inv = math.inv(XtX2 as any) as any as number[][];
          const beta2 = math.multiply(XtX2_inv, math.multiply(Xt2, Y_val)) as any as number[];

          const Y_hat2 = math.multiply(X_aux, beta2) as any as number[];
          const res2 = Y_val.map((y, idx) => y - (Y_hat2[idx] ?? 0));
          const rss2 = res2.reduce((sum, r) => sum + r * r, 0);

          // F-statistic for the two restricted parameters
          const numDf = 2;
          const denDf = N_spec - k_aux;
          const fStat = ((rss1 - rss2) / numDf) / (rss2 / denDf);
          const pValue = 1 - jStat.centralF.cdf(fStat, numDf, denDf);

          setTestResult({
            type: 'specification',
            variable: selectedVar,
            varX: selectedVarX,
            n: N_spec,
            stat: fStat,
            pValue,
            rssRestricted: rss1,
            rssUnrestricted: rss2,
            nullHypothesis: "The functional specification is correct (no omitted non-linear terms).",
            altHypothesis: "The specification is incorrect (omitted non-linear powers of fitted values).",
            decision: pValue < 0.05 ? "Reject Null (Omitted non-linearities exist)" : "Fail to Reject (No model specification issues)"
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
                      {testResult.type === 'autocorrelation' && 'Durbin-Watson Autocorrelation Output'}
                      {testResult.type === 'specification' && 'Ramsey RESET Specification Output'}
                    </h4>
                    <p className="text-xs text-stone-500 font-mono mt-1">Series: {testResult.variable} | N = {testResult.n}</p>
                  </div>
                  <div className={`px-3 py-1 rounded-full text-[10px] font-bold font-mono uppercase tracking-wider ${
                    testResult.pValue === null || testResult.pValue >= 0.05 
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
                  {testResult.type === 'stationarity' && (
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
