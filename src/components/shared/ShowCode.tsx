import React, { useState } from 'react';
import { Terminal, Copy, Check, ChevronDown, ChevronUp, FileCode } from 'lucide-react';
import { cn } from '../../lib/utils';

export interface ShowCodeProps {
  parameters: {
    modelType: "ols" | "logit" | "probit" | "panel_fe" | "panel_re" | "iv" | "arima" | "survival_cox";
    yVariable: string;
    xVariables: string[];
    options?: {
      robust?: boolean;
      clusterVar?: string;
      seType?: "hc1" | "hc2" | "hc3";
      panelId?: string;
      timeId?: string;
      instruments?: string[];
      orders?: [number, number, number]; // [p, d, q] for ARIMA
    };
  };
}

export default function ShowCode({ parameters }: ShowCodeProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'stata' | 'r' | 'python'>('stata');
  const [copied, setCopied] = useState(false);

  const { modelType, yVariable, xVariables, options = {} } = parameters;
  const y = yVariable || 'y';
  const xVars = xVariables && xVariables.length > 0 ? xVariables : ['x1', 'x2', 'x3'];
  const robust = options.robust ?? false;
  const clusterVar = options.clusterVar;
  const panelId = options.panelId || 'id';
  const timeId = options.timeId || 'time';
  const instruments = options.instruments || ['z1', 'z2'];
  const orders = options.orders || [1, 1, 1];

  // Helper to escape and highlight keywords with custom Tailwind classes
  const highlightCode = (code: string, language: 'stata' | 'r' | 'python') => {
    let escaped = code
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

    if (language === 'stata') {
      // Command names
      const cmds = /\b(use|clear|regress|estimates|store|esttab|logit|probit|xtset|xtreg|ivregress|2sls|arima|stcox|stset|tsset)\b/g;
      escaped = escaped.replace(cmds, '<span class="text-[#60a5fa] font-semibold">$1</span>');
      // Options and sub-parameters
      const opts = /\b(vce|robust|cluster|fe|re|order|se|star|pr2|failure)\b/g;
      escaped = escaped.replace(opts, '<span class="text-[#c084fc]">$1</span>');
      // Comments
      escaped = escaped.replace(/^(\s*\*.*)$/gm, '<span class="text-stone-500 italic">$1</span>');
    } else if (language === 'r') {
      // R commands/functions
      const cmds = /\b(library|read\.csv|feols|modelsummary|lm|coeftest|vcovHC|glm|Arima|coxph|Surv|plm|ts|summary|binomial|as\.formula)\b/g;
      escaped = escaped.replace(cmds, '<span class="text-[#c084fc] font-semibold">$1</span>');
      // Comments
      escaped = escaped.replace(/(#.*)$/gm, '<span class="text-stone-500 italic">$1</span>');
      // Strings
      escaped = escaped.replace(/("[^"]*")/g, '<span class="text-[#fde047]">$1</span>');
      escaped = escaped.replace(/('[^']*')/g, '<span class="text-[#fde047]">$1</span>');
    } else if (language === 'python') {
      // Python imports & flow keywords
      const keywords = /\b(import|as|from|print|def|return|class|if|else|elif|in|for|while)\b/g;
      escaped = escaped.replace(keywords, '<span class="text-[#34d399] font-semibold">$1</span>');
      // Classes & stats models calls
      const funcs = /\b(add_constant|OLS|Logit|Probit|PanelOLS|RandomEffects|IV2SLS|ARIMA|CoxPHFitter|fit|summary|read_csv|set_index|print_summary)\b/g;
      escaped = escaped.replace(funcs, '<span class="text-[#38bdf8] font-semibold">$1</span>');
      // Comments
      escaped = escaped.replace(/(#.*)$/gm, '<span class="text-stone-500 italic">$1</span>');
      // Strings
      escaped = escaped.replace(/("[^"]*")/g, '<span class="text-[#fde047]">$1</span>');
      escaped = escaped.replace(/('[^']*')/g, '<span class="text-[#fde047]">$1</span>');
    }

    return <code className="block leading-relaxed" dangerouslySetInnerHTML={{ __html: escaped }} />;
  };

  const getStataCode = (): string => {
    const vceOption = clusterVar ? `, vce(cluster ${clusterVar})` : robust ? `, vce(robust)` : '';
    switch (modelType) {
      case 'ols':
        return `* 1. Load your econometric dataset
use "your_data.dta", clear

* 2. Run Ordinary Least Squares (OLS) regression
regress ${y} ${xVars.join(' ')}${vceOption}

* 3. Export academic-ready results using esttab
estimates store model_ols
esttab model_ols, se star(* 0.10 ** 0.05 *** 0.01) b(%8.4f) se(%8.4f)`;

      case 'logit':
        return `* 1. Load dataset
use "your_data.dta", clear

* 2. Run Logistic MLE Regression
logit ${y} ${xVars.join(' ')}${vceOption}

* 3. Export estimates with pseudo R2
estimates store model_logit
esttab model_logit, se pr2 star(* 0.10 ** 0.05 *** 0.01)`;

      case 'probit':
        return `* 1. Load dataset
use "your_data.dta", clear

* 2. Run Probit MLE Regression
probit ${y} ${xVars.join(' ')}${vceOption}

* 3. Export estimates
estimates store model_probit
esttab model_probit, se pr2 star(* 0.10 ** 0.05 *** 0.01)`;

      case 'panel_fe':
        return `* 1. Load panel dataset
use "your_data.dta", clear

* 2. Declare cross-section and time series dimensions
xtset ${panelId} ${timeId}

* 3. Estimate Panel Fixed Effects model
xtreg ${y} ${xVars.join(' ')}, fe${vceOption}`;

      case 'panel_re':
        return `* 1. Load panel dataset
use "your_data.dta", clear

* 2. Declare cross-section and time series dimensions
xtset ${panelId} ${timeId}

* 3. Estimate Panel Random Effects model
xtreg ${y} ${xVars.join(' ')}, re${vceOption}`;

      case 'iv':
        const endog = xVars[0] || 'endogenous_x';
        const controls = xVars.slice(1).join(' ');
        const instr = instruments.join(' ');
        return `* 1. Load dataset
use "your_data.dta", clear

* 2. Run Two-Stage Least Squares (2SLS) IV model
* Syntax: ivregress 2sls depvar (endog_var = instrument) exogenous_controls
ivregress 2sls ${y} (${endog} = ${instr}) ${controls}${vceOption}`;

      case 'arima':
        const [p, d, q] = orders;
        return `* 1. Load time series dataset
use "your_data.dta", clear

* 2. Set chronological sorting key
tsset ${timeId}

* 3. Fit Autoregressive Integrated Moving Average (ARIMA) Model
arima ${y}, arima(${p},${d},${q})`;

      case 'survival_cox':
        return `* 1. Load dataset
use "your_data.dta", clear

* 2. Tell Stata the survival time variable and survival/failure event indicator
stset ${y}, failure(${timeId})

* 3. Estimate Cox Proportional Hazards Model
stcox ${xVars.join(' ')}`;

      default:
        return '';
    }
  };

  const getRCode = (): string => {
    const xFormula = xVars.join(' + ');
    const clusterOpt = clusterVar ? `, cluster = ~${clusterVar}` : robust ? `, vcov = "HC1"` : '';
    switch (modelType) {
      case 'ols':
        return `# 1. Load fixest and modelsummary libraries
library(fixest)
library(modelsummary)

# 2. Read dataset
data <- read.csv("your_data.csv")

# 3. Estimate OLS with robust standard errors
model <- feols(${y} ~ ${xFormula}${clusterOpt}, data = data)

# 4. Generate beautiful academic output summary
modelsummary(model, stars = c('*' = 0.1, '**' = 0.05, '***' = 0.01), fmt = 4)`;

      case 'logit':
        return `# 1. Load modelsummary library
library(modelsummary)

# 2. Read dataset
data <- read.csv("your_data.csv")

# 3. Estimate Logistic Regression using Maximum Likelihood
model <- glm(${y} ~ ${xFormula}, family = binomial(link = "logit"), data = data)

# 4. Display results with stars
modelsummary(model, stars = c('*' = 0.1, '**' = 0.05, '***' = 0.01))`;

      case 'probit':
        return `# 1. Load modelsummary library
library(modelsummary)

# 2. Read dataset
data <- read.csv("your_data.csv")

# 3. Estimate Probit Model using Maximum Likelihood
model <- glm(${y} ~ ${xFormula}, family = binomial(link = "probit"), data = data)

# 4. Display results
modelsummary(model, stars = c('*' = 0.1, '**' = 0.05, '***' = 0.01))`;

      case 'panel_fe':
        return `# 1. Load fixest library for efficient panel estimations
library(fixest)
library(modelsummary)

# 2. Read panel dataset
data <- read.csv("your_data.csv")

# 3. Fit Fixed-Effects model (specifying entity/panel fixed effect inside '|')
model <- feols(${y} ~ ${xFormula} | ${panelId}, data = data)

# 4. Display summary table with cluster-robust errors on panel level
modelsummary(model, cluster = ~${panelId}, stars = TRUE)`;

      case 'panel_re':
        return `# 1. Load plm package for Panel Linear Models
library(plm)

# 2. Read dataset
data <- read.csv("your_data.csv")

# 3. Fit Random-Effects model
model <- plm(${y} ~ ${xFormula}, data = data, index = c("${panelId}", "${timeId}"), model = "random")

# 4. Display coefficients and fit metrics
summary(model)`;

      case 'iv': {
        const endog = xVars[0] || 'endogenous_x';
        const controls = xVars.slice(1).length > 0 ? xVars.slice(1).join(' + ') : '1';
        const instr = instruments.join(' + ');
        const ivVcov = clusterVar ? `, vcov = ~${clusterVar}` : robust ? `, vcov = "HC1"` : `, vcov = "iid"`;
        return `# 1. Load fixest package for 2SLS IV support
library(fixest)

# 2. Read dataset
data <- read.csv("your_data.csv")

# 3. Run Instrumental Variables (IV) 2SLS
# Syntax: feols(y ~ exogenous_controls | endogenous_var ~ instruments, data)
model <- feols(${y} ~ ${controls} | ${endog} ~ ${instr}, data = data${ivVcov})

# 4. Print summary
summary(model)`;
      }

      case 'arima':
        const [p, d, q] = orders;
        return `# 1. Load forecast package
library(forecast)

# 2. Read time series dataset
data <- read.csv("your_data.csv")

# 3. Convert target column into a standard R Time Series object
ts_series <- ts(data$${y})

# 4. Estimate ARIMA(${p}, ${d}, ${q}) model
model <- Arima(ts_series, order = c(${p}, ${d}, ${q}))

# 5. Display coefficient arrays, AIC/BIC, and Ljung-Box summaries
summary(model)`;

      case 'survival_cox':
        return `# 1. Load survival modeling package
library(survival)

# 2. Read dataset
data <- read.csv("your_data.csv")

# 3. Estimate Cox Proportional Hazards survival model
# Surv(time, event) defines the survival object
model <- coxph(Surv(${y}, ${timeId}) ~ ${xFormula}, data = data)

# 4. Print Hazard Ratios and coefficients
summary(model)`;

      default:
        return '';
    }
  };

  const getPythonCode = (): string => {
    const xList = xVars.map(v => `'${v}'`).join(', ');
    const clusterOpt = clusterVar
      ? `, cov_type='cluster', cov_kwds={'groups': df['${clusterVar}']}`
      : robust
      ? `, cov_type='HC1'`
      : '';

    switch (modelType) {
      case 'ols':
        return `# 1. Load data and analysis packages
import pandas as pd
import statsmodels.api as sm

# 2. Load dataset
df = pd.read_csv("your_data.csv")

# 3. Setup dependent and design matrices (with intercept)
Y = df['${y}']
X = sm.add_constant(df[[${xList}]])

# 4. Initialize and fit the Ordinary Least Squares (OLS) model
model = sm.OLS(Y, X)
results = model.fit(${clusterOpt.substring(2)})

# 5. Output comprehensive econometric summaries
print(results.summary())`;

      case 'logit':
        return `# 1. Import statsmodels MLE modules
import pandas as pd
import statsmodels.api as sm

# 2. Load dataset
df = pd.read_csv("your_data.csv")

# 3. Setup matrices
Y = df['${y}']
X = sm.add_constant(df[[${xList}]])

# 4. Estimate Logistic Regression using maximum likelihood
model = sm.Logit(Y, X)
results = model.fit()

# 5. Display stats summary
print(results.summary())`;

      case 'probit':
        return `# 1. Import statsmodels
import pandas as pd
import statsmodels.api as sm

# 2. Load dataset
df = pd.read_csv("your_data.csv")

# 3. Setup matrices
Y = df['${y}']
X = sm.add_constant(df[[${xList}]])

# 4. Estimate Probit Model using maximum likelihood
model = sm.Probit(Y, X)
results = model.fit()

# 5. Display stats summary
print(results.summary())`;

      case 'panel_fe':
        return `# 1. Load linearmodels panel data library
# Install if needed: pip install linearmodels
import pandas as pd
from linearmodels.panel import PanelOLS

# 2. Load dataset and set multi-index: Entity (cross-section) first, then Time series index
df = pd.read_csv("your_data.csv")
df = df.set_index(['${panelId}', '${timeId}'])

# 3. Run Panel Fixed-Effects Model (entity_effects=True)
# intercept should not be included if entity_effects=True and all indicators are resolved
model = PanelOLS(df['${y}'], df[[${xList}]], entity_effects=True)
results = model.fit(cov_type='clustered', cluster_entity=True)

# 4. Review Panel-Adjusted coefficient estimates
print(results.summary)`;

      case 'panel_re':
        return `# 1. Load linearmodels panel library
import pandas as pd
from linearmodels.panel import RandomEffects

# 2. Load dataset and set indices
df = pd.read_csv("your_data.csv")
df = df.set_index(['${panelId}', '${timeId}'])

# 3. Run Panel Random-Effects Model
model = RandomEffects(df['${y}'], df[[${xList}]])
results = model.fit()

# 4. Show RE summary
print(results.summary)`;

      case 'iv': {
        const endog = xVars[0] || 'endogenous_x';
        const controls = xVars.slice(1);
        const controlsList = controls.map(v => `'${v}'`).join(', ');
        const instrList = instruments.map(v => `'${v}'`).join(', ');
        const ivCovType = clusterVar
          ? `cov_type='clustered', clusters=df['${clusterVar}']`
          : robust
          ? `cov_type='robust'`
          : `cov_type='unadjusted'`;
        return `# 1. Load instrumental variables module
import pandas as pd
from linearmodels.iv import IV2SLS

# 2. Load dataset
df = pd.read_csv("your_data.csv")

# 3. Setup 2SLS IV formulation
# IV2SLS(dependent, exog, endog, instruments)
dep = df['${y}']
exog = df[[${controlsList}]] if ${controls.length} > 0 else None
endog_var = df['${endog}']
instruments_var = df[[${instrList}]]

model = IV2SLS(dep, exog, endog_var, instruments_var)
results = model.fit(${ivCovType})

# 4. Review 2SLS statistics and Overidentification tests
print(results.summary)`;
      }

      case 'arima':
        const [pa, da, qa] = orders;
        return `# 1. Import ARIMA from statsmodels
import pandas as pd
from statsmodels.tsa.arima.model import ARIMA

# 2. Load time series dataset
df = pd.read_csv("your_data.csv")

# 3. Fit ARIMA(${pa}, ${da}, ${qa}) Model
model = ARIMA(df['${y}'], order=(${pa}, ${da}, ${qa}))
results = model.fit()

# 4. Display residual statistics and forecasting summary
print(results.summary())`;

      case 'survival_cox':
        return `# 1. Load lifelines package for Cox proportional hazard modelling
# Install if needed: pip install lifelines
import pandas as pd
from lifelines import CoxPHFitter

# 2. Load dataset
df = pd.read_csv("your_data.csv")

# 3. Keep only columns relevant for Cox Hazard model
features = ['${y}', '${timeId}'] + [${xList}]
subset_df = df[features]

# 4. Initialize and fit CoxPHFitter
cph = CoxPHFitter()
cph.fit(subset_df, duration_col='${y}', event_col='${timeId}')

# 5. Display coefficients & Hazard Ratios (exp(coef))
cph.print_summary()`;

      default:
        return '';
    }
  };

  const getCode = () => {
    switch (activeTab) {
      case 'stata':
        return getStataCode();
      case 'r':
        return getRCode();
      case 'python':
        return getPythonCode();
    }
  };

  const activeCode = getCode();

  const handleCopy = () => {
    navigator.clipboard.writeText(activeCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="w-full bg-slate-950 border border-slate-800 rounded-2xl shadow-xl overflow-hidden mt-6 text-slate-100 font-sans">
      {/* Collapsible Trigger Header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-6 py-4 flex items-center justify-between bg-slate-900 hover:bg-slate-800/80 transition-all text-left cursor-pointer border-b border-slate-800"
      >
        <div className="flex items-center gap-2.5">
          <Terminal className="w-4 h-4 text-indigo-400" />
          <span className="text-xs font-bold font-mono uppercase tracking-widest text-slate-300">
            See equivalent code in Stata / R / Python
          </span>
          <span className="text-[10px] bg-indigo-900/40 text-indigo-300 px-2 py-0.5 rounded-md font-mono font-bold uppercase border border-indigo-800/40">
            {modelType.replace('_', ' ')}
          </span>
        </div>
        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-xs font-medium font-serif italic hidden sm:inline text-slate-500">
            For professional replication papers
          </span>
          {isOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </div>
      </button>

      {/* Code panel body */}
      {isOpen && (
        <div className="p-6 space-y-4 bg-slate-950/80 backdrop-blur animate-in fade-in duration-300">
          <p className="text-xs text-slate-400 font-serif italic">
            Copy and run these replication scripts inside standard statistical engines. This ensures transparency, reproducibility, and transitions theoretical models to real-world deployment tools.
          </p>

          {/* Tab buttons */}
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex gap-1">
              {(['stata', 'r', 'python'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => {
                    setActiveTab(tab);
                    setCopied(false);
                  }}
                  className={cn(
                    "px-4 py-2 text-xs font-mono font-bold uppercase rounded-lg transition-all border cursor-pointer",
                    activeTab === tab
                      ? "bg-slate-800 text-white border-slate-700 shadow-sm"
                      : "bg-transparent text-slate-400 hover:text-slate-200 border-transparent"
                  )}
                >
                  {tab === 'stata' ? 'Stata (.do)' : tab === 'r' ? 'R (.R)' : 'Python (.py)'}
                </button>
              ))}
            </div>

            {/* Copy Button */}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white rounded-lg text-xs font-mono transition-all border border-slate-800 hover:border-slate-700 shadow-sm cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-bold">Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Code</span>
                </>
              )}
            </button>
          </div>

          {/* Code Window Container */}
          <div className="relative rounded-xl border border-slate-800 bg-slate-900/60 p-5 overflow-x-auto max-h-[380px] font-mono text-[11px] text-slate-200 shadow-inner scrollbar-thin scrollbar-thumb-slate-800">
            <div className="absolute top-2 right-3 text-[9px] font-mono font-bold uppercase tracking-wider text-slate-600 pointer-events-none">
              REPLICATION BRIDGE
            </div>
            {highlightCode(activeCode, activeTab)}
          </div>
        </div>
      )}
    </div>
  );
}
