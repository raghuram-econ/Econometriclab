import React, { useState, useEffect, useMemo } from 'react';
import { Play, CheckCircle2, AlertCircle, Trash2, Database, Sparkles, FileDown, Loader2, Info } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { Dataset, Variable, DataType, RegressionResult } from '../../types';
import { cn, exportToCSV } from '../../lib/utils';
import { getAuthHeaders } from '../../services/apiClient';
import { indianInflationTimeSeries, nfhsMicroHealth, indianAgriculturePanel, pmgsyRoadDiD } from '../../lib/indianDatasets';
import { generateMasterDataset } from '../../lib/dataGenerators';

function makeSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rndBatch = makeSeededRandom(777);

interface SelectedDatasetConfig {
  datasetName: string;
  enabled: boolean;
  yVar: string;
  xVars: string[];
  entityId?: string;
  timeVar?: string;
}

export default function BatchProcessingLab() {
  const { savedDatasets, aiEnabled, addToast } = useStore();
  
  const [modelType, setModelType] = useState<'ols' | 'fe' | 're'>('ols');
  const [robustSE, setRobustSE] = useState<boolean>(false);
  const [includeIntercept, setIncludeIntercept] = useState<boolean>(true);
  
  const [running, setRunning] = useState<boolean>(false);
  const [batchResults, setBatchResults] = useState<Record<string, { result: RegressionResult; config: SelectedDatasetConfig }> | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Compile all available datasets
  const allAvailableDatasets = useMemo<Dataset[]>(() => {
    const list: Dataset[] = [];
    
    // 1. User uploaded/saved datasets
    savedDatasets.forEach(d => {
      if (!list.some(x => x.name === d.name)) {
        list.push(d);
      }
    });

    // 2. Preloaded Master Dataset
    const masterData = generateMasterDataset();
    list.push({
      name: "Master Econometrics Test Dataset",
      data: masterData,
      rowCount: masterData.length,
      colCount: 17,
      structure: 'panel',
      variables: [
        { name: 'entity_id', label: 'entity_id', type: 'numeric' },
        { name: 'entity_name', label: 'entity_name', type: 'categorical' },
        { name: 'year', label: 'year', type: 'numeric' },
        { name: 'wage', label: 'wage', type: 'numeric' },
        { name: 'educ', label: 'educ', type: 'numeric' },
        { name: 'exper', label: 'exper', type: 'numeric' },
        { name: 'female', label: 'female', type: 'numeric' },
        { name: 'urban', label: 'urban', type: 'numeric' },
        { name: 'ability_proxy', label: 'ability_proxy', type: 'numeric' },
        { name: 'training', label: 'training', type: 'numeric' },
        { name: 'distance_to_college', label: 'distance_to_college', type: 'numeric' },
        { name: 'employment', label: 'employment', type: 'numeric' },
        { name: 'gdp_growth', label: 'gdp_growth', type: 'numeric' },
        { name: 'inflation', label: 'inflation', type: 'numeric' },
        { name: 'unemployment', label: 'unemployment', type: 'numeric' },
        { name: 'policy_index', label: 'policy_index', type: 'numeric' },
        { name: 'shock_index', label: 'shock_index', type: 'numeric' }
      ]
    });

    // 3. Indian Academic Datasets
    list.push(indianInflationTimeSeries);
    list.push(nfhsMicroHealth);
    list.push(indianAgriculturePanel);
    list.push(pmgsyRoadDiD);

    // 4. Default CPS wages
    const cpsData = Array.from({ length: 300 }, (_, i) => ({
      wage: 15 + rndBatch() * 50 + (i % 2 === 0 ? 10 : 0),
      educ: 8 + Math.floor(rndBatch() * 12),
      exper: Math.floor(rndBatch() * 40),
      gender: i % 2 === 0 ? 'Female' : 'Male',
      married: rndBatch() > 0.5 ? 1 : 0
    }));
    list.push({
      name: "CPS Wages (Cross-Section)",
      data: cpsData,
      variables: [
        { name: 'wage', label: 'wage', type: 'numeric' },
        { name: 'educ', label: 'educ', type: 'numeric' },
        { name: 'exper', label: 'exper', type: 'numeric' },
        { name: 'gender', label: 'gender', type: 'categorical' },
        { name: 'married', label: 'married', type: 'numeric' }
      ],
      rowCount: 300,
      colCount: 5,
      structure: 'cross-section'
    });

    // 5. Default EU Growth
    const countries = ['Germany', 'France', 'Italy', 'Spain', 'Poland'];
    const euData: any[] = [];
    countries.forEach(country => {
      for (let year = 2010; year <= 2023; year++) {
        euData.push({
          country,
          year,
          gdp_growth: 1 + rndBatch() * 3,
          inflation: 0.5 + rndBatch() * 4,
          unemp: 3 + rndBatch() * 8
        });
      }
    });
    list.push({
      name: "EU Growth 2010-2023 (Panel)",
      data: euData,
      variables: [
        { name: 'country', label: 'country', type: 'categorical' },
        { name: 'year', label: 'year', type: 'numeric' },
        { name: 'gdp_growth', label: 'gdp_growth', type: 'numeric' },
        { name: 'inflation', label: 'inflation', type: 'numeric' },
        { name: 'unemp', label: 'unemp', type: 'numeric' }
      ],
      rowCount: euData.length,
      colCount: 5,
      structure: 'panel'
    });

    return list;
  }, [savedDatasets]);

  // Track configurations for each dataset
  const [configs, setConfigs] = useState<Record<string, SelectedDatasetConfig>>({});

  // Initialize configurations when allAvailableDatasets changes
  useEffect(() => {
    const updatedConfigs: Record<string, SelectedDatasetConfig> = { ...configs };
    allAvailableDatasets.forEach(ds => {
      if (!updatedConfigs[ds.name]) {
        const numericVars = ds.variables.filter(v => v.type === 'numeric').map(v => v.name);
        const yVar = numericVars[0] || '';
        const xVars = numericVars.slice(1, 4); // default to top 3 other numeric variables
        
        let entityId = '';
        let timeVar = '';

        if (ds.structure === 'panel') {
          // Guess entity id and time variable
          entityId = ds.variables.find(v => v.name.includes('id') || v.name.includes('name') || v.name.includes('state') || v.name.includes('country'))?.name || '';
          timeVar = ds.variables.find(v => v.name.includes('year') || v.name.includes('time') || v.name.includes('date'))?.name || '';
        }

        updatedConfigs[ds.name] = {
          datasetName: ds.name,
          enabled: false, // defaulted to false so user picks
          yVar,
          xVars,
          entityId,
          timeVar
        };
      }
    });
    setConfigs(updatedConfigs);
  }, [allAvailableDatasets]);

  const handleToggleDataset = (name: string) => {
    setConfigs(prev => {
      const current = prev[name];
      if (!current) return prev;
      return {
        ...prev,
        [name]: {
          ...current,
          enabled: !current.enabled
        }
      };
    });
  };

  const handleConfigChange = (name: string, field: keyof SelectedDatasetConfig, value: any) => {
    setConfigs(prev => {
      const current = prev[name];
      if (!current) return prev;
      return {
        ...prev,
        [name]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  // Run sequential estimations
  const handleRunBatch = async () => {
    const enabledConfigs = Object.values(configs).filter(c => c.enabled);
    if (enabledConfigs.length === 0) {
      setErrorMessage("Please select at least one dataset to run the batch estimation.");
      return;
    }

    // Validation
    for (const cfg of enabledConfigs) {
      if (!cfg.yVar) {
        setErrorMessage(`Dataset "${cfg.datasetName}" must have a specified Dependent Variable (Y).`);
        return;
      }
      if (cfg.xVars.length === 0) {
        setErrorMessage(`Dataset "${cfg.datasetName}" must have at least one Independent Variable (X).`);
        return;
      }
      if (modelType === 'fe' || modelType === 're') {
        if (!cfg.entityId) {
          setErrorMessage(`Dataset "${cfg.datasetName}" requires an Entity Identifier Variable for Panel estimations.`);
          return;
        }
        if (!cfg.timeVar) {
          setErrorMessage(`Dataset "${cfg.datasetName}" requires a Time/Period Variable for Panel estimations.`);
          return;
        }
      }
    }

    setRunning(true);
    setErrorMessage(null);
    setBatchResults(null);

    const resultsCollector: Record<string, { result: RegressionResult; config: SelectedDatasetConfig }> = {};

    try {
      for (const cfg of enabledConfigs) {
        const dataset = allAvailableDatasets.find(d => d.name === cfg.datasetName);
        if (!dataset) continue;

        let endpoint = '/api/estimate/ols';
        let payload: any = {
          data: dataset.data,
          yVar: cfg.yVar,
          xVars: cfg.xVars
        };

        if (modelType === 'ols') {
          endpoint = '/api/estimate/ols';
          payload.includeIntercept = includeIntercept;
          payload.robust = robustSE;
        } else if (modelType === 'fe') {
          endpoint = '/api/estimate/fe';
          payload.entityId = cfg.entityId;
          payload.timeVar = cfg.timeVar;
        } else if (modelType === 're') {
          endpoint = '/api/estimate/re';
          payload.entityId = cfg.entityId;
          payload.timeVar = cfg.timeVar;
        }

        const headers = await getAuthHeaders();
        const response = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const errData = await response.json();
          throw new Error(`Estimation failed for "${cfg.datasetName}": ${errData.error || response.statusText}`);
        }

        const result: RegressionResult = await response.json();
        resultsCollector[cfg.datasetName] = {
          result,
          config: cfg
        };
      }

      setBatchResults(resultsCollector);
      addToast('success', 'Batch Estimation Succeeded', `Processed ${Object.keys(resultsCollector).length} datasets sequentially.`);
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || "An unexpected error occurred during batch execution.");
      addToast('error', 'Batch Ingestion Aborted', err.message || "Failed sequentially estimating specs.");
    } finally {
      setRunning(false);
    }
  };

  // Format p-value stars
  const getStars = (p: number) => {
    if (p < 0.01) return '***';
    if (p < 0.05) return '**';
    if (p < 0.1) return '*';
    return '';
  };

  // Compile a list of all distinct explanatory variables in the completed results
  const allDistinctVariables = useMemo(() => {
    if (!batchResults) return [];
    const vars = new Set<string>();
    Object.values(batchResults).forEach(item => {
      item.result.coefficients.forEach(c => {
        if (c.variable !== 'Intercept' && c.variable !== 'sigma (Error SD)') {
          vars.add(c.variable);
        }
      });
    });
    return Array.from(vars).sort();
  }, [batchResults]);

  // Export results matrix to CSV
  const handleExportCSV = () => {
    if (!batchResults) return;

    const csvData: any[] = [];
    
    // Header Row: Variables followed by dataset outputs
    allDistinctVariables.forEach(vName => {
      const row: any = { Variable: vName };
      Object.entries(batchResults).forEach(([dsName, item], idx) => {
        const coef = item.result.coefficients.find(c => c.variable === vName);
        const label = `Model (${idx + 1}): ${dsName}`;
        row[`${label}_Estimate`] = coef ? coef.estimate.toFixed(5) : '—';
        row[`${label}_StdError`] = coef ? `(${coef.stdError.toFixed(5)})` : '—';
        row[`${label}_pValue`] = coef ? coef.pValue.toFixed(4) : '—';
      });
      csvData.push(row);
    });

    // Add intercept
    const interceptRow: any = { Variable: 'Intercept (Constant)' };
    Object.entries(batchResults).forEach(([dsName, item], idx) => {
      const coef = item.result.coefficients.find(c => c.variable === 'Intercept');
      const label = `Model (${idx + 1}): ${dsName}`;
      interceptRow[`${label}_Estimate`] = coef ? coef.estimate.toFixed(5) : '—';
      interceptRow[`${label}_StdError`] = coef ? `(${coef.stdError.toFixed(5)})` : '—';
      interceptRow[`${label}_pValue`] = coef ? coef.pValue.toFixed(4) : '—';
    });
    csvData.push(interceptRow);

    // Add diagnostics rows
    const nRow: any = { Variable: 'Observations (N)' };
    Object.entries(batchResults).forEach(([dsName, item], idx) => {
      nRow[`Model (${idx + 1}): ${dsName}_Estimate`] = item.result.n;
    });
    csvData.push(nRow);

    const r2Row: any = { Variable: 'R-squared' };
    Object.entries(batchResults).forEach(([dsName, item], idx) => {
      r2Row[`Model (${idx + 1}): ${dsName}_Estimate`] = item.result.rSquared?.toFixed(4) || '—';
    });
    csvData.push(r2Row);

    const aicRow: any = { Variable: 'AIC' };
    Object.entries(batchResults).forEach(([dsName, item], idx) => {
      aicRow[`Model (${idx + 1}): ${dsName}_Estimate`] = item.result.aic?.toFixed(2) || '—';
    });
    csvData.push(aicRow);

    exportToCSV(csvData, `econometric_batch_consolidated_results`);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Intro Summary Header */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl text-slate-100 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div className="space-y-1.5 flex-1">
          <h3 className="text-xs font-bold font-mono tracking-[0.2em] text-blue-400 uppercase flex items-center gap-2">
            <Database className="w-4 h-4 text-blue-400" />
            Empirical Batch Engine (Multi-Dataset Estimator)
          </h3>
          <p className="text-[11px] text-slate-400 font-serif italic">
            Select multiple datasets and apply uniform or custom econometric specifications sequentially. Outputs a publication-standard side-by-side regression table.
          </p>
        </div>
        <div className="flex gap-2">
          <span className="text-[10px] bg-slate-950 text-slate-400 px-3 py-1.5 rounded-lg border border-slate-800 font-mono">
            {allAvailableDatasets.length} Pools Available
          </span>
        </div>
      </div>

      {/* Grid: Config & Dataset Selection */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Side: Parameters and Selection */}
        <div className="lg:col-span-7 space-y-6">
          <div className="card-premium p-6 bg-white border-slate-200 shadow-sm space-y-6">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">Step 1: Universal Model Parameters</h4>
              <p className="text-[11px] text-slate-500 font-serif italic mt-0.5">Select the mathematical estimator and robust adjustments.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Estimator</label>
                <select 
                  value={modelType}
                  onChange={(e) => setModelType(e.target.value as any)}
                  className="w-full p-2.5 bg-slate-50 border border-slate-100 rounded-lg text-xs font-bold text-slate-700"
                >
                  <option value="ols">Ordinary Least Squares (OLS)</option>
                  <option value="fe">Panel Fixed Effects (FE)</option>
                  <option value="re">Panel Random Effects (RE)</option>
                </select>
              </div>

              {modelType === 'ols' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Intercept</label>
                  <div className="flex items-center h-[38px]">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input 
                        type="checkbox" 
                        checked={includeIntercept}
                        onChange={(e) => setIncludeIntercept(e.target.checked)}
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                      />
                      <span className="text-xs text-slate-600 font-medium">Include Constant</span>
                    </label>
                  </div>
                </div>
              )}

              <div className="space-y-1">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest font-mono">Variance Adjustment</label>
                <div className="flex items-center h-[38px]">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="checkbox" 
                      checked={robustSE}
                      onChange={(e) => setRobustSE(e.target.checked)}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
                    />
                    <span className="text-xs text-slate-600 font-medium">Robust Standard Errors</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Dataset Selector List with expandable specifications */}
          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">Step 2: Choose Cohorts & Map Variables</h4>
              <p className="text-[11px] text-slate-500 font-serif italic mt-0.5">Select cohorts to include and verify their independent-dependent configurations.</p>
            </div>

            <div className="space-y-3">
              {allAvailableDatasets.map(ds => {
                const config = configs[ds.name];
                if (!config) return null;

                const numericVars = ds.variables.filter(v => v.type === 'numeric');
                const categoricalVars = ds.variables.filter(v => v.type === 'categorical');

                return (
                  <div key={ds.name} className={cn(
                    "card-premium border rounded-xl p-5 transition-all",
                    config.enabled ? "border-blue-200 bg-blue-50/10 shadow-sm" : "border-slate-100 bg-white"
                  )}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3">
                        <input 
                          type="checkbox"
                          checked={config.enabled}
                          onChange={() => handleToggleDataset(ds.name)}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                        <div>
                          <h5 className="text-xs font-bold text-slate-900">{ds.name}</h5>
                          <span className="text-[9px] font-mono text-slate-400 uppercase">
                            {ds.rowCount} obs • {ds.structure} Cohort
                          </span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[8px] font-bold px-2 py-0.5 rounded uppercase tracking-wider font-mono",
                        config.enabled ? "bg-blue-100 text-blue-800" : "bg-slate-100 text-slate-400"
                      )}>
                        {config.enabled ? 'Staged' : 'Excluded'}
                      </span>
                    </div>

                    {/* Expandable Configuration */}
                    {config.enabled && (
                      <div className="mt-5 pt-4 border-t border-slate-100/70 grid grid-cols-1 md:grid-cols-2 gap-4 animate-in slide-in-from-top-1 duration-200">
                        {/* Dependent select */}
                        <div className="space-y-1">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Dependent Variable (Y)</label>
                          <select 
                            value={config.yVar}
                            onChange={(e) => handleConfigChange(ds.name, 'yVar', e.target.value)}
                            className="w-full p-2 bg-white border border-slate-200 rounded text-xs text-slate-700"
                          >
                            <option value="">Select Y...</option>
                            {numericVars.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
                          </select>
                        </div>

                        {/* Explanatory select (Multiple checklist) */}
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide block">Independent Regressors (X)</label>
                          <div className="flex flex-wrap gap-2 p-3 bg-slate-50 rounded border border-slate-100 max-h-32 overflow-y-auto">
                            {ds.variables.map(v => {
                              const isChecked = config.xVars.includes(v.name);
                              const isY = config.yVar === v.name;
                              return (
                                <label 
                                  key={v.name} 
                                  className={cn(
                                    "flex items-center gap-1.5 px-2 py-1 rounded text-[10px] font-mono cursor-pointer transition-all border",
                                    isY ? "opacity-30 pointer-events-none bg-slate-200" :
                                    isChecked ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                                  )}
                                >
                                  <input 
                                    type="checkbox"
                                    checked={isChecked && !isY}
                                    disabled={isY}
                                    onChange={() => {
                                      const updatedX = isChecked 
                                        ? config.xVars.filter(x => x !== v.name)
                                        : [...config.xVars, v.name];
                                      handleConfigChange(ds.name, 'xVars', updatedX);
                                    }}
                                    className="hidden"
                                  />
                                  <span>{v.label}</span>
                                </label>
                              );
                            })}
                          </div>
                        </div>

                        {/* Entity and Time IDs for FE/RE */}
                        {(modelType === 'fe' || modelType === 're') && (
                          <>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Entity ID Variable</label>
                              <select 
                                value={config.entityId}
                                onChange={(e) => handleConfigChange(ds.name, 'entityId', e.target.value)}
                                className="w-full p-2 bg-white border border-slate-200 rounded text-xs text-slate-700"
                              >
                                <option value="">Select Entity...</option>
                                {ds.variables.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
                              </select>
                            </div>
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wide">Time Variable</label>
                              <select 
                                value={config.timeVar}
                                onChange={(e) => handleConfigChange(ds.name, 'timeVar', e.target.value)}
                                className="w-full p-2 bg-white border border-slate-200 rounded text-xs text-slate-700"
                              >
                                <option value="">Select Period...</option>
                                {ds.variables.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
                              </select>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-4 bg-red-50 border border-red-100 text-red-700 rounded-xl text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0 text-red-500" />
              <div className="space-y-1">
                <span className="font-bold block uppercase tracking-tight">Configuration Constraint</span>
                <span className="text-red-600/80">{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Run button */}
          <button 
            onClick={handleRunBatch}
            disabled={running}
            className="w-full py-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl font-bold uppercase text-xs tracking-widest transition-all shadow flex items-center justify-center gap-2"
          >
            {running ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                Executing Sequential Estimations...
              </>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current text-white" />
                Initialize Sequential Batch Analysis
              </>
            )}
          </button>
        </div>

        {/* Right Side: consolidated results preview */}
        <div className="lg:col-span-5 space-y-6">
          <div className="card-premium p-6 bg-white border-slate-200 shadow-sm flex flex-col h-full min-h-[500px]">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-6">
              <div className="space-y-0.5">
                <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">Consolidated Outputs</h4>
                <p className="text-[10px] text-slate-400 italic">Publication-grade side-by-side comparative diagnostics.</p>
              </div>
              {batchResults && (
                <button 
                  onClick={handleExportCSV}
                  className="px-3 py-1.5 text-xs text-blue-600 hover:bg-blue-50 border border-blue-100 rounded-md flex items-center gap-1.5 transition-all font-semibold"
                >
                  <FileDown className="w-3.5 h-3.5" /> Export Table
                </button>
              )}
            </div>

            {batchResults ? (
              <div className="space-y-6 flex-1 overflow-x-auto">
                <table className="w-full border-collapse text-[11px] text-left">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="p-3 text-slate-500 font-mono uppercase text-[9px] border-r border-slate-200">Regressor</th>
                      {Object.entries(batchResults).map(([name, item], idx) => (
                        <th key={name} className="p-3 text-slate-800 font-bold border-r border-slate-100 last:border-0 text-center">
                          <div className="flex flex-col">
                            <span className="text-[10px] font-bold text-blue-600 font-mono">Model ({idx + 1})</span>
                            <span className="text-[9px] text-slate-500 truncate max-w-[120px]" title={name}>{name}</span>
                            <span className="text-[8px] font-mono text-slate-400 italic font-semibold uppercase">{item.config.yVar}</span>
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {/* Unique Explanatory Variables */}
                    {allDistinctVariables.map(vName => {
                      return (
                        <React.Fragment key={vName}>
                          {/* Estimate Row */}
                          <tr className="bg-white hover:bg-slate-50/50">
                            <td className="p-3 text-slate-700 font-serif font-bold italic border-r border-slate-200">{vName}</td>
                            {Object.entries(batchResults).map(([dsName, item]) => {
                              const coef = item.result.coefficients.find(c => c.variable === vName);
                              return (
                                <td key={dsName} className="p-3 text-center text-slate-900 font-bold border-r border-slate-100 last:border-0">
                                  {coef ? `${coef.estimate.toFixed(4)}${getStars(coef.pValue)}` : '—'}
                                </td>
                              );
                            })}
                          </tr>
                          {/* Standard Error Row */}
                          <tr className="bg-white/60">
                            <td className="p-1 px-3 text-[9px] text-slate-400 border-r border-slate-200 italic">Std. Error</td>
                            {Object.entries(batchResults).map(([dsName, item]) => {
                              const coef = item.result.coefficients.find(c => c.variable === vName);
                              return (
                                <td key={dsName} className="p-1 text-center text-[9px] text-slate-400 border-r border-slate-100 last:border-0">
                                  {coef ? `(${coef.stdError.toFixed(4)})` : '—'}
                                </td>
                              );
                            })}
                          </tr>
                        </React.Fragment>
                      );
                    })}

                    {/* Intercept / Constant */}
                    <React.Fragment>
                      <tr className="bg-slate-50/30 hover:bg-slate-50/50">
                        <td className="p-3 text-slate-700 font-serif font-bold italic border-r border-slate-200">Intercept (Constant)</td>
                        {Object.entries(batchResults).map(([dsName, item]) => {
                          const coef = item.result.coefficients.find(c => c.variable === 'Intercept');
                          return (
                            <td key={dsName} className="p-3 text-center text-slate-900 font-bold border-r border-slate-100 last:border-0">
                              {coef ? `${coef.estimate.toFixed(4)}${getStars(coef.pValue)}` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                      <tr className="bg-slate-50/10">
                        <td className="p-1 px-3 text-[9px] text-slate-400 border-r border-slate-200 italic">Std. Error</td>
                        {Object.entries(batchResults).map(([dsName, item]) => {
                          const coef = item.result.coefficients.find(c => c.variable === 'Intercept');
                          return (
                            <td key={dsName} className="p-1 text-center text-[9px] text-slate-400 border-r border-slate-100 last:border-0">
                              {coef ? `(${coef.stdError.toFixed(4)})` : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>

                    {/* Observations Row */}
                    <tr className="border-t-2 border-slate-200 bg-slate-50/50">
                      <td className="p-2 px-3 text-slate-600 font-bold border-r border-slate-200">Observations (N)</td>
                      {Object.entries(batchResults).map(([dsName, item]) => (
                        <td key={dsName} className="p-2 text-center text-slate-800 font-bold border-r border-slate-100 last:border-0">
                          {item.result.n}
                        </td>
                      ))}
                    </tr>

                    {/* R-squared Row */}
                    <tr className="bg-white">
                      <td className="p-2 px-3 text-slate-600 font-bold border-r border-slate-200">R-squared</td>
                      {Object.entries(batchResults).map(([dsName, item]) => (
                        <td key={dsName} className="p-2 text-center text-slate-800 font-bold border-r border-slate-100 last:border-0">
                          {item.result.rSquared?.toFixed(4) || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* Adjusted R-squared Row */}
                    {modelType === 'ols' && (
                      <tr className="bg-slate-50/20">
                        <td className="p-2 px-3 text-slate-600 font-bold border-r border-slate-200">Adj. R-squared</td>
                        {Object.entries(batchResults).map(([dsName, item]) => (
                          <td key={dsName} className="p-2 text-center text-slate-800 font-bold border-r border-slate-100 last:border-0">
                            {item.result.adjRSquared?.toFixed(4) || '—'}
                          </td>
                        ))}
                      </tr>
                    )}

                    {/* Log-Likelihood */}
                    <tr className="bg-white">
                      <td className="p-2 px-3 text-slate-600 font-bold border-r border-slate-200">Log-Likelihood</td>
                      {Object.entries(batchResults).map(([dsName, item]) => (
                        <td key={dsName} className="p-2 text-center text-slate-800 font-bold border-r border-slate-100 last:border-0">
                          {item.result.logLikelihood?.toFixed(2) || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* AIC Row */}
                    <tr className="bg-slate-50/20">
                      <td className="p-2 px-3 text-slate-600 font-bold border-r border-slate-200">AIC</td>
                      {Object.entries(batchResults).map(([dsName, item]) => (
                        <td key={dsName} className="p-2 text-center text-slate-800 font-bold border-r border-slate-100 last:border-0">
                          {item.result.aic?.toFixed(2) || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* BIC Row */}
                    <tr className="bg-white">
                      <td className="p-2 px-3 text-slate-600 font-bold border-r border-slate-200">BIC</td>
                      {Object.entries(batchResults).map(([dsName, item]) => (
                        <td key={dsName} className="p-2 text-center text-slate-800 font-bold border-r border-slate-100 last:border-0">
                          {item.result.bic?.toFixed(2) || '—'}
                        </td>
                      ))}
                    </tr>

                    {/* Hausman recommendation if applicable */}
                    {Object.values(batchResults).some(item => !!item.result.hausman) && (
                      <tr className="bg-amber-50/40">
                        <td className="p-2 px-3 text-amber-800 font-bold border-r border-slate-200">Hausman Test (p)</td>
                        {Object.entries(batchResults).map(([dsName, item]) => (
                          <td key={dsName} className="p-2 text-center text-amber-950 font-bold border-r border-slate-100 last:border-0">
                            {item.result.hausman ? `${item.result.hausman.pValue?.toFixed(4)}` : '—'}
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
                <p className="text-[9px] text-slate-400 font-mono mt-4 text-center">
                  Significance codes:  *** p &lt; 0.01,  ** p &lt; 0.05,  * p &lt; 0.1
                </p>
                
                {/* Scholarly Commentary Box */}
                <div className="p-4 bg-blue-50/50 border border-blue-100 rounded-xl space-y-2 mt-6">
                  <div className="flex items-center gap-1.5">
                    <Info className="w-4 h-4 text-blue-500" />
                    <span className="text-[10px] font-bold text-blue-700 uppercase tracking-widest font-mono">Scholarly Translation</span>
                  </div>
                  <p className="text-xs text-slate-600 font-serif leading-relaxed italic">
                    Sequential evaluation completes successfully. Comparison shows explanatory weights shifting across cohorts, indicating potential unobserved regional heterogeneity. Run Hausman tests on staged panel datasets to verify consistent model choice bounds.
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8 border-2 border-dashed border-slate-100 rounded-2xl bg-slate-50/50">
                <Database className="w-8 h-8 text-slate-300 mb-3" />
                <h5 className="text-xs font-bold text-slate-700 uppercase">Awaiting Computation</h5>
                <p className="text-[10px] text-slate-400 font-serif italic mt-1 max-w-xs">
                  Staging models sequentially. Choose your universal coefficients and stage cohorts on the left to see comparative Stargazer-standard tables.
                </p>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
