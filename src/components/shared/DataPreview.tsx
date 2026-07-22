import React, { useState, useEffect } from 'react';
import { 
  Table, 
  Database, 
  Play, 
  RotateCcw, 
  AlertCircle, 
  CheckCircle2, 
  FileSpreadsheet, 
  Clock, 
  Sparkles, 
  Filter 
} from 'lucide-react';
import { useDuckDB } from '../../hooks/useDuckDB';
import { cn } from '../../lib/utils';

interface DataPreviewProps {
  fileName: string;
  fileSize: number; // in bytes
  loadTimeMs: number;
  initialHeaders: string[];
  initialRowCount: number;
  onFilterApplied: (filteredRows: any[], filteredHeaders: string[]) => void;
  onReset: () => void;
}

export default function DataPreview({
  fileName,
  fileSize,
  loadTimeMs,
  initialHeaders,
  initialRowCount,
  onFilterApplied,
  onReset
}: DataPreviewProps) {
  const { query, isLoading, error } = useDuckDB();
  const [filterInput, setFilterInput] = useState<string>('');
  const [previewRows, setPreviewRows] = useState<any[][]>([]);
  const [currentHeaders, setCurrentHeaders] = useState<string[]>(initialHeaders);
  const [activeRowCount, setActiveRowCount] = useState<number>(initialRowCount);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Format file size
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Fetch initial 20 rows sample on load
  useEffect(() => {
    let active = true;
    const fetchInitialPreview = async () => {
      try {
        const result = await query(`SELECT * FROM uploaded_data LIMIT 20`);
        if (active) {
          setPreviewRows(result.rows);
          setCurrentHeaders(result.headers);
          setActiveRowCount(initialRowCount);
          setSqlError(null);
          setSuccessMsg(null);
        }
      } catch (err: any) {
        if (active) {
          setSqlError(err.message || 'Failed to load initial preview from DuckDB.');
        }
      }
    };
    fetchInitialPreview();
    return () => {
      active = false;
    };
  }, [fileName, initialRowCount, query]);

  const handleApplyFilter = async () => {
    setSqlError(null);
    setSuccessMsg(null);
    const trimmedInput = filterInput.trim();

    if (!trimmedInput) {
      // Empty input means reset to initial SELECT *
      try {
        const result = await query(`SELECT * FROM uploaded_data`);
        const previewRes = await query(`SELECT * FROM uploaded_data LIMIT 20`);
        
        // Convert array of arrays to array of objects for analysis modules
        const objectRows = result.rows.map(rowArr => {
          const obj: any = {};
          result.headers.forEach((h, idx) => {
            obj[h] = rowArr[idx];
          });
          return obj;
        });

        setPreviewRows(previewRes.rows);
        setCurrentHeaders(result.headers);
        setActiveRowCount(result.rows.length);
        onFilterApplied(objectRows, result.headers);
        setSuccessMsg('Reset to full dataset successfully.');
      } catch (err: any) {
        setSqlError(err.message || 'SQL query execution failed.');
      }
      return;
    }

    // Determine if full SELECT query or helper condition (like WHERE ...)
    let finalQuery = trimmedInput;
    if (!trimmedInput.toUpperCase().startsWith('SELECT')) {
      finalQuery = `SELECT * FROM uploaded_data ${trimmedInput}`;
    }

    try {
      // Run the full filter query to get all filtered data
      const result = await query(finalQuery);
      
      // Get first 20 rows of filtered data for preview
      let previewQuery = finalQuery;
      if (finalQuery.toUpperCase().includes('LIMIT')) {
        // If query already has a LIMIT, run as is
        previewQuery = finalQuery;
      } else {
        // Otherwise limit preview to first 20 rows
        previewQuery = `SELECT * FROM (${finalQuery}) LIMIT 20`;
      }
      const previewRes = await query(previewQuery);

      // Convert arrays of arrays to array of objects for analysis modules
      const objectRows = result.rows.map(rowArr => {
        const obj: any = {};
        result.headers.forEach((h, idx) => {
          obj[h] = rowArr[idx];
        });
        return obj;
      });

      setPreviewRows(previewRes.rows);
      setCurrentHeaders(result.headers);
      setActiveRowCount(result.rows.length);
      onFilterApplied(objectRows, result.headers);
      setSuccessMsg(`SQL query applied successfully! Returned ${result.rows.length} rows.`);
    } catch (err: any) {
      setSqlError(err.message || 'SQL query execution failed. Please check syntax.');
    }
  };

  const handleResetFilter = async () => {
    setFilterInput('');
    setSqlError(null);
    setSuccessMsg(null);
    try {
      const result = await query(`SELECT * FROM uploaded_data`);
      const previewRes = await query(`SELECT * FROM uploaded_data LIMIT 20`);
      
      const objectRows = result.rows.map(rowArr => {
        const obj: any = {};
        result.headers.forEach((h, idx) => {
          obj[h] = rowArr[idx];
        });
        return obj;
      });

      setPreviewRows(previewRes.rows);
      setCurrentHeaders(result.headers);
      setActiveRowCount(initialRowCount);
      onFilterApplied(objectRows, result.headers);
      onReset();
    } catch (err: any) {
      setSqlError(err.message || 'Failed to reset filter.');
    }
  };

  return (
    <div id="duckdb-data-preview-card" className="space-y-6">
      {/* Metadata Indicators Bento Box */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div id="meta-card-rows" className="bg-slate-900 text-white p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Row Vectors</span>
            <Database className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-mono tracking-tight text-white">{activeRowCount.toLocaleString()}</div>
            <p className="text-[9px] text-slate-400 mt-0.5">Observations indexed</p>
          </div>
        </div>

        <div id="meta-card-cols" className="bg-slate-900 text-white p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Column Fields</span>
            <FileSpreadsheet className="w-4 h-4 text-blue-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-mono tracking-tight text-white">{currentHeaders.length}</div>
            <p className="text-[9px] text-slate-400 mt-0.5">Exogenous vectors</p>
          </div>
        </div>

        <div id="meta-card-size" className="bg-slate-900 text-white p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">File Size</span>
            <Sparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-mono tracking-tight text-white">{formatFileSize(fileSize)}</div>
            <p className="text-[9px] text-slate-400 mt-0.5">Browser memory allocation</p>
          </div>
        </div>

        <div id="meta-card-speed" className="bg-slate-900 text-white p-4 rounded-2xl border border-white/5 flex flex-col justify-between">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-[10px] font-bold uppercase tracking-wider font-mono">Onboarding Latency</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold font-mono tracking-tight text-white">{loadTimeMs} ms</div>
            <p className="text-[9px] text-slate-400 mt-0.5">WASM ingestion time</p>
          </div>
        </div>
      </div>

      {/* SQL Transformation Playground */}
      <div id="sql-sandbox-card" className="bg-slate-950 border border-white/10 rounded-3xl p-6 text-white space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-indigo-400" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-200 font-mono">
              In-Browser SQL Transformation Sandbox
            </h3>
          </div>
          <div className="text-[10px] text-slate-400 font-serif italic">
            Powered by high-performance DuckDB-WASM engine
          </div>
        </div>

        <p className="text-xs text-slate-400 font-serif leading-relaxed">
          Type standard SQL filters or SELECT transformations to subset, modify, or clean the data. All queries execute inside browser memory on your full-scale dataset.
        </p>

        <div className="space-y-3">
          <div className="relative">
            <div className="absolute left-4 top-3.5 text-slate-500 font-mono text-xs select-none">
              SELECT * FROM uploaded_data
            </div>
            <textarea
              id="sql-sandbox-input"
              value={filterInput}
              onChange={(e) => setFilterInput(e.target.value)}
              placeholder="WHERE year > 2010 ORDER BY year ASC"
              rows={3}
              className="w-full bg-slate-900 border border-white/10 rounded-2xl pt-10 px-4 pb-4 text-xs font-mono text-slate-100 placeholder-slate-600 outline-none focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-500/80 transition-all resize-none"
            />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <div className="flex items-center gap-2">
              <button
                id="sql-preset-1"
                type="button"
                onClick={() => setFilterInput('WHERE year > 2015')}
                className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                WHERE year &gt; 2015
              </button>
              <button
                id="sql-preset-2"
                type="button"
                onClick={() => setFilterInput('WHERE gdp_growth IS NOT NULL')}
                className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                WHERE gdp_growth IS NOT NULL
              </button>
              <button
                id="sql-preset-3"
                type="button"
                onClick={() => setFilterInput('SELECT year, AVG(inflation) AS avg_inf FROM uploaded_data GROUP BY year')}
                className="px-2.5 py-1 text-[10px] font-mono font-semibold bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                GROUP BY Year
              </button>
            </div>

            <div className="flex items-center gap-3">
              <button
                id="sql-action-reset"
                type="button"
                onClick={handleResetFilter}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-slate-400 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Reset
              </button>

              <button
                id="sql-action-apply"
                type="button"
                onClick={handleApplyFilter}
                disabled={isLoading}
                className={cn(
                  "flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs shadow transition-all cursor-pointer",
                  isLoading 
                    ? "bg-slate-800 text-slate-500 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-500 text-white hover:shadow-lg hover:scale-[1.02]"
                )}
              >
                {isLoading ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    Transforming...
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current" />
                    Apply Filter
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Query Success Alert */}
        {successMsg && (
          <div id="sql-success-alert" className="flex items-start gap-2.5 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl animate-in fade-in duration-200">
            <CheckCircle2 className="w-4.5 h-4.5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="text-xs text-emerald-300 font-mono leading-relaxed">{successMsg}</div>
          </div>
        )}

        {/* Query Syntax / Logical Errors */}
        {(sqlError || error) && (
          <div id="sql-error-alert" className="flex items-start gap-2.5 p-3.5 bg-rose-500/10 border border-rose-500/20 rounded-2xl animate-in fade-in duration-200">
            <AlertCircle className="w-4.5 h-4.5 text-rose-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="text-xs font-bold text-rose-300">DuckDB Execution Exception</div>
              <p className="text-[11px] text-rose-400 font-mono leading-relaxed break-all">
                {sqlError || error}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Active Dataset Sample Table */}
      <div id="duckdb-preview-table-card" className="bg-white border border-slate-200 shadow-sm overflow-hidden rounded-3xl">
        <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-slate-500" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">
              Preview — showing first 20 of {activeRowCount.toLocaleString()} rows
            </span>
          </div>
          <div className="text-[10px] bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-full font-mono font-bold border border-indigo-100">
            Active Dataset Context
          </div>
        </div>

        <div className="overflow-x-auto max-w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200/80">
                <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono border-r border-slate-100 w-12 text-center">Row</th>
                {currentHeaders.map(h => (
                  <th key={h} className="px-4 py-3 text-xs font-bold text-slate-700 border-r border-slate-100 font-mono">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {previewRows.length === 0 ? (
                <tr>
                  <td colSpan={currentHeaders.length + 1} className="px-6 py-12 text-center text-slate-400 font-serif italic text-sm">
                    No data rows matching the active SQL filters.
                  </td>
                </tr>
              ) : (
                previewRows.map((row, idx) => (
                  <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-2 border-b border-slate-100 text-[10px] text-slate-400 font-mono text-center border-r border-slate-100 bg-slate-50/20">{idx + 1}</td>
                    {row.map((val, cellIdx) => (
                      <td 
                        key={cellIdx} 
                        className="px-4 py-2.5 border-b border-slate-100 text-xs border-r border-slate-100 font-mono text-slate-600 truncate max-w-[200px]"
                        title={val !== null ? String(val) : 'null'}
                      >
                        {val === null ? (
                          <span className="text-slate-300 italic font-sans">null</span>
                        ) : (
                          String(val)
                        )}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
