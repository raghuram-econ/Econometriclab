import React, { useState } from 'react';
import { 
  BookOpen, 
  ShieldCheck, 
  Cpu, 
  GraduationCap, 
  Scale, 
  FileSpreadsheet, 
  Quote, 
  RefreshCw, 
  User, 
  Mail, 
  Target, 
  Database, 
  Heart, 
  Copy, 
  Check, 
  ExternalLink 
} from 'lucide-react';
import { APP_VERSION } from '../../constants/app';
import { useStore } from '../../store/useStore';

export default function AboutResearch() {
  const { setActiveModule } = useStore();
  const [copied, setCopied] = useState(false);

  const citationText = `Raghuram.M (2026). Economics Learning Lab (Beta): An open-access econometrics learning platform for Indian graduate economics students [Web application]. https://econometrics-lab-340743255083.asia-southeast1.run.app [Accessed: DD-MM-YYYY]`;

  const handleCopyCitation = () => {
    navigator.clipboard.writeText(citationText).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div id="about-research" className="max-w-5xl mx-auto px-4 py-8 space-y-12 animate-in fade-in duration-700">
      
      {/* Editorial Header */}
      <div className="text-center space-y-4 max-w-3xl mx-auto border-b border-stone-200 pb-10">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-[10px] font-mono font-bold uppercase tracking-widest text-indigo-600 shadow-sm">
          <GraduationCap className="w-3.5 h-3.5" /> PhD Research Instrument & Academic Protocol
        </div>
        <h1 className="text-4xl md:text-5xl font-serif font-black tracking-tight text-stone-900 leading-tight italic">
          About This Platform
        </h1>
        <p className="text-base text-stone-500 font-serif italic max-w-2xl mx-auto leading-relaxed">
          Integrated learning, micro-econometric computation, and policy synthesis optimized for MA, M.Phil, and PhD Scholars.
        </p>
      </div>

      {/* Grid: Background & Researcher Card */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
        
        {/* Section 1: Research Background */}
        <div className="md:col-span-7 p-8 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-2xl w-fit">
              <BookOpen className="w-6 h-6 text-indigo-600" />
            </div>
            <h2 className="text-xl font-serif font-bold text-stone-950">
              Section 1: Research Background
            </h2>
            <p className="text-xs text-stone-600 leading-relaxed font-serif">
              This platform serves as the central research instrument and pedagogical artifact for planned doctoral research entitled:
            </p>
            <blockquote className="p-4 bg-stone-50 border-l-4 border-indigo-500 rounded-r-xl text-xs font-serif italic text-stone-800 font-medium leading-relaxed">
              "Technology-Mediated Econometrics Education: Design, Development, and Empirical Evaluation of an Open-Access Learning Platform for Graduate Economics Students in India"
            </blockquote>
            <p className="text-xs text-stone-600 leading-relaxed font-serif">
              It addresses the critical pedagogical challenge in Indian higher education of connecting abstract econometric proofs with intuitive visual models, matrix operations, and public macro-evaluation datasets.
            </p>
          </div>
        </div>

        {/* Section 2: Researcher Profile */}
        <div className="md:col-span-5 p-8 bg-slate-950 text-white rounded-2xl shadow-xl space-y-5 border border-slate-800 flex flex-col justify-between">
          <div className="space-y-4">
            <div className="p-3 bg-indigo-500/10 border border-indigo-500/20 rounded-2xl w-fit">
              <User className="w-6 h-6 text-indigo-400" />
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-serif font-bold text-slate-100">
                Section 2: Lead Researcher
              </h2>
            </div>
            
            <div className="space-y-3 font-mono text-[11px] text-slate-300">
              <div className="border-b border-slate-800 pb-2">
                <span className="text-slate-500 uppercase font-bold tracking-wider block text-[9px]">Candidate</span>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-white text-sm font-bold font-sans">Raghuram.M</span>
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold font-mono bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    PhD applicant
                  </span>
                </div>
              </div>
              <div className="border-b border-slate-800 pb-2">
                <span className="text-slate-500 uppercase font-bold tracking-wider block text-[9px]">Email Address</span>
                <a href="mailto:raghuram9361@gmail.com" className="text-indigo-400 hover:underline flex items-center gap-1">
                  <Mail className="w-3.5 h-3.5 inline" /> raghuram9361@gmail.com
                </a>
              </div>
              <div className="border-b border-slate-800 pb-2">
                <span className="text-slate-500 uppercase font-bold tracking-wider block text-[9px]">Specialisation</span>
                <span className="text-indigo-300">Economics of Education | Applied Econometrics | Development Economics</span>
              </div>
              <div>
                <span className="text-slate-500 uppercase font-bold tracking-wider block text-[9px]">Research Framework</span>
                <span className="text-emerald-400">Design Science Research (DSR) Paradigm</span>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* Section 3: Research Objectives */}
      <div className="p-8 bg-stone-50 border border-stone-200 rounded-3xl space-y-6">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <Target className="w-5 h-5 text-stone-700" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-mono">
            Section 3: Research Objectives
          </h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          <div className="p-5 bg-white border border-stone-200 rounded-xl space-y-2">
            <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold font-mono text-xs">1</div>
            <h4 className="text-xs font-bold text-stone-900 uppercase font-sans">Design &amp; Develop</h4>
            <p className="text-[11px] text-stone-500 font-serif leading-relaxed italic">
              Architect and build an open-access, zero-installation econometric simulator mapped explicitly to the NTA UGC-NET syllabus guidelines.
            </p>
          </div>

          <div className="p-5 bg-white border border-stone-200 rounded-xl space-y-2">
            <div className="w-6 h-6 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold font-mono text-xs">2</div>
            <h4 className="text-xs font-bold text-stone-900 uppercase font-sans">Evaluate Outcomes</h4>
            <p className="text-[11px] text-stone-500 font-serif leading-relaxed italic">
              Empirically analyze graduate-level students' learning retention, computational confidence, and intuitive interpretation improvements.
            </p>
          </div>

          <div className="p-5 bg-white border border-stone-200 rounded-xl space-y-2">
            <div className="w-6 h-6 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center font-bold font-mono text-xs">3</div>
            <h4 className="text-xs font-bold text-stone-900 uppercase font-sans">Compare Instruction</h4>
            <p className="text-[11px] text-stone-500 font-serif leading-relaxed italic">
              Conduct randomized diagnostic trials to compare conventional, chalkboard-centric instructions with interactive simulated learning pathways.
            </p>
          </div>

          <div className="p-5 bg-white border border-stone-200 rounded-xl space-y-2">
            <div className="w-6 h-6 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center font-bold font-mono text-xs">4</div>
            <h4 className="text-xs font-bold text-stone-900 uppercase font-sans">Inform UGC Policy</h4>
            <p className="text-[11px] text-stone-500 font-serif leading-relaxed italic">
              Synthesize insights to formulate curriculum policy advisories on integrating computational tools into public Indian central university programs.
            </p>
          </div>
        </div>
      </div>

      {/* Section 4: Academic Data Sources */}
      <div className="space-y-4">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <Database className="w-5 h-5 text-stone-700" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-mono">
            Section 4: Academic Data Registries
          </h3>
        </div>
        <p className="text-xs text-stone-500 font-serif italic mb-4">
          The pre-loaded datasets, macro indicators, and policy timelines integrated throughout the interactive labs are parsed and modeled based on standard public-access academic data portals:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 bg-white border border-stone-200 rounded-xl">
            <span className="font-bold text-stone-800 text-xs block font-mono">RBI Database (DBIE)</span>
            <span className="text-[10px] text-stone-500 leading-relaxed font-serif">Reserve Bank of India Database on Indian Economy—monthly interest rates, money aggregates, CPI target regimes.</span>
          </div>
          <div className="p-4 bg-white border border-stone-200 rounded-xl">
            <span className="font-bold text-stone-800 text-xs block font-mono">MOSPI Portals</span>
            <span className="text-[10px] text-stone-500 leading-relaxed font-serif">Ministry of Statistics and Programme Implementation—macro-indices, industrial production, agricultural crop yields.</span>
          </div>
          <div className="p-4 bg-white border border-stone-200 rounded-xl">
            <span className="font-bold text-stone-800 text-xs block font-mono">World Bank India</span>
            <span className="text-[10px] text-stone-500 leading-relaxed font-serif">Development indicators for Indian states, public healthcare, gender parity ratios, and structural welfare metrics.</span>
          </div>
          <div className="p-4 bg-white border border-stone-200 rounded-xl">
            <span className="font-bold text-stone-800 text-xs block font-mono">CMIE Academic Portal</span>
            <span className="text-[10px] text-stone-500 leading-relaxed font-serif">Centre for Monitoring Indian Economy databases—household survey indicators, employment patterns, consumer sentiments.</span>
          </div>
        </div>
      </div>

      {/* Section 5: How to Cite This Platform */}
      <div className="p-8 bg-white border border-stone-200 rounded-3xl space-y-4">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <Quote className="w-5 h-5 text-indigo-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-mono">
            Section 5: How to Cite This Platform
          </h3>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed font-serif">
          If you are using this platform's OLS, Fixed-Effects, or ARIMA matrix results, policy summaries, or diagnostic report exports in your M.Phil, PhD thesis, journal publication, or central university term paper, please cite the research instrument as follows:
        </p>
        
        {/* Cite box with copy button */}
        <div className="p-6 bg-slate-950 text-slate-100 rounded-2xl space-y-4 relative overflow-hidden border border-slate-800">
          <div className="space-y-1.5">
            <span className="text-[10px] font-mono text-indigo-400 font-bold uppercase tracking-wider block">APA 7th Edition Citation Protocol</span>
            <p className="text-xs font-serif leading-relaxed italic text-slate-200">
              {citationText}
            </p>
          </div>
          <div className="flex items-center gap-4 pt-3 border-t border-slate-900 justify-between">
            <div className="flex items-center gap-2 text-[10px] text-slate-400 font-mono">
              <ShieldCheck className="w-4 h-4 text-emerald-400" /> Persistent Identifier & Open-Access Standard
            </div>
            <button
              onClick={handleCopyCitation}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 rounded-xl text-[10px] font-bold uppercase tracking-widest text-slate-200 transition-all font-mono"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5 text-indigo-400" />}
              {copied ? 'Copied to Clipboard!' : 'Copy Citation'}
            </button>
          </div>
        </div>
      </div>

      {/* Section 6: Acknowledgements */}
      <div className="p-8 bg-stone-50 border border-stone-200 rounded-3xl space-y-4">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <Heart className="w-5 h-5 text-rose-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-mono">
            Section 6: Acknowledgements
          </h3>
        </div>
        <p className="text-xs text-stone-600 leading-relaxed font-serif">
          The development of the Economics Learning Lab (Beta) has been made possible through the open-access datasets, guidelines, and structural benchmarks provided by:
        </p>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-3 text-[11px] font-serif text-stone-600 italic">
          <li>• <strong>University Grants Commission (UGC)</strong> and National Testing Agency for centralized PG syllabus specifications.</li>
          <li>• <strong>Ministry of Statistics and Programme Implementation (MOSPI)</strong> for open-access national survey indices and crop stats.</li>
          <li>• <strong>Reserve Bank of India (RBI)</strong> monetary policy open databases for empirical targeting regime variables.</li>
        </ul>
      </div>

      {/* Section 7: Numerical Accuracy & Benchmarks */}
      <div className="p-8 bg-white border border-stone-200 rounded-3xl space-y-4 shadow-sm group hover:border-indigo-200 transition-colors">
        <div className="flex items-center gap-2 border-b border-stone-200 pb-3">
          <ShieldCheck className="w-5 h-5 text-indigo-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-stone-800 font-mono">
            Section 7: Numerical Accuracy & Benchmarks
          </h3>
        </div>
        <div className="flex flex-col md:flex-row gap-6 items-center">
          <div className="flex-1 space-y-3">
            <p className="text-xs text-stone-600 leading-relaxed font-serif">
              The OLS engine is certified against NIST Statistical Reference Datasets; estimators are validated against reference implementations (statsmodels/linearmodels) with the full test suite in the repository. 
              We maintain a public record of these numerical benchmarks to ensure academic rigor and reproducibility.
            </p>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setActiveModule('accuracy');
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-bold uppercase tracking-widest transition-all font-mono shadow-md"
              >
                <RefreshCw className="w-3.5 h-3.5" /> View Numerical Benchmarks
              </button>
            </div>
          </div>
          <div className="flex gap-2 p-2 bg-slate-50 rounded-xl border border-slate-100">
            <div className="p-3 bg-white border border-emerald-100 rounded-lg text-center">
              <span className="block text-[8px] uppercase font-bold text-slate-400 font-mono">OLS HC1</span>
              <span className="text-xs font-bold text-emerald-600">±1e-4</span>
            </div>
            <div className="p-3 bg-white border border-indigo-100 rounded-lg text-center">
              <span className="block text-[8px] uppercase font-bold text-slate-400 font-mono">RE/FE</span>
              <span className="text-xs font-bold text-indigo-600">±1e-4</span>
            </div>
            <div className="p-3 bg-white border border-amber-100 rounded-lg text-center">
              <span className="block text-[8px] uppercase font-bold text-slate-400 font-mono">Tobit</span>
              <span className="text-xs font-bold text-amber-600">±1e-3</span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer / Team Notes */}
      <div className="text-center pt-8 border-t border-stone-200 text-[10px] text-stone-400 font-mono uppercase tracking-widest flex flex-col sm:flex-row items-center justify-between gap-4">
        <p>Economics Learning Lab (Beta) v{APP_VERSION} • Built for Academic Integrity</p>
        <p className="flex items-center gap-1.5"><RefreshCw className="w-3.5 h-3.5 animate-spin text-stone-300" /> Solvers Verified 2026</p>
      </div>

    </div>
  );
}

