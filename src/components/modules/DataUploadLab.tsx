import React, { useState, useRef, useMemo } from 'react';
import { 
  Upload, 
  FileSpreadsheet, 
  AlertCircle, 
  CheckCircle2, 
  Loader2, 
  Table, 
  HelpCircle, 
  ArrowRight, 
  Check, 
  Database, 
  Sparkles, 
  Activity 
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStore } from '../../store/useStore';
import * as XLSX from 'xlsx';
import { uploadSavFile } from '../../services/apiClient';
import { useDuckDB } from '../../hooks/useDuckDB';
import DataPreview from '../shared/DataPreview';

interface DataUploadLabProps {
  onDataLoaded?: (payload: { rows: any[] }, filename: string) => void;
}

export default function DataUploadLab({ onDataLoaded }: DataUploadLabProps) {
  const { 
    setCurrentDataset, 
    saveDataset, 
    setOlsConfiguration, 
    setDependentVar, 
    setRegressors, 
    setActiveModule,
    addToast 
  } = useStore();

  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States for successfully parsed data
  const [fileName, setFileName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [selectedY, setSelectedY] = useState<string>('');
  const [selectedX, setSelectedX] = useState<string[]>([]);
  const [variableLabels, setVariableLabels] = useState<{[col: string]: string}>({});
  const [valueLabels, setValueLabels] = useState<{[col: string]: {[code: string]: string}}>({});

  // DuckDB integration states
  const { loadFile: loadDuckDBFile, query: runDuckDBQuery } = useDuckDB();
  const [isDuckDBLoaded, setIsDuckDBLoaded] = useState<boolean>(false);
  const [fileSize, setFileSize] = useState<number>(0);
  const [loadTimeMs, setLoadTimeMs] = useState<number>(0);
  const [initialRowCount, setInitialRowCount] = useState<number>(0);
  const [activeFile, setActiveFile] = useState<File | null>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  // Simple CSV line parser that respects nested quotes and commas
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"' || char === "'") {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const processFile = async (file: File) => {
    setLoading(true);
    setError(null);
    setSuccessMsg(null);
    setFileName(null);
    setHeaders([]);
    setRows([]);
    setSelectedY('');
    setSelectedX([]);

    const isCSV = file.name.endsWith('.csv');
    const isTSV = file.name.endsWith('.tsv');
    const isParquet = file.name.endsWith('.parquet');
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isSav = file.name.endsWith('.sav');

    if (!isCSV && !isTSV && !isParquet && !isExcel && !isSav) {
      setError("Unsupported file format. Please upload a .csv, .tsv, .parquet, .xlsx, .xls, or .sav file.");
      setLoading(false);
      return;
    }

    setActiveFile(file);
    setFileSize(file.size);
    setIsDuckDBLoaded(false);

    try {
      if (isSav) {
        try {
          const res = await uploadSavFile(file);
          if (!res || !res.headers || !res.rows) {
            throw new Error("Invalid response from server parsing SAV file.");
          }
          
          const detectedHeaders = res.headers;
          const parsedRows = res.rows.map((rowArr: any[]) => {
            const rowObj: any = {};
            detectedHeaders.forEach((h: string, idx: number) => {
              rowObj[h] = rowArr[idx];
            });
            return rowObj;
          });
          
          setHeaders(detectedHeaders);
          setRows(parsedRows);
          setVariableLabels(res.variable_labels || {});
          setValueLabels(res.value_labels || {});
          setFileName(file.name);
          setSuccessMsg(`Successfully imported SPSS SAV: ${parsedRows.length} rows and ${detectedHeaders.length} columns.`);
          
          const firstNumeric = detectedHeaders.find((h: string) => {
            const val = parsedRows[0]?.[h];
            return typeof val === 'number';
          });
          if (firstNumeric) {
            setSelectedY(firstNumeric);
            const others = detectedHeaders.filter((h: string) => h !== firstNumeric && typeof parsedRows[0]?.[h] === 'number');
            setSelectedX(others);
          } else {
            setSelectedY(detectedHeaders[0]);
          }

          if (onDataLoaded) {
            onDataLoaded({ rows: parsedRows }, file.name);
          }
        } catch (err: any) {
          setError(`SAV Parsing Error: ${err.message || err}`);
        } finally {
          setLoading(false);
        }
      } else if (isCSV || isTSV || isParquet) {
        try {
          const startTime = performance.now();
          const { headers: detectedHeaders, n_rows } = await loadDuckDBFile(file);
          const endTime = performance.now();
          const duration = Math.round(endTime - startTime);

          // Retrieve active dataset rows
          const initialData = await runDuckDBQuery(`SELECT * FROM uploaded_data`);
          const parsedRows = initialData.rows.map(rowArr => {
            const obj: any = {};
            initialData.headers.forEach((h, idx) => {
              obj[h] = rowArr[idx];
            });
            return obj;
          });

          setHeaders(detectedHeaders);
          setRows(parsedRows);
          setFileName(file.name);
          setLoadTimeMs(duration);
          setInitialRowCount(n_rows);
          setIsDuckDBLoaded(true);

          setSuccessMsg(`Successfully imported ${file.name.split('.').pop()?.toUpperCase()} via DuckDB-WASM: ${n_rows.toLocaleString()} rows, ${detectedHeaders.length} columns.`);

          // Auto-select first numeric column as Y
          const firstNumeric = detectedHeaders.find(h => {
            const val = parsedRows[0]?.[h];
            return typeof val === 'number';
          });
          if (firstNumeric) {
            setSelectedY(firstNumeric);
            const others = detectedHeaders.filter(h => h !== firstNumeric && typeof parsedRows[0]?.[h] === 'number');
            setSelectedX(others);
          } else {
            setSelectedY(detectedHeaders[0] || '');
          }

          if (onDataLoaded) {
            onDataLoaded({ rows: parsedRows }, file.name);
          }
        } catch (err: any) {
          setError(`Error loading file into DuckDB: ${err.message || err}`);
        } finally {
          setLoading(false);
        }
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = e.target?.result;
            if (!data) throw new Error("Could not read file data.");
            
            const workbook = XLSX.read(data, { type: 'binary' });
            const firstSheetName = workbook.SheetNames[0];
            if (!firstSheetName) throw new Error("Excel workbook has no sheets.");
            const worksheet = workbook.Sheets[firstSheetName];
            if (!worksheet) throw new Error('Could not find worksheet.');
            const json = XLSX.utils.sheet_to_json(worksheet, { defval: null });
            
            if (!json || json.length === 0) {
              throw new Error("Excel sheet is empty or invalid.");
            }

            const detectedHeaders = Object.keys(json[0] || {});
            const parsedRows = json.map((row: any) => {
              const formattedRow: any = {};
              detectedHeaders.forEach(h => {
                const rawVal = row[h];
                if (rawVal === undefined || rawVal === null || rawVal === '') {
                  formattedRow[h] = null;
                } else if (typeof rawVal === 'string') {
                  const cleaned = rawVal.trim();
                  if (cleaned === '' || cleaned.toLowerCase() === 'null' || cleaned.toLowerCase() === 'na' || cleaned === '.') {
                    formattedRow[h] = null;
                  } else {
                    const num = Number(cleaned);
                    formattedRow[h] = isNaN(num) ? cleaned : num;
                  }
                } else {
                  formattedRow[h] = rawVal;
                }
              });
              return formattedRow;
            });

            setHeaders(detectedHeaders);
            setRows(parsedRows);
            setFileName(file.name);
            setSuccessMsg(`Successfully imported ${parsedRows.length} rows and ${detectedHeaders.length} columns.`);

            // Auto-select first numeric column as Y
            const firstNumeric = detectedHeaders.find(h => {
              const val = parsedRows[0]?.[h];
              return typeof val === 'number';
            });
            if (firstNumeric) {
              setSelectedY(firstNumeric);
              const others = detectedHeaders.filter(h => h !== firstNumeric && typeof parsedRows[0]?.[h] === 'number');
              setSelectedX(others);
            } else {
              setSelectedY(detectedHeaders[0] || '');
            }

            if (onDataLoaded) {
              onDataLoaded({ rows: parsedRows }, file.name);
            }
          } catch (err: any) {
            setError(`Error parsing Excel sheet: ${err.message || err}`);
          } finally {
            setLoading(false);
          }
        };
        reader.onerror = () => {
          setError("Error reading the file.");
          setLoading(false);
        };
        reader.readAsBinaryString(file);
      }
    } catch (err: any) {
      setError(`Import failed: ${err.message || err}`);
      setLoading(false);
    }
  };

  // Compute Column Statistics
  const columnStats = useMemo(() => {
    if (rows.length === 0 || headers.length === 0) return [];
    
    return headers.map(col => {
      const values = rows.map(r => r[col]);
      const numericValues = values
        .map(v => Number(v))
        .filter(v => v !== null && v !== undefined && !isNaN(v));
      
      const missingCount = values.filter(v => v === null || v === undefined || v === '').length;
      
      let mean = 'N/A';
      let min = 'N/A';
      let max = 'N/A';
      
      if (numericValues.length > 0) {
        const sum = numericValues.reduce((a, b) => a + b, 0);
        mean = (sum / numericValues.length).toFixed(4);
        min = Math.min(...numericValues).toFixed(4);
        max = Math.max(...numericValues).toFixed(4);
      }
      
      return {
        column: col,
        mean,
        min,
        max,
        missingCount,
        total: values.length,
        isNumeric: numericValues.length > values.length * 0.5
      };
    });
  }, [headers, rows]);

  // Check if cell is non-numeric
  const isNonNumeric = (val: any) => {
    if (val === null || val === undefined || val === '') return false;
    return isNaN(Number(val));
  };

  const handleToggleX = (col: string) => {
    if (selectedX.includes(col)) {
      setSelectedX(selectedX.filter(x => x !== col));
    } else {
      setSelectedX([...selectedX, col]);
    }
  };

  const handleUseDataset = () => {
    if (!fileName || rows.length === 0) return;
    if (!selectedY) {
      addToast('error', 'Selection Required', 'Please specify a dependent variable (Y).');
      return;
    }
    if (selectedX.length === 0) {
      addToast('error', 'Selection Required', 'Please select at least one exogenous regressor (X).');
      return;
    }

    // Build Variable Objects for Workspace Integration
    const variables = headers.map(key => {
      let type: 'numeric' | 'categorical' | 'date' | 'unknown' = 'numeric';
      const sampleVals = rows.slice(0, 10).map(r => r[key]).filter(v => v !== null && v !== undefined);
      const numericCount = sampleVals.filter(v => !isNaN(Number(v))).length;
      
      if (sampleVals.length > 0 && (numericCount / sampleVals.length) < 0.5) {
        const val = sampleVals[0];
        if (!isNaN(Date.parse(val))) {
          type = 'date';
        } else {
          type = 'categorical';
        }
      }
      return { 
        name: key, 
        label: variableLabels[key] || key, 
        type, 
        description: `Uploaded column: ${key}. ${variableLabels[key] ? 'Label: ' + variableLabels[key] : ''}` 
      };
    });

    const dataset = {
      name: `Uploaded: ${fileName}`,
      data: rows,
      variables,
      headers,
      columns: headers,
      rowCount: rows.length,
      colCount: headers.length,
      structure: 'cross-section' as const,
      variable_labels: variableLabels,
      value_labels: valueLabels
    };

    // Store in global state
    setCurrentDataset(dataset);
    saveDataset(dataset);

    // Sync options in the OLS Store configuration
    setOlsConfiguration({
      yVar: selectedY,
      xVars: selectedX,
      robustSE: false,
      yIsLogged: false
    });
    setDependentVar(selectedY);
    setRegressors(selectedX);

    addToast('success', 'Workspace Activated', `Loaded and regularized "${fileName}" with ${rows.length} observations.`);
    
    // Smooth transition to linear models
    setActiveModule('ols');
  };

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-16">
      {/* Header Banner */}
      <div className="bg-slate-900 text-white rounded-3xl p-8 shadow-xl border border-slate-800 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-10 pointer-events-none transform translate-x-12 -translate-y-12">
          <Database className="w-80 h-80" />
        </div>
        <div className="relative z-10 space-y-3 max-w-2xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-500/20 text-blue-300 rounded-full text-[10px] font-bold uppercase tracking-wider border border-blue-500/30">
            <Sparkles className="w-3 h-3 animate-pulse" /> Econometric Workbench
          </div>
          <h1 className="text-3xl font-serif font-semibold tracking-tight text-white leading-tight">
            Scholarly Data Onboarding Lab
          </h1>
          <p className="text-slate-300 text-sm font-serif italic">
            Ingest microdata files directly from your research. Our system parses headers, estimates descriptive statistics, and handles format alignment automatically.
          </p>
        </div>
      </div>

      {/* Upload Drag & Drop Dropzone */}
      <div className="card-premium p-6 bg-white border border-slate-200 shadow-sm rounded-3xl">
        <div
          id="file-upload-dropzone"
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          onClick={onButtonClick}
          className={cn(
            "relative flex flex-col items-center justify-center border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-all duration-300 min-h-[220px]",
            dragActive 
              ? "border-blue-500 bg-blue-50/50 scale-[1.01]" 
              : "border-slate-200 bg-slate-50/50 hover:bg-slate-100/40 hover:border-blue-400"
          )}
        >
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            accept=".csv,.tsv,.parquet,.xlsx,.xls,.sav"
            onChange={handleChange}
          />

          {loading ? (
            <div className="flex flex-col items-center py-6 space-y-3">
              <Loader2 className="w-12 h-12 text-blue-500 animate-spin" />
              <p className="text-sm font-medium text-slate-700">Structuring and indexing observational vectors...</p>
              <p className="text-xs text-slate-400 italic">Validating schema compliance & converting format</p>
            </div>
          ) : (
            <div className="flex flex-col items-center space-y-4">
              <div className={cn(
                "p-4 rounded-full bg-white border shadow-sm transition-transform duration-300",
                dragActive ? "scale-110 text-blue-500 border-blue-200" : "text-slate-400 border-slate-100"
              )}>
                <Upload className="w-10 h-10" />
              </div>
              
              <div className="space-y-1.5">
                <p className="text-base font-bold text-slate-800">
                  Drop your CSV/Excel/SPSS SAV workspace file here, or <span className="text-blue-600 underline hover:text-blue-800">browse folders</span>
                </p>
                <p className="text-xs text-slate-500 font-serif italic max-w-md mx-auto">
                  Processes and validates CSV (.csv), Excel (.xlsx, .xls), or SPSS (.sav) files for immediate econometric and research analysis.
                </p>
              </div>
            </div>
          )}
        </div>

        {activeFile && activeFile.size > 100 * 1024 * 1024 && (
          <div id="large-file-size-warning" className="mt-4 flex items-start gap-3 p-4 bg-indigo-50 border border-indigo-200 rounded-xl text-indigo-900 animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 text-indigo-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold">Large file detected — using DuckDB for fast processing</p>
              <p className="text-xs text-indigo-700 mt-0.5">
                The {formatFileSize(activeFile.size)} file will be loaded into DuckDB-WASM to avoid browser memory crashes and allow SQL filtering.
              </p>
            </div>
          </div>
        )}

        {error && (
          <div id="upload-error-alert" className="mt-4 flex items-start gap-3 p-4 bg-rose-50 border border-rose-200 rounded-xl animate-in fade-in duration-200">
            <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-rose-800">Import Fault Detected</p>
              <p className="text-xs text-rose-600 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {successMsg && (
          <div id="upload-success-alert" className="mt-4 flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl animate-in fade-in duration-200">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-emerald-800">Schema Verified</p>
              <p className="text-xs text-emerald-600 mt-0.5">{successMsg}</p>
            </div>
          </div>
        )}
      </div>

      {/* Main Workspace Configuration Panel (Only after successful upload) */}
      {rows.length > 0 && fileName && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 animate-in slide-in-from-bottom-4 duration-500">
          
          {/* Left Side: Live Preview & Variable Stats */}
          <div className="lg:col-span-8 space-y-6">
            
            {isDuckDBLoaded ? (
              <DataPreview
                fileName={fileName}
                fileSize={fileSize}
                loadTimeMs={loadTimeMs}
                initialHeaders={headers}
                initialRowCount={initialRowCount}
                onFilterApplied={(filteredRows, filteredHeaders) => {
                  setRows(filteredRows);
                  setHeaders(filteredHeaders);
                }}
                onReset={() => {
                  // Handled internally, rows synced via onFilterApplied
                }}
              />
            ) : (
              /* Live Data Preview */
              <div className="card-premium bg-white border border-slate-200 shadow-sm overflow-hidden rounded-3xl">
                <div className="px-6 py-4 bg-slate-50/50 border-b border-slate-100 flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Table className="w-4 h-4 text-slate-500" />
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">Structured Data Sample (First 10 Rows)</span>
                  </div>
                  <div className="text-[10px] bg-slate-100 text-slate-600 px-2.5 py-1 rounded-full font-mono font-bold">
                    {rows.length} Obs × {headers.length} Vars
                  </div>
                </div>
                
                <div className="overflow-x-auto max-w-full">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/80 border-b border-slate-200/80">
                        <th className="px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 font-mono border-r border-slate-100 w-12 text-center">Row</th>
                        {headers.map(h => (
                          <th key={h} className="px-4 py-3 text-xs font-bold text-slate-700 border-r border-slate-100">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 10).map((row, idx) => (
                        <tr key={idx} className="hover:bg-slate-50/50 transition-colors">
                          <td className="px-4 py-2 border-b border-slate-100 text-[10px] text-slate-400 font-mono text-center border-r border-slate-100 bg-slate-50/20">{idx + 1}</td>
                          {headers.map(h => {
                            const val = row[h];
                            const nonNum = isNonNumeric(val);
                            return (
                              <td 
                                key={h} 
                                className={cn(
                                  "px-4 py-2.5 border-b border-slate-100 text-xs border-r border-slate-100",
                                  nonNum ? "bg-amber-50 text-amber-800 font-medium" : "text-slate-600 font-mono"
                                )}
                              >
                                {val === null ? (
                                  <span className="text-slate-300 italic font-sans">null</span>
                                ) : nonNum ? (
                                  <span className="inline-flex items-center gap-1">
                                    {String(val)}
                                    <span className="text-[8px] uppercase tracking-wider bg-amber-100 text-amber-900 px-1 rounded">Text</span>
                                  </span>
                                ) : (
                                  String(val)
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                
                <div className="p-4 bg-amber-50/40 border-t border-slate-100 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded bg-amber-100 border border-amber-300 flex-shrink-0" />
                  <span className="text-[10px] text-slate-500 font-serif italic">Cells highlighted in orange contain non-numeric/categorical strings. These will be classified as categoricals or factors during model execution.</span>
                </div>
              </div>
            )}

            {/* Column Statistics summary */}
            <div className="card-premium bg-white border border-slate-200 shadow-sm rounded-3xl p-6">
              <div className="flex items-center gap-2 mb-4 border-b border-slate-100 pb-3">
                <Activity className="w-4 h-4 text-slate-500" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 font-mono">Inherent Descriptive Vectors</h3>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {columnStats.map(stat => (
                  <div key={stat.column} className="p-4 bg-slate-50/50 border border-slate-100 rounded-xl hover:border-slate-200 transition-all">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-bold text-slate-800 font-mono truncate max-w-[150px]">{stat.column}</span>
                      <span className={cn(
                        "text-[9px] font-bold uppercase px-2 py-0.5 rounded-full font-mono",
                        stat.isNumeric ? "bg-blue-50 text-blue-600 border border-blue-100" : "bg-amber-50 text-amber-600 border border-amber-100"
                      )}>
                        {stat.isNumeric ? 'Continuous' : 'Discrete'}
                      </span>
                    </div>
                    
                    <div className="grid grid-cols-4 gap-1 text-[10px] font-mono text-slate-500">
                      <div>
                        <div className="text-slate-400 text-[8px] uppercase">Mean</div>
                        <div className="text-slate-700 font-bold">{stat.mean}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[8px] uppercase">Min</div>
                        <div className="text-slate-700 font-bold">{stat.min}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[8px] uppercase">Max</div>
                        <div className="text-slate-700 font-bold">{stat.max}</div>
                      </div>
                      <div>
                        <div className="text-slate-400 text-[8px] uppercase">Nulls</div>
                        <div className={cn("font-bold", stat.missingCount > 0 ? "text-amber-600" : "text-slate-700")}>
                          {stat.missingCount}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Side: Specification Configuration Panel */}
          <div className="lg:col-span-4 space-y-6">
            <div className="card-premium bg-white border border-slate-200 shadow-sm rounded-3xl p-6 sticky top-6 space-y-6">
              <div>
                <h3 className="text-sm font-bold text-slate-900 uppercase tracking-tight">Onboarding Controller</h3>
                <p className="text-xs text-slate-500 font-serif italic mt-1">
                  Bind continuous columns to linear parameters to seed regression equations.
                </p>
              </div>

              {/* Dependent Selector (Y) */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Dependent Outcome (Y)</label>
                <select 
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm font-bold text-slate-800 outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={selectedY}
                  onChange={(e) => {
                    setSelectedY(e.target.value);
                    // Ensure Y is removed from X list
                    setSelectedX(selectedX.filter(x => x !== e.target.value));
                  }}
                >
                  <option value="">Choose Y Target...</option>
                  {headers.map(h => (
                    <option key={h} value={h}>{h}</option>
                  ))}
                </select>
              </div>

              {/* Regressors Selectors (X) */}
              <div className="space-y-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block font-mono">Independent Regressors (X)</label>
                <div className="border border-slate-200 rounded-xl p-3 max-h-48 overflow-y-auto space-y-1.5 custom-scrollbar bg-slate-50/50">
                  {headers.filter(h => h !== selectedY).map(h => {
                    const active = selectedX.includes(h);
                    return (
                      <button
                        key={h}
                        type="button"
                        onClick={() => handleToggleX(h)}
                        className={cn(
                          "w-full flex items-center justify-between p-2 rounded-lg text-xs font-bold transition-all text-left border",
                          active 
                            ? "bg-blue-50 text-blue-700 border-blue-200/60 shadow-sm" 
                            : "bg-white text-slate-600 border-slate-100 hover:border-slate-300"
                        )}
                      >
                        <span className="truncate pr-2 font-mono">{h}</span>
                        <div className={cn(
                          "w-4 h-4 rounded flex items-center justify-center border transition-all",
                          active ? "bg-blue-600 border-blue-600 text-white" : "border-slate-300 bg-white"
                        )}>
                          {active && <Check className="w-3 h-3 stroke-[3]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Specification Equation Preview */}
              {selectedY && (
                <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl space-y-2">
                  <div className="text-[9px] font-black uppercase text-slate-400 tracking-wider font-mono">Equation Structure</div>
                  <div className="text-xs font-mono text-slate-800 break-all leading-relaxed bg-white border border-slate-200/50 p-2.5 rounded-xl">
                    <span className="text-blue-600 font-bold">{selectedY}</span>
                    <span className="text-slate-400 mx-1.5">=</span>
                    <span className="text-slate-500">β₀</span>
                    {selectedX.length > 0 ? (
                      selectedX.map((x, i) => (
                        <span key={x} className="text-slate-700">
                          <span className="text-slate-400 mx-1">+</span>
                          β_{i+1}(<span className="text-indigo-600 font-bold">{x}</span>)
                        </span>
                      ))
                    ) : (
                      <span className="text-slate-400 italic"> + ...</span>
                    )}
                    <span className="text-slate-400 mx-1">+</span>
                    <span className="text-slate-500 font-bold">u_i</span>
                  </div>
                </div>
              )}

              {/* Action Onboarding Button */}
              <button
                onClick={handleUseDataset}
                disabled={!selectedY || selectedX.length === 0}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3.5 rounded-xl font-bold text-sm shadow transition-all cursor-pointer",
                  (!selectedY || selectedX.length === 0)
                    ? "bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200/40"
                    : "bg-blue-600 hover:bg-blue-700 text-white hover:shadow-md hover:scale-[1.01]"
                )}
              >
                Assemble Observational Matrix
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
