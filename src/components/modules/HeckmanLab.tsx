import React, { useState, useMemo } from 'react';
import { 
  BarChart3, 
  HelpCircle, 
  Info, 
  Play, 
  Binary, 
  RefreshCw, 
  Sliders,
  GraduationCap,
  Sparkles,
  BookOpen,
  ArrowRight,
  Clipboard,
  Check
} from 'lucide-react';
import { Dataset } from '../../types';
import { generateMasterDataset } from '../../lib/dataGenerators';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { runHeckman } from '../../services/apiClient';

interface HeckmanLabProps {
  dataset: Dataset | null;
  onRunComplete?: (results: any, spec: string) => void;
}

export default function HeckmanLab({ dataset: propDataset, onRunComplete }: HeckmanLabProps) {
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

  // Model Specification State
  const [outcomeY, setOutcomeY] = useState<string>('');
  const [outcomeX, setOutcomeX] = useState<string[]>([]);
  const [selectionS, setSelectionS] = useState<string>('');
  const [exclusionZ, setExclusionZ] = useState<string[]>([]);

  const [activeTab, setActiveTab] = useState<'estimation' | 'results' | 'interpretation'>('estimation');
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [results, setResults] = useState<any | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Replication code tabs
  const [replicationLang, setReplicationLang] = useState<'r' | 'stata'>('r');
  const [copied, setCopied] = useState<boolean>(false);

  // Automatically pre-populate default variables for the master dataset
  React.useEffect(() => {
    if (numericVariables.length > 0) {
      if (!outcomeY || !numericVariables.includes(outcomeY)) {
        const potentialY = numericVariables.find(v => v === 'wage') || numericVariables[0] || '';
        setOutcomeY(potentialY);
      }
      if (!selectionS || !numericVariables.includes(selectionS)) {
        const potentialS = numericVariables.find(v => v === 'employment') || numericVariables[1] || '';
        setSelectionS(potentialS);
      }
      // Prune any selected variables that no longer exist in the active
      // dataset (e.g. after switching datasets) - otherwise stale variable
      // names silently survive with no checkbox to un-select them, since the
      // picker only lists the current dataset's columns.
      setOutcomeX(prev => {
        const stillValid = prev.filter(v => numericVariables.includes(v));
        if (stillValid.length > 0) return stillValid;
        const potentialX = numericVariables.filter(v => v === 'educ' || v === 'exper' || v === 'female');
        return potentialX.length > 0 ? potentialX : [numericVariables[0] || ''];
      });
      setExclusionZ(prev => {
        const stillValid = prev.filter(v => numericVariables.includes(v));
        if (stillValid.length > 0) return stillValid;
        return numericVariables.filter(v => v === 'distance_to_college' || v === 'urban');
      });
    }
  }, [numericVariables]);

  // Clear stale results whenever the active dataset changes, so a previous
  // dataset's Heckman estimates never linger on screen looking current. Also
  // reset activeTab back to 'estimation' - the 'results' tab button is
  // disabled without `results`, but its content panel is still gated behind
  // `results` too, so a user parked there during a dataset switch would
  // otherwise see a blank tab until manually clicking away.
  const activeDatasetKey = activeDataset?.name ?? null;
  React.useEffect(() => {
    setResults(null);
    setErrorMessage(null);
    setActiveTab('estimation');
  }, [activeDatasetKey]);

  const handleToggleX = (v: string) => {
    setOutcomeX(prev => prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]);
    // A variable newly added to the outcome equation can no longer serve as
    // an exclusion restriction - the exclusion checkbox is disabled going
    // forward, but that alone wouldn't remove it if it was checked first.
    setExclusionZ(prev => prev.filter(item => item !== v));
  };

  const handleToggleZ = (v: string) => {
    setExclusionZ(prev => prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]);
  };

  const handleInduceSelectionBias = () => {
    if (!activeDataset || !outcomeY || !selectionS) return;
    
    // Set outcomeY to NaN where selectionS is 0 to match a real-world selected dataset
    const updatedData = activeDataset.data.map(row => {
      const isSelected = Number(row[selectionS]) === 1;
      return {
        ...row,
        [outcomeY]: isSelected ? row[outcomeY] : NaN
      };
    });

    if (propDataset) {
      // Modify dataset locally if it came from props
      setLocalDataset({
        ...propDataset,
        data: updatedData
      });
    } else if (localDataset) {
      setLocalDataset({
        ...localDataset,
        data: updatedData
      });
    }
  };

  const handleRunEstimation = async () => {
    if (!activeDataset || !outcomeY || !selectionS || outcomeX.length === 0) {
      setErrorMessage("Please complete the model configuration: Select Outcome (Y), Selection Indicator (S), and at least one Outcome Covariate (X).");
      return;
    }

    setIsRunning(true);
    setErrorMessage(null);
    setResults(null);

    try {
      const data = activeDataset.data;
      const nTotal = data.length;

      // Build vectors and matrices
      const outcome_y: (number | null)[] = [];
      const outcome_X: number[][] = [];
      const selection_z: number[][] = [];

      data.forEach(row => {
        // Selection variable S (must be 0 or 1)
        const sVal = Number(row[selectionS]) === 1 ? 1 : 0;
        
        // Outcome variable Y (set to null if not selected, i.e., S = 0 or value is missing/NaN)
        const yValRaw = row[outcomeY];
        const isObserved = sVal === 1 && yValRaw !== null && yValRaw !== undefined && !isNaN(Number(yValRaw));
        const yVal = isObserved ? Number(yValRaw) : null;
        outcome_y.push(yVal);

        // Outcome covariates (include Intercept = 1)
        const xRow = [1, ...outcomeX.map(varName => Number(row[varName] ?? 0))];
        outcome_X.push(xRow);

        // Selection covariates (include Intercept = 1, all X variables, and all Z exclusion variables)
        const zRow = [1, ...outcomeX.map(varName => Number(row[varName] ?? 0)), ...exclusionZ.map(varName => Number(row[varName] ?? 0))];
        selection_z.push(zRow);
      });

      // Construct name arrays including Intercept
      const outcome_names = ["Intercept", ...outcomeX];
      const selection_names = ["Intercept", ...outcomeX, ...exclusionZ];

      const response = await runHeckman({
        outcome_y,
        outcome_X,
        selection_z,
        outcome_names,
        selection_names,
        n_obs_total: nTotal
      });

      setResults(response);
      setActiveTab('results');

      if (onRunComplete) {
        onRunComplete(response, `HECKMAN TWO-STEP: ${outcomeY.toUpperCase()} ~ ${outcomeX.join(' + ')} [Selection: ${selectionS.toUpperCase()} ~ ${outcomeX.concat(exclusionZ).join(' + ')}]`);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err?.message || "Failed to estimate Heckman Selection Model. Ensure there are no infinite or missing values in selection covariates.");
    } finally {
      setIsRunning(false);
    }
  };

  // Replication code generator
  const replicationCode = useMemo(() => {
    const xFormula = outcomeX.join(' + ');
    const selectionFormula = [...outcomeX, ...exclusionZ].join(' + ');
    
    return {
      r: `# R Script - Heckman Two-Step Selection Model
# Requires the 'sampleSelection' package
# install.packages("sampleSelection")
library(sampleSelection)

# Load your dataset
df <- read.csv("your_dataset_path.csv")

# Ensure selection indicator is logical (TRUE/FALSE)
df$selected_logical <- df$${selectionS} == 1

# Estimate Heckman model using the two-step method
heck_model <- heckit(
  selection = selected_logical ~ ${selectionFormula},
  outcome = ${outcomeY} ~ ${xFormula},
  data = df,
  method = "2step"
)

# Print full estimation results
summary(heck_model)`,

      stata: `* Stata Command - Heckman Two-Step Selection Model
* Load your dataset
import delimited "your_dataset_path.csv", clear

* Estimate Heckman selection model with exclusion restriction
heckman ${outcomeY} ${xFormula}, select(${selectionS} = ${selectionFormula}) twostep

* Display detailed results
estimates display`
    };
  }, [outcomeY, outcomeX, selectionS, exclusionZ]);

  const handleCopyCode = () => {
    const textToCopy = replicationLang === 'r' ? replicationCode.r : replicationCode.stata;
    navigator.clipboard.writeText(textToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div id="heckman-lab" className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700">
      <ModuleIntroCard 
        title="Heckman Selection Model"
        description="Estimate continuous outcomes corrected for non-random participation or sample selection bias. This model uses a Probit first stage to determine selection probability, calculates the Inverse Mills Ratio (λ), and includes it as a selection corrector in the outcome OLS regression."
        useWhen="You want to estimate returns to education on wages, where wages are only observed for those who choose to enter the workforce, or test scores only for self-selected test-takers."
        requires={[
          "A continuous outcome variable of interest.",
          "A binary selection indicator representing observation status.",
          "At least one exclusion restriction variable (affects selection but not outcome)."
        ]}
        youWillGet={[
          "Consistent parameters corrected for sample selection.",
          "Statistical significance test of selection bias (Lambda's p-value).",
          "Implied error correlation (Rho) and error standard deviation (Sigma)."
        ]}
        pitfalls={[
          "Omitting a strong exclusion restriction, which causes severe multicollinearity in the second-step OLS.",
          "Failing to induce selection or using selection indicator with zero variance."
        ]}
        example="Wage = f(Education, Experience) corrected by IMR derived from P(Employment = 1 | Children, Marital Status)"
      />

      {/* Tabs */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('estimation')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'estimation' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-indigo-600'}`}
        >
          1. Model Specification
        </button>
        <button
          onClick={() => setActiveTab('results')}
          disabled={!results}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'results' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-indigo-600'} disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          2. Estimation Results
        </button>
        <button
          onClick={() => setActiveTab('interpretation')}
          className={`px-5 py-3 text-xs font-bold uppercase tracking-wider border-b-2 transition-all ${activeTab === 'interpretation' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-indigo-600'}`}
        >
          3. Applied Economics Guide
        </button>
      </div>

      {/* Active Tab Content */}
      {activeTab === 'estimation' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Specification Panel */}
          <div className="md:col-span-2 space-y-6">
            {!activeDataset ? (
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-8 text-center space-y-4">
                <Info className="w-8 h-8 text-slate-400 mx-auto" />
                <p className="text-sm font-semibold text-slate-600">No active dataset detected in workspace.</p>
                <p className="text-xs text-slate-500">Load a sample micro-dataset to explore selection correction.</p>
                <button
                  onClick={handleLoadSample}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700 uppercase tracking-wider transition-colors"
                >
                  Load Sample Econometric Dataset
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-6">
                <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                  <h3 className="font-bold text-slate-950 flex items-center gap-2 text-sm uppercase tracking-wide">
                    <Sliders className="w-4 h-4 text-indigo-600" /> Model Configuration
                  </h3>
                  <div className="flex items-center gap-2 text-xs font-mono text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded">
                    <span>Dataset: {activeDataset.name}</span>
                    <span className="opacity-40">|</span>
                    <span>N = {activeDataset.rowCount}</span>
                  </div>
                </div>

                {errorMessage && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-700 text-xs px-4 py-3 rounded-lg font-medium">
                    {errorMessage}
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                  {/* Selection 1: Outcome Y */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Outcome Variable (Y)
                    </label>
                    <select
                      value={outcomeY}
                      onChange={(e) => {
                        const newY = e.target.value;
                        setOutcomeY(newY);
                        setOutcomeX(prev => prev.filter(v => v !== newY));
                        setExclusionZ(prev => prev.filter(v => v !== newY));
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    >
                      <option value="">-- Choose Y --</option>
                      {numericVariables.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Continuous outcome observed only for selected individuals (e.g. wages).
                    </p>
                  </div>

                  {/* Selection 2: Selection S */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Selection Indicator (S)
                    </label>
                    <select
                      value={selectionS}
                      onChange={(e) => {
                        const newS = e.target.value;
                        setSelectionS(newS);
                        setOutcomeX(prev => prev.filter(v => v !== newS));
                        setExclusionZ(prev => prev.filter(v => v !== newS));
                      }}
                      className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-600"
                    >
                      <option value="">-- Choose S --</option>
                      {numericVariables.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Binary indicator representing participation or observation (0 = unselected, 1 = selected).
                    </p>
                  </div>
                </div>

                {/* Induce Selection Bias Action */}
                <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-indigo-950 uppercase tracking-wide">
                      Microeconomic Selection Emulator
                    </h4>
                    <p className="text-[10px] text-indigo-800 leading-relaxed">
                      Wages are only observed for employed people. Click here to set {outcomeY || 'outcome'} values to missing (NaN) for unemployed individuals (S = 0).
                    </p>
                  </div>
                  <button
                    onClick={handleInduceSelectionBias}
                    disabled={!outcomeY || !selectionS}
                    className="px-3.5 py-1.5 text-[10px] font-bold text-white bg-indigo-600 rounded hover:bg-indigo-700 uppercase tracking-widest transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                  >
                    Set Y = NaN where S = 0
                  </button>
                </div>

                {/* Selection 3: Outcome Covariates (X) */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Outcome Covariates (X)
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-lg">
                    {numericVariables.map(v => (
                      <label 
                        key={v} 
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer text-xs font-semibold select-none transition-all ${outcomeX.includes(v) ? 'bg-indigo-50 border border-indigo-200 text-indigo-950' : 'hover:bg-slate-100 text-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={outcomeX.includes(v)}
                          onChange={() => handleToggleX(v)}
                          disabled={v === outcomeY || v === selectionS}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 disabled:opacity-40"
                        />
                        <span className="truncate">{v}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Explanatory variables in the main outcome equation. Will be used in both the selection and outcome equations.
                  </p>
                </div>

                {/* Selection 4: Exclusion Restriction (Z) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Exclusion Restriction Variable(s) (Z)
                    </label>
                    <span className="text-[9px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded">
                      Highly Recommended
                    </span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-1 bg-slate-50 border border-slate-200 rounded-lg">
                    {numericVariables.map(v => (
                      <label 
                        key={v} 
                        className={`flex items-center gap-2 p-2 rounded cursor-pointer text-xs font-semibold select-none transition-all ${exclusionZ.includes(v) ? 'bg-indigo-50 border border-indigo-200 text-indigo-950' : 'hover:bg-slate-100 text-slate-700'}`}
                      >
                        <input
                          type="checkbox"
                          checked={exclusionZ.includes(v)}
                          onChange={() => handleToggleZ(v)}
                          disabled={outcomeX.includes(v) || v === outcomeY || v === selectionS}
                          className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 disabled:opacity-40"
                        />
                        <span className="truncate">{v}</span>
                      </label>
                    ))}
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed">
                    Exclusion restriction: Variables that robustly determine the probability of selection (S = 1) but do not directly affect the outcome (Y). (E.g. `distance_to_college` for education studies, or family circumstances for labor studies).
                  </p>
                </div>

                {/* Run Buttons */}
                <div className="border-t border-slate-100 pt-6 flex justify-end">
                  <button
                    onClick={handleRunEstimation}
                    disabled={isRunning || !outcomeY || !selectionS || outcomeX.length === 0}
                    className="flex items-center gap-2 px-6 py-3 font-bold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:text-slate-500 disabled:cursor-not-allowed uppercase tracking-wider text-xs transition-all shadow-md hover:shadow-lg"
                    data-shortcut="primary-action"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        Running Selection Correction...
                      </>
                    ) : (
                      <>
                        <Play className="w-4 h-4" />
                        Execute Heckman Protocol
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Model Card / Educational Sidebar */}
          <div className="space-y-6">
            <div className="bg-slate-50 rounded-xl border border-slate-200 p-6 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <GraduationCap className="w-4 h-4 text-indigo-600" /> Applied Econometric Rigor
              </h3>
              <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
                <p>
                  <strong>Why OLS Fails:</strong> Standard OLS yields biased estimates when the sample is selected non-randomly. In workforce research, wages are only observed for those choosing to work. Traits that affect participation may also affect earnings, creating correlation between the regressors and error terms.
                </p>
                <p>
                  <strong>The Two-Step Cure:</strong>
                </p>
                <ol className="list-decimal pl-4 space-y-2 font-mono text-[10px] text-slate-700">
                  <li>
                    <strong>Probit:</strong> Estimates participation probability P(S_i = 1|Z_i) and computes the Inverse Mills Ratio (IMR):
                    <div className="my-1.5 font-sans font-bold text-center bg-indigo-50 border border-indigo-100 rounded p-1 text-slate-800">
                      λ_i = φ(Z_i'γ) / Φ(Z_i'γ)
                    </div>
                  </li>
                  <li>
                    <strong>OLS:</strong> Estimates outcome Y including λ_i as a covariate, correcting for selection bias!
                  </li>
                </ol>
              </div>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-6 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-950 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-indigo-600" /> Exclusion Restriction Rules
              </h3>
              <p className="text-xs text-indigo-900 leading-relaxed">
                An exclusion restriction Z is a variable that is included in the selection equation but excluded from the outcome equation. Without an exclusion restriction, identification relies solely on the non-linear shape of λ_i, leading to extreme multicollinearity (high VIF) between λ_i and the other X variables. Including at least one strong exclusion restriction is essential for robust identification.
              </p>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'results' && results && (
        <div className="space-y-8 animate-in fade-in duration-500">
          {/* Fit Stats Overview Dashboard */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Total Observations (N)</span>
              <p className="text-xl font-bold font-mono text-slate-900">{results.n_total}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Selected Obs (N_selected)</span>
              <p className="text-xl font-bold font-mono text-indigo-600">{results.n_selected}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Implied Correlation (Rho)</span>
              <p className="text-xl font-bold font-mono text-amber-600">{results.rho}</p>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-1 shadow-sm">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Selection Bias (Lambda)</span>
              <div className="flex items-center gap-2">
                <p className={`text-xl font-bold font-mono ${results.lambda_significant ? 'text-rose-600' : 'text-slate-700'}`}>{results.lambda_coef}</p>
                {results.lambda_significant && (
                  <span className="text-[9px] font-extrabold uppercase bg-rose-50 text-rose-700 border border-rose-100 px-1.5 py-0.5 rounded leading-none shrink-0 animate-pulse">
                    SIGNIFICANT
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Core Selection Interpretation Banner */}
          <div className={`p-5 rounded-xl border shadow-sm flex gap-4 ${results.lambda_significant ? 'bg-rose-50 border-rose-200 text-rose-950' : 'bg-slate-50 border-slate-200 text-slate-800'}`}>
            <Info className={`w-6 h-6 shrink-0 mt-0.5 ${results.lambda_significant ? 'text-rose-600' : 'text-slate-500'}`} />
            <div className="space-y-1">
              <h4 className="font-bold text-xs uppercase tracking-wider">
                Econometric Inference & Diagnostics
              </h4>
              <p className="text-xs leading-relaxed">
                {results.lambda_significant ? (
                  <>
                    The Inverse Mills Ratio (λ) is <strong>statistically significant</strong> (p-value &lt; 0.05). This provides strong evidence that <strong>sample selection bias is actively present</strong>. Standard OLS estimations would produce biased, inconsistent coefficients. The Heckman selection model successfully models this self-selection process, offering consistent, corrected estimates.
                  </>
                ) : (
                  <>
                    The Inverse Mills Ratio (λ) is <strong>not statistically significant</strong> at the 5% level. We fail to reject the null hypothesis of no selection bias. This suggests that non-random selection may not be biasing your standard OLS parameters in a severe way.
                  </>
                )}
              </p>
            </div>
          </div>

          {/* Table Panels */}
          <div className="space-y-6">
            {/* Step 1 Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <Binary className="w-4 h-4 text-indigo-600" /> Step 1: Selection Equation (Probit on S)
                </h3>
                <span className="text-[10px] font-mono text-slate-500 font-semibold uppercase">Estimating Selection Probability</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-semibold text-slate-700 border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                      <th className="py-3 px-5">Term</th>
                      <th className="py-3 px-5 text-right">Coefficient</th>
                      <th className="py-3 px-5 text-right">Std. Error</th>
                      <th className="py-3 px-5 text-right">z-Statistic</th>
                      <th className="py-3 px-5 text-right">P &gt; |z|</th>
                      <th className="py-3 px-5 text-center">Sig.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(results.selection_equation || []).map((item: any, i: number) => (
                      <tr key={i} className="border-b border-slate-100 hover:bg-slate-50 transition-colors">
                        <td className="py-3.5 px-5 font-mono text-slate-900">{item.term}</td>
                        <td className="py-3.5 px-5 text-right font-mono text-slate-800">{item.coef.toFixed(5)}</td>
                        <td className="py-3.5 px-5 text-right font-mono text-slate-500">{item.se.toFixed(5)}</td>
                        <td className="py-3.5 px-5 text-right font-mono text-slate-700">{item.z.toFixed(3)}</td>
                        <td className="py-3.5 px-5 text-right font-mono text-slate-700">
                          {item.p_value === 0 ? "0.0000" : item.p_value.toFixed(4)}
                        </td>
                        <td className="py-3.5 px-5 text-center font-bold text-amber-600 text-sm leading-none">{item.stars}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Step 2 Table */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="bg-slate-50 px-5 py-4 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-emerald-600" /> Step 2: Outcome Equation (OLS with IMR)
                </h3>
                <span className="text-[10px] font-mono text-slate-500 font-semibold uppercase">Estimating Corrected Continuous Outcome</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs font-semibold text-slate-700 border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-500 text-[10px] font-bold uppercase tracking-widest">
                      <th className="py-3 px-5">Term</th>
                      <th className="py-3 px-5 text-right">Coefficient</th>
                      <th className="py-3 px-5 text-right">Std. Error</th>
                      <th className="py-3 px-5 text-right">t-Statistic</th>
                      <th className="py-3 px-5 text-right">P &gt; |t|</th>
                      <th className="py-3 px-5 text-center">Sig.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(results.outcome_equation || []).map((item: any, i: number) => {
                      const isImr = item.term.includes('Mills') || item.term.includes('Lambda');
                      return (
                        <tr key={i} className={`border-b border-slate-100 hover:bg-slate-50 transition-colors ${isImr ? 'bg-indigo-50/25 hover:bg-indigo-50/50' : ''}`}>
                          <td className={`py-3.5 px-5 font-mono ${isImr ? 'text-indigo-950 font-bold' : 'text-slate-900'}`}>{item.term}</td>
                          <td className="py-3.5 px-5 text-right font-mono text-slate-800">{item.coef.toFixed(5)}</td>
                          <td className="py-3.5 px-5 text-right font-mono text-slate-500">{item.se.toFixed(5)}</td>
                          <td className="py-3.5 px-5 text-right font-mono text-slate-700">{item.t.toFixed(3)}</td>
                          <td className="py-3.5 px-5 text-right font-mono text-slate-700">
                            {item.p_value === 0 ? "0.0000" : item.p_value.toFixed(4)}
                          </td>
                          <td className="py-3.5 px-5 text-center font-bold text-amber-600 text-sm leading-none">{item.stars}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Code replication panel */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="space-y-0.5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  Econometric Code Replication (Stata & R)
                </h3>
                <p className="text-[10px] text-slate-500">
                  Copy this exact script layout to replicate your results in external high-level academic software.
                </p>
              </div>
              <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                <button
                  onClick={() => setReplicationLang('r')}
                  className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${replicationLang === 'r' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  R
                </button>
                <button
                  onClick={() => setReplicationLang('stata')}
                  className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${replicationLang === 'stata' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}
                >
                  Stata
                </button>
              </div>
            </div>

            <div className="relative group bg-slate-950 rounded-xl p-5 border border-slate-800 overflow-hidden">
              <button
                onClick={handleCopyCode}
                className="absolute right-4 top-4 p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:bg-slate-800 transition-all shadow-sm z-10"
                title="Copy Replication Code"
              >
                {copied ? <Check className="w-4 h-4 text-emerald-400 animate-pulse" /> : <Clipboard className="w-4 h-4" />}
              </button>
              <pre className="text-xs font-mono text-slate-200 leading-relaxed overflow-x-auto select-all max-h-80 whitespace-pre">
                <code>
                  {replicationLang === 'r' ? replicationCode.r : replicationCode.stata}
                </code>
              </pre>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'interpretation' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-8 space-y-8 animate-in fade-in duration-500 text-slate-700 leading-relaxed text-sm">
          <div className="space-y-4">
            <h3 className="font-extrabold text-slate-950 uppercase tracking-wider flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-indigo-600" /> Applied Economics Interpretation Manual
            </h3>
            <p>
              James Heckman won the Nobel Memorial Prize in Economic Sciences in 2000 for developing this model. It is a cornerstone of microeconometrics, resolving a major threat to external and internal validity: <strong>selection bias</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 border-t border-slate-100 pt-6">
            <div className="space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900">
                1. Identifying Selection Bias (The Mills Ratio λ)
              </h4>
              <p className="text-xs leading-relaxed text-slate-600">
                The core statistic is the coefficient on the Inverse Mills Ratio, λ (Lambda). This represents the covariance between the error terms of the selection equation and the outcome equation (β_λ = ρ * σ).
              </p>
              <ul className="list-disc pl-5 space-y-1.5 text-xs text-slate-600">
                <li>
                  <strong>Positive Lambda (λ &gt; 0):</strong> Indicates positive selection bias. Unobserved factors that increase the probability of selection are associated with higher values of the outcome. (e.g., highly motivated women are both more likely to work and more likely to earn higher wages).
                </li>
                <li>
                  <strong>Negative Lambda (λ &lt; 0):</strong> Indicates negative selection bias. Unobserved traits increasing selection probability correlate with lower outcomes.
                </li>
              </ul>
            </div>

            <div className="space-y-3">
              <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900">
                2. Intuiting Correlation (Rho ρ)
              </h4>
              <p className="text-xs leading-relaxed text-slate-600">
                ρ (Rho) is the correlation coefficient between the error term of the selection equation (e.g. entry into employment) and the error term of the outcome equation (e.g. wage levels). It is bounded between -1 and +1.
              </p>
              <p className="text-xs leading-relaxed text-slate-600">
                If ρ ≠ 0, OLS on the selected sample is biased because the expected value of the error term conditional on selection is non-zero: E[u | S=1] = β_λ * λ ≠ 0. The Heckman model corrects this by adding the calculated λ to the outcome equation, which &quot;absorbs&quot; the selection bias and renders the remaining error term mean-zero.
              </p>
            </div>
          </div>

          <div className="bg-slate-50 rounded-xl p-6 border border-slate-100 space-y-4">
            <h4 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Case Study: Women's Wages in Rural India (PLFS)
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              Suppose you are estimating the return to education for rural women in India. Because of social, structural, or family expectations, many highly educated women may choose not to join the formal wage-labor market.
            </p>
            <div className="flex flex-col sm:flex-row items-center gap-4 text-xs font-medium text-slate-800">
              <div className="bg-white border border-slate-200 p-3.5 rounded-lg flex-1">
                <strong>Selection Equation:</strong> Predicts participation using covariates (education, age, marital status, number of children, presence of elders). Marital status and childcare act as excellent exclusion restrictions.
              </div>
              <ArrowRight className="w-4 h-4 text-slate-400 rotate-90 sm:rotate-0" />
              <div className="bg-white border border-slate-200 p-3.5 rounded-lg flex-1">
                <strong>Outcome Equation:</strong> Estimates wage corrected for the fact that we only observe wages for those who are employed, using the estimated Inverse Mills Ratio.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
