import * as math from 'mathjs';
import { solveQR } from './estimators';

export type ImputationMethod = 'mean' | 'median' | 'regression';

export function imputeMean(data: any[], variable: string): any[] {
  const values = data
    .map(row => row[variable])
    .filter(val => val !== null && val !== undefined && !isNaN(parseFloat(val)));
  
  if (values.length === 0) return data;
  
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  
  return data.map(row => ({
    ...row,
    [variable]: (row[variable] === null || row[variable] === undefined || isNaN(parseFloat(row[variable]))) ? mean : row[variable]
  }));
}

export function imputeMedian(data: any[], variable: string): any[] {
  const values = data
    .map(row => row[variable])
    .filter(val => val !== null && val !== undefined && !isNaN(parseFloat(val)))
    .sort((a, b) => a - b);
  
  if (values.length === 0) return data;
  
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 !== 0 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  
  return data.map(row => ({
    ...row,
    [variable]: (row[variable] === null || row[variable] === undefined || isNaN(parseFloat(row[variable]))) ? median : row[variable]
  }));
}

export function imputeRegression(data: any[], targetVar: string, predictorVar: string): any[] {
  // Simple bivariate regression: target = alpha + beta * predictor
  const filteredData = data.filter(row => {
    const targetVal = row[targetVar];
    const predictorVal = row[predictorVar];
    return targetVal !== null && targetVal !== undefined && !isNaN(parseFloat(targetVal)) &&
           predictorVal !== null && predictorVal !== undefined && !isNaN(parseFloat(predictorVal));
  });

  if (filteredData.length < 2) return data;

  const Y = filteredData.map(row => parseFloat(row[targetVar]));
  const X = filteredData.map(row => [1, parseFloat(row[predictorVar])]);

  try {
    const qrRes = solveQR(X, Y);
    const beta = qrRes.beta;

    return data.map(row => {
      const val = row[targetVar];
      if (val === null || val === undefined || isNaN(parseFloat(val))) {
        const predictorVal = parseFloat(row[predictorVar]);
        if (!isNaN(predictorVal)) {
          // alpha + beta * predictorVal
          const predicted = beta[0] + beta[1] * predictorVal;
          return { ...row, [targetVar]: predicted };
        }
      }
      return row;
    });
  } catch (err) {
    console.error('Regression imputation failed:', err);
    return data;
  }
}
