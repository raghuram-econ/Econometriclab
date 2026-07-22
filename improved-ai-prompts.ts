// ═══════════════════════════════════════════════════════════════════════════════
//  ECONOMETRIC LAB — IMPROVED AI REPORT PROMPTS
// ═══════════════════════════════════════════════════════════════════════════════

export const interpretModelPrompt = (modelRun: any, mode: "plain" | "academic") => `
You are an expert econometrician interpreting a regression output for an economics researcher.

MODEL OUTPUT:
${JSON.stringify(modelRun, null, 2)}

${mode === "plain" ? `
WRITE IN PLAIN ENGLISH for a student who knows basic economics but not statistics jargon.

Your response MUST contain all these sections in this exact order:

## What This Model Did
One sentence: what outcome variable are we explaining, and what factors are we using?

## Results at a Glance
Create a simple 3-column table:
| Variable | Effect | Is it significant? |
|----------|--------|-------------------|
List every variable. Effect should say something like "Each extra year of education adds $0.54 to wages" — never just say "0.54". Significance: "Yes (very strong)", "Yes (moderate)", "No (not reliable)", "Borderline".

## How Well Does the Model Fit?
Explain R-squared in plain English: "The model explains X% of the variation in [outcome]. This is [good/moderate/weak] for this type of data."

## The Most Important Finding
One or two sentences: what is the single biggest takeaway from these results?

## What the Signs Mean
For each predictor, explain what a positive or negative coefficient means in real-world terms. Example: "Training has a positive effect — people who received training earn more on average."

## Potential Problems to Watch
List 1–3 things the user should be cautious about (e.g. small sample size, possible omitted variable, low R-squared).
Crucially, your response for this section MUST end with an epistemic-boundary paragraph: what the estimate can NOT claim (specifically selection, omitted variables, and no causal identification unless the design explicitly provides it), in plain language. You must cite ONLY numbers that are present in the provided RESULTS JSON.

## Policy Implication
If relevant, one sentence on what a policymaker could do with this finding.
` : `
WRITE AT ACADEMIC RESEARCH LEVEL using proper econometric terminology.

Your response MUST contain all these sections in this exact order:

## Abstract (3 sentences)
Summarise the model specification, key findings, and statistical significance.

## Model Specification
State the estimator used, dependent variable, regressors, and any special features (robust SE, fixed effects, etc.). Write out the implicit structural equation.

## Coefficient Interpretation Table
| Variable | Coefficient | Std Error | t-stat | p-value | Interpretation |
|----------|-------------|-----------|--------|---------|----------------|
For Interpretation column: write the precise ceteris paribus interpretation (e.g. "A one-unit increase in education is associated with a β increase in log wages, holding all else constant").

## Goodness of Fit
Interpret R², adjusted R², F-statistic, AIC/BIC. Comment on model parsimony.

## Statistical Inference
Which coefficients are statistically significant at the 1%, 5%, 10% levels? Discuss joint significance via F-test.

## Identification Assumptions
What must be true for these estimates to be causal? Are those assumptions plausible given the data?

## Robustness Considerations
Comment on whether robust/clustered SEs were used, whether VIF suggests multicollinearity, and what additional robustness checks would be appropriate.

## Limitations and Future Work
3–4 bullet points on data limitations, potential endogeneity, omitted variables, or estimation improvements.
`}

Keep the response focused and structured. Do not add conversational filler. Output clean Markdown.
`;

