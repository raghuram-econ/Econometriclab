import React, { useState, useEffect } from 'react';
import { 
  GraduationCap, 
  Sparkles, 
  PenTool, 
  Zap, 
  Clock, 
  ChevronRight,
  TrendingUp,
  BookOpen,
  Upload,
  X,
  Loader2,
  RefreshCw,
  Compass,
  Bookmark
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';
import { ModuleTab } from '../types';

const DataUploadLab = React.lazy(() => import('./modules/DataUploadLab'));

interface ScholarDashboardProps {
  onNavigate: (tab: ModuleTab) => void;
  onRestore?: (sessionId: string) => Promise<void> | void;
  onExport?: (sessionId: string) => Promise<void> | void;
}

interface Activity {
  id: string;
  topic: string;
  moduleName: string;
  timestamp: string;
}

const economistTips = [
  {
    title: "Heteroscedasticity Robustness (HC3)",
    tag: "OLS Best Practice",
    tip: "When the Breusch-Pagan or White test rejects homoscedasticity, classic OLS standard errors are biased, invalidating confidence intervals. Use Huber-White robust standard errors (preferring HC3 for smaller samples) to preserve valid hypothesis testing.",
    metric: "Rule of thumb: p < 0.05 on BP test → Activate HC3 robust SEs",
    citation: "White (1980), Econometrica"
  },
  {
    title: "The Weak Instrument Threshold",
    tag: "Causal Inference",
    tip: "In Two-Stage Least Squares (2SLS), instrumental variables must satisfy the relevance condition. A rule of thumb is that the first-stage regression's F-statistic for the joint significance of the instruments must exceed 10 (or more conservatively 104.7 under Stock-Yogo critical values) to rule out weak instrument bias.",
    metric: "Rule of thumb: First-stage joint F-statistic > 10",
    citation: "Stock & Yogo (2005)"
  },
  {
    title: "Multicollinearity Diagnostics (VIF)",
    tag: "Model Specification",
    tip: "High multicollinearity increases the variance of coefficient estimates, making them highly unstable and sensitive to minor specification changes. Compute Variance Inflation Factors (VIF); any regressor with a VIF > 5.0 indicates severe collinearity requiring consolidation.",
    metric: "Rule of thumb: Regressor VIF < 5.0 is optimal",
    citation: "Wooldridge, Introductory Econometrics"
  },
  {
    title: "Logarithmic Interpretation Rules",
    tag: "Functional Form",
    tip: "Transforming skewed variables (like income, wages, or GDP) into logarithms changes coefficient interpretation. In a log-linear model (ln(Y) on X), 100 * β is the percentage change in Y for a unit change in X. In a log-log model (ln(Y) on ln(X)), β is the constant elasticity.",
    metric: "Interpretation: log-log = elasticity; log-linear = semi-elasticity",
    citation: "Halvorsen & Palmquist (1980), AER"
  },
  {
    title: "Fixed Effects vs. Random Effects",
    tag: "Panel Econometrics",
    tip: "Fixed Effects (FE) absorb all unobserved time-invariant individual heterogeneity (e.g., country geography, individual ability). Use a Hausman test to compare FE against Random Effects (RE). A significant p-value (< 0.05) rejects RE, indicating that unobserved individual effects are correlated with regressors, making FE necessary.",
    metric: "Rule of thumb: Hausman p < 0.05 → Use Fixed Effects",
    citation: "Hausman (1978), Econometrica"
  },
  {
    title: "Omitted Variable Bias (OVB)",
    tag: "Causal Inference",
    tip: "OVB arises when a variable is excluded from the regression that is both a determinant of Y and correlated with X. This violates the Gauss-Markov assumption of exogeneity (E[u|X] = 0). Resolve OVB by adding control variables, estimating fixed effects, or finding a valid exogenous source of variation (IV).",
    metric: "Bias = β_omitted * Cov(X, Omitted) / Var(X)",
    citation: "Angrist & Pischke, Mostly Harmless Econometrics"
  },
  {
    title: "Sample Selection Bias (Heckit)",
    tag: "Microeconometrics",
    tip: "If your sample is non-randomly truncated (e.g. studying wages but only observing people who chose to work), standard OLS is biased. Heckman's two-step procedure corrects this: first estimate a selection Probit, calculate the Inverse Mills Ratio (lambda), and include it as a regressor in the second-stage OLS.",
    metric: "Check: Significance of Inverse Mills Ratio (p < 0.05) confirms bias",
    citation: "Heckman (1979), Econometrica"
  }
];

export default function ScholarDashboard({ onNavigate }: ScholarDashboardProps) {
  const [streak, setStreak] = useState(0);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [currentTipIndex, setCurrentTipIndex] = useState(0);

  useEffect(() => {
    // Randomize initial tip
    const rand = Math.floor(Math.random() * economistTips.length);
    setCurrentTipIndex(rand);
  }, []);

  const handleNextTip = () => {
    setCurrentTipIndex((prev) => (prev + 1) % economistTips.length);
  };

  useEffect(() => {
    // Handle Scholar Streak
    const updateStreak = () => {
      try {
        const streakData = localStorage.getItem('economics_scholar_streak');
        const today = new Date().toDateString();
        
        if (streakData) {
          const parsed = JSON.parse(streakData);
          if (parsed.lastActiveDate === today) {
            // Already active today
            setStreak(parsed.count);
          } else {
            const lastActive = new Date(parsed.lastActiveDate);
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            
            if (lastActive.toDateString() === yesterday.toDateString()) {
              // Active yesterday, increment streak
              const newStreak = parsed.count + 1;
              setStreak(newStreak);
              localStorage.setItem('economics_scholar_streak', JSON.stringify({ count: newStreak, lastActiveDate: today }));
            } else {
              // Missed a day, reset streak
              setStreak(1);
              localStorage.setItem('economics_scholar_streak', JSON.stringify({ count: 1, lastActiveDate: today }));
            }
          }
        } else {
          // First time active
          setStreak(1);
          localStorage.setItem('economics_scholar_streak', JSON.stringify({ count: 1, lastActiveDate: today }));
        }
      } catch (e) {
        console.error('Failed to update streak:', e);
      }
    };

    updateStreak();

    // Load activities from localStorage
    try {
      const saved = localStorage.getItem('economics_scholar_activity');
      if (saved) {
        setActivities(JSON.parse(saved));
      } else {
        // Default mock activity
        const mock = [
          { id: '1', topic: 'IS-LM model and monetary policy transmission', moduleName: 'Professor Desk', timestamp: '2 hours ago' },
          { id: '2', topic: 'Keynesian vs Monetarist view on inflation', moduleName: 'Academic Lab', timestamp: 'Yesterday' },
          { id: '3', topic: 'Cobb-Douglas Euler Theorem Proof', moduleName: 'Teacher Mode', timestamp: '2 days ago' }
        ];
        setActivities(mock);
      }
    } catch (e) {
      console.error(e);
    }
  }, []);

  const navCards = [
    {
      id: 'professor-desk',
      title: 'Professor Desk',
      description: 'Economics-only tutor for MA, UGC-NET, and CUET PG rigor.',
      icon: GraduationCap,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-100',
      iconBg: 'bg-emerald-100'
    },
    {
      id: 'academic-lab',
      title: 'Academic Lab',
      description: 'Topic synthesis, past question style answers, and policy memos.',
      icon: Sparkles,
      color: 'bg-blue-50 text-blue-700 border-blue-100',
      iconBg: 'bg-blue-100'
    },
    {
      id: 'teacher-mode',
      title: 'Teacher Mode',
      description: 'Submit your essays for strict supportive feedback and model answers.',
      icon: PenTool,
      color: 'bg-rose-50 text-rose-700 border-rose-100',
      iconBg: 'bg-rose-100'
    }
  ];

  const currentTip = economistTips[currentTipIndex] || economistTips[0] || { tag: "", citation: "", title: "", tip: "", metric: "" };

  return (
    <div id="scholar-dashboard" className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700">
      
      {/* Header section with branding */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-6">
        <div>
          <h1 className="text-4xl font-serif font-bold text-stone-900">Scholar Dashboard</h1>
          <p className="text-stone-500 font-serif italic mt-1 text-lg">Economics Learning Lab (Beta)</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            id="load-dataset-header-btn"
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-serif font-semibold px-5 py-2.5 rounded-xl border border-emerald-500 hover:border-emerald-600 transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 cursor-pointer text-sm animate-in fade-in duration-300"
          >
            <Upload className="w-4 h-4" />
            <span>Load Dataset</span>
          </button>
          <div className="flex items-center gap-2 bg-stone-100 px-4 py-2 rounded-full border border-stone-200">
            <Clock className="w-4 h-4 text-stone-400" />
            <span className="text-xs font-bold text-stone-600 uppercase tracking-widest">Session Active</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Main Action Cards (Professor, Lab, Teacher) */}
        <div className="lg:col-span-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {navCards.map((card) => {
              const Icon = card.icon;
              return (
                <button
                  key={card.id}
                  onClick={() => onNavigate(card.id as ModuleTab)}
                  className={cn(
                    "group relative p-6 rounded-2xl border transition-all hover:shadow-xl hover:-translate-y-1 text-left flex flex-col justify-between h-56",
                    card.color
                  )}
                >
                  <div>
                    <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", card.iconBg)}>
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-bold font-serif mb-2">{card.title}</h3>
                    <p className="text-sm opacity-80 leading-relaxed font-serif">
                      {card.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest mt-4">
                    Enter Module <ChevronRight className="w-3 h-3" />
                  </div>
                </button>
              );
            })}

            {/* Placeholder / Extra card for Lab (if distinct) or Research advisor */}
            <button
              onClick={() => onNavigate('learn')}
              className="group relative p-6 rounded-2xl border border-stone-200 bg-stone-50 text-stone-700 transition-all hover:shadow-xl hover:-translate-y-1 text-left flex flex-col justify-between h-56"
            >
              <div>
                <div className="w-12 h-12 rounded-xl bg-stone-200 flex items-center justify-center mb-4 transition-transform group-hover:scale-110">
                  <BookOpen className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-bold font-serif mb-2">Concept Repository</h3>
                <p className="text-sm opacity-80 leading-relaxed font-serif">
                  Browse a curated list of economic theorems and definitions for quick reference.
                </p>
              </div>
              <div className="flex items-center gap-1 text-xs font-bold uppercase tracking-widest mt-4">
                Explore Concepts <ChevronRight className="w-3 h-3" />
              </div>
            </button>
          </div>

          {/* Economist's Corner Info-Pane */}
          <div className="bg-white border border-stone-200 rounded-2xl shadow-sm p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-1.5 bg-amber-50 text-amber-700 rounded-lg">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-stone-900">Economist's Corner</h3>
                  <p className="text-[10px] text-stone-400 uppercase tracking-widest font-mono">Research & Methodology Tips</p>
                </div>
              </div>
              <button
                onClick={handleNextTip}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-stone-600 hover:text-stone-900 bg-stone-50 hover:bg-stone-100 border border-stone-200 rounded-xl transition-all cursor-pointer shadow-sm active:scale-95"
              >
                <RefreshCw className="w-3.5 h-3.5 text-stone-500" />
                <span>Next Tip</span>
              </button>
            </div>

            <div className="min-h-[140px] flex flex-col justify-between space-y-3 animate-in fade-in duration-300">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-stone-100 text-stone-850 text-[10px] font-bold font-mono">
                    <Bookmark className="w-3 h-3 text-stone-500" />
                    {currentTip.tag}
                  </span>
                  <span className="text-[10px] text-stone-400 font-serif italic">
                    {currentTip.citation}
                  </span>
                </div>
                
                <h4 className="font-serif text-base font-bold text-stone-900">
                  {currentTip.title}
                </h4>
                
                <p className="text-xs text-stone-600 font-serif leading-relaxed text-justify">
                  {currentTip.tip}
                </p>
              </div>

              <div className="bg-amber-50/50 border-l-4 border-amber-500 p-3 rounded-r-xl text-xs text-amber-900 font-mono italic leading-relaxed">
                <span className="font-bold block uppercase text-[8px] text-amber-700 tracking-wider mb-0.5">Practical Rule of Thumb</span>
                {currentTip.metric}
              </div>
            </div>
          </div>

        </div>

        {/* Sidebar Cards (Streak & Recent Activity) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Scholar Streak Card */}
          <div className="bg-[#1B2E41] text-white p-6 rounded-2xl shadow-lg border border-slate-800 flex flex-col items-center text-center space-y-4">
            <div className="bg-amber-500/20 p-4 rounded-full">
              <Zap className="w-8 h-8 text-amber-400 fill-amber-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold font-serif">Scholar Streak</h3>
              <p className="text-slate-400 text-xs font-mono uppercase tracking-widest mt-1">Consistent Learning</p>
            </div>
            <div className="text-5xl font-bold tracking-tighter">
              {streak} <span className="text-xl text-slate-400">Days</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div className="bg-amber-400 h-full w-4/5" />
            </div>
            <p className="text-[10px] text-slate-400 font-serif italic">
              Keep going! 3 more days until your next academic milestone badge.
            </p>
          </div>

          {/* Recent Activity Card */}
          <div className="bg-white border border-stone-200 p-6 rounded-2xl shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-stone-400" />
                Recent Activity
              </h3>
            </div>
            <div className="space-y-4">
              {activities.length > 0 ? activities.map((act) => (
                <div key={act.id} className="group cursor-pointer">
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-[10px] font-bold text-stone-400 uppercase tracking-wider">{act.moduleName}</span>
                    <span className="text-[10px] text-stone-400 font-serif italic">{act.timestamp}</span>
                  </div>
                  <p className="text-xs font-serif text-stone-800 group-hover:text-stone-600 transition-colors leading-relaxed">
                    {act.topic}
                  </p>
                </div>
              )) : (
                <p className="text-xs text-stone-400 font-serif italic text-center py-4">No recent activity detected.</p>
              )}
            </div>
          </div>

        </div>

      </div>

      {/* Recent Inquiries (Quick-select topics) */}
      <div className="bg-stone-50 border border-stone-200 p-6 rounded-2xl shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-stone-100 pb-3">
          <h3 className="text-sm font-bold uppercase tracking-widest text-stone-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-stone-400" />
            Quick Select: Academic Inquiries
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {[
            { label: "MIC-01 Analysis", target: "professor-desk", text: "Provide an advanced integrated analysis of UGC-NET Microeconomics Unit 01 (Consumer Choice Theory, Slutsky substitution vs income effect, indirect utility, and Roy's Identity)" },
            { label: "Indian Inflation Episodes", target: "professor-desk", text: "Analyze structural and historical inflation episodes in the Indian economy, detailing demand-pull factors, supply-side food shocks, and the transition to the MPC framework" },
            { label: "RBI Monetary Policy Framework", target: "academic-lab", text: "RBI Monetary Policy Framework, flexible inflation targeting, Repo/Reverse Repo transmission mechanism, and the trilemma constraint" },
            { label: "Fiscal Deficit and FRBM", target: "academic-lab", text: "Fiscal Deficit sustainability, public debt-to-GDP ratio path, and structural targets under the Fiscal Responsibility and Budget Management (FRBM) Act in India" },
            { label: "Solow Steady State Proof", target: "professor-desk", text: "Detailed mathematical proof of the Solow Steady State condition and the Golden Rule of accumulation." }
          ].map((inq, idx) => (
            <button
              key={idx}
              onClick={() => {
                // We need to pass the text to the target module.
                // In App.tsx, we have logic for dashboardSharedQuestion.
                // We'll update the store or pass it via props.
                // For now, I'll use a custom event or store.
                window.dispatchEvent(new CustomEvent('economics_lab_quick_inquiry', { 
                  detail: { text: inq.text, target: inq.target } 
                }));
                onNavigate(inq.target as ModuleTab);
              }}
              className="px-4 py-2 bg-white border border-stone-200 hover:border-stone-400 hover:bg-stone-50 rounded-xl text-xs font-bold text-stone-600 transition-all shadow-sm cursor-pointer"
            >
              {inq.label}
            </button>
          ))}
        </div>
      </div>

      {/* Econometric Data Upload Modal Overlay */}
      <AnimatePresence>
        {isUploadModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 15 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="relative w-full max-w-5xl bg-stone-50 rounded-3xl shadow-2xl border border-stone-200 overflow-hidden my-8 max-h-[90vh] flex flex-col"
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-stone-200 bg-white">
                <div className="flex items-center gap-2">
                  <Upload className="w-5 h-5 text-emerald-600" />
                  <h2 className="text-xl font-serif font-bold text-stone-900">Load Econometric Dataset</h2>
                </div>
                <button 
                  onClick={() => setIsUploadModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-stone-100 transition-colors text-stone-500 hover:text-stone-700 cursor-pointer"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              
              {/* Modal Content - Scrollable */}
              <div className="flex-1 overflow-y-auto p-6">
                <React.Suspense fallback={
                  <div className="flex flex-col items-center justify-center py-20 space-y-4">
                    <Loader2 className="w-10 h-10 text-emerald-600 animate-spin" />
                    <p className="text-sm font-serif italic text-stone-500">Initializing econometric workbench...</p>
                  </div>
                }>
                  <DataUploadLab onDataLoaded={() => {
                    // Closed dynamically or left open until activation triggers navigation
                  }} />
                </React.Suspense>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
