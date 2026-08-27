export type DataType = 'numeric' | 'categorical' | 'date' | 'unknown';

export interface Variable {
  name: string;
  type: DataType;
  label: string;
  description?: string;
  isTransformed?: boolean;
  isAmbiguous?: boolean;
  isCleaned?: boolean;
}

export interface Dataset {
  name: string;
  data: any[];
  variables: Variable[];
  rowCount: number;
  colCount: number;
  structure: 'cross-section' | 'panel' | 'time-series';
  headers?: string[];
  originalData?: any[];
}

export interface PanelConfig {
  entityId: string;
  timeVar: string;
}

export interface TimeSeriesConfig {
  dateVar: string;
  targetVar: string;
}

export interface Coefficient {
  variable: string;
  estimate: number;
  stdError: number;
  tStat: number;
  pValue: number;
  confLow: number;
  confHigh: number;
  ciLower?: string;
  ciUpper?: string;
  stars?: string;
  vif?: number;
  wildBootstrapPValue?: number;
  wildBootstrapConfLow?: number;
  wildBootstrapConfHigh?: number;
}

export interface RegressionResult {
  coefficients: Coefficient[];
  rSquared: number;
  adjRSquared: number;
  fStat?: number;
  fPValue?: number;
  logLikelihood?: number;
  n: number;
  df: number;
  /**
   * Number of clusters, present only when cluster-robust standard errors
   * were used. Undefined otherwise.
   */
  nClusters?: number;
  /**
   * Degrees of freedom of the reference t distribution used for p-values,
   * critical values and confidence intervals. Equals `nClusters - 1` under
   * clustering and the residual degrees of freedom otherwise. Reported so
   * that the inferential convention is visible in the output rather than
   * only in the source.
   */
  dfInference?: number;
  rmse: number;
  rss?: number;
  aic?: number;
  bic?: number;
  isRobust?: boolean;
  seType?: string;
  robustType?: string;
  vifs?: { [key: string]: number };
  residuals?: number[];
  fitted?: number[];
  yActual?: number[];
  durbinWatson?: number;
  jarqueBeraStat?: number;
  jarqueBeraPValue?: number;
  breuschPaganStat?: number;
  breuschPaganPValue?: number;
  droppedVariables?: string[];
  varCov?: number[][];
  hausman?: {
    hStat: number;
    df: number;
    pValue: number;
    recommendation: string;
  };
  wildBootstrapResults?: {
    wild_bootstrap_pvalues: number[];
    wild_bootstrap_ci_low: number[];
    wild_bootstrap_ci_high: number[];
    n_clusters: number;
    B: number;
  };
}

export interface ARIMAResult {
  order: [number, number, number];
  seasonalOrder?: [number, number, number, number];
  coefficients: Record<string, number>;
  aic: number;
  bic: number;
  rmse?: number;
  fitted: number[];
  forecast: number[];
  forecastCI: [number, number][];
  residuals: number[];
}

export interface ResearchQuestion {
  outcome: string;
  explanatory: string;
  hypothesis: string;
  goal: 'explanation' | 'causal' | 'forecasting';
  structure: 'cross-section' | 'panel' | 'time-series';
}

export interface ManuscriptSections {
  title: string;
  researchQuestion: string;
  abstract: string;
  data: string;
  methodology: string;
  results: string;
  diagnostics: string;
  implications: string;
}
export interface ModelHistoryItem {
  id: string;
  timestamp: string;
  module: 'OLS' | 'FE' | 'ARIMA' | 'CAUSAL' | 'LIMITED' | 'STAT-TESTS' | 'GLM' | 'ADV-TIMESERIES' | 'FACTOR' | 'SURVIVAL' | 'TREATMENT';
  specification: string;
  results: any;
  interpretation?: string | null;
  notes?: string;
  filePath?: string;
}


export type ModuleTab = 
  | 'dashboard'
  | 'professor-desk'
  | 'lab-partner'
  | 'academic-lab'
  | 'stats-interpreter'
  | 'teacher-mode'
  | 'templates'
  | 'data' 
  | 'ols' 
  | 'fe' 
  | 'arima' 
  | 'causal' 
  | 'limited' 
  | 'regularization'
  | 'diagnostics' 
  | 'learn' 
  | 'quiz' 
  | 'robustness' 
  | 'exports'
  | 'about-research'
  | 'stat-tests'
  | 'glm'
  | 'heckman'
  | 'adv-timeseries'
  | 'factor'
  | 'survival'
  | 'treatment'
  | 'power-analysis'
  | 'batch-processing'
  | 'data-upload'
  | 'descriptive-stats'
  | 'variable-view'
  | 'session-report'
  | 'workflow-guide'
  | 'accuracy';

export interface AnalysisResult {
  type: string;
  specification?: string;
  results: any;
  timestamp?: string;
}

