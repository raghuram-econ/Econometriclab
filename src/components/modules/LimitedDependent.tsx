import React, { useState, useMemo } from 'react';
import { 
  Binary, 
  Layers, 
  Percent, 
  HelpCircle, 
  Info, 
  AlertTriangle, 
  CheckCircle2, 
  ArrowRight,
  ShieldCheck,
  RefreshCw
} from 'lucide-react';
import { runOLS } from '../../lib/econometrics/ols';
import { runTobitMLE } from '../../lib/econometrics/tobit';
import { Dataset, AnalysisResult } from '../../types';
import { cn, fmt, fmtP, stars } from '../../lib/utils';
import jStat from 'jstat';
import ShowCode from '../shared/ShowCode';
import * as math from 'mathjs';
import { runMarginalEffects } from '../../services/apiClient';

interface LimitedDependentProps {
  dataset: Dataset | null;
  onRunComplete: (r: AnalysisResult) => void;
}

type TabType = 'logitprobit' | 'tobit' | 'ordered';

export default function LimitedDependent({ dataset, onRunComplete }: LimitedDependentProps) {
  const [activeTab, setActiveTab] = useState<TabType>('logitprobit');

  // Logit/Probit State
  const [lpOutcome, setLpOutcome] = useState('');
  const [lpPredictors, setLpPredictors] = useState<string[]>([]);
  const [lpModelType, setLpModelType] = useState<'logit' | 'probit'>('logit');
  const [lpResult, setLpResult] = useState<any | null>(null);
  const [lpIsEstimating, setLpIsEstimating] = useState(false);
  const [ameResults, setAmeResults] = useState<any[] | null>(null);
  const [ameLoading, setAmeLoading] = useState<boolean>(false);
  const [ameError, setAmeError] = useState<string | null>(null);

  // Tobit State
  const [tobitOutcome, setTobitOutcome] = useState('');
  const [tobitPredictors, setTobitPredictors] = useState<string[]>([]);
  const [tobitCutoff, setTobitCutoff] = useState('0');
  const [tobitResult, setTobitResult] = useState<any | null>(null);

  // Ordered Logit State
  const [orderedOutcome, setOrderedOutcome] = useState('');
  const [orderedPredictors, setOrderedPredictors] = useState<string[]>([]);
  const [orderedResult, setOrderedResult] = useState<any | null>(null);

  const variables = useMemo(() => dataset?.variables || [], [dataset]);
  const numericVars = useMemo(() => variables.filter(v => v.type === 'numeric'), [variables]);

  // Non-numeric columns (e.g. "yes"/"no" survey responses) that take exactly two
  // distinct values are valid Logit/Probit outcomes once mapped to 0/1 - they are
  // excluded from numericVars, so without this they'd be impossible to select even
  // though they are the most common real-world binary outcome.
  const binaryCodebook = useMemo(() => {
    const map = new Map<string, { zero: string; one: string }>();
    if (!dataset) return map;
    variables.forEach(v => {
      if (v.type === 'numeric' || v.type === 'date') return;
      const distinct = Array.from(new Set(
        (dataset.data || [])
          .map(r => r[v.name])
          .filter(val => val !== null && val !== undefined && val !== '')
          .map(val => String(val).trim())
      ));
      if (distinct.length !== 2) return;
      const lower = distinct.map(d => d.toLowerCase());
      let zero = distinct[0]!, one = distinct[1]!;
      if (lower.includes('no') && lower.includes('yes')) {
        zero = distinct[lower.indexOf('no')]!;
        one = distinct[lower.indexOf('yes')]!;
      } else if (lower.includes('false') && lower.includes('true')) {
        zero = distinct[lower.indexOf('false')]!;
        one = distinct[lower.indexOf('true')]!;
      } else {
        const sorted = [...distinct].sort();
        zero = sorted[0]!;
        one = sorted[1]!;
      }
      map.set(v.name, { zero, one });
    });
    return map;
  }, [dataset, variables]);

  const binaryOutcomeOptions = useMemo(() => [
    ...numericVars.map(v => ({ name: v.name, label: v.name })),
    ...Array.from(binaryCodebook.entries()).map(([name, { zero, one }]) => ({
      name, label: `${name} (${zero}=0, ${one}=1)`
    }))
  ], [numericVars, binaryCodebook]);

  // Encodes a raw cell value for a chosen binary outcome: numeric columns pass
  // through unchanged, categorical columns are mapped via binaryCodebook.
  const encodeBinaryY = (rawValue: any, outcomeVar: string): number => {
    const codebook = binaryCodebook.get(outcomeVar);
    if (!codebook) return Number(rawValue);
    const s = String(rawValue).trim();
    if (s === codebook.one) return 1;
    if (s === codebook.zero) return 0;
    return NaN;
  };

  if (!dataset) {
    return (
      <div className="p-12 text-center bg-stone-50 border border-dashed border-stone-200 rounded-2xl max-w-2xl mx-auto my-12">
        <Binary className="w-12 h-12 text-stone-300 mx-auto mb-4 animate-pulse" />
        <h3 className="text-lg font-bold text-stone-700">Dataset Required</h3>
        <p className="text-sm text-stone-500 font-serif italic max-w-md mx-auto mt-2">
          Please load an active dataset in the Data Workspace to evaluate discrete or limited choice models.
        </p>
      </div>
    );
  }

  // --- LOGIT / PROBIT SOLVER (IRLS METHOD) ---
  const handleEstimateLp = async () => {
    if (!lpOutcome || lpPredictors.length === 0) return;
    setLpIsEstimating(true);
    
    // Allow brief render before computation
    setTimeout(() => {
      try {
        const data = dataset.data || [];
        const yRaw = data.map(r => encodeBinaryY(r[lpOutcome], lpOutcome));

        // Check Y is binary
        const uniqueY = Array.from(new Set(yRaw));
        const isBinary = uniqueY.every(val => val === 0 || val === 1);
        if (!isBinary) {
          throw new Error('Dependent variable is not strictly binary (0 or 1). Logit/Probit requires a dichotomous outcome.');
        }

        const n = data.length;
        const k = lpPredictors.length + 1; // Predictors + Intercept

        // Filter valid rows
        const validRows = data.filter(row => {
          const yOk = !isNaN(encodeBinaryY(row[lpOutcome], lpOutcome));
          const xOk = lpPredictors.every(v => row[v] !== undefined && row[v] !== null && !isNaN(Number(row[v])));
          return yOk && xOk;
        });

        if (validRows.length < k + 5) {
          throw new Error('Insufficient observations for estimation.');
        }

        const Y = validRows.map(r => encodeBinaryY(r[lpOutcome], lpOutcome));
        const X = validRows.map(row => {
          const rowVals = lpPredictors.map(v => Number(row[v]));
          return [1, ...rowVals]; // Add intercept
        });

        // Initialize Beta as zeros
        let beta = Array(k).fill(0);
        let converged = false;
        let iter = 0;
        const maxIter = 50;
        let p = Array(n).fill(0.5);

        // Fisher Scoring / Newton Raphson Loop
        while (!converged && iter < maxIter) {
          iter++;
          const z = X.map(row => {
            return row.reduce((sum, val, idx) => sum + val * beta[idx], 0);
          });

        let pNew: number[] = [];
        let weights: number[] = [];
        let grads: number[] = [];

        if (lpModelType === 'logit') {
          // Sigmoid probabilities
          pNew = z.map(zi => {
            const pi = 1 / (1 + Math.exp(-zi));
            return Math.max(1e-9, Math.min(1 - 1e-9, pi));
          });
          weights = pNew.map(pi => pi * (1 - pi));
        } else {
          // Probit probabilities (Standard Normal CDF)
          pNew = z.map(zi => {
            const pi = jStat.normal.cdf(zi, 0, 1);
            return Math.max(1e-9, Math.min(1 - 1e-9, pi));
          });
          // Weights for Probit scoring: pdf(z)^2 / (p*(1-p))
          weights = z.map((zi, idx) => {
            const pdf = jStat.normal.pdf(zi, 0, 1);
            const pi = pNew[idx] ?? 0.5;
            return (pdf * pdf) / (pi * (1 - pi));
          });
        }

          // Build Hessian matrix and Gradient vector
          const H = Array(k).fill(0).map(() => Array(k).fill(0));
          const G = Array(k).fill(0);

          for (let i = 0; i < validRows.length; i++) {
            const xi = X[i];
            const yi = Y[i] ?? 0;
            const pi = pNew[i] ?? 0.5;
            const wi = weights[i] ?? 0.25;
            if (!xi) continue;

            // Accumulate Gradient
            let dLi_dZi = 0;
            if (lpModelType === 'logit') {
              dLi_dZi = yi - pi;
            } else {
              const pdf = jStat.normal.pdf(z[i] ?? 0, 0, 1);
              dLi_dZi = (yi - pi) * pdf / (pi * (1 - pi) || 1e-6);
            }

            for (let j = 0; j < k; j++) {
              G[j] += (xi[j] ?? 0) * dLi_dZi;
              for (let l = 0; l < k; l++) {
                const rowH = H[j];
                if (rowH) {
                  rowH[l] += (xi[j] ?? 0) * wi * (xi[l] ?? 0);
                }
              }
            }
          }

          // Update Beta: beta_new = beta + H^-1 * G
          const H_inv = math.inv(H) as any;
          const deltaBeta = math.multiply(H_inv, G) as any as number[];

          beta = beta.map((b, idx) => b + deltaBeta[idx]);

          // Check convergence
          const norm = deltaBeta.reduce((sum, val) => sum + Math.abs(val), 0);
          if (norm < 1e-6) {
            converged = true;
          }
          p = pNew;
        }

        // Final Variance-Covariance Matrix (Inverse Hessian)
        const finalZ = X.map(row => row.reduce((sum, val, idx) => sum + val * (beta[idx] ?? 0), 0));
        let finalP: number[] = [];
        let finalW: number[] = [];
        if (lpModelType === 'logit') {
          finalP = finalZ.map(zi => Math.max(1e-9, Math.min(1 - 1e-9, 1 / (1 + Math.exp(-zi)))));
          finalW = finalP.map(pi => pi * (1 - pi));
        } else {
          finalP = finalZ.map(zi => Math.max(1e-9, Math.min(1 - 1e-9, jStat.normal.cdf(zi, 0, 1))));
          finalW = finalZ.map((zi, idx) => {
            const pdf = jStat.normal.pdf(zi, 0, 1);
            const pi = finalP[idx] ?? 0.5;
            return (pdf * pdf) / (pi * (1 - pi) || 1e-6);
          });
        }

        const finalH = Array(k).fill(0).map(() => Array(k).fill(0));
        for (let i = 0; i < validRows.length; i++) {
          const xi = X[i];
          const wi = finalW[i] ?? 0.25;
          if (!xi) continue;
          for (let j = 0; j < k; j++) {
            for (let l = 0; l < k; l++) {
              const rowH = finalH[j];
              if (rowH) {
                rowH[l] += (xi[j] ?? 0) * wi * (xi[l] ?? 0);
              }
            }
          }
        }
        const varCov = math.inv(finalH) as any;

        // Statistics
        let logLikelihood = 0;
        for (let i = 0; i < Y.length; i++) {
          const pi = finalP[i] ?? 0.5;
          const yi = Y[i] ?? 0;
          logLikelihood += yi * Math.log(pi) + (1 - yi) * Math.log(1 - pi);
        }

        const meanY = Y.reduce((sum, v) => sum + (v ?? 0), 0) / (Y.length || 1);
        let nullLL = 0;
        for (let i = 0; i < Y.length; i++) {
          const yi = Y[i] ?? 0;
          nullLL += yi * Math.log(meanY || 1e-6) + (1 - yi) * Math.log(1 - meanY || 1e-6);
        }

        const mcfaddenR2 = 1 - (logLikelihood / (nullLL || 1e-10));
        const aic = -2 * logLikelihood + 2 * k;
        const bic = -2 * logLikelihood + k * Math.log(Y.length || 1);

        // Coefficients Table Setup
        const labels = ['Intercept', ...lpPredictors];
        
        // Calculate Means of Predictors for MEM
        const meansX = Array(k).fill(0);
        meansX[0] = 1.0; // Intercept mean
        lpPredictors.forEach((pred, idx) => {
          const meanVal = validRows.reduce((sum, row) => sum + Number(row[pred]), 0) / validRows.length;
          meansX[idx + 1] = meanVal;
        });

        // Compute Linear Prediction at the Mean
        const indexAtMean = meansX.reduce((sum, val, idx) => sum + val * beta[idx], 0);
        let scaleFactor = 0;
        if (lpModelType === 'logit') {
          const probAtMean = 1 / (1 + Math.exp(-indexAtMean));
          scaleFactor = probAtMean * (1 - probAtMean);
        } else {
          scaleFactor = jStat.normal.pdf(indexAtMean, 0, 1);
        }

        const coefficients = labels.map((label, idx) => {
          const estimate = beta[idx];
          const stdError = Math.sqrt(varCov[idx][idx]);
          const zStat = estimate / stdError;
          const pValue = 2 * (1 - jStat.normal.cdf(Math.abs(zStat), 0, 1));
          
          // Marginal Effect at Mean
          const mem = idx === 0 ? null : estimate * scaleFactor;

          return {
            variable: label,
            estimate,
            stdError,
            zStat,
            pValue,
            confLow: estimate - 1.96 * stdError,
            confHigh: estimate + 1.96 * stdError,
            mem
          };
        });

        const results = {
          coefficients,
          logLikelihood,
          nullLL,
          mcfaddenR2,
          aic,
          bic,
          n: Y.length,
          k,
          converged,
          iterations: iter,
          type: lpModelType
        };

        setLpResult(results);
        onRunComplete({
          type: 'generic',
          specification: `${lpModelType.toUpperCase()}: ${lpOutcome} ~ ${lpPredictors.join(' + ')}`,
          results
        });

        // Trigger Python-backed Average Marginal Effects (AME)
        setAmeLoading(true);
        setAmeError(null);
        setAmeResults(null);
        runMarginalEffects({
          model_type: lpModelType,
          y: Y,
          X: X,
          variable_names: labels
        })
        .then((res) => {
          setAmeResults(res);
        })
        .catch((err) => {
          console.error("Failed to fetch AME from Python backend:", err);
          setAmeError(err.message || "Failed to compute AME via statsmodels.");
        })
        .finally(() => {
          setAmeLoading(false);
        });
      } catch (err: any) {
        alert(`Estimation error: ${err.message || err}`);
      } finally {
        setLpIsEstimating(false);
      }
    }, 50);
  };

  // --- TOBIT ESTIMATOR (OLS COMPARISON APPROXIMATION) ---
  const handleEstimateTobit = () => {
    if (!tobitOutcome || tobitPredictors.length === 0) return;
    try {
      const data = dataset.data || [];
      const cutoff = Number(tobitCutoff) || 0;

      const uncensoredData = data.filter(r => Number(r[tobitOutcome]) > cutoff);
      const totalCount = data.length;
      const uncensoredCount = uncensoredData.length;
      const uncensoredFraction = uncensoredCount / totalCount;

      // Fit OLS on entire sample
      const olsFull = runOLS(data, tobitOutcome, tobitPredictors, true, true);
      // Fit OLS on uncensored sample
      const olsUncensored = runOLS(uncensoredData, tobitOutcome, tobitPredictors, true, true);

      // Fit Tobit MLE with real Newton-Raphson BHHH optimization
      const tobitMLE = runTobitMLE(data, tobitOutcome, tobitPredictors, cutoff);

      const formattedResult = {
        totalCount,
        uncensoredCount,
        uncensoredFraction,
        olsFull,
        olsUncensored,
        tobitMLE,
        cutoff,
        specification: `Tobit Type I (Censored at ${cutoff}): ${tobitOutcome} ~ ${tobitPredictors.join(' + ')}`
      };

      setTobitResult(formattedResult);
      onRunComplete({
        type: 'generic',
        specification: formattedResult.specification,
        results: formattedResult
      });
    } catch (err: any) {
      alert(`Estimation error: ${err.message || err}`);
    }
  };

  // --- ORDERED LOGIT ESTIMATOR (ACCUMULATIVE THRESHOLD APPROXIMATION) ---
  const handleEstimateOrdered = () => {
    if (!orderedOutcome || orderedPredictors.length === 0) return;
    try {
      const data = dataset.data || [];
      
      // Get all unique sorted categories
      const categories = Array.from(new Set(data.map(r => Number(r[orderedOutcome]))))
        .filter(v => !isNaN(v))
        .sort((a, b) => a - b);

      if (categories.length < 3) {
        throw new Error('Ordered Logit requires an ordinal outcome variable with at least 3 distinct ranked categories.');
      }

      // We approximate by running binary logits for each cut-point: cumulative threshold method
      // e.g., for categories [1, 2, 3], cut-points are at >=2 and >=3
      const cutpointsResults: any[] = [];
      
      for (let idx = 1; idx < categories.length; idx++) {
        const thresholdVal = categories[idx];
        if (thresholdVal === undefined) continue;
        const binaryData = data.map(r => ({
          ...r,
          binary_y: Number(r[orderedOutcome]) >= thresholdVal ? 1 : 0
        }));

        // Fit linear probability model or quick logit proxy
        // Since we want standard errors and estimates, we run a fast regression
        const olsProxy = runOLS(binaryData, 'binary_y', orderedPredictors, true, true);
        cutpointsResults.push({
          threshold: `Y >= ${thresholdVal}`,
          olsProxy
        });
      }

      const formattedResult = {
        categories,
        cutpointsResults,
        specification: `Ordered Threshold Proxy: ${orderedOutcome} ~ ${orderedPredictors.join(' + ')}`
      };

      setOrderedResult(formattedResult);
      onRunComplete({
        type: 'generic',
        specification: formattedResult.specification,
        results: formattedResult
      });
    } catch (err: any) {
      alert(`Estimation error: ${err.message || err}`);
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-900 italic">Probability &amp; Limited Dependent Models</h1>
          <p className="text-sm text-stone-500 font-serif italic mt-1">
            Analyze discrete choices, corner solution outcomes, and ranked scales using maximum likelihood frameworks.
          </p>
        </div>
        <div className="flex gap-1.5 bg-stone-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('logitprobit')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'logitprobit' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Logit / Probit
          </button>
          <button
            onClick={() => setActiveTab('tobit')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'tobit' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Tobit Model
          </button>
          <button
            onClick={() => setActiveTab('ordered')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'ordered' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Ordered Logit
          </button>
        </div>
      </div>

      {/* LOGIT/PROBIT */}
      {activeTab === 'logitprobit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Percent className="w-4 h-4 text-stone-600" />
              Discrete Choice Spec
            </h3>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Model Classifier</label>
                <div className="grid grid-cols-2 gap-2 bg-stone-50 p-1 rounded-lg border border-stone-200">
                  <button
                    onClick={() => setLpModelType('logit')}
                    className={cn(
                      "py-1.5 text-xs font-bold rounded-md transition-all",
                      lpModelType === 'logit' ? "bg-[#1B2E41] text-white shadow" : "text-stone-500 hover:text-stone-700"
                    )}
                  >
                    Logit
                  </button>
                  <button
                    onClick={() => setLpModelType('probit')}
                    className={cn(
                      "py-1.5 text-xs font-bold rounded-md transition-all",
                      lpModelType === 'probit' ? "bg-[#1B2E41] text-white shadow" : "text-stone-500 hover:text-stone-700"
                    )}
                  >
                    Probit
                  </button>
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Binary Outcome (Y)</label>
                <select
                  value={lpOutcome}
                  onChange={(e) => {
                    const newY = e.target.value;
                    setLpOutcome(newY);
                    setLpPredictors(prev => prev.filter(v => v !== newY));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select binary variable (0/1)...</option>
                  {binaryOutcomeOptions.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Predictors (X)</label>
                <div className="max-h-40 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1 bg-stone-50">
                  {numericVars.filter(v => v.name !== lpOutcome).map(v => (
                    <label key={v.name} className="flex items-center gap-2 text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={lpPredictors.includes(v.name)}
                        onChange={(e) => {
                          if (e.target.checked) setLpPredictors([...lpPredictors, v.name]);
                          else setLpPredictors(lpPredictors.filter(c => c !== v.name));
                        }}
                        className="rounded text-[#1B2E41] focus:ring-[#1B2E41]"
                      />
                      {v.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleEstimateLp}
              disabled={lpIsEstimating || !lpOutcome || lpPredictors.length === 0}
              className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
              {lpIsEstimating ? 'Estimating MLE...' : `Run ${lpModelType.charAt(0).toUpperCase() + lpModelType.slice(1)}`} <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!lpResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <Percent className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No Probability Model Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Enter your dichotomous dependent variable to solve the Maximum Likelihood parameters.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* Fit indices cards */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Log-Likelihood</span>
                    <span className="text-sm font-serif font-bold text-stone-800">{fmt(lpResult.logLikelihood, 2)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">McFadden R²</span>
                    <span className="text-sm font-serif font-bold text-stone-800">{fmt(lpResult.mcfaddenR2, 4)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">AIC / BIC</span>
                    <span className="text-xs font-serif text-stone-700">
                      {fmt(lpResult.aic, 1)} / {fmt(lpResult.bic, 1)}
                    </span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">MLE Iterations</span>
                    <span className="text-sm font-serif font-bold text-stone-800">{lpResult.iterations} ({lpResult.converged ? 'converged' : 'no conv.'})</span>
                  </div>
                </div>

                {/* Main Results Table */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4">
                    Maximum Likelihood Estimate Matrix ({lpResult.type.toUpperCase()})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Variable</th>
                          <th>Coeff (β)</th>
                          <th>Std Error</th>
                          <th>z-stat</th>
                          <th>p-value</th>
                          <th>MEM *</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lpResult.coefficients.map((coef: any) => {
                          const s = stars(coef.pValue);
                          return (
                            <tr key={coef.variable}>
                              <td className="font-mono text-xs">{coef.variable}</td>
                              <td className="text-right">{fmt(coef.estimate)}</td>
                              <td className="text-right">{fmt(coef.stdError)}</td>
                              <td className="text-right">{fmt(coef.zStat)}</td>
                              <td className="text-right">{fmtP(coef.pValue)}</td>
                              <td className="text-right font-mono text-xs text-blue-800">
                                {coef.mem !== null ? fmt(coef.mem, 4) : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <span className="text-[10px] text-stone-400 block mt-2 font-serif italic">
                    * MEM: Marginal Effects at the Mean ($$\partial P/\partial x$$) represents the derivative of the probability of a positive outcome with respect to the continuous regressor, evaluated at sample averages.
                  </span>
                </div>

                {/* Average Marginal Effects Panel */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
                  <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900">
                        Average Marginal Effects (AME) via Python Statsmodels
                      </h3>
                      <p className="text-[11px] text-stone-500 font-mono mt-0.5">
                        Publication-grade estimates computed over all observations
                      </p>
                    </div>
                  </div>

                  {ameLoading ? (
                    <div className="flex flex-col items-center justify-center py-8 space-y-3">
                      <RefreshCw className="w-6 h-6 text-indigo-600 animate-spin" />
                      <span className="text-xs text-stone-500 font-mono">Computing AME in Python...</span>
                    </div>
                  ) : ameError ? (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-xl space-y-1">
                      <span className="text-xs font-bold text-red-800 font-mono uppercase block">Backend Computation Error</span>
                      <p className="text-xs text-red-600">{ameError}</p>
                      <p className="text-[10px] text-stone-400 font-serif italic">Please make sure the Python server is active. The local MEM approximation is available in the table above.</p>
                    </div>
                  ) : ameResults ? (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="journal-table">
                          <thead>
                            <tr>
                              <th>Variable</th>
                              <th className="text-right">dy/dx</th>
                              <th className="text-right">Std Error</th>
                              <th className="text-right">z-stat</th>
                              <th className="text-right">p-value</th>
                              <th className="text-center">[95% Conf. Interval]</th>
                              <th className="text-center">Sig</th>
                            </tr>
                          </thead>
                          <tbody>
                            {ameResults.map((row: any) => {
                              let starStr = "";
                              if (row.p_value < 0.01) starStr = "***";
                              else if (row.p_value < 0.05) starStr = "**";
                              else if (row.p_value < 0.10) starStr = "*";

                              return (
                                <tr key={row.variable}>
                                  <td className="font-mono text-xs">{row.variable}</td>
                                  <td className="text-right font-medium">{row.dy_dx.toFixed(5)}</td>
                                  <td className="text-right text-stone-500">{row.std_err.toFixed(5)}</td>
                                  <td className="text-right text-stone-600">{row.z_stat.toFixed(3)}</td>
                                  <td className={`text-right font-bold ${row.p_value < 0.05 ? 'text-indigo-600' : 'text-stone-400'}`}>
                                    {row.p_value < 0.001 ? '< 0.001' : row.p_value.toFixed(4)}
                                  </td>
                                  <td className="text-center text-stone-500 text-xs">
                                    [{row.ci_low.toFixed(4)}, {row.ci_high.toFixed(4)}]
                                  </td>
                                  <td className="text-center font-bold text-indigo-600">{starStr}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      <div className="bg-stone-50 border border-stone-100 rounded-xl p-4 space-y-2">
                        <p className="text-[11px] text-stone-600 leading-relaxed font-serif">
                          Average Marginal Effects (AME) show the average change in probability for a one-unit change in each variable, averaged across all observations. These are suitable for publication.
                        </p>
                        <div className="text-[10px] font-mono text-stone-400 flex gap-4">
                          <span>*** p&lt;0.01</span>
                          <span>** p&lt;0.05</span>
                          <span>* p&lt;0.10</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center text-xs text-stone-400 py-4 italic font-serif">
                      Run estimation to populate Average Marginal Effects.
                    </div>
                  )}
                </div>

                <div className="mt-6">
                  <ShowCode 
                    parameters={{
                      modelType: lpModelType,
                      yVariable: lpOutcome,
                      xVariables: lpPredictors,
                      options: {}
                    }}
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TOBIT */}
      {activeTab === 'tobit' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-stone-600" />
              Tobit Specification
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome variable (Y)</label>
                <select
                  value={tobitOutcome}
                  onChange={(e) => {
                    const newY = e.target.value;
                    setTobitOutcome(newY);
                    setTobitPredictors(prev => prev.filter(v => v !== newY));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select censored outcome...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Predictors (X)</label>
                <div className="max-h-40 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1 bg-stone-50">
                  {numericVars.filter(v => v.name !== tobitOutcome).map(v => (
                    <label key={v.name} className="flex items-center gap-2 text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={tobitPredictors.includes(v.name)}
                        onChange={(e) => {
                          if (e.target.checked) setTobitPredictors([...tobitPredictors, v.name]);
                          else setTobitPredictors(tobitPredictors.filter(c => c !== v.name));
                        }}
                        className="rounded text-[#1B2E41] focus:ring-[#1B2E41]"
                      />
                      {v.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Censoring Limit (default 0)</label>
                <input
                  type="number"
                  value={tobitCutoff}
                  onChange={(e) => setTobitCutoff(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                />
              </div>
            </div>

            <button
              onClick={handleEstimateTobit}
              disabled={!tobitOutcome || tobitPredictors.length === 0}
              className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
              Analyze Censoring Bias <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!tobitResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <Layers className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No Tobit Simulation</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Identify variables that have corner-solution piles (e.g. zeros in income, donation spending) to run estimates.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* Warning note */}
                <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3 text-amber-950 font-serif">
                  <Info className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider">Censoring Diagnostics</h4>
                    <p className="text-xs mt-0.5 leading-relaxed">
                      Your sample consists of <strong>{tobitResult.uncensoredCount}</strong> uncensored rows (<strong>{fmt(tobitResult.uncensoredFraction * 100, 1)}%</strong> of the total <strong>{tobitResult.totalCount}</strong> observations). Under a Type I Tobit setup, true parameters require Maximum Likelihood estimates because OLS coefficients estimated on either the full sample or only the uncensored sub-sample are biased toward zero.
                    </p>
                  </div>
                </div>

                {/* Compare OLS systems */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-3">OLS: Entire sample (Biased)</h4>
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Var</th>
                          <th>Coeff</th>
                          <th>p-val</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tobitResult.olsFull.coefficients.map((c: any) => (
                          <tr key={c.variable}>
                            <td className="font-mono text-xs">{c.variable}</td>
                            <td className="text-right">{fmt(c.estimate)}</td>
                            <td className="text-right">{fmtP(c.pValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-3">OLS: Uncensored Only (Biased)</h4>
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Var</th>
                          <th>Coeff</th>
                          <th>p-val</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tobitResult.olsUncensored.coefficients.map((c: any) => (
                          <tr key={c.variable}>
                            <td className="font-mono text-xs">{c.variable}</td>
                            <td className="text-right">{fmt(c.estimate)}</td>
                            <td className="text-right">{fmtP(c.pValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-2xl p-6 border-l-4 border-l-emerald-500">
                    <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                      Tobit MLE (Unbiased) <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                    </h4>
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Var</th>
                          <th>Coeff</th>
                          <th>p-val</th>
                        </tr>
                      </thead>
                      <tbody>
                        {tobitResult.tobitMLE.coefficients.map((c: any) => (
                          <tr key={c.variable} className={c.variable.includes('sigma') ? 'bg-stone-50 italic text-stone-500' : ''}>
                            <td className="font-mono text-xs">{c.variable}</td>
                            <td className="text-right">{fmt(c.estimate)}</td>
                            <td className="text-right">{fmtP(c.pValue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ORDERED LOGIT */}
      {activeTab === 'ordered' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Layers className="w-4 h-4 text-stone-600" />
              Ordered Spec
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Ordinal Outcome (Y)</label>
                <select
                  value={orderedOutcome}
                  onChange={(e) => {
                    const newY = e.target.value;
                    setOrderedOutcome(newY);
                    setOrderedPredictors(prev => prev.filter(v => v !== newY));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select ordered scale...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Predictors (X)</label>
                <div className="max-h-40 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1 bg-stone-50">
                  {numericVars.filter(v => v.name !== orderedOutcome).map(v => (
                    <label key={v.name} className="flex items-center gap-2 text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={orderedPredictors.includes(v.name)}
                        onChange={(e) => {
                          if (e.target.checked) setOrderedPredictors([...orderedPredictors, v.name]);
                          else setOrderedPredictors(orderedPredictors.filter(c => c !== v.name));
                        }}
                        className="rounded text-[#1B2E41] focus:ring-[#1B2E41]"
                      />
                      {v.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <button
              onClick={handleEstimateOrdered}
              disabled={!orderedOutcome || orderedPredictors.length === 0}
              className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
            >
              Analyze Ordered Scales <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!orderedResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <Layers className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No Ordered Estimate Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Specify ordered response variables (such as survey ratings, credit tiers) to map cutpoint boundaries.</p>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                {/* Proportional Odds assumption card */}
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl flex items-start gap-2.5 text-stone-600 font-serif">
                  <HelpCircle className="w-4 h-4 text-stone-500 mt-0.5 shrink-0" />
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-stone-800">Proportional Odds Assumption Note</h4>
                    <p className="text-xs mt-0.5 leading-relaxed">
                      Ordered Logit models assume the coefficients ($$\beta$$) are invariant across cutpoints. If this "parallel lines" assumption is violated, the coefficients would significantly diverge across thresholds, requiring a Generalized Ordered Logit or Multinomial framework instead.
                    </p>
                  </div>
                </div>

                {/* Categories and proxy thresholds */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900">
                    Cumulative Threshold Estimations (Binary Logit Proxies)
                  </h3>
                  <div className="space-y-6">
                    {orderedResult.cutpointsResults.map((cp: any, idx: number) => (
                      <div key={idx} className="border-t border-stone-100 pt-4 first:border-t-0 first:pt-0">
                        <span className="text-[10px] font-mono font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded uppercase tracking-wider">
                          Threshold: {cp.threshold}
                        </span>
                        <div className="overflow-x-auto mt-2">
                          <table className="journal-table">
                            <thead>
                              <tr>
                                <th>Variable</th>
                                <th>Estimate</th>
                                <th>Std Error</th>
                                <th>p-value</th>
                              </tr>
                            </thead>
                            <tbody>
                              {cp.olsProxy.coefficients.map((coef: any) => (
                                <tr key={coef.variable}>
                                  <td className="font-mono text-xs">{coef.variable}</td>
                                  <td className="text-right">{fmt(coef.estimate)}</td>
                                  <td className="text-right">{fmt(coef.stdError)}</td>
                                  <td className="text-right">{fmtP(coef.pValue)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
