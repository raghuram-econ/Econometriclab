import React, { useState } from 'react';
import { 
  Database, 
  BarChart3, 
  Layers, 
  TrendingUp, 
  FileText, 
  ArrowRight,
  Menu,
  X,
  History,
  BrainCircuit,
  PanelRightClose,
  PanelRightOpen,
  GraduationCap,
  ShieldCheck,
  Binary,
  RefreshCw,
  Monitor,
  FlaskConical,
  Activity,
  Pipette,
  Sliders,
  Upload,
  Tags,
  Keyboard,
  Compass
} from 'lucide-react';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'motion/react';

import { ModuleTab } from '../../types';
import { NAV_TABS } from '../../constants/navigation';
import { SaveStatusTracker } from '../shared/SaveStatusTracker';
import { AIExplainConsentModal } from '../privacy/PrivacyComponents';
import { LucideIcon } from 'lucide-react';
import { TermsOfService, PrivacyPolicy, DataAttribution } from '../legal/LegalPages';
import { ShortcutsHelpModal } from '../shared/ShortcutsHelpModal';

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  group: string;
  items: NavItem[];
}

interface LayoutProps {
  children: React.ReactNode;
  activeTab: ModuleTab;
  onTabChange: (tab: ModuleTab) => void;
  aiPanel?: React.ReactNode;
  onClearCache?: () => void;
  isComparing?: boolean;
}

