function makeSeededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const rndWages      = makeSeededRandom(42);
const rndPanel      = makeSeededRandom(137);
const rndTimeSeries = makeSeededRandom(999);
const rndCross      = makeSeededRandom(314);

export function generateMasterDataset() {
  const data = [];
  const entities = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa'];
  const years = Array.from({ length: 30 }, (_, i) => 1995 + i);

  for (const entity of entities) {
    const entity_id = entities.indexOf(entity) + 1;
    // Base ability for this entity (unobserved/observed proxy)
    const ability = 0.5 + rndPanel() * 2;
    // Base distance to college (for IV) - time-invariant for entity
    const distance_to_college = 5 + rndPanel() * 95;

    for (const year of years) {
      const t = years.indexOf(year);
      
      // Macro factors (correlated with year)
      const gdp_growth = 1 + rndPanel() * 4 + (Math.sin(t / 5) * 2);
      const inflation = 1.5 + rndPanel() * 3 + (Math.cos(t / 8) * 1.5);
      const unemployment = 4 + rndPanel() * 6 - (gdp_growth * 0.5);
      
      // Individual traits
      const female = rndPanel() > 0.5 ? 1 : 0;
      const urban = rndPanel() > 0.4 ? 1 : 0;
      
      // Education (depends on distance_to_college - IV relevance)
      const educ = 10 + Math.floor(rndPanel() * 8) - Math.floor(distance_to_college / 30);
      
      // Experience
      const exper = Math.max(0, year - 1995 - educ + 18 + Math.floor(rndPanel() * 5));
      
      // Training (treatment/policy)
      const policy_index = 0.2 + rndPanel() * 0.8 + (t / 40);
      const training = rndPanel() < (0.1 + policy_index * 0.4) ? 1 : 0;
      
      // Structural Wage Equation
      // wage = f(educ, exper, training, female, ability, shock)
      const log_wage = 1.5 + 
                 (0.08 * educ) + 
                 (0.03 * exper) - (0.0005 * exper * exper) + 
                 (0.12 * training) - 
                 (0.15 * female) + 
                 (0.2 * ability) + 
                 (0.02 * gdp_growth) +
                 (rndPanel() * 0.1);
      
      const wage = Math.exp(log_wage);
      
      // Probability Model (Employment)
      const employment_latent = -1 + (0.1 * educ) + (0.05 * exper) - (0.2 * female) + (0.5 * training) - (0.1 * unemployment) + (rndPanel() * 2);
      const employment = employment_latent > 0.5 ? 1 : 0;
      
      const shock_index = rndPanel() * 10;

      data.push({
        entity_id,
        entity_name: entity,
        year,
        wage,
        educ,
        exper,
        female,
        urban,
        ability_proxy: ability + (rndPanel() * 0.5), // ability with measurement error
        training,
        distance_to_college,
        employment,
        gdp_growth,
        inflation,
        unemployment,
        policy_index,
        shock_index
      });
    }
  }

  return data;
}

export function generateCardKruegerDiD() {
  const data = [];
  // NJ is treated=1, PA is treated=0
  
  // NJ (treated): 20 observations (10 pre, 10 post)
  for (let i = 0; i < 20; i++) {
    const time = i < 10 ? 0 : 1; // 0 = before wage hike, 1 = after wage hike
    const treated = 1;
    const wage = time === 0 
      ? 4.25 + rndWages() * 0.2
      : 5.05 + rndWages() * 0.3;
    const baseEmp = 20 + rndWages() * 4;
    const employment = time === 0 
      ? Math.round(baseEmp + (rndWages() * 2 - 1))
      : Math.round(baseEmp + 1.2 + (rndWages() * 2 - 1));
      
    data.push({
      state: 'NJ',
      time,
      employment,
      wage: parseFloat(wage.toFixed(2)),
      treated
    });
  }
  
  // PA (control): 20 observations (10 pre, 10 post)
  for (let i = 0; i < 20; i++) {
    const time = i < 10 ? 0 : 1;
    const treated = 0;
    const wage = time === 0 
      ? 4.25 + rndWages() * 0.15
      : 4.30 + rndWages() * 0.2;
    const baseEmp = 22 + rndWages() * 5;
    const employment = time === 0 
      ? Math.round(baseEmp + (rndWages() * 2 - 1))
      : Math.round(baseEmp - 1.5 + (rndWages() * 2 - 1));
      
    data.push({
      state: 'PA',
      time,
      employment,
      wage: parseFloat(wage.toFixed(2)),
      treated
    });
  }
  
  return data;
}

export function generateMincerianWages() {
  const data = [];
  for (let i = 0; i < 100; i++) {
    const education = 8 + Math.floor(rndWages() * 11); // 8 to 18 years
    const female = rndWages() > 0.5 ? 1 : 0;
    const urban = rndWages() > 0.3 ? 1 : 0;
    const age = 22 + Math.floor(rndWages() * 43); // 22 to 65
    const experience = Math.max(0, age - education - 6);
    
    const log_wage = 1.8 + 
               (0.095 * education) + 
               (0.04 * experience) - (0.0006 * experience * experience) - 
               (0.18 * female) + 
               (0.15 * urban) + 
               (rndWages() * 0.25 - 0.125);
               
    const wage = parseFloat(Math.exp(log_wage).toFixed(2));
    data.push({
      wage,
      education,
      experience,
      female,
      urban
    });
  }
  return data;
}

export function generateBinaryHealthOutcome() {
  const data = [];
  for (let i = 0; i < 80; i++) {
    const age = 18 + Math.floor(rndCross() * 65); // 18 to 82
    const income = parseFloat((20 + rndCross() * 100 + (age > 40 ? 15 : 0)).toFixed(2));
    const employed = rndCross() < (income > 40 ? 0.9 : 0.6) ? 1 : 0;
    const chronic = rndCross() > (age > 50 ? 0.4 : 0.8) ? 1 : 0;
    
    const z = -2.5 + (0.025 * income) + (0.02 * age) + (1.0 * employed) + (0.5 * chronic) + (rndCross() * 2 - 1);
    const insured = z > 0 ? 1 : 0;
    
    data.push({
      insured,
      income,
      age,
      employed,
      chronic
    });
  }
  return data;
}
