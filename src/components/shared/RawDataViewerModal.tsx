import React, { useState, useMemo } from 'react';
import { 
  X, 
  Search, 
  ArrowUpDown, 
  ArrowUp, 
  ArrowDown, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  ChevronsLeft, 
  ChevronsRight, 
  FilterX, 
  TableProperties
} from 'lucide-react';
import { cn } from '../../lib/utils';

interface RawDataViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  datasetName: string;
  variables: Array<{ name: string; type: string }>;
  data: any[];
}

type SortConfig = {
  key: string;
  direction: 'asc' | 'desc' | null;
};

export const RawDataViewerModal: React.FC<RawDataViewerModalProps> = ({
  isOpen,
  onClose,
  datasetName,
  variables,
  data
}) => {
  const safeData = Array.isArray(data) ? data : [];

  // Search and Filter State
  const [globalSearch, setGlobalSearch] = useState('');
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>({});
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: '', direction: null });

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Handle Sort Toggle
  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' | null = 'asc';
    if (sortConfig.key === key) {
      if (sortConfig.direction === 'asc') {
        direction = 'desc';
      } else if (sortConfig.direction === 'desc') {
        direction = null; // Reset sort
      }
    }
    setSortConfig({ key: direction ? key : '', direction });
    setCurrentPage(1); // Reset to first page when sort changes
  };

  // Handle Column Filter Change
  const handleColumnFilterChange = (column: string, value: string) => {
    setColumnFilters(prev => ({
      ...prev,
      [column]: value
    }));
    setCurrentPage(1); // Reset to first page when filters change
  };

  // Clear all search and filters
  const handleClearAll = () => {
    setGlobalSearch('');
    setColumnFilters({});
    setSortConfig({ key: '', direction: null });
    setCurrentPage(1);
  };

  // Apply sorting and filtering
  const processedData = useMemo(() => {
    let result = [...safeData];

    // 1. Apply Global Search
    if (globalSearch.trim() !== '') {
      const query = globalSearch.toLowerCase();
      result = result.filter(row => {
        return Object.values(row).some(val => {
          if (val === null || val === undefined) return false;
          return val.toString().toLowerCase().includes(query);
        });
      });
    }

    // 2. Apply Column-specific Filters
    Object.entries(columnFilters).forEach(([col, filterVal]) => {
      if (filterVal.trim() !== '') {
        const query = filterVal.toLowerCase().trim();
        result = result.filter(row => {
          const val = row[col];
          if (val === null || val === undefined) return false;
          
          // Basic comparison for numeric or categorical
          const strVal = val.toString().toLowerCase();
          
          // Support basic numeric operators if typed in, e.g., ">12" or "<5" or ">=20" or "<=4.5"
          if (/^[><=]/.test(query) && !isNaN(Number(val))) {
            const numVal = Number(val);
            const match = query.match(/^([><=]+)?\s*(.*)$/);
            if (match) {
              const operator = match[1];
              const targetVal = Number(match[2]);
              if (!isNaN(targetVal)) {
                if (operator === '>') return numVal > targetVal;
                if (operator === '<') return numVal < targetVal;
                if (operator === '>=') return numVal >= targetVal;
                if (operator === '<=') return numVal <= targetVal;
                if (operator === '=') return numVal === targetVal;
              }
            }
          }

          return strVal.includes(query);
        });
      }
    });

    // 3. Apply Sorting
    if (sortConfig.key && sortConfig.direction) {
      const key = sortConfig.key;
      const isAsc = sortConfig.direction === 'asc';
      result.sort((a, b) => {
        const valA = a[key];
        const valB = b[key];

        if (valA === undefined || valA === null) return isAsc ? 1 : -1;
        if (valB === undefined || valB === null) return isAsc ? -1 : 1;

        if (typeof valA === 'number' && typeof valB === 'number') {
          return isAsc ? valA - valB : valB - valA;
        }

        const strA = valA.toString().toLowerCase();
        const strB = valB.toString().toLowerCase();
        return isAsc 
          ? strA.localeCompare(strB) 
          : strB.localeCompare(strA);
      });
    }

    return result;
  }, [safeData, globalSearch, columnFilters, sortConfig]);

  // Paginated Data
  const totalRows = processedData.length;
  const totalPages = Math.ceil(totalRows / pageSize) || 1;
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return processedData.slice(start, start + pageSize);
  }, [processedData, currentPage, pageSize]);

  // CSV Export
  const handleCSVExport = () => {
    if (processedData.length === 0) return;
    
    const headers = variables.map(v => v.name);
    const csvRows = [
      headers.join(','), // Header row
      ...processedData.map(row => 
        headers.map(header => {
          const val = row[header];
          if (val === null || val === undefined) return '';
          const strVal = val.toString();
          // Escape quotes if string contains a comma or quote
          if (strVal.includes(',') || strVal.includes('"') || strVal.includes('\n')) {
            return `"${strVal.replace(/"/g, '""')}"`;
          }
          return strVal;
        }).join(',')
      )
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + csvRows.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `${datasetName.toLowerCase().replace(/[^a-z0-9]/g, '_')}_filtered_raw.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const hasActiveFilters = globalSearch.trim() !== '' || 
    Object.values(columnFilters).some(v => v.trim() !== '') || 
    sortConfig.direction !== null;

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-6xl h-[85vh] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-blue-500/20 rounded-lg">
              <TableProperties className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-sm font-black font-mono uppercase tracking-widest text-slate-100">
                Institutional Raw Data Explorer
              </h3>
              <p className="text-[11px] text-slate-400 font-serif italic">
                Active Matrix: <span className="font-sans font-bold text-white not-italic">{datasetName}</span>
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-full bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Toolbar Control Panel */}
        <div className="p-4 bg-slate-50 border-b border-slate-100 flex flex-col md:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-2 flex-1 w-full max-w-md">
            <div className="relative flex-1">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                <Search className="w-4 h-4 text-slate-400" />
              </span>
              <input 
                type="text"
                placeholder="Global search across all fields..."
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-9 pr-4 py-2 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white shadow-sm"
              />
            </div>
            {hasActiveFilters && (
              <button 
                onClick={handleClearAll}
                className="px-3 py-2 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-xs font-bold hover:bg-amber-100 flex items-center gap-1.5 transition-colors"
              >
                <FilterX className="w-3.5 h-3.5" /> Clear All
              </button>
            )}
          </div>

          <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end">
            <div className="text-xs font-mono text-slate-500">
              Showing <span className="text-slate-900 font-bold">{Math.min(totalRows, (currentPage - 1) * pageSize + 1)}-{Math.min(totalRows, currentPage * pageSize)}</span> of <span className="text-slate-900 font-bold">{totalRows}</span> rows
              {totalRows !== safeData.length && (
                <span className="text-slate-400 ml-1"> (filtered from {safeData.length})</span>
              )}
            </div>

            <button 
              onClick={handleCSVExport}
              disabled={totalRows === 0}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-sm"
            >
              <Download className="w-3.5 h-3.5" /> Export Filtered CSV
            </button>
          </div>
        </div>

        {/* Data Grid with Column Filters */}
        <div className="flex-1 overflow-auto bg-slate-50 border-b border-slate-100">
          <table className="w-full border-collapse text-left text-xs bg-white min-w-max">
            <thead>
              {/* Header Titles */}
              <tr className="bg-slate-900 text-slate-300 border-b border-slate-800 sticky top-0 z-10">
                <th className="p-3 font-mono font-bold text-center w-14 bg-slate-950 text-slate-500">
                  Obs
                </th>
                {variables.map((variable) => {
                  const isSorted = sortConfig.key === variable.name;
                  const dir = sortConfig.direction;
                  return (
                    <th 
                      key={variable.name}
                      onClick={() => handleSort(variable.name)}
                      className="p-3 font-mono font-bold uppercase tracking-wider cursor-pointer hover:bg-slate-800/80 hover:text-white transition-colors select-none"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-slate-200">{variable.name}</span>
                        {isSorted ? (
                          dir === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-blue-400" /> : <ArrowDown className="w-3.5 h-3.5 text-blue-400" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-500" />
                        )}
                      </div>
                      <div className="text-[9px] font-serif font-light italic text-slate-400 lowercase leading-tight">
                        {variable.type}
                      </div>
                    </th>
                  );
                })}
              </tr>
              {/* Inline Column Filters Row */}
              <tr className="bg-slate-100 border-b border-slate-200 sticky top-[48px] z-10">
                <th className="p-2 bg-slate-150 text-center w-14 border-r border-slate-200">
                  <span className="text-[9px] font-mono text-slate-400 font-bold">Filters:</span>
                </th>
                {variables.map((variable) => (
                  <th key={variable.name} className="p-2 border-r border-slate-200 last:border-0 bg-slate-100">
                    <input 
                      type="text"
                      placeholder={variable.type === 'numeric' ? 'e.g., >10, <5' : 'Search...'}
                      value={columnFilters[variable.name] || ''}
                      onChange={(e) => handleColumnFilterChange(variable.name, e.target.value)}
                      className="w-full px-2 py-1 text-[11px] font-mono border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
                    />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedData.length === 0 ? (
                <tr>
                  <td colSpan={variables.length + 1} className="p-12 text-center text-slate-400 font-serif italic text-sm">
                    No observations match your filtering parameters. Try relaxing your filters.
                  </td>
                </tr>
              ) : (
                paginatedData.map((row, index) => {
                  const absoluteIndex = (currentPage - 1) * pageSize + index + 1;
                  return (
                    <tr 
                      key={index} 
                      className="hover:bg-slate-50/70 transition-colors"
                    >
                      <td className="p-3 text-center bg-slate-50/50 text-slate-400 font-mono font-bold border-r border-slate-100 text-[10px]">
                        {absoluteIndex}
                      </td>
                      {variables.map((variable) => {
                        const val = row[variable.name];
                        const isNumber = typeof val === 'number';
                        return (
                          <td 
                            key={variable.name}
                            className={cn(
                              "p-3 font-mono text-[11px] border-r border-slate-50 last:border-0",
                              isNumber ? "text-blue-600 text-right font-medium" : "text-slate-800"
                            )}
                          >
                            {val === null || val === undefined ? (
                              <span className="text-slate-300 italic">null</span>
                            ) : isNumber ? (
                              // If integer, display normally, otherwise to 4 decimal places maximum
                              Number.isInteger(val) ? val.toString() : parseFloat(val.toFixed(4))
                            ) : (
                              val.toString()
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer / Pagination Controls */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row gap-4 justify-between items-center select-none">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Rows per page:</span>
              <select 
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className="text-xs border border-slate-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white"
              >
                {[15, 30, 50, 100].map(size => (
                  <option key={size} value={size}>{size}</option>
                ))}
              </select>
            </div>
            
            {hasActiveFilters && (
              <span className="text-[10px] font-mono text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full border border-amber-100 font-bold uppercase tracking-tight">
                Filters Active
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setCurrentPage(1)}
              disabled={currentPage === 1}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:bg-slate-100 disabled:opacity-50 text-slate-600 disabled:text-slate-300 transition-colors"
              title="First Page"
            >
              <ChevronsLeft className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:bg-slate-100 disabled:opacity-50 text-slate-600 disabled:text-slate-300 transition-colors"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <span className="text-xs font-mono text-slate-600 mx-2">
              Page <span className="font-bold text-slate-900">{currentPage}</span> of <span className="font-bold text-slate-900">{totalPages}</span>
            </span>

            <button 
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:bg-slate-100 disabled:opacity-50 text-slate-600 disabled:text-slate-300 transition-colors"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button 
              onClick={() => setCurrentPage(totalPages)}
              disabled={currentPage === totalPages}
              className="p-1.5 border border-slate-200 rounded-lg hover:bg-white disabled:bg-slate-100 disabled:opacity-50 text-slate-600 disabled:text-slate-300 transition-colors"
              title="Last Page"
            >
              <ChevronsRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
