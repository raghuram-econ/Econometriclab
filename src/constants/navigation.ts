export const NAV_TABS = {
  DASHBOARD: 'dashboard',
  PROFESSOR_DESK: 'professor-desk',
  LAB_PARTNER: 'lab-partner',
  STATS_INTERPRETER: 'stats-interpreter',
  TEACHER_MODE: 'teacher-mode',
  TEMPLATES: 'templates',
  DATA: 'data',
  OLS: 'ols',
  FE: 'fe',
  ARIMA: 'arima',
  CAUSAL: 'causal',
  LIMITED: 'limited',
  REGULARIZATION: 'regularization',
  DIAGNOSTICS: 'diagnostics',
  LEARN: 'learn',
  QUIZ: 'quiz',
  ROBUSTNESS: 'robustness',
  EXPORTS: 'exports',
  ABOUT_RESEARCH: 'about-research',
  STAT_TESTS: 'stat-tests',
  GLM: 'glm',
  HECKMAN: 'heckman',
  ADV_TIMESERIES: 'adv-timeseries',
  FACTOR: 'factor',
  SURVIVAL: 'survival',
  TREATMENT: 'treatment',
  POWER_ANALYSIS: 'power-analysis',
  BATCH_PROCESSING: 'batch-processing',
  DATA_UPLOAD: 'data-upload',
  VARIABLE_VIEW: 'variable-view',
  DESCRIPTIVE_STATS: 'descriptive-stats',
  SESSION_REPORT: 'session-report',
  ACCURACY: 'accuracy',
  WORKFLOW_GUIDE: 'workflow-guide',
} as const;

export const nav = [
  { id: 'data-upload', label: 'Data Upload', icon: 'Upload', category: 'data' }
];

export type NavTabId = typeof NAV_TABS[keyof typeof NAV_TABS];
