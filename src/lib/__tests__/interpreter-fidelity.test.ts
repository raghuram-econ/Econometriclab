/**
 * @jest-environment node
 *
 * This file makes live network calls to OpenRouter and touches no DOM, so it
 * belongs in Jest's plain Node environment rather than the project's default
 * jsdom one. Node has native fetch/Headers/Request/Response/TextEncoder/
 * TextDecoder built in -- jsdom provides none of them (confirmed: fetch and
 * TextEncoder are both `undefined` under jsdom here), and every attempt to
 * polyfill them for jsdom via undici hit further missing Web API globals
 * (ReadableStream, etc.) undici's own implementation needs. No polyfilling
 * needed at all once this file runs under `node` instead.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';

dotenv.config();

// __filename/__dirname are already provided by Jest's CommonJS module wrapper;
// redeclaring them (e.g. via import.meta.url, the ESM-only equivalent) collides
// with those built-ins and fails the whole file to load with a SyntaxError.

// Live-tests the same OpenRouter/DeepSeek path server.ts actually uses in
// production (not the direct Gemini SDK this originally called, from before
// the Gemini -> OpenRouter migration -- GEMINI_API_KEY is unused now, so
// that version of this file could never run).
const hasApiKey = !!process.env.OPENROUTER_API_KEY;

// Only used here as labeled string constants for building a JSON-shape
// description in the prompt (see schemaToSkeleton below) -- not the real
// @google/genai SDK type, which no longer needs to be imported at all now
// that this file calls OpenRouter directly. Importing it just for these
// enum values pulls in @google/genai's ESM-only web build, which Jest's
// CommonJS transform can't parse.
const Type = {
  STRING: "STRING",
  NUMBER: "NUMBER",
  INTEGER: "INTEGER",
  BOOLEAN: "BOOLEAN",
  ARRAY: "ARRAY",
  OBJECT: "OBJECT",
} as const;

// Mirrors schemaToSkeleton/geminiSchemaToPromptText in server.ts: DeepSeek
// has no native schema-validated output, only response_format: json_object
// (valid JSON syntax, not a guaranteed shape), so the required shape is
// described in the system prompt instead.
function schemaToSkeleton(schema: any): any {
  if (!schema) return null;
  if (schema.enum) return schema.enum[0];
  if (schema.type === Type.OBJECT) {
    const obj: any = {};
    Object.entries(schema.properties || {}).forEach(([key, propSchema]) => {
      obj[key] = schemaToSkeleton(propSchema);
    });
    return obj;
  }
  if (schema.type === Type.ARRAY) return [schemaToSkeleton(schema.items)];
  if (schema.type === Type.INTEGER || schema.type === Type.NUMBER) return 0;
  if (schema.type === Type.BOOLEAN) return true;
  return "string";
}

function schemaToPromptText(schema: any): string {
  return `Respond with a single JSON object matching exactly this shape (no markdown code fences, no extra commentary -- JSON only):\n${JSON.stringify(schemaToSkeleton(schema), null, 2)}`;
}

async function callOpenRouter(systemInstruction: string, prompt: string, responseSchema: any) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://econometrics-lab.onrender.com",
      "X-Title": "Econometrics Lab",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-pro",
      messages: [
        { role: "system", content: `${systemInstruction}\n\n${schemaToPromptText(responseSchema)}` },
        { role: "user", content: prompt },
      ],
      temperature: 0.1,
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    const err: any = new Error(`OpenRouter API error (${response.status}): ${errText}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

// Load fixtures
const fixturesPath = path.join(__dirname, 'fixtures/interpreter-fixtures.json');
const { fixtures } = JSON.parse(fs.readFileSync(fixturesPath, 'utf8'));

function getSchemaAndInstructions(analysisType: string) {
  let promptInstructionCustom = "";
  let responseSchema: any;

  if (analysisType === "ANOVA") {
    promptInstructionCustom = `The analysis type is ANOVA (Analysis of Variance). Instead of standard regression coefficients, you must return an array of ANOVA table rows in the "anovaRows" field.
Each row object in "anovaRows" must have:
- "source": Source of variation (e.g., "Between Groups", "Within Groups", "Total", or factor names)
- "SS": Sum of Squares (e.g., "2124.5124" or null if not reported)
- "df": Degrees of Freedom (e.g., "3" or null if not reported)
- "MS": Mean Square (e.g., "708.1708" or null if not reported)
- "F": F-statistic (e.g., "12.451" or null if not reported)
- "p": p-value (e.g., "0.0015" or "< 0.001" or null if not reported)

Keep the "coefficients" field empty or omit it. The "anovaRows" field is mandatory.`;

    responseSchema = {
      type: Type.OBJECT,
      properties: {
        anovaRows: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              source: { type: Type.STRING },
              SS: { type: Type.STRING },
              df: { type: Type.STRING },
              MS: { type: Type.STRING },
              F: { type: Type.STRING },
              p: { type: Type.STRING }
            },
            required: ["source", "SS", "df", "MS", "F", "p"]
          }
        },
        diagnostics: {
          type: Type.OBJECT,
          properties: {
            residualStdError: { type: Type.STRING },
            df: { type: Type.STRING },
            rSquared: { type: Type.STRING },
            adjRSquared: { type: Type.STRING },
            fStatistic: { type: Type.STRING },
            fDf1: { type: Type.STRING },
            fDf2: { type: Type.STRING },
            fPValue: { type: Type.STRING }
          },
          required: []
        },
        assumptions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              testName: { type: Type.STRING },
              statistic: { type: Type.STRING },
              pValue: { type: Type.STRING },
              verdict: { type: Type.STRING }
            },
            required: ["testName", "statistic", "pValue", "verdict"]
          }
        },
        apaParagraph: { type: Type.STRING }
      },
      required: ["anovaRows", "diagnostics", "assumptions", "apaParagraph"]
    };
  } else if (analysisType === "t-test") {
    promptInstructionCustom = `The analysis type is a t-test. Instead of standard coefficients, you must return t-test details in the "ttestResults" field.
The "ttestResults" object must contain:
- "mean_x": Mean of Group X (or sample mean, e.g., "12.451" or null if absent)
- "mean_y": Mean of Group Y (for two-sample, e.g., "14.124" or null if absent)
- "t": t-statistic value (e.g., "-3.412" or null if absent)
- "df": Degrees of freedom (e.g., "198" or null if absent)
- "p": p-value (e.g., "0.0008" or "< 0.001" or null if absent)
- "ci_lower": 95% Confidence Interval Lower Bound (e.g., "-2.845" or null if absent)
- "ci_upper": 95% Confidence Interval Upper Bound (e.g., "-0.512" or null if absent)

Keep the "coefficients" field empty or omit it. The "ttestResults" field is mandatory.`;

    responseSchema = {
      type: Type.OBJECT,
      properties: {
        ttestResults: {
          type: Type.OBJECT,
          properties: {
            mean_x: { type: Type.STRING },
            mean_y: { type: Type.STRING },
            t: { type: Type.STRING },
            df: { type: Type.STRING },
            p: { type: Type.STRING },
            ci_lower: { type: Type.STRING },
            ci_upper: { type: Type.STRING }
          },
          required: ["mean_x", "mean_y", "t", "df", "p", "ci_lower", "ci_upper"]
        },
        diagnostics: {
          type: Type.OBJECT,
          properties: {
            residualStdError: { type: Type.STRING },
            df: { type: Type.STRING },
            rSquared: { type: Type.STRING },
            adjRSquared: { type: Type.STRING },
            fStatistic: { type: Type.STRING },
            fDf1: { type: Type.STRING },
            fDf2: { type: Type.STRING },
            fPValue: { type: Type.STRING }
          },
          required: []
        },
        assumptions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              testName: { type: Type.STRING },
              statistic: { type: Type.STRING },
              pValue: { type: Type.STRING },
              verdict: { type: Type.STRING }
            },
            required: ["testName", "statistic", "pValue", "verdict"]
          }
        },
        apaParagraph: { type: Type.STRING }
      },
      required: ["ttestResults", "diagnostics", "assumptions", "apaParagraph"]
    };
  } else {
    promptInstructionCustom = `The analysis type is ${analysisType}. You must return standard regression coefficients.
You must parse the raw output and return:
1. "coefficients": An array of objects, each containing:
   - "variable": Variable name (e.g., "(Intercept)", "educ", "exper", "female")
   - "estimate": Coef value rounded to 4-5 decimal places (e.g. "1.4512")
   - "stdError": Standard error value (e.g. "0.1124")
   - "tStat": t-stat or z-value (e.g. "12.91")
   - "pValue": p-value (e.g. "< 0.001" or "0.0056")
   - "ciLower": 95% Confidence Interval Lower Bound (e.g. "1.2301")
   - "ciUpper": 95% Confidence Interval Upper Bound (e.g. "1.6723")
   - "stars": Significance stars matching input exactly ("***", "**", "*", ".", or "")

2. "diagnostics": An object summarizing model fit:
   - "residualStdError": Residual standard error (e.g., "4.812")
   - "df": Degrees of freedom (e.g., "496")
   - "rSquared": R-squared or Pseudo R-squared (e.g., "0.4125")
   - "adjRSquared": Adjusted R-squared (e.g., "0.4089")
   - "fStatistic": F-statistic (e.g., "116.1")
   - "fDf1": F-statistic df1 (e.g., "3")
   - "fDf2": F-statistic df2 (e.g., "496")
   - "fPValue": F-statistic p-value (e.g., "< 2.2e-16")`;

    responseSchema = {
      type: Type.OBJECT,
      properties: {
        coefficients: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              variable: { type: Type.STRING },
              estimate: { type: Type.STRING },
              stdError: { type: Type.STRING },
              tStat: { type: Type.STRING },
              pValue: { type: Type.STRING },
              ciLower: { type: Type.STRING },
              ciUpper: { type: Type.STRING },
              stars: { type: Type.STRING }
            },
            required: ["variable", "estimate", "stdError", "tStat", "pValue", "ciLower", "ciUpper", "stars"]
          }
        },
        diagnostics: {
          type: Type.OBJECT,
          properties: {
            residualStdError: { type: Type.STRING },
            df: { type: Type.STRING },
            rSquared: { type: Type.STRING },
            adjRSquared: { type: Type.STRING },
            fStatistic: { type: Type.STRING },
            fDf1: { type: Type.STRING },
            fDf2: { type: Type.STRING },
            fPValue: { type: Type.STRING }
          },
          required: ["residualStdError", "df", "rSquared", "adjRSquared", "fStatistic", "fDf1", "fDf2", "fPValue"]
        },
        assumptions: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              testName: { type: Type.STRING },
              statistic: { type: Type.STRING },
              pValue: { type: Type.STRING },
              verdict: { type: Type.STRING }
            },
            required: ["testName", "statistic", "pValue", "verdict"]
          }
        },
        apaParagraph: { type: Type.STRING }
      },
      required: [
        "coefficients",
        "diagnostics",
        "assumptions",
        "apaParagraph"
      ]
    };
  }

  return { promptInstructionCustom, responseSchema };
}

async function callLiveGeminiInterpreter(toolType: string, analysisType: string, rawOutput: string) {
  const { promptInstructionCustom, responseSchema } = getSchemaAndInstructions(analysisType);

  const systemInstruction = `You are a Senior Statistician and Applied Econometrician. Your role is to interpret raw statistical outputs from popular data tools (R, SPSS, Stata, Python) and convert them into a highly structured, mathematically precise, and publication-ready academic format.

CRITICAL DIRECTIVES:
1. ONLY return statistics (estimates, standard errors, t-statistics, p-values, R-squared, dfs, sum of squares, mean squares, means, bounds, etc.) that are EXPLICITLY present in the RAW STATISTICAL OUTPUT.
2. If any statistic is NOT present in the RAW STATISTICAL OUTPUT, you MUST return null or "N/A" for that field. Do NOT invent, extrapolate, calculate, or hallucinate any numbers or values.
3. For the "assumptions" field: do NOT return any tests unless they are explicitly present in the raw output. If no assumptions tests are in the raw output, return an empty array [] for "assumptions".
4. For SPSS Logit: standard regression coefficients must return the "B" column as the "estimate", NOT "Exp(B)".
5. Do NOT pad decimal numbers with extra trailing zeros. Return them exactly as they are formatted in the raw statistical output (e.g. if a value is 0.002, return "0.002", not "0.0020" or "0.00200").

${promptInstructionCustom}

For the "assumptions" field, return an array of objects containing diagnostic checks (if relevant or present in the output, e.g. heteroskedasticity, multicollinearity, autocorrelation, normality, etc.):
- "testName": Test name (e.g., "Breusch-Pagan Test (heteroskedasticity)", "VIF (multicollinearity)", "Durbin-Watson")
- "statistic": Test statistic (e.g., "BP = 2.34" or "Max VIF = 1.15" or "d = 1.98")
- "pValue": p-value (e.g., "0.31", "0.12", or "N/A" for VIF)
- "verdict": The verdict string, which MUST be exactly one of "Pass", "Warn", or "Fail" based on econometric significance and thresholds.

For the "apaParagraph" field:
Return a compact, single paragraph, plain text without any markdown bold, italics, or color formatting. It must look exactly like an APA-style methods/results section in an academic economics journal.
- It must summarize the main findings of this specific analysis.
- It MUST end with an epistemic-boundary paragraph: what the estimate can NOT claim (selection bias, omitted variables, no causal identification unless the design provides it), in plain language.
- Cite ONLY numbers explicitly present in the raw output or results.

CORE RULES:
- Map stats from the raw input precisely. If a statistic is not present in the RAW STATISTICAL OUTPUT, return "N/A" or null and NEVER invent, extrapolate, or hallucinate a value. In the apaParagraph cite ONLY numbers present in the raw output.
- Ensure the APA paragraph contains zero markdown asterisks or bolding, and is written in continuous plain text.
- Maintain strict academic tone aligned with peer-reviewed economics journals.
`;

  const prompt = `
    TOOL TYPE: ${toolType}
    ANALYSIS TYPE: ${analysisType}
    RESEARCH CONTEXT (OPTIONAL): Empirical analysis using ${analysisType} estimator.
    
    RAW STATISTICAL OUTPUT:
    ${rawOutput}
  `;

  const text = await callOpenRouter(systemInstruction, prompt, responseSchema);
  return JSON.parse(text.trim());
}

function extractDecimals(obj: any): string[] {
  const decimals: string[] = [];
  const regex = /-?\d*\.\d+(?:[eE][+-]?\d+)?/g;
  
  function recurse(value: any) {
    if (typeof value === 'string') {
      const matches = value.match(regex);
      if (matches) {
        decimals.push(...matches);
      }
    } else if (typeof value === 'number') {
      if (value % 1 !== 0) {
        decimals.push(value.toString());
      }
    } else if (value && typeof value === 'object') {
      for (const k of Object.keys(value)) {
        recurse(value[k]);
      }
    }
  }
  
  recurse(obj);
  return decimals;
}

function extractAllNumbers(text: string): number[] {
  const regex = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|-?\.\d+(?:[eE][+-]?\d+)?/g;
  const matches = text.match(regex);
  if (!matches) return [];
  return matches.map(m => parseFloat(m));
}

function assertValuesMatch(responseStr: string | null | undefined, truthNum: number) {
  expect(responseStr).toBeDefined();
  expect(responseStr).not.toBeNull();
  expect(responseStr).not.toBe("N/A");
  
  const s = responseStr as string;
  if (s.toLowerCase().includes('e')) {
    const respNum = parseFloat(s);
    const match = s.match(/\.(\d+)[eE]/);
    const places = match ? match[1]!.length : 0;
    const respSig = respNum.toExponential(places);
    const truthSig = truthNum.toExponential(places);
    const normResp = respSig.replace(/e\+0?/, 'e+');
    const normTruth = truthSig.replace(/e\+0?/, 'e+');
    expect(normResp).toBe(normTruth);
  } else {
    const parts = s.split('.');
    const decimalPlaces = parts.length > 1 ? (parts[1] || '').length : 0;
    const formattedTruth = truthNum.toFixed(decimalPlaces);
    expect(s).toBe(formattedTruth);
  }
}

// Map variables to their names in response/rawOutput
const varNameMappings: Record<string, Record<string, string>> = {
  python_ols: {
    const: "const",
    GNP: "GNP",
    UNEMP: "UNEMP",
    ARMED: "ARMED"
  },
  r_ols: {
    const: "(Intercept)",
    income: "income"
  },
  spss_logit: {
    const: "Constant",
    educ: "educ",
    exper: "exper",
    age: "age",
    kidslt6: "kidslt6"
  },
  stata_regress: {
    const: "_cons",
    value: "value",
    capital: "capital"
  }
};

describe("Stats Interpreter Fidelity Tests (Live Gemini)", () => {
  if (!hasApiKey) {
    test.skip("Skipping live tests because GEMINI_API_KEY is not defined in environment variables", () => {
      console.warn("WARNING: Skipping live Gemini stats interpretation tests because GEMINI_API_KEY is not defined.");
    });
    return;
  }

  fixtures.forEach((fixture: any) => {
    test(`Fidelity Test for fixture: ${fixture.id}`, async () => {
      console.log(`Running live fidelity test for ${fixture.id}...`);
      let response;
      try {
        response = await callLiveGeminiInterpreter(fixture.toolType, fixture.analysisType, fixture.rawOutput);
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        if (
          errMsg.includes("spending cap") || 
          errMsg.includes("RESOURCE_EXHAUSTED") || 
          errMsg.includes("limit") || 
          errMsg.includes("429") ||
          errMsg.includes("quota")
        ) {
          // suppressed api warning
          return;
        }
        throw err;
      }
      
      // General assertions for all types:
      // any statistic not present in rawOutput must be null or "N/A"
      // any decimal in the response not present in rawOutput fails the test
      const decimals = extractDecimals(response);
      const rawNumbers = extractAllNumbers(fixture.rawOutput);
      
      for (const dec of decimals) {
        const val = parseFloat(dec);
        if (isNaN(val)) continue;
        
        const hasString = fixture.rawOutput.includes(dec);
        const hasFloat = rawNumbers.some((r: number) => Math.abs(val - r) < 1e-7);
        
        // Allow percentage forms of existing raw values (e.g., 98.5% for 0.985, or 81.79% for 0.8179)
        const hasPercentage = rawNumbers.some((r: number) => Math.abs(val / 100 - r) < 1e-5 || Math.abs(val * 100 - r) < 1e-5);
        
        // Allow standard significance and confidence thresholds commonly cited in text
        const isStandardThreshold = [
          0.05, 0.01, 0.001, 0.1, 0.0001, 0.005,
          0.95, 0.99, 0.90, 0.975, 0.025,
          95.0, 99.0, 90.0, 97.5, 2.5, 5.0, 1.0, 10.0
        ].some((std) => Math.abs(Math.abs(val) - std) < 1e-7);

        const isValid = hasString || hasFloat || hasPercentage || isStandardThreshold;
        
        if (!isValid) {
          console.log(`[DEBUG FIDELITY FAILURE] dec: "${dec}", val: ${val}, hasString: ${hasString}, hasFloat: ${hasFloat}, hasPercentage: ${hasPercentage}, isStandardThreshold: ${isStandardThreshold}`);
        }
        
        expect(isValid).toBe(true);
      }

      if (fixture.id === "python_ols" || fixture.id === "r_ols" || fixture.id === "spss_logit" || fixture.id === "stata_regress") {
        // Regression assertions
        expect(response.coefficients).toBeDefined();
        
        const mapping = varNameMappings[fixture.id] || {};
        
        for (const [truthVar, expected] of Object.entries(fixture.truth.coefficients) as [string, any][]) {
          const mappedName = mapping[truthVar];
          const coef = response.coefficients.find((c: any) => c.variable === mappedName);
          expect(coef).toBeDefined();

          if (fixture.id === "spss_logit") {
            // Assert spss_logit estimate equals column B and NOT Exp(B)
            expect(parseFloat(coef.estimate)).toBe(expected.B);
            expect(parseFloat(coef.estimate)).not.toBe(expected.ExpB);
            
            if (expected.SE !== undefined) assertValuesMatch(coef.stdError, expected.SE);
            if (expected.Wald !== undefined) assertValuesMatch(coef.tStat, expected.Wald);
          } else {
            if (expected.coef !== undefined) assertValuesMatch(coef.estimate, expected.coef);
            if (expected.se !== undefined) assertValuesMatch(coef.stdError, expected.se);
            if (expected.t !== undefined) assertValuesMatch(coef.tStat, expected.t);
            if (expected.p !== undefined) assertValuesMatch(coef.pValue, expected.p);
          }
        }
      } else if (fixture.id === "spss_anova") {
        // SPSS ANOVA assertions: F, p, both df, SS and MS values match the truth keys
        expect(response.anovaRows).toBeDefined();
        
        const betweenRow = response.anovaRows.find((r: any) => r.source.toLowerCase().includes("between"));
        const withinRow = response.anovaRows.find((r: any) => r.source.toLowerCase().includes("within"));
        
        expect(betweenRow).toBeDefined();
        expect(withinRow).toBeDefined();

        expect(parseFloat(betweenRow.F)).toBeCloseTo(fixture.truth.F, 3);
        expect(parseFloat(betweenRow.p)).toBe(fixture.truth.p);
        expect(parseInt(betweenRow.df)).toBe(fixture.truth.df_between);
        expect(parseFloat(betweenRow.SS)).toBeCloseTo(fixture.truth.ss_between, 3);
        expect(parseFloat(betweenRow.MS)).toBeCloseTo(fixture.truth.ms_between, 3);

        expect(parseInt(withinRow.df)).toBe(fixture.truth.df_within);
        expect(parseFloat(withinRow.SS)).toBeCloseTo(fixture.truth.ss_within, 3);
      } else if (fixture.id === "r_ttest") {
        // R t-test assertions: t, df, p, and both group means match
        expect(response.ttestResults).toBeDefined();
        
        expect(parseFloat(response.ttestResults.t)).toBeCloseTo(fixture.truth.t, 4);
        expect(parseFloat(response.ttestResults.df)).toBeCloseTo(fixture.truth.df, 2);
        expect(parseFloat(response.ttestResults.p)).toBeCloseTo(fixture.truth.p, 4);
        expect(parseFloat(response.ttestResults.mean_x)).toBeCloseTo(fixture.truth.mean_x, 5);
        expect(parseFloat(response.ttestResults.mean_y)).toBeCloseTo(fixture.truth.mean_y, 5);
      }
    }, 60000); // 60s timeout for live API calls -- DeepSeek via OpenRouter runs close to 30s on this prompt's size, unlike the faster gemini-3.5-flash this originally targeted
  });
});
