import React, { useState, useMemo, useEffect } from 'react';
import {
  Target,
  Info,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ShieldAlert,
  GitCommit,
  Binary,
  HelpCircle,
  TrendingUp,
  Terminal,
  Copy,
  Check
} from 'lucide-react';
import { runOLS } from '../../lib/econometrics/ols';
import { estimateModel } from '../../lib/econometrics/estimators';
import { runSharpRDD, runFuzzyRDD } from '../../lib/econometrics/rdd';
import { runGMM, runRDDPy, runFuzzyRDDPy, runSyntheticControl, runStaggeredDID } from '../../services/apiClient';
import { useStore } from '../../store/useStore';
import { Dataset, AnalysisResult } from '../../types';
import { cn, fmt, fmtP, stars, copyTextToClipboard } from '../../lib/utils';
import jStat from 'jstat';
import ShowCode from '../shared/ShowCode';

interface CausalLabProps {
  dataset: Dataset | null;
  onRunComplete: (r: AnalysisResult) => void;
}

type TabType = 'did' | 'iv' | 'rd' | 'gmm' | 'synth';

export default function CausalLab({ dataset, onRunComplete }: CausalLabProps) {
  const { setActiveModule } = useStore();
  const [activeTab, setActiveTab] = useState<TabType>('did');

  // Difference-in-Differences State
  const [didMode, setDidMode] = useState<'simple' | 'staggered'>('simple');
  const [didOutcome, setDidOutcome] = useState('');
  const [didTreatment, setDidTreatment] = useState('');
  const [didTime, setDidTime] = useState('');
  const [didControls, setDidControls] = useState<string[]>([]);
  const [didClusterVar, setDidClusterVar] = useState('');
  const [didResult, setDidResult] = useState<any | null>(null);
  const [didCodeCopied, setDidCodeCopied] = useState<string | null>(null);

  // Staggered-adoption DiD state (Callaway-Sant'Anna, Python backend)
  const [sdidId, setSdidId] = useState('');
  const [sdidTime, setSdidTime] = useState('');
  const [sdidOutcome, setSdidOutcome] = useState('');
  const [sdidGroup, setSdidGroup] = useState('');
  const [sdidControlGroup, setSdidControlGroup] = useState<'nevertreated' | 'notyettreated'>('nevertreated');
  const [sdidResult, setSdidResult] = useState<any | null>(null);
  const [sdidCodeCopied, setSdidCodeCopied] = useState<string | null>(null);
  const [sdidRunning, setSdidRunning] = useState(false);
  const [sdidError, setSdidError] = useState<string | null>(null);

  // 2SLS State
  const [ivOutcome, setIvOutcome] = useState('');
  const [ivEndogenous, setIvEndogenous] = useState('');
  const [ivInstrument, setIvInstrument] = useState('');
  const [ivControls, setIvControls] = useState<string[]>([]);
  const [ivResult, setIvResult] = useState<any | null>(null);

  // RD State
  const [rdOutcome, setRdOutcome] = useState('');
  const [rdRunning, setRdRunning] = useState('');
  const [rdCutoff, setRdCutoff] = useState('0');
  const [rdBandwidth, setRdBandwidth] = useState('1');
  const [rdPolynomial, setRdPolynomial] = useState<'linear' | 'quadratic'>('linear');
  const [rdResult, setRdResult] = useState<any | null>(null);
  const [rdCodeCopied, setRdCodeCopied] = useState<string | null>(null);
  const [researchGradeRd, setResearchGradeRd] = useState(false);
  // Fuzzy RD (imperfect compliance): a separate treatment-status column,
  // distinct from the above/below-cutoff indicator implied by rdRunning vs rdCutoff.
  const [rdDesign, setRdDesign] = useState<'sharp' | 'fuzzy'>('sharp');
  const [rdTreatment, setRdTreatment] = useState('');

  // Dynamic Panel GMM State (Arellano-Bond / Blundell-Bond, Python backend)
  const [gmmType, setGmmType] = useState<'difference' | 'system'>('difference');
  const [gmmEntity, setGmmEntity] = useState('');
  const [gmmTime, setGmmTime] = useState('');
  const [gmmDep, setGmmDep] = useState('');
  const [gmmInstruments, setGmmInstruments] = useState<string[]>([]);
  const [gmmResult, setGmmResult] = useState<any | null>(null);
  const [gmmCodeCopied, setGmmCodeCopied] = useState<string | null>(null);

  // Synthetic Control Method state (Abadie-Diamond-Hainmueller, Python backend)
  const [scUnitVar, setScUnitVar] = useState('');
  const [scTimeVar, setScTimeVar] = useState('');
  const [scOutcomeVar, setScOutcomeVar] = useState('');
  const [scTreatedUnit, setScTreatedUnit] = useState('');
  const [scPreStart, setScPreStart] = useState('');
  const [scPreEnd, setScPreEnd] = useState('');
  const [scPostEnd, setScPostEnd] = useState('');
  const [scResult, setScResult] = useState<any | null>(null);
  const [scCodeCopied, setScCodeCopied] = useState<string | null>(null);
  const [scRunning, setScRunning] = useState(false);
  const [scError, setScError] = useState<string | null>(null);

  const scUnitValues = useMemo(() => {
    if (!dataset || !scUnitVar) return [];
    return Array.from(new Set((dataset.data || []).map(r => String(r[scUnitVar])))).filter(Boolean);
  }, [dataset, scUnitVar]);

  const [isEstimating, setIsEstimating] = useState(false);
  const [estimationError, setEstimationError] = useState<string | null>(null);

  const variables = useMemo(() => dataset?.variables || [], [dataset]);
  const numericVars = useMemo(() => variables.filter(v => v.type === 'numeric'), [variables]);
  const idVars = useMemo(() => variables.filter(v => v.type === 'categorical' || v.type === 'numeric'), [variables]);

  // Reset every variable selection and result across all tabs whenever the
  // active dataset changes - none of these are auto-populated (the user
  // always picks them manually), but with no reset they silently kept
  // referring to columns from the previous dataset, invisible in the picker
  // since it only lists the new dataset's columns, and a previous dataset's
  // results could keep displaying under a new "ACTIVE DATA" banner.
  const datasetKey = dataset?.name ?? null;
  useEffect(() => {
    setDidOutcome(''); setDidTreatment(''); setDidTime(''); setDidControls([]); setDidClusterVar('');
    setDidResult(null);
    setSdidId(''); setSdidTime(''); setSdidOutcome(''); setSdidGroup('');
    setSdidResult(null); setSdidError(null);
    setIvOutcome(''); setIvEndogenous(''); setIvInstrument(''); setIvControls([]);
    setIvResult(null);
    setRdOutcome(''); setRdRunning(''); setRdTreatment('');
    setRdResult(null);
    setGmmEntity(''); setGmmTime(''); setGmmDep(''); setGmmInstruments([]);
    setGmmResult(null);
    setScUnitVar(''); setScTimeVar(''); setScOutcomeVar(''); setScTreatedUnit('');
    setScPreStart(''); setScPreEnd(''); setScPostEnd('');
    setScResult(null); setScError(null);
    setEstimationError(null);
  }, [datasetKey]);

  if (!dataset) {
    return (
      <div className="p-12 text-center bg-stone-50 border border-dashed border-stone-200 rounded-2xl max-w-2xl mx-auto my-12">
        <Target className="w-12 h-12 text-stone-300 mx-auto mb-4 animate-pulse" />
        <h3 className="text-lg font-bold text-stone-700">Dataset Required</h3>
        <p className="text-sm text-stone-500 font-serif italic max-w-md mx-auto mt-2">
          Please load an active dataset in the Data Workspace to begin testing causal designs.
        </p>
        <button
          onClick={() => setActiveModule('data')}
          className="mt-5 px-5 py-2.5 bg-[#1B2E41] hover:bg-[#243D54] text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors inline-flex items-center gap-2"
        >
          Go to Data Workspace <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  // --- DIFFERENCE IN DIFFERENCES ESTIMATOR ---
  const handleRunDiD = () => {
    if (!didOutcome || !didTreatment || !didTime) return;
    setIsEstimating(true);
    setEstimationError(null);
    try {
      const data = dataset.data || [];
      
      // Calculate Means
      const treatedPost = data.filter(r => Number(r[didTreatment]) === 1 && Number(r[didTime]) === 1);
      const treatedPre = data.filter(r => Number(r[didTreatment]) === 1 && Number(r[didTime]) === 0);
      const controlPost = data.filter(r => Number(r[didTreatment]) === 0 && Number(r[didTime]) === 1);
      const controlPre = data.filter(r => Number(r[didTreatment]) === 0 && Number(r[didTime]) === 0);

      const meanTreatedPost = treatedPost.reduce((sum, r) => sum + (Number(r[didOutcome]) || 0), 0) / (treatedPost.length || 1);
      const meanTreatedPre = treatedPre.reduce((sum, r) => sum + (Number(r[didOutcome]) || 0), 0) / (treatedPre.length || 1);
      const meanControlPost = controlPost.reduce((sum, r) => sum + (Number(r[didOutcome]) || 0), 0) / (controlPost.length || 1);
      const meanControlPre = controlPre.reduce((sum, r) => sum + (Number(r[didOutcome]) || 0), 0) / (controlPre.length || 1);

      const simpleATT = (meanTreatedPost - meanTreatedPre) - (meanControlPost - meanControlPre);
      
      // Calculate Pooled Standard Deviation for parallel trends check
      const yValuesT0 = treatedPre.map(r => Number(r[didOutcome]) || 0);
      const yValuesC0 = controlPre.map(r => Number(r[didOutcome]) || 0);

      const varT0 = yValuesT0.length > 1 ? yValuesT0.reduce((sum, v) => sum + (v - meanTreatedPre) ** 2, 0) / (yValuesT0.length - 1) : 0;
      const varC0 = yValuesC0.length > 1 ? yValuesC0.reduce((sum, v) => sum + (v - meanControlPre) ** 2, 0) / (yValuesC0.length - 1) : 0;

      const n_T0 = yValuesT0.length;
      const n_C0 = yValuesC0.length;
      const pooledVar = n_T0 + n_C0 > 2 ? ((n_T0 - 1) * varT0 + (n_C0 - 1) * varC0) / (n_T0 + n_C0 - 2) : 0;
      const pooledSD = Math.sqrt(pooledVar || 1);

      const preTrendDiffSD = Math.abs(meanTreatedPre - meanControlPre) / (pooledSD || 1);
      const parallelTrendWarning = preTrendDiffSD > 0.5;

      // OLS specification: Y = b0 + b1*Treated + b2*Post + b3*(Treated*Post) + Controls
      const regressionData = data.map(r => ({
        ...r,
        treated_post: (Number(r[didTreatment]) || 0) * (Number(r[didTime]) || 0)
      }));

      const independentVars = [didTreatment, didTime, 'treated_post', ...didControls];
      const olsResult = runOLS(regressionData, didOutcome, independentVars, true, true, didClusterVar || undefined);

      const formattedResult = {
        simpleATT,
        meanTreatedPost,
        meanTreatedPre,
        meanControlPost,
        meanControlPre,
        parallelTrendWarning,
        preTrendDiffSD,
        ols: olsResult,
        specification: `${didOutcome} ~ ${didTreatment} + ${didTime} + (${didTreatment} * ${didTime})` + (didControls.length ? ` + ${didControls.join(' + ')}` : ''),
        didOutcome,
        didTreatment,
        didTime,
        didControls,
        didClusterVar: didClusterVar || undefined,
        causalType: 'did'
      };

      setDidResult(formattedResult);
      onRunComplete({
        type: 'generic',
        specification: `Difference-in-Differences: ${formattedResult.specification}`,
        results: formattedResult
      });
    } catch (err: any) {
      setEstimationError(err.message || 'Estimation error');
    } finally {
      setIsEstimating(false);
    }
  };

  // Reproducibility code for the currently estimated Simple 2x2 DiD spec.
  // Mirrors exactly what handleRunDiD computes: treated_post = D * Post,
  // and clustering (when set) via the same cluster variable passed to runOLS.
  const getDidCode = (lang: 'r' | 'stata' | 'python'): string => {
    if (!didResult) return '';
    const { didOutcome: y, didTreatment: d, didTime: t, didControls: controls, didClusterVar: cVar } = didResult;
    const controlsSuffix = controls.length ? ` + ${controls.join(' + ')}` : '';

    if (lang === 'stata') {
      let code = `gen treated_post = ${d} * ${t}\n`;
      code += `regress ${y} ${d} ${t} treated_post${controls.length ? ' ' + controls.join(' ') : ''}`;
      code += cVar ? `, vce(cluster ${cVar})` : `, vce(robust)`;
      return code;
    }

    if (lang === 'python') {
      let code = `import statsmodels.api as sm\n\n`;
      code += `df['treated_post'] = df['${d}'] * df['${t}']\n`;
      code += `X = df[['${d}', '${t}', 'treated_post'${controls.map((c: string) => `, '${c}'`).join('')}]]\n`;
      code += `X = sm.add_constant(X)\n\n`;
      code += `model = sm.OLS(df['${y}'], X)\n`;
      code += cVar
        ? `results = model.fit(cov_type='cluster', cov_kwds={'groups': df['${cVar}']})`
        : `results = model.fit(cov_type='HC1')`;
      code += `\nprint(results.summary())`;
      return code;
    }

    // R
    let code = `df$treated_post <- df$${d} * df$${t}\n`;
    code += `model <- lm(${y} ~ ${d} + ${t} + treated_post${controlsSuffix}, data = df)\n`;
    if (cVar) {
      code += `# Clustered standard errors by ${cVar}\n`;
      code += `library(sandwich)\nlibrary(lmtest)\n`;
      code += `coeftest(model, vcov = vcovCL(model, cluster = ~${cVar}))`;
    } else {
      code += `# Robust standard errors (White/HC1)\n`;
      code += `library(sandwich)\nlibrary(lmtest)\n`;
      code += `coeftest(model, vcov = vcovHC(model, type = "HC1"))`;
    }
    return code;
  };

  const handleCopyDidCode = (lang: 'r' | 'stata' | 'python') => {
    copyTextToClipboard(getDidCode(lang)).then(success => {
      if (success) {
        setDidCodeCopied(lang);
        setTimeout(() => setDidCodeCopied(null), 2000);
      }
    });
  };

  // Reproducibility code for the currently estimated RD spec. There are three
  // genuinely different estimators behind this tab (see handleRunRD above),
  // so the generated code must match whichever one actually produced
  // rdResult, not a single generic "RDD" template:
  //  - engine === 'python': the real rdrobust package (MSE-optimal
  //    bandwidth, bias-corrected) -- this one DOES match Stata/R's rdrobust.
  //  - design === 'fuzzy' (browser): local 2SLS -- D_actual instrumented by
  //    the above/below-cutoff indicator, bandwidth-filtered, uniform kernel.
  //  - sharp (browser): two SEPARATE OLS fits (below/above cutoff), RD
  //    estimate = predAbove - predBelow, SE = sqrt(seBelow^2 + seAbove^2).
  //    This is NOT the same point/SE as a single pooled interacted
  //    regression, so it must be replicated as two separate regressions.
  const getRdCode = (lang: 'r' | 'stata' | 'python'): string => {
    if (!rdResult) return '';
    const y = rdResult.rdOutcome;
    const x = rdResult.rdRunning;
    const c = rdResult.cutoff;
    const treat = rdResult.rdTreatment;

    if (rdResult.engine === 'python') {
      const fuzzyArg = rdResult.design === 'fuzzy' ? `, fuzzy = df$${treat}` : '';
      const fuzzyArgPy = rdResult.design === 'fuzzy' ? `, fuzzy=df['${treat}']` : '';
      const fuzzyArgStata = rdResult.design === 'fuzzy' ? ` fuzzy(${treat})` : '';
      if (lang === 'stata') return `* Requires the community rdrobust package: ssc install rdrobust\nrdrobust ${y} ${x}, c(${c})${fuzzyArgStata}`;
      if (lang === 'python') return `# pip install rdrobust\nfrom rdrobust import rdrobust\n\nresult = rdrobust(y=df['${y}'], x=df['${x}'], c=${c}${fuzzyArgPy})\nprint(result)`;
      return `# install.packages("rdrobust")\nlibrary(rdrobust)\n\nsummary(rdrobust(y = df$${y}, x = df$${x}, c = ${c}${fuzzyArg}))`;
    }

    if (rdResult.design === 'fuzzy') {
      const bw = rdResult.bandwidth;
      if (lang === 'stata') {
        return `* Local 2SLS fuzzy RD (uniform kernel, fixed bandwidth -- not rdrobust's\n* MSE-optimal bandwidth/bias correction; see method note in the app)\ngen d_above = (${x} >= ${c})\ngen x_tilde = ${x} - ${c}\nivregress 2sls ${y} x_tilde (${treat} = d_above) if abs(${x} - ${c}) <= ${bw}`;
      }
      if (lang === 'python') {
        return `# Local 2SLS fuzzy RD (uniform kernel, fixed bandwidth -- not rdrobust's\n# MSE-optimal bandwidth/bias correction; see method note in the app)\nimport pandas as pd\nfrom linearmodels.iv import IV2SLS\n\ndf['d_above'] = (df['${x}'] >= ${c}).astype(int)\ndf['x_tilde'] = df['${x}'] - ${c}\nsub = df[(df['${x}'] - ${c}).abs() <= ${bw}]\n\nmodel = IV2SLS(sub['${y}'], sub[['x_tilde']], sub['${treat}'], sub[['d_above']])\nresults = model.fit()\nprint(results.summary)`;
      }
      return `# Local 2SLS fuzzy RD (uniform kernel, fixed bandwidth -- not rdrobust's\n# MSE-optimal bandwidth/bias correction; see method note in the app)\nlibrary(fixest)\n\ndf$d_above <- as.integer(df$${x} >= ${c})\ndf$x_tilde <- df$${x} - ${c}\nsub <- df[abs(df$${x} - ${c}) <= ${bw}, ]\n\nmodel <- feols(${y} ~ x_tilde | ${treat} ~ d_above, data = sub)\nsummary(model)`;
    }

    // Sharp, browser engine: two separate regressions, not a pooled interaction model.
    const bw = rdResult.bandwidth;
    const quad = rdResult.rdPolynomial === 'quadratic';
    if (lang === 'stata') {
      let code = `* Two SEPARATE local regressions (below/above cutoff) -- the RD estimate\n* is predAbove minus predBelow, SE is sqrt(seBelow^2 + seAbove^2), NOT the\n* output of a single pooled treatment-interaction regression\ngen r_centered = ${x} - ${c}\n`;
      if (quad) code += `gen r_centered_sq = r_centered^2\n`;
      const rhs = quad ? 'r_centered r_centered_sq' : 'r_centered';
      code += `\nregress ${y} ${rhs} if r_centered < 0 & abs(${x} - ${c}) <= ${bw}\nscalar predBelow = _b[_cons]\nscalar seBelow = _se[_cons]\n\n`;
      code += `regress ${y} ${rhs} if r_centered >= 0 & abs(${x} - ${c}) <= ${bw}\nscalar predAbove = _b[_cons]\nscalar seAbove = _se[_cons]\n\n`;
      code += `di "RD estimate: " predAbove - predBelow\ndi "RD SE: " sqrt(seBelow^2 + seAbove^2)`;
      return code;
    }
    if (lang === 'python') {
      let code = `# Two SEPARATE local regressions (below/above cutoff) -- the RD estimate\n# is predAbove minus predBelow, SE is sqrt(seBelow**2 + seAbove**2), NOT\n# the output of a single pooled treatment-interaction regression\nimport numpy as np\nimport statsmodels.api as sm\n\ndf['r_centered'] = df['${x}'] - ${c}\n`;
      if (quad) code += `df['r_centered_sq'] = df['r_centered'] ** 2\n`;
      const cols = quad ? "['r_centered', 'r_centered_sq']" : "['r_centered']";
      code += `sub = df[df['${x}'].sub(${c}).abs() <= ${bw}]\n\n`;
      code += `below = sub[sub['r_centered'] < 0]\nX_below = sm.add_constant(below[${cols}])\nres_below = sm.OLS(below['${y}'], X_below).fit()\n\n`;
      code += `above = sub[sub['r_centered'] >= 0]\nX_above = sm.add_constant(above[${cols}])\nres_above = sm.OLS(above['${y}'], X_above).fit()\n\n`;
      code += `rd_estimate = res_above.params['const'] - res_below.params['const']\nrd_se = np.sqrt(res_below.bse['const']**2 + res_above.bse['const']**2)\nprint(rd_estimate, rd_se)`;
      return code;
    }
    let code = `# Two SEPARATE local regressions (below/above cutoff) -- the RD estimate\n# is predAbove minus predBelow, SE is sqrt(seBelow^2 + seAbove^2), NOT the\n# output of a single pooled treatment-interaction regression\ndf$r_centered <- df$${x} - ${c}\n`;
    if (quad) code += `df$r_centered_sq <- df$r_centered^2\n`;
    const rhsR = quad ? 'r_centered + r_centered_sq' : 'r_centered';
    code += `sub <- df[abs(df$${x} - ${c}) <= ${bw}, ]\n\n`;
    code += `below <- lm(${y} ~ ${rhsR}, data = sub[sub$r_centered < 0, ])\nabove <- lm(${y} ~ ${rhsR}, data = sub[sub$r_centered >= 0, ])\n\n`;
    code += `rd_estimate <- coef(above)["(Intercept)"] - coef(below)["(Intercept)"]\nrd_se <- sqrt(summary(below)$coefficients["(Intercept)", "Std. Error"]^2 + summary(above)$coefficients["(Intercept)", "Std. Error"]^2)\ncat(rd_estimate, rd_se)`;
    return code;
  };

  const handleCopyRdCode = (lang: 'r' | 'stata' | 'python') => {
    copyTextToClipboard(getRdCode(lang)).then(success => {
      if (success) {
        setRdCodeCopied(lang);
        setTimeout(() => setRdCodeCopied(null), 2000);
      }
    });
  };

  // --- INSTRUMENTAL VARIABLES 2SLS ---
  const handleRunIV = () => {
    if (!ivOutcome || !ivEndogenous || !ivInstrument) return;
    setIsEstimating(true);
    setEstimationError(null);
    try {
      const data = dataset.data || [];

      // First stage: Endogenous (X) ~ Instrument (Z) + Controls.
      // This is purely diagnostic here -- only the F-statistic is used, to
      // drive the weak-instrument warning below. Point estimates come from
      // estimateModel('IV', ...) instead, which runs its own internal 2SLS
      // (verified against Python linearmodels.IV2SLS to <0.01% relative
      // error on coefficients, <0.1% on SEs -- see reference.test.ts).
      const firstStageXvars = [ivInstrument, ...ivControls];
      const firstStage = runOLS(data, ivEndogenous, firstStageXvars, true, false);

      // Weak-instrument F-stat (Staiger-Stock/Stock-Yogo) must test the EXCLUDED
      // instrument's own explanatory power, not the whole first-stage model's joint
      // significance -- firstStage.fStat tests "instrument AND controls jointly zero",
      // which stays large whenever the controls matter regardless of the instrument's
      // actual strength. Computed instead via a restricted-vs-unrestricted RSS F-test:
      // rerun the first stage with the instrument excluded, then compare fit.
      // Confirmed live: with 14 real controls, firstStage.fStat read ~180 ("strong")
      // for an instrument whose real partial F (verified against a published Card
      // 1995 replication) is ~13 -- right at the weak-instrument threshold.
      const restrictedFirstStage = ivControls.length > 0
        ? runOLS(data, ivEndogenous, ivControls, true, false)
        : null;
      const nInstrumentsExcluded = 1; // just-identified case enforced above: exactly one instrument
      const kUnrestricted = firstStageXvars.length + 1; // + intercept
      const restrictedRSS = restrictedFirstStage
        ? (restrictedFirstStage.rss ?? 0)
        : (() => {
            // No controls selected: the restricted model is intercept-only, so its
            // RSS is just the total sum of squares of the endogenous variable.
            const yVals = data.map((r: any) => parseFloat(r[ivEndogenous])).filter((v: number) => !isNaN(v));
            const yMean = yVals.reduce((s: number, v: number) => s + v, 0) / yVals.length;
            return yVals.reduce((s: number, v: number) => s + (v - yMean) * (v - yMean), 0);
          })();
      const unrestrictedRSS = firstStage.rss ?? 0;
      const partialF = ((restrictedRSS - unrestrictedRSS) / nInstrumentsExcluded) / (unrestrictedRSS / (firstStage.n - kUnrestricted));
      const firstStageF = Number.isFinite(partialF) ? partialF : 0;
      const isWeak = firstStageF < 10;

      const secondStage = estimateModel('IV', {
        data,
        yVar: ivOutcome,
        xVars: ivControls,
        endogenousVar: ivEndogenous,
        instruments: [ivInstrument],
      });

      // Relabel the endogenous coefficient to flag it as instrumented, matching
      // the previous UI convention (styled row + weak-instrument cross-reference).
      const mappedCoefficients = secondStage.coefficients.map(c =>
        c.variable === ivEndogenous
          ? { ...c, variable: `${ivEndogenous} (Instrumented)` }
          : c
      );

      const formattedResult = {
        firstStage,
        secondStage: {
          ...secondStage,
          coefficients: mappedCoefficients
        },
        firstStageF,
        isWeak,
        specification: `2SLS IV: ${ivOutcome} ~ [${ivEndogenous} = ${ivInstrument}]` + (ivControls.length ? ` + ${ivControls.join(' + ')}` : ''),
        ivOutcome,
        ivEndogenous,
        ivInstrument,
        ivControls,
        causalType: 'iv'
      };

      setIvResult(formattedResult);
      onRunComplete({
        type: 'generic',
        specification: formattedResult.specification,
        results: formattedResult
      });
    } catch (err: any) {
      setEstimationError(`Estimation error: ${err.message || err}`);
    } finally {
      setIsEstimating(false);
    }
  };

  // --- REGRESSION DISCONTINUITY ESTIMATOR ---
  const handleRunRD = () => {
    if (!rdOutcome || !rdRunning) return;
    if (rdDesign === 'fuzzy' && !rdTreatment) return;

    // Research-grade path: rdrobust (MSE-optimal bandwidth + bias correction).
    if (researchGradeRd) {
      setIsEstimating(true);
      setEstimationError(null);
      (async () => {
        try {
          const data = dataset.data || [];
          const cutoff = Number(rdCutoff) || 0;

          if (rdDesign === 'fuzzy') {
            const rows = data.filter(r =>
              !isNaN(parseFloat(r[rdOutcome])) && !isNaN(parseFloat(r[rdRunning])) && !isNaN(parseFloat(r[rdTreatment]))
            );
            const res = await runFuzzyRDDPy({
              y: rows.map(r => parseFloat(r[rdOutcome])),
              x: rows.map(r => parseFloat(r[rdRunning])),
              treatment: rows.map(r => parseFloat(r[rdTreatment])),
              cutoff,
            });
            setRdResult({
              engine: 'python',
              design: 'fuzzy',
              rdEstimate: res.coef, rdSE: res.seRobust, rdP: res.pValueRobust,
              rdT: (typeof res.coef === 'number' && res.seRobust) ? res.coef / res.seRobust : 0,
              ciLow: res.ciLow, ciHigh: res.ciHigh, bandwidth: res.bandwidth, nUsed: res.nUsed,
              firstStageCoef: res.firstStageCoef, firstStageSE: res.firstStageSERobust, firstStageP: res.firstStagePValueRobust,
              cutoff, rdOutcome, rdRunning, rdTreatment,
              specification: `Fuzzy RDD (rdrobust): ${rdOutcome} LATE at ${rdRunning} = ${cutoff}, instrumented by crossing via ${rdTreatment}`,
            });
            onRunComplete({ type: 'generic', specification: `Fuzzy RDD (rdrobust): ${rdOutcome}`, results: res });
            return;
          }

          const rows = data.filter(r => !isNaN(parseFloat(r[rdOutcome])) && !isNaN(parseFloat(r[rdRunning])));
          const res = await runRDDPy({
            y: rows.map(r => parseFloat(r[rdOutcome])),
            x: rows.map(r => parseFloat(r[rdRunning])),
            cutoff,
          });
          setRdResult({
            engine: 'python',
            design: 'sharp',
            rdEstimate: res.coef, rdSE: res.seRobust, rdP: res.pValueRobust,
            rdT: (typeof res.coef === 'number' && res.seRobust) ? res.coef / res.seRobust : 0,
            ciLow: res.ciLow, ciHigh: res.ciHigh, bandwidth: res.bandwidth, nUsed: res.nUsed,
            cutoff, rdOutcome, rdRunning,
            specification: `RDD (rdrobust): ${rdOutcome} jump at ${rdRunning} = ${cutoff}`,
          });
          onRunComplete({ type: 'generic', specification: `RDD (rdrobust): ${rdOutcome}`, results: res });
        } catch (err: any) {
          setEstimationError(`Estimation error: ${err.message || err}`);
        } finally {
          setIsEstimating(false);
        }
      })();
      return;
    }

    // Fast browser path, fuzzy design: local 2SLS via runFuzzyRDD.
    if (rdDesign === 'fuzzy') {
      setIsEstimating(true);
      setEstimationError(null);
      try {
        const data = dataset.data || [];
        const cutoff = Number(rdCutoff) || 0;
        const bandwidthOverride = rdBandwidth ? Number(rdBandwidth) : undefined;
        const fuzzy = runFuzzyRDD(data, rdOutcome, rdRunning, rdTreatment, cutoff, bandwidthOverride);

        const formattedResult = {
          design: 'fuzzy',
          rdEstimate: fuzzy.rddEstimate,
          rdSE: fuzzy.rddStdError,
          rdT: fuzzy.rddTStat,
          rdP: fuzzy.rddPValue,
          fuzzy,
          belowCount: undefined,
          aboveCount: undefined,
          cutoff,
          bandwidth: fuzzy.bandwidth,
          specification: `Fuzzy RD (2SLS Local Linear): ${rdOutcome} LATE at ${rdRunning} = ${cutoff}, instrumented by crossing via ${rdTreatment}`,
          rdOutcome,
          rdRunning,
          rdTreatment,
          rdCutoff: cutoff,
          rdBandwidth: fuzzy.bandwidth,
          causalType: 'rd'
        };

        setRdResult(formattedResult);
        onRunComplete({
          type: 'generic',
          specification: formattedResult.specification,
          results: formattedResult
        });
      } catch (err: any) {
        setEstimationError(`Estimation error: ${err.message || err}`);
      } finally {
        setIsEstimating(false);
      }
      return;
    }

    setIsEstimating(true);
    setEstimationError(null);
    try {
      const data = dataset.data || [];
      const cutoff = Number(rdCutoff) || 0;
      const bandwidth = Number(rdBandwidth) || 0.1;

      // Filter to bandwidth: |R_i - cutoff| <= h
      const filtered = data.filter(row => {
        const runningVal = Number(row[rdRunning]);
        return !isNaN(runningVal) && Math.abs(runningVal - cutoff) <= bandwidth;
      });

      if (filtered.length < 10) {
        throw new Error('Too few observations inside the bandwidth boundary. Try broadening the bandwidth.');
      }

      // Create centered running variable and quadratic if chosen
      const rdDataWithCentered = filtered.map(row => {
        const rVal = Number(row[rdRunning]) || 0;
        const rCentered = rVal - cutoff;
        const rCenteredSq = rCentered * rCentered;
        return {
          ...row,
          r_centered: rCentered,
          r_centered_sq: rCenteredSq
        };
      });

      const belowData = rdDataWithCentered.filter(row => row.r_centered < 0);
      const aboveData = rdDataWithCentered.filter(row => row.r_centered >= 0);

      const k_vars = rdPolynomial === 'quadratic' ? 3 : 2; // coefficients per side
      if (belowData.length < k_vars + 1 || aboveData.length < k_vars + 1) {
        throw new Error('Insufficient observations on one or both sides of the cutoff boundary for the selected polynomial order.');
      }

      // Run separate OLS fits
      const indepVars = rdPolynomial === 'quadratic' ? ['r_centered', 'r_centered_sq'] : ['r_centered'];
      const olsBelow = runOLS(belowData, rdOutcome, indepVars, true, true);
      const olsAbove = runOLS(aboveData, rdOutcome, indepVars, true, true);

      // RD estimate = alpha_1 - alpha_0 (intercepts of the centered regressions represent predicted values at R_centered = 0, i.e., cutoff)
      const predBelow = olsBelow.coefficients.find(c => c.variable === 'Intercept')?.estimate || 0;
      const predAbove = olsAbove.coefficients.find(c => c.variable === 'Intercept')?.estimate || 0;
      const rdEstimate = predAbove - predBelow;

      // Conservative SE of RD estimate = sqrt(SE_alpha1^2 + SE_alpha0^2)
      const seBelow = olsBelow.coefficients.find(c => c.variable === 'Intercept')?.stdError || 0.1;
      const seAbove = olsAbove.coefficients.find(c => c.variable === 'Intercept')?.stdError || 0.1;
      const rdSE = Math.sqrt(seBelow * seBelow + seAbove * seAbove);

      const rdT = rdEstimate / (rdSE || 1);
      // Precise p-value using standard normal CDF
      const rdP = 2 * (1 - jStat.normal.cdf(Math.abs(rdT), 0, 1));

      // Certified local-linear RDD (pooled treatment-interaction regression,
      // Silverman bandwidth selector) via the tested estimator, shown as a
      // cross-check against the inline separate-sides estimate above.
      let certified: any = null;
      try {
        certified = runSharpRDD(data, rdOutcome, rdRunning, cutoff);
      } catch (_e) { certified = null; }

      const formattedResult = {
        design: 'sharp',
        rdEstimate,
        certified,
        rdSE,
        rdT,
        rdP,
        predBelow,
        predAbove,
        belowCount: belowData.length,
        aboveCount: aboveData.length,
        olsBelow,
        olsAbove,
        cutoff,
        bandwidth,
        rdPolynomial,
        specification: `RD Local ${rdPolynomial === 'quadratic' ? 'Quadratic' : 'Linear'}: ${rdOutcome} ~ Treatment Jump at ${rdRunning} = ${cutoff} (Bandwidth: ${bandwidth})`,
        rdOutcome,
        rdRunning,
        rdCutoff: cutoff,
        rdBandwidth: bandwidth,
        causalType: 'rd'
      };

      setRdResult(formattedResult);
      onRunComplete({
        type: 'generic',
        specification: formattedResult.specification,
        results: formattedResult
      });
    } catch (err: any) {
      setEstimationError(`Estimation error: ${err.message || err}`);
    } finally {
      setIsEstimating(false);
    }
  };

  // --- DYNAMIC PANEL GMM (Arellano-Bond, Python backend) ---
  const handleRunGMM = async () => {
    if (!gmmEntity || !gmmTime || !gmmDep) return;
    setIsEstimating(true);
    setEstimationError(null);
    try {
      // Column order sent to the backend: [entity, time, dep, ...controls].
      // The endpoint takes column *indices* (as strings) into this matrix.
      const cols = [gmmEntity, gmmTime, gmmDep, ...gmmInstruments];
      const rows = (dataset.data || []).filter(r =>
        cols.every(c => r[c] !== undefined && r[c] !== null && !isNaN(parseFloat(r[c])))
      );
      if (rows.length < gmmInstruments.length + 8) {
        throw new Error('Too few complete numeric rows for dynamic GMM. Entity, time and the dependent variable must all be numeric, with at least 3 periods per entity.');
      }
      const data = rows.map(r => cols.map(c => parseFloat(r[c])));
      const res = await runGMM({
        data,
        entityVar: '0',
        timeVar: '1',
        depVar: '2',
        instruments: gmmInstruments.map((_, i) => String(3 + i)),
        columnNames: cols,
        gmmType,
      });
      setGmmResult({ ...res, gmmDep, gmmEntity, gmmTime, gmmType, gmmInstruments });
      const specLabel = gmmType === 'system'
        ? `Dynamic Panel System GMM (Blundell-Bond): ${gmmDep} on L1.${gmmDep}` + (gmmInstruments.length ? ` + ${gmmInstruments.join(' + ')}` : '')
        : `Dynamic Panel GMM (Arellano-Bond): d.${gmmDep} on d.L1.${gmmDep}` + (gmmInstruments.length ? ` + ${gmmInstruments.join(' + ')}` : '');
      onRunComplete({
        type: 'generic',
        specification: specLabel,
        results: {
          ...res,
          causalType: 'gmm',
          gmmType,
          gmmDep,
          gmmEntity,
          gmmTime,
          gmmInstruments,
        }
      });
    } catch (err: any) {
      setEstimationError(`Estimation error: ${err.message || err}`);
    } finally {
      setIsEstimating(false);
    }
  };

  // Reproducibility code for the GMM tab. The two gmmType values are backed
  // by genuinely different estimators server-side (backend/main.py's
  // /python/gmm), not just different labels on the same math:
  //  - 'system': real pydynpd (regression.abond), the same package
  //    backend/main.py itself uses, with lag(2:.) instruments -- the
  //    standard Blundell-Bond moment conditions, so xtabond2/pgmm-style
  //    code genuinely approximates it.
  //  - 'difference': a hand-rolled Anderson-Hsiao-style estimator (single
  //    y_{t-2} instrument for the differenced lagged DV via linearmodels
  //    IVGMM) -- NOT full Arellano-Bond with the usual GMM-style expanding
  //    instrument set. Genuine xtabond/xtabond2/pgmm calls would use a much
  //    larger instrument matrix and would NOT reproduce this tab's numbers,
  //    so the replication code mirrors the app's actual single-instrument
  //    construction instead.
  const getGmmCode = (lang: 'r' | 'stata' | 'python'): string => {
    if (!gmmResult) return '';
    const dep = gmmResult.gmmDep;
    const ent = gmmResult.gmmEntity;
    const time = gmmResult.gmmTime;
    const instr: string[] = gmmResult.gmmInstruments || [];

    if (gmmResult.gmmType === 'system') {
      const instrList = instr.join(' ');
      if (lang === 'python') {
        return `# pip install pydynpd\nfrom pydynpd import regression\n\ncommand_str = "${dep} L1.${dep}${instr.map(i => ` ${i}`).join('')} | gmm(${dep}, 2:.) | onestep"\nmydpd = regression.abond(command_str, df, ["${ent}", "${time}"])\nprint(mydpd.models[0].regression_table)`;
      }
      if (lang === 'stata') {
        return `* Requires the community xtabond2 package: ssc install xtabond2\n* Same Blundell-Bond moment conditions as this app's pydynpd backend\n* (a different implementation of the same standard estimator -- expect\n* close but not bit-identical numbers)\nxtset ${ent} ${time}\nxtabond2 ${dep} L.${dep}${instrList ? ' ' + instrList : ''}, gmm(${dep}, lag(2 .)) ${instrList ? `iv(${instrList}) ` : ''}system onestep`;
      }
      return `# install.packages("plm")\nlibrary(plm)\n\npdata <- pdata.frame(df, index = c("${ent}", "${time}"))\n# Same Blundell-Bond moment conditions as this app's pydynpd backend (a\n# different implementation of the same standard estimator -- check pgmm's\n# lag-range argument against the app's gmm(${dep}, 2:.) if numbers don't\n# align closely).\n# effect = "individual" is REQUIRED here: pgmm() silently defaults to\n# "twoways" (adds time dummies) when effect is unspecified in some plm\n# versions, which neither xtabond2 nor pydynpd includes by default --\n# verified this mismatch materially biases the coefficient and fails the\n# Sargan test on synthetic data with a known true AR coefficient.\nmodel <- pgmm(${dep} ~ lag(${dep}, 1)${instr.map(i => ` + ${i}`).join('')} | lag(${dep}, 2:99), data = pdata, transformation = "ld", model = "onestep", effect = "individual")\nsummary(model)`;
    }

    // 'difference': mirror the app's own Anderson-Hsiao-style construction
    // exactly (see backend/main.py run_gmm) -- not a generic Arellano-Bond call.
    if (lang === 'python') {
      let code = `import pandas as pd\nimport statsmodels.api as sm\nfrom linearmodels.iv import IVGMM\n\ndf = df.set_index(['${ent}', '${time}']).sort_index()\n\n`;
      code += `df['y_lag1'] = df.groupby(level=0)['${dep}'].shift(1)\ndf['y_lag2'] = df.groupby(level=0)['${dep}'].shift(2)\ndf['dy'] = df['${dep}'] - df['y_lag1']\ndf['dy_lag1'] = df['y_lag1'] - df['y_lag2']\n\n`;
      instr.forEach(c => { code += `df['d_${c}'] = df['${c}'] - df.groupby(level=0)['${c}'].shift(1)\n`; });
      const exogCols = instr.map(c => `'d_${c}'`).join(', ');
      code += `\nmodel_df = df[['dy', 'dy_lag1', 'y_lag2'${instr.length ? ", " + instr.map(c => `'d_${c}'`).join(', ') : ''}]].dropna()\n\n`;
      code += `y = model_df['dy']\nendog = model_df['dy_lag1']\ninstrument = model_df['y_lag2']\n`;
      code += instr.length ? `exog = sm.add_constant(model_df[[${exogCols}]])\n` : `exog = pd.Series(1, index=model_df.index, name='const')\n`;
      code += `\nmodel = IVGMM(y, exog, endog, instrument)\nresults = model.fit()\nprint(results.summary)`;
      return code;
    }
    if (lang === 'stata') {
      let code = `* Anderson-Hsiao-style single-lag IV (matches this app's exact\n* construction -- NOT full Arellano-Bond with the usual expanding\n* GMM instrument set, which would use a different instrument matrix\n* and NOT reproduce these numbers)\nxtset ${ent} ${time}\ngen dy = D.${dep}\ngen dy_lag1 = L1.D.${dep}\ngen y_lag2 = L2.${dep}\n`;
      instr.forEach(c => { code += `gen d_${c} = D.${c}\n`; });
      const rhs = instr.map(c => `d_${c}`).join(' ');
      code += `\nivregress gmm dy ${rhs}${rhs ? ' ' : ''}(dy_lag1 = y_lag2)`;
      return code;
    }
    let code = `library(dplyr)\nlibrary(AER)\n\ndf <- df %>%\n  group_by(${ent}) %>%\n  arrange(${time}) %>%\n  mutate(\n    y_lag1 = lag(${dep}, 1),\n    y_lag2 = lag(${dep}, 2),\n    dy = ${dep} - y_lag1,\n    dy_lag1 = y_lag1 - y_lag2`;
    instr.forEach(c => { code += `,\n    d_${c} = ${c} - lag(${c}, 1)`; });
    code += `\n  ) %>%\n  ungroup() %>%\n  na.omit()\n\n`;
    const exogFormula = instr.map(c => `d_${c}`).join(' + ');
    code += `# Anderson-Hsiao-style single-lag IV (matches this app's exact\n# construction -- NOT full Arellano-Bond with the usual expanding GMM\n# instrument set, which would use a different instrument matrix and\n# NOT reproduce these numbers)\n`;
    code += `model <- ivreg(dy ~ dy_lag1${exogFormula ? ' + ' + exogFormula : ''} | y_lag2${exogFormula ? ' + ' + exogFormula : ''}, data = df)\nsummary(model)`;
    return code;
  };

  const handleCopyGmmCode = (lang: 'r' | 'stata' | 'python') => {
    copyTextToClipboard(getGmmCode(lang)).then(success => {
      if (success) {
        setGmmCodeCopied(lang);
        setTimeout(() => setGmmCodeCopied(null), 2000);
      }
    });
  };

  // --- SYNTHETIC CONTROL METHOD (Abadie-Diamond-Hainmueller, Python backend) ---
  const handleRunSynth = async () => {
    if (!scUnitVar || !scTimeVar || !scOutcomeVar || !scTreatedUnit || !scPreStart || !scPreEnd || !scPostEnd) return;
    setScRunning(true);
    setScError(null);
    try {
      const controlUnits = scUnitValues.filter(u => u !== scTreatedUnit);
      if (controlUnits.length < 2) throw new Error('Need at least 2 control (donor) units besides the treated unit.');
      const res = await runSyntheticControl({
        data: dataset.data || [],
        unitVar: scUnitVar, timeVar: scTimeVar, outcomeVar: scOutcomeVar,
        treatedUnit: scTreatedUnit, controlUnits,
        preperiodStart: parseFloat(scPreStart), preperiodEnd: parseFloat(scPreEnd), postperiodEnd: parseFloat(scPostEnd),
      });
      setScResult({ ...res, scUnitVar, scTimeVar, scOutcomeVar, scTreatedUnit, controlUnits, scPreStart: parseFloat(scPreStart), scPreEnd: parseFloat(scPreEnd), scPostEnd: parseFloat(scPostEnd) });
      onRunComplete({
        type: 'generic',
        specification: `Synthetic Control: ${scTreatedUnit} vs. donor pool (${controlUnits.length} units)`,
        results: res
      });
    } catch (err: any) {
      setScError(`Estimation error: ${err.message || err}`);
    } finally {
      setScRunning(false);
    }
  };

  // Reproducibility code for Synthetic Control. Matches backend/main.py's
  // run_synthetic_control exactly: predictors default to [outcomeVar] alone
  // (no separate predictor variables are collected by this tab's UI),
  // predictors_op="mean", and the optimization window equals the full
  // pre-period. Real pysyncon/Synth/synth calls, all implementing the same
  // Abadie-Diamond-Hainmueller estimator the backend uses.
  const getSynthCode = (lang: 'r' | 'stata' | 'python'): string => {
    if (!scResult) return '';
    const { scUnitVar: unit, scTimeVar: time, scOutcomeVar: y, scTreatedUnit: treated, controlUnits, scPreStart: preStart, scPreEnd: preEnd, scPostEnd: postEnd } = scResult;
    const controlsList = (controlUnits || []).map((c: string) => `"${c}"`).join(', ');

    if (lang === 'python') {
      return `# pip install pysyncon\nfrom pysyncon import Dataprep, Synth\n\ndataprep = Dataprep(\n    foo=df, predictors=["${y}"], predictors_op="mean",\n    time_predictors_prior=range(${preStart}, ${preEnd} + 1),\n    dependent="${y}", unit_variable="${unit}", time_variable="${time}",\n    treatment_identifier="${treated}", controls_identifier=[${controlsList}],\n    time_optimize_ssr=range(${preStart}, ${preEnd} + 1),\n)\nsynth = Synth()\nsynth.fit(dataprep=dataprep)\nprint(synth.weights())\nprint(synth.att(time_period=range(${preEnd} + 1, ${postEnd} + 1)))`;
    }
    if (lang === 'stata') {
      return `* Requires the Synth package (Abadie, Diamond & Hainmueller):\n* ssc install synth\ntsset ${unit} ${time}\nsynth ${y} ${y}(${preStart}(1)${preEnd}), trunit(${treated}) trperiod(${preEnd + 1}) ///\n  xperiod(${preStart}(1)${preEnd})`;
    }
    return `# install.packages("Synth")\nlibrary(Synth)\n\ndataprep.out <- dataprep(\n  foo = df, predictors = "${y}", predictors.op = "mean",\n  time.predictors.prior = ${preStart}:${preEnd},\n  dependent = "${y}", unit.variable = "${unit}", time.variable = "${time}",\n  treatment.identifier = "${treated}", controls.identifier = c(${controlsList}),\n  time.optimize.ssr = ${preStart}:${preEnd}, time.plot = ${preStart}:${postEnd}\n)\nsynth.out <- synth(dataprep.out)\nsynth.tables <- synth.tab(dataprep.res = dataprep.out, synth.res = synth.out)\nprint(synth.tables$tab.w)`;
  };

  const handleCopySynthCode = (lang: 'r' | 'stata' | 'python') => {
    copyTextToClipboard(getSynthCode(lang)).then(success => {
      if (success) {
        setScCodeCopied(lang);
        setTimeout(() => setScCodeCopied(null), 2000);
      }
    });
  };

  // --- STAGGERED-ADOPTION DIFFERENCE-IN-DIFFERENCES (Callaway-Sant'Anna) ---
  const handleRunStaggered = async () => {
    if (!sdidId || !sdidTime || !sdidOutcome || !sdidGroup) return;
    setSdidRunning(true);
    setSdidError(null);
    try {
      const res = await runStaggeredDID({
        data: dataset.data || [],
        idVar: sdidId, timeVar: sdidTime, outcomeVar: sdidOutcome, groupVar: sdidGroup,
        controlGroup: sdidControlGroup,
      });
      setSdidResult({ ...res, sdidId, sdidTime, sdidOutcome, sdidGroup, sdidControlGroup });
      onRunComplete({
        type: 'generic',
        specification: `Staggered DiD (Callaway-Sant'Anna): ${sdidOutcome} ~ cohort(${sdidGroup})`,
        results: res
      });
    } catch (err: any) {
      setSdidError(`Estimation error: ${err.message || err}`);
    } finally {
      setSdidRunning(false);
    }
  };

  // Reproducibility code for Staggered DiD. Matches backend/main.py's
  // run_staggered_did exactly: csdid's ATTgt(..., control_group=[cg]),
  // fit(est_method="dr") (doubly robust), then aggte(typec="dynamic") and
  // aggte(typec="simple"). Real csdid/did/csdid-Stata calls, all
  // implementing the same Callaway-Sant'Anna estimator the backend uses.
  const getStaggeredCode = (lang: 'r' | 'stata' | 'python'): string => {
    if (!sdidResult) return '';
    const { sdidId: id, sdidTime: time, sdidOutcome: y, sdidGroup: group, sdidControlGroup: cg } = sdidResult;

    if (lang === 'python') {
      return `# pip install csdid\nfrom csdid.att_gt import ATTgt\n\natt_gt = ATTgt(\n    yname="${y}", tname="${time}", idname="${id}", gname="${group}",\n    data=df, control_group=["${cg}"],\n)\nfitted = att_gt.fit(est_method="dr")\nprint(fitted.results)\n\ndynamic = fitted.aggte(typec="dynamic")\nsimple = fitted.aggte(typec="simple")\nprint(dynamic.atte)\nprint(simple.atte)`;
    }
    if (lang === 'stata') {
      return `* Requires the community csdid package (Rios-Avila, Sant'Anna & Callaway):\n* ssc install csdid\n* ssc install drdid\ncsdid ${y}, ivar(${id}) time(${time}) gvar(${group}) method(dripw) ///\n  ${cg === 'notyettreated' ? 'notyet' : ''}\nestat event, estore(cs)\nestat simple`;
    }
    return `# install.packages("did")\nlibrary(did)\n\natt_gt <- att_gt(\n  yname = "${y}", tname = "${time}", idname = "${id}", gname = "${group}",\n  data = df, control_group = "${cg}", est_method = "dr"\n)\n\ndynamic <- aggte(att_gt, type = "dynamic")\nsimple <- aggte(att_gt, type = "simple")\nsummary(dynamic)\nsummary(simple)`;
  };

  const handleCopyStaggeredCode = (lang: 'r' | 'stata' | 'python') => {
    copyTextToClipboard(getStaggeredCode(lang)).then(success => {
      if (success) {
        setSdidCodeCopied(lang);
        setTimeout(() => setSdidCodeCopied(null), 2000);
      }
    });
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-3xl font-serif font-bold text-stone-900 italic">Causal Inference Laboratory</h1>
          <p className="text-sm text-stone-500 font-serif italic mt-1">
            Isolate true structural parameters using Difference-in-Differences, Instrumental Variables, or Sharp RD designs.
          </p>
        </div>
        <div className="flex gap-1.5 bg-stone-100 p-1 rounded-xl w-fit">
          <button
            onClick={() => setActiveTab('did')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'did' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Difference-in-Differences
          </button>
          <button
            onClick={() => setActiveTab('iv')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'iv' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            2SLS (IV)
          </button>
          <button
            onClick={() => setActiveTab('rd')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'rd' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Regression Discontinuity
          </button>
          <button
            onClick={() => setActiveTab('gmm')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'gmm' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Dynamic GMM
          </button>
          <button
            onClick={() => setActiveTab('synth')}
            className={cn(
              "px-4 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-all",
              activeTab === 'synth' ? "bg-white text-stone-900 shadow-sm" : "text-stone-500 hover:text-stone-700"
            )}
          >
            Synthetic Control
          </button>
        </div>
      </div>

      {/* DID PANEL */}
      {activeTab === 'did' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-stone-600" />
              DiD Specification
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setDidMode('simple')}
                className={cn("p-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition",
                  didMode === 'simple' ? 'border-[#1B2E41] bg-[#1B2E41]/5 text-[#1B2E41]' : 'border-stone-200 text-stone-500')}
              >
                Simple 2&times;2
              </button>
              <button
                onClick={() => setDidMode('staggered')}
                className={cn("p-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition",
                  didMode === 'staggered' ? 'border-[#1B2E41] bg-[#1B2E41]/5 text-[#1B2E41]' : 'border-stone-200 text-stone-500')}
              >
                Staggered (CS)
              </button>
            </div>

            {didMode === 'simple' && (
            <>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome variable (Y)</label>
                <select
                  value={didOutcome}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDidOutcome(v);
                    setDidControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Treatment Indicator (D)</label>
                <select
                  value={didTreatment}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDidTreatment(v);
                    setDidControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select treatment column (0/1)...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Time Indicator (Post/Pre)</label>
                <select
                  value={didTime}
                  onChange={(e) => {
                    const v = e.target.value;
                    setDidTime(v);
                    setDidControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select post/pre column (0/1)...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Control Variables</label>
                <div className="max-h-28 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1 bg-stone-50">
                  {numericVars.filter(v => v.name !== didOutcome && v.name !== didTreatment && v.name !== didTime).map(v => (
                    <label key={v.name} className="flex items-center gap-2 text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={didControls.includes(v.name)}
                        onChange={(e) => {
                          if (e.target.checked) setDidControls([...didControls, v.name]);
                          else setDidControls(didControls.filter(c => c !== v.name));
                        }}
                        className="rounded text-[#1B2E41] focus:ring-[#1B2E41]"
                      />
                      {v.name}
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Cluster Variable (optional)</label>
                <select
                  value={didClusterVar}
                  onChange={(e) => setDidClusterVar(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">None (HC1 robust SE)</option>
                  {idVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
                <p className="text-[9px] text-stone-400 mt-1 font-serif italic leading-relaxed">
                  Recommended whenever your data has repeated observations per unit (e.g. entity/panel ID) — unclustered SEs are frequently invalid for DiD.
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleRunDiD}
                disabled={!didOutcome || !didTreatment || !didTime || isEstimating}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {isEstimating ? (
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                     <span>Estimating...</span>
                  </div>
                ) : (
                  <>
                    Run DiD Estimation <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {estimationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>
                    {estimationError}
                  </div>
                </div>
              )}
            </div>
            </>
            )}

            {didMode === 'staggered' && (
            <div className="space-y-3">
              <p className="text-[10px] text-stone-400 leading-relaxed">
                Callaway-Sant'Anna estimator for staggered treatment timing (different units treated at different periods). Runs on the Python (csdid) engine &mdash; matches R's did package.
              </p>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Unit ID variable</label>
                <select value={sdidId} onChange={e => setSdidId(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select variable...</option>
                  {variables.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Time variable</label>
                <select value={sdidTime} onChange={e => setSdidTime(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome variable (Y)</label>
                <select value={sdidOutcome} onChange={e => setSdidOutcome(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Cohort/Group variable</label>
                <select value={sdidGroup} onChange={e => setSdidGroup(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
                <p className="text-[9px] text-stone-400 mt-1">The period each unit was first treated; 0 = never treated.</p>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Control Group</label>
                <select value={sdidControlGroup} onChange={e => setSdidControlGroup(e.target.value as any)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="nevertreated">Never-treated units</option>
                  <option value="notyettreated">Not-yet-treated units</option>
                </select>
              </div>
              <button
                onClick={handleRunStaggered}
                disabled={sdidRunning || !sdidId || !sdidTime || !sdidOutcome || !sdidGroup}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {sdidRunning ? (
                  <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /><span>Estimating ATT(g,t)...</span></div>
                ) : (<>Run Staggered DiD <ArrowRight className="w-4 h-4" /></>)}
              </button>
              {sdidError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div><span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>{sdidError}</div>
                </div>
              )}
            </div>
            )}
          </div>

          <div className="lg:col-span-8 space-y-6">
            {didMode === 'staggered' ? (
              !sdidResult ? (
                <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                  <GitCommit className="w-10 h-10 text-stone-300 mb-2" />
                  <h4 className="text-sm font-bold text-stone-600">No Staggered DiD Run</h4>
                  <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Specify the unit/time/outcome/cohort variables to estimate ATT(g,t) across treatment cohorts.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  <span className="inline-block text-[9px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">Python / csdid (research-grade, matches R did)</span>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Overall ATT (event-study avg)</span>
                      <span className="text-xl font-serif font-bold text-[#1B2E41]">{fmt(sdidResult.dynamic?.overallATT)}</span>
                    </div>
                    <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Std Error</span>
                      <span className="text-xl font-serif text-stone-800">{fmt(sdidResult.dynamic?.overallSE)}</span>
                    </div>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4">Event-Study: ATT by Relative Period</h3>
                    <p className="text-[10px] text-stone-400 mb-3">Negative event-time = pre-treatment (should be near zero if parallel trends holds). e=0 is the treatment period.</p>
                    <div className="overflow-x-auto">
                      <table className="journal-table">
                        <thead><tr><th>Event time (e)</th><th>ATT</th><th>Std Error</th></tr></thead>
                        <tbody>
                          {(sdidResult.dynamic?.eventTime || []).map((e: number, i: number) => (
                            <tr key={e} className={e < 0 ? 'text-stone-400' : 'font-bold'}>
                              <td className="font-mono text-xs">{e >= 0 ? `+${e}` : e}</td>
                              <td className="text-right">{fmt(sdidResult.dynamic.att[i])}</td>
                              <td className="text-right">{fmt(sdidResult.dynamic.se[i])}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="p-5 bg-white border border-stone-200 rounded-2xl space-y-2">
                    <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                      <HelpCircle className="w-4 h-4 text-stone-600" /> Interpretation
                    </h4>
                    <p className="text-xs text-stone-600 leading-relaxed font-serif">
                      Pre-treatment (e &lt; 0) coefficients near zero support the parallel-trends assumption. Post-treatment (e &ge; 0) coefficients are the treatment effect at each relative period since adoption, estimated separately for each cohort then averaged (doubly-robust estimator), avoiding the negative-weighting bias of naive two-way fixed-effects DiD under staggered timing.
                    </p>
                  </div>

                  <div className="bg-white border border-stone-200 rounded-2xl p-6">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4 flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-stone-600" />
                      Institutional Reproducibility Code
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {(['stata', 'r', 'python'] as const).map(lang => (
                        <div key={lang} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                          <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
                            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                              {lang === 'r' ? 'R (.R)' : lang === 'stata' ? 'Stata (.do)' : 'Python (.py)'}
                            </span>
                            <button
                              onClick={() => handleCopyStaggeredCode(lang)}
                              className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                            >
                              {sdidCodeCopied === lang ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                            </button>
                          </div>
                          <div className="p-4">
                            <code className="text-[11px] font-mono text-slate-300 block whitespace-pre-wrap leading-relaxed">
                              {getStaggeredCode(lang)}
                            </code>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            ) : !didResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <TrendingUp className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No DiD Estimate Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Specify parameters on the left to measure counterfactual policy shifts.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Warnings */}
                {didResult.parallelTrendWarning && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Parallel Trends Hazard Detected</h4>
                      <p className="text-xs text-amber-800 leading-relaxed font-serif mt-0.5">
                        Parallel trends may be violated — pre-treatment means differ by {fmt(didResult.preTrendDiffSD)} SD (Treated: {fmt(didResult.meanTreatedPre)}, Control: {fmt(didResult.meanControlPre)}). This indicates potential selection bias, which threatens the parallel trends assumption required to interpret this coefficient as causal.
                      </p>
                    </div>
                  </div>
                )}

                {/* Grid summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Simple ATT</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{fmt(didResult.simpleATT)}</span>
                  </div>
                  <div className="p-4 bg-[#1B2E41]/5 border border-[#1B2E41]/20 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Regression ATT</span>
                    <span className="text-xl font-serif font-bold text-[#1B2E41]">
                      {fmt(didResult.ols.coefficients.find((c: any) => c.variable === 'treated_post')?.estimate || 0)}
                    </span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Treated Pre Mean</span>
                    <span className="text-lg font-serif text-stone-700">{fmt(didResult.meanTreatedPre)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Control Pre Mean</span>
                    <span className="text-lg font-serif text-stone-700">{fmt(didResult.meanControlPre)}</span>
                  </div>
                </div>

                {/* Regression Result table */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4">
                    Regression Coefficient Matrix ({didResult.didClusterVar ? `Clustered by ${didResult.didClusterVar}` : 'HC1 Errors'})
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Variable</th>
                          <th>Estimate</th>
                          <th>Std Error</th>
                          <th>t-stat</th>
                          <th>p-value</th>
                          <th>Significance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {didResult.ols.coefficients.map((coef: any) => {
                          const s = stars(coef.pValue);
                          return (
                            <tr key={coef.variable} className={coef.variable === 'treated_post' ? 'bg-[#1B2E41]/5 font-bold' : ''}>
                              <td className="font-mono text-xs">{coef.variable === 'treated_post' ? 'treated*post (ATT)' : coef.variable}</td>
                              <td className="text-right">{fmt(coef.estimate)}</td>
                              <td className="text-right">{fmt(coef.stdError)}</td>
                              <td className="text-right">{fmt(coef.tStat)}</td>
                              <td className="text-right">{fmtP(coef.pValue)}</td>
                              <td className="text-center font-bold">
                                <span className={cn(
                                  s === '***' ? "text-red-700" : s === '**' ? "text-amber-700" : "text-stone-400"
                                )}>{s || 'n.s.'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Reproducibility Code */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-stone-600" />
                    Institutional Reproducibility Code
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['stata', 'r', 'python'] as const).map(lang => (
                      <div key={lang} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                        <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
                          <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                            {lang === 'r' ? 'R (.R)' : lang === 'stata' ? 'Stata (.do)' : 'Python (.py)'}
                          </span>
                          <button
                            onClick={() => handleCopyDidCode(lang)}
                            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {didCodeCopied === lang ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="p-4">
                          <code className="text-[11px] font-mono text-slate-300 block whitespace-pre-wrap leading-relaxed">
                            {getDidCode(lang)}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2SLS PANEL */}
      {activeTab === 'iv' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Binary className="w-4 h-4 text-stone-600" />
              IV 2SLS Specification
            </h3>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome variable (Y)</label>
                <select
                  value={ivOutcome}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIvOutcome(v);
                    setIvControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Endogenous Regressor (X)</label>
                <select
                  value={ivEndogenous}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIvEndogenous(v);
                    setIvControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Instrumental Variable (Z)</label>
                <select
                  value={ivInstrument}
                  onChange={(e) => {
                    const v = e.target.value;
                    setIvInstrument(v);
                    setIvControls(prev => prev.filter(c => c !== v));
                  }}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Control Variables</label>
                <div className="max-h-28 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1 bg-stone-50">
                  {numericVars.filter(v => v.name !== ivOutcome && v.name !== ivEndogenous && v.name !== ivInstrument).map(v => (
                    <label key={v.name} className="flex items-center gap-2 text-xs text-stone-700">
                      <input
                        type="checkbox"
                        checked={ivControls.includes(v.name)}
                        onChange={(e) => {
                          if (e.target.checked) setIvControls([...ivControls, v.name]);
                          else setIvControls(ivControls.filter(c => c !== v.name));
                        }}
                        className="rounded text-[#1B2E41] focus:ring-[#1B2E41]"
                      />
                      {v.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleRunIV}
                disabled={!ivOutcome || !ivEndogenous || !ivInstrument || isEstimating}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {isEstimating ? (
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                     <span>Estimating...</span>
                  </div>
                ) : (
                  <>
                    Run 2SLS Regression <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {estimationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>
                    {estimationError}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!ivResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <Binary className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No IV Model Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Specify your target variable, endogenous regressor, and instrument to start the two-stage process.</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Warnings */}
                {ivResult.isWeak ? (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl flex items-start gap-3">
                    <ShieldAlert className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider">Weak Instrument Hazard (F &lt; 10)</h4>
                      <p className="text-xs text-amber-800 leading-relaxed font-serif mt-0.5">
                        First stage regression F-statistic is only {fmt(ivResult.firstStageF)}. An F-stat below the Stock-Yogo rule of thumb threshold of 10 indicates a weak instrument, which can amplify bias and invalidate conventional standard error inference.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-xs font-bold text-emerald-900 uppercase tracking-wider">Strong Instrument Confirmed</h4>
                      <p className="text-xs text-emerald-800 leading-relaxed font-serif mt-0.5">
                        First stage regression F-statistic is {fmt(ivResult.firstStageF)} (&gt; 10). The instrument contains sufficient predictive power to mitigate the weak instrument puzzle.
                      </p>
                    </div>
                  </div>
                )}

                {/* Sargan Overid Note */}
                <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl flex items-start gap-2.5 text-stone-600">
                  <Info className="w-4 h-4 text-stone-500 mt-0.5 shrink-0" />
                  <p className="text-xs font-serif italic leading-relaxed">
                    <strong>Overidentification Test Note:</strong> The current specification has exactly 1 instrument for 1 endogenous regressor (just identified). Consequently, the model has zero degrees of freedom for an overidentification test (e.g., Sargan-Hansen J-test).
                  </p>
                </div>

                {/* Second Stage Results */}
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4">Second Stage Coefficient Matrix (IV-2SLS, Classical SE)</h3>
                  <div className="overflow-x-auto">
                    <table className="journal-table">
                      <thead>
                        <tr>
                          <th>Variable</th>
                          <th>Estimate</th>
                          <th>Std Error</th>
                          <th>t-stat</th>
                          <th>p-value</th>
                          <th>Significance</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ivResult.secondStage.coefficients.map((coef: any) => {
                          const s = stars(coef.pValue);
                          return (
                            <tr key={coef.variable} className={coef.variable.includes('(Instrumented)') ? 'bg-indigo-50/50 font-bold' : ''}>
                              <td className="font-mono text-xs">{coef.variable}</td>
                              <td className="text-right">{fmt(coef.estimate)}</td>
                              <td className="text-right">{fmt(coef.stdError)}</td>
                              <td className="text-right">{fmt(coef.tStat)}</td>
                              <td className="text-right">{fmtP(coef.pValue)}</td>
                              <td className="text-center font-bold">
                                <span className={cn(
                                  s === '***' ? "text-red-700" : s === '**' ? "text-amber-700" : "text-stone-400"
                                )}>{s || 'n.s.'}</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-4 pt-4 border-t border-stone-100">
                    <ShowCode 
                      parameters={{
                        modelType: "iv",
                        yVariable: ivOutcome,
                        xVariables: [ivEndogenous, ...ivControls],
                        filePath: dataset?.name,
                        options: {
                          instruments: [ivInstrument]
                        }
                      }}
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* RD PANEL */}
      {activeTab === 'rd' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-stone-600" />
              RD Design Specification
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setRdDesign('sharp'); setRdResult(null); }}
                className={cn("p-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition",
                  rdDesign === 'sharp' ? 'border-[#1B2E41] bg-[#1B2E41]/5 text-[#1B2E41]' : 'border-stone-200 text-stone-500')}
              >
                Sharp (perfect compliance)
              </button>
              <button
                onClick={() => { setRdDesign('fuzzy'); setRdResult(null); }}
                className={cn("p-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition",
                  rdDesign === 'fuzzy' ? 'border-[#1B2E41] bg-[#1B2E41]/5 text-[#1B2E41]' : 'border-stone-200 text-stone-500')}
              >
                Fuzzy (imperfect compliance)
              </button>
            </div>
            <p className="text-[10px] text-stone-400 leading-relaxed">
              {rdDesign === 'fuzzy'
                ? 'Fuzzy RD: crossing the cutoff shifts the probability of treatment rather than assigning it deterministically. Estimates a Local Average Treatment Effect (LATE) by instrumenting actual treatment status with the above/below-cutoff indicator (2SLS).'
                : 'Sharp RD: treatment is a deterministic function of the running variable crossing the cutoff (perfect compliance).'}
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome variable (Y)</label>
                <select
                  value={rdOutcome}
                  onChange={(e) => setRdOutcome(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Running Variable (R)</label>
                <select
                  value={rdRunning}
                  onChange={(e) => setRdRunning(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>

              {rdDesign === 'fuzzy' && (
                <div>
                  <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Treatment Status (D, actual take-up)</label>
                  <select
                    value={rdTreatment}
                    onChange={(e) => setRdTreatment(e.target.value)}
                    className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                  >
                    <option value="">Select variable...</option>
                    {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                  </select>
                  <p className="text-[10px] text-stone-400 mt-1">The observed compliance/take-up indicator — separate from the running variable's cutoff crossing.</p>
                </div>
              )}

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Cutoff Boundary (c)</label>
                <input
                  type="number"
                  step="any"
                  value={rdCutoff}
                  onChange={(e) => setRdCutoff(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Bandwidth Boundary (h)</label>
                <input
                  type="number"
                  step="any"
                  value={rdBandwidth}
                  onChange={(e) => setRdBandwidth(e.target.value)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Polynomial Order</label>
                <select
                  value={rdPolynomial}
                  onChange={(e) => setRdPolynomial(e.target.value as any)}
                  className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800"
                >
                  <option value="linear">Local Linear</option>
                  <option value="quadratic">Local Quadratic</option>
                </select>
              </div>

              <label className="flex items-start gap-2 text-[11px] text-stone-600 cursor-pointer bg-stone-50 border border-stone-100 rounded-lg p-2.5">
                <input type="checkbox" checked={researchGradeRd} onChange={e => setResearchGradeRd(e.target.checked)} className="rounded text-[#1B2E41] focus:ring-[#1B2E41] mt-0.5" />
                <span>Research-grade engine (Python / rdrobust) <span className="text-stone-400">— MSE bandwidth + bias correction. Requires sign-in.</span></span>
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <button
                onClick={handleRunRD}
                disabled={!rdOutcome || !rdRunning || !rdBandwidth || isEstimating || (rdDesign === 'fuzzy' && !rdTreatment)}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
              >
                {isEstimating ? (
                  <div className="flex items-center gap-2">
                     <div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                     <span>Estimating...</span>
                  </div>
                ) : (
                  <>
                    Estimate Local RD <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
              {estimationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>
                    {estimationError}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!rdResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <Target className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No RD Estimate Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Specify parameters to measure discontinuity and intercept jumps at your running variable's cutoff threshold.</p>
              </div>
            ) : rdResult.engine === 'python' ? (
              <div className="space-y-6 animate-in fade-in duration-500">
                <span className="inline-block text-[9px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">
                  Python / rdrobust (research-grade) — {rdResult.design === 'fuzzy' ? 'Fuzzy RDD' : 'Sharp RDD'}
                </span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">{rdResult.design === 'fuzzy' ? 'LATE (fuzzy coef)' : 'RD Effect (coef)'}</span>
                    <span className="text-xl font-serif font-bold text-[#1B2E41]">{fmt(rdResult.rdEstimate)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Robust p-value</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{fmtP(rdResult.rdP)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">MSE Bandwidth</span>
                    <span className="text-xl font-serif text-stone-800">{fmt(rdResult.bandwidth)}</span>
                  </div>
                </div>
                {rdResult.design === 'fuzzy' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">First-Stage Jump (compliance)</span>
                      <span className="text-xl font-serif font-bold text-stone-800">{fmt(rdResult.firstStageCoef)}</span>
                    </div>
                    <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">First-Stage Robust SE</span>
                      <span className="text-xl font-serif text-stone-800">{fmt(rdResult.firstStageSE)}</span>
                    </div>
                    <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">First-Stage Robust p-value</span>
                      <span className="text-xl font-serif text-stone-800">{fmtP(rdResult.firstStageP)}</span>
                    </div>
                  </div>
                )}
                <div className="p-5 bg-white border border-stone-200 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-stone-600" /> rdrobust estimate
                  </h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    {rdResult.design === 'fuzzy'
                      ? <>Local-linear Fuzzy RD with MSE-optimal bandwidth and robust, bias-corrected Wald-ratio inference — the same algorithm as R's <span className="font-mono">rdrobust</span>'s <span className="font-mono">fuzzy=</span> argument. The LATE scales the reduced-form outcome jump by the first-stage jump in treatment take-up.</>
                      : <>Local-linear RD with MSE-optimal bandwidth and robust, bias-corrected inference — the same algorithm as R's <span className="font-mono">rdrobust</span>.</>}
                    {' '}Robust SE = {fmt(rdResult.rdSE)}, 95% CI = [{fmt(rdResult.ciLow)}, {fmt(rdResult.ciHigh)}], N used = {rdResult.nUsed}.
                  </p>
                </div>
              </div>
            ) : rdResult.design === 'fuzzy' ? (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">LATE (2SLS)</span>
                    <span className="text-xl font-serif font-bold text-[#1B2E41]">{fmt(rdResult.rdEstimate)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">RD p-value</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{fmtP(rdResult.rdP)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Observations in h</span>
                    <span className="text-xl font-serif text-stone-800">{rdResult.fuzzy?.includedObs}</span>
                  </div>
                </div>

                <div className="p-5 bg-white border border-stone-200 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <Target className="w-4 h-4 text-stone-600" />
                    First-Stage Compliance Jump
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Jump in Treatment Probability</span>
                      <span className="text-lg font-serif font-bold text-[#1B2E41]">{fmt(rdResult.fuzzy?.firstStageJump)}</span>
                    </div>
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Std Error</span>
                      <span className="text-lg font-serif text-stone-800">{fmt(rdResult.fuzzy?.firstStageSE)}</span>
                    </div>
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">p-value</span>
                      <span className="text-lg font-serif text-stone-800">{fmtP(rdResult.fuzzy?.firstStagePValue)}</span>
                    </div>
                    <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Bandwidth ({rdResult.fuzzy?.bandwidthSelector})</span>
                      <span className="text-lg font-serif text-stone-800">{fmt(rdResult.fuzzy?.bandwidth)}</span>
                    </div>
                  </div>
                  <p className="text-[11px] text-stone-400 leading-normal italic">{rdResult.fuzzy?.methodNote}</p>
                </div>

                {/* Interpretation */}
                <div className="p-5 bg-white border border-stone-200 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-stone-600" />
                    Econometric interpretation
                  </h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    Crossing the cutoff <span className="font-mono">{rdResult.cutoff}</span> in <strong className="text-stone-800">{rdResult.rdRunning}</strong> shifts the probability of receiving <strong className="text-stone-800">{rdResult.rdTreatment}</strong> rather than assigning it deterministically. Instrumenting actual treatment status with the above/below-cutoff indicator (local 2SLS, bandwidth <span className="font-mono">{fmt(rdResult.bandwidth)}</span>) yields a Local Average Treatment Effect on <strong className="text-stone-800">{rdOutcome}</strong> of <strong>{fmt(rdResult.rdEstimate)}</strong> (SE = {fmt(rdResult.rdSE)}), t-stat {fmt(rdResult.rdT)} ({stars(rdResult.rdP) || 'not statistically significant'}).
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 animate-in fade-in duration-500">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">RD Effect Jump</span>
                    <span className="text-xl font-serif font-bold text-[#1B2E41]">{fmt(rdResult.rdEstimate)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">RD p-value</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{fmtP(rdResult.rdP)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Observations in h</span>
                    <span className="text-xl font-serif text-stone-800">{rdResult.belowCount + rdResult.aboveCount}</span>
                  </div>
                </div>

                {/* Certified local-linear cross-check (runSharpRDD) */}
                {rdResult.certified && (
                  <div className="p-5 bg-white border border-stone-200 rounded-2xl space-y-3">
                    <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                      <Target className="w-4 h-4 text-stone-600" />
                      Certified Local-Linear Estimate (auto bandwidth)
                    </h4>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                        <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Treatment Effect</span>
                        <span className="text-lg font-serif font-bold text-[#1B2E41]">{fmt(rdResult.certified.rddEstimate)}</span>
                      </div>
                      <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                        <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Std Error</span>
                        <span className="text-lg font-serif text-stone-800">{fmt(rdResult.certified.rddStdError)}</span>
                      </div>
                      <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                        <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">p-value</span>
                        <span className="text-lg font-serif text-stone-800">{fmtP(rdResult.certified.rddPValue)}</span>
                      </div>
                      <div className="p-3 bg-stone-50 border border-stone-200 rounded-xl text-center">
                        <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Bandwidth ({rdResult.certified.bandwidthSelector})</span>
                        <span className="text-lg font-serif text-stone-800">{fmt(rdResult.certified.bandwidth)}</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-stone-400 leading-normal italic">{rdResult.certified.methodNote}</p>
                  </div>
                )}

                {/* Interpretation */}
                <div className="p-5 bg-white border border-stone-200 rounded-2xl space-y-3">
                  <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-stone-600" />
                    Econometric interpretation
                  </h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    By restricting analysis to observations within a bandwidth of <span className="font-mono">{rdResult.bandwidth}</span> around the cutoff <span className="font-mono">{rdResult.cutoff}</span>, we assume local randomization. 
                    The estimated discontinuity jump in <strong className="text-stone-800">{rdOutcome}</strong> is <strong>{fmt(rdResult.rdEstimate)}</strong> (SE = {fmt(rdResult.rdSE)}), yielding a t-stat of {fmt(rdResult.rdT)} ({stars(rdResult.rdP) || 'not statistically significant'}).
                  </p>
                  <p className="text-[11px] text-stone-400 leading-normal italic">
                    Below Boundary Prediction: {fmt(rdResult.predBelow)} (N = {rdResult.belowCount}) | Above Boundary Prediction: {fmt(rdResult.predAbove)} (N = {rdResult.aboveCount})
                  </p>
                </div>
              </div>
            )}

            {rdResult && (
              <div className="bg-white border border-stone-200 rounded-2xl p-6">
                <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4 flex items-center gap-2">
                  <Terminal className="w-4 h-4 text-stone-600" />
                  Institutional Reproducibility Code
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {(['stata', 'r', 'python'] as const).map(lang => (
                    <div key={lang} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                      <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
                        <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                          {lang === 'r' ? 'R (.R)' : lang === 'stata' ? 'Stata (.do)' : 'Python (.py)'}
                        </span>
                        <button
                          onClick={() => handleCopyRdCode(lang)}
                          className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {rdCodeCopied === lang ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                        </button>
                      </div>
                      <div className="p-4">
                        <code className="text-[11px] font-mono text-slate-300 block whitespace-pre-wrap leading-relaxed">
                          {getRdCode(lang)}
                        </code>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* GMM PANEL */}
      {activeTab === 'gmm' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <GitCommit className="w-4 h-4 text-stone-600" />
              Dynamic Panel GMM
            </h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => { setGmmType('difference'); setGmmResult(null); }}
                className={cn("p-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition",
                  gmmType === 'difference' ? 'border-[#1B2E41] bg-[#1B2E41]/5 text-[#1B2E41]' : 'border-stone-200 text-stone-500')}
              >
                Difference (Arellano-Bond)
              </button>
              <button
                onClick={() => { setGmmType('system'); setGmmResult(null); }}
                className={cn("p-2 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition",
                  gmmType === 'system' ? 'border-[#1B2E41] bg-[#1B2E41]/5 text-[#1B2E41]' : 'border-stone-200 text-stone-500')}
              >
                System (Blundell-Bond)
              </button>
            </div>
            <p className="text-[10px] text-stone-400 leading-relaxed">
              {gmmType === 'system'
                ? 'Blundell-Bond: adds level-equation moment conditions (the lagged dependent variable in levels instrumented by its own lagged first-difference) to the Arellano-Bond difference equations, improving efficiency when the autoregressive coefficient is close to 1. Entity and Time must be numeric columns. Runs on the Python (pydynpd) engine -- matches Stata\'s xtabond2 conventions.'
                : 'Arellano-Bond: the model is first-differenced and the lagged dependent variable is instrumented with deeper lags. Entity and Time must be numeric columns. Runs on the Python (linearmodels) engine.'}
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Entity (Panel ID)</label>
                <select value={gmmEntity} onChange={e => setGmmEntity(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select entity column...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Time Period</label>
                <select value={gmmTime} onChange={e => setGmmTime(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select time column...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Dependent Variable (Y)</label>
                <select value={gmmDep} onChange={e => setGmmDep(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Exogenous Controls (optional)</label>
                <div className="max-h-28 overflow-y-auto border border-stone-200 rounded-lg p-2 space-y-1 bg-stone-50">
                  {numericVars.filter(v => v.name !== gmmEntity && v.name !== gmmTime && v.name !== gmmDep).map(v => (
                    <label key={v.name} className="flex items-center gap-2 text-xs text-stone-700">
                      <input type="checkbox" checked={gmmInstruments.includes(v.name)} onChange={e => {
                        if (e.target.checked) setGmmInstruments([...gmmInstruments, v.name]);
                        else setGmmInstruments(gmmInstruments.filter(c => c !== v.name));
                      }} className="rounded text-[#1B2E41] focus:ring-[#1B2E41]" />
                      {v.name}
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={handleRunGMM} disabled={!gmmEntity || !gmmTime || !gmmDep || isEstimating}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                {isEstimating ? (
                  <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /><span>Estimating...</span></div>
                ) : (<>Run Dynamic GMM <ArrowRight className="w-4 h-4" /></>)}
              </button>
              {estimationError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div><span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>{estimationError}</div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!gmmResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <GitCommit className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No GMM Model Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Select entity, time, and a dependent variable to fit a {gmmType === 'system' ? 'Blundell-Bond system' : 'Arellano-Bond difference'} dynamic panel model.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className={cn("grid gap-4", gmmResult.gmmType === 'system' ? "grid-cols-2 md:grid-cols-5" : "grid-cols-2 md:grid-cols-3")}>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Observations</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{gmmResult.n_obs ?? '—'}</span>
                  </div>
                  {gmmResult.gmmType === 'system' && (
                    <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Groups / Instruments</span>
                      <span className="text-xl font-serif font-bold text-stone-800">{gmmResult.n_groups ?? '—'} / {gmmResult.n_instruments ?? '—'}</span>
                    </div>
                  )}
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Hansen J</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{typeof gmmResult.j_stat === 'number' ? fmt(gmmResult.j_stat) : '—'}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">J p-value</span>
                    <span className="text-xl font-serif font-bold text-stone-800">{typeof gmmResult.j_pval === 'number' ? fmtP(gmmResult.j_pval) : '—'}</span>
                  </div>
                  {gmmResult.gmmType === 'system' && Array.isArray(gmmResult.arTests) && gmmResult.arTests.map((ar: any) => (
                    <div key={ar.lag} className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                      <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">AR({ar.lag}) p-value</span>
                      <span className="text-xl font-serif font-bold text-stone-800">{typeof ar.pValue === 'number' ? fmtP(ar.pValue) : '—'}</span>
                    </div>
                  ))}
                </div>
                {gmmResult.j_note && (
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl flex items-start gap-2.5 text-stone-600">
                    <Info className="w-4 h-4 text-stone-500 mt-0.5 shrink-0" />
                    <p className="text-xs font-serif italic leading-relaxed">{gmmResult.j_note}</p>
                  </div>
                )}
                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4">
                    {gmmResult.gmmType === 'system' ? 'System GMM Coefficient Matrix' : 'Dynamic GMM Coefficient Matrix'}
                  </h3>
                  <div className="overflow-x-auto">
                    <table className="journal-table">
                      <thead><tr><th>Variable</th><th>Estimate</th><th>Std Error</th><th>t-stat</th><th>p-value</th><th>Significance</th></tr></thead>
                      <tbody>
                        {(gmmResult.coefficients || []).map((coef: any) => {
                          const s = stars(coef.pValue);
                          return (
                            <tr key={coef.variable}>
                              <td className="font-mono text-xs">{coef.variable}</td>
                              <td className="text-right">{fmt(coef.estimate)}</td>
                              <td className="text-right">{fmt(coef.stdError)}</td>
                              <td className="text-right">{fmt(coef.tStat)}</td>
                              <td className="text-right">{fmtP(coef.pValue)}</td>
                              <td className="text-center font-bold"><span className={cn(s === '***' ? "text-red-700" : s === '**' ? "text-amber-700" : "text-stone-400")}>{s || 'n.s.'}</span></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-stone-600" />
                    Institutional Reproducibility Code
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['stata', 'r', 'python'] as const).map(lang => (
                      <div key={lang} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                        <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
                          <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                            {lang === 'r' ? 'R (.R)' : lang === 'stata' ? 'Stata (.do)' : 'Python (.py)'}
                          </span>
                          <button
                            onClick={() => handleCopyGmmCode(lang)}
                            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {gmmCodeCopied === lang ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="p-4">
                          <code className="text-[11px] font-mono text-slate-300 block whitespace-pre-wrap leading-relaxed">
                            {getGmmCode(lang)}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SYNTHETIC CONTROL PANEL */}
      {activeTab === 'synth' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-4 p-6 bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4">
            <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 flex items-center gap-2">
              <Target className="w-4 h-4 text-stone-600" />
              Synthetic Control Method
            </h3>
            <p className="text-[10px] text-stone-400 leading-relaxed">
              Abadie-Diamond-Hainmueller: builds a weighted combination of donor units that best reproduces the treated unit's pre-treatment path, then compares post-treatment gaps. Data must be a unit &times; time panel. Runs on the Python (pysyncon) engine &mdash; matches R's Synth package.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Unit Variable (e.g. state/country)</label>
                <select value={scUnitVar} onChange={e => { setScUnitVar(e.target.value); setScTreatedUnit(''); }} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select variable...</option>
                  {variables.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Time Variable</label>
                <select value={scTimeVar} onChange={e => setScTimeVar(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Outcome Variable (Y)</label>
                <select value={scOutcomeVar} onChange={e => setScOutcomeVar(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800">
                  <option value="">Select variable...</option>
                  {numericVars.map(v => <option key={v.name} value={v.name}>{v.name}</option>)}
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Treated Unit</label>
                <select value={scTreatedUnit} onChange={e => setScTreatedUnit(e.target.value)} disabled={!scUnitVar} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2.5 text-xs font-bold text-stone-800 disabled:opacity-50">
                  <option value="">Select unit...</option>
                  {scUnitValues.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
                {scUnitVar && <p className="text-[9px] text-stone-400 mt-1">All other units become the donor pool.</p>}
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[9px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Pre-start</label>
                  <input type="number" value={scPreStart} onChange={e => setScPreStart(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2 text-xs font-bold text-stone-800" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Treat. starts</label>
                  <input type="number" value={scPreEnd} onChange={e => setScPreEnd(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2 text-xs font-bold text-stone-800" />
                </div>
                <div>
                  <label className="text-[9px] font-bold text-stone-500 uppercase tracking-widest block mb-1">Post-end</label>
                  <input type="number" value={scPostEnd} onChange={e => setScPostEnd(e.target.value)} className="w-full bg-stone-50 border border-stone-200 rounded-lg p-2 text-xs font-bold text-stone-800" />
                </div>
              </div>
              <p className="text-[9px] text-stone-400 leading-relaxed">"Pre-start" to just before "Treat. starts" is the pre-treatment fitting window; "Treat. starts" through "Post-end" is where the treatment effect (gap) is measured.</p>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={handleRunSynth} disabled={scRunning || !scUnitVar || !scTimeVar || !scOutcomeVar || !scTreatedUnit || !scPreStart || !scPreEnd || !scPostEnd}
                className="w-full py-2.5 bg-[#1B2E41] hover:bg-[#243D54] disabled:bg-stone-300 text-white rounded-xl text-xs font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2">
                {scRunning ? (
                  <div className="flex items-center gap-2"><div className="w-3 h-3 border-2 border-white/20 border-t-white rounded-full animate-spin" /><span>Optimizing donor weights...</span></div>
                ) : (<>Run Synthetic Control <ArrowRight className="w-4 h-4" /></>)}
              </button>
              {scError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-[10px] font-medium flex items-start gap-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
                  <div><span className="font-bold block mb-0.5 uppercase tracking-widest text-[9px] text-red-800">Estimation Failed</span>{scError}</div>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {!scResult ? (
              <div className="p-12 text-center bg-stone-50 border border-stone-200 rounded-2xl h-full flex flex-col justify-center items-center">
                <Target className="w-10 h-10 text-stone-300 mb-2" />
                <h4 className="text-sm font-bold text-stone-600">No Synthetic Control Run</h4>
                <p className="text-xs text-stone-400 font-serif italic max-w-sm mt-1">Select a treated unit and pre/post windows to construct its synthetic counterfactual from the donor pool.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <span className="inline-block text-[9px] font-mono font-bold uppercase tracking-wider text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">Python / pysyncon (research-grade, matches R Synth)</span>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Average Treatment Effect</span>
                    <span className="text-xl font-serif font-bold text-[#1B2E41]">{fmt(scResult.att)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Std Error</span>
                    <span className="text-xl font-serif text-stone-800">{fmt(scResult.attSE)}</span>
                  </div>
                  <div className="p-4 bg-stone-50 border border-stone-200 rounded-xl text-center">
                    <span className="text-[10px] uppercase font-mono tracking-widest text-stone-400 block">Pre-Treatment MSPE</span>
                    <span className="text-xl font-serif text-stone-800">{fmt(scResult.preTreatmentMSPE)}</span>
                  </div>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4">Donor Weights</h3>
                  <div className="overflow-x-auto">
                    <table className="journal-table">
                      <thead><tr><th>Donor Unit</th><th>Weight</th></tr></thead>
                      <tbody>
                        {Object.entries(scResult.weights || {}).filter(([, w]: any) => (w as number) > 0.001).sort((a: any, b: any) => b[1] - a[1]).map(([unit, w]: any) => (
                          <tr key={unit}><td className="font-mono text-xs">{unit}</td><td className="text-right">{fmt(w)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="p-5 bg-white border border-stone-200 rounded-2xl space-y-2">
                  <h4 className="text-xs font-bold text-stone-800 uppercase tracking-wider flex items-center gap-2">
                    <HelpCircle className="w-4 h-4 text-stone-600" /> Interpretation
                  </h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    The synthetic {scTreatedUnit} is a weighted combination of the donor units above, chosen to best match {scTreatedUnit}'s pre-treatment ({scPreStart}&ndash;{parseFloat(scPreEnd || '0') - 1}) outcome path (low MSPE = good fit). The average post-treatment gap between the actual and synthetic path is the estimated treatment effect, with an inferential SE from placebo-style variation.
                  </p>
                </div>

                <div className="bg-white border border-stone-200 rounded-2xl p-6">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-stone-900 mb-4 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-stone-600" />
                    Institutional Reproducibility Code
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {(['stata', 'r', 'python'] as const).map(lang => (
                      <div key={lang} className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
                        <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
                          <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">
                            {lang === 'r' ? 'R (.R)' : lang === 'stata' ? 'Stata (.do)' : 'Python (.py)'}
                          </span>
                          <button
                            onClick={() => handleCopySynthCode(lang)}
                            className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                          >
                            {scCodeCopied === lang ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                        <div className="p-4">
                          <code className="text-[11px] font-mono text-slate-300 block whitespace-pre-wrap leading-relaxed">
                            {getSynthCode(lang)}
                          </code>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
