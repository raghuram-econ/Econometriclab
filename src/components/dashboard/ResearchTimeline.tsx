import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { User } from '@supabase/supabase-js';
import { Calendar, Filter, Star, Eye, Download, Info, Search, Trash2 } from 'lucide-react';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface SupabaseErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
  };
}

function handleSupabaseError(error: unknown, operationType: OperationType, path: string | null, currentUser: User | null) {
  const errInfo: SupabaseErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentUser?.id,
      email: currentUser?.email,
      emailVerified: !!currentUser?.email_confirmed_at,
      isAnonymous: currentUser?.is_anonymous,
    },
    operationType,
    path
  };
  console.error('Supabase Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface ResearchTimelineProps {
  onNavigate: (module: string) => void;
  onRestore: (sessionId: string) => void;
  onExport: (sessionId: string) => void;
  user: User | null;
  modelRuns: ModelRunItem[];
  pinnedResults: PinnedResult[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

interface ModelRunItem {
  id: string;
  module: string;
  dependentVar?: string;
  specification?: string;
  timestamp: any;
  results?: {
    r2?: number;
    rSquared?: number;
    aic?: number;
    bic?: number;
    nObs?: number;
    n?: number;
    mainCoef?: number;
    mainPValue?: number;
  };
}

interface PinnedResult {
  id: string;
  module: string;
  dependentVar: string;
  keyResult: string;
  sessionId: string;
  timestamp: any;
  order: number;
}

export default function ResearchTimeline({ 
  onNavigate, 
  onRestore, 
  onExport,
  user,
  modelRuns,
  pinnedResults,
  loading,
  error: propError,
  onRefresh
}: ResearchTimelineProps) {
  const [error, setError] = useState<string | null>(null);
  
  // Local notification banner for pin limits / success
  const [bannerMsg, setBannerMsg] = useState<{ text: string; type: 'success' | 'warning' | 'error' } | null>(null);

  // Filter States
  const [selectedMethod, setSelectedMethod] = useState<string>('All');
  const [dateRange, setDateRange] = useState<string>('All Time');
  const [showStarredOnly, setShowStarredOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  const handlePin = async (run: ModelRunItem) => {
    if (!user) return;

    // Check limit of 10 pinned results
    if (pinnedResults.length >= 10 && !pinnedResults.some(p => p.sessionId === run.id)) {
      setBannerMsg({
        text: "Pin quota exceeded! You can pin a maximum of 10 results. Please unpin an item first.",
        type: 'warning'
      });
      return;
    }

    const isAlreadyPinned = pinnedResults.find(p => p.sessionId === run.id);
    const pinnedPath = `pinned_results (user ${user.id})`;

    try {
      if (isAlreadyPinned) {
        // Unpin item
        const { error: delError } = await supabase
          .from('pinned_results')
          .delete()
          .eq('user_id', user.id)
          .eq('id', isAlreadyPinned.id);
        if (delError) throw delError;
        setBannerMsg({ text: "Result unpinned successfully.", type: 'success' });
      } else {
        // Pin item
        const keyResult = getKeyResultText(run.results);
        const pinId = `pin_${run.id}`;

        let depVar = run.dependentVar;
        if (!depVar && run.specification) {
          depVar = (run.specification.split('~')[0] || "").trim();
        }

        const newPin: Omit<PinnedResult, 'id'> = {
          module: run.module,
          dependentVar: depVar || 'N/A',
          keyResult,
          sessionId: run.id,
          timestamp: run.timestamp,
          order: 0
        };

        const { error: upsertError } = await supabase
          .from('pinned_results')
          .upsert({ id: pinId, user_id: user.id, data: newPin });
        if (upsertError) throw upsertError;
        setBannerMsg({ text: "Result pinned to Scholar Dashboard!", type: 'success' });
      }

      // Auto-clear notification banner
      setTimeout(() => setBannerMsg(null), 4000);

      // Reload parent data
      onRefresh();
    } catch (err) {
      try {
        handleSupabaseError(err, OperationType.WRITE, pinnedPath, user);
      } catch (wrappedErr: any) {
        setError(wrappedErr.message);
      }
    }
  };

  const getKeyResultText = (results?: ModelRunItem['results']): string => {
    if (!results) return "N/A";
    const r2Val = results.r2 !== undefined ? results.r2 : results.rSquared;
    if (r2Val !== undefined) {
      return `R² = ${r2Val.toFixed(3)}`;
    }
    if (results.aic !== undefined) {
      return `AIC = ${results.aic.toFixed(1)}`;
    }
    if (results.bic !== undefined) {
      return `BIC = ${results.bic.toFixed(1)}`;
    }
    if (results.mainCoef !== undefined) {
      return `β = ${results.mainCoef.toFixed(3)}`;
    }
    return "Complete";
  };

  const parseTimestamp = (ts: any): Date | null => {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (ts.toDate && typeof ts.toDate === 'function') {
      return ts.toDate();
    }
    if (ts.seconds !== undefined) {
      return new Date(ts.seconds * 1000);
    }
    const parsed = Date.parse(ts);
    if (!isNaN(parsed)) {
      return new Date(parsed);
    }
    return null;
  };

  // Filter Logic
  const filteredRuns = modelRuns.filter(run => {
    // 1. Method Filter
    if (selectedMethod !== 'All') {
      const normalizedModule = (run.module || '').toLowerCase();
      if (selectedMethod === 'OLS' && !normalizedModule.includes('ols') && !normalizedModule.includes('data lab')) return false;
      if (selectedMethod === 'Panel' && !normalizedModule.includes('fe') && !normalizedModule.includes('panel') && !normalizedModule.includes('fixed')) return false;
      if (selectedMethod === 'GLM' && !normalizedModule.includes('glm') && !normalizedModule.includes('prob') && !normalizedModule.includes('logit')) return false;
      if (selectedMethod === 'Time Series' && !normalizedModule.includes('arima') && !normalizedModule.includes('timeseries')) return false;
      if (selectedMethod === 'Survival' && !normalizedModule.includes('survival') && !normalizedModule.includes('cox')) return false;
    }

    // 2. Date Filter
    const runDate = parseTimestamp(run.timestamp);
    if (runDate) {
      const now = new Date();
      if (dateRange === 'This Week') {
        const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        if (runDate < oneWeekAgo) return false;
      } else if (dateRange === 'This Month') {
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        if (runDate < startOfMonth) return false;
      }
    }

    // 3. Starred/Pinned Filter
    if (showStarredOnly) {
      const isPinned = pinnedResults.some(p => p.sessionId === run.id);
      if (!isPinned) return false;
    }

    // 4. Variable Name Filter (Dependent or Independent)
    if (searchQuery.trim()) {
      const queryText = searchQuery.toLowerCase().trim();
      const depVar = (run.dependentVar || '').toLowerCase();
      const spec = (run.specification || '').toLowerCase();
      
      const matchesDep = depVar.includes(queryText);
      const matchesSpec = spec.includes(queryText);
      
      if (!matchesDep && !matchesSpec) {
        return false;
      }
    }

    return true;
  });

  return (
    <div id="research-timeline-container" className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl text-white">
      {/* Banner message */}
      {bannerMsg && (
        <div className={`p-4 mb-4 rounded-xl text-xs flex items-center justify-between transition-all duration-300 ${
          bannerMsg.type === 'warning' ? 'bg-amber-950/80 border border-amber-500/30 text-amber-200' :
          bannerMsg.type === 'error' ? 'bg-red-950/80 border border-red-500/30 text-red-200' :
          'bg-indigo-950/80 border border-indigo-500/30 text-indigo-200'
        }`}>
          <div className="flex items-center gap-2">
            <Info className="h-4 w-4 shrink-0" />
            <span>{bannerMsg.text}</span>
          </div>
          <button onClick={() => setBannerMsg(null)} className="text-[10px] uppercase font-bold text-slate-400 hover:text-white px-2 py-1">
            Dismiss
          </button>
        </div>
      )}

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">
        <div>
          <h2 className="text-lg font-bold font-sans tracking-tight text-white flex items-center gap-2">
            <Calendar className="h-4 w-4 text-indigo-400" />
            <span>Academic Research Timeline</span>
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Explore, restore, and pin your empirical estimation models.</p>
        </div>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Search bar */}
          <div className="relative flex items-center bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs w-full sm:w-64">
            <Search className="h-3.5 w-3.5 text-slate-400 mr-2 shrink-0" />
            <input
              type="text"
              placeholder="Search variables (e.g. gdp, labor)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none text-white focus:outline-none w-full text-xs font-medium placeholder-slate-500"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="text-slate-400 hover:text-white ml-1.5 focus:outline-none text-[10px]"
                title="Clear search"
              >
                ✕
              </button>
            )}
          </div>

          {/* Methods Dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={selectedMethod}
              onChange={(e) => setSelectedMethod(e.target.value)}
              className="bg-transparent border-none text-white focus:outline-none cursor-pointer font-semibold pr-1"
            >
              <option value="All" className="bg-slate-900">All Methods</option>
              <option value="OLS" className="bg-slate-900">OLS</option>
              <option value="Panel" className="bg-slate-900">Panel</option>
              <option value="GLM" className="bg-slate-900">GLM</option>
              <option value="Time Series" className="bg-slate-900">Time Series</option>
              <option value="Survival" className="bg-slate-900">Survival</option>
            </select>
          </div>

          {/* Date range dropdown */}
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/60 rounded-xl px-3 py-1.5 text-xs">
            <Calendar className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value)}
              className="bg-transparent border-none text-white focus:outline-none cursor-pointer font-semibold pr-1"
            >
              <option value="All Time" className="bg-slate-900">All Time</option>
              <option value="This Week" className="bg-slate-900">This Week</option>
              <option value="This Month" className="bg-slate-900">This Month</option>
            </select>
          </div>

          {/* Toggle show starred only */}
          <button
            onClick={() => setShowStarredOnly(!showStarredOnly)}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
              showStarredOnly 
                ? 'bg-amber-500/10 border-amber-500 text-amber-400 hover:bg-amber-500/20' 
                : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Star className={`h-3.5 w-3.5 ${showStarredOnly ? 'fill-amber-400' : ''}`} />
            <span>Show pinned only</span>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="py-12 flex flex-col items-center justify-center gap-3">
          <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" />
          <span className="text-xs text-slate-400 font-medium font-mono">Retrieving research history...</span>
        </div>
      ) : filteredRuns.length === 0 ? (
        <div className="py-12 px-4 border border-dashed border-slate-800 rounded-xl text-center">
          <Search className="h-8 w-8 text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-300">No models found</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {modelRuns.length === 0 
              ? "No models run yet. Open a module to get started." 
              : "Try adjusting your filter settings to find specific estimation logs."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-950 text-slate-400 text-[10px] uppercase font-bold tracking-wider border-b border-slate-800">
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Dependent Variable</th>
                <th className="py-3 px-4">Key Result</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredRuns.map((run) => {
                const isPinned = pinnedResults.some(p => p.sessionId === run.id);
                const runDate = parseTimestamp(run.timestamp);
                const dateStr = runDate 
                  ? runDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
                  : 'Recent';

                return (
                  <tr key={run.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3.5 px-4 text-xs font-medium font-mono text-slate-400">{dateStr}</td>
                    <td className="py-3.5 px-4">
                      <span className="text-xs font-semibold px-2 py-1 rounded bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 uppercase tracking-wide">
                        {run.module || 'OLS'}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-semibold text-slate-200">
                      {run.dependentVar || (run.specification ? (run.specification.split('~')[0] || "").trim() : 'N/A')}
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono font-bold text-teal-400">{getKeyResultText(run.results)}</td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* Restore Button */}
                        <button
                          onClick={() => onRestore(run.id)}
                          className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-indigo-600 border border-slate-700/60 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title="Restore Model"
                        >
                          <Eye className="h-3 w-3" />
                          <span>Restore</span>
                        </button>

                        {/* Export Button */}
                        <button
                          onClick={() => onExport(run.id)}
                          className="px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-[11px] font-bold transition-all flex items-center gap-1 cursor-pointer"
                          title="Export Results"
                        >
                          <Download className="h-3 w-3" />
                          <span>⬇ Export</span>
                        </button>

                        {/* Pin Button */}
                        <button
                          onClick={() => handlePin(run)}
                          className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                            isPinned
                              ? 'bg-amber-500/20 border-amber-500/50 text-amber-400 hover:bg-amber-500/30'
                              : 'bg-slate-800 border-slate-700/60 text-slate-400 hover:text-amber-400'
                          }`}
                          title={isPinned ? "Unpin result" : "★ Pin to Dashboard"}
                        >
                          <Star className={`h-3.5 w-3.5 ${isPinned ? 'fill-amber-400' : ''}`} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
