import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Dataset, ModelHistoryItem, ResearchQuestion, ModuleTab, ManuscriptSections } from '../types';
import { persistenceService } from '../services/persistenceService';
import { subscribeToAuth } from '../services/authService';
import { User } from 'firebase/auth';
import { debounce } from 'lodash';
import { getSampleData } from '../services/dataService';

export interface RobustnessItem {
  id: string;
  name: string;
  results: any;
  specification: string;
}

export interface TeachingState {
  isActive: boolean;
  templateId: string | null;
  completedSteps: string[];
}

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

export type UIDensity = 'dense' | 'spacious';

export interface ReportState {
  selectedModelId: string | null;
  packType: 'standard' | 'professor';
  sections: ManuscriptSections;
}

const AUTOSAVE_KEY = 'economics_learning_lab_autosave';

const loadAutosave = () => {
  try {
    const saved = localStorage.getItem(AUTOSAVE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error('Failed to parse autosave:', e);
  }
  return {};
};

const saveAutosaveField = (field: string, value: any) => {
  try {
    const saved = loadAutosave();
    saved[field] = value;
    localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(saved));
  } catch (e) {
    console.error(`Failed to save field ${field} to autosave:`, e);
  }
};

export interface ToastItem {
  id: string;
  type: 'success' | 'error' | 'info';
  message: string;
  description?: string;
}

export interface Message {
  role: 'user' | 'professor';
  text: string;
}

export interface TeacherModeStateData {
  questionPrompt: string;
  studentAnswer: string;
  level: string;
  output: string | null;
}

export interface AcademicLabStateData {
  topicOrUnit: string;
  mode: string;
  output: string | null;
}

// Singleton state to share across all components using useStore
interface GlobalState {
  appMode: 'research' | 'learning';
  toasts: ToastItem[];
  currentDataset: Dataset | null;
  history: ModelHistoryItem[];
  activeModule: ModuleTab;
  researchQuestion: ResearchQuestion;
  robustnessItems: RobustnessItem[];
  teachingState: TeachingState;
  selectedConceptId: string | null;
  reportDraft: ReportState;
  olsConfiguration: {
    yVar: string;
    xVars: string[];
    robustSE: boolean;
    yIsLogged: boolean;
  };
  professorDeskMessages: Message[];
  academicLabState: AcademicLabStateData;
  teacherModeState: TeacherModeStateData;
  entityId: string;
  timeId: string;
  dependentVar: string;
  regressors: string[];
  modelType: string;
  user: User | null;
  saveStatus: SaveStatus;
  isHydrated: boolean;
  isAiOpen: boolean;
  aiEnabled: boolean;
  currentPlan: 'Scholar Free' | 'Researcher Pro' | 'Institutional';
  uiDensity: UIDensity;
  savedDatasets: Dataset[];
}

const initialAiEnabled = (() => {
  try {
    const saved = localStorage.getItem('privacy_settings');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.aiEnabled !== undefined) {
        return parsed.aiEnabled;
      }
    }
  } catch (e) {
    console.error('Failed to read privacy_settings:', e);
  }
  return true;
})();

const savedState = loadAutosave();

const initialAppMode = (() => {
  try {
    const saved = localStorage.getItem('economics_app_mode');
    if (saved === 'research' || saved === 'learning') {
      return saved as 'research' | 'learning';
    }
  } catch (e) {
    console.error('Failed to read appMode from localStorage:', e);
  }
  return 'learning';
})();

const loadSavedDatasets = (): Dataset[] => {
  try {
    const saved = localStorage.getItem('economics_saved_datasets');
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Failed to parse saved datasets:', e);
  }
  return [];
};