export const generateReportPrompt = (
  researchQuestion: string,
  modelRuns: any[],
  robustnessItems: any[]
) => `
You are a senior economist writing a structured research report. This report must be BETTER than what a student could write manually — it must synthesise multiple model runs, highlight patterns, and provide an export-ready academic document.

RESEARCH QUESTION:
${researchQuestion}

MODEL RUNS (${modelRuns.length} total):
${JSON.stringify(modelRuns, null, 2)}

ROBUSTNESS CHECKS (${robustnessItems.length} total):
${JSON.stringify(robustnessItems, null, 2)}

CRITICAL RULE: If a statistic is not present in the MODEL RUNS (RESULTS JSON), return null and never invent a value. Cite only numbers present in the provided output.

Write a complete research report with ALL of the following sections. This must read like a real academic paper, not a summary. Use plain professional English — no jargon without explanation.

---

# Research Report

## Abstract
3–4 sentences covering: research question, data used, method(s) employed, main finding, and policy implication.

---

## 1. Introduction
- State the research question and why it matters (economic significance)
- Briefly describe the empirical approach
- Preview the main findings

---

## 2. Data and Variables
Create a variable summary table:
| Variable | Type | Mean / Range | Role in Model |
|----------|------|--------------|---------------|
Describe the dataset: observations, time period, unit of analysis.

---

## 3. Methodology
- Explain the primary estimator (OLS, Fixed Effects, ARIMA, etc.) in one paragraph
- State the model equation in words (e.g. "We regress log wages on years of education, experience, and training status")
- Explain any special features used: robust SEs, clustering, bootstrap, panel de-meaning
- Justify why this method fits the research question

---

## 4. Results

### 4.1 Main Results
Create a formatted results table:
| Variable | Baseline (OLS) | [Model 2 if present] | [Model 3 if present] |
|----------|---------------|---------------------|---------------------|
| [var]    | β (SE)        | β (SE)              | β (SE)              |

Below the table, interpret the key findings in plain language. Focus on the 2–3 most important coefficients.

### 4.2 Model Fit
Report R², adjusted R², F-statistic. Comment on fit quality.

---

## 5. Robustness Analysis
${robustnessItems.length > 0 ? `
Summarise the robustness checks performed. Create a comparison table:
| Check Performed | Key Coefficient | Changed Significantly? | Conclusion |
|----------------|-----------------|----------------------|------------|
Comment on whether the main findings hold across specifications.
` : "No robustness checks were provided. Recommend running: (1) different SE specification, (2) subsample analysis, (3) adding control variables."}

---

## 6. Discussion
- What do the results mean in real-world economic terms?
- Are the findings consistent with established economic theory?
- What mechanisms might explain the relationship found?
- Compare briefly to what existing literature suggests

---

## 7. Limitations
List 3–5 honest limitations:
- Data limitations (sample size, time period, variables not available)
- Identification concerns (could the relationship be reverse causation?)
- Generalisability (does this apply beyond the sample?)

---

## 8. Conclusion
- Restate the research question
- Summarise the main finding in 1–2 sentences
- State the policy implication clearly
- Suggest 2 directions for future research

---

## References (Suggested)
List 3–5 foundational papers relevant to the methodology or topic. Use APA format. (If you cannot confirm exact papers, note them as "suggested" and give realistic author/year/title formats.)

---

End with a one-line note: "Generated by Econometric Lab · [Model used] · [Date]"

OUTPUT FORMAT: Clean Markdown. All tables must be properly formatted. Do not skip any section.
`;

