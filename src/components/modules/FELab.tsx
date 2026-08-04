import React, { useState, useEffect, useMemo } from 'react';
import { Play, Layers, FlaskConical, CheckCircle2, FileDown, Info, X, HelpCircle, Check, ChevronRight, Sparkles, Database, Upload, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Dataset, RegressionResult, PanelConfig } from '../../types';
import { cn, exportToCSV } from '../../lib/utils';
import { getAuthHeaders } from '../../services/apiClient';
import { CoefficientTranslator } from '../shared/CoefficientTranslator';
import { ModelAssistant } from '../shared/ModelAssistant';
import { DiagnosticCoach } from '../shared/DiagnosticCoach';
import { MistakeDetector, Mistake } from '../shared/MistakeDetector';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { TeachingChecklist } from '../shared/TeachingChecklist';
import { useStore } from '../../store/useStore';
import { useNavigation } from '../../hooks/useNavigation';
import { CodeBridge } from '../shared/CodeBridge';
import RegressionResultsTable from '../shared/RegressionResultsTable';
import { estimateModel } from '../../lib/econometrics/estimators';

import { formatNum, formatPValue } from '../../lib/formatters';

const FE_HELP_INFO = {
  entity: {
    title: "Entity Identifier (i)",
    subtitle: "The Cross-Sectional Dimension",
    intuition: "In panel data, observations are tracked across both individuals (entities) and time. The Entity ID identifies the individual unit (such as countries, firms, or states). Entity Fixed Effects absorb ALL unobserved baseline traits that differ across units but are constant over time (like geographical borders, cultural baselines, or historic legal frameworks).",
    math: "αᵢ (absorbed intercept for unit i)",
    importance: "By removing these unobserved traits, FE eliminates a major source of Omitted Variable Bias (selection bias) that typically plagues cross-sectional OLS.",
    question: "If an unobserved country trait (like baseline national work ethic) affects both GDP growth and policy choices, does a Fixed Effects model successfully control for it?",
    answer: "Yes, absolutely. Because a country's baseline national work ethic can be assumed to be constant over the short-to-medium term (time-invariant), the Entity Fixed Effect (α_i) completely absorbs and controls for it, protecting your coefficients from omitted variable bias."
  },
  time: {
    title: "Time Variable (t)",
    subtitle: "The Temporal Dimension",
    intuition: "Tracks the period in which the observation is recorded (such as years, quarters, or months). Time Fixed Effects absorb unobserved events or macroeconomic shocks that change over time but affect all entities equally (for example, the 2008 Global Financial Crisis, oil price shocks, or global technological shifts).",
    math: "λ_t (intercept shift for year t)",
    importance: "Including time fixed effects controls for temporal trends and global macroeconomic shocks, ensuring that your estimates are not confounded by concurrent macro cycles.",
    question: "Suppose a global pandemic occurs in Year 2020, causing an economic shock across all countries. How do Time Fixed Effects handle this shock?",
    answer: "Time fixed effects introduce a separate intercept shift (λ_t) for each time period. For the year 2020, λ_2020 will absorb the shared, global impact of the pandemic across all countries in your sample, preventing it from confounding the estimated coefficients of your other independent variables."
  },
  transformation: {
    title: "Model Transformation (FE vs Pooled)",
    subtitle: "Within-Group Demeaning vs. Ordinary Least Squares",
    intuition: "Fixed Effects uses a mathematical transformation called 'Within-Demeaning' or 'Within-Transformation'. For every variable, it calculates the unit's mean over time, and subtracts it. This removes the unobserved unit-specific effect α_i entirely. Pooled OLS, on the other hand, ignores the panel structure entirely, treating all observations as independent, which leads to biased estimates if unobserved unit traits correlate with predictors.",
    math: "(Yᵢₜ - Ȳᵢ) = β₁(Xᵢₜ - X̄ᵢ) + (uᵢₜ - ūᵢ)",
    importance: "If individual-specific unobserved heterogeneity correlates with X, Pooled OLS is biased. We use the Hausman Specification Test to formally decide: under the null hypothesis, Random Effects is preferred; under the alternative, Fixed Effects is required.",
    question: "If you run a Fixed Effects (Within) regression, what happens to variables that do not change over time (such as land area or gender)?",
    answer: "Because Fixed Effects performs within-group demeaning, any variable that does not change over time has a constant value equal to its mean. Subtracting the mean results in a value of exactly zero for all observations. Consequently, all time-invariant variables are perfectly collinear with the entity intercepts and are completely OMITTED (dropped) from the model."
  },
  dependent: {
    title: "Dependent Variable (Outcome - Y)",
    subtitle: "The Demeaned Target Outcome",
    intuition: "The outcome variable Y. In Fixed Effects, we analyze the variation of Y within an entity over time, rather than comparing different entities. For example, we ask: 'When Country A increases its research spending, does its growth rate increase?' rather than 'Do countries with high research spending grow faster?'",
    math: "(Yᵢₜ - Ȳᵢ)",
    importance: "Must vary within units over time to be useful. If an outcome is constant for each entity, FE is mathematically impossible or meaningless.",
    question: "Why does the R-squared in a Fixed Effects output often get divided into 'Within', 'Between', and 'Overall'?",
    answer: "The 'Within-R²' measures how much of the variation over time within each unit is explained by the model. The 'Between-R²' measures the variation across units. Because Fixed Effects is explicitly designed to explain within-unit temporal changes, the 'Within-R²' is the primary metric of interest."
  },
  regressors: {
    title: "Exogenous Regressors (X)",
    subtitle: "Time-Varying Covariates",
    intuition: "The predictors. In Fixed Effects, these must exhibit temporal variation within each entity (i.e., they must change over time for at least some entities). Since FE relies entirely on temporal changes within units to estimate coefficients, time-invariant predictors are perfectly collinear with the unit effects and get dropped.",
    math: "(Xᵢₜ - X̄ᵢ)",
    importance: "Only the time-varying components of X are used to estimate the coefficients. The identification comes purely from within-unit changes.",
    question: "If your independent variable only changes for a couple of entities in your sample, what is the consequence for your FE estimation?",
    answer: "Your FE coefficients will be estimated with very low precision (large standard errors). Since FE relies entirely on within-entity variation, having very little temporal variation means the model has little information to estimate the effect, leading to weak statistical power."
  }
};

