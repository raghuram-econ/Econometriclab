import { exportToLaTeX } from '../latexExporter';
import { StatsInterpretationResult } from '../../services/gemini';

describe('LaTeX Table Generator', () => {
  test('exports a known OLS result and asserts the output contains the educ coefficient string', () => {
    const knownResult: StatsInterpretationResult = {
      coefficients: [
        {
          variable: '(Intercept)',
          estimate: '0.5412',
          stdError: '0.1205',
          tStat: '4.49',
          pValue: '0.0001',
          ciLower: '0.3012',
          ciUpper: '0.7812',
          stars: '***'
        },
        {
          variable: 'educ',
          estimate: '0.1084',
          stdError: '0.0152',
          tStat: '7.13',
          pValue: '< 0.0001',
          ciLower: '0.0781',
          ciUpper: '0.1387',
          stars: '***'
        }
      ],
      diagnostics: {
        residualStdError: '3.4120',
        df: '498',
        rSquared: '0.4125',
        adjRSquared: '0.4113',
        fStatistic: '116.1',
        fDf1: '1',
        fDf2: '498',
        fPValue: '< 0.0001'
      },
      assumptions: [],
      apaParagraph: 'Standard OLS regression reveals education significantly predicts earnings.'
    };

    const latexOutput = exportToLaTeX(knownResult, 'OLS', 'Education Regression Context');

    // 1. Assert OLS run does not produce "ANOVA Results"
    expect(latexOutput).not.toContain('ANOVA Results');
    expect(latexOutput).toContain('Econometric Results');

    // 2. Assert it contains the 'educ' coefficient row mapping
    expect(latexOutput).toContain('educ');
    
    // 3. Assert it contains estimate, standard error, t-stat, p-value with stars
    // The row format: \textbf{educ} & 0.1084 & 0.0152 & 7.13 & < 0.0001*** \\
    expect(latexOutput).toContain('educ');
    expect(latexOutput).toContain('0.1084');
    expect(latexOutput).toContain('0.0152');
    expect(latexOutput).toContain('7.13');
    expect(latexOutput).toContain('< 0.0001***');
  });

  test('refuses to export an empty regression coefficients array and throws an error', () => {
    const emptyResult: StatsInterpretationResult = {
      coefficients: [],
      diagnostics: {
        residualStdError: '3.4120',
        df: '498',
        rSquared: '0.4125',
        adjRSquared: '0.4113',
        fStatistic: '116.1',
        fDf1: '1',
        fDf2: '498',
        fPValue: '< 0.0001'
      },
      assumptions: [],
      apaParagraph: ''
    };

    expect(() => {
      exportToLaTeX(emptyResult, 'OLS');
    }).toThrow('Regression coefficients array is empty.');
  });

  test('refuses to export an empty ANOVA rows array and throws an error', () => {
    const emptyAnovaResult: StatsInterpretationResult = {
      anovaRows: [],
      assumptions: [],
      apaParagraph: ''
    };

    expect(() => {
      exportToLaTeX(emptyAnovaResult, 'ANOVA');
    }).toThrow('ANOVA rows array is empty.');
  });
});
