
export interface Concept {
  id: string;
  title: string;
  category: 'Core Regression' | 'Causal Inference' | 'Panel Data' | 'Time Series' | 'Limited Dependent Variables';
  plainExplanation: string;
  formalMeaning: string;
  whyItMatters: string;
  whereItAppears: string;
  commonMistake: string;
  whatToTryNext: string;
}

export const CONCEPTS: Concept[] = [
  // 1. Core Regression
  {
    id: 'ols_assumptions',
    title: 'OLS Assumptions',
    category: 'Core Regression',
    plainExplanation: 'The "rules of the road" that ensure your regression isn\'t lying to you.',
    formalMeaning: 'Exogeneity (E[u|X]=0), Homoskedasticity (Var[u|X]=σ²), No Autocorrelation, and No Perfect Multicollinearity.',
    whyItMatters: 'Without these, OLS estimates can be biased, inconsistent, or have incorrect standard errors.',
    whereItAppears: 'OLS Lab, Diagnostics Center, Mistake Detector.',
    commonMistake: 'Focusing on R-squared while ignoring residual patterns that signal assumption violations.',
    whatToTryNext: 'Run a residual plot in Diagnostics to check for heteroskedasticity.'
  },
  {
    id: 'gauss_markov',
    title: 'Gauss-Markov Theorem',
    category: 'Core Regression',
    plainExplanation: 'A mathematical proof that OLS is the "best" available linear tool if assumptions hold.',
    formalMeaning: 'Under the first five Gauss-Markov assumptions, OLS is the Best Linear Unbiased Estimator (BLUE).',
    whyItMatters: 'It gives researchers confidence that they are getting the most efficient use of their data.',
    whereItAppears: 'OLS Lab Theory Section.',
    commonMistake: 'Thinking "best" means it\'s the best possible model overall; it is only the best *linear* unbiased estimator.',
    whatToTryNext: 'Compare OLS results with and without robust standard errors.'
  },
  {
    id: 'ovb',
    title: 'Omitted Variable Bias (OVB)',
    category: 'Core Regression',
    plainExplanation: 'The bias that occurs when you leave out an important variable that is related to your main variable.',
    formalMeaning: 'Bias = β_omitted * corr(X_included, X_omitted). It occurs when a determinant of Y is correlated with a regressor.',
    whyItMatters: 'It is the most common reason why social science regressions produce misleading causal clips.',
    whereItAppears: 'Diagnostics Center (OVB Audit), OLS Lab.',
    commonMistake: 'Assuming that adding *any* control variable helps (some controls can actually introduce bias).',
    whatToTryNext: 'Check the correlation matrix in Data Lab to identify potential omitted variables.'
  },
  {
    id: 'multicollinearity',
    title: 'Multicollinearity',
    category: 'Core Regression',
    plainExplanation: 'When your independent variables are too similar to each other, confusing the model.',
    formalMeaning: 'A high degree of linear correlation between two or more independent variables.',
    whyItMatters: 'It inflates standard errors, making variables appear statistically insignificant even if they aren\'t.',
    whereItAppears: 'Diagnostics Center (VIF calculation).',
    commonMistake: 'Dropping variables automatically just because they are correlated (this can cause OVB!).',
    whatToTryNext: 'Calculate Variance Inflation Factors (VIF) in the Diagnostics Center.'
  },
  {
    id: 'heteroskedasticity',
    title: 'Heteroskedasticity',
    category: 'Core Regression',
    plainExplanation: 'When the "noise" or uncertainty in your data isn\'t constant across different values.',
    formalMeaning: 'Conditional variance of the error term is not constant: Var[u|X] ≠ σ².',
    whyItMatters: 'It makes your t-statistics and p-values unreliable, leading to wrong conclusions about significance.',
    whereItAppears: 'Diagnostics Center (Goldfeld-Quandt or Breusch-Pagan concepts).',
    commonMistake: 'Thinking it biases the coefficients (it only biases the standard errors).',
    whatToTryNext: 'Use "Robust Standard Errors" in the Robustness Vault.'
  },

  // 2. Causal Inference
  {
    id: 'endogeneity',
    title: 'Endogeneity',
    category: 'Causal Inference',
    plainExplanation: 'When your independent variable is correlated with the hidden "noise" in the model.',
    formalMeaning: 'Cov(X, u) ≠ 0. Often caused by OVB, measurement error, or simultaneity.',
    whyItMatters: 'Endogeneity destroys the causal interpretation of a regression coefficient.',
    whereItAppears: 'Causal Inference Lab, Diagnostics Center.',
    commonMistake: 'Treating correlation as causation without checking for endogeneity.',
    whatToTryNext: 'Switch to the Causal Inference Lab to explore Instrumental Variables.'
  },
  {
    id: 'instrumental_variables',
    title: 'Instrumental Variables (IV)',
    category: 'Causal Inference',
    plainExplanation: 'A "third-party" variable used to isolate the part of X that is truly independent of the error.',
    formalMeaning: 'An estimation method using a variable (Z) that affects X but has no direct effect on Y.',
    whyItMatters: 'It allows us to estimate causal effects even when endogeneity is present.',
    whereItAppears: 'Causal Inference Lab (IV/2SLS).',
    commonMistake: 'Using a "weak instrument" that isn\'t strongly related to X.',
    whatToTryNext: 'Test for instrument relevance (First-stage F-stat) in the Causal Lab.'
  },
  {
    id: 'exclusion_restriction',
    title: 'Exclusion Restriction',
    category: 'Causal Inference',
    plainExplanation: 'The vital rule that your instrument must only affect Y through X, nowhere else.',
    formalMeaning: 'The instrument Z must be uncorrelated with the error term u: Cov(Z, u) = 0.',
    whyItMatters: 'If this is violated, the IV estimate is just as biased (or more biased) than OLS.',
    whereItAppears: 'Causal Inference Lab (Critical Assumptions).',
    commonMistake: 'Thinking you can "prove" this restriction statistically (usually, you need a strong story/theory).',
    whatToTryNext: 'Review the theoretical justification for your instrument choice.'
  },

  // 3. Panel Data
  {
    id: 'fixed_effects',
    title: 'Fixed Effects',
    category: 'Panel Data',
    plainExplanation: 'Controlling for everything that doesn\'t change over time for an entity (like personality or culture).',
    formalMeaning: 'Removing unobserved time-invariant heterogeneity by subtracting entity-level means.',
    whyItMatters: 'It solves OVB for any variable that stays constant over time for a given group.',
    whereItAppears: 'Fixed Effects Lab.',
    commonMistake: 'Forgetting that Fixed Effects cannot estimate the impact of variables that don\'t change over time.',
    whatToTryNext: 'Compare Pooled OLS vs Fixed Effects in the panel module.'
  },
  {
    id: 'unobserved_heterogeneity',
    title: 'Unobserved Heterogeneity',
    category: 'Panel Data',
    plainExplanation: 'The "hidden features" of individuals or firms that we can\'t measure but affect the outcome.',
    formalMeaning: 'The entity-specific error component (α_i) that is lumped into the regression error.',
    whyItMatters: 'If these hidden features are related to our X, our OLS results are biased.',
    whereItAppears: 'Fixed Effects Lab, Diagnostics Center.',
    commonMistake: 'Assuming your data is "Clean" because you have many observations; large samples don\'t fix hidden bias.',
    whatToTryNext: 'Use a "Within-Transformation" to scrub out these unobserved factors.'
  },

  // 4. Time Series
  {
    id: 'stationarity',
    title: 'Stationarity',
    category: 'Time Series',
    plainExplanation: 'The statistical property where a variable\'s mean and variance don\'t drift over time.',
    formalMeaning: 'A stochastic process is stationary if its joint distribution does not change when shifted in time.',
    whyItMatters: 'Non-stationary data can lead to "spurious regressions" where variables seem related just because they both trend up.',
    whereItAppears: 'ARIMA Forecast Lab.',
    commonMistake: 'Regressing a trending variable on another trending variable without "differencing" first.',
    whatToTryNext: 'Apply a "First Difference" to your data in the ARIMA lab.'
  },
  {
    id: 'arima_models',
    title: 'ARIMA (p, d, q)',
    category: 'Time Series',
    plainExplanation: 'A sophisticated way to predict future values based on past values and past errors.',
    formalMeaning: 'Auto-Regressive Integrated Moving Average model.',
    whyItMatters: 'It is the workhorse for univariate (single variable) forecasting.',
    whereItAppears: 'ARIMA Forecast Lab.',
    commonMistake: 'Setting the "d" parameter (integration) too high or too low.',
    whatToTryNext: 'Check the ACF/PACF plots to identify the correct p and q lags.'
  },

  // 5. Limited Dependent Variables
  {
    id: 'logit_probit',
    title: 'Logit & Probit',
    category: 'Limited Dependent Variables',
    plainExplanation: 'Special models for when your dependent variable is binary (e.g., Yes/No, Employed/Unemployed).',
    formalMeaning: 'Models using the logistic or normal cumulative distribution function to map X to probabilities [0,1].',
    whyItMatters: 'Standard OLS (Linear Probability Model) can predict probabilities less than 0 or greater than 1.',
    whereItAppears: 'Probability Models Lab.',
    commonMistake: 'Interpreting the coefficients directly as marginal effects (they are actually odds-ratios or latent effects).',
    whatToTryNext: 'Look at the "Marginal Effects" output to see the change in probability.'
  }
];