let state: GlobalState = {
  appMode: initialAppMode,
  currentDataset: null,
  history: [],
  activeModule: savedState.activeModule || 'dashboard',
  researchQuestion: {
    outcome: '',
    explanatory: '',
    hypothesis: '',
    goal: 'explanation',
    structure: 'cross-section'
  },
  robustnessItems: [],
  teachingState: {
    isActive: false,
    templateId: null,
    completedSteps: []
  },
  selectedConceptId: null,
  reportDraft: {
    selectedModelId: null,
    packType: 'standard',
    sections: {
      title: '',
      researchQuestion: '',
      abstract: '',
      data: '',
      methodology: '',
      results: '',
      diagnostics: '',
      implications: ''
    }
  },
  olsConfiguration: {
    yVar: '',
    xVars: [],
    robustSE: false,
    yIsLogged: false,
  },
  professorDeskMessages: savedState.professorDeskMessages || [
    {
      role: 'professor',
      text: "Greetings. I am your academic advisor in applied, theoretical, and empirical economics. I specialize across all 10 divisions of the MA, UGC-NET, and CUET PG curriculum.\n\nHow can I help you think like an applied economist today? Please present any conceptual query, specific proof, or policy analysis."
    }
  ],
  academicLabState: savedState.academicLabState || {
    topicOrUnit: '',
    mode: 'Topic Overview',
    output: null
  },
  teacherModeState: savedState.teacherModeState || {
    questionPrompt: '',
    studentAnswer: '',
    level: 'MA / UGC-NET',
    output: null
  },
  entityId: savedState.entityId || '',
  timeId: savedState.timeId || '',
  dependentVar: savedState.dependentVar || '',
  regressors: savedState.regressors || [],
  modelType: savedState.modelType || 'fe',
  user: null,
  saveStatus: 'idle',
  isHydrated: false,
  isAiOpen: false,
  aiEnabled: initialAiEnabled,
  currentPlan: 'Scholar Free',
  uiDensity: savedState.uiDensity || 'spacious',
  toasts: [],
  savedDatasets: loadSavedDatasets(),
};

const listeners = new Set<(s: GlobalState) => void>();

function notify() {
  const newState = { ...state };
  listeners.forEach(l => l(newState));
}

// Persist only what's needed
const debouncedSave = debounce(async () => {
  if (!state.user) return;
  state.saveStatus = 'saving';
  notify();

  try {
    await persistenceService.saveWorkspace({
      activeModule: state.activeModule,
      researchQuestion: state.researchQuestion,
      teachingState: state.teachingState,
      currentDataset: state.currentDataset,
      selectedConceptId: state.selectedConceptId,
    });

    await persistenceService.saveReportDraft(state.reportDraft);

    // Save individual model runs and robustness entries as they are added (handled in actions)
    
    state.saveStatus = 'saved';
  } catch (error) {
    console.error('Autosave failed:', error);
    state.saveStatus = 'error';
  }
  notify();
  
  // Back to idle after some time
  setTimeout(() => {
    if (state.saveStatus === 'saved') {
      state.saveStatus = 'idle';
      notify();
    }
  }, 2000);
}, 2000);

// onAuthStateChanged can fire more than once per session (token refresh,
// network reconnect, etc.), and each firing used to re-run the full
// workspace hydration below -- including overwriting `activeModule` with
// whatever was last saved. Worse, even a single hydration call is slow
// (several sequential awaits against IndexedDB and Firestore, the latter
// observed timing out and retrying against an offline Firestore client): if
// the user clicks a nav item while that first call is still in flight, it
// resolves afterward and clobbers the click regardless of how many times
// the callback itself has fired. So two guards are needed together:
// `hasHydratedWorkspaceOnce` skips re-running hydration on later auth
// events, and `userHasNavigated` (set by setActiveModule) stops the
// in-flight hydration from overwriting activeModule once the user has
// interacted, no matter when the pending reads resolve.
let hasHydratedWorkspaceOnce = false;
let userHasNavigated = false;

