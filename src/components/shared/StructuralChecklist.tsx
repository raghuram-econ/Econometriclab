import React from 'react';
import { CheckSquare, Square, ShieldCheck, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface StructuralChecklistProps {
  checks: { id: string; label: string; description: string; status: 'pending' | 'warning' | 'done' }[];
  onToggle: (id: string) => void;
  title?: string;
}

export function StructuralChecklist({ checks, onToggle, title = "Structural Assumptions Audit" }: StructuralChecklistProps) {
  return (
    <div className="card-premium p-8 bg-slate-50 border-slate-100 space-y-6">
      <div className="flex items-center gap-3">
        <ShieldCheck className="w-5 h-5 text-blue-600" />
        <h3 className="text-sm font-bold text-slate-900 uppercase tracking-widest">{title}</h3>
      </div>
      
      <div className="space-y-3">
        {checks.map((check) => (
          <div 
            key={check.id}
            onClick={() => onToggle(check.id)}
            className={cn(
              "p-4 rounded-xl border transition-all cursor-pointer flex items-start gap-4",
              check.status === 'done' 
                ? "bg-white border-blue-100 shadow-sm" 
                : "bg-slate-100/50 border-transparent hover:bg-white hover:border-slate-200"
            )}
          >
            <div className="mt-0.5">
              {check.status === 'done' 
                ? <CheckSquare className="w-4 h-4 text-blue-600" /> 
                : <Square className="w-4 h-4 text-slate-300" />
              }
            </div>
            <div className="space-y-1">
              <p className={cn("text-xs font-bold transition-colors", check.status === 'done' ? "text-slate-900" : "text-slate-500")}>
                {check.label}
              </p>
              <p className="text-[10px] text-slate-400 font-serif italic leading-relaxed">
                {check.description}
              </p>
            </div>
            {check.status === 'warning' && (
              <AlertCircle className="w-4 h-4 text-amber-500 ml-auto shrink-0" />
            )}
          </div>
        ))}
      </div>
      
      <div className="pt-4 border-t border-slate-200/50 flex items-center justify-between">
         <span className="text-[9px] font-mono text-slate-400 uppercase tracking-tighter">Required for Academic Validity</span>
         <div className="flex gap-1">
            {checks.map(c => (
              <div key={c.id} className={cn("w-2 h-2 rounded-full", c.status === 'done' ? "bg-blue-600" : "bg-slate-200")} />
            ))}
         </div>
      </div>
    </div>
  );
}
