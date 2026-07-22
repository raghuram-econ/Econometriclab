import React, { useState, useEffect } from 'react';
import { PenTool, Send, GraduationCap, Sparkles, Star, ArrowUpRight, CheckCircle2, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import { gradeTeacherMode, TeacherFeedback } from '../../services/gemini';
import { useStore } from '../../store/useStore';

export default function TeacherMode() {
  const { addToast, teacherModeState, setTeacherModeState } = useStore();
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<TeacherFeedback | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { questionPrompt, studentAnswer, level, output } = teacherModeState;

  const setQuestionPrompt = (val: string) => setTeacherModeState({ questionPrompt: val });
  const setStudentAnswer = (val: string) => setTeacherModeState({ studentAnswer: val });
  const setLevel = (val: string) => setTeacherModeState({ level: val });

  // When output changes from state, we should parse it if it exists.
  // Actually, wait, feedback is an object of TeacherFeedback type.
  // Let's keep feedback as local state but hydrate it from `output` if possible, or just store feedback JSON as a string in `output` and parse it on load.
  useEffect(() => {
    if (output) {
      try {
        setFeedback(JSON.parse(output));
      } catch (e) {
        setFeedback(null);
      }
    } else {
      setFeedback(null);
    }
  }, [output]);

  const handleGrade = async () => {
    if (!questionPrompt.trim() || !studentAnswer.trim()) return;

    setLoading(true);
    setError(null);
    setFeedback(null);

    // Track activity in Dashboard
    trackActivity(questionPrompt);

    try {
      const result = await gradeTeacherMode(questionPrompt, studentAnswer, level);
      setFeedback(result);
      setTeacherModeState({ output: JSON.stringify(result) });
      if (result && result.verdict && result.verdict.startsWith('Review failed:')) {
        addToast('error', 'Evaluation Failed', 'The evaluation server is currently unavailable.');
      } else {
        addToast('success', 'Evaluation Complete', 'Your essay has been successfully evaluated with targeted coaching.');
      }
    } catch (e: any) {
      console.error(e);
      setError("Evaluation engine was unable to respond. Please check API credentials.");
      addToast('error', 'Evaluation Failed', 'Evaluation engine was unable to respond.');
    } finally {
      setLoading(false);
    }
  };

  const trackActivity = (qPrompt: string) => {
    try {
      const savedActivities = localStorage.getItem('economics_scholar_activity');
      let arr = savedActivities ? JSON.parse(savedActivities) : [];
      
      const newActivity = {
        id: 'act-' + Date.now(),
        topic: `Evaluated essay: "${qPrompt.length > 50 ? qPrompt.substring(0, 50) + '...' : qPrompt}"`,
        moduleName: "Teacher Mode",
        timestamp: "Just now",
        icon: "PenTool"
      };

      arr = [newActivity, ...arr].slice(0, 5);
      localStorage.setItem('economics_scholar_activity', JSON.stringify(arr));
    } catch (e) {
      // Fallback
    }
  };

  const loadPreset = (q: string, a: string) => {
    setQuestionPrompt(q);
    setStudentAnswer(a);
  };

  const presets = [
    {
      title: "Cobb-Douglas Euler Theorem",
      question: "Prove that under Cobb-Douglas production setting constant returns to scale conditions, total factor exhaustion occurs exactly (Euler's Theorem).",
      answer: "A Cobb-Douglas is Y = A * K^alpha * L^beta. If constant returns hold, then alpha + beta = 1. Euler theorem states that Y = (dY/dK)*K + (dY/dL)*L. If we take derivatives, dY/dK = A * alpha * K^(alpha-1) * L^beta. If we multiply by K, we get A * alpha * K^alpha * L^beta = alpha * Y. Similarly, dY/dL * L = beta * Y. Adding them, we get (alpha + beta)*Y. Since it is constant returns, alpha + beta = 1, so the sum is indeed Y. This proves Euler's theorem. However, this depends on pure competition where factors are paid their marginal product."
    },
    {
      title: "Solow Steady State",
      question: "Detail the determinants of the Steady State growth rate in a standard Solow model. What happens to output per worker if the saving rate shifts?",
      answer: "In the Solow model, output depends on capital, labor, and technology. Y = F(K, AL). In steady state, investment equals depreciation times capital. Sf(k) = (n + d + g)k. If the saving rate S rises, investment curve shifts up, so we reach a higher steady-state capital of k*. High savings rate increases output per worker dynamically during transition but doesn't change long-run steady state balance rate of growth, which remains determined only by exogenous tech growth g. Some people forget that savings only has a level effect, not a permanent growth effect."
    }
  ];

  const renderSkeletonLoader = () => (
    <div className="space-y-6">
      {/* Verdict section skeleton */}
      <div className="bg-gradient-to-br from-rose-50/50 to-orange-50/20 border border-rose-100/50 rounded-2xl p-5 space-y-3">
        <div className="h-4 w-32 bg-rose-200/50 rounded animate-pulse" />
        <div className="h-6 w-full bg-rose-100/50 rounded animate-pulse" />
        <div className="h-6 w-4/5 bg-rose-100/50 rounded animate-pulse" />
      </div>
      
      {/* Lists skeletons */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
        <div className="space-y-4">
          <div className="h-4 w-32 bg-emerald-100 rounded animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-2">
                <div className="h-2 w-2 rounded-full bg-slate-200 mt-2" />
                <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
        
        <div className="space-y-4">
          <div className="h-4 w-40 bg-rose-100 rounded animate-pulse" />
          <div className="space-y-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex gap-2">
                <div className="h-2 w-2 rounded-full bg-slate-200 mt-2" />
                <div className="h-4 w-full bg-slate-100 rounded animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div id="teacher-mode" className="max-w-5xl mx-auto px-4 py-8 space-y-8">
      
      {/* Header */}
      <div className="border-b border-slate-200 pb-5">
        <div className="flex items-center gap-2.5">
          <div className="h-9 w-9 bg-rose-50 rounded-lg text-rose-600 flex items-center justify-center">
            <PenTool className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-slate-800">Teacher Mode: Supportive Essay Evaluator</h2>
            <p className="text-xs text-slate-400">Receive strict supportive feedback on your mock essays for MA, UGC-NET, or CUET PG questions.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Essay submission column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            
            {/* Target Level */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                Exam Benchmark Level
              </label>
              <select 
                value={level} 
                onChange={(e) => setLevel(e.target.value)}
                className="w-full text-xs bg-slate-50 border border-slate-200 hover:border-slate-300 rounded-xl p-3 outline-none text-slate-800"
              >
                <option value="MA / UGC-NET">MA Economics (UGC-NET standard)</option>
                <option value="CUET PG Economics">CUET PG Economics (Competitive standard)</option>
                <option value="Advanced Doctoral (PhD)">Advanced Micro/Macro Theory (PhD level)</option>
              </select>
            </div>

            {/* Question prompt */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                Exam Question Prompt
              </label>
              <textarea 
                value={questionPrompt}
                onChange={(e) => setQuestionPrompt(e.target.value)}
                placeholder="Paste the mock question or exam topic here..."
                className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-rose-500 focus:bg-white rounded-xl p-3 outline-none text-slate-800 leading-normal min-h-[90px]"
                disabled={loading}
              />
            </div>

            {/* Student Answer */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
                Your Written Answer
              </label>
              <textarea 
                value={studentAnswer}
                onChange={(e) => setStudentAnswer(e.target.value)}
                placeholder="Type or paste your drafted paragraphs here. Include definitions, assumptions, and core rationale..."
                className="w-full text-xs bg-slate-50 border border-slate-200 focus:border-rose-500 focus:bg-white rounded-xl p-3 outline-none text-slate-800 leading-relaxed min-h-[200px]"
                disabled={loading}
              />
            </div>

            <button 
              onClick={handleGrade}
              disabled={loading || !questionPrompt.trim() || !studentAnswer.trim()}
              className="w-full bg-rose-600 hover:bg-rose-500 disabled:opacity-45 text-white font-bold py-3.5 rounded-xl transition shadow-lg shadow-rose-100 uppercase tracking-wider text-xs flex items-center justify-center gap-2 select-none cursor-pointer"
            >
              {loading ? (
                <>
                  <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                  Analyzing Essay Arguments...
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  Submit and Grade Essay
                </>
              )}
            </button>
          </div>

          {/* Preset templates */}
          <div className="bg-slate-50/50 border border-slate-200/60 rounded-2xl p-5">
            <h4 className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2.5">Mock Essay Presets</h4>
            <div className="space-y-2">
              {presets.map((pre, idx) => (
                <button 
                  key={idx}
                  onClick={() => loadPreset(pre.question, pre.answer)}
                  disabled={loading}
                  className="w-full bg-white border border-slate-100 hover:border-rose-200 p-2.5 rounded-xl text-left text-[11px] hover:text-rose-700 font-sans block leading-normal shadow-sm cursor-pointer"
                >
                  <span className="font-bold text-slate-700 block mb-0.5">{pre.title}</span>
                  {pre.question.substring(0, 50)}...
                </button>
              ))}
            </div>
          </div>

        </div>

        {/* Feedback results column */}
        <div className="lg:col-span-7">
          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm min-h-[460px] flex flex-col justify-between overflow-hidden">
            
            <div className="p-8 pb-10 overflow-y-auto space-y-6 flex-1 bg-slate-50/10">
              
              {!feedback && !loading && !error && (
                <div className="text-center py-20 max-w-sm mx-auto space-y-4">
                  <div className="mx-auto h-12 w-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                    <PenTool className="h-6 w-6" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">Supportive Cohort Active</h3>
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Once you draft your prompt and response, submit it. The Economics Professor will analyze your definitions, math consistency, and provide structural upgrades to score maximum marks.
                  </p>
                </div>
              )}

              {loading && (
                <div className="py-8">
                  <div className="flex items-center gap-3 mb-8">
                    <Sparkles className="w-5 h-5 text-rose-500 animate-pulse" />
                    <span className="text-xs font-bold text-rose-700 uppercase tracking-widest font-mono">
                      AI is grading...
                    </span>
                  </div>
                  {renderSkeletonLoader()}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-xl flex items-start gap-3 text-red-800 text-xs text-left max-w-md mx-auto">
                  <AlertCircle className="h-5 w-5 shrink-0 text-red-500 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5">Evaluation Error:</span>
                    {error} Verify GEMINI_API_KEY environment credentials and retry.
                  </div>
                </div>
              )}

              {feedback && !loading && (
                <div className="space-y-6 animate-fadeIn">
                  
                  {/* Verdict Card */}
                  <div className="bg-gradient-to-br from-rose-50 to-orange-50/50 border border-rose-100 rounded-2xl p-5 shadow-sm">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-rose-800 uppercase tracking-wider">
                      <Star className="h-4 w-4 fill-rose-500 text-rose-500" />
                      overall verdict
                    </div>
                    <p className="text-sm text-rose-950 mt-2 font-medium leading-relaxed italic">
                      "{feedback.verdict}"
                    </p>
                    <div className="text-[10px] text-rose-700/80 mt-3 font-mono">
                      Benchmarked Level: {level}
                    </div>
                  </div>

                  {/* Strengths (3-6 items) */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Strengths Found ({(feedback.strengths || []).length})
                    </h3>
                    <div className="space-y-1.5">
                      {(feedback.strengths || []).map((str, idx) => (
                        <div key={idx} className="flex gap-2.5 items-start p-3 bg-emerald-50/20 border border-emerald-100/50 rounded-xl text-xs text-slate-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 mt-1.5" />
                          <span className="leading-relaxed">{str}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Improvements Needed (3-6 items) */}
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                      <ArrowUpRight className="h-4 w-4 text-rose-600" />
                      Improvements Advised ({(feedback.improvements || []).length})
                    </h3>
                    <div className="space-y-1.5">
                      {(feedback.improvements || []).map((imp, idx) => (
                        <div key={idx} className="flex gap-2.5 items-start p-3 bg-rose-50/10 border border-rose-100/40 rounded-xl text-xs text-slate-800">
                          <span className="h-1.5 w-1.5 rounded-full bg-rose-600 mt-1.5" />
                          <span className="leading-relaxed">{imp}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Model Answers Snippets */}
                  {feedback.modelAnswerSnippets && feedback.modelAnswerSnippets.length > 0 && (
                    <div className="space-y-2.5">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                        <Star className="h-4 w-4 text-amber-500 fill-amber-500" />
                        Model Answer snippets
                      </h3>
                      <div className="space-y-2.5">
                        {feedback.modelAnswerSnippets.map((snip, idx) => (
                          <div key={idx} className="p-4 bg-slate-900 border border-slate-800 rounded-xl font-mono text-xs text-slate-300 leading-normal">
                            <span className="text-emerald-400 block mb-1 font-bold text-[10px] uppercase">Scoring-perfect phrasing:</span>
                            {snip}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              )}

            </div>

          </div>
        </div>

      </div>

    </div>
  );
}
