import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Compass, CornerDownLeft, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { ModuleTab } from '../types';
import { useStore } from '../store/useStore';

interface CommandPaletteProps {
  isOpen: boolean;
  onClose: () => void;
  onNavigate: (tab: ModuleTab) => void;
}

interface CommandItem {
  id: ModuleTab;
  label: string;
  description: string;
  category: string;
}

const COMMAND_ITEMS: CommandItem[] = [
  { id: 'dashboard', label: 'Dashboard / Home', description: 'Go to your main Scholar or Research desk', category: 'General' },
  { id: 'professor-desk', label: 'Professor Desk', description: 'Ask a serious Economics question or clarify concept', category: 'Scholar Desk' },
  { id: 'stats-interpreter', label: 'R & SPSS Interpreter', description: 'Paste and interpret statistical software outputs', category: 'Scholar Desk' },
  { id: 'teacher-mode', label: 'Essay Coach (Teacher Mode)', description: 'Submit essays for supportive feedback & model answers', category: 'Scholar Desk' },
  { id: 'data-upload', label: 'Data Upload', description: 'Upload CSV, Excel or SPSS files for analysis', category: 'Prep' },
  { id: 'variable-view', label: 'Variable View (SPSS)', description: 'View and edit variable labels, types, and values', category: 'Prep' },
  { id: 'descriptive-stats', label: 'Descriptive Statistics Lab', description: 'Summary statistics, skewness, kurtosis, and correlation matrices', category: 'Prep' },
  { id: 'templates', label: 'Research Design Templates', description: 'Review template hypotheses and econometric structures', category: 'Prep' },
  { id: 'data', label: 'Data & Exploratory Analysis', description: 'Browse and explore variables or run descriptive plots', category: 'Prep' },
  { id: 'ols', label: 'Linear Models (OLS)', description: 'Classic ordinary least squares regression with robust options', category: 'Analyze' },
  { id: 'fe', label: 'Panel Data (FE/RE)', description: 'Fixed effects and random effects panel estimators', category: 'Analyze' },
  { id: 'arima', label: 'Forecasting (ARIMA)', description: 'Time series forecasting using Autoregressive Integrated Moving Average', category: 'Analyze' },
  { id: 'causal', label: 'Causal Inference (DiD / IV)', description: 'Difference-in-differences and Instrumental Variables analysis', category: 'Analyze' },
  { id: 'limited', label: 'Probability Models (Logit / Probit)', description: 'Binary response limited dependent variable estimators', category: 'Analyze' },
  { id: 'regularization', label: 'Regularization (LASSO/Ridge)', description: 'LASSO and Ridge regression for high-dimensional models', category: 'Analyze' },
  { id: 'stat-tests', label: 'Statistical Hypothesis Tests', description: 't-tests, ANOVA, Chi-square, and non-parametric tests', category: 'Analyze' },
  { id: 'glm', label: 'Generalized Linear Models (GLM)', description: 'Poisson, negative binomial, and custom link function estimations', category: 'Analyze' },
  { id: 'heckman', label: 'Heckman Selection Model', description: 'Two-step selection bias correction estimator', category: 'Analyze' },
  { id: 'adv-timeseries', label: 'Advanced Time Series (VAR/VECM)', description: 'Vector Autoregressions, cointegration, and impulse responses', category: 'Analyze' },
  { id: 'factor', label: 'Factor Analysis & PCA', description: 'Principal components and exploratory factor dimensions', category: 'Analyze' },
  { id: 'survival', label: 'Survival Analysis (Cox)', description: 'Duration analysis, Kaplan-Meier curves, and hazard rates', category: 'Analyze' },
  { id: 'treatment', label: 'Treatment Effects (PSM)', description: 'Propensity score matching and treatment effect estimations', category: 'Analyze' },
  { id: 'power-analysis', label: 'Power & Sample Sizing', description: 'Calculate required sample size and statistical power parameters', category: 'Analyze' },
  { id: 'diagnostics', label: 'Diagnostics Center', description: 'Check OLS assumptions (heteroskedasticity, autocorrelation, VIF)', category: 'Validate' },
  { id: 'robustness', label: 'Robustness Vault', description: 'Check parameter stability across alternative specifications', category: 'Validate' },
  { id: 'exports', label: 'Manuscript Builder (Writing Lab)', description: 'Draft and format your economic research paper', category: 'Synthesis' },
  { id: 'batch-processing', label: 'Batch Processing Lab', description: 'Estimate multiple specifications sequentially in batch', category: 'Synthesis' },
  { id: 'session-report', label: 'Session Report', description: 'Generate publication-ready compiled PDF/HTML output', category: 'Synthesis' },
  { id: 'learn', label: 'Concept Repository', description: 'Study all 10 modules of Economics syllabus', category: 'Learning' },
  { id: 'quiz', label: 'Empirical Quiz', description: 'Test your econometric and mathematical economics skills', category: 'Learning' },
  { id: 'accuracy', label: 'Numerical Accuracy Lab', description: 'Review NIST and Stata 18 precision comparison', category: 'Learning' },
  { id: 'about-research', label: 'About This Research', description: 'Read background, goals, and licensing information', category: 'Learning' }
];

