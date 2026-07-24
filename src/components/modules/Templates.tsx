import React, { useState } from 'react';
import { BookOpen, GraduationCap, Database, TrendingUp, Layers, CheckCircle2, BrainCircuit, Binary, Zap, Scale, Target, Factory, FileText, Search, Sparkles } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { cn } from '../../lib/utils';
import { ModuleTab } from '../../types';

interface MethodTemplateCardProps {
  title: string;
  subtitle: string;
  stepIndex: number;
  totalSteps: number;
  backgroundImage: string;
  icon: any;
  badge: string;
  onClick: (teachingMode: boolean) => void;
}

function MethodTemplateCard({
  title,
  subtitle,
  stepIndex,
  totalSteps,
  backgroundImage,
  icon: Icon,
  badge,
  onClick
}: MethodTemplateCardProps) {
  return (
    <div 
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-xl hover:border-blue-200"
    >
      {/* Visual Header / Image Overlay */}
      <div className="relative h-44 w-full overflow-hidden">
        <img 
          src={backgroundImage} 
          alt={title} 
          referrerPolicy="no-referrer"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-900/40 to-transparent" />
        
        {/* Badge & Step Indicator */}
        <div className="absolute top-4 left-4 right-4 flex items-center justify-between">
          <span className="inline-flex items-center gap-1 rounded-full bg-blue-500/90 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-white backdrop-blur-xs">
            {badge}
          </span>
          <span className="font-mono text-[10px] font-semibold text-slate-300 bg-slate-950/40 px-2 py-0.5 rounded-md backdrop-blur-xs">
            {String(stepIndex).padStart(2, '0')} / {String(totalSteps).padStart(2, '0')}
          </span>
        </div>

        {/* Floating Icon inside bottom left of image */}
        <div className="absolute bottom-4 left-4 flex items-center gap-2">
          <div className="rounded-lg bg-white/10 p-2 text-white backdrop-blur-md border border-white/20">
            <Icon className="h-4 w-4" />
          </div>
          <h3 className="font-sans text-lg font-black tracking-tight text-white uppercase leading-none mt-1">
            {title}
          </h3>
        </div>
      </div>

      {/* Card Content */}
      <div className="flex flex-1 flex-col p-6">
        <p className="flex-1 text-xs text-slate-500 font-serif leading-relaxed italic mb-6">
          {subtitle}
        </p>

        {/* Active Buttons */}
        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-slate-100">
          <button
            onClick={() => onClick(false)}
            className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 active:bg-slate-100"
          >
            Standard Lab
          </button>
          <button
            onClick={() => onClick(true)}
            className="flex items-center justify-center gap-1.5 rounded-xl bg-blue-600 px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider text-white transition-colors hover:bg-blue-700 active:bg-blue-800 shadow-sm"
          >
            <Sparkles className="h-3 w-3" />
            Guided Mode
          </button>
        </div>
      </div>
    </div>
  );
}

interface TemplatesProps {
  onSelect: (type: 'cross-section' | 'panel' | 'time-series', question: string, tab: ModuleTab, templateId: string, teachingMode: boolean) => void;
}

