// ============================================================
// src/components/modules/LabPartner.tsx
// Workspace-aware AI Lab Partner: reviews the current dataset
// and analysis history stored in the session.
// ============================================================

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Send, Bot, AlertCircle, Loader2, Info, Sparkles, Wrench, TriangleAlert
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../../store/useStore';
import { askLabPartner, WorkspaceContext, WorkspaceRunSummary } from '../../services/gemini';
import { cn } from '../../lib/utils';
import { sanitizeMath } from '../../lib/sanitizeMath';

const SUGGESTED_PROMPTS = [
  'Summarize my analyses',
  'Any issues in my results?',
  'What patterns do you see across my datasets?'
];

function buildWorkspaceContext(currentDataset: any, history: any[]): WorkspaceContext {
  const dataset = currentDataset
    ? {
        name: currentDataset.name,
        structure: currentDataset.structure,
        rowCount: currentDataset.rowCount,
        colCount: currentDataset.colCount,
        variables: (currentDataset.variables || []).map((v: any) => v.name),
      }
    : null;

  const runs: WorkspaceRunSummary[] = history.map((h) => {
    const r = h.results || {};
    const vifValues = r.vifs ? Object.values(r.vifs).filter((v: any) => typeof v === 'number') as number[] : [];
    return {
      module: h.module,
      specification: h.specification,
      timestamp: h.timestamp,
      n: r.n,
      rSquared: r.rSquared,
      adjRSquared: r.adjRSquared,
      isRobust: r.isRobust,
      breuschPaganPValue: r.breuschPaganPValue,
      jarqueBeraPValue: r.jarqueBeraPValue,
      durbinWatson: r.durbinWatson,
      maxVif: vifValues.length > 0 ? Math.max(...vifValues) : undefined,
    };
  });

  return { dataset, runs };
}

interface FixableIssue {
  historyId: string;
  specification: string;
  yVar: string;
  xVars: string[];
  issue: 'heteroscedasticity' | 'skewed_dependent';
  detail: string;
}

// Parses "wage ~ educ + exper (OLS)" into { yVar: 'wage', xVars: ['educ', 'exper'] },
// mirroring the split used in App.tsx's handleRestoreModel.
function parseSpecification(specification: string): { yVar: string; xVars: string[] } | null {
  const parts = specification.split('~');
  if (parts.length !== 2) return null;
  const yVar = (parts[0] || '').trim();
  const xVars = (parts[1] || '')
    .replace(/\(.*\)$/, '')
    .split('+')
    .map((x) => x.trim())
    .filter(Boolean);
  if (!yVar || xVars.length === 0) return null;
  return { yVar, xVars };
}

function detectFixableIssues(history: any[]): FixableIssue[] {
  const issues: FixableIssue[] = [];

  history.forEach((h) => {
    if (h.module !== 'OLS') return;
    const parsed = parseSpecification(h.specification || '');
    if (!parsed) return;
    const r = h.results || {};

    if (r.breuschPaganPValue !== undefined && r.breuschPaganPValue < 0.05 && !r.isRobust) {
      issues.push({
        historyId: h.id,
        specification: h.specification,
        yVar: parsed.yVar,
        xVars: parsed.xVars,
        issue: 'heteroscedasticity',
        detail: `Breusch-Pagan p = ${r.breuschPaganPValue.toFixed(4)} (robust SE not enabled)`,
      });
    }

    if (r.jarqueBeraPValue !== undefined && r.jarqueBeraPValue < 0.05) {
      issues.push({
        historyId: h.id,
        specification: h.specification,
        yVar: parsed.yVar,
        xVars: parsed.xVars,
        issue: 'skewed_dependent',
        detail: `Jarque-Bera p = ${r.jarqueBeraPValue.toFixed(4)} (residuals look non-normal)`,
      });
    }
  });

  return issues;
}

