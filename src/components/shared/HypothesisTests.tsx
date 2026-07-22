import React, { useState, useMemo } from 'react';
import * as math from 'mathjs';
import jStat from 'jstat';
import { useSessionReport } from '../../context/SessionReportContext';
import { useStore } from '../../store/useStore';
import { Play, Plus, Scale, Layers, HelpCircle, Check, AlertCircle, RefreshCw } from 'lucide-react';

interface HypothesisTestsProps {
  results: {
    coefficients: {
      variable: string;
      estimate: number;
      stdError: number;
      tStat: number;
      pValue: number;
      confLow: number;
      confHigh: number;
    }[];
    df: number;
    n: number;
    varCov?: number[][];
  };
  dependentVar: string;
}

export default function HypothesisTests({ results, dependentVar }: HypothesisTestsProps) {
  const { addToReport } = useSessionReport();
  const { addToast } = useStore();
  const [activeTab, setActiveTab] = useState<'single' | 'lincom' | 'joint'>('single');

  const coefficients = results?.coefficients || [];
  const df = results?.df || 0;
  const varCov = results?.varCov;

  // 1. Single Coefficient Test State
  const [singleVar, setSingleVar] = useState<string>(coefficients[0]?.variable || '');
  const [singleNullVal, setSingleNullVal] = useState<string>('0');
  const [singleResult, setSingleResult] = useState<any | null>(null);

  // 2. Linear Combination State
  const [lincomExpr, setLincomExpr] = useState<string>('');
  const [lincomWeights, setLincomWeights] = useState<Record<string, number>>(() => {
    const init: Record<string, number> = {};
    coefficients.forEach(c => { init[c.variable] = 0; });
    return init;
  });
  const [lincomResult, setLincomResult] = useState<any | null>(null);
  const [lincomError, setLincomError] = useState<string | null>(null);

  // 3. Joint F-Test State
  const [selectedJointVars, setSelectedJointVars] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    coefficients.forEach(c => {
      // Don't select Intercept by default
      init[c.variable] = c.variable !== 'Intercept';
    });
    return init;
  });
  const [jointResult, setJointResult] = useState<any | null>(null);
  const [jointError, setJointError] = useState<string | null>(null);

  // Helper: Find index of a coefficient
  const getCoefIndex = (name: string) => {
    return coefficients.findIndex(c => c.variable === name);
  };

  if (!results || !results.coefficients) {
    return null;
  }

  // --- Run Test 1: Single Coefficient ---
  const handleRunSingleTest = () => {
    const idx = getCoefIndex(singleVar);
    if (idx === -1) return;

    const coef = coefficients[idx];
    if (!coef) return;
    const cVal = parseFloat(singleNullVal) || 0;
    const tStat = (coef.estimate - cVal) / coef.stdError;
    const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));

    const conclusion = pValue < 0.01 
      ? "Reject H₀ at 1% significance level" 
      : pValue < 0.05 
      ? "Reject H₀ at 5% significance level" 
      : pValue < 0.10 
      ? "Reject H₀ at 10% significance level" 
      : "Fail to reject H₀";

    setSingleResult({
      variable: singleVar,
      estimate: coef.estimate,
      stdError: coef.stdError,
      hypothesized: cVal,
      tStat,
      pValue,
      conclusion
    });
    addToast('success', 'Hypothesis Test Run', `t-test computed for ${singleVar} = ${cVal}`);
  };

  // --- Parse expression and sync with weights ---
  const handleExpressionChange = (expr: string) => {
    setLincomExpr(expr);
    setLincomError(null);

    if (!expr.trim()) {
      // Clear weights
      const cleared = { ...lincomWeights };
      Object.keys(cleared).forEach(k => { cleared[k] = 0; });
      setLincomWeights(cleared);
      return;
    }

    try {
      const parsed = math.parse(expr);
      const newWeights = { ...lincomWeights };
      
      coefficients.forEach(c => {
        try {
          const d = math.derivative(parsed, c.variable);
          const simplified = math.simplify(d);
          const val = simplified.evaluate();
          newWeights[c.variable] = typeof val === 'number' ? val : 0;
        } catch {
          newWeights[c.variable] = 0;
        }
      });

      setLincomWeights(newWeights);
    } catch (e: any) {
      // We don't block user typing, but store error on request
    }
  };

  // --- Update weight manually and sync with expression ---
  const handleWeightChange = (variable: string, value: number) => {
    const updated = { ...lincomWeights, [variable]: value };
    setLincomWeights(updated);

    // Reconstruct elegant expression
    const parts: string[] = [];
    coefficients.forEach(c => {
      const w = updated[c.variable] ?? 0;
      if (w !== 0) {
        if (w === 1) parts.push(c.variable);
        else if (w === -1) parts.push(`-${c.variable}`);
        else if (w > 0) parts.push(`${parts.length > 0 ? '+ ' : ''}${w} * ${c.variable}`);
        else parts.push(`${w} * ${c.variable}`);
      }
    });

    let reconstructed = parts.join(' ');
    // Clean leading '+'
    if (reconstructed.startsWith('+')) {
      reconstructed = reconstructed.substring(1).trim();
    }
    setLincomExpr(reconstructed);
    setLincomError(null);
  };

  // --- Run Test 2: Linear Combination ---
  const handleRunLincomTest = () => {
    if (!varCov) {
      setLincomError("Variance-covariance matrix is missing or incomplete for this model.");
      return;
    }

    // Ensure we have at least one non-zero weight
    const activeWeights = Object.entries(lincomWeights).filter(([_, w]) => w !== 0);
    if (activeWeights.length === 0) {
      setLincomError("Please specify at least one variable with a non-zero coefficient multiplier.");
      return;
    }

    const k = coefficients.length;
    const L = Array(k).fill(0);
    coefficients.forEach((c, idx) => {
      L[idx] = lincomWeights[c.variable] || 0;
    });

    // Compute estimate: sum(L_i * beta_i)
    let estimate = 0;
    for (let i = 0; i < k; i++) {
      estimate += L[i] * (coefficients[i]?.estimate ?? 0);
    }

    // Compute variance: L' * V * L
    let variance = 0;
    for (let i = 0; i < k; i++) {
      for (let j = 0; j < k; j++) {
        variance += L[i] * (varCov[i]?.[j] ?? 0) * L[j];
      }
    }

    if (variance < 0) {
      setLincomError("Computed negative variance. The covariance matrix might be singular or non-positive definite.");
      return;
    }

    const stdError = Math.sqrt(variance);
    const tStat = estimate / stdError;
    const pValue = 2 * (1 - jStat.studentt.cdf(Math.abs(tStat), df));
    const tCrit = jStat.studentt.inv(0.975, df);
    const confLow = estimate - tCrit * stdError;
    const confHigh = estimate + tCrit * stdError;

    setLincomResult({
      expression: lincomExpr || "Custom Linear Combination",
      estimate,
      stdError,
      tStat,
      pValue,
      confLow,
      confHigh,
      L
    });
    setLincomError(null);
    addToast('success', 'Linear Combination Computed', `Estimation completed for: ${lincomExpr || "Combination"}`);
  };

  // --- Run Test 3: Joint F-test ---
  const handleRunJointTest = () => {
    if (!varCov) {
      setJointError("Variance-covariance matrix is missing or incomplete for this model.");
      return;
    }

    const selectedNames = Object.entries(selectedJointVars)
      .filter(([_, checked]) => checked)
      .map(([name]) => name);

    if (selectedNames.length === 0) {
      setJointError("Select at least one variable to test joint significance.");
      return;
    }

    const q = selectedNames.length;
    const selectedIndices = selectedNames.map(name => getCoefIndex(name)).filter(idx => idx !== -1);

    try {
      // Extract sub-vector of estimates: q x 1
      const beta_J = selectedIndices.map(idx => coefficients[idx]?.estimate ?? 0);
      
      // Extract sub-covariance matrix: q x q
      const V_J = selectedIndices.map(i => selectedIndices.map(j => varCov[i]?.[j] ?? 0));

      // Invert V_J using mathjs
      const V_J_inv = math.inv(V_J) as number[][];

      // Compute quadratic form: beta_J' * V_J_inv * beta_J
      let waldStat = 0;
      for (let i = 0; i < q; i++) {
        let sum_j = 0;
        for (let j = 0; j < q; j++) {
          sum_j += (V_J_inv[i]?.[j] ?? 0) * (beta_J[j] ?? 0);
        }
        waldStat += (beta_J[i] ?? 0) * sum_j;
      }

      const fStat = waldStat / q;
      const pValue = 1 - jStat.centralF.cdf(fStat, q, df);

      const conclusion = pValue < 0.01 
        ? "Highly significant: Reject H₀ at 1% level" 
        : pValue < 0.05 
        ? "Significant: Reject H₀ at 5% level" 
        : pValue < 0.10 
        ? "Marginally significant: Reject H₀ at 10% level" 
        : "Not significant: Fail to reject H₀";

      setJointResult({
        variables: selectedNames,
        fStat,
        dfNum: q,
        dfDen: df,
        pValue,
        conclusion
      });
      setJointError(null);
      addToast('success', 'Joint F-test Computed', `Joint Wald test completed for ${q} restrictions.`);
    } catch (e: any) {
      setJointError(`Matrix inversion failed: ${e.message || "Variance matrix might be singular."}`);
    }
  };

  // --- Add Results to Session Report ---
  const handleAddSingleToReport = () => {
    if (!singleResult) return;

    addToReport({
      moduleType: "Hypothesis Test",
      title: `t-test: ${singleResult.variable} = ${singleResult.hypothesized}`,
      tables: [{
        title: `Hypothesis Test for Coefficient: ${singleResult.variable}`,
        headers: ["Parameter / Regressor", "Null Value (c)", "Estimated Coef", "Std. Error", "t-statistic", "p-value", "Conclusion"],
        rows: [[
          singleResult.variable,
          singleResult.hypothesized,
          singleResult.estimate,
          singleResult.stdError,
          singleResult.tStat,
          singleResult.pValue,
          singleResult.conclusion
        ]],
        footnote: `Null Hypothesis H₀: beta_${singleResult.variable} = ${singleResult.hypothesized}. Computed on ${df} residual degrees of freedom.`
      }],
      notes: [
        `Testing the null hypothesis that coefficient for '${singleResult.variable}' is equal to ${singleResult.hypothesized}.`,
        `The estimated parameter is ${singleResult.estimate.toFixed(4)} with a robust standard error of ${singleResult.stdError.toFixed(4)}.`,
        `Under the null, the test statistic t = ${singleResult.tStat.toFixed(4)} yields a p-value of ${singleResult.pValue.toFixed(4)}.`,
        `Outcome: ${singleResult.conclusion}.`
      ]
    });
    addToast('success', 'Report Updated', 'Single coefficient hypothesis test added to Session Report.');
  };

  const handleAddLincomToReport = () => {
    if (!lincomResult) return;

    addToReport({
      moduleType: "Linear Combination",
      title: `lincom: ${lincomResult.expression}`,
      tables: [{
        title: `Linear Combination Estimation (lincom)`,
        headers: ["Linear Expression", "Estimate", "Std. Error", "t-statistic", "p-value", "[95% Conf. Interval]"],
        rows: [[
          lincomResult.expression,
          lincomResult.estimate,
          lincomResult.stdError,
          lincomResult.tStat,
          lincomResult.pValue,
          `${lincomResult.confLow.toFixed(4)} to ${lincomResult.confHigh.toFixed(4)}`
        ]],
        footnote: `Linear combination calculated as L'beta. Variance-covariance design-corrected parameters applied.`
      }],
      notes: [
        `Linear combination expression: '${lincomResult.expression}'.`,
        `The point estimate for the combination is ${lincomResult.estimate.toFixed(4)} with a standard error of ${lincomResult.stdError.toFixed(4)}.`,
        `The t-statistic of ${lincomResult.tStat.toFixed(4)} (H₀: combination = 0) has an empirical p-value of ${lincomResult.pValue.toFixed(4)}.`,
        `The corresponding 95% Wald confidence interval is [${lincomResult.confLow.toFixed(4)}, ${lincomResult.confHigh.toFixed(4)}].`
      ]
    });
    addToast('success', 'Report Updated', 'Linear combination test results added to Session Report.');
  };

  const handleAddJointToReport = () => {
    if (!jointResult) return;

    addToReport({
      moduleType: "Joint Wald F-Test",
      title: `testparm: ${jointResult.variables.join(' = ')} = 0`,
      tables: [{
        title: `Joint Significance / Wald F-Test`,
        headers: ["Tested Regressors", "F-statistic", "df (Num, Den)", "p-value", "Conclusion"],
        rows: [[
          jointResult.variables.join(', '),
          jointResult.fStat,
          `(${jointResult.dfNum}, ${jointResult.dfDen})`,
          jointResult.pValue,
          jointResult.conclusion
        ]],
        footnote: `Null Hypothesis H₀: beta_j = 0 for all selected regressors. Wald-type variance-covariance test.`
      }],
      notes: [
        `Testing the joint null hypothesis that coefficients for [${jointResult.variables.join(', ')}] are simultaneously equal to 0.`,
        `The calculated Wald F-statistic is F(${jointResult.dfNum}, ${jointResult.dfDen}) = ${jointResult.fStat.toFixed(4)}.`,
        `The associated p-value is ${jointResult.pValue.toFixed(6)}, leading to the decision: ${jointResult.conclusion}.`
      ]
    });
    addToast('success', 'Report Updated', 'Joint significance F-test added to Session Report.');
  };

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-indigo-50 flex items-center justify-center">
            <Scale className="w-4 h-4 text-indigo-600" />
          </div>
          <div>
            <h3 className="text-xs font-bold tracking-[0.15em] uppercase text-slate-800 font-mono">
              Hypothesis testing center
            </h3>
            <p className="text-[10px] text-slate-400 font-serif italic">
              Perform rigorous post-estimation t-tests, linear combinations (lincom), and joint significance tests.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-100">
        <button
          onClick={() => setActiveTab('single')}
          className={`flex-1 py-2.5 text-center text-xs font-bold font-mono tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'single'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Test Single Coef
        </button>
        <button
          onClick={() => setActiveTab('lincom')}
          className={`flex-1 py-2.5 text-center text-xs font-bold font-mono tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'lincom'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Linear Combo (lincom)
        </button>
        <button
          onClick={() => setActiveTab('joint')}
          className={`flex-1 py-2.5 text-center text-xs font-bold font-mono tracking-wider border-b-2 transition-all cursor-pointer ${
            activeTab === 'joint'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-slate-400 hover:text-slate-600'
          }`}
        >
          Joint F-Test
        </button>
      </div>

      {/* Tab Panels */}
      <div className="pt-2">
        {/* TAB 1: Single Coef */}
        {activeTab === 'single' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Select Coefficient ($\beta_j$)</label>
                <select
                  value={singleVar}
                  onChange={(e) => setSingleVar(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs font-bold text-slate-700 focus:bg-white outline-none transition-all"
                >
                  {coefficients.map(c => (
                    <option key={c.variable} value={c.variable}>{c.variable} (β = {c.estimate.toFixed(4)})</option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Hypothesized Value ($c$)</label>
                <input
                  type="number"
                  step="0.0001"
                  value={singleNullVal}
                  onChange={(e) => setSingleNullVal(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3 text-xs font-bold text-slate-700 focus:bg-white outline-none transition-all font-mono"
                  placeholder="e.g. 0 or 1"
                />
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleRunSingleTest}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold tracking-wider transition-all shadow flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Run Hypothesis Test
              </button>
            </div>

            {singleResult && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Test Results (H₀: β_{singleResult.variable} = {singleResult.hypothesized})</span>
                  <button
                    onClick={handleAddSingleToReport}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer font-mono uppercase"
                  >
                    <Plus className="w-3 h-3" /> Add to Report
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-[11px]">
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Coefficient Estimate</span>
                    <strong className="text-slate-800 text-xs">{singleResult.estimate.toFixed(4)}</strong>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Std. Error</span>
                    <strong className="text-slate-800 text-xs">{singleResult.stdError.toFixed(4)}</strong>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">$t$-Statistic</span>
                    <strong className="text-indigo-600 text-xs font-bold">{singleResult.tStat.toFixed(4)}</strong>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">$P &gt; |t|$</span>
                    <strong className={`text-xs font-bold ${singleResult.pValue <= 0.05 ? 'text-amber-500' : 'text-slate-600'}`}>{singleResult.pValue.toFixed(5)}</strong>
                  </div>
                </div>

                <div className="bg-indigo-50/50 border border-indigo-100/50 p-3.5 rounded-xl flex items-start gap-2 text-xs font-serif leading-relaxed text-indigo-950">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <span className="font-bold font-mono uppercase tracking-wider text-[9px] text-indigo-800 block mb-0.5">Statistical Inference</span>
                    {singleResult.conclusion}. At this estimate, we observe a t-statistic of {singleResult.tStat.toFixed(3)}.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Linear Combo */}
        {activeTab === 'lincom' && (
          <div className="space-y-5 animate-in fade-in duration-300">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Linear Combination Expression</label>
              <input
                type="text"
                value={lincomExpr}
                onChange={(e) => handleExpressionChange(e.target.value)}
                className="w-full bg-slate-50 border border-slate-150 rounded-xl p-3.5 text-xs font-bold text-slate-800 focus:bg-white outline-none transition-all font-mono placeholder:text-slate-400"
                placeholder="e.g. education - 2 * experience"
              />
              <p className="text-[9px] text-slate-400 font-serif italic pl-1">
                Note: Standard coefficient variables can be combined. Example: <code>education + experience</code>. Keep spelling identical.
              </p>
            </div>

            {/* Weights Adjuster Grid */}
            <div className="space-y-2">
              <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Structured Coefficient Weightings</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {coefficients.map(c => (
                  <div key={c.variable} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex items-center justify-between gap-2">
                    <span className="text-[10px] font-mono text-slate-600 truncate font-bold" title={c.variable}>{c.variable}</span>
                    <input
                      type="number"
                      step="0.1"
                      value={lincomWeights[c.variable] || 0}
                      onChange={(e) => handleWeightChange(c.variable, parseFloat(e.target.value) || 0)}
                      className="w-16 bg-white border border-slate-200 rounded-lg p-1.5 text-[10px] font-bold text-right text-slate-700 outline-none focus:border-indigo-500 font-mono"
                    />
                  </div>
                ))}
              </div>
            </div>

            {lincomError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{lincomError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleRunLincomTest}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold tracking-wider transition-all shadow flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Estimate Linear Combination
              </button>
            </div>

            {lincomResult && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">lincom output: L'beta = {lincomResult.estimate.toFixed(4)}</span>
                  <button
                    onClick={handleAddLincomToReport}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer font-mono uppercase"
                  >
                    <Plus className="w-3 h-3" /> Add to Report
                  </button>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono text-[11px]">
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Linear Estimate</span>
                    <strong className="text-slate-800 text-xs">{lincomResult.estimate.toFixed(4)}</strong>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Linear SE</span>
                    <strong className="text-slate-800 text-xs">{lincomResult.stdError.toFixed(4)}</strong>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">$t$-Statistic</span>
                    <strong className="text-indigo-600 text-xs font-bold">{lincomResult.tStat.toFixed(4)}</strong>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">$P &gt; |t|$</span>
                    <strong className={`text-xs font-bold ${lincomResult.pValue <= 0.05 ? 'text-amber-500' : 'text-slate-600'}`}>{lincomResult.pValue.toFixed(5)}</strong>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-slate-100 space-y-1.5 font-mono text-[10px] text-slate-600">
                  <div className="flex justify-between border-b border-slate-50 pb-1">
                    <span>Robust 95% Confidence Interval:</span>
                    <strong className="text-slate-800">[{lincomResult.confLow.toFixed(4)}, {lincomResult.confHigh.toFixed(4)}]</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>Degrees of Freedom (Residual df):</span>
                    <strong>{df}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: Joint F-Test */}
        {activeTab === 'joint' && (
          <div className="space-y-4 animate-in fade-in duration-300">
            <div className="space-y-1.5">
              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Select regressors to test joint significance (H₀: β_j = 0)</label>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                {coefficients.map(c => (
                  <label key={c.variable} className="flex items-center gap-2.5 p-1 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={!!selectedJointVars[c.variable]}
                      onChange={(e) => setSelectedJointVars({ ...selectedJointVars, [c.variable]: e.target.checked })}
                      className="w-4.5 h-4.5 rounded border-slate-300 text-indigo-600 focus:ring-0 cursor-pointer"
                    />
                    <span className="text-xs font-mono text-slate-700 font-bold truncate" title={c.variable}>{c.variable}</span>
                  </label>
                ))}
              </div>
            </div>

            {jointError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{jointError}</span>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={handleRunJointTest}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold tracking-wider transition-all shadow flex items-center gap-2 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                Run Joint Wald F-Test
              </button>
            </div>

            {jointResult && (
              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-4 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Joint Significance (Wald Test)</span>
                  <button
                    onClick={handleAddJointToReport}
                    className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer font-mono uppercase"
                  >
                    <Plus className="w-3 h-3" /> Add to Report
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 font-mono text-[11px]">
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Wald F-Statistic</span>
                    <strong className="text-indigo-600 text-xs font-bold">{jointResult.fStat.toFixed(4)}</strong>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Degrees of Freedom</span>
                    <strong className="text-slate-800 text-xs">F({jointResult.dfNum}, {jointResult.dfDen})</strong>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-100">
                    <span className="text-[9px] text-slate-400 uppercase block mb-0.5">Prob &gt; F (p-value)</span>
                    <strong className={`text-xs font-bold ${jointResult.pValue <= 0.05 ? 'text-amber-500' : 'text-slate-600'}`}>{jointResult.pValue.toFixed(6)}</strong>
                  </div>
                </div>

                <div className="bg-indigo-50/50 border border-indigo-100/50 p-3.5 rounded-xl flex items-start gap-2 text-xs font-serif leading-relaxed text-indigo-950">
                  <Check className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5 animate-pulse" />
                  <div>
                    <span className="font-bold font-mono uppercase tracking-wider text-[9px] text-indigo-800 block mb-0.5">Joint Statistical Decision</span>
                    {jointResult.conclusion}. We test the simultaneous restrictions: <code>{jointResult.variables.map((v: string) => `β_${v}`).join(' = ')} = 0</code>.
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
