import React, { useState } from 'react';
import { FileText, Settings, Globe, Award } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ManuscriptMeta {
  title: string;
  abstract: string;
  jelCodes: string[];
  keywords: string[];
  formattedAs: 'latex' | 'apa' | 'chicago';
}

interface ManuscriptSettingsProps {
  targetJournal: string;
  setTargetJournal: (j: string) => void;
  customJournal: string;
  setCustomJournal: (j: string) => void;
}

export const ManuscriptSettings: React.FC<ManuscriptSettingsProps> = ({
  targetJournal,
  setTargetJournal,
  customJournal,
  setCustomJournal
}) => {
  const [meta, setMeta] = useState<ManuscriptMeta>({
    title: '',
    abstract: '',
    jelCodes: [],
    keywords: [],
    formattedAs: 'latex'
  });

  const availableJEL = [
    { code: 'C1', desc: 'Econometric and Statistical Methods: General' },
    { code: 'C2', desc: 'Single Equation Models • Single Variables' },
    { code: 'C3', desc: 'Multiple or Simultaneous Equation Models' },
    { code: 'E1', desc: 'General Aggregative Models' },
    { code: 'G1', desc: 'General Financial Markets' },
    { code: 'O1', desc: 'Economic Development' },
  ];

  const journals = [
    { value: 'American Economic Review (AER)', label: 'American Economic Review (AER)' },
    { value: 'Quarterly Journal of Economics (QJE)', label: 'Quarterly Journal of Economics (QJE)' },
    { value: 'Journal of Political Economy (JPE)', label: 'Journal of Political Economy (JPE)' },
    { value: 'Journal of Development Economics (JDE)', label: 'Journal of Development Economics (JDE)' },
    { value: 'Journal of Environmental Economics and Management (JEEM)', label: 'Journal of Environmental Economics and Management (JEEM)' },
    { value: 'Review of Economic Studies (REStud)', label: 'Review of Economic Studies (REStud)' },
    { value: 'Economic Journal (EJ)', label: 'Economic Journal (EJ)' },
    { value: 'Journal of Labor Economics (JLE)', label: 'Journal of Labor Economics (JLE)' },
    { value: 'Other', label: 'Other (free text input)' },
  ];

  return (
    <div className="space-y-8 p-6 bg-white rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-700">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-5 h-5 text-blue-600" />
            Empirical Manuscript Builder
          </h2>
          <p className="text-sm text-slate-500 font-serif italic mt-1">"Systematic synthesis of results into publishable drafts."</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-6">
          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Working Title</label>
            <input 
              type="text" 
              placeholder="e.g., The Impact of Credit Shocks on Rural Consumption in Uttar Pradesh"
              className="w-full p-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
              value={meta.title}
              onChange={(e) => setMeta({...meta, title: e.target.value})}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-blue-500" /> Target Journal
              </label>
              <select
                value={targetJournal}
                onChange={(e) => setTargetJournal(e.target.value)}
                className="w-full p-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium appearance-none"
              >
                <option value="">-- Select Target Journal --</option>
                {journals.map((j) => (
                  <option key={j.value} value={j.value}>{j.label}</option>
                ))}
              </select>
            </div>

            {targetJournal === 'Other' && (
              <div className="space-y-2 animate-in fade-in duration-200">
                <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Custom Journal Name</label>
                <input 
                  type="text" 
                  placeholder="e.g., Journal of Applied Econometrics"
                  className="w-full p-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                  value={customJournal}
                  onChange={(e) => setCustomJournal(e.target.value)}
                />
              </div>
            )}
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Executive Abstract</label>
            <textarea 
              rows={4}
              placeholder="Synthesize the research question, dataset, and key identification strategy..."
              className="w-full p-4 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all font-serif leading-relaxed"
              value={meta.abstract}
              onChange={(e) => setMeta({...meta, abstract: e.target.value})}
            />
          </div>
        </div>

        <div className="space-y-6">
          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
            <div className="flex items-center gap-2 mb-4">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <h3 className="text-[10px] font-bold uppercase text-blue-900">JEL Classification</h3>
            </div>
            <div className="space-y-1">
              {availableJEL.map(jel => (
                <button 
                  key={jel.code}
                  onClick={() => {
                    const exists = meta.jelCodes.includes(jel.code);
                    setMeta({
                      ...meta,
                      jelCodes: exists 
                        ? meta.jelCodes.filter(c => c !== jel.code)
                        : [...meta.jelCodes, jel.code]
                    });
                  }}
                  className={cn(
                    "w-full text-left p-2 rounded text-[10px] transition-all",
                    meta.jelCodes.includes(jel.code) 
                      ? "bg-blue-600 text-white shadow-sm" 
                      : "hover:bg-blue-100 text-slate-600"
                  )}
                >
                  <span className="font-bold underline mr-2">{jel.code}</span> {jel.desc}
                </button>
              ))}
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <h3 className="text-[10px] font-bold uppercase text-slate-600">Export Standard</h3>
            </div>
            <div className="grid grid-cols-1 gap-2">
              {(['latex', 'apa', 'chicago'] as const).map(fmt => (
                <button 
                  key={fmt}
                  onClick={() => setMeta({...meta, formattedAs: fmt})}
                  className={cn(
                    "px-3 py-2 rounded text-[10px] font-bold uppercase tracking-widest border transition-all",
                    meta.formattedAs === fmt 
                      ? "bg-slate-900 text-white border-slate-900" 
                      : "bg-white text-slate-400 border-slate-200 hover:border-slate-300"
                  )}
                >
                  {fmt} Header
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
