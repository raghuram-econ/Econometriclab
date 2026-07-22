import React from 'react';
import { 
  HelpCircle, 
  CheckCircle2, 
  AlertTriangle, 
  Info,
  Layers,
  TrendingUp,
  Table
} from 'lucide-react';
import { Dataset } from '../../types';
import { cn } from '../../lib/utils';

interface ModelRecommendation {
  type: 'OLS' | 'FE' | 'ARIMA';
  reason: string;
  pros: string;
  cons: string;
  icon: any;
}

interface ModelAssistantProps {
  dataset: Dataset | null;
  activeModule: 'OLS' | 'FE' | 'ARIMA';
}

export function ModelAssistant({ dataset, activeModule }: ModelAssistantProps) {
  const getRecommendation = (): ModelRecommendation => {
    const structure = dataset?.structure || 'unknown';
    
    if (structure === 'panel') {
      return {
        type: 'FE',
        icon: Layers,
        reason: "The dataset has a multi-entity, multi-time structure. Pooled OLS would likely suffer from omitted variable bias due to unobserved entity heterogeneity.",
        pros: "Controls for time-invariant factors without measuring them directly.",
        cons: "Inefficient if entity effects are truly random; cannot estimate effects of variables that don't change over time."
      };
    }
    
    if (structure === 'time-series') {
      return {
        type: 'ARIMA',
        icon: TrendingUp,
        reason: "Observations are ordered over time and likely exhibit serial correlation. Standard OLS would violate the independence assumption.",
        pros: "Captures autoregressive shocks and moving average trends accurately.",
        cons: "Sensitive to structural breaks; requires the series to be stationary (or differenced)."
      };
    }
    
    return {
      type: 'OLS',
      icon: Table,
      reason: "Commonly used for cross-sectional data where observations are independent. It is the Best Linear Unbiased Estimator (BLUE) under standard assumptions.",
      pros: "Simple interpretation and serves as a powerful baseline benchmark.",
      cons: "Highly sensitive to out-of-sample extrapolation and endogeneity bias."
    };
  };

  const rec = getRecommendation();
  const isMatch = activeModule === rec.type;

  return (
    <div className="card-premium overflow-hidden border-none shadow-elevated bg-white mb-8">
      <div className="flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-slate-100">
        <div className={cn(
          "md:w-1/3 p-6 flex flex-col justify-center items-center text-center space-y-3",
          isMatch ? "bg-blue-50/50" : "bg-slate-50/30"
        )}>
          <div className={cn(
            "p-3 rounded-full",
            isMatch ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-500"
          )}>
            <rec.icon className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Structural Recommendation</h4>
            <p className="text-lg font-bold text-slate-900 tracking-tight">{rec.type} Model</p>
          </div>
          {isMatch ? (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-700 rounded-full text-[9px] font-bold uppercase">
              <CheckCircle2 className="w-3 h-3" /> Specification Match
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-[9px] font-bold uppercase">
              <AlertTriangle className="w-3 h-3" /> Review Logic
            </div>
          )}
        </div>

        <div className="md:w-2/3 p-8 space-y-6">
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-blue-600 font-mono flex items-center gap-2">
              <Info className="w-3.5 h-3.5" /> Why this model?
            </h5>
            <p className="text-sm text-slate-600 leading-relaxed font-serif italic">
              {rec.reason}
            </p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-50">
            <div className="space-y-1.5">
              <h5 className="text-[9px] font-bold uppercase tracking-wider text-slate-400 font-mono">Statistical Strength</h5>
              <p className="text-[11px] text-slate-500 font-serif leading-relaxed">{rec.pros}</p>
            </div>
            <div className="space-y-1.5">
              <h5 className="text-[9px] font-bold uppercase tracking-wider text-red-400 font-mono">When not to use it</h5>
              <p className="text-[11px] text-slate-500 font-serif leading-relaxed">{rec.cons}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
