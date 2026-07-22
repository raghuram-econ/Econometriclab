import { Dataset } from '../types';

function makeSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rndInflation = makeSeededRandom(137);
const rndHealth = makeSeededRandom(42);
const rndAgri = makeSeededRandom(101);
const rndRoad = makeSeededRandom(999);

// Dataset 1: India Inflation and Macro Policy (Time-Series, 30 years: 1995-2024)
export const indianInflationTimeSeries: Dataset = {
  name: 'India_Inflation_Macro_Policy',
  rowCount: 30,
  colCount: 6,
  structure: 'time-series',
  variables: [
    { name: 'year', label: 'Year', type: 'numeric' },
    { name: 'cpi_inflation', label: 'CPI Inflation (%)', type: 'numeric' },
    { name: 'wpi_inflation', label: 'WPI Inflation (%)', type: 'numeric' },
    { name: 'repo_rate', label: 'RBI Repo Rate (%)', type: 'numeric' },
    { name: 'm3_growth', label: 'Broad Money (M3) Growth (%)', type: 'numeric' },
    { name: 'fiscal_deficit', label: 'Fiscal Deficit (% of GDP)', type: 'numeric' },
    { name: 'gdp_growth', label: 'GDP Growth Rate (%)', type: 'numeric' }
  ],
  data: Array.from({ length: 30 }, (_, idx) => {
    const year = 1995 + idx;
    // Model realistic Indian economic cycles
    const isCrisis97 = year === 1997 || year === 1998;
    const isGlobal08 = year === 2008 || year === 2009;
    const isCovid20 = year === 2020 || year === 2021;
    
    let gdp_growth = 6.2 + Math.sin(idx / 2.5) * 1.8 + (rndInflation() * 0.8 - 0.4);
    if (isCrisis97) gdp_growth -= 1.5;
    if (isGlobal08) gdp_growth -= 2.5;
    if (isCovid20) gdp_growth = year === 2020 ? -5.8 : 8.2; // Covid rebound

    let cpi_inflation = 6.5 + Math.cos(idx / 3) * 2.2 + (rndInflation() * 1.0 - 0.5);
    if (year >= 2014) cpi_inflation = 4.8 + Math.cos(idx / 2) * 1.1; // MPC inflation targeting era

    const wpi_inflation = cpi_inflation + (rndInflation() * 1.6 - 0.8);
    
    // Monetary policy feedback loop
    let repo_rate = cpi_inflation + 1.8 + (rndInflation() * 0.6 - 0.3);
    repo_rate = Math.max(4.0, Math.min(10.5, repo_rate));

    const m3_growth = 12.5 - (repo_rate * 0.4) + rndInflation() * 1.5;
    
    let fiscal_deficit = 4.5 + (gdp_growth < 5 ? 1.5 : -0.8) + (rndInflation() * 0.6 - 0.3);
    if (isCovid20) fiscal_deficit = year === 2020 ? 9.2 : 6.8;

    return {
      year,
      cpi_inflation: parseFloat(cpi_inflation.toFixed(2)),
      wpi_inflation: parseFloat(wpi_inflation.toFixed(2)),
      repo_rate: parseFloat(repo_rate.toFixed(2)),
      m3_growth: parseFloat(m3_growth.toFixed(2)),
      fiscal_deficit: parseFloat(fiscal_deficit.toFixed(2)),
      gdp_growth: parseFloat(gdp_growth.toFixed(2))
    };
  })
};

// Dataset 2: National Family Health Survey (NFHS-5) Synthetic Calibrated (100 Households)
export const nfhsMicroHealth: Dataset = {
  name: 'NFHS_Synthetic_Calibrated',
  rowCount: 100,
  colCount: 6,
  structure: 'cross-section',
  variables: [
    { name: 'household_id', label: 'Household ID', type: 'numeric' },
    { name: 'mother_educ', label: 'Mother Years of Education', type: 'numeric' },
    { name: 'child_stunting_index', label: 'Child Nutritional Stunting Index', type: 'numeric' },
    { name: 'wealth_index', label: 'Household Wealth Score (0-100)', type: 'numeric' },
    { name: 'clean_water', label: 'Access to Clean Drinking Water (0/1)', type: 'numeric' },
    { name: 'rural', label: 'Rural Residence Indicator (0/1)', type: 'numeric' }
  ],
  data: Array.from({ length: 100 }, (_, idx) => {
    const household_id = 1001 + idx;
    const rural = rndHealth() > 0.45 ? 1 : 0;
    
    const mother_educ = Math.max(0, Math.min(17, Math.round(
      (rural ? 6 : 11) + (rndHealth() * 6 - 3)
    )));

    const wealth_index = Math.max(5, Math.min(98, Math.round(
      (rural ? 35 : 70) + (mother_educ * 1.8) + (rndHealth() * 20 - 10)
    )));

    const clean_water = rndHealth() < (rural ? 0.68 : 0.92) ? 1 : 0;

    // Nutrition outcomes - stunting index (negative numbers indicate severe stunting)
    // child_stunting_index = f(mother_educ, wealth, clean_water, rural) + error
    const baseStunting = -0.5 + (0.08 * mother_educ) + (0.015 * wealth_index) + (0.5 * clean_water) - (0.4 * rural) + (rndHealth() * 1.6 - 0.8);
    
    return {
      household_id,
      mother_educ,
      child_stunting_index: parseFloat(baseStunting.toFixed(3)),
      wealth_index,
      clean_water,
      rural
    };
  })
};