const NavigationContent = ({ 
  currentPlan, 
  navGroups, 
  activeTab, 
  onTabChange, 
  setIsMobileNavOpen,
  onOpenTerms,
  onOpenPrivacy,
  onOpenAttribution,
  onOpenShortcuts
}: { 
  currentPlan: string, 
  navGroups: NavGroup[], 
  activeTab: ModuleTab, 
  onTabChange: (tab: ModuleTab) => void,
  setIsMobileNavOpen: (open: boolean) => void,
  onOpenTerms: () => void,
  onOpenPrivacy: () => void,
  onOpenAttribution: () => void,
  onOpenShortcuts: () => void
}) => (
  <div className="flex flex-col h-full bg-slate-950">
    <div className="p-8 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-blue-600 rounded flex items-center justify-center">
               <Binary className="w-4 h-4 text-white" />
            </div>
            <h1 className="text-sm font-bold tracking-[0.15em] text-white uppercase leading-tight">
              Econometrics
            </h1>
          </div>
          <p className="text-[10px] uppercase text-blue-400 font-mono tracking-widest font-bold">Lab Environment</p>
        </div>
        <button onClick={() => setIsMobileNavOpen(false)} className="md:hidden p-2 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-3 py-2.5 px-4 bg-white/5 rounded-md border border-white/10 group cursor-default transition-all duration-300 hover:border-white/20">
        <div className="w-1.5 h-1.5 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
        <div className="flex flex-col min-w-0">
          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-widest">Active License</span>
          <span className="text-[11px] font-bold text-white truncate" title={currentPlan}>
            {currentPlan}
          </span>
        </div>
      </div>
    </div>

    <nav className="flex-1 mt-2 overflow-y-auto px-6 pb-8 space-y-8 custom-scrollbar">
      {navGroups.map((group) => (
        <div key={group.group} className="space-y-3">
          <h3 className="px-2 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">{group.group}</h3>
          <div className="space-y-1">
            {group.items.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  onTabChange(item.id as ModuleTab);
                  setIsMobileNavOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 text-[11px] font-semibold rounded-md transition-all duration-300 relative group",
                  activeTab === item.id 
                    ? "bg-blue-600 text-white shadow-lg shadow-blue-900/40" 
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                )}
              >
                <item.icon className={cn("w-4 h-4 transition-transform duration-300 group-hover:scale-110", activeTab === item.id ? "text-white" : "text-slate-500")} />
                <span className="truncate">{item.label}</span>
                {activeTab === item.id && (
                  <motion.div 
                    layoutId="activeNav"
                    className="absolute right-2 w-1.5 h-1.5 rounded-full bg-white/50"
                  />
                )}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>

    <div className="px-6 py-5 border-t border-white/5 bg-slate-950/80 backdrop-blur-md space-y-3">
      <SaveStatusTracker />
      <div className="flex flex-wrap gap-x-2 gap-y-1 text-[10px] font-sans font-semibold text-slate-500 uppercase tracking-wider justify-center">
        <button onClick={onOpenTerms} className="hover:text-emerald-400 transition-colors">Terms</button>
        <span className="text-slate-700 select-none">•</span>
        <button onClick={onOpenPrivacy} className="hover:text-emerald-400 transition-colors">Privacy</button>
        <span className="text-slate-700 select-none">•</span>
        <button onClick={onOpenAttribution} className="hover:text-emerald-400 transition-colors font-semibold uppercase">Attribution</button>
        <span className="text-slate-700 select-none">•</span>
        <button onClick={onOpenShortcuts} className="hover:text-amber-400 transition-colors flex items-center gap-1">
          <Keyboard className="w-3 h-3" /> Shortcuts
        </button>
      </div>
    </div>

    <div className="px-8 py-4 border-t border-white/5 text-[9px] font-mono text-slate-500 uppercase flex justify-between tracking-widest">
      <span>Rel 3.4.0</span>
      <span className="opacity-50">STABLE</span>
    </div>
  </div>
);

export default function Layout({ children, activeTab, onTabChange, aiPanel, onClearCache, isComparing }: LayoutProps) {
  const { appMode, setAppMode, isAiOpen, setIsAiOpen, currentDataset, researchQuestion, currentPlan, user, uiDensity, setUiDensity } = useStore();
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [showConsentModal, setShowConsentModal] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);
  const [isPrivacyOpen, setIsPrivacyOpen] = useState(false);
  const [isAttributionOpen, setIsAttributionOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);

  React.useEffect(() => {
    const handleToggleShortcuts = () => {
      setIsShortcutsOpen(prev => !prev);
    };
    window.addEventListener('toggle-shortcuts-guide', handleToggleShortcuts);
    return () => window.removeEventListener('toggle-shortcuts-guide', handleToggleShortcuts);
  }, []);

  React.useEffect(() => {
    if (isAiOpen) {
      const consentGiven = sessionStorage.getItem('ai_consent_given') === 'true';
      if (!consentGiven) {
        setIsAiOpen(false);
        setShowConsentModal(true);
      }
    }
  }, [isAiOpen, setIsAiOpen]);

  const handleConsentConfirm = () => {
    setShowConsentModal(false);
    setIsAiOpen(true);
  };

  const handleConsentCancel = () => {
    setShowConsentModal(false);
  };

  const navGroups: NavGroup[] = [
    {
      group: "Scholar Desk",
      items: [
        { id: NAV_TABS.DASHBOARD, label: '🏠 Dashboard', icon: History },
        { id: NAV_TABS.PROFESSOR_DESK, label: 'Professor Desk', icon: GraduationCap },
        { id: NAV_TABS.STATS_INTERPRETER, label: 'R & SPSS Interpreter', icon: BarChart3 },
        { id: NAV_TABS.TEACHER_MODE, label: 'Essay Coach (Teacher Mode)', icon: BrainCircuit },
      ]
    },
    {
      group: "Prep",
      items: [
        { id: NAV_TABS.DATA_UPLOAD, label: 'Data Upload', icon: Upload },
        { id: NAV_TABS.VARIABLE_VIEW, label: 'Variable View (SPSS)', icon: Tags },
        { id: NAV_TABS.DESCRIPTIVE_STATS, label: 'Descriptive Statistics Lab', icon: BarChart3 },
        { id: NAV_TABS.TEMPLATES, label: 'Research Design', icon: History },
        { id: NAV_TABS.DATA, label: 'Data & Exploratory Analysis', icon: Database },
      ]
    },
    {
      group: "Analyze",
      items: [
        { id: NAV_TABS.OLS, label: 'Linear Models (OLS)', icon: BarChart3 },
        { id: NAV_TABS.REGULARIZATION, label: 'Regularization (LASSO/Ridge)', icon: Sliders },
        { id: NAV_TABS.FE, label: 'Panel Data (FE/RE)', icon: Layers },
        { id: NAV_TABS.ARIMA, label: 'Forecasting (ARIMA)', icon: TrendingUp },
        { id: NAV_TABS.CAUSAL, label: 'Causal Inference', icon: BrainCircuit },
        { id: NAV_TABS.LIMITED, label: 'Probability Models (Logit)', icon: Binary },
        { id: NAV_TABS.HECKMAN, label: 'Heckman Selection Model', icon: Sliders },
        { id: NAV_TABS.STAT_TESTS, label: 'Statistical Tests', icon: FlaskConical },
        { id: NAV_TABS.GLM, label: 'GLM', icon: BarChart3 },
        { id: NAV_TABS.ADV_TIMESERIES, label: 'Advanced Time Series', icon: TrendingUp },
        { id: NAV_TABS.FACTOR, label: 'Factor Analysis', icon: Layers },
        { id: NAV_TABS.SURVIVAL, label: 'Survival Analysis', icon: Activity },
        { id: NAV_TABS.TREATMENT, label: 'Treatment Effects', icon: Pipette },
        { id: NAV_TABS.POWER_ANALYSIS, label: 'Power Analysis', icon: Sliders },
      ]
    },
    {
      group: "Validate",
      items: [
        { id: NAV_TABS.DIAGNOSTICS, label: 'Diagnostics Center', icon: ShieldCheck },
        { id: NAV_TABS.ROBUSTNESS, label: 'Robustness Vault', icon: History },
      ]
    },
    {
      group: "Synthesis",
      items: [
        { id: NAV_TABS.EXPORTS, label: 'Manuscript Builder', icon: FileText },
        { id: NAV_TABS.BATCH_PROCESSING, label: 'Batch Processing', icon: Layers },
        { id: NAV_TABS.SESSION_REPORT, label: 'Session Report', icon: FileText },
      ]
    },
    {
      group: "Learning",
      items: [
        { id: NAV_TABS.WORKFLOW_GUIDE, label: 'Academic Workflow Guide', icon: Compass },
        { id: NAV_TABS.LEARN, label: 'Concept Repository', icon: GraduationCap },
        { id: NAV_TABS.QUIZ, label: 'Empirical Quiz', icon: BrainCircuit },
        { id: NAV_TABS.ACCURACY, label: 'Numerical Accuracy Lab', icon: Activity },
        { id: NAV_TABS.ABOUT_RESEARCH, label: 'About This Research', icon: ShieldCheck },
      ]
    }
  ];

  const allNavItems = navGroups.flatMap(g => g.items);
  const activeNavItem = allNavItems.find(n => n.id === activeTab);
  const workflowSteps = ['Prep', 'Analysis', 'Validation', 'Synthesis'];
  const activeGroup = navGroups.find(g => g.items.some(i => i.id === activeTab))?.group || 'Analysis';
  const workflowGroupMap: Record<string, string> = {
    'Prep': 'Prep',
    'Analyze': 'Analysis',
    'Validate': 'Validation',
    'Synthesis': 'Synthesis'
  };
  const activeStep = workflowGroupMap[activeGroup] || '';
  const workflowIndex = workflowSteps.indexOf(activeStep);

  return (
    <div className="flex h-screen bg-bg-app text-slate-900 font-sans overflow-hidden">
      {/* Mobile Drawer Overlay */}
      {isMobileNavOpen && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[60] md:hidden transition-opacity"
          onClick={() => setIsMobileNavOpen(false)}
        />
      )}

      {/* Sidebar (Desktop) / Mobile Drawer */}
      <aside className={cn(
        "fixed inset-y-0 left-0 w-72 bg-slate-950 text-white flex flex-col border-r border-slate-800 z-[70] transition-transform duration-300 md:relative md:w-64 md:translate-x-0 md:z-auto",
        isMobileNavOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <NavigationContent 
          currentPlan={currentPlan}
          navGroups={navGroups}
          activeTab={activeTab}
          onTabChange={onTabChange}
          setIsMobileNavOpen={setIsMobileNavOpen}
          onOpenTerms={() => setIsTermsOpen(true)}
          onOpenPrivacy={() => setIsPrivacyOpen(true)}
          onOpenAttribution={() => setIsAttributionOpen(true)}
          onOpenShortcuts={() => setIsShortcutsOpen(true)}
        />
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden relative w-full max-w-full">
        {/* Mobile Header */}
        <header className="lg:hidden h-14 border-b border-border-subtle flex items-center justify-between px-4 bg-white/90 backdrop-blur-md z-50">
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setIsMobileNavOpen(true)}
              className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              aria-label="Open Navigation"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-xs font-bold uppercase tracking-widest text-slate-900">
              {activeNavItem?.label || "Econometrics Lab"}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            {/* Compact Mode Toggle on Mobile */}
            <button 
              onClick={() => setAppMode(appMode === 'learning' ? 'research' : 'learning')}
              className={cn(
                "px-2.5 py-1 rounded text-[10px] font-bold border flex items-center gap-1 transition-all",
                appMode === 'research'
                  ? "bg-slate-900 text-white border-slate-850"
                  : "bg-slate-50 text-blue-600 border-slate-200"
              )}
              title="Toggle App Mode"
            >
              {appMode === 'research' ? <Sliders className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
              <span className="capitalize">{appMode}</span>
            </button>
            <button 
              onClick={() => setIsAiOpen(!isAiOpen)}
              className="p-1.5 text-slate-400 hover:text-blue-600"
            >
              <BrainCircuit className="w-5 h-5" />
            </button>
          </div>
        </header>

        {/* Desktop Header */}
        <header className="hidden lg:flex h-16 border-b border-border-subtle items-center justify-between px-8 bg-white/80 backdrop-blur-md z-50">
          <div className="flex items-center gap-8">
             <div className="flex items-center gap-3">
                <span className="hidden sm:inline text-[10px] font-black uppercase text-slate-300 font-mono tracking-widest">Session:</span>
                <div className="flex items-center gap-2">
                  <span className="hidden xs:inline text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-500 uppercase font-bold">{activeGroup}</span>
                  <ArrowRight className="hidden xs:inline w-3 h-3 text-slate-300" />
                  <span className="text-sm font-bold text-slate-800">
                    {activeNavItem?.label}
                  </span>
                </div>
             </div>
  
             {/* Workflow Indicator */}
             <div className="hidden xl:flex items-center gap-2">
                <div className="h-4 w-px bg-slate-200 mx-4" />
                {workflowSteps.map((step, i) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className={cn(
                      "w-2 h-2 rounded-full",
                      i <= workflowIndex ? "bg-blue-600" : "bg-slate-200"
                    )} />
                    <span className={cn(
                      "text-[9px] font-bold uppercase tracking-widest",
                      i <= workflowIndex ? "text-slate-900" : "text-slate-300"
                    )}>
                      {step}
                    </span>
                    {i < workflowSteps.length - 1 && <div className="w-4 h-[1px] bg-slate-100" />}
                  </div>
                ))}
             </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* Research | Learning Mode Toggle */}
            <div className="flex bg-slate-100 border border-slate-200 p-0.5 rounded-lg select-none mr-2">
              <button 
                onClick={() => setAppMode('learning')}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1",
                  appMode === 'learning' 
                    ? "bg-white text-blue-600 shadow-sm" 
                    : "text-slate-500 hover:text-slate-850"
                )}
                title="Switch to Learning Mode"
              >
                <GraduationCap className="w-3.5 h-3.5" />
                <span>Learning</span>
              </button>
              <button 
                onClick={() => setAppMode('research')}
                className={cn(
                  "px-2.5 py-1 rounded text-[11px] font-bold transition-all flex items-center gap-1",
                  appMode === 'research' 
                    ? "bg-slate-900 text-white shadow-sm" 
                    : "text-slate-500 hover:text-slate-850"
                )}
                title="Switch to Research Mode"
              >
                <Sliders className="w-3.5 h-3.5" />
                <span>Research</span>
              </button>
            </div>
            <button
              onClick={() => onTabChange('session-report')}
              className={cn(
                "flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-lg transition-all",
                activeTab === 'session-report'
                  ? "bg-blue-600 text-white"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              )}
              title="Open SPSS-style Session Output Viewer"
            >
              <FileText className="w-4 h-4" />
              <span>Session Report</span>
            </button>
            <button
              onClick={() => setUiDensity(uiDensity === 'dense' ? 'spacious' : 'dense')}
              className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
              title={`Switch to ${uiDensity === 'dense' ? 'Spacious' : 'Dense'} Mode`}
            >
              <Monitor className="w-4 h-4" />
              <span className="hidden lg:inline capitalize">{uiDensity}</span>
            </button>
            <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 font-mono">
                Connected: <span className="text-slate-900">{user?.email || 'Local Sandbox'}</span>
              </span>
            </div>
            <button 
              onClick={() => setIsAiOpen(!isAiOpen)}
              className="flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors"
            >
              {isAiOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
              <span className="hidden sm:inline">{isAiOpen ? 'Close Insights' : 'Open Insights'}</span>
            </button>
          </div>
        </header>

        {/* Global Context Bar Slot - Prevents CLS by reserving space */}
        <div className="min-h-[41px] border-b border-border-subtle bg-slate-50 relative overflow-hidden">
          {(currentDataset || researchQuestion.hypothesis) ? (
            <div className="absolute inset-0 px-4 md:px-8 flex items-center gap-4 md:gap-6 overflow-x-auto no-scrollbar whitespace-nowrap animate-in fade-in duration-300">
              {currentDataset && (
                <div className="flex items-center gap-2 shrink-0">
                  <Database className="w-3.5 h-3.5 text-blue-500" />
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">Active Data:</span>
                  <span className="text-xs font-bold text-slate-700">{currentDataset?.name}</span>
                </div>
              )}
              {researchQuestion.hypothesis && (
                <div className="flex items-center gap-2">
                  <FileText className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="text-[10px] font-mono text-slate-400 uppercase tracking-tighter">Question:</span>
                  <span className="text-xs font-medium text-slate-600 italic truncate max-w-md">"{researchQuestion.hypothesis}"</span>
                </div>
              )}
            </div>
          ) : (
            <div className="h-full flex items-center px-4 md:px-8 opacity-20">
               <span className="text-[9px] font-mono uppercase tracking-[0.2em] italic">Awaiting research primitives...</span>
            </div>
          )}
        </div>

        <div className="flex-1 flex overflow-hidden">
          {/* Workspace Wrapper */}
          <div className={cn(
            "flex-1 overflow-y-auto p-4 sm:p-6 lg:p-12 transition-all duration-500 bg-bg-app",
            activeTab === 'exports' && 'print:p-0 bg-white'
          )}>
            <div className="max-w-5xl mx-auto">
               {children}
            </div>
          </div>

          {/* Right AI Sidebar */}
          {isAiOpen && (
            <aside className={cn(
              "fixed inset-y-0 right-0 w-full border-l border-border-subtle bg-white flex flex-col z-[80] shadow-2xl transition-all duration-300 lg:relative lg:z-20 lg:shadow-none lg:translate-x-0 animate-in slide-in-from-right",
              isComparing ? "sm:w-[850px] lg:w-[950px] max-w-full" : "sm:w-[480px] xl:w-[560px]",
              isAiOpen ? "translate-x-0" : "translate-x-full"
            )}>
              <div className="p-6 border-b border-border-subtle flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-blue-100 rounded-md">
                    <BrainCircuit className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-xs font-bold uppercase tracking-widest text-slate-600">Econometric Review</h2>
                    {onClearCache && (
                      <button
                        onClick={onClearCache}
                        title="Clear Cached Interpretations"
                        className="p-1 text-slate-400 hover:text-red-500 hover:bg-slate-100 rounded transition-colors"
                        id="btn-clear-cache"
                        aria-label="Clear cache"
                      >
                        <RefreshCw className="w-3 h-3 animate-none active:animate-spin" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                    <span className="text-[10px] font-mono text-slate-400 uppercase">Analysis Ready</span>
                  </div>
                  <button onClick={() => setIsAiOpen(false)} className="lg:hidden p-2 text-slate-400">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              
              <div className="flex-1 overflow-y-auto p-6 sm:p-8">
                {aiPanel || (
                  <div className="h-full flex flex-col items-center justify-center text-center space-y-4 opacity-40 py-20">
                    <div className="p-4 bg-slate-50 rounded-full">
                      <GraduationCap className="w-10 h-10 text-slate-300" />
                    </div>
                    <div className="space-y-1">
                      <p className="font-semibold text-slate-900">Research Assistant</p>
                      <p className="text-[10px] uppercase font-mono px-8 leading-relaxed">Run a simulation to generate AI-driven econometric interpretation and theory review.</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-6 border-t border-border-subtle bg-slate-50/50">
                <p className="text-[9px] text-slate-400 leading-normal italic">
                  Note: AI interpretations are generated using Gemini. Always verify results against theoretical literature and Gauss-Markov assumptions.
                </p>
              </div>
            </aside>
          )}
        </div>
      </main>
      {showConsentModal && (
        <AIExplainConsentModal 
          onConfirm={handleConsentConfirm} 
          onCancel={handleConsentCancel} 
        />
      )}
      <TermsOfService isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
      <PrivacyPolicy isOpen={isPrivacyOpen} onClose={() => setIsPrivacyOpen(false)} />
      <DataAttribution isOpen={isAttributionOpen} onClose={() => setIsAttributionOpen(false)} />
      <ShortcutsHelpModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
    </div>
  );
}
