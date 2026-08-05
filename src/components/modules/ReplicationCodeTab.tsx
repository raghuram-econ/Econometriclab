import React, { useState } from 'react';
import { Terminal, Copy, Check, FileDown, BookOpen } from 'lucide-react';
import { ModelHistoryItem } from '../../types';

interface ReplicationCodeTabProps {
  activeRun: ModelHistoryItem | null;
}

export const ReplicationCodeTab: React.FC<ReplicationCodeTabProps> = ({ activeRun }) => {
  const [lang, setLang] = useState<'stata' | 'r'>('stata');
  const [copied, setCopied] = useState(false);

  if (!activeRun) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-xl space-y-3">
        <Terminal className="w-8 h-8 text-slate-300" />
        <p className="text-xs font-serif italic text-slate-500">
          No model execution found in history to extract replication files.
        </p>
      </div>
    );
  }

  // Extract variables and options from activeRun
  const parseSpecification = (item: ModelHistoryItem) => {
    let yVar = 'y';
    let xVars: string[] = [];
    let modelType: 'ols' | 'fe' | 'arima' | 'causal' | 'limited' = 'ols';
    let options: any = {};

    const spec = item.specification || '';
    const moduleLower = (item.module ?? '').toLowerCase();

    if (moduleLower === 'ols') {
      modelType = 'ols';
      const match = spec.match(/^(.+?)\s*~\s*(.+?)\s*\((OLS|Quantile:.+?)\)/i);
      if (match) {
        yVar = (match[1] ?? '').trim();
        xVars = (match[2] ?? '').split('+').map(x => x.trim()).filter(x => x && x !== 'Intercept');
      } else {
        const parts = spec.split('~');
        if (parts.length === 2) {
          yVar = (parts[0] ?? '').trim();
          const rhs = (parts[1] ?? '').split('(')[0] ?? '';
          xVars = rhs.split('+').map(x => x.trim()).filter(Boolean);
        }
      }
      if (item.results) {
        options.robust = !!item.results.robust || !!item.results.isRobust;
        options.cluster = item.results.clusterVar;
      }
    } else if (moduleLower === 'fe') {
      modelType = 'fe';
      const isRE = spec.toUpperCase().startsWith('RE');
      const isPooled = spec.toUpperCase().startsWith('POOLED');
      options.panelType = isRE ? 're' : (isPooled ? 'pooled' : 'fe');

      const match = spec.match(/^[A-Z]+\s+Model:\s*(.+?)\s*~\s*(.+?)\s*\((Entity:\s*(.+?),\s*Time:\s*(.+?))\)/i);
      if (match) {
        yVar = (match[1] ?? '').trim();
        xVars = (match[2] ?? '').split('+').map(x => x.trim());
        options.entity = (match[4] ?? '').trim();
        options.time = (match[5] ?? '').trim();
      } else {
        const parts = spec.split('~');
        if (parts.length === 2) {
          const lhs = (parts[0] ?? '').replace(/^[A-Z]+\s+Model:\s*/i, '').trim();
          yVar = lhs;
          const rhs = (parts[1] ?? '').split('(')[0] ?? '';
          xVars = rhs.split('+').map(x => x.trim()).filter(Boolean);
        }
        if (item.results) {
          options.entity = item.results.entityId || 'id';
          options.time = item.results.timeVar || 'year';
        }
      }
    } else if (moduleLower === 'arima') {
      modelType = 'arima';
      options.specText = spec;
      // spec: "ARIMA(1,1,1) on GDP | Horizon: 12"
      const match = spec.match(/on\s+(.+?)\s*\|/i);
      if (match) {
        yVar = (match[1] ?? '').trim();
      } else {
        const fallbackMatch = spec.match(/on\s+(.+)$/i);
        yVar = fallbackMatch && fallbackMatch[1] ? fallbackMatch[1].trim() : 'series';
      }
    } else if (moduleLower === 'causal') {
      modelType = 'causal';
      if (item.results) {
        options.causalType = item.results.causalType;
        if (item.results.causalType === 'did') {
          yVar = item.results.didOutcome || 'y';
          xVars = item.results.didControls || [];
          options.didTreatment = item.results.didTreatment || 'treated';
          options.didTime = item.results.didTime || 'post';
        } else if (item.results.causalType === 'iv') {
          yVar = item.results.ivOutcome || 'y';
          xVars = item.results.ivControls || [];
          options.ivEndogenous = item.results.ivEndogenous || 'x';
          options.ivInstrument = item.results.ivInstrument || 'z';
          const secondStage = item.results.secondStage || {};
          options.robust = !!secondStage.robust || !!secondStage.isRobust;
          options.cluster = secondStage.clusterVar;
        } else if (item.results.causalType === 'rd') {
          yVar = item.results.rdOutcome || 'y';
          options.rdRunning = item.results.rdRunning || 'r';
          options.rdCutoff = item.results.rdCutoff ?? 0;
          options.rdBandwidth = item.results.rdBandwidth ?? 1;
          options.rdPolynomial = item.results.rdPolynomial || 'linear';
        } else if (item.results.causalType === 'gmm') {
          yVar = item.results.gmmDep || 'y';
          xVars = item.results.gmmInstruments || [];
          options.gmmType = item.results.gmmType === 'system' ? 'system' : 'difference';
          options.gmmEntity = item.results.gmmEntity || 'id';
          options.gmmTime = item.results.gmmTime || 'year';
        }
      }
    } else if (moduleLower === 'limited') {
      modelType = 'limited';
      const match = spec.match(/^([A-Z]+)\s+Model:\s*(.+?)\s*~\s*(.+)$/i);
      if (match) {
        options.limitedType = (match[1] ?? '').toLowerCase();
        yVar = (match[2] ?? '').trim();
        xVars = (match[3] ?? '').split('+').map(x => x.trim());
      } else {
        const parts = spec.split('~');
        if (parts.length === 2) {
          yVar = (parts[0] ?? '').replace(/^[A-Z]+\s+Model:\s*/i, '').trim();
          xVars = (parts[1] ?? '').split('+').map(x => x.trim());
        }
      }
    } else if (moduleLower) {
      // Unrecognized module type -- don't silently mislabel it as OLS.
      console.warn(`ReplicationCodeTab: unsupported module type "${item.module}", falling back to a generic OLS placeholder.`);
      options.unsupportedModuleType = item.module;
      const parts = spec.split('~');
      if (parts.length === 2) {
        yVar = (parts[0] ?? '').trim();
        xVars = (parts[1] ?? '').split('+').map(x => x.trim()).filter(x => x && x !== 'Intercept');
      }
    }

    return { yVar, xVars, modelType, options };
  };

  const { yVar, xVars, modelType, options } = parseSpecification(activeRun);

  // Stata replication script builder
  const getStataReplicationCode = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    let code = `*====================================================================
* STATA REPLICATION SCRIPT
* Generated by Econometric Lab
* Date: ${dateStr}
* Active Model Class: ${modelType.toUpperCase()}
* Specification: ${activeRun.specification}
*====================================================================

* 1. Load Dataset (Ensure your dataset.csv is in Stata's working directory)
import delimited "dataset.csv", clear

`;

    if (options.unsupportedModuleType) {
      code += `* ####################################################################
* WARNING: Unsupported model type "${options.unsupportedModuleType}"
* This module does not yet have a dedicated replication template.
* The snippet below is a generic OLS placeholder ONLY and does NOT
* reflect the actual estimator used to produce this model's results.
* ####################################################################

`;
    }

    if (modelType === 'ols') {
      code += `* 2. Ordinary Least Squares Estimation
* Dependent Variable: ${yVar}
* Independent Variables: ${xVars.join(', ')}
`;
      let cmd = `regress ${yVar} ${xVars.join(' ')}`;
      if (options.cluster) {
        cmd += `, vce(cluster ${options.cluster})`;
      } else if (options.robust) {
        cmd += `, vce(robust)`;
      }
      code += `${cmd}\n\n`;
      code += `* Post-estimation diagnostics\nrvfplot, yline(0)\nestat imtest, white\n`;
    } else if (modelType === 'fe') {
      const entity = options.entity || 'id';
      const time = options.time || 'year';
      const panelType = options.panelType || 'fe';

      code += `* 2. Set Panel Structure
xtset ${entity} ${time}

`;
      if (panelType === 're') {
        code += `* 3. Random Effects Regression\nxtreg ${yVar} ${xVars.join(' ')}, re\nestimates store re_model\n\n`;
        code += `* 4. Fixed Effects Regression (for Hausman Test)\nxtreg ${yVar} ${xVars.join(' ')}, fe\nestimates store fe_model\n\n`;
        code += `* 5. Hausman Specification Test\nhausman fe_model re_model\n`;
      } else if (panelType === 'pooled') {
        code += `* 3. Pooled OLS Regression\nregress ${yVar} ${xVars.join(' ')}\n`;
      } else {
        code += `* 3. Fixed Effects Regression (Within Estimator)\nxtreg ${yVar} ${xVars.join(' ')}, fe\n`;
      }
    } else if (modelType === 'arima') {
      const spec = options.specText || '';
      const match = spec.match(/ARIMA\((\d+),(\d+),(\d+)\)/);
      const p = match ? match[1] : '1';
      const d = match ? match[2] : '1';
      const q = match ? match[3] : '1';
      const target = yVar || 'series';

      code += `* 2. Time Series ARIMA Model Setup
* Make sure your time variable is active and set
* tsset time_var

arima ${target}, arima(${p},${d},${q})
predict y_hat, y
`;
    } else if (modelType === 'causal') {
      const causalType = options.causalType || 'did';
      if (causalType === 'did') {
        const treatment = options.didTreatment || 'treated';
        const timeVar = options.didTime || 'post';
        const controls = xVars.join(' ');

        code += `* 2. Difference-in-Differences (DiD) Estimation
* Outcome: ${yVar}
* Treatment Indicator: ${treatment}
* Post-Treatment Indicator: ${timeVar}
* Controls: ${controls || 'None'}

* Method A: Classical Regression with Interaction
regress ${yVar} i.${treatment}##i.${timeVar} ${controls}

* Method B: Official Stata DiD command (Stata 17+)
* ssc install didregress (if needed)
didregress (${yVar} ${controls}) (${treatment}), group(${treatment}) time(${timeVar})
`;
      } else if (causalType === 'iv') {
        const endogenous = options.ivEndogenous || 'endogenous_var';
        const instrument = options.ivInstrument || 'instrument_var';
        const controls = xVars.join(' ');

        code += `* 2. Two-Stage Least Squares (2SLS) Instrumental Variables (IV)
* Outcome: ${yVar}
* Endogenous Regressor: ${endogenous}
* Instrument: ${instrument}
* Exogenous Controls: ${controls || 'None'}

* Run Two-Stage Least Squares${options.cluster ? ` with clustered standard errors (by ${options.cluster})` : options.robust ? ' with robust standard errors' : ' with classical (homoskedastic) standard errors'}
ivregress 2sls ${yVar} ${controls} (${endogenous} = ${instrument})${options.cluster ? `, vce(cluster ${options.cluster})` : options.robust ? ', vce(robust)' : ''}

* Post-estimation Diagnostics
estat firststage   * Check for weak instruments (F-statistic)
estat overid       * Test overidentifying restrictions (if multiple instruments)
`;
      } else if (causalType === 'rd') {
        const running = options.rdRunning || 'running_var';
        const cutoff = options.rdCutoff ?? 0;
        const bandwidth = options.rdBandwidth ?? 1;
        const poly = options.rdPolynomial || 'linear';

        code += `* 2. Regression Discontinuity (RD) Design
* Outcome: ${yVar}
* Running Variable: ${running}
* Cutoff Boundary: ${cutoff}
* Local Bandwidth: ${bandwidth}

* Create centered running variable
gen r_centered = ${running} - ${cutoff}
gen treated = (r_centered >= 0)

* Create interaction terms for local linear/quadratic trends
gen int_term = treated * r_centered
`;
        if (poly === 'quadratic') {
          code += `gen r_centered_sq = r_centered^2\ngen int_term_sq = treated * r_centered_sq\n`;
        }

        code += `\n* Option A: Manual Parametric Local Polynomial within Bandwidth\n`;
        if (poly === 'quadratic') {
          code += `regress ${yVar} treated r_centered r_centered_sq int_term int_term_sq if abs(r_centered) <= ${bandwidth}, vce(robust)\n`;
        } else {
          code += `regress ${yVar} treated r_centered int_term if abs(r_centered) <= ${bandwidth}, vce(robust)\n`;
        }

        code += `\n* Option B: Non-Parametric Estimation using "rdrobust" package
* To install: ssc install rdrobust, replace
rdrobust ${yVar} ${running}, c(${cutoff}) h(${bandwidth})
`;
      } else if (causalType === 'gmm') {
        const entity = options.gmmEntity || 'id';
        const time = options.gmmTime || 'year';
        const controls = xVars.join(' ');
        const isSystem = options.gmmType === 'system';

        code += `* 2. Dynamic Panel GMM for ${yVar}
* Entity: ${entity}, Time: ${time}
* Exogenous controls: ${controls || 'None'}

xtset ${entity} ${time}

`;
        if (isSystem) {
          code += `* Blundell-Bond (1998) System GMM
* Instruments the differenced lagged DV with its own lagged levels (Arellano-Bond
* moment conditions) AND instruments the level-equation lagged DV with its own
* lagged first-difference (the Blundell-Bond/Arellano-Bover addition), so both
* the differenced and level equations are estimated jointly ("system").
xtabond2 ${yVar} L.${yVar} ${controls}, gmm(L.${yVar}, lag(2 .)) iv(${controls}) robust small
`;
        } else {
          code += `* Arellano-Bond (1991) Difference GMM
* First-differences the model to sweep out fixed effects, then instruments
* the differenced lagged DV with its own second-and-deeper lags in levels.
xtabond2 ${yVar} L.${yVar} ${controls}, gmm(L.${yVar}, lag(2 .)) iv(${controls}) nolevel robust small
* Equivalently, using Stata's older, narrower xtabond command:
* xtabond ${yVar} ${controls}, lags(1) robust
`;
        }
      }
    } else if (modelType === 'limited') {
      const type = options.limitedType || 'logit';
      const controls = xVars.join(' ');

      code += `* 2. Limited Dependent Variable Model (${type.toUpperCase()})
* Outcome: ${yVar}
* Predictors: ${controls}

`;
      if (type === 'logit') {
        code += `logit ${yVar} ${controls}\n* Calculate odds ratios\nlogit ${yVar} ${controls}, or\n* Average Marginal Effects\nmargins, dydx(*)\n`;
      } else if (type === 'probit') {
        code += `probit ${yVar} ${controls}\n* Average Marginal Effects\nmargins, dydx(*)\n`;
      } else if (type === 'tobit') {
        const cutoff = options.cutoff || 0;
        code += `tobit ${yVar} ${controls}, ll(${cutoff})\n* Marginal effects on uncensored expected value\nmargins, dydx(*) predict(ys(0,.))\n`;
      } else {
        code += `ologit ${yVar} ${controls}\n* Average Marginal Effects\nmargins, dydx(*)\n`;
      }
    }

    code += `\n*====================================================================\n* End of replication script\n*====================================================================`;
    return code;
  };

  // R replication script builder
  const getRReplicationCode = () => {
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    let code = `# ====================================================================
# R REPLICATION SCRIPT
# Generated by Econometric Lab
# Date: ${dateStr}
# Active Model Class: ${modelType.toUpperCase()}
# Specification: ${activeRun.specification}
# ====================================================================

# 1. Load Packages & Install if Missing
required_packages <- c("sandwich", "lmtest", "ggplot2", "dplyr"`;

    if (modelType === 'fe') {
      code += `, "fixest", "plm"`;
    } else if (modelType === 'arima') {
      code += `, "forecast"`;
    } else if (modelType === 'causal') {
      const causalType = options.causalType || 'did';
      if (causalType === 'did') {
        code += `, "fixest", "did"`;
      } else if (causalType === 'iv') {
        code += `, "AER", "fixest"`;
      } else if (causalType === 'rd') {
        code += `, "rdrobust"`;
      } else if (causalType === 'gmm') {
        code += `, "plm"`;
      }
    } else if (modelType === 'limited') {
      code += `, "AER", "MASS", "mfx"`;
    }

    code += `)
new_packages <- required_packages[!(required_packages %in% installed.packages()[, "Package"])]
if (length(new_packages)) install.packages(new_packages)

library(ggplot2)
library(dplyr)
library(sandwich)
library(lmtest)

# 2. Load Dataset (Ensure your dataset.csv is in R's active working directory)
# setwd("path/to/your/folder")
df <- read.csv("dataset.csv")

`;

    if (options.unsupportedModuleType) {
      code += `# ############################################################
# WARNING: Unsupported model type "${options.unsupportedModuleType}"
# This module does not yet have a dedicated replication template.
# The snippet below is a generic OLS placeholder ONLY and does NOT
# reflect the actual model that was estimated. Please write the
# R code for this specification manually.
# ############################################################

`;
    }

    if (modelType === 'ols') {
      code += `# 3. Ordinary Least Squares Estimation
# Dependent Variable: ${yVar}
# Independent Variables: ${xVars.join(', ')}

ols_model <- lm(${yVar} ~ ${xVars.join(' + ')}, data = df)
summary(ols_model)

`;
      if (options.cluster) {
        code += `# Robust Standard Errors clustered by ${options.cluster} (using sandwich)
coeftest(ols_model, vcov = vcovCL(ols_model, cluster = df$${options.cluster}))
`;
      } else if (options.robust) {
        code += `# Robust Standard Errors (HC1 White-robust standard errors)
coeftest(ols_model, vcov = vcovHC(ols_model, type = "HC1"))
`;
      } else {
        code += `# Homoskedastic standard errors (Default)
# To check for heteroskedasticity:
# bptest(ols_model)
`;
      }
    } else if (modelType === 'fe') {
      const entity = options.entity || 'id';
      const time = options.time || 'year';
      const panelType = options.panelType || 'fe';

      if (panelType === 're') {
        code += `# 3. Random Effects Model (plm)
library(plm)
re_model <- plm(${yVar} ~ ${xVars.join(' + ')}, data = df, index = c("${entity}", "${time}"), model = "random")
summary(re_model)

# 4. Fixed Effects Model (plm)
fe_model <- plm(${yVar} ~ ${xVars.join(' + ')}, data = df, index = c("${entity}", "${time}"), model = "within")
summary(fe_model)

# 5. Hausman Specification Test
phtest(fe_model, re_model)
`;
      } else if (panelType === 'pooled') {
        code += `# 3. Pooled OLS Model
pooled_model <- lm(${yVar} ~ ${xVars.join(' + ')}, data = df)
summary(pooled_model)
`;
      } else {
        code += `# 3. Fixed Effects Estimation using fixest (High-dimensional FE, recommended)
library(fixest)
fe_model <- feols(${yVar} ~ ${xVars.join(' + ')} | ${entity}, data = df)
summary(fe_model)

# Option B: Fixed Effects via plm (traditional Econometrics package)
# library(plm)
# plm_fe <- plm(${yVar} ~ ${xVars.join(' + ')}, data = df, index = c("${entity}", "${time}"), model = "within")
# summary(plm_fe)
`;
      }
    } else if (modelType === 'arima') {
      const spec = options.specText || '';
      const match = spec.match(/ARIMA\((\d+),(\d+),(\d+)\)/);
      const p = match ? match[1] : '1';
      const d = match ? match[2] : '1';
      const q = match ? match[3] : '1';
      const target = yVar || 'series';

      code += `# 3. ARIMA Modeling (using forecast package)
library(forecast)

arima_model <- Arima(df$${target}, order = c(${p}, ${d}, ${q}))
summary(arima_model)

# Plot Forecast residuals
checkresiduals(arima_model)
`;
    } else if (modelType === 'causal') {
      const causalType = options.causalType || 'did';
      if (causalType === 'did') {
        const treatment = options.didTreatment || 'treated';
        const timeVar = options.didTime || 'post';
        const controls = xVars.join(' + ');

        code += `# 3. Difference-in-Differences (DiD) Design
# Outcome: ${yVar}
# Treatment: ${treatment}
# Time: ${timeVar}
# Controls: ${controls || 'None'}

# Method A: OLS Interaction model
did_model <- lm(${yVar} ~ ${treatment} * ${timeVar} ${controls ? `+ ${controls}` : ''}, data = df)
summary(did_model)

# Method B: fixest (TWFE) with clustered SEs
library(fixest)
did_twfe <- feols(${yVar} ~ i(${treatment}, ${timeVar}) ${controls ? `+ ${controls}` : ''} | ${treatment} + ${timeVar}, data = df, cluster = ~${treatment})
summary(did_twfe)
`;
      } else if (causalType === 'iv') {
        const endogenous = options.ivEndogenous || 'endogenous_var';
        const instrument = options.ivInstrument || 'instrument_var';
        const controls = xVars.length ? xVars.join(' + ') : '1';

        code += `# 3. Two-Stage Least Squares (2SLS) Instrumental Variables (IV)
# Outcome: ${yVar}
# Endogenous: ${endogenous}
# Instrument: ${instrument}
# Exogenous Controls: ${controls}
# Standard errors: ${options.cluster ? `clustered by ${options.cluster}` : options.robust ? 'robust (HC1)' : 'classical (homoskedastic)'}

# Method A: Using "AER" package (ivreg)
library(AER)
iv_model <- ivreg(${yVar} ~ ${endogenous} + ${controls} | ${instrument} + ${controls}, data = df)
${options.cluster
  ? `coeftest(iv_model, vcov = vcovCL(iv_model, cluster = df$${options.cluster}))`
  : options.robust
  ? `coeftest(iv_model, vcov = vcovHC(iv_model, type = "HC1"))`
  : `summary(iv_model, diagnostics = TRUE)`}

# Method B: Using "fixest" package (feols - highly efficient)
library(fixest)
iv_fixest <- feols(${yVar} ~ ${controls} | [${endogenous}] ~ ${instrument}, data = df${options.cluster ? `, cluster = ~${options.cluster}` : options.robust ? ', vcov = "HC1"' : ', vcov = "iid"'})
summary(iv_fixest)
`;
      } else if (causalType === 'rd') {
        const running = options.rdRunning || 'running_var';
        const cutoff = options.rdCutoff ?? 0;
        const bandwidth = options.rdBandwidth ?? 1;
        const poly = options.rdPolynomial || 'linear';

        code += `# 3. Regression Discontinuity (RD) Estimation
# Outcome: ${yVar}
# Running Variable: ${running}
# Cutoff: ${cutoff}
# Bandwidth: ${bandwidth}

# Prepare data centering
df_rd <- df %>%
  mutate(
    r_centered = ${running} - ${cutoff},
    treated = as.numeric(r_centered >= 0),
    int_term = treated * r_centered
  )
`;
        if (poly === 'quadratic') {
          code += `df_rd <- df_rd %>% mutate(r_centered_sq = r_centered^2, int_term_sq = treated * r_centered_sq)\n`;
        }

        code += `\n# Filter to Local Bandwidth
df_local <- df_rd %>% filter(abs(r_centered) <= ${bandwidth})

# Method A: Manual Parametric Local Regression
`;
        if (poly === 'quadratic') {
          code += `rd_model <- lm(${yVar} ~ treated + r_centered + r_centered_sq + int_term + int_term_sq, data = df_local)\n`;
        } else {
          code += `rd_model <- lm(${yVar} ~ treated + r_centered + int_term, data = df_local)\n`;
        }
        code += `coeftest(rd_model, vcov = vcovHC(rd_model, type = "HC1"))

# Method B: Non-Parametric Estimation using "rdrobust" package
library(rdrobust)
rd_nonparam <- rdrobust(y = df$${yVar}, x = df$${running}, c = ${cutoff}, h = ${bandwidth})
summary(rd_nonparam)
`;
      } else if (causalType === 'gmm') {
        const entity = options.gmmEntity || 'id';
        const time = options.gmmTime || 'year';
        const controls = xVars.length ? ' + ' + xVars.join(' + ') : '';
        const isSystem = options.gmmType === 'system';

        code += `# 3. Dynamic Panel GMM (plm::pgmm)
# Entity: ${entity}, Time: ${time}
library(plm)
pdata <- pdata.frame(df, index = c("${entity}", "${time}"))

`;
        if (isSystem) {
          code += `# Blundell-Bond (1998) System GMM: transformation = "ld" (levels AND
# differences) estimates the stacked difference + level equations jointly,
# instrumenting the differenced lagged DV with its own lagged levels and the
# level-equation lagged DV with its own lagged first-difference.
gmm_system <- pgmm(${yVar} ~ lag(${yVar}, 1)${controls} | lag(${yVar}, 2:99),
                    data = pdata, effect = "twoways", model = "onestep",
                    transformation = "ld")
summary(gmm_system, robust = TRUE)
`;
        } else {
          code += `# Arellano-Bond (1991) Difference GMM: transformation = "d" (the plm
# default) first-differences the model and instruments the differenced
# lagged DV with its own second-and-deeper lags in levels.
gmm_diff <- pgmm(${yVar} ~ lag(${yVar}, 1)${controls} | lag(${yVar}, 2:99),
                  data = pdata, effect = "twoways", model = "onestep",
                  transformation = "d")
summary(gmm_diff, robust = TRUE)
`;
        }
      }
    } else if (modelType === 'limited') {
      const type = options.limitedType || 'logit';
      const controls = xVars.join(' + ');

      code += `# 3. Limited Dependent Variable Model (${type.toUpperCase()})
# Outcome: ${yVar}
# Predictors: ${controls}

`;
      if (type === 'logit') {
        code += `logit_model <- glm(${yVar} ~ ${controls}, family = binomial(link = "logit"), data = df)
summary(logit_model)

# Average Marginal Effects (using mfx package)
library(mfx)
logitmfx(${yVar} ~ ${controls}, data = df)
`;
      } else if (type === 'probit') {
        code += `probit_model <- glm(${yVar} ~ ${controls}, family = binomial(link = "probit"), data = df)
summary(probit_model)

# Average Marginal Effects
library(mfx)
probitmfx(${yVar} ~ ${controls}, data = df)
`;
      } else if (type === 'tobit') {
        const cutoff = options.cutoff || 0;
        code += `library(AER)
tobit_model <- tobit(${yVar} ~ ${controls}, left = ${cutoff}, data = df)
summary(tobit_model)
`;
      } else {
        code += `library(MASS)
# Fit Ordered Logistic Regression (polr)
ol_model <- polr(factor(${yVar}) ~ ${controls}, data = df, Hess = TRUE)
summary(ol_model)
`;
      }
    }

    code += `\n# ====================================================================\n# End of replication script\n# ====================================================================`;
    return code;
  };

  const activeScript = lang === 'stata' ? getStataReplicationCode() : getRReplicationCode();
  const filename = lang === 'stata' ? 'replicate_analysis.do' : 'replicate_analysis.R';

  const handleCopy = () => {
    navigator.clipboard.writeText(activeScript);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([activeScript], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-4 animate-in fade-in duration-300">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-start gap-3">
        <BookOpen className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
        <div className="space-y-1">
          <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wide">Replication Standard Operating Procedure</h4>
          <p className="text-[11px] text-slate-500 leading-relaxed font-serif">
            This panel yields functional replication scripts containing the identical specifications of your active run. 
            Download the files or copy the code block to construct standard journal-compliant empirical baselines.
          </p>
        </div>
      </div>

      {/* Language Toggle */}
      <div className="flex bg-slate-100 p-1 rounded-lg">
        <button
          onClick={() => setLang('stata')}
          className={`flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded-md transition-all ${
            lang === 'stata' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          Stata (.do File)
        </button>
        <button
          onClick={() => setLang('r')}
          className={`flex-1 py-1 text-[9px] font-black uppercase tracking-wider rounded-md transition-all ${
            lang === 'r' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          R Script (.R File)
        </button>
      </div>

      {/* Script block */}
      <div className="relative border border-slate-800 bg-slate-950 rounded-xl overflow-hidden shadow-md flex flex-col">
        {/* Terminal Header */}
        <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <span className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
            <span className="text-[9px] font-mono text-slate-400 ml-2 uppercase tracking-widest">
              {filename}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all"
              title="Copy code"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button
              onClick={handleDownload}
              className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-all"
              title="Download script"
            >
              <FileDown className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Code Content */}
        <div className="p-4 overflow-x-auto max-h-[380px] custom-scrollbar">
          <pre className="text-[11px] font-mono text-slate-300 leading-relaxed text-left select-text whitespace-pre">
            {activeScript}
          </pre>
        </div>
      </div>

      <div className="text-center">
        <p className="text-[9px] text-slate-400 font-mono italic">
          "Standardize estimations across Stata, R, and peer-reviewed journals."
        </p>
      </div>
    </div>
  );
};
