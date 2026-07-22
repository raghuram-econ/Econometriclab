import React, { useState, useEffect } from 'react';
import { BrainCircuit, Info, AlertTriangle, ArrowRight, CheckCircle2, Loader2, Sparkles } from 'lucide-react';
import { Dataset } from '../../types';
import { cn } from '../../lib/utils';
import { useStore } from '../../store/useStore';
import { NAV_TABS } from '../../constants/navigation';
import { recommendModel } from '../../services/gemini';

interface Recommendation {
  type: string;
  recommendation: string;
  reason: string;
  warning: string;
  target: string;
}

interface ModelChoiceAssistantProps {
  dataset: Dataset | null;
  onNavigate: (tab: string) => void;
}

export function ModelChoiceAssistant({ dataset, onNavigate }: ModelChoiceAssistantProps) {
  const { researchQuestion } = useStore();
  const [aiAdvice, setAiAdvice] = useState<Recommendation | null>(null);
  const [loading, setLoading] = useState(false);

  // Static fallback/initial logic
  const guessStructure = (): Recommendation => {
    if (!dataset) return {
      type: 'Unknown',
      recommendation: 'OLS Regression',
      reason: 'Connect a dataset to get structural advice.',
      warning: 'No data detected.',
      target: NAV_TABS.OLS
    };

    const cols = (dataset.variables || []).map(v => {
      if (typeof v === 'string') {
        return (v as string).toLowerCase();
      }
      return (v && v.name) ? v.name.toLowerCase() : '';
    });
    const rowCount = (dataset.data || []).length;

    const hasYear = cols.some(c => c.includes('year') || c.includes('time') || c.includes('date'));
    const hasId = cols.some(c => c.includes('id') || c.includes('firm') || c.includes('state') || c.includes('country'));
    const goal = researchQuestion.goal;
    const structure = researchQuestion.structure;

    // Use explicit user-defined structure if available
    if (structure === 'panel' || (hasId && hasYear)) {
      return {
        type: 'Panel Data',
        recommendation: 'Fixed Effects (FE)',
        reason: goal === 'causal' 
          ? 'Since your goal is Causal Inference with Panel data, Fixed Effects is the gold standard for controlling for entity-specific unobserved heterogeneity.' 
          : 'The panel structure allows you to account for unobserved time-invariant traits. Fixed Effects is generally preferred over Pooled OLS when T > 1.',
        warning: 'FE will drop any variables that do not change over time within units.',
        target: NAV_TABS.FE
      };
    }

    if (structure === 'time-series' || (hasYear && rowCount > 20 && goal === 'forecasting')) {
      return {
        type: 'Time Series',
        recommendation: 'ARIMA Forecast',
        reason: 'For univariate forecasting tasks, ARIMA captures historical momentum and trends effectively.',
        warning: 'Ensure the series is stationary before final estimation.',
        target: NAV_TABS.ARIMA
      };
    }

    return {
      type: 'Cross-Sectional',
      recommendation: 'OLS Regression',
      reason: 'The data appears to be a snapshot of different units. OLS is the foundation for estimating average relationships in cross-sectional sets.',
      warning: 'Watch out for Omitted Variable Bias (OVB) and Heteroskedasticity.',
      target: NAV_TABS.OLS
    };
  };

  const advice = aiAdvice || guessStructure();

  const handleAiAsk = async () => {
    if (!dataset) return;
    setLoading(true);
    try {
      const metadata = {
        name: dataset.name,
        rowCount: dataset.rowCount,
        colCount: dataset.colCount,
        structure: dataset.structure,
        variables: dataset.variables
      };
      const result = await recommendModel(metadata, researchQuestion);
      setAiAdvice(result);
    } catch (err) {
      console.error("AI Recommendation failed:", err);
    } finally {
      setLoading(false);
    }
  };

  if (!dataset) return null;

  return (
    <div className="card-premium p-8 bg-slate-900 text-white border-none shadow-elevated relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
         <BrainCircuit className="w-32 h-32" />
      </div>
      
      <div className="relative z-10 space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500 rounded-lg">
              <BrainCircuit className="w-4 h-4 text-white" />
            </div>
            <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-400 font-mono">Structural Advisor</h3>
          </div>
          
          <button 
            onClick={handleAiAsk}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all backdrop-blur-sm border border-white/10"
          >
            {loading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-3 h-3 text-amber-400" />
                Consult AI Master
              </>
            )}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-[10px] text-slate-500 uppercase font-mono tracking-tight font-bold">
            {aiAdvice ? 'AI Certified Paradigm' : 'Detected Paradigm'}
          </p>
          <h4 className="text-2xl font-serif italic font-bold">{advice.type}</h4>
        </div>

        <div className="space-y-4 max-w-lg">
          <div className="flex gap-4 p-4 bg-white/5 rounded-xl border border-white/10">
             <div className="p-2 bg-emerald-500/20 rounded-full h-fit mt-1">
                <CheckCircle2 className="w-3 h-3 text-emerald-400" />
             </div>
             <div>
                <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-widest font-mono">Recommendation: {advice.recommendation}</p>
                <p className="text-sm text-slate-300 font-serif leading-relaxed mt-1">
                  {advice.reason}
                </p>
             </div>
          </div>

          <div className="flex gap-4 p-4 bg-amber-500/10 rounded-xl border border-amber-500/20">
             <div className="p-2 bg-amber-500/20 rounded-full h-fit mt-1">
                <AlertTriangle className="w-3 h-3 text-amber-400" />
             </div>
             <div>
                <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest font-mono">Watch out for</p>
                <p className="text-[11px] text-slate-400 font-serif italic mt-1 leading-relaxed">
                  {advice.warning}
                </p>
             </div>
          </div>
        </div>

        <button 
          onClick={() => onNavigate(advice.target)}
          className="flex items-center gap-2 px-6 py-3 bg-white text-slate-900 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all shadow-lg"
        >
          Initialize {advice.recommendation}
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