// Initialize Auth
subscribeToAuth(async (user) => {
  state.user = user;

  if (hasHydratedWorkspaceOnce) {
    notify();
    return;
  }
  hasHydratedWorkspaceOnce = true;

  // Load session from IndexedDB first as a fallback/offline-first experience
  try {
    const cachedActiveModule = await persistenceService.getFromIndexedDB('activeModule');
    const cachedResearchQuestion = await persistenceService.getFromIndexedDB('researchQuestion');
    if (cachedActiveModule && !userHasNavigated) {
      state.activeModule = cachedActiveModule;
    }
    if (cachedResearchQuestion) {
      state.researchQuestion = cachedResearchQuestion;
    }
  } catch (err) {
    console.warn('Failed to load initial session from IndexedDB:', err);
  }

  if (user) {
    // Hydrate
    try {
      const workspace = await persistenceService.loadWorkspace();
      if (workspace) {
        // Hydrate sample data if name is known and data is missing
        if (workspace.currentDataset && (!workspace.currentDataset.data || workspace.currentDataset.data.length === 0)) {
          const sampleData = getSampleData(workspace.currentDataset.name);
          if (sampleData) {
            workspace.currentDataset.data = sampleData;
          }
        }
        const saved = loadAutosave();
        state = {
          ...state,
          ...workspace,
          entityId: saved.entityId !== undefined ? saved.entityId : (workspace.entityId || state.entityId),
          timeId: saved.timeId !== undefined ? saved.timeId : (workspace.timeId || state.timeId),
          dependentVar: saved.dependentVar !== undefined ? saved.dependentVar : (workspace.dependentVar || state.dependentVar),
          regressors: saved.regressors !== undefined ? saved.regressors : (workspace.regressors || state.regressors),
          modelType: saved.modelType !== undefined ? saved.modelType : (workspace.modelType || state.modelType),
          activeModule: userHasNavigated ? state.activeModule : (saved.activeModule || workspace.activeModule || state.activeModule),
          uiDensity: saved.uiDensity || state.uiDensity,
          isHydrated: true,
        };
      } else {
        const saved = loadAutosave();
        state = {
          ...state,
          entityId: saved.entityId !== undefined ? saved.entityId : state.entityId,
          timeId: saved.timeId !== undefined ? saved.timeId : state.timeId,
          dependentVar: saved.dependentVar !== undefined ? saved.dependentVar : state.dependentVar,
          regressors: saved.regressors !== undefined ? saved.regressors : state.regressors,
          modelType: saved.modelType !== undefined ? saved.modelType : state.modelType,
          activeModule: userHasNavigated ? state.activeModule : (saved.activeModule || state.activeModule),
          uiDensity: saved.uiDensity || state.uiDensity,
          isHydrated: true,
        };
      }
      
      const history = await persistenceService.loadModelHistory();
      state.history = history || [];

      const robustness = await persistenceService.loadRobustnessItems();
      state.robustnessItems = robustness || [];

      const reports = await persistenceService.loadReportDrafts();
      if (reports && reports.length > 0) {
        const loadedDraft = reports[0] as any;
        state.reportDraft = {
          ...state.reportDraft,
          ...loadedDraft,
          sections: {
            ...state.reportDraft.sections,
            ...loadedDraft.sections
          }
        };
      }
      
    } catch (error) {
      console.error('Hydration failed:', error);
    } finally {
      state.isHydrated = true;
      notify();
    }
  } else {
    state.isHydrated = true; // No user but we "hydrated" (by clearing)
    notify();
  }
});

