import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  BarChart3, 
  HelpCircle, 
  Download, 
  Copy, 
  Check, 
  AlertCircle, 
  Sliders, 
  RefreshCw, 
  Table, 
  TrendingUp, 
  ScatterChart, 
  Activity, 
  Binary, 
  FileText 
} from 'lucide-react';
import { Dataset } from '../../types';
import { VariableMetadata } from '../../hooks/useVariableMetadata';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import jStat from 'jstat';
import Chart from 'chart.js/auto';
import { useStore } from '../../store/useStore';

interface DescriptiveStatsLabProps {
  dataset?: Dataset | null;
  uploadedData?: { headers: string[]; rows: any[][] };
  variableMetadata?: VariableMetadata;
}

interface SummaryStatRow {
  variable: string;
  label: string;
  n: number;
  mean: number;
  stdDev: number;
  min: number;
  max: number;
  q1: number;
  median: number;
  q3: number;
  skewness: number;
  kurtosis: number;
}

interface FrequencyRow {
  value: string;
  count: number;
  percentage: number;
}

export default function DescriptiveStatsLab({ dataset, uploadedData, variableMetadata }: DescriptiveStatsLabProps) {
  const { addToast } = useStore();
  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [freqVar, setFreqVar] = useState<string>('');
  const [chartVar, setChartVar] = useState<string>('');
  const [chartType, setChartType] = useState<'histogram' | 'boxplot'>('histogram');
  const [copiedLatex, setCopiedLatex] = useState(false);
  const [copiedCSV, setCopiedCSV] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<Chart | null>(null);

  // Parse headers and rows uniformly
  const { headers, rows } = useMemo(() => {
    if (dataset) {
      const hdrs = dataset.headers || dataset.variables?.map(v => v.name) || [];
      const rws = dataset.data || [];
      // Convert array of objects to array of arrays
      const rowArrays = rws.map((row: any) => hdrs.map(h => row[h]));
      return { headers: hdrs, rows: rowArrays };
    } else if (uploadedData) {
      return { headers: uploadedData.headers || [], rows: uploadedData.rows || [] };
    }
    return { headers: [], rows: [] };
  }, [dataset, uploadedData]);

  // Map of column index by variable name
  const colIndexMap = useMemo(() => {
    const map: { [key: string]: number } = {};
    headers.forEach((h, idx) => {
      map[h] = idx;
    });
    return map;
  }, [headers]);

  // Helper to map variable names to descriptive labels
  const getLabel = (name: string) => {
    if (variableMetadata && variableMetadata[name]) {
      return variableMetadata[name].label || name;
    }
    return name;
  };

  // Auto-select initial variables
  useEffect(() => {
    if (headers.length > 0) {
      setSelectedVars(headers.slice(0, 5));
      setFreqVar(headers[0] || '');
      setChartVar(headers[0] || '');
    } else {
      setSelectedVars([]);
      setFreqVar('');
      setChartVar('');
    }
  }, [headers]);

  // Helper to extract non-missing numeric values for a variable
  const getNumericValues = (varName: string): number[] => {
    const colIdx = colIndexMap[varName];
    if (colIdx === undefined) return [];
    
    return rows
      .map(row => {
        const val = row[colIdx];
        if (val === null || val === undefined || val === '') return NaN;
        return typeof val === 'string' ? parseFloat(val) : Number(val);
      })
      .filter(val => !isNaN(val) && isFinite(val));
  };

  // Helper to extract all values (including string categoricals)
  const getAllValues = (varName: string): string[] => {
    const colIdx = colIndexMap[varName];
    if (colIdx === undefined) return [];

    return rows
      .map(row => {
        const val = row[colIdx];
        if (val === null || val === undefined || val === '') return '';
        return String(val).trim();
      })
      .filter(val => val !== '');
  };

  // SECTION 1: Summary Statistics Calculations
  const summaryStats = useMemo<SummaryStatRow[]>(() => {
    return selectedVars.map(varName => {
      const vals = getNumericValues(varName);
      const N = vals.length;
      
      if (N === 0) {
        return {
          variable: varName,
          label: getLabel(varName),
          n: 0,
          mean: 0,
          stdDev: 0,
          min: 0,
          max: 0,
          q1: 0,
          median: 0,
          q3: 0,
          skewness: 0,
          kurtosis: 0
        };
      }

      const sum = vals.reduce((a, b) => a + b, 0);
      const mean = sum / N;

      // Sample variance and standard deviation
      const variance = N > 1 ? vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (N - 1) : 0;
      const stdDev = Math.sqrt(variance);

      const min = Math.min(...vals);
      const max = Math.max(...vals);

      // Percentiles
      const sorted = [...vals].sort((a, b) => a - b);
      const getPercentile = (p: number): number => {
        if (sorted.length === 0) return 0;
        if (sorted.length === 1) return sorted[0] ?? 0;
        const idx = (sorted.length - 1) * p;
        const low = Math.floor(idx);
        const high = Math.ceil(idx);
        const lowVal = sorted[low] ?? 0;
        if (low === high) return lowVal;
        const highVal = sorted[high] ?? 0;
        return lowVal + (idx - low) * (highVal - lowVal);
      };

      const q1 = getPercentile(0.25);
      const median = getPercentile(0.50);
      const q3 = getPercentile(0.75);

      // Skewness & Kurtosis (Sample definitions matching SAS/SPSS)
      let skewness = 0;
      if (N >= 3 && stdDev > 0) {
        const sumCubed = sorted.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 3), 0);
        skewness = (N / ((N - 1) * (N - 2))) * sumCubed;
      }

      let kurtosis = 0;
      if (N >= 4 && stdDev > 0) {
        const sumFourth = sorted.reduce((acc, val) => acc + Math.pow((val - mean) / stdDev, 4), 0);
        const term1 = (N * (N + 1)) / ((N - 1) * (N - 2) * (N - 3));
        const term2 = (3 * Math.pow(N - 1, 2)) / ((N - 2) * (N - 3));
        kurtosis = term1 * sumFourth - term2;
      }

      return {
        variable: varName,
        label: getLabel(varName),
        n: N,
        mean,
        stdDev,
        min,
        max,
        q1,
        median,
        q3,
        skewness,
        kurtosis
      };
    });
  }, [selectedVars, rows, colIndexMap, variableMetadata]);

  // SECTION 2: Frequency Table & Chi-Square Calculations
  const frequencyStats = useMemo(() => {
    if (!freqVar) return null;

    const vals = getAllValues(freqVar);
    const N = vals.length;
    if (N === 0) return null;

    // Build counts
    const countsMap: { [key: string]: number } = {};
    vals.forEach(val => {
      countsMap[val] = (countsMap[val] || 0) + 1;
    });

    // Create sorted row array
    const freqRows: FrequencyRow[] = Object.keys(countsMap)
      .map(val => {
        const count = countsMap[val] ?? 0;
        return {
          value: val,
          count: count,
          percentage: (count / N) * 100
        };
      })
      .sort((a, b) => (b.count || 0) - (a.count || 0));

    // Chi-Square Goodness of Fit Test against a uniform distribution (equal expected frequencies)
    const k = freqRows.length;
    let chiSquare = 0;
    let df = k - 1;
    let pValue = 1;

    if (k > 1) {
      const expected = N / k;
      freqRows.forEach(row => {
        chiSquare += Math.pow(row.count - expected, 2) / expected;
      });
      pValue = 1 - jStat.chisquare.cdf(chiSquare, df);
    }

    return {
      rows: freqRows,
      totalCount: N,
      chiSquare,
      df,
      pValue,
      k
    };
  }, [freqVar, rows, colIndexMap]);

  // SECTION 3: Pearson Correlation Calculations
  const correlationMatrix = useMemo(() => {
    if (selectedVars.length < 2) return null;

    const numVars = selectedVars.length;
    const matrix: { [key: string]: { [key: string]: { r: number; p: number; n: number } } } = {};

    selectedVars.forEach(v1 => {
      if (v1) matrix[v1] = {};
    });

    for (let i = 0; i < numVars; i++) {
      for (let j = i; j < numVars; j++) {
        const v1 = selectedVars[i];
        const v2 = selectedVars[j];
        if (!v1 || !v2) continue;

        const mCol1 = matrix[v1];
        const mCol2 = matrix[v2];
        if (!mCol1 || !mCol2) continue;

        if (v1 === v2) {
          mCol1[v2] = { r: 1.0, p: 0.0, n: getNumericValues(v1).length };
          continue;
        }

        const colIdx1 = colIndexMap[v1];
        const colIdx2 = colIndexMap[v2];
        if (colIdx1 === undefined || colIdx2 === undefined) continue;

        // Pairwise clean observation alignment
        const aligned: [number, number][] = [];
        rows.forEach(row => {
          const val1 = row[colIdx1];
          const val2 = row[colIdx2];
          const parsed1 = val1 !== null && val1 !== undefined && val1 !== '' ? parseFloat(val1) : NaN;
          const parsed2 = val2 !== null && val2 !== undefined && val2 !== '' ? parseFloat(val2) : NaN;

          if (!isNaN(parsed1) && isFinite(parsed1) && !isNaN(parsed2) && isFinite(parsed2)) {
            aligned.push([parsed1, parsed2]);
          }
        });

        const n = aligned.length;
        if (n < 2) {
          mCol1[v2] = { r: 0, p: 1, n };
          mCol2[v1] = { r: 0, p: 1, n };
          continue;
        }

        const xVals = aligned.map(p => p[0]);
        const yVals = aligned.map(p => p[1]);

        const xMean = xVals.reduce((a, b) => a + b, 0) / n;
        const yMean = yVals.reduce((a, b) => a + b, 0) / n;

        let num = 0;
        let denX = 0;
        let denY = 0;

        for (let idx = 0; idx < n; idx++) {
          const dx = (xVals[idx] ?? 0) - xMean;
          const dy = (yVals[idx] ?? 0) - yMean;
          num += dx * dy;
          denX += dx * dx;
          denY += dy * dy;
        }

        if (denX === 0 || denY === 0) {
          mCol1[v2] = { r: 0, p: 1, n };
          mCol2[v1] = { r: 0, p: 1, n };
          continue;
        }

        const r = num / Math.sqrt(denX * denY);
        let p = 1.0;
        
        if (n > 2 && Math.abs(r) < 1) {
          const t = r * Math.sqrt(n - 2) / Math.sqrt(1 - r * r);
          p = 2 * (1 - jStat.studentt.cdf(Math.abs(t), n - 2));
        } else if (Math.abs(r) === 1) {
          p = 0.0;
        }

        mCol1[v2] = { r, p, n };
        mCol2[v1] = { r, p, n };
      }
    }

    return matrix;
  }, [selectedVars, rows, colIndexMap]);

  // SECTION 4: Distribution Chart Renderer (Histogram + Normal Curve)
  useEffect(() => {
    if (!chartVar || chartType !== 'histogram' || !canvasRef.current) return;

    const vals = getNumericValues(chartVar);
    if (vals.length === 0) return;

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    // Destroy existing instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    // Sort observations for calculations
    const sorted = [...vals].sort((a, b) => a - b);
    const N = sorted.length;
    const min = sorted[0] ?? 0;
    const max = sorted[N - 1] ?? 0;
    const range = max - min;

    // Determine nice bins using Sturges' Formula: k = ceiling(log2(N) + 1)
    const k = Math.min(Math.max(Math.ceil(Math.log2(N) + 1), 6), 25);
    const binWidth = range / k;

    // Construct bin labels and counts
    const binCounts = new Array(k).fill(0);
    const binEdges = [];
    for (let i = 0; i <= k; i++) {
      binEdges.push(min + i * binWidth);
    }

    vals.forEach(v => {
      let binIdx = Math.floor((v - min) / binWidth);
      if (binIdx >= k) binIdx = k - 1; // Safeguard max edge
      if (binIdx < 0) binIdx = 0;
      binCounts[binIdx]++;
    });

    const binLabels = [];
    const histogramData = [];
    for (let i = 0; i < k; i++) {
      const mid = ((binEdges[i] ?? 0) + (binEdges[i + 1] ?? 0)) / 2;
      binLabels.push(mid.toFixed(2));
      histogramData.push(binCounts[i]);
    }

    // Normal curve fitting parameters
    const mean = vals.reduce((a, b) => a + b, 0) / N;
    const variance = N > 1 ? vals.reduce((acc, v) => acc + Math.pow(v - mean, 2), 0) / (N - 1) : 0;
    const s = Math.sqrt(variance);

    // Generate fitted normal curve points at the midpoints
    const normalCurvePoints = binLabels.map(lbl => {
      const x = parseFloat(lbl);
      if (s === 0) return 0;
      // Normal Density Function: f(x) = (1 / (s * sqrt(2pi))) * exp(-0.5 * ((x-mean)/s)^2)
      const density = (1 / (s * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x - mean) / s, 2));
      // Scale density to align with histogram counts: density * N * binWidth
      return density * N * binWidth;
    });

    chartInstanceRef.current = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: binLabels,
        datasets: [
          {
            label: 'Observed Frequency',
            data: histogramData,
            backgroundColor: 'rgba(120, 113, 108, 0.45)', // stone-500
            borderColor: 'rgba(120, 113, 108, 0.85)',
            borderWidth: 1.5,
            barPercentage: 1.0,
            categoryPercentage: 1.0, // Removes spacing between bars for canonical histogram look
            order: 2
          },
          {
            label: 'Fitted Normal Curve',
            data: normalCurvePoints,
            type: 'line',
            borderColor: '#ec4899', // pink-500 rose
            borderWidth: 2.5,
            pointRadius: 0,
            fill: false,
            tension: 0.4,
            order: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: {
            position: 'top',
            labels: {
              font: {
                family: 'monospace',
                size: 10
              }
            }
          },
          tooltip: {
            bodyFont: { family: 'monospace' },
            titleFont: { family: 'monospace' }
          }
        },
        scales: {
          x: {
            title: {
              display: true,
              text: `${getLabel(chartVar)} (Bin Midpoints)`,
              font: { family: 'serif', size: 12 }
            },
            grid: { display: false }
          },
          y: {
            title: {
              display: true,
              text: 'Frequency',
              font: { family: 'serif', size: 12 }
            },
            beginAtZero: true
          }
        }
      }
    });

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [chartVar, chartType, rows, colIndexMap]);

  // SVG Box Plot Parameters
  const boxPlotData = useMemo(() => {
    if (!chartVar || chartType !== 'boxplot') return null;

    const vals = getNumericValues(chartVar);
    if (vals.length === 0) return null;

    const sorted = [...vals].sort((a, b) => a - b);
    const N = sorted.length;
    const min = sorted[0] ?? 0;
    const max = sorted[N - 1] ?? 0;

    const getPercentile = (p: number) => {
      const idx = (N - 1) * p;
      const low = Math.floor(idx);
      const high = Math.ceil(idx);
      const lowVal = sorted[low] ?? 0;
      if (low === high) return lowVal;
      const highVal = sorted[high] ?? 0;
      return lowVal + (idx - low) * (highVal - lowVal);
    };

    const q1 = getPercentile(0.25);
    const median = getPercentile(0.50);
    const q3 = getPercentile(0.75);
    const iqr = q3 - q1;

    // Mean
    const mean = vals.reduce((a, b) => a + b, 0) / N;

    // Tukey fences (1.5 * IQR)
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    // Whisker limits are actual observations within Tukey fences
    const valuesInFence = sorted.filter(v => v >= lowerFence && v <= upperFence);
    const whiskerMin = (valuesInFence.length > 0 ? valuesInFence[0] : q1) ?? q1;
    const whiskerMax = (valuesInFence.length > 0 ? valuesInFence[valuesInFence.length - 1] : q3) ?? q3;

    // Outliers are observations outside whiskers
    const outliers = sorted.filter(v => v < whiskerMin || v > whiskerMax);

    return {
      min,
      max,
      q1,
      median,
      q3,
      iqr,
      mean,
      whiskerMin,
      whiskerMax,
      outliers
    };
  }, [chartVar, chartType, rows, colIndexMap]);

  // LATEX EXPORT: Generates AER/APA style descriptive statistics table
  const handleCopyLaTeX = () => {
    if (summaryStats.length === 0) return;

    let latex = `% LaTeX Summary Statistics Table (APA/AER Protocol)\n`;
    latex += `\\begin{table}[htbp]\n`;
    latex += `  \\centering\n`;
    latex += `  \\caption{Summary Statistics: Academic Sample Diagnostics}\n`;
    latex += `  \\begin{tabular}{lcccccccc}\n`;
    latex += `    \\hline\\hline\n`;
    latex += `    Variable & Obs & Mean & Std. Dev. & Min & Median & Max & Skewness & Kurtosis \\\\\n`;
    latex += `    \\hline\n`;

    summaryStats.forEach(row => {
      const variableEscaped = row.variable.replace(/_/g, '\\_');
      latex += `    ${variableEscaped} & ${row.n} & ${row.mean.toFixed(4)} & ${row.stdDev.toFixed(4)} & ${row.min.toFixed(4)} & ${row.median.toFixed(4)} & ${row.max.toFixed(4)} & ${row.skewness.toFixed(4)} & ${row.kurtosis.toFixed(4)} \\\\\n`;
    });

    latex += `    \\hline\\hline\n`;
    latex += `  \\end{tabular}\n`;
    latex += `  \\item[] \\textit{Note:} Standard Fisher-Pearson standardized moment calculations reported. \n`;
    latex += `\\end{table}`;

    navigator.clipboard.writeText(latex);
    setCopiedLatex(true);
    addToast('success', 'LaTeX Formatted', 'Publication-quality summary statistics copied as LaTeX block.');
    setTimeout(() => setCopiedLatex(false), 2000);
  };

  // CSV EXPORT
  const handleCopyCSV = () => {
    if (summaryStats.length === 0) return;

    let csv = `Variable,Label,N,Mean,StdDev,Min,Q1,Median,Q3,Max,Skewness,Kurtosis\n`;
    summaryStats.forEach(row => {
      csv += `"${row.variable}","${row.label}",${row.n},${row.mean},${row.stdDev},${row.min},${row.q1},${row.median},${row.q3},${row.max},${row.skewness},${row.kurtosis}\n`;
    });

    navigator.clipboard.writeText(csv);
    setCopiedCSV(true);
    addToast('success', 'CSV Formatted', 'Summary statistics data copied as comma-separated vector.');
    setTimeout(() => setCopiedCSV(false), 2000);
  };

  const toggleVariableSelection = (varName: string) => {
    setSelectedVars(prev => 
      prev.includes(varName)
        ? prev.filter(v => v !== varName)
        : [...prev, varName]
    );
  };

  // Guard Clause for loaded dataset
  if (headers.length === 0) {
    return (
      <div className="max-w-4xl mx-auto py-12 px-4 text-center">
        <div className="card-premium p-10 bg-white border border-stone-200 rounded-3xl shadow-sm space-y-6">
          <div className="inline-flex p-4 rounded-full bg-amber-50 border border-amber-200 text-amber-600">
            <AlertCircle className="w-10 h-10" />
          </div>
          <div className="space-y-2">
            <h3 className="text-xl font-serif font-bold text-stone-800">No Dataset Uploaded</h3>
            <p className="text-stone-500 text-sm max-w-md mx-auto">
              Please upload an econometric CSV/Excel file or load an academic research template in the Onboarding Lab first before accessing the Descriptive Statistics Lab.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700" id="descriptive-stats-lab">
      
      <ModuleIntroCard 
        title="Descriptive Statistics Lab"
        description="The scientific foundation of any empirical work. Compute publication-quality summary statistics, investigate frequency distributions of dummy/categorical factors, and audit pairwise linear correlations prior to running micro/macroeconometric regressions."
        useWhen="You need to summarize the central tendency, dispersion, skewness, kurtosis, frequency breakdowns, and correlation matrix of your sample variables before regression modeling."
        requires={[
          "A valid loaded dataset or active workspace series",
          "Selected numeric or dummy variables of interest"
        ]}
        youWillGet={[
          "A publication-ready summary statistics table in APA/AER style",
          "Frequency and percentage distributions with Chi-Square goodness-of-fit test",
          "Color-coded Pearson pairwise correlation matrix with significance levels",
          "Interactive distributions visuals including histograms and horizontal boxplots"
        ]}
        pitfalls={[
          "Calculating categorical counts on continuous variables with infinite distinct values",
          "Assuming high correlation implies causality without proper structural identification",
          "Failing to audit skewness and kurtosis before applying standard OLS estimators"
        ]}
        example="An economist loaded the Mincerian Wages dataset and analyzed the skewness of wage rates and the correlation between education level and wages before designing a structural OLS regression."
      />

      {/* Variables Workspace Selector */}
      <div className="bg-white border border-stone-200/80 p-6 rounded-3xl shadow-sm space-y-4">
        <div className="flex justify-between items-center border-b border-stone-100 pb-3">
          <h4 className="text-sm font-bold text-stone-900 font-mono uppercase tracking-wider flex items-center gap-2">
            <Sliders className="w-4 h-4 text-stone-500" /> Active Workspace Columns Selector
          </h4>
          <span className="text-[10px] font-mono text-stone-400 bg-stone-100 px-2 py-0.5 rounded-full uppercase">
            {selectedVars.length} Selected
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {headers.map(name => {
            const isSelected = selectedVars.includes(name);
            return (
              <button
                key={name}
                onClick={() => toggleVariableSelection(name)}
                className={`px-3 py-1.5 text-xs font-mono rounded-xl border transition-all duration-200 cursor-pointer ${
                  isSelected 
                    ? 'bg-stone-900 text-white border-stone-900 shadow-sm' 
                    : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                }`}
              >
                {getLabel(name)}
              </button>
            );
          })}
        </div>
      </div>

      {/* SECTION 1: Summary Statistics Table */}
      {selectedVars.length > 0 && (
        <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-stone-50/50">
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 font-mono uppercase tracking-wider">
                <Table className="w-4 h-4 text-stone-600" /> APA Table I: Summary Statistics Matrix
              </h3>
              <p className="text-xs text-stone-500 font-serif">
                AER-style central tendency and sample moment diagnostic parameters.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopyLaTeX}
                className="px-3 py-1.5 text-xs font-mono border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-xl transition-all duration-200 flex items-center gap-1.5"
              >
                {copiedLatex ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Copy className="w-3.5 h-3.5" />}
                Copy LaTeX Table
              </button>
              <button
                onClick={handleCopyCSV}
                className="px-3 py-1.5 text-xs font-mono border border-stone-200 hover:bg-stone-100 text-stone-700 rounded-xl transition-all duration-200 flex items-center gap-1.5"
              >
                {copiedCSV ? <Check className="w-3.5 h-3.5 text-green-600" /> : <Download className="w-3.5 h-3.5" />}
                Copy CSV
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs font-serif text-stone-800">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-100/60 font-mono text-[10px] text-stone-600 uppercase tracking-wider">
                  <th className="py-3 px-5 font-bold">Variable Name</th>
                  <th className="py-3 px-3 font-bold text-center">N</th>
                  <th className="py-3 px-3 font-bold text-right">Mean</th>
                  <th className="py-3 px-3 font-bold text-right">Std. Dev.</th>
                  <th className="py-3 px-3 font-bold text-right">Min</th>
                  <th className="py-3 px-3 font-bold text-right">Q1 (25%)</th>
                  <th className="py-3 px-3 font-bold text-right">Median (50%)</th>
                  <th className="py-3 px-3 font-bold text-right">Q3 (75%)</th>
                  <th className="py-3 px-3 font-bold text-right">Max</th>
                  <th className="py-3 px-3 font-bold text-right">Skewness</th>
                  <th className="py-3 px-3 font-bold text-right pr-5">Kurtosis</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100 font-serif">
                {summaryStats.map(row => (
                  <tr key={row.variable} className="hover:bg-stone-50/50 transition-colors">
                    <td className="py-3.5 px-5 font-mono text-[11px] text-stone-600 font-medium bg-stone-50/30">
                      {row.label}
                      {row.variable !== row.label && (
                        <span className="block text-[10px] text-stone-400 font-mono font-normal">
                          id: {row.variable}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-3 text-center font-mono text-stone-500">
                      {row.n}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono font-semibold text-stone-900">
                      {row.n > 0 ? row.mean.toFixed(4) : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-stone-600">
                      {row.n > 0 ? row.stdDev.toFixed(4) : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-stone-500">
                      {row.n > 0 ? row.min.toFixed(4) : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-stone-500">
                      {row.n > 0 ? row.q1.toFixed(4) : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-stone-700 font-medium">
                      {row.n > 0 ? row.median.toFixed(4) : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-stone-500">
                      {row.n > 0 ? row.q3.toFixed(4) : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-stone-500">
                      {row.n > 0 ? row.max.toFixed(4) : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-stone-600">
                      {row.n > 0 ? row.skewness.toFixed(4) : '-'}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono text-stone-600 pr-5">
                      {row.n > 0 ? row.kurtosis.toFixed(4) : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="bg-stone-50 p-4 border-t border-stone-100 flex items-start gap-2">
            <HelpCircle className="w-4 h-4 text-stone-400 shrink-0 mt-0.5" />
            <div className="text-[11px] text-stone-500 leading-relaxed font-serif">
              <strong>Econometric Intuition:</strong> Skewness captures the symmetry of the variable distribution relative to a standard normal curve (skewness = 0). Kurtosis reports tail fatness: standard normal distribution has an excess kurtosis of exactly 0. High kurtosis (&gt; 3) signals leptokurtic behavior with risk of heavy outliers that might skew traditional OLS parameters.
            </div>
          </div>
        </div>
      )}

      {/* SECTION 2 & SECTION 3 Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* SECTION 2: Frequency Table */}
        <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-stone-100 flex items-center justify-between bg-stone-50/50">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 font-mono uppercase tracking-wider">
                  <Binary className="w-4 h-4 text-stone-600" /> Frequency Breakdown
                </h3>
                <p className="text-xs text-stone-500 font-serif">
                  Categorical &amp; Dummy Factor representation diagnostics.
                </p>
              </div>
              <select
                value={freqVar}
                onChange={(e) => setFreqVar(e.target.value)}
                className="px-2 py-1.5 text-xs font-mono rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
              >
                {headers.map(h => (
                  <option key={h} value={h}>{getLabel(h)}</option>
                ))}
              </select>
            </div>

            {frequencyStats ? (
              <div className="p-6 space-y-6">
                <div className="overflow-x-auto max-h-72 overflow-y-auto border border-stone-100 rounded-2xl">
                  <table className="w-full text-left border-collapse text-xs font-serif text-stone-800">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 font-mono text-[9px] text-stone-600 uppercase tracking-wider">
                        <th className="py-2.5 px-4 font-bold">Category / Value</th>
                        <th className="py-2.5 px-4 font-bold text-center">Observed Count (O)</th>
                        <th className="py-2.5 px-4 font-bold text-right pr-4">Percentage</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {frequencyStats.rows.map(row => (
                        <tr key={row.value} className="hover:bg-stone-50/30 transition-colors">
                          <td className="py-2 px-4 font-mono text-[11px] text-stone-600">{row.value}</td>
                          <td className="py-2 px-4 text-center font-mono text-stone-700">{row.count}</td>
                          <td className="py-2 px-4 text-right font-mono text-stone-900 pr-4">{row.percentage.toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Chi-Square Goodness of Fit Test Results */}
                <div className="bg-stone-50 border border-stone-200/50 p-4 rounded-2xl space-y-3">
                  <div className="flex items-center gap-1.5 border-b border-stone-200 pb-1.5">
                    <TrendingUp className="w-4 h-4 text-stone-700" />
                    <span className="text-xs font-bold text-stone-900 font-mono uppercase tracking-wider">Chi-Square Uniformity Test</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="p-2.5 bg-white border border-stone-100 rounded-xl">
                      <div className="text-[10px] text-stone-400 font-mono uppercase tracking-wider">Chi-Square (χ²)</div>
                      <div className="text-sm font-semibold font-mono text-stone-800">{frequencyStats.chiSquare.toFixed(4)}</div>
                    </div>
                    <div className="p-2.5 bg-white border border-stone-100 rounded-xl">
                      <div className="text-[10px] text-stone-400 font-mono uppercase tracking-wider">DF</div>
                      <div className="text-sm font-semibold font-mono text-stone-800">{frequencyStats.df}</div>
                    </div>
                    <div className="p-2.5 bg-white border border-stone-100 rounded-xl">
                      <div className="text-[10px] text-stone-400 font-mono uppercase tracking-wider">Asymp. Sig. (p-value)</div>
                      <div className={`text-sm font-semibold font-mono ${frequencyStats.pValue < 0.05 ? 'text-rose-600 font-bold' : 'text-stone-800'}`}>
                        {frequencyStats.pValue < 0.0001 ? '<0.0001' : frequencyStats.pValue.toFixed(4)}
                      </div>
                    </div>
                  </div>
                  <p className="text-[10px] text-stone-500 italic font-serif leading-relaxed text-center">
                    Null hypothesis (H₀): Classes are uniformly distributed across categories. Rejecting H₀ (p &lt; 0.05) implies a statistically significant clustering structure.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center text-stone-400 text-xs italic font-serif">
                Select a valid categorical variable to compute frequencies.
              </div>
            )}
          </div>
        </div>

        {/* SECTION 3: Pearson Correlation Matrix */}
        <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-stone-100 bg-stone-50/50">
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 font-mono uppercase tracking-wider">
                <ScatterChart className="w-4 h-4 text-stone-600" /> Pearson Pairwise Correlation Matrix
              </h3>
              <p className="text-xs text-stone-500 font-serif">
                Two-tailed significance stars reported for numeric column series.
              </p>
            </div>

            {correlationMatrix ? (
              <div className="p-6">
                <div className="overflow-x-auto max-h-[350px] overflow-y-auto border border-stone-100 rounded-2xl">
                  <table className="w-full text-center border-collapse text-xs font-serif text-stone-800">
                    <thead>
                      <tr className="border-b border-stone-200 bg-stone-50 font-mono text-[9px] text-stone-600 uppercase tracking-wider">
                        <th className="py-3 px-4 font-bold text-left sticky left-0 bg-stone-50">Variable</th>
                        {selectedVars.map(v => (
                          <th key={v} className="py-3 px-3 font-bold min-w-28">{getLabel(v)}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-100">
                      {selectedVars.map(v1 => (
                        <tr key={v1} className="hover:bg-stone-50/30 transition-colors">
                          <td className="py-3 px-4 font-bold text-left font-mono text-[10px] text-stone-600 sticky left-0 bg-white shadow-[2px_0_5px_rgba(0,0,0,0.02)]">
                            {getLabel(v1)}
                          </td>
                          {selectedVars.map(v2 => {
                            const data = correlationMatrix[v1]?.[v2] || { r: 0, p: 1, n: 0 };
                            const r = data.r;
                            const p = data.p;

                            // Determine sign and background gradient
                            // Strong positive: dark blue. Strong negative: dark red. White: zero.
                            let cellBg = 'bg-white';
                            let cellText = 'text-stone-800';
                            
                            if (v1 === v2) {
                              cellBg = 'bg-stone-100/80';
                              cellText = 'text-stone-400 font-normal';
                            } else if (r > 0) {
                              const op = Math.min(Math.round(r * 90), 90);
                              cellBg = `rgba(30, 58, 138, ${op / 100})`; // tailwind blue-900 (30, 58, 138)
                              cellText = r > 0.4 ? 'text-white' : 'text-blue-900';
                            } else if (r < 0) {
                              const op = Math.min(Math.round(Math.abs(r) * 90), 90);
                              cellBg = `rgba(153, 27, 27, ${op / 100})`; // tailwind red-800 (153, 27, 27)
                              cellText = Math.abs(r) > 0.4 ? 'text-white' : 'text-red-900';
                            }

                            // Stars mapping
                            let stars = '';
                            if (v1 !== v2) {
                              if (p < 0.01) stars = '***';
                              else if (p < 0.05) stars = '**';
                              else if (p < 0.10) stars = '*';
                            }

                            return (
                              <td 
                                key={v2} 
                                style={{ backgroundColor: v1 === v2 ? undefined : cellBg }}
                                className={`py-3.5 px-3 font-mono text-xs transition-colors border-r border-stone-100 ${cellText}`}
                              >
                                <span className="font-bold">{r.toFixed(3)}</span>
                                <span className="text-[10px] text-amber-500 font-extrabold ml-0.5 inline-block w-4 text-left">{stars}</span>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="mt-4 flex flex-wrap justify-between gap-2 text-[10px] text-stone-500 font-serif italic">
                  <span>Significance Levels: *** p &lt; 0.01, ** p &lt; 0.05, * p &lt; 0.10</span>
                  <span>Pairwise Deletion applied for observations.</span>
                </div>
              </div>
            ) : (
              <div className="p-10 text-center text-stone-400 text-xs italic font-serif">
                Select 2 or more variables from the selector matrix above to generate pairwise correlation coefficients.
              </div>
            )}
          </div>
        </div>

      </div>

      {/* SECTION 4: Distribution visual panel */}
      {chartVar && (
        <div className="bg-white border border-stone-200 rounded-3xl shadow-sm overflow-hidden">
          <div className="p-5 border-b border-stone-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-stone-50/50">
            <div>
              <h3 className="text-sm font-bold text-stone-900 flex items-center gap-2 font-mono uppercase tracking-wider">
                <Activity className="w-4 h-4 text-stone-600" /> Interactive Distribution Diagnostics
              </h3>
              <p className="text-xs text-stone-500 font-serif">
                Investigate skewness and outlier presence in the active series.
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 bg-stone-100 p-1 rounded-xl border border-stone-200">
                <button
                  onClick={() => setChartType('histogram')}
                  className={`px-3 py-1 text-xs font-mono rounded-lg transition-all ${
                    chartType === 'histogram' 
                      ? 'bg-white text-stone-900 shadow-sm font-semibold' 
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Histogram
                </button>
                <button
                  onClick={() => setChartType('boxplot')}
                  className={`px-3 py-1 text-xs font-mono rounded-lg transition-all ${
                    chartType === 'boxplot' 
                      ? 'bg-white text-stone-900 shadow-sm font-semibold' 
                      : 'text-stone-500 hover:text-stone-800'
                  }`}
                >
                  Box Plot
                </button>
              </div>

              <select
                value={chartVar}
                onChange={(e) => setChartVar(e.target.value)}
                className="px-2 py-1.5 text-xs font-mono rounded-lg border border-stone-200 focus:outline-none focus:border-stone-400 bg-white"
              >
                {headers.map(h => (
                  <option key={h} value={h}>{getLabel(h)}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-6">
            {chartType === 'histogram' ? (
              <div className="space-y-4">
                <div className="h-80 w-full relative">
                  <canvas ref={canvasRef} id="descriptive-histogram-canvas"></canvas>
                </div>
                <div className="text-center text-[10px] text-stone-400 font-mono uppercase tracking-wider">
                  Note: Rose line indicates fitted normal distribution curve based on sample Mean and Standard Deviation parameters.
                </div>
              </div>
            ) : (
              boxPlotData && (
                <div className="space-y-6">
                  {/* Custom SVG Box Plot */}
                  <div className="p-4 bg-stone-50 border border-stone-200/40 rounded-2xl flex flex-col items-center">
                    <div className="w-full max-w-4xl h-56 relative flex items-center justify-center">
                      <svg viewBox="0 0 800 200" className="w-full h-full select-none overflow-visible">
                        {/* Define scales: map our range to svg coordinates 50 to 750 */}
                        {(() => {
                          if (!boxPlotData) return null;
                          const { min = 0, max = 0, q1 = 0, median = 0, q3 = 0, whiskerMin = 0, whiskerMax = 0, mean = 0, outliers = [] } = boxPlotData;
                          const dataRange = max - min;
                          const scale = (val: number) => {
                            if (dataRange === 0) return 400;
                            return 50 + ((val - min) / dataRange) * 700;
                          };

                          const q1X = scale(q1);
                          const medX = scale(median);
                          const q3X = scale(q3);
                          const wMinX = scale(whiskerMin);
                          const wMaxX = scale(whiskerMax);
                          const meanX = scale(mean);

                          return (
                            <g>
                              {/* Central axis line */}
                              <line x1="50" y1="160" x2="750" y2="160" stroke="#d6d3d1" strokeWidth="2" strokeDasharray="4,4" />

                              {/* Tukey Whiskers lines */}
                              <line x1={wMinX} y1="100" x2={q1X} y2="100" stroke="#78716c" strokeWidth="2.5" />
                              <line x1={q3X} y1="100" x2={wMaxX} y2="100" stroke="#78716c" strokeWidth="2.5" />

                              {/* Whisker Ends vertical bars */}
                              <line x1={wMinX} y1="80" x2={wMinX} y2="120" stroke="#78716c" strokeWidth="2.5" />
                              <line x1={wMaxX} y1="80" x2={wMaxX} y2="120" stroke="#78716c" strokeWidth="2.5" />

                              {/* Interquartile Range (IQR) Box */}
                              <rect 
                                x={q1X} 
                                y="60" 
                                width={Math.max(q3X - q1X, 2)} 
                                height="80" 
                                fill="#e7e5e4" 
                                stroke="#44403c" 
                                strokeWidth="2.5" 
                                rx="4"
                              />

                              {/* Median Line */}
                              <line x1={medX} y1="60" x2={medX} y2="140" stroke="#1c1917" strokeWidth="3.5" />

                              {/* Mean Indicator (Red/Pink Diamond) */}
                              <polygon 
                                points={`${meanX},50 ${meanX + 8},58 ${meanX},66 ${meanX - 8},58`}
                                fill="#f43f5e" 
                                stroke="#be123c" 
                                strokeWidth="1.5"
                              />

                              {/* Labels for box elements */}
                              <text x={q1X} y="158" fill="#57534e" fontSize="10" fontFamily="monospace" textAnchor="middle">Q1 ({q1.toFixed(2)})</text>
                              <text x={medX} y="44" fill="#1c1917" fontSize="10" fontFamily="monospace" fontWeight="bold" textAnchor="middle">Med ({median.toFixed(2)})</text>
                              <text x={q3X} y="158" fill="#57534e" fontSize="10" fontFamily="monospace" textAnchor="middle">Q3 ({q3.toFixed(2)})</text>
                              <text x={wMinX} y="136" fill="#78716c" fontSize="10" fontFamily="monospace" textAnchor="middle">Lower</text>
                              <text x={wMaxX} y="136" fill="#78716c" fontSize="10" fontFamily="monospace" textAnchor="middle">Upper</text>
                              <text x={meanX} y="34" fill="#be123c" fontSize="10" fontFamily="monospace" textAnchor="middle">Mean ({mean.toFixed(2)})</text>

                              {/* Draw Outliers as Hollow Circles */}
                              {outliers.map((out, idx) => (
                                <circle 
                                  key={idx} 
                                  cx={scale(out)} 
                                  cy="100" 
                                  r="5" 
                                  fill="none" 
                                  stroke="#e11d48" 
                                  strokeWidth="1.5" 
                                />
                              ))}

                              {/* Axis Ticks */}
                              <line x1="50" y1="160" x2="50" y2="168" stroke="#78716c" strokeWidth="1.5" />
                              <text x="50" y="182" fill="#78716c" fontSize="10" fontFamily="monospace" textAnchor="middle">{min.toFixed(2)}</text>

                              <line x1="750" y1="160" x2="750" y2="168" stroke="#78716c" strokeWidth="1.5" />
                              <text x="750" y="182" fill="#78716c" fontSize="10" fontFamily="monospace" textAnchor="middle">{max.toFixed(2)}</text>
                            </g>
                          );
                        })()}
                      </svg>
                    </div>

                    <div className="text-[11px] font-serif text-stone-500 leading-relaxed bg-white p-3.5 rounded-xl border border-stone-100">
                      <strong>Box Plot Interpretation Guide:</strong> The whiskers represent Tukey fences enclosing values within 1.5 times the IQR (Interquartile Range) from the box limits. Individual hollow circles plotted beyond these fences are statistical outliers. The red diamond reports the arithmetic sample mean, showing any skewness distance from the median bar.
                    </div>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

    </div>
  );
}
