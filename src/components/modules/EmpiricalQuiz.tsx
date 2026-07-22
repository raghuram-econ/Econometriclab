import React, { useState } from 'react';
import { 
  BrainCircuit, 
  CheckCircle2, 
  XCircle, 
  Trophy, 
  RefreshCcw, 
  HelpCircle, 
  Sparkles, 
  Layers, 
  Book, 
  Clock, 
  ChevronRight, 
  Loader2,
  AlertCircle
} from 'lucide-react';
import { cn } from '../../lib/utils';
import { useStore } from '../../store/useStore';
import { generateQuiz, QuizQuestion } from '../../services/gemini';
import { CONCEPTS as LIBRARY_CONCEPTS } from '../../lib/concepts';

const DEFAULT_QUIZZES: QuizQuestion[] = [
  {
    question: "Which of the following violates the Gauss-Markov assumption of 'No Perfect Multicollinearity'?",
    options: [
      "Including both Age and Age-squared as regressors.",
      "Including both Height in inches and Height in centimeters in the same regression.",
      "Having more observations than independent variables.",
      "The error terms being correlated with the dependent variable."
    ],
    correct: 1,
    explanation: "Perfect multicollinearity occurs when one independent variable is a linear function of another. Since cm = inches * 2.54, their relationship is perfectly linear, making it impossible for OLS to distinguish their partial effects.",
    difficulty: 'beginner',
    topic: 'Gauss-Markov'
  },
  {
    question: "In a Fixed Effects model, what happens to variables that are constant over time within an entity (e.g., a person's birthplace)?",
    options: [
      "Their coefficients are estimated normally but with higher standard errors.",
      "They are automatically dropped because they are perfectly collinear with the fixed effects.",
      "They are used as instruments for the time-varying variables.",
      "They help reduce heteroskedasticity in the residuals."
    ],
    correct: 1,
    explanation: "Fixed effects control for all time-invariant heterogeneity. Since these variables don't change within entities, the within-transformation removes them along with the fixed effects themselves.",
    difficulty: 'intermediate',
    topic: 'Fixed Effects'
  },
  {
    question: "When is Omitted Variable Bias (OVB) non-zero?",
    options: [
      "When the omitted variable is correlated with the dependent variable only.",
      "When the omitted variable is correlated with an included regressor only.",
      "When the omitted variable is correlated with BOTH an included regressor and the dependent variable.",
      "When the sample size is smaller than 30."
    ],
    correct: 2,
    explanation: "OVB = β_omitted * corr(X_included, X_omitted). For the bias to be present, the omitted variable must impact Y (β_omitted != 0) AND be related to our regressor X.",
    difficulty: 'intermediate',
    topic: 'OVB'
  }
];

const MODULES = [
  { id: 'ols', name: 'OLS Regression', icon: Book },
  { id: 'fe', name: 'Fixed Effects', icon: Layers },
  { id: 'arima', name: 'ARIMA Forecasting', icon: Clock },
  { id: 'causal', name: 'Causality (IV/DiD)', icon: Sparkles },
  { id: 'prob', name: 'Probability Models', icon: BrainCircuit }
];

const CONCEPTS = LIBRARY_CONCEPTS.map(c => c.title);

type QuizMode = 'select' | 'generating' | 'active' | 'finished';

