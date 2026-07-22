import React, { useState, useEffect } from 'react';
import { db } from '../../lib/firebase';
import { User } from 'firebase/auth';
import { deleteDoc, doc } from 'firebase/firestore';
import { callBackendAPI } from '../../services/apiClient';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Pin, Trash2, ExternalLink, Loader2, AlertCircle, FileText } from 'lucide-react';

interface PinnedResult {
  id: string;
  module: string;
  dependentVar: string;
  keyResult: string;
  sessionId: string;
  timestamp: any;
  order: number;
}

interface AIDigestProps {
  onNavigate: (sessionId: string) => void;
  user: User | null;
  modelRuns: any[];
  pinnedResults: PinnedResult[];
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export default function AIDigest({ 
  onNavigate, 
  user, 
  modelRuns, 
  pinnedResults, 
  loading, 
  error: propError, 
  onRefresh 
}: AIDigestProps) {
  // AI Research Digest State
  const [digest, setDigest] = useState<string | null>(null);
  const [digestLoading, setDigestLoading] = useState<boolean>(false);
  const [digestError, setDigestError] = useState<string | null>(null);
  const [recentRunsCount, setRecentRunsCount] = useState<number>(0);

  const getRunDate = (run: any): Date => {
    if (!run?.timestamp) return new Date(0);
    if (typeof run.timestamp.toDate === 'function') {
      return run.timestamp.toDate();
    }
    return new Date(run.timestamp);
  };

  useEffect(() => {
    if (!user) {
      setDigest(null);
      setRecentRunsCount(0);
      return;
    }

    // Filter in-memory for runs in the last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRuns = modelRuns.filter(run => {
      const runDate = getRunDate(run);
      return runDate >= sevenDaysAgo;
    });

    setRecentRunsCount(recentRuns.length);

    if (recentRuns.length < 3) {
      setDigest(null);
      setDigestLoading(false);
      return;
    }

    let isSubscribed = true;
    const fetchDigest = async () => {
      setDigestLoading(true);
      setDigestError(null);
      try {
        const serializedRuns = recentRuns.map(run => ({
          id: run.id,
          module: run.module,
          specification: run.specification || '',
          results: run.results || {},
          notes: run.notes || '',
          interpretation: run.interpretation || '',
          timestamp: getRunDate(run).toISOString()
        }));

        const data = await callBackendAPI('/api/gemini/digest', { recentRuns: serializedRuns });
        if (!isSubscribed) return;

        if (data && (data.digest || data.response)) {
          setDigest(data.digest || data.response);
        } else {
          setDigestError('AI digest unavailable. Check your connection.');
        }
      } catch (err: any) {
        if (!isSubscribed) return;
        console.error('[AIDigest] Error creating research digest:', err);
        setDigestError('AI digest unavailable. Check your connection.');
      } finally {
        if (isSubscribed) {
          setDigestLoading(false);
        }
      }
    };

    fetchDigest();

    return () => {
      isSubscribed = false;
    };
  }, [user, modelRuns]);

  const handleRecalculate = async () => {
    if (!user) return;
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentRuns = modelRuns.filter(run => {
      const runDate = getRunDate(run);
      return runDate >= sevenDaysAgo;
    });

    setRecentRunsCount(recentRuns.length);

    if (recentRuns.length < 3) {
      setDigest(null);
      return;
    }

    setDigestLoading(true);
    setDigestError(null);
    try {
      const serializedRuns = recentRuns.map(run => ({
        id: run.id,
        module: run.module,
        specification: run.specification || '',
        results: run.results || {},
        notes: run.notes || '',
        interpretation: run.interpretation || '',
        timestamp: getRunDate(run).toISOString()
      }));

      const data = await callBackendAPI('/api/gemini/digest', { recentRuns: serializedRuns });
      if (data && (data.digest || data.response)) {
        setDigest(data.digest || data.response);
      } else {
        setDigestError('AI digest unavailable. Check your connection.');
      }
    } catch (err: any) {
      console.error('[AIDigest] Error recalculating research digest:', err);
      setDigestError('AI digest unavailable. Check your connection.');
    } finally {
      setDigestLoading(false);
    }
  };

  const handleUnpin = async (pinId: string) => {
    if (!user) return;
    try {
      const pinDocRef = doc(db, 'users', user.uid, 'pinnedResults', pinId);
      await deleteDoc(pinDocRef);
      onRefresh();
    } catch (err: any) {
      console.error('[AIDigest] Error deleting pin:', err);
    }
  };

  if (!user) {
    return (
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-8 text-center text-slate-500">
        Please sign in to view your research digest and pinned cards.
      </div>
    );
  }

  return (
    <div id="ai-digest-pinned-layout" className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      
      {/* LEFT COLUMN: AI Research Digest (60%) */}
      <div id="ai-research-digest-column" className="lg:col-span-3 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl">
              <Sparkles className="h-5 w-5" />
            </div>
            <h2 id="ai-digest-title" className="text-lg font-bold font-sans tracking-tight text-slate-900">
              Your Research This Week
            </h2>
          </div>

          <div id="ai-digest-content" className="min-h-[140px] flex flex-col justify-center">
            {digestLoading ? (
              <div className="flex flex-col items-center justify-center py-8">
                <Loader2 className="h-8 w-8 text-indigo-500 animate-spin mb-3" />
                <p className="text-xs text-slate-400 font-mono">Synthesizing weekly estimation logs...</p>
              </div>
            ) : digestError ? (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">
                <AlertCircle className="h-5 w-5 shrink-0" />
                <span>{digestError}</span>
              </div>
            ) : digest ? (
              <motion.div 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-sm text-slate-600 leading-relaxed space-y-3 whitespace-pre-wrap font-sans"
              >
                {digest}
              </motion.div>
            ) : (
              <div className="text-center py-6">
                <FileText className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                <p className="text-sm text-slate-500 font-medium max-w-sm mx-auto">
                  Run at least 3 models this week to generate your AI research digest.
                </p>
                <p className="text-xs text-slate-400 mt-2 font-mono">
                  Current week activity count: {recentRunsCount} / 3 models
                </p>
              </div>
            )}
          </div>
        </div>

        {digest && (
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
            <span className="text-[10px] text-slate-400 uppercase tracking-wider font-mono">
              Powered by gemini-3.5-flash
            </span>
            <button
              onClick={handleRecalculate}
              className="text-xs text-indigo-600 hover:text-indigo-700 font-semibold flex items-center gap-1 transition-colors"
            >
              Recalculate Synthesis
            </button>
          </div>
        )}
      </div>

      {/* RIGHT COLUMN: Pinned Results (40%) */}
      <div id="pinned-results-column" className="lg:col-span-2 bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm flex flex-col">
        <div className="flex items-center gap-2 mb-4">
          <div className="p-2 bg-amber-50 text-amber-600 rounded-xl">
            <Pin className="h-5 w-5" />
          </div>
          <h2 id="pinned-results-title" className="text-lg font-bold font-sans tracking-tight text-slate-900">
            Pinned Results
          </h2>
        </div>

        <div id="pinned-list-container" className="flex-1 flex flex-col justify-center min-h-[140px]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-8">
              <Loader2 className="h-6 w-6 text-amber-500 animate-spin mb-2" />
              <p className="text-xs text-slate-400 font-mono">Loading pins...</p>
            </div>
          ) : propError ? (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 text-red-700 p-4 rounded-xl text-sm">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span>{propError}</span>
            </div>
          ) : pinnedResults.length > 0 ? (
            <div className="space-y-3 overflow-y-auto max-h-[320px] pr-1">
              <AnimatePresence initial={false}>
                {pinnedResults.map((pin) => (
                  <motion.div
                    key={pin.id}
                    initial={{ opacity: 0, scale: 0.98 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={{ duration: 0.15 }}
                    className="group bg-slate-50/70 border border-slate-100 hover:border-amber-200/60 p-3.5 rounded-xl flex items-start justify-between gap-3 transition-colors hover:bg-slate-50"
                  >
                    <div className="space-y-1 select-none flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase font-mono font-bold tracking-wider px-2 py-0.5 rounded-full bg-slate-200/60 text-slate-600">
                          {pin.module}
                        </span>
                      </div>
                      <p className="text-xs font-semibold text-slate-800 line-clamp-1">
                        Dep. Variable: <span className="font-mono text-indigo-600">{pin.dependentVar}</span>
                      </p>
                      <p className="text-xs text-slate-500 font-mono line-clamp-2">
                        {pin.keyResult}
                      </p>
                    </div>

                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => onNavigate(pin.sessionId)}
                        title="Open context session"
                        className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:text-indigo-600 hover:border-indigo-200 rounded-lg shadow-sm transition-all flex items-center justify-center"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleUnpin(pin.id)}
                        title="Unpin result"
                        className="p-1.5 bg-white border border-slate-200 text-slate-600 hover:text-red-600 hover:border-red-200 rounded-lg shadow-sm transition-all flex items-center justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          ) : (
            <div className="text-center py-6">
              <Pin className="h-10 w-10 text-slate-300 mx-auto mb-3 rotate-45" />
              <p className="text-sm text-slate-500 font-medium max-w-[200px] mx-auto">
                Pin results from your Research Timeline to see them here.
              </p>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
