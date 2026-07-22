import React from 'react';
import { 
  Info, 
  HelpCircle, 
  AlertCircle, 
  PlayCircle, 
  Settings2, 
  GraduationCap 
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface ModuleIntroProps {
  title: string;
  description: string;
  useWhen: string;
  requires: string[];
  youWillGet: string[];
  pitfalls: string[];
  example: string;
  className?: string;
}

export function ModuleIntroCard({
  title,
  description,
  useWhen,
  requires,
  youWillGet,
  pitfalls,
  example,
  className
}: ModuleIntroProps) {
  const [isCollapsed, setIsCollapsed] = React.useState(false);

  if (isCollapsed) {
    return (
      <div className={cn("card-premium py-3 px-6 mb-8 flex items-center justify-between bg-white border-l-4 border-l-blue-600 shadow-sm", className)}>
        <div className="flex items-center gap-3">
          <GraduationCap className="w-4 h-4 text-blue-600" />
          <h2 className="text-xs font-bold uppercase tracking-widest text-slate-700">{title} Guidance</h2>
        </div>
        <button 
          onClick={() => setIsCollapsed(false)}
          className="text-[10px] uppercase font-bold text-blue-600 hover:underline"
        >
          Expand Guide
        </button>
      </div>
    );
  }

  return (
    <div className={cn("card-premium overflow-hidden border-none shadow-elevated bg-white mb-8 animate-in slide-in-from-top-4 duration-500", className)}>
      <div className="p-5 bg-blue-600 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <GraduationCap className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">{title} Guide</h3>
            <p className="text-[10px] text-blue-100 font-serif italic">Instructor's Context & Workspace Intent</p>
          </div>
        </div>
        <button 
          onClick={() => setIsCollapsed(true)}
          className="text-[10px] font-bold text-white/60 hover:text-white uppercase tracking-widest font-mono"
        >
          Dismiss
        </button>
      </div>

      <div className="p-8 space-y-8">
        <div className="space-y-3">
          <p className="text-sm text-slate-700 leading-relaxed font-serif max-w-3xl italic border-l-2 border-blue-50 pl-4">
            "{description}"
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              <HelpCircle className="w-3.5 h-3.5" /> Use this when...
            </h4>
            <p className="text-xs text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-lg border border-slate-100">
              {useWhen}
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              <Settings2 className="w-3.5 h-3.5" /> Requires
            </h4>
            <ul className="space-y-2">
              {requires.map((req, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600 italic">
                  <div className="w-1 h-1 rounded-full bg-blue-400 mt-1.5" />
                  {req}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-4">
            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              <PlayCircle className="w-3.5 h-3.5" /> You will get
            </h4>
            <ul className="space-y-2">
              {youWillGet.map((out, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-600">
                  <div className="w-1 h-1 rounded-full bg-slate-300 mt-1.5" />
                  {out}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="pt-6 border-t border-slate-100 grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-3 p-4 bg-amber-50/50 rounded-xl border border-amber-100/50">
            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-amber-600 font-mono">
              <AlertCircle className="w-3.5 h-3.5" /> Common Pitfalls
            </h4>
            <ul className="space-y-2">
              {pitfalls.map((pit, i) => (
                <li key={i} className="text-[11px] text-amber-800 leading-relaxed italic">
                  • {pit}
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3 p-4 bg-slate-900 rounded-xl">
            <h4 className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              <Info className="w-3.5 h-3.5" /> Example Use Case
            </h4>
            <p className="text-[11px] text-slate-100 leading-relaxed font-serif italic">
              {example}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