export default function LabPartner() {
  const {
    addToast,
    labPartnerMessages: messages,
    setLabPartnerMessages: setMessages,
    currentDataset,
    history,
    applyOlsFix
  } = useStore();
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fixableIssues = useMemo(() => detectFixableIssues(history), [history]);

  const handleApplyFix = (fix: FixableIssue) => {
    applyOlsFix({
      yVar: fix.yVar,
      xVars: fix.xVars,
      logTransform: fix.issue === 'skewed_dependent',
    });
    addToast(
      'info',
      'Applying Fix',
      fix.issue === 'heteroscedasticity'
        ? 'Switching to robust standard errors and re-running...'
        : `Log-transforming ${fix.yVar} and re-running...`
    );
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const handleAskQuestion = async (userText: string) => {
    if (!userText.trim()) return;

    setError(null);
    setLoading(true);

    const updatedMessages = [...messages, { role: 'user' as const, text: userText }];
    setMessages(updatedMessages);
    setInputMessage('');

    try {
      const chatHistory = messages
        .filter((m) => m.text !== (messages[0]?.text || ''))
        .map((m) => ({
          role: m.role === 'user' ? 'user' : 'model',
          text: m.text
        }));

      const workspaceContext = buildWorkspaceContext(currentDataset, history);
      const responseText = await askLabPartner(userText, chatHistory, workspaceContext);
      setMessages([...updatedMessages, { role: 'assistant' as const, text: responseText }]);
    } catch (e: any) {
      console.error(e);
      setError('Unable to reach Lab Partner. Check backend API logs.');
      addToast('error', 'Lab Partner Error', 'Unable to reach Lab Partner.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div id="lab-partner" className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-500">

      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 bg-indigo-50 rounded-lg text-indigo-600 flex items-center justify-center">
            <Bot className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-800">Lab Partner</h2>
            <p className="text-xs text-stone-400">Ask about your current dataset and the analyses you've run this session.</p>
          </div>
        </div>
      </div>

      {/* Fixable Issues (grounded in stored diagnostics, not AI prose) */}
      {fixableIssues.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-widest text-stone-500 flex items-center gap-2">
            <TriangleAlert className="w-3.5 h-3.5 text-amber-500" />
            Detected Issues in Your OLS Runs
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fixableIssues.map((fix, idx) => (
              <div key={`${fix.historyId}-${fix.issue}-${idx}`} className="p-4 bg-amber-50 border border-amber-200 rounded-2xl space-y-2">
                <div className="text-[10px] font-bold text-amber-800 uppercase tracking-wider font-mono">{fix.specification}</div>
                <div className="text-xs text-amber-900 font-serif leading-relaxed">{fix.detail}</div>
                <button
                  onClick={() => handleApplyFix(fix)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[11px] font-bold transition-all shadow-sm cursor-pointer"
                >
                  <Wrench className="w-3 h-3" />
                  {fix.issue === 'heteroscedasticity' ? 'Apply Robust SE' : `Log-Transform ${fix.yVar}`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3 card-premium bg-white p-6 h-[600px] flex flex-col justify-between shadow-sm border border-stone-200">
          {/* Messages Canvas */}
          <div className="flex-1 overflow-y-auto space-y-4 pr-2 scrollbar-thin">
            {messages.map((m, idx) => (
              <div
                key={idx}
                className={cn(
                  "p-4 rounded-2xl max-w-2xl font-serif text-sm leading-relaxed",
                  m.role === 'user'
                    ? "bg-stone-100 text-stone-800 ml-auto rounded-tr-none text-right"
                    : "bg-indigo-50/30 text-stone-900 border border-indigo-100/50 rounded-tl-none"
                )}
              >
                <div className="flex items-center gap-2 mb-1 opacity-70 text-[10px] font-sans font-bold uppercase tracking-widest">
                  {m.role === 'user' ? 'You' : 'Lab Partner'}
                </div>
                <div className="markdown-body font-serif text-justify">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitizeMath(m.text)}</ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && (
              <div className="bg-indigo-50/30 text-stone-900 border border-indigo-100/50 rounded-2xl rounded-tl-none p-4 max-w-xl flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span className="text-xs font-serif italic text-stone-500">Lab Partner is reviewing your workspace...</span>
              </div>
            )}
            {error && (
              <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-xl flex gap-2 text-xs">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Suggested Prompts */}
          {messages.length <= 1 && (
            <div className="flex flex-wrap gap-2 pb-4">
              {SUGGESTED_PROMPTS.map((p) => (
                <button
                  key={p}
                  onClick={() => handleAskQuestion(p)}
                  className="px-3 py-1.5 bg-stone-50 border border-stone-200 hover:border-stone-400 hover:bg-stone-100 rounded-lg text-xs font-bold text-stone-600 transition-all shadow-sm cursor-pointer"
                >
                  {p}
                </button>
              ))}
            </div>
          )}

          {/* Input Field */}
          <div className="border-t border-stone-100 pt-4 mt-4 flex gap-3">
            <input
              type="text"
              placeholder="Ask about your datasets or analysis history..."
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAskQuestion(inputMessage)}
              className="flex-1 bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 text-sm outline-none focus:bg-white focus:ring-4 focus:ring-stone-500/5 transition-all shadow-inner"
            />
            <button
              onClick={() => handleAskQuestion(inputMessage)}
              disabled={loading || !inputMessage.trim()}
              className="bg-[#1B2E41] hover:bg-[#243D54] disabled:opacity-50 text-white px-5 rounded-xl transition-all flex items-center justify-center shrink-0"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          <div className="card-premium p-5 bg-white border border-stone-200 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 border-b border-stone-100 pb-2 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-stone-400" />
              What Lab Partner Can See
            </h3>
            <p className="text-[11px] text-stone-500 font-serif leading-relaxed">
              Lab Partner only has access to your current dataset's name, shape, and variable list, plus the specification and computed diagnostics (R², Breusch-Pagan, Jarque-Bera, VIF, etc.) of every model you've run this session. It does not see raw data rows, and it will not invent numbers that aren't in your results.
            </p>
            <div className="space-y-1.5 text-[10px] font-mono text-stone-600 font-bold uppercase tracking-tight">
              <div>• Dataset shape & variables</div>
              <div>• Model specifications</div>
              <div>• Fit statistics & diagnostics</div>
            </div>
          </div>

          <div className="card-premium p-5 bg-[#1B2E41] text-white space-y-3">
            <div className="flex gap-2 items-center">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Tip</h4>
            </div>
            <p className="text-[10px] text-slate-300 font-serif leading-relaxed italic">
              Run a few models first, then ask "Any issues in my results?" — Lab Partner will cite the specific diagnostic that triggered the flag.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
