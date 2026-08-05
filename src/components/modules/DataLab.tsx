import React, { useState } from 'react';
// Paper is removed for dynamic import
import { Upload, Database, CheckCircle2, AlertCircle, Trash2, LineChart, Table, TrendingUp, GraduationCap, Zap, Sparkles, FileDown, Eye } from 'lucide-react';
import { Dataset, Variable, DataType, ModuleTab } from '../../types';
import { cn, exportToCSV } from '../../lib/utils';
import { MistakeDetector, Mistake } from '../shared/MistakeDetector';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { ModelChoiceAssistant } from '../shared/ModelChoiceAssistant';
import { useStore } from '../../store/useStore';
import { useNavigation } from '../../hooks/useNavigation';

import { ResearchQuestionBuilder } from './ResearchQuestionBuilder';
import DataUploadLab from './DataUploadLab';
import { DataPreviewMatrix } from '../shared/DataPreviewMatrix';
import { RawDataViewerModal } from '../shared/RawDataViewerModal';
import { imputeMean, imputeMedian, imputeRegression } from '../../lib/econometrics/imputation';
import { cleanNumeric, normalizeHeader, inferVariableType } from '../../lib/variableTypeDetection';
import { applyVariableTransform } from '../../lib/variableTransforms';

import { ActionCard } from '../shared/ActionCard';
import { DataUploadPrivacyBanner } from '../privacy/PrivacyComponents';
import PowerAnalysisLab from './PowerAnalysisLab';
import BatchProcessingLab from './BatchProcessingLab';

function makeSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rndSample = makeSeededRandom(2024);

interface DataLabProps {
  onDatasetChange: (dataset: Dataset | null) => void;
  currentDataset: Dataset | null;
  onRunComplete: (results: any, spec: string) => void;
}

