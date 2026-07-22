import { generateMasterDataset, generateCardKruegerDiD, generateMincerianWages, generateBinaryHealthOutcome } from '../lib/dataGenerators';

function makeSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
const rndService = makeSeededRandom(2024);

export function getSampleData(name: string) {
  if (name === "Master Econometrics Test Dataset") {
    return generateMasterDataset();
  } else if (name === "Card-Krueger Minimum Wage Study") {
    return generateCardKruegerDiD();
  } else if (name === "Mincerian Wage Earnings Profile") {
    return generateMincerianWages();
  } else if (name === "Binary Health Insurance Outcome") {
    return generateBinaryHealthOutcome();
  } else if (name === "CPS 2024 Wages (Cross-Section)" || name === "CPS 2024 (IV Specification)") {
    return Array.from({ length: 500 }, (_, i) => ({
      wage: 15 + rndService() * 50 + (i % 2 === 0 ? 10 : 0),
      educ: 8 + Math.floor(rndService() * 12),
      exper: Math.floor(rndService() * 40),
      gender: i % 2 === 0 ? 'Female' : 'Male',
      married: rndService() > 0.5 ? 1 : 0
    }));
  } else if (name === "EU Growth 2010-2023 (Panel)") {
    const countries = ['Germany', 'France', 'Italy', 'Spain', 'Poland'];
    const data: any[] = [];
    countries.forEach(country => {
      for (let year = 2010; year <= 2023; year++) {
        data.push({
          country,
          year,
          gdp_growth: 1 + rndService() * 3,
          inflation: 0.5 + rndService() * 4,
          unemp: 3 + rndService() * 8
        });
      }
    });
    return data;
  } else if (name === "Global Temperature Index (Time-Series)") {
    return Array.from({length: 120}, (_, i) => ({
      date: new Date(2014, i, 1).toISOString().split('T')[0],
      temp: 0.5 + 0.01 * i + rndService() * 0.2,
      co2: 400 + i * 0.1
    }));
  }
  return null;
}
