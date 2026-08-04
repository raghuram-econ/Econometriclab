import React from 'react';
import { Terminal, Copy, Check } from 'lucide-react';
import { cn, copyTextToClipboard } from '../../lib/utils';

interface CodeBridgeProps {
  modelType: 'ols' | 'fe' | 'arima';
  yVar: string;
  xVars: string[];
  options?: {
    robust?: boolean;
    cluster?: string;
    entity?: string;
    time?: string;
    orders?: [number, number, number];
  };
}

export const CodeBridge: React.FC<CodeBridgeProps> = ({ modelType, yVar, xVars, options }) => {
  const [copied, setCopied] = React.useState<string | null>(null);

  const copyToClipboard = (text: string, type: string) => {
    copyTextToClipboard(text).then(success => {
      if (success) {
        setCopied(type);
        setTimeout(() => setCopied(null), 2000);
      } else {
        alert("Failed to copy code. Please copy manually.");
      }
    });
  };

  const getStataCode = () => {
    switch (modelType) {
      case 'ols':
        let cmd = `regress ${yVar} ${xVars.join(' ')}`;
        if (options?.cluster) cmd += `, vce(cluster ${options.cluster})`;
        else if (options?.robust) cmd += `, vce(robust)`;
        return cmd;
      case 'fe':
        return `xtset ${options?.entity} ${options?.time}\nxtreg ${yVar} ${xVars.join(' ')}, fe`;
      case 'arima':
        const [p, d, q] = options?.orders || [1, 1, 1];
        return `arima ${yVar}, arima(${p},${d},${q})`;
      default:
        return '';
    }
  };

  const getRCode = () => {
    switch (modelType) {
      case 'ols':
        let cmd = `model <- lm(${yVar} ~ ${xVars.join(' + ')}, data = df)`;
        if (options?.cluster) {
          cmd += `\n# Using sandwich package for clustered SEs\nlibrary(sandwich)\nlibrary(lmtest)\ncoeftest(model, vcov = vcovCL(model, cluster = ~${options.cluster}))`;
        } else if (options?.robust) {
          cmd += `\n# Using sandwich package for robust SEs\nlibrary(sandwich)\nlibrary(lmtest)\ncoeftest(model, vcov = vcovHC(model, type = "HC1"))`;
        }
        return cmd;
      case 'fe':
        return `library(fixest)\nfe_model <- feols(${yVar} ~ ${xVars.join(' + ')} | ${options?.entity}, data = df)`;
      case 'arima':
        const [p, d, q] = options?.orders || [1, 1, 1];
        return `library(forecast)\narima_model <- Arima(df$${yVar}, order = c(${p},${d},${q}))`;
      default:
        return '';
    }
  };

  const getPythonCode = () => {
    switch (modelType) {
      case 'ols':
        const xList = xVars.map(v => `'${v}'`).join(', ');
        let code = `import statsmodels.api as sm\n\nY = df['${yVar}']\nX = df[[${xList}]]\nX = sm.add_constant(X)\n\nmodel = sm.OLS(Y, X)\n`;
        if (options?.cluster) code += `results = model.fit(cov_type='cluster', cov_kwds={'groups': df['${options.cluster}']})`;
        else if (options?.robust) code += `results = model.fit(cov_type='HC1')`;
        else code += `results = model.fit()`;
        code += `\nprint(results.summary())`;
        return code;
      case 'fe':
        return `from linearmodels import PanelOLS\n\n# Entity and Time indices must be set\ndf = df.set_index(['${options?.entity}', '${options?.time}'])\nmodel = PanelOLS(df['${yVar}'], df[[${xVars.map(v => `'${v}'`).join(', ')}]], entity_effects=True)\nresults = model.fit()\nprint(results)`;
      case 'arima':
        const [p, d, q] = options?.orders || [1, 1, 1];
        return `from statsmodels.tsa.arima.model import ARIMA\n\nmodel = ARIMA(df['${yVar}'], order=(${p}, ${d}, ${q}))\nresults = model.fit()\nprint(results.summary())`;
      default:
        return '';
    }
  };

  const stataCode = getStataCode();
  const rCode = getRCode();
  const pythonCode = getPythonCode();

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-500" />
          <h3 className="text-[10px] font-bold uppercase tracking-widest text-slate-500">Professional Syntax Bridge</h3>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Stata Bridge */}
        <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
          <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
            <span className="text-[9px] font-bold text-blue-400 uppercase tracking-widest">Stata (.do)</span>
            <button 
              onClick={() => copyToClipboard(stataCode, 'stata')}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {copied === 'stata' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <div className="p-4">
            <code className="text-[11px] font-mono text-slate-300 block whitespace-pre-wrap leading-relaxed">
              {stataCode}
            </code>
          </div>
        </div>

        {/* R Bridge */}
        <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
          <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">R (.R)</span>
            <button 
              onClick={() => copyToClipboard(rCode, 'r')}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {copied === 'r' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <div className="p-4">
            <code className="text-[11px] font-mono text-slate-300 block whitespace-pre-wrap leading-relaxed">
              {rCode}
            </code>
          </div>
        </div>

        {/* Python Bridge */}
        <div className="bg-slate-900 rounded-xl overflow-hidden border border-slate-800">
          <div className="px-4 py-2 bg-slate-800 flex items-center justify-between">
            <span className="text-[9px] font-bold text-emerald-400 uppercase tracking-widest">Python (.py)</span>
            <button 
              onClick={() => copyToClipboard(pythonCode, 'python')}
              className="text-slate-400 hover:text-white transition-colors"
            >
              {copied === 'python' ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            </button>
          </div>
          <div className="p-4">
            <code className="text-[11px] font-mono text-slate-300 block whitespace-pre-wrap leading-relaxed">
              {pythonCode}
            </code>
          </div>
        </div>
      </div>
      
      <p className="text-[9px] text-slate-400 font-serif italic text-center">
        "Transition from AI-guided clicks to industry-standard reproducible scripts."
      </p>
    </div>
  );
};
