import { StatsInterpretationResult } from '../services/gemini';

export function exportToLaTeX(
  result: StatsInterpretationResult | null | undefined,
  analysisType: string,
  researchContext?: string
): string {
  if (!result) {
    throw new Error('No estimated model results available to export.');
  }

  // (2) The exporter must select its template from the estimated model's type
  let effectiveAnalysisType = analysisType;
  if (result.anovaRows) {
    effectiveAnalysisType = 'ANOVA';
  } else if (result.ttestResults) {
    effectiveAnalysisType = 't-test';
  } else if (result.factorAnalysis) {
    effectiveAnalysisType = 'Factor Analysis';
  } else if (result.coefficients) {
    effectiveAnalysisType = 'OLS';
  } else {
    // (3) Add a guard: if both coefficients and anovaRows (and other results) are empty, refuse to export with an error
    throw new Error('The estimated model has no data rows to display.');
  }

  const name = researchContext ? researchContext.slice(0, 40) : `${effectiveAnalysisType} Estimation`;
  let latex = `% LaTeX Table Structure formatted using booktabs\n`;

  const formatValue = (val: any, precision: number = 4) => {
    if (val === null || val === undefined || val === 'null' || val === 'N/A') return 'N/A';
    const num = parseFloat(val);
    return isNaN(num) ? String(val) : num.toFixed(precision);
  };

  if (effectiveAnalysisType === 'ANOVA') {
    const rows = result.anovaRows ?? [];
    if (rows.length === 0) {
      throw new Error('ANOVA rows array is empty.');
    }

    latex += `\\begin{table}[htbp]\n\\centering\n\\small\n`;
    latex += `\\caption{ANOVA Results: ${name}}\n`;
    latex += `\\begin{tabular}{lrrrrr}\n\\toprule\n`;
    latex += `Source & Sum of Squares (SS) & df & Mean Square (MS) & F-statistic & p-value \\\\\n\\midrule\n`;
    rows.forEach(r => {
      const sourceName = r.source.replace(/_/g, '\\_');
      const ssVal = r.SS != null ? formatValue(r.SS, 4) : 'N/A';
      const dfVal = r.df != null ? formatValue(r.df, 0) : 'N/A';
      const msVal = r.MS != null ? formatValue(r.MS, 4) : 'N/A';
      const fVal = r.F != null ? formatValue(r.F, 3) : 'N/A';
      const pVal = r.p != null ? String(r.p) : 'N/A';
      latex += `\\textbf{${sourceName}} & ${ssVal} & ${dfVal} & ${msVal} & ${fVal} & ${pVal} \\\\\n`;
    });
    latex += `\\bottomrule\n\\end{tabular}\n\\end{table}`;
    return latex;
  }

  if (effectiveAnalysisType === 't-test') {
    const tResults = result.ttestResults;
    if (!tResults) {
      throw new Error('t-Test results are empty.');
    }
    latex += `\\begin{table}[htbp]\n\\centering\n\\small\n`;
    latex += `\\caption{t-Test Statistical Summary: ${name}}\n`;
    latex += `\\begin{tabular}{lr}\n\\toprule\n`;
    latex += `Statistical Metric & Value \\\\\n\\midrule\n`;
    latex += `Mean of Group X & ${tResults?.mean_x ?? 'N/A'} \\\\\n`;
    if (tResults?.mean_y) {
      latex += `Mean of Group Y & ${tResults?.mean_y} \\\\\n`;
    }
    latex += `t-statistic & ${tResults?.t ?? 'N/A'} \\\\\n`;
    latex += `Degrees of Freedom (df) & ${tResults?.df ?? 'N/A'} \\\\\n`;
    latex += `p-value & ${tResults?.p ?? 'N/A'} \\\\\n`;
    latex += `95\\% Confidence Interval & [${tResults?.ci_lower ?? 'N/A'}, ${tResults?.ci_upper ?? 'N/A'}] \\\\\n`;
    latex += `\\bottomrule\n\\end{tabular}\n\\end{table}`;
    return latex;
  }

  if (effectiveAnalysisType === 'Factor Analysis') {
    const loadings = result.factorAnalysis?.loadings ?? [];
    if (loadings.length === 0) {
      throw new Error('Factor loadings are empty.');
    }
    latex += `\\begin{table}[htbp]\n\\centering\n\\small\n`;
    latex += `\\caption{Factor Loadings and Variance: ${name}}\n`;
    latex += `\\begin{tabular}{lrr}\n\\toprule\n`;
    latex += `Variable & Loading & Uniqueness \\\\\n\\midrule\n`;
    loadings.forEach(l => {
      const varName = l.variable.replace(/_/g, '\\_');
      latex += `\\textbf{${varName}} & ${l.loading ?? 'N/A'} & ${l.uniqueness ?? 'N/A'} \\\\\n`;
    });
    if ((result.factorAnalysis?.varianceExplained ?? []).length > 0) {
      latex += `\\midrule\n`;
      latex += `\\multicolumn{3}{c}{\\textbf{Variance Explained by Factor}} \\\\\n`;
      latex += `Factor & Eigenvalue & Variance \\% (Cumulative \\%) \\\\\n\\midrule\n`;
      (result.factorAnalysis?.varianceExplained ?? []).forEach(v => {
        latex += `${v.factor} & ${v.eigenvalue ?? 'N/A'} & ${v.variancePercent ?? 'N/A'}\\% (${v.cumulativePercent ?? 'N/A'}\\%) \\\\\n`;
      });
    }
    latex += `\\bottomrule\n\\end{tabular}\n\\end{table}`;
    return latex;
  }

  // Default/Regression coefficients export - emit one row per coefficient (variable, estimate, SE, t, p with stars)
  const rows = result.coefficients ?? [];
  if (rows.length === 0) {
    throw new Error('Regression coefficients array is empty.');
  }

  latex += `\\begin{table}[htbp]\n\\centering\n\\small\n`;
  latex += `\\caption{Econometric Results: ${name}}\n`;
  latex += `\\begin{tabular}{lcccc}\n\\toprule\n`;
  latex += `Variable & Estimate & SE & t & p \\\\\n\\midrule\n`;
  
  rows.forEach(c => {
    const varName = c.variable.replace(/_/g, '\\_');
    const estVal = formatValue(c.estimate, 4);
    const seVal = formatValue(c.stdError, 4);
    const tVal = formatValue(c.tStat, 2);
    const pVal = formatValue(c.pValue, 4);
    const stars = c.stars || '';
    latex += `\\textbf{${varName}} & ${estVal} & ${seVal} & ${tVal} & ${pVal}${stars} \\\\\n`;
  });
  
  // Try to find true N (observations count) for OLS/FE/Tobit
  let observationsCount = 'N/A';
  if (result.diagnostics) {
    const diag = result.diagnostics as any;
    if (diag.n != null && diag.n !== 'null') observationsCount = String(diag.n);
    else if (diag.N != null && diag.N !== 'null') observationsCount = String(diag.N);
    else if (diag.observations != null && diag.observations !== 'null') observationsCount = String(diag.observations);
  }
  
  if (observationsCount === 'N/A' && result.apaParagraph) {
    const matchN = result.apaParagraph.match(/[nN]\s*=\s*(\d+)/);
    if (matchN && matchN[1]) {
      observationsCount = matchN[1];
    } else {
      const matchF = result.apaParagraph.match(/F\(\d+,\s*(\d+)\)/);
      if (matchF && matchF[1]) {
        const df2 = parseInt(matchF[1], 10);
        const coeffCount = result?.coefficients?.length ?? 0;
        observationsCount = String(df2 + coeffCount);
      }
    }
  }

  if (observationsCount === 'N/A' && result.diagnostics?.df) {
    observationsCount = (parseInt(result.diagnostics.df, 10) + (result?.coefficients?.length ?? 0)).toString();
  }

  latex += `\\midrule\n`;
  latex += `Observations & \\multicolumn{4}{c}{${observationsCount}} \\\\\n`;
  latex += `R-squared & \\multicolumn{4}{c}{${result?.diagnostics?.rSquared ?? 'N/A'}} \\\\\n`;
  latex += `Adjusted R-squared & \\multicolumn{4}{c}{${result?.diagnostics?.adjRSquared ?? 'N/A'}} \\\\\n`;
  latex += `F-Statistic & \\multicolumn{4}{c}{${result?.diagnostics?.fStatistic ?? 'N/A'}} \\\\\n`;
  latex += `\\bottomrule\n`;
  latex += `\\multicolumn{5}{l}{\\scriptsize{Significance levels: * p < 0.1, ** p < 0.05, *** p < 0.01. Standard errors in parentheses are NOT applicable (reported in SE column).}}\\\\\n`;
  latex += `\\end{tabular}\n\\end{table}`;
  return latex;
}