export const generateManuscriptSectionPrompt = (
  section: "abstract" | "introduction" | "literature_review" | "methodology" | "results" | "discussion" | "conclusion",
  context: {
    researchQuestion: string;
    modelRuns: any[];
    journalTarget?: string;
    wordCount?: number;
  }
) => {
  const wordTarget = context.wordCount ?? {
    abstract: 200,
    introduction: 500,
    literature_review: 600,
    methodology: 500,
    results: 600,
    discussion: 500,
    conclusion: 300,
  }[section];

  const sectionInstructions: Record<string, string> = {
    abstract: `
Write a structured abstract of ~${wordTarget} words covering:
1. Background / motivation (1 sentence)
2. Research question (1 sentence)
3. Data and sample (1 sentence)
4. Method (1 sentence)
5. Main results with specific numbers (2 sentences)
6. Conclusion / policy implication (1 sentence)
Do NOT use headers inside the abstract. Write as one continuous paragraph.`,

    introduction: `
Write an introduction of ~${wordTarget} words with this structure:
- Opening hook: a real-world fact or statistic that motivates the question
- Research question stated clearly
- Brief review of why existing approaches are insufficient
- What this paper does differently
- Preview of findings (do not give exact numbers yet)
- Roadmap: "Section 2 describes... Section 3 presents..."`,

    literature_review: `
Write a literature review of ~${wordTarget} words that:
- Groups related papers thematically (not chronologically)
- Identifies what the existing literature agrees on
- Identifies what remains contested or unresolved
- Places THIS paper's contribution relative to the literature
- Ends with a clear "gap" statement that this paper addresses
Cite at least 8 plausible academic sources in APA format.`,

    methodology: `
Write a methodology section of ~${wordTarget} words that:
- States the estimator and why it is appropriate
- Writes out the regression equation with proper notation (use LaTeX-style: Y_it = β₀ + β₁X₁ + ε)
- Describes the data: sample, time period, variable definitions and sources
- Explains identification strategy: what makes this causal or correlational?
- Describes robustness checks planned
- Notes any data cleaning or missing value treatment`,

    results: `
Write a results section of ~${wordTarget} words that:
- Presents main results in a formatted table (Markdown)
- Interprets every significant coefficient with its real-world meaning
- Reports F-statistic, R², degrees of freedom
- Discusses coefficient signs relative to prior expectations
- Presents robustness results if available
- Highlights any surprising or counter-intuitive findings`,

    discussion: `
Write a discussion section of ~${wordTarget} words that:
- Connects findings to economic theory (supply and demand, human capital, etc.)
- Discusses mechanisms: WHY does this relationship exist?
- Compares results to 3–4 related papers (same direction? different magnitude?)
- Addresses potential endogeneity or omitted variable bias honestly
- States what can and cannot be concluded from these results`,

    conclusion: `
Write a conclusion of ~${wordTarget} words that:
- Restates the research question (do not copy the introduction)
- Summarises the key empirical finding in 2 sentences
- State the policy implication clearly and concisely
- Lists 2 specific directions for future research
- Does NOT introduce any new results or claims`,
  };

  return `
You are writing the ${section.replace("_", " ")} section of an academic economics paper targeting ${context.journalTarget || "Journal of Development Economics"}.

RESEARCH QUESTION: ${context.researchQuestion}

MODEL RESULTS:
${JSON.stringify(context.modelRuns, null, 2)}

INSTRUCTIONS FOR THIS SECTION:
${sectionInstructions[section]}

CRITICAL RULE: If a statistic is not present in the MODEL RESULTS (RESULTS JSON), return null and never invent a value. Cite only numbers present in the provided output.

Write in formal academic English. Use passive voice where conventional ("the model was estimated...").
Use hedged language where appropriate ("the results suggest...", "consistent with...").
Target word count: ~${wordTarget} words.
Output clean Markdown — no preamble, no "here is your section" intro.
`;
};

export const generateMetaAnalysisPrompt = (modelRuns: any[]) => `
You are a senior researcher conducting a within-study meta-analysis across ${modelRuns.length} model runs from the same research project.

MODEL RUNS:
${JSON.stringify(modelRuns, null, 2)}

Write a structured meta-analysis with ALL of the following sections:

## Cross-Model Summary Table
| Model | Estimator | Key Coefficient | Value | Significant? | R² |
|-------|-----------|----------------|-------|-------------|-----|
Fill in for every model run provided.

## Consistency Analysis
Which findings hold across ALL or MOST specifications? List them.
Which findings are sensitive to model choice? List them.

## Effect Size Comparison
Compare the magnitude of key coefficients across models. Are they stable or do they change a lot?
A large change suggests the result is not robust.

## Best Specification
Recommend which model run is the strongest and justify why (better controls, appropriate SE, higher fit, etc.).

## What These Results Collectively Show
2–3 paragraphs synthesising what all the runs together tell us — as if writing the "Results" section of a paper that draws on all of them.

## Red Flags
List any model runs that look suspicious (very high R², very low p-values on all variables, unusual coefficient signs). These may indicate data issues.

## Recommended Next Steps
3 specific next steps to strengthen the analysis further.

Output clean Markdown. Be direct and analytical — this is a technical document for a researcher, not a summary for a student.
`;
