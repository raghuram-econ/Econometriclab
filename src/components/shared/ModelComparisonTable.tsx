import React, { useState } from 'react';
import { X, Check, Copy, Download, FileText, Code, Table, AlertTriangle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ModelHistoryItem } from '../../types';

interface ModelComparisonTableProps {
  models: any[]; // Accept ModelHistoryItem[] or RobustnessItem[]
  onClose?: () => void;
}

export default function ModelComparisonTable({ models, onClose }: ModelComparisonTableProps) {
  const [copiedType, setCopiedType] = useState<'latex' | 'html' | null>(null);

  if (!models || models.length === 0) {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        No models selected for comparison.
      </div>
    );
  }

  // Check if multiple different sample sizes are present
  const sampleSizes = models.map(m => m.results?.n ?? m.results?.N ?? 0);
  const distinctSamples = Array.from(new Set(sampleSizes.filter(s => s > 0)));
  const hasMultipleSamples = distinctSamples.length > 1;

  // Helper formatting functions
  const formatCoef = (val: number | undefined | null) => {
    if (val === undefined || val === null || isNaN(val)) return '—';
    return val.toFixed(4);
  };

  const getStars = (pVal: number | undefined | null) => {
    if (pVal === undefined || pVal === null || isNaN(pVal)) return '';
    if (pVal < 0.01) return '***';
    if (pVal < 0.05) return '**';
    if (pVal < 0.1) return '*';
    return '';
  };

  const getSEType = (item: any) => {
    if (item.results?.seType) return item.results.seType;
    if (item.results?.isRobust) return 'HC1 Robust';
    return 'Classical';
  };

  const getEstimator = (item: any) => {
    if (item.module) {
      if (item.module === 'FE') return 'Panel FE';
      return item.module;
    }
    if (item.results?.estimator) return item.results.estimator;
    if (item.results?.modelType) {
      if (item.results.modelType === 'fe') return 'Panel FE';
      return item.results.modelType.toUpperCase();
    }
    return 'OLS';
  };

  // Build unique variable names union
  const allVarsSet = new Set<string>();
  models.forEach(model => {
    const coeffs = model.results?.coefficients || [];
    coeffs.forEach((c: any) => {
      if (c.variable && c.variable !== 'Intercept') {
        allVarsSet.add(c.variable);
      }
    });
  });

  const sortedVars = Array.from(allVarsSet).sort((a, b) => a.localeCompare(b));

  let hasIntercept = false;
  models.forEach(model => {
    const coeffs = model.results?.coefficients || [];
    if (coeffs.some((c: any) => c.variable === 'Intercept')) {
      hasIntercept = true;
    }
  });

  if (hasIntercept) {
    sortedVars.push('Intercept');
  }

  // Copy LaTeX Table
  const handleCopyLaTeX = () => {
    const numModels = models.length;
    let latex = '';
    latex += '\\begin{table}[htbp]\n';
    latex += '\\caption{Regression Results}\n';
    latex += `\\begin{tabular}{l${'*{' + numModels + '}{c}'}}\n`;
    latex += '\\toprule\n';
    
    // Headers row
    const headers = ['Variable'].concat(models.map((m, idx) => m.name || `Model ${idx + 1}`));
    latex += headers.join(' & ') + ' \\\\\n';
    latex += '\\midrule\n';
    
    // Variables coefficients and standard errors
    sortedVars.forEach(v => {
      // Coeff Row
      const coeffRow = [v];
      models.forEach(model => {
        const coeff = model.results?.coefficients?.find((c: any) => c.variable === v);
        if (coeff) {
          const stars = getStars(coeff.pValue);
          const starsTex = stars ? `^{${stars}}` : '';
          const isBold = coeff.pValue < 0.05;
          const formattedEst = coeff.estimate.toFixed(4);
          const estText = isBold ? `\\mathbf{${formattedEst}}${starsTex}` : `${formattedEst}${starsTex}`;
          coeffRow.push(`$${estText}$`);
        } else {
          coeffRow.push('—');
        }
      });
      latex += coeffRow.join(' & ') + ' \\\\\n';
      
      // S.E. Row
      const seRow = [''];
      models.forEach(model => {
        const coeff = model.results?.coefficients?.find((c: any) => c.variable === v);
        if (coeff) {
          seRow.push(`$(${coeff.stdError.toFixed(4)})$`);
        } else {
          seRow.push('');
        }
      });
      latex += seRow.join(' & ') + ' \\\\\n';
    });
    
    latex += '\\midrule\n';
    
    // Fit stats
    // Observations
    const obsRow = ['Observations'].concat(models.map(m => {
      const val = m.results?.n ?? m.results?.N ?? '—';
      return val.toString();
    }));
    latex += obsRow.join(' & ') + ' \\\\\n';
    
    // R-squared
    const r2Row = ['R-squared'].concat(models.map(m => {
      const val = m.results?.rSquared;
      return val !== undefined && val !== null ? val.toFixed(4) : '—';
    }));
    latex += r2Row.join(' & ') + ' \\\\\n';
    
    // Adj R-squared
    const adjR2Row = ['Adj R-squared'].concat(models.map(m => {
      const val = m.results?.adjRSquared;
      return val !== undefined && val !== null ? val.toFixed(4) : '—';
    }));
    latex += adjR2Row.join(' & ') + ' \\\\\n';

    // RMSE
    const rmseRow = ['RMSE'].concat(models.map(m => {
      const val = m.results?.rmse;
      return val !== undefined && val !== null ? val.toFixed(4) : '—';
    }));
    latex += rmseRow.join(' & ') + ' \\\\\n';

    // AIC
    const aicRow = ['AIC'].concat(models.map(m => {
      const val = m.results?.aic;
      return val !== undefined && val !== null ? val.toFixed(2) : '—';
    }));
    latex += aicRow.join(' & ') + ' \\\\\n';

    // BIC
    const bicRow = ['BIC'].concat(models.map(m => {
      const val = m.results?.bic;
      return val !== undefined && val !== null ? val.toFixed(2) : '—';
    }));
    latex += bicRow.join(' & ') + ' \\\\\n';
    
    // F-statistic
    const fStatRow = ['F-statistic'].concat(models.map(m => {
      const val = m.results?.fStat;
      const fP = m.results?.fPValue;
      if (val !== undefined && val !== null) {
        const stars = getStars(fP);
        const starsTex = stars ? `^{${stars}}` : '';
        return `$${val.toFixed(2)}${starsTex}$`;
      }
      return '—';
    }));
    latex += fStatRow.join(' & ') + ' \\\\\n';
    
    // SE Type
    const seTypeRow = ['SE Type'].concat(models.map(m => getSEType(m)));
    latex += seTypeRow.join(' & ') + ' \\\\\n';
    
    // Estimator
    const estRow = ['Estimator'].concat(models.map(m => getEstimator(m)));
    latex += estRow.join(' & ') + ' \\\\\n';
    
    latex += '\\bottomrule\n';
    latex += '\\end{tabular}\n';
    latex += '\\end{table}';

    navigator.clipboard.writeText(latex).then(() => {
      setCopiedType('latex');
      setTimeout(() => setCopiedType(null), 2000);
    });
  };

  // Copy HTML Table
  const handleCopyHTML = () => {
    let html = `<table style="border-collapse: collapse; width: 100%; font-family: Arial, sans-serif; font-size: 13px; text-align: center; border-top: 2px solid #000; border-bottom: 2px solid #000;">`;
    
    // Headers row
    html += `<thead><tr style="border-bottom: 1px solid #000;">`;
    html += `<th style="padding: 8px; text-align: left; font-weight: bold;">Variable</th>`;
    models.forEach((m, idx) => {
      html += `<th style="padding: 8px; font-weight: bold;">${m.name || `Model ${idx + 1}`}</th>`;
    });
    html += `</tr></thead>`;
    
    html += `<tbody>`;
    sortedVars.forEach((v, vIdx) => {
      const rowBg = vIdx % 2 === 0 ? 'background-color: #f8fafc;' : '';
      
      // Coefficient Row
      html += `<tr style="${rowBg}">`;
      html += `<td style="padding: 6px 8px; text-align: left; font-style: italic;">${v}</td>`;
      models.forEach(model => {
        const coeff = model.results?.coefficients?.find((c: any) => c.variable === v);
        if (coeff) {
          const isBold = coeff.pValue < 0.05;
          const stars = getStars(coeff.pValue);
          const valText = `${coeff.estimate.toFixed(4)}${stars}`;
          const style = isBold ? 'font-weight: bold;' : '';
          html += `<td style="padding: 6px 8px; ${style}">${valText}</td>`;
        } else {
          html += `<td style="padding: 6px 8px; color: #94a3b8;">—</td>`;
        }
      });
      html += `</tr>`;
      
      // S.E. Row
      html += `<tr style="${rowBg}">`;
      html += `<td style="padding: 2px 8px; text-align: left;"></td>`;
      models.forEach(model => {
        const coeff = model.results?.coefficients?.find((c: any) => c.variable === v);
        if (coeff) {
          html += `<td style="padding: 2px 8px; color: #64748b; font-size: 11px;">(${coeff.stdError.toFixed(4)})</td>`;
        } else {
          html += `<td style="padding: 2px 8px;"></td>`;
        }
      });
      html += `</tr>`;
    });
    
    // Divider before fit stats
    html += `<tr style="border-top: 1px solid #000;"><td colspan="${models.length + 1}" style="padding: 4px 0;"></td></tr>`;
    
    // Observations
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">Observations</td>`;
    models.forEach(m => {
      const val = m.results?.n ?? m.results?.N ?? '—';
      html += `<td style="padding: 6px 8px;">${val}</td>`;
    });
    html += `</tr>`;
    
    // R-squared
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">R-squared</td>`;
    models.forEach(m => {
      const val = m.results?.rSquared;
      html += `<td style="padding: 6px 8px;">${val !== undefined && val !== null ? val.toFixed(4) : '—'}</td>`;
    });
    html += `</tr>`;
    
    // Adj R-squared
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">Adj R-squared</td>`;
    models.forEach(m => {
      const val = m.results?.adjRSquared;
      html += `<td style="padding: 6px 8px;">${val !== undefined && val !== null ? val.toFixed(4) : '—'}</td>`;
    });
    html += `</tr>`;

    // RMSE
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">RMSE</td>`;
    models.forEach(m => {
      const val = m.results?.rmse;
      html += `<td style="padding: 6px 8px;">${val !== undefined && val !== null ? val.toFixed(4) : '—'}</td>`;
    });
    html += `</tr>`;

    // AIC
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">AIC</td>`;
    models.forEach(m => {
      const val = m.results?.aic;
      html += `<td style="padding: 6px 8px;">${val !== undefined && val !== null ? val.toFixed(2) : '—'}</td>`;
    });
    html += `</tr>`;

    // BIC
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">BIC</td>`;
    models.forEach(m => {
      const val = m.results?.bic;
      html += `<td style="padding: 6px 8px;">${val !== undefined && val !== null ? val.toFixed(2) : '—'}</td>`;
    });
    html += `</tr>`;
    
    // F-statistic
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">F-statistic</td>`;
    models.forEach(m => {
      const val = m.results?.fStat;
      const fP = m.results?.fPValue;
      if (val !== undefined && val !== null) {
        const stars = getStars(fP);
        html += `<td style="padding: 6px 8px;">${val.toFixed(2)}${stars}</td>`;
      } else {
        html += `<td style="padding: 6px 8px;">—</td>`;
      }
    });
    html += `</tr>`;
    
    // SE Type
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">SE Type</td>`;
    models.forEach(m => {
      html += `<td style="padding: 6px 8px;">${getSEType(m)}</td>`;
    });
    html += `</tr>`;
    
    // Estimator
    html += `<tr><td style="padding: 6px 8px; text-align: left; font-weight: bold; color: #475569;">Estimator</td>`;
    models.forEach(m => {
      html += `<td style="padding: 6px 8px;">${getEstimator(m)}</td>`;
    });
    html += `</tr>`;
    
    html += `</tbody></table>`;

    navigator.clipboard.writeText(html).then(() => {
      setCopiedType('html');
      setTimeout(() => setCopiedType(null), 2000);
    });
  };

  // Download CSV
  const handleDownloadCSV = () => {
    const headers = ['Variable'].concat(models.map((m, idx) => m.name || `Model ${idx + 1}`));
    const rows: string[][] = [headers];
    
    sortedVars.forEach(v => {
      // Coefficient row
      const coeffRow = [v];
      models.forEach(model => {
        const coeff = model.results?.coefficients?.find((c: any) => c.variable === v);
        if (coeff) {
          const stars = getStars(coeff.pValue);
          coeffRow.push(`${coeff.estimate.toFixed(4)}${stars}`);
        } else {
          coeffRow.push('—');
        }
      });
      rows.push(coeffRow);
      
      // Standard error row
      const seRow = [''];
      models.forEach(model => {
        const coeff = model.results?.coefficients?.find((c: any) => c.variable === v);
        if (coeff) {
          seRow.push(`(${coeff.stdError.toFixed(4)})`);
        } else {
          seRow.push('');
        }
      });
      rows.push(seRow);
    });
    
    // Fit stats
    rows.push(['Observations'].concat(models.map(m => {
      const val = m.results?.n ?? m.results?.N ?? '—';
      return val.toString();
    })));
    
    rows.push(['R-squared'].concat(models.map(m => {
      const val = m.results?.rSquared;
      return val !== undefined && val !== null ? val.toFixed(4) : '—';
    })));
    
    rows.push(['Adj R-squared'].concat(models.map(m => {
      const val = m.results?.adjRSquared;
      return val !== undefined && val !== null ? val.toFixed(4) : '—';
    })));

    rows.push(['RMSE'].concat(models.map(m => {
      const val = m.results?.rmse;
      return val !== undefined && val !== null ? val.toFixed(4) : '—';
    })));

    rows.push(['AIC'].concat(models.map(m => {
      const val = m.results?.aic;
      return val !== undefined && val !== null ? val.toFixed(2) : '—';
    })));

    rows.push(['BIC'].concat(models.map(m => {
      const val = m.results?.bic;
      return val !== undefined && val !== null ? val.toFixed(2) : '—';
    })));
    
    rows.push(['F-statistic'].concat(models.map(m => {
      const val = m.results?.fStat;
      const fP = m.results?.fPValue;
      if (val !== undefined && val !== null) {
        const stars = getStars(fP);
        return `${val.toFixed(2)}${stars}`;
      }
      return '—';
    })));
    
    rows.push(['SE Type'].concat(models.map(m => getSEType(m))));
    rows.push(['Estimator'].concat(models.map(m => getEstimator(m))));
    
    const csvContent = rows.map(r => r.map(cell => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'model_comparison_results.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl max-w-4xl w-full mx-auto overflow-hidden shadow-2xl border border-slate-200">
      {/* Title Header */}
      <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
        <div>
          <h3 className="text-lg font-bold tracking-tight flex items-center gap-2">
            <Table className="w-5 h-5 text-blue-400" /> Model Comparison Bench (esttab)
          </h3>
          <p className="text-xs text-slate-400 mt-1">
            Publication-quality alignment matrix (showing coefficients with standard errors below)
          </p>
        </div>
        {onClose && (
          <button 
            onClick={onClose}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Control Buttons Panel */}
      <div className="p-4 border-b border-slate-200 bg-slate-50 flex flex-wrap gap-2 items-center justify-between">
        <div className="text-xs font-serif italic text-slate-500">
          Showing {models.length} saved econometric model specifications.
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopyLaTeX}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-all shadow-sm"
          >
            {copiedType === 'latex' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 animate-scale" />
                Copied!
              </>
            ) : (
              <>
                <Code className="w-3.5 h-3.5 text-slate-500" />
                Copy LaTeX
              </>
            )}
          </button>

          <button
            onClick={handleCopyHTML}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-all shadow-sm"
          >
            {copiedType === 'html' ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 animate-scale" />
                Copied!
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 text-slate-500" />
                Copy HTML (Word)
              </>
            )}
          </button>

          <button
            onClick={handleDownloadCSV}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-1.5 transition-all shadow-sm"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            Download CSV
          </button>
        </div>
      </div>

      {hasMultipleSamples && (
        <div className="mx-6 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 font-serif leading-relaxed flex items-start gap-2 shadow-sm">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Warning: Non-nested / different sample sizes detected.</strong> Models are estimated on different listwise-deleted subsamples (N ranges from {Math.min(...sampleSizes.filter(s => s > 0))} to {Math.max(...sampleSizes.filter(s => s > 0))}). Comparative metrics like R-squared, Adjusted R-squared, AIC, and BIC are not directly comparable because the estimation samples are not identical.
          </div>
        </div>
      )}

      {/* Main Table Area */}
      <div className="p-6 overflow-x-auto">
        <table className="w-full text-center border-collapse" style={{ fontFamily: 'Arial, sans-serif' }}>
          {/* Thick top border style */}
          <thead>
            <tr className="border-t-2 border-b border-slate-900 text-slate-800 font-semibold text-[13px]">
              <th className="p-3 text-left font-bold w-1/4">Variable</th>
              {models.map((m, idx) => (
                <th key={m.id || idx} className="p-3 font-bold">
                  {m.name || `Model ${idx + 1}`}
                  {m.results?.modelType || m.module ? (
                    <span className="block text-[10px] font-mono font-normal text-slate-400 mt-0.5 uppercase">
                      {getEstimator(m)}
                    </span>
                  ) : null}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedVars.map((v, vIdx) => {
              const isEven = vIdx % 2 === 0;
              const rowBg = isEven ? 'bg-slate-50/70' : 'bg-white';
              
              return (
                <React.Fragment key={v}>
                  {/* Coefficient Row */}
                  <tr className={`${rowBg} transition-colors duration-150`}>
                    <td className="p-2.5 text-left font-serif italic text-slate-900 font-medium text-[13px] border-l border-transparent">
                      {v}
                    </td>
                    {models.map((model, idx) => {
                      const coeff = model.results?.coefficients?.find((c: any) => c.variable === v);
                      if (!coeff) {
                        return <td key={idx} className="p-2.5 text-slate-300 text-[13px]">—</td>;
                      }
                      
                      const stars = getStars(coeff.pValue);
                      const isSig = coeff.pValue < 0.05;
                      
                      return (
                        <td key={idx} className={`p-2.5 text-[13px] tabular-nums ${isSig ? 'font-bold text-slate-950' : 'text-slate-800'}`}>
                          {coeff.estimate.toFixed(4)}
                          <span className="text-[11px] text-blue-600 font-bold ml-0.5">{stars}</span>
                        </td>
                      );
                    })}
                  </tr>
                  {/* Standard Error Row */}
                  <tr className={`${rowBg} border-b border-slate-100 transition-colors duration-150`}>
                    <td className="p-0 text-left"></td>
                    {models.map((model, idx) => {
                      const coeff = model.results?.coefficients?.find((c: any) => c.variable === v);
                      if (!coeff) {
                        return <td key={idx} className="p-0"></td>;
                      }
                      return (
                        <td key={idx} className="pb-2 text-[11px] text-slate-500 font-mono tracking-tight tabular-nums">
                          ({coeff.stdError.toFixed(4)})
                        </td>
                      );
                    })}
                  </tr>
                </React.Fragment>
              );
            })}

            {/* Empty space divider */}
            <tr>
              <td colSpan={models.length + 1} className="p-2 border-b border-slate-300"></td>
            </tr>

            {/* Fit Statistics Bottom Rows */}
            <tr className="hover:bg-slate-50/50">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                Observations
              </td>
              {models.map((m, idx) => {
                const val = m.results?.n ?? m.results?.N ?? '—';
                return (
                  <td key={idx} className="p-2.5 text-[13px] font-mono text-slate-800 tabular-nums">
                    {val}
                  </td>
                );
              })}
            </tr>

            <tr className="hover:bg-slate-50/50">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                R-squared
              </td>
              {models.map((m, idx) => {
                const val = m.results?.rSquared;
                return (
                  <td key={idx} className="p-2.5 text-[13px] font-mono text-slate-800 tabular-nums">
                    {val !== undefined && val !== null ? val.toFixed(4) : '—'}
                  </td>
                );
              })}
            </tr>

            <tr className="hover:bg-slate-50/50">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                Adj R-squared
              </td>
              {models.map((m, idx) => {
                const val = m.results?.adjRSquared;
                return (
                  <td key={idx} className="p-2.5 text-[13px] font-mono text-slate-800 tabular-nums">
                    {val !== undefined && val !== null ? val.toFixed(4) : '—'}
                  </td>
                );
              })}
            </tr>

            <tr className="hover:bg-slate-50/50">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                RMSE
              </td>
              {models.map((m, idx) => {
                const val = m.results?.rmse;
                return (
                  <td key={idx} className="p-2.5 text-[13px] font-mono text-slate-800 tabular-nums">
                    {val !== undefined && val !== null ? val.toFixed(4) : '—'}
                  </td>
                );
              })}
            </tr>

            <tr className="hover:bg-slate-50/50">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                AIC
              </td>
              {models.map((m, idx) => {
                const val = m.results?.aic;
                return (
                  <td key={idx} className="p-2.5 text-[13px] font-mono text-slate-800 tabular-nums">
                    {val !== undefined && val !== null ? val.toFixed(2) : '—'}
                  </td>
                );
              })}
            </tr>

            <tr className="hover:bg-slate-50/50">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                BIC
              </td>
              {models.map((m, idx) => {
                const val = m.results?.bic;
                return (
                  <td key={idx} className="p-2.5 text-[13px] font-mono text-slate-800 tabular-nums">
                    {val !== undefined && val !== null ? val.toFixed(2) : '—'}
                  </td>
                );
              })}
            </tr>

            <tr className="hover:bg-slate-50/50">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                F-statistic
              </td>
              {models.map((m, idx) => {
                const val = m.results?.fStat;
                const fP = m.results?.fPValue;
                if (val !== undefined && val !== null) {
                  const stars = getStars(fP);
                  return (
                    <td key={idx} className="p-2.5 text-[13px] font-mono text-slate-800 tabular-nums">
                      {val.toFixed(2)}
                      <span className="text-[11px] text-blue-600 font-bold ml-0.5">{stars}</span>
                    </td>
                  );
                }
                return (
                  <td key={idx} className="p-2.5 text-[13px] font-mono text-slate-300">
                    —
                  </td>
                );
              })}
            </tr>

            <tr className="hover:bg-slate-50/50">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                SE Type
              </td>
              {models.map((m, idx) => (
                <td key={idx} className="p-2.5 text-[12px] font-medium text-slate-700 font-mono">
                  {getSEType(m)}
                </td>
              ))}
            </tr>

            <tr className="hover:bg-slate-50/50 border-b-2 border-slate-900">
              <td className="p-2.5 text-left font-semibold text-slate-600 text-[12px] uppercase tracking-wider font-mono">
                Estimator
              </td>
              {models.map((m, idx) => (
                <td key={idx} className="p-2.5 text-[12px] font-semibold text-slate-800 font-mono">
                  {getEstimator(m)}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Legend Footer */}
      <div className="p-4 bg-slate-50 border-t border-slate-200 text-center text-[11px] text-slate-500 font-mono">
        Significance Legend: * p &lt; 0.1, ** p &lt; 0.05, *** p &lt; 0.01. Standard errors reported in parentheses.
      </div>
    </div>
  );
}
