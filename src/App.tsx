import React, { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import Layout from './components/layout/Layout';
import ModuleErrorBoundary from './components/ModuleErrorBoundary';

// Lazy load heavy modules
const DataLab = React.lazy(() => import('./components/modules/DataLab'));
const OLSLab = React.lazy(() => import('./components/modules/OLSLab'));
const FELab = React.lazy(() => import('./components/modules/FELab'));
const ARIMALab = React.lazy(() => import('./components/modules/ARIMALab'));
const WritingLab = React.lazy(() => import('./components/modules/WritingLab'));
const RobustnessExplorer = React.lazy(() => import('./components/modules/RobustnessExplorer'));
const Templates = React.lazy(() => import('./components/modules/Templates'));
const DiagnosticsCenter = React.lazy(() => import('./components/modules/DiagnosticsCenter').then(m => ({ default: m.DiagnosticsCenter })));
const ConceptRepo = React.lazy(() => import('./components/modules/ConceptRepo').then(m => ({ default: m.ConceptRepo })));
const EmpiricalQuiz = React.lazy(() => import('./components/modules/EmpiricalQuiz').then(m => ({ default: m.EmpiricalQuiz })));
const CausalLab = React.lazy(() => import('./components/modules/CausalLab'));
const LimitedDependent = React.lazy(() => import('./components/modules/LimitedDependent'));
const RegularizationLab = React.lazy(() => import('./components/modules/RegularizationLab'));
const ScholarDashboard = React.lazy(() => import('./components/ScholarDashboard'));
const ResearchDesk = React.lazy(() => import('./components/ResearchDesk'));
const AcademicLab = React.lazy(() => import('./components/modules/AcademicLab'));
const ProfessorDesk = React.lazy(() => import('./components/modules/ProfessorDesk'));
const LabPartner = React.lazy(() => import('./components/modules/LabPartner'));
const StatsInterpreterLab = React.lazy(() => import('./components/modules/StatsInterpreterLab'));
const TeacherMode = React.lazy(() => import('./components/modules/TeacherMode'));
const AboutResearch = React.lazy(() => import('./components/modules/AboutResearch'));
const NumericalAccuracy = React.lazy(() => import('./components/modules/NumericalAccuracy').then(m => ({ default: m.NumericalAccuracy })));
const DataUploadLab = React.lazy(() => import('./components/modules/DataUploadLab'));
const VariableView = React.lazy(() => import('./components/modules/VariableView'));
const DescriptiveStatsLab = React.lazy(() => import('./components/modules/DescriptiveStatsLab'));

const StatTestsLab = React.lazy(() => import('./components/modules/StatTestsLab'));
const GLMLab = React.lazy(() => import('./components/modules/GLMLab'));
const HeckmanLab = React.lazy(() => import('./components/modules/HeckmanLab'));
const AdvancedTimeSeriesLab = React.lazy(() => import('./components/modules/AdvancedTimeSeriesLab'));
const FactorAnalysisLab = React.lazy(() => import('./components/modules/FactorAnalysisLab'));
const SurvivalAnalysisLab = React.lazy(() => import('./components/modules/SurvivalAnalysisLab'));
const TreatmentEffectsLab = React.lazy(() => import('./components/modules/TreatmentEffectsLab'));
const PowerAnalysisLab = React.lazy(() => import('./components/modules/PowerAnalysisLab'));
const BatchProcessingLab = React.lazy(() => import('./components/modules/BatchProcessingLab'));
const SessionReport = React.lazy(() => import('./components/modules/SessionReport'));
const AcademicWorkflowGuide = React.lazy(() => import('./components/modules/AcademicWorkflowGuide').then(m => ({ default: m.AcademicWorkflowGuide })));

import { useSessionReport } from './context/SessionReportContext';

// Removed static Papa import
import { useStore } from './store/useStore';
import { useVariableMetadata } from './hooks/useVariableMetadata';
import { persistenceService } from './services/persistenceService';
import { cn, safeDownloadFile, copyTextToClipboard } from './lib/utils';
import { ModelHistoryItem, Dataset, ResearchQuestion, ModuleTab } from './types';
import { Loader2, BrainCircuit, GraduationCap, ArrowUpRight, Download, Clipboard, Check, HelpCircle, ChevronDown, Activity, Columns, Printer } from 'lucide-react';

// Lazy load Markdown component
const MarkdownRenderer = React.lazy(() => import('./components/shared/MarkdownRenderer'));

const PrivacyPolicy = React.lazy(() => import('./components/privacy/PrivacyPolicy'));

import { AuthGate } from './components/shared/AuthGate';
import ToastContainer from './components/shared/ToastContainer';
import { CommandPalette } from './components/CommandPalette';
const ReplicationCodeTab = React.lazy(() => import('./components/modules/ReplicationCodeTab').then(m => ({ default: m.ReplicationCodeTab })));

export default function App() {
  const { 
    currentDataset, 
    setCurrentDataset, 
    activeModule, 
    setActiveModule, 
    history, 
    setHistory,
    addToHistory,
    setIsAiOpen,
    researchQuestion,
    setResearchQuestion,
    robustnessItems,
    addToRobustness,
    clearRobustness,
    addToast,
    user,
    setOlsConfiguration,
    setDependentVar,
    setRegressors,
    setModelType,
    appMode
  } = useStore();

  const { entries: sessionEntries } = useSessionReport();

  const [currentPath, setCurrentPath] = useState(window.location.pathname);

  // Global unhandled error and promise rejection listeners routing to the toast system
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      const msg = event.error?.message || event.message || "An unexpected error occurred.";
      addToast('error', 'Runtime Exception Captured', msg);
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      const reason = event.reason;
      const msg = reason?.message || (typeof reason === 'string' ? reason : "Unhandled Promise Rejection.");
      addToast('error', 'Unhandled Promise Rejection', msg);
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleUnhandledRejection);

    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
    };
  }, [addToast]);

  const headers = React.useMemo(() => {
    return currentDataset?.headers || currentDataset?.variables?.map(v => v.name) || [];
  }, [currentDataset]);

  const { metadata: variableMetadata, setMetadata: setVariableMetadata } = useVariableMetadata(headers);

  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Keyboard shortcut listener (Cmd+K / Ctrl+K) + custom event for Command Palette
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key?.toLowerCase() === 'k') {
        e.preventDefault();
        setIsCommandPaletteOpen(prev => !prev);
      }
    };
    const handleCustomToggle = () => {
      setIsCommandPaletteOpen(prev => !prev);
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('toggle-command-palette', handleCustomToggle);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('toggle-command-palette', handleCustomToggle);
    };
  }, []);

  // Periodic IndexedDB Auto-save
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        await persistenceService.saveToIndexedDB('activeModule', activeModule);
        await persistenceService.saveToIndexedDB('researchQuestion', researchQuestion);
      } catch (e) {
        console.error('[IndexedDB Auto-save] Failed:', e);
      }
    }, 15000); // Save every 15 seconds

    return () => clearInterval(interval);
  }, [activeModule, researchQuestion]);

  useEffect(() => {
    const handlePopState = () => {
      setCurrentPath(window.location.pathname);
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // 1. Ctrl+Enter or Cmd+Enter: Run model / primary action
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        
        // Find primary button
        const findPrimaryActionButton = (): HTMLButtonElement | null => {
          let btn = document.querySelector('[data-shortcut="primary-action"]') as HTMLButtonElement;
          if (btn) return btn;

          const commonIds = [
            'run-panel-model-btn',
            'run-model-btn',
            'execute-protocol-btn',
            'run-shrinkage-btn',
            'submit-essay-btn'
          ];
          for (const id of commonIds) {
            btn = document.getElementById(id) as HTMLButtonElement;
            if (btn) return btn;
          }

          const buttons = Array.from(document.querySelectorAll('button'));
          const targetTexts = [
            'execute protocol',
            'run model',
            'run panel model',
            'run projection',
            'run shrinkage estimation',
            'run did estimation',
            'run 2sls regression',
            'run causal matching',
            'run matrix engine',
            'submit answer',
            'submit essay',
            'ask professor',
            'evaluate essay',
            'run curve multiverse',
            'next step',
            'complete quiz'
          ];

          for (const b of buttons) {
            const text = b.textContent?.trim().toLowerCase() || '';
            if (targetTexts.some(t => text.includes(t))) {
              const style = window.getComputedStyle(b);
              if (style.display !== 'none' && style.visibility !== 'hidden' && b.offsetWidth > 0) {
                return b;
              }
            }
          }

          // Fallback to primary button
          const primaryButtons = Array.from(document.querySelectorAll('.btn-primary, .bg-slate-900, .bg-stone-900'));
          for (const pb of primaryButtons) {
            const b = pb as HTMLButtonElement;
            if (b.tagName === 'BUTTON') {
              const style = window.getComputedStyle(b);
              if (style.display !== 'none' && style.visibility !== 'hidden' && b.offsetWidth > 0) {
                return b;
              }
            }
          }

          return null;
        };

        const activeBtn = findPrimaryActionButton();
        if (activeBtn && !activeBtn.disabled) {
          activeBtn.click();
          addToast('success', 'Shortcut Triggered', 'Running the active econometric protocol...');
        } else if (activeBtn && activeBtn.disabled) {
          addToast('error', 'Execution Prevented', 'Please complete all required variable selections before executing.');
        } else {
          addToast('info', 'No Active Action', 'No runnable econometric protocol detected in this view.');
        }
      }

      // 2. Alt+K or Ctrl+/ : Toggle shortcuts guide
      const isAltK = e.altKey && e.key.toLowerCase() === 'k';
      const isCtrlSlash = (e.ctrlKey || e.metaKey) && e.key === '/';
      if (isAltK || isCtrlSlash) {
        e.preventDefault();
        window.dispatchEvent(new CustomEvent('toggle-shortcuts-guide'));
      }

      // 3. Alt+1 to Alt+9: Change active module
      if (e.altKey && !e.ctrlKey && !e.metaKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault();
        const num = parseInt(e.key, 10);
        const moduleMap: Record<number, ModuleTab> = {
          1: 'dashboard',
          2: 'professor-desk',
          3: 'teacher-mode',
          4: 'data-upload',
          5: 'data',
          6: 'ols',
          7: 'regularization',
          8: 'fe',
          9: 'quiz'
        };
        const targetModule = moduleMap[num];
        if (targetModule) {
          setActiveModule(targetModule);
          window.scrollTo({ top: 0, behavior: 'smooth' });
          addToast('info', 'Navigation Shortcut', `Switched to ${targetModule.toUpperCase()} Module`);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [setActiveModule, addToast]);

  const [aiLoading, setAiLoading] = useState(false);
  const [currentAiAnalysis, setCurrentAiAnalysis] = useState<string | null>(null);
  const [aiMode, setAiMode] = useState<'beginner' | 'advanced' | 'replication'>('beginner');
  const [comparisonModelId, setComparisonModelId] = useState<string | null>(null);
  const [showRunHistoryList, setShowRunHistoryList] = useState(false);
  const [copiedInsights, setCopiedInsights] = useState(false);

  const [dashboardSharedQuestion, setDashboardSharedQuestion] = useState<string>('');
  const [dashboardSharedMode, setDashboardSharedMode] = useState<string>('Topic Overview');

  const [visitedModules, setVisitedModules] = useState<Set<string>>(new Set([activeModule]));

  useEffect(() => {
    setVisitedModules(prev => {
      if (prev.has(activeModule)) return prev;
      const newSet = new Set(prev);
      newSet.add(activeModule);
      return newSet;
    });
  }, [activeModule]);


  const handleDashboardTrigger = (module: 'professor' | 'lab', question: string, mode?: string) => {
    setDashboardSharedQuestion(question);
    if (mode) {
      setDashboardSharedMode(mode);
    }
    if (module === 'professor') {
      setActiveModule('professor-desk');
    } else {
      setActiveModule('professor-desk');
    }
  };

  const handleModelRun = async (results: any, specification: string) => {
    setAiLoading(true);
    setCurrentAiAnalysis(null);

    const moduleName = activeModule.toUpperCase();
    
    try {
      // Dynamic import for service
      const { interpretModel } = await import('./services/gemini');
      
      // Generate Interpretation
      const interpretation = await interpretModel(moduleName, specification, results, researchQuestion);
      
      const isSuspended = interpretation && (
        interpretation.includes('AI Interpretation Temporarily Suspended') ||
        interpretation.includes('AI Interpretation Temporarily Suspended') ||
        interpretation.includes('Temporarily Suspended')
      );

      if (isSuspended) {
        addToast(
          'error', 
          'AI Interpretation Failed', 
          'The AI server encountered an issue or requires API key configuration.'
        );
      } else {
        addToast(
          'success', 
          'Interpretation Generated', 
          `Pedagogical and Referee reviews are ready for ${moduleName}.`
        );
      }

         const newItem: ModelHistoryItem = {
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        module: moduleName as any,
        specification,
        results,
        interpretation,
        filePath: currentDataset?.name
      };

      addToHistory(newItem);
      setCurrentAiAnalysis(interpretation);
      setIsAiOpen(true);
    } catch (error: any) {
      console.error(error);
      addToast(
        'error', 
        'Model Estimation Error', 
        error?.message || 'Failed to estimate model or load AI insights.'
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleClearCache = async () => {
    setCurrentAiAnalysis(null);
    if (history && history.length > 0) {
      const updatedHistory = history.map(item => ({
        ...item,
        interpretation: undefined
      }));
      setHistory(updatedHistory);
      
      // Clean background persistent database entries
      for (const item of history) {
        if (item.interpretation) {
          try {
            await persistenceService.saveModelRun({
              ...item,
              interpretation: undefined
            });
          } catch (e) {
            console.error("Failed to clear background model run interpretation:", e);
          }
        }
      }
    }
  };

  const getAiContent = (raw: string | null) => {
    if (!raw) return null;
    const parts = raw.split('---ADVANCED_SECTION---');
    if (parts.length < 2) return raw; // Fallback
    return aiMode === 'beginner' ? parts[0] : parts[1];
  };

  const loadTemplateData = useCallback(async (type: 'cross-section' | 'panel' | 'time-series', question: string, tab: ModuleTab, templateId: string, teachingMode: boolean) => {
    // Shared mock data logic (same as DataLab but exposed here)
    let data : any[] = [];
    let name = "";
    
    function makeSeededRandom(seed: number): () => number {
      let state = seed;
      return () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 4294967296;
      };
    }
    const rndApp = makeSeededRandom(2024);
    if (templateId === 'master_lab') {
      const { generateMasterDataset } = await import('./lib/dataGenerators');
      name = "Master Econometrics Test Dataset";
      data = generateMasterDataset();
    } else if (templateId === 'card_krueger_did') {
      const { generateCardKruegerDiD } = await import('./lib/dataGenerators');
      name = "Card-Krueger Minimum Wage Study";
      data = generateCardKruegerDiD();
    } else if (templateId === 'mincerian_wages') {
      const { generateMincerianWages } = await import('./lib/dataGenerators');
      name = "Mincerian Wage Earnings Profile";
      data = generateMincerianWages();
    } else if (templateId === 'binary_health') {
      const { generateBinaryHealthOutcome } = await import('./lib/dataGenerators');
      name = "Binary Health Insurance Outcome";
      data = generateBinaryHealthOutcome();
    } else if (type === 'cross-section') {
      name = templateId === 'iv_wages' ? "CPS 2024 (IV Specification)" : "CPS 2024 Wages (Cross-Section)";
      data = Array.from({ length: 500 }, (_, i) => ({
        wage: 15 + rndApp() * 50 + (i % 2 === 0 ? 10 : 0),
        educ: 8 + Math.floor(rndApp() * 12),
        exper: Math.floor(rndApp() * 40),
        gender: i % 2 === 0 ? 'Female' : 'Male',
        married: rndApp() > 0.5 ? 1 : 0
      }));
    } else if (type === 'panel') {
      name = "EU Growth 2010-2023 (Panel)";
      const countries = ['Germany', 'France', 'Italy', 'Spain', 'Poland'];
      data = [];
      countries.forEach(country => {
        for (let year = 2010; year <= 2023; year++) {
          data.push({
            country,
            year,
            gdp_growth: 1 + rndApp() * 3,
            inflation: 0.5 + rndApp() * 4,
            unemp: 3 + rndApp() * 8
          });
        }
      });
    } else {
      name = "Global Temperature Index (Time-Series)";
      data = Array.from({length: 120}, (_, i) => ({
        date: new Date(2014, i, 1).toISOString().split('T')[0],
        temp: 0.5 + 0.01 * i + rndApp() * 0.2,
        co2: 400 + i * 0.1
      }));
    }

    const firstRow = data[0];
    const variables = Object.keys(firstRow).map(key => {
      const val = firstRow[key];
      let type: any = 'unknown';
      if (typeof val === 'number') type = 'numeric';
      else if (typeof val === 'string') {
        if (!isNaN(Date.parse(val))) type = 'date';
        else type = 'categorical';
      }
      return { name: key, label: key, type };
    });

    const rq: ResearchQuestion = {
      outcome: '',
      explanatory: '',
      hypothesis: question,
      goal: 'explanation',
      structure: type
    };

    setCurrentDataset({
      name,
      data,
      variables,
      rowCount: data.length,
      colCount: variables.length,
      structure: type
    });
    setResearchQuestion(rq);
    setActiveModule(tab);
  }, [setCurrentDataset, setResearchQuestion, setActiveModule]);

  const handleApplyMetadata = (metadata: any) => {
    if (!currentDataset) return;

    const originalRows = currentDataset.originalData || currentDataset.data || [];

    const processedRows = originalRows.map((row: any) => {
      const newRow = { ...row };
      Object.keys(row).forEach(key => {
        const meta = metadata[key];
        if (meta && meta.missingCode !== null && meta.missingCode !== undefined) {
          const val = row[key];
          if (
            val === meta.missingCode || 
            Number(val) === Number(meta.missingCode) || 
            (val !== null && val !== undefined && String(val).trim() === String(meta.missingCode).trim())
          ) {
            newRow[key] = NaN;
          }
        }
      });
      return newRow;
    });

    const updatedVariables = currentDataset.variables.map(v => {
      const meta = metadata[v.name];
      if (meta) {
        let mappedType: 'numeric' | 'categorical' | 'date' | 'unknown' = 'numeric';
        if (meta.type === 'categorical') {
          mappedType = 'categorical';
        } else if (meta.type === 'date') {
          mappedType = 'date';
        } else if (meta.type === 'continuous' || meta.type === 'binary') {
          mappedType = 'numeric';
        }

        return {
          ...v,
          label: meta.label || v.name,
          type: mappedType,
          description: meta.description || v.description
        };
      }
      return v;
    });

    const updatedDataset = {
      ...currentDataset,
      originalData: originalRows,
      data: processedRows,
      variables: updatedVariables
    };

    setVariableMetadata(metadata);
    setCurrentDataset(updatedDataset);
  };

  const handleRestoreModel = async (sessionId: string) => {
    try {
      if (!user) {
        addToast('error', 'Session restoration failed', 'Please sign in to restore your research models.');
        return;
      }
      
      let run = history.find(h => h.id === sessionId);
      
      if (!run) {
        const { supabase } = await import('./lib/supabase');
        const { data: runRow } = await supabase
          .from('model_runs')
          .select('data')
          .eq('user_id', user.id)
          .eq('id', sessionId)
          .maybeSingle();
        if (runRow) {
          run = runRow.data as any;
        }
      }
      
      if (!run) {
        addToast('error', 'Model not found', 'Could not locate the requested model run history.');
        return;
      }
      
      let depVar = (run as any).dependentVar;
      let xVars: string[] = (run as any).regressors || [];
      if ((!depVar || xVars.length === 0) && run.specification) {
        const parts = run.specification.split('~');
        if (parts.length === 2) {
          depVar = (parts[0] || "").trim();
          xVars = (parts[1] || "").split("+").map(x => x.trim()).filter(Boolean);
        }
      }
      
      const mod = String(run.module).toLowerCase();
      if (mod === 'ols' || mod === 'ols regression') {
        setOlsConfiguration({
          yVar: depVar || '',
          xVars: xVars,
        });
        setActiveModule('ols');
      } else if (mod === 'fe' || mod === 'panel' || mod === 'panel regression' || mod === 'panel fixed effects') {
        if (depVar) setDependentVar(depVar);
        if (xVars.length > 0) setRegressors(xVars);
        setModelType('fe');
        setActiveModule('fe');
      } else if (mod === 'arima' || mod === 'time series' || mod === 'timeseries') {
        if (depVar) setDependentVar(depVar);
        setActiveModule('arima');
      } else {
        if (depVar) setDependentVar(depVar);
        if (xVars.length > 0) setRegressors(xVars);
        
        if (mod.includes('causal')) {
          setActiveModule('causal');
        } else {
          setActiveModule('ols');
        }
      }
      
      addToast('success', 'Model Specification Restored', `Restored ${run.module} model for ${depVar || 'selected variables'}.`);
    } catch (err: any) {
      console.error("Error restoring model: ", err);
      addToast('error', 'Restoration Failed', err.message || 'An error occurred while loading this run.');
    }
  };

  const handleExportModel = async (sessionId: string) => {
    try {
      if (!user) {
        addToast('error', 'Export failed', 'Please sign in to export your model results.');
        return;
      }
      
      let run = history.find(h => h.id === sessionId);
      
      if (!run) {
        const { supabase } = await import('./lib/supabase');
        const { data: runRow } = await supabase
          .from('model_runs')
          .select('data')
          .eq('user_id', user.id)
          .eq('id', sessionId)
          .maybeSingle();
        if (runRow) {
          run = runRow.data as any;
        }
      }
      
      if (!run) {
        addToast('error', 'Model not found', 'Could not locate the requested model run for exporting.');
        return;
      }
      
      const { exportToCSV } = await import('./lib/utils');
      
      const exportData = [{
        Session_ID: run.id,
        Timestamp: (run as any).timestamp?.toDate ? (run as any).timestamp.toDate().toISOString() : run.timestamp || '',
        Module: run.module,
        Specification: run.specification || '',
        Dependent_Variable: (run as any).dependentVar || '',
        Results: JSON.stringify(run.results || {}),
        Notes: run.notes || '',
        Interpretation: run.interpretation || ''
      }];
      
      exportToCSV(exportData, `econometric_model_export_${run.id}`);
      addToast('success', 'Export Completed', 'Model specification and diagnostics downloaded successfully as CSV.');
    } catch (err: any) {
      console.error("Error exporting model: ", err);
      addToast('error', 'Export Failed', err.message || 'An error occurred during export.');
    }
  };

  // Listen for quick inquiries from dashboard
  useEffect(() => {
    const handleQuickInquiry = (e: any) => {
      const { text, target } = e.detail;
      setDashboardSharedQuestion(text);
      setActiveModule(target);
    };

    window.addEventListener('economics_lab_quick_inquiry', handleQuickInquiry);
    return () => window.removeEventListener('economics_lab_quick_inquiry', handleQuickInquiry);
  }, [setActiveModule]);

  const renderers: Record<string, () => React.ReactNode> = {
    'dashboard': () => appMode === 'research' ? (
      <ResearchDesk onNavigate={setActiveModule} onRestore={handleRestoreModel} />
    ) : (
      <ScholarDashboard onNavigate={setActiveModule} onRestore={handleRestoreModel} onExport={handleExportModel} />
    ),
    'professor-desk': () => (
      <ProfessorDesk initialQuestion={dashboardSharedQuestion} initialMode={dashboardSharedMode} onClearInitialQuestion={() => setDashboardSharedQuestion('')} />
    ),
    'lab-partner': () => <LabPartner />,
    'academic-lab': () => (
      <AcademicLab initialQuestion={dashboardSharedQuestion} onClearInitialQuestion={() => setDashboardSharedQuestion('')} />
    ),
    'stats-interpreter': () => <StatsInterpreterLab />,
    'teacher-mode': () => <TeacherMode />,
    'templates': () => <Templates onSelect={loadTemplateData} />,
    'data-upload': () => <DataUploadLab />,
    'variable-view': () => <VariableView dataset={currentDataset} variableMetadata={variableMetadata} onApplyMetadata={handleApplyMetadata} />,
    'descriptive-stats': () => <DescriptiveStatsLab dataset={currentDataset} variableMetadata={variableMetadata} />,
    'data': () => <DataLab currentDataset={currentDataset} onDatasetChange={setCurrentDataset} onRunComplete={handleModelRun} />,
    'ols': () => <OLSLab dataset={currentDataset} onRunComplete={handleModelRun} isLoading={aiLoading} onAddToRobustness={(res, spec) => addToRobustness({ id: Math.random().toString(36), name: spec, results: res, specification: spec })} variableMetadata={variableMetadata} />,
    'fe': () => <FELab dataset={currentDataset} onRunComplete={handleModelRun} isLoading={aiLoading} />,
    'arima': () => <ARIMALab dataset={currentDataset} onRunComplete={handleModelRun} isLoading={aiLoading} />,
    'causal': () => <CausalLab dataset={currentDataset} onRunComplete={(r: any) => handleModelRun(r.results, r.specification || '')} />,
    'limited': () => <LimitedDependent dataset={currentDataset} onRunComplete={(r: any) => handleModelRun(r.results, r.specification || '')} />,
    'regularization': () => <RegularizationLab />,
    'robustness': () => <RobustnessExplorer items={robustnessItems} onClear={clearRobustness} />,
    'diagnostics': () => <DiagnosticsCenter />,
    'learn': () => <ConceptRepo />,
    'quiz': () => <EmpiricalQuiz />,
    'exports': () => <WritingLab dataset={currentDataset} onRunComplete={(r: any) => handleModelRun(r.results, r.specification || '')} />,
    'about-research': () => <AboutResearch />,
    'accuracy': () => <NumericalAccuracy />,
    'stat-tests': () => <StatTestsLab dataset={currentDataset} onRunComplete={(r, spec) => handleModelRun(r, spec)} />,
    'glm': () => <GLMLab dataset={currentDataset} onRunComplete={(r, spec) => handleModelRun(r, spec)} />,
    'heckman': () => <HeckmanLab dataset={currentDataset} onRunComplete={(r, spec) => handleModelRun(r, spec)} />,
    'adv-timeseries': () => <AdvancedTimeSeriesLab dataset={currentDataset} onRunComplete={(r, spec) => handleModelRun(r, spec)} />,
    'factor': () => <FactorAnalysisLab dataset={currentDataset} onRunComplete={(r, spec) => handleModelRun(r, spec)} />,
    'survival': () => <SurvivalAnalysisLab dataset={currentDataset} onRunComplete={(r, spec) => handleModelRun(r, spec)} />,
    'treatment': () => <TreatmentEffectsLab dataset={currentDataset} onRunComplete={(r, spec) => handleModelRun(r, spec)} />,
    'power-analysis': () => <PowerAnalysisLab dataset={currentDataset} />,
    'batch-processing': () => <BatchProcessingLab />,
    'session-report': () => <SessionReport />,
    'workflow-guide': () => <AcademicWorkflowGuide />
  };

  const renderActiveModule = () => {
    return (
      <div className="module-container h-full w-full">
        {Array.from(visitedModules).map(mod => {
          const renderer = renderers[mod] || renderers['templates'];
          if (!renderer) return null;
          return (
            <div key={mod} style={{ display: activeModule === mod ? 'block' : 'none', height: '100%', width: '100%' }}>
              {renderer()}
            </div>
          );
        })}
      </div>
    );
  };

  const renderQuickStatsHeader = () => {
    const latestRun = history && history.length > 0 ? history[0] : null;
    const results = latestRun?.results;
    
    let nVal = "—";
    let kVal = "—";
    let r2Val = "—";
    let adjR2Val = "—";
    let fStatVal = "—";
    let pVal = "—";
    let aicVal = "—";
    let bicVal = "—";

    if (results) {
      if (typeof results.n === 'number') nVal = String(results.n);
      
      if (Array.isArray(results.coefficients)) {
        const k = results.coefficients.filter((c: any) => c.variable && c.variable !== '(Intercept)' && c.variable !== '_cons' && c.variable !== 'Constant' && c.variable !== 'const').length;
        kVal = String(k);
      } else if (results.coefficients && typeof results.coefficients === 'object') {
        const k = Object.keys(results.coefficients).filter(key => key !== 'intercept' && key !== 'const' && key !== '_cons').length;
        kVal = String(k);
      }
      
      if (typeof results.rSquared === 'number' && results.rSquared != null) r2Val = results.rSquared.toFixed(4);
      else if (typeof results.r_sq === 'number' && results.r_sq != null) r2Val = results.r_sq.toFixed(4);
      else if (typeof results.r2 === 'number' && results.r2 != null) r2Val = results.r2.toFixed(4);
      
      if (typeof results.adjRSquared === 'number' && results.adjRSquared != null) adjR2Val = results.adjRSquared.toFixed(4);
      else if (typeof results.adj_r2 === 'number' && results.adj_r2 != null) adjR2Val = results.adj_r2.toFixed(4);
      
      if (typeof results.fStat === 'number' && results.fStat != null) fStatVal = results.fStat.toFixed(2);
      else if (typeof results.f_stat === 'number' && results.f_stat != null) fStatVal = results.f_stat.toFixed(2);
      else if (typeof results.fStatistic === 'number' && results.fStatistic != null) fStatVal = results.fStatistic.toFixed(2);
      
      if (typeof results.fPValue === 'number' && results.fPValue != null) {
        pVal = results.fPValue < 0.001 ? "< 0.001" : results.fPValue.toFixed(4);
      } else if (typeof results.f_p_value === 'number' && results.f_p_value != null) {
        pVal = results.f_p_value < 0.001 ? "< 0.001" : results.f_p_value.toFixed(4);
      } else if (typeof results.pValue === 'number' && results.pValue != null) {
        pVal = results.pValue < 0.001 ? "< 0.001" : results.pValue.toFixed(4);
      } else if (typeof results.pValue === 'string') {
        pVal = results.pValue;
      }
      
      if (typeof results.aic === 'number' && results.aic != null) aicVal = results.aic.toFixed(1);
      if (typeof results.bic === 'number' && results.bic != null) bicVal = results.bic.toFixed(1);
    }

    return (
      <div className="bg-slate-50 border border-slate-200/80 rounded-lg p-3 font-mono text-[10px] grid grid-cols-4 gap-y-2 gap-x-1.5 shadow-sm">
        <div className="text-center border-r border-slate-200">
          <p className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">N (obs)</p>
          <p className="text-slate-800 font-bold text-xs mt-0.5">{nVal}</p>
        </div>
        <div className="text-center border-r border-slate-200">
          <p className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">k (reg)</p>
          <p className="text-slate-800 font-bold text-xs mt-0.5">{kVal}</p>
        </div>
        <div className="text-center border-r border-slate-200">
          <p className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">R²</p>
          <p className="text-slate-800 font-bold text-xs mt-0.5">{r2Val}</p>
        </div>
        <div className="text-center">
          <p className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">Adj. R²</p>
          <p className="text-slate-800 font-bold text-xs mt-0.5">{adjR2Val}</p>
        </div>
        <div className="text-center border-r border-slate-200 pt-1 border-t border-slate-200/60">
          <p className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">F-stat</p>
          <p className="text-slate-800 font-bold text-xs mt-0.5">{fStatVal}</p>
        </div>
        <div className="text-center border-r border-slate-200 pt-1 border-t border-slate-200/60">
          <p className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">Prob &gt; F</p>
          <p className="text-slate-800 font-bold text-xs mt-0.5">{pVal}</p>
        </div>
        <div className="text-center border-r border-slate-200 pt-1 border-t border-slate-200/60">
          <p className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">AIC</p>
          <p className="text-slate-800 font-bold text-xs mt-0.5">{aicVal}</p>
        </div>
        <div className="text-center pt-1 border-t border-slate-200/60">
          <p className="text-slate-400 font-bold uppercase tracking-tight text-[8px]">BIC</p>
          <p className="text-slate-800 font-bold text-xs mt-0.5">{bicVal}</p>
        </div>
      </div>
    );
  };

  const renderStructuredReview = (content: string, mode: 'beginner' | 'advanced') => {
    let parsed: any = null;
    try {
      if (content.trim().startsWith('{')) {
        parsed = JSON.parse(content);
      }
    } catch (e) {
      console.error("Failed to parse econometric review JSON:", e);
    }

    // Fallback for raw legacy markdown strings
    if (!parsed) {
      const parts = content.split('---ADVANCED_SECTION---');
      const rawMarkdown = parts.length < 2 ? content : (mode === 'beginner' ? (parts[0] ?? "") : (parts[1] ?? ""));
      return (
        <div className="markdown-body prose prose-slate prose-sm max-w-none 
          prose-p:leading-relaxed prose-p:font-serif prose-p:text-slate-800
          prose-headings:font-serif prose-headings:italic prose-headings:text-slate-900 prose-headings:font-bold
        ">
          <MarkdownRenderer content={rawMarkdown} />
        </div>
      );
    }

    if (mode === 'beginner') {
      const data = parsed.beginner || {};
      return (
        <div className="space-y-6 text-slate-800 font-sans text-xs">
          
          {/* Section 1: Model Specification */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">1. Model Specification</h4>
            <p className="leading-relaxed font-serif text-slate-700 text-justify text-[13px]">
              {data.modelSpecification}
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 2: Coefficient Estimates Table */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">2. Coefficient Estimates</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200">
                    <th className="p-2.5 border-r border-slate-200 font-bold uppercase tracking-wider text-[9px]">Variable</th>
                    <th className="p-2.5 text-right border-r border-slate-200 font-bold uppercase tracking-wider text-[9px]">Estimate</th>
                    <th className="p-2.5 text-right border-r border-slate-200 font-bold uppercase tracking-wider text-[9px]">S.E.</th>
                    <th className="p-2.5 text-center border-r border-slate-200 font-bold uppercase tracking-wider text-[9px]">Signif.</th>
                    <th className="p-2.5 font-bold uppercase tracking-wider text-[9px]">Plain-English Meaning</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(data.coefficients) && data.coefficients.map((coef: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-900 whitespace-nowrap">{coef.variable}</td>
                      <td className="p-2 text-right text-slate-800 border-r border-slate-200 font-semibold">{coef.estimate}</td>
                      <td className="p-2 text-right text-slate-500 border-r border-slate-200">{coef.se}</td>
                      <td className="p-2 text-center text-emerald-600 font-bold border-r border-slate-200">{coef.significance}</td>
                      <td className="p-2 text-slate-600 font-serif leading-relaxed text-[12px]">{coef.meaning}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 3: Model Fit */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">3. Model Fit</h4>
            <p className="leading-relaxed font-serif text-slate-700 text-justify text-[13px]">
              {data.modelFit}
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 4: Assumption Checks */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">4. Assumption Checks</h4>
            <p className="leading-relaxed font-serif text-slate-700 text-justify text-[13px]">
              {data.assumptionChecks}
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 5: Interpretation Cautions */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">5. Interpretation Cautions</h4>
            <p className="leading-relaxed font-serif text-slate-700 text-justify text-[13px]">
              {data.interpretationCautions}
            </p>
          </div>

        </div>
      );
    } else {
      // Advanced/Referee mode
      const data = parsed.advanced || {};
      return (
        <div className="space-y-6 text-slate-800 font-sans text-xs">
          
          {/* Section 1: Model Specification & Identification */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">1. Model Specification &amp; Identification</h4>
            <p className="leading-relaxed font-serif text-slate-700 text-justify text-[13px]">
              {data.modelSpecificationIdentification}
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 2: Coefficient Estimates & Economic Significance */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">2. Coefficient Estimates &amp; Economic Significance</h4>
            <p className="leading-relaxed font-serif text-slate-700 text-justify text-[13px]">
              {data.coefficientsEconomicSignificance}
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 3: Model Fit & Parsimony */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">3. Model Fit &amp; Parsimony</h4>
            <p className="leading-relaxed font-serif text-slate-700 text-justify text-[13px]">
              {data.modelFitParsimony}
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 4: Identification Threats */}
          <div className="space-y-1.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">4. Identification Threats</h4>
            <p className="leading-relaxed font-serif text-slate-700 text-justify text-[13px]">
              {data.identificationThreats}
            </p>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 5: Assumption Diagnostics Table */}
          <div className="space-y-2.5">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">5. Assumption Diagnostics</h4>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-left font-mono text-[11px] border-collapse">
                <thead>
                  <tr className="bg-slate-100/80 text-slate-700 border-b border-slate-200">
                    <th className="p-2.5 border-r border-slate-200 font-bold uppercase tracking-wider text-[9px]">Diagnostic Test</th>
                    <th className="p-2.5 border-r border-slate-200 font-bold uppercase tracking-wider text-[9px]">Result Metric</th>
                    <th className="p-2.5 font-bold uppercase tracking-wider text-[9px]">Implication</th>
                  </tr>
                </thead>
                <tbody>
                  {Array.isArray(data.assumptionDiagnostics) && data.assumptionDiagnostics.map((diag: any, i: number) => (
                    <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-slate-50/50"}>
                      <td className="p-2 border-r border-slate-200 font-bold text-slate-900">{diag.test}</td>
                      <td className="p-2 text-slate-800 font-semibold border-r border-slate-200 whitespace-nowrap">{diag.result}</td>
                      <td className="p-2 text-slate-600 font-serif leading-relaxed text-[12px]">{diag.implication}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-slate-100 my-4" />

          {/* Section 6: Recommended Extensions */}
          <div className="space-y-2">
            <h4 className="font-bold text-xs text-slate-900 uppercase tracking-wider">6. Recommended Extensions</h4>
            <ul className="list-disc list-inside space-y-1.5 font-serif text-slate-700 pl-2 text-[13px]">
              {Array.isArray(data.recommendedExtensions) && data.recommendedExtensions.map((ext: string, i: number) => (
                <li key={i} className="leading-relaxed text-justify">{ext}</li>
              ))}
            </ul>
          </div>

        </div>
      );
    }
  };

  const firstHistoryItem = history && history.length > 0 ? history[0] : null;
  const primaryJson = currentAiAnalysis || (firstHistoryItem && firstHistoryItem.interpretation ? firstHistoryItem.interpretation : null);
  const comparisonRun = comparisonModelId ? history.find(run => run.id === comparisonModelId) : null;
  const secondaryJson = comparisonRun ? comparisonRun.interpretation : null;
  const isComparingActive = !!(primaryJson && secondaryJson);

  const renderPrintableReport = () => {
    if (activeModule === 'session-report') {
      if (!sessionEntries || sessionEntries.length === 0) {
        return (
          <div className="academic-print-page font-serif max-w-3xl mx-auto p-12 bg-white text-stone-950 text-justify">
            <h1 className="text-xl font-bold uppercase tracking-wider text-center border-b pb-4 font-academic">Economics Lab Session Report</h1>
            <p className="italic text-center mt-8 font-academic">No analysis entries compiled in this session.</p>
          </div>
        );
      }

      return (
        <div className="academic-print-page font-serif max-w-3xl mx-auto p-12 bg-white text-stone-950 text-justify leading-relaxed space-y-12">
          {/* Main Title Page for the Session Report */}
          <div className="working-paper-cover font-academic mb-16" style={{ pageBreakAfter: 'always' }}>
            <div className="flex justify-between items-start text-[10px] font-mono tracking-widest uppercase border-b border-stone-300 pb-4 text-stone-500">
              <div>
                <p className="font-bold text-stone-850">AEA Econometrics Network</p>
                <p>Applied Research Working Paper Series</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-stone-850">WP NO. 2026-SESSION</p>
                <p>{new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
              </div>
            </div>

            <div className="my-auto py-12 space-y-8">
              <div className="space-y-4">
                <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase text-blue-800 bg-blue-50/70 px-2.5 py-1 rounded">
                  Compiled Lab Session Output
                </span>
                <h1 className="cover-title leading-tight">
                  Economics Lab Session Report: Parameter Specifications and Estimations
                </h1>
                <p className="cover-subtitle">
                  An integrated compendium of empirical estimations, diagnostic verifications, and structural analyses.
                </p>
              </div>

              <div className="academic-double-rule" />

              <div className="space-y-1.5">
                <p className="text-xs uppercase tracking-wider font-mono text-stone-500">Principal Investigator</p>
                <p className="text-base font-bold text-stone-900 font-academic">{user?.email || "Principal Econometrician"}</p>
                <p className="text-xs text-stone-600 italic">Department of Applied Economics, Economics Learning Playground</p>
              </div>

              <div className="pt-6 space-y-2">
                <p className="text-xs uppercase tracking-wider font-mono text-stone-850 font-bold">Abstract</p>
                <p className="text-[12px] text-stone-800 leading-relaxed text-justify italic font-serif">
                  This multi-model report compiles a series of econometric analyses executed during the active research lab session.
                  We present estimations including parameter coefficients, standard errors, and model fits, 
                  formatted in strict accordance with the American Economic Association (AEA) guidelines and American Psychological Association (APA) tabular representations.
                  Each specification is accompanied by rigorous academic notes and diagnostic assessments.
                </p>
              </div>
            </div>

            <div className="border-t border-stone-200 pt-4 text-[9px] text-stone-400 font-mono flex justify-between items-center">
              <span>AEA Compendium Repository: https://econometrics-lab.onrender.com</span>
              <span>Compiled: {new Date().toLocaleTimeString()}</span>
            </div>
          </div>

          {/* Render each entry on a separate page */}
          {sessionEntries.map((entry, idx) => (
            <div key={entry.id} className="space-y-6 pb-12" style={{ pageBreakAfter: idx < sessionEntries.length - 1 ? 'always' : 'avoid' }}>
              <div className="border-b-2 border-stone-900 pb-2 flex justify-between items-end">
                <h2 className="text-lg font-bold font-serif text-stone-900 leading-tight">
                  Section {idx + 1}: {entry.title}
                </h2>
                <span className="text-xs font-mono text-stone-500">{entry.moduleType}</span>
              </div>

              <p className="text-xs text-stone-500 italic">
                Estimated on: {entry.timestamp.toLocaleString()}
              </p>

              {entry.notes && entry.notes.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-850 font-sans">
                    Interpretation Notes
                  </h3>
                  {entry.notes.map((note, nIdx) => (
                    <p key={nIdx} className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif">
                      {note}
                    </p>
                  ))}
                </div>
              )}

              <div className="space-y-6 pt-4">
                {entry.tables.map((table, tIdx) => (
                  <div key={tIdx} className="space-y-2">
                    <h4 className="text-xs font-bold text-stone-800 tracking-tight font-serif italic">
                      Table {idx + 1}.{tIdx + 1}: {table.title}
                    </h4>
                    <div className="booktabs-table border-t-2 border-b-2 border-stone-900 overflow-hidden">
                      <table className="w-full text-left text-[11px] font-serif border-collapse">
                        <thead>
                          <tr className="border-b border-stone-400">
                            {table.headers.map((header, hIdx) => (
                              <th key={hIdx} className={`py-1.5 font-bold text-stone-900 ${hIdx === 0 ? 'text-left' : 'text-right'}`}>
                                {header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row, rIdx) => (
                            <tr key={rIdx} className="border-b border-stone-100 last:border-b-0">
                              {row.map((cell, cIdx) => (
                                <td key={cIdx} className={`py-1 text-stone-850 ${cIdx === 0 ? 'text-left font-semibold' : 'text-right font-mono'}`}>
                                  {cell === null || cell === undefined
                                    ? '—'
                                    : typeof cell === 'number'
                                    ? cell.toFixed(4)
                                    : String(cell)}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {table.footnote && (
                      <p className="text-[9px] text-stone-500 italic font-serif mt-1">
                        Note: {table.footnote}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    if (!primaryJson) return null;

    let parsedPrimary: any = null;
    let parsedSecondary: any = null;

    // Strip markdown code fences and isolate the JSON object, so a response
    // wrapped in ```json ... ``` (or with leading/trailing prose) still parses
    // instead of falling back to dumping the raw string in the panel.
    const cleanJson = (s: string) => {
      const stripped = s.replace(/```json/gi, '').replace(/```/g, '').trim();
      const start = stripped.indexOf('{');
      const end = stripped.lastIndexOf('}');
      return start !== -1 && end !== -1 ? stripped.slice(start, end + 1) : stripped;
    };

    try {
      const c = cleanJson(primaryJson);
      if (c.startsWith('{')) {
        parsedPrimary = JSON.parse(c);
      }
    } catch (e) {
      console.error("Failed to parse econometric review JSON:", e);
    }

    try {
      if (secondaryJson) {
        const c = cleanJson(secondaryJson);
        if (c.startsWith('{')) {
          parsedSecondary = JSON.parse(c);
        }
      }
    } catch (e) {
      console.error("Failed to parse secondary econometric review JSON:", e);
    }

    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const activeRun = history.find(r => r.interpretation === primaryJson);

    const paperTitle = researchQuestion?.hypothesis 
      ? `An Econometric Investigation into: ${researchQuestion.hypothesis}` 
      : `Empirical Specification and Estimation Report: ${researchQuestion?.outcome || 'Y'} on ${researchQuestion?.explanatory || 'X'}`;

    return (
      <div className="academic-print-page font-serif max-w-3xl mx-auto p-12 bg-white text-stone-950 text-justify leading-relaxed">
        
        {/* Formal Academic Working Paper Cover Page */}
        <div className="working-paper-cover font-academic mb-16" style={{ pageBreakAfter: 'always' }}>
          {/* Top Series Header */}
          <div className="flex justify-between items-start text-[10px] font-mono tracking-widest uppercase border-b border-stone-300 pb-4 text-stone-500">
            <div>
              <p className="font-bold text-stone-800">AEA Econometrics Network</p>
              <p>Applied Research Working Paper Series</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-stone-800">WP NO. 2026-{(activeRun?.id || 'GLOBAL-REPL').toUpperCase()}</p>
              <p>{today}</p>
            </div>
          </div>

          {/* Middle Body */}
          <div className="my-auto py-12 space-y-8">
            <div className="space-y-4">
              <span className="text-[11px] font-mono font-bold tracking-[0.2em] uppercase text-blue-800 bg-blue-50/70 px-2.5 py-1 rounded">
                Replication Draft &amp; Working Paper
              </span>
              <h1 className="cover-title leading-tight">
                {paperTitle}
              </h1>
              {researchQuestion?.hypothesis && (
                <p className="cover-subtitle">
                  Estimating causal relations, structural identification, and parameter robustness.
                </p>
              )}
            </div>

            <div className="academic-double-rule" />

            {/* Investigator and Affiliation */}
            <div className="space-y-1.5">
              <p className="text-xs uppercase tracking-wider font-mono text-stone-500">Principal Investigator</p>
              <p className="text-base font-bold text-stone-900 font-academic">{user?.email || "Principal Econometrician"}</p>
              <p className="text-xs text-stone-600 italic">Department of Applied Economics, Econometrics Learning Playground</p>
              <p className="text-[10px] font-mono text-stone-400">Collaborator: Generative Econometric Synthesis Engine</p>
            </div>

            {/* Abstract Section */}
            <div className="pt-6 space-y-2">
              <p className="text-xs uppercase tracking-wider font-mono text-stone-800 font-bold">Abstract</p>
              <p className="text-[12px] text-stone-800 leading-relaxed text-justify italic font-serif">
                This working paper presents a systematic empirical evaluation of the specified econometric model using the active research database. 
                We employ advanced estimation techniques to explore the structural relationships between the outcome variable of interest (<code className="font-mono text-[10px] bg-stone-100 px-1 py-0.5 rounded">{researchQuestion?.outcome || 'Y'}</code>) 
                and our key explanatory variables (<code className="font-mono text-[10px] bg-stone-100 px-1 py-0.5 rounded">{researchQuestion?.explanatory || 'X'}</code>). 
                Section I provides the pedagogical intuition and plain-English meanings of our parameters (Wooldridge-style), followed by Section II's technical working memo which details the identification strategy, diagnostics of the error terms, and Gauss-Markov assumption compliance.
              </p>
            </div>

            {/* Active Dataset Metadata (Booktabs style) */}
            <div className="pt-4 space-y-2">
              <p className="text-xs uppercase tracking-wider font-mono text-stone-800 font-bold">Dataset &amp; Sample Metadata</p>
              <div className="booktabs-table border-t-2 border-b-2 border-stone-900 overflow-hidden">
                <table className="w-full text-left text-[11px] font-serif border-collapse">
                  <thead>
                    <tr className="border-b border-stone-400">
                      <th className="py-1.5 font-bold text-stone-900 w-1/3">Metadata Attribute</th>
                      <th className="py-1.5 font-bold text-stone-900">Active Values &amp; Dimensions</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-stone-200">
                      <td className="py-1.5 font-bold text-stone-800">Dataset Name</td>
                      <td className="py-1.5 text-stone-800 font-medium italic">{currentDataset?.name || "Active Session Workspace Dataset"}</td>
                    </tr>
                    <tr className="border-b border-stone-200">
                      <td className="py-1.5 font-bold text-stone-800">Sample Size (Observations, N)</td>
                      <td className="py-1.5 text-stone-800 font-mono font-bold">{currentDataset?.rowCount ? `${currentDataset.rowCount} rows` : "N/A"}</td>
                    </tr>
                    <tr className="border-b border-stone-200">
                      <td className="py-1.5 font-bold text-stone-800">Dimensionality (Variables, K)</td>
                      <td className="py-1.5 text-stone-800 font-mono">{currentDataset?.colCount ? `${currentDataset.colCount} dimensions` : "N/A"}</td>
                    </tr>
                    <tr className="border-b border-stone-200">
                      <td className="py-1.5 font-bold text-stone-800">Data Structure / Estimator</td>
                      <td className="py-1.5 text-stone-800 capitalize font-medium">
                        {currentDataset?.structure || "Cross-Section"} ({researchQuestion?.goal || "Explanation"})
                      </td>
                    </tr>
                    <tr>
                      <td className="py-1.5 font-bold text-stone-800">Available Variables</td>
                      <td className="py-1.5 text-stone-600 font-mono text-[10px] leading-tight max-w-[400px] truncate">
                        {currentDataset?.variables?.map(v => v.name).join(', ') || "No variables defined."}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Bottom Footnote */}
          <div className="border-t border-stone-200 pt-4 text-[9px] text-stone-400 font-mono flex justify-between items-center">
            <span>AEA Compendium Repository: https://econometrics-lab.onrender.com</span>
            <span>Secure Verification Index: {activeRun?.id || "N/A"}</span>
          </div>
        </div>

        {/* Academic Header (NBER / Working Paper Style) */}
        <div className="text-center space-y-4 border-b-2 border-stone-900 pb-6 mb-8">
          <p className="text-[10px] font-mono tracking-widest text-stone-500 uppercase">
            AEA Research Network &bull; Econometric Lab Working Memo
          </p>
          <h1 className="text-2xl font-bold text-stone-950 tracking-tight font-serif italic">
            Empirical Model Evaluation and Econometric Interpretation
          </h1>
          <p className="text-xs font-serif text-stone-600 italic">
            Automated Academic Working Draft &bull; Generated on {today}
          </p>
        </div>

        {/* Metadata Table (Booktabs style) */}
        <div className="mb-8">
          <table className="w-full text-xs font-serif border-t-2 border-b-2 border-stone-900 border-collapse">
            <tbody>
              <tr className="border-b border-stone-200">
                <td className="py-2 pr-4 font-bold text-stone-900 w-1/3">Research Hypothesis</td>
                <td className="py-2 text-stone-800 italic">
                  {researchQuestion?.hypothesis || "No specific hypothesis declared."}
                </td>
              </tr>
              <tr className="border-b border-stone-200">
                <td className="py-2 pr-4 font-bold text-stone-900">Dependent Variable (Y)</td>
                <td className="py-2 font-mono text-stone-700">
                  {researchQuestion?.outcome || "Active outcome variable"}
                </td>
              </tr>
              <tr className="border-b border-stone-200">
                <td className="py-2 pr-4 font-bold text-stone-900">Key Explanatory Variable (X)</td>
                <td className="py-2 font-mono text-stone-700">
                  {researchQuestion?.explanatory || "Active explanatory variable"}
                </td>
              </tr>
              <tr className="border-b border-stone-200">
                <td className="py-2 pr-4 font-bold text-stone-900">Model Framework</td>
                <td className="py-2 text-stone-800 capitalize">
                  {researchQuestion?.structure || "Cross-Section"} / {researchQuestion?.goal || "Causal Inference"}
                </td>
              </tr>
              {activeRun && (
                <tr>
                  <td className="py-2 pr-4 font-bold text-stone-900">Active Specification</td>
                  <td className="py-2 text-stone-800 font-medium">
                    {activeRun.module} Estimation: <code className="font-mono bg-stone-100 px-1 py-0.5 rounded text-[11px]">{activeRun.specification}</code>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Executive Summary / Abstract */}
        <div className="mb-8 space-y-2">
          <h2 className="text-sm font-bold uppercase tracking-wider text-stone-900 border-b border-stone-200 pb-1 font-sans">
            Abstract &amp; Model Overview
          </h2>
          <p className="text-[12px] text-stone-800 leading-relaxed italic text-justify font-serif">
            This memorandum presents the structural and statistical evaluation of the regression model specified above. 
            Using econometric validation procedures, we assess the coefficients' parameters, standard errors robustness, 
            and compliance with fundamental econometric assumptions. Below, we detail both pedagogical and technical reviews.
          </p>
        </div>

        {/* Content Section: Render Beginner (Wooldridge Style) */}
        {parsedPrimary ? (
          <div className="space-y-8">
            
            {/* Pedagogical Block */}
            {parsedPrimary.beginner && (
              <div className="space-y-6">
                <div className="border-b-2 border-stone-300 pb-1">
                  <h2 className="text-base font-bold font-serif text-stone-900 italic">
                    Part I: Pedagogical Interpretation (Wooldridge Style)
                  </h2>
                </div>

                {/* Specification */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    1. Model Specification &amp; Framework
                  </h3>
                  <p className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif">
                    {parsedPrimary.beginner.modelSpecification}
                  </p>
                </div>

                {/* Coefficient Table */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    2. Parameter Estimates &amp; Interpretations
                  </h3>
                  <div className="rounded border border-stone-200 overflow-hidden">
                    <table className="w-full text-[11px] font-serif border-collapse text-left">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="p-2 font-bold text-stone-900 border-r border-stone-200">Variable</th>
                          <th className="p-2 text-right font-bold text-stone-900 border-r border-stone-200">Estimate</th>
                          <th className="p-2 text-right font-bold text-stone-900 border-r border-stone-200">S.E.</th>
                          <th className="p-2 text-center font-bold text-stone-900 border-r border-stone-200">Signif.</th>
                          <th className="p-2 font-bold text-stone-900">Plain-English Meaning</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(parsedPrimary.beginner.coefficients) && parsedPrimary.beginner.coefficients.map((coef: any, i: number) => (
                          <tr key={i} className="border-b border-stone-100 last:border-b-0">
                            <td className="p-2 font-mono font-bold text-stone-900 border-r border-stone-200">{coef.variable}</td>
                            <td className="p-2 text-right font-mono font-bold text-stone-800 border-r border-stone-200">{coef.estimate}</td>
                            <td className="p-2 text-right font-mono text-stone-500 border-r border-stone-200">{coef.se}</td>
                            <td className="p-2 text-center text-emerald-700 font-bold border-r border-stone-200">{coef.significance}</td>
                            <td className="p-2 text-stone-700 leading-relaxed text-justify text-[11px]">{coef.meaning}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Model Fit */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    3. Model Fit &amp; Explanatory Power
                  </h3>
                  <p className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif">
                    {parsedPrimary.beginner.modelFit}
                  </p>
                </div>

                {/* Assumption Checks */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    4. Gauss-Markov Assumption Compliance
                  </h3>
                  <p className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif">
                    {parsedPrimary.beginner.assumptionChecks}
                  </p>
                </div>

                {/* Cautions */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans text-rose-900">
                    5. Statistical &amp; Causal Cautions
                  </h3>
                  <p className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif bg-rose-50/30 p-3 border border-rose-100 rounded">
                    {parsedPrimary.beginner.interpretationCautions}
                  </p>
                </div>
              </div>
            )}

            {/* Advanced Block */}
            {parsedPrimary.advanced && (
              <div className="space-y-6 pt-6 border-t-2 border-stone-300">
                <div className="border-b-2 border-stone-300 pb-1">
                  <h2 className="text-base font-bold font-serif text-stone-900 italic">
                    Part II: Technical Working Memo (Referee Style)
                  </h2>
                </div>

                {/* Spec & ID */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    1. Model Specification &amp; Identification Strategies
                  </h3>
                  <p className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif">
                    {parsedPrimary.advanced.modelSpecificationIdentification}
                  </p>
                </div>

                {/* Significance */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    2. Estimator Magnitudes &amp; Economic Significance
                  </h3>
                  <p className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif">
                    {parsedPrimary.advanced.coefficientsEconomicSignificance}
                  </p>
                </div>

                {/* Fit & Parsimony */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    3. Information Criteria &amp; Model Parsimony
                  </h3>
                  <p className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif">
                    {parsedPrimary.advanced.modelFitParsimony}
                  </p>
                </div>

                {/* Identification Threats */}
                <div className="space-y-1">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans text-amber-900">
                    4. Endogeneity &amp; Identification Threats
                  </h3>
                  <p className="text-[12px] text-stone-800 leading-relaxed text-justify font-serif bg-amber-50/20 p-3 border border-amber-100 rounded">
                    {parsedPrimary.advanced.identificationThreats}
                  </p>
                </div>

                {/* Diagnostics Table */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    5. Robustness &amp; Specification Diagnostics
                  </h3>
                  <div className="rounded border border-stone-200 overflow-hidden">
                    <table className="w-full text-[11px] font-serif border-collapse text-left">
                      <thead>
                        <tr className="bg-stone-50 border-b border-stone-200">
                          <th className="p-2 font-bold text-stone-900 border-r border-stone-200 w-1/4">Diagnostic Test</th>
                          <th className="p-2 font-bold text-stone-900 border-r border-stone-200 w-1/4">Result Metric</th>
                          <th className="p-2 font-bold text-stone-900">Economic Implication</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.isArray(parsedPrimary.advanced.assumptionDiagnostics) && parsedPrimary.advanced.assumptionDiagnostics.map((diag: any, i: number) => (
                          <tr key={i} className="border-b border-stone-100 last:border-b-0">
                            <td className="p-2 font-bold text-stone-900 border-r border-stone-200">{diag.test}</td>
                            <td className="p-2 font-mono font-bold text-stone-800 border-r border-stone-200">{diag.result}</td>
                            <td className="p-2 text-stone-700 leading-relaxed text-justify text-[11px]">{diag.implication}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Recommended Extensions */}
                <div className="space-y-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                    6. Econometric Refinements &amp; Robustness Checks
                  </h3>
                  <ul className="list-disc list-inside space-y-1.5 text-[12px] font-serif text-stone-700 pl-2">
                    {Array.isArray(parsedPrimary.advanced.recommendedExtensions) && parsedPrimary.advanced.recommendedExtensions.map((ext: string, i: number) => (
                      <li key={i} className="leading-relaxed text-justify">{ext}</li>
                    ))}
                  </ul>
                </div>
              </div>
            )}

            {/* Comparison Specification Block (if active) */}
            {parsedSecondary && (
              <div className="space-y-6 pt-12 border-t-4 border-stone-900">
                <div className="text-center pb-2 border-b-2 border-stone-900">
                  <h2 className="text-base font-bold uppercase tracking-wider text-stone-900 font-sans">
                    Comparative Specification Analysis
                  </h2>
                  <p className="text-xs text-stone-500 italic">
                    Comparison Model: {comparisonRun ? `${comparisonRun.module} (${comparisonRun.specification})` : "Secondary Model"}
                  </p>
                </div>

                {parsedSecondary.beginner && (
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-sans">
                      Comparative Coefficients Matrix
                    </h3>
                    <div className="rounded border border-stone-200 overflow-hidden">
                      <table className="w-full text-[11px] font-serif border-collapse text-left">
                        <thead>
                          <tr className="bg-stone-50 border-b border-stone-200">
                            <th className="p-2 font-bold text-stone-900 border-r border-stone-200">Variable</th>
                            <th className="p-2 text-right font-bold text-stone-900 border-r border-stone-200">Model 1 (Primary)</th>
                            <th className="p-2 text-right font-bold text-stone-900">Model 2 (Compared)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.isArray(parsedPrimary.beginner.coefficients) && parsedPrimary.beginner.coefficients.map((coef: any, i: number) => {
                            const compCoef = parsedSecondary.beginner.coefficients?.find((c: any) => c.variable === coef.variable);
                            return (
                              <tr key={i} className="border-b border-stone-100 last:border-b-0">
                                <td className="p-2 font-mono font-bold text-stone-900 border-r border-stone-200">{coef.variable}</td>
                                <td className="p-2 text-right font-mono border-r border-stone-200">
                                  <span className="font-bold text-stone-800">{coef.estimate}</span> <span className="text-[9px] text-stone-500">({coef.se})</span> <span className="text-emerald-700 font-bold">{coef.significance}</span>
                                </td>
                                <td className="p-2 text-right font-mono">
                                  {compCoef ? (
                                    <>
                                      <span className="font-bold text-stone-800">{compCoef.estimate}</span> <span className="text-[9px] text-stone-500">({compCoef.se})</span> <span className="text-emerald-700 font-bold">{compCoef.significance}</span>
                                    </>
                                  ) : (
                                    <span className="text-stone-400 italic">Not Included</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Academic Signoff / Footer */}
            <div className="pt-12 mt-12 border-t border-stone-300 text-center space-y-2">
              <div className="flex justify-center gap-12 text-[11px] font-serif text-stone-600 italic">
                <div>
                  <div className="border-b border-stone-400 w-36 mx-auto mb-1 h-8" />
                  <span>Principal Investigator Signature</span>
                </div>
                <div>
                  <div className="border-b border-stone-400 w-36 mx-auto mb-1 h-8" />
                  <span>Econometric Lab Supervisor</span>
                </div>
              </div>
              <p className="text-[9px] font-mono text-stone-400 pt-6">
                ECONOMETRICS-PLAYGROUND SECURE COMPENDIUM INDEX: {activeRun?.id || "N/A"}-{today.replace(/,/g, '').replace(/ /g, '-')}
              </p>
            </div>

          </div>
        ) : (
          <div className="markdown-body font-serif text-[13px] leading-relaxed text-justify">
            <MarkdownRenderer content={primaryJson} />
          </div>
        )}

      </div>
    );
  };

  const aiPanelContent = (
    <React.Suspense fallback={
      <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 opacity-50">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 stroke-1" />
        <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
          Synthesizing <br /> econometric review...
        </p>
      </div>
    }>
      <div className="space-y-4 flex flex-col pt-2">
        {/* Always visible model statistics summary bar */}
        {renderQuickStatsHeader()}

        {/* Collapsible Model Specifications Selector for Comparison */}
        {history.length > 0 && (
          <div className="border border-slate-200 bg-slate-50/50 rounded-xl p-3 space-y-2.5 shadow-sm">
            <button
              onClick={() => setShowRunHistoryList(!showRunHistoryList)}
              className="w-full flex items-center justify-between text-[10px] font-extrabold uppercase tracking-widest text-slate-600 hover:text-slate-900 transition-colors"
              id="btn-toggle-runs-history"
            >
              <div className="flex items-center gap-2">
                <Activity className="w-3.5 h-3.5 text-blue-500" />
                <span>Compare Model Specifications ({history.length})</span>
              </div>
              <ChevronDown className={cn("w-3.5 h-3.5 text-slate-400 transition-transform duration-200", showRunHistoryList ? "rotate-180" : "")} />
            </button>
            
            {showRunHistoryList && (
              <div className="pt-2 space-y-2 max-h-[220px] overflow-y-auto pr-1 text-[11px] custom-scrollbar">
                {history.map((run, idx) => {
                  const isCurrent = currentAiAnalysis 
                    ? run.interpretation === currentAiAnalysis
                    : idx === 0;
                  const isBeingCompared = comparisonModelId === run.id;
                  const hasValidInterpretation = typeof run.interpretation === 'string' && run.interpretation.trim().length > 0;
                  
                  return (
                    <div key={run.id} className={cn(
                      "flex flex-col p-2.5 bg-white rounded-lg border transition-all space-y-2",
                      isCurrent ? "border-blue-500 ring-1 ring-blue-500/10" : "border-slate-200 hover:border-slate-300"
                    )}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase">{run.module}</span>
                        <span className="text-[9px] text-slate-400 font-mono">
                          {idx === 0 ? "Latest Run" : `Run #${history.length - idx}`}
                        </span>
                      </div>
                      <p className="font-serif italic text-slate-800 leading-normal line-clamp-2">{run.specification}</p>
                      
                      <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                        <button
                          onClick={() => {
                            if (run.interpretation) {
                              setCurrentAiAnalysis(run.interpretation);
                            } else {
                              setCurrentAiAnalysis(null);
                            }
                            setComparisonModelId(null); // Reset compare on active change
                          }}
                          className={cn(
                            "flex-1 py-1 rounded text-[9px] font-black uppercase tracking-wider text-center transition-colors",
                            isCurrent 
                              ? "bg-slate-100 text-slate-600 cursor-default" 
                              : "bg-slate-900 text-white hover:bg-slate-800"
                          )}
                          disabled={isCurrent}
                        >
                          {isCurrent ? "Active" : "Load Run"}
                        </button>
                        
                        {hasValidInterpretation ? (
                          <button
                            onClick={() => {
                              if (isBeingCompared) {
                                setComparisonModelId(null);
                              } else {
                                setComparisonModelId(run.id);
                              }
                            }}
                            className={cn(
                              "flex-1 py-1 rounded text-[9px] font-black uppercase tracking-wider text-center transition-colors border",
                              isBeingCompared
                                ? "bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100"
                                : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-slate-950"
                            )}
                          >
                            {isBeingCompared ? "Remove Compare" : "Compare"}
                          </button>
                        ) : (
                          <span className="flex-1 text-[8px] font-mono text-slate-400 text-center py-1 bg-slate-50 rounded italic border border-dashed border-slate-200" title="No structured JSON saved for this legacy run">
                            Legacy Run
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab Switcher */}
        {(currentAiAnalysis || history.length > 0) && (
          <div className="flex bg-slate-100 p-1 rounded-lg">
            <button 
              onClick={() => setAiMode('beginner')}
              className={cn(
                "flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all",
                aiMode === 'beginner' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Beginner
            </button>
            <button 
              onClick={() => setAiMode('advanced')}
              className={cn(
                "flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all",
                aiMode === 'advanced' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Advanced
            </button>
            <button 
              onClick={() => setAiMode('replication')}
              className={cn(
                "flex-1 py-1.5 text-[9px] font-bold uppercase tracking-wider rounded-md transition-all",
                aiMode === 'replication' ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
              )}
            >
              Replication Code
            </button>
          </div>
        )}

        {aiLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-4 opacity-50 py-12">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600 stroke-1" />
            <p className="font-mono text-[10px] uppercase tracking-widest text-slate-500">
              Evaluating <br /> econometric priors...
            </p>
          </div>
        ) : isComparingActive ? (
          <div className="flex-1 space-y-6 overflow-y-auto pr-1">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <Columns className="w-4 h-4 text-blue-600 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-800 font-mono">
                Side-by-Side Model Comparison
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
              {/* Primary Column */}
              <div className="space-y-4 border-r border-slate-100 pr-2 md:pr-4">
                <div className="flex flex-col gap-1 border border-blue-200 bg-blue-50/20 p-3 rounded-xl shadow-sm">
                  <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-blue-600">Active Specification</span>
                  <p className="text-[11px] font-serif font-bold text-slate-800 italic leading-tight">
                    {(() => {
                      const found = history.find(r => r.interpretation === primaryJson);
                      return found ? `${found.module}: ${found.specification}` : "Active Model Run";
                    })()}
                  </p>
                </div>
                {renderStructuredReview(primaryJson, aiMode === 'replication' ? 'beginner' : aiMode)}
              </div>

              {/* Secondary/Comparison Column */}
              <div className="space-y-4">
                <div className="flex flex-col gap-1 border border-amber-200 bg-amber-50/20 p-3 rounded-xl shadow-sm">
                  <span className="text-[8px] font-mono font-bold uppercase tracking-wider text-amber-600">Compared Specification</span>
                  <p className="text-[11px] font-serif font-bold text-slate-800 italic leading-tight">
                    {comparisonRun ? `${comparisonRun.module}: ${comparisonRun.specification}` : "Comparison Run"}
                  </p>
                </div>
                {renderStructuredReview(secondaryJson, aiMode === 'replication' ? 'beginner' : aiMode)}
              </div>
            </div>
          </div>
        ) : aiMode === 'replication' ? (
          <div className="flex-1 overflow-y-auto pr-1">
            <ReplicationCodeTab 
              activeRun={(() => {
                const found = history.find(r => r.interpretation === primaryJson);
                const firstItem = history && history.length > 0 ? history[0] : null;
                return found || firstItem || null;
              })()} 
            />
          </div>
        ) : currentAiAnalysis ? (
          <motion.div 
            key={`current-${currentAiAnalysis}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="flex-1 space-y-4 overflow-y-auto pr-1"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <GraduationCap className="w-4 h-4 text-blue-600" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-800 font-mono">
                {aiMode === 'beginner' ? 'Pedagogical Explanation (Wooldridge Style)' : 'Technical Working Memo (Referee Style)'}
              </span>
            </div>
            {renderStructuredReview(currentAiAnalysis, aiMode)}
          </motion.div>
        ) : (firstHistoryItem && firstHistoryItem.interpretation) ? (
          <motion.div
            key={`history-${firstHistoryItem.interpretation}`}
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: 'easeOut' }}
            className="flex-1 space-y-4 overflow-y-auto pr-1"
          >
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <GraduationCap className="w-4 h-4 text-slate-400" />
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Last Run Context</span>
            </div>
            {renderStructuredReview(firstHistoryItem.interpretation, aiMode)}
          </motion.div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-center space-y-6 px-10 py-16">
             <div className="p-4 bg-slate-50 rounded-full">
              <BrainCircuit className="w-10 h-10 text-slate-200 stroke-1" />
             </div>
             <div className="space-y-2">
               <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Intelligence Idle</h3>
               <p className="text-xs text-slate-400 font-serif italic leading-relaxed">
                 Execute a model for immediate automated structural interpretation.
               </p>
             </div>
          </div>
        )}

        {primaryJson && !aiLoading && (() => {
          const getExportText = () => {
            let textToExport = primaryJson;
            try {
              if (primaryJson && primaryJson.trim().startsWith('{')) {
                const parsed = JSON.parse(primaryJson);
                textToExport = `# Econometric Interpretation & Academic Review\n\n`;
                
                if (parsed.beginner) {
                  textToExport += `## I. Pedagogical Interpretation (Wooldridge Style)\n\n`;
                  textToExport += `### 1. Model Specification\n${parsed.beginner.modelSpecification}\n\n`;
                  textToExport += `### 2. Coefficients Table\n`;
                  textToExport += `| Variable | Estimate | S.E. | Signif. | Meaning |\n`;
                  textToExport += `|---|---|---|---|---|\n`;
                  parsed.beginner.coefficients?.forEach((coef: any) => {
                    textToExport += `| ${coef.variable} | ${coef.estimate} | ${coef.se} | ${coef.significance} | ${coef.meaning} |\n`;
                  });
                  textToExport += `\n### 3. Model Fit\n${parsed.beginner.modelFit}\n\n`;
                  textToExport += `### 4. Assumption Checks\n${parsed.beginner.assumptionChecks}\n\n`;
                  textToExport += `### 5. Interpretation Cautions\n${parsed.beginner.interpretationCautions}\n\n`;
                }
                
                textToExport += `\n---\n\n`;
                
                if (parsed.advanced) {
                  textToExport += `## II. Technical Working Memo (Referee Style)\n\n`;
                  textToExport += `### 1. Model Specification & Identification\n${parsed.advanced.modelSpecificationIdentification}\n\n`;
                  textToExport += `### 2. Coefficient Estimates & Economic Significance\n${parsed.advanced.coefficientsEconomicSignificance}\n\n`;
                  textToExport += `### 3. Model Fit & Parsimony\n${parsed.advanced.modelFitParsimony}\n\n`;
                  textToExport += `### 4. Identification Threats\n${parsed.advanced.identificationThreats}\n\n`;
                  textToExport += `### 5. Assumption Diagnostics Table\n`;
                  textToExport += `| Test | Result | Implication |\n`;
                  textToExport += `|---|---|---|\n`;
                  parsed.advanced.assumptionDiagnostics?.forEach((diag: any) => {
                    textToExport += `| ${diag.test} | ${diag.result} | ${diag.implication} |\n`;
                  });
                  textToExport += `\n### 6. Recommended Extensions\n`;
                  parsed.advanced.recommendedExtensions?.forEach((ext: string) => {
                    textToExport += `- ${ext}\n`;
                  });
                }
              }
            } catch (e) {
              console.error(e);
            }
            return textToExport;
          };

          const handleExport = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const textToExport = getExportText();
            safeDownloadFile(textToExport, `academic-insights-${Date.now()}.md`, 'text/markdown');
          };

          const handleCopy = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            const textToExport = getExportText();
            copyTextToClipboard(textToExport).then((success) => {
              if (success) {
                setCopiedInsights(true);
                setTimeout(() => setCopiedInsights(false), 2000);
              } else {
                alert("Failed to copy text. Please try manually selecting and copying the text.");
              }
            });
          };

          const handlePrintPDF = (e: React.MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            document.body.classList.add('printing-academic-report');
            const cleanup = () => {
              document.body.classList.remove('printing-academic-report');
              window.removeEventListener('afterprint', cleanup);
            };
            window.addEventListener('afterprint', cleanup);
            setTimeout(() => {
              window.print();
              setTimeout(cleanup, 1000);
            }, 150);
          };

          return (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <button 
                type="button"
                onClick={handlePrintPDF}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm cursor-pointer"
                id="btn-export-insights-pdf"
              >
                <Printer className="w-3.5 h-3.5 text-blue-100 animate-pulse" />
                Export as PDF (Academic Print)
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button 
                  type="button"
                  onClick={handleExport}
                  className="flex items-center justify-center gap-2 py-2 border border-slate-200 bg-white text-slate-800 rounded-lg text-[10px] font-bold uppercase tracking-widest hover:bg-slate-50 transition-all shadow-sm"
                  id="btn-export-insights-md"
                >
                  <Download className="w-3 h-3 text-slate-500" />
                  Export (.md)
                </button>
                
                <button 
                  type="button"
                  onClick={handleCopy}
                  className={cn(
                    "flex items-center justify-center gap-2 py-2 border rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all shadow-sm",
                    copiedInsights 
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700" 
                      : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50"
                  )}
                  id="btn-copy-insights-clipboard"
                >
                  {copiedInsights ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Clipboard className="w-3 h-3 text-slate-400" />
                      Copy Text
                    </>
                  )}
                </button>
              </div>
              
              <div className="p-3 bg-amber-50/75 border border-amber-100 rounded-lg text-[10px] text-amber-800 leading-normal font-sans space-y-1">
                <p className="font-semibold flex items-center gap-1.5 text-amber-900">
                  <HelpCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  Iframe Sandbox Notice
                </p>
                <p className="text-slate-600">
                  If the download button does not trigger a file inside the preview iframe, use <strong>Copy Text</strong>, or click <strong>Open in New Tab</strong> at the top right of the platform to export natively.
                </p>
              </div>
            </div>
          );
        })()}
      </div>
    </React.Suspense>
  );

  if (currentPath === '/privacy') {
    return (
      <React.Suspense fallback={
        <div className="flex flex-col items-center justify-center min-h-[80vh] opacity-20 animate-pulse">
          <Loader2 className="w-12 h-12 mb-4 animate-spin text-[#1B2E41]" />
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-600">Loading Privacy Shields...</p>
        </div>
      }>
        <PrivacyPolicy onBack={() => {
          window.history.pushState({}, '', '/');
          setCurrentPath('/');
        }} />
      </React.Suspense>
    );
  }

  return (
    <AuthGate>
      <div className="no-print-during-report">
        <Layout 
          activeTab={activeModule} 
          onTabChange={setActiveModule}
          aiPanel={aiPanelContent}
          onClearCache={handleClearCache}
          isComparing={isComparingActive}
        >
          <React.Suspense fallback={
            <div className="flex flex-col items-center justify-center min-h-[80vh] opacity-20 animate-pulse">
              <Loader2 className="w-12 h-12 mb-4 animate-spin" />
              <p className="text-[10px] font-bold uppercase tracking-[0.2em]">Matrix Initializing...</p>
            </div>
          }>
            <ModuleErrorBoundary 
              moduleName={activeModule} 
              onReset={() => setActiveModule('dashboard')}
            >
              {renderActiveModule()}
            </ModuleErrorBoundary>
          </React.Suspense>
        </Layout>
      </div>

      <div className="print-only-report-container">
        {renderPrintableReport()}
      </div>

      <CommandPalette 
        isOpen={isCommandPaletteOpen} 
        onClose={() => setIsCommandPaletteOpen(false)} 
        onNavigate={setActiveModule} 
      />

      <ToastContainer />
    </AuthGate>
  );
}
