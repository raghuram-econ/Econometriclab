import React, { useState } from 'react';
import { BookOpen, HelpCircle, Info, ArrowRight, Code2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { formatNum, formatPValue } from '../../lib/formatters';

interface Translation {
  variable: string;
  estimate: number;
  technical: string;
  plain: string;
  causality: 'associational' | 'causal' | 'tentative';
}

interface CoefficientTranslatorProps {
  coefficients: any[];
  yVar: string;
  xVars: string[];
  modelType: 'OLS' | 'FE' | 'ARIMA' | 'Logit' | 'Probit';
  isRobust?: boolean;
}

export function CoefficientTranslator({ coefficients, yVar, xVars, modelType, isRobust }: CoefficientTranslatorProps) {
  const [activeTab, setActiveTab] = useState<'text' | 'code'>('text');

  const translations: Translation[] = coefficients.map(c => {
    const estimateValue = Number(c.estimate) || 0;
    const pValue = Number(c.pValue) || 0;
    const isPositive = estimateValue > 0;
    const absVal = Math.abs(estimateValue).toFixed(4);
    
    return {
      variable: c.variable,
      estimate: estimateValue,
      technical: `The coefficient for ${c.variable} is ${formatNum(estimateValue, 4)}, with a ${isRobust ? 'Robust ' : ''}p-value of ${formatPValue(pValue)}.`,
      plain: `A 1-unit increase in **${c.variable}** is associated with an estimated **${isPositive ? 'increase' : 'decrease'}** of **${absVal}** in **${yVar}**, holding other variables constant.`,
      causality: 'associational'
    };
  });

  const getReplicationCode = () => {
    const xString = xVars.join(' + ');
    if (modelType === 'OLS') {
      return {
        r: `model <- lm(${yVar} ~ ${xString}, data = df)\n${isRobust ? 'library(sandwich)\nlibrary(lmtest)\ncoeftest(model, vcov = vcovHC(model, type = "HC1"))' : 'summary(model)'}`,
        stata: `regress ${yVar} ${xVars.join(' ')}${isRobust ? ', robust' : ''}`
      };
    } else if (modelType === 'FE') {
      return {
        r: `library(plm)\nmodel <- plm(${yVar} ~ ${xString}, data = df, model="within")\nsummary(model)`,
        stata: `xtreg ${yVar} ${xVars.join(' ')}, fe`
      };
    } else if (modelType === 'Logit') {
      return {
        r: `model <- glm(${yVar} ~ ${xString}, data = df, family = binomial(link = "logit"))\nsummary(model)`,
        stata: `logit ${yVar} ${xVars.join(' ')}`
      };
    }
    return null;
  };

  const code = getReplicationCode();

  return (
    <div className="card-premium p-4 sm:p-8 bg-slate-50 border-slate-100 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-200 pb-4 gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:gap-6">
           <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-blue-600" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-900 font-mono">Structural Results</h3>
           </div>
           
           <div className="flex bg-slate-200/50 p-1 rounded-lg w-fit">
              <button 
                onClick={() => setActiveTab('text')}
                className={cn("px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-md", activeTab === 'text' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
              >Interpretation</button>
              {code && (
                <button
                  onClick={() => setActiveTab('code')}
                  className={cn("px-3 py-1.5 text-[9px] font-bold uppercase tracking-widest rounded-md", activeTab === 'code' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500")}
                >Replication Code</button>
              )}
           </div>
        </div>
        <div className="flex items-center gap-4">
           <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-[10px] uppercase font-bold text-slate-400 font-mono tracking-tight">{modelType} Estimator</span>
           </div>
        </div>
      </div>

      {activeTab === 'text' ? (
        <div className="grid grid-cols-1 gap-6">
          {translations.map((t) => (
            <div key={t.variable} className="space-y-3">
               <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-900 font-serif italic truncate">{t.variable}</span>
                  <ArrowRight className="w-3 h-3 text-slate-300" />
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                     <p className="text-[9px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" /> Plain Language
                     </p>
                     <div className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm">
                        <p className="text-sm leading-relaxed text-slate-700 font-serif" dangerouslySetInnerHTML={{ __html: t.plain.replace(/\*\*(.*?)\*\*/g, '<strong class="text-blue-600">$1</strong>') }} />
                     </div>
                  </div>
                  <div className="space-y-2 opacity-60 grayscale hover:opacity-100 hover:grayscale-0 transition-all">
                     <p className="text-[9px] uppercase font-bold text-slate-400 font-mono flex items-center gap-1">
                        <Info className="w-3 h-3" /> Technical Rigor
                     </p>
                     <div className="p-4 bg-slate-100 border border-slate-200 rounded-xl">
                        <p className="text-[11px] leading-relaxed text-slate-500 italic font-serif">
                          {t.technical}
                        </p>
                     </div>
                  </div>
               </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in duration-300">
           <div className="space-y-3">
              <div className="flex items-center gap-2">
                 <div className="w-4 h-4 bg-blue-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold">R</div>
                 <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">R Code (plm/stats)</span>
              </div>
              <div className="p-4 bg-slate-900 rounded-xl font-mono text-[11px] text-blue-300 overflow-x-auto">
                 <pre>{code?.r}</pre>
              </div>
           </div>
           <div className="space-y-3">
              <div className="flex items-center gap-2">
                 <div className="w-4 h-4 bg-red-600 rounded-full flex items-center justify-center text-[8px] text-white font-bold">S</div>
                 <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Stata Code</span>
              </div>
              <div className="p-4 bg-slate-900 rounded-xl font-mono text-[11px] text-red-300 overflow-x-auto">
                 <pre>{code?.stata}</pre>
              </div>
           </div>
        </div>
      )}

      <div className="pt-4 border-t border-slate-200">
         <p className="text-[10px] text-slate-400 font-serif italic leading-relaxed">
           {isRobust && (
             <span className="block mb-2 text-emerald-600 font-bold not-italic font-mono">
               Note: Robust (White) standard errors applied.
             </span>
           )}
           <strong>Researcher Insights:</strong> {activeTab === 'text' 
             ? "These interpretations assume ceteris paribus (all else equal) conditions."
             : "Copy these snippets to your local environment for verification and full publication-quality output."
           }
         </p>
      </div>
    </div>
  );
}
