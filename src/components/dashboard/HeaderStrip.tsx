import React from 'react';
import { User } from 'firebase/auth';
import { Database, Binary, CalendarRange, ArrowRight, GraduationCap, Sparkles } from 'lucide-react';

interface ModelRunItem {
  id: string;
  module: string;
  timestamp: any;
  [key: string]: any;
}

interface HeaderStripProps {
  onNavigate: (module: string) => void;
  user: User | null;
  modelRuns: ModelRunItem[];
  loading: boolean;
  error: string | null;
}

export default function HeaderStrip({ onNavigate, user, modelRuns, loading, error: propError }: HeaderStripProps) {
  // Formatting date exactly as "Tuesday, 14 July 2026"
  const formattedDate = new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).format(new Date());

  const stats = React.useMemo(() => {
    const totalRuns = modelRuns.length;
    
    // Count distinct values of the "module" field
    const modules = modelRuns.map(d => d.module).filter(Boolean);
    const distinctMethods = new Set(modules).size;

    // Count sessions this month (timestamp >= first day of current month)
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfMonthIso = startOfMonth.toISOString();

    const parseTimestamp = (ts: any): string => {
      if (!ts) return "";
      if (typeof ts === 'string') return ts;
      if (ts.toDate && typeof ts.toDate === 'function') {
        return ts.toDate().toISOString();
      }
      if (ts.seconds !== undefined) {
        return new Date(ts.seconds * 1000).toISOString();
      }
      return String(ts);
    };

    const sessionsMonth = modelRuns.filter(d => {
      const tsStr = parseTimestamp(d.timestamp);
      return tsStr && tsStr >= startOfMonthIso;
    }).length;

    return {
      totalRuns,
      distinctMethods,
      sessionsMonth,
    };
  }, [modelRuns]);

  const displayName = user?.displayName || user?.email?.split('@')[0] || "Scholar";

  return (
    <div id="header-strip-container" className="bg-slate-900 border border-slate-800 text-white rounded-2xl p-6 mb-6 shadow-md relative overflow-hidden">
      {/* Decorative vector background */}
      <div className="absolute right-0 top-0 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
      <div className="absolute left-1/3 bottom-0 w-64 h-64 bg-teal-500/5 rounded-full blur-2xl pointer-events-none -mb-10" />

      <div className="relative z-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 text-indigo-400 text-xs font-semibold uppercase tracking-wider mb-2">
            <GraduationCap className="h-4 w-4" />
            <span>Economics Learning Lab</span>
          </div>
          <h1 id="header-welcome-title" className="text-2xl md:text-3xl font-bold font-sans tracking-tight text-white mb-1.5">
            Welcome back, <span className="text-indigo-200">{displayName}</span>
          </h1>
          <p className="text-xs text-slate-400 font-medium">
            {formattedDate}
          </p>
        </div>

        {/* Stats Grid */}
        <div id="header-stats-grid" className="grid grid-cols-3 gap-3 md:gap-4 sm:min-w-[450px]">
          {/* Stat 1: Total Models Run */}
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Models Run</span>
              <Database className="h-3.5 w-3.5 text-indigo-400" />
            </div>
            {loading ? (
              <div className="h-6 w-12 bg-slate-700 rounded animate-pulse" />
            ) : (
              <span className="text-xl font-bold text-white font-mono">{stats.totalRuns}</span>
            )}
          </div>

          {/* Stat 2: Methods Used */}
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Methods</span>
              <Binary className="h-3.5 w-3.5 text-teal-400" />
            </div>
            {loading ? (
              <div className="h-6 w-12 bg-slate-700 rounded animate-pulse" />
            ) : (
              <span className="text-xl font-bold text-white font-mono">{stats.distinctMethods}</span>
            )}
          </div>

          {/* Stat 3: Sessions This Month */}
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700/50 rounded-xl p-3 flex flex-col justify-between">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">Sessions</span>
              <CalendarRange className="h-3.5 w-3.5 text-rose-400" />
            </div>
            {loading ? (
              <div className="h-6 w-12 bg-slate-700 rounded animate-pulse" />
            ) : (
              <span className="text-xl font-bold text-white font-mono">{stats.sessionsMonth}</span>
            )}
          </div>
        </div>
      </div>

      {/* Onboarding Banner */}
      {!loading && stats.totalRuns === 0 && (
        <div id="onboarding-banner" className="mt-6 p-4 bg-gradient-to-r from-indigo-950/80 to-slate-900 border border-indigo-500/30 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-4 animate-fadeIn">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-500/20 p-2 rounded-lg text-indigo-400 shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">Start here → Run your first OLS regression</p>
              <p className="text-xs text-slate-400 mt-0.5">Explore the OLS module, fit your first linear model, and let our AI professor synthesize the results.</p>
            </div>
          </div>
          <button
            onClick={() => onNavigate("ols")}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg transition-all shadow-md shadow-indigo-950 hover:shadow-indigo-900 active:scale-95 cursor-pointer"
          >
            <span>Launch OLS Lab</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
}
