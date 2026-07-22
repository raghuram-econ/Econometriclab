import React from 'react';
import { CheckCircle2, Circle, AlertTriangle, HelpCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ChecklistItem {
  label: string;
  isDone: boolean;
}

interface TeachingChecklistProps {
  steps: ChecklistItem[];
  notice: string;
  typicalMistake: string;
  discussionQuestion: string;
  nextExtension: string;
}

export function TeachingChecklist({ 
  steps, 
  notice, 
  typicalMistake, 
  discussionQuestion, 
  nextExtension 
}: TeachingChecklistProps) {
  return (
    <div className="card-premium bg-slate-50 border-slate-200 overflow-hidden">
      <div className="p-4 bg-slate-100 border-b border-slate-200 flex items-center justify-between">
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-600 font-mono">Pedagogical Checklist</h3>
        <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-bold uppercase">Teaching Mode</span>
      </div>

      <div className="p-6 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Checklist */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Workflow Progress</h4>
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="flex items-center gap-3">
                  {step.isDone ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <Circle className="w-4 h-4 text-slate-300" />
                  )}
                  <span className={cn(
                    "text-xs font-medium",
                    step.isDone ? "text-slate-900" : "text-slate-400"
                  )}>
                    {step.label}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Teacher's Note */}
          <div className="space-y-4">
            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">Teaching Focus</h4>
            <div className="p-4 bg-white rounded-lg border border-slate-200 shadow-sm space-y-3">
              <div className="flex items-start gap-2">
                <HelpCircle className="w-3.5 h-3.5 text-blue-500 mt-0.5" />
                <p className="text-[11px] text-slate-700 leading-relaxed font-serif italic">
                  <span className="font-bold text-slate-900 not-italic uppercase font-mono text-[9px] mr-1">Notice:</span>
                  {notice}
                </p>
              </div>
              <div className="flex items-start gap-2 border-t border-slate-50 pt-2">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-500 mt-0.5" />
                <p className="text-[11px] text-slate-700 leading-relaxed font-serif italic">
                  <span className="font-bold text-amber-900 not-italic uppercase font-mono text-[9px] mr-1">Typical Mistake:</span>
                  {typicalMistake}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-slate-200">
           <div className="p-4 bg-blue-900 text-white rounded-lg space-y-2">
              <h5 className="text-[9px] font-bold uppercase tracking-widest text-blue-300 font-mono">Class Discussion</h5>
              <p className="text-[11px] font-serif italic opacity-90 leading-relaxed">
                "{discussionQuestion}"
              </p>
           </div>
           <div className="p-4 bg-slate-800 text-white rounded-lg space-y-2">
              <h5 className="text-[9px] font-bold uppercase tracking-widest text-slate-400 font-mono">Advanced Extension</h5>
              <p className="text-[11px] font-serif italic opacity-90 leading-relaxed">
                {nextExtension}
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}
