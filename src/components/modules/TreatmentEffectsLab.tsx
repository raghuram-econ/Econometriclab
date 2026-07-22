import React, { useState, useMemo } from 'react';
import { 
  Scale, 
  HelpCircle, 
  Info, 
  Play, 
  Binary, 
  RefreshCw, 
  BrainCircuit,
  LayoutGrid,
  BookOpen,
  AreaChart
} from 'lucide-react';
import { Dataset } from '../../types';
import { generateMasterDataset } from '../../lib/dataGenerators';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { ResponsiveContainer, AreaChart as RecAreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import * as math from 'mathjs';
import { estimateModel } from '../../lib/econometrics/estimators';

interface TreatmentEffectsLabProps {
  dataset: Dataset | null;
  onRunComplete?: (results: any, spec: string) => void;
}

// Simple Gradient Descent Logistic Regression solver for Propensity Scores
 /**
 * Propensity-score model.
 *
 * This previously ran 120 fixed iterations of gradient descent with no
 * convergence check, which stopped well short of the optimum — coefficients came
 * out roughly 12% low. Running it to convergence instead took several seconds on
 * the UI thread, because gradient descent needs ~800 passes where Newton needs
 * about 6.
 *
 * It now delegates to the shared Logit estimator, which uses Newton-Raphson and
 * is verified against statsmodels to 1e-8. `X` is expected to carry a leading
 * column of 1s, and the return value keeps that same [intercept, ...slopes] order
 * so the call site is unchanged.
 */
export function fitLogisticRegression(X: number[][], Y: number[]): number[] {
  const firstRow = X[0];
  if (!firstRow) return [];
  const k = firstRow.length;
  const xNames = Array.from({ length: k - 1 }, (_, i) => `_ps_x${i}`);
  const rows = X.map((r, i) => {
    const obj: Record<string, number> = { _ps_y: Y[i] ?? 0 };
    xNames.forEach((nm, j) => { obj[nm] = r[j + 1] ?? 0; });
    return obj;
  });

  const res = estimateModel('Logit', { data: rows, yVar: '_ps_y', xVars: xNames });
  const pick = (name: string) =>
    res.coefficients.find(c => c.variable === name)?.estimate ?? 0;

  return [pick('Intercept'), ...xNames.map(pick)];
}
  

export default function TreatmentEffectsLab({ dataset: propDataset, onRunComplete }: TreatmentEffectsLabProps) {
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

  const [treatVar, setTreatVar] = useState<string>('');
  const [outcomeVar, setOutcomeVar] = useState<string>('');
  const [covariates, setCovariates] = useState<string[]>([]);
  const [results, setResults] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'estimation' | 'att' | 'overlap' | 'balance'>('estimation');

  React.useEffect(() => {
    if (numericVariables.length > 2) {
      if (!treatVar || !numericVariables.includes(treatVar)) {
        setTreatVar(numericVariables.find(v => v === 'training' || v === 'female') || numericVariables[0] || '');
      }
      if (!outcomeVar || !numericVariables.includes(outcomeVar)) {
        setOutcomeVar(numericVariables.find(v => v === 'wage' || v === 'educ') || numericVariables[1] || '');
      }
      if (covariates.length === 0) {
        const potentialCovs = numericVariables.filter(v => v !== treatVar && v !== outcomeVar).slice(0, 3);
        setCovariates(potentialCovs);
      }
    }
  }, [numericVariables]);

  const handleToggleCov = (v: string) => {
    setCovariates(prev => prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]);
  };

  const handleEstimateCausal = () => {
    if (!activeDataset || !treatVar || !outcomeVar || covariates.length === 0) return;
    setIsRunning(true);

    setTimeout(() => {
      try {
        const data = activeDataset.data;
        const n_total = data.length;

        // Build matrices
        const Y = data.map(row => parseFloat(row[outcomeVar]));
        const T = data.map(row => (parseFloat(row[treatVar]) > 0.5 ? 1 : 0));

        // Covariates matrix (include Constant intercept)
        const X_mat = data.map(row => {
          const rowX = [1.0];
          covariates.forEach(c => rowX.push(parseFloat(row[c]) || 0));
          return rowX;
        });

        // 1. Calculate Propensity Scores via Logistic Regression
        const beta = fitLogisticRegression(X_mat, T);
        
        const pScores = X_mat.map(rowX => {
          let z = 0;
          rowX.forEach((val, idx) => z += val * (beta[idx] ?? 0));
          return 1 / (1 + Math.exp(-Math.max(-20, Math.min(20, z))));
        });

        // Split index lists
        const treatedIdx: number[] = [];
        const controlIdx: number[] = [];

        for (let i = 0; i < n_total; i++) {
          if (T[i] === 1) treatedIdx.push(i);
          else controlIdx.push(i);
        }

        if (treatedIdx.length === 0 || controlIdx.length === 0) {
          throw new Error("Causal matching requires at least some Treated (1) and Control (0) observations.");
        }

        // 2. Perform Nearest-Neighbor Matching (with replacement)
        // For each treated unit, find the control unit with closest propensity score
        const matchedControlIdx: number[] = [];
        treatedIdx.forEach(tIdx => {
          const tScore = pScores[tIdx] ?? 0;
          let bestCtrlIdx = controlIdx[0] ?? 0;
          let minDiff = Math.abs(tScore - (pScores[bestCtrlIdx] ?? 0));

          controlIdx.forEach(cIdx => {
            const diff = Math.abs(tScore - (pScores[cIdx] ?? 0));
            if (diff < minDiff) {
              minDiff = diff;
              bestCtrlIdx = cIdx;
            }
          });
          matchedControlIdx.push(bestCtrlIdx);
        });

        // 3. Compute ATT & Simple mean differences
        const treatedYVals: number[] = treatedIdx.map(idx => Y[idx] ?? 0);
        const matchedControlYVals: number[] = matchedControlIdx.map(idx => Y[idx] ?? 0);
        const controlYVals: number[] = controlIdx.map(idx => Y[idx] ?? 0);

        const meanTreated = treatedYVals.reduce((sum: number, v: number) => sum + v, 0) / treatedYVals.length;
        const meanControl = controlYVals.reduce((sum: number, v: number) => sum + v, 0) / controlYVals.length;
        const meanMatchedControl = matchedControlYVals.reduce((sum: number, v: number) => sum + v, 0) / matchedControlYVals.length;

        const unmatchedDiff = meanTreated - meanControl;
        const att = meanTreated - meanMatchedControl;

        // Estimate matching standard error (approximate analytical SE)
        const attVariance = treatedYVals.reduce((sum: number, v: number) => sum + (v - meanTreated - att) ** 2, 0) / (treatedYVals.length * treatedYVals.length);
        const attSe = Math.sqrt(attVariance) || 0.1;
        const attTStat = att / attSe;

        // 4. Density overlap data (bin propensity scores)
        const bins = Array.from({ length: 11 }, (_, i) => i / 10);
        const densityData = bins.map(binVal => {
          // Count treated and controls in score range [binVal - 0.05, binVal + 0.05]
          const lower = binVal - 0.05;
          const upper = binVal + 0.05;

          const treatedCount = treatedIdx.filter(idx => (pScores[idx] ?? 0) >= lower && (pScores[idx] ?? 0) <= upper).length;
          const controlCount = controlIdx.filter(idx => (pScores[idx] ?? 0) >= lower && (pScores[idx] ?? 0) <= upper).length;

          return {
            binName: binVal.toFixed(1),
            Treated: treatedCount / treatedIdx.length,
            Control: controlCount / controlIdx.length
          };
        });

        // 5. Covariate balance stats (Means before vs after matching)
        const balanceMetrics = covariates.map(c => {
          const cVals = data.map(row => parseFloat(row[c]));
          const meanTreatedC = treatedIdx.reduce((sum: number, idx: number) => sum + (cVals[idx] ?? 0), 0) / treatedIdx.length;
          const meanControlC = controlIdx.reduce((sum: number, idx: number) => sum + (cVals[idx] ?? 0), 0) / controlIdx.length;
          const meanMatchedC = matchedControlIdx.reduce((sum: number, idx: number) => sum + (cVals[idx] ?? 0), 0) / matchedControlIdx.length;

          const rawDiff = meanTreatedC - meanControlC;
          const matchedDiff = meanTreatedC - meanMatchedC;

          return {
            covariate: c,
            treatedMean: meanTreatedC,
            controlUnmatched: meanControlC,
            controlMatched: meanMatchedC,
            rawDiff,
            matchedDiff,
            biasReductionPct: Math.max(0, Math.min(100, (1 - Math.abs(matchedDiff) / (Math.abs(rawDiff) || 1)) * 100))
          };
        });

        setResults({
          treatVar,
          outcomeVar,
          n_treated: treatedIdx.length,
          n_control: controlIdx.length,
          att,
          attSe,
          attTStat,
          unmatchedDiff,
          densityData,
          balanceMetrics
        });

        setActiveTab('att');
      } catch (err: any) {
        alert(err.message || "Estimation failed during Causal Propensity calculation.");
      } finally {
        setIsRunning(false);
      }
    }, 600);
  };

  return (
    <div id="treatment-effects-lab" className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700">
      <ModuleIntroCard 
        title="Treatment Effects & Matching"
        description="Extract true causal impacts from observational data. Propensity Score Matching (PSM) constructs synthetic control groups to balance confounding covariates, simulating clinical randomized trials."
        useWhen="You want to estimate the causal impact of a policy, program, or training session without a randomized control experiment."
        requires={["A binary treatment indicator (0 or 1)", "A continuous outcome of interest (Y)", "Multiple observable confounding covariates (X)"]}
        youWillGet={["Average Treatment Effect on the Treated (ATT)", "Matched propensity score densities", "Common Support overlaps", "Covariate Balance checks"]}
        pitfalls={["Omitted selection-on-unobservables (hidden bias)", "Lack of Common Support overlapping ranges", "Over-matching leading to structural degrees of freedom inflation"]}
        example="ATT = E[Y(1) - Y(0) | T = 1]"
      />

      {!activeDataset ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4 max-w-xl mx-auto">
          <Scale className="w-12 h-12 text-indigo-500 mx-auto animate-pulse" />
          <h3 className="text-lg font-serif font-bold text-stone-900">Active Dataset Required</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Please load an active dataset from the Data module or click below to automatically load the Master Econometrics sample panel.
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
          {results && (
            <div className="flex bg-stone-100 p-1 rounded-xl w-full sm:w-fit mx-auto overflow-x-auto custom-scrollbar">
              {[
                { id: 'estimation', label: '1. Causal Spec', icon: Binary },
                { id: 'att', label: '2. Causal ATT Output', icon: Scale },
                { id: 'overlap', label: '3. Common Support Overlap', icon: AreaChart },
                { id: 'balance', label: '4. Covariate Balance Check', icon: LayoutGrid },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex-1 sm:flex-initial whitespace-nowrap justify-center sm:justify-start ${
                    activeTab === tab.id ? "bg-white text-indigo-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'estimation' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form card */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">Causal Parameters</h3>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700">Treatment Indicator (D)</label>
                    <p className="text-[10px] text-stone-400">Must be binary (0/1). Example: policy index, training.</p>
                    <select
                      value={treatVar}
                      onChange={(e) => setTreatVar(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {numericVariables.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700">Causal Outcome (Y)</label>
                    <select
                      value={outcomeVar}
                      onChange={(e) => setOutcomeVar(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {numericVariables.filter(v => v !== treatVar).map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700">Confounding Covariates (X)</label>
                    <p className="text-[10px] text-stone-400">Used to balance Treated and Control traits.</p>
                    <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border border-stone-100 p-3 rounded-xl bg-stone-50">
                      {numericVariables.filter(v => v !== treatVar && v !== outcomeVar).map(v => (
                        <label key={v} className="flex items-center gap-2 p-1.5 rounded hover:bg-stone-100 cursor-pointer text-xs text-stone-600 font-medium">
                          <input
                            type="checkbox"
                            checked={covariates.includes(v)}
                            onChange={() => handleToggleCov(v)}
                            className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                          />
                          {v}
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleEstimateCausal}
                    disabled={isRunning || !treatVar || !outcomeVar || covariates.length === 0}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Matching propensity...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" /> Run Causal Matching
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Guide card */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
                  <h4 className="text-lg font-serif font-bold text-stone-900">Propensity Score Matching (PSM) and ATT</h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    When estimating the causal impact of training or policies, simple OLS is often biased due to self-selection (e.g. motivated people are more likely to apply for training AND have higher wages regardless). This is called **selection bias**.
                  </p>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    PSM corrects this by estimating a Logistic probability of entering treatment for each subject (the **Propensity Score**). We then match each treated subject with a control subject having an almost identical score. This balances all observed traits, so that the mean difference in their outcomes represents the true **Average Treatment Effect on the Treated (ATT)**.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'att' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
              <div className="border-b border-stone-100 pb-4 flex justify-between items-center">
                <div>
                  <h4 className="text-lg font-serif font-bold text-stone-900">Average Treatment Effect on the Treated (ATT)</h4>
                  <p className="text-xs text-stone-500 font-mono mt-1">Outcome: {results.outcomeVar} | Treatment: {results.treatVar}</p>
                </div>
                <div className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-700">
                  N (Treated): {results.n_treated} | N (Control): {results.n_control}
                </div>
              </div>

              {/* Estimate display */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                <div className="bg-stone-50 border border-stone-100 p-6 rounded-xl text-center space-y-2">
                  <span className="text-[10px] font-mono font-bold uppercase text-stone-400 block">Propensity Score Matched ATT</span>
                  <div className="text-3xl font-mono font-black text-indigo-600">
                    {results.att >= 0 ? '+' : ''}{results.att.toFixed(4)}
                  </div>
                  <div className="text-[11px] text-stone-500 font-mono">
                    SE: {results.attSe.toFixed(4)} | t-stat: {results.attTStat.toFixed(2)}
                  </div>
                </div>

                <div className="bg-stone-50 border border-stone-100 p-6 rounded-xl text-center space-y-2">
                  <span className="text-[10px] font-mono font-bold uppercase text-stone-400 block">Raw Unmatched Mean Difference</span>
                  <div className="text-3xl font-mono font-black text-stone-500">
                    {results.unmatchedDiff >= 0 ? '+' : ''}{results.unmatchedDiff.toFixed(4)}
                  </div>
                  <div className="text-[11px] text-stone-400 font-serif">
                    Unadjusted comparison of Treated vs. Control means (contains selection bias).
                  </div>
                </div>
              </div>

              {/* Scholastic interpretation */}
              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4 text-indigo-600" />
                  <h5 className="text-xs font-bold text-indigo-900 font-mono uppercase tracking-wider">Causal Translation</h5>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed font-serif italic">
                  {Math.abs(results.unmatchedDiff - results.att) > 0.01 ? (
                    `Note the difference between the raw gap of ${results.unmatchedDiff.toFixed(3)} and the balanced matched ATT of ${results.att.toFixed(3)}. The unmatched comparison was biased due to confounding covariate traits. By matching treated subjects to control subjects with equivalent propensity scores, we isolated a true causal treatment effect of ${results.att.toFixed(3)} units.`
                  ) : (
                    `The matched ATT is ${results.att.toFixed(3)} units. This represents the average change in the outcome variable ${results.outcomeVar} that can be directly attributed to the treatment, under the assumption that we have balanced all observable confounders.`
                  )}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'overlap' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
              <h4 className="text-lg font-serif font-bold text-stone-900">Common Support Overlap Check</h4>
              <p className="text-xs text-stone-600 font-serif leading-relaxed">
                The chart below plots the density distribution of estimated propensity scores for both Treated and Control groups. For causal matching to be valid, we require **Common Support**: there must be overlapping propensity score ranges between Treated and Control subjects.
              </p>

              <div className="h-72 border border-stone-100 p-4 rounded-xl bg-stone-50/50">
                <ResponsiveContainer width="100%" height="100%">
                  <RecAreaChart data={results.densityData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis dataKey="binName" stroke="#888" label={{ value: 'Estimated Propensity Score', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#666' }} style={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <YAxis stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                    <Tooltip contentStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Area type="monotone" dataKey="Treated" fill="#4f46e5" stroke="#4f46e5" fillOpacity={0.2} name="Treated density distribution" />
                    <Area type="monotone" dataKey="Control" fill="#06b6d4" stroke="#06b6d4" fillOpacity={0.2} name="Control density distribution" />
                  </RecAreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {activeTab === 'balance' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
              <h4 className="text-lg font-serif font-bold text-stone-900">Covariate Balance Check (Bias Reduction Table)</h4>
              <p className="text-xs text-stone-600 font-serif leading-relaxed">
                The goal of propensity score matching is to ensure that Treated and Control units are balanced. The table below compares the mean values of each covariate before and after matching. If matching worked, the difference should be substantially reduced.
              </p>

              <div className="overflow-x-auto border border-stone-100 rounded-xl">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-stone-50 text-stone-500 uppercase text-[10px] border-b border-stone-100">
                      <th className="p-4 font-bold">Covariate</th>
                      <th className="p-4 font-bold text-right">Treated Mean</th>
                      <th className="p-4 font-bold text-right">Control Mean (Unmatched)</th>
                      <th className="p-4 font-bold text-right">Control Mean (Matched)</th>
                      <th className="p-4 font-bold text-right">Raw Diff</th>
                      <th className="p-4 font-bold text-right">Matched Diff</th>
                      <th className="p-4 font-bold text-center">Bias Reduction</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {results.balanceMetrics.map((row: any) => (
                      <tr key={row.covariate} className="hover:bg-stone-50">
                        <td className="p-4 font-bold text-stone-900">{row.covariate}</td>
                        <td className="p-4 text-right text-stone-700">{row.treatedMean.toFixed(3)}</td>
                        <td className="p-4 text-right text-stone-500">{row.controlUnmatched.toFixed(3)}</td>
                        <td className="p-4 text-right text-indigo-700 font-bold">{row.controlMatched.toFixed(3)}</td>
                        <td className="p-4 text-right text-stone-500">{row.rawDiff.toFixed(3)}</td>
                        <td className="p-4 text-right font-bold text-indigo-600">{row.matchedDiff.toFixed(3)}</td>
                        <td className="p-4 text-center font-bold text-emerald-600 bg-emerald-50/50">
                          {row.biasReductionPct.toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
