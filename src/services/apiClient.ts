// ============================================================
// src/services/apiClient.ts
// API Client for Econometrics Lab
// ============================================================

import { getAccessToken } from './authService';

export const API_BASE_URL = import.meta.env.VITE_API_URL ?? "";

// Helper to get headers with the Supabase access token for security verification
export async function getAuthHeaders(): Promise<HeadersInit> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  try {
    const token = await getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  } catch (err) {
    console.error('[API Client] Error retrieving Supabase access token:', err);
  }

  return headers;
}

async function getHeaders(): Promise<HeadersInit> {
  return getAuthHeaders();
}

// Generic API caller routing through Node Express
export async function callBackendAPI(endpoint: string, payload: object): Promise<any> {
  const url = `${API_BASE_URL}${endpoint}`;
  try {
    const headers = await getHeaders();
    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(errorData.error || errorData.detail || `API Error: ${response.status}`);
    }

    return await response.json();
  } catch (err: any) {
    console.error(`[API Client] callBackendAPI failed for ${endpoint}:`, err);
    throw err;
  }
}

// Health check
export async function checkBackendHealth(): Promise<boolean> {
  if (import.meta.env.DEV && !import.meta.env.VITE_API_URL) {
    console.warn(
      '[apiClient] VITE_API_URL is not set. ' +
      'If running Vite and Express on separate ports, ' + 
      'add VITE_API_URL=http://localhost:3000 to your .env.local file.'
    );
  }
  try {
    const res = await fetch(`${API_BASE_URL}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

// OLS Regression
export async function runOLSApi(params: {
  data: any[];
  yVar: string;
  xVars: string[];
  includeIntercept?: boolean;
  robust?: boolean;
  clusterVar?: string;
  bootstrap?: number;
}): Promise<any> {
  return callBackendAPI('/api/estimate/ols', params);
}

// Panel Data (Fixed/Random Effects)
export async function runPanelApi(params: {
  data: any[];
  yVar: string;
  xVars: string[];
  entityId: string;
  timeVar: string;
  effectsType?: 'fixed' | 'random';
}): Promise<any> {
  const endpoint = params.effectsType === 'random' ? '/api/estimate/re' : '/api/estimate/fe';
  return callBackendAPI(endpoint, params);
}

// ARIMA / Time Series
export async function runARIMAApi(params: {
  series: number[];
  p: number;
  d: number;
  q: number;
  horizon: number;
}): Promise<any> {
  return callBackendAPI('/api/estimate/arima', params);
}

// Cox Proportional Hazards (Survival Analysis)
export async function runCoxPHApi(params: {
  data: any[];
  durationVar: string;
  eventVar: string;
  covariates: string[];
}): Promise<any> {
  return callBackendAPI('/api/estimate/cox-ph', params);
}

// Quantile Regression
export async function runQuantileApi(params: {
  data: any[];
  yVar: string;
  xVars: string[];
  quantile?: number;
  includeIntercept?: boolean;
}): Promise<any> {
  return callBackendAPI('/api/estimate/quantile', params);
}

// Python Backend GMM (Arellano-Bond)
export async function runGMM(payload: {
  data: number[][];
  entityVar: string;
  timeVar: string;
  depVar: string;
  instruments: string[];
  columnNames?: string[];
  // 'difference' (Arellano-Bond 1991, default) or 'system' (Blundell-Bond 1998).
  gmmType?: 'difference' | 'system';
}): Promise<any> {
  return callBackendAPI('/api/python/gmm', payload);
}

// Python Backend Johansen Cointegration
export async function runCointegration(payload: {
  series: number[][];
  seriesNames: string[];
}): Promise<any> {
  return callBackendAPI('/api/python/cointegration', payload);
}

// Python Backend Johansen Cointegration and VECM
export async function runJohansen(payload: {
  data: number[][];
  variable_names: string[];
  det_order: number;
  k_ar_diff: number;
}): Promise<any> {
  return callBackendAPI('/api/python/johansen', payload);
}

// Python Backend Cox Proportional Hazards
export async function runCoxPH(payload: {
  time: number[];
  event: number[];
  covariates: number[][];
  covarNames: string[];
}): Promise<any> {
  return callBackendAPI('/api/python/cox', payload);
}

// Research-grade routing for methods the browser engine only approximates.
// GARCH via `arch`, unit-root (ADF/KPSS/PP) via statsmodels + arch, RDD via `rdrobust`.
export async function runGARCHPy(payload: {
  series: number[];
  p?: number;
  q?: number;
}): Promise<any> {
  return callBackendAPI('/api/python/garch', payload);
}

export async function runUnitRoot(payload: {
  series: number[];
  test: 'adf' | 'kpss' | 'pp';
  regression?: 'c' | 'ct' | 'n';
}): Promise<any> {
  return callBackendAPI('/api/python/unit-root', payload);
}

export async function runRDDPy(payload: {
  y: number[];
  x: number[];
  cutoff?: number;
}): Promise<any> {
  return callBackendAPI('/api/python/rdd', payload);
}

// Fuzzy RDD (imperfect compliance) via `rdrobust`'s `fuzzy=` argument.
export async function runFuzzyRDDPy(payload: {
  y: number[];
  x: number[];
  treatment: number[];
  cutoff?: number;
}): Promise<any> {
  return callBackendAPI('/api/python/rdd-fuzzy', payload);
}

// Research-grade power analysis: statsmodels (matches R pwr) for standard
// designs, closed-form / Monte-Carlo simulation for cluster-randomized designs.
// Synthetic Control Method (Abadie-Diamond-Hainmueller) via `pysyncon`,
// matching R's `Synth` package.
export async function runSyntheticControl(payload: {
  data: any[];
  unitVar: string;
  timeVar: string;
  outcomeVar: string;
  predictorVars?: string[];
  treatedUnit: string;
  controlUnits: string[];
  preperiodStart: number;
  preperiodEnd: number;
  postperiodEnd: number;
}): Promise<any> {
  return callBackendAPI('/api/python/synthetic-control', payload);
}

// Staggered-adoption Difference-in-Differences (Callaway-Sant'Anna) via
// `csdid`, matching R's `did` package (att_gt + aggte).
export async function runStaggeredDID(payload: {
  data: any[];
  idVar: string;
  timeVar: string;
  outcomeVar: string;
  groupVar: string;
  controlGroup?: 'nevertreated' | 'notyettreated';
}): Promise<any> {
  return callBackendAPI('/api/python/staggered-did', payload);
}

export async function runPower(payload: {
  design: 'ttest' | 'cluster-main' | 'cluster-interaction';
  solveFor?: 'n' | 'power' | 'mdes';
  alpha?: number;
  power?: number;
  effectSize?: number;
  nPerGroup?: number;
  ratio?: number;
  nClusters?: number;
  clusterSize?: number;
  icc?: number;
  rSquared?: number;
  pDisadv?: number;
  effectMain?: number;
  effectInteraction?: number;
  nSims?: number;
  seed?: number;
}): Promise<any> {
  return callBackendAPI('/api/python/power', payload);
}

// Python Backend Full ARIMA (Kalman-filter MLE via statsmodels, with MA terms
// and real forecast standard errors -- the benchmark-grade path; the browser
// engine is a lightweight CSS-based preview, see AdvancedTimeSeriesLab).
export async function runFullARIMA(payload: {
  series: number[];
  p: number;
  d: number;
  q: number;
  horizon?: number;
}): Promise<any> {
  return callBackendAPI('/api/python/arima-full', payload);
}

// Python Backend Average Marginal Effects (AME) for Logit/Probit
export async function runMarginalEffects(payload: {
  model_type: 'logit' | 'probit';
  y: number[];
  X: number[][];
  variable_names: string[];
}): Promise<any> {
  return callBackendAPI('/api/python/marginal-effects', payload);
}

// Python Backend Heckman Two-Step Selection Model
export async function runHeckman(payload: {
  outcome_y: (number | null)[];
  outcome_X: number[][];
  selection_z: number[][];
  outcome_names: string[];
  selection_names: string[];
  n_obs_total: number;
}): Promise<any> {
  return callBackendAPI('/api/python/heckman', payload);
}

// Python Backend Survey-Weighted OLS with Taylor-linearized standard errors
export async function runSurveyOLS(payload: {
  y: number[];
  X: number[][];
  weights: number[];
  cluster_var: any[];
  strata_var: any[];
  variable_names: string[];
  fpc?: number | null;
}): Promise<any> {
  return callBackendAPI('/api/python/survey-ols', payload);
}

// Upload and Parse SPSS .sav Files
export async function uploadSavFile(file: File): Promise<any> {
  const formData = new FormData();
  formData.append('file', file);
  const headers = await getAuthHeaders();
  const cleanedHeaders: any = { ...headers };
  delete cleanedHeaders['Content-Type'];
  
  const response = await fetch('/api/parse-sav', {
    method: 'POST',
    headers: cleanedHeaders,
    body: formData
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to upload and parse SAV file.');
  }
  return response.json();
}
