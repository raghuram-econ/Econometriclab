// ============================================================
// src/components/modules/ProfessorDesk.tsx
// Dedicated AI Professor Desk: Rigorous Economics Q&A
// ============================================================

import React, { useState, useEffect, useRef } from 'react';
import { 
  Send, GraduationCap, AlertCircle, RefreshCw,
  Search, Target, Loader2, Info
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../../store/useStore';
import { askProfessorDesk } from '../../services/gemini';
import { cn } from '../../lib/utils';
import { sanitizeMath } from '../../lib/sanitizeMath';

interface Message {
  role: 'user' | 'professor';
  text: string;
}

interface ProfessorDeskProps {
  initialQuestion?: string;
  initialMode?: string;
  onClearInitialQuestion?: () => void;
}

export default function ProfessorDesk({ initialQuestion, onClearInitialQuestion }: ProfessorDeskProps) {
  const { addToast, professorDeskMessages: messages, setProfessorDeskMessages: setMessages } = useStore();
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Scroll Q&A to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Handle inputs from dashboard clicks
  useEffect(() => {
    if (initialQuestion) {
      handleAskQuestion(initialQuestion);
      if (onClearInitialQuestion) {
        onClearInitialQuestion();
      }
    }
  }, [initialQuestion]);

  const handleAskQuestion = async (userText: string) => {
    if (!userText.trim()) return;

    setError(null);
    setLoading(true);

    const updatedMessages = [...messages, { role: 'user' as const, text: userText }];
    setMessages(updatedMessages);
    setInputMessage('');

    trackActivity(userText, "Professor Desk");

    try {
      const chatHistory = messages
        .filter(m => m.text !== (messages[0]?.text || ''))
        .map(m => ({
          role: m.role === 'user' ? 'user' : 'model',
          text: m.text
        }));

      const responseText = await askProfessorDesk(userText, chatHistory);
      setMessages([...updatedMessages, { role: 'professor' as const, text: responseText }]);
      addToast('success', 'Professor Response Received', 'The Professor has formulated a rigorous economic review.');
    } catch (e: any) {
      console.error(e);
      setError("Unable to reach the Professor. Check backend API logs.");
      addToast('error', 'Academic Resource Error', 'Unable to reach the Professor.');
    } finally {
      setLoading(false);
    }
  };

  const trackActivity = (topicText: string, mLabel: string) => {
    try {
      const savedActivities = localStorage.getItem('economics_scholar_activity');
      let arr = savedActivities ? JSON.parse(savedActivities) : [];
      
      const newActivity = {
        id: 'act-' + Date.now(),
        topic: topicText.length > 70 ? topicText.substring(0, 70) + '...' : topicText,
        moduleName: mLabel,
        timestamp: "Just now",
        icon: "GraduationCap"
      };

      arr = [newActivity, ...arr].slice(0, 5);
      localStorage.setItem('economics_scholar_activity', JSON.stringify(arr));
    } catch (e) {
      // ignore
    }
  };

  return (
    <div id="professor-desk" className="max-w-5xl mx-auto px-4 py-8 space-y-6 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 bg-emerald-50 rounded-lg text-emerald-600 flex items-center justify-center">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-800">Professor Desk: Economics Tutor</h2>
            <p className="text-xs text-stone-400">Rigorous conceptual guidance and theoretical proofs from your Economics Professor.</p>
          </div>
        </div>
      </div>

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
                    : "bg-emerald-50/30 text-stone-900 border border-emerald-100/50 rounded-tl-none"
                )}
              >
                <div className="flex items-center gap-2 mb-1 opacity-70 text-[10px] font-sans font-bold uppercase tracking-widest">
                  {m.role === 'user' ? 'Scholar' : 'Professor'}
                </div>
                <div className="markdown-body font-serif text-justify">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{sanitizeMath(m.text)}</ReactMarkdown>
                </div>
              </div>
            ))}
            {loading && (
              <div className="bg-emerald-50/30 text-stone-900 border border-emerald-100/50 rounded-2xl rounded-tl-none p-4 max-w-xl flex items-center gap-3">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
                <span className="text-xs font-serif italic text-stone-500">The Professor is formulating feedback...</span>
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

          {/* Input Field */}
          <div className="border-t border-stone-100 pt-4 mt-4 flex gap-3">
            <input 
              type="text"
              placeholder="Ask any core Economics question (e.g. Lucas critique, Solow residuals, Indian inflation)..."
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

        {/* Sidebar Guidelines */}
        <div className="space-y-6">
          <div className="card-premium p-5 bg-white border border-stone-200 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 border-b border-stone-100 pb-2 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-stone-400" />
              Academic Scope
            </h3>
            <p className="text-[11px] text-stone-500 font-serif leading-relaxed">
              The Professor Desk is strictly dedicated to the 10 units of Economics theory. The Professor will politely decline non-economics queries.
            </p>
            <div className="space-y-1.5 text-[10px] font-mono text-stone-600 font-bold uppercase tracking-tight">
              <div>• Advanced Micro & Macro</div>
              <div>• Mathematical Methods</div>
              <div>• Stats & Econometrics</div>
              <div>• Indian Economy Analysis</div>
              <div>• Growth & Development</div>
            </div>
          </div>

          <div className="card-premium p-5 bg-[#1B2E41] text-white space-y-3">
            <div className="flex gap-2 items-center">
              <Target className="w-4 h-4 text-emerald-400" />
              <h4 className="text-xs font-bold uppercase tracking-wider">Rigorous Thinking</h4>
            </div>
            <p className="text-[10px] text-slate-300 font-serif leading-relaxed italic">
              "To think like an economist is to understand the interplay of constraints, incentives, and structural equilibrium."
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