export function EmpiricalQuiz() {
  const { history, activeModule, researchQuestion } = useStore();
  
  const [mode, setMode] = useState<QuizMode>('select');
  const [quizzes, setQuizzes] = useState<QuizQuestion[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);
  const [score, setScore] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [quizDetails, setQuizDetails] = useState<{ type: string, value: string } | null>(null);

  const startDynamicQuiz = async (type: 'module' | 'concept' | 'model', value: string) => {
    setMode('generating');
    setError(null);
    setQuizDetails({ type, value });
    
    try {
      let modelContext = null;
      if (type === 'model' && history && history.length > 0) {
        modelContext = history[0];
      }

      const generated = await generateQuiz(type, value, modelContext);
      if (!generated || generated.length === 0) throw new Error("No questions generated");
      
      setQuizzes(generated);
      setCurrentIdx(0);
      setScore(0);
      setSelectedOption(null);
      setShowExplanation(false);
      setMode('active');
    } catch (err: any) {
      console.error("Quiz generation failed:", err);
      setError("AI generation paused due to quota or connection limits. Starting with structural foundations instead.");
      setQuizzes(DEFAULT_QUIZZES);
      setMode('active');
    }
  };

  const handleSelect = (idx: number) => {
    if (selectedOption !== null) return;
    setSelectedOption(idx);
    const currentQuiz = quizzes[currentIdx];
    if (currentQuiz && idx === currentQuiz.correct) setScore(s => s + 1);
    setShowExplanation(true);
  };

  const next = () => {
    if (currentIdx < quizzes.length - 1) {
      setCurrentIdx(i => i + 1);
      setSelectedOption(null);
      setShowExplanation(false);
    } else {
      setMode('finished');
    }
  };

  const reset = () => {
    setMode('select');
    setQuizzes([]);
    setScore(0);
    setError(null);
    setQuizDetails(null);
  };

  const quiz = quizzes[currentIdx];

  if (mode === 'select') {
    return (
      <div className="max-w-4xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-blue-100 rounded-2xl">
                <BrainCircuit className="w-6 h-6 text-blue-600" />
             </div>
             <div>
                <h2 className="text-3xl font-bold tracking-tight text-slate-900">Empirical Workshop Quiz</h2>
                <p className="text-slate-500 font-serif italic">Test your mastery of structural assumptions and estimation logic.</p>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
           {/* Section 1: Dynamic Gen */}
           <div className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Dynamic AI Generation</h3>
              
              <div className="space-y-4">
                 <button 
                  onClick={() => startDynamicQuiz('module', activeModule)}
                  className="w-full card-premium p-6 text-left group hover:border-blue-300 transition-all bg-white"
                 >
                    <div className="flex items-center justify-between mb-4">
                       <Layers className="w-5 h-5 text-blue-600" />
                       <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <h4 className="font-bold text-slate-900 uppercase tracking-tight text-xs mb-1">Generate from Current Module</h4>
                    <p className="text-[11px] text-slate-400 font-serif italic">Build a test focused on {activeModule.toUpperCase()} foundations.</p>
                 </button>

                 <button 
                  onClick={() => startDynamicQuiz('model', activeModule)}
                  disabled={history.length === 0}
                  className={cn(
                    "w-full card-premium p-6 text-left group transition-all",
                    history.length > 0 ? "hover:border-emerald-300 bg-white" : "opacity-50 cursor-not-allowed bg-slate-50"
                  )}
                 >
                    <div className="flex items-center justify-between mb-4">
                       <Sparkles className="w-5 h-5 text-emerald-600" />
                       <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-500 transition-colors" />
                    </div>
                    <h4 className="font-bold text-slate-900 uppercase tracking-tight text-xs mb-1">Generate from My Last Model</h4>
                    <p className="text-[11px] text-slate-400 font-serif italic">
                       {(history && history.length > 0) 
                          ? `Context: ${history[0]?.module?.toUpperCase()} - ${history[0]?.specification ? (history[0]?.specification?.split('~')[0] || '').trim() : 'Baseline'}...` 
                          : "No models run in history yet."}
                    </p>
                 </button>
              </div>
           </div>

           {/* Section 2: Concept List */}
           <div className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 font-mono">Targeted Concepts</h3>
              <div className="grid grid-cols-2 gap-3">
                 {CONCEPTS.map(concept => (
                    <button 
                      key={concept}
                      onClick={() => startDynamicQuiz('concept', concept)}
                      className="p-3 text-[10px] font-bold text-slate-600 bg-white border border-slate-100 rounded-xl hover:border-blue-200 hover:bg-slate-50 transition-all text-center"
                    >
                       {concept}
                    </button>
                 ))}
              </div>
           </div>
        </div>

        {/* Fallback Info */}
        <div className="p-8 border border-dashed border-slate-200 rounded-2xl bg-slate-50/50 text-center">
           <p className="text-[11px] text-slate-400 font-serif italic">
              AI Generation uses the Gemini-3-Flash model. Standard quizzes focus on Gauss-Markov, OVB, and Fixed Effects transformations.
           </p>
        </div>
      </div>
    );
  }

  if (mode === 'generating') {
    return (
      <div className="max-w-3xl mx-auto h-[60vh] flex flex-col items-center justify-center space-y-6 animate-in fade-in duration-500">
         <div className="relative">
            <Loader2 className="w-12 h-12 text-blue-600 animate-spin" />
            <Sparkles className="absolute -top-2 -right-2 w-5 h-5 text-emerald-500 animate-pulse" />
         </div>
         <div className="text-center space-y-2">
            <h3 className="text-xl font-bold text-slate-900">Synthesizing Empirical Challenge...</h3>
            <p className="text-sm text-slate-400 font-serif italic">Retrieving structural context for {quizDetails?.value} workshop.</p>
         </div>
      </div>
    );
  }

  if (mode === 'finished') {
    return (
      <div className="max-w-3xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
         <div className="card-premium p-16 bg-white border-slate-100 text-center space-y-8 flex flex-col items-center">
            <div className="w-24 h-24 bg-blue-50 rounded-full flex items-center justify-center mb-4">
              <Trophy className="w-12 h-12 text-blue-600" />
            </div>
            <div>
               <h2 className="text-4xl font-black tracking-tighter text-slate-900 mb-2">Quiz Completed!</h2>
               <p className="text-slate-500 font-serif italic">Mastery Results: {quizDetails?.value}</p>
            </div>
            
            <div className="bg-slate-50/50 p-10 rounded-3xl border border-slate-100 w-full max-w-sm space-y-2">
              <p className="text-6xl font-black text-blue-600 font-mono tracking-tighter">{score} / {quizzes?.length || 0}</p>
              <div className="flex items-center justify-center gap-2">
                 <div className={cn(
                    "w-2 h-2 rounded-full",
                    score === (quizzes?.length || 0) ? "bg-emerald-500" : "bg-amber-500"
                 )} />
                 <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-widest">
                    Performance: {quizzes?.length ? Math.round((score/quizzes.length)*100) : 0}%
                 </p>
              </div>
            </div>

            <p className="text-slate-500 font-serif italic max-w-sm text-sm">
               {score === quizzes.length 
                  ? "Flawless identification. You have demonstrated perfect command of the structural assumptions."
                  : "Strong results. Identification requires constant vigilance against unobserved heterogeneity."}
            </p>

            <div className="flex gap-4 w-full max-w-md">
               <button 
                  onClick={reset}
                  className="flex-1 flex items-center justify-center gap-2 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200"
               >
                  <RefreshCcw className="w-3.5 h-3.5" /> New Challenge
               </button>
            </div>
         </div>
      </div>
    );
  }

  if (!quiz) {
    return null;
  }

  return (
    <div className="max-w-3xl mx-auto space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-500 pb-20">
      {error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-start gap-3">
           <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
           <p className="text-xs text-amber-800 leading-relaxed italic font-serif">
              {error}
           </p>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
         <div className="space-y-2">
            <h2 className="text-2xl font-bold tracking-tight text-slate-900">
               {quizDetails?.value} <span className="text-slate-300">Workshop Quiz</span>
            </h2>
            <div className="flex items-center gap-4">
               <span className="text-[10px] font-bold tracking-widest uppercase px-3 py-1 bg-slate-100 text-slate-500 rounded-full font-mono">
                  Question {currentIdx + 1} of {(quizzes || []).length}
               </span>
               <span className={cn(
                  "text-[10px] font-bold tracking-widest uppercase px-3 py-1 rounded-full font-mono",
                  quiz.difficulty === 'beginner' ? "bg-emerald-50 text-emerald-600" :
                  quiz.difficulty === 'intermediate' ? "bg-blue-50 text-blue-600" :
                  "bg-purple-50 text-purple-600"
               )}>
                  Level: {quiz.difficulty}
               </span>
            </div>
         </div>
         <div className="text-right">
             <span className="text-[10px] font-bold uppercase tracking-widest text-blue-600 font-mono">Score: {score}</span>
         </div>
      </div>

      <div className="card-premium p-10 bg-white border-slate-100 shadow-sm space-y-8 min-h-[400px] flex flex-col">
        <div className="flex-1 space-y-8">
           <h3 className="text-xl font-bold text-slate-900 leading-snug tracking-tight font-serif italic">
              {quiz.question}
           </h3>

           <div className="space-y-3">
              {quiz.options.map((opt, i) => (
                <button
                 key={i}
                 onClick={() => handleSelect(i)}
                 className={cn(
                   "w-full text-left p-5 rounded-2xl border transition-all text-sm font-medium flex items-center justify-between",
                   selectedOption === null 
                     ? "bg-slate-50 border-slate-100 hover:border-blue-200 hover:bg-white" 
                     : i === quiz.correct 
                       ? "bg-emerald-50 border-emerald-200 text-emerald-900" 
                       : selectedOption === i 
                         ? "bg-red-50 border-red-200 text-red-900" 
                         : "bg-white border-slate-50 text-slate-400 opacity-50"
                 )}
                >
                  <span className="flex items-center gap-4">
                     <span className={cn(
                        "w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-bold font-mono",
                        selectedOption === null ? "bg-white text-slate-400 border border-slate-100" :
                        i === quiz.correct ? "bg-emerald-100 text-emerald-600" :
                        selectedOption === i ? "bg-red-100 text-red-600" : "bg-slate-50 text-slate-300"
                     )}>
                        {String.fromCharCode(65 + i)}
                     </span>
                     {opt}
                  </span>
                  {selectedOption !== null && i === quiz.correct && <CheckCircle2 className="w-5 h-5 text-emerald-500" />}
                  {selectedOption === i && i !== quiz.correct && <XCircle className="w-5 h-5 text-red-500" />}
                </button>
              ))}
           </div>
        </div>

        {showExplanation && (
          <div className="mt-10 p-8 bg-blue-50/50 rounded-3xl border border-blue-100 space-y-4 animate-in zoom-in-95 duration-300">
             <div className="flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-blue-600" />
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-800">Conceptual Briefing</span>
             </div>
             <p className="text-xs text-slate-700 italic font-serif leading-relaxed">
                {quiz.explanation}
             </p>
             <button 
                onClick={next}
                className="w-full mt-4 py-4 bg-slate-900 text-white rounded-2xl text-[10px] font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-2"
             >
                {currentIdx === (quizzes || []).length - 1 ? "Complete Quiz" : "Next Step"}
                <ChevronRight className="w-3.5 h-3.5" />
             </button>
          </div>
        )}
      </div>
    </div>
  );
}
