import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, BookOpen, Binary, ShieldCheck, Code, ArrowRight, Laptop, FlaskConical, Info, X, HelpCircle, Check, ChevronRight, Sparkles, AlertCircle, Plus, Scale } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useStore } from '../../store/useStore';
import { runQuantileRegression } from '../../lib/econometrics/quantile';
import { preprocessDataAndVars } from '../../lib/econometrics/ols';
import { getAuthHeaders, runSurveyOLS } from '../../services/apiClient';
import { DataPreviewMatrix } from '../shared/DataPreviewMatrix';
import RegressionResultsTable from '../shared/RegressionResultsTable';
import HypothesisTests from '../shared/HypothesisTests';
import ChartsPanel from '../shared/ChartsPanel';
import { CodeBridge } from '../shared/CodeBridge';
import { useNavigation } from '../../hooks/useNavigation';
import { cn } from '../../lib/utils';
import { RegressionResult } from '../../types';
import { useSessionReport } from '../../context/SessionReportContext';
import { getAllVariableSelectionWarnings } from '../../lib/econometrics/hygiene';

interface OLSLabProps {
  dataset: any | null;
  onRunComplete: (results: RegressionResult, spec: string) => void;
  isLoading?: boolean;
  onAddToRobustness?: (results: RegressionResult, spec: string) => void;
  variableMetadata?: any;
}

const OLS_HELP_INFO = {
  dependent: {
    title: "Dependent Outcome Variable (Y)",
    subtitle: "The Endogenous Regressand",
    intuition: "In economic modelling, the dependent variable (Y) represents the phenomenon or outcome we want to explain. For instance, when studying consumer demand, Y would be 'Quantity Demanded'. Standard OLS breaks down its total variance into what can be systematically explained by our regressors (ESS) and what remains unexplained (RSS).",
    math: "Y_i = β₀ + β₁X₁ᵢ + β₂X₂ᵢ + ... + uᵢ",
    importance: "To preserve OLS properties like efficiency, Y must be continuous. If Y is binary (e.g., whether a household is in poverty: 0 or 1), classical OLS is no longer the Best Linear Unbiased Estimator (BLUE), and you should use binary estimators like Logit or Probit in the 'Limited Dependent' tab.",
    question: "A student estimates a Wage equation using OLS. If the dependent variable 'Wage' has a severe right-skew, what classical OLS adaptation is conventionally applied, and why?",
    answer: "Conventionally, economists apply a logarithmic transformation to the dependent variable, estimating 'ln(Wage)'. This controls the skewness, stabilizes variance (reducing heteroskedasticity), and allows coefficients to be interpreted as percentage changes (semi-elasticity), which aligns better with marginal productivity theories."
  },
  independent: {
    title: "Exogenous Regressors (X)",
    subtitle: "Predictor Vector & Matrix of Covariates",
    intuition: "These are the independent variables chosen to explain the dependent outcome. For OLS to provide consistent, unbiased, causal estimates, we assume the Zero Conditional Mean (Strict Exogeneity). This means the unobserved error term contains absolutely no information correlated with our selected predictors.",
    math: "E[uᵢ | Xᵢ] = 0",
    importance: "If this assumption is violated, the OLS coefficients suffer from endogeneity bias. This is the central threat to econometric identification, typically caused by omitted variables (e.g., omitting 'Ability' in a education-wage regression), measurement error, or reverse causality.",
    question: "If two independent variables in your model are highly correlated (e.g., GDP per capita and household income), what statistical symptom will you observe, and does it bias your beta estimates?",
    answer: "You will observe Multicollinearity. Multicollinearity does NOT bias the beta estimates; they remain unbiased and consistent. However, it inflates the standard errors of the coefficients, leading to wide confidence intervals and low t-statistics, making it difficult to establish the statistical significance of individual regressors."
  },
  robust: {
    title: "Robust Standard Errors (HC1)",
    subtitle: "Heteroskedasticity-Consistent Covariance Estimator",
    intuition: "Under classical Gauss-Markov assumptions, errors are assumed to have a constant variance across all observations (homoskedasticity). In real economic data (e.g., firms of wildly varying sizes), this is rarely true: larger firms have much higher error variance. Robust standard errors adjust our inference to correct for this without altering the coefficients.",
    math: "Var(uᵢ | Xᵢ) = σᵢ²  ≠  σ²",
    importance: "If heteroskedasticity is present and we use classical standard errors, our t-statistics will be overconfident (biased downwards), leading to false positives (Type I errors). HC1 robust standard errors provide larger, more conservative standard errors to protect your hypotheses.",
    question: "Does checking 'Robust SE (HC1)' change the estimated slope coefficient (β) values in your OLS output?",
    answer: "No. Heteroskedasticity-consistent adjustments (like HC1, HC2, or HC3) ONLY correct the standard errors, variance-covariance matrix, t-statistics, and p-values. The point estimates of the coefficients (β) remain exactly identical to standard OLS. Their efficiency is slightly reduced under true homoskedasticity, but they remain unbiased."
  }
};

