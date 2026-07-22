import React, { useState } from 'react';
import { 
  ShieldCheck, ArrowRight, Table, AlertTriangle, TrendingUp, TrendingDown, 
  BrainCircuit, Sparkles, Loader2, Download, RefreshCw, Settings, Check, 
  HelpCircle, LineChart, CheckSquare, Square
} from 'lucide-react';
import { RobustnessItem, useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { getAuthHeaders } from '../../services/apiClient';
import { formatNum, formatPValue } from '../../lib/formatters';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { 
  ResponsiveContainer, ComposedChart, Line, Scatter, XAxis, YAxis, 
  Tooltip, ReferenceLine, CartesianGrid, Label
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import ModelComparisonTable from '../shared/ModelComparisonTable';

interface RobustnessExplorerProps {
  items: RobustnessItem[];
  onClear: () => void;
}

export default function RobustnessExplorer({ items, onClear }: RobustnessExplorerProps) {
  const { currentDataset, addToast } = useStore();
  const [activeTab, setActiveTab] = useState<'bench' | 'curve'>('bench');
  const [isComparisonOpen, setIsComparisonOpen] = useState<boolean>(false);

  // --- SPECIFICATION CURVE STATE ---
  const [yVar, setYVar] = useState<string>('');
  const [xVar, setXVar] = useState<string>('');
  const [selectedControls, setSelectedControls] = useState<string[]>([]);
  const [selectedEstimators, setSelectedEstimators] = useState<string[]>(['ols', 'fe']);
  const [selectedSEs, setSelectedSEs] = useState<string[]>(['classical', 'HC1', 'HC3', 'NW']);
  const [selectedTrims, setSelectedTrims] = useState<number[]>([0, 1, 5]);

  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [curveResults, setCurveResults] = useState<any[]>([]);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState<boolean>(false);

  // --- BENCH COMPONENT STATE ---
  const [isGeneratingStory, setIsGeneratingStory] = React.useState(false);
  const [story, setStory] = React.useState<string | null>(null);

  // Auto-select variables if dataset changes
  React.useEffect(() => {
    if (currentDataset && currentDataset.data && currentDataset.data.length > 0) {
      const firstRow = currentDataset.data[0];
      if (firstRow) {
        const keys = Object.keys(firstRow).filter(k => typeof (firstRow as any)[k] === 'number');
        if (keys.length >= 2) {
          const first = keys[0];
          const second = keys[1];
          if (first) setYVar(first);
          if (second) setXVar(second);
          setSelectedControls(keys.slice(2, 6)); // select next few as default controls
        }
      }
    }
  }, [currentDataset]);

  // Extract all numeric keys
  const numericColumns = React.useMemo(() => {
    if (!currentDataset || !currentDataset.data || currentDataset.data.length === 0) return [];
    const firstRow = currentDataset.data[0];
    if (!firstRow) return [];
    return Object.keys(firstRow).filter(
      k => typeof (firstRow as any)[k] === 'number'
    );
  }, [currentDataset]);

  // Compute combinations preview
  const previewSpecsCount = React.useMemo(() => {
    if (!xVar || !yVar) return 0;
    const estCount = selectedEstimators.length;
    const trimCount = selectedTrims.length;
    const seCount = selectedSEs.length;
    const controlCombinations = Math.pow(2, selectedControls.length);
    return estCount * trimCount * seCount * controlCombinations;
  }, [xVar, yVar, selectedEstimators, selectedSEs, selectedTrims, selectedControls]);

  const handleRunCurve = async () => {
    if (!yVar || !xVar) {
      addToast('error', 'Variable Selection Required', 'Please choose both dependent and focal independent variables.');
      return;
    }
    if (previewSpecsCount > 500) {
      addToast('error', 'Specification Space Too Large', 'Please restrict controls, estimators, or SE options to stay under 500 specifications.');
      return;
    }
    if (previewSpecsCount === 0) {
      addToast('error', 'Empty Specification Space', 'Please select at least one estimator, standard error, and trim level.');
      return;
    }

    setIsRunning(true);
    setCurveResults([]);
    setAiSummary(null);

    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/estimate/specification-curve', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: currentDataset?.data,
          yVar,
          xVar,
          controls: selectedControls,
          estimators: selectedEstimators.map(e => e.toUpperCase()),
          seTypes: selectedSEs,
          outliers: selectedTrims,
          outlierTrims: selectedTrims,
          entityVar: 'id',
          entityId: 'id',
          timeVar: 'year'
        })
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || 'Specification curve estimation failed');
      }

      const results = await response.json();
      const specsList = results.specifications || [];
      setCurveResults(specsList);
      addToast('success', 'Specification Curve Computed', `Successfully ran ${specsList.length} model combinations.`);
      
      // Auto-trigger AI Interpretation
      handleGenerateAiSummary(specsList);

    } catch (error: any) {
      console.error(error);
      addToast('error', 'Analysis Failed', error.message || 'Econometric grid run failed.');
    } finally {
      setIsRunning(false);
    }
  };

  const handleGenerateAiSummary = async (specsToSummarize = curveResults) => {
    if (specsToSummarize.length === 0) return;
    setIsGeneratingAi(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/gemini/specification-curve-summary', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          xVar,
          yVar,
          specifications: specsToSummarize
        })
      });

      if (!response.ok) throw new Error('Failed to generate AI summary');
      const data = await response.json();
      setAiSummary(data.summary || data.response);
    } catch (err: any) {
      console.error(err);
      setAiSummary('Failed to compile academic summary. Please retry.');
    } finally {
      setIsGeneratingAi(false);
    }
  };

  const generateRobustnessStory = async () => {
    setIsGeneratingStory(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          type: 'ROBUSTNESS_STORY',
          mode: 'academic',
          format: 'apa',
          result: { items },
          researchQuestion: 'Specification sensitivity audit across custom configurations'
        })
      });
      if (!response.ok) throw new Error();
      const res = await response.json();
      setStory(res.response);
    } catch (e) {
      setStory("Failed to generate robustness narrative. Please try again.");
    } finally {
      setIsGeneratingStory(false);
    }
  };

  const exportCSV = () => {
    if (curveResults.length === 0) return;
    
    const headers = [
      'Specification Index', 'Estimator', 'SE Type', 'Outlier Trim %', 
      'Estimate (Beta)', 'Std. Error', 'p-Value', '95% Conf. Low', '95% Conf. High', 'R-Squared', 'N'
    ];
    
    // Add columns for controls
    const controlHeaders = selectedControls.map(c => `Control: ${c}`);
    const fullHeaders = [...headers, ...controlHeaders];

    const rows = curveResults.map((s, index) => {
      const coreRow = [
        index + 1,
        s.estimator,
        s.seType,
        s.outlierTrim,
        s.estimate,
        s.stdError,
        s.pValue,
        s.confLow,
        s.confHigh,
        s.rSquared,
        s.n
      ];
      const controlIndicatorRow = selectedControls.map(c => s.controls[c] ? '1' : '0');
      return [...coreRow, ...controlIndicatorRow];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
      + [fullHeaders.join(','), ...rows.map(r => r.join(','))].join('\n');
    
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `multiverse_specification_curve_${xVar}_${yVar}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const exportSVG = () => {
    const svgEl = document.querySelector('#specification-curve-chart svg');
    if (!svgEl) return;
    const svgString = new XMLSerializer().serializeToString(svgEl);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const downloadLink = document.createElement("a");
    downloadLink.href = svgUrl;
    downloadLink.download = `specification_curve_${xVar}_${yVar}.svg`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  // Unique variable names across all audit items
  const allVars = Array.from(new Set(items.flatMap(item => 
    ((item.results || {}).coefficients || []).map((c: any) => c.variable)
  )));
  const focalVar = items[0]?.results?.coefficients?.[0]?.variable || '';

  // Sort and index curve results for charts
  const sortedCurveResults = React.useMemo(() => {
    return [...curveResults]
      .sort((a, b) => a.estimate - b.estimate)
      .map((item, index) => ({
        ...item,
        sortedIndex: index + 1
      }));
  }, [curveResults]);

  const medianEstimate = React.useMemo(() => {
    if (curveResults.length === 0) return 0;
    const estimates = curveResults.map(c => c.estimate).sort((a, b) => a - b);
    const mid = Math.floor(estimates.length / 2);
    return estimates.length % 2 !== 0 ? estimates[mid] : (estimates[mid - 1] + estimates[mid]) / 2;
  }, [curveResults]);

  const significantShare = React.useMemo(() => {
    if (curveResults.length === 0) return 0;
    const sigCount = curveResults.filter(c => c.pValue <= 0.05).length;
    return (sigCount / curveResults.length) * 100;
  }, [curveResults]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      
      {/* SECTION TABS */}
      <div className="flex border-b border-slate-200">
        <button
          onClick={() => setActiveTab('bench')}
          className={cn(
            "py-3 px-6 text-sm font-semibold border-b-2 transition-all font-mono tracking-tight",
            activeTab === 'bench' 
              ? "border-slate-900 text-slate-900 bg-slate-50/50" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          Audit Comparison Bench ({items.length})
        </button>
        <button
          onClick={() => setActiveTab('curve')}
          className={cn(
            "py-3 px-6 text-sm font-semibold border-b-2 transition-all font-mono tracking-tight flex items-center gap-2",
            activeTab === 'curve' 
              ? "border-slate-900 text-slate-900 bg-slate-50/50" 
              : "border-transparent text-slate-400 hover:text-slate-600"
          )}
        >
          <LineChart className="w-4 h-4" /> Multiverse Specification Curve (Beta)
        </button>
      </div>

      {/* VIEW 1: COMPARISON BENCH */}
      {activeTab === 'bench' && (
        <div className="space-y-8">
          {items.length === 0 ? (
            <div className="h-96 flex flex-col items-center justify-center text-center border-2 border-dashed border-slate-200 bg-slate-50 rounded-2xl p-6">
              <ShieldCheck className="w-12 h-12 mb-4 text-slate-300 animate-pulse" />
              <p className="font-mono text-xs uppercase text-slate-400 max-w-md leading-relaxed">
                No custom specifications currently saved on the comparison bench.<br/>
                <span className="text-slate-500">Run regressions inside the OLS, FE, or Causal Labs, then click "Add to Robustness Bench" to perform analytical alignment audits.</span>
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                  <h2 className="text-xl font-bold text-slate-950 tracking-tight">Robustness Audit</h2>
                  <p className="text-sm text-slate-500 mt-1 italic font-serif">Compare model specifications side-by-side to verify parameter stability under varying assumptions.</p>
                </div>
                <div className="flex gap-3">
                  {items.length > 0 && (
                    <button
                      onClick={() => setIsComparisonOpen(true)}
                      className="btn-secondary flex items-center gap-2 text-xs font-semibold"
                    >
                      <Table className="w-4 h-4 text-slate-500" />
                      Compare in Table (esttab)
                    </button>
                  )}
                  <button 
                    onClick={generateRobustnessStory}
                    disabled={isGeneratingStory}
                    className="btn-primary flex items-center gap-2"
                  >
                    {isGeneratingStory ? <Loader2 className="w-4 h-4 animate-spin" /> : <BrainCircuit className="w-4 h-4" />}
                    Analyze Specification Story
                  </button>
                  <button 
                    onClick={onClear}
                    className="text-[10px] font-bold text-rose-500 hover:bg-rose-50/50 px-4 py-2 rounded transition-colors uppercase tracking-widest font-mono border border-rose-100"
                  >
                    Clear Audit Bench
                  </button>
                </div>
              </div>

              {story && (
                <div className="card-premium bg-blue-50/50 border-blue-100 p-8 space-y-4 animate-in slide-in-from-top-4 duration-500">
                  <div className="flex items-center gap-2 mb-4 border-b border-blue-100 pb-4">
                     <div className="p-1.5 bg-blue-600 rounded">
                        <Sparkles className="w-4 h-4 text-white" />
                     </div>
                     <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-900 font-mono">Robustness Narrative & Verdict</h3>
                  </div>
                  <div className="markdown-body prose prose-slate prose-sm max-w-none 
                    prose-p:leading-relaxed prose-p:font-serif prose-p:text-blue-950/80
                    prose-headings:font-serif prose-headings:italic prose-headings:text-blue-950 prose-headings:font-bold
                  ">
                     <ReactMarkdown remarkPlugins={[remarkGfm]}>{story}</ReactMarkdown>
                  </div>
                </div>
              )}

              <div className="card-premium overflow-x-auto shadow-elevated">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-900 text-white">
                      <th className="p-4 border-r border-white/10 min-w-[150px] font-bold uppercase tracking-tighter text-[10px] font-mono">Structural Identity</th>
                      {items.map((item, i) => (
                        <th key={item.id} className="p-4 border-r border-white/10 text-center uppercase tracking-tighter text-[10px] bg-slate-800">
                          Model ({i + 1})
                          <div className="text-[9px] mt-1 opacity-50 font-normal normal-case italic font-serif truncate max-w-[120px] mx-auto">
                            {item.specification}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {allVars.map((v) => {
                      const isFocal = v === focalVar;
                      return (
                        <tr key={v} className={cn("hover:bg-slate-50/50 transition-colors", isFocal && "bg-blue-50/30")}>
                          <td className="p-4 border-r border-slate-100 flex items-center gap-3">
                            <span className={cn("font-semibold text-slate-700 italic font-serif text-sm", isFocal && "text-blue-600 font-bold")}>
                              {v}
                            </span>
                            {isFocal && (
                               <span className="text-[8px] px-1 py-0.5 bg-blue-100 text-blue-700 rounded font-bold uppercase tracking-tighter font-mono">Focal Var</span>
                            )}
                          </td>
                          {items.map((item, i) => {
                            const coeff = item.results?.coefficients?.find((c: any) => c.variable === v);
                            if (!coeff) return <td key={item.id} className="p-4 border-r border-slate-100 text-center opacity-20 text-xs">—</td>;
                            
                            const baselineCoeff = items[0]?.results?.coefficients?.find((c: any) => c.variable === v);
                            const diff = i > 0 && baselineCoeff ? ((coeff.estimate - baselineCoeff.estimate) / Math.abs(baselineCoeff.estimate || 1)) * 100 : 0;

                            return (
                              <td key={item.id} className={cn("p-4 border-r border-slate-100 text-center", i > 0 && isFocal && "bg-blue-50/20")}>
                                <div className={cn("font-bold text-slate-900 font-mono text-sm", i > 0 && isFocal && "text-slate-900")}>
                                  {coeff.estimate?.toFixed(4) || '—'}
                                </div>
                                <div className="text-[10px] text-slate-400 font-mono">({coeff.stdError?.toFixed(4) || '—'})</div>
                                <div className="flex flex-col items-center gap-1 mt-1">
                                   <div className="text-[10px] font-bold text-blue-600">
                                      {coeff.pValue < 0.01 ? '***' : coeff.pValue < 0.05 ? '**' : coeff.pValue < 0.1 ? '*' : ''}
                                   </div>
                                   {i > 0 && Math.abs(diff) > 1 && (
                                     <div className={cn(
                                       "text-[8px] px-1 rounded flex items-center gap-0.5 font-bold font-mono",
                                       diff > 0 ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"
                                     )}>
                                       {diff > 0 ? <TrendingUp className="w-2 h-2" /> : <TrendingDown className="w-2 h-2" />}
                                       {Math.abs(diff)?.toFixed(0) || '0'}%
                                     </div>
                                   )}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })}
                    <tr className="bg-slate-50/80">
                       <td className="p-4 border-r border-slate-200 font-bold uppercase text-[9px] text-slate-500 font-mono">R-Squared</td>
                       {items.map(item => (
                         <td key={item.id} className="p-4 border-r border-slate-200 text-center font-bold text-slate-900 tabular-nums">
                           {item.results?.rSquared?.toFixed(4) || '—'}
                         </td>
                       ))}
                    </tr>
                    <tr className="bg-slate-50/80">
                       <td className="p-4 border-r border-slate-200 font-bold uppercase text-[9px] text-slate-500 font-mono">Observations</td>
                       {items.map(item => (
                         <td key={item.id} className="p-4 border-r border-slate-200 text-center text-slate-900 tabular-nums">
                           {item.results?.n || '—'}
                         </td>
                       ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="card-premium p-8 bg-slate-50 border-none">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-4 font-mono flex items-center gap-2">
                       <AlertTriangle className="w-4 h-4 text-amber-500" /> Parameter Stability
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-500 font-serif italic">
                       Verify if key coefficient signs and magnitudes persist across models. Systematic sign flipping or loss of significance under specific controls or subsets suggests structural vulnerability.
                    </p>
                 </div>

                 <div className="card-premium p-8 bg-slate-50 border-none">
                    <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-4 font-mono flex items-center gap-2">
                       <TrendingUp className="w-4 h-4 text-blue-500" /> Causal Validation
                    </h3>
                    <p className="text-sm leading-relaxed text-slate-500 font-serif italic">
                       Check standard error adjustments (HC1 to HC3) to rule out artifacts of heteroskedasticity. If effect remains robust, the baseline claim is structurally sound.
                    </p>
                 </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* VIEW 2: MULTIVERSE SPECIFICATION CURVE */}
      {activeTab === 'curve' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          
          {/* HEADER EXPLANATORY */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 border-b border-slate-100 pb-6">
            <div className="max-w-2xl">
              <h2 className="text-xl font-bold text-slate-950 tracking-tight">Specification Curve Analysis</h2>
              <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                Define an econometric specification space (estimators, control subsets, robust covariances, and outlier trims) and automatically execute the entire combination multiverse. This prevents researcher bias ("p-hacking") by laying bare the stability of your treatment effects.
              </p>
            </div>
            {curveResults.length > 0 && (
              <div className="flex gap-2">
                <button 
                  onClick={exportCSV} 
                  className="btn-secondary py-2 px-4 flex items-center gap-2 text-xs font-mono"
                >
                  <Download className="w-4 h-4" /> Export CSV
                </button>
                <button 
                  onClick={exportSVG} 
                  className="btn-secondary py-2 px-4 flex items-center gap-2 text-xs font-mono"
                >
                  <Download className="w-4 h-4" /> Download SVG
                </button>
              </div>
            )}
          </div>

          {/* DUAL CONFIGURATION GRID */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* LEFT CONFIGURATION PANEL (1/3 COL) */}
            <div className="lg:col-span-1 space-y-6">
              <div className="card-premium p-6 bg-slate-50/50 border border-slate-200 rounded-xl space-y-6">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Settings className="w-4 h-4 text-slate-600" />
                  <h3 className="font-mono text-xs uppercase font-bold text-slate-700 tracking-wider">Baseline Setup</h3>
                </div>

                {/* Y AND X SELECTORS */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
                      Dependent Variable (Y)
                    </label>
                    <select
                      value={yVar}
                      onChange={(e) => setYVar(e.target.value)}
                      className="form-input text-xs"
                      disabled={isRunning || !currentDataset}
                    >
                      <option value="">-- Choose Dependent --</option>
                      {numericColumns.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
                      Focal Explanatory Variable (X)
                    </label>
                    <select
                      value={xVar}
                      onChange={(e) => setXVar(e.target.value)}
                      className="form-input text-xs"
                      disabled={isRunning || !currentDataset}
                    >
                      <option value="">-- Choose Focal Explanatory --</option>
                      {numericColumns.filter(c => c !== yVar).map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 border-b border-slate-200 pb-3 pt-2">
                  <CheckSquare className="w-4 h-4 text-slate-600" />
                  <h3 className="font-mono text-xs uppercase font-bold text-slate-700 tracking-wider">Multiverse Spaces</h3>
                </div>

                {/* CONTROLS SELECTION */}
                <div className="space-y-3">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono mb-1">
                    Control Combinations
                  </label>
                  <div className="max-h-36 overflow-y-auto border border-slate-100 bg-white p-3 rounded-lg divide-y divide-slate-100">
                    {numericColumns.filter(c => c !== yVar && c !== xVar).map(c => {
                      const active = selectedControls.includes(c);
                      return (
                        <button
                          key={c}
                          onClick={() => {
                            if (active) {
                              setSelectedControls(selectedControls.filter(ctrl => ctrl !== c));
                            } else {
                              setSelectedControls([...selectedControls, c]);
                            }
                          }}
                          disabled={isRunning}
                          className="w-full text-left py-2 flex items-center justify-between text-xs hover:bg-slate-50"
                        >
                          <span className="font-mono text-slate-600">{c}</span>
                          {active ? (
                            <Check className="w-4 h-4 text-slate-900 font-extrabold" />
                          ) : (
                            <span className="w-4 h-4 border border-slate-200 rounded" />
                          )}
                        </button>
                      );
                    })}
                    {numericColumns.filter(c => c !== yVar && c !== xVar).length === 0 && (
                      <div className="text-[10px] text-slate-400 font-mono p-2">No other numeric columns available.</div>
                    )}
                  </div>
                </div>

                {/* ESTIMATORS */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Estimators
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['ols', 'fe'].map(est => {
                      const active = selectedEstimators.includes(est);
                      return (
                        <button
                          key={est}
                          onClick={() => {
                            if (active) {
                              setSelectedEstimators(selectedEstimators.filter(e => e !== est));
                            } else {
                              setSelectedEstimators([...selectedEstimators, est]);
                            }
                          }}
                          disabled={isRunning}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider font-mono border transition-all",
                            active 
                              ? "bg-slate-900 border-slate-900 text-white" 
                              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                          )}
                        >
                          {est.toUpperCase()}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* STANDARD ERRORS */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Covariance Adjustments
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {['classical', 'HC1', 'HC3', 'NW'].map(se => {
                      const active = selectedSEs.includes(se);
                      return (
                        <button
                          key={se}
                          onClick={() => {
                            if (active) {
                              setSelectedSEs(selectedSEs.filter(s => s !== se));
                            } else {
                              setSelectedSEs([...selectedSEs, se]);
                            }
                          }}
                          disabled={isRunning}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider font-mono border transition-all",
                            active 
                              ? "bg-slate-900 border-slate-900 text-white" 
                              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                          )}
                        >
                          {se}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* OUTLIER TRIMS */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500 font-mono">
                    Outlier Exclusion Trims
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {[0, 1, 5].map(trim => {
                      const active = selectedTrims.includes(trim);
                      return (
                        <button
                          key={trim}
                          onClick={() => {
                            if (active) {
                              setSelectedTrims(selectedTrims.filter(t => t !== trim));
                            } else {
                              setSelectedTrims([...selectedTrims, trim]);
                            }
                          }}
                          disabled={isRunning}
                          className={cn(
                            "px-3 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider font-mono border transition-all",
                            active 
                              ? "bg-slate-900 border-slate-900 text-white" 
                              : "bg-white border-slate-200 text-slate-500 hover:border-slate-300"
                          )}
                        >
                          {trim === 0 ? 'Baseline (0%)' : `${trim}% Trim`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* RUN BUTTON AND COMBINATIONS PREVIEW */}
                <div className="border-t border-slate-200 pt-5 space-y-3">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-mono text-slate-500 font-semibold uppercase text-[10px]">Predicted Grid:</span>
                    <span className={cn(
                      "font-mono font-bold", 
                      previewSpecsCount > 500 ? "text-rose-600" : "text-slate-800"
                    )}>
                      {previewSpecsCount} models
                    </span>
                  </div>

                  <button
                    onClick={handleRunCurve}
                    disabled={isRunning || previewSpecsCount === 0 || previewSpecsCount > 500}
                    className="w-full btn-primary py-3 flex items-center justify-center gap-2 uppercase tracking-widest text-[10px] font-bold"
                  >
                    {isRunning ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Running Specification Grid...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-4 h-4" />
                        Run Curve Multiverse
                      </>
                    )}
                  </button>

                  {previewSpecsCount > 500 && (
                    <div className="p-3 bg-rose-50 border border-rose-100 rounded-lg text-[10px] text-rose-700 flex gap-2 items-start leading-relaxed font-serif">
                      <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
                      <span>The requested combination space exceeds 500 estimators. Please deselect some control variables or standard error adjustments to focus the grid.</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT RESULTS PANEL (2/3 COL) */}
            <div className="lg:col-span-2 space-y-8">
              {isRunning && (
                <div className="h-96 flex flex-col items-center justify-center border border-slate-200 bg-slate-50/50 rounded-2xl p-8 space-y-4">
                  <Loader2 className="w-10 h-10 text-slate-700 animate-spin" />
                  <p className="font-mono text-xs uppercase text-slate-500 tracking-wider text-center animate-pulse">
                    Computing Multiverse Specifications...<br/>
                    <span className="text-slate-400 font-normal lowercase italic">Calculating OLS, Fixed Effects, Outlier Truncations, and Standard Error Matrices...</span>
                  </p>
                </div>
              )}

              {!isRunning && curveResults.length === 0 && (
                <div className="h-96 flex flex-col items-center justify-center border border-dashed border-slate-200 bg-slate-50/20 rounded-2xl p-8 text-center">
                  <LineChart className="w-12 h-12 text-slate-300 mb-3" />
                  <p className="font-mono text-xs uppercase text-slate-400 max-w-sm leading-relaxed">
                    Multiverse is currently empty.<br/>
                    <span className="text-slate-500">Configure your variables and specification options on the left, then click "Run Curve Multiverse" to auto-estimate the full grid.</span>
                  </p>
                </div>
              )}

              {!isRunning && curveResults.length > 0 && (
                <div className="space-y-8 animate-in fade-in duration-500">
                  
                  {/* METRIC CARD BAR */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="bg-slate-900 border-none p-5 rounded-xl text-white font-mono space-y-1">
                      <div className="text-[10px] uppercase opacity-50 tracking-wider">Specifications Evaluated</div>
                      <div className="text-3xl font-extrabold tracking-tight">{curveResults.length}</div>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 p-5 rounded-xl font-mono space-y-1">
                      <div className="text-[10px] text-slate-400 uppercase tracking-wider">Median Coefficient</div>
                      <div className="text-3xl font-extrabold text-slate-900 tracking-tight">{medianEstimate.toFixed(4)}</div>
                    </div>

                    <div className={cn(
                      "p-5 rounded-xl font-mono space-y-1 border",
                      significantShare > 75 
                        ? "bg-emerald-50 border-emerald-100" 
                        : significantShare > 30 
                        ? "bg-amber-50 border-amber-100" 
                        : "bg-rose-50 border-rose-100"
                    )}>
                      <div className={cn(
                        "text-[10px] uppercase tracking-wider",
                        significantShare > 75 ? "text-emerald-700" : significantShare > 30 ? "text-amber-700" : "text-rose-700"
                      )}>
                        Significant Specs (p ≤ 0.05)
                      </div>
                      <div className={cn(
                        "text-3xl font-extrabold tracking-tight",
                        significantShare > 75 ? "text-emerald-950" : significantShare > 30 ? "text-amber-950" : "text-rose-950"
                      )}>
                        {significantShare.toFixed(0)}%
                      </div>
                    </div>
                  </div>

                  {/* MAIN CHART CONTAINER */}
                  <div className="card-premium p-6" id="specification-curve-chart">
                    <h3 className="font-mono text-xs uppercase tracking-wider text-slate-500 mb-4 font-bold border-b border-slate-100 pb-2">
                      Focal Effect Size & 95% Confidence Interval Multiverse
                    </h3>

                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart
                          data={sortedCurveResults}
                          margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.15} />
                          <XAxis 
                            dataKey="sortedIndex" 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            fontFamily="monospace"
                          >
                            <Label value="Specifications (sorted by magnitude)" offset={-10} position="insideBottom" style={{ fontFamily: 'monospace', fontSize: 10, fill: '#64748b' }} />
                          </XAxis>
                          <YAxis 
                            stroke="#94a3b8" 
                            fontSize={10} 
                            fontFamily="monospace"
                            domain={['auto', 'auto']}
                          >
                            <Label value="Estimated Coefficient Beta" angle={-90} position="insideLeft" style={{ fontFamily: 'monospace', fontSize: 10, fill: '#64748b' }} />
                          </YAxis>
                          <Tooltip
                            content={({ active, payload }) => {
                              if (active && payload && payload.length && payload[0]?.payload) {
                                const data = payload[0].payload;
                                return (
                                  <div className="bg-slate-900 text-white p-3 rounded-lg shadow-lg text-[11px] font-mono space-y-1">
                                    <div className="font-bold border-b border-white/10 pb-1 mb-1">Spec #{data.sortedIndex}</div>
                                    <div>Beta: <span className="font-bold text-blue-400">{data.estimate.toFixed(4)}</span></div>
                                    <div>S.E.: {data.stdError.toFixed(4)}</div>
                                    <div>p-Value: {data.pValue.toFixed(4)}</div>
                                    <div>95% CI: [{data.confLow.toFixed(4)}, {data.confHigh.toFixed(4)}]</div>
                                    <div>Estimator: {data.estimator.toUpperCase()}</div>
                                    <div>Covariance: {data.seType}</div>
                                    <div>Trim: {data.outlierTrim}%</div>
                                  </div>
                                );
                              }
                              return null;
                            }}
                          />
                          <ReferenceLine y={0} stroke="#f43f5e" strokeDasharray="3 3" opacity={0.5} />
                          <ReferenceLine y={medianEstimate} stroke="#3b82f6" strokeDasharray="5 5" label={{ value: 'median', fill: '#3b82f6', fontSize: 8, position: 'insideRight', fontFamily: 'monospace' }} />
                          
                          {/* Render horizontal error bar segments */}
                          <Scatter dataKey="estimate" fill="#0f172a" line={{ stroke: '#0f172a', strokeWidth: 1 }} shape="circle" />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  {/* LOWER MATRIX PANEL */}
                  <div className="card-premium p-6">
                    <h3 className="font-mono text-xs uppercase tracking-wider text-slate-500 mb-3 font-bold border-b border-slate-100 pb-2">
                      Multiverse Input Configuration Matrix
                    </h3>

                    {/* Scrollable Matrix Grid */}
                    <div className="overflow-x-auto">
                      <div className="min-w-[600px] space-y-4">
                        
                        {/* ESTIMATOR CATEGORY */}
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1.5">1. Model Estimator</div>
                          <div className="space-y-1 bg-slate-50 p-2 rounded-lg">
                            {['ols', 'fe'].map(est => (
                              <div key={est} className="flex items-center text-[10px] font-mono h-4">
                                <span className="w-24 text-slate-500 font-semibold uppercase">{est}</span>
                                <div className="flex-1 flex justify-between">
                                  {sortedCurveResults.map((s, idx) => (
                                    <span 
                                      key={idx} 
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full shrink-0 mx-auto",
                                        s.estimator === est ? "bg-slate-900" : "bg-slate-200/50"
                                      )} 
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* COVARIANCE TYPE */}
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1.5">2. Covariance Adjustments</div>
                          <div className="space-y-1 bg-slate-50 p-2 rounded-lg">
                            {['classical', 'HC1', 'HC3', 'NW'].map(se => (
                              <div key={se} className="flex items-center text-[10px] font-mono h-4">
                                <span className="w-24 text-slate-500 font-semibold">{se}</span>
                                <div className="flex-1 flex justify-between">
                                  {sortedCurveResults.map((s, idx) => (
                                    <span 
                                      key={idx} 
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full shrink-0 mx-auto",
                                        s.seType === se ? "bg-slate-900" : "bg-slate-200/50"
                                      )} 
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* OUTLIERS */}
                        <div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1.5">3. Outlier Exclusion Trims</div>
                          <div className="space-y-1 bg-slate-50 p-2 rounded-lg">
                            {[0, 1, 5].map(trim => (
                              <div key={trim} className="flex items-center text-[10px] font-mono h-4">
                                <span className="w-24 text-slate-500 font-semibold">{trim === 0 ? '0% (Baseline)' : `${trim}% Trim`}</span>
                                <div className="flex-1 flex justify-between">
                                  {sortedCurveResults.map((s, idx) => (
                                    <span 
                                      key={idx} 
                                      className={cn(
                                        "w-1.5 h-1.5 rounded-full shrink-0 mx-auto",
                                        s.outlierTrim === trim ? "bg-slate-900" : "bg-slate-200/50"
                                      )} 
                                    />
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* CONTROL VARIABLES */}
                        {selectedControls.length > 0 && (
                          <div>
                            <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider font-mono mb-1.5">4. Covariate Control Adjustments</div>
                            <div className="space-y-1 bg-slate-50 p-2 rounded-lg">
                              {selectedControls.map(c => (
                                <div key={c} className="flex items-center text-[10px] font-mono h-4">
                                  <span className="w-24 text-slate-500 truncate max-w-[90px]" title={c}>{c}</span>
                                  <div className="flex-1 flex justify-between">
                                    {sortedCurveResults.map((s, idx) => (
                                      <span 
                                        key={idx} 
                                        className={cn(
                                          "w-1.5 h-1.5 rounded-full shrink-0 mx-auto",
                                          s.controls[c] ? "bg-slate-900" : "bg-slate-200/50"
                                        )} 
                                      />
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                      </div>
                    </div>
                  </div>

                  {/* AI SUMMARY PANEL */}
                  <div className="card-premium bg-blue-50/40 border-blue-100 p-8 space-y-4 animate-in slide-in-from-top-4 duration-500">
                    <div className="flex items-center justify-between gap-2 border-b border-blue-100 pb-4">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 bg-blue-600 rounded">
                          <Sparkles className="w-4 h-4 text-white" />
                        </div>
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-blue-900 font-mono">Multiverse Scholarly Synthesis</h3>
                      </div>
                      <button
                        onClick={() => handleGenerateAiSummary()}
                        disabled={isGeneratingAi}
                        className="text-[9px] font-bold text-blue-700 bg-blue-100 hover:bg-blue-200/60 px-3 py-1.5 rounded-md font-mono flex items-center gap-1.5"
                      >
                        {isGeneratingAi ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        Re-evaluate Summary
                      </button>
                    </div>

                    {isGeneratingAi && (
                      <div className="flex items-center gap-2 font-mono text-xs text-blue-700 p-2 animate-pulse">
                        <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                        Senior Economist drafting multiverse interpretation memo...
                      </div>
                    )}

                    {!isGeneratingAi && aiSummary && (
                      <div className="markdown-body prose prose-slate prose-sm max-w-none 
                        prose-p:leading-relaxed prose-p:font-serif prose-p:text-blue-950/80
                        prose-headings:font-serif prose-headings:italic prose-headings:text-blue-950 prose-headings:font-bold
                      ">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{aiSummary}</ReactMarkdown>
                      </div>
                    )}
                  </div>

                </div>
              )}

            </div>

          </div>

        </div>
      )}

      {/* MODAL OVERLAY FOR MODEL COMPARISON TABLE */}
      <AnimatePresence>
        {isComparisonOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
            onClick={() => setIsComparisonOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, y: 15 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 350 }}
              className="w-full max-w-4xl relative" 
              onClick={(e) => e.stopPropagation()}
            >
              <ModelComparisonTable models={items} onClose={() => setIsComparisonOpen(false)} />
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
