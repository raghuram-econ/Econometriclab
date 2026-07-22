import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Settings, 
  Check, 
  HelpCircle, 
  RefreshCw, 
  AlertCircle, 
  Info, 
  FileSpreadsheet, 
  Tags,
  Compass
} from 'lucide-react';
import { useVariableMetadata, VariableMetadata, VariableType } from '../../hooks/useVariableMetadata';
import { Dataset, Variable, DataType } from '../../types';
import { cn } from '../../lib/utils';
import { useStore } from '../../store/useStore';

interface VariableViewProps {
  dataset: Dataset | null;
  variableMetadata: VariableMetadata;
  onApplyMetadata: (metadata: VariableMetadata) => void;
}

export default function VariableView({ dataset, variableMetadata, onApplyMetadata }: VariableViewProps) {
  const { addToast } = useStore();
  const headers = React.useMemo(() => {
    if (!dataset) return [];
    // Prefer headers if present, otherwise map from variables list
    return dataset.headers || dataset.variables?.map(v => v.name) || [];
  }, [dataset]);

  const [localMetadata, setLocalMetadata] = useState<VariableMetadata>({});
  const [isApplying, setIsApplying] = useState(false);

  // Synchronize local edit state whenever global metadata changes
  useEffect(() => {
    if (variableMetadata && Object.keys(variableMetadata).length > 0) {
      // Create a deep copy for safe local modification
      const copy: VariableMetadata = {};
      Object.keys(variableMetadata).forEach(key => {
        const item = variableMetadata[key];
        if (item) {
          copy[key] = {
            label: item.label,
            type: item.type,
            missingCode: item.missingCode,
            description: item.description
          };
        }
      });
      setLocalMetadata(copy);
    } else {
      setLocalMetadata({});
    }
  }, [variableMetadata]);

  if (!dataset) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="card-premium p-10 bg-white border border-stone-200 rounded-3xl shadow-sm space-y-6">
          <div className="inline-flex p-4 rounded-full bg-amber-50 border border-amber-200 text-amber-600">
            <AlertCircle className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-bold text-stone-800">No Dataset Loaded</h3>
            <p className="text-stone-500 text-sm max-w-md mx-auto">
              Please upload an econometric CSV/Excel file or load a research template in the Onboarding Lab first before accessing the Variable View workbench.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const handleFieldChange = (originalName: string, field: 'label' | 'description', value: string) => {
    setLocalMetadata(prev => {
      const current = prev[originalName] || { label: originalName, type: 'continuous', missingCode: null, description: '' };
      return {
        ...prev,
        [originalName]: {
          ...current,
          [field]: value
        }
      };
    });
  };

  const handleTypeChange = (originalName: string, value: VariableType) => {
    setLocalMetadata(prev => {
      const current = prev[originalName] || { label: originalName, type: 'continuous', missingCode: null, description: '' };
      return {
        ...prev,
        [originalName]: {
          ...current,
          type: value
        }
      };
    });
  };

  const handleMissingCodeChange = (originalName: string, rawValue: string) => {
    const parsed = rawValue === '' ? null : Number(rawValue);
    setLocalMetadata(prev => {
      const current = prev[originalName] || { label: originalName, type: 'continuous', missingCode: null, description: '' };
      return {
        ...prev,
        [originalName]: {
          ...current,
          missingCode: isNaN(parsed as number) ? null : parsed
        }
      };
    });
  };

  const handleApply = async () => {
    setIsApplying(true);
    try {
      // Simulate micro-delay for active scholarly feel
      await new Promise(resolve => setTimeout(resolve, 600));
      onApplyMetadata(localMetadata);
      addToast('success', 'Metadata Alignment Succeeded', 'Updated labels, types, and cleared specified missing codes.');
    } catch (err: any) {
      addToast('error', 'Execution Prevented', err.message || 'An error occurred while applying metadata.');
    } finally {
      setIsApplying(false);
    }
  };

  const handleResetDefaults = () => {
    const defaults: VariableMetadata = {};
    headers.forEach(header => {
      defaults[header] = {
        label: header,
        type: 'continuous',
        missingCode: null,
        description: ''
      };
    });
    setLocalMetadata(defaults);
    addToast('info', 'Defaults Restored', 'Variable labels and codes have been reset to initial configuration.');
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16 px-4 animate-in fade-in duration-300">
      
      {/* Header Panel */}
      <div className="bg-gradient-to-br from-stone-900 to-stone-800 text-white rounded-3xl p-8 shadow-md border border-stone-700/50 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-12 -translate-y-12">
          <Settings className="w-80 h-80" />
        </div>
        <div className="relative z-10 space-y-3 max-w-3xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/20 text-amber-300 rounded-full text-[10px] font-bold uppercase tracking-wider border border-amber-500/30">
            <Tags className="w-3.5 h-3.5" /> SPSS-Style Variable View
          </div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight text-white leading-tight">
            Scholarly Schema &amp; Metadata Lab
          </h1>
          <p className="text-stone-300 text-sm font-serif italic leading-relaxed">
            Specify variable labels, declare types for estimation filters, and define missing-value codes (e.g., -99) to programmatically scrub them from your sample.
          </p>
        </div>
      </div>

      {/* Quick Econometrics Guidance */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl flex gap-3">
          <Info className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-stone-950 uppercase tracking-wider font-mono">1. Descriptive Labels</h4>
            <p className="text-[11px] text-stone-600 font-serif leading-relaxed">
              Use clean display names (e.g., &quot;Log Salary&quot;). These display names automatically propagate into APA-formatted regression tables.
            </p>
          </div>
        </div>
        <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl flex gap-3">
          <Compass className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-stone-950 uppercase tracking-wider font-mono">2. Strict Variable Type</h4>
            <p className="text-[11px] text-stone-600 font-serif leading-relaxed">
              Declare continuous or dummy indicators. Safeguards OLS, ARIMA, and Logit routines from illegal categorical matrices.
            </p>
          </div>
        </div>
        <div className="bg-stone-50 border border-stone-200/60 p-4 rounded-2xl flex gap-3">
          <AlertCircle className="w-5 h-5 text-stone-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-xs font-bold text-stone-950 uppercase tracking-wider font-mono">3. Missing Value Truncation</h4>
            <p className="text-[11px] text-stone-600 font-serif leading-relaxed">
              Identify numeric outlier/missing indicators (e.g., <code className="bg-white px-1 py-0.5 border border-stone-200 font-mono text-[10px]">-99</code>). Triggers standard listwise deletion.
            </p>
          </div>
        </div>
      </div>

      {/* Main Table Container */}
      <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
        <div className="p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-stone-50/50">
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 font-mono uppercase tracking-wider">
              <FileSpreadsheet className="w-4 h-4 text-stone-600" /> Active Schema Matrix ({headers.length} Columns)
            </h3>
            <p className="text-xs text-stone-500 font-serif">
              Editing these metadata items affects all current downstream regression outputs and statistical plots.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleResetDefaults}
              className="px-3.5 py-1.5 text-xs font-mono border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-xl transition-all duration-200 flex items-center gap-1.5"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Reset Defaults
            </button>
            <button
              onClick={handleApply}
              disabled={isApplying}
              className="btn-primary px-4 py-1.5 bg-stone-900 hover:bg-stone-800 text-white rounded-xl text-xs font-mono transition-all duration-200 flex items-center gap-1.5 disabled:opacity-50"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Aligning Schema...
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" /> Apply Metadata Schema
                </>
              )}
            </button>
          </div>
        </div>

        {/* Table representation */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-100/60 font-mono text-[10px] text-stone-600 uppercase tracking-wider">
                <th className="py-3.5 px-5 font-bold">Original Code/Column Name</th>
                <th className="py-3.5 px-4 font-bold">Display Label (Human Friendly)</th>
                <th className="py-3.5 px-4 font-bold">Variable Metric Type</th>
                <th className="py-3.5 px-4 font-bold text-center">Missing Code (Scrub Value)</th>
                <th className="py-3.5 px-5 font-bold">Variable Description / Academic Tooltip</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100 font-serif text-stone-800">
              {headers.map(originalName => {
                const item = localMetadata[originalName] || {
                  label: originalName,
                  type: 'continuous',
                  missingCode: null,
                  description: ''
                };

                return (
                  <tr key={originalName} className="hover:bg-stone-50/50 transition-colors">
                    {/* Original Name */}
                    <td className="py-3 px-5 font-mono text-xs text-stone-500 bg-stone-50/30">
                      {originalName}
                    </td>

                    {/* Display Label */}
                    <td className="py-3 px-3">
                      <input
                        type="text"
                        value={item.label}
                        onChange={(e) => handleFieldChange(originalName, 'label', e.target.value)}
                        className="w-full px-2 py-1.5 text-xs font-sans rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
                        placeholder="e.g., Real Wage (2020 constant)"
                      />
                    </td>

                    {/* Type */}
                    <td className="py-3 px-3">
                      <select
                        value={item.type}
                        onChange={(e) => handleTypeChange(originalName, e.target.value as VariableType)}
                        className="w-full px-2 py-1.5 text-xs font-sans rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
                      >
                        <option value="continuous">Continuous (Ratio/Interval)</option>
                        <option value="binary">Binary (Dummy Indicator 0/1)</option>
                        <option value="categorical">Categorical (Unordered/Nominal)</option>
                        <option value="date">Date Vector (Time Variable)</option>
                      </select>
                    </td>

                    {/* Missing Code */}
                    <td className="py-3 px-3 text-center">
                      <input
                        type="text"
                        value={item.missingCode === null ? '' : item.missingCode}
                        onChange={(e) => handleMissingCodeChange(originalName, e.target.value)}
                        className="w-20 px-2 py-1.5 text-xs font-mono text-center rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
                        placeholder="e.g. -99"
                      />
                    </td>

                    {/* Description */}
                    <td className="py-3 px-5">
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => handleFieldChange(originalName, 'description', e.target.value)}
                        className="w-full px-3 py-1.5 text-xs font-sans rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
                        placeholder="e.g., Wage rate extracted from the CPS questionnaire 2024."
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
