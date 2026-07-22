import React from 'react';
import { Target, Lightbulb, TrendingUp, Layers, MousePointer2, BrainCircuit } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { ResearchQuestion, Dataset } from '../../types';
import { cn } from '../../lib/utils';

interface ResearchQuestionBuilderProps {
  dataset?: Dataset | null;
}

export function ResearchQuestionBuilder({ dataset: propDataset }: ResearchQuestionBuilderProps) {
  const { researchQuestion, setResearchQuestion, currentDataset: storeDataset } = useStore();
  const currentDataset = propDataset || storeDataset;

  const updateField = (field: keyof ResearchQuestion, value: string) => {
    setResearchQuestion({ ...researchQuestion, [field]: value });
  };

  const variables = currentDataset?.variables || [];
  const hasVariables = variables.length > 0;

  return (
    <div className="card-premium p-8 bg-white border-slate-100 space-y-12 animate-in fade-in slide-in-from-top-4 duration-500">
      <div className="space-y-2 pb-6 border-b border-slate-100">
         <h2 className="text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-3">
           <BrainCircuit className="w-6 h-6 text-blue-600" />
           Step 1: Research Question & Identification
         </h2>
         <p className="text-sm text-slate-500 font-serif italic">
           Define your structural hypothesis before selecting a model.
         </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <div className="space-y-8">
          {/* outcome */}
          <div className="space-y-4">
             <div className="flex items-center justify-between">
               <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">
                 <Target className="w-3.5 h-3.5 text-blue-600" />
                 Outcome Variable (Y)
               </label>
               {hasVariables && (
                 <span className="text-[9px] text-slate-400 italic font-serif">
                   Missing X or Y? Check detected variable types.
                 </span>
               )}
             </div>
             <select 
               value={researchQuestion.outcome}
               onChange={(e) => updateField('outcome', e.target.value)}
               className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-500/5 outline-none transition-all"
               disabled={!hasVariables}
             >
               <option value="">{hasVariables ? "Select variable..." : "No variables available"}</option>
               {variables.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
             </select>
             {!hasVariables && currentDataset && (
               <p className="text-[10px] text-red-500 font-mono italic pl-1">
                 Warning: No variables identified in dataset schema.
               </p>
             )}
          </div>

          {/* explanatory */}
          <div className="space-y-4">
             <div className="flex items-center justify-between">
               <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">
                 <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                 Key Explanatory Variable (X)
               </label>

             </div>
             <select 
               value={researchQuestion.explanatory}
               onChange={(e) => updateField('explanatory', e.target.value)}
               className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium focus:ring-4 focus:ring-blue-500/5 outline-none transition-all"
               disabled={!hasVariables}
             >
               <option value="">{hasVariables ? "Select focus variable..." : "No variables available"}</option>
               {variables.map(v => <option key={v.name} value={v.name}>{v.label}</option>)}
             </select>
          </div>

          {/* Identification Goal */}
          <div className="space-y-4">
             <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">
               <MousePointer2 className="w-3.5 h-3.5 text-amber-600" />
               Empirical Objective
             </label>
             <div className="grid grid-cols-3 gap-3">
               {[
                 { id: 'explanation', label: 'Explain', icon: Lightbulb, color: 'text-amber-600', bg: 'bg-amber-50' },
                 { id: 'causal', label: 'Causal', icon: Target, color: 'text-rose-600', bg: 'bg-rose-50' },
                 { id: 'forecasting', label: 'Forecast', icon: TrendingUp, color: 'text-blue-600', bg: 'bg-blue-50' }
               ].map(goal => (
                 <button
                   key={goal.id}
                   onClick={() => updateField('goal', goal.id)}
                   className={cn(
                     "flex flex-col items-center justify-center p-4 rounded-xl border transition-all space-y-2",
                     researchQuestion.goal === goal.id 
                       ? `border-slate-900 bg-slate-900 text-white shadow-lg` 
                       : "border-slate-100 bg-white text-slate-400 hover:border-slate-200"
                   )}
                 >
                   <goal.icon className={cn("w-4 h-4", researchQuestion.goal === goal.id ? "text-white" : goal.color)} />
                   <span className="text-[10px] font-bold uppercase tracking-tighter">{goal.label}</span>
                 </button>
               ))}
             </div>
          </div>
        </div>

        <div className="space-y-8 p-8 bg-slate-50 rounded-2xl border border-slate-100">
           <div className="space-y-4">
              <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">
                 <Lightbulb className="w-3.5 h-3.5 text-blue-400" />
                 Hypothesis / Mechanism
              </label>
              <textarea 
                value={researchQuestion.hypothesis}
                onChange={(e) => updateField('hypothesis', e.target.value)}
                placeholder="Example: I hypothesize that higher education levels lead to higher wages because of human capital accumulation..."
                className="w-full h-32 p-4 bg-white border border-slate-100 rounded-xl text-sm italic font-serif leading-relaxed focus:ring-4 focus:ring-blue-500/5 outline-none transition-all resize-none"
              />
           </div>

           <div className="p-4 bg-white rounded-xl border border-slate-200 space-y-3">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-600 font-mono">Advisor Verdict</h3>
              {researchQuestion.outcome && researchQuestion.explanatory && researchQuestion.goal ? (
                <div className="space-y-2">
                   <p className="text-xs text-slate-700 font-serif leading-relaxed italic">
                     "You are investigating how <strong className="text-slate-900">{researchQuestion.explanatory}</strong> impacts <strong className="text-slate-900">{researchQuestion.outcome}</strong>. 
                     Since your goal is <strong className="text-slate-900">{researchQuestion.goal}</strong>, your identification strategy should prioritize 
                     {researchQuestion.goal === 'causal' ? ' valid exclusion restrictions or conditional independence.' : researchQuestion.goal === 'explanation' ? ' descriptive accuracy and variable importance.' : ' minimizing out-of-sample forecast error.'}"
                   </p>
                </div>
              ) : (
                <p className="text-xs text-slate-400 font-serif italic">Complete the selections to generate a structural tip.</p>
              )}
           </div>
        </div>
      </div>
    </div>
  );
}
