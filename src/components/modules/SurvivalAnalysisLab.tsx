import React, { useState, useMemo } from 'react';
import { 
  Heart, 
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

interface SurvivalAnalysisLabProps {
  dataset: Dataset | null;
  onRunComplete?: (results: any, spec: string) => void;
}

// Helper to calculate Kaplan-Meier curve
function calculateKM(data: any[], timeVar: string, eventVar: string) {
  // Filter and sort by time
  const cleanData = data
    .map(row => ({
      t: parseFloat(row[timeVar]),
      d: parseInt(row[eventVar])
    }))
    .filter(row => !isNaN(row.t) && !isNaN(row.d))
    .sort((a, b) => a.t - b.t);

  if (cleanData.length === 0) return { kmPoints: [], plotPoints: [] };

  // Group by distinct event times
  const distinctTimes = Array.from(new Set(cleanData.map(row => row.t)));
  const kmPoints: any[] = [];
  let s_prev = 1.0;
  let remaining = cleanData.length;

  distinctTimes.forEach((time) => {
    // Number at risk is the count of items with t >= time
    const n_at_risk = cleanData.filter(row => row.t >= time).length;
    // Number of events at exactly this time
    const n_events = cleanData.filter(row => row.t === time && row.d === 1).length;

    let s_t = s_prev;
    if (n_at_risk > 0) {
      s_t = s_prev * (1 - n_events / n_at_risk);
    }

    kmPoints.push({
      time,
      atRisk: n_at_risk,
      events: n_events,
      survival: s_t
    });

    s_prev = s_t;
  });

  // Generate continuous step-function plotting points
  const plotPoints: any[] = [{ time: 0, survival: 1.0 }];
  kmPoints.forEach((pt) => {
    // To make it look like a step function, we add a point just before the change
    plotPoints.push({ time: pt.time, survival: plotPoints[plotPoints.length - 1].survival });
    plotPoints.push({ time: pt.time, survival: pt.survival });
  });

  return { kmPoints, plotPoints };
}

export default function SurvivalAnalysisLab({ dataset: propDataset, onRunComplete }: SurvivalAnalysisLabProps) {
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

  const [timeVar, setTimeVar] = useState<string>('');
  const [eventVar, setEventVar] = useState<string>('');
  const [groupVar, setGroupVar] = useState<string>('None');
  const [results, setResults] = useState<any | null>(null);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'selection' | 'curves' | 'table'>('selection');

  React.useEffect(() => {
    if (numericVariables.length > 1) {
      if (!timeVar || !numericVariables.includes(timeVar)) {
        setTimeVar(numericVariables.find(v => v === 'exper') || numericVariables[0] || '');
      }
      if (!eventVar || !numericVariables.includes(eventVar)) {
        setEventVar(numericVariables.find(v => v === 'employment' || v === 'training') || numericVariables[1] || '');
      }
    }
  }, [numericVariables]);

  const handleRunSurvival = () => {
    if (!activeDataset || !timeVar || !eventVar) return;
    setIsRunning(true);

    setTimeout(() => {
      try {
        if (groupVar === 'None') {
          const { kmPoints, plotPoints } = calculateKM(activeDataset.data, timeVar, eventVar);
          const medianSurvival = kmPoints.find(pt => pt.survival <= 0.5)?.time || "N/A";

          setResults({
            type: 'single',
            timeVar,
            eventVar,
            medianSurvival,
            kmPoints: kmPoints.slice(0, 30), // Limit table display
            plotData: plotPoints
          });
        } 
        else {
          // Split by group variable (binary splits)
          const groupVals = Array.from(new Set(activeDataset.data.map(row => row[groupVar])));
          if (groupVals.length > 5) {
            throw new Error("Grouping variable has too many categories. Please select a binary indicator.");
          }

          const curves: Record<string, any[]> = {};
          const medians: Record<string, any> = {};

          groupVals.forEach(val => {
            const groupData = activeDataset.data.filter(row => row[groupVar] === val);
            const { kmPoints, plotPoints } = calculateKM(groupData, timeVar, eventVar);
            curves[String(val)] = plotPoints;
            medians[String(val)] = kmPoints.find(pt => pt.survival <= 0.5)?.time || "N/A";
          });

          // Align plotting series for Recharts
          // Combine time keys
          const allTimes = Array.from(new Set(
            Object.values(curves).flatMap(arr => arr.map(pt => pt.time))
          )).sort((a, b) => a - b);

          const plotData = allTimes.map(t => {
            const point: any = { time: t };
            groupVals.forEach(val => {
              // Find closest survival at or before t
              const valCurves = curves[String(val)] || [];
              const matches = valCurves.filter(pt => pt.time <= t);
              const lastMatch = matches[matches.length - 1];
              point[`survival_group_${val}`] = lastMatch ? lastMatch.survival : 1.0;
            });
            return point;
          });

          setResults({
            type: 'grouped',
            timeVar,
            eventVar,
            groupVar,
            groups: groupVals.map(v => String(v)),
            medians,
            plotData
          });
        }

        setActiveTab('curves');
      } catch (err: any) {
        alert(err.message || "An error occurred during Survival Kaplan-Meier estimation.");
      } finally {
        setIsRunning(false);
      }
    }, 600);
  };

  return (
    <div id="survival-analysis-lab" className="max-w-5xl mx-auto px-4 py-8 space-y-8 animate-in fade-in duration-700">
      <ModuleIntroCard 
        title="Survival Analysis Lab"
        description="Model the duration until events occur (time-to-event analysis). Calculate exact Kaplan-Meier survival curves and track attrition rates, adjusting dynamically for censored observations."
        useWhen="You are analyzing spells, such as duration of unemployment, time until college completion, or survival rates under clinical treatments."
        requires={["A continuous numeric duration variable (Time)", "A binary event censor variable (1 = Event occurred, 0 = Censored)", "Subjects under observation over continuous intervals"]}
        youWillGet={["Kaplan-Meier survival probability steps", "Median survival time estimators", "Multi-group comparative survival plots"]}
        pitfalls={["Disregarding censoring leading to survival underestimation", "Selecting non-time variables as durations", "Small sample sizes at high time horizons inflating survival variance"]}
        example="S(t) = ∏ [1 - d_i / n_i]"
      />

      {!activeDataset ? (
        <div className="p-12 text-center bg-white border border-stone-200 rounded-2xl shadow-sm space-y-4 max-w-xl mx-auto">
          <Heart className="w-12 h-12 text-indigo-500 mx-auto animate-pulse" />
          <h3 className="text-lg font-serif font-bold text-stone-900">Active Dataset Required</h3>
          <p className="text-sm text-stone-500 max-w-md mx-auto">
            Please load an active dataset from the Data module or click below to automatically load the Master Econometrics sample panel.
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
                { id: 'selection', label: '1. Duration Parameters', icon: Binary },
                { id: 'curves', label: '2. Kaplan-Meier Curves', icon: LineChart },
                { id: 'table', label: '3. Attrition Life Table', icon: LayoutGrid },
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
                  <h3 className="text-xs font-bold uppercase tracking-wider text-stone-400 font-mono">Survival Settings</h3>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700">Duration Variable (t)</label>
                    <select
                      value={timeVar}
                      onChange={(e) => setTimeVar(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {numericVariables.map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700">Event Indicator (d)</label>
                    <p className="text-[10px] text-stone-400">1 = Event (unemployed to employed), 0 = Censored (stayed unemployed).</p>
                    <select
                      value={eventVar}
                      onChange={(e) => setEventVar(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      {numericVariables.filter(v => v !== timeVar).map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-stone-700">Stratifying Variable (Optional)</label>
                    <select
                      value={groupVar}
                      onChange={(e) => setGroupVar(e.target.value)}
                      className="w-full bg-stone-50 border border-stone-200 rounded-xl px-4 py-2.5 text-xs text-stone-800 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    >
                      <option value="None">None (Single Curve)</option>
                      {numericVariables.filter(v => v !== timeVar && v !== eventVar).map(v => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleRunSurvival}
                    disabled={isRunning || !timeVar || !eventVar}
                    className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold font-mono tracking-wider uppercase transition shadow-sm disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isRunning ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" /> Calculating survival...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5" /> Plot Kaplan-Meier
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Informative description */}
              <div className="lg:col-span-8 space-y-6">
                <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
                  <h4 className="text-lg font-serif font-bold text-stone-900">Understanding Kaplan-Meier Survival Analysis</h4>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    Unemployment spell and clinical study timelines present a unique econometric challenge: some individuals remain in the state until the very end of the research study. This is called **right-censoring**. 
                  </p>
                  <p className="text-xs text-stone-600 leading-relaxed font-serif">
                    If we exclude censored cases, we introduce selection bias. If we treat them as if the event occurred immediately, we underestimate duration. The **Kaplan-Meier product-limit estimator** adjusts at each event step by scaling survival probabilities by the *number of individuals at risk* just before that moment.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'curves' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-8">
              <div className="border-b border-stone-100 pb-4">
                <h4 className="text-lg font-serif font-bold text-stone-900">Kaplan-Meier Survival Probability Steps</h4>
                <p className="text-xs text-stone-500 font-mono mt-1">
                  Time Variable: {results.timeVar} | Event Indicator: {results.eventVar} 
                  {results.groupVar && ` | Stratified by: ${results.groupVar}`}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="md:col-span-3 bg-stone-50/50 border border-stone-100 p-4 rounded-xl">
                  <h5 className="text-xs font-bold font-mono uppercase text-stone-400 mb-4 text-center">Survival Step Curve [S(t)]</h5>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <RecLineChart data={results.plotData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                        <XAxis dataKey="time" stroke="#888" label={{ value: 'Duration (t)', position: 'insideBottom', offset: -5, fontSize: 10, fill: '#666' }} style={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <YAxis domain={[0, 1]} stroke="#888" label={{ value: 'S(t)', angle: -90, position: 'insideLeft', fontSize: 10, fill: '#666' }} style={{ fontSize: 10, fontFamily: 'monospace' }} />
                        <Tooltip contentStyle={{ fontSize: 11, fontFamily: 'monospace' }} />
                        <Legend wrapperStyle={{ fontSize: 10 }} />
                        
                        {results.type === 'single' ? (
                          <Line type="step" dataKey="survival" name="Overall Survival Probability S(t)" stroke="#4f46e5" strokeWidth={2.5} dot={false} />
                        ) : (
                          results.groups.map((grp: string, idx: number) => {
                            const colors = ['#4f46e5', '#06b6d4', '#e11d48', '#10b981'];
                            return (
                              <Line 
                                key={grp}
                                type="step" 
                                dataKey={`survival_group_${grp}`} 
                                name={`Group: ${results.groupVar} = ${grp}`} 
                                stroke={colors[idx % colors.length]} 
                                strokeWidth={2.5} 
                                dot={false} 
                              />
                            );
                          })
                        )}
                      </RecLineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                <div className="space-y-4">
                  <h5 className="text-xs font-bold font-mono uppercase text-stone-400">Median Survival Threshold</h5>
                  {results.type === 'single' ? (
                    <div className="bg-stone-50 border border-stone-100 p-4 rounded-xl text-center space-y-1">
                      <span className="text-[10px] font-mono font-bold uppercase text-stone-400 block">Overall Median Duration</span>
                      <span className="text-xl font-mono font-bold text-stone-800">{results.medianSurvival}</span>
                      <span className="text-[10px] text-stone-400 block font-serif">(Time where S(t) drops ≤ 0.5)</span>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {results.groups.map((grp: string) => (
                        <div key={grp} className="bg-stone-50 border border-stone-100 p-3 rounded-xl flex justify-between items-center">
                          <span className="text-[10px] font-mono font-bold uppercase text-stone-500 truncate">{results.groupVar} = {grp}</span>
                          <span className="text-sm font-mono font-bold text-stone-800">{results.medians[grp]}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 text-[11px] text-stone-600 font-serif leading-relaxed italic">
                    Median survival denotes the duration at which exactly 50% of the sample has exited the initial spell. A larger value represents longer average duration in the state.
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'table' && results && (
            <div className="bg-white border border-stone-200 rounded-2xl p-8 shadow-sm space-y-6">
              <h4 className="text-lg font-serif font-bold text-stone-900">Life Attrition Table Output</h4>
              
              {results.type === 'single' ? (
                <div className="overflow-x-auto border border-stone-100 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs font-mono">
                    <thead>
                      <tr className="bg-stone-50 text-stone-500 uppercase text-[10px] border-b border-stone-100">
                        <th className="p-3 font-bold">Event Time (t)</th>
                        <th className="p-3 font-bold text-right">Subjects At Risk (n)</th>
                        <th className="p-3 font-bold text-right">Events Observed (d)</th>
                        <th className="p-3 font-bold text-right">Survival Probability [S(t)]</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-stone-50">
                      {results.kmPoints.map((row: any) => (
                        <tr key={row.time} className="hover:bg-stone-50">
                          <td className="p-3 font-bold text-stone-900">{row.time}</td>
                          <td className="p-3 text-right text-stone-600">{row.atRisk}</td>
                          <td className="p-3 text-right text-rose-600 font-bold">{row.events}</td>
                          <td className="p-3 text-right text-indigo-700 font-bold">{(row.survival * 100).toFixed(2)}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="bg-stone-50 p-6 rounded-xl border border-stone-100 text-center text-xs text-stone-500 font-serif">
                   लाइफ table is only detailed in single curve mode. Switch your stratifying variable to "None" to output detailed survival tables.
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
