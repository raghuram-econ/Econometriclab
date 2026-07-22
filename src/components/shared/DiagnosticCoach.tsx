import React, { useState, useEffect } from 'react';
import { 
  Info, 
  ShieldCheck, 
  AlertTriangle, 
  Search, 
  ArrowRight,
  Sparkles,
  FlaskConical,
  Zap,
  Save,
  CheckCircle2
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStore } from '../../store/useStore';
import { useNavigation } from '../../hooks/useNavigation';
import { NAV_TABS } from '../../constants/navigation';
import { CONCEPTS } from '../../lib/concepts';

export type ModelType = 'OLS' | 'FE' | 'ARIMA' | 'CAUSAL' | 'LIMITED';

interface DiagnosticCoachProps {
  modelType: ModelType;
  results: any;
  specification: string;
  modelId: string;
}

export function DiagnosticCoach({ modelType, results, specification, modelId }: DiagnosticCoachProps) {
  const { history, updateHistoryNote, setSelectedConceptId } = useStore();
  const { navigateTo } = useNavigation();
  const model = history.find(m => m.id === modelId);

  const handleLearnMore = (conceptId: string) => {
    setSelectedConceptId(conceptId);
    navigateTo(NAV_TABS.LEARN);
  };
  const [note, setNote] = useState(model?.notes || '');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    setNote(model?.notes || '');
    setIsSaved(false);
  }, [modelId, model?.notes]);

  const handleSave = () => {
    if (!note.trim()) return;
    updateHistoryNote(modelId, note);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 3000);
  };
  const getCoachContent = () => {
    switch (modelType) {
      case 'OLS':
        return {
          estimated: "An Ordinary Least Squares (OLS) estimator was used to identify the linear conditional mean of the dependent variable. This model assumes that the errors are independent and identically distributed (i.i.d).",
          assumptions: "Key assumptions include Linearity, No Perfect Multicollinearity, and Exogeneity (E[u|X] = 0). If exogeneity fails, your coefficients are biased.",
          diagnostics: `Current R² of ${results?.rSquared ? results.rSquared.toFixed(4) : 'N/A'} indicates the proportion of variance explained. Warning: High R² in time-series might be spurious; in cross-sections, it might indicate over-fitting.`,
          interpretation: "Interpretation: Each β represents the average partial effect. Note: 'Statistical significance' is not 'Economic significance'. Magnitude matters more than your p-value.",
          nextStep: "Action: If heteroskedasticity is suspected (non-constant residual spread), switch to Robust SE. If exogeneity is doubtful, you need an Instrumental Variable (IV)."
        };
      case 'FE':
        return {
          estimated: "A Fixed Effects (Within) estimator was applied. It isolates variation within each entity, removing bias from stable omitted factors.",
          assumptions: "Key Risk: If the reason an entity's X changes is also why its Y changes unobservedly, FE cannot solve the endogeneity. This is called 'time-varying endogeneity'.",
          diagnostics: `The Within R² of ${results?.rSquared ? results.rSquared.toFixed(4) : 'N/A'} measures capture of time-variation. A low Within R² suggests that variables are not explaining much of the change over time.`,
          interpretation: "Inference: Controlling for all unobserved state-level or firm-level constants. Note: You cannot estimate effects of variables that don't change over time (e.g., region).",
          nextStep: "Action: Check for serial correlation in errors. Consider clustering standard errors at the entity level to avoid downward bias in standard error estimation."
        };
      case 'ARIMA':
        return {
          estimated: `ARIMA(${results.order.join(',')}) modeling identifies the series' internal momentum.`,
          assumptions: "Stationarity Check: If p-value of a unit-root test is > 0.05, the data is non-stationary. Spurious trends will ruin your forecast accuracy.",
          diagnostics: "Heuristic: Lower AIC/BIC is better. If AIC is very high, your model specification is likely missing significant lags or shocks.",
          interpretation: "Projection: Forecasts are point estimates based on Mean Squared Error minimization. Reality check: Bands widen over time because uncertainty is cumulative.",
          nextStep: "Action: Run an ADF (Augmented Dickey-Fuller) test. If data is non-stationary, increase the differencing parameter 'd' to stabilize the mean."
        };
      default:
        return null;
    }
  };

  const content = getCoachContent();
  if (!content) return null;

  const sections = [
    { title: "Estimation Logic", text: content.estimated, icon: FlaskConical, color: "text-blue-600", bg: "bg-blue-50" },
    { title: "Structural Assumptions", text: content.assumptions, icon: ShieldCheck, color: "text-indigo-600", bg: "bg-indigo-50" },
    { title: "Diagnostic Audit", text: content.diagnostics, icon: Search, color: "text-amber-600", bg: "bg-amber-50" },
    { title: "Safe vs Unsafe Inference", text: content.interpretation, icon: AlertTriangle, color: "text-rose-600", bg: "bg-rose-50" },
    { title: "Next Robustness Step", text: content.nextStep, icon: ArrowRight, color: "text-emerald-600", bg: "bg-emerald-50" },
  ];

  return (
    <div className="card-premium overflow-hidden border-none shadow-elevated bg-white">
      <div className="p-6 bg-slate-900 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-blue-500 rounded-lg">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">Guided Diagnostics Coach</h3>
            <p className="text-[10px] text-slate-400 italic font-serif">Structural Review for MA/PhD Candidates</p>
          </div>
        </div>
        <div className="px-3 py-1 bg-white/10 rounded-full border border-white/10 text-[9px] font-bold text-slate-400 uppercase tracking-widest font-mono">
          V2 Empirical Core
        </div>
      </div>

      <div className="p-8 grid grid-cols-1 md:grid-cols-5 gap-8 divide-y md:divide-y-0 md:divide-x divide-slate-100">
        {sections.map((section, idx) => (
          <div key={idx} className="pt-6 md:pt-0 md:px-4 first:pl-0 last:pr-0 space-y-4 group">
            <div className="flex items-center gap-2">
              <div className={cn("p-1.5 rounded-md", section.bg)}>
                <section.icon className={cn("w-3.5 h-3.5", section.color)} />
              </div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono group-hover:text-slate-600 transition-colors">
                {section.title}
              </h4>
            </div>
            <p className="text-[12px] text-slate-600 leading-relaxed font-serif italic">
              {section.text}
            </p>
          </div>
        ))}
      </div>

      <div className="px-8 py-6 bg-slate-50 border-t border-slate-100 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Zap className="w-3 h-3 text-amber-500" />
            <span className="text-[9px] font-bold uppercase text-slate-400 font-mono tracking-tighter">Current Schema: {specification}</span>
          </div>
          {isSaved && (
            <div className="flex items-center gap-1.5 text-emerald-600 animate-in fade-in zoom-in duration-300">
               <CheckCircle2 className="w-3 h-3" />
               <span className="text-[9px] font-bold uppercase font-mono">Research note saved to session</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <textarea 
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setIsSaved(false);
            }}
            placeholder="Add structural observations, identification concerns, or data caveats here..."
            className="w-full h-24 p-4 text-xs font-serif italic border border-slate-200 rounded-xl bg-white focus:ring-2 focus:ring-blue-500/10 outline-none transition-all resize-none shadow-sm"
          />
          <div className="flex justify-end">
            <button 
              onClick={handleSave}
              disabled={!note.trim() || isSaved}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all",
                note.trim() && !isSaved
                  ? "bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-200" 
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
              )}
            >
              <Save className="w-3 h-3" />
              {isSaved ? 'Note Saved' : 'Save Research Note'}
            </button>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex flex-wrap gap-2">
           <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block w-full mb-1">Theoretical Foundations:</span>
           {modelType === 'OLS' && (
             <>
               <button onClick={() => handleLearnMore('ols_assumptions')} className="px-2 py-1 bg-blue-50 text-blue-600 text-[9px] font-bold rounded hover:bg-blue-100 transition-colors uppercase font-mono">Assumptions</button>
               <button onClick={() => handleLearnMore('gauss_markov')} className="px-2 py-1 bg-blue-50 text-blue-600 text-[9px] font-bold rounded hover:bg-blue-100 transition-colors uppercase font-mono">Gauss-Markov</button>
               <button onClick={() => handleLearnMore('ovb')} className="px-2 py-1 bg-amber-50 text-amber-600 text-[9px] font-bold rounded hover:bg-amber-100 transition-colors uppercase font-mono">OVB Bias</button>
               <button onClick={() => handleLearnMore('heteroskedasticity')} className="px-2 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-bold rounded hover:bg-emerald-100 transition-colors uppercase font-mono">Heteroskedasticity</button>
             </>
           )}
           {modelType === 'FE' && (
             <>
               <button onClick={() => handleLearnMore('fixed_effects')} className="px-2 py-1 bg-blue-50 text-blue-600 text-[9px] font-bold rounded hover:bg-blue-100 transition-colors uppercase font-mono">Within-Transform</button>
               <button onClick={() => handleLearnMore('unobserved_heterogeneity')} className="px-2 py-1 bg-amber-50 text-amber-600 text-[9px] font-bold rounded hover:bg-amber-100 transition-colors uppercase font-mono">Unobserved Hetero</button>
             </>
           )}
           {modelType === 'ARIMA' && (
             <>
               <button onClick={() => handleLearnMore('stationarity')} className="px-2 py-1 bg-blue-50 text-blue-600 text-[9px] font-bold rounded hover:bg-blue-100 transition-colors uppercase font-mono">Stationarity</button>
               <button onClick={() => handleLearnMore('arima_models')} className="px-2 py-1 bg-amber-50 text-amber-600 text-[9px] font-bold rounded hover:bg-amber-100 transition-colors uppercase font-mono">ARIMA Logic</button>
             </>
           )}
           {modelType === 'CAUSAL' && (
             <>
               <button onClick={() => handleLearnMore('endogeneity')} className="px-2 py-1 bg-rose-50 text-rose-600 text-[9px] font-bold rounded hover:bg-rose-100 transition-colors uppercase font-mono">Endogeneity</button>
               <button onClick={() => handleLearnMore('instrumental_variables')} className="px-2 py-1 bg-blue-50 text-blue-600 text-[9px] font-bold rounded hover:bg-blue-100 transition-colors uppercase font-mono">IV / 2SLS</button>
               <button onClick={() => handleLearnMore('exclusion_restriction')} className="px-2 py-1 bg-amber-50 text-amber-600 text-[9px] font-bold rounded hover:bg-amber-100 transition-colors uppercase font-mono">Exclusion Restriction</button>
             </>
           )}
           {modelType === 'LIMITED' && (
             <>
               <button onClick={() => handleLearnMore('logit_probit')} className="px-2 py-1 bg-blue-50 text-blue-600 text-[9px] font-bold rounded hover:bg-blue-100 transition-colors uppercase font-mono">Maximum Likelihood</button>
             </>
           )}
        </div>
      </div>
    </div>
  );
}
