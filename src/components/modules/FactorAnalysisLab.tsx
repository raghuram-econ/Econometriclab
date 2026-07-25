import React, { useState, useMemo } from 'react';
import { 
  Layers, 
  HelpCircle, 
  Info, 
  Play, 
  Binary, 
  RefreshCw, 
  BrainCircuit,
  LayoutGrid,
  BookOpen,
  LineChart
} from 'lucide-react';
import { Dataset } from '../../types';
import { generateMasterDataset } from '../../lib/dataGenerators';
import { ModuleIntroCard } from '../shared/ModuleIntroCard';
import { ResponsiveContainer, LineChart as RecLineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import * as math from 'mathjs';

interface FactorAnalysisLabProps {
  dataset: Dataset | null;
  onRunComplete?: (results: any, spec: string) => void;
}

// Jacobi Eigenvalue Algorithm for Symmetric Matrices (exact and highly stable)
// Jacobi eigenvalue iteration. maxIterations counts individual rotations, and a
// full sweep of an M x M matrix needs M(M-1)/2 of them, so this must scale with
// the number of variables rather than sit at a fixed 100.
export function jacobiEigenvalues(A: number[][], tolerance = 1e-9, maxIterations = 1000) {
  const n = A.length;
  // Initialize eigenvectors as identity matrix
  const V: number[][] = Array(n).fill(0).map((_, i) => Array(n).fill(0).map((_, j) => i === j ? 1 : 0));
  const D = A.map(row => [...row]); // Copy of matrix A

  for (let iter = 0; iter < maxIterations; iter++) {
    // Find the largest off-diagonal element
    let maxVal = 0;
    let p = 0;
    let q = 0;

    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const val = Math.abs(D[i]?.[j] ?? 0);
        if (val > maxVal) {
          maxVal = val;
          p = i;
          q = j;
        }
      }
    }

    if (maxVal < tolerance) {
      break; // Converged
    }

    // Compute rotation angle
    const dpq = D[p]?.[q] ?? 0;
    const dqq = D[q]?.[q] ?? 0;
    const dpp = D[p]?.[p] ?? 0;
    const diff = dqq - dpp;
    let t = 0;
    if (Math.abs(dpq) < tolerance * 1e-3) {
      t = 0;
    } else {
      const phi = diff / (2 * dpq);
      const sign = phi >= 0 ? 1 : -1;
      t = sign / (Math.abs(phi) + Math.sqrt(1 + phi * phi));
    }

    const c = 1 / Math.sqrt(1 + t * t);
    const s = t * c;

    const temp_D_pp = dpp;
    const temp_D_qq = dqq;

    const rowP = D[p];
    const rowQ = D[q];
    if (rowP && rowQ) {
      rowP[p] = temp_D_pp - t * dpq;
      rowQ[q] = temp_D_qq + t * dpq;
      rowP[q] = 0;
      rowQ[p] = 0;
    }

    // Update remaining elements in D
    for (let i = 0; i < n; i++) {
      if (i !== p && i !== q) {
        const rowI = D[i];
        if (rowI && rowP && rowQ) {
          const temp_D_ip = rowI[p] ?? 0;
          const temp_D_iq = rowI[q] ?? 0;
          rowI[p] = c * temp_D_ip - s * temp_D_iq;
          rowP[i] = rowI[p] ?? 0;
          rowI[q] = s * temp_D_ip + c * temp_D_iq;
          rowQ[i] = rowI[q] ?? 0;
        }
      }
    }

    // Update eigenvectors matrix V
    for (let i = 0; i < n; i++) {
      const rowV = V[i];
      if (rowV) {
        const temp_V_ip = rowV[p] ?? 0;
        const temp_V_iq = rowV[q] ?? 0;
        rowV[p] = c * temp_V_ip - s * temp_V_iq;
        rowV[q] = s * temp_V_ip + c * temp_V_iq;
      }
    }
  }

  // Extract eigenvalues (diagonals of D)
  const eigenvalues = D.map((row, idx) => row[idx] ?? 0);
  return { eigenvalues, eigenvectors: V };
}