export function useStore() {
  const [localState, setLocalState] = useState(state);

  useEffect(() => {
    listeners.add(setLocalState);
    return () => { listeners.delete(setLocalState); };
  }, []);

  const setters = useMemo(() => ({
    setCurrentDataset: (dataset: Dataset | null) => {
      if (JSON.stringify(state.currentDataset) === JSON.stringify(dataset)) return;
      if (dataset) {
        dataset.data = dataset.data || [];
        dataset.variables = dataset.variables || [];
      }
      state.currentDataset = dataset;
      state.dependentVar = '';
      state.regressors = [];
      state.entityId = '';
      state.timeId = '';
      saveAutosaveField('dependentVar', '');
      saveAutosaveField('regressors', []);
      saveAutosaveField('entityId', '');
      saveAutosaveField('timeId', '');
      notify();
      debouncedSave();
    },
    saveDataset: (dataset: Dataset) => {
      const existing = state.savedDatasets.findIndex(d => d.name === dataset.name);
      if (existing >= 0) {
        state.savedDatasets[existing] = dataset;
      } else {
        state.savedDatasets = [...state.savedDatasets, dataset];
      }
      localStorage.setItem('economics_saved_datasets', JSON.stringify(state.savedDatasets));
      notify();
    },
    removeSavedDataset: (name: string) => {
      state.savedDatasets = state.savedDatasets.filter(d => d.name !== name);
      localStorage.setItem('economics_saved_datasets', JSON.stringify(state.savedDatasets));
      notify();
    },
    setHistory: (history: ModelHistoryItem[]) => {
      if (state.history === history) return;
      state.history = history;
      notify();
    },
    setActiveModule: (tab: ModuleTab) => {
      if (state.activeModule === tab) return;
      userHasNavigated = true;
      state.activeModule = tab;
      notify();
      debouncedSave();
      saveAutosaveField('activeModule', tab);
      persistenceService.saveToIndexedDB('activeModule', tab).catch(console.error);
    },
    setEntityId: (id: string) => {
      if (state.entityId === id) return;
      state.entityId = id;
      notify();
      saveAutosaveField('entityId', id);
    },
    setTimeId: (id: string) => {
      if (state.timeId === id) return;
      state.timeId = id;
      notify();
      saveAutosaveField('timeId', id);
    },
    setDependentVar: (v: string) => {
      if (state.dependentVar === v) return;
      state.dependentVar = v;
      notify();
      saveAutosaveField('dependentVar', v);

      if (v && state.regressors.includes(v)) {
        state.regressors = state.regressors.filter(r => r !== v);
        notify();
        saveAutosaveField('regressors', state.regressors);

        // Add toast
        const id = Math.random().toString(36).substring(2, 11);
        state.toasts = [...state.toasts, {
          id,
          type: 'info',
          message: `${v} removed from regressors (now dependent)`,
          description: `Hygiene check: A variable cannot be both dependent and independent simultaneously.`
        }];
        notify();
        setTimeout(() => {
          state.toasts = state.toasts.filter(t => t.id !== id);
          notify();
        }, 5000);
      }
    },
    setRegressors: (vars: string[]) => {
      if (JSON.stringify(state.regressors) === JSON.stringify(vars)) return;
      state.regressors = vars;
      notify();
      saveAutosaveField('regressors', vars);
    },
    setModelType: (type: string) => {
      if (state.modelType === type) return;
      state.modelType = type;
      notify();
      saveAutosaveField('modelType', type);
    },
    setResearchQuestion: (rq: ResearchQuestion | string) => {
      const newRq = typeof rq === 'string' 
        ? { ...state.researchQuestion, hypothesis: rq } 
        : rq;
      
      if (JSON.stringify(state.researchQuestion) === JSON.stringify(newRq)) return;
      state.researchQuestion = newRq;
      notify();
      debouncedSave();
      persistenceService.saveToIndexedDB('researchQuestion', newRq).catch(console.error);
    },
    setTeachingState: (ts: TeachingState) => {
      if (JSON.stringify(state.teachingState) === JSON.stringify(ts)) return;
      state.teachingState = ts;
      notify();
      debouncedSave();
    },
    setSelectedConceptId: (id: string | null) => {
      if (state.selectedConceptId === id) return;
      state.selectedConceptId = id;
      notify();
      debouncedSave();
    },
    addToHistory: async (item: ModelHistoryItem) => {
      state.history = [item, ...state.history];
      notify();
      await persistenceService.saveModelRun(item);
    },
    updateHistoryNote: async (id: string, notes: string) => {
      const item = state.history.find(h => h.id === id);
      if (item?.notes === notes) return;
      state.history = state.history.map(h => h.id === id ? { ...h, notes } : h);
      notify();
      await persistenceService.updateModelRunNote(id, notes);
    },
    addToRobustness: async (item: RobustnessItem) => {
      state.robustnessItems = [...state.robustnessItems, item];
      notify();
      await persistenceService.saveRobustnessEntry(item);
    },
    clearRobustness: () => {
      if (state.robustnessItems.length === 0) return;
      state.robustnessItems = [];
      notify();
    },
    updateTeachingStep: (step: string) => {
      if (state.teachingState.completedSteps.includes(step)) return;
      const steps = [...state.teachingState.completedSteps, step];
      state.teachingState = { ...state.teachingState, completedSteps: steps };
      notify();
      debouncedSave();
    },
    setSaveStatus: (status: SaveStatus) => {
      if (state.saveStatus === status) return;
      state.saveStatus = status;
      notify();
    },
    setReportDraft: (draft: Partial<ReportState>) => {
      // Shallow check for changes
      const hasChanged = Object.entries(draft).some(([key, value]) => {
        return JSON.stringify(state.reportDraft[key as keyof ReportState]) !== JSON.stringify(value);
      });
      if (!hasChanged) return;

      state.reportDraft = { ...state.reportDraft, ...draft };
      notify();
      debouncedSave();
    },
    setIsAiOpen: (open: boolean) => {
      if (state.isAiOpen === open) return;
      state.isAiOpen = open;
      notify();
    },
    setAIEnabled: (enabled: boolean) => {
      if (state.aiEnabled === enabled) return;
      state.aiEnabled = enabled;
      notify();
    },
    setOlsConfiguration: (config: Partial<GlobalState['olsConfiguration']>) => {
      const hasChanged = Object.entries(config).some(([key, value]) => {
        return JSON.stringify(state.olsConfiguration[key as keyof GlobalState['olsConfiguration']]) !== JSON.stringify(value);
      });
      if (!hasChanged) return;

      state.olsConfiguration = { ...state.olsConfiguration, ...config };
      notify();
      debouncedSave();
    },
    setCurrentPlan: (plan: 'Scholar Free' | 'Researcher Pro' | 'Institutional') => {
      if (state.currentPlan === plan) return;
      state.currentPlan = plan;
      notify();
      debouncedSave();
    },
    setUiDensity: (density: UIDensity) => {
      if (state.uiDensity === density) return;
      state.uiDensity = density;
      notify();
      saveAutosaveField('uiDensity', density);
    },
    addToast: (type: 'success' | 'error' | 'info', message: string, description?: string) => {
      const id = Math.random().toString(36).substring(2, 11);
      state.toasts = [...state.toasts, { id, type, message, description }];
      notify();
      setTimeout(() => {
        state.toasts = state.toasts.filter(t => t.id !== id);
        notify();
      }, 5000);
    },
    removeToast: (id: string) => {
      state.toasts = state.toasts.filter(t => t.id !== id);
      notify();
    },
    setMockUser: (user: User | null) => {
      state.user = user;
      notify();
    },
    setAppMode: (mode: 'research' | 'learning') => {
      if (state.appMode === mode) return;
      state.appMode = mode;
      localStorage.setItem('economics_app_mode', mode);
      notify();
    },
    setProfessorDeskMessages: (messages: Message[]) => {
      state.professorDeskMessages = messages;
      notify();
      saveAutosaveField('professorDeskMessages', messages);
    },
    setAcademicLabState: (labState: Partial<AcademicLabStateData>) => {
      state.academicLabState = { ...state.academicLabState, ...labState };
      notify();
      saveAutosaveField('academicLabState', state.academicLabState);
    },
    setTeacherModeState: (teacherState: Partial<TeacherModeStateData>) => {
      state.teacherModeState = { ...state.teacherModeState, ...teacherState };
      notify();
      saveAutosaveField('teacherModeState', state.teacherModeState);
    }
  }), []);

  return useMemo(() => ({
    ...localState,
    ...setters
  }), [localState, setters]);
}
