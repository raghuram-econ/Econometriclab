import React from 'react';
import { 
  ScatterChart, 
  Scatter, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Line, 
  ComposedChart, 
  Area 
} from 'recharts';

interface PlotProps {
  type: 'scatter' | 'arima' | 'residual';
  data: any[];
  xKey?: string;
  yKey?: string;
  yLabel?: string;
  xLabel?: string;
  forecastData?: any[];
}

export default function EconometricsPlot({ 
  type, 
  data, 
  xKey = 'x', 
  yKey = 'y',
  forecastData = []
}: PlotProps) {
  const safeData = React.useMemo(() => {
    if (!data || !Array.isArray(data)) return [];
    if (type === 'arima') {
      return data.map(d => {
        const cleaned = { ...d };
        if (cleaned.actual !== undefined && isNaN(Number(cleaned.actual))) cleaned.actual = null;
        if (cleaned.forecast !== undefined && isNaN(Number(cleaned.forecast))) cleaned.forecast = null;
        if (cleaned.upper !== undefined && isNaN(Number(cleaned.upper))) cleaned.upper = null;
        if (cleaned.lower !== undefined && isNaN(Number(cleaned.lower))) cleaned.lower = null;
        return cleaned;
      });
    } else {
      return data.filter(d => d && !isNaN(Number(d[xKey])) && !isNaN(Number(d[yKey])));
    }
  }, [data, type, xKey, yKey]);

  if (type === 'arima') {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={safeData} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="index" hide />
          <YAxis fontSize={10} axisLine={false} tickLine={false} tick={{fill: '#94a3b8'}} />
          <Tooltip contentStyle={{backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px'}} />
          <Area dataKey="upper" stroke="none" fill="#3b82f6" fillOpacity={0.05} />
          <Area dataKey="lower" stroke="none" fill="#fff" />
          <Line type="monotone" dataKey="actual" stroke="#0f172a" strokeWidth={1.5} dot={false} name="Actual" isAnimationActive={false} />
          <Line type="monotone" dataKey="forecast" stroke="#2563eb" strokeWidth={2} strokeDasharray="5 5" dot={false} name="Forecast" isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <ScatterChart margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis type="number" dataKey={xKey} axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
        <YAxis type="number" dataKey={yKey} axisLine={false} tickLine={false} tick={{fontSize: 10, fill: '#94a3b8'}} />
        <Tooltip contentStyle={{backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: '6px', fontSize: '11px'}} />
        <Scatter name="Data" data={safeData} fill="#cbd5e1" stroke="#94a3b8" />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
