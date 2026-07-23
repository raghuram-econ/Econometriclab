import React, { useState, useMemo } from 'react';
import { 
  Target, 
  Info, 
  AlertTriangle, 
  ArrowRight, 
  CheckCircle2, 
  ShieldAlert, 
  GitCommit, 
  Binary, 
  HelpCircle,
  TrendingUp
} from 'lucide-react';
import { runOLS } from '../../lib/econometrics/ols';
import { Dataset, AnalysisResult } from '../../types';
import { cn, fmt, fmtP, stars } from '../../lib/utils';
import jStat from 'jstat';
import ShowCode from '../shared/ShowCode';

interface CausalLabProps {
  dataset: Dataset | null;
  onRunComplete: (r: AnalysisResult) => void;
}

type TabType = 'did' | 'iv' | 'rd';

export default function CausalLab({ dataset, onRunComplete }: CausalLabProps) {
  const [activeTab, setActiveTab] = useState<TabType>('did');

  // Difference-in-Differences State
  const [didOutcome, setDidOutcome] = useState('');
  const [didTreatment, setDidTreatment] = useState('');
  const [didTime, setDidTime] = useState('');
  const [didControls, setDidControls] = useState<string[]>([]);
  const [didResult, setDidResult] = useState<any | null>(null);

  // 2SLS State
  const [ivOutcome, setIvOutcome] = useState('');
  const [ivEndogenous, setIvEndogenous] = useState('');
  const [ivInstrument, setIvInstrument] = useState('');
  const [ivControls, setIvControls] = useState<string[]>([]);
  const [ivResult, setIvResult] = useState<any | null>(null);

  // RD State
  const [rdOutcome, setRdOutcome] = useState('');
  const [rdRunning, setRdRunning] = useState('');
  const [rdCutoff, setRdCutoff] = useState('0');
  const [rdBandwidth, setRdBandwidth] = useState('1');
  const [rdPolynomial, setRdPolynomial] = useState<'linear' | 'quadratic'>('linear');
  const [rdResult, setRdResult] = useState<any | null>(null);

  const [isEstimating, setIsEstimating] = useState(false);
  const [estimationError, setEstimationError] = useState<string | null>(null);

  const variables = useMemo(() => dataset?.variables || [], [dataset]);
  const numericVars = useMemo(() => variables.filter(v => v.type === 'numeric'), [variables]);

  if (!dataset) {
    return (
      <div className="p-12 text-center bg-stone-50 border border-dashed border-stone-200 rounded-2xl max-w-2xl mx-auto my-12">
        <Target className="w-12 h-12 text-stone-300 mx-auto mb-4 animate-pulse" />
        <h3 className="text-lg font-bold text-stone-700">Dataset Required</h3>
        <p className="text-sm text-stone-500 font-serif italic max-w-md mx-auto mt-2">
          Please load an active dataset in the Data Workspace to begin testing causal designs.
        </p>
      </div>
    );
  }

  // --- DIFFERENCE IN DIFFERENCES ESTIMATOR ---
  const handleRunDiD = () => {
    if (!didOutcome || !didTreatment || !didTime) return;
    setIsEstimating(true);
    setEstimationError(null);
    try {
      const data = dataset.data || [];
      
      // Calculate Means
      const treatedPost = data.filter(r => Number(r[didTreatment]) === 1 && Number(r[didTime]) === 1);
      const treatedPre = data.filter(r => Number(r[didTreatment]) === 1 && Number(r[didTime]) === 0);
      const controlPost = data.filter(r => Number(r[didTreatment]) === 0 && Number(r[didTime]) === 1);
      const controlPre = data.filter(r => Number(r[didTreatment]) === 0 && Number(r[didTime]) === 0);

      const meanTreatedPost = treatedPost.reduce((sum, r) => sum + (Number(r[didOutcome]) || 0), 0) / (treatedPost.length || 1);
      const meanTreatedPre = treatedPre.reduce((sum, r) => sum + (Number(r[didOutcome]) || 0), 0) / (treatedPre.length || 1);
      const meanControlPost = controlPost.reduce((sum, r) => sum + (Number(r[didOutcome]) || 0), 0) / (controlPost.length || 1);
      const meanControlPre = controlPre.reduce((sum, r) => sum + (Number(r[didOutcome]) || 0), 0) / (controlPre.length || 1);

      const simpleATT = (meanTreatedPost - meanTreatedPre) - (meanControlPost - meanControlPre);
      
      // Calculate Pooled Standard Deviation for parallel trends check
      const yValuesT0 = treatedPre.map(r => Number(r[didOutcome]) || 0);
      const yValuesC0 = controlPre.map(r => Number(r[didOutcome]) || 0);

      const varT0 = yValuesT0.length > 1 ? yValuesT0.reduce((sum, v) => sum + (v - meanTreatedPre) ** 2, 0) / (yValuesT0.length - 1) : 0;
      const varC0 = yValuesC0.length > 1 ? yValuesC0.reduce((sum, v) => sum + (v - meanControlPre) ** 2, 0) / (yValuesC0.length - 1) : 0;

      const n_T0 = yValuesT0.length;
      const n_C0 = yValuesC0.length;
      const pooledVar = n_T0 + n_C0 > 2 ? ((n_T0 - 1) * varT0 + (n_C0 - 1) * varC0) / (n_T0 + n_C0 - 2) : 0;
      const pooledSD = Math.sqrt(pooledVar || 1);

      const preTrendDiffSD = Math.abs(meanTreatedPre - meanControlPre) / (pooledSD || 1);
      const parallelTrendWarning = preTrendDiffSD > 0.5;

      // OLS specification: Y = b0 + b1*Treated + b2*Post + b3*(Treated*Post) + Controls
      const regressionData = data.map(r => ({
        ...r,
        treated_post: (Number(r[didTreatment]) || 0) * (Number(r[didTime]) || 0)
      }));

      const independentVars = [didTreatment, didTime, 'treated_post', ...didControls];
      const olsResult = runOLS(regressionData, didOutcome, independentVars, true, true);

      const formattedResult = {
        simpleATT,
        meanTreatedPost,
        meanTreatedPre,
        meanControlPost,
        meanControlPre,
        parallelTrendWarning,
        preTrendDiffSD,
        ols: olsResult,
        specification: `${didOutcome} ~ ${didTreatment} + ${didTime} + (${didTreatment} * ${didTime})` + (didControls.length ? ` + ${didControls.join(' + ')}` : ''),
        didOutcome,
        didTreatment,
        didTime,
        didControls,
        causalType: 'did'
      };

      setDidResult(formattedResult);
      onRunComplete({
        type: 'generic',
        specification: `Difference-in-Differences: ${formattedResult.specification}`,
        results: formattedResult
      });
    } catch (err: any) {
      setEstimationError(err.message || 'Estimation error');
    } finally {
      setIsEstimating(false);
    }
  };

  // --- INSTRUMENTAL VARIABLES 2SLS ---
  const handleRunIV = () => {
    if (!ivOutcome || !ivEndogenous || !ivInstrument) return;
    setIsEstimating(true);
    setEstimationError(null);
    try {
      const data = dataset.data || [];

      // First stage: Endogenous (X) ~ Instrument (Z) + Controls
      const firstStageXvars = [ivInstrument, ...ivControls];
      const firstStage = runOLS(data, ivEndogenous, firstStageXvars, true, true);

      // Weak instrument check: first stage F-statistic
      const firstStageF = firstStage.fStat || 0;
      const isWeak = firstStageF < 10;

      // Predict X (fitted values)
      const fittedData = data.map(row => {
        let xHat = 0;
        firstStage.coefficients.forEach(coef => {
          if (coef.variable === 'Intercept') {
            xHat += coef.estimate;
          } else {
            xHat += coef.estimate * (Number(row[coef.variable]) || 0);
          }
        });
        return {
          ...row,
          x_hat: xHat
        };
      });

      // Second stage: Outcome (Y) ~ x_hat + Controls
      const secondStageXvars = ['x_hat', ...ivControls];
      const secondStage = runOLS(fittedData, ivOutcome, secondStageXvars, true, true);

      // Filter data to get exact observations used in second stage regression
      const varsToObserve = [ivOutcome, ivEndogenous, ivInstrument, ...ivControls];
      const validRows = data.filter(row => {
        if (!row) return false;
        return varsToObserve.every(v => {
          const val = row[v];
          return val !== undefined && val !== null && !isNaN(parseFloat(val));
        });
      });

      // Recompute true residual sum of squares using actual endogenous variable
      const rssTrue = validRows.reduce((sum, row) => {
        let yHatTrue = 0;
        secondStage.coefficients.forEach(coef => {
          if (coef.variable === 'Intercept') {
            yHatTrue += coef.estimate;
          } else if (coef.variable === 'x_hat') {
            yHatTrue += coef.estimate * (Number(row[ivEndogenous]) || 0);
          } else {
            yHatTrue += coef.estimate * (Number(row[coef.variable]) || 0);
          }
        });
        const yActual = Number(row[ivOutcome]) || 0;
        const residual = yActual - yHatTrue;
        return sum + residual * residual;
      }, 0);

      const secondStageRSS = secondStage.rss ?? 0;
      const seScale = secondStageRSS > 0 ? Math.sqrt(rssTrue / secondStageRSS) : 1;
      const correctedRMSE = Math.sqrt(rssTrue / secondStage.df);

      // Map coefficients to label 'x_hat' as Instrumented Endogenous, applying SE corrections
      const mappedCoefficients = secondStage.coefficients.map(c => {
        const originalSE = c.stdError || 0;
        const correctedSE = originalSE * seScale;
        const correctedTStat = correctedSE === 0 ? NaN : c.estimate / correctedSE;
        
        const df = secondStage.df;
        const correctedPValue = isNaN(correctedTStat) 
          ? NaN 
          : 2 * (1 - jStat.studentt.cdf(Math.abs(correctedTStat), df));
          
        const tCrit = jStat.studentt.inv(0.975, df);
        const correctedConfLow = c.estimate - tCrit * correctedSE;
        const correctedConfHigh = c.estimate + tCrit * correctedSE;

        const isXHat = c.variable === 'x_hat';
        const label = isXHat ? `${ivEndogenous} (Instrumented)` : c.variable;

        return {
          ...c,
          variable: label,
          stdError: isNaN(correctedSE) ? 0 : correctedSE,
          tStat: isNaN(correctedTStat) ? 0 : correctedTStat,
          pValue: isNaN(correctedPValue) ? 1 : correctedPValue,
          confLow: isNaN(correctedSE) ? 0 : correctedConfLow,
          confHigh: isNaN(correctedSE) ? 0 : correctedConfHigh
        };
      });

      const formattedResult = {
        firstStage,
        secondStage: {
          ...secondStage,
          rss: rssTrue,
          rmse: correctedRMSE,
          coefficients: mappedCoefficients
        },
        firstStageF,
        isWeak,
        specification: `2SLS IV: ${ivOutcome} ~ [${ivEndogenous} = ${ivInstrument}]` + (ivControls.length ? ` + ${ivControls.join(' + ')}` : ''),
        ivOutcome,
        ivEndogenous,
        ivInstrument,
        ivControls,
        causalType: 'iv'
      };

      setIvResult(formattedResult);
      onRunComplete({
        type: 'generic',
        specification: formattedResult.specification,
        results: formattedResult
      });
    } catch (err: any) {
      setEstimationError(`Estimation error: ${err.message || err}`);
    } finally {
      setIsEstimating(false);
    }
  };

  // --- REGRESSION DISCONTINUITY ESTIMATOR ---
  const handleRunRD = () => {
    if (!rdOutcome || !rdRunning) return;
    setIsEstimating(true);
    setEstimationError(null);
    try {
      const data = dataset.data || [];
      const cutoff = Number(rdCutoff) || 0;
      const bandwidth = Number(rdBandwidth) || 0.1;

      // Filter to bandwidth: |R_i - cutoff| <= h
      const filtered = data.filter(row => {
        const runningVal = Number(row[rdRunning]);
        return !isNaN(runningVal) && Math.abs(runningVal - cutoff) <= bandwidth;
      });

      if (filtered.length < 10) {
        throw new Error('Too few observations inside the bandwidth boundary. Try broadening the bandwidth.');
      }

      // Create centered running variable and quadratic if chosen
      const rdDataWithCentered = filtered.map(row => {
        const rVal = Number(row[rdRunning]) || 0;
        const rCentered = rVal - cutoff;
        const rCenteredSq = rCentered * rCentered;
        return {
          ...row,
          r_centered: rCentered,
          r_centered_sq: rCenteredSq
        };
      });

      const belowData = rdDataWithCentered.filter(row => row.r_centered < 0);
      const aboveData = rdDataWithCentered.filter(row => row.r_centered >= 0);

      const k_vars = rdPolynomial === 'quadratic' ? 3 : 2; // coefficients per side
      if (belowData.length < k_vars + 1 || aboveData.length < k_vars + 1) {
        throw new Error('Insufficient observations on one or both sides of the cutoff boundary for the selected polynomial order.');
      }

      // Run separate OLS fits
      const indepVars = rdPolynomial === 'quadratic' ? ['r_centered', 'r_centered_sq'] : ['r_centered'];
      const olsBelow = runOLS(belowData, rdOutcome, indepVars, true, true);
      const olsAbove = runOLS(aboveData, rdOutcome, indepVars, true, true);

      // RD estimate = alpha_1 - alpha_0 (intercepts of the centered regressions represent predicted values at R_centered = 0, i.e., cutoff)
      const predBelow = olsBelow.coefficients.find(c => c.variable === 'Intercept')?.estimate || 0;
      const predAbove = olsAbove.coefficients.find(c => c.variable === 'Intercept')?.estimate || 0;
      const rdEstimate = predAbove - predBelow;

      // Conservative SE of RD estimate = sqrt(SE_alpha1^2 + SE_alpha0^2)
      const seBelow = olsBelow.coefficients.find(c => c.variable === 'Intercept')?.stdError || 0.1;
      const seAbove = olsAbove.coefficients.find(c => c.variable === 'Intercept')?.stdError || 0.1;
      const rdSE = Math.sqrt(seBelow * seBelow + seAbove * seAbove);

      const rdT = rdEstimate / (rdSE || 1);
      // Precise p-value using standard normal CDF
      const rdP = 2 * (1 - jStat.normal.cdf(Math.abs(rdT), 0, 1));

      const formattedResult = {
        rdEstimate,
        rdSE,
        rdT,
        rdP,
        predBelow,
        predAbove,
        belowCount: belowData.length,
        aboveCount: aboveData.length,
        olsBelow,
        olsAbove,
        cutoff,
        bandwidth,
        rdPolynomial,
        specification: `RD Local ${rdPolynomial === 'quadratic' ? 'Quadratic' : 'Linear'}: ${rdOutcome} ~ Treatment Jump at ${rdRunning} = ${cutoff} (Bandwidth: ${bandwidth})`,
        rdOutcome,
        rdRunning,
        rdCutoff: cutoff,
        rdBandwidth: bandwidth,
        causalType: 'rd'
      };

      setRdResult(formattedResult);
      onRunComplete({
        type: 'generic',
        specification: formattedResult.specification,
        results: formattedResult
      });
    } catch (err: any) {
      setEstimationError(`Estimation error: ${err.message || err}`);
    } finally {
      setIsEstimating(false);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-900 italic">Causal Inference Laboratory</h1>
          <p className="text-sm text-stone-500 font-serif italic mt-1">
            Isolate true structural parameters using Difference-in-Differences, Instrumental Variables, or Sharp RD designs.
          </p>
        </div>
        <div className="flex gap-1.5 bg-stone-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('did')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'did' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Difference-in-Differences
          </button>
          <button
            onClick={() => setActiveTab('iv')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'iv' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            2SLS (IV)
          </button>
          <button
            onClick={() => setActiveTab('rd')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'rd' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Regression Discontinuity
          </button>
        </div>
      </div>

      {/* DID PANEL */}
      {activeTab === 'did' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-stone-600" />
              DiD Specification
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome variable (Y)</label>
                <select
                  value={didOutcome}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDidOutcome(v);
                    setDidControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Treatment Indicator (D)</label>
                <select
                  value={didTreatment}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDidTreatment(v);
                    setDidControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select treatment column (0/1)...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Time Indicator (Post/Pre)</label>
                <select
                  value={didTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDidTime(v);
                    setDidControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select post/pre column (0/1)...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Control Variables</label>
                <div className="max-h-28 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1 bg-stone-50">
                  {numericVars.filter(v => v.name !== didOutcome && v.name !== didTreatment && v.name !== didTime).map(v => (
                    <label key={v.name} className="flex items-center gap-2 text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={didControls.includes(v.name)}
                        onChange={(e) => {
                          if (e.target.checked) setDidControls([...didControls, v.name]);
                          else setDidControls(didControls.filter(c => c !== v.name));
                        }}
                        className="rounded text-[#1B2E41] focus:ring-[#1B2E41]"
                      />
                      {v.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleRunDiD}
                disabled={!didOutcome || !didTreatment || !didTime || isEstimating}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {isEstimating ? (
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                     <span>Estimating...</span>
                  </div>
                ) : (
                  <>
                    Run DiD Estimation <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {estimationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>
                    {estimationError}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!didResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <TrendingUp className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No DiD Estimate Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Specify parameters on the left to measure counterfactual policy shifts.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Warnings */}
                {didResult.parallelTrendWarning && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Parallel Trends Hazard Detected</h4>
                      <p className="text-xs text-amber-800 leading-relaxed font-serif mt-0.5">
                        Parallel trends may be violated — pre-treatment means differ by {fmt(didResult.preTrendDiffSD)} SD (Treated: {fmt(didResult.meanTreatedPre)}, Control: {fmt(didResult.meanControlPre)}). This indicates potential selection bias, which threatens the parallel trends assumption required to interpret this coefficient as causal.
                      </p>
                    </div>
                  </div>
                )}

                {/* Grid summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Simple ATT</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{fmt(didResult.simpleATT)}</span>
                  </div>
                  <div className="p-4 bg-[#1B2E41]/5 border border-[#1B2E41]/20 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Regression ATT</span>
                    <span className="text-xl font-serif font-bold text-[#1B2E41]">
                      {fmt(didResult.ols.coefficients.find((c: any) => c.variable === 'treated_post')?.estimate || 0)}
                    </span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Treated Pre Mean</span>
                    <span className="text-lg font-serif text-stone-700">{fmt(didResult.meanTreatedPre)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Control Pre Mean</span>
                    <span className="text-lg font-serif text-stone-700">{fmt(didResult.meanControlPre)}</span>
                  </div>
                </div>

                {/* Regression Result table */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4">Regression Coefficient Matrix (HC1 Errors)</h3>
                  <div className="overflow-x-auto">
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Variable</th>
                          <th>Estimate</th>
                          <th>Std Error</th>
                          <th>t-stat</th>
                          <th>p-value</th>
                          <th>Significance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {didResult.ols.coefficients.map((coef: any) => {
                          const s = stars(coef.pValue);
                          return (
                            <tr key={coef.variable} className={coef.variable === 'treated_post' ? 'bg-[#1B2E41]/5 font-bold' : ''}>
                              <td className="font-mono text-xs">{coef.variable === 'treated_post' ? 'treated*post (ATT)' : coef.variable}</td>
                              <td className="text-right">{fmt(coef.estimate)}</td>
                              <td className="text-right">{fmt(coef.stdError)}</td>
                              <td className="text-right">{fmt(coef.tStat)}</td>
                              <td className="text-right">{fmtP(coef.pValue)}</td>
                              <td className="text-center font-bold">
                                <span className={cn(
                                  s === '***' ? "text-red-700" : s === '**' ? "text-amber-700" : "text-stone-400"
                                )}>{s || 'n.s.'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2SLS PANEL */}
      {activeTab === 'iv' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Binary className="w-4 h-4 text-stone-600" />
              IV 2SLS Specification
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome variable (Y)</label>
                <select
                  value={ivOutcome}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIvOutcome(v);
                    setIvControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Endogenous Regressor (X)</label>
                <select
                  value={ivEndogenous}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIvEndogenous(v);
                    setIvControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Instrumental Variable (Z)</label>
                <select
                  value={ivInstrument}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIvInstrument(v);
                    setIvControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Control Variables</label>
                <div className="max-h-28 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1 bg-stone-50">
                  {numericVars.filter(v => v.name !== ivOutcome && v.name !== ivEndogenous && v.name !== ivInstrument).map(v => (
                    <label key={v.name} className="flex items-center gap-2 text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={ivControls.includes(v.name)}
                        onChange={(e) => {
                          if (e.target.checked) setIvControls([...ivControls, v.name]);
                          else setIvControls(ivControls.filter(c => c !== v.name));
                        }}
                        className="rounded text-[#1B2E41] focus:ring-[#1B2E41]"
                      />
                      {v.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleRunIV}
                disabled={!ivOutcome || !ivEndogenous || !ivInstrument || isEstimating}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {isEstimating ? (
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                     <span>Estimating...</span>
                  </div>
                ) : (
                  <>
                    Run 2SLS Regression <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {estimationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>
                    {estimationError}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!ivResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <Binary className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No IV Model Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Specify your target variable, endogenous regressor, and instrument to start the two-stage process.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Warnings */}
                {ivResult.isWeak ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Weak Instrument Hazard (F &lt; 10)</h4>
                      <p className="text-xs text-amber-800 leading-relaxed font-serif mt-0.5">
                        First stage regression F-statistic is only {fmt(ivResult.firstStageF)}. An F-stat below the Stock-Yogo rule of thumb threshold of 10 indicates a weak instrument, which can amplify bias and invalidate conventional standard error inference.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Strong Instrument Confirmed</h4>
                      <p className="text-xs text-emerald-800 leading-relaxed font-serif mt-0.5">
                        First stage regression F-statistic is {fmt(ivResult.firstStageF)} (&gt; 10). The instrument contains sufficient predictive power to mitigate the weak instrument puzzle.
                      </p>
                    </div>
                  </div>
                )}

                {/* Sargan Overid Note */}
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl flex items-start gap-2.5 text-stone-600">
                  <Info className="w-4 h-4 text-stone-500 mt-0.5 shrink-0" />
                  <p className="text-xs font-serif italic leading-relaxed">
                    <strong>Overidentification Test Note:</strong> The current specification has exactly 1 instrument for 1 endogenous regressor (just identified). Consequently, the model has zero degrees of freedom for an overidentification test (e.g., Sargan-Hansen J-test).
                  </p>
                </div>

                {/* Second Stage Results */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4">Second Stage Coefficient Matrix (IV-2SLS)</h3>
                  <div className="overflow-x-auto">
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Variable</th>
                          <th>Estimate</th>
                          <th>Std Error</th>
                          <th>t-stat</th>
                          <th>p-value</th>
                          <th>Significance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ivResult.secondStage.coefficients.map((coef: any) => {
                          const s = stars(coef.pValue);
                          return (
                            <tr key={coef.variable} className={coef.variable.includes('(Instrumented)') ? 'bg-indigo-50/50 font-bold' : ''}>
                              <td className="font-mono text-xs">{coef.variable}</td>
                              <td className="text-right">{fmt(coef.estimate)}</td>
                              <td className="text-right">{fmt(coef.stdError)}</td>
                              <td className="text-right">{fmt(coef.tStat)}</td>
                              <td className="text-right">{fmtP(coef.pValue)}</td>
                              <td className="text-center font-bold">
                                <span className={cn(
                                  s === '***' ? "text-red-700" : s === '**' ? "text-amber-700" : "text-stone-400"
                                )}>{s || 'n.s.'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 pt-4 border-t border-stone-100">
                    <ShowCode 
                      parameters={{
                        modelType: "iv",
                        yVariable: ivOutcome,
                        xVariables: [ivEndogenous, ...ivControls],
                        options: {
                          instruments: [ivInstrument]
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RD PANEL */}
      {activeTab === 'rd' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-stone-600" />
              RD Design Specification
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome variable (Y)</label>
                <select
                  value={rdOutcome}
                  onChange={(e) => setRdOutcome(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Running Variable (R)</label>
                <select
                  value={rdRunning}
                  onChange={(e) => setRdRunning(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Cutoff Boundary (c)</label>
                <input
                  type="number"
                  step="any"
                  value={rdCutoff}
                  onChange={(e) => setRdCutoff(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Bandwidth Boundary (h)</label>
                <input
                  type="number"
                  step="any"
                  value={rdBandwidth}
                  onChange={(e) => setRdBandwidth(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Polynomial Order</label>
                <select
                  value={rdPolynomial}
                  onChange={(e) => setRdPolynomial(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="linear">Local Linear</option>
                  <option value="quadratic">Local Quadratic</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleRunRD}
                disabled={!rdOutcome || !rdRunning || !rdBandwidth || isEstimating}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {isEstimating ? (
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                     <span>Estimating...</span>
                  </div>
                ) : (
                  <>
                    Estimate Local RD <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {estimationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>
                    {estimationError}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!rdResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <Target className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No RD Estimate Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Specify parameters to measure discontinuity and intercept jumps at your running variable's cutoff threshold.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">RD Effect Jump</span>
                    <span className="text-xl font-serif font-bold text-[#1B2E41]">{fmt(rdResult.rdEstimate)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">RD p-value</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{fmtP(rdResult.rdP)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Observations in h</span>
                    <span className="text-xl font-serif text-stone-800">{rdResult.belowCount + rdResult.aboveCount}</span>
                  </div>
                </div>

                {/* Interpretation */}
                <div className="p-5 bg-white border border-stone-200 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-stone-600" />
                    Econometric interpretation
                  </h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    By restricting analysis to observations within a bandwidth of <span className="font-mono">{rdResult.bandwidth}</span> around the cutoff <span className="font-mono">{rdResult.cutoff}</span>, we assume local randomization. 
                    The estimated discontinuity jump in <strong className="text-stone-800">{rdOutcome}</strong> is <strong>{fmt(rdResult.rdEstimate)}</strong> (SE = {fmt(rdResult.rdSE)}), yielding a t-stat of {fmt(rdResult.rdT)} ({stars(rdResult.rdP) || 'not statistically significant'}).
                  </p>
                  <p className="text-[11px] text-stone-400 leading-normal italic">
                    Below Boundary Prediction: {fmt(rdResult.predBelow)} (N = {rdResult.belowCount}) | Above Boundary Prediction: {fmt(rdResult.predAbove)} (N = {rdResult.aboveCount})
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
