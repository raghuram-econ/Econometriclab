import React from 'react';
import { Search, BookOpen, ExternalLink, Bookmark, Clock, Lightbulb, ChevronRight, Info, AlertTriangle, Play, ArrowLeft } from 'lucide-react';
import { cn } from '../../lib/utils';
import { CONCEPTS, Concept } from '../../lib/concepts';
import { useStore } from '../../store/useStore';
import { useNavigation } from '../../hooks/useNavigation';
import { NAV_TABS } from '../../constants/navigation';

export function ConceptRepo() {
  const { selectedConceptId, setSelectedConceptId } = useStore();
  const { navigateTo } = useNavigation();
  const [searchTerm, setSearchTerm] = React.useState('');
  
  const currentConcept = CONCEPTS.find(c => c.id === selectedConceptId) || null;

  const categories = Array.from(new Set(CONCEPTS.map(c => c.category)));

  const handleNavigateToLab = (lab: string) => {
    if (lab.includes('OLS')) navigateTo(NAV_TABS.OLS);
    else if (lab.includes('Fixed Effects')) navigateTo(NAV_TABS.FE);
    else if (lab.includes('ARIMA')) navigateTo(NAV_TABS.ARIMA);
    else if (lab.includes('Causal')) navigateTo(NAV_TABS.CAUSAL);
    else if (lab.includes('Probability')) navigateTo(NAV_TABS.LIMITED);
    else if (lab.includes('Diagnostics')) navigateTo(NAV_TABS.DIAGNOSTICS);
    else if (lab.includes('Robustness')) navigateTo(NAV_TABS.ROBUSTNESS);
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div className="space-y-2">
          <h2 className="text-3xl font-bold tracking-tight text-slate-900">Econometrics Library</h2>
          <p className="text-slate-500 font-serif italic">A structured repository of structural identification and statistical theory.</p>
        </div>
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text"
            placeholder="Search assumptions, bias, or models..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-100 rounded-xl text-xs focus:ring-2 focus:ring-blue-500/10 transition-all outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* Sidebar Categories */}
        <div className="lg:col-span-4 space-y-8">
           {categories.map(cat => (
             <div key={cat} className="space-y-3">
               <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono px-2">{cat}</h3>
               <div className="space-y-1">
                 {CONCEPTS.filter(c => c.category === cat).map(concept => (
                   <button
                    key={concept.id}
                    onClick={() => setSelectedConceptId(concept.id)}
                    className={cn(
                      "w-full text-left px-4 py-3 rounded-xl text-xs font-medium transition-all flex items-center justify-between group",
                      selectedConceptId === concept.id 
                        ? "bg-blue-600 text-white shadow-lg shadow-blue-100" 
                        : "hover:bg-slate-50 text-slate-600"
                    )}
                   >
                     {concept.title}
                     <ChevronRight className={cn(
                       "w-3.5 h-3.5 transition-transform",
                       selectedConceptId === concept.id ? "translate-x-1" : "opacity-0 group-hover:opacity-100"
                     )} />
                   </button>
                 ))}
               </div>
             </div>
           ))}
        </div>

        {/* Detail View */}
        <div className="lg:col-span-8 min-h-[600px]">
           {currentConcept ? (
             <div className="card-premium p-10 bg-white border-slate-100 space-y-10 animate-in fade-in slide-in-from-right-4 duration-500">
                <div className="space-y-4">
                   <div className="flex items-center justify-between">
                     <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 font-mono bg-blue-50 px-3 py-1 rounded-full">
                        {currentConcept.category}
                     </span>
                     <button 
                       onClick={() => setSelectedConceptId(null)}
                       className="flex items-center gap-1 text-[9px] font-bold text-slate-400 hover:text-slate-600 uppercase tracking-widest transition-colors"
                     >
                       <ArrowLeft className="w-3 h-3" /> Back to library
                     </button>
                   </div>
                   <h3 className="text-4xl font-bold tracking-tight text-slate-900">{currentConcept.title}</h3>
                   <p className="text-xl text-slate-500 font-serif italic leading-relaxed">
                      {currentConcept.plainExplanation}
                   </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-900">
                         <BookOpen className="w-4 h-4" />
                         <h4 className="text-xs font-bold uppercase tracking-wider">Formal Econometric Definition</h4>
                      </div>
                      <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100">
                         <p className="text-xs font-mono text-slate-700 leading-relaxed">
                            {currentConcept.formalMeaning}
                         </p>
                      </div>
                   </div>

                   <div className="space-y-4">
                      <div className="flex items-center gap-2 text-slate-900">
                         <Info className="w-4 h-4" />
                         <h4 className="text-xs font-bold uppercase tracking-wider">Why it Matters</h4>
                      </div>
                      <p className="text-sm text-slate-600 font-serif leading-relaxed">
                         {currentConcept.whyItMatters}
                      </p>
                   </div>
                </div>

                <div className="space-y-6 pt-10 border-t border-slate-50">
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                      <div className="space-y-3">
                         <div className="flex items-center gap-2 text-amber-600">
                            <AlertTriangle className="w-4 h-4" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Common Mistake</h4>
                         </div>
                         <p className="text-xs text-slate-500 italic font-serif">
                            {currentConcept.commonMistake}
                         </p>
                      </div>

                      <div className="space-y-3">
                         <div className="flex items-center gap-2 text-blue-600">
                            <Play className="w-4 h-4" />
                            <h4 className="text-[10px] font-black uppercase tracking-widest">Structural Next Step</h4>
                         </div>
                         <p className="text-xs text-slate-500 italic font-serif">
                            {currentConcept.whatToTryNext}
                         </p>
                      </div>
                   </div>

                   <div className="mt-8 p-6 bg-slate-50 border border-slate-100 rounded-2xl flex items-center justify-between">
                      <div className="flex items-center gap-3">
                         <Search className="w-4 h-4 text-slate-400" />
                         <span className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Usage in Lab: {currentConcept.whereItAppears}</span>
                      </div>
                      <button 
                        onClick={() => handleNavigateToLab(currentConcept.whereItAppears)}
                        className="flex items-center gap-2 text-[10px] font-bold text-blue-600 hover:text-blue-700 uppercase tracking-widest"
                      >
                         Go to Lab <ExternalLink className="w-3 h-3" />
                      </button>
                   </div>
                </div>
             </div>
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-center p-20 bg-slate-50/50 border-2 border-dashed border-slate-100 rounded-3xl opacity-50 space-y-6">
                <div className="w-20 h-20 bg-white rounded-full flex items-center justify-center shadow-sm">
                   <BookOpen className="w-8 h-8 text-slate-300" />
                </div>
                <div>
                   <h4 className="text-lg font-bold text-slate-900 mb-2">Select a Foundation</h4>
                   <p className="text-sm text-slate-500 font-serif italic max-w-xs">
                      Choose a concept from the library to explore identification logic and common pitfalls.
                   </p>
                </div>
             </div>
           )}
        </div>
      </div>

      {/* Featured Insight */}
      {!currentConcept && (
        <div className="card-premium p-10 bg-slate-900 text-white overflow-hidden relative">
          <div className="absolute top-0 right-0 p-8 opacity-5">
             <BookOpen className="w-64 h-64" />
          </div>
          <div className="relative z-10 max-w-2xl space-y-6">
             <div className="flex items-center gap-3">
                <Lightbulb className="w-5 h-5 text-amber-400" />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-400 font-mono">Statistical Wisdom</span>
             </div>
             <h3 className="text-2xl font-bold tracking-tight font-serif italic">
                "If you torture the data long enough, it will confess to anything."
             </h3>
             <div className="space-y-4 text-slate-400 text-sm leading-relaxed font-serif italic">
                <p>
                   Ronald Coase's famous adage warns against <em>p-hacking</em> and specification searching. In this platform, we prioritize structural integrity and robustness testing over finding a single 'significant' p-value.
                </p>
                <p>
                   Before you move to the Manuscript Builder, ensure your diagnostics demonstrate that your model's findings are not simply an artifact of functional form or outlier influence.
                </p>
             </div>
             <button className="pt-4 text-xs font-bold uppercase tracking-widest text-white border-b border-white hover:border-blue-400 hover:text-blue-400 transition-all">
                Why Robustness Matters
             </button>
          </div>
        </div>
      )}
    </div>
  );
}

