import React from 'react';
import { 
  ShieldCheck, 
  Cpu, 
  Database, 
  EyeOff, 
  ArrowLeft, 
  Lock, 
  Sparkles, 
  CheckCircle2,
  FileText
} from 'lucide-react';
import { APP_VERSION } from '../../constants/app';

interface PrivacyPolicyProps {
  onBack?: () => void;
}

export default function PrivacyPolicy({ onBack }: PrivacyPolicyProps) {
  const handleGoBack = () => {
    if (onBack) {
      onBack();
    } else {
      // Fallback navigation
      window.history.pushState({}, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-500/10 selection:text-blue-900 font-sans">
      {/* Top Academic Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button
            onClick={handleGoBack}
            className="group flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-600 hover:text-slate-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
            Back to Research Lab
          </button>
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-400">
            <span>ECON PRIVACY SHIELD</span>
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" />
          </div>
        </div>
      </header>

      {/* Hero Header Section */}
      <div className="bg-[#1B2E41] text-white py-16 px-6 relative overflow-hidden">
        {/* Subtle decorative elements */}
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(30,58,138,0.3),transparent_70%)]" />
        <div className="absolute -bottom-16 -right-16 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl" />
        
        <div className="max-w-3xl mx-auto relative z-10 text-center space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-emerald-300 text-[10px] font-bold uppercase tracking-widest">
            <ShieldCheck className="w-3.5 h-3.5" />
            Local-First Data Safeguard Verified
          </div>
          <h1 className="text-3xl md:text-4xl font-serif font-bold tracking-tight">
            Privacy Policy &amp; Data Safeguards
          </h1>
          <p className="text-sm md:text-base text-slate-300 font-serif max-w-xl mx-auto italic">
            "Absolute confidentiality is the baseline of scientific econometrics."
          </p>
          <div className="pt-2 text-[11px] font-mono text-slate-400">
            Last Updated: June 2026 • Version {APP_VERSION} (Beta)
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-3xl mx-auto px-6 py-12 space-y-12">
        {/* Core Promises - Bento Strip */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs space-y-3">
            <div className="p-2 bg-blue-50 text-blue-700 rounded-xl w-fit">
              <Cpu className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Local-First Compute</h3>
            <p className="text-xs text-slate-600 font-serif leading-relaxed">
              OLS regressions, Fixed Effects, ARIMA, and tests run fully on your browser. Your dataset rows are never uploaded to any server.
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs space-y-3">
            <div className="p-2 bg-emerald-50 text-emerald-700 rounded-xl w-fit">
              <Database className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">No Raw Storage</h3>
            <p className="text-xs text-slate-600 font-serif leading-relaxed">
              Your research data remains in ephemeral browser memory. Clearing your browser cache fully resets your workspace.
            </p>
          </div>

          <div className="bg-white border border-slate-200/80 p-5 rounded-2xl shadow-xs space-y-3">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-xl w-fit">
              <EyeOff className="w-5 h-5" />
            </div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900">Anonymized AI</h3>
            <p className="text-xs text-slate-600 font-serif leading-relaxed">
              Only model statistics (coefficients, fit statistics) are shared with the Gemini API to render text explanations.
            </p>
          </div>
        </section>

        {/* Detailed Sections */}
        <article className="prose prose-slate max-w-none space-y-10">
          
          {/* Section 1 */}
          <section className="space-y-3 border-b border-slate-200 pb-8">
            <h2 className="text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
              <span className="text-sm font-mono text-blue-600">01.</span>
              The "Local-First" Econometrics Philosophy
            </h2>
            <div className="text-xs text-slate-600 space-y-4 leading-relaxed font-serif">
              <p>
                In standard economic analysis, data security, intellectual property, and compliance with data usage agreements (such as proprietary micro-datasets from central banks or commercial financial sources) are critical constraints. Traditional "cloud-heavy" SaaS architectures compromise this security by forcing researchers to upload raw datasets to third-party databases.
              </p>
              <p>
                <strong>Economics Learning Lab (Beta)</strong> operates on a decentralized, client-side execution model. Whether you upload a <code>.csv</code> file, an Excel sheet, or use one of our integrated UGC-NET standard datasets, the core execution flow remains local:
              </p>
              <ul className="list-disc pl-5 space-y-2 mt-2 font-sans text-xs">
                <li><strong className="text-slate-800">CSV Parsing:</strong> Executed fully on-device via custom client-side parsing routines.</li>
                <li><strong className="text-slate-800">OLS &amp; Matrix Math:</strong> Run natively in the browser's JavaScript V8 engine. No raw data rows are transmitted over the network for processing.</li>
                <li><strong className="text-slate-800">Visualization:</strong> Chart components utilize native D3-based SVG generators directly inside the virtual DOM.</li>
              </ul>
            </div>
          </section>

          {/* Section 2 */}
          <section className="space-y-3 border-b border-slate-200 pb-8">
            <h2 className="text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
              <span className="text-sm font-mono text-blue-600">02.</span>
              AI Integrations and Confidentiality Safeguards
            </h2>
            <div className="text-xs text-slate-600 space-y-4 leading-relaxed font-serif">
              <p>
                The <strong>Professor Desk</strong>, <strong>Academic Lab</strong>, and model interpretation features are powered by secure Google Gemini 1.5/3.5 models. To respect academic data restrictions, we have implemented an absolute <strong>Confidentiality Filter</strong>:
              </p>
              <div className="bg-amber-50/50 border border-amber-200/60 p-4 rounded-xl space-y-2 font-sans">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-800">
                  <Lock className="w-4 h-4 text-amber-700" />
                  CONFIDENTIALITY PROTOCOL
                </div>
                <p className="text-[11px] text-amber-900 font-serif leading-relaxed">
                  Before any request is sent to the Gemini API, the platform filters out all primary raw data matrices. The LLM only receives consolidated, aggregated, and non-reconstructible statistical summaries (e.g., intercept coefficients, R-squared values, standard errors). Your individual data points and categorical survey responses remain completely private.
                </p>
              </div>
            </div>
          </section>

          {/* Section 3 */}
          <section className="space-y-3 border-b border-slate-200 pb-8">
            <h2 className="text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
              <span className="text-sm font-mono text-blue-600">03.</span>
              User Controls and Session Customizations
            </h2>
            <div className="text-xs text-slate-600 space-y-4 leading-relaxed font-serif">
              <p>
                Under our Commitment to Transparent Research, students have direct access to their privacy settings at any time (accessible via the <strong>Scholar Dashboard</strong> and <strong>Academic Lab / Subscriptions</strong> panel):
              </p>
              <div className="space-y-2.5 font-sans text-xs">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800 block font-medium">Opt-in AI Explanations</strong>
                    <span className="text-slate-500">Toggle whether OLS statistics are sent to the AI Professor.</span>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800 block font-medium">Chat History Persistence</strong>
                    <span className="text-slate-500">Decide whether your queries are stored locally in the browser memory or discarded immediately.</span>
                  </div>
                </div>
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <strong className="text-slate-800 block font-medium">Telemetry-Free Mode</strong>
                    <span className="text-slate-500">Choose whether you share anonymous app usage metrics to help optimize local math utilities.</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Section 4 */}
          <section className="space-y-3 pb-4">
            <h2 className="text-lg font-serif font-bold text-slate-900 flex items-center gap-2">
              <span className="text-sm font-mono text-blue-600">04.</span>
              Compliance and Institutional Inquiries
            </h2>
            <p className="text-xs text-slate-600 leading-relaxed font-serif">
              Our decentralized design is fully compliant with modern data safety regulations, including GDPR (General Data Protection Regulation) and CCPA, as we do not run a centralized database that retains user research datasets. If you are an academic researcher or institution requiring a tailored local-only deployment on internal air-gapped servers, please contact our Institutional Relations desk.
            </p>
          </section>

        </article>

        {/* Call to Action Footer */}
        <section className="bg-slate-900 text-white rounded-2xl p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1.5 max-w-md">
            <div className="flex items-center gap-2 text-xs font-mono font-bold text-blue-400">
              <Sparkles className="w-3.5 h-3.5 text-blue-300" />
              ACADEMIC COMPLIANCE SECURED
            </div>
            <h4 className="text-sm font-bold uppercase tracking-tight font-sans">Ready to return to your estimations?</h4>
            <p className="text-xs text-slate-400 font-serif leading-relaxed">
              Your session state has been preserved. Feel free to resume your studies with full peace of mind.
            </p>
          </div>
          <button
            onClick={handleGoBack}
            className="px-5 py-3 bg-white text-slate-900 hover:bg-slate-100 font-bold text-xs uppercase tracking-widest rounded-xl transition-all shadow-sm shrink-0 font-sans"
          >
            Back to Application
          </button>
        </section>
      </main>
    </div>
  );
}
