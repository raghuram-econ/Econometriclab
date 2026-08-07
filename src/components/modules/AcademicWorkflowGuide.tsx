import React, { useState } from 'react';
import { useStore } from '../../store/useStore';
import { 
  Database, 
  Layers, 
  ShieldCheck, 
  FileText, 
  ArrowRight, 
  CheckCircle, 
  HelpCircle, 
  Copy, 
  Download, 
  RefreshCw, 
  Play, 
  Compass, 
  BookOpen, 
  Info,
  Check,
  AlertCircle
} from 'lucide-react';
import { safeDownloadFile, copyTextToClipboard } from '../../lib/utils';
import { ModuleTab } from '../../types';
import { getRecommendedReadings, RecommendedReadingsResponse } from '../../services/gemini';
import { Loader2, BookMarked, ExternalLink } from 'lucide-react';

// Steps definition for the pipeline
interface PipelineStep {
  id: number;
  title: string;
  subtitle: string;
  icon: any;
  tabId: ModuleTab;
  tabLabel: string;
  description: string;
  practices: string[];
  replicationOutput: string;
}

export function AcademicWorkflowGuide() {
  const { setActiveModule, addToast, currentDataset } = useStore();

  // Step 1: Active Pipeline Phase state
  const [activeStepId, setActiveStepId] = useState<number>(1);

  // Step 2: "What's My Specification?" Decision Tree state
  const [dataStructure, setDataStructure] = useState<'cross' | 'panel' | 'time'>('cross');
  const [depType, setDepType] = useState<'continuous' | 'binary' | 'count'>('continuous');
  const [endogeneitySuspected, setEndogeneitySuspected] = useState<'yes' | 'no'>('no');

  // Step 3: Interactive Replicability Checklist state
  const [checklistItems, setChecklistItems] = useState([
    { id: 'data_missing', label: 'Missing Values Coded', desc: 'Identify and convert system missing codes (e.g. -999, NA) into NaN in Variable View.', checked: false },
    { id: 'descriptive_stats', label: 'Descriptive Range Inspected', desc: 'Verify minimum, maximum, mean, and standard deviation to identify potential data anomalies or extreme outliers.', checked: false },
    { id: 'functional_form', label: 'Functional Form Justified', desc: 'Justify choices such as log-linear, log-log, or quadratic specifications based on economic theory.', checked: false },
    { id: 'collinearity', label: 'Multicollinearity Inspected', desc: 'Run Variance Inflation Factor (VIF) diagnostics. Ensure all continuous regressor VIFs are under 5.0.', checked: false },
    { id: 'heteroscedasticity', label: 'Heteroscedasticity Checked', desc: 'Run Breusch-Pagan/Cook-Weisberg tests and justify standard error adjustments (HC1/HC3 robust errors).', checked: false },
    { id: 'specification_parsimony', label: 'Parsimony Evaluated', desc: 'Examine Information Criteria (AIC/BIC) across multiple nested specifications to minimize overfitting.', checked: false },
    { id: 'endogeneity_control', label: 'Endogeneity / OVB Addressed', desc: 'Include appropriate control variables, test fixed effects, or employ Instrumental Variables (IV/2SLS).', checked: false },
    { id: 'seed_replication', label: 'Reproducible Seed / Run Verified', desc: 'Confirm that random processes or simulations use a fixed seed, and OLS numerical results are live-verified against Stata.', checked: false },
  ]);

  // Step 4: Replication Script Generator State
  const [studyTitle, setStudyTitle] = useState<string>('The Determinants of Real Economic Growth');
  const [depVarName, setDepVarName] = useState<string>('growth_rate');
  const [indepVarsText, setIndepVarsText] = useState<string>('inflation, trade_openness, government_exp, initial_gdp');
  const [selectedLanguage, setSelectedLanguage] = useState<'r' | 'stata' | 'python' | 'latex'>('r');

  // Helpers
  const checkedCount = checklistItems.filter(item => item.checked).length;
  const checklistCompleteness = Math.round((checkedCount / checklistItems.length) * 100);

  const getReplicabilityGrade = () => {
    if (checkedCount <= 2) return { grade: 'D - Draft Exploration', desc: 'Analysis is preliminary. Results are prone to specification errors and are not peer-review ready.', color: 'text-rose-600 bg-rose-50 border-rose-200' };
    if (checkedCount <= 5) return { grade: 'C - Working Paper Grade', desc: 'Core diagnostic variables are defined and descriptive data is validated. Meets basic working paper standards.', color: 'text-amber-600 bg-amber-50 border-amber-200' };
    if (checkedCount <= 7) return { grade: 'B - Journal-Ready Standard', desc: 'Highly robust modeling with heteroscedasticity controls and multicollinearity checks. Meets standard journal guidelines.', color: 'text-indigo-600 bg-indigo-50 border-indigo-200' };
    return { grade: 'A - Gold Standard Replicability', desc: 'Exceptional. Missing values handled, AIC/BIC compared, robust standard errors set, and script generated. Fully replicable.', color: 'text-emerald-600 bg-emerald-50 border-emerald-200' };
  };

  const gradeInfo = getReplicabilityGrade();

  const toggleChecklistItem = (id: string) => {
    setChecklistItems(prev => prev.map(item => item.id === id ? { ...item, checked: !item.checked } : item));
  };

  const handleSelectAllChecklist = (checked: boolean) => {
    setChecklistItems(prev => prev.map(item => ({ ...item, checked })));
  };

  // Step Navigation in Sidebar/Tabs
  const navigateToTab = (tabId: ModuleTab) => {
    setActiveModule(tabId);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    addToast('info', 'Navigation Activated', `Switched to active workspace: ${tabId.toUpperCase()}`);
  };

  // Pipeline phases specification
  const pipelineSteps: PipelineStep[] = [
    {
      id: 1,
      title: "Data Import & Prep",
      subtitle: "Phase 1: Diagnostic Hygiene",
      icon: Database,
      tabId: "data-upload",
      tabLabel: "Data Upload",
      description: "Clean empirical research starts with meticulous data sanitation. Rather than estimating models immediately, economists inspect metadata, specify the underlying data structure (cross-section, panel, or time-series), map survey missing-value markers, and review descriptive boundaries.",
      practices: [
        "Inspect descriptive ranges (min, max) in the Descriptive Statistics Lab to detect coding anomalies.",
        "Transform raw survey variables in Variable View (SPSS tab) to map categorical attributes and configure missing flags.",
        "Convert non-linear continuous relationships using logarithmic transformations where appropriate (e.g., ln(wage) to model returns to education)."
      ],
      replicationOutput: "Cleaned CSV dataset with detailed variable labels, missing-data guidelines, and an explicit data structure schema."
    },
    {
      id: 2,
      title: "Specification & Estimation",
      subtitle: "Phase 2: Econometric Strategy",
      icon: Layers,
      tabId: "ols",
      tabLabel: "Linear Models (OLS)",
      description: "Once the variables are clean, the researcher selects the regression model aligned with the research question. Whether running basic OLS, modeling nested groups with Fixed Effects, predicting probabilities with binary Logit, or forecasting with ARIMA, the key is aligning the model with the dataset structure.",
      practices: [
        "Establish a clear structural baseline specification based on established macroeconomic or microeconomic theory.",
        "Employ Panel Fixed Effects (FE/RE) when modeling longitudinal datasets to control for unobserved time-invariant entity characteristics.",
        "Utilize Causal Inference matching or Heckman Selection models when sample selection bias or non-random treatment assignment is suspected."
      ],
      replicationOutput: "Complete regression coefficients, baseline standard errors, model fit metrics, and nested alternative specifications."
    },
    {
      id: 3,
      title: "Diagnostic Verification",
      subtitle: "Phase 3: Stress-Testing Assumptions",
      icon: ShieldCheck,
      tabId: "diagnostics",
      tabLabel: "Diagnostics Center",
      description: "Relying on raw regression estimates without validation is a primary cause of peer-review rejection. Researchers must aggressively test key assumptions: homoscedasticity (Breusch-Pagan), independent errors (Durbin-Watson), and non-multicollinearity (Variance Inflation Factors).",
      practices: [
        "If the Breusch-Pagan p-value is significant (<0.05), reject homoscedasticity and strictly utilize robust standard errors (HC1/HC3) to adjust confidence intervals.",
        "Identify high multicollinearity if any regressor VIF exceeds 5.0. Consider pooling collinear predictors or removing redundant variables.",
        "Verify numerical accuracy with Live OLS checks against reference Stata values in the Numerical Accuracy Lab."
      ],
      replicationOutput: "Comprehensive table of test statistics (VIF, BP, DW), diagnostic plots, and an explicit justification of the standard error structure."
    },
    {
      id: 4,
      title: "Automated Interpretation",
      subtitle: "Phase 4: Synthesis & Publication",
      icon: FileText,
      tabId: "exports",
      tabLabel: "Manuscript Builder",
      description: "The final phase is translating mathematical results into scholarly prose. Researchers write their manuscript sections, compile regression tables using publication-ready formats, compile session summaries, and leverage AI reviews to simulate peer reviews.",
      practices: [
        "Generate automated, dual-mode 'Econometric Reviews' (Beginner Pedagogical & Advanced Peer Referee) directly from estimated model runs.",
        "Track model iterations dynamically inside the Robustness Vault and export reproducible Stata/R scripts.",
        "Assemble manuscript drafts including abstract, methodology, results, and diagnostic validations in the Manuscript Builder."
      ],
      replicationOutput: "Polished manuscript draft, complete LaTeX regression tables, replication scripts, and a full empirical report."
    }
  ];

  const activeStep = (pipelineSteps.find(s => s.id === activeStepId) || pipelineSteps[0]) as PipelineStep;

  // Step 1b: Recommended Readings state (maps each pipeline phase onto the
  // backend's fixed set of research-workflow stages)
  const [readingsResult, setReadingsResult] = useState<RecommendedReadingsResponse | null>(null);
  const [readingsLoading, setReadingsLoading] = useState(false);
  const [readingsError, setReadingsError] = useState<string | null>(null);

  const stageForStep: Record<number, { id: string; label: string }> = {
    1: { id: 'data-cleaning', label: 'Data Import & Prep' },
    2: { id: 'regression', label: 'Specification & Estimation' },
    3: { id: 'regression', label: 'Diagnostic Verification' },
    4: { id: 'manuscript', label: 'Automated Interpretation' },
  };

  const handleGetRecommendedReadings = async () => {
    const stage = stageForStep[activeStepId] || { id: 'data-cleaning', label: 'Data Import & Prep' };
    setReadingsLoading(true);
    setReadingsError(null);
    try {
      const result = await getRecommendedReadings(stage.id, stage.label);
      setReadingsResult(result);
    } catch (err: any) {
      setReadingsError(err.message || 'Failed to fetch recommended readings.');
      setReadingsResult(null);
    } finally {
      setReadingsLoading(false);
    }
  };

  // Dynamic Decision Tree Suggestion Logic
  const getDecisionTreeSuggestion = () => {
    if (dataStructure === 'panel') {
      return {
        model: "Panel Fixed Effects (FE) or Random Effects (RE)",
        tab: "fe" as ModuleTab,
        label: "Panel Data (FE/RE)",
        explanation: "Since your data follows entities (e.g. countries, firms) observed over multiple time periods, panel regression is ideal. Use Fixed Effects to absorb time-invariant unobserved heterogeneity (such as institutional quality) and run a Hausman test to compare against Random Effects.",
        diagnostics: ["Modified Wald Test for Heteroscedasticity", "Woolridge Test for Autocorrelation", "Hausman Specification Test"]
      };
    }
    if (dataStructure === 'time') {
      return {
        model: "ARIMA Forecasting or Advanced Vector Autoregression (VAR)",
        tab: "arima" as ModuleTab,
        label: "Forecasting (ARIMA)",
        explanation: "For single-entity sequential timeline measurements, you should apply time-series methods. Ensure your series is stationary (via Augmented Dickey-Fuller checks), then model auto-regressive (p) and moving-average (q) dynamics.",
        diagnostics: ["Augmented Dickey-Fuller (ADF) Unit Root Test", "Ljung-Box Q-statistic for Residual Autocorrelation", "AIC/BIC Parsimony Checks"]
      };
    }
    // Cross-Sectional cases
    if (depType === 'binary') {
      return {
        model: "Logistic or Probit Probability Regression",
        tab: "limited" as ModuleTab,
        label: "Probability Models (Logit)",
        explanation: "When your dependent variable is a binary choice (0 or 1), a linear OLS regression (Linear Probability Model) can predict values outside [0, 1]. Use Logit or Probit models to bound predictions between 0 and 1 using maximum likelihood estimation.",
        diagnostics: ["Likelihood Ratio Chi-Square", "Pseudo R-Squared (McFadden)", "Classification Accuracy Matrix"]
      };
    }
    if (depType === 'count') {
      return {
        model: "Generalized Linear Model (GLM - Poisson / Negative Binomial) or Heckman Selection",
        tab: "glm" as ModuleTab,
        label: "GLM / Heckman Selection",
        explanation: "For non-negative count integers or truncated/selected samples, standard linear OLS yields biased estimates. Employ Heckman Selection if you have sample-selection bias, or a Poisson GLM for count regressions.",
        diagnostics: ["Pearson Chi-Square Dispersion Test", "Inverse Mills Ratio Significance", "Residual Deviance Checks"]
      };
    }
    if (endogeneitySuspected === 'yes') {
      return {
        model: "Two-Stage Least Squares (2SLS) Instrumental Variables (IV)",
        tab: "causal" as ModuleTab,
        label: "Causal Inference",
        explanation: "If independent variables are correlated with the error term (due to omitted variables, measurement error, or reverse causality), OLS is biased and inconsistent. Find a valid external instrument (correlated with X but uncorrelated with Y) and run a 2SLS IV estimation.",
        diagnostics: ["Wu-Hausman Endogeneity Test", "Sargan Overidentification Test", "First-Stage F-Statistic (test for weak instruments, target > 10)"]
      };
    }
    return {
      model: "Ordinary Least Squares (OLS) with Robust Standard Errors",
      tab: "ols" as ModuleTab,
      label: "Linear Models (OLS)",
      explanation: "For continuous cross-sectional dependent variables without major endogeneity concerns, OLS serves as the classical best linear unbiased estimator (BLUE). However, always activate robust standard errors to protect your inferences from heteroscedasticity.",
      diagnostics: ["Breusch-Pagan Heteroscedasticity Test", "Variance Inflation Factors (VIF) for Multicollinearity", "Jarque-Bera Test for Residual Normality"]
    };
  };

  const decision = getDecisionTreeSuggestion();

  // Dynamic Replication Script Code Generator Logic
  const getGeneratedScript = () => {
    const cleanVars = indepVarsText.split(',').map(v => v.trim()).filter(Boolean);
    const varListString = cleanVars.join(' + ');
    const listForStata = cleanVars.join(' ');
    const pyListString = cleanVars.map(v => `'${v}'`).join(', ');

    if (selectedLanguage === 'r') {
      return `# ==========================================
# REPLICATION SCRIPT: ${studyTitle || 'Untitled Study'}
# Generated: ${new Date().toISOString().split('T')[0]}
# Framework: R Language (lmtest + sandwich)
# ==========================================

# 1. Load Required Libraries
if (!require("sandwich")) install.packages("sandwich")
if (!require("lmtest")) install.packages("lmtest")
if (!require("car")) install.packages("car")

library(sandwich) # Robust covariance matrix estimators
library(lmtest)   # Testing linear regression models
library(car)      # Companion to Applied Regression (VIF checks)

# 2. Import Empirical Dataset
# Replace 'dataset.csv' with your actual data file path
data <- read.csv("dataset.csv")

# 3. Handle Missing Values / Survey Markers
# Map custom missing codes (e.g., -999) to NA
data[data == -999] <- NA

# 4. Fit Baseline OLS Specification
baseline_formula <- ${depVarName} ~ ${varListString || '1'}
model <- lm(baseline_formula, data = data)

# 5. Extract Standard and HC3 Robust Standard Errors
cat("=== CLASSICAL ESTIMATION SUMMARY ===\\n")
print(summary(model))

cat("\\n=== HC3 ROBUST ESTIMATION SUMMARY ===\\n")
robust_se <- coeftest(model, vcov = vcovHC(model, type = "HC3"))
print(robust_se)

# 6. Diagnostic Stress Tests
cat("\\n=== VARIANCE INFLATION FACTORS (MULTICOLLINEARITY) ===\\n")
if (length(model$coefficients) > 2) {
  print(vif(model))
} else {
  cat("VIF check skipped: Less than 2 independent variables.\\n")
}

cat("\\n=== BREUSCH-PAGAN HETEROSCEDASTICITY TEST ===\\n")
print(bptest(model))

# 7. Residual Distribution Check
cat("\\n=== SHAPIRO-WILK NORMALITY TEST ===\\n")
# Sample limited to 5000 for Shapiro-Wilk safety
shapiro.test(residuals(model)[1:min(5000, length(residuals(model)))])
`;
    }

    if (selectedLanguage === 'stata') {
      return `* ==========================================
* REPLICATION SCRIPT: ${studyTitle || 'Untitled Study'}
* Generated: ${new Date().toISOString().split('T')[0]}
* Framework: Stata 17/18 Do-File
* ==========================================

clear all
macro drop _all
capture log close

* 1. Initialize Log File
log using replication_log.txt, text replace

* 2. Import Empirical Dataset
* Replace 'dataset.csv' with your actual data file path
import delimited using "dataset.csv", clear

* 3. Meticulous Missing Value Code Hygiene
* Convert typical numeric missing codes (e.g. -999) to Stata missing (.)
mvdecode _all, mv(-999)

* 4. Descriptive Statistics Baseline Review
summarize ${depVarName} ${listForStata}

* 5. OLS Regression with Robust Standard Errors (vce robust is Stata's HC1)
regress ${depVarName} ${listForStata}, vce(robust)

* 6. Multicollinearity Diagnostic (Variance Inflation Factors)
vif

* 7. Heteroscedasticity Diagnostics (Cameron & Trivedi's decomposition)
* Note: Run on classic regress without robust SEs
quietly regress ${depVarName} ${listForStata}
hettest
imtest, white

* 8. Residual Plot Export
predict res_temp, residuals
kdensity res_temp, normal title("Kernel Density of Residuals")
graph export residuals_distribution.png, replace

log close
exit
`;
    }

    if (selectedLanguage === 'python') {
      return `# ==========================================
# REPLICATION SCRIPT: ${studyTitle || 'Untitled Study'}
# Generated: ${new Date().toISOString().split('T')[0]}
# Framework: Python (pandas + statsmodels)
# ==========================================

import pandas as pd
import numpy as np
import statsmodels.api as sm
import statsmodels.stats.api as sms
from statsmodels.stats.outliers_influence import variance_inflation_factor

# 1. Load Empirical Dataset
# Replace 'dataset.csv' with your actual data file path
df = pd.read_csv('dataset.csv')

# 2. Missing Value Coding Hygiene
df.replace(-999, np.nan, inplace=True)

# 3. Handle Dropped Records (Listwise Deletion for OLS)
reg_vars = ['${depVarName}'] + [${pyListString}]
analysis_df = df[reg_vars].dropna()

# 4. Define Specifications
Y = analysis_df['${depVarName}']
X = analysis_df[[${pyListString}]]
X = sm.add_constant(X) # Add baseline Intercept vector

# 5. Fit OLS with Robust Standard Errors (HC3)
print("=== ESTIMATING ROBUST LINEAR MODEL (HC3) ===")
model = sm.OLS(Y, X)
results = model.fit(cov_type='HC3')
print(results.summary())

# 6. Variance Inflation Factors (VIF)
print("\\n=== MULTICOLLINEARITY ANALYSIS (VIF) ===")
vif_data = pd.DataFrame()
vif_data["variable"] = X.columns
vif_data["VIF"] = [variance_inflation_factor(X.values, i) for i in range(len(X.columns))]
print(vif_data[vif_data['variable'] != 'const'])

# 7. Breusch-Pagan Test
print("\\n=== BREUSCH-PAGAN HETEROSCEDASTICITY TEST ===")
name = ['Lagrange multiplier statistic', 'p-value', 'f-value', 'f p-value']
test = sms.het_breuschpagan(results.resid, X)
for k, v in zip(name, test):
    print(f"{k}: {v:.6f}")
`;
    }

    // LaTeX Case
    return `% ==========================================
% LATEX MANUSCRIPT REGRESSION TABLE TEMPLATE
% Generated: ${new Date().toISOString().split('T')[0]}
% Study: ${studyTitle || 'Untitled Study'}
% ==========================================

\\begin{table}[!htbp] \\centering
  \\caption{Ordinary Least Squares (OLS) Regression Estimates} 
  \\label{tab:regression_results}
\\begin{tabular}{lcs}
\\hline \\hline
 & \\multicolumn{2}{c}{\\textit{Dependent variable: ${depVarName.replace(/_/g, '\\_')}}} \\\\
\\cline{2-3} 
 Independent Variable & Baseline OLS (1) & Robust SE (2) \\\\ 
\\hline
\\\\
${cleanVars.map(v => ` ${v.replace(/_/g, '\\_')} & \\beta_{${v.substring(0,2)}} & \\beta_{${v.substring(0,2)}}^{Robust} \\\\ \n & (S.E.) & (Robust S.E.) \\\\`).join('\n\\\\\n')}
\\\\
 Constant (Intercept) & \\alpha & \\alpha^{Robust} \\\\
 & (S.E.) & (Robust S.E.) \\\\
\\\\
\\hline
Observations & N & N \\\\
R-squared & R^2 & R^2 \\\\
Adjusted R-squared & Adj. R^2 & Adj. R^2 \\\\
Residual Std. Error & RMSE & RMSE \\\\
F-Statistic & F-stat & Robust F-stat \\\\
\\hline \\hline
\\multicolumn{3}{l}{\\small \\textit{Note:} $^{*}$p$<$0.1; $^{**}$p$<$0.05; $^{***}$p$<$0.01. Standard errors in parentheses.} \\\\
\\multicolumn{3}{l}{\\small Model (2) implements Huber-White heteroscedasticity-consistent standard errors.} \\\\
\\end{tabular}
\\end{table}
`;
  };

  // Export Compliance Log as Markdown File
  const handleExportComplianceCertificate = () => {
    const timestamp = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const content = `# ECONOMETRICS LAB: REPLICATION COMPLIANCE REPORT
Generated: ${timestamp} UTC
License Status: Scholar Active

## STUDY METADATA
- **Study Title:** ${studyTitle}
- **Dependent Variable (Y):** ${depVarName}
- **Independent Variables (X):** ${indepVarsText}
- **Empirical Replicability Grade:** ${gradeInfo.grade}
- **Completeness Index:** ${checklistCompleteness}% (${checkedCount} of 8 items verified)

## VERIFIED REPLICABILITY CHECKLIST LOG
${checklistItems.map(item => `[${item.checked ? 'X' : ' '}] **${item.label}**
  *Description:* ${item.desc}
  *Status:* ${item.checked ? 'VERIFIED COMPLIANT' : 'PENDING ACTION'}
`).join('\n')}

## ECONOMETRIC METHODOLOGY JUSTIFICATION
Based on the diagnostic questionnaire, the selected research framework targets a **${dataStructure === 'cross' ? 'Cross-Sectional' : dataStructure === 'panel' ? 'Panel Data' : 'Time Series'}** structure, with a **${depType}** dependent variable, and endogeneity suspect status marked as **${endogeneitySuspected.toUpperCase()}**.
Recommended Model Approach: ${decision.model}

---
*Verified by the Academic Workflow Integrity Pipeline. Save this report in your manuscript's replication archive folder alongside your code and datasets.*
`;

    safeDownloadFile(content, `replication_compliance_${depVarName}.md`);
    addToast('success', 'Compliance Log Exported', 'A replication compliance markdown log has been downloaded successfully.');
  };

  // Download replication code script
  const handleDownloadScriptFile = () => {
    const code = getGeneratedScript();
    let ext = 'R';
    if (selectedLanguage === 'stata') ext = 'do';
    if (selectedLanguage === 'python') ext = 'py';
    if (selectedLanguage === 'latex') ext = 'tex';

    safeDownloadFile(code, `replication_script_${depVarName}.${ext}`);
    addToast('success', 'Script Downloaded', `Generated replication .${ext} script saved to files.`);
  };

  const handleCopyScript = () => {
    copyTextToClipboard(getGeneratedScript());
    addToast('success', 'Copied to Clipboard', 'Replication script copied to system clipboard.');
  };

  return (
    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-700 animate-duration-500">
      
      {/* Elegant Header with Academic Tone */}
      <header className="space-y-3">
        <div className="flex items-center gap-2.5">
          <div className="p-2 bg-slate-900 text-white rounded-lg">
            <Compass className="w-5 h-5" />
          </div>
          <span className="text-[10px] font-mono tracking-[0.2em] font-bold text-blue-600 uppercase">Scholarly Pipeline</span>
        </div>
        <h1 className="font-serif text-3xl font-extrabold text-slate-950 tracking-tight">
          Academic Workflow Guide
        </h1>
        <p className="text-slate-600 font-serif leading-relaxed text-sm max-w-3xl text-justify">
          Welcome to the professional researcher's pipeline guide. In economics and quantitative social sciences, empirical credibility demands perfect replicability, rigorous diagnostic validation, and theoretical coherence. Use this dashboard to design, verify, and document your academic workflow.
        </p>
      </header>

      {/* SECTION 1: Interactive Pipeline Visualizer */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="font-serif text-lg font-bold text-slate-900 flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-500" />
            1. The Econometric Research Pipeline
          </h2>
          <p className="text-xs text-slate-500 mt-1">Click each phase of the pipeline below to view the professional best practices and recommended lab modules.</p>
        </div>

        {/* Pipeline horizontal selector tabs */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {pipelineSteps.map((step) => {
            const StepIcon = step.icon;
            const isActive = activeStepId === step.id;
            return (
              <button
                key={step.id}
                onClick={() => setActiveStepId(step.id)}
                className={`flex flex-col items-start p-4 rounded-lg border text-left transition-all duration-300 relative ${
                  isActive 
                    ? "border-indigo-600 bg-indigo-50/40 shadow-sm" 
                    : "border-slate-200 hover:border-slate-350 hover:bg-slate-50/50"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <div className={`p-1.5 rounded-md ${isActive ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    <StepIcon className="w-4 h-4" />
                  </div>
                  <span className="text-[10px] font-mono font-bold text-slate-400">0{step.id}</span>
                </div>
                <h3 className="font-sans text-xs font-bold text-slate-900 mt-3">{step.title}</h3>
                <p className="text-[10px] text-slate-500 mt-0.5 truncate w-full">{step.subtitle}</p>
                {isActive && (
                  <div className="absolute bottom-0 inset-x-0 h-0.5 bg-indigo-600 rounded-b-lg" />
                )}
              </button>
            );
          })}
        </div>

        {/* Selected Phase Detail Card */}
        <div className="bg-slate-50/60 rounded-xl border border-slate-200/50 p-6 space-y-6 animate-in fade-in duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest font-black text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                {activeStep.subtitle}
              </span>
              <h3 className="font-serif text-xl font-bold text-slate-900 mt-2">{activeStep.title}</h3>
            </div>
            
            <button
              onClick={() => navigateToTab(activeStep.tabId)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold transition-all shrink-0 shadow-sm"
            >
              <Play className="w-3.5 h-3.5" />
              Open {activeStep.tabLabel} Module
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-slate-700 font-serif leading-relaxed text-[13px] text-justify">
            {activeStep.description}
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-lg border border-slate-200/60 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                Economist Best Practices
              </h4>
              <ul className="space-y-2">
                {activeStep.practices.map((practice, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed font-serif">
                    <span className="text-indigo-500 font-bold font-mono mt-0.5">{i+1}.</span>
                    <span>{practice}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-white rounded-lg border border-slate-200/60 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-blue-500" />
                Standard Replication Archive Output
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed font-serif text-justify">
                To satisfy external journal referees and maintain robust reproducible science, this phase should generate:
              </p>
              <div className="p-3 bg-slate-50 border border-slate-100 rounded text-xs font-mono text-slate-700 leading-normal">
                {activeStep.replicationOutput}
              </div>
            </div>
          </div>

          {/* Recommended Readings for this pipeline phase */}
          <div className="bg-white rounded-lg border border-slate-200/60 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <BookMarked className="w-4 h-4 text-emerald-500" />
                Recommended Readings for This Phase
              </h4>
              <button
                onClick={handleGetRecommendedReadings}
                disabled={readingsLoading}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 shrink-0"
              >
                {readingsLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <BookMarked className="w-3.5 h-3.5" />}
                {readingsLoading ? 'Searching...' : 'Get Readings'}
              </button>
            </div>
            {readingsError && (
              <p className="text-xs text-rose-600 font-serif">{readingsError}</p>
            )}
            {readingsResult && (
              <div className="space-y-3 animate-in fade-in duration-300">
                <p className="text-xs text-slate-700 font-serif leading-relaxed whitespace-pre-wrap">{readingsResult.response}</p>
                {readingsResult.links.length > 0 && (
                  <ul className="space-y-1.5 pt-2 border-t border-slate-100">
                    {readingsResult.links.map((link, i) => (
                      <li key={i}>
                        <a
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-indigo-600 hover:text-indigo-800 font-serif inline-flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3 shrink-0" />
                          {link.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      {/* SECTION 2: Interactive Specification Decision Tree */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-8">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="font-serif text-lg font-bold text-slate-900 flex items-center gap-2">
            <Compass className="w-5 h-5 text-amber-500" />
            2. "What's My Specification?" decision wizard
          </h2>
          <p className="text-xs text-slate-500 mt-1">Answer the 3 structural questions below. The econometrics advisor will dynamically suggest the correct estimation model and necessary diagnostics.</p>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Question 1: Structure */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Question 1: Data structure</label>
            <p className="text-[10px] text-slate-500 font-serif leading-relaxed">How is your dataset structured across entities and temporal ranges?</p>
            <div className="space-y-2 pt-2">
              {[
                { val: 'cross', label: 'Cross-Sectional', desc: 'Single point in time, multiple subjects (e.g. surveys).' },
                { val: 'panel', label: 'Panel (Longitudinal)', desc: 'Multiple subjects observed over multiple years/periods.' },
                { val: 'time', label: 'Time-Series', desc: 'Single subject (e.g. nation GDP) tracked over linear time.' }
              ].map((opt) => (
                <button
                  key={opt.val}
                  onClick={() => setDataStructure(opt.val as any)}
                  className={`w-full p-2.5 rounded text-left text-xs border transition-all ${
                    dataStructure === opt.val 
                      ? "bg-white border-amber-500 shadow-sm text-slate-900 font-bold" 
                      : "bg-slate-100/50 border-slate-200 hover:bg-white hover:border-slate-300 text-slate-600"
                  }`}
                >
                  <p className="font-bold">{opt.label}</p>
                  <p className="text-[9px] font-normal text-slate-500 font-serif mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Question 2: Dependent Variable */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Question 2: Dependent variable type</label>
            <p className="text-[10px] text-slate-500 font-serif leading-relaxed">What is the measurement scale of your outcome variable (Y)?</p>
            <div className="space-y-2 pt-2">
              {[
                { val: 'continuous', label: 'Continuous / Numeric', desc: 'Infinite decimals (e.g., wage, GDP, blood pressure, rate).' },
                { val: 'binary', label: 'Binary Choice (0 / 1)', desc: 'Two outcomes (e.g., employed vs unemployed, passed vs failed).' },
                { val: 'count', label: 'Count / Selected Sample', desc: 'Discrete non-negative integers or sample truncation.' }
              ].map((opt) => (
                <button
                  key={opt.val}
                  disabled={dataStructure === 'time'} // Disable count/binary options for simplified time series
                  onClick={() => setDepType(opt.val as any)}
                  className={`w-full p-2.5 rounded text-left text-xs border transition-all ${
                    dataStructure === 'time' && opt.val !== 'continuous'
                      ? "opacity-40 cursor-not-allowed bg-slate-200 border-slate-200 text-slate-400"
                      : depType === opt.val 
                      ? "bg-white border-amber-500 shadow-sm text-slate-900 font-bold" 
                      : "bg-slate-100/50 border-slate-200 hover:bg-white hover:border-slate-300 text-slate-600"
                  }`}
                >
                  <p className="font-bold">{opt.label}</p>
                  <p className="text-[9px] font-normal text-slate-500 font-serif mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Question 3: Endogeneity */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">Question 3: Suspect endogeneity?</label>
            <p className="text-[10px] text-slate-500 font-serif leading-relaxed">Do you suspect omitted variables, reverse causality, or measurement bias?</p>
            <div className="space-y-2 pt-2">
              {[
                { val: 'no', label: 'No Suspected Endogeneity', desc: 'Covariates are exogenous. Randomization or rich control matrix available.' },
                { val: 'yes', label: 'Yes (OVB / Endogeneity)', desc: 'Crucial covariates omitted. Potential reverse causation suspected.' }
              ].map((opt) => (
                <button
                  key={opt.val}
                  disabled={dataStructure !== 'cross' || depType !== 'continuous'} // Simplification boundary
                  onClick={() => setEndogeneitySuspected(opt.val as any)}
                  className={`w-full p-2.5 rounded text-left text-xs border transition-all ${
                    (dataStructure !== 'cross' || depType !== 'continuous') && opt.val === 'yes'
                      ? "opacity-40 cursor-not-allowed bg-slate-200 border-slate-200 text-slate-400"
                      : endogeneitySuspected === opt.val 
                      ? "bg-white border-amber-500 shadow-sm text-slate-900 font-bold" 
                      : "bg-slate-100/50 border-slate-200 hover:bg-white hover:border-slate-300 text-slate-600"
                  }`}
                >
                  <p className="font-bold">{opt.label}</p>
                  <p className="text-[9px] font-normal text-slate-500 font-serif mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recommendation Panel */}
        <div className="bg-amber-50/40 rounded-xl border border-amber-200 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-amber-200/50 pb-3">
            <div>
              <span className="text-[10px] font-mono uppercase tracking-widest font-black text-amber-700 bg-amber-100/55 px-2 py-0.5 rounded-full">
                Decision Recommendation
              </span>
              <h3 className="font-serif text-lg font-bold text-slate-950 mt-1.5">
                Recommended Specification: <span className="text-amber-800 underline decoration-amber-400 decoration-2">{decision.model}</span>
              </h3>
            </div>
            
            <button
              onClick={() => navigateToTab(decision.tab)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-950 hover:bg-slate-850 text-white rounded-lg text-xs font-bold transition-all shrink-0"
            >
              Open {decision.label} tab
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                Methodological Justification
              </h4>
              <p className="text-xs text-slate-700 leading-relaxed font-serif text-justify">
                {decision.explanation}
              </p>
            </div>

            <div className="space-y-2 bg-white/70 border border-amber-200 p-3 rounded">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1">
                <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                Mandatory Diagnostic Suite
              </h4>
              <ul className="space-y-1.5 pl-1">
                {decision.diagnostics.map((test, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-[11px] font-mono text-slate-600 leading-snug">
                    <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{test}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: Interactive Replicability Checklist */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-900 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-emerald-500" />
              3. Interactive Replicability Compliance Checklist
            </h2>
            <p className="text-xs text-slate-500 mt-1">Verify your empirical procedure against core scientific benchmarks to check your publication readiness score.</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleSelectAllChecklist(true)}
              className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              Check All
            </button>
            <button
              onClick={() => handleSelectAllChecklist(false)}
              className="px-2.5 py-1 text-[10px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded transition-colors"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Real-time Completeness Progress Bar and Grading */}
        <div className="grid md:grid-cols-3 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200/60">
          <div className="space-y-2 md:col-span-1">
            <span className="text-[9px] font-mono font-black uppercase text-slate-400">Compliance Index</span>
            <div className="flex items-baseline gap-2">
              <span className="font-mono text-4xl font-extrabold text-slate-900">{checklistCompleteness}%</span>
              <span className="text-xs text-slate-500 font-serif">({checkedCount} of 8 verified)</span>
            </div>
            
            {/* Visual Progress Bar */}
            <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 rounded-full ${
                  checklistCompleteness < 40 
                    ? "bg-rose-500" 
                    : checklistCompleteness < 80 
                    ? "bg-amber-500" 
                    : "bg-emerald-500"
                }`}
                style={{ width: `${checklistCompleteness}%` }}
              />
            </div>
          </div>

          <div className={`md:col-span-2 p-4 rounded-lg border flex flex-col justify-between ${gradeInfo.color}`}>
            <div className="space-y-1">
              <span className="text-[9px] font-mono font-black uppercase tracking-widest opacity-80">Replicability Rating</span>
              <p className="text-sm font-bold font-sans">{gradeInfo.grade}</p>
              <p className="text-[11px] font-serif leading-relaxed opacity-90 mt-1">{gradeInfo.desc}</p>
            </div>
            
            <div className="flex justify-end pt-2">
              <button
                onClick={handleExportComplianceCertificate}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded text-xs font-bold transition-all shadow-sm"
              >
                <Download className="w-3.5 h-3.5" />
                Export Compliance Certificate (.md)
              </button>
            </div>
          </div>
        </div>

        {/* Checklist item list */}
        <div className="grid sm:grid-cols-2 gap-4">
          {checklistItems.map((item) => (
            <div 
              key={item.id}
              onClick={() => toggleChecklistItem(item.id)}
              className={`p-3.5 rounded-lg border cursor-pointer transition-all flex items-start gap-3 select-none ${
                item.checked 
                  ? "border-emerald-200 bg-emerald-50/20" 
                  : "border-slate-200 bg-white hover:bg-slate-50/60"
              }`}
            >
              <div className={`w-4.5 h-4.5 border rounded flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                item.checked ? "bg-emerald-500 border-emerald-500 text-white" : "border-slate-300 bg-white"
              }`}>
                {item.checked && <Check className="w-3 h-3 stroke-[3]" />}
              </div>
              <div className="space-y-0.5">
                <h4 className={`text-xs font-bold font-sans ${item.checked ? "text-slate-900" : "text-slate-700"}`}>
                  {item.label}
                </h4>
                <p className="text-[10px] text-slate-500 font-serif leading-relaxed text-justify">
                  {item.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* SECTION 4: Dynamic Replication Script Generator */}
      <section className="bg-white rounded-xl border border-slate-200/80 shadow-sm p-6 sm:p-8 space-y-6">
        <div className="border-b border-slate-100 pb-4">
          <h2 className="font-serif text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            4. Dynamic Replication Script & Table Generator
          </h2>
          <p className="text-xs text-slate-500 mt-1">Configure your empirical specifications below. The generator will instantly synthesize replication scripts or LaTeX manuscripts ready for publication.</p>
        </div>

        <div className="grid md:grid-cols-4 gap-6">
          {/* Controls Panel */}
          <div className="md:col-span-1 space-y-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Script settings</h3>
            
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase text-slate-600">Study / Project Title</label>
              <input
                type="text"
                value={studyTitle}
                onChange={(e) => setStudyTitle(e.target.value)}
                className="w-full p-2 text-xs border border-slate-200 rounded focus:border-indigo-500 focus:outline-none"
                placeholder="Study Title"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase text-slate-600">Dependent Variable (Y)</label>
              <input
                type="text"
                value={depVarName}
                onChange={(e) => setDepVarName(e.target.value)}
                className="w-full p-2 text-xs border border-slate-200 rounded focus:border-indigo-500 focus:outline-none font-mono"
                placeholder="e.g. wage"
              />
            </div>

            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase text-slate-600">Independent Variables (X)</label>
              <textarea
                value={indepVarsText}
                rows={3}
                onChange={(e) => setIndepVarsText(e.target.value)}
                className="w-full p-2 text-xs border border-slate-200 rounded focus:border-indigo-500 focus:outline-none font-mono"
                placeholder="Comma separated variables"
              />
              <span className="text-[8px] text-slate-400 font-serif">Separate variables with commas (e.g. educ, exper).</span>
            </div>

            {/* Language select buttons */}
            <div className="space-y-1.5">
              <label className="block text-[10px] font-bold uppercase text-slate-600">Output Target</label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'r', label: 'R Code' },
                  { id: 'stata', label: 'Stata' },
                  { id: 'python', label: 'Python' },
                  { id: 'latex', label: 'LaTeX' }
                ].map((lang) => (
                  <button
                    key={lang.id}
                    onClick={() => setSelectedLanguage(lang.id as any)}
                    className={`px-2.5 py-1.5 text-xs font-bold border rounded transition-all ${
                      selectedLanguage === lang.id 
                        ? "bg-indigo-600 text-white border-indigo-600 shadow-sm" 
                        : "bg-white border-slate-200 hover:bg-slate-50 text-slate-600"
                    }`}
                  >
                    {lang.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Code display screen */}
          <div className="md:col-span-3 flex flex-col rounded-lg border border-slate-200 overflow-hidden">
            <div className="bg-slate-900 px-4 py-2.5 flex items-center justify-between text-slate-400 font-mono text-[10px]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <span className="ml-2">
                  {selectedLanguage === 'r' ? 'r_replication_script.R' : selectedLanguage === 'stata' ? 'stata_replication.do' : selectedLanguage === 'python' ? 'python_replication.py' : 'manuscript_table.tex'}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopyScript}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
                <button
                  onClick={handleDownloadScriptFile}
                  className="flex items-center gap-1 hover:text-white transition-colors"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
              </div>
            </div>

            <div className="flex-1 bg-slate-950 p-4 font-mono text-xs text-indigo-200 overflow-auto max-h-[360px] whitespace-pre select-all selection:bg-indigo-900 selection:text-white custom-scrollbar">
              {getGeneratedScript()}
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER METADATA */}
      <footer className="text-center font-serif text-slate-400 text-xs py-4 border-t border-slate-100">
        Economics Learning Lab (Beta) • Verified Replicability Protocol • Rel 3.4.0
      </footer>

    </div>
  );
}
