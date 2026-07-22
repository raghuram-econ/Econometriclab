import React, { useEffect, useRef, useState } from 'react';
import { Download, BarChart3, HelpCircle, Check } from 'lucide-react';

interface CoefficientItem {
  variable: string;
  estimate: number;
  confLow: number;
  confHigh: number;
}

interface ChartsPanelProps {
  residuals: number[];
  fitted: number[];
  yActual: number[];
  coefficients: CoefficientItem[];
  xData?: number[];
  yData?: number[];
}

type TabType = 'res_fitted' | 'histogram' | 'coefficients' | 'actual_predicted';

export default function ChartsPanel({
  residuals = [],
  fitted = [],
  yActual = [],
  coefficients = [],
}: ChartsPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('res_fitted');
  const [chartJSLoaded, setChartJSLoaded] = useState<boolean>(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartInstanceRef = useRef<any | null>(null);

  // Dynamic script loader for Chart.js
  useEffect(() => {
    let isMounted = true;
    const loadChartJS = () => {
      const globalChart = (window as any).Chart;
      if (globalChart) {
        if (isMounted) setChartJSLoaded(true);
        return;
      }

      const scriptId = 'chartjs-cdn-script';
      let script = document.getElementById(scriptId) as HTMLScriptElement;
      
      if (!script) {
        script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.umd.min.js';
        script.async = true;
        document.head.appendChild(script);
      }

      const handleLoad = () => {
        if (isMounted) setChartJSLoaded(true);
      };

      const handleError = () => {
        if (isMounted) setLoadingError('Could not load visualization library from CDN.');
      };

      script.addEventListener('load', handleLoad);
      script.addEventListener('error', handleError);

      return () => {
        script.removeEventListener('load', handleLoad);
        script.removeEventListener('error', handleError);
      };
    };

    const cleanup = loadChartJS();
    return () => {
      isMounted = false;
      if (cleanup) cleanup();
    };
  }, []);

  // Re-build Chart on Tab change or data changes
  useEffect(() => {
    if (!chartJSLoaded || !canvasRef.current) return;
    if (!residuals || !fitted || !yActual || !coefficients) return;
    if (residuals.length === 0 || fitted.length === 0 || yActual.length === 0) return;

    const Chart = (window as any).Chart;
    if (!Chart) return;

    // Destroy previous instance
    if (chartInstanceRef.current) {
      chartInstanceRef.current.destroy();
      chartInstanceRef.current = null;
    }

    const ctx = canvasRef.current.getContext('2d');
    if (!ctx) return;

    let chartConfig: any = {};

    // 1. Tab: Residuals vs Fitted
    if (activeTab === 'res_fitted') {
      const minFitted = Math.min(...fitted);
      const maxFitted = Math.max(...fitted);
      const rangePadding = (maxFitted - minFitted) * 0.05 || 1.0;

      chartConfig = {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: 'Residuals',
              data: fitted.map((f, idx) => ({ x: f, y: residuals[idx] })),
              backgroundColor: 'rgba(27, 108, 168, 0.75)',
              borderColor: '#1b6ca8',
              pointRadius: 4.5,
              pointHoverRadius: 6,
            },
            {
              label: 'Reference Line (y=0)',
              data: [
                { x: minFitted - rangePadding, y: 0 },
                { x: maxFitted + rangePadding, y: 0 }
              ],
              borderColor: '#ef4444',
              borderWidth: 1.5,
              borderDash: [5, 5],
              pointRadius: 0,
              showLine: true,
              fill: false,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: 'Residuals vs Fitted — check for heteroskedasticity',
              font: { family: 'Arial', size: 13, weight: 'bold' },
              color: '#1e293b',
              padding: { bottom: 12 }
            },
            legend: { display: false }
          },
          scales: {
            x: {
              type: 'linear',
              title: {
                display: true,
                text: 'Fitted Values (ŷ)',
                font: { family: 'Arial', size: 11, weight: 'bold' },
                color: '#64748b'
              },
              ticks: { font: { family: 'Arial', size: 10 }, color: '#64748b' },
              grid: { color: '#f1f5f9' }
            },
            y: {
              title: {
                display: true,
                text: 'Residuals (e)',
                font: { family: 'Arial', size: 11, weight: 'bold' },
                color: '#64748b'
              },
              ticks: { font: { family: 'Arial', size: 10 }, color: '#64748b' },
              grid: { color: '#f1f5f9' }
            }
          }
        }
      };
    }

    // 2. Tab: Histogram of Residuals
    else if (activeTab === 'histogram') {
      const min = Math.min(...residuals);
      const max = Math.max(...residuals);
      const n = residuals.length;
      const numBins = 15;
      const binWidth = (max - min) / numBins || 0.1;
      const binCounts = new Array(numBins).fill(0);
      const binLabels = new Array(numBins);

      for (let i = 0; i < numBins; i++) {
        const binMin = min + i * binWidth;
        const binMax = binMin + binWidth;
        binLabels[i] = `${binMin.toFixed(2)} to ${binMax.toFixed(2)}`;
      }

      residuals.forEach(r => {
        let binIndex = Math.floor((r - min) / binWidth);
        if (binIndex >= numBins) binIndex = numBins - 1;
        if (binIndex < 0) binIndex = 0;
        binCounts[binIndex]++;
      });

      // Calculate Normal Curve
      const mean = residuals.reduce((sum, r) => sum + r, 0) / n;
      const variance = residuals.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1 || 1);
      const sd = Math.sqrt(variance) || 1e-6;

      const normalCurveValues = [];
      for (let i = 0; i < numBins; i++) {
        const binMin = min + i * binWidth;
        const x_i = binMin + binWidth / 2;
        const pdf = (1 / (sd * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * Math.pow((x_i - mean) / sd, 2));
        const val = pdf * n * binWidth;
        normalCurveValues.push(val);
      }

      chartConfig = {
        type: 'bar',
        data: {
          labels: binLabels,
          datasets: [
            {
              label: 'Residual Count',
              data: binCounts,
              backgroundColor: 'rgba(27, 108, 168, 0.75)',
              borderColor: '#1b6ca8',
              borderWidth: 1,
              barPercentage: 1.0,
              categoryPercentage: 1.0,
              order: 2,
            },
            {
              label: 'Normal Curve Overlay',
              data: normalCurveValues,
              borderColor: '#ef4444',
              borderWidth: 2,
              pointRadius: 2,
              type: 'line',
              fill: false,
              tension: 0.4,
              order: 1,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: 'Distribution of Residuals — check for normality',
              font: { family: 'Arial', size: 13, weight: 'bold' },
              color: '#1e293b',
              padding: { bottom: 12 }
            },
            legend: { display: false }
          },
          scales: {
            x: {
              title: {
                display: true,
                text: 'Residual Intervals',
                font: { family: 'Arial', size: 11, weight: 'bold' },
                color: '#64748b'
              },
              ticks: { 
                font: { family: 'Arial', size: 9 }, 
                color: '#64748b',
                maxRotation: 45,
                minRotation: 45
              },
              grid: { display: false }
            },
            y: {
              title: {
                display: true,
                text: 'Frequency',
                font: { family: 'Arial', size: 11, weight: 'bold' },
                color: '#64748b'
              },
              ticks: { font: { family: 'Arial', size: 10 }, color: '#64748b' },
              grid: { color: '#f1f5f9' }
            }
          }
        }
      };
    }

    // 3. Tab: Coefficient Plot
    else if (activeTab === 'coefficients') {
      const coefficientsFiltered = coefficients.filter(c => c.variable !== 'Intercept');
      
      const pointColors = coefficientsFiltered.map(c => {
        const crossesZero = c.confLow <= 0 && c.confHigh >= 0;
        return crossesZero ? '#94a3b8' : '#10b981';
      });

      // Plugins for Horizontal Error Bars + Zero line
      const errorBarPlugin = {
        id: 'errorBars',
        afterDatasetsDraw(chart: any) {
          const { ctx, scales } = chart;
          const xAxis = scales.x;
          const yAxis = scales.y;
          
          chart.data.datasets.forEach((dataset: any, datasetIndex: number) => {
            const meta = chart.getDatasetMeta(datasetIndex);
            if (meta.hidden) return;
            
            meta.data.forEach((element: any, index: number) => {
              const coeff = dataset.originalData[index];
              if (!coeff) return;
              
              const y = element.y;
              const xLow = xAxis.getPixelForValue(coeff.confLow);
              const xHigh = xAxis.getPixelForValue(coeff.confHigh);
              
              ctx.save();
              const crossesZero = coeff.confLow <= 0 && coeff.confHigh >= 0;
              ctx.strokeStyle = crossesZero ? '#94a3b8' : '#10b981';
              ctx.lineWidth = 2;
              
              // Draw main horizontal error line
              ctx.beginPath();
              ctx.moveTo(xLow, y);
              ctx.lineTo(xHigh, y);
              ctx.stroke();
              
              // Draw small end tick marks
              const tickHeight = 6;
              ctx.beginPath();
              ctx.moveTo(xLow, y - tickHeight / 2);
              ctx.lineTo(xLow, y + tickHeight / 2);
              ctx.moveTo(xHigh, y - tickHeight / 2);
              ctx.lineTo(xHigh, y + tickHeight / 2);
              ctx.stroke();
              
              ctx.restore();
            });
          });
        }
      };

      const zeroLinePlugin = {
        id: 'zeroLine',
        afterDraw(chart: any) {
          const { ctx, scales } = chart;
          const xAxis = scales.x;
          const yAxis = scales.y;
          
          if (xAxis.min <= 0 && xAxis.max >= 0) {
            const xPixel = xAxis.getPixelForValue(0);
            ctx.save();
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(xPixel, yAxis.top);
            ctx.lineTo(xPixel, yAxis.bottom);
            ctx.stroke();
            ctx.restore();
          }
        }
      };

      chartConfig = {
        type: 'line',
        plugins: [errorBarPlugin, zeroLinePlugin],
        data: {
          labels: coefficientsFiltered.map(c => c.variable),
          datasets: [
            {
              label: 'Estimate',
              data: coefficientsFiltered.map(c => c.estimate),
              backgroundColor: pointColors,
              borderColor: pointColors,
              pointRadius: 6,
              pointHoverRadius: 8,
              showLine: false,
              originalData: coefficientsFiltered,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: {
            title: {
              display: true,
              text: 'Coefficient Estimates with 95% Confidence Intervals',
              font: { family: 'Arial', size: 13, weight: 'bold' },
              color: '#1e293b',
              padding: { bottom: 12 }
            },
            legend: { display: false }
          },
          scales: {
            x: {
              type: 'linear',
              title: {
                display: true,
                text: 'Coefficient Estimate Value',
                font: { family: 'Arial', size: 11, weight: 'bold' },
                color: '#64748b'
              },
              ticks: { font: { family: 'Arial', size: 10 }, color: '#64748b' },
              grid: { color: '#f1f5f9' }
            },
            y: {
              ticks: { font: { family: 'Arial', size: 11, weight: 'bold' }, color: '#334155' },
              grid: { display: false }
            }
          }
        }
      };
    }

    // 4. Tab: Actual vs Predicted
    else if (activeTab === 'actual_predicted') {
      const minVal = Math.min(...fitted, ...yActual);
      const maxVal = Math.max(...fitted, ...yActual);
      const rangePadding = (maxVal - minVal) * 0.05 || 1.0;

      chartConfig = {
        type: 'scatter',
        data: {
          datasets: [
            {
              label: 'Observations',
              data: fitted.map((f, idx) => ({ x: f, y: yActual[idx] })),
              backgroundColor: 'rgba(27, 108, 168, 0.75)',
              borderColor: '#1b6ca8',
              pointRadius: 4.5,
              pointHoverRadius: 6,
            },
            {
              label: '45-Degree Perfect Fit',
              data: [
                { x: minVal - rangePadding, y: minVal - rangePadding },
                { x: maxVal + rangePadding, y: maxVal + rangePadding }
              ],
              borderColor: '#ef4444',
              borderWidth: 1.5,
              borderDash: [5, 5],
              pointRadius: 0,
              showLine: true,
              fill: false,
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            title: {
              display: true,
              text: 'Actual vs Predicted — check model fit',
              font: { family: 'Arial', size: 13, weight: 'bold' },
              color: '#1e293b',
              padding: { bottom: 12 }
            },
            legend: { display: false }
          },
          scales: {
            x: {
              type: 'linear',
              title: {
                display: true,
                text: 'Fitted/Predicted Values (ŷ)',
                font: { family: 'Arial', size: 11, weight: 'bold' },
                color: '#64748b'
              },
              ticks: { font: { family: 'Arial', size: 10 }, color: '#64748b' },
              grid: { color: '#f1f5f9' }
            },
            y: {
              title: {
                display: true,
                text: 'Actual Outcomes (Y)',
                font: { family: 'Arial', size: 11, weight: 'bold' },
                color: '#64748b'
              },
              ticks: { font: { family: 'Arial', size: 10 }, color: '#64748b' },
              grid: { color: '#f1f5f9' }
            }
          }
        }
      };
    }

    chartInstanceRef.current = new Chart(ctx, chartConfig);

    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.destroy();
        chartInstanceRef.current = null;
      }
    };
  }, [chartJSLoaded, activeTab, residuals, fitted, yActual, coefficients]);

  const handleDownloadPNG = () => {
    if (chartInstanceRef.current) {
      const base64 = chartInstanceRef.current.toBase64Image();
      const link = document.createElement('a');
      link.download = `ols_regression_${activeTab}.png`;
      link.href = base64;
      link.click();
    }
  };

  const tabs = [
    { id: 'res_fitted', label: 'Residuals vs Fitted' },
    { id: 'histogram', label: 'Residual Histogram' },
    { id: 'coefficients', label: 'Coefficient CIs' },
    { id: 'actual_predicted', label: 'Actual vs Predicted' },
  ] as const;

  if (loadingError) {
    return (
      <div className="p-8 bg-red-50 border border-red-200 text-red-700 rounded-xl flex items-center gap-3 font-mono text-xs">
        <HelpCircle className="w-5 h-5 text-red-500 shrink-0" />
        <div>
          <span className="font-bold">Error:</span> {loadingError}
        </div>
      </div>
    );
  }

  if (!chartJSLoaded) {
    return (
      <div className="w-full h-80 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center justify-center gap-3">
        <div className="w-8 h-8 border-3 border-indigo-500/20 border-t-indigo-600 rounded-full animate-spin" />
        <span className="text-xs text-slate-500 font-mono">Loading Interactive Visualization Engine...</span>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col">
      {/* Dynamic Tab Switcher */}
      <div className="flex border-b border-slate-200 bg-slate-50/70 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 py-3 text-xs font-bold font-mono uppercase tracking-wider transition-all rounded-lg ${
              activeTab === tab.id
                ? 'bg-white text-slate-900 shadow-xs'
                : 'text-slate-400 hover:text-slate-600 hover:bg-slate-50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Main Canvas Area */}
      <div className="p-6 bg-white relative">
        <div className="h-[280px] w-full relative">
          <canvas ref={canvasRef} />
        </div>
      </div>

      {/* Footer Area with Download Action */}
      <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between">
        <div className="text-[10px] text-slate-400 italic font-serif flex items-center gap-1">
          <Check className="w-3.5 h-3.5 text-emerald-500" /> Plot drawn at {new Date().toLocaleTimeString()} using vector canvas precision.
        </div>
        <button
          onClick={handleDownloadPNG}
          className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 hover:text-slate-900 text-xs font-semibold flex items-center gap-1.5 transition-all shadow-xs"
          title="Download vector graphic of current plot"
        >
          <Download className="w-3.5 h-3.5 text-slate-500" />
          Download PNG
        </button>
      </div>
    </div>
  );
}
