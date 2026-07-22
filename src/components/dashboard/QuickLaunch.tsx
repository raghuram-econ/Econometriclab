import React from 'react';
import { ArrowRight, Sparkles } from 'lucide-react';

interface QuickLaunchProps {
  onNavigate: (module: string) => void;
  modelRuns: any[];
  loading: boolean;
  error: string | null;
}

const defaultOrder = ["ols", "panel", "glm", "timeseries", "descriptive", "professor-desk"];

const moduleMetadata: Record<string, { name: string; emoji: string }> = {
  "ols": { name: "OLS Regression", emoji: "📊" },
  "panel": { name: "Panel Data", emoji: "📐" },
  "glm": { name: "GLM Models", emoji: "📈" },
  "timeseries": { name: "Time Series", emoji: "⏱" },
  "descriptive": { name: "Descriptive Stats", emoji: "🔢" },
  "professor-desk": { name: "Professor Desk", emoji: "🎓" }
};

const normalizeDocToModuleId = (dbModule: string): string => {
  const m = (dbModule || '').toLowerCase();
  if (m === 'ols' || m === 'data lab') return 'ols';
  if (m === 'fe' || m === 'panel' || m === 'fixed-effects' || m === 'panel fe' || m === 'panel re') return 'panel';
  if (m === 'glm') return 'glm';
  if (m === 'arima' || m === 'adv-timeseries' || m === 'timeseries' || m === 'arima lab') return 'timeseries';
  if (m === 'stat-tests' || m === 'descriptive' || m === 'descriptive-stats' || m === 'descriptive stats') return 'descriptive';
  if (m === 'professor-desk' || m === 'professor_desk' || m === 'professor' || m === 'professor desk' || m === 'professor-q&a' || m === 'professor q&a') return 'professor-desk';
  return '';
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

const getDaysAgoText = (date: Date | null, hasRecord: boolean): string => {
  if (!hasRecord) return "Never used";
  if (!date) return "Last used: Today"; // Fallback if timestamp exists but cannot parse full historical date
  
  const now = new Date();
  const d1 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d2 = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  
  if (diffDays <= 0) return "Last used: Today";
  if (diffDays === 1) return "Last used: 1 day ago";
  return `Last used: ${diffDays} days ago`;
};

export default function QuickLaunch({ onNavigate, modelRuns, loading, error }: QuickLaunchProps) {
  const { orderedModules, moduleStats } = React.useMemo(() => {
    const frequencies: Record<string, number> = {
      "ols": 0,
      "panel": 0,
      "glm": 0,
      "timeseries": 0,
      "descriptive": 0,
      "professor-desk": 0
    };

    const latestDates: Record<string, Date | null> = {
      "ols": null,
      "panel": null,
      "glm": null,
      "timeseries": null,
      "descriptive": null,
      "professor-desk": null
    };

    const hasRecords: Record<string, boolean> = {
      "ols": false,
      "panel": false,
      "glm": false,
      "timeseries": false,
      "descriptive": false,
      "professor-desk": false
    };

    modelRuns.forEach(docData => {
      const modId = normalizeDocToModuleId(docData.module);
      if (modId && modId in frequencies) {
        frequencies[modId] = (frequencies[modId] ?? 0) + 1;
        hasRecords[modId] = true;

        const date = parseTimestamp(docData.timestamp);
        if (date) {
          const currentLatest = latestDates[modId];
          if (!currentLatest || date > currentLatest) {
            latestDates[modId] = date;
          }
        }
      }
    });

    const totalSessions = modelRuns.length;
    let finalOrder = [...defaultOrder];

    if (totalSessions >= 5) {
      // Sort by frequency descending, break ties using defaultOrder index
      finalOrder.sort((a, b) => {
        const freqDiff = (frequencies[b] ?? 0) - (frequencies[a] ?? 0);
        if (freqDiff !== 0) return freqDiff;
        return defaultOrder.indexOf(a) - defaultOrder.indexOf(b);
      });
    }

    const statsObj: Record<string, { latestDate: Date | null; hasRecord: boolean }> = {};
    defaultOrder.forEach(mId => {
      statsObj[mId] = {
        latestDate: latestDates[mId] ?? null,
        hasRecord: hasRecords[mId] ?? false
      };
    });

    return {
      orderedModules: finalOrder,
      moduleStats: statsObj
    };
  }, [modelRuns]);

  const handleNavigate = (mId: string) => {
    if (mId === 'panel') {
      onNavigate('fe');
    } else if (mId === 'timeseries') {
      onNavigate('arima');
    } else if (mId === 'descriptive') {
      onNavigate('descriptive-stats');
    } else if (mId === 'all') {
      onNavigate('templates');
    } else {
      onNavigate(mId);
    }
  };

  return (
    <div id="quick-launch-container" className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 id="quick-launch-title" className="text-lg font-bold font-sans tracking-tight text-slate-900 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-indigo-500" />
            <span>Scholar Quick Launch</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Launch specialized modules. After 5+ sessions, cards dynamically prioritize your most-used methods first.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-xl text-xs mb-4">
          Error loading launch telemetry: {error}
        </div>
      )}

      {/* Grid: 3x2 on Desktop, 2x3 on Mobile */}
      <div id="quick-launch-grid" className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {orderedModules.map(moduleId => {
          const meta = moduleMetadata[moduleId];
          if (!meta) return null;
          const stats = moduleStats[moduleId] || { latestDate: null, hasRecord: false };
          const lastUsedText = getDaysAgoText(stats.latestDate, stats.hasRecord);

          return (
            <div
              key={moduleId}
              id={`quick-launch-card-${moduleId}`}
              className="bg-slate-50/50 hover:bg-slate-50 border border-slate-100 hover:border-indigo-200/60 rounded-xl p-4 flex flex-col justify-between transition-all duration-200 hover:shadow-sm"
            >
              <div>
                <div className="text-2xl mb-2.5">{meta.emoji}</div>
                <h3 className="text-xs font-bold text-slate-900 mb-1 leading-tight">{meta.name}</h3>
                <span className="text-[10px] text-slate-500 font-medium font-mono block mb-4">{lastUsedText}</span>
              </div>

              <button
                onClick={() => handleNavigate(moduleId)}
                className="w-full py-1.5 px-3 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 font-semibold text-xs rounded-lg transition-all duration-200 active:scale-95 cursor-pointer text-center"
              >
                Open
              </button>
            </div>
          );
        })}
      </div>

      <div className="flex justify-end mt-5">
        <button
          onClick={() => handleNavigate("all")}
          className="group flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-700 transition-colors cursor-pointer"
        >
          <span>See all modules</span>
          <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5 transition-transform" />
        </button>
      </div>
    </div>
  );
}