export default function DataLab({ onDatasetChange, currentDataset, onRunComplete }: DataLabProps) {
  const { researchQuestion, addToast } = useStore();
  const { navigateTo } = useNavigation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [imputationConfig, setImputationConfig] = useState<{
    variable: string;
    method: 'mean' | 'median' | 'regression';
    predictor: string;
  }>({
    variable: '',
    method: 'mean',
    predictor: ''
  });

  const [handleMissingMode, setHandleMissingMode] = useState<'do-nothing' | 'drop-rows' | 'impute-mean' | 'impute-median'>('do-nothing');
  const [handleOutliersMode, setHandleOutliersMode] = useState<'do-nothing' | 'drop-outliers' | 'winsorize'>('do-nothing');
  const [handleConstantsMode, setHandleConstantsMode] = useState<'do-nothing' | 'drop-constants'>('do-nothing');
  const [cleaningSummary, setCleaningSummary] = useState<string | null>(null);

  React.useEffect(() => {
    setCleaningSummary(null);
    setHandleMissingMode('do-nothing');
    setHandleOutliersMode('do-nothing');
    setHandleConstantsMode('do-nothing');
  }, [currentDataset?.name]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    
    // Dynamic import for PapaParse to reduce initial bundle
    import('papaparse').then((Papa) => {
      Papa.default.parse(file, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
          processData(file.name, results.data);
          setLoading(false);
        },
        error: (err: any) => {
          setError(err.message);
          setLoading(false);
        }
      });
    }).catch(err => {
      setError("Failed to initialize parsing engine.");
      setLoading(false);
    });
  };

  const getMistakes = (): Mistake[] => {
    if (!currentDataset) return [];
    
    const issues: Mistake[] = [];
    
    if (currentDataset.rowCount < 20) {
      issues.push({
        id: 'low-n',
        level: 'warning',
        problem: 'Small Sample Size Detected',
        whyItMatters: 'With fewer than 20 observations, the Central Limit Theorem (CLT) may not apply, making your p-values and confidence intervals unreliable.',
        howToFix: 'Upload a larger dataset with more records or use sample data.',
        nextStep: 'Seek a more robust data source.'
      });
    }
    
    // Check for constants
    (currentDataset.variables || []).forEach(v => {
      if (v.type === 'numeric') {
        const data = currentDataset.data || [];
        const values = data.map(d => d[v.name]).filter(val => val !== null && val !== undefined);
        const uniqueValues = new Set(values);
        if (uniqueValues.size === 1) {
          issues.push({
            id: `constant-${v.name}`,
            level: 'warning',
            problem: `Variable "${v.name}" has Zero Variance`,
            whyItMatters: 'Econometric models cannot estimate coefficients for variables that do not vary across observations.',
            howToFix: 'Check for data entry errors or constants in your CSV.',
            nextStep: 'Ensure predictors have variation.'
          });
        }
      }
    });

    return issues;
  };

  const loadSample = async (type: 'cross-section' | 'panel' | 'time-series' | 'master') => {
    setLoading(true);
    // Mock sample datasets
    let data : any[] = [];
    let name = "";
    
    if (type === 'master') {
      const { generateMasterDataset } = await import('../../lib/dataGenerators');
      name = "Master Econometrics Test Dataset";
      data = generateMasterDataset();
      processData(name, data, 'panel');
    } else if (type === 'cross-section') {
      name = "CPS 2024 Wages (Cross-Section)";
      data = Array.from({ length: 500 }, (_, i) => ({
        wage: 15 + rndSample() * 50 + (i % 2 === 0 ? 10 : 0),
        educ: 8 + Math.floor(rndSample() * 12),
        exper: Math.floor(rndSample() * 40),
        gender: i % 2 === 0 ? 'Female' : 'Male',
        married: rndSample() > 0.5 ? 1 : 0
      }));
      processData(name, data, type);
    } else if (type === 'panel') {
      name = "EU Growth 2010-2023 (Panel)";
      const countries = ['Germany', 'France', 'Italy', 'Spain', 'Poland'];
      data = [];
      countries.forEach(country => {
        for (let year = 2010; year <= 2023; year++) {
          data.push({
            country,
            year,
            gdp_growth: 1 + rndSample() * 3,
            inflation: 0.5 + rndSample() * 4,
            unemp: 3 + rndSample() * 8
          });
        }
      });
      processData(name, data, type);
    } else {
      name = "Global Temperature Index (Time-Series)";
      data = Array.from({length: 120}, (_, i) => ({
        date: new Date(2014, i, 1).toISOString().split('T')[0],
        temp: 0.5 + 0.01 * i + rndSample() * 0.2,
        co2: 400 + i * 0.1
      }));
      processData(name, data, type);
    }
    setLoading(false);
  };

  const handleImpute = () => {
    if (!currentDataset || !imputationConfig.variable) return;
    
    setLoading(true);
    let newData = [...currentDataset.data];
    const { variable, method, predictor } = imputationConfig;

    if (method === 'mean') {
      newData = imputeMean(newData, variable);
    } else if (method === 'median') {
      newData = imputeMedian(newData, variable);
    } else if (method === 'regression' && predictor) {
      newData = imputeRegression(newData, variable, predictor);
    }

    onDatasetChange({
      ...currentDataset,
      data: newData
    });
    
    setLoading(false);
    setError(null);
  };


  const processData = (name: string, data: any[], structurePreference?: string) => {
    if (!data || data.length === 0) {
      setError("Parsed dataset is empty");
      return;
    }

    const originalKeys = data.length > 0 ? Object.keys(data[0]) : [];
    const variables: Variable[] = originalKeys.map(originalKey => {
      const normalizedName = normalizeHeader(originalKey);
      const { type, isAmbiguous, isCleaned, description } = inferVariableType(data, originalKey);

      return {
        name: normalizedName || `var_${Math.random().toString(36).substr(2, 5)}`,
        label: originalKey,
        type,
        isAmbiguous,
        isCleaned,
        description
      };
    });

    // Clean data values and normalize keys for consistent econometric execution
    const cleanedData = data.map(row => {
      const newRow: any = {};
      variables.forEach(v => {
        const originalVal = row[v.label];
        if (v.type === 'numeric') {
          newRow[v.name] = cleanNumeric(originalVal);
        } else {
          newRow[v.name] = originalVal;
        }
      });
      return newRow;
    });

    onDatasetChange({
      name,
      data: cleanedData,
      variables,
      rowCount: cleanedData.length,
      colCount: variables.length,
      structure: (structurePreference as any) || 'cross-section'
    });
    setError(null);
  };

  const calculateSummaryStats = () => {
    if (!currentDataset) return null;
    const stats: Record<string, any> = {};
    (currentDataset.variables || []).filter(v => v.type === 'numeric').forEach(v => {
      const values = (currentDataset.data || []).map(r => parseFloat(r[v.name])).filter(n => !isNaN(n));
      const count = values.length;
      if (count === 0) {
        stats[v.name] = { mean: 0, std: 0, min: 0, max: 0, count: 0 };
        return;
      }
      const mean = values.reduce((a, b) => a + b, 0) / count;
      stats[v.name] = {
        mean,
        std: Math.sqrt(values.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / count),
        min: Math.min(...values),
        max: Math.max(...values),
        count
      };
    });
    return stats;
  };

  const calculateCorrelationMatrix = () => {
    if (!currentDataset) return null;
    const numericVars = (currentDataset.variables || []).filter(v => v.type === 'numeric').map(v => v.name);
    const matrix: any[] = [];
    
    (numericVars || []).forEach(v1 => {
      const row: any = { variable: v1 };
      (numericVars || []).forEach(v2 => {
        const x = (currentDataset.data || []).map(d => d[v1] || 0);
        const y = (currentDataset.data || []).map(d => d[v2] || 0);
        
        if (x.length === 0 || y.length === 0) {
          row[v2] = 1;
          return;
        }

        const meanX = x.reduce((a, b) => a + b, 0) / x.length;
        const meanY = y.reduce((a, b) => a + b, 0) / y.length;
        const num = x.map((xi, i) => (xi - meanX) * (y[i] - meanY)).reduce((a, b) => a + b, 0);
        const den = Math.sqrt(x.map(xi => Math.pow(xi - meanX, 2)).reduce((a, b) => a + b, 0)) * 
                    Math.sqrt(y.map(yi => Math.pow(yi - meanY, 2)).reduce((a, b) => a + b, 0));
        row[v2] = den === 0 ? 0 : num / den;
      });
      matrix.push(row);
    });
    return matrix;
  };

  const stats = React.useMemo(() => calculateSummaryStats(), [currentDataset]);
  const correlationMatrix = React.useMemo(() => calculateCorrelationMatrix(), [currentDataset]);

  const auditResult = React.useMemo(() => {
    if (!currentDataset) return null;
    const missingValues: Record<string, { count: number; percentage: number }> = {};
    const outliers: Record<string, { count: number; indices: number[]; mean: number; std: number }> = {};
    const constantColumns: string[] = [];

    const data = currentDataset.data || [];
    const N = data.length;
    if (N === 0) return null;

    (currentDataset.variables || []).forEach(v => {
      // 1. Detect missing values
      let missingCount = 0;
      const values: number[] = [];
      const allValuesSet = new Set<any>();

      data.forEach((row, idx) => {
        const val = row[v.name];
        if (val === null || val === undefined || val === "" || (typeof val === 'number' && isNaN(val))) {
          missingCount++;
        } else {
          allValuesSet.add(val);
          if (v.type === 'numeric') {
            const num = parseFloat(val);
            if (!isNaN(num)) {
              values.push(num);
            }
          }
        }
      });

      if (missingCount > 0) {
        missingValues[v.name] = {
          count: missingCount,
          percentage: (missingCount / N) * 100
        };
      }

      // 2. Detect constant columns (only if there is at least some data)
      if (allValuesSet.size === 1) {
        constantColumns.push(v.name);
      }

      // 3. Detect outliers (only for numeric variables with size > 2)
      if (v.type === 'numeric' && values.length > 2) {
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        const variance = values.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / values.length;
        const std = Math.sqrt(variance);

        if (std > 0) {
          const outlierIndices: number[] = [];
          data.forEach((row, idx) => {
            const val = row[v.name];
            if (val !== null && val !== undefined && val !== "" && !isNaN(parseFloat(val))) {
              const num = parseFloat(val);
              if (Math.abs(num - mean) > 3 * std) {
                outlierIndices.push(idx);
              }
            }
          });

          if (outlierIndices.length > 0) {
            outliers[v.name] = {
              count: outlierIndices.length,
              indices: outlierIndices,
              mean,
              std
            };
          }
        }
      }
    });

    return { missingValues, outliers, constantColumns };
  }, [currentDataset]);

  const handleApplyCleaning = () => {
    if (!currentDataset || !auditResult) return;

    setLoading(true);
    
    let newData = (currentDataset.data || []).map(row => ({ ...row }));
    let newVariables = [...(currentDataset.variables || [])];
    
    const reportLines: string[] = [];
    
    // 1. Constants
    if (handleConstantsMode === 'drop-constants' && auditResult.constantColumns.length > 0) {
      const droppedCols = auditResult.constantColumns;
      newVariables = newVariables.filter(v => !droppedCols.includes(v.name));
      newData = newData.map(row => {
        const cloned = { ...row };
        droppedCols.forEach(col => {
          delete cloned[col];
        });
        return cloned;
      });
      reportLines.push(`Dropped ${droppedCols.length} constant column(s) with zero variance: ${droppedCols.join(', ')}.`);
    }

    // 2. Missing values
    if (handleMissingMode !== 'do-nothing') {
      const varsWithMissing = Object.keys(auditResult.missingValues);
      if (varsWithMissing.length > 0) {
        if (handleMissingMode === 'drop-rows') {
          const initialCount = newData.length;
          newData = newData.filter(row => {
            return newVariables.every(v => {
              const val = row[v.name];
              return val !== null && val !== undefined && val !== "" && !(typeof val === 'number' && isNaN(val));
            });
          });
          const droppedCount = initialCount - newData.length;
          reportLines.push(`Dropped ${droppedCount} row(s) containing missing values (Listwise deletion).`);
        } else if (handleMissingMode === 'impute-mean' || handleMissingMode === 'impute-median') {
          let imputedCellCount = 0;
          newVariables.forEach(v => {
            if (auditResult.missingValues[v.name]) {
              const values = newData
                .map(row => row[v.name])
                .filter(val => val !== null && val !== undefined && val !== "" && !isNaN(parseFloat(val)))
                .map(val => parseFloat(val));

              if (values.length > 0) {
                let fillValue = 0;
                if (handleMissingMode === 'impute-mean') {
                  fillValue = values.reduce((a, b) => a + b, 0) / values.length;
                } else {
                  const sorted = [...values].sort((a, b) => a - b);
                  const mid = Math.floor(sorted.length / 2);
                  const midVal = sorted[mid] ?? 0;
                  const prevVal = sorted[mid - 1] ?? 0;
                  fillValue = sorted.length % 2 !== 0 ? midVal : (prevVal + midVal) / 2;
                }

                newData = newData.map(row => {
                  const val = row[v.name];
                  if (val === null || val === undefined || val === "" || (typeof val === 'number' && isNaN(val))) {
                    imputedCellCount++;
                    return { ...row, [v.name]: fillValue };
                  }
                  return row;
                });
              }
            }
          });
          reportLines.push(`Imputed ${imputedCellCount} missing cell(s) across variables using column ${handleMissingMode === 'impute-mean' ? 'mean' : 'median'} values.`);
        }
      }
    }

    // 3. Outliers
    if (handleOutliersMode !== 'do-nothing') {
      const varsWithOutliers = Object.keys(auditResult.outliers);
      if (varsWithOutliers.length > 0) {
        if (handleOutliersMode === 'drop-outliers') {
          const initialCount = newData.length;
          newData = newData.filter((row, idx) => {
            return newVariables.every(v => {
              const outInfo = auditResult.outliers[v.name];
              if (!outInfo) return true;
              const val = row[v.name];
              if (val === null || val === undefined || val === "" || isNaN(parseFloat(val))) return true;
              const num = parseFloat(val);
              return Math.abs(num - outInfo.mean) <= 3 * outInfo.std;
            });
          });
          const droppedCount = initialCount - newData.length;
          reportLines.push(`Dropped ${droppedCount} row(s) containing extreme outliers (Z-score > 3).`);
        } else if (handleOutliersMode === 'winsorize') {
          let winsorizedCount = 0;
          newVariables.forEach(v => {
            const outInfo = auditResult.outliers[v.name];
            if (outInfo) {
              const upperLimit = outInfo.mean + 3 * outInfo.std;
              const lowerLimit = outInfo.mean - 3 * outInfo.std;
              newData = newData.map(row => {
                const val = row[v.name];
                if (val !== null && val !== undefined && val !== "" && !isNaN(parseFloat(val))) {
                  const num = parseFloat(val);
                  if (num > upperLimit) {
                    winsorizedCount++;
                    return { ...row, [v.name]: upperLimit };
                  } else if (num < lowerLimit) {
                    winsorizedCount++;
                    return { ...row, [v.name]: lowerLimit };
                  }
                }
                return row;
              });
            }
          });
          reportLines.push(`Winsorized ${winsorizedCount} extreme value(s) by capping them at the 3x standard deviation threshold.`);
        }
      }
    }

    if (reportLines.length === 0) {
      reportLines.push("No data cleaning actions were selected or performed.");
    }

    onDatasetChange({
      ...currentDataset,
      data: newData,
      variables: newVariables,
      rowCount: newData.length,
      colCount: newVariables.length
    });

    setCleaningSummary(reportLines.join("\n"));
    setLoading(false);
  };

  const handleAnalyzeData = () => {
    if (!currentDataset) return;
    const stats = calculateSummaryStats();
    onRunComplete(
      { stats, rowCount: currentDataset.rowCount, variables: currentDataset.variables },
      `Structural Review of ${currentDataset.name}`
    );
  };

  const handleTransform = (variableName: string, method: 'ln' | 'sq') => {
    if (!currentDataset) return;
    
    setLoading(true);
    const newName = method === 'ln' ? `ln_${variableName}` : `${variableName}_sq`;
    
    // Check if it already exists
    if (currentDataset.variables && currentDataset.variables.some(v => v.name === newName)) {
      setError(`Variable ${newName} already exists.`);
      setLoading(false);
      return;
    }

    let nonPositiveCount = 0;
    const newData = (currentDataset.data || []).map(row => {
      const val = row[variableName];
      const transformed = applyVariableTransform(val, method);
      // Non-positive values fed to 'ln' have no real logarithm and come back
      // as null from applyVariableTransform -- tally them for the toast below
      // rather than fabricating a value of 0 (downstream regressions, e.g.
      // runOLS, already treat null/undefined as "exclude this row" via
      // listwise deletion).
      if (method === 'ln' && typeof val === 'number' && val <= 0) {
        nonPositiveCount++;
      }
      return { ...row, [newName]: transformed };
    });

    const newVariable: Variable = {
      name: newName,
      label: newName,
      type: 'numeric',
      isTransformed: true,
      description: method === 'ln' ? `Natural log of ${variableName}` : `Square of ${variableName}`
    };

    onDatasetChange({
      ...currentDataset,
      data: newData,
      variables: [...(currentDataset.variables || []), newVariable],
      colCount: currentDataset.colCount + 1
    });

    if (method === 'ln' && nonPositiveCount > 0) {
      addToast(
        'info',
        'Some values excluded from log transform',
        `${nonPositiveCount} observation(s) had non-positive values of "${variableName}" and were set to missing in "${newName}" (log is undefined for values <= 0). These rows will be excluded from any regression using "${newName}".`
      );
    }

    setLoading(false);
  };

  const [activeTab, setActiveTab] = useState<'preview' | 'stats' | 'correlation' | 'power' | 'batch'>('preview');
  const [showPowerAnalysisIndependent, setShowPowerAnalysisIndependent] = useState(false);
  const [isRawDataModalOpen, setIsRawDataModalOpen] = useState(false);

  const handleDownloadSummaryStats = () => {
    if (!currentDataset || !stats) return;
    const data = Object.entries(stats).map(([name, s]: [string, any]) => ({
      Variable: name,
      Mean: s.mean,
      StdDev: s.std,
      Min: s.min,
      Max: s.max,
      Count: s.count
    }));
    exportToCSV(data, `${currentDataset.name}_summary_stats`);
  };

  const handleDownloadCorrelation = () => {
    if (!correlationMatrix || !currentDataset) return;
    exportToCSV(correlationMatrix, `${currentDataset.name}_correlation_matrix`);
  };

  const getCorrelationColor = (val: number) => {
    const abs = Math.abs(val);
    if (abs > 0.8) return 'bg-blue-600 text-white';
    if (abs > 0.5) return 'bg-blue-400 text-white';
    if (abs > 0.2) return 'bg-blue-200 text-blue-900';
    return 'bg-slate-50 text-slate-400';
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-700">
      <ModuleIntroCard 
        title="Data"
        description="The foundation of any econometric analysis is a clean, well-structured dataset. Use this module to audit your variables, check for outliers, and define your structural hypothesis."
        useWhen="You are beginning a new project or need to verify the integrity of your observations before estimation."
        requires={[
          "CSV file or template selection",
          "Variable name headers",
          "Clean rectangular data structure"
        ]}
        youWillGet={[
          "Variable inventory & moments",
          "Structural data preview",
          "Automated model choice advising",
          "Mistake detection & audit"
        ]}
        pitfalls={[
          "Missing values (NA) causing observation drops",
          "Small sample size bias",
          "Constants causing multicollinearity"
        ]}
        example="Auditing the CPS 2024 wages dataset to ensure 'wage' is numeric and 'year' identifiers exist for potential panel expansion."
      />
      {/* Top Workbench Toolbar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6 pb-6 border-b border-slate-100">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">Data Workbench</h2>
            {currentDataset && (
              <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded border border-blue-100 uppercase tracking-tight">
                Active Session
              </span>
            )}
          </div>
          <p className="text-sm text-slate-500 italic font-serif">Prepare your structural data for empirical analysis.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="relative group">
            <button className="btn-secondary flex items-center gap-2 px-6 py-2.5 bg-white hover:bg-slate-50 border-slate-200">
              <Upload className="w-4 h-4 text-slate-400 group-hover:text-blue-600 transition-colors" />
              <span className="font-semibold">Import Dataset</span>
            </button>
            <input 
              type="file" 
              accept=".csv" 
              onChange={handleFileUpload}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </div>
          <button 
            onClick={() => loadSample('master')}
            className="px-4 py-2.5 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-lg transition-colors flex items-center gap-2 border border-blue-100"
          >
            <Zap className="w-4 h-4" />
            Master Lab Dataset
          </button>
          <button 
            onClick={() => loadSample('cross-section')}
            className="px-4 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-900 transition-colors flex items-center gap-2"
          >
            <Database className="w-4 h-4" />
            Simple Samples
          </button>
        </div>
      </div>

      <MistakeDetector mistakes={getMistakes()} />

      {currentDataset?.name === "Master Econometrics Test Dataset" && (
        <div className="card-premium p-6 bg-blue-50/50 border-blue-200 animate-in slide-in-from-top-2 duration-300">
           <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-600 rounded-xl">
                 <Zap className="w-5 h-5 text-white" />
              </div>
              <div className="space-y-4 flex-1">
                 <div>
                    <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Master Workshop Mode Active</h3>
                    <p className="text-xs text-slate-500 font-serif italic mt-1">
                       This dataset is designed for maximum structural versatility. Use it to test identification strategies across all modules.
                    </p>
                 </div>
                 
                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { module: 'OLS', spec: 'wage ~ educ + exper + training', use: 'Returns to human capital' },
                      { module: 'FE', spec: 'wage ~ training + urban (Fixed: entity_id)', use: 'Removing time-invariant bias' },
                      { module: 'IV', spec: 'wage ~ educ (Instr: distance_to_college)', use: 'College proximity instrument' },
                      { module: 'PROB', spec: 'employment ~ educ + female + urban', use: 'Labor force participation' },
                      { module: 'ARIMA', spec: 'gdp_growth (Entity: Alpha)', use: 'Univariate forecasting' }
                    ].map((m, i) => (
                      <div key={i} className="p-3 bg-white rounded-lg border border-blue-100/50 space-y-1">
                         <div className="flex justify-between items-center">
                            <span className="text-[9px] font-black text-blue-600 uppercase font-mono">{m.module}</span>
                            <span className="text-[8px] text-slate-400 font-serif italic">{m.use}</span>
                         </div>
                         <code className="text-[10px] text-slate-700 bg-slate-50 px-1.5 py-0.5 rounded block truncate font-mono">
                            {m.spec}
                         </code>
                      </div>
                    ))}
                 </div>
              </div>
           </div>
        </div>
      )}

      {!currentDataset ? (
        showPowerAnalysisIndependent ? (
          <div className="space-y-6 animate-in fade-in duration-300">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <button
                onClick={() => setShowPowerAnalysisIndependent(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2"
              >
                ← Back to Upload Panel
              </button>
              <span className="text-[10px] text-slate-400 font-mono">Independent Planning Mode</span>
            </div>
            <PowerAnalysisLab dataset={null} />
          </div>
        ) : (
          <div className="space-y-6 animate-in fade-in duration-300">
            <DataUploadPrivacyBanner />
            {/* CTA to launch Independent Power Planning Lab */}
            <div className="card-premium p-6 bg-blue-50/50 border-blue-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
              <div className="space-y-1 flex-1">
                <h4 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Need to design an RCT or calculate sample size first?</h4>
                <p className="text-xs text-slate-500 font-serif italic">Calculate statistical power and optimal sample sizes before you even gather or upload data.</p>
              </div>
              <button
                onClick={() => setShowPowerAnalysisIndependent(true)}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all shadow-md shrink-0"
              >
                Launch Power Analysis Lab
              </button>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-12 xl:col-span-8">
                <section className="flex flex-col items-center justify-center py-24 px-6 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
                  <div className="w-16 h-16 bg-white border border-slate-200 rounded-full flex items-center justify-center mb-6 shadow-sm">
                    <Database className="w-8 h-8 text-slate-400" />
                  </div>
                  <h2 className="text-xl font-bold text-slate-900 mb-2">No dataset loaded yet</h2>
                  <p className="text-slate-500 text-center max-w-md mb-8">
                    You need to upload or select a dataset before exploring variables and running statistical models.
                  </p>
                  
                  <div className="relative">
                    <button className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors shadow-md">
                      <Upload className="w-5 h-5" />
                      Upload Dataset
                    </button>
                    <input 
                      type="file" 
                      accept=".csv,.xlsx,.xls" 
                      onChange={handleFileUpload}
                      className="absolute inset-0 opacity-0 cursor-pointer"
                    />
                  </div>
                  <div className="mt-8 w-full max-w-2xl text-left">
                    <DataUploadLab 
                      onDataLoaded={(payload, filename) => {
                        processData(filename, payload.rows);
                      }}
                    />
                  </div>
                </section>
              </div>

              {/* Quick Start Templates */}
              <div className="lg:col-span-12 xl:col-span-4 flex flex-col gap-4">
                 <div className="card-premium p-6 bg-white border-slate-200 shadow-sm flex flex-col h-full">
                  <div className="flex items-center gap-3 mb-6">
                     <Zap className="w-5 h-5 text-amber-500" />
                     <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Institutional Benchmarks</h3>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-3">
                    {[
                      { title: "Master Lab", type: "Full Panel & IV", icon: Zap, id: 'master', color: 'text-orange-500' },
                      { title: "CPS Wages", type: "Cross-section", icon: LineChart, id: 'cross-section' },
                      { title: "EU Economics", type: "Panel Data", icon: Table, id: 'panel' },
                      { title: "Climate Log", type: "Time-series", icon: TrendingUp, id: 'time-series' }
                    ].map((sample) => (
                      <button
                        key={sample.id}
                        onClick={() => loadSample(sample.id as any)}
                        className="group flex items-center justify-between p-4 bg-slate-50 hover:bg-white hover:shadow-md border border-slate-100 hover:border-blue-200 rounded-xl transition-all text-left"
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn("p-2 rounded-lg bg-white border border-slate-100", sample.color || "text-blue-500")}>
                            <sample.icon className="w-4 h-4" />
                          </div>
                          <div>
                            <div className="text-xs font-bold text-slate-900">{sample.title}</div>
                            <div className="text-[10px] text-slate-500 font-serif italic">{sample.type}</div>
                          </div>
                        </div>
                        <Sparkles className="w-3 h-3 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </button>
                    ))}
                  </div>
               </div>
            </div>
          </div>
        </div>
      )
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4 duration-500">
          {/* Active Data Area */}
          <div className="lg:col-span-8 space-y-6">
             <div className="card-premium overflow-hidden">
                <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex items-center justify-between">
                   <div className="flex bg-slate-200/50 p-1 rounded-lg">
                      {[
                        { id: 'preview', label: 'Preview' },
                        { id: 'stats', label: 'Stats' },
                        { id: 'correlation', label: 'Correlation' },
                        { id: 'power', label: 'Power Analysis' },
                        { id: 'batch', label: 'Batch Processing' }
                      ].map(t => (
                        <button
                          key={t.id}
                          onClick={() => setActiveTab(t.id as any)}
                          className={cn(
                            "px-4 py-1 text-[10px] font-bold uppercase tracking-widest rounded-md transition-all",
                            activeTab === t.id ? "bg-white text-blue-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
                          )}
                        >
                          {t.label}
                        </button>
                      ))}
                   </div>
                   <div className="flex items-center gap-3">
                     <button 
                       onClick={() => setIsRawDataModalOpen(true)}
                       className="text-[10px] font-bold text-blue-600 hover:text-blue-800 flex items-center gap-1.5 transition-colors"
                     >
                       <Eye className="w-3.5 h-3.5" /> View Full Raw Data
                     </button>
                     <span className="text-slate-200">|</span>
                     <button 
                       onClick={() => onDatasetChange(null)}
                       className="text-[10px] font-bold text-red-500 hover:underline flex items-center gap-1.5"
                     >
                       <Trash2 className="w-3.5 h-3.5" /> Purge Matrix
                     </button>
                   </div>
                </div>

                {activeTab === 'preview' && (
                  <DataPreviewMatrix 
                    dataset={{
                      headers: currentDataset.variables.map(v => v.name),
                      rows: currentDataset.data
                    }} 
                  />
                )}

                {activeTab === 'correlation' && (
                  <div className="p-8 animate-in fade-in duration-300 min-h-[400px]">
                    <div className="flex justify-end mb-4">
                      <button 
                        onClick={handleDownloadCorrelation}
                        className="text-[10px] font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors"
                      >
                        <FileDown className="w-3 h-3" /> Export Matrix CSV
                      </button>
                    </div>
                    <div className="overflow-x-auto">
                      <div className="inline-block min-w-full">
                        <table className="border-collapse">
                          <thead>
                            <tr>
                              <th className="p-2"></th>
                              {currentDataset.variables.filter(v => v.type === 'numeric').map(v => (
                                <th key={v.name} className="p-2 text-[8px] font-mono uppercase tracking-tighter text-slate-400 -rotate-45 h-16 w-16 align-bottom border-b border-slate-100">
                                  {v.name}
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody>
                            {correlationMatrix?.map((row, i) => (
                              <tr key={`${row.variable || 'row'}-${i}`}>
                                <td className="p-2 text-[10px] font-bold text-slate-700 font-serif italic border-r border-slate-100 pr-4">{row.variable}</td>
                                {currentDataset.variables.filter(v => v.type === 'numeric').map(v => (
                                  <td key={v.name} className="p-0">
                                    <div 
                                      className={cn(
                                        "w-12 h-12 flex items-center justify-center text-[9px] font-bold font-mono transition-all border border-white",
                                        getCorrelationColor(row[v.name])
                                      )}
                                      title={`${row.variable} x ${v.name}: ${row[v.name]?.toFixed(3) || '—'}`}
                                    >
                                      {row[v.name]?.toFixed(2) || '—'}
                                    </div>
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'stats' && (
                   <div className="p-8 animate-in fade-in duration-300 min-h-[400px]">
                      <div className="flex justify-end mb-6">
                        <button 
                          onClick={handleDownloadSummaryStats}
                          className="text-[10px] font-bold text-slate-500 hover:text-blue-600 flex items-center gap-1.5 transition-colors"
                        >
                          <FileDown className="w-3 h-3" /> Export Stats CSV
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {currentDataset.variables.filter(v => v.type === 'numeric').map((v, idx) => {
                          const s = stats?.[v.name];
                          return (
                            <div key={`${v.name}-${idx}`} className="p-4 bg-slate-50 rounded-xl border border-slate-100 space-y-3">
                               <h4 className="text-xs font-bold text-slate-800 font-serif italic">{v.name}</h4>
                               <div className="grid grid-cols-2 gap-2 text-[10px] uppercase font-mono tracking-tighter">
                                  <div className="text-slate-400">Mean: <span className="text-slate-900 font-bold">{s?.mean?.toFixed(2) || '—'}</span></div>
                                  <div className="text-slate-400">Std: <span className="text-slate-900 font-bold">{s?.std?.toFixed(2) || '—'}</span></div>
                                  <div className="text-slate-400">Min: <span className="text-slate-900 font-bold">{s?.min?.toFixed(2) || '—'}</span></div>
                                  <div className="text-slate-400">Max: <span className="text-slate-900 font-bold">{s?.max?.toFixed(2) || '—'}</span></div>
                               </div>
                            </div>
                          );
                        })}
                      </div>
                   </div>
                )}

                {activeTab === 'power' && (
                  <div className="p-8 animate-in fade-in duration-300 min-h-[400px]">
                    <PowerAnalysisLab dataset={currentDataset} />
                  </div>
                )}

                {activeTab === 'batch' && (
                  <div className="p-8 animate-in fade-in duration-300 min-h-[400px]">
                    <BatchProcessingLab />
                  </div>
                )}
                
                <div className="p-4 bg-slate-50 border-t border-slate-100 text-[10px] text-slate-400 font-mono text-center">
                  {activeTab === 'preview' && `Displaying top sample of ${currentDataset.rowCount} rows.`}
                  {activeTab === 'correlation' && "Pearson correlation coefficients (ρ) for numerical variables."}
                  {activeTab === 'stats' && "Basic descriptive moments for numerical columns."}
                  {activeTab === 'power' && "Statistical power and optimal sample size estimations."}
                  {activeTab === 'batch' && "Sequential batch processing across multiple selected datasets."}
                </div>
             </div>

             <div className="card-premium p-8 bg-blue-50/30 border-blue-100 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-600 rounded-xl">
                    <Database className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900">Step 2: Data Audit & Structural Health</h3>
                    <p className="text-xs text-slate-500 font-serif italic">Verifying the integrity of the observational matrix.</p>
                  </div>
                </div>
                <div className="flex gap-2">
                   <div className="px-3 py-1 bg-white border border-blue-200 rounded-full flex items-center gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      <span className="text-[10px] font-bold uppercase tracking-tight font-mono text-slate-600">{currentDataset.structure} detected</span>
                   </div>
                </div>
             </div>

             <ResearchQuestionBuilder dataset={currentDataset} />

             <div className="card-premium overflow-hidden">
                <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <Table className="w-3.5 h-3.5 text-blue-400" />
                      <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Variable Registry</h3>
                   </div>
                   <span className="text-[10px] text-slate-500 font-mono uppercase tracking-tighter">
                     {currentDataset.variables.length} Dimensions Identified
                   </span>
                </div>
                <div className="p-0 overflow-x-auto overflow-y-hidden w-full">
                   <table className="w-full text-left text-[11px] min-w-[500px]">
                      <thead>
                        <tr className="bg-slate-50/50 text-slate-400 font-bold border-b border-slate-100">
                           <th className="p-4">Name</th>
                           <th className="p-4">Type</th>
                           <th className="p-4 text-center">Recast Type</th>
                           <th className="p-4">Structural Role</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {currentDataset.variables.map((v, i) => (
                          <tr key={`${v.name}-${i}`} className="hover:bg-slate-50/30 transition-colors group">
                            <td className="p-4 font-bold text-slate-800 italic font-serif">{v.name}</td>
                            <td className="p-4">
                               <span className={cn(
                                 "px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-tight",
                                 v.isAmbiguous ? "bg-amber-100 text-amber-700 shadow-sm border border-amber-200" :
                                 v.type === 'numeric' ? (v.isCleaned ? "bg-cyan-100 text-cyan-700 shadow-sm border border-cyan-200" : "bg-blue-100 text-blue-700") : 
                                 v.type === 'categorical' ? "bg-purple-100 text-purple-700" :
                                 "bg-slate-100 text-slate-500"
                               )}>
                                 {v.isAmbiguous ? 'ambiguous' : v.isCleaned ? 'numeric (cleaned)' : v.type}
                               </span>
                               {v.isCleaned && !v.isAmbiguous && (
                                 <div className="text-[7px] text-cyan-600 font-mono mt-1 font-bold">Heuristic Cleaning Applied</div>
                               )}
                            </td>
                            <td className="p-4 text-center">
                               <button 
                                 onClick={() => {
                                   const newType: DataType = v.type === 'numeric' ? 'categorical' : 'numeric';
                                   const newVars = [...currentDataset.variables];
                                   newVars[i] = { ...v, type: newType };
                                   onDatasetChange({ ...currentDataset, variables: newVars });
                                 }}
                                 className="text-[10px] font-bold text-blue-600 hover:bg-blue-50 px-3 py-1 rounded-md border border-blue-100 transition-all opacity-0 group-hover:opacity-100"
                               >
                                 Switch to {v.type === 'numeric' ? 'Categorical' : 'Numeric'}
                               </button>
                            </td>
                            <td className="p-4 text-slate-400 font-serif italic truncate max-w-[200px]">
                               {v.description || (v.type === 'numeric' ? 'Scale Variable' : 'Entity Index')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                   </table>
                </div>
             </div>

             <div className="card-premium overflow-hidden border-orange-100 bg-orange-50/20">
                <div className="p-4 bg-orange-50/50 border-b border-orange-100 flex items-center gap-2">
                   <Zap className="w-3 h-3 text-orange-500" />
                   <h3 className="text-[10px] font-bold uppercase tracking-wider text-orange-600 font-mono">Structural Transforms</h3>
                </div>
                <div className="p-4 flex flex-wrap gap-3">
                   {currentDataset.variables.filter(v => v.type === 'numeric' && !v.isTransformed).map((v, idx) => (
                     <div key={`${v.name}-${idx}`} className="flex items-center gap-3 px-4 py-2 bg-white rounded-lg border border-orange-100/50 shadow-sm">
                        <span className="text-[11px] font-bold text-slate-700">{v.name}</span>
                        <div className="flex gap-2 ml-2 border-l border-orange-100/50 pl-3">
                          <button onClick={() => handleTransform(v.name, 'ln')} className="text-orange-600 font-bold text-[10px] hover:underline min-h-[32px] px-1">LN</button>
                          <button onClick={() => handleTransform(v.name, 'sq')} className="text-orange-600 font-bold text-[10px] hover:underline min-h-[32px] px-1">SQR</button>
                        </div>
                     </div>
                   ))}
                </div>
             </div>

             <div className="card-premium overflow-hidden border-blue-100 bg-blue-50/10">
                <div className="p-4 bg-blue-50/50 border-b border-blue-100 flex items-center justify-between">
                   <div className="flex items-center gap-2">
                      <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                      <h3 className="text-[10px] font-bold uppercase tracking-wider text-blue-700 font-mono">Automated Data Cleaning & Diagnostic Suite</h3>
                   </div>
                   <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[8px] font-bold rounded uppercase tracking-wider">Automated Audit</span>
                </div>
                <div className="p-6 space-y-6">
                  {/* Audit Results Summary */}
                  {auditResult && (() => {
                    const totalIssues = Object.keys(auditResult.missingValues || {}).length + 
                                        Object.keys(auditResult.outliers || {}).length + 
                                        (auditResult.constantColumns || []).length;
                    
                    return (
                      <div className="space-y-4">
                        <div className="p-4 rounded-xl border bg-white border-slate-100 space-y-3">
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider font-mono">Dataset Health Report</h4>
                          
                          {totalIssues === 0 ? (
                            <div className="flex items-center gap-2.5 text-xs text-emerald-700 bg-emerald-50/50 p-3 rounded-lg border border-emerald-100">
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                              <p className="font-serif italic">Outstanding! Your dataset is fully regularized. No missing values, extreme outliers (Z &gt; 3), or constant variables detected.</p>
                            </div>
                          ) : (
                            <div className="space-y-2.5">
                              {Object.keys(auditResult.missingValues).length > 0 && (
                                <div className="flex items-start gap-2.5 text-xs text-amber-700 bg-amber-50/40 p-2.5 rounded-lg border border-amber-100">
                                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-bold uppercase text-[9px] tracking-wider block text-amber-800 font-mono">Missing Values Detected</span>
                                    <p className="font-serif italic mt-0.5">
                                      Found missing cells in <strong>{Object.keys(auditResult.missingValues).length}</strong> variable(s): {Object.entries(auditResult.missingValues).map(([name, info]) => `${name} (${info.count} rows, ${info.percentage.toFixed(1)}%)`).join(', ')}.
                                    </p>
                                  </div>
                                </div>
                              )}
                              
                              {Object.keys(auditResult.outliers).length > 0 && (
                                <div className="flex items-start gap-2.5 text-xs text-red-700 bg-red-50/40 p-2.5 rounded-lg border border-red-100">
                                  <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-bold uppercase text-[9px] tracking-wider block text-red-800 font-mono">Extreme Outliers Detected (Z-score &gt; 3)</span>
                                    <p className="font-serif italic mt-0.5">
                                      Found extreme observations in <strong>{Object.keys(auditResult.outliers).length}</strong> numeric variable(s): {Object.entries(auditResult.outliers).map(([name, info]) => `${name} (${info.count} outliers)`).join(', ')}.
                                    </p>
                                  </div>
                                </div>
                              )}

                              {auditResult.constantColumns.length > 0 && (
                                <div className="flex items-start gap-2.5 text-xs text-rose-700 bg-rose-50/40 p-2.5 rounded-lg border border-rose-100">
                                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                                  <div>
                                    <span className="font-bold uppercase text-[9px] tracking-wider block text-rose-800 font-mono">Zero Variance Columns</span>
                                    <p className="font-serif italic mt-0.5">
                                      The following column(s) have constant values across all rows, which will cause perfect collinearity: <strong>{auditResult.constantColumns.join(', ')}</strong>.
                                    </p>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Interactive Toggles */}
                        {totalIssues > 0 && (
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Missing Values Treatment</label>
                              <select 
                                value={handleMissingMode}
                                onChange={(e) => setHandleMissingMode(e.target.value as any)}
                                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="do-nothing">Keep Missing Values</option>
                                <option value="drop-rows">Listwise Deletion (Drop Rows)</option>
                                <option value="impute-mean">Impute with Variable Mean</option>
                                <option value="impute-median">Impute with Variable Median</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Outliers Treatment (Z &gt; 3)</label>
                              <select 
                                value={handleOutliersMode}
                                onChange={(e) => setHandleOutliersMode(e.target.value as any)}
                                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="do-nothing">Keep All Outliers</option>
                                <option value="drop-outliers">Drop Outlier Rows</option>
                                <option value="winsorize">Winsorize (Cap at 3x SD)</option>
                              </select>
                            </div>

                            <div className="space-y-1">
                              <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-mono">Constant Columns Treatment</label>
                              <select 
                                value={handleConstantsMode}
                                onChange={(e) => setHandleConstantsMode(e.target.value as any)}
                                className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="do-nothing">Keep Constant Columns</option>
                                <option value="drop-constants">Drop Constant Columns</option>
                              </select>
                            </div>
                          </div>
                        )}

                        <div className="flex items-center justify-between pt-2">
                          <p className="text-[10px] text-slate-500 font-serif italic">
                            Select desired cleaning filters and execute to dynamically clean the active dataset workspace.
                          </p>
                          <button 
                            onClick={handleApplyCleaning}
                            disabled={loading || totalIssues === 0 || (handleMissingMode === 'do-nothing' && handleOutliersMode === 'do-nothing' && handleConstantsMode === 'do-nothing')}
                            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors shadow-md"
                          >
                            Apply Cleaning Operations
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Cleaning Report */}
                  {cleaningSummary && (
                    <div className="p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl space-y-2 animate-in fade-in duration-300">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 font-mono">Cleaning Report Executed</h4>
                      </div>
                      <pre className="text-[10px] text-slate-700 font-mono whitespace-pre-wrap leading-relaxed">
                        {cleaningSummary}
                      </pre>
                    </div>
                  )}
                </div>
             </div>

             <div className="card-premium overflow-hidden border-emerald-100 bg-emerald-50/20">
                <div className="p-4 bg-emerald-50/50 border-b border-emerald-100 flex items-center gap-2">
                   <Sparkles className="w-3 h-3 text-emerald-500" />
                   <h3 className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 font-mono">Missing Value Imputation</h3>
                </div>
                <div className="p-6 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Variable to Impute</label>
                      <select 
                        value={imputationConfig.variable}
                        onChange={(e) => setImputationConfig({ ...imputationConfig, variable: e.target.value })}
                        className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="">Select variable...</option>
                        {currentDataset.variables.filter(v => v.type === 'numeric').map((v, idx) => (
                          <option key={`${v.name}-${idx}`} value={v.name}>{v.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-slate-500 uppercase">Method</label>
                      <select 
                        value={imputationConfig.method}
                        onChange={(e) => setImputationConfig({ ...imputationConfig, method: e.target.value as any })}
                        className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg"
                      >
                        <option value="mean">Mean Imputation</option>
                        <option value="median">Median Imputation</option>
                        <option value="regression">Bivariate Regression</option>
                      </select>
                    </div>
                    {imputationConfig.method === 'regression' && (
                      <div className="space-y-1 animate-in slide-in-from-left-2 duration-200">
                        <label className="text-[10px] font-bold text-slate-500 uppercase">Predictor (Independent)</label>
                        <select 
                          value={imputationConfig.predictor}
                          onChange={(e) => setImputationConfig({ ...imputationConfig, predictor: e.target.value })}
                          className="w-full p-2 text-xs bg-white border border-slate-200 rounded-lg"
                        >
                          <option value="">Select predictor...</option>
                          {currentDataset.variables.filter(v => v.type === 'numeric' && v.name !== imputationConfig.variable).map((v, idx) => (
                            <option key={`${v.name}-${idx}`} value={v.name}>{v.label}</option>
                          ))}
                        </select>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-2">
                    <p className="text-[10px] text-slate-500 font-serif italic">
                      {imputationConfig.variable ? (
                        <>Missing values in <strong>{imputationConfig.variable}</strong> will be estimated using the <strong>{imputationConfig.method}</strong> technique.</>
                      ) : "Select a variable to begin the imputation process."}
                    </p>
                    <button 
                      onClick={handleImpute}
                      disabled={!imputationConfig.variable || (imputationConfig.method === 'regression' && !imputationConfig.predictor) || loading}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-widest rounded-lg transition-colors shadow-sm"
                    >
                      Fill Gaps
                    </button>
                  </div>
                </div>
             </div>

             <div className="card-premium p-8">
                <div className="flex items-center justify-between mb-8">
                   <div className="space-y-1">
                      <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 font-mono">Structural Execution</h3>
                      <p className="text-[11px] text-slate-400 italic">Confirm your choices to finalize the data preparation gate.</p>
                   </div>
                   <button onClick={handleAnalyzeData} className="btn-primary flex items-center gap-2">
                     <CheckCircle2 className="w-3.5 h-3.5" /> Initialize Empirical Session
                   </button>
                </div>
             </div>

             <ModelChoiceAssistant 
               dataset={currentDataset} 
               onNavigate={(target) => navigateTo(target as any)} 
             />
          </div>

          {/* Stats Sidebar */}
          <div className="lg:col-span-4 space-y-6">
             <div className="grid grid-cols-2 gap-4">
                <div className="card-premium p-5 text-center">
                   <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Observations</p>
                   <p className="text-xl font-bold tabular-nums text-slate-900">{(currentDataset.rowCount || 0).toString()}</p>
                </div>
                <div className="card-premium p-5 text-center">
                   <p className="text-[10px] uppercase font-bold text-slate-400 mb-1 font-mono">Variables</p>
                   <p className="text-xl font-bold tabular-nums text-slate-900">{(currentDataset.colCount || 0).toString()}</p>
                </div>
             </div>

             <div className="card-premium overflow-hidden">
                <div className="p-4 bg-slate-50/50 border-b border-slate-100">
                   <h3 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">Variable Inventory</h3>
                </div>
                <div className="max-h-[400px] overflow-y-auto">
                   <div className="divide-y divide-slate-50">
                      {currentDataset.variables.map((v, idx) => (
                        <div key={`${v.name}-${idx}`} className={cn(
                          "p-4 flex items-center justify-between hover:bg-slate-50 transition-colors",
                          v.isAmbiguous && "bg-amber-50/30"
                        )}>
                           <div className="space-y-0.5 max-w-[60%]">
                              <p className="text-sm font-bold text-slate-800 italic font-serif flex items-center gap-1.5 pt-1">
                                {v.label}
                                {v.isAmbiguous && (
                                  <AlertCircle className="w-3 h-3 text-amber-500" />
                                )}
                              </p>
                              <p className="text-[9px] uppercase font-bold text-slate-300 font-mono">
                                {v.type} • internal: {v.name}
                                {v.isAmbiguous && <span className="ml-2 text-amber-600 lowercase font-serif italic text-[8px]">! mixed values</span>}
                              </p>
                              {v.description && (
                                <p className="text-[8px] text-slate-400 italic font-serif">{v.description}</p>
                              )}
                           </div>
                           <div className="text-right">
                              <p className="text-[10px] text-slate-400 uppercase font-mono tracking-tighter">Mean</p>
                              <p className="text-xs font-bold tabular-nums text-slate-600">
                                {calculateSummaryStats()?.[v.name]?.mean?.toFixed(3) || '—'}
                              </p>
                           </div>
                        </div>
                      ))}
                   </div>
                </div>
             </div>
          </div>
        </div>
      )}
      {currentDataset && (
        <RawDataViewerModal
          isOpen={isRawDataModalOpen}
          onClose={() => setIsRawDataModalOpen(false)}
          datasetName={currentDataset.name}
          variables={currentDataset.variables}
          data={currentDataset.data}
        />
      )}
    </div>
  );
}