// Dataset 3: Indian Agricultural Yields (Panel Data, 6 major states over 10 years: 2014-2023)
export const indianAgriculturePanel: Dataset = {
  name: 'Indian_Agriculture_Panel',
  rowCount: 60,
  colCount: 7,
  structure: 'panel',
  variables: [
    { name: 'state_id', label: 'State ID', type: 'numeric' },
    { name: 'state_name', label: 'State Name', type: 'categorical' },
    { name: 'year', label: 'Year', type: 'numeric' },
    { name: 'crop_yield', label: 'Rice Yield (Tonnes/Hectare)', type: 'numeric' },
    { name: 'rainfall_dev', label: 'Rainfall Deviation from Normal (%)', type: 'numeric' },
    { name: 'fertilizer_usage', label: 'Fertilizer Consumption (kg/Hectare)', type: 'numeric' },
    { name: 'irrigation', label: 'Irrigated Area Ratio (%)', type: 'numeric' }
  ],
  data: (() => {
    const states = [
      { id: 1, name: 'Punjab', baseYield: 3.9, baseIrrig: 98, baseFert: 240 },
      { id: 2, name: 'Haryana', baseYield: 3.5, baseIrrig: 92, baseFert: 210 },
      { id: 3, name: 'Uttar Pradesh', baseYield: 2.7, baseIrrig: 81, baseFert: 180 },
      { id: 4, name: 'Bihar', baseYield: 2.1, baseIrrig: 64, baseFert: 140 },
      { id: 5, name: 'West Bengal', baseYield: 2.9, baseIrrig: 58, baseFert: 165 },
      { id: 6, name: 'Madhya Pradesh', baseYield: 1.8, baseIrrig: 42, baseFert: 95 }
    ];
    const years = Array.from({ length: 10 }, (_, i) => 2014 + i);
    const panelRows: any[] = [];

    states.forEach(s => {
      years.forEach((yr, tIdx) => {
        // High quality regional rain deviation cycles
        let rainfall_dev = Math.sin(tIdx / 1.5) * 12 + (rndAgri() * 15 - 7.5);
        if (yr === 2014 || yr === 2015) rainfall_dev -= 14; // Deficit monsoon years in India
        
        const irrigation = Math.min(100, s.baseIrrig + (tIdx * 0.5) + (rndAgri() * 2 - 1));
        const fertilizer_usage = s.baseFert + (tIdx * 3.5) + (rndAgri() * 10 - 5);
        
        // Structural Yield model
        // crop_yield = f(irrigation, fertilizer, rainfall) + state_fixed_effects + technological_trend
        const yieldTrend = 0.035 * tIdx;
        const rainImpact = rainfall_dev > 0 ? (0.012 * rainfall_dev) : (0.022 * rainfall_dev); // asymmetric drought risk
        
        const crop_yield = s.baseYield + 
                           (0.015 * (irrigation - s.baseIrrig)) + 
                           (0.003 * (fertilizer_usage - s.baseFert)) + 
                           rainImpact + 
                           yieldTrend + 
                           (rndAgri() * 0.2 - 0.1);

        panelRows.push({
          state_id: s.id,
          state_name: s.name,
          year: yr,
          crop_yield: parseFloat(Math.max(1.0, crop_yield).toFixed(3)),
          rainfall_dev: parseFloat(rainfall_dev.toFixed(2)),
          fertilizer_usage: parseFloat(fertilizer_usage.toFixed(2)),
          irrigation: parseFloat(irrigation.toFixed(2))
        });
      });
    });

    return panelRows;
  })()
};