export function CommandPalette({ isOpen, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset state when opened/closed
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      // Autofocus input
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Clean/Simple Fuzzy Search Logic
  const filteredItems = useMemo(() => {
    const trimmed = query.trim().toLowerCase();
    if (!trimmed) return COMMAND_ITEMS;
    
    return COMMAND_ITEMS.filter(item => 
      item.label.toLowerCase().includes(trimmed) || 
      item.description.toLowerCase().includes(trimmed) ||
      item.category.toLowerCase().includes(trimmed)
    );
  }, [query]);

  // Handle Keyboard Navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => (prev + 1) % filteredItems.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => (prev - 1 + filteredItems.length) % filteredItems.length);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          onNavigate(filteredItems[selectedIndex].id);
          onClose();
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, filteredItems, selectedIndex, onNavigate, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.children[selectedIndex] as HTMLElement;
      if (activeEl) {
        activeEl.scrollIntoView({
          block: 'nearest',
        });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[9999] flex justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div 
        className="max-w-xl w-full bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden mt-16 sm:mt-24 h-fit max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* Search Input Area */}
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center gap-3 bg-slate-50/50">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input 
            ref={inputRef}
            type="text"
            className="w-full bg-transparent border-0 outline-none text-sm font-sans text-slate-800 placeholder-slate-400"
            placeholder="Type a module name or query (e.g., OLS, panel)..."
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelectedIndex(0); // Reset selection
            }}
          />
          <button 
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Results list */}
        <div 
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 max-h-[45vh] divide-y divide-slate-50 custom-scrollbar"
        >
          {filteredItems.length > 0 ? (
            filteredItems.map((item, index) => {
              const isSelected = index === selectedIndex;
              return (
                <div 
                  key={item.id}
                  onClick={() => {
                    onNavigate(item.id);
                    onClose();
                  }}
                  className={cn(
                    "p-3 rounded-lg flex items-center justify-between gap-4 cursor-pointer transition-all",
                    isSelected 
                      ? "bg-slate-900 text-white shadow-md" 
                      : "hover:bg-slate-50 text-slate-700"
                  )}
                >
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-[9px] font-mono font-bold uppercase tracking-widest px-1.5 py-0.5 rounded",
                        isSelected ? "bg-slate-800 text-slate-300" : "bg-slate-100 text-slate-500"
                      )}>
                        {item.category}
                      </span>
                      <h4 className="text-xs font-bold truncate">{item.label}</h4>
                    </div>
                    <p className={cn(
                      "text-[11px] leading-normal font-sans line-clamp-1",
                      isSelected ? "text-slate-300" : "text-slate-400"
                    )}>
                      {item.description}
                    </p>
                  </div>
                  
                  {isSelected && (
                    <span className="text-[10px] font-mono font-semibold flex items-center gap-1 opacity-70 shrink-0">
                      <span>Jump</span>
                      <CornerDownLeft className="w-3 h-3" />
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400 font-sans space-y-1">
              <Compass className="w-8 h-8 mx-auto text-slate-300 stroke-[1.5]" />
              <p className="text-xs font-semibold text-slate-600 mt-2">No research modules found</p>
              <p className="text-[11px] text-slate-400">Try searching for other econometric models</p>
            </div>
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400 select-none">
          <div className="flex items-center gap-2">
            <span>↑↓ to navigate</span>
            <span>•</span>
            <span>Enter to select</span>
            <span>•</span>
            <span>Esc to close</span>
          </div>
          <span className="font-bold text-slate-500">
            {filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>
    </div>
  );
}
