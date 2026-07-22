import React from 'react';
import { AlertCircle, AlertTriangle, Info, ArrowRight } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface Mistake {
  id: string;
  level: 'error' | 'warning' | 'info';
  problem: string;
  whyItMatters: string;
  howToFix: string;
  nextStep: string;
}

interface MistakeDetectorProps {
  mistakes: Mistake[];
}

export function MistakeDetector({ mistakes }: MistakeDetectorProps) {
  if (mistakes.length === 0) return null;

  return (
    <div className="space-y-4 mb-8 animate-in slide-in-from-top-4 duration-500">
      {mistakes.map((m) => (
        <div 
          key={m.id} 
          className={cn(
            "card-premium p-6 border-l-4 overflow-hidden",
            m.level === 'error' ? "border-l-red-500 bg-red-50/30" : 
            m.level === 'warning' ? "border-l-amber-500 bg-amber-50/30" : 
            "border-l-blue-500 bg-blue-50/30"
          )}
        >
          <div className="flex gap-4">
            <div className={cn(
              "p-2 rounded-lg shrink-0 h-fit",
              m.level === 'error' ? "bg-red-100 text-red-600" : 
              m.level === 'warning' ? "bg-amber-100 text-amber-600" : 
              "bg-blue-100 text-blue-600"
            )}>
              {m.level === 'error' ? <AlertCircle className="w-5 h-5" /> : 
               m.level === 'warning' ? <AlertTriangle className="w-5 h-5" /> : 
               <Info className="w-5 h-5" />}
            </div>
            
            <div className="space-y-3 flex-1">
              <div>
                <h4 className="text-sm font-bold text-slate-900 tracking-tight">{m.problem}</h4>
                <p className="text-[11px] text-slate-500 font-mono uppercase tracking-wider mt-1">
                  Severity: {m.level}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-tighter">Why it matters</p>
                  <p className="text-xs text-slate-600 leading-relaxed font-serif italic">{m.whyItMatters}</p>
                </div>
                <div className="space-y-1">
                  <p className="text-[10px] font-bold text-slate-400 uppercase font-mono tracking-tighter">How to fix it</p>
                  <p className="text-xs text-slate-600 leading-relaxed font-serif italic">{m.howToFix}</p>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <ArrowRight className="w-3 h-3 text-blue-500" />
                  <span className="text-[10px] font-bold text-slate-800">Recommendation: {m.nextStep}</span>
                </div>
                <span className="text-[9px] text-slate-400 font-mono italic">Econometrics Lab Safety Protocol</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
