import React, { useState, useMemo } from 'react';
import { useStore } from '../../store/useStore';
import { generateMasterDataset } from '../../lib/dataGenerators';
import { 
  ridgeRegression, 
  lassoRegression, 
  elasticNet, 
  crossValidateLambda, 
  PenalizedResult 
} from '../../lib/econometrics/penalized';
import ChartsPanel from '../shared/ChartsPanel';
import { 
  Play, 
  FileText, 
  Settings, 
  HelpCircle, 
  RefreshCw, 
  Check, 
  Download, 
  Percent, 
  Eye, 
  Info,
  Sliders,
  TrendingDown,
  ChevronRight
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip as ChartTooltip, 
  Legend, 
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

export default function RegularizationLab() {
  const { currentDataset, setCurrentDataset, addToast } = useStore();

  // Selected state
  const [depVar, setDepVar] = useState<string>('');
  const [indepVars, setIndepVars] = useState<string[]>([]);
  const [method, setMethod] = useState<'ridge' | 'lasso' | 'elasticnet'>('lasso');
  
  // Hyperparameters
  const [lambdaVal, setLambdaVal] = useState<number>(0.1);
  const [isAutoLambda, setIsAutoLambda] = useState<boolean>(true);
  const [alphaVal, setAlphaVal] = useState<number>(0.5); // only for Elastic Net

  // Results State
  const [estimationResults, setEstimationResults] = useState<PenalizedResult | null>(null);
  const [olsResults, setOlsResults] = useState<PenalizedResult | null>(null);
  const [cvResultsData, setCvResultsData] = useState<{ lambda: number; logLambda: number; mse: number }[] | null>(null);
  const [optimalLambda, setOptimalLambda] = useState<number | null>(null);
  const [isEstimating, setIsEstimating] = useState<boolean>(false);
  const [coefficientPath, setCoefficientPath] = useState<any[] | null>(null);

  // Variable List from dataset
  const variableNames = useMemo(() => {
    if (!currentDataset || !currentDataset.data || currentDataset.data.length === 0) return [];
    return Object.keys(currentDataset.data[0]).filter(key => {
      // filters numerical or non-empty strings
      return typeof currentDataset.data[0][key] === 'number' || !isNaN(Number(currentDataset.data[0][key]));
    });
  }, [currentDataset]);

  // Reset selections and clear any prior run's results when the active
  // dataset changes - otherwise depVar/indepVars silently keep referring to
  // columns from the old dataset (invisible in the picker, which only lists
  // the new dataset's columns), and the results table keeps showing the old
  // dataset's numbers under the new "ACTIVE DATA" banner with no indication
  // they're stale, since a failed re-run only shows a transient toast.
  const datasetKey = currentDataset?.name ?? null;
  React.useEffect(() => {
    setDepVar('');
    setIndepVars([]);
    setEstimationResults(null);
    setOlsResults(null);
    setCvResultsData(null);
    setOptimalLambda(null);
    setCoefficientPath(null);
  }, [datasetKey]);

  // Handle variable selection
  const handleIndepToggle = (v: string) => {
    if (indepVars.includes(v)) {
      setIndepVars(indepVars.filter(item => item !== v));
    } else {
      setIndepVars([...indepVars, v]);
    }
  };

  // Run Penalized Estimation
  const handleRunEstimation = () => {
    if (!currentDataset || !currentDataset.data || currentDataset.data.length === 0) {
      addToast('error', 'No dataset available', 'Please upload or select a research dataset first.');
      return;
    }
    if (!depVar) {
      addToast('error', 'Missing Dependent Variable', 'Please select a dependent outcome variable (Y).');
      return;
    }
    if (indepVars.length === 0) {
      addToast('error', 'Missing Covariates', 'Please select at least one independent variable (X).');
      return;
    }

    setIsEstimating(true);

    try {
      // Construct matrices
      const validRows = (currentDataset.data || []).filter(row => {
        const yVal = Number(row[depVar]);
        const xVals = indepVars.map(v => Number(row[v]));
        return !isNaN(yVal) && xVals.every(x => !isNaN(x));
      });

      if (validRows.length < indepVars.length + 2) {
        addToast('error', 'Insufficient Observations', `Found ${validRows.length} valid rows, but need at least ${indepVars.length + 2} to prevent perfect collinearity.`);
        setIsEstimating(false);
        return;
      }

      const y = validRows.map(row => Number(row[depVar]));
      const X = validRows.map(row => indepVars.map(v => Number(row[v])));

      // Run Cross Validation if auto-selected
      let finalLambda = lambdaVal;
      const cvLambdas = [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1.0, 5.0, 10.0, 25.0, 50.0, 100.0];
      
      if (isAutoLambda) {
        const cv = crossValidateLambda(X, y, method, indepVars, cvLambdas, 5, alphaVal);
        finalLambda = cv.bestLambda;
        setOptimalLambda(cv.bestLambda);
        setCvResultsData(cv.cvResults.map(r => ({
          lambda: r.lambda,
          logLambda: Number(Math.log10(r.lambda).toFixed(3)),
          mse: r.mse
        })));
      } else {
        setCvResultsData(null);
        setOptimalLambda(null);
      }

      // Estimate final model
      let result: PenalizedResult;
      const X_with_intercept = validRows.map(row => [1, ...indepVars.map(v => Number(row[v]))]);

      if (method === 'ridge') {
        result = ridgeRegression(X_with_intercept, y, finalLambda, indepVars);
      } else if (method === 'lasso') {
        result = lassoRegression(X, y, finalLambda, indepVars);
      } else {
        result = elasticNet(X, y, finalLambda, alphaVal, indepVars);
      }

      // Generate OLS model for side-by-side comparison (OLS is ridge with lambda = 0)
      const ols = ridgeRegression(X_with_intercept, y, 0, indepVars);

      // Generate Coefficient Path (over 20 log-spaced lambda values)
      const pathLambdas = Array.from({ length: 20 }, (_, i) => {
        return Math.pow(10, -3 + (i / 19) * 5); // 0.001 to 100
      });

      const path = pathLambdas.map(l => {
        let pathModel: PenalizedResult;
        if (method === 'ridge') {
          pathModel = ridgeRegression(X_with_intercept, y, l, indepVars);
        } else if (method === 'lasso') {
          pathModel = lassoRegression(X, y, l, indepVars);
        } else {
          pathModel = elasticNet(X, y, l, alphaVal, indepVars);
        }

        const point: any = {
          lambda: Number(l.toFixed(4)),
          logLambda: Number(Math.log10(l).toFixed(3)),
        };

        pathModel.coefficients.forEach(c => {
          if (c.variable !== 'Intercept') {
            point[c.variable] = Number(c.estimate.toFixed(5));
          }
        });

        return point;
      });

      setEstimationResults(result);
      setOlsResults(ols);
      setCoefficientPath(path);
      addToast('success', `${result.method} Modeled`, `Successfully completed shrinkage estimation using lambda = ${finalLambda.toFixed(4)}.`);
    } catch (err: any) {
      console.error(err);
      addToast('error', 'Estimation Failed', err?.message || 'An error occurred during coordinate descent solving.');
    } finally {
      setIsEstimating(false);
    }
  };

  // Export Results to CSV format
  const handleExportCSV = () => {
    if (!estimationResults) return;
    
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Variable,Regularized Estimate,OLS Estimate,Std Error,t Stat,P Value,CI 95% Low,CI 95% High,Selected\n";
    
    estimationResults.coefficients.forEach(coef => {
      const olsCoef = olsResults?.coefficients.find(c => c.variable === coef.variable);
      const isSelected = coef.variable === 'Intercept' || coef.estimate !== 0 ? "YES" : "NO";
      
      csvContent += `"${coef.variable}",${coef.estimate.toFixed(5)},${olsCoef ? olsCoef.estimate.toFixed(5) : 'N/A'},${coef.stdError.toFixed(5)},${coef.tStat.toFixed(4)},${coef.pValue.toFixed(4)},${coef.confLow.toFixed(5)},${coef.confHigh.toFixed(5)},${isSelected}\n`;
    });

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `penalized_regression_${estimationResults.method}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Color generator for chart paths to ensure unique, beautiful line visualizer
  const chartColors = [
    '#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', 
    '#ec4899', '#06b6d4', '#14b8a6', '#f97316', '#64748b'
  ];

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50">
      {/* Title Panel */}
      <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full blur-3xl" />
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <span className="text-[10px] font-bold font-mono tracking-[0.2em] text-indigo-600 uppercase">Applied Machine Learning Lab</span>
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Regularization Lab — LASSO · Ridge · Elastic Net</h2>
            <p className="text-xs text-slate-500 max-w-2xl font-serif italic">
              Solve collinearity and implement high-dimensional variable selection using coordinate descent algorithms inspired by R's glmnet.
            </p>
          </div>
          <button
            onClick={() => {
              const hasGdpGrowth = currentDataset && currentDataset.data && currentDataset.data.some(row => row.hasOwnProperty('gdp_growth'));
              if (!hasGdpGrowth) {
                // Load Master Econometrics Test Dataset defaults
                const masterData = generateMasterDataset();
                const firstRow = masterData[0];
                if (!firstRow) return;
                const variables = Object.keys(firstRow).map(key => {
                  const val = (firstRow as any)[key];
                  let type: any = 'unknown';
                  if (typeof val === 'number') type = 'numeric';
                  else if (typeof val === 'string') {
                    if (!isNaN(Date.parse(val))) type = 'date';
                    else type = 'categorical';
                  }
                  return { name: key, label: key, type };
                });
                const defaultDataset = {
                  id: 'master-econometrics',
                  name: 'Master Econometrics Test Dataset',
                  description: 'Integrated 10-unit macroeconomic and microeconomic synthetic database.',
                  variables: variables,
                  data: masterData,
                  rowCount: masterData.length,
                  colCount: variables.length,
                  structure: 'panel' as const
                };
                setCurrentDataset(defaultDataset);
                
                // Set defaults based on the loaded dataset immediately
                const vars = Object.keys(firstRow).filter(key => typeof (firstRow as any)[key] === 'number' || !isNaN(Number((firstRow as any)[key])));
                setDepVar('gdp_growth');
                setIndepVars(vars.filter(v => v !== 'gdp_growth' && v !== 'entity_id' && v !== 'year' && v !== 'employment' && v !== 'shock_index').slice(0, 5));
                addToast('success', 'Default Dataset Loaded', 'Loaded "Master Econometrics Test Dataset" as the active database for the Regularization Lab.');
              } else {
                setDepVar('gdp_growth');
                setIndepVars(variableNames.filter(v => v !== 'gdp_growth' && v !== 'entity_id' && v !== 'year' && v !== 'employment' && v !== 'shock_index').slice(0, 5));
              }
              setMethod('lasso');
              setIsAutoLambda(true);
            }}
            className="btn-secondary self-start md:self-center flex items-center gap-1.5 text-xs font-semibold py-2 px-3 border border-slate-200 bg-white hover:bg-slate-50 rounded-lg transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Load Econ Dataset Defaults
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: CONTROLS & SPECIFICATION */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Settings className="w-4 h-4 text-slate-500" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Model Configuration</h3>
          </div>

          {/* Model Selection Tabs */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Shrinkage Estimator</label>
            <div className="grid grid-cols-3 gap-1 bg-slate-100/80 p-1 rounded-xl">
              {(['lasso', 'ridge', 'elasticnet'] as const).map(m => (
                <button
                  key={m}
                  onClick={() => {
                    setMethod(m);
                    if (m === 'ridge') setIsAutoLambda(false); // default ridge to manual lambda to demonstrate specific paths
                  }}
                  className={`py-2 text-[10px] font-bold uppercase font-mono tracking-wider rounded-lg transition-all ${
                    method === m 
                      ? 'bg-white text-indigo-700 shadow-xs' 
                      : 'text-slate-500 hover:text-slate-800 hover:bg-white/40'
                  }`}
                >
                  {m === 'elasticnet' ? 'E-Net' : m}
                </button>
              ))}
            </div>
          </div>

          {/* Variables Picker */}
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">Dependent Outcome (Y)</label>
              <select
                value={depVar}
                onChange={e => {
                  const newY = e.target.value;
                  setDepVar(newY);
                  setIndepVars(indepVars.filter(v => v !== newY));
                }}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 outline-none transition-all"
              >
                <option value="">-- Select Outcome (Y) --</option>
                {variableNames.map(v => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 block">Covariates / Features (X)</label>
              <div className="max-h-48 overflow-y-auto border border-slate-100 rounded-xl bg-slate-50/50 p-2 space-y-1">
                {variableNames.filter(v => v !== depVar).map(v => (
                  <button
                    key={v}
                    onClick={() => handleIndepToggle(v)}
                    className={`w-full flex items-center justify-between px-3 py-1.5 text-left rounded-lg text-xs transition-all ${
                      indepVars.includes(v)
                        ? 'bg-indigo-50 border border-indigo-100 text-indigo-900'
                        : 'border border-transparent text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className="font-mono">{v}</span>
                    {indepVars.includes(v) && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </button>
                ))}
                {variableNames.length === 0 && (
                  <p className="text-xs text-slate-400 italic p-3 text-center">No variables detected. Load or select sample data.</p>
                )}
              </div>
            </div>
          </div>

          {/* Hyperparameter Settings */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <label className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">Complexity Parameter (λ)</label>
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={isAutoLambda}
                  onChange={e => setIsAutoLambda(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500/30 w-3.5 h-3.5"
                />
                <span className="text-[10px] font-bold text-slate-600 font-mono uppercase">Auto (CV)</span>
              </label>
            </div>

            {!isAutoLambda ? (
              <div className="space-y-1.5">
                <input
                  type="number"
                  step="0.01"
                  min="0.0001"
                  max="1000"
                  value={lambdaVal}
                  onChange={e => setLambdaVal(parseFloat(e.target.value) || 0.1)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-400 italic font-serif leading-relaxed">
                  Higher lambda values force stronger parameter shrinkage. Zero yields standard OLS coefficients.
                </p>
              </div>
            ) : (
              <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                <span className="text-[9px] font-bold uppercase font-mono text-indigo-600">Adaptive Penalty Select</span>
                <p className="text-[10px] text-slate-500 leading-normal font-serif">
                  Runs 5-fold cross-validation on a coordinate-descent mesh of 12 candidate lambda values to find the model minimizing Mean Squared Error (MSE).
                </p>
              </div>
            )}

            {method === 'elasticnet' && (
              <div className="space-y-2 pt-2">
                <div className="flex justify-between text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                  <span>L1/L2 Mixing Ratio (α)</span>
                  <span className="text-indigo-600">{alphaVal.toFixed(2)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={alphaVal}
                  onChange={e => setAlphaVal(parseFloat(e.target.value))}
                  className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                />
                <div className="flex justify-between text-[9px] text-slate-400 font-mono">
                  <span>0 (Ridge)</span>
                  <span>0.5 (Symmetric)</span>
                  <span>1 (LASSO)</span>
                </div>
              </div>
            )}
          </div>

          <button
            onClick={handleRunEstimation}
            disabled={isEstimating}
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-3 px-4 rounded-xl shadow-md shadow-indigo-200 text-xs flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            {isEstimating ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                Fitting shrinkage models...
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                Run Shrinkage Estimation
              </>
            )}
          </button>
        </div>

        {/* RIGHT TWO COLUMNS: VISUALIZATIONS & TABULAR DATA */}
        <div className="lg:col-span-2 space-y-6">
          {estimationResults ? (
            <>
              {/* Stat Cards Row */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-400">Best Lambda (λ)</span>
                  <span className="text-lg font-extrabold text-slate-900 font-mono mt-1">
                    {estimationResults.lambda.toFixed(4)}
                  </span>
                  <span className="text-[9px] text-indigo-600 font-semibold mt-0.5 font-mono">Complexity Penalty</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-400">Goodness of Fit (R²)</span>
                  <span className="text-lg font-extrabold text-slate-900 font-mono mt-1">
                    {estimationResults.rSquared.toFixed(4)}
                  </span>
                  <span className="text-[9px] text-emerald-600 font-semibold mt-0.5 font-mono">
                    Adj R²: {estimationResults.adjRSquared.toFixed(4)}
                  </span>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-400">Root MSE (RMSE)</span>
                  <span className="text-lg font-extrabold text-slate-900 font-mono mt-1">
                    {estimationResults.rmse.toFixed(4)}
                  </span>
                  <span className="text-[9px] text-slate-400 mt-0.5 font-serif">Average residual deviance</span>
                </div>

                <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs flex flex-col justify-between">
                  <span className="text-[9px] font-mono font-bold uppercase text-slate-400">Variables Retained</span>
                  <span className="text-lg font-extrabold text-indigo-600 font-mono mt-1">
                    {estimationResults.selectedVars.length} <span className="text-xs font-normal text-slate-400">/ {indepVars.length}</span>
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono mt-0.5">
                    {indepVars.length - estimationResults.selectedVars.length} Zeroed out
                  </span>
                </div>
              </div>

              {/* Dynamic Path Viz & CV charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Coefficient Shrinkage Path */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col">
                  <div className="mb-4">
                    <span className="text-[9px] font-bold font-mono tracking-widest uppercase text-indigo-600">Estimates Shrinkage Path</span>
                    <h4 className="text-xs font-bold text-slate-800">Coefficient Shrinkage vs. Penalty Log(λ)</h4>
                  </div>
                  
                  <div className="h-56 w-full text-xs">
                    {coefficientPath && (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={coefficientPath} margin={{ top: 5, right: 5, left: -25, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="logLambda" 
                            type="number"
                            domain={[-3, 2]}
                            ticks={[-3, -2, -1, 0, 1, 2]}
                            label={{ value: 'Log(Lambda)', position: 'insideBottom', offset: -5, fontStyle: 'italic', fill: '#64748b', fontSize: 10 }}
                            stroke="#94a3b8"
                          />
                          <YAxis stroke="#94a3b8" />
                          <ChartTooltip contentStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                          {indepVars.map((v, idx) => (
                            <Line 
                              key={v} 
                              type="monotone" 
                              dataKey={v} 
                              stroke={chartColors[idx % chartColors.length]} 
                              dot={false}
                              strokeWidth={1.8}
                            />
                          ))}
                          <ReferenceLine x={Math.log10(estimationResults.lambda)} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" />
                        </LineChart>
                      </ResponsiveContainer>
                    )}
                  </div>
                  <div className="text-[9px] text-slate-400 font-serif leading-relaxed mt-2 italic text-center">
                    Red dashed line shows active complexity penalty level λ = {estimationResults.lambda.toFixed(4)}.
                  </div>
                </div>

                {/* Cross-Validation MSE Plot */}
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs flex flex-col">
                  <div className="mb-4">
                    <span className="text-[9px] font-bold font-mono tracking-widest uppercase text-emerald-600">Cross Validation Curve</span>
                    <h4 className="text-xs font-bold text-slate-800">Mean Squared Error vs. Penalty Log(λ)</h4>
                  </div>

                  <div className="h-56 w-full text-xs flex items-center justify-center">
                    {isAutoLambda && cvResultsData ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={cvResultsData} margin={{ top: 5, right: 5, left: -15, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis 
                            dataKey="logLambda" 
                            type="number"
                            domain={[-3, 2]}
                            ticks={[-3, -2, -1, 0, 1, 2]}
                            label={{ value: 'Log(Lambda)', position: 'insideBottom', offset: -5, fontStyle: 'italic', fill: '#64748b', fontSize: 10 }}
                            stroke="#94a3b8"
                          />
                          <YAxis stroke="#94a3b8" />
                          <ChartTooltip contentStyle={{ fontSize: '11px', fontFamily: 'monospace' }} />
                          <Line 
                            type="monotone" 
                            dataKey="mse" 
                            stroke="#10b981" 
                            strokeWidth={2.5}
                            activeDot={{ r: 6 }}
                          />
                          {optimalLambda && (
                            <ReferenceLine x={Math.log10(optimalLambda)} stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" />
                          )}
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="text-center p-8 text-slate-400 italic text-xs font-serif leading-relaxed">
                        Cross-Validation was skipped because lambda was set manually. Enable "Auto (CV)" to view the bias-variance trade-off curve.
                      </div>
                    )}
                  </div>
                  {isAutoLambda && optimalLambda && (
                    <div className="text-[9px] text-slate-400 font-serif leading-relaxed mt-2 italic text-center">
                      Minimum average validation MSE of {cvResultsData?.find(r => r.lambda === optimalLambda)?.mse.toFixed(5)} achieved at λ = {optimalLambda}.
                    </div>
                  )}
                </div>
              </div>

              {/* Economic & Structural Interpretation */}
              <div className="bg-slate-900 text-slate-100 rounded-2xl p-6 shadow-md relative overflow-hidden font-serif">
                <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl" />
                <div className="flex items-center gap-2 text-indigo-400 mb-3 font-mono text-[10px] tracking-widest uppercase">
                  <Info className="w-4 h-4" /> Academic Interpretation Box
                </div>
                
                <h4 className="text-sm font-bold text-white mb-2 leading-snug">
                  {estimationResults.method} Estimation Academic Summary
                </h4>
                
                <div className="text-xs text-slate-300 leading-relaxed space-y-3">
                  <p>
                    Using the {estimationResults.method} shrinkage estimator with complexity penalty parameter &lambda; = {estimationResults.lambda.toFixed(4)}, the model mapped {indepVars.length} independent variable candidates into a regularized space.
                  </p>
                  {estimationResults.method !== 'Ridge' ? (
                    <p>
                      Through l1-penalization, coordinate descent zeroed out <strong className="text-amber-400">{indepVars.length - estimationResults.selectedVars.length}</strong> non-informative covariates, successfully selecting <strong className="text-emerald-400">{estimationResults.selectedVars.length}</strong> variables. 
                      {indepVars.length - estimationResults.selectedVars.length > 0 ? (
                        <span> The removed (zeroed out) variables are: <code className="text-indigo-300 font-mono text-[11px] bg-slate-800 px-1.5 py-0.5 rounded">{indepVars.filter(v => !estimationResults.selectedVars.includes(v)).join(', ')}</code>.</span>
                      ) : (
                        <span> All selected variables were retained at the current complexity threshold.</span>
                      )}
                    </p>
                  ) : (
                    <p>
                      Ridge l2-penalization shrunk all parameters toward zero to stabilize variance and mitigate multicollinearity, but retained all variables in the active set (zeroing out none).
                    </p>
                  )}
                  <p className="italic text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                    Applying standardized priors preserves structural model integrity under severe collinearity which usually breaks OLS estimators.
                  </p>
                </div>
              </div>

              {/* Tabular Output: Coefficients Table */}
              <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-bold font-mono uppercase tracking-widest text-slate-400">Regularization Outputs</span>
                    <h3 className="text-xs font-bold text-slate-800">Shrinkage Estimates vs. Traditional OLS</h3>
                  </div>
                  <button
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 border border-slate-200 hover:bg-slate-50 rounded-lg text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-all shadow-xs"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Export CSV
                  </button>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-mono uppercase tracking-wider text-slate-400">
                        <th className="py-3 px-6">Variable</th>
                        <th className="py-3 px-4 text-right">{estimationResults.method} Estimate</th>
                        <th className="py-3 px-4 text-right">OLS Estimate</th>
                        <th className="py-3 px-4 text-right">Shrinkage (%)</th>
                        <th className="py-3 px-4 text-right">Post-Selection S.E.</th>
                        <th className="py-3 px-4 text-right">t-stat</th>
                        <th className="py-3 px-4 text-right">p-value</th>
                        <th className="py-3 px-4 text-center">Selected</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                      {estimationResults.coefficients.map(coef => {
                        const olsCoef = olsResults?.coefficients.find(c => c.variable === coef.variable);
                        const isSelected = coef.variable === 'Intercept' || coef.estimate !== 0;

                        // Calculate Shrinkage %
                        let shrinkagePct = "—";
                        if (olsCoef && olsCoef.estimate !== 0 && coef.variable !== 'Intercept') {
                          const pct = (1 - (coef.estimate / olsCoef.estimate)) * 100;
                          shrinkagePct = `${pct.toFixed(1)}%`;
                        }

                        return (
                          <tr key={coef.variable} className={`hover:bg-slate-50/50 ${!isSelected ? 'opacity-40 bg-slate-50/30' : ''}`}>
                            <td className="py-3 px-6 font-bold text-slate-900">{coef.variable}</td>
                            <td className="py-3 px-4 text-right font-bold text-indigo-600">
                              {coef.estimate.toFixed(5)}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-400">
                              {olsCoef ? olsCoef.estimate.toFixed(5) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-amber-600 font-semibold">
                              {shrinkagePct}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-500">
                              {isSelected && coef.stdError > 0 ? coef.stdError.toFixed(5) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right text-slate-500">
                              {isSelected && coef.stdError > 0 ? coef.tStat.toFixed(3) : '—'}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {isSelected && coef.stdError > 0 ? (
                                coef.pValue < 0.001 ? (
                                  <span className="text-emerald-600 font-bold">&lt; 0.001</span>
                                ) : (
                                  coef.pValue.toFixed(4)
                                )
                              ) : '—'}
                            </td>
                            <td className="py-3 px-4 text-center">
                              {isSelected ? (
                                <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  <Check className="w-3 h-3" /> Yes
                                </span>
                              ) : (
                                <span className="inline-flex items-center bg-slate-100 text-slate-400 text-[10px] font-bold px-2 py-0.5 rounded-full">
                                  — Zeroed
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Embedded Interactive Charts Diagnostics Panel */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Eye className="w-4 h-4 text-indigo-600" />
                  <h4 className="text-xs font-bold text-slate-800 uppercase tracking-widest font-mono">Residual & Diagnostics Viz</h4>
                </div>
                <ChartsPanel
                  residuals={estimationResults.residuals}
                  fitted={estimationResults.fitted}
                  yActual={estimationResults.yActual}
                  coefficients={estimationResults.coefficients}
                />
              </div>
            </>
          ) : (
            /* Blank state waiting for estimation */
            <div className="h-full bg-white border border-slate-200 border-dashed rounded-2xl flex flex-col items-center justify-center text-center p-12 space-y-4">
              <div className="p-4 bg-slate-50 rounded-full text-slate-400">
                <Sliders className="w-8 h-8" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="text-sm font-bold text-slate-800">Shrinkage Estimators Ready</h3>
                <p className="text-xs text-slate-400 font-serif italic">
                  Select your outcome variable and covariates from the left menu, then trigger "Run Shrinkage Estimation" to solve complex high-dimensional systems.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
