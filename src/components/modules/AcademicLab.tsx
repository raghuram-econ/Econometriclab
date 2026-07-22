import React, { useState, useEffect } from 'react';
import { 
  Sparkles, 
  BookOpen, 
  Layers, 
  HelpCircle, 
  AlertTriangle, 
  FileText, 
  Loader2, 
  AlertCircle, 
  Copy, 
  Check,
  RefreshCw
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { synthesizeAcademicLab } from '../../services/gemini';
import { useStore } from '../../store/useStore';
import { cn, copyTextToClipboard } from '../../lib/utils';

interface AcademicLabProps {
  initialQuestion?: string;
  onClearInitialQuestion?: () => void;
}

export default function AcademicLab({ initialQuestion, onClearInitialQuestion }: AcademicLabProps) {
  const { addToast, academicLabState, setAcademicLabState } = useStore();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const { topicOrUnit, mode, output } = academicLabState;

  const setTopicOrUnit = (val: string) => setAcademicLabState({ topicOrUnit: val });
  const setMode = (val: string) => setAcademicLabState({ mode: val });
  const setOutput = (val: string | null) => setAcademicLabState({ output: val });

  // Handle inputs from dashboard clicks
  useEffect(() => {
    if (initialQuestion) {
      setTopicOrUnit(initialQuestion);
      // We could also auto-synthesize if we want
      if (onClearInitialQuestion) {
        onClearInitialQuestion();
      }
    }
  }, [initialQuestion]);

  const synthModes = [
    { id: 'Topic Overview', label: 'Topic Overview', description: 'Deep structural definitions, formula representations & Indian relevance', icon: BookOpen },
    { id: 'Compare & Contrast', label: 'Compare & Contrast', description: 'Side-by-side matrices contrasting leading economic paradigms', icon: Layers },
    { id: 'Past Question Style Answer', label: 'Past Question Answer', description: 'A model 12-15 mark exam response with introductory and body layout', icon: HelpCircle },
    { id: 'Assumption Stress Test', label: 'Assumption Stress Test', description: 'Analyze failures or decay when core theoretical axioms are relaxed', icon: AlertTriangle },
    { id: 'Policy Memo', label: 'Policy Memo', description: 'Brief policy memo formulated for RBI, NITI Aayog or Ministry of Finance', icon: FileText }
  ];

  const handleSynthesize = async () => {
    if (!topicOrUnit.trim()) return;

    setLoading(true);
    setError(null);
    setOutput(null);

    // Track activity in Dashboard
    trackActivity(topicOrUnit, `Academic Lab [${mode}]`);

    try {
      const response = await synthesizeAcademicLab(topicOrUnit, mode);
      setOutput(response);
      addToast('success', 'Topic Synthesis Complete', `Academic synthesis generated for ${mode}.`);
    } catch (e: any) {
      console.error(e);
      setError("Failed to generate topic synthesis. Check connection settings.");
      addToast('error', 'Topic Synthesis Failed', 'Failed to connect to the synthesis engine.');
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
        icon: "Sparkles"
      };

      arr = [newActivity, ...arr].slice(0, 5);
      localStorage.setItem('economics_scholar_activity', JSON.stringify(arr));
    } catch (e) {
      // ignore
    }
  };

  const handleCopy = () => {
    if (!output) return;
    copyTextToClipboard(output).then(success => {
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    });
  };

  return (
    <div id="academic-lab" className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-500">
      
      {/* Header */}
      <div className="border-b border-stone-200 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 bg-blue-50 rounded-lg text-blue-600 flex items-center justify-center">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-stone-800">Academic Lab: Topic Synthesis</h2>
            <p className="text-xs text-stone-400">Deep theoretical integration, exam-style answers, and policy analysis for Economics students.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Controls Column */}
        <div className="lg:col-span-4 space-y-6">
          <div className="card-premium p-5 bg-white space-y-5">
            <div>
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-2">
                Topic or Syllabus Clause
              </label>
              <textarea 
                value={topicOrUnit}
                onChange={(e) => setTopicOrUnit(e.target.value)}
                placeholder="e.g., IS-LM model and monetary policy transmission in India..."
                className="w-full text-sm bg-stone-50 border border-stone-200 focus:border-stone-400 focus:bg-white rounded-xl p-3 outline-none text-stone-800 leading-normal min-h-[100px] shadow-inner"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-xs font-bold text-stone-700 uppercase tracking-wide mb-2">
                Synthesis Mode
              </label>
              <div className="space-y-2">
                {synthModes.map((m) => {
                  const Icon = m.icon;
                  return (
                    <button
                      key={m.id}
                      onClick={() => setMode(m.id)}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all space-y-1",
                        mode === m.id 
                          ? "border-stone-800 bg-stone-900 text-white shadow-md" 
                          : "border-stone-100 hover:bg-stone-50 text-stone-600"
                      )}
                    >
                      <div className="flex items-center gap-2 font-bold text-xs">
                        <Icon className="w-3.5 h-3.5" />
                        {m.label}
                      </div>
                      <p className={cn("text-[10px] leading-snug font-serif italic", mode === m.id ? "text-stone-300" : "text-stone-400")}>
                        {m.description}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            <button
              onClick={handleSynthesize}
              disabled={loading || !topicOrUnit.trim()}
              className="w-full bg-[#1B2E41] hover:bg-[#243D54] disabled:opacity-50 text-white font-bold py-3.5 rounded-xl transition shadow-lg uppercase tracking-wider text-xs flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Synthesizing Corpus...
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5" />
                  Run Synthesis
                </>
              )}
            </button>
          </div>
        </div>

        {/* Output Column */}
        <div className="lg:col-span-8">
          <div className="bg-white border border-stone-200 rounded-2xl shadow-sm min-h-[500px] flex flex-col overflow-hidden">
            <div className="p-8 overflow-y-auto space-y-6 flex-1 bg-stone-50/10">
              
              {!output && !loading && !error && (
                <div className="text-center py-24 max-w-sm mx-auto space-y-4">
                  <div className="mx-auto h-12 w-12 rounded-full bg-stone-100 flex items-center justify-center text-stone-400">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-stone-800">Academic Synthesis Ready</h3>
                  <p className="text-xs text-stone-500 leading-relaxed font-serif italic">
                    Select a topic and mode to generate structured economic reviews, exam-style answers, or policy memos.
                  </p>
                </div>
              )}

              {loading && (
                <div className="py-20 text-center space-y-4">
                  <Loader2 className="w-10 h-10 animate-spin text-stone-400 mx-auto" />
                  <div className="text-xs font-bold text-stone-600 uppercase tracking-widest font-mono">
                    Synthesizing {mode}...
                  </div>
                  <p className="text-[11px] text-stone-400 font-serif italic">
                    Connecting theoretical frameworks with empirical context...
                  </p>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-3 text-red-800 text-xs text-left max-w-md mx-auto">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5">Synthesis Error:</span>
                    {error}
                  </div>
                </div>
              )}

              {output && !loading && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                  <div className="flex justify-between items-center border-b border-stone-100 pb-4">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-stone-400 bg-stone-100 px-2.5 py-1 rounded">
                      {mode} Result
                    </span>
                    <button
                      onClick={handleCopy}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-stone-200 hover:bg-stone-50 rounded-lg text-stone-600 font-bold uppercase tracking-wider transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="markdown-body font-serif text-sm text-stone-800 leading-relaxed text-justify">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{output}</ReactMarkdown>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