interface FELabProps {
  dataset: Dataset | null;
  onRunComplete: (results: RegressionResult, spec: string) => void;
  isLoading: boolean;
}

export default function FELab({ dataset, onRunComplete, isLoading }: FELabProps) {
  const { 
    teachingState, 
    updateTeachingStep, 
    history,
    entityId, 
    setEntityId, 
    timeId, 
    setTimeId, 
    dependentVar: yVar, 
    setDependentVar: setYVar, 
    regressors: xVars, 
    setRegressors: setXVars, 
    modelType, 
    setModelType 
  } = useStore();

  const [activeHelp, setActiveHelp] = useState<"entity" | "time" | "transformation" | "dependent" | "regressors" | null>(null);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [clusterSE, setClusterSE] = useState<boolean>(false);

  useEffect(() => {
    setShowExplanation(false);
  }, [activeHelp]);

  const panelConfig = { entityId, timeVar: timeId };
  const [results, setResults] = useState<RegressionResult | null>(null);

  // Memoized so these keep a stable reference across unrelated re-renders
  // (e.g. toasts, autosave ticks) -- RegressionResultsTable resets its
  // in-memory "Add Specification" comparison columns whenever this object's
  // reference changes, so a fresh literal here would silently wipe user work.
  const resultsTableClusterVar = modelType === 'fe' && clusterSE ? entityId : undefined;
  const resultsTableOptions = useMemo(() => ({
    panelId: entityId,
    timeId: timeId,
    clusterVar: resultsTableClusterVar
  }), [entityId, timeId, resultsTableClusterVar]);

  const codeBridgeClusterOption = modelType === 'fe' && clusterSE ? entityId : undefined;
  const codeBridgeOptions = useMemo(() => ({
    entity: entityId,
    time: timeId,
    cluster: codeBridgeClusterOption
  }), [entityId, timeId, codeBridgeClusterOption]);

  const [activeStep, setActiveStep] = useState<'estimation' | 'diagnostics' | 'interpretation'>('estimation');
  const [mistakes, setMistakes] = useState<Mistake[]>([]);
  const [isEstimating, setIsEstimating] = useState(false);
  const [estimationError, setEstimationError] = useState<string | null>(null);
  const { navigateTo } = useNavigation();

  if (!dataset) {
    return (
      <div id="fe-lab-empty" className="space-y-8 max-w-7xl mx-auto pb-24 px-4 animate-in fade-in duration-1000">
        <section className="flex flex-col items-center justify-center py-24 px-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
          <div className="w-16 h-16 bg-white border border-slate-200 rounded-full flex items-center justify-center mb-6 shadow-sm">
            <Database className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">No dataset loaded yet</h2>
          <p className="text-slate-500 text-center max-w-md mb-8">
            You need to upload or select a dataset before running a Panel Fixed Effects (FE) regression.
          </p>
          <button 
            onClick={() => navigateTo('data')}
            className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors shadow-md"
          >
            <Upload className="w-5 h-5" />
            Go to Data Upload Lab
          </button>
        </section>
      </div>
    );
  }

  // CRASH GUARD ADDED
  const numericVars = ((dataset.variables || []).filter(v => v.type === 'numeric') || []).map(v => v.name);
  // CRASH GUARD ADDED
  const idVars = ((dataset.variables || []).filter(v => v.type === 'categorical' || v.type === 'numeric') || []).map(v => v.name);

  // Robustly find active history item by comparing JSON stringified results or specifications
  const activeSpecString = results
    // CRASH GUARD ADDED
    ? `${modelType.toUpperCase()} Model: ${yVar} ~ ${(xVars || []).join(' + ')} (Entity: ${panelConfig.entityId}, Time: ${panelConfig.timeVar})`
    : '';

  const activeHistoryItem = history.find(h => {
    if (!results) return false;
    return (
      h.specification === activeSpecString ||
      h.results === results ||
      (h.results && JSON.stringify(h.results) === JSON.stringify(results))
    );
  });

  const handleDownloadResults = () => {
    if (!results) return;
    // CRASH GUARD ADDED
    const data = (results?.coefficients || []).map(c => ({
      Variable: c.variable,
      Estimate: c.estimate,
      StdError: c.stdError,
      PValue: c.pValue
    }));
    exportToCSV(data, `fe_results_${yVar}`);
  };

  const handleRun = async () => {
    const issues: Mistake[] = [];

    // Only require Panel ID configuration when running Fixed Effects or Random Effects Model
    if (modelType === 'fe' || modelType === 're') {
      if (!panelConfig.entityId) {
        issues.push({
          id: 'missing-entity',
          level: 'error',
          problem: 'Entity ID Not Specified',
          whyItMatters: 'Fixed/Random effects require an entity identifier to group observations and absorb time-invariant unobserved traits.',
          howToFix: 'Select a variable like "country", "firm", or "state".',
          nextStep: 'Define your cross-sectional unit.'
        });
      }

      if (!panelConfig.timeVar) {
        issues.push({
          id: 'missing-time',
          level: 'error',
          problem: 'Time Variable Not Specified',
          whyItMatters: 'Panel data regression relies on temporal variation within units.',
          howToFix: 'Select a variable like "year", "quarter", or "month".',
          nextStep: 'Define your temporal dimension.'
        });
      }

      // Duplicate check for panel structural integrity
      if (panelConfig.entityId && panelConfig.timeVar) {
        const pairs = (dataset.data || []).map(d => `${d[panelConfig.entityId]}-${d[panelConfig.timeVar]}`);
        const uniquePairs = new Set(pairs);
        if (uniquePairs.size < (pairs || []).length) {
          issues.push({
            id: 'duplicate-panel',
            level: 'error',
            problem: 'Duplicate Panel Identifiers Detected',
            whyItMatters: 'Fixed/Random effects estimation requires a unique observation for every entity-time pair. Overlapping data suggests a non-rectangular panel or data entry errors.',
            howToFix: 'Ensure your entity and time variables uniquely identify each row.',
            nextStep: 'Check for data duplicates.'
          });
        }
      }
    }

    if (!yVar) {
      issues.push({
        id: 'missing-y',
        level: 'error',
        problem: 'Dependent Variable Missing',
        whyItMatters: 'You must specify the outcome variable you want to explain.',
        howToFix: 'Select a numeric variable as your Y.',
        nextStep: 'Choose your target outcome.'
      });
    }

    // CRASH GUARD ADDED
    if (!xVars || (xVars || []).length === 0) {
      issues.push({
        id: 'missing-x',
        level: 'error',
        problem: 'Independent Variables Missing',
        whyItMatters: 'You need at least one regressor to perform estimation.',
        howToFix: 'Select one or more numeric variables to include in the model.',
        nextStep: 'Choose your predictors.'
      });
    }

    setMistakes(issues);
    if (issues.some(i => i.level === 'error')) return;

    setIsEstimating(true);
    setEstimationError(null);

    try {
      // Clustered-SE Fixed Effects runs client-side, since the server-side FE
      // engine (fixed_effects.ts) has no cluster-robust SE support. This reuses
      // the already-verified Panel FE + cluster engine from estimators.ts
      // (see golden.test.ts: grunfeld_fe_clustered, and r_verification/02_panel_fe_re.R).
      if (modelType === 'fe' && clusterSE) {
        const res = estimateModel('Panel FE', {
          data: dataset.data,
          yVar,
          xVars,
          entityVar: panelConfig.entityId,
          clusterVar: panelConfig.entityId
        });
        setResults(res);
        const spec = `FE Model: ${yVar} ~ ${(xVars || []).join(' + ')} (Entity: ${panelConfig.entityId || 'N/A'}, Time: ${panelConfig.timeVar || 'N/A'}, Clustered SE by ${panelConfig.entityId})`;
        onRunComplete(res, spec);
        if (teachingState.isActive) {
          updateTeachingStep('Run panel model');
        }
        setIsEstimating(false);
        return;
      }

      const headers = await getAuthHeaders();
      let response;
      if (modelType === 'fe') {
        // Run Research-Grade Panel Fixed Effects
        response = await fetch('/api/estimate/fe', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            data: dataset.data,
            yVar,
            xVars,
            entityId: panelConfig.entityId,
            timeVar: panelConfig.timeVar
          }),
        });
      } else if (modelType === 're') {
        // Run Research-Grade Panel Random Effects
        response = await fetch('/api/estimate/re', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            data: dataset.data,
            yVar,
            xVars,
            entityId: panelConfig.entityId,
            timeVar: panelConfig.timeVar
          }),
        });
      } else {
        // Run Standard Pooled OLS
        response = await fetch('/api/estimate/ols', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            data: dataset.data,
            yVar,
            xVars,
            robust: false
          }),
        });
      }

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Estimation failed');
      }

      const res = await response.json();
      setResults(res);
      // CRASH GUARD ADDED
      const spec = `${modelType.toUpperCase()} Model: ${yVar} ~ ${(xVars || []).join(' + ')} (Entity: ${panelConfig.entityId || 'N/A'}, Time: ${panelConfig.timeVar || 'N/A'})`;
      onRunComplete(res, spec);

      if (teachingState.isActive) {
        updateTeachingStep('Run panel model');
      }
    } catch (err: any) {
      console.error('Estimation Execution Error:', err);
      setEstimationError(err.message || 'Estimation failed');
    } finally {
      setIsEstimating(false);
    }
  };

  const teachingChecklistSteps = [
    { label: 'Inspect the data', isDone: teachingState.completedSteps.includes('Inspect the data') },
    { label: 'Specify Panel structure', isDone: modelType === 'pooled' || (!!panelConfig.entityId && !!panelConfig.timeVar) }, 
    // CRASH GUARD ADDED
    { label: 'Select regressors', isDone: !!yVar && (xVars || []).length > 0 },
    { label: 'Run panel model', isDone: !!results },
    { label: 'Compare within R-sq', isDone: false },
    { label: 'Report generation', isDone: false }
  ];

  return (
    <div id="fe-lab-root" className="space-y-8 animate-in fade-in duration-500">
      {teachingState.isActive && teachingState.templateId === 'growth' && (
        <TeachingChecklist 
          steps={teachingChecklistSteps}
          notice="The difference between Pooled OLS and FE coefficients highlights the impact of unobserved country heterogeneity."
          typicalMistake="Including time-invariant variables (like 'LandLocked') in a Fixed Effects model causes them to be dropped."
          discussionQuestion="Why might inflation have a different impact on growth in the short run vs long run?"
          nextExtension="Implement Year Fixed Effects to control for common global shocks like the 2008 crisis."
        />
      )}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Fixed Effects Laboratory</h2>
          <p className="text-sm text-slate-500 mt-1 italic font-serif">Account for unobserved cross-sectional heterogeneity in panel data structures.</p>
        </div>
        <div className="flex flex-col gap-3">
          <button 
            id="run-panel-model-btn"
            disabled={isLoading || isEstimating}
            onClick={handleRun}
            className="btn-primary flex items-center justify-center gap-2 font-bold px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider bg-stone-900 hover:bg-stone-800 text-white shadow-md disabled:opacity-50 transition-all"
          >
            {isEstimating ? (
              <div className="flex items-center gap-2">
                 <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                 <span>Estimating...</span>
              </div>
            ) : (
              <>
                <Play className="w-4 h-4 fill-current" />
                <span>Run Panel Model</span>
              </>
            )}
          </button>
          {estimationError && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2 max-w-sm">
              <AlertCircle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>
                {estimationError}
              </div>
            </div>
          )}
        </div>
      </div>

      <ModuleIntroCard 
        title="Fixed Effects"
        description="Fixed Effects (FE) allows you to control for all time-invariant unobserved characteristics of your entities (like country culture, geographic traits, or stable firm management style)."
        useWhen="You have panel data (repeated observations of the same entities over time) and fear that unobserved traits are correlated with your regressors."
        requires={[
          "Entity identifier variable",
          "Time identifier variable",
          "Within-entity variation in regressors"
        ]}
        youWillGet={[
          "Within-transformed coefficients",
          "Within-R² (explaining variation over time)",
          "Control for entity-level selection bias"
        ]}
        pitfalls={[
          "Time-invariant variables are dropped/omitted",
          "Loss of degrees of freedom with many entities",
          "Assumption of strict exogeneity"
        ]}
        example="Studying EU economic growth: Controlling for country-specific baseline traits to isolate the effect of inflation changes within countries."
      />

      <MistakeDetector mistakes={mistakes} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Panel Config */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card-premium p-6 space-y-6 bg-white border border-stone-200 rounded-2xl shadow-sm">
            <div>
              <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-4 font-mono">Panel Identity</h3>
              <div className="grid grid-cols-2 gap-4">
                 <div className="space-y-1.5">
                   <div className="flex items-center gap-1">
                     <label className="text-[9px] font-bold text-stone-500 uppercase tracking-tight block font-mono">Entity (i)</label>
                     <button
                       type="button"
                       onClick={() => setActiveHelp("entity")}
                       className="p-0.5 rounded-full text-stone-400 hover:text-indigo-600 hover:bg-stone-100 transition-all cursor-pointer"
                       title="Toggle Academic Explanation"
                     >
                       <Info className="w-3 h-3" />
                     </button>
                   </div>
                   <select 
                     id="entity-id-select"
                     value={entityId}
                     onChange={(e) => setEntityId(e.target.value)}
                     className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg outline-none font-bold text-stone-800 focus:ring-2 focus:ring-stone-500/10"
                   >
                     <option value="">Select ID...</option>
                     {/* CRASH GUARD ADDED */}
                      {(idVars || []).map(v => <option key={v} value={v}>{v}</option>)}
                   </select>
                 </div>
                 <div className="space-y-1.5">
                   <div className="flex items-center gap-1">
                     <label className="text-[9px] font-bold text-stone-500 uppercase tracking-tight block font-mono">Time (t)</label>
                     <button
                       type="button"
                       onClick={() => setActiveHelp("time")}
                       className="p-0.5 rounded-full text-stone-400 hover:text-indigo-600 hover:bg-stone-100 transition-all cursor-pointer"
                       title="Toggle Academic Explanation"
                     >
                       <Info className="w-3 h-3" />
                     </button>
                   </div>
                   <select 
                     id="time-var-select"
                     value={timeId}
                     onChange={(e) => setTimeId(e.target.value)}
                     className="w-full p-2.5 text-xs bg-white border border-stone-200 rounded-lg outline-none font-bold text-stone-800 focus:ring-2 focus:ring-stone-500/10"
                   >
                     <option value="">Select Time...</option>
                     {/* CRASH GUARD ADDED */}
                      {(idVars || []).map(v => <option key={v} value={v}>{v}</option>)}
                   </select>
                 </div>
              </div>
            </div>

            <div className="pt-6 border-t border-stone-100">
               <div className="flex items-center gap-1.5 mb-3">
                 <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-mono">Model Transformation</h3>
                 <button
                   type="button"
                   onClick={() => setActiveHelp("transformation")}
                   className="p-0.5 rounded-full text-stone-400 hover:text-indigo-600 hover:bg-stone-100 transition-all cursor-pointer"
                   title="Toggle Academic Explanation"
                 >
                   <Info className="w-3 h-3" />
                 </button>
               </div>
               <select
                 id="model-type-select"
                 value={modelType}
                 onChange={(e) => setModelType(e.target.value as 'pooled' | 'fe')}
                 className="w-full bg-white border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800 focus:ring-2 focus:ring-stone-500/10 outline-none"
               >
                 <option value="fe">Fixed Effects Model (Within-Group)</option>
                 <option value="pooled">Pooled OLS Model</option>
               </select>
               <p className="text-[9px] text-stone-400 mt-2 font-serif italic text-center leading-relaxed">
                 {modelType === 'fe' ? 'Eliminates time-invariant cross-sectional bias.' : 'Assumes no unobserved individual effects.'}
               </p>
               {modelType === 'fe' && (
                 <label className="mt-4 flex items-start gap-2 cursor-pointer">
                   <input
                     id="fe-cluster-se-checkbox"
                     type="checkbox"
                     checked={clusterSE}
                     onChange={(e) => setClusterSE(e.target.checked)}
                     className="mt-0.5 w-3.5 h-3.5 rounded border-stone-300 text-stone-900 focus:ring-stone-500/20"
                   />
                   <span className="text-[10px] text-stone-600 leading-relaxed">
                     <span className="font-bold">Cluster-robust SE</span> (by {panelConfig.entityId || 'entity'})
                     <span className="block text-[9px] text-stone-400 mt-0.5">Recommended whenever regressors are correlated within entities over time.</span>
                   </span>
                 </label>
               )}
            </div>

            <div className="pt-6 border-t border-stone-100">
               <div className="flex items-center gap-1.5 mb-3">
                 <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-mono">Dependent Outcome (Y)</h3>
                 <button
                   type="button"
                   onClick={() => setActiveHelp("dependent")}
                   className="p-0.5 rounded-full text-stone-400 hover:text-indigo-600 hover:bg-stone-100 transition-all cursor-pointer"
                   title="Toggle Academic Explanation"
                 >
                   <Info className="w-3 h-3" />
                 </button>
               </div>
               <select
                 id="dependent-var-select"
                 value={yVar}
                 onChange={(e) => {
                   const newY = e.target.value;
                   setYVar(newY);
                   setXVars((xVars || []).filter((v: string) => v !== newY));
                 }}
                 className="w-full bg-white border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800 focus:ring-2 focus:ring-stone-500/10 outline-none"
               >
                  <option value="">Select target variable...</option>
                  {/* CRASH GUARD ADDED */}
                   {(numericVars || []).map(v => <option key={v} value={v}>{v}</option>)}
               </select>
            </div>

            <div className="pt-6 border-t border-stone-100">
               <div className="flex items-center gap-1.5 mb-3">
                 <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-400 font-mono">Exogenous Regressors (X)</h3>
                 <button
                   type="button"
                   onClick={() => setActiveHelp("regressors")}
                   className="p-0.5 rounded-full text-stone-400 hover:text-indigo-600 hover:bg-stone-100 transition-all cursor-pointer"
                   title="Toggle Academic Explanation"
                 >
                   <Info className="w-3 h-3" />
                 </button>
               </div>
               <select
                 id="regressors-select"
                 multiple
                 value={xVars}
                 onChange={(e) => {
                   const selected = Array.from(e.target.selectedOptions).map(o => o.value);
                   setXVars(selected);
                 }}
                 className="w-full bg-white border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800 focus:ring-2 focus:ring-stone-500/10 outline-none h-36"
               >
                 {/* CRASH GUARD ADDED */}
                  {(numericVars || []).map(v => (
                   <option key={v} value={v}>
                     {v}
                   </option>
                 ))}
               </select>
               <p className="text-[10px] text-stone-400 mt-2 font-mono leading-relaxed">
                 * Hold Ctrl (Win) or Cmd (Mac) to select multiple variables.
               </p>
            </div>
          </div>

          <div id="theory-intuition-card" className="card-premium p-6 bg-stone-50 border border-stone-200 rounded-2xl shadow-sm">
             <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500 mb-4 font-mono">Theoretical Intuition</h3>
             <p className="text-xs text-stone-600 leading-relaxed font-serif italic">
               Fixed Effects account for time-invariant factors that are unique to each entity but not captured by other variables. 
               By focusing on &quot;within&quot; variation, we eliminate bias from omitted entity-specific traits.
             </p>
             <div className="mt-4 p-3 bg-white/50 border border-stone-100 rounded text-[9px] text-stone-500 font-mono">
                Dropped: Variables with zero within-group variance.
             </div>
          </div>
        </div>

        {/* Results Area */}
        <div className="lg:col-span-2 space-y-6">
          {!results ? (
            <div className="space-y-6">
              <ModelAssistant dataset={dataset} activeModule="FE" />
              <div id="fe-awaiting-card" className="card-premium h-full min-h-[300px] flex flex-col items-center justify-center p-20 text-center border-dashed border-stone-200 bg-stone-50/20 rounded-2xl">
                 <div className="p-4 bg-white rounded-full shadow-sm mb-4 border border-stone-100">
                  <Layers className="w-10 h-10 text-stone-300 animate-pulse" />
                 </div>
                 <h3 className="text-stone-900 font-bold tracking-tight">Panel Model Awaiting Inception</h3>
                 <p className="text-sm text-stone-500 max-w-xs mt-2 font-serif italic leading-relaxed">Specify your target variable, independent regressors, and click &quot;Run Panel Model&quot; to estimate.</p>
              </div>
            </div>
          ) : (
            <div id="fe-results-panel" className="space-y-8 animate-in fade-in slide-in-from-bottom-4">
               {/* Internal Workflow Navigation */}
               <div className="flex border-b border-stone-100 mb-8 overflow-x-auto custom-scrollbar">
                 {[
                   { id: 'estimation', label: '1. Estimation' },
                   { id: 'diagnostics', label: '2. Diagnostics' },
                   { id: 'interpretation', label: '3. Interpretation' }
                 ].map(step => (
                   <button
                     key={step.id}
                     id={`fe-step-${step.id}`}
                     onClick={() => setActiveStep(step.id as any)}
                     className={cn(
                       "px-6 py-3 text-[10px] font-bold uppercase tracking-widest transition-all border-b-2 whitespace-nowrap",
                       activeStep === step.id 
                         ? "border-stone-900 text-stone-900 font-bold" 
                         : "border-transparent text-stone-400 hover:text-stone-600"
                     )}
                   >
                     {step.label}
                   </button>
                 ))}
               </div>

               {activeStep === 'estimation' && (
                 <div id="fe-step-estimation-content" className="space-y-6 animate-in fade-in duration-300">
                    {/* Stat Tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 sm:gap-4">
                      {[
                        { label: modelType === 'fe' ? 'Within R²' : 'R-Squared', value: formatNum(results?.rSquared, 4), color: 'text-stone-900' },
                        { label: 'Adj. R²', value: formatNum(results?.adjRSquared, 4) },
                        { label: 'RMSE', value: formatNum(results?.rmse, 4) },
                        { label: 'AIC', value: formatNum(results?.aic, 2) },
                        { label: 'BIC', value: formatNum(results?.bic, 2) },
                        { label: 'N_Obs', value: results?.n?.toString() || (dataset.rowCount || 0).toString() }
                      ].map((stat) => (
                        <div key={stat.label} className="card-premium p-3 sm:p-4 min-h-[70px] flex flex-col justify-center bg-white border border-stone-200 rounded-xl shadow-sm">
                            <p className="text-[9px] uppercase font-bold text-stone-400 mb-1 font-mono tracking-tight">{stat.label}</p>
                            <p className={cn("text-base sm:text-lg font-bold tabular-nums", stat.color || "text-stone-800")}>{stat.value}</p>
                        </div>
                      ))}
                    </div>

                    <div className="flex justify-end pr-1">
                      <button 
                        id="fe-export-csv-btn"
                        onClick={handleDownloadResults}
                        className="text-[11px] font-bold text-stone-500 hover:text-stone-900 flex items-center gap-1.5 transition-colors font-mono"
                      >
                        <FileDown className="w-3.5 h-3.5" /> Export Results to CSV
                      </button>
                    </div>

                    <RegressionResultsTable
                      results={results}
                      dependentVar={yVar}
                      modelType={modelType === 'fe' ? 'panel_fe' : 'panel_re'}
                      xVariables={xVars}
                      options={resultsTableOptions}
                    />
                 </div>
               )}

               {activeStep === 'diagnostics' && (
                 <div id="fe-step-diagnostics-content" className="space-y-6 animate-in fade-in duration-300">
                    <DiagnosticCoach 
                      modelType={modelType === 'fe' ? 'FE' : 'OLS'} 
                      results={results} 
                      specification={`${yVar} ~ ${(xVars || []).join(' + ')} [${modelType.toUpperCase()}]`} 
                      modelId={activeHistoryItem?.id || ''}
                    />
                 </div>
               )}

               {activeStep === 'interpretation' && (
                 <div id="fe-step-interpretation-content" className="space-y-6 animate-in fade-in duration-300">
                    <CoefficientTranslator 
                      coefficients={results.coefficients}
                      yVar={yVar}
                      xVars={xVars}
                      modelType={modelType === 'fe' ? 'FE' : 'OLS'}
                    />
                    <div className="pt-6 border-t border-stone-100">
                      <CodeBridge
                        modelType={modelType === 'fe' ? 'fe' : 'ols'}
                        yVar={yVar}
                        xVars={xVars}
                        options={codeBridgeOptions}
                      />
                    </div>
                 </div>
               )}
            </div>
          )}
        </div>
      </div>

      {/* FE Parameter Companion Drawer */}
      <AnimatePresence>
        {activeHelp && (() => {
          const info = FE_HELP_INFO[activeHelp];
          return (
            <div className="fixed inset-0 z-50 flex justify-end" id="fe-parameter-help-overlay">
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveHelp(null)}
                className="absolute inset-0 bg-slate-900/40 backdrop-blur-xs cursor-pointer"
              />

              {/* Drawer Container */}
              <motion.div
                initial={{ x: "100%" }}
                animate={{ x: 0 }}
                exit={{ x: "100%" }}
                transition={{ type: "spring", damping: 30, stiffness: 300 }}
                className="relative w-full max-w-lg bg-white h-full shadow-2xl flex flex-col z-10 border-l border-slate-200"
              >
                {/* Header */}
                <div className="p-6 bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
                  <div className="flex items-center gap-3">
                    <Layers className="w-5 h-5 text-indigo-400 animate-pulse" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-400">Fixed Effects Desk</h4>
                      <p className="text-[10px] text-slate-400 font-sans">Panel Econometrics Companion</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setActiveHelp(null)}
                    className="p-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-white transition-all cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                  {/* Parameter Title */}
                  <div>
                    <h3 className="text-lg font-bold text-slate-900 font-sans tracking-tight">{info.title}</h3>
                    <p className="text-xs text-indigo-600 font-medium font-serif italic mt-0.5">{info.subtitle}</p>
                  </div>

                  {/* Economic Intuition */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Panel Intuition</h5>
                    <p className="text-xs text-slate-600 leading-relaxed font-sans">{info.intuition}</p>
                  </div>

                  {/* Mathematical Formulation */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Mathematical Specification</h5>
                    <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-center text-xs select-all shadow-inner border border-slate-800">
                      {info.math}
                    </div>
                  </div>

                  {/* Importance in Policy & Modeling */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Econometric Importance</h5>
                    <p className="text-xs text-slate-600 leading-relaxed font-sans">{info.importance}</p>
                  </div>

                  {/* Self-Test Challenge */}
                  <div className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide font-mono">UGC-NET / MA Level Self-Test</h4>
                    </div>

                    <p className="text-xs text-slate-700 font-medium leading-relaxed">
                      {info.question}
                    </p>

                    <div>
                      {!showExplanation ? (
                        <button
                          onClick={() => setShowExplanation(true)}
                          className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-bold tracking-wider uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-sm shadow-indigo-500/20"
                        >
                          <span>Reveal Analytical Answer</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="space-y-3 pt-2"
                        >
                          <div className="flex items-start gap-2 text-emerald-800 bg-emerald-50 p-3 rounded-xl border border-emerald-100 text-[11px] leading-relaxed">
                            <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                            <div>
                              <strong className="font-bold">Correct Scholarly Deduction:</strong>
                              <p className="mt-1 text-slate-600 font-sans">{info.answer}</p>
                            </div>
                          </div>
                          <button
                            onClick={() => setShowExplanation(false)}
                            className="text-[10px] text-slate-400 hover:text-slate-600 font-mono underline block"
                          >
                            Hide Answer
                          </button>
                        </motion.div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 bg-slate-50 border-t border-slate-100 text-center text-[10px] text-slate-400 font-serif italic">
                  Advanced multi-dimensional econometric model coaching.
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
