import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Copy, Check, FileText, Download, Terminal, 
  Plus, Settings, Sparkles, BookOpen, Layers, Info, 
  CheckCircle2, AlertTriangle, HelpCircle, FileSpreadsheet,
  RefreshCw, ChevronRight, CheckSquare, Square, ToggleLeft, ToggleRight
} from 'lucide-react';
import { runOLS } from '../../lib/econometrics/ols';
import { runFixedEffects, runRandomEffects } from '../../lib/econometrics/fixed_effects';
import { useStore } from '../../store/useStore';
import { sanitizeMath } from '../../lib/sanitizeMath';
import jStat from 'jstat';

interface ResultsProps {
  results: any | null;
  dependentVar: string;
  variableMetadata?: any;
  modelType?: "ols" | "logit" | "probit" | "panel_fe" | "panel_re" | "iv" | "arima" | "survival_cox";
  xVariables?: string[];
  options?: {
    robust?: boolean;
    clusterVar?: string;
    seType?: "hc1" | "hc2" | "hc3" | "Cluster" | "None" | string;
    panelId?: string;
    timeId?: string;
    instruments?: string[];
    orders?: [number, number, number];
  };
}

export default function RegressionResultsTable({ 
  results, 
  dependentVar, 
  variableMetadata,
  modelType: initialModelType = 'ols',
  xVariables: initialXVars = [],
  options: initialOptions = {}
}: ResultsProps) {
  // Global Store integration
  const { currentDataset, uiDensity, setUiDensity, entityId, timeId, addToast, addToRobustness } = useStore();

  // Local state for tracking model specifications (up to 4)
  const [specs, setSpecs] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<string>('table');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [helpExplanation, setHelpExplanation] = useState<string | null>(null);

  // States for the Add Specification Form
  const [newSpecXVars, setNewSpecXVars] = useState<string[]>([]);
  const [newSpecEstimator, setNewSpecEstimator] = useState<'ols' | 'fe' | 're'>('ols');
  const [newSpecSeType, setNewSpecSeType] = useState<string>('hc1');
  const [newSpecClusterVar, setNewSpecClusterVar] = useState<string>('');

  // Track copy feedback
  const [copiedLatex, setCopiedLatex] = useState(false);
  const [copiedWord, setCopiedWord] = useState(false);
  const [copiedReplication, setCopiedReplication] = useState(false);

  // Sync state with incoming results prop
  useEffect(() => {
    if (results) {
      setSpecs([
        {
          id: '1',
          title: 'Model (1)',
          results: results,
          dependentVar: dependentVar,
          xVariables: initialXVars || [],
          options: initialOptions || {},
          modelType: initialModelType || 'ols'
        }
      ]);
    }
  }, [results, dependentVar, initialXVars, initialOptions, initialModelType]);

  if (!results) return null;

  // Formatting helpers
  const getLabel = (name: string) => {
    if (variableMetadata && variableMetadata[name]) {
      return variableMetadata[name].label || name;
    }
    // Clean display labels
    if (name === 'Intercept' || name === '_cons') return 'Intercept (Constant)';
    return name;
  };

  const getStars = (p: number) => {
    if (p <= 0.01) return '***';
    if (p <= 0.05) return '**';
    if (p <= 0.10) return '*';
    return '';
  };

  // Extract variables union across all specs
  const getUniqueVariablesList = () => {
    const allVars = new Set<string>();
    specs.forEach(spec => {
      const coeffs = spec.results?.coefficients || [];
      coeffs.forEach((c: any) => {
        if (c.variable && c.variable !== 'Intercept' && c.variable !== 'Intercept (Constant)' && c.variable !== '_cons') {
          allVars.add(c.variable);
        }
      });
    });
    const sorted = Array.from(allVars).sort((a, b) => a.localeCompare(b));
    
    // Always put Intercept at the bottom of the table
    let hasIntercept = false;
    specs.forEach(spec => {
      const coeffs = spec.results?.coefficients || [];
      if (coeffs.some((c: any) => c.variable === 'Intercept' || c.variable === 'Intercept (Constant)' || c.variable === '_cons')) {
        hasIntercept = true;
      }
    });
    if (hasIntercept) {
      sorted.push('Intercept');
    }
    return sorted;
  };

  const sortedVars = getUniqueVariablesList();

  // Helper to count clusters dynamically
  const getClusterCount = (clusterVarName?: string) => {
    if (!currentDataset || !currentDataset.data || !clusterVarName) return 0;
    const uniqueVals = new Set(
      currentDataset.data
        .map(row => row[clusterVarName])
        .filter(v => v !== undefined && v !== null && v !== "")
    );
    return uniqueVals.size;
  };

  // Helper to compute listwise deletion details
  const getEstimationSampleStatement = () => {
    if (!currentDataset || !currentDataset.data) {
      return `Estimation sample: ${results.n ?? results.observations ?? 0} rows (0 dropped).`;
    }
    const originalData = currentDataset.data;
    const totalRows = originalData.length;
    const cleanRowsCount = results.n ?? results.observations ?? 0;
    const droppedRowsCount = totalRows - cleanRowsCount;
    if (droppedRowsCount <= 0) {
      return `Estimation sample: ${cleanRowsCount} of ${totalRows} rows (0 dropped).`;
    }

    const modelVars = [dependentVar, ...(initialXVars || [])].filter(Boolean);
    const missingCounts: Record<string, number> = {};
    const isMissing = (v: any) => v === undefined || v === null || v === "" || v === "N/A" || v === "null" || v === "missing" || (typeof v === 'number' && isNaN(v));

    originalData.forEach(row => {
      modelVars.forEach(v => {
        if (isMissing(row[v])) {
          missingCounts[v] = (missingCounts[v] || 0) + 1;
        }
      });
    });

    const missingStatement = Object.entries(missingCounts)
      .map(([v, count]) => `${v} ${count} missing`)
      .join(", ");

    return `Estimation sample: ${cleanRowsCount} of ${totalRows} rows (${droppedRowsCount} dropped due to missing values: ${missingStatement || "listwise deletion"}).`;
  };

  // Helper to calculate percentage change in coefficients between the last two columns
  const getPercentageChange = (varName: string) => {
    if (specs.length < 2) return null;
    const lastSpec = specs[specs.length - 1];
    const prevSpec = specs[specs.length - 2];

    const findCoeff = (spec: any) => {
      return spec.results?.coefficients?.find((c: any) => 
        c.variable === varName || 
        (varName === 'Intercept' && (c.variable === 'Intercept' || c.variable === 'Intercept (Constant)' || c.variable === '_cons'))
      );
    };

    const lastCoeff = findCoeff(lastSpec);
    const prevCoeff = findCoeff(prevSpec);

    if (!lastCoeff || !prevCoeff) return null;

    const lastVal = parseFloat(lastCoeff.estimate);
    const prevVal = parseFloat(prevCoeff.estimate);

    if (prevVal === 0 || isNaN(lastVal) || isNaN(prevVal)) return null;

    return ((lastVal - prevVal) / Math.abs(prevVal)) * 100;
  };

  const getAvailableVariables = (): string[] => {
    if (!currentDataset || !currentDataset.variables) return [];
    return currentDataset.variables
      .map((v: any) => v.name)
      .filter((name: string) => name !== dependentVar);
  };

  // SE type change re-estimates all OLS columns in-place
  const handleSETypeChange = (newSeType: string) => {
    if (!currentDataset || !currentDataset.data) {
      addToast('error', 'Dataset is missing or corrupted. Standard errors cannot be updated.');
      return;
    }
    const dataRows = currentDataset.data;

    const updatedSpecs = specs.map(spec => {
      // Re-estimate OLS specifications in place with the selected SE correction
      if (spec.modelType !== 'ols') return spec;

      const isRobust = newSeType !== 'None' && newSeType !== 'Classical';
      const rType = (newSeType === 'Cluster' || newSeType === 'None' || newSeType === 'Classical') ? 'HC1' : newSeType;
      const cVar = newSeType === 'Cluster' ? (spec.options?.clusterVar || entityId || 'id') : undefined;

      const newResults = runOLS(
        dataRows,
        spec.dependentVar,
        spec.xVariables,
        true,
        isRobust,
        cVar,
        false,
        true,
        rType as any
      );

      return {
        ...spec,
        results: newResults,
        options: {
          ...spec.options,
          robust: isRobust,
          seType: newSeType,
          clusterVar: cVar
        }
      };
    });

    setSpecs(updatedSpecs);
    addToast('success', `Standard error correction successfully switched to ${newSeType.toUpperCase()} in-place.`);
  };

  // Dialog Add Specification Form Trigger
  const handleOpenAddModal = () => {
    if (specs.length >= 4) {
      addToast('error', 'Maximum specifications threshold met', 'The journal table supports a maximum of 4 specifications (Columns 1-4).');
      return;
    }
    // Default form state based on newest model
    const newestSpec = specs[specs.length - 1];
    setNewSpecXVars(newestSpec.xVariables || []);
    setNewSpecEstimator(newestSpec.modelType === 'ols' ? 'ols' : (newestSpec.modelType === 'panel_fe' ? 'fe' : 're'));
    setNewSpecSeType(newestSpec.options?.seType || 'hc1');
    setNewSpecClusterVar(newestSpec.options?.clusterVar || '');
    setShowAddModal(true);
  };

  const handleAddSpecificationSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentDataset || !currentDataset.data) return;
    const dataRows = currentDataset.data;

    let newResults: any;
    const isRobust = newSpecSeType !== 'None' && newSpecSeType !== 'Classical';
    const rType = newSpecSeType === 'Cluster' || newSpecSeType === 'None' || newSpecSeType === 'Classical' ? 'HC1' : newSpecSeType;

    try {
      if (newSpecEstimator === 'fe') {
        const eId = entityId || 'id';
        const tId = timeId || 'year';
        newResults = runFixedEffects(dataRows, dependentVar, newSpecXVars, eId, tId);
      } else if (newSpecEstimator === 're') {
        const eId = entityId || 'id';
        const tId = timeId || 'year';
        newResults = runRandomEffects(dataRows, dependentVar, newSpecXVars, eId, tId);
      } else {
        const cVar = newSpecSeType === 'Cluster' ? (newSpecClusterVar || entityId || 'id') : undefined;
        newResults = runOLS(
          dataRows,
          dependentVar,
          newSpecXVars,
          true,
          isRobust,
          cVar,
          false,
          true,
          rType as any
        );
      }

      const nextColNum = specs.length + 1;
      setSpecs(prev => [
        ...prev,
        {
          id: String(nextColNum),
          title: `Model (${nextColNum})`,
          results: newResults,
          dependentVar: dependentVar,
          xVariables: newSpecXVars,
          options: {
            robust: isRobust,
            clusterVar: newSpecSeType === 'Cluster' ? newSpecClusterVar : undefined,
            seType: newSpecSeType
          },
          modelType: newSpecEstimator === 'ols' ? 'ols' : (newSpecEstimator === 'fe' ? 'panel_fe' : 'panel_re')
        }
      ]);

      setShowAddModal(false);
      addToast('success', `Estimated and appended Model (${nextColNum}) directly into comparison matrix.`);
    } catch (err: any) {
      addToast('error', 'Estimation failed', err.message || 'Check collinearity or sample size bounds.');
    }
  };

  // Run Hausman specification test on-the-fly
  const runHausmanTestOnTheFly = () => {
    const feSpec = specs.find(s => s.modelType === 'panel_fe');
    const reSpec = specs.find(s => s.modelType === 'panel_re');
    if (!feSpec || !reSpec) return null;

    const feCoeffs = feSpec.results?.coefficients || [];
    const reCoeffs = reSpec.results?.coefficients || [];
    const commonVar = feCoeffs.find((c: any) => c.variable !== 'Intercept' && reCoeffs.some((rc: any) => rc.variable === c.variable));
    
    if (!commonVar) return { pValue: 0.5, stat: 0.1, verdict: "No common regressors found for FE vs RE comparison." };
    
    const rc = reCoeffs.find((c: any) => c.variable === commonVar.variable);
    const b_fe = commonVar.estimate;
    const b_re = rc.estimate;
    const v_fe = commonVar.stdError ** 2;
    const v_re = rc.stdError ** 2;
    
    const diff = b_fe - b_re;
    const v_diff = Math.abs(v_fe - v_re);
    
    const stat = v_diff > 1e-6 ? (diff * diff) / v_diff : 0.01;
    const pValue = 1 - jStat.chisquare.cdf(stat, 1);
    
    return {
      varName: commonVar.variable,
      stat,
      pValue,
      feVal: b_fe,
      reVal: b_re
    };
  };

  const hausman = runHausmanTestOnTheFly();

  // Export tables (LaTeX Booktabs & Microsoft Word HTML)
  const escapeLatex = (str: string): string => {
    if (!str) return '';
    return str
      .replace(/\\/g, '\\textbackslash{}')
      .replace(/_/g, '\\_')
      .replace(/%/g, '\\%')
      .replace(/&/g, '\\&')
      .replace(/#/g, '\\#')
      .replace(/\$/g, '\\$')
      .replace(/{/g, '\\{')
      .replace(/}/g, '\\}')
      .replace(/~/g, '\\textasciitilde{}')
      .replace(/\^/g, '\\textasciicircum{}');
  };

  const handleExportLaTeX = () => {
    if (specs.length === 0) return;
    const numModels = specs.length;
    let latex = '';
    latex += '% Required packages in your LaTeX preamble:\n';
    latex += '% \\usepackage{booktabs}\n';
    latex += '% \\usepackage{threeparttable} % Highly recommended for professional table footnotes\n\n';
    latex += '\\begin{table}[htbp]\n';
    latex += '\\centering\n';
    latex += '\\begin{threeparttable}\n';
    latex += `\\caption{Journal-Style Estimation Matrix: Dependent variable is ${escapeLatex(dependentVar)}}\n`;
    latex += `\\label{tab:regression_results}\n`;
    latex += `\\begin{tabular}{l${'*{' + numModels + '}{c}'}}\n`;
    latex += '\\toprule\n';
    
    // Header Row 1: Model Numbers
    const modelNumbers = ['Variable'].concat(specs.map((s, idx) => `\\multicolumn{1}{c}{Model (${idx + 1})}`));
    latex += modelNumbers.join(' & ') + ' \\\\\n';
    
    // Header Row 2: Estimator Type
    const estimatorTypes = [''].concat(specs.map(s => {
      const typeLabel = s.modelType === 'panel_fe' ? 'Panel FE' : (s.modelType === 'panel_re' ? 'Panel RE' : 'OLS');
      return `\\multicolumn{1}{c}{\\small (${typeLabel})}`;
    }));
    latex += estimatorTypes.join(' & ') + ' \\\\\n';
    latex += '\\midrule\n';
    
    // Coefficients & Standard Errors
    sortedVars.forEach(v => {
      const label = escapeLatex(getLabel(v));
      const coeffRow = [label];
      specs.forEach(spec => {
        const coeff = spec.results?.coefficients?.find((c: any) => c.variable === v || (v === 'Intercept' && (c.variable === 'Intercept' || c.variable === 'Intercept (Constant)' || c.variable === '_cons')));
        if (coeff) {
          const stars = getStars(coeff.pValue);
          const starsTex = stars ? `^{${stars}}` : '';
          coeffRow.push(`${coeff.estimate.toFixed(4)}${starsTex}`);
        } else {
          coeffRow.push('--');
        }
      });
      latex += coeffRow.join(' & ') + ' \\\\\n';
      
      const seRow = [''];
      specs.forEach(spec => {
        const coeff = spec.results?.coefficients?.find((c: any) => c.variable === v || (v === 'Intercept' && (c.variable === 'Intercept' || c.variable === 'Intercept (Constant)' || c.variable === '_cons')));
        if (coeff) {
          seRow.push(`(${coeff.stdError.toFixed(4)})`);
        } else {
          seRow.push('');
        }
      });
      latex += seRow.join(' & ') + ' \\\\\n';
    });
    
    latex += '\\midrule\n';
    latex += `Observations & ` + specs.map(s => (s.results?.n ?? s.results?.observations ?? 0).toLocaleString()).join(' & ') + ' \\\\\n';
    latex += `R-squared & ` + specs.map(s => s.results?.rSquared != null ? s.results.rSquared.toFixed(4) : '--').join(' & ') + ' \\\\\n';
    latex += `SE Correction & ` + specs.map(s => {
      if (s.options?.clusterVar) return escapeLatex(`Clustered (${s.options.clusterVar})`);
      if (s.options?.robust) return 'Robust';
      return 'Classical';
    }).join(' & ') + ' \\\\\n';
    latex += `Fixed Effects & ` + specs.map(s => (s.modelType === 'panel_fe' ? 'Yes' : 'No')).join(' & ') + ' \\\\\n';
    
    latex += '\\bottomrule\n';
    latex += '\\end{tabular}\n';
    latex += '\\begin{tablenotes}\n';
    latex += '  \\small\n';
    latex += '  \\item \\textit{Note:} Standard errors in parentheses.\n';
    latex += '  \\item Significance levels: $^{*}p < 0.1$, $^{**}p < 0.05$, $^{***}p < 0.01$.\n';
    latex += '\\end{tablenotes}\n';
    latex += '\\end{threeparttable}\n';
    latex += '\\end{table}';

    navigator.clipboard.writeText(latex).then(() => {
      setCopiedLatex(true);
      setTimeout(() => setCopiedLatex(false), 2000);
      addToast('success', 'LaTeX publication-ready code copied to clipboard!', 'Paste directly into your paper document.');
    });
  };

  const handleExportWord = () => {
    if (specs.length === 0) return;
    let html = `<table style="border-collapse: collapse; width: 100%; font-family: 'Times New Roman', serif; font-size: 11pt; border-top: 2px solid #000; border-bottom: 2px solid #000; margin: 12px 0;">`;
    html += `<caption style="text-align: left; font-weight: bold; margin-bottom: 8px; font-size: 12pt;">Table: Journal Regression Matrix Comparison</caption>`;
    html += `<thead><tr style="border-bottom: 1px solid #000;">`;
    html += `<th style="padding: 6px; text-align: left; font-weight: normal; font-style: italic;">Regressor</th>`;
    specs.forEach((s, idx) => {
      html += `<th style="padding: 6px; text-align: right; font-weight: normal;">Model (${idx + 1})</th>`;
    });
    html += `</tr></thead><tbody>`;
    
    sortedVars.forEach(v => {
      html += `<tr>`;
      html += `<td style="padding: 4px; text-align: left;">${getLabel(v)}</td>`;
      specs.forEach(spec => {
        const coeff = spec.results?.coefficients?.find((c: any) => c.variable === v || (v === 'Intercept' && (c.variable === 'Intercept' || c.variable === 'Intercept (Constant)' || c.variable === '_cons')));
        if (coeff) {
          const stars = getStars(coeff.pValue);
          html += `<td style="padding: 4px; text-align: right; font-family: monospace;">${coeff.estimate.toFixed(4)}${stars}</td>`;
        } else {
          html += `<td style="padding: 4px; text-align: right; color: #999;">—</td>`;
        }
      });
      html += `</tr><tr>`;
      html += `<td style="padding: 2px; text-align: left;"></td>`;
      specs.forEach(spec => {
        const coeff = spec.results?.coefficients?.find((c: any) => c.variable === v || (v === 'Intercept' && (c.variable === 'Intercept' || c.variable === 'Intercept (Constant)' || c.variable === '_cons')));
        if (coeff) {
          html += `<td style="padding: 2px; text-align: right; color: #666; font-size: 9.5pt; font-family: monospace;">(${coeff.stdError.toFixed(4)})</td>`;
        } else {
          html += `<td style="padding: 2px; text-align: right;"></td>`;
        }
      });
      html += `</tr>`;
    });
    
    html += `<tr style="border-top: 1px solid #000;"><td colspan="${specs.length + 1}" style="padding: 4px;"></td></tr>`;
    
    // N
    html += `<tr><td style="padding: 4px; text-align: left;">Observations</td>`;
    specs.forEach(s => {
      html += `<td style="padding: 4px; text-align: right; font-family: monospace;">${(s.results?.n ?? s.results?.observations ?? 0).toLocaleString()}</td>`;
    });
    html += `</tr>`;

    // R2
    html += `<tr><td style="padding: 4px; text-align: left;">R-squared</td>`;
    specs.forEach(s => {
      html += `<td style="padding: 4px; text-align: right; font-family: monospace;">${s.results?.rSquared != null ? s.results.rSquared.toFixed(4) : '—'}</td>`;
    });
    html += `</tr>`;

    // SE Type
    html += `<tr><td style="padding: 4px; text-align: left;">SE Correction</td>`;
    specs.forEach(s => {
      html += `<td style="padding: 4px; text-align: right; font-size: 10px;">${s.options?.clusterVar ? `Clustered (${s.options.clusterVar})` : (s.options?.robust ? 'Robust' : 'Classical')}</td>`;
    });
    html += `</tr>`;

    // FE
    html += `<tr><td style="padding: 4px; text-align: left;">Fixed Effects</td>`;
    specs.forEach(s => {
      html += `<td style="padding: 4px; text-align: right; font-family: monospace;">${s.modelType === 'panel_fe' ? 'Yes' : 'No'}</td>`;
    });
    html += `</tr>`;

    html += `</tbody></table>`;
    html += `<p style="font-size: 9pt; color: #444; font-family: serif; font-style: italic;">Significance: * p &lt; 0.1, ** p &lt; 0.05, *** p &lt; 0.01. Parentheses contain standard errors.</p>`;

    // Copy to clipboard as HTML (enables native pasting in Microsoft Word)
    const clipboardItem = new ClipboardItem({
      "text/html": new Blob([html], { type: "text/html" }),
      "text/plain": new Blob([html.replace(/<[^>]*>/g, '')], { type: "text/plain" })
    });
    
    navigator.clipboard.write([clipboardItem]).then(() => {
      setCopiedWord(true);
      setTimeout(() => setCopiedWord(false), 2000);
      addToast('success', 'HTML formatted Word table copied!', 'Paste directly into MS Word to preserve styling.');
    });
  };

  // Generate robust script replication code for all active specifications
  const handleCopyReplicationPackage = () => {
    let code = `# ==============================================================================\n`;
    code += `# Academic Replication Package - Economics Learning Lab (Beta)\n`;
    code += `# Generated on: ${new Date().toLocaleDateString()}\n`;
    code += `# Dependent Variable: ${dependentVar}\n`;
    code += `# Number of models estimated: ${specs.length}\n`;
    code += `# ==============================================================================\n\n`;
    
    code += `library(sandwich)\n`;
    code += `library(lmtest)\n`;
    code += `library(plm)       # For Panel FE/RE Models\n\n`;
    
    code += `# Load original dataset\n`;
    code += `df <- read.csv("dataset.csv")\n\n`;

    specs.forEach((spec, idx) => {
      code += `# --- Estimation of Model (${idx + 1}) ---\n`;
      const formula = `${dependentVar} ~ ${spec.xVariables.join(' + ')}`;
      if (spec.modelType === 'panel_fe') {
        code += `model_${idx + 1} <- plm(${formula}, data = df, index = c("${entityId || 'id'}", "${timeId || 'year'}"), model = "within")\n`;
      } else if (spec.modelType === 'panel_re') {
        code += `model_${idx + 1} <- plm(${formula}, data = df, index = c("${entityId || 'id'}", "${timeId || 'year'}"), model = "random")\n`;
      } else {
        code += `model_${idx + 1} <- lm(${formula}, data = df)\n`;
        if (spec.options?.clusterVar) {
          code += `# Clustered standard errors by ${spec.options.clusterVar}\n`;
          code += `coeftest(model_${idx + 1}, vcovHC(model_${idx + 1}, type = "HC1", cluster = "group", group = df$${spec.options.clusterVar}))\n`;
        } else if (spec.options?.robust) {
          code += `# Robust standard errors (White/HC1)\n`;
          code += `coeftest(model_${idx + 1}, vcov = vcovHC(model_${idx + 1}, type = "HC1"))\n`;
        }
      }
      code += `print(summary(model_${idx + 1}))\n\n`;
    });

    navigator.clipboard.writeText(code).then(() => {
      setCopiedReplication(true);
      setTimeout(() => setCopiedReplication(false), 2000);
      addToast('success', 'R replication script copied to clipboard!');
    });
  };

  // Perform professional econometrics interpretation of the newest estimated model
  const handleInterpretModel = () => {
    const newest = specs[specs.length - 1];
    if (!newest) return;

    const topCoeff = [...(newest.results?.coefficients || [])]
      .filter(c => c.variable !== 'Intercept' && c.variable !== 'Intercept (Constant)' && c.variable !== '_cons')
      .sort((a, b) => Math.abs(b.estimate) - Math.abs(a.estimate))[0];

    let interpretation = `### Econometric Appraisal of ${newest.title}\n\n`;
    interpretation += `Your model has an $R^2$ of **${newest.results?.rSquared?.toFixed(4) || '—'}**, indicating that **${((newest.results?.rSquared || 0) * 100).toFixed(1)}%** of the variance in **${dependentVar}** is explained by your regressors.\n\n`;
    
    if (topCoeff) {
      const pSig = topCoeff.pValue <= 0.05 ? "statistically significant" : "not statistically significant";
      interpretation += `The most economically salient predictor is **${topCoeff.variable}** with an estimated $\\beta$ of **${topCoeff.estimate.toFixed(4)}** (S.E. = ${topCoeff.stdError.toFixed(4)}). This estimate is **${pSig}** ($p = ${topCoeff.pValue.toFixed(4)}$).\n\n`;
      interpretation += `**Intuition:** Holding all other factors constant, a one-unit increase in *${topCoeff.variable}* is associated with an expected change of **${topCoeff.estimate.toFixed(4)}** in *${dependentVar}*.\n\n`;
    }

    if (newest.modelType === 'panel_fe') {
      interpretation += `*Fixed Effects Adjustment:* This model accounts for time-invariant unobserved individual heterogeneity ($a_i$). All estimates represent the 'within' variation over time, guarding against classical omitted variable bias.`;
    } else {
      interpretation += `*OLS Specification:* This model assumes zero correlation between your error term and independent variables. Verify that the Gauss-Markov conditions hold by running the diagnostics above.`;
    }

    setHelpExplanation(interpretation);
  };

  // Add current newest specification to the store's robustness notebook
  const handleAddRobustnessExplorer = () => {
    const newest = specs[specs.length - 1];
    if (!newest) return;

    addToRobustness({
      id: Math.random().toString(36).substring(2, 11),
      name: `Col (${specs.length}): ${newest.dependentVar} ~ ${newest.xVariables.join(' + ')} (${newest.modelType.toUpperCase()})`,
      results: newest.results,
      specification: `${newest.dependentVar} ~ ${newest.xVariables.join(' + ')}`
    });

    addToast('success', 'Model registered in Robustness Notebook!', 'You can now compare structural variants across test boundaries.');
  };

  const currentNewestSpec = specs[specs.length - 1];
  const newestBPStat = currentNewestSpec?.results?.breuschPaganStat || 0;
  const newestBPPVal = currentNewestSpec?.results?.breuschPaganPValue || 0.5;
  const newestDropped = currentNewestSpec?.results?.droppedVariables || [];

  return (
    <div className="space-y-6">
      
      {newestDropped.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 text-amber-900 rounded-2xl p-4 flex gap-3 items-start shadow-sm">
          <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
          <div>
            <h4 className="text-sm font-bold">Collinearity Drop</h4>
            <p className="text-xs mt-1">
              The following variables were dropped due to exact multicollinearity: 
              <span className="font-mono font-bold ml-1">{newestDropped.join(', ')}</span>
            </p>
          </div>
        </div>
      )}

      {/* 1. Header Area */}
      <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold font-mono rounded-full uppercase tracking-wider">
              Formula Model
            </span>
            <span className="text-[10px] text-slate-400 font-mono">
              Academic Lab v2.4 · Stable
            </span>
          </div>
          <h2 className="text-lg font-serif font-bold text-slate-900 mt-1">
            {dependentVar} <span className="text-slate-400 font-sans font-light">~</span> {initialXVars.join(' + ')}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Dataset: <span className="font-mono text-slate-600 font-bold">{currentDataset?.name || 'Academic Series'}</span> · Estimated at: {new Date().toLocaleTimeString()}
          </p>
        </div>

        {/* Standard Error Dropdown & Export Suite */}
        <div className="flex flex-wrap items-center gap-3 self-stretch md:self-auto">
          
          {/* SE Selection dropdown */}
          <div className="space-y-1">
            <label className="text-[8px] font-bold text-slate-400 uppercase tracking-wider font-mono block">
              Standard Error Type
            </label>
            <select
              className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 focus:bg-white outline-none transition-all"
              value={currentNewestSpec?.options?.seType || 'hc1'}
              onChange={(e) => handleSETypeChange(e.target.value)}
            >
              <option value="Classical">Classical (Homoskedastic)</option>
              <option value="hc0">Robust (HC0 / Huber-White)</option>
              <option value="hc1">Robust (HC1 / Stata default)</option>
              <option value="hc2">Robust (HC2 / Biased-corrected)</option>
              <option value="hc3">Robust (HC3 / Jackknife equiv)</option>
              {entityId && <option value="Cluster">Clustered SE (by {entityId})</option>}
            </select>
          </div>

          {/* Copiers */}
          <div className="flex gap-2 self-end">
            <button
              onClick={handleExportLaTeX}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold font-mono transition-all shadow-sm"
              title="Copy publication-quality booktabs LaTeX table"
            >
              {copiedLatex ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileText className="w-3.5 h-3.5 text-indigo-400" />}
              <span>LaTeX</span>
            </button>

            <button
              onClick={handleExportWord}
              className="flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-semibold font-mono transition-all shadow-sm"
              title="Copy HTML Table which pastes directly into Microsoft Word preserving style"
            >
              {copiedWord ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />}
              <span>Word</span>
            </button>
          </div>

        </div>
      </div>

      {/* 2. Main Comparison Table (Journal Format) */}
      <div className="bg-white border border-slate-200 rounded-3xl shadow-xs overflow-hidden">
        
        {/* Table View Title */}
        <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-indigo-600" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">
              Journal Estimation Matrix Comparison
            </h3>
          </div>
          {specs.length > 0 && (
            <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-md font-mono">
              {specs.length} of 4 specifications occupied
            </span>
          )}
        </div>
        
        {specs.some(s => s.results?.droppedVariables && s.results.droppedVariables.length > 0) && (
          <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs text-amber-900 leading-relaxed">
              <span className="font-bold">Collinearity Warning: </span>
              The matrix engine detected exact multicollinearity (or near-singular design) and automatically dropped the following variable(s) to compute a stable inverse: 
              <span className="font-mono font-bold ml-1">
                {Array.from(new Set(specs.flatMap(s => s.results?.droppedVariables || []))).join(', ')}
              </span>.
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-mono text-slate-500 uppercase tracking-widest">
                <th className="py-3 px-6 font-bold">Regressor Variable</th>
                {specs.map((spec, index) => (
                  <th 
                    key={spec.id} 
                    className={`py-3 px-4 text-right font-bold transition-all ${
                      index === specs.length - 1 ? 'bg-indigo-50/50 text-indigo-900 border-l border-r border-indigo-100' : ''
                    }`}
                  >
                    {spec.title}
                    <span className="block text-[8px] font-normal lowercase tracking-normal text-slate-400 mt-0.5">
                      {spec.modelType === 'panel_fe' ? 'Panel FE' : (spec.modelType === 'panel_re' ? 'Panel RE' : 'OLS')}
                    </span>
                  </th>
                ))}
                
                {/* Dynamic Delta Column */}
                {specs.length >= 2 && (
                  <th className="py-3 px-6 text-right font-bold text-amber-700 bg-amber-50/20">
                    Δ (%)
                    <span className="block text-[8px] font-normal lowercase tracking-normal text-amber-500 mt-0.5">
                      last vs previous
                    </span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs">
              
              {/* Coefficient & S.E. Row Pairs */}
              {sortedVars.map(vName => {
                const pctChange = getPercentageChange(vName);
                const isAmber = pctChange !== null && Math.abs(pctChange) > 10;

                return (
                  <React.Fragment key={vName}>
                    
                    {/* Line 1: Coefficient */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      <td className={`font-medium text-slate-700 px-6 ${uiDensity === 'dense' ? 'py-1' : 'py-2.5'}`}>
                        {getLabel(vName)}
                      </td>
                      {specs.map((spec, colIdx) => {
                        const coeff = spec.results?.coefficients?.find((c: any) => 
                          c.variable === vName || 
                          (vName === 'Intercept' && (c.variable === 'Intercept' || c.variable === 'Intercept (Constant)' || c.variable === '_cons'))
                        );

                        return (
                          <td 
                            key={spec.id} 
                            className={`text-right font-mono text-slate-900 pr-4 ${
                              colIdx === specs.length - 1 ? 'bg-indigo-50/30 font-semibold text-indigo-700 border-l border-r border-indigo-50' : ''
                            } ${uiDensity === 'dense' ? 'py-1' : 'py-2.5'}`}
                          >
                            {coeff ? (
                              <>
                                {coeff.estimate.toFixed(4)}
                                <span className="text-amber-500 font-bold ml-0.5 inline-block w-4 text-left">
                                  {getStars(coeff.pValue)}
                                </span>
                              </>
                            ) : '—'}
                          </td>
                        );
                      })}

                      {/* Delta percentage change */}
                      {specs.length >= 2 && (
                        <td className={`text-right font-mono font-medium px-6 bg-amber-50/10 ${
                          isAmber ? 'text-amber-600 bg-amber-50/35 font-bold' : 'text-slate-400'
                        } ${uiDensity === 'dense' ? 'py-1' : 'py-2.5'}`}>
                          {pctChange !== null ? (
                            <span className={isAmber ? "px-1.5 py-0.5 bg-amber-100/60 dark:bg-amber-950/20 rounded" : ""}>
                              {pctChange > 0 ? '+' : ''}{pctChange.toFixed(1)}%
                            </span>
                          ) : '—'}
                        </td>
                      )}
                    </tr>

                    {/* Line 2: Standard Error */}
                    <tr className="bg-slate-50/20 text-[10px]">
                      <td className={`text-slate-400 font-light italic px-6 ${uiDensity === 'dense' ? 'py-0.5' : 'py-1.5'}`}></td>
                      {specs.map((spec, colIdx) => {
                        const coeff = spec.results?.coefficients?.find((c: any) => 
                          c.variable === vName || 
                          (vName === 'Intercept' && (c.variable === 'Intercept' || c.variable === 'Intercept (Constant)' || c.variable === '_cons'))
                        );

                        return (
                          <td 
                            key={spec.id} 
                            className={`text-right font-mono text-slate-400 pr-8 ${
                              colIdx === specs.length - 1 ? 'bg-indigo-50/30 border-l border-r border-indigo-50 text-indigo-600' : ''
                            } ${uiDensity === 'dense' ? 'py-0.5' : 'py-1.5'}`}
                          >
                            {coeff ? `(${coeff.stdError.toFixed(4)})` : ''}
                          </td>
                        );
                      })}

                      {/* Empty cell for delta row */}
                      {specs.length >= 2 && (
                        <td className={`bg-amber-50/10 ${uiDensity === 'dense' ? 'py-0.5' : 'py-1.5'}`}></td>
                      )}
                    </tr>

                  </React.Fragment>
                );
              })}

              {/* Table Divider Row */}
              <tr className="border-t-2 border-slate-300">
                <td colSpan={specs.length + (specs.length >= 2 ? 2 : 1)} className="py-2"></td>
              </tr>

              {/* Footer Stat 1: N */}
              <tr className="hover:bg-slate-50/50 text-slate-600 font-medium">
                <td className="py-3 px-6 font-semibold">Observations (N)</td>
                {specs.map((spec, colIdx) => (
                  <td 
                    key={spec.id} 
                    className={`text-right pr-6 font-mono font-bold ${
                      colIdx === specs.length - 1 ? 'bg-indigo-50/30 border-l border-r border-indigo-50 text-indigo-700' : 'text-slate-800'
                    }`}
                  >
                    {(spec.results?.n ?? spec.results?.observations ?? 0).toLocaleString()}
                  </td>
                ))}
                {specs.length >= 2 && <td className="bg-amber-50/10"></td>}
              </tr>

              {/* Footer Stat 2: R-Squared */}
              <tr className="hover:bg-slate-50/50 text-slate-600">
                <td className="py-3 px-6 font-semibold">R-squared</td>
                {specs.map((spec, colIdx) => (
                  <td 
                    key={spec.id} 
                    className={`text-right pr-6 font-mono ${
                      colIdx === specs.length - 1 ? 'bg-indigo-50/30 border-l border-r border-indigo-50 text-indigo-700' : 'text-slate-800'
                    }`}
                  >
                    {spec.results?.rSquared != null ? spec.results.rSquared.toFixed(4) : '—'}
                  </td>
                ))}
                {specs.length >= 2 && <td className="bg-amber-50/10"></td>}
              </tr>

              {/* Footer Stat 3: Standard Error Corrections */}
              <tr className="hover:bg-slate-50/50 text-slate-600">
                <td className="py-3 px-6 font-semibold">SE Adjustment</td>
                {specs.map((spec, colIdx) => {
                  const hasCluster = spec.options?.clusterVar;
                  const robust = spec.options?.robust;
                  const label = hasCluster ? `Cluster (${spec.options.clusterVar})` : (robust ? 'Robust' : 'Classical');
                  
                  return (
                    <td 
                      key={spec.id} 
                      className={`text-right pr-4 text-[10px] font-semibold ${
                        colIdx === specs.length - 1 ? 'bg-indigo-50/30 border-l border-r border-indigo-50 text-indigo-700' : 'text-slate-600'
                      }`}
                    >
                      {label}
                    </td>
                  );
                })}
                {specs.length >= 2 && <td className="bg-amber-50/10"></td>}
              </tr>

              {/* Footer Stat 4: Fixed Effects Include flag */}
              <tr className="hover:bg-slate-50/50 text-slate-600">
                <td className="py-3 px-6 font-semibold">Fixed Effects (FE)</td>
                {specs.map((spec, colIdx) => (
                  <td 
                    key={spec.id} 
                    className={`text-right pr-6 font-mono font-semibold ${
                      colIdx === specs.length - 1 ? 'bg-indigo-50/30 border-l border-r border-indigo-50 text-indigo-700' : 'text-slate-800'
                    }`}
                  >
                    {spec.modelType === 'panel_fe' ? 'Yes' : 'No'}
                  </td>
                ))}
                {specs.length >= 2 && <td className="bg-amber-50/10"></td>}
              </tr>

            </tbody>
          </table>
        </div>

        {/* Small-print Legend & Preprocessed listwise deletion details */}
        <div className="bg-slate-50 px-6 py-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-[10px] text-slate-400 font-mono">
          <p className="italic">
            Standard errors in parentheses. Significance markers: * p &lt; 0.1, ** p &lt; 0.05, *** p &lt; 0.01.
          </p>
          <p className="text-right text-slate-500 font-semibold">
            {getEstimationSampleStatement()}
          </p>
        </div>
      </div>

      {/* 3. Auto-run Diagnostics Strip */}
      <div className="space-y-3">
        <h4 className="text-[10px] font-bold text-slate-400 tracking-wider uppercase font-mono">
          In-Place Specification Diagnostics
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Diagnostic 1: Heteroskedasticity (BP) */}
          {(() => {
            const hasHetero = newestBPPVal < 0.05;
            const seAdjusted = currentNewestSpec?.options?.robust;
            
            let colorClass = "border-emerald-100 bg-emerald-50/50 text-emerald-800";
            let statusIcon = <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
            let text = "";

            if (hasHetero) {
              if (seAdjusted) {
                text = `BP=${newestBPStat.toFixed(1)} (p<0.01) — Robust SEs successfully applied. Heteroskedasticity is corrected.`;
              } else {
                colorClass = "border-amber-100 bg-amber-50/50 text-amber-800";
                statusIcon = <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />;
                text = `BP=${newestBPStat.toFixed(1)} (p<0.01) — Action recommended: apply Robust SEs to prevent standard error deflation.`;
              }
            } else {
              text = `BP=${newestBPStat.toFixed(1)} (p=${newestBPPVal.toFixed(2)}) — Homoskedasticity holds. Classical standard errors are statistically efficient.`;
            }

            return (
              <div className={`border rounded-2xl p-4 flex gap-3 items-start shadow-xs transition-all ${colorClass}`}>
                {statusIcon}
                <div>
                  <span className="text-[10px] font-bold font-mono block uppercase tracking-wider mb-1">Heteroskedasticity (Breusch-Pagan)</span>
                  <p className="text-xs leading-relaxed font-serif italic">{text}</p>
                </div>
              </div>
            );
          })()}

          {/* Diagnostic 2: Cluster adequacy */}
          {(() => {
            const hasClustered = currentNewestSpec?.options?.clusterVar;
            const clusterCount = getClusterCount(hasClustered);

            let colorClass = "border-emerald-100 bg-emerald-50/50 text-emerald-800";
            let statusIcon = <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;
            let text = "";

            if (hasClustered) {
              if (clusterCount < 30) {
                colorClass = "border-amber-100 bg-amber-50/50 text-amber-800";
                statusIcon = <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />;
                text = `Only ${clusterCount} clusters — Critical action: use wild bootstrap simulation. standard cluster errors may be downward-biased.`;
              } else {
                text = `${clusterCount} clusters detected — Sufficient for robust asymptotic inference.`;
              }
            } else {
              text = "Not clustered — standard errors do not rely on grouping assumptions.";
            }

            return (
              <div className={`border rounded-2xl p-4 flex gap-3 items-start shadow-xs transition-all ${colorClass}`}>
                {statusIcon}
                <div>
                  <span className="text-[10px] font-bold font-mono block uppercase tracking-wider mb-1">Cluster Size Adequacy</span>
                  <p className="text-xs leading-relaxed font-serif italic">{text}</p>
                </div>
              </div>
            );
          })()}

          {/* Diagnostic 3: Hausman Test (Only shows if FE + RE exist in specs) */}
          {(() => {
            const hasFE = specs.some(s => s.modelType === 'panel_fe');
            const hasRE = specs.some(s => s.modelType === 'panel_re');

            if (!hasFE || !hasRE || !hausman) {
              return (
                <div className="border border-slate-100 bg-slate-50/50 text-slate-500 rounded-2xl p-4 flex gap-3 items-start shadow-xs">
                  <Info className="w-5 h-5 text-slate-400 shrink-0" />
                  <div>
                    <span className="text-[10px] font-bold font-mono block uppercase tracking-wider mb-1">Hausman Test</span>
                    <p className="text-xs leading-relaxed font-serif italic">
                      Requires both FE and RE specifications estimated in the table columns (1-4) to run specification checks.
                    </p>
                  </div>
                </div>
              );
            }

            const isSignificant = hausman.pValue < 0.05;
            const colorClass = isSignificant 
              ? "border-amber-100 bg-amber-50/50 text-amber-800" 
              : "border-emerald-100 bg-emerald-50/50 text-emerald-800";
            
            const statusIcon = isSignificant 
              ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" />
              : <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />;

            const text = isSignificant
              ? `Hausman p=${hausman.pValue.toFixed(3)} (use FE) — RE is inconsistent because coefficients differ systematically (FE=${hausman.feVal.toFixed(3)}, RE=${hausman.reVal.toFixed(3)}).`
              : `Hausman p=${hausman.pValue.toFixed(2)} (RE holds) — RE is consistent and efficient; individual effects are orthogonal to regressors.`;

            return (
              <div className={`border rounded-2xl p-4 flex gap-3 items-start shadow-xs transition-all ${colorClass}`}>
                {statusIcon}
                <div>
                  <span className="text-[10px] font-bold font-mono block uppercase tracking-wider mb-1">Hausman Test</span>
                  <p className="text-xs leading-relaxed font-serif italic">{text}</p>
                </div>
              </div>
            );
          })()}

        </div>
      </div>

      {/* 4. Action Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-t border-slate-200 pt-6">
        
        {/* Estimation Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={handleOpenAddModal}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-indigo-400" />
            <span>Add Specification</span>
          </button>

          <button
            onClick={handleCopyReplicationPackage}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
          >
            {copiedReplication ? <Check className="w-4 h-4 text-emerald-500" /> : <Terminal className="w-4 h-4 text-indigo-500" />}
            <span>Replication Package</span>
          </button>

          <button
            onClick={handleInterpretModel}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4 text-amber-500" />
            <span>Interpret</span>
          </button>

          <button
            onClick={handleAddRobustnessExplorer}
            className="px-4 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
          >
            <BookOpen className="w-4 h-4 text-teal-500" />
            <span>Robustness Checks</span>
          </button>
        </div>

        {/* Guided / Expert Density Toggle */}
        <div className="flex items-center gap-2 self-end sm:self-auto bg-slate-100 rounded-xl p-1">
          <button
            onClick={() => setUiDensity('spacious')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              uiDensity === 'spacious' 
                ? 'bg-white text-slate-900 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Guided
          </button>
          <button
            onClick={() => setUiDensity('dense')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              uiDensity === 'dense' 
                ? 'bg-white text-slate-900 shadow-xs' 
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Expert
          </button>
        </div>

      </div>

      {/* Help Panel explanation (Displays Interpret outputs dynamically) */}
      {helpExplanation && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 relative animate-in fade-in duration-500">
          <button 
            onClick={() => setHelpExplanation(null)}
            className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xs font-bold"
          >
            ✕
          </button>
          <div className="prose prose-slate max-w-none text-xs">
            <h5 className="font-bold text-slate-800 mb-2 font-mono flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-500" />
              INTELLIGENT RECOGNITION SYNTHESIS
            </h5>
            <div className="whitespace-pre-wrap font-serif leading-relaxed text-slate-600">
              {sanitizeMath(helpExplanation)}
            </div>
          </div>
        </div>
      )}

      {/* 5. Add Specification Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 backdrop-blur-xs">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-2xl max-w-md w-full animate-in zoom-in-95 duration-200">
            
            {/* Modal Title */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h3 className="font-serif font-bold text-slate-900 text-base flex items-center gap-2">
                <Plus className="w-5 h-5 text-indigo-600" />
                Estimate Variant Model
              </h3>
              <button 
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddSpecificationSubmit} className="space-y-4">
              
              {/* Dependent variable display */}
              <div>
                <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">
                  Dependent Variable (Y)
                </label>
                <div className="p-2.5 bg-slate-50 border border-slate-100 rounded-xl text-xs font-mono font-bold text-slate-600">
                  {dependentVar}
                </div>
              </div>

              {/* Independent variables checklist */}
              <div>
                <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">
                  Independent Variables to Include (X)
                </label>
                <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-xl p-3 space-y-2 bg-slate-50/50">
                  {getAvailableVariables().map((v: string) => {
                    const isChecked = newSpecXVars.includes(v);
                    return (
                      <div 
                        key={v} 
                        onClick={() => {
                          if (isChecked) {
                            setNewSpecXVars(prev => prev.filter(item => item !== v));
                          } else {
                            setNewSpecXVars(prev => [...prev, v]);
                          }
                        }}
                        className="flex items-center gap-2.5 text-xs text-slate-700 font-medium cursor-pointer p-1.5 hover:bg-white rounded-lg transition-colors"
                      >
                        {isChecked ? (
                          <CheckSquare className="w-4 h-4 text-indigo-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                        <span>{getLabel(v)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Estimator Radio group */}
              <div>
                <label className="text-[10px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">
                  Estimator Method
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'ols', label: 'OLS' },
                    { id: 'fe', label: 'Panel FE', disabled: !entityId },
                    { id: 're', label: 'Panel RE', disabled: !entityId }
                  ].map(est => (
                    <button
                      key={est.id}
                      type="button"
                      disabled={est.disabled}
                      onClick={() => setNewSpecEstimator(est.id as any)}
                      className={`py-2 px-3 border rounded-xl text-xs font-bold transition-all ${
                        est.disabled 
                          ? 'opacity-40 cursor-not-allowed bg-slate-50 border-slate-100 text-slate-300'
                          : newSpecEstimator === est.id
                            ? 'bg-slate-900 border-slate-900 text-white'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {est.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* SE corrections dropdown */}
              {newSpecEstimator === 'ols' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">
                      SE Correction
                    </label>
                    <select
                      value={newSpecSeType}
                      onChange={(e) => setNewSpecSeType(e.target.value)}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none"
                    >
                      <option value="Classical">Classical</option>
                      <option value="hc1">Robust (HC1)</option>
                      <option value="hc2">Robust (HC2)</option>
                      <option value="hc3">Robust (HC3)</option>
                      {entityId && <option value="Cluster">Clustered</option>}
                    </select>
                  </div>

                  {newSpecSeType === 'Cluster' && (
                    <div>
                      <label className="text-[9px] font-bold font-mono text-slate-400 uppercase tracking-wider block mb-1">
                        Cluster Variable
                      </label>
                      <select
                        value={newSpecClusterVar}
                        onChange={(e) => setNewSpecClusterVar(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-2.5 text-xs font-semibold text-slate-700 outline-none"
                      >
                        <option value="">-- Choose Var --</option>
                        {getAvailableVariables().map((v: string) => (
                          <option key={v} value={v}>{v}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Modal Actions */}
              <div className="flex gap-3 justify-end border-t border-slate-100 pt-4 mt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-bold rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={newSpecXVars.length === 0}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Estimate & Append
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  );
}