export default function OLSLab({ dataset: globalDataset, onRunComplete, isLoading: parentLoading, onAddToRobustness, variableMetadata }: OLSLabProps) {
  const workerRef = useRef<Worker | null>(null);

  useEffect(() => {
    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
      }
    };
  }, []);

  const [dataset, setDataset] = useState<any | null>(globalDataset);
  const {
    dependentVar,
    setDependentVar,
    regressors: independentVars,
    setRegressors: setIndependentVars,
    addToast,
    pendingOlsFix,
    setPendingOlsFix
  } = useStore();
  const lastDatasetNameRef = useRef<string | undefined>(globalDataset?.name);
  const { addToReport } = useSessionReport();
  const [seEstimator, setSeEstimator] = useState<'None' | 'HC0' | 'HC1' | 'HC2' | 'HC3' | 'Cluster'>('HC1');
  const [clusterVar, setClusterVar] = useState<string>('');
  const [useWildBootstrap, setUseWildBootstrap] = useState<boolean>(false);
  const [wildBootstrapB, setWildBootstrapB] = useState<number>(999);
  const useRobust = seEstimator !== 'None';

  // Memoized so these keep a stable reference across unrelated re-renders
  // (e.g. toasts, autosave ticks) -- RegressionResultsTable resets its
  // in-memory "Add Specification" comparison columns whenever this object's
  // reference changes, so a fresh literal here would silently wipe user work.
  const resultsTableClusterVar = seEstimator === 'Cluster' ? clusterVar : undefined;
  const resultsTableOptions = useMemo(() => ({
    robust: useRobust,
    clusterVar: resultsTableClusterVar,
    seType: seEstimator
  }), [useRobust, resultsTableClusterVar, seEstimator]);

  const codeBridgeOptions = useMemo(() => ({
    robust: useRobust,
    cluster: resultsTableClusterVar,
    seType: (seEstimator === 'HC0' || seEstimator === 'HC1' || seEstimator === 'HC2' || seEstimator === 'HC3') ? seEstimator : undefined,
    tau: quantileVal
  }), [useRobust, resultsTableClusterVar, seEstimator, quantileVal]);

  const [estimationResults, setEstimationResults] = useState<any>(null);
  const [isEstimating, setIsEstimating] = useState(false);
  const [regressionMode, setRegressionMode] = useState<'ols' | 'quantile'>('ols');
  const [quantileVal, setQuantileVal] = useState<number>(0.5);
  const [estimationError, setEstimationError] = useState<string | null>(null);

  // Complex Survey Design states
  const [enableSurvey, setEnableSurvey] = useState<boolean>(false);
  const [surveyWeightVar, setSurveyWeightVar] = useState<string>('');
  const [surveyClusterVar, setSurveyClusterVar] = useState<string>('');
  const [surveyStrataVar, setSurveyStrataVar] = useState<string>('');
  const [surveyFpc, setSurveyFpc] = useState<string>('');
  const [isSurveyCollapsed, setIsSurveyCollapsed] = useState<boolean>(true);

  const [activeHelp, setActiveHelp] = useState<"dependent" | "independent" | "robust" | null>(null);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);
  const [isHypothesisOpen, setIsHypothesisOpen] = useState<boolean>(false);

  const { navigateTo } = useNavigation();

  const hygieneWarnings = getAllVariableSelectionWarnings(
    dependentVar,
    independentVars || [],
    dataset?.data || dataset?.rows || []
  );

  // Sync with global dataset if it changes
  useEffect(() => {
    setShowExplanation(false);
  }, [activeHelp]);
  useEffect(() => {
    if (globalDataset) {
      setDataset(globalDataset);
      // FIX: only reset the committed model spec when the dataset actually changes
      // (by name) -- not on every new object reference. A fix action (e.g. adding a
      // derived ln_<var> column) produces a new reference for the *same* dataset and
      // must not wipe the y/x selection it just set.
      if (globalDataset.name !== lastDatasetNameRef.current) {
        setDependentVar('');
        setIndependentVars([]);
        setEstimationResults(null);
        setEstimationError(null);
      }
      lastDatasetNameRef.current = globalDataset.name;
    }
  }, [globalDataset]);

  // Consume a pending auto-fix (from Lab Partner): force robust SE if requested,
  // then re-run once dependentVar/independentVars/seEstimator are all in sync.
  useEffect(() => {
    if (!pendingOlsFix || !dataset || !dependentVar || (independentVars || []).length === 0) return;
    if (pendingOlsFix.forceRobust && seEstimator === 'None') {
      setSeEstimator('HC1');
      return; // wait for the re-render with the updated seEstimator before running
    }
    executeRegression();
    setPendingOlsFix(null);
    addToast('success', 'Fix Applied', 'Re-ran the model with the requested adjustment.');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOlsFix, dataset, dependentVar, independentVars, seEstimator]);

  const handleToggleIndependent = (variable: string) => {
    if ((independentVars || []).includes(variable)) {
      // CRASH GUARD ADDED
      setIndependentVars((independentVars || []).filter(v => v !== variable));
    } else {
      setIndependentVars([...(independentVars || []), variable]);
    }
  };

  const executeRegression = async () => {
    // CRASH GUARD ADDED
    if (!dataset || !dependentVar || (independentVars || []).length === 0) return;
    // FIX: validate that selected variables actually exist as columns in the current dataset
    // CRASH GUARD ADDED
    const cols = ((dataset?.variables) || []).map((v: any) => v.name) || dataset?.headers || [];
    // CRASH GUARD ADDED
    const missingVars = [dependentVar, ...(independentVars || [])].filter((v: string) => v && !cols.includes(v));
    // CRASH GUARD ADDED
    if ((missingVars || []).length > 0) {
      setEstimationError(`Variable(s) not found in dataset: ${missingVars.join(', ')}. Please re-select your variables.`);
      return;
    }

    if (regressionMode === 'ols' && !enableSurvey && seEstimator === 'Cluster' && !clusterVar) {
      setEstimationError("Please select a clustering variable for Clustered Standard Errors.");
      return;
    }

    const dataRows = dataset.data || dataset.rows || [];
    // CRASH GUARD ADDED
    if ((dataRows || []).length === 0) {
      setEstimationError("The selected dataset is empty. Please load a dataset with valid observations.");
      return;
    }

    setIsEstimating(true);
    try {
      // Perform pre-checks to give highly descriptive errors for insufficient observations
      const { mappedData, finalYVar, finalXVars } = preprocessDataAndVars(dataRows, dependentVar, independentVars);
      const varsToObserve = [finalYVar, ...finalXVars];
      // CRASH GUARD ADDED
      const cleanRows = (mappedData || []).filter(row => {
        return row && varsToObserve.every(v => row[v] !== undefined && row[v] !== null && !isNaN(parseFloat(row[v])));
      });

      // CRASH GUARD ADDED
      const n = (cleanRows || []).length;
      // CRASH GUARD ADDED
      const k = (finalXVars || []).length + 1; // variables + intercept

      if (n === 0) {
        throw new Error(`All observations contain missing or non-numeric values for the selected variables: ${[dependentVar, ...independentVars].join(', ')}.`);
      }

      if (regressionMode === 'ols') {
        if (!enableSurvey && n < k) {
          throw new Error(`Insufficient observations for estimation. Model has ${k} parameters (including intercept) but only ${n} valid observations remain after filtering missing values.`);
        }
      } else {
        if (n < k + 1) {
          throw new Error(`Insufficient observations for Quantile Regression. Model has ${k} parameters (including intercept) but only ${n} valid observations remain after filtering missing values. Quantile estimation requires at least ${k + 1} observations.`);
        }
      }

      let data;
      if (regressionMode === 'ols') {
        if (enableSurvey) {
          // Preprocess for survey regression, ensuring survey-related columns are also clean
          const varsToObserveSurvey = [...varsToObserve];
          if (surveyWeightVar) varsToObserveSurvey.push(surveyWeightVar);
          if (surveyClusterVar) varsToObserveSurvey.push(surveyClusterVar);
          if (surveyStrataVar) varsToObserveSurvey.push(surveyStrataVar);

          // CRASH GUARD ADDED
          const cleanSurveyRows = (mappedData || []).filter(row => {
            return row && varsToObserveSurvey.every(v => row[v] !== undefined && row[v] !== null && !isNaN(parseFloat(row[v])));
          });

          // CRASH GUARD ADDED
          const nSurvey = (cleanSurveyRows || []).length;
          // CRASH GUARD ADDED
          const kSurvey = (finalXVars || []).length + 1; // variables + constant

          if (nSurvey < kSurvey) {
            throw new Error(`Insufficient observations after filtering for survey variables. Model has ${kSurvey} parameters but only ${nSurvey} observations with complete data remain.`);
          }

          // Build vectors
          // CRASH GUARD ADDED
          const y = (cleanSurveyRows || []).map((row: any) => parseFloat(row[finalYVar]));
          // CRASH GUARD ADDED
          const X = (cleanSurveyRows || []).map((row: any) => {
            // CRASH GUARD ADDED
            return [1.0, ...(finalXVars || []).map(v => parseFloat(row[v]))];
          });
          const variable_names = ['Intercept', ...finalXVars];

          const weights = surveyWeightVar
            // CRASH GUARD ADDED
            ? (cleanSurveyRows || []).map((row: any) => parseFloat(row[surveyWeightVar]))
            : Array(nSurvey).fill(1.0);

          const cluster_var = surveyClusterVar
            // CRASH GUARD ADDED
            ? (cleanSurveyRows || []).map((row: any) => row[surveyClusterVar])
            : Array.from({ length: nSurvey }, (_, i) => i);

          const strata_var = surveyStrataVar
            // CRASH GUARD ADDED
            ? (cleanSurveyRows || []).map((row: any) => row[surveyStrataVar])
            : Array(nSurvey).fill(1);

          const fpc = surveyFpc ? parseFloat(surveyFpc) : null;

          // Call API
          data = await runSurveyOLS({
            y,
            X,
            weights,
            cluster_var,
            strata_var,
            variable_names,
            fpc
          });
        } else {
          if (workerRef.current) {
            workerRef.current.terminate();
          }

          workerRef.current = new Worker(new URL('../../workers/bootstrap.worker.ts', import.meta.url), { type: 'module' });

          const workerPromise = new Promise<any>((resolve, reject) => {
            workerRef.current!.onmessage = (e) => {
              if (e.data.success) {
                resolve(e.data.results);
              } else {
                reject(new Error(e.data.error));
              }
            };
            workerRef.current!.onerror = (e) => {
              reject(new Error("Worker failed: " + e.message));
            };
          });

          workerRef.current.postMessage({
            data: dataRows,
            yVar: dependentVar,
            xVars: independentVars,
            includeIntercept: true,
            robust: seEstimator !== 'None' && seEstimator !== 'Cluster',
            robustType: (seEstimator === 'Cluster' || seEstimator === 'None') ? 'HC1' : seEstimator,
            clusterVar: seEstimator === 'Cluster' ? clusterVar : undefined,
            useWildBootstrap: seEstimator === 'Cluster' ? useWildBootstrap : false,
            wildBootstrapB: wildBootstrapB
          });

          data = await workerPromise;
        }
      } else {
        // Run client-side quantile regression
        data = runQuantileRegression(dataRows, dependentVar, independentVars, quantileVal);
      }
      
      setEstimationResults(data);
      setEstimationError(null);
      
      const spec = regressionMode === 'ols' 
        ? `${dependentVar} ~ ${independentVars.join(' + ')} ${enableSurvey ? '(Survey Weighted OLS)' : '(OLS)'}`
        : `${dependentVar} ~ ${independentVars.join(' + ')} (Quantile: ${quantileVal})`;
      onRunComplete(data, spec);
    } catch (error: any) {
      console.error("Estimation protocol error:", error);
      setEstimationError(error.message || 'Estimation failed');
    } finally {
      setIsEstimating(false);
    }
  };

  const handleAddToReport = () => {
    if (!estimationResults) return;

    const coefficientTable = {
      title: "Model Coefficients and Inferential Statistics",
      headers: ["Regressor", "Beta Coefficient", "Std. Error", "t-statistic", "p-value", "[95% Conf. Interval]"],
      // CRASH GUARD ADDED
      rows: (estimationResults.coefficients || []).map((c: any) => [
        c.variable,
        c.estimate,
        c.stdError,
        c.tStat,
        c.pValue,
        `${c.confLow.toFixed(4)} to ${c.confHigh.toFixed(4)}`
      ]),
      footnote: `Dependent variable: ${dependentVar}. ` + (
        seEstimator === 'None'
          ? "Standard errors assume homoskedasticity (classical standard errors)."
          : seEstimator === 'Cluster'
          ? `Standard errors are clustered on '${clusterVar}'${useWildBootstrap ? ' with wild cluster bootstrap' : ''}.`
          : `Standard errors are robust to heteroskedasticity (${seEstimator} sandwich estimator).`
      )
    };

    const fitTable = {
      title: "Goodness-of-Fit and Diagnostic Metrics",
      headers: ["Statistic", "Value"],
      // CRASH GUARD ADDED
      rows: [
        ["Observations (N)", estimationResults.n],
        ["R-Squared", estimationResults.rSquared],
        ["Adjusted R-Squared", estimationResults.adjRSquared],
        ["Residual Standard Error (RMSE)", estimationResults.rmse],
        ["F-Statistic", estimationResults.fStat || "N/A"],
        ["Durbin-Watson Test", estimationResults.durbinWatson || "N/A"],
        ["Breusch-Pagan (p-val)", estimationResults.breuschPaganPValue !== undefined ? estimationResults.breuschPaganPValue : "N/A"]
      ].filter(row => row[1] !== "N/A" && row[1] !== null),
      footnote: seEstimator === 'None' 
        ? "Classical standard errors estimated." 
        : seEstimator === 'Cluster' 
        ? `Clustered standard errors (clustered on '${clusterVar}') applied.` 
        : `Heteroskedasticity-robust standard errors (${seEstimator}) applied.`
    };

    const notes = [
      `OLS model specified with regressors: ${independentVars.join(', ')}.`,
      enableSurvey 
        ? `Model corrected for complex survey design: probability weights defined by '${surveyWeightVar || "equal"}', clustered on Primary Sampling Unit '${surveyClusterVar || "none"}', stratified by '${surveyStrataVar || "none"}'.`
        : seEstimator === 'None'
        ? "Standard homoskedasticity assumptions hold."
        : seEstimator === 'Cluster'
        ? `Clustered standard errors applied to correct for group-level correlation (clustered on '${clusterVar}').`
        : `${seEstimator} robust sandwich estimator applied to correct standard errors for heteroskedasticity.`
    ];

    addToReport({
      id: `ols-${Date.now()}`,
      timestamp: new Date(),
      moduleType: "OLS Regression",
      title: `${dependentVar} on ${independentVars.join(' + ')}`,
      tables: [coefficientTable, fitTable],
      notes
    });

    addToast('success', 'Report Updated', 'OLS model output added to your active Session Report.');
  };

  // Helper to get variable names for selection
  // CRASH GUARD ADDED
  const variableNames = ((dataset?.variables) || []).map((v: any) => v.name) || dataset?.headers || [];

  return (
    <div className="space-y-12 max-w-7xl mx-auto pb-24 px-4 animate-in fade-in duration-1000">
      
      {/* 1. Data Ingestion Phase */}
      {!dataset ? (
        <section className="flex flex-col items-center justify-center py-24 px-6 border-2 border-dashed border-slate-800 rounded-2xl bg-slate-900/50">
          <div className="w-16 h-16 bg-slate-800 rounded-full flex items-center justify-center mb-6">
            <Binary className="w-8 h-8 text-slate-400" />
          </div>
          <h2 className="text-xl font-bold text-slate-200 mb-2">No dataset loaded yet</h2>
          <p className="text-slate-400 text-center max-w-md mb-8">
            You need to upload or select a dataset before running an Ordinary Least Squares (OLS) regression.
          </p>
          <button 
            onClick={() => navigateTo('data')}
            className="flex items-center gap-2 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-slate-900 rounded-lg font-bold transition-colors"
          >
            <Laptop className="w-5 h-5" />
            Go to Data Upload Lab
          </button>
        </section>
      ) : (
        <section className="space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
               <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center text-white font-mono text-xs">01</div>
               <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">Empirical Baseline Established</h3>
            </div>
            <button 
              onClick={() => {
                setDataset(null);
                setEstimationResults(null);
              }}
              className="text-[10px] font-bold text-slate-400 hover:text-red-500 transition-colors uppercase tracking-widest font-mono"
            >
              Reset Matrix
            </button>
          </div>
          <DataPreviewMatrix dataset={dataset} />
        </section>
      )}

      {/* 2. Analytical Configuration */}
      {dataset && (
        <section className="space-y-6 animate-in slide-in-from-bottom-8 duration-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-slate-900 flex items-center justify-center text-white font-mono text-xs">02</div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">Structural Specification</h3>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex bg-slate-100 p-1.5 rounded-2xl w-full max-w-sm">
              <button
                onClick={() => { setRegressionMode('ols'); setEstimationResults(null); }}
                className={cn(
                  "flex-1 py-2 rounded-xl text-[10px] font-bold transition-all uppercase tracking-wider font-mono",
                  regressionMode === 'ols' 
                    ? "bg-white text-slate-900 shadow-sm font-bold" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                Classical OLS
              </button>
              <button
                onClick={() => { setRegressionMode('quantile'); setEstimationResults(null); }}
                className={cn(
                  "flex-1 py-2 rounded-xl text-[10px] font-bold transition-all uppercase tracking-wider font-mono",
                  regressionMode === 'quantile' 
                    ? "bg-white text-slate-900 shadow-sm font-bold" 
                    : "text-slate-400 hover:text-slate-600"
                )}
              >
                Quantile Reg
              </button>
            </div>
            <button
              onClick={() => {
                setDependentVar('');
                setIndependentVars([]);
                addToast('info', 'Selections Cleared', 'All variable selections have been cleared.');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-red-50 hover:text-red-600 text-slate-600 rounded-xl text-xs font-bold font-mono tracking-wider transition-colors border border-slate-200 cursor-pointer"
            >
              Clear All Selections
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-8 flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Dependent Variable Selector */}
                <div className="p-8 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4 hover:border-indigo-200 transition-all relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase block font-mono">Dependent (Y)</label>
                      <button
                        type="button"
                        onClick={() => setActiveHelp("dependent")}
                        className="p-1 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer"
                        title="Toggle Academic Explanation"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <Binary className="w-4 h-4 text-indigo-500" />
                  </div>
                  <select 
                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 text-sm font-bold text-slate-800 focus:bg-white focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all appearance-none"
                    value={dependentVar}
                    onChange={(e) => setDependentVar(e.target.value)}
                  >
                    <option value="">Select target outcome...</option>
                    {/* CRASH GUARD ADDED */}
                    {(variableNames || []).map((v: string) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-400 italic font-serif leading-relaxed">
                    Identify the endogenous variable whose variance you intend to decompose.
                  </p>
                </div>

                {/* Independent Variable Grid */}
                <div className="p-8 bg-white border border-slate-200 rounded-3xl shadow-sm space-y-4 hover:border-indigo-200 transition-all relative">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1.5">
                      <label className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase block font-mono">Exogenous Regressors (X)</label>
                      <button
                        type="button"
                        onClick={() => setActiveHelp("independent")}
                        className="p-1 rounded-full text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all cursor-pointer"
                        title="Toggle Academic Explanation"
                      >
                        <Info className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <FlaskConical className="w-4 h-4 text-emerald-500" />
                  </div>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {/* CRASH GUARD ADDED */}
                    {((variableNames || []).filter((v: string) => v !== dependentVar) || []).map((v: string) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => handleToggleIndependent(v)}
                        className={cn(
                          "text-left text-[11px] p-3 rounded-xl transition-all border font-mono uppercase tracking-tight flex justify-between items-center group",
                          independentVars.includes(v) 
                            ? "bg-slate-900 border-slate-900 text-white font-bold shadow-lg" 
                            : "bg-slate-50 border-slate-100 text-slate-500 hover:border-indigo-200 hover:bg-white hover:text-slate-900"
                        )}
                      >
                        <span>{v}</span>
                        <div className={cn(
                          "w-2 h-2 rounded-full transition-all group-hover:scale-125",
                          independentVars.includes(v) ? "bg-indigo-400 shadow-[0_0_8px_rgba(129,140,248,0.8)]" : "bg-slate-200"
                        )} />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Adjustments & Logic Row */}
              <div className="p-8 bg-slate-950 rounded-3xl text-white shadow-2xl relative overflow-hidden group">
                 <div className="absolute top-0 right-0 p-8 opacity-5">
                    <ShieldCheck className="w-32 h-32" />
                 </div>
                 <div className="relative z-10 space-y-6">
                    <div className="flex items-center justify-between">
                       <h4 className="text-[10px] font-bold text-indigo-400 tracking-widest uppercase font-mono">Statistical Safeguards</h4>
                       <span className="text-[10px] text-slate-500 font-serif italic">Manifold Adjustments</span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <div className="flex items-center gap-1.5">
                          <label className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase block font-mono">
                            Standard Errors Type
                          </label>
                          <button
                            type="button"
                            onClick={() => setActiveHelp("robust")}
                            className="p-1 rounded-full text-slate-400 hover:text-indigo-400 transition-all cursor-pointer inline-flex items-center justify-center"
                            title="Toggle Academic Explanation"
                          >
                            <Info className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <select
                          value={seEstimator}
                          onChange={(e) => setSeEstimator(e.target.value as any)}
                          className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-xs font-bold text-slate-200 focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all cursor-pointer"
                        >
                          <option value="None" className="bg-slate-950 text-slate-200">
                            None (Classical SE — assumes homoscedasticity)
                          </option>
                          <option value="HC0" className="bg-slate-950 text-slate-200">
                            HC0 — White (1980) basic sandwich
                          </option>
                          <option value="HC1" className="bg-slate-950 text-slate-200">
                            HC1 — Stata default (HC0 × n/(n-k))
                          </option>
                          <option value="HC2" className="bg-slate-950 text-slate-200">
                            HC2 — Leverage adjusted e²/(1-h)
                          </option>
                          <option value="HC3" className="bg-slate-950 text-slate-200">
                            HC3 — Small sample leverage e²/(1-h)²
                          </option>
                          <option value="Cluster" className="bg-slate-950 text-slate-200">
                            Clustered SE — group-level correction
                          </option>
                        </select>
                      </div>

                      {/* Conditional Cluster Variable Selector */}
                      {seEstimator === 'Cluster' ? (
                        <div className="space-y-4 animate-in fade-in duration-300">
                          <div className="space-y-2">
                            <label className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase block font-mono">
                              Cluster Variable (Group ID)
                            </label>
                            <select
                              value={clusterVar}
                              onChange={(e) => setClusterVar(e.target.value)}
                              className="w-full bg-slate-900 border border-white/10 rounded-2xl p-4 text-xs font-bold text-slate-200 focus:bg-slate-900 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all cursor-pointer"
                            >
                              <option value="" className="bg-slate-950 text-slate-400">
                                -- Select Cluster / Group Variable --
                              </option>
                              {/* CRASH GUARD ADDED */}
                              {(variableNames || []).map((v: string) => (
                                <option key={v} value={v} className="bg-slate-950 text-slate-200">
                                  {v}
                                </option>
                              ))}
                            </select>
                          </div>

                          {clusterVar && (
                            <div className="space-y-3 p-4 bg-slate-900/60 border border-white/5 rounded-2xl">
                              <label className="flex items-center gap-3 cursor-pointer select-none">
                                <input
                                  type="checkbox"
                                  checked={useWildBootstrap}
                                  onChange={(e) => setUseWildBootstrap(e.target.checked)}
                                  className="w-4 h-4 rounded border-white/10 bg-slate-950 text-indigo-500 focus:ring-indigo-500 focus:ring-offset-slate-950"
                                />
                                <div className="flex flex-col">
                                  <span className="text-[11px] font-bold text-slate-200">
                                    Use Wild Bootstrap (recommended when clusters &lt; 30)
                                  </span>
                                  <span className="text-[9px] text-slate-500 leading-tight">
                                    Protects against overconfident inference in small group counts
                                  </span>
                                </div>
                              </label>

                              {(() => {
                                const rows = dataset?.data || dataset?.rows || [];
                                // CRASH GUARD ADDED
                                const vals = (rows || []).map((r: any) => r[clusterVar]).filter((v: any) => v !== undefined && v !== null && v !== '');
                                const nClusters = new Set(vals).size;
                                if (useWildBootstrap && nClusters < 30 && nClusters > 0) {
                                  return (
                                    <div className="flex items-start gap-2 p-2.5 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                                      <div className="text-[10px] text-amber-300 font-medium leading-relaxed">
                                        ⚠️ Only <span className="font-bold">{nClusters}</span> clusters — wild bootstrap recommended.
                                      </div>
                                    </div>
                                  );
                                }
                                return null;
                              })()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="p-4 bg-white/5 border border-white/10 rounded-2xl opacity-40 flex items-center justify-between h-[68px] mt-6">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-[11px] font-bold text-slate-300">Adjustment Active</span>
                            <span className="text-[9px] text-slate-500 font-serif italic">
                              {seEstimator === 'None' ? 'Assumes constant error variance' : `${seEstimator} sandwich adjustment enabled`}
                            </span>
                          </div>
                          <div className={`w-2 h-2 rounded-full ${seEstimator === 'None' ? 'bg-slate-700' : 'bg-emerald-400'}`} />
                        </div>
                      )}
                    </div>
                 </div>
              </div>
            </div>

              {/* Complex Survey Design Collapsible Panel */}
              <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm hover:border-indigo-200 transition-all space-y-4">
                <button
                  type="button"
                  onClick={() => setIsSurveyCollapsed(!isSurveyCollapsed)}
                  className="w-full flex items-center justify-between font-mono text-[10px] font-bold text-slate-400 tracking-widest uppercase cursor-pointer outline-none"
                >
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                    <span>Complex Survey Design (svyset)</span>
                  </div>
                  <span className="text-indigo-600 hover:text-indigo-800 transition-colors">
                    {isSurveyCollapsed ? "[ EXPAND ]" : "[ COLLAPSE ]"}
                  </span>
                </button>

                {!isSurveyCollapsed && (
                  <div className="pt-2 space-y-6 animate-in slide-in-from-top-4 duration-300">
                    <p className="text-[11px] text-slate-500 font-serif italic leading-relaxed">
                      Survey-weighted OLS corrects for complex sampling design (stratified multi-stage clustering). Use when analyzing Indian government or global household datasets (NSSO, NFHS, PLFS, IHDS, DHS).
                    </p>

                    {/* Enable Toggle */}
                    <label className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl cursor-pointer hover:bg-slate-100/50 transition-all select-none">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-xs font-bold text-slate-800 tracking-tight">Enable Survey Weighting & Design Correction</span>
                        <span className="text-[9px] text-slate-400 font-serif italic">Switches estimation to the Taylor-linearized Python engine</span>
                      </div>
                      <input 
                        type="checkbox" 
                        checked={enableSurvey} 
                        onChange={(e) => setEnableSurvey(e.target.checked)}
                        className="w-5 h-5 rounded-lg bg-white border-slate-300 text-indigo-500 focus:ring-0 focus:ring-offset-0 cursor-pointer text-indigo-600"
                      />
                    </label>

                    {enableSurvey && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in duration-300">
                        {/* Probability Weights Selector */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Probability Weights (pweight)</label>
                          <select
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold text-slate-700 focus:bg-white outline-none transition-all"
                            value={surveyWeightVar}
                            onChange={(e) => setSurveyWeightVar(e.target.value)}
                          >
                            <option value="">-- Equal Weights --</option>
                            {/* CRASH GUARD ADDED */}
                            {(variableNames || []).map((v: string) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>

                        {/* PSU Selector */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">PSU (Cluster / Primary Sampling Unit)</label>
                          <select
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold text-slate-700 focus:bg-white outline-none transition-all"
                            value={surveyClusterVar}
                            onChange={(e) => setSurveyClusterVar(e.target.value)}
                          >
                            <option value="">-- No Clustering (SRS) --</option>
                            {/* CRASH GUARD ADDED */}
                            {(variableNames || []).map((v: string) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>

                        {/* Strata Selector */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Strata Identifier (Stratum)</label>
                          <select
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold text-slate-700 focus:bg-white outline-none transition-all"
                            value={surveyStrataVar}
                            onChange={(e) => setSurveyStrataVar(e.target.value)}
                          >
                            <option value="">-- No Stratification --</option>
                            {/* CRASH GUARD ADDED */}
                            {(variableNames || []).map((v: string) => (
                              <option key={v} value={v}>{v}</option>
                            ))}
                          </select>
                        </div>

                        {/* FPC Input */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono">Finite Pop. Correction (FPC Fraction)</label>
                          <input
                            type="number"
                            step="0.0001"
                            min="0"
                            max="1"
                            placeholder="e.g. 0.05"
                            className="w-full bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs font-bold text-slate-700 focus:bg-white outline-none transition-all"
                            value={surveyFpc}
                            onChange={(e) => setSurveyFpc(e.target.value)}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

            {/* Specification Visualizer Side Panel */}
            <div className="lg:col-span-4 flex flex-col gap-6">
               <div className="card-premium p-8 bg-white border-slate-200 shadow-sm h-full flex flex-col justify-between">
                  <div>
                    <h4 className="text-[10px] font-bold text-slate-400 tracking-[0.2em] uppercase font-mono mb-6">Theoretical Matrix</h4>
                    <div className="font-mono text-xs text-slate-800 space-y-4 leading-relaxed">
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 flex items-center gap-3">
                          <span className="text-indigo-600 font-bold">Outcome:</span>
                          <span className={cn("px-2 py-1 bg-white rounded-lg border border-slate-200 shadow-sm", !dependentVar && "text-slate-300 italic")}>
                            {dependentVar || "Pending"}
                          </span>
                       </div>
                       
                       <div className="p-4 bg-indigo-50/50 rounded-xl border border-indigo-100 flex flex-col gap-1.5">
                          <span className="text-indigo-600 font-bold block text-[10px] uppercase tracking-wider font-mono">Model Formula:</span>
                          <span className="text-xs font-mono font-bold text-indigo-950 break-all leading-normal">
                            {dependentVar || "?"} ~ {independentVars.length > 0 ? independentVars.join(' + ') : "?"}
                          </span>
                       </div>

                       {hygieneWarnings.length > 0 && (
                         <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-800 text-xs font-medium space-y-2 animate-pulse">
                           <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-[9px] text-amber-900 font-mono">
                             <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                             <span>Hygiene Warnings</span>
                           </div>
                           <ul className="list-disc pl-4 space-y-1">
                             {hygieneWarnings.map((w, idx) => (
                               <li key={idx} className="leading-relaxed">{w}</li>
                             ))}
                           </ul>
                         </div>
                       )}
                       <div className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-2">
                          <span className="text-emerald-600 font-bold block mb-2">Predictor Vector:</span>
                          <div className="flex flex-wrap gap-1.5">
                             {/* CRASH GUARD ADDED */}
                             {(independentVars || []).length > 0 ? (
                               // CRASH GUARD ADDED
                               (independentVars || []).map(v => (
                                 <span key={v} className="px-2 py-1 bg-white rounded-lg border border-slate-200 shadow-sm text-[10px]">{v}</span>
                               ))
                             ) : (
                               <span className="text-slate-300 italic">None selected</span>
                             )}
                          </div>
                       </div>
                    </div>
                  </div>

                  <div className="pt-6 border-t border-slate-100">
                     <button
                        onClick={executeRegression}
                        // CRASH GUARD ADDED
                        disabled={!dependentVar || (independentVars || []).length === 0 || isEstimating}
                        className={cn(
                          "w-full py-5 rounded-2xl font-bold text-xs tracking-widest transition-all uppercase flex items-center justify-center gap-3",
                          // CRASH GUARD ADDED
                          !dependentVar || (independentVars || []).length === 0
                            ? "bg-slate-100 text-slate-400 cursor-not-allowed shadow-none"
                            : "bg-slate-900 text-white hover:bg-indigo-600 hover:shadow-2xl hover:-translate-y-1 active:translate-y-0 shadow-xl"
                        )}
                      >
                        {isEstimating ? (
                          <div className="flex items-center gap-2">
                             <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                             <span>Calculating...</span>
                          </div>
                        ) : (
                          <>
                            <Play className="w-3 h-3 fill-current" /> 
                            <span>Execute Protocol</span>
                          </>
                        )}
                     </button>
                     {estimationError && (
                       <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs font-medium flex items-start gap-2">
                         <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                         <div>
                           <span className="font-bold block mb-1 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>
                           {estimationError}
                         </div>
                       </div>
                     )}
                  </div>
               </div>
            </div>
          </div>
        </section>
      )}

      {/* 4. Display Statistical Table Array */}
      {estimationResults && (
        <section className="space-y-8 animate-in fade-in slide-in-from-bottom-12 duration-1000">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-150 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-indigo-600 shadow-lg shadow-indigo-500/40 flex items-center justify-center text-white font-mono text-xs">03</div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-900">Inference Synthesis</h3>
            </div>
            <button
              onClick={handleAddToReport}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold tracking-wider transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add to Session Report
            </button>
          </div>
          
          <div className="p-5 bg-indigo-50 border border-indigo-100 rounded-2xl flex flex-col gap-1.5 shadow-sm">
            <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest font-mono">Estimated Model Formula</span>
            <span className="text-sm font-bold text-indigo-900 font-mono">
              {dependentVar} ~ {independentVars.join(' + ')}
            </span>
          </div>
          
          <RegressionResultsTable
            results={estimationResults}
            dependentVar={dependentVar}
            variableMetadata={variableMetadata}
            modelType={regressionMode === 'quantile' ? 'quantile' : 'ols'}
            xVariables={independentVars}
            options={resultsTableOptions}
          />

          {/* Collapsible Hypothesis Tests Panel */}
          <div className="border border-slate-200 rounded-3xl bg-slate-50 overflow-hidden shadow-sm mt-4">
            <button
              onClick={() => setIsHypothesisOpen(!isHypothesisOpen)}
              className="w-full flex items-center justify-between p-5 text-left bg-white border-b border-slate-100 hover:bg-slate-50/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-indigo-100 flex items-center justify-center">
                  <Scale className="w-4 h-4 text-indigo-600" />
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-800 font-serif">Post-Estimation Hypothesis Tests</h4>
                  <p className="text-[10px] text-slate-400 font-mono uppercase tracking-wider">Stata test, testparm, &amp; lincom equivalents</p>
                </div>
              </div>
              <ChevronRight className={`w-5 h-5 text-slate-400 transition-transform duration-300 ${isHypothesisOpen ? 'rotate-90' : ''}`} />
            </button>
            
            <AnimatePresence initial={false}>
              {isHypothesisOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <div className="p-6 bg-white border-t border-slate-100 animate-in fade-in duration-300">
                    <HypothesisTests results={estimationResults} dependentVar={dependentVar} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Diagnostic Visualizations Panel */}
          {/* CRASH GUARD ADDED */}
          {estimationResults && (estimationResults.residuals || []).length > 0 && (
            <section className="mt-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-8 h-8 rounded-full bg-emerald-600 shadow-lg shadow-emerald-500/40 flex items-center justify-center text-white font-mono text-xs">04</div>
                <h4 className="text-sm font-bold uppercase tracking-widest text-slate-900">Interactive Diagnostics & Plots</h4>
              </div>
              <ChartsPanel 
                // CRASH GUARD ADDED
                residuals={estimationResults.residuals || []}
                // CRASH GUARD ADDED
                fitted={estimationResults.fitted || []}
                // CRASH GUARD ADDED
                yActual={estimationResults.yActual || []}
                // CRASH GUARD ADDED
                coefficients={estimationResults.coefficients || []}
              />
            </section>
          )}

          {/* Syntax Bridge Integration */}
          <section className="mt-12">
             <div className="flex items-center gap-3 mb-6">
                <Code className="w-5 h-5 text-indigo-500" />
                <h4 className="text-sm font-bold uppercase tracking-tight text-slate-900">Institutional Reproducibility Code</h4>
             </div>
                          <CodeBridge
                modelType={regressionMode === 'quantile' ? 'quantile' : 'ols'}
                yVar={dependentVar}
                xVars={independentVars}
                options={codeBridgeOptions}
             />
          </section>
        </section>
      )}

      {/* Footer Design Note */}
      <footer className="pt-12 border-t border-slate-100 flex flex-col md:flex-row justify-between items-center gap-4 text-slate-400">
         <div className="flex items-center gap-4">
            <BookOpen className="w-4 h-4" />
            <p className="text-[10px] font-serif italic max-w-sm">
              Model estimation follows BLUE (Best Linear Unbiased Estimator) protocols within standard asymptotic bound parameters.
            </p>
         </div>
         <div className="flex items-center gap-2">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            <span className="text-[10px] font-bold uppercase tracking-widest font-mono">System Neutral Stable</span>
         </div>
      </footer>

      {/* Parameter Help Desk Side Drawer Overlay */}
      <AnimatePresence>
        {activeHelp && (() => {
          const info = OLS_HELP_INFO[activeHelp];
          return (
            <div className="fixed inset-0 z-50 flex justify-end" id="ols-parameter-help-overlay">
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
                    <BookOpen className="w-5 h-5 text-indigo-400" />
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider font-mono text-indigo-400">Parameter Companion</h4>
                      <p className="text-[10px] text-slate-400">Economics Learning Lab (Beta)</p>
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
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Economic Intuition</h5>
                    <p className="text-xs text-slate-600 leading-relaxed font-sans">{info.intuition}</p>
                  </div>

                  {/* Mathematical Formulation */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Mathematical Representation</h5>
                    <div className="p-4 bg-slate-900 text-slate-100 rounded-xl font-mono text-center text-xs select-all shadow-inner border border-slate-800">
                      {info.math}
                    </div>
                  </div>

                  {/* Importance in Policy & Modeling */}
                  <div className="space-y-2">
                    <h5 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Econometric Importance</h5>
                    <p className="text-xs text-slate-600 leading-relaxed font-sans">{info.importance}</p>
                  </div>

                  {/* Interactive self-test Challenge for UGC-NET */}
                  <div className="p-5 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-4">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
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
                  Rigorous empirical training for applied economic research.
                </div>
              </motion.div>
            </div>
          );
        })()}
      </AnimatePresence>
    </div>
  );
}
