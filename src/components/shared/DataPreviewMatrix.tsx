import React from 'react';
import { Table, Eye, Hash } from 'lucide-react';
import { cn } from '../../lib/utils';

interface DataPreviewMatrixProps {
  dataset: {
    headers: string[];
    rows: any[];
  } | null;
}

export const DataPreviewMatrix: React.FC<DataPreviewMatrixProps> = ({ dataset }) => {
  if (!dataset || !dataset.rows || dataset.rows.length === 0) return null;

  // Safe headers fallback
  const headers = dataset.headers || (dataset as any).variables?.map((v: any) => v.name) || [];

  // Render only the first 8 rows to preserve front-end execution speeds
  const previewRows = dataset.rows.slice(0, 8);

  return (
    <div className="mt-8 overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-700">
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-lg">
            <Eye className="w-4 h-4 text-emerald-400" />
          </div>
          <div>
            <h4 className="text-xs font-bold font-mono tracking-widest text-slate-200 uppercase">Institutional Matrix Browser</h4>
            <p className="text-[10px] text-slate-500 font-serif italic">Truncated vector view for structural integrity verification.</p>
          </div>
        </div>
        <div className="flex gap-4">
           <div className="text-right">
              <span className="text-[9px] font-mono text-slate-500 block uppercase tracking-tighter">Fields</span>
              <span className="text-xs font-bold text-indigo-400 font-mono">{headers.length}</span>
           </div>
           <div className="text-right">
              <span className="text-[9px] font-mono text-slate-500 block uppercase tracking-tighter">Dimensions</span>
              <span className="text-xs font-bold text-emerald-400 font-mono">{dataset.rows.length}</span>
           </div>
        </div>
      </div>

      <div className="overflow-x-auto max-h-[400px] overflow-y-auto custom-scrollbar">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-900/80 sticky top-0 z-10">
              <th className="p-3 text-slate-600 font-mono text-[10px] text-center w-12 border-r border-slate-800 bg-slate-950">
                <Hash className="w-3 h-3 mx-auto" />
              </th>
              {headers.map((header, index) => (
                <th 
                  key={`${header}-${index}`} 
                  className="p-3 text-[10px] font-bold text-slate-400 font-mono uppercase tracking-wider border-b border-slate-800"
                >
                  {header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/40">
            {previewRows.map((row, rowIndex) => (
              <tr key={rowIndex} className="hover:bg-slate-900/60 transition-colors group">
                <td className="p-3 text-center bg-slate-950 text-slate-600 font-bold border-r border-slate-800 text-[10px] font-mono">
                  {rowIndex + 1}
                </td>
                {headers.map((header, colIndex) => {
                  const val = row[header];
                  const isNumber = typeof val === 'number';
                  return (
                    <td 
                      key={`${header}-${colIndex}`} 
                      className={cn(
                        "p-3 text-[11px] font-mono whitespace-nowrap",
                        isNumber ? "text-indigo-300 text-right" : "text-amber-200/80"
                      )}
                    >
                      {val === null || val === undefined ? (
                        <span className="text-slate-700 italic">null</span>
                      ) : (
                        val.toString()
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      <div className="px-6 py-3 bg-slate-900/30 border-t border-slate-800 flex justify-between items-center">
        <div className="flex items-center gap-2">
           <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
           <p className="text-[9px] text-slate-500 font-mono uppercase tracking-widest">Memory Vector Array Stabilized</p>
        </div>
        {dataset.rows.length > 8 && (
          <p className="text-[10px] text-slate-500 italic font-serif">
            Showing first 8 observations of {dataset.rows.length.toLocaleString()} total sample size.
          </p>
        )}
      </div>
    </div>
  );
};
