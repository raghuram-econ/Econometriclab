import React, { useState, useMemo } from 'react';
import { 
  Compass, 
  HelpCircle, 
  Settings2, 
  TrendingUp, 
  BarChart2, 
  Users, 
  Sliders, 
  Info, 
  AlertTriangle, 
  ArrowRight,
  BookOpen,
  LineChart as LineChartIcon,
  CheckCircle2,
  GitPullRequest
} from 'lucide-react';
import jStat from 'jstat';
import { 
  ResponsiveContainer, 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ReferenceLine 
} from 'recharts';
import { cn } from '../../lib/utils';
import { Dataset } from '../../types';
import { runPower } from '../../services/apiClient';

interface PowerAnalysisLabProps {
  dataset: Dataset | null;
}

type AnalysisMode = 'rct' | 'ols_coef' | 'cluster_did';

export default function PowerAnalysisLab({ dataset }: PowerAnalysisLabProps) {
  const [mode, setMode] = useState<AnalysisMode>('rct');
  
  // SIGNIFICANCE & POWER TARGETS (Global)
  const [alpha, setAlpha] = useState<number>(0.05);
  const [targetPower, setTargetPower] = useState<number>(0.80);

  // MODE 1: RCT PARAMETERS
  const [rctEffectSize, setRctEffectSize] = useState<number>(0.3); // Cohen's d
  const [rctAllocationRatio, setRctAllocationRatio] = useState<number>(1.0); // nT / nC
  const [rctSampleSize, setRctSampleSize] = useState<number>(200); // N total

  // MODE 2: OLS COEFFICIENT PARAMETERS
  const [olsBeta, setOlsBeta] = useState<number>(0.25); // Hypothesized coefficient beta_j
  const [olsSigmaX, setOlsSigmaX] = useState<number>(1.2); // Std dev of policy variable X
  const [olsSigmaU, setOlsSigmaU] = useState<number>(2.0); // Residual Std Dev (noise)
  const [olsVif, setOlsVif] = useState<number>(1.5); // Multicollinearity VIF
  const [olsSampleSize, setOlsSampleSize] = useState<number>(300); // N total

  // MODE 3: CLUSTERED RCT / DiD PARAMETERS
  const [clusterEffectSize, setClusterEffectSize] = useState<number>(0.3); // Cohen's d
  const [clusterSize, setClusterSize] = useState<number>(20); // m (obs per cluster)
  const [icc, setIcc] = useState<number>(0.05); // rho (Intraclass Correlation Coefficient)
  const [numClusters, setNumClusters] = useState<number>(30); // Total clusters (C)

  // Research-grade cluster-interaction simulation (Python backend)
  const [pDisadv, setPDisadv] = useState<number>(0.5);
  const [effMain, setEffMain] = useState<number>(0.25);
  const [effInter, setEffInter] = useState<number>(0.20);
  const [baselineR2, setBaselineR2] = useState<number>(0.30);
  const [pyResult, setPyResult] = useState<any | null>(null);
  const [pyRunning, setPyRunning] = useState<boolean>(false);
  const [pyError, setPyError] = useState<string | null>(null);

  // Auto-populate from active dataset if available
  const handleAutoPopulate = () => {
    if (!dataset) return;
    
    // Auto populate N
    if (mode === 'rct') {
      setRctSampleSize(dataset.rowCount);
    } else if (mode === 'ols_coef') {
      setOlsSampleSize(dataset.rowCount);
      
      // Look for a numeric variable to estimate its SD
      const numVars = dataset.variables.filter(v => v.type === 'numeric');
      const firstNumVar = numVars[0];
      if (firstNumVar) {
        // Compute SD of first numeric variable as a proxy for SD(X)
        const vName = firstNumVar.name;
        const vals = dataset.data.map(r => parseFloat(r[vName] ?? '')).filter(n => !isNaN(n));
        if (vals.length > 1) {
          const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
          const variance = vals.map(x => Math.pow(x - mean, 2)).reduce((a, b) => a + b, 0) / (vals.length - 1);
          setOlsSigmaX(parseFloat(Math.sqrt(variance).toFixed(2)));
        }
      }
    } else if (mode === 'cluster_did') {
      // Guess clusters based on categorical variables if present (e.g. state, country, class)
      const catVars = dataset.variables.filter(v => v.type === 'categorical');
      const firstCatVar = catVars[0];
      if (firstCatVar) {
        const uniqueVals = new Set(dataset.data.map(r => r[firstCatVar.name]).filter(Boolean));
        if (uniqueVals.size > 1) {
          setNumClusters(uniqueVals.size);
          setClusterSize(Math.max(2, Math.floor(dataset.rowCount / uniqueVals.size)));
        }
      } else {
        setClusterSize(Math.max(5, Math.floor(dataset.rowCount / 15)));
        setNumClusters(15);
      }
    }
  };

  const handleRunPySim = async () => {
    setPyRunning(true);
    setPyError(null);
    try {
      const res = await runPower({
        design: 'cluster-interaction',
        alpha,
        nClusters: numClusters,
        clusterSize,
        icc,
        pDisadv,
        effectMain: effMain,
        effectInteraction: effInter,
        rSquared: baselineR2,
        nSims: 1000,
      });
      setPyResult(res);
    } catch (err: any) {
      setPyError(err?.message || 'Simulation failed. Ensure the backend is running and you are signed in.');
    } finally {
      setPyRunning(false);
    }
  };

  // MATHEMATICAL COMPUTATIONS
  const results = useMemo(() => {
    // Standard normal critical values
    const zAlpha = jStat.normal.inv(1 - alpha / 2, 0, 1);
    const zBeta = jStat.normal.inv(targetPower, 0, 1);

    if (mode === 'rct') {
      // 1. Calculate Power given N
      const r = rctAllocationRatio;
      const nC = rctSampleSize / (1 + r);
      const nT = (r * rctSampleSize) / (1 + r);
      // Non-centrality parameter delta
      const delta = rctEffectSize * Math.sqrt((nC * nT) / (nC + nT));
      const achievedPower = jStat.normal.cdf(delta - zAlpha, 0, 1) + jStat.normal.cdf(-delta - zAlpha, 0, 1);

      // 2. Calculate Required N for targetPower
      // nC_req = (1 + r) * (zAlpha + zBeta)^2 / (r * d^2)
      const reqNC = ((1 + r) * Math.pow(zAlpha + zBeta, 2)) / (r * Math.pow(rctEffectSize, 2));
      const reqNT = r * reqNC;
      const requiredN = Math.ceil(reqNC + reqNT);

      // 3. Calculate Minimum Detectable Effect (MDE) given N and targetPower
      // d = (zAlpha + zBeta) / sqrt( nC * nT / (nC + nT) )
      const mde = (zAlpha + zBeta) / Math.sqrt((nC * nT) / (nC + nT));

      return {
        achievedPower,
        requiredN,
        mde,
        groupCSize: Math.round(nC),
        groupTSize: Math.round(nT),
        requiredCSize: Math.round(reqNC),
        requiredTSize: Math.round(reqNT),
      };
    } 
    
    if (mode === 'ols_coef') {
      // Standardized regression effect size: f = (beta * sigmaX) / (sigmaU * sqrt(VIF))
      const f = (olsBeta * olsSigmaX) / (olsSigmaU * Math.sqrt(olsVif));
      
      // 1. Calculate Power given N
      const delta = f * Math.sqrt(olsSampleSize);
      const achievedPower = jStat.normal.cdf(delta - zAlpha, 0, 1) + jStat.normal.cdf(-delta - zAlpha, 0, 1);

      // 2. Calculate Required N for targetPower
      const requiredN = Math.ceil(Math.pow(zAlpha + zBeta, 2) / Math.pow(f, 2));

      // 3. Calculate Minimum Detectable Coefficient (MDC) given N and targetPower
      // f_req = (zAlpha + zBeta) / sqrt(N)
      // beta_req = f_req * sigmaU * sqrt(VIF) / sigmaX
      const reqF = (zAlpha + zBeta) / Math.sqrt(olsSampleSize);
      const mdc = (reqF * olsSigmaU * Math.sqrt(olsVif)) / olsSigmaX;

      return {
        achievedPower,
        requiredN,
        mde: mdc, // interpreted as MDC
        stdEffectSize: f,
      };
    }

    // mode === 'cluster_did'
    // Design Effect DE = 1 + (m - 1) * rho
    const de = 1 + (clusterSize - 1) * icc;
    const totalN = numClusters * clusterSize;

    // 1. Calculate Power given C and m
    // delta = d * sqrt(N / (4 * DE)) for balanced two-group cluster design
    const delta = clusterEffectSize * Math.sqrt(totalN / (4 * de));
    const achievedPower = jStat.normal.cdf(delta - zAlpha, 0, 1) + jStat.normal.cdf(-delta - zAlpha, 0, 1);

    // 2. Calculate Required Clusters (C) for targetPower
    // C_req = 4 * (zAlpha + zBeta)^2 * DE / (m * d^2)
    const requiredC = Math.ceil((4 * Math.pow(zAlpha + zBeta, 2) * de) / (clusterSize * Math.pow(clusterEffectSize, 2)));
    const requiredN = requiredC * clusterSize;

    // 3. Calculate MDE given C and m
    // d = (zAlpha + zBeta) / sqrt( N / (4 * DE) )
    const mde = (zAlpha + zBeta) / Math.sqrt(totalN / (4 * de));

    return {
      achievedPower,
      requiredN,
      mde,
      designEffect: de,
      requiredClusters: requiredC,
      totalObservedN: totalN
    };
  }, [
    mode, alpha, targetPower, 
    rctEffectSize, rctAllocationRatio, rctSampleSize,
    olsBeta, olsSigmaX, olsSigmaU, olsVif, olsSampleSize,
    clusterEffectSize, clusterSize, icc, numClusters
  ]);

  // GENERATE CHART DATA (Power Curve)
  const chartData = useMemo(() => {
    const dataPoints = [];
    const zAlpha = jStat.normal.inv(1 - alpha / 2, 0, 1);

    if (mode === 'rct') {
      const r = rctAllocationRatio;
      const step = Math.max(10, Math.round(rctSampleSize / 10));
      for (let n = Math.max(20, step); n <= Math.max(500, rctSampleSize * 2); n += step) {
        const nC = n / (1 + r);
        const nT = (r * n) / (1 + r);
        
        // Custom effect
        const deltaCustom = rctEffectSize * Math.sqrt((nC * nT) / (nC + nT));
        const pCustom = jStat.normal.cdf(deltaCustom - zAlpha, 0, 1) + jStat.normal.cdf(-deltaCustom - zAlpha, 0, 1);

        // Small effect benchmark (d = 0.2)
        const deltaSmall = 0.2 * Math.sqrt((nC * nT) / (nC + nT));
        const pSmall = jStat.normal.cdf(deltaSmall - zAlpha, 0, 1) + jStat.normal.cdf(-deltaSmall - zAlpha, 0, 1);

        // Medium effect benchmark (d = 0.5)
        const deltaMed = 0.5 * Math.sqrt((nC * nT) / (nC + nT));
        const pMed = jStat.normal.cdf(deltaMed - zAlpha, 0, 1) + jStat.normal.cdf(-deltaMed - zAlpha, 0, 1);

        dataPoints.push({
          sampleSize: n,
          'Your Design': parseFloat((pCustom * 100).toFixed(1)),
          'Small Effect (d=0.2)': parseFloat((pSmall * 100).toFixed(1)),
          'Medium Effect (d=0.5)': parseFloat((pMed * 100).toFixed(1)),
        });
      }
    } else if (mode === 'ols_coef') {
      const step = Math.max(20, Math.round(olsSampleSize / 10));
      // Standardized effect
      const fCustom = (olsBeta * olsSigmaX) / (olsSigmaU * Math.sqrt(olsVif));
      // High Multicollinearity benchmark (VIF = 5.0)
      const fHighVif = (olsBeta * olsSigmaX) / (olsSigmaU * Math.sqrt(5.0));
      // Perfect Exogeneity benchmark (VIF = 1.0)
      const fNoVif = (olsBeta * olsSigmaX) / olsSigmaU;

      for (let n = Math.max(30, step); n <= Math.max(600, olsSampleSize * 2); n += step) {
        const pCustom = jStat.normal.cdf(fCustom * Math.sqrt(n) - zAlpha, 0, 1) + jStat.normal.cdf(-fCustom * Math.sqrt(n) - zAlpha, 0, 1);
        const pHighVif = jStat.normal.cdf(fHighVif * Math.sqrt(n) - zAlpha, 0, 1) + jStat.normal.cdf(-fHighVif * Math.sqrt(n) - zAlpha, 0, 1);
        const pNoVif = jStat.normal.cdf(fNoVif * Math.sqrt(n) - zAlpha, 0, 1) + jStat.normal.cdf(-fNoVif * Math.sqrt(n) - zAlpha, 0, 1);

        dataPoints.push({
          sampleSize: n,
          'Your Design': parseFloat((pCustom * 100).toFixed(1)),
          'High Multicollinearity (VIF=5.0)': parseFloat((pHighVif * 100).toFixed(1)),
          'No Multicollinearity (VIF=1.0)': parseFloat((pNoVif * 100).toFixed(1)),
        });
      }
    } else {
      // Clustered RCT
      const deCustom = 1 + (clusterSize - 1) * icc;
      const step = Math.max(4, Math.round(numClusters / 10));
      
      // Benchmarks: No Clustering (ICC = 0.0) vs. Custom Clustering
      for (let c = Math.max(6, step * 2); c <= Math.max(60, numClusters * 2); c += step) {
        const nClustered = c * clusterSize;
        
        const deltaCustom = clusterEffectSize * Math.sqrt(nClustered / (4 * deCustom));
        const pCustom = jStat.normal.cdf(deltaCustom - zAlpha, 0, 1) + jStat.normal.cdf(-deltaCustom - zAlpha, 0, 1);

        const deltaNoCluster = clusterEffectSize * Math.sqrt(nClustered / 4); // ICC = 0
        const pNoCluster = jStat.normal.cdf(deltaNoCluster - zAlpha, 0, 1) + jStat.normal.cdf(-deltaNoCluster - zAlpha, 0, 1);

        dataPoints.push({
          sampleSize: c, // Plotting by clusters count (C)
          'Clustered Design': parseFloat((pCustom * 100).toFixed(1)),
          'Unclustered Benchmark (ICC=0.0)': parseFloat((pNoCluster * 100).toFixed(1)),
        });
      }
    }

    return dataPoints;
  }, [mode, alpha, rctEffectSize, rctAllocationRatio, rctSampleSize, olsBeta, olsSigmaX, olsSigmaU, olsVif, olsSampleSize, clusterEffectSize, clusterSize, icc, numClusters]);

  // LABELS & INTERPRETATIONS
  const currentN = mode === 'rct' ? rctSampleSize : mode === 'ols_coef' ? olsSampleSize : numClusters;
  const xAxisKey = mode === 'cluster_did' ? 'sampleSize' : 'sampleSize';
  const xAxisLabel = mode === 'cluster_did' ? 'Number of Clusters (C)' : 'Total Sample Size (N)';

  return (
    <div className="space-y-8">
      {/* Intro Header */}
      <div className="card-premium p-8 bg-slate-900 border-none relative overflow-hidden group">
        <div className="absolute top-0 right-0 p-6 opacity-[0.05] group-hover:opacity-10 transition-opacity">
           <Compass className="w-48 h-48 text-white rotate-12" />
        </div>
        <div className="relative z-10 space-y-4 max-w-4xl">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-1 bg-blue-500/10 text-blue-400 border border-blue-400/20 text-[10px] font-black uppercase tracking-widest rounded-md font-mono">
              Econometric Research Design
            </span>
          </div>
          <h3 className="text-xl font-bold text-white tracking-tight uppercase">Statistical Power &amp; Sample Size Lab</h3>
          <p className="text-sm text-slate-300 font-serif leading-relaxed italic">
            "Before regressing observations, an economist must plan for detection." Statistical power measures the probability of rejecting a false null hypothesis. Prevent Type II errors (failed discoveries) and optimize study size to ensure empirical rigor.
          </p>
        </div>
      </div>

      {/* Mode Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            id: 'rct',
            title: 'RCT / Policy Evaluation',
            desc: 'Compare treatment & control groups with varying allocation ratios.',
            icon: Users,
            color: 'border-blue-200 hover:border-blue-500'
          },
          {
            id: 'ols_coef',
            title: 'Regression Coefficient',
            desc: 'Verify OLS slope power while adjusting for noise and collinearity (VIF).',
            icon: BarChart2,
            color: 'border-cyan-200 hover:border-cyan-500'
          },
          {
            id: 'cluster_did',
            title: 'Clustered Design / DiD',
            desc: 'Account for intra-class correlation (ICC) in clustered economic rollouts.',
            icon: GitPullRequest,
            color: 'border-purple-200 hover:border-purple-500'
          }
        ].map(m => (
          <button
            key={m.id}
            onClick={() => setMode(m.id as any)}
            className={cn(
              "card-premium p-6 text-left transition-all hover:shadow-md border flex flex-col justify-between h-full group",
              mode === m.id 
                ? "bg-slate-950 border-slate-950 text-white shadow-xl" 
                : "bg-white text-slate-800 border-slate-100"
            )}
          >
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <div className={cn(
                  "p-2.5 rounded-xl", 
                  mode === m.id ? "bg-slate-800 text-white" : "bg-slate-50 text-slate-600"
                )}>
                  <m.icon className="w-5 h-5" />
                </div>
                {mode === m.id && (
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                )}
              </div>
              <div className="space-y-1">
                <h4 className={cn("text-xs font-bold uppercase tracking-wider", mode === m.id ? "text-white" : "text-slate-900")}>
                  {m.title}
                </h4>
                <p className={cn("text-[10px] leading-relaxed font-serif italic", mode === m.id ? "text-slate-300" : "text-slate-500")}>
                  {m.desc}
                </p>
              </div>
            </div>
            <span className={cn("text-[10px] font-bold mt-4 flex items-center gap-1", mode === m.id ? "text-blue-400" : "text-slate-400")}>
              Configure <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </button>
        ))}
      </div>

      {/* Main Panel */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Hand: Controls */}
        <div className="lg:col-span-5 space-y-6">
          <div className="card-premium p-6 bg-white border-slate-100 shadow-sm space-y-6">
            <div className="flex justify-between items-center pb-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-slate-400" />
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900 font-mono">Design Parameters</h4>
              </div>
              {dataset && (
                <button
                  onClick={handleAutoPopulate}
                  className="text-[9px] font-bold text-blue-600 hover:bg-blue-50 px-2 py-1 rounded border border-blue-100 uppercase font-mono tracking-tight transition-all"
                  title="Load values like sample size directly from your active dataset"
                >
                  Sync Active Dataset
                </button>
              )}
            </div>

            {/* Global parameters: Alpha & Target Power */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                  Significance (α)
                  <span title="Probability of Type I error (false discovery)">
                    <HelpCircle className="w-3 h-3 text-slate-300" />
                  </span>
                </label>
                <select
                  value={alpha}
                  onChange={(e) => setAlpha(parseFloat(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800"
                >
                  <option value={0.01}>0.01 (Strict 1%)</option>
                  <option value={0.05}>0.05 (Standard 5%)</option>
                  <option value={0.10}>0.10 (Relaxed 10%)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-mono flex items-center gap-1">
                  Target Power (1-β)
                  <span title="Desired chance of detecting a true effect">
                    <HelpCircle className="w-3 h-3 text-slate-300" />
                  </span>
                </label>
                <select
                  value={targetPower}
                  onChange={(e) => setTargetPower(parseFloat(e.target.value))}
                  className="w-full p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-800"
                >
                  <option value={0.80}>0.80 (Econometric Default)</option>
                  <option value={0.90}>0.90 (High Confidence)</option>
                  <option value={0.95}>0.95 (Ultra Stringent)</option>
                </select>
              </div>
            </div>

            <div className="border-t border-slate-100 my-4" />

            {/* Mode Specific parameters */}
            {mode === 'rct' && (
              <div className="space-y-5">
                {/* Effect Size d */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Hypothesized Effect Size (Cohen's d):</span>
                    <span className="font-mono font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">{rctEffectSize}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.05"
                    value={rctEffectSize}
                    onChange={(e) => setRctEffectSize(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                  />
                  <div className="flex justify-between text-[8px] uppercase tracking-wider font-mono text-slate-400">
                    <span>Small (0.2)</span>
                    <span>Medium (0.5)</span>
                    <span>Large (0.8)</span>
                    <span>Very Large (1.2)</span>
                  </div>
                </div>

                {/* Sample Size */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Available Sample Size (Total N):</span>
                    <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{rctSampleSize}</span>
                  </div>
                  <input
                    type="range"
                    min="40"
                    max="1000"
                    step="10"
                    value={rctSampleSize}
                    onChange={(e) => setRctSampleSize(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>

                {/* Allocation Ratio */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Allocation Ratio (Treatment / Control):</span>
                    <span className="font-mono font-bold text-slate-900">{rctAllocationRatio.toFixed(1)} : 1</span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="3.0"
                    step="0.1"
                    value={rctAllocationRatio}
                    onChange={(e) => setRctAllocationRatio(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                  />
                  <p className="text-[9px] text-slate-400 font-serif italic">
                    {rctAllocationRatio === 1 ? "Balanced allocation (1:1) maximizes statistical power." : "Unequal allocation reduces power but is common when treatment is costly."}
                  </p>
                </div>
              </div>
            )}

            {mode === 'ols_coef' && (
              <div className="space-y-5 animate-in fade-in duration-300">
                {/* Expected Beta */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Expected Policy Coefficient (β):</span>
                    <span className="font-mono font-bold text-cyan-600 bg-cyan-50 px-2 py-0.5 rounded">{olsBeta}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.5"
                    step="0.05"
                    value={olsBeta}
                    onChange={(e) => setOlsBeta(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-cyan-600"
                  />
                </div>

                {/* SD of X */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Std Dev of Policy Variable σ(X):</span>
                    <span className="font-mono font-bold text-slate-900">{olsSigmaX}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="5.0"
                    step="0.1"
                    value={olsSigmaX}
                    onChange={(e) => setOlsSigmaX(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                  />
                </div>

                {/* Residual Std Dev */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Unexplained Regression Error σ(u):</span>
                    <span className="font-mono font-bold text-slate-900">{olsSigmaU}</span>
                  </div>
                  <input
                    type="range"
                    min="0.5"
                    max="5.0"
                    step="0.1"
                    value={olsSigmaU}
                    onChange={(e) => setOlsSigmaU(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                  />
                </div>

                {/* VIF */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700 flex items-center gap-1">
                      Variance Inflation Factor (VIF):
                    </span>
                    <span className={cn(
                      "font-mono font-bold px-2 py-0.5 rounded",
                      olsVif > 5 ? "bg-red-50 text-red-600" : "bg-slate-100 text-slate-900"
                    )}>{olsVif}</span>
                  </div>
                  <input
                    type="range"
                    min="1.0"
                    max="10.0"
                    step="0.2"
                    value={olsVif}
                    onChange={(e) => setOlsVif(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                  />
                  <div className="flex justify-between text-[8px] uppercase tracking-wider font-mono text-slate-400">
                    <span>No Collinearity (1.0)</span>
                    <span>Moderate (3.0)</span>
                    <span>Severe (5.0+)</span>
                  </div>
                  <p className="text-[9px] text-slate-400 font-serif italic">
                    {olsVif > 3.0 ? "Severe collinearity with other controls inflates your standard errors and destroys power!" : "VIF is within acceptable limits."}
                  </p>
                </div>

                {/* Sample Size */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Observed Sample Size (N):</span>
                    <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{olsSampleSize}</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="1500"
                    step="25"
                    value={olsSampleSize}
                    onChange={(e) => setOlsSampleSize(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>
              </div>
            )}

            {mode === 'cluster_did' && (
              <div className="space-y-5 animate-in fade-in duration-300">
                {/* Effect Size */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Expected Effect Size (d):</span>
                    <span className="font-mono font-bold text-purple-600 bg-purple-50 px-2 py-0.5 rounded">{clusterEffectSize}</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.5"
                    step="0.05"
                    value={clusterEffectSize}
                    onChange={(e) => setClusterEffectSize(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600"
                  />
                </div>

                {/* Cluster Size m */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Observations per Cluster (m):</span>
                    <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{clusterSize}</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="100"
                    step="2"
                    value={clusterSize}
                    onChange={(e) => setClusterSize(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                </div>

                {/* ICC rho */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Intraclass Correlation Coefficient (ρ):</span>
                    <span className={cn(
                      "font-mono font-bold px-2 py-0.5 rounded",
                      icc > 0.1 ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-900"
                    )}>{icc.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.0"
                    max="0.40"
                    step="0.01"
                    value={icc}
                    onChange={(e) => setIcc(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-600"
                  />
                  <div className="flex justify-between text-[8px] uppercase tracking-wider font-mono text-slate-400">
                    <span>Uncorrelated (0.0)</span>
                    <span>Low (0.05)</span>
                    <span>Moderate (0.15)</span>
                    <span>High (0.30+)</span>
                  </div>
                  <p className="text-[9px] text-slate-400 font-serif italic">
                    {icc === 0 ? "Observations are completely independent." : `A ρ of ${icc.toFixed(2)} means ${Math.round(icc * 100)}% of the variance is shared at the cluster level.`}
                  </p>
                </div>

                {/* Number of Clusters */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-700">Number of Clusters (C):</span>
                    <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">{numClusters}</span>
                  </div>
                  <input
                    type="range"
                    min="6"
                    max="100"
                    step="2"
                    value={numClusters}
                    onChange={(e) => setNumClusters(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-slate-900"
                  />
                  <p className="text-[9px] text-slate-400 font-serif italic">
                    Total sample size N = {numClusters * clusterSize} observations across {numClusters} clusters.
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Hand: Results & Charts */}
        <div className="lg:col-span-7 space-y-6">
          
          {/* Main Stats Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            
            {/* Achieved Power card */}
            <div className={cn(
              "card-premium p-6 text-center border relative overflow-hidden flex flex-col justify-between min-h-[140px]",
              results.achievedPower >= targetPower 
                ? "bg-emerald-50 border-emerald-200 text-emerald-950" 
                : "bg-amber-50 border-amber-200 text-amber-950"
            )}>
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest opacity-60 mb-1">Achieved Power</p>
                <h3 className="text-3xl font-bold font-mono tracking-tighter">
                  {Math.round(results.achievedPower * 100)}%
                </h3>
              </div>
              <div className="mt-3">
                <span className={cn(
                  "px-2.5 py-0.5 text-[8px] font-black uppercase tracking-wider rounded-full",
                  results.achievedPower >= targetPower ? "bg-emerald-200 text-emerald-800" : "bg-amber-200 text-amber-800"
                )}>
                  {results.achievedPower >= targetPower ? 'Sufficiently Powered' : 'Underpowered'}
                </span>
              </div>
            </div>

            {/* Optimal Sample Size N card */}
            <div className="card-premium p-6 text-center bg-white border-slate-100 shadow-sm min-h-[140px] flex flex-col justify-between">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-slate-400 mb-1">Required Sample Size</p>
                <h3 className="text-3xl font-bold font-mono text-slate-900 tracking-tighter">
                  {results.requiredN}
                </h3>
              </div>
              <p className="text-[9px] text-slate-500 font-serif italic">
                {mode === 'cluster_did' ? `Total N across ${results.requiredClusters} clusters` : "Total N for balanced setup"}
              </p>
            </div>

            {/* MDE card */}
            <div className="card-premium p-6 text-center bg-white border-slate-100 shadow-sm min-h-[140px] flex flex-col justify-between">
              <div>
                <p className="text-[9px] font-mono uppercase tracking-widest text-slate-400 mb-1">
                  {mode === 'ols_coef' ? "Min Detectable Beta" : "Min Detectable Effect (MDE)"}
                </p>
                <h3 className="text-3xl font-bold font-mono text-blue-600 tracking-tighter">
                  {results.mde.toFixed(3)}
                </h3>
              </div>
              <p className="text-[9px] text-slate-500 font-serif italic">
                At significance α = {alpha}
              </p>
            </div>

          </div>

          {/* Interactive Chart */}
          <div className="card-premium p-6 bg-white border-slate-100 shadow-sm space-y-4">
            <div className="flex justify-between items-center pb-2 border-b border-slate-50">
              <div className="flex items-center gap-2">
                <LineChartIcon className="w-4 h-4 text-slate-400" />
                <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900 font-mono">Statistical Power Curves</h4>
              </div>
              <span className="text-[9px] text-slate-400 font-serif italic">Y-axis shows % power (target is {targetPower * 100}%)</span>
            </div>

            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={chartData}
                  margin={{ top: 10, right: 20, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis 
                    dataKey="sampleSize" 
                    tick={{ fontSize: 9, fontFamily: 'monospace' }} 
                    stroke="#94a3b8"
                    label={{ value: xAxisLabel, position: 'insideBottom', offset: -5, fontSize: 10, fill: '#475569', fontFamily: 'serif', fontStyle: 'italic' }}
                  />
                  <YAxis 
                    domain={[0, 100]} 
                    tick={{ fontSize: 9, fontFamily: 'monospace' }} 
                    stroke="#94a3b8"
                  />
                  <Tooltip 
                    contentStyle={{ fontSize: '10px', borderRadius: '8px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '9px', fontFamily: 'sans-serif', paddingTop: '10px' }} />
                  
                  {/* Reference line for the 80% default power */}
                  <ReferenceLine y={targetPower * 100} stroke="#f59e0b" strokeDasharray="5 5" label={{ value: `${targetPower*100}% Target`, fill: '#d97706', fontSize: 8, position: 'top' }} />
                  
                  {/* Reference line for current selection */}
                  <ReferenceLine x={currentN} stroke="#1e293b" strokeDasharray="3 3" />

                  {mode === 'rct' && (
                    <>
                      <Line type="monotone" dataKey="Your Design" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="Small Effect (d=0.2)" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                      <Line type="monotone" dataKey="Medium Effect (d=0.5)" stroke="#94a3b8" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </>
                  )}

                  {mode === 'ols_coef' && (
                    <>
                      <Line type="monotone" dataKey="Your Design" stroke="#06b6d4" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="No Multicollinearity (VIF=1.0)" stroke="#10b981" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                      <Line type="monotone" dataKey="High Multicollinearity (VIF=5.0)" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="4 4" dot={false} />
                    </>
                  )}

                  {mode === 'cluster_did' && (
                    <>
                      <Line type="monotone" dataKey="Clustered Design" stroke="#a855f7" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                      <Line type="monotone" dataKey="Unclustered Benchmark (ICC=0.0)" stroke="#cbd5e1" strokeWidth={1.5} strokeDasharray="3 3" dot={false} />
                    </>
                  )}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Theoretical Breakdown Card */}
          <div className="card-premium p-6 bg-slate-50 border-slate-100">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2 mb-3">
              <BookOpen className="w-4 h-4 text-slate-400" />
              Applied Economist's Field Insights
            </h4>
            
            {mode === 'rct' && (
              <div className="space-y-3 text-slate-600 font-serif text-[11px] leading-relaxed">
                <p>
                  In a randomized evaluation (e.g., assessing Cash Transfers on school enrollment), we randomize at the individual level. A balanced design (Allocation Ratio = 1.0) achieves optimal efficiency.
                </p>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Small effects (d = 0.20):</strong> Common in subtle interventions. Requires an immense sample size (N ≈ 780+) to avoid Type II errors.</li>
                  <li><strong>Standardized Effect d:</strong> Represents how many standard deviations the treatment group shifts compared to control.</li>
                  <li><strong>Unequal Sizing:</strong> If treatment seats are limited, we shift the allocation ratio. If r = 0.5, control size is twice as large; this saves program budget but inflates standard errors, requiring a larger overall N to reach {targetPower * 100}% power.</li>
                </ul>
              </div>
            )}

            {mode === 'ols_coef' && (
              <div className="space-y-3 text-slate-600 font-serif text-[11px] leading-relaxed">
                <p>
                  Observational OLS regression estimates coefficients conditional on confounders. This simulation measures the statistical power for testing H₀: βⱼ = 0.
                </p>
                <div className="p-3 bg-white rounded border border-slate-200 font-mono text-[10px] text-slate-800 space-y-1">
                  <div className="font-bold text-center">Asymptotic SE of Regression Coefficient:</div>
                  <div className="text-center">
                    SE(β_j) = σ(u) / [ σ(X_j) * sqrt( N * (1 - R_x^2) ) ] = σ(u) * sqrt(VIF) / [ σ(X_j) * sqrt(N) ]
                  </div>
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>Multicollinearity (VIF):</strong> High correlation between your variable of interest and other controls (inflated VIF) restricts the unique variance of X, drastically increasing SE and lowering your chance of finding a significant slope.</li>
                  <li><strong>Standard Deviation σ(X):</strong> High dispersion in your policy variable increases the "lever" effect, lowering SE and increasing power.</li>
                  <li><strong>Error Noise σ(u):</strong> High unexplained variation in the outcome increases standard errors, demanding a larger sample size to extract the true signal.</li>
                </ul>
              </div>
            )}

            {mode === 'cluster_did' && (
              <div className="space-y-3 text-slate-600 font-serif text-[11px] leading-relaxed">
                <p>
                  Randomizing or assigning policy at a regional/village level creates <strong>intraclass correlation (ρ)</strong>. Residuals of individuals in the same village are likely correlated due to shared local shocks.
                </p>
                <div className="p-3 bg-white rounded border border-slate-200 font-mono text-[10px] text-slate-800 space-y-1">
                  <div className="font-bold text-center">Design Effect (DE) Multiplier:</div>
                  <div className="text-center">DE = 1 + (m - 1) * ρ</div>
                  <div className="text-center text-[9px] text-slate-400 mt-1">Required sample size increases by this multiplier!</div>
                </div>
                <ul className="list-disc pl-5 space-y-1">
                  <li><strong>The Moulton Problem:</strong> Ignoring positive ICC (ρ &gt; 0) causes extreme over-rejection of the null hypothesis. Standard errors are artificially tiny without clustering, leading to false-positive policy recommendations.</li>
                  <li><strong>Effective Sample Size:</strong> With a cluster size of m = {clusterSize} and ρ = {icc}, the design effect is <strong>{results.designEffect?.toFixed(2)}</strong>. This means you need a total sample size that is {results.designEffect?.toFixed(1)} times larger than an unclustered study!</li>
                  <li><strong>Cluster Constraint:</strong> To boost power, adding more clusters (C) is always more effective than adding more observations (m) to existing clusters, as observations inside a cluster have diminishing informational returns.</li>
                </ul>
              </div>
            )}
          </div>

        </div>
      </div>

      {mode === 'cluster_did' && (
        <div className="card-premium p-6 bg-white border-slate-100 shadow-sm space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-purple-500" />
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-900 font-mono">Research-Grade: Treatment &times; Moderator Interaction (Python simulation)</h4>
            </div>
            <span className="text-[9px] font-mono font-bold uppercase text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-2 py-0.5">Monte-Carlo</span>
          </div>
          <p className="text-[11px] text-slate-500 font-serif italic">
            Simulation-based power for the treatment &times; disadvantage interaction (the RQ3 estimand), using {numClusters} institutions &times; {clusterSize} students, ICC = {icc.toFixed(2)}. Matches/exceeds R's PowerUpR. Requires sign-in.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Disadv. share', value: pDisadv, set: setPDisadv, min: 0.1, max: 0.9, step: 0.05 },
              { label: 'Avg effect (SD)', value: effMain, set: setEffMain, min: 0.05, max: 0.8, step: 0.05 },
              { label: 'Interaction (SD)', value: effInter, set: setEffInter, min: 0.0, max: 0.6, step: 0.05 },
              { label: 'Baseline R²', value: baselineR2, set: setBaselineR2, min: 0.0, max: 0.8, step: 0.05 },
            ].map(f => (
              <div key={f.label} className="space-y-1">
                <label className="text-[9px] font-black uppercase tracking-wider text-slate-400 font-mono">{f.label}: {f.value.toFixed(2)}</label>
                <input type="range" min={f.min} max={f.max} step={f.step} value={f.value} onChange={e => f.set(parseFloat(e.target.value))} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-purple-600" />
              </div>
            ))}
          </div>
          <button onClick={handleRunPySim} disabled={pyRunning} className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold font-mono tracking-wider uppercase transition disabled:opacity-50">
            {pyRunning ? 'Running 1,000 simulations…' : 'Run Power Simulation'}
          </button>
          {pyError && <p className="text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{pyError}</p>}
          {pyResult && (
            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-xl text-center">
                <span className="text-[9px] font-mono uppercase text-slate-400 block">Power &mdash; Average effect (RQ2)</span>
                <span className="text-2xl font-mono font-bold text-slate-900">{typeof pyResult.powerMain === 'number' ? Math.round(pyResult.powerMain * 100) : '—'}%</span>
              </div>
              <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-xl text-center">
                <span className="text-[9px] font-mono uppercase text-emerald-600 block">Power &mdash; Interaction (RQ3)</span>
                <span className="text-2xl font-mono font-bold text-emerald-800">{typeof pyResult.powerInteraction === 'number' ? Math.round(pyResult.powerInteraction * 100) : '—'}%</span>
              </div>
              <p className="col-span-2 text-[10px] text-slate-400 font-mono">{pyResult.method} &middot; N = {pyResult.nTotal}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