// Dataset 4: PMGSY Road Impact Evaluation (Difference-in-Differences, 40 Villages across Pre & Post)
export const pmgsyRoadDiD: Dataset = {
  name: 'PMGSY_Road_Impact_DiD',
  rowCount: 80, // 40 villages * 2 periods
  colCount: 6,
  structure: 'panel', // representing longitudinal/DiD panel
  variables: [
    { name: 'village_id', label: 'Village ID', type: 'numeric' },
    { name: 'state', label: 'State Name', type: 'categorical' },
    { name: 'time', label: 'Post-Treatment Indicator (0=Pre, 1=Post)', type: 'numeric' },
    { name: 'treated', label: 'Road Treatment Group (0=Control, 1=Treated)', type: 'numeric' },
    { name: 'household_income', label: 'Average Household Income (INR, \'000)', type: 'numeric' },
    { name: 'days_emp', label: 'Average Annual MGNREGA Days of Work', type: 'numeric' }
  ],
  data: (() => {
    const states = ['Bihar', 'Uttar Pradesh', 'Madhya Pradesh', 'Rajasthan'];
    const didRows: any[] = [];

    // 40 Villages (20 Treated, 20 Control)
    for (let vId = 1; vId <= 40; vId++) {
      const treated = vId <= 20 ? 1 : 0;
      const state = states[vId % 4];
      const baseIncome = 42 + (vId % 5) * 4 + (rndRoad() * 4 - 2);
      const baseDays = 45 + (vId % 3) * 6 + (rndRoad() * 8 - 4);

      // Period 0: Pre-PMGSY Road
      didRows.push({
        village_id: vId,
        state,
        time: 0,
        treated,
        household_income: parseFloat(baseIncome.toFixed(2)),
        days_emp: parseFloat(baseDays.toFixed(1))
      });

      // Period 1: Post-PMGSY Road
      // Treated village gets DiD benefit of +8.5K income and -5.0 days of public works reliance (due to market integration)
      const commonTrendIncome = 2.4 + (rndRoad() * 1.5 - 0.75);
      const commonTrendDays = -1.2 + (rndRoad() * 2.0 - 1.0);
      
      const postIncome = baseIncome + commonTrendIncome + (treated ? 8.5 + (rndRoad() * 2 - 1) : 0);
      const postDays = baseDays + commonTrendDays + (treated ? -6.2 + (rndRoad() * 3 - 1.5) : 0);

      didRows.push({
        village_id: vId,
        state,
        time: 1,
        treated,
        household_income: parseFloat(postIncome.toFixed(2)),
        days_emp: parseFloat(Math.max(10, postDays).toFixed(1))
      });
    }

    return didRows;
  })()
};

export const indianSampleDatasets = [
  {
    id: 'ts_inflation',
    title: 'India Inflation & Macro Policy (Empirical Simulation)',
    desc: 'Pedagogical simulation calibrated to match real-world CPI/WPI tracking, RBI Repo interest rates, money supply, and fiscal deficits over 30 years (1995-2024).',
    dim: '30 rows × 7 variables',
    type: 'Time-Series (Calibrated Simulation)',
    dataset: indianInflationTimeSeries
  },
  {
    id: 'cs_nfhs',
    title: 'NFHS-5 Nutritional Micro-Evaluation (Synthetic Calibrated Sample)',
    desc: 'High-fidelity pedagogical household micro-simulation modeled on NFHS-5 statistical moments, tracking child nutritional indicators against maternal literacy, wealth, and sanitation.',
    dim: '100 rows × 6 variables',
    type: 'Cross-Sectional (Synthetic Simulation)',
    dataset: nfhsMicroHealth
  },
  {
    id: 'panel_agri',
    title: 'Indian Agricultural Yield Dynamics (Calibrated State Panel)',
    desc: 'Calibrated state-level panel simulation for 6 states over 10 years charting agricultural yields relative to fertilizer and rainfall deviations, modeled on MoA&FW empirical moments.',
    dim: '60 rows × 7 variables',
    type: 'Panel Data (Calibrated Simulation)',
    dataset: indianAgriculturePanel
  },
  {
    id: 'did_pmgsy',
    title: 'PMGSY Market Connectivity Impact (Calibrated DiD Study)',
    desc: 'Pedagogical Difference-in-Differences impact evaluation simulation for 40 villages assessing road-paving interventions on village household incomes, calibrated from PMGSY empirical literature.',
    dim: '80 rows × 6 variables',
    type: 'Difference-in-Differences (Calibrated Simulation)',
    dataset: pmgsyRoadDiD
  }
];