export default function FactorAnalysisLab({ dataset: propDataset, onRunComplete }: FactorAnalysisLabProps) {
  const [localDataset, setLocalDataset] = useState<Dataset | null>(null);

  const activeDataset = useMemo(() => {
    if (propDataset) return propDataset;
    if (localDataset) return localDataset;
    return null;
  }, [propDataset, localDataset]);

  const handleLoadSample = () => {
    const master = generateMasterDataset();
    const firstRow = master[0];
    if (!firstRow) return;
    setLocalDataset({
      name: "Master Econometrics Dataset",
      data: master,
      rowCount: master.length,
      colCount: Object.keys(firstRow).length,
      variables: Object.keys(firstRow).map(key => ({
        name: key,
        type: typeof (firstRow as any)[key] === 'number' ? 'numeric' : 'categorical',
        label: key
      })),
      structure: 'panel'
    });
  };

  const numericVariables = useMemo(() => {
    if (!activeDataset) return [];
    return activeDataset.variables.filter(v => v.type === 'numeric').map(v => v.name);
  }, [activeDataset]);

  const [selectedVars, setSelectedVars] = useState<string[]>([]);
  const [results, setResults] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'selection' | 'scree' | 'loadings'>('selection');

  React.useEffect(() => {
    if (numericVariables.length >= 3 && selectedVars.length === 0) {
      // Select 4 default numeric traits
      const defaults = numericVariables.filter(v => ['wage', 'educ', 'exper', 'gdp_growth', 'inflation', 'unemployment'].includes(v)).slice(0, 4);
      setSelectedVars(defaults.length >= 3 ? defaults : numericVariables.slice(0, 4));
    }
  }, [numericVariables]);

  const handleToggleVar = (v: string) => {
    setSelectedVars(prev => prev.includes(v) ? prev.filter(item => item !== v) : [...prev, v]);
  };

  const handleRunPCA = () => {
    if (!activeDataset || selectedVars.length < 3) return;
    setIsRunning(true);

    setTimeout(() => {
      try {
        const M = selectedVars.length;
        const rows = activeDataset.data;
        const N = rows.length;

        // 1. Construct matrix & standardize variables
        const dataMatrix: number[][] = selectedVars.map(v => 
          rows.map(row => parseFloat(row[v])).filter(val => !isNaN(val))
        );

        // Ensure all arrays have matching sizes
        const minLen = Math.min(...dataMatrix.map(arr => arr.length));
        if (minLen < 5) throw new Error("Insufficient numeric observations.");

        const cleanMatrix = dataMatrix.map(arr => arr.slice(0, minLen));

        // Compute means and standard deviations
        const means = cleanMatrix.map(arr => arr.reduce((sum, v) => sum + v, 0) / minLen);
        const stds = cleanMatrix.map((arr, idx) => {
          const m = means[idx] ?? 0;
          const variance = arr.reduce((sum, v) => sum + (v - m) ** 2, 0) / minLen;
          return Math.sqrt(variance) || 1.0;
        });

        // Standardize (Z-scores)
        const zMatrix = cleanMatrix.map((arr, idx) => {
          const m = means[idx] ?? 0;
          const s = stds[idx] ?? 1.0;
          return arr.map(v => (v - m) / s);
        });

        // 2. Compute correlation matrix (Z'Z / N)
        const corrMatrix: number[][] = Array(M).fill(0).map(() => Array(M).fill(0));
        for (let i = 0; i < M; i++) {
          for (let j = 0; j < M; j++) {
            let sumProduct = 0;
            const rowI = zMatrix[i];
            const rowJ = zMatrix[j];
            if (rowI && rowJ) {
              for (let t = 0; t < minLen; t++) {
                sumProduct += (rowI[t] ?? 0) * (rowJ[t] ?? 0);
              }
            }
            const corrRow = corrMatrix[i];
            if (corrRow) {
              corrRow[j] = sumProduct / minLen;
            }
          }
        }

        // 3. Compute eigenvalues and eigenvectors
        const { eigenvalues, eigenvectors } = jacobiEigenvalues(corrMatrix);

        // 4. Sort eigenvalues & eigenvectors in descending order
        const indices = eigenvalues.map((val, idx) => ({ val, idx }));
        indices.sort((a, b) => (b.val ?? 0) - (a.val ?? 0));

        const sortedEigenvalues = indices.map(item => item.val);
        const sortedEigenvectors = indices.map(item => eigenvectors.map(row => row[item.idx]));

        // Total variance = sum of eigenvalues (equals M for correlation matrix)
        const totalVariance = sortedEigenvalues.reduce((sum, v) => (sum ?? 0) + (v ?? 0), 0);

        // Variance explained proportion
        let cumulative = 0;
        const componentMetrics = sortedEigenvalues.map((eig, idx) => {
          const proportion = (eig ?? 0) / (totalVariance || 1);
          cumulative += proportion;
          return {
            component: `PC ${idx + 1}`,
            eigenvalue: eig ?? 0,
            proportion: proportion * 100,
            cumulative: cumulative * 100
          };
        });

        // Loadings matrix (factor loadings = eigenvector * sqrt(eigenvalue))
        // High loadings mean that variable projects strongly on that factor
        const loadings = selectedVars.map((vName, vIdx) => {
          const rowLoadings: Record<string, number> = {};
          sortedEigenvalues.forEach((eig, cIdx) => {
            const loadingValue = (sortedEigenvectors[cIdx]?.[vIdx] ?? 0) * Math.sqrt(Math.max(0, eig ?? 0));
            rowLoadings[`PC${cIdx + 1}`] = loadingValue;
          });
          return {
            variable: vName,
            ...rowLoadings
          };
        });

        const finalResults = {
          variables: selectedVars,
          n: minLen,
          eigenvalues: sortedEigenvalues,
          componentMetrics,
          loadings,
          totalVariance
        };

        setResults(finalResults);
        setActiveTab('scree');
        if (onRunComplete) {
          onRunComplete(finalResults, `PCA: variables = ${selectedVars.join(', ')}`);
        }
      } catch (err: any) {
        alert(err.message || "An error occurred during Factor / PCA calculation.");
      } finally {
        setIsRunning(false);
      }
    }, 600);
  };

  return (
    <div id="factor-analysis-lab" className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700">
      <ModuleIntroCard 
        title="Factor Analysis & PCA"
        description="Simplify complex high-dimensional datasets into a smaller set of linear, orthogonal latent indices. Principal Component Analysis extracts maximum orthogonal variance without modeling biases."
        useWhen="You have multiple highly correlated indicators (e.g. governance quality, student test scores, or financial asset vectors) and want to combine them into single indices."
        requires={["At least three highly correlated continuous variables", "Standardized covariance calculations", "Orthonormal factor rotation criteria"]}
        youWillGet={["Eigenvalue distributions", "Proportion of variance screens", "Scree plot diagrams", "Component Loading heatmaps"]}
        pitfalls={["Extracting too many components (over-factoring)", "Losing structural physical interpretability", "Applying PCA to categorical discrete matrices without correction"]}
        example="PC₁ = w₁₁X₁ + w₁₂X₂ + ... + w₁_mX_m"
      />

      {!activeDataset ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4 max-w-xl mx-auto">
          <Layers className="w-12 h-12 text-indigo-500 mx-auto animate-pulse" />
          <h3 className="text-lg font-serif font-bold text-stone-900">Active Dataset Required</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Please load an active dataset from the Data module or click below to load the Master Econometrics sample set.
          </p>
          <button 
            onClick={handleLoadSample}
            className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-mono tracking-wider uppercase rounded-xl transition shadow-sm"
          >
            Load Master Econometrics Dataset
          </button>
        </div>
      ) : (
        <div className="space-y-8">
          {results && (
            <div className="flex bg-stone-100 p-1 rounded-xl w-full sm:w-fit mx-auto overflow-x-auto custom-scrollbar">
              {[
                { id: 'selection', label: '1. Variables Selection', icon: Binary },
                { id: 'scree', label: '2. Scree Plot & Variance', icon: LineChart },
                { id: 'loadings', label: '3. Loadings Matrix', icon: LayoutGrid },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-6 py-2.5 text-[10px] font-bold uppercase tracking-widest rounded-lg transition-all flex-1 sm:flex-initial whitespace-nowrap justify-center sm:justify-start ${
                    activeTab === tab.id ? "bg-white text-indigo-600 shadow-sm" : "text-stone-500 hover:text-stone-700"
                  }`}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </div>
          )}

          {activeTab === 'selection' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              {/* Form card */}
              <div className="lg:col-span-4 space-y-6">
                <div className="bg-white border border-stone-200 rounded-2xl p-6 shadow-sm space-y-6">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">Factor Setup</h3>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700">Select Variables (Pick ≥ 3)</label>
                    <p className="text-[10px] text-stone-400">PCA standardizes and aggregates these variables.</p>
                    <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto border border-stone-100 p-3 rounded-xl bg-stone-50">
                      {numericVariables.map(v => (
                        <label key={v} className="flex items-center gap-2 p-1.5 rounded hover:bg-stone-100 cursor-pointer text-xs text-stone-600 font-medium">
                          <input
                            type="checkbox"
                            checked={selectedVars.includes(v)}
                            onChange={() => handleToggleVar(v)}
                            className="rounded border-stone-300 text-indigo-600 focus:ring-indigo-500 w-3.5 h-3.5"
                          />
                          {v}
                        </label>
                      ))}
                    </div>
                  </div>

                  <button
                    onClick={handleRunPCA}
                    disabled={isRunning || selectedVars.length < 3}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Eigen Decomposition...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" /> Run Principal Components
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Informative description */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
                  <h4 className="text-lg font-serif font-bold text-stone-900">Dimension Reduction & Principal Components</h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    PCA performs a coordinate transform on the dataset's correlation structure. It calculates a set of new, orthogonal axes (Principal Components) where:
                  </p>
                  <ul className="list-disc pl-5 text-xs text-stone-600 space-y-2 font-serif">
                    <li><strong>PC 1</strong> is aligned with the direction of maximum variance in the Z-score space.</li>
                    <li><strong>PC 2</strong> is orthogonal to PC 1 and maps the next highest direction of variance.</li>
                    <li>Each subsequent PC is entirely uncorrelated with the others, preventing multicollinearity when these indices are used in subsequent regressions.</li>
                  </ul>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    <strong>Kaiser Criterion:</strong> Retain only those components with eigenvalues λ ≥ 1.0, which explain more variance than a single standardized variable.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'scree' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-8">
              <div className="border-b border-stone-100 pb-4">
                <h4 className="text-lg font-serif font-bold text-stone-900">Scree Plot & Eigenvalues Screen</h4>
                <p className="text-xs text-stone-500 font-mono mt-1">Variables analyzed: {results.variables.join(', ')}</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Scree Plot Chart */}
                <div className="space-y-2">
                  <h5 className="text-xs font-bold font-mono uppercase text-stone-400">Scree Line Graph</h5>
                  <div className="h-64 border border-stone-100 p-2 rounded-xl bg-stone-50/50">
                    <ResponsiveContainer width="100%" height="100%">
                      <RecLineChart data={results.componentMetrics}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="component" stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <YAxis stroke="#888" style={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <Tooltip contentStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                        <Line type="monotone" dataKey="eigenvalue" name="Eigenvalue" stroke="#4f46e5" strokeWidth={2.5} activeDot={{ r: 6 }} />
                      </RecLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Variance breakdown table */}
                <div className="space-y-2">
                  <h5 className="text-xs font-bold font-mono uppercase text-stone-400 font-bold">Variance Explained Table</h5>
                  <div className="overflow-x-auto border border-stone-100 rounded-xl">
                    <table className="w-full text-left border-collapse text-xs font-mono">
                      <thead>
                        <tr className="bg-stone-50 text-stone-500 uppercase text-[10px] border-b border-stone-100">
                          <th className="p-3 font-bold">Component</th>
                          <th className="p-3 font-bold text-right">Eigenvalue</th>
                          <th className="p-3 font-bold text-right">% Var</th>
                          <th className="p-3 font-bold text-right">Cum %</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-50">
                        {results.componentMetrics.map((row: any) => (
                          <tr key={row.component} className="hover:bg-stone-50">
                            <td className="p-3 font-bold text-stone-900">{row.component}</td>
                            <td className="p-3 text-right font-medium text-stone-800">{row.eigenvalue.toFixed(4)}</td>
                            <td className="p-3 text-right text-indigo-600 font-bold">{row.proportion.toFixed(2)}%</td>
                            <td className="p-3 text-right text-stone-600">{row.cumulative.toFixed(2)}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 space-y-3">
                <div className="flex items-center gap-2">
                  <BrainCircuit className="w-4 h-4 text-indigo-600" />
                  <h5 className="text-xs font-bold text-indigo-900 font-mono uppercase tracking-wider">Academic Coach Guidelines</h5>
                </div>
                <p className="text-xs text-stone-700 leading-relaxed font-serif italic">
                  Look at the elbow in the Scree Plot. In our dataset, the components before the steep elbow (and with eigenvalues ≥ 1.0) explain the bulk of structural variability. The first component PC 1 captures {results.componentMetrics[0].proportion.toFixed(1)}% of total variance, which makes it a very robust aggregate factor for subsequent regression analysis.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'loadings' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
              <h4 className="text-lg font-serif font-bold text-stone-900">Component Loadings (Correlation Matrix)</h4>
              <p className="text-xs text-stone-600 font-serif leading-relaxed">
                The loading matrix shows the correlation between the original variables and each principal component. Loadings range from -1 to 1. 
                Values greater than 0.40 (or less than -0.40) represent a strong relationship, indicating which original characteristics define each component.
              </p>

              <div className="overflow-x-auto border border-stone-100 rounded-xl">
                <table className="w-full text-left border-collapse text-xs font-mono">
                  <thead>
                    <tr className="bg-stone-50 text-stone-500 uppercase text-[10px] border-b border-stone-100">
                      <th className="p-4 font-bold">Original Variable</th>
                      {results.eigenvalues.map((_: any, idx: number) => (
                        <th key={idx} className="p-4 font-bold text-right">PC {idx + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-50">
                    {results.loadings.map((row: any) => (
                      <tr key={row.variable} className="hover:bg-stone-50">
                        <td className="p-4 font-bold text-stone-900">{row.variable}</td>
                        {results.eigenvalues.map((_: any, idx: number) => {
                          const val = row[`PC${idx + 1}`];
                          const isHigh = Math.abs(val) >= 0.4;
                          return (
                            <td 
                              key={idx} 
                              className={`p-4 text-right font-bold transition-all ${
                                isHigh 
                                  ? val >= 0 
                                    ? 'bg-emerald-50 text-emerald-700' 
                                    : 'bg-rose-50 text-rose-700'
                                  : 'text-stone-400'
                              }`}
                            >
                              {val.toFixed(4)}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