export default function Templates({ onSelect }: TemplatesProps) {
  const { setTeachingState, researchQuestion, setResearchQuestion } = useStore();
  const [isEditingQuestion, setIsEditingQuestion] = useState(!researchQuestion?.hypothesis);
  
  const templates = [
    {
      id: 'education_india',
      title: 'Skill Premium & OVB',
      type: 'cross-section' as const,
      tab: 'ols',
      icon: BookOpen,
      desc: 'The Omitted Variable Bias (OVB) Problem: Estimate schooling returns while identifying the potential bias from unobserved "Ability".',
      question: 'Does the coefficient on education shrink when we add controls for family background? Analyzing the wage gap through OLS.',
      image: 'https://images.unsplash.com/photo-1523050335102-c325091d53fb?q=80&w=800&auto=format&fit=crop',
      badge: 'IDENTIFICATION'
    },
    {
      id: 'mnrega_impact',
      title: 'Rural Wage Floors',
      type: 'panel' as const,
      tab: 'fe',
      icon: Layers,
      desc: 'The MGNRGEA Impact: Control for unobserved state-level heterogeneity to isolate the causal effect of employment guarantees on private wages.',
      question: 'After absorbing time-invariant state traits, what is the within-state effect of MNREGA expenditure on casual rural wage rates?',
      image: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?q=80&w=800&auto=format&fit=crop',
      badge: 'FIXED EFFECTS'
    },
    {
      id: 'inflation_food',
      title: 'The Monsoon Shock',
      type: 'time-series' as const,
      tab: 'arima',
      icon: TrendingUp,
      desc: 'Stochastic Trends in Food Prices: Master the ARIMA(p,d,q) process. Difference the series to achieve stationarity before forecasting.',
      question: 'Does food price inflation follow a random walk with drift? Forecast the next 12 months using lag memory (AR) and shocks (MA).',
      image: 'https://images.unsplash.com/photo-1611095773163-97ae469ef7f5?q=80&w=800&auto=format&fit=crop',
      badge: 'STOCHASTIC DYNAMICS'
    },
    {
      id: 'demon_informal',
      title: 'Causal Shock',
      type: 'panel' as const,
      tab: 'causal',
      icon: BrainCircuit,
      desc: 'Examine the 2016 liquidity shock and its structural impact on informal employment using natural experiments.',
      question: 'What was the causal impact of the demonetization shock on informal sector labor demand in cash-intensive districts?',
      image: 'https://images.unsplash.com/photo-1526304640581-d334cdbbf32d?q=80&w=800&auto=format&fit=crop',
      badge: 'CAUSAL INF'
    },
    {
      id: 'financial_inclusion',
      title: 'Digital Adoption',
      type: 'cross-section' as const,
      tab: 'limited',
      icon: Binary,
      desc: 'Model the probability of UPI adoption based on rural infrastructure and digital literacy scores.',
      question: 'Which factors — education, internet speed, or bank proximity — best predict UPI adoption in Tier-3 Indian cities?',
      image: 'https://images.unsplash.com/photo-1563986768609-322da13575f3?q=80&w=800&auto=format&fit=crop',
      badge: 'BINARY CHOICE'
    },
    {
      id: 'gig_economy_india',
      title: 'Algorithm Labor',
      type: 'panel' as const,
      tab: 'fe',
      icon: Zap,
      desc: 'Earnings variance and job security for delivery workers in platform economies using worker fixed effects.',
      question: 'How do platform algorithms and city-tier characteristics influence the daily earnings of gig workers in India?',
      image: 'https://images.unsplash.com/photo-1617347454431-f49d7ff5c3b1?q=80&w=800&auto=format&fit=crop',
      badge: 'GIG ECONOMY'
    },
    {
      id: 'msp_agriculture',
      title: 'Price Supports',
      type: 'cross-section' as const,
      tab: 'ols',
      icon: GraduationCap,
      desc: 'How Minimum Support Price (MSP) policy affects farmer income and crop choice in active market belts.',
      question: 'Does higher MSP for wheat and paddy lead to significant improvements in net farmer income after controlling for input costs?',
      image: 'https://images.unsplash.com/photo-1464226184884-fa280b87c399?q=80&w=800&auto=format&fit=crop',
      badge: 'POLICY EVAL'
    },
    {
      id: 'labor_supply_iv',
      title: 'Endogenous Labor',
      type: 'cross-section' as const,
      tab: 'limited',
      icon: Scale,
      desc: 'Identify labor supply elasticities using exogenous wealth shocks as instrumental variables.',
      question: 'Does non-labor income causally reduce hours worked, or is the observed correlation driven by leisure preferences?',
      image: 'https://images.unsplash.com/photo-1454165833767-02a9e406f0a5?q=80&w=800&auto=format&fit=crop',
      badge: 'INSTRUMENTAL'
    },
    {
      id: 'did_trade_policy',
      title: 'Trade Shocks',
      type: 'panel' as const,
      tab: 'causal',
      icon: Target,
      desc: 'Impact of tariff reductions on local manufacturing productivity using Difference-in-Differences.',
      question: 'How did the 1991 trade liberalization shock affect output growth in districts with high exposure to import competition?',
      image: 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?q=80&w=800&auto=format&fit=crop',
      badge: 'DIFF-IN-DIFF'
    },
    {
      id: 'synthetic_control_growth',
      title: 'Counterfactuals',
      type: 'panel' as const,
      tab: 'causal',
      icon: Factory,
      desc: 'Difference-in-Differences counterfactual analysis to estimate the impact of new industrial corridors on regional GDP growth.',
      question: 'What would have been the growth trajectory of the state without the implementation of the Special Economic Zone?',
      image: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?q=80&w=800&auto=format&fit=crop',
      badge: 'DIFF-IN-DIFF'
    },
    {
      id: 'card_krueger_did',
      title: 'Minimum Wage Impact',
      type: 'panel' as const,
      tab: 'causal',
      icon: Target,
      desc: 'The Card-Krueger Difference-in-Differences (DiD) replication: Evaluate the impact of a minimum wage increase in New Jersey relative to Pennsylvania.',
      question: 'Did the 1992 New Jersey minimum wage increase causally reduce fast-food employment, or did employment remain stable relative to Pennsylvania?',
      image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?q=80&w=800&auto=format&fit=crop',
      badge: 'DIFF-IN-DIFF'
    },
    {
      id: 'mincerian_wages',
      title: 'Mincerian Wage Returns',
      type: 'cross-section' as const,
      tab: 'ols',
      icon: BookOpen,
      desc: 'Human Capital Theory: Estimate returns to schooling and experience using the classic Mincer log-linear wage equation.',
      question: 'What is the private rate of return to an additional year of education after controlling for quadratic labor market experience?',
      image: 'https://images.unsplash.com/photo-1454165833767-02a9e406f0a5?q=80&w=800&auto=format&fit=crop',
      badge: 'HUMAN CAPITAL'
    },
    {
      id: 'binary_health',
      title: 'Health Insurance Choice',
      type: 'cross-section' as const,
      tab: 'limited',
      icon: Binary,
      desc: 'Limited Dependent Variables: Model the probability of holding health insurance coverage using Logit/Probit estimation.',
      question: 'How do household income, age, and employment status affect the marginal probability of holding private health insurance?',
      image: 'https://images.unsplash.com/photo-1505751172876-fa1923c5c528?q=80&w=800&auto=format&fit=crop',
      badge: 'BINARY CHOICE'
    }
  ];

  const handleLaunch = (t: any, teachingMode: boolean) => {
    setTeachingState({
      isActive: teachingMode,
      templateId: t.id,
      completedSteps: ['Inspect the data']
    });
    onSelect(t.type, t.question, t.tab, t.id, teachingMode);
  };

  const handleUpdateField = (field: string, value: string) => {
    if (!researchQuestion) return;
    setResearchQuestion({
      ...researchQuestion,
      [field]: value
    });
  };

  return (
    <div className="space-y-12 animate-in fade-in duration-700 max-w-6xl mx-auto">
      <section className="text-center space-y-4 py-16 border-b border-slate-100 mb-16 px-4">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-blue-50 text-blue-600 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4">
          <Zap className="w-3 h-3" />
          Empirical Research Engine
        </div>
        <h1 className="text-5xl md:text-6xl font-black text-slate-950 tracking-tighter uppercase font-sans leading-none">
          The Research <span className="text-blue-600">Commons</span>
        </h1>
        <p className="text-lg md:text-xl text-slate-500 font-serif italic max-w-3xl mx-auto leading-relaxed">
          Initialize your econometric simulation by selecting a design paradigm. Each template provides a pre-configured data context and identification strategy.
        </p>
      </section>

      {/* Research Blueprint Section */}
      <section className="px-4 mb-20 animate-in slide-in-from-bottom-4 duration-700 delay-150">
        <div className="card-premium p-8 bg-slate-950 border-none relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none group-hover:opacity-20 transition-opacity duration-700">
            <Sparkles className="w-32 h-32 text-blue-400 rotate-12" />
          </div>

          <div className="relative z-10">
            <div className="flex items-center justify-between mb-8">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/20 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-400" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white uppercase tracking-tight">Research Blueprint</h2>
                  <p className="text-[10px] text-slate-400 font-mono uppercase tracking-widest leading-none mt-1">Foundational Identification Strategy</p>
                </div>
              </div>
              <button 
                onClick={() => setIsEditingQuestion(!isEditingQuestion)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-lg text-[9px] font-bold uppercase tracking-widest text-white transition-all backdrop-blur-sm shadow-xl"
              >
                {isEditingQuestion ? 'Review Blueprint' : 'Update Research Logic'}
              </button>
            </div>

            {isEditingQuestion ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">Formal Research Question</label>
                    <textarea 
                      value={researchQuestion?.outcome || ''}
                      onChange={(e) => handleUpdateField('outcome', e.target.value)}
                      placeholder="e.g., How does high-speed internet penetration impact small enterprise output?"
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white text-sm font-serif italic focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all placeholder:text-slate-600 min-h-[100px] resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 font-mono">Primary Hypothesis (H1)</label>
                    <textarea 
                      value={researchQuestion?.hypothesis || ''}
                      onChange={(e) => handleUpdateField('hypothesis', e.target.value)}
                      placeholder="e.g., We expect internet access to reduce information asymmetry and transaction costs, leading to a coefficient β > 0."
                      className="w-full bg-white/5 border border-white/10 rounded-xl p-4 text-white text-sm font-serif italic focus:outline-none focus:ring-2 focus:ring-blue-500/40 transition-all placeholder:text-slate-600 min-h-[100px] resize-none"
                    />
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="flex flex-col h-full bg-white/5 border border-white/10 rounded-2xl p-6 border-dashed">
                    <div className="flex items-center gap-2 mb-4 text-blue-400">
                      <Search className="w-4 h-4" />
                      <span className="text-[10px] font-bold uppercase tracking-widest font-mono text-slate-400">Design Constraint</span>
                    </div>
                    <p className="text-xs text-slate-400 leading-relaxed font-serif italic">
                      Defining your question and hypothesis <span className="text-white">ex-ante</span> is critical to prevent <span className="text-blue-400 underline underline-offset-4 decoration-blue-500/30">p-hacking</span>. 
                      Think about your mechanism: <span className="text-white">Why</span> do you expect X to affect Y?
                    </p>
                    <div className="mt-auto pt-6 border-t border-white/5">
                      <p className="text-[9px] text-slate-500 font-mono italic leading-relaxed">
                        TIP: A good research question is specific, measurable, and falsifiable. Use the templates below as a jumping-off point.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                  <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mb-3 block font-mono">Current Question</span>
                  <p className="text-xl text-white font-serif italic tracking-tight leading-snug">
                    "{researchQuestion?.outcome || 'Define your research inquiry...'}"
                  </p>
                </div>
                <div className="p-6 bg-white/5 border border-white/10 rounded-2xl">
                  <span className="text-[9px] font-bold text-blue-500 uppercase tracking-widest mb-3 block font-mono">Null vs Alternative</span>
                  <p className="text-xl text-white font-serif italic tracking-tight leading-snug">
                    "{researchQuestion?.hypothesis || 'State your theoretical expectation...'}"
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="px-4">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-10">
          <div className="flex items-center gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-950">Structural Repository</h2>
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          </div>
          <span className="text-[10px] text-slate-400 font-mono italic">Curated Laboratory Contexts</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-x-8 gap-y-12">
          {templates.map((t, index) => (
            <MethodTemplateCard
              key={t.id}
              title={t.title}
              subtitle={t.desc}
              stepIndex={index + 1}
              totalSteps={templates.length}
              backgroundImage={t.image}
              icon={t.icon}
              badge={t.badge}
              onClick={(mode) => handleLaunch(t, mode)}
            />
          ))}
        </div>
      </section>

      {/* Footer Section - Design Standard */}
      <section className="relative overflow-hidden rounded-3xl bg-slate-950 text-white p-12 lg:p-20 shadow-2xl mt-24">
         <div className="absolute top-0 right-0 p-12 opacity-5 pointer-events-none">
            <GraduationCap className="w-64 h-64 rotate-12" />
         </div>
         <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="space-y-6">
               <div className="inline-flex items-center gap-2 px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-widest text-blue-400">
                 Protocol Standards
               </div>
               <h3 className="font-serif italic text-4xl lg:text-5xl font-light leading-tight">The Scientific <br />Workflow Invariant</h3>
               <p className="text-base text-slate-400 font-serif leading-relaxed max-w-md">
                  Econometrics is a discipline of verification. This platform enforces a four-stage identification sequence -- audit, identify, stress-test, document -- on every model you run.
               </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
               {[
                 { step: '01', title: 'Data Audit', desc: 'Distributional symmetry & moments.' },
                 { step: '02', title: 'Identification', desc: 'Structural parameter estimation.' },
                 { step: '03', title: 'Robustness', desc: 'Stability across specifications.' },
                 { step: '04', title: 'Synthesis', desc: 'Academic-grade documentation.' },
               ].map((item) => (
                 <div key={item.step} className="p-6 bg-white/5 rounded-2xl border border-white/10 space-y-3 group hover:bg-white/10 transition-colors">
                   <span className="text-[10px] font-mono font-bold text-blue-500 tracking-widest">{item.step}</span>
                   <h4 className="text-sm font-bold uppercase tracking-widest text-slate-100">{item.title}</h4>
                   <p className="text-xs text-slate-500 italic font-serif leading-relaxed">{item.desc}</p>
                 </div>
               ))}
            </div>
         </div>
      </section>
    </div>
  );
}
