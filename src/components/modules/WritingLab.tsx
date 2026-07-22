// ============================================================
// src/components/modules/WritingLab.tsx
// Consolidated Writing Lab: Academic Drafts, LaTeX Booktabs, and APA Reports
// ============================================================

import React, { useState, useEffect } from 'react';
import { 
  FileText, Download, Printer, Loader2, Sparkles, 
  History, ArrowRight, Save, Layout, Wand2, 
  CheckCircle2, AlertCircle, RefreshCw, BookOpen,
  Copy, Check, Code, FileDown
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../../store/useStore';
import { Dataset, ManuscriptSections } from '../../types';
import { generateManuscriptSection } from '../../services/gemini';
import { cn, safeDownloadFile, copyTextToClipboard, stars, fmt } from '../../lib/utils';
import { getAuthHeaders } from '../../services/apiClient';
import { ManuscriptSettings } from '../shared/ManuscriptSettings';

interface WritingLabProps {
  dataset: Dataset | null;
  onRunComplete: (r: any) => void;
}

type SubTabType = 'draft' | 'latex' | 'apa' | 'export';

export default function WritingLab({ dataset, onRunComplete }: WritingLabProps) {
  const { history, researchQuestion, reportDraft, setReportDraft } = useStore();
  const { selectedModelId: selectedId, sections } = reportDraft;

  const [activeTab, setActiveTab] = useState<SubTabType>('draft');
  const [copied, setCopied] = useState(false);
  const [generatingSection, setGeneratingSection] = useState<string | null>(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [targetJournal, setTargetJournal] = useState('American Economic Review (AER)');
  const [customJournal, setCustomJournal] = useState('');

  // APA specific states
  const [apaParagraph, setApaParagraph] = useState('');
  const [apaLoading, setApaLoading] = useState(false);

  // Retrieve referencing estimation results
  const lastResult = history[0];

  // Sync selectedId: always pick the latest if none selected or if current selected is not in history
  useEffect(() => {
    if (history.length > 0) {
      const exists = history.some(h => h.id === selectedId);
      if (!selectedId || !exists) {
        const latestId = history[0]?.id || '';
        if (selectedId !== latestId) {
          setReportDraft({ selectedModelId: latestId });
        }
      }
    }
  }, [history.length, selectedId, setReportDraft]);

  // Proactive drafting / Update prompt check
  useEffect(() => {
    if (!dataset || history.length === 0 || !selectedId) return;
    
    // Initial Empty state auto-fill
    const isActuallyEmpty = Object.values(sections).every(v => v === '');
    const latestModelId = history[0]?.id;
    
    if (isActuallyEmpty && selectedId === latestModelId) {
      handleAutoFill();
    }

    // New model detected prompt
    if (selectedId !== latestModelId && !isActuallyEmpty && !showDraftModal) {
       setShowDraftModal(true);
    }
  }, [selectedId, history.length, dataset?.name]);

  const handleUpdateToLatest = () => {
    if (history.length > 0 && history[0]) {
      setReportDraft({ 
        selectedModelId: history[0].id,
        sections: {
          ...sections,
          methodology: '',
          results: '',
          diagnostics: ''
        }
      });
      setShowDraftModal(false);
    }
  };

  const updateSection = (key: keyof ManuscriptSections, value: string) => {
    setReportDraft({
      sections: { ...sections, [key]: value }
    });
  };

  const handleAutoFill = () => {
    if (!dataset) return;
    
    setReportDraft({
      sections: {
        ...sections,
        title: sections.title || `An Empirical Analysis of ${researchQuestion?.outcome || 'Outcome'} in ${dataset.name}`,
        researchQuestion: sections.researchQuestion || researchQuestion?.hypothesis || 'Primary research hypothesis not defined.',
        data: sections.data || `This study utilizes the ${dataset.name} dataset, consisting of ${dataset.rowCount || 0} observations. The primary outcome variable is ${researchQuestion?.outcome || 'Y'}, and the key explanatory variable is ${researchQuestion?.explanatory || 'X'}.`,
      }
    });
  };

  const handleGenerateSection = async (sectionKey: keyof ManuscriptSections, sectionLabel: string) => {
    const item = history.find(h => h.id === selectedId);
    if (!item || !dataset) {
      alert("Please run a model and select it as reference before drafting.");
      return;
    }

    setGeneratingSection(sectionKey);
    try {
      const journalName = targetJournal === 'Custom' ? customJournal : targetJournal;
      const content = await generateManuscriptSection(
        sectionKey,
        item,
        researchQuestion,
        dataset,
        journalName
      );

      updateSection(sectionKey, content);
    } catch (err: any) {
      alert(`AI compilation failed: ${err.message || err}`);
    } finally {
      setGeneratingSection(null);
    }
  };

  const handleCopyText = (text: string) => {
    copyTextToClipboard(text).then(success => {
      if (success) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      } else {
        alert("Failed to copy text. Please copy manually.");
      }
    });
  };

  // --- GENERATE LATEX SOURCE CODE (BOOKTABS STYLE) ---
  const generateLaTeX = () => {
    if (!lastResult) return '% No estimation result found in active history.\n% Please run a model in OLS, Panel FE, or Causal Inference first.';
    
    const results = lastResult.results;
    const spec = lastResult.specification || '';
    const moduleName = lastResult.module || 'Model';
    const outcomeVar = spec.split('~')[0]?.trim() || 'Y';

    let coefs: any[] = [];
    let r2 = 0;
    let adjR2 = 0;
    let n = 0;
    let rmse = 0;
    let fStat = 0;

    if (results?.coefficients) {
      coefs = results.coefficients;
      r2 = results.rSquared || 0;
      adjR2 = results.adjRSquared || 0;
      n = results.n || 0;
      rmse = results.rmse || 0;
      fStat = results.fStat || 0;
    } else if (results?.secondStage?.coefficients) {
      coefs = results.secondStage.coefficients;
      r2 = results.secondStage.rSquared || 0;
      n = results.secondStage.n || 0;
      rmse = results.secondStage.rmse || 0;
    } else if (results?.ols?.coefficients) {
      coefs = results.ols.coefficients;
      r2 = results.ols.rSquared || 0;
      adjR2 = results.ols.adjRSquared || 0;
      n = results.ols.n || 0;
      rmse = results.ols.rmse || 0;
      fStat = results.ols.fStat || 0;
    }

    if (coefs.length === 0) {
      return `% Selected module run (${moduleName}) is not a standard regression matrix.\n% LaTeX booktabs tables are optimized for OLS/FE specifications.`;
    }

    let latexBody = '';
    coefs.forEach(c => {
      const bStars = stars(c.pValue);
      latexBody += `  ${c.variable.replace(/_/g, '\\_')} & ${fmt(c.estimate)}^{${bStars}} \\\\\n`;
      latexBody += `  & (${fmt(c.stdError)}) \\\\\n`;
    });

    return `\\begin{table}[!htbp] \\centering
  \\caption{Econometric Results: ${moduleName} Specification}
  \\label{tab:regression_${moduleName.toLowerCase()}}
\\begin{tabular}{@{\\extracolsep{5pt}}lc}
\\toprule
  & \\multicolumn{1}{c}{\\textit{Dependent variable:}} \\\\
\\cline{2-2}
  & ${outcomeVar.replace(/_/g, '\\_')} \\\\
\\midrule
${latexBody}\\midrule
Observations & ${n} \\\\
R$^{2}$ & ${fmt(r2)} \\\\
${adjR2 ? `Adjusted R$^{2}$ & ${fmt(adjR2)} \\\\` : ''}
Residual Std. Error & ${fmt(rmse)} \\\\
${fStat ? `F Statistic & ${fmt(fStat)} \\\\` : ''}
\\bottomrule
\\textit{Note:} & \\multicolumn{1}{r}{$^{*}$p$<$0.1; $^{**}$p$<$0.05; $^{***}$p$<$0.01} \\\\
\\end{tabular}
\\end{table}`;
  };

  // --- GENERATE APA PARAGRAPH VIA NODE API PROXY ---
  const handleGenerateAPA = async () => {
    if (!lastResult) return;
    setApaLoading(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/ai/explain', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          result: lastResult.results,
          type: lastResult.module,
          mode: 'student',
          researchQuestion,
          format: 'apa'
        })
      });

      if (!response.ok) {
        throw new Error('AI Explain service failed to compile APA narrative.');
      }

      const data = await response.json();
      setApaParagraph(data.response || '');
    } catch (err: any) {
      alert(`Synthesis error: ${err.message || err}`);
    } finally {
      setApaLoading(false);
    }
  };

  const handleExportFullManuscript = () => {
    if (!lastResult) return;
    const moduleName = lastResult.module || 'Model';
    const fullText = `=========================================
ECONOMETRIC RESEARCH REPORT: ${sections.title || 'Untitled Study'}
=========================================
Target Journal Format: ${targetJournal}
Generated: ${new Date().toLocaleDateString()}

RESEARCH QUESTION:
=========================================
${sections.researchQuestion || 'Not drafted.'}

DATA SOURCE & STRUCTURE:
=========================================
${sections.data || 'Not drafted.'}

ESTIMATION METHODOLOGY:
=========================================
${sections.methodology || 'Not drafted.'}

EMPIRICAL FINDINGS:
=========================================
${sections.results || 'Not drafted.'}

SPECIFICATION DIAGNOSTICS:
=========================================
${sections.diagnostics || 'Not drafted.'}

LATEX SOURCE (BOOKTABS):
=========================================
${generateLaTeX()}

APA ACADEMIC NARRATIVE:
=========================================
${apaParagraph || 'No APA academic narrative has been synthesized in this session.'}
`;
    safeDownloadFile(fullText, `econometric_manuscript_${moduleName.toLowerCase()}_${Date.now()}.txt`, 'text/plain');
  };

  const [isExportingReplication, setIsExportingReplication] = useState(false);

  const handleExportReplicationPackage = async () => {
    if (history.length === 0) {
      alert("Please run at least one model before generating a replication package.");
      return;
    }
    setIsExportingReplication(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/export/replication-package', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          history,
          currentDataset: dataset,
          researchQuestion
        })
      });

      if (!response.ok) {
        throw new Error('Server failed to compile the replication package ZIP.');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `replication_package_${dataset?.name || 'economics'}_v1.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error(err);
      alert(`Replication export failed: ${err.message || err}`);
    } finally {
      setIsExportingReplication(false);
    }
  };

  const latexCode = generateLaTeX();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-900 italic">Academic Writing & Export Lab</h1>
          <p className="text-sm text-stone-500 font-serif italic mt-1">
            Convert empirical results into publications: AER-style drafts, LaTeX booktabs matrices, APA text, and file packages.
          </p>
        </div>
        
        {/* Sub-Tab Selection */}
        <div className="flex bg-stone-100 p-1 rounded-xl shrink-0 self-start md:self-center">
          <button
            onClick={() => setActiveTab('draft')}
            className={cn(
              "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              activeTab === 'draft' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            AER Manuscript Draft
          </button>
          <button
            onClick={() => setActiveTab('latex')}
            className={cn(
              "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              activeTab === 'latex' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            LaTeX Booktabs
          </button>
          <button
            onClick={() => setActiveTab('apa')}
            className={cn(
              "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              activeTab === 'apa' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            APA Write-up
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={cn(
              "px-3 py-1.5 text-xs font-bold uppercase tracking-wider rounded-lg transition-all",
              activeTab === 'export' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Exports
          </button>
        </div>
      </div>

      {/* active dataset alert */}
      {!dataset && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex gap-3 text-amber-800 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Active Dataset Required.</span> Please load your econometric variables in the Data Workspace to fully generate publication-grade drafts and tables.
          </div>
        </div>
      )}

      {/* TAB 1: MANUSCRIPT SECTIONS DRAFTING */}
      {activeTab === 'draft' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Title Section */}
            <div className="card-premium p-6 bg-white space-y-3">
              <label className="text-xs font-bold uppercase tracking-widest text-stone-500 block">Research Title</label>
              <input 
                type="text"
                value={sections.title}
                onChange={(e) => updateSection('title', e.target.value)}
                placeholder="e.g., Household Income Shock and Child Schooling: Evidence from Rural Uttar Pradesh"
                className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-3 font-serif text-base text-stone-900 outline-none focus:bg-white focus:ring-4 focus:ring-stone-500/5 transition-all shadow-inner"
              />
            </div>

            {/* Structured Academic Draft Sections */}
            {[
              { key: 'researchQuestion', label: '1. Research Question & Identification' },
              { key: 'data', label: '2. Data & Descriptive Overview' },
              { key: 'methodology', label: '3. Econometric Strategy' },
              { key: 'results', label: '4. Main Empirical Results' },
              { key: 'diagnostics', label: '5. Diagnostic & Robustness Checks' }
            ].map(sec => (
              <div key={sec.key} className="card-premium p-6 bg-white space-y-4">
                <div className="flex items-center justify-between border-b border-stone-100 pb-3">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900">{sec.label}</h3>
                  <button
                    onClick={() => handleGenerateSection(sec.key as keyof ManuscriptSections, sec.label)}
                    disabled={generatingSection !== null}
                    className="flex items-center gap-1.5 px-3 py-1 bg-stone-100 hover:bg-stone-200 text-stone-700 rounded-lg text-xs font-bold transition-all"
                  >
                    {generatingSection === sec.key ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Drafting...
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-3.5 h-3.5" />
                        AI Draft
                      </>
                    )}
                  </button>
                </div>
                
                <textarea
                  value={sections[sec.key as keyof ManuscriptSections]}
                  onChange={(e) => updateSection(sec.key as keyof ManuscriptSections, e.target.value)}
                  placeholder={`Draft content for ${sec.label}...`}
                  className="w-full h-44 bg-stone-50 border border-stone-200 rounded-xl p-4 font-serif text-sm leading-relaxed text-stone-800 outline-none focus:bg-white focus:ring-4 focus:ring-stone-500/5 transition-all shadow-inner"
                />
              </div>
            ))}
          </div>

          <div className="space-y-6">
            {/* Journal Target Formatting Panel */}
            <div className="card-premium p-6 bg-white space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 border-b border-stone-100 pb-2">Target Journal Format</h3>
              <div className="space-y-3">
                {[
                  'American Economic Review (AER)',
                  'Journal of Econometrics',
                  'Econometrica',
                  'Economic & Political Weekly (EPW)',
                  'Custom'
                ].map(journal => (
                  <label key={journal} className="flex items-center gap-2.5 text-xs text-stone-600 font-serif cursor-pointer">
                    <input 
                      type="radio" 
                      name="journal" 
                      checked={targetJournal === journal}
                      onChange={() => setTargetJournal(journal)}
                      className="text-stone-900 focus:ring-stone-500"
                    />
                    {journal}
                  </label>
                ))}
              </div>

              {targetJournal === 'Custom' && (
                <input 
                  type="text"
                  placeholder="Enter journal requirements..."
                  value={customJournal}
                  onChange={(e) => setCustomJournal(e.target.value)}
                  className="w-full text-xs p-2 bg-stone-50 border border-stone-200 rounded-lg focus:bg-white outline-none"
                />
              )}
            </div>

            {/* Model Reference Selector Panel */}
            <div className="card-premium p-6 bg-white space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-widest text-stone-900 border-b border-stone-100 pb-2">Reference Model</h3>
              {history.length === 0 ? (
                <div className="text-xs text-stone-400 font-serif italic py-2">
                  No specifications run yet. Your AI assistants will draft using general principles instead of specific estimates.
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-[11px] text-stone-500 font-serif italic">AI assistants will formulate text explicitly based on this specification:</p>
                  {history.map(item => (
                    <button
                      key={item.id}
                      onClick={() => setReportDraft({ selectedModelId: item.id })}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all text-xs space-y-1",
                        selectedId === item.id 
                          ? "border-stone-800 bg-stone-950 text-white" 
                          : "border-stone-200 hover:bg-stone-50 text-stone-700"
                      )}
                    >
                      <div className="font-bold flex justify-between items-center">
                        <span>{item.module}</span>
                        <span className="text-[10px] opacity-70">{new Date(item.timestamp).toLocaleTimeString()}</span>
                      </div>
                      <div className="font-mono text-[10px] truncate opacity-80">{item.specification}</div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Export options */}
            <div className="card-premium p-6 bg-[#1B2E41] text-white space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider">Compile Draft Package</h3>
              <p className="text-xs text-slate-300 font-serif italic leading-relaxed">
                Save your full active report draft including Descriptive Data, Identification Strategy, and Latex booktabs source arrays.
              </p>
              <button
                onClick={handleExportFullManuscript}
                disabled={!lastResult}
                className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 text-[#1B2E41] py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all disabled:opacity-50"
              >
                <Download className="w-4 h-4" />
                Download Report (.TXT)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: LATEX BOOKTABS */}
      {activeTab === 'latex' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900">
              LaTeX Standard Regression Table (Booktabs Style)
            </h3>
            {lastResult && (
              <button
                onClick={() => handleCopyText(latexCode)}
                className="flex items-center gap-2 px-4 py-2 bg-[#1B2E41] hover:bg-[#243D54] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied LaTeX Code!' : 'Copy LaTeX Code'}
              </button>
            )}
          </div>

          <div className="relative">
            <pre className="bg-stone-950 text-stone-200 p-6 rounded-2xl font-mono text-xs leading-relaxed overflow-x-auto border border-stone-800 shadow-2xl h-[480px]">
              {latexCode}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 3: APA WRITE-UP */}
      {activeTab === 'apa' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900">
              APA Academic Narrative Paragraph
            </h3>
            {lastResult && (
              <button
                onClick={handleGenerateAPA}
                disabled={apaLoading}
                className="flex items-center gap-2 px-4 py-2 bg-[#1B2E41] hover:bg-[#243D54] text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all"
              >
                {apaLoading ? 'Synthesizing Prose...' : 'Generate APA write-up'}
              </button>
            )}
          </div>

          {apaParagraph ? (
            <div className="space-y-4">
              <textarea
                value={apaParagraph}
                onChange={(e) => setApaParagraph(e.target.value)}
                className="w-full h-64 bg-stone-50 border border-stone-200 rounded-2xl p-6 font-serif text-sm leading-relaxed text-stone-800 outline-none focus:bg-white focus:ring-4 focus:ring-stone-500/5 transition-all shadow-inner"
              />
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={() => handleCopyText(apaParagraph)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-[#1B2E41] hover:bg-[#243D54] text-white rounded-lg text-xs font-bold uppercase tracking-wider"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-300" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied Narrative!' : 'Copy Paragraph'}
                </button>
              </div>
            </div>
          ) : (
            <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-64 flex flex-col justify-center items-center">
              <FileText className="w-10 h-10 text-stone-300 mb-2" />
              <h4 className="text-sm font-bold text-stone-600">No APA Paragraph Synthesized</h4>
              <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">
                Click "Generate" above to convert raw indices into structured publication narratives.
              </p>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: EXPORT CENTER */}
      {activeTab === 'export' && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="card-premium p-6 bg-white space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 border-b border-stone-100 pb-2">Session Logs & Metadata</h3>
            <p className="text-xs text-stone-500 font-serif italic leading-relaxed">
              Export the entire interactive session: OLS and Panel configurations, specific model diagnostic outputs, and descriptive indices.
            </p>
            <div className="space-y-2">
              <button
                onClick={handleExportFullManuscript}
                disabled={!lastResult}
                className="w-full flex items-center justify-between p-3 border border-stone-200 hover:border-stone-800 hover:bg-stone-50 rounded-xl transition-all text-xs font-bold text-stone-800 disabled:opacity-50 cursor-pointer"
              >
                <span>Download Study Compendium (.TXT)</span>
                <FileDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="card-premium p-6 bg-white space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 border-b border-stone-100 pb-2">APA Section Export</h3>
            <p className="text-xs text-stone-500 font-serif italic leading-relaxed">
              Save your generated APA narrative and results write-up as standalone text files ready for import into Microsoft Word or Google Docs.
            </p>
            <button
              onClick={() => {
                if (!apaParagraph) {
                  alert("Please generate the APA write-up first before exporting the section.");
                  return;
                }
                safeDownloadFile(apaParagraph, 'empirical_narrative_apa.txt', 'text/plain');
              }}
              disabled={!apaParagraph}
              className="w-full flex items-center justify-between p-3 border border-stone-200 hover:border-stone-800 hover:bg-stone-50 rounded-xl transition-all text-xs font-bold text-stone-800 disabled:opacity-50 cursor-pointer"
            >
              <span>Download Empirical Narrative (.TXT)</span>
              <FileDown className="w-4 h-4" />
            </button>
          </div>

          <div className="card-premium p-6 bg-white space-y-4 border border-stone-200 flex flex-col justify-between">
            <div className="space-y-3">
              <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 border-b border-stone-100 pb-2">AEA Replication ZIP</h3>
              <p className="text-xs text-stone-500 font-serif italic leading-relaxed">
                Generate a publication-ready replication archive matching AEA Data Editor guidelines: contains dataset metadata, exact JSON runs, equivalent R and Stata script, and README.
              </p>
            </div>
            <button
              onClick={handleExportReplicationPackage}
              disabled={isExportingReplication || history.length === 0}
              className="w-full mt-4 flex items-center justify-between p-3 bg-stone-900 hover:bg-stone-800 text-white rounded-xl transition-all text-xs font-bold disabled:opacity-50 cursor-pointer"
            >
              <span>{isExportingReplication ? 'Compiling Package...' : 'Export AEA Replication Package'}</span>
              {isExportingReplication ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <FileDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Draft Update Modal */}
      {showDraftModal && (
        <div className="fixed inset-0 z-50 bg-stone-950/40 flex items-center justify-center p-4 backdrop-blur-sm">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-stone-700 shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-stone-900 text-sm">New Model Specification Found</h3>
                <p className="text-xs text-stone-500 leading-relaxed font-serif">
                  A newer estimation run is available in your history. Would you like to target future AI drafts using this new data reference?
                </p>
              </div>
            </div>
            <div className="flex gap-2.5 justify-end">
              <button
                onClick={() => setShowDraftModal(false)}
                className="px-4 py-2 rounded-xl text-stone-500 hover:text-stone-700 font-bold text-xs"
              >
                Keep Current Selection
              </button>
              <button
                onClick={handleUpdateToLatest}
                className="px-4 py-2 rounded-xl bg-[#1B2E41] hover:bg-[#243D54] text-white font-bold text-xs"
              >
                Link Latest Model
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
