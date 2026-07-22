import React from 'react';
import { 
  BookOpen, 
  HelpCircle, 
  Zap, 
  Search,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';
import { cn } from '../../lib/utils';

export interface LearningPoint {
  title: string;
  description: string;
  context: string;
  icon: any;
  color: string;
}

interface LearningOverlayProps {
  points: LearningPoint[];
  title: string;
  subtitle?: string;
}

export function LearningOverlay({ points, title, subtitle }: LearningOverlayProps) {
  return (
    <div className="card-premium overflow-hidden border-none shadow-elevated bg-white">
      <div className="p-5 bg-indigo-600 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/10 rounded-lg">
            <BookOpen className="w-4 h-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white tracking-tight uppercase font-mono">{title}</h3>
            {subtitle && <p className="text-[10px] text-indigo-200 italic font-serif">{subtitle}</p>}
          </div>
        </div>
        <div className="px-3 py-1 bg-white/10 rounded-full border border-white/10 text-[9px] font-bold text-indigo-100 uppercase tracking-widest font-mono">
          Pedagogical Layer
        </div>
      </div>

      <div className="p-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
        {points.map((point, idx) => (
          <div key={idx} className="space-y-4 group">
            <div className="flex items-center gap-2">
              <div className={cn("p-1.5 rounded-md", point.color)}>
                <point.icon className="w-3.5 h-3.5 text-white" />
              </div>
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono group-hover:text-indigo-600 transition-colors">
                {point.title}
              </h4>
            </div>
            <div className="space-y-3">
              <p className="text-xs text-slate-700 leading-relaxed font-serif italic">
                "{point.description}"
              </p>
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <p className="text-[10px] text-slate-500 leading-relaxed">
                  <span className="font-bold text-slate-700 mr-1 uppercase font-mono text-[9px]">Structural Reality:</span>
                  {point.context}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
      
      <div className="px-8 py-3 bg-indigo-50 border-t border-indigo-100 flex items-center justify-center">
        <p className="text-[9px] font-bold text-indigo-600 uppercase tracking-widest flex items-center gap-2">
          <Search className="w-3 h-3" /> Connect your specific model output to these theoretical principles
        </p>
      </div>
    </div>
  );
}
