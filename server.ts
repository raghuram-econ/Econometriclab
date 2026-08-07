import "dotenv/config";
import express from "express";
import path from "path";
import fs from "fs";
import { initializeApp, getApps } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { rateLimit, ipKeyGenerator } from "express-rate-limit";
import { createServer as createViteServer } from "vite";
import { Type } from "@google/genai";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  interpretModelPrompt,
  generateReportPrompt,
  generateManuscriptSectionPrompt,
  generateMetaAnalysisPrompt
} from "./improved-ai-prompts";

// AI Request Throttler to sequence concurrent high-frequency researcher requests and protect API quotas
class AIRequestThrottler {
  private queue: Array<{
    req: express.Request;
    res: express.Response;
    next: express.NextFunction;
    timer: NodeJS.Timeout;
    timestamp: number;
  }> = [];
  private activeRequests = 0;
  private maxConcurrency = 2; // Maximum 2 concurrent AI API calls
  private minIntervalMs = 1200; // Force at least 1.2s delay between initiating sequential calls
  private lastRequestTime = 0;
  private maxQueueSize = 30; // Protect memory from infinite queueing
  private queueTimeoutMs = 45000; // Max time (45s) a request can wait in queue before being rejected

  constructor() {
    this.processQueue = this.processQueue.bind(this);
  }

  public middleware() {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      // Only throttle incoming POST requests to /api/gemini/* or /api/ai/* (heavy academic generations)
      const isAIRoute = req.originalUrl.startsWith("/api/gemini") || req.originalUrl.startsWith("/api/ai");
      if (req.method !== "POST" || !isAIRoute) {
        return next();
      }

      if (this.queue.length >= this.maxQueueSize) {
        return res.status(429).json({
          error: "The academic AI reasoning engine is heavily loaded. Please wait a moment for current processes to complete."
        });
      }

      // Record queue depth in response header to allow research monitoring
      res.setHeader("X-AI-Queue-Depth", (this.queue.length + 1).toString());

      const queueItem = {
        req,
        res,
        next,
        timestamp: Date.now(),
        timer: null as any
      };

      // Set timeout to prevent client hanging indefinitely
      queueItem.timer = setTimeout(() => {
        const index = this.queue.indexOf(queueItem);
        if (index !== -1) {
          this.queue.splice(index, 1);
          if (!res.headersSent) {
            res.status(504).json({
              error: "AI estimation explanation request timed out in queue. Please retry your query."
            });
          }
        }
      }, this.queueTimeoutMs);

      this.queue.push(queueItem);
      this.processQueue();
    };
  }

  private processQueue() {
    if (this.activeRequests >= this.maxConcurrency || this.queue.length === 0) {
      return;
    }

    const now = Date.now();
    const timeSinceLast = now - this.lastRequestTime;
    const waitTime = Math.max(0, this.minIntervalMs - timeSinceLast);

    if (waitTime > 0) {
      setTimeout(() => this.processQueue(), waitTime);
      return;
    }

    const item = this.queue.shift();
    if (!item) return;

    // Clear timeout since we are now processing
    clearTimeout(item.timer);

    // If client already disconnected, skip
    if (item.res.writableEnded || item.res.finished) {
      this.processQueue();
      return;
    }

    this.activeRequests++;
    this.lastRequestTime = Date.now();

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      this.activeRequests--;
      this.processQueue();
    };

    item.res.on("finish", cleanup);
    item.res.on("close", cleanup);
    item.res.on("error", cleanup);

    item.next();
  }
}

// Helper function to sanitize error messages and prevent internal topology leaks
function sanitizeErrorMessage(msg: string): string {
  if (!msg) return "An unexpected error occurred.";
  let sanitized = msg;
  // Strip any internal ports, hostnames, IP addresses, or file paths
  sanitized = sanitized.replace(/http:\/\/127\.0\.0\.1:\d+/g, "internal compute engine");
  sanitized = sanitized.replace(/http:\/\/localhost:\d+/g, "internal compute engine");
  sanitized = sanitized.replace(/127\.0\.0\.1:\d+/g, "internal compute engine");
  sanitized = sanitized.replace(/localhost:\d+/g, "internal compute engine");
  sanitized = sanitized.replace(/\/[\w\.-]+\/[\w\.-]+/g, "internal path");
  // If it's a connection refuse error, return a friendly user-facing message
  if (
    sanitized.toLowerCase().includes("econnrefused") || 
    sanitized.toLowerCase().includes("fetch failed") || 
    sanitized.toLowerCase().includes("connect")
  ) {
    return "Python compute engine unavailable. Try the TypeScript engine.";
  }
  return sanitized;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;
  const pythonBackendUrl = process.env.PYTHON_BACKEND_URL || "http://localhost:8000";
  const aiThrottler = new AIRequestThrottler();

  // 1. Initial global headers-based Content-Length size check to prevent memory allocation DoS
  app.use((req, res, next) => {
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength, 10) > 50 * 1024 * 1024) {
      return res.status(413).json({ error: "Payload too large. Limit is 50MB." });
    }
    next();
  });

  // Load firebase project ID safely for admin SDK setup
  let firebaseProjectId = process.env.VITE_FIREBASE_PROJECT_ID || "think-like-a-economist";

  if (getApps().length === 0) {
    initializeApp({
      projectId: firebaseProjectId
    });
  }

  // Authentication middleware (reads headers, no body parsing needed)
  const authMiddleware = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Skip auth check for /api/health and public datasets
    if (
      req.path === "/health" || 
      req.path === "/api/health" || 
      req.originalUrl === "/api/health" ||
      req.path === "/api/datasets/mroz" ||
      req.originalUrl === "/api/datasets/mroz"
    ) {
      return next();
    }

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const token = authHeader.substring("Bearer ".length);
    try {
      const decoded = await getAuth().verifyIdToken(token);
      (req as any).user = decoded;
      return next();
    } catch (err) {
      console.error("[auth] verifyIdToken failed:", err);
      return res.status(401).json({ error: "Invalid token" });
    }
  };

  // Attach authMiddleware to all /api/* routes first
  app.use("/api", authMiddleware);

  // Rate limiters (reads headers and auth, no body parsing needed)
  const estimationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: (req: any) => req.user?.uid || ipKeyGenerator(req.ip) || 'anonymous',
    message: { error: "Too many estimation requests. Please wait a minute before trying again." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { ip: false },
  });

  const geminiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: (req: any) => req.user?.uid || ipKeyGenerator(req.ip) || 'anonymous',
    message: { error: "Too many AI consultation requests. Please wait a minute before trying again." },
    standardHeaders: true,
    legacyHeaders: false,
    validate: { ip: false },
  });

  // Apply rate limits BEFORE parsing the body
  app.use("/api/estimate", estimationLimiter);
  app.use("/api/gemini", geminiLimiter);
  app.use("/api/ai", geminiLimiter);
  app.use(["/api/python/*", "/api/parse-sav"], estimationLimiter);

  // Apply request throttling to AI endpoints to sequence high-frequency concurrent usage and stay within API quotas
  app.use("/api/gemini", aiThrottler.middleware());
  app.use("/api/ai", aiThrottler.middleware());

  // 2. Body parsing is executed ONLY after passing authentication and rate limiters
  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 3. Size and structures validation after body is parsed
  const estimationPayloadValidator = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength, 10) > 20 * 1024 * 1024) {
      return res.status(400).json({ error: "Payload too large. Maximum allowed size is 20MB." });
    }
    if (req.body && Array.isArray(req.body.data) && req.body.data.length > 100000) {
      return res.status(400).json({ error: "Data size limit exceeded. Maximum allowed is 100,000 rows." });
    }
    next();
  };

  app.use("/api/estimate", estimationPayloadValidator);
  app.use(["/api/python/*", "/api/parse-sav"], estimationPayloadValidator);

  // ---- DeepSeek-backed AI client ----
  // Keeps the original Gemini SDK's call shape (`ai.models.generateContent({model,
  // contents, config})`, resolving to `{ text }`) so every route handler below --
  // whether it calls this directly or via generateContentWithFallbackAndRetry --
  // works completely unchanged. Only the network call underneath moved to DeepSeek.

  // Converts Gemini-style `contents` (a plain prompt string, or an array of
  // {role: 'user'|'model', parts:[{text}]} turns) plus a system instruction into
  // an OpenAI-style chat `messages` array, which DeepSeek's API expects.
  function toDeepSeekMessages(contents: any, systemInstruction?: string): { role: string; content: string }[] {
    const messages: { role: string; content: string }[] = [];
    if (systemInstruction) {
      messages.push({ role: "system", content: systemInstruction });
    }
    if (typeof contents === "string") {
      messages.push({ role: "user", content: contents });
    } else if (Array.isArray(contents)) {
      contents.forEach((turn: any) => {
        const role = turn.role === "model" ? "assistant" : "user";
        const text = (turn.parts || []).map((p: any) => p.text || "").join("");
        messages.push({ role, content: text });
      });
    }
    return messages;
  }

  // Renders a Gemini-style typed schema (Type.OBJECT/ARRAY/STRING/etc.,
  // properties, required, enum) as a plain-text JSON-shape example, since
  // DeepSeek has no native schema-validated output -- only response_format:
  // json_object (valid JSON syntax, not a guaranteed shape). The existing
  // endpoints' schemas (already written for Gemini) are reused verbatim as the
  // source of truth for this description; nothing is rewritten per-endpoint.
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

  function geminiSchemaToPromptText(schema: any): string {
    return `Respond with a single JSON object matching exactly this shape (no markdown code fences, no extra commentary -- JSON only):\n${JSON.stringify(schemaToSkeleton(schema), null, 2)}`;
  }

  // Minimal structural check -- confirms every `required` field (recursively)
  // is present and enum values are one of the allowed options. Not full
  // JSON-Schema type conformance: this catches "model forgot a field" / "model
  // wrapped it in prose," which is the failure mode that actually matters here.
  function validateAgainstSchema(value: any, schema: any, path = "root"): void {
    if (!schema) return;
    if (schema.type === Type.OBJECT) {
      if (!value || typeof value !== "object") {
        throw new Error(`AI response missing/invalid object at ${path}`);
      }
      (schema.required || []).forEach((key: string) => {
        if (!(key in value)) {
          throw new Error(`AI response missing required field "${key}" at ${path}`);
        }
      });
      Object.entries(schema.properties || {}).forEach(([key, propSchema]) => {
        if (key in value) validateAgainstSchema(value[key], propSchema, `${path}.${key}`);
      });
    } else if (schema.type === Type.ARRAY) {
      if (!Array.isArray(value)) {
        throw new Error(`AI response expected an array at ${path}`);
      }
      value.forEach((item: any, i: number) => validateAgainstSchema(item, schema.items, `${path}[${i}]`));
    } else if (schema.enum && !schema.enum.includes(value)) {
      throw new Error(`AI response value "${value}" at ${path} is not one of the allowed options: ${schema.enum.join(", ")}`);
    }
  }

  async function deepSeekGenerateContent(apiKey: string, options: { model?: string; contents: any; config?: any }): Promise<{ text: string }> {
    const config = options.config || {};
    const wantsJson = config.responseMimeType === "application/json" && config.responseSchema;

    const systemInstruction = wantsJson
      ? `${config.systemInstruction || ""}\n\n${geminiSchemaToPromptText(config.responseSchema)}`
      : config.systemInstruction;

    const messages = toDeepSeekMessages(options.contents, systemInstruction);

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`,
        // Optional OpenRouter attribution headers -- affects leaderboard
        // ranking only, not required for the request to function.
        "HTTP-Referer": process.env.PUBLIC_APP_URL || "https://econometrics-lab.onrender.com",
        "X-Title": "Econometrics Lab",
      },
      body: JSON.stringify({
        model: process.env.OPENROUTER_MODEL || "deepseek/deepseek-chat",
        messages,
        temperature: config.temperature ?? 0.3,
        ...(wantsJson ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      const err: any = new Error(`OpenRouter API error (${response.status}): ${errText}`);
      err.status = response.status;
      throw err;
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || "";

    if (wantsJson) {
      const parsed = JSON.parse(text.trim());
      validateAgainstSchema(parsed, config.responseSchema);
    }

    return { text };
  }

  async function deepSeekGenerateContentWithRetry(
    apiKey: string,
    options: { model?: string; contents: any; config?: any },
    maxRetries = 2,
    initialDelay = 1000
  ): Promise<{ text: string }> {
    let attempt = 0;
    while (true) {
      try {
        return await deepSeekGenerateContent(apiKey, options);
      } catch (error: any) {
        const isRetryable = error?.status === 429 || error?.status === 503 ||
          error?.message?.includes('429') || error?.message?.includes('503') ||
          error?.message?.includes('UNAVAILABLE') || error?.message?.includes('RESOURCE_EXHAUSTED') ||
          error?.message?.includes('high demand');

        if (isRetryable && attempt < maxRetries) {
          attempt++;
          const delay = initialDelay * Math.pow(2, attempt - 1);
          console.warn(`DeepSeek API returned retryable error (attempt ${attempt}/${maxRetries}): ${error.message || error}. Retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        // Not retryable (or retries exhausted): re-throw so the caller's
        // existing catch block / local-fallback path takes over, exactly as
        // it did for a final Gemini failure before this migration.
        throw error;
      }
    }
  }

  // Initialize AI client lazily/safely. Name kept as `getGeminiClient` (now
  // routed through OpenRouter to DeepSeek) so the ~15 route handlers below
  // that call it don't need to change.
  const getGeminiClient = () => {
    const key = process.env.OPENROUTER_API_KEY;
    if (!key) {
      throw new Error("OPENROUTER_API_KEY environment variable is required. Please provision it in Settings > Secrets.");
    }
    return {
      models: {
        generateContent: (options: { model?: string; contents: any; config?: any }) =>
          deepSeekGenerateContentWithRetry(key, options),
      },
    };
  };

  const generateContentWithFallbackAndRetry = async (
    ai: { models: { generateContent: (options: any) => Promise<{ text: string }> } },
    options: { model?: string; contents: any; config?: any }
  ): Promise<{ text: string }> => {
    return ai.models.generateContent(options);
  };

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  app.get("/api/datasets/mroz", (req, res) => {
    try {
      const csvPath = path.join(process.cwd(), "mroz.csv");
      if (!fs.existsSync(csvPath)) {
        return res.status(404).json({ error: "Mroz dataset not found" });
      }
      const raw = fs.readFileSync(csvPath, "utf8");
      const lines = raw.split("\n").map(l => l.trim()).filter(Boolean);
      const firstLine = lines[0];
      if (!firstLine) throw new Error("CSV file is empty");
      const headers = firstLine.split(",");
      const data = lines.slice(1).map(line => {
        const parts = line.split(",");
        const obj: any = {};
        headers.forEach((h, idx) => {
          const val = parts[idx];
          obj[h] = (val === undefined || val === "" || isNaN(Number(val))) ? val : Number(val);
        });
        return obj;
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Python backend forwarding for high-value statistical routes.
  //
  // JSON routes are forwarded with fetch rather than http-proxy-middleware:
  // express.json() has already consumed the request stream by this point, and
  // the proxy middleware silently hangs on such requests. The upload route
  // (/api/parse-sav) is multipart, which express.json() does not touch, so the
  // raw stream is intact and the proxy can pipe it through unchanged.
  const PYTHON_JSON_ROUTES: Record<string, string> = {
    "/api/python/gmm": "/python/gmm",
    "/api/python/cointegration": "/python/cointegration",
    "/api/python/cox": "/python/cox",
    "/api/python/arima-full": "/python/arima-full",
    "/api/python/marginal-effects": "/python/marginal-effects",
    "/api/python/heckman": "/python/heckman",
    "/api/python/johansen": "/python/johansen",
    "/api/python/survey-ols": "/python/survey-ols",
    "/api/python/garch": "/python/garch",
    "/api/python/unit-root": "/python/unit-root",
    "/api/python/rdd": "/python/rdd",
    "/api/python/power": "/python/power",
    "/api/python/synthetic-control": "/python/synthetic-control",
    "/api/python/staggered-did": "/python/staggered-did",
  };

  app.post(Object.keys(PYTHON_JSON_ROUTES), async (req, res) => {
    const target = PYTHON_JSON_ROUTES[req.path];
    if (!target) return res.status(404).json({ error: "Unknown Python route" });
    try {
      const upstream = await fetch(`${pythonBackendUrl}${target}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Token": process.env.INTERNAL_SECRET || 'ell_internal_token_secure_9832',
        },
        body: JSON.stringify(req.body ?? {}),
      });
      const text = await upstream.text();
      res.status(upstream.status);
      try {
        res.json(JSON.parse(text));
      } catch {
        res.send(text);
      }
    } catch (err: any) {
      res.status(503).json({ error: "Python compute engine unavailable. Try the TypeScript engine." });
    }
  });

  const pythonProxy = createProxyMiddleware({
    target: pythonBackendUrl,
    changeOrigin: true,
    pathFilter: (pathname: string, req: any) => (req.originalUrl || pathname) === "/api/parse-sav",
    on: {
      proxyReq: (proxyReq: any, req: any, res: any) => {
        proxyReq.setHeader('X-Internal-Token', process.env.INTERNAL_SECRET || 'ell_internal_token_secure_9832');
      },
      error: (err: any, req: any, res: any) => {
        if (!res.headersSent) {
          res.status(503).json({ error: "Python compute engine unavailable. Try the TypeScript engine." });
        }
      }
    }
  } as any);

  app.use(pythonProxy);

  app.post("/api/estimate/ols", async (req, res) => {
    try {
      const { data, yVar, xVars, includeIntercept, robust, clusterVar, bootstrap, robustType, useWildBootstrap, wildBootstrapB } = req.body;
      const { runOLS } = await import("./src/lib/econometrics/ols");
      const results = runOLS(data, yVar, xVars, includeIntercept, robust, clusterVar, bootstrap, true, robustType, useWildBootstrap, wildBootstrapB);
      res.json(results);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("OLS Estimation Error:", error);
      res.status(400).json({ error: error.message || "Failed to run estimation" });
    }
  });

  app.post("/api/estimate/fe", async (req, res) => {
    try {
      const { data, yVar, xVars, entityId, timeVar } = req.body;
      const { runFixedEffects, runRandomEffects, runHausmanTest } = await import("./src/lib/econometrics/fixed_effects");
      const results = runFixedEffects(data, yVar, xVars, entityId, timeVar);
      
      try {
        const reResults = runRandomEffects(data, yVar, xVars, entityId, timeVar);
        const hausman = runHausmanTest(results, reResults, xVars);
        results.hausman = hausman;
      } catch (e) {
        console.warn("Hausman Test computation failed inside FE route:", e);
      }

      res.json(results);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("FE Estimation Error:", error);
      res.status(400).json({ error: error.message || "Failed to run estimation" });
    }
  });

  app.post("/api/estimate/re", async (req, res) => {
    try {
      const { data, yVar, xVars, entityId, timeVar } = req.body;
      const { runRandomEffects, runFixedEffects, runHausmanTest } = await import("./src/lib/econometrics/fixed_effects");
      const results = runRandomEffects(data, yVar, xVars, entityId, timeVar);
      
      try {
        const feResults = runFixedEffects(data, yVar, xVars, entityId, timeVar);
        const hausman = runHausmanTest(feResults, results, xVars);
        results.hausman = hausman;
      } catch (e) {
        console.warn("Hausman Test computation failed inside RE route:", e);
      }

      res.json(results);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("RE Estimation Error:", error);
      res.status(400).json({ error: error.message || "Failed to run estimation" });
    }
  });

  // Helper function to calculate percentiles for outlier trims
  function getPercentiles(arr: number[], p: number): number {
    if (arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const idx = (sorted.length - 1) * (p / 100);
    const base = Math.floor(idx);
    const rest = idx - base;
    const baseVal = sorted[base];
    if (baseVal === undefined) return 0;
    const nextVal = sorted[base + 1];
    if (nextVal !== undefined) {
      return baseVal + rest * (nextVal - baseVal);
    }
    return baseVal;
  }

  // Helper function to generate combinations of optional controls
  function getCombinations<T>(array: T[]): T[][] {
    const result: T[][] = [[]];
    for (const element of array) {
      const length = result.length;
      for (let i = 0; i < length; i++) {
        const row = result[i] || [];
        result.push([...row, element]);
      }
    }
    return result;
  }

  app.post("/api/estimate/specification-curve", async (req, res) => {
    try {
      const { data, yVar, xVar, controls = [], seTypes = ["classical"], clusterVar, outliers = [0], estimators = ["OLS"], entityVar, timeVar } = req.body;
      
      const { runOLS } = await import("./src/lib/econometrics/ols");
      const { runFixedEffects } = await import("./src/lib/econometrics/fixed_effects");

      // Generate all control combinations
      const controlSubsets = getCombinations(controls);

      const specs: any[] = [];
      let totalSpecs = 0;

      // Filter out any invalid observations with missing yVar or xVar first
      const cleanData = (data || []).filter((row: any) => 
        row && 
        row[yVar] !== undefined && row[yVar] !== null && !isNaN(parseFloat(row[yVar])) &&
        row[xVar] !== undefined && row[xVar] !== null && !isNaN(parseFloat(row[xVar]))
      );

      for (const estimator of estimators) {
        for (const outlierTrim of outliers) {
          // Compute outlier limits if trim is requested
          let filteredData = cleanData;
          if (outlierTrim > 0) {
            const yVals = cleanData.map((r: any) => parseFloat(r[yVar]));
            const xVals = cleanData.map((r: any) => parseFloat(r[xVar]));
            
            const yLow = getPercentiles(yVals, outlierTrim);
            const yHigh = getPercentiles(yVals, 100 - outlierTrim);
            const xLow = getPercentiles(xVals, outlierTrim);
            const xHigh = getPercentiles(xVals, 100 - outlierTrim);

            filteredData = cleanData.filter((r: any) => {
              const y = parseFloat(r[yVar]);
              const x = parseFloat(r[xVar]);
              return y >= yLow && y <= yHigh && x >= xLow && x <= xHigh;
            });
          }

          for (const currentControls of controlSubsets) {
            for (const seType of seTypes) {
              if (totalSpecs >= 500) break;

              const specId = `spec_${totalSpecs + 1}`;
              try {
                let coef: any = null;
                let rSquared = 0;
                let nObs = 0;

                if (estimator === "FE") {
                  if (!entityVar || !timeVar) continue; // Skip FE if no group/time vars
                  const result = runFixedEffects(filteredData, yVar, [xVar, ...currentControls], entityVar, timeVar);
                  const focalCoef = result.coefficients.find((c: any) => c.variable === xVar);
                  if (focalCoef) {
                    coef = focalCoef;
                    rSquared = result.rSquared || 0;
                    nObs = result.n || 0;
                  }
                } else {
                  // Run OLS
                  const robust = seType !== "classical";
                  const cluster = seType === "clustered" ? clusterVar : undefined;
                  const robustType = (seType === "classical" || seType === "clustered") ? "HC1" : (seType as any);
                  
                  const result = runOLS(filteredData, yVar, [xVar, ...currentControls], true, robust, cluster, false, false, robustType);
                  const focalCoef = result.coefficients.find((c: any) => c.variable === xVar);
                  if (focalCoef) {
                    coef = focalCoef;
                    rSquared = result.rSquared || 0;
                    nObs = result.n || 0;
                  }
                }

                if (coef) {
                  specs.push({
                    id: specId,
                    estimate: coef.estimate,
                    stdError: coef.stdError,
                    pValue: coef.pValue,
                    confLow: coef.confLow,
                    confHigh: coef.confHigh,
                    controls: controls.reduce((acc: any, cName: string) => {
                      acc[cName] = currentControls.includes(cName);
                      return acc;
                    }, {}),
                    seType,
                    outlierTrim,
                    estimator,
                    rSquared,
                    n: nObs
                  });
                  totalSpecs++;
                }
              } catch (err) {
                // Skip singular or invalid matrix combinations silently to ensure completion
              }
            }
          }
        }
      }

      res.json({ specifications: specs });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Specification Curve error:", error);
      res.status(400).json({ error: error.message || "Failed to compile specification curve grid" });
    }
  });

  // Helpers for R and Stata script generation in automated replication package
  function generateRScriptForModel(h: any, index: number): string {
    const y = h.results?.yVar || "Y";
    const xs = h.results?.xVars || h.results?.coefficients?.map((c: any) => c.variable).filter((v: string) => v !== "Intercept" && v !== "Intercept (FE)") || [];
    const robust = h.results?.robust || false;
    const clusterVar = h.results?.clusterVar;
    
    let code = `\n# --- Model ${index + 1}: ${h.specification} ---\n`;
    code += `print("Running Model ${index + 1}...")\n`;
    
    // Trim data if needed
    if (h.results?.outlierTrim) {
      code += `df_temp <- df\n`;
      code += `y_low <- quantile(df_temp$${y}, ${h.results.outlierTrim / 100}, na.rm = TRUE)\n`;
      code += `y_high <- quantile(df_temp$${y}, ${1 - h.results.outlierTrim / 100}, na.rm = TRUE)\n`;
      code += `df_temp <- df_temp[df_temp$${y} >= y_low & df_temp$${y} <= y_high, ]\n`;
    } else {
      code += `df_temp <- df\n`;
    }

    const formula = `${y} ~ ${xs.join(" + ")}`;
    if (h.module === "FE") {
      code += `library(plm)\n`;
      code += `fit_${index + 1} <- plm(${formula}, data = df_temp, index = c("${h.results?.entityId || 'id'}", "${h.results?.timeVar || 'time'}"), model = "within")\n`;
      code += `print(summary(fit_${index + 1}))\n`;
    } else {
      code += `fit_${index + 1} <- lm(${formula}, data = df_temp)\n`;
      if (clusterVar) {
        code += `library(sandwich)\n`;
        code += `library(lmtest)\n`;
        code += `cov_${index + 1} <- vcovCL(fit_${index + 1}, cluster = ~${clusterVar})\n`;
        code += `print(coeftest(fit_${index + 1}, vcov. = cov_${index + 1}))\n`;
      } else if (robust) {
        code += `library(sandwich)\n`;
        code += `library(lmtest)\n`;
        code += `print(coeftest(fit_${index + 1}, vcov. = vcovHC(fit_${index + 1}, type = "HC1")))\n`;
      } else {
        code += `print(summary(fit_${index + 1}))\n`;
      }
    }
    return code;
  }

  function generateStataScriptForModel(h: any, index: number): string {
    const y = h.results?.yVar || "Y";
    const xs = h.results?.xVars || h.results?.coefficients?.map((c: any) => c.variable).filter((v: string) => v !== "Intercept" && v !== "Intercept (FE)") || [];
    const robust = h.results?.robust || false;
    const clusterVar = h.results?.clusterVar;
    
    let code = `\n* --- Model ${index + 1}: ${h.specification} ---\n`;
    code += `preserve\n`;
    
    if (h.results?.outlierTrim) {
      code += `centile ${y}, centile(${h.results.outlierTrim} ${100 - h.results.outlierTrim})\n`;
      code += `drop if ${y} < r(c_1) | ${y} > r(c_2)\n`;
    }

    const varList = `${y} ${xs.join(" ")}`;
    if (h.module === "FE") {
      code += `xtset ${h.results?.entityId || 'id'} ${h.results?.timeVar || 'time'}\n`;
      code += `xtreg ${varList}, fe\n`;
    } else {
      let opts = "";
      if (clusterVar) {
        opts = `, vce(cluster ${clusterVar})`;
      } else if (robust) {
        opts = `, robust`;
      }
      code += `regress ${varList}${opts}\n`;
    }
    code += `restore\n`;
    return code;
  }

  app.post("/api/export/replication-package", async (req, res) => {
    try {
      const { history = [], currentDataset } = req.body;
      const AdmZip = (await import("adm-zip")).default;
      const zip = new AdmZip();

      // 1. Generate README.md
      const readmeContent = `# Economics Learning Lab - Replication Package

This package contains the files necessary to replicate the econometric specifications executed during the session.

## Contents
1. \`README.md\`: This file, documenting package organization and requirements.
2. \`data_manifest.json\`: Variable dictionary and descriptive summary statistics for the dataset used.
3. \`models_manifest.json\`: Parameters, options, and performance indices for each estimated model.
4. \`reproduce_all.R\`: Executable R script to replicate all OLS and Fixed Effects estimations.
5. \`reproduce_all.do\`: Executable Stata Do-file to replicate all estimations.
6. \`validation_excerpt.md\`: A detailed econometric justification outlining the mathematical implementation of our estimators.
7. \`data.csv\`: Raw dataset used during the estimation session (if present).

## Requirements
- **R Version**: >= 4.0.0 (requires libraries \`sandwich\`, \`lmtest\`, and \`plm\`)
- **Stata Version**: >= 15.0 (for panel commands like \`xtset\` and \`xtreg\`)

## Execution Instructions

### In R
1. Open R or RStudio in this directory.
2. Ensure required packages are installed:
   \`\`\`R
   install.packages(c("sandwich", "lmtest", "plm"))
   \`\`\`
3. Source the script:
   \`\`\`R
   source("reproduce_all.R")
   \`\`\`

### In Stata
1. Open Stata in this directory.
2. Execute the do-file:
   \`\`\`stata
   do reproduce_all.do
   \`\`\`
`;

      zip.addFile("README.md", Buffer.from(readmeContent, "utf8"));

      // 2. Generate data_manifest.json
      const variablesDict: any = {};
      if (currentDataset && currentDataset.data && currentDataset.data.length > 0) {
        const cols = Object.keys(currentDataset.data[0]);
        cols.forEach(col => {
          const vals = currentDataset.data.map((r: any) => parseFloat(r[col])).filter((v: number) => !isNaN(v));
          if (vals.length > 0) {
            const sum = vals.reduce((a: number, b: number) => a + b, 0);
            const mean = sum / vals.length;
            const sqDiff = vals.reduce((a: number, b: number) => a + (b - mean) ** 2, 0);
            const sd = Math.sqrt(sqDiff / (vals.length - 1 || 1));
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            variablesDict[col] = {
              type: "numeric",
              observations: vals.length,
              mean,
              stdDev: sd,
              min,
              max,
              missingCount: currentDataset.data.length - vals.length
            };
          } else {
            variablesDict[col] = {
              type: "string/categorical",
              observations: currentDataset.data.length,
              missingCount: 0
            };
          }
        });
      }

      const crypto = await import("crypto");
      const serializedData = currentDataset?.data ? JSON.stringify(currentDataset.data) : "";
      const realHash = crypto.createHash("sha256").update(serializedData).digest("hex").toUpperCase();

      const dataManifest = {
        datasetName: currentDataset?.name || "unnamed_dataset",
        observationsCount: currentDataset?.data?.length || 0,
        variables: variablesDict,
        sourceHash: "SHA-256-" + realHash
      };

      zip.addFile("data_manifest.json", Buffer.from(JSON.stringify(dataManifest, null, 2), "utf8"));

      // 3. Generate models_manifest.json
      const modelsManifest = history.map((h: any, i: number) => ({
        modelIndex: i + 1,
        specification: h.specification,
        module: h.module,
        estimatedAt: h.timestamp || new Date().toISOString(),
        settings: {
          yVar: h.results?.yVar,
          xVars: h.results?.xVars,
          robust: h.results?.robust,
          clusterVar: h.results?.clusterVar,
          outlierTrim: h.results?.outlierTrim
        },
        coefficients: h.results?.coefficients?.map((c: any) => ({
          variable: c.variable,
          estimate: c.estimate,
          stdError: c.stdError,
          tStat: c.tStat,
          pValue: c.pValue
        })),
        rSquared: h.results?.rSquared,
        n: h.results?.n
      }));

      zip.addFile("models_manifest.json", Buffer.from(JSON.stringify(modelsManifest, null, 2), "utf8"));

      // 4. Generate reproduce_all.R
      let rScript = `# Economics Learning Lab - Replication R Script\n`;
      rScript += `# Generated automatically on ${new Date().toLocaleDateString()}\n\n`;
      rScript += `print("--- Economics Learning Lab Replication Execution ---")\n`;
      rScript += `if (!file.exists("data.csv")) {\n`;
      rScript += `  stop("Please place the 'data.csv' file in this working directory before sourcing.")\n`;
      rScript += `}\n\n`;
      rScript += `# Load raw dataset\n`;
      rScript += `df <- read.csv("data.csv")\n`;

      history.forEach((h: any, i: number) => {
        rScript += generateRScriptForModel(h, i);
      });

      zip.addFile("reproduce_all.R", Buffer.from(rScript, "utf8"));

      // 5. Generate reproduce_all.do
      let stataScript = `* Economics Learning Lab - Replication Stata Do-File\n`;
      stataScript += `* Generated automatically on ${new Date().toLocaleDateString()}\n\n`;
      stataScript += `clear all\n`;
      stataScript += `capture log close\n`;
      stataScript += `log using replication_log.log, replace\n\n`;
      stataScript += `* Check for data.csv\n`;
      stataScript += `capture confirm file "data.csv"\n`;
      stataScript += `if _rc != 0 {\n`;
      stataScript += `  display as error "Please place the 'data.csv' file in this working directory."\n`;
      stataScript += `  exit\n`;
      stataScript += `}\n\n`;
      stataScript += `* Import data\n`;
      stataScript += `import delimited "data.csv", clear\n`;

      history.forEach((h: any, i: number) => {
        stataScript += generateStataScriptForModel(h, i);
      });

      stataScript += `\nlog close\n`;
      stataScript += `display "Replication Completed Successfully!"\n`;

      zip.addFile("reproduce_all.do", Buffer.from(stataScript, "utf8"));

      // 6. Generate validation_excerpt.md
      const validationContent = `# Econometric Estimator Numerical Validation

This document certifies that the core OLS, Fixed Effects, and Penalized estimators implemented within the **Economics Learning Lab (Beta)** are numerically correct and conform to first-principles specifications in standard econometrics textbooks. (Note: Advanced models like Tobit, GARCH, and RDD are currently in beta and pending full NIST/Stata validation).

## 1. Ordinary Least Squares (OLS) Estimator
The coefficient vector is estimated via:
$$\\hat{\\beta} = (X'X)^{-1} X'Y$$

Standard errors are computed from the diagonal of the variance-covariance matrix:
$$\\text{Var}(\\hat{\\beta}) = \\sigma^2 (X'X)^{-1}$$
where $\\sigma^2 = \\frac{e'e}{n-k}$ is the unbiased residual variance.

## 2. Robust & Clustered Standard Errors
When White (HC1, HC3) or clustered standard errors are requested, we implement the sandwich estimator:
$$\\text{Var}(\\hat{\\beta}) = (X'X)^{-1} \\Omega (X'X)^{-1}$$
- For **HC1**: $\\Omega = \\frac{n}{n-k} \\sum_i e_i^2 x_i x_i'$
- For **HC3**: $\\Omega = \\sum_i \\frac{e_i^2}{(1 - h_i)^2} x_i x_i'$ where $h_i = x_i (X'X)^{-1} x_i'$ is the leverage of observation $i$.
- For **Clustered SEs**: Observations are grouped by cluster $g$. The meat of the sandwich is:
  $$\\Omega = \\frac{G}{G-1} \\frac{n-1}{n-k} \\sum_{g=1}^G \\left( \\sum_{i \\in g} e_i x_i \\right) \\left( \\sum_{i \\in g} e_i x_i \\right)'$$

## 3. Within Fixed-Effects Estimator
For panel data with entity fixed effects, we perform the "within" transformation (de-meaning) to eliminate individual effects:
$$\\tilde{y}_{it} = y_{it} - \\bar{y}_i, \\quad \\tilde{x}_{it} = x_{it} - \\bar{x}_i$$
The coefficients are then estimated by running OLS on the de-meaned variables. Standard errors are adjusted using a degree of freedom correction:
$$df = n - k - N_{groups}$$
matching standard panel software (such as Stata's \`xtreg, fe\` or R's \`plm\` within estimator) for standard unadjusted standard errors. Note that degrees of freedom are adjusted for the number of entities to ensure correct homoskedastic inference.

`;

      zip.addFile("validation_excerpt.md", Buffer.from(validationContent, "utf8"));

      // 7. Add raw data as CSV if present
      if (currentDataset && currentDataset.data && currentDataset.data.length > 0) {
        const cols = Object.keys(currentDataset.data[0]);
        let csvContent = cols.join(",") + "\n";
        currentDataset.data.forEach((row: any) => {
          csvContent += cols.map(c => {
            const val = row[c];
            if (typeof val === "string" && (val.includes(",") || val.includes('"') || val.includes("\n"))) {
              return '"' + val.replace(/"/g, '""') + '"';
            }
            return val;
          }).join(",") + "\n";
        });
        zip.addFile("data.csv", Buffer.from(csvContent, "utf8"));
      }

      const zipBuffer = zip.toBuffer();
      res.set("Content-Type", "application/zip");
      res.set("Content-Disposition", "attachment; filename=replication_package_" + (currentDataset?.name || "economics") + ".zip");
      res.send(zipBuffer);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Replication Package Export Error:", error);
      res.status(500).json({ error: error.message || "Failed to compile automated replication package" });
    }
  });

  app.post("/api/estimate/arima", async (req, res) => {
    try {
       const { series, p, d, q, horizon } = req.body;
       const { runARIMA } = await import("./src/lib/econometrics/arima");
       const results = runARIMA(series, p, d, q, horizon);
       res.json(results);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("ARIMA Estimation Error:", error);
      res.status(400).json({ error: error.message || "Failed to run estimation" });
    }
  });

  app.post("/api/estimate/cox-ph", async (req, res) => {
    try {
      const response = await fetch(`${pythonBackendUrl}/api/run-cox-ph`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Internal-Token": process.env.INTERNAL_SECRET || 'ell_internal_token_secure_9832'
        },
        body: JSON.stringify(req.body)
      });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: sanitizeErrorMessage(errText) || "Cox PH failed in Python backend" });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Cox PH proxy error:", error);
      res.status(500).json({ error: sanitizeErrorMessage(error.message) || "Failed to proxy Cox PH request" });
    }
  });

  app.post("/api/estimate/quantile", async (req, res) => {
    try {
      const response = await fetch(`${pythonBackendUrl}/api/run-quantile`, {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "X-Internal-Token": process.env.INTERNAL_SECRET || 'ell_internal_token_secure_9832'
        },
        body: JSON.stringify(req.body)
      });
      if (!response.ok) {
        const errText = await response.text();
        return res.status(response.status).json({ error: sanitizeErrorMessage(errText) || "Quantile estimation failed in Python backend" });
      }
      const data = await response.json();
      res.json(data);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Quantile proxy error:", error);
      res.status(500).json({ error: sanitizeErrorMessage(error.message) || "Failed to proxy Quantile request" });
    }
  });

  // --- GEMINI ACADEMIC ROUTES ---

  app.post("/api/gemini/professor-desk", async (req, res) => {
    try {
      const { question, history = [] } = req.body;
      if (!question) {
        return res.status(400).json({ error: "Question parameter is required" });
      }

      const ai = getGeminiClient();

      const systemInstruction = `You are an expert, strict, but highly supportive Economics Professor of MA, UGC-NET, and CUET PG level, with deep knowledge across all 10 core fields of economic theory.
The 10 units are:
1. Microeconomics (Consumer/Producer Theory, General Equilibrium, Market Failures)
2. Macroeconomics (Classical/Keynesian models, IS-LM-BP, Growth Models, Inflation & Unemployment)
3. Mathematical Methods (Optimization, Input-Output model, Game Theory)
4. Statistics & Econometrics (Gauss-Markov, OLS, Diagnostics, Time-series, Panel Data)
5. Public Economics (Market failure, taxation, public goods, fiscal fed)
6. Money & Banking (Central banking, monetary transmission channels, financial markets)
7. Growth & Development Economics (Solow, Harrod-Domar, endogenous growth, poverty & inequality)
8. International Economics (Comparative advantage, Heckscher-Ohlin, balance of payments, trade policies)
9. Indian Economy (macro developments, industrial policies, agricultural reforms, FRBM, fiscal policy)
10. Environmental and Welfare Economics (externality solutions, social welfare functions, Pigouvian taxes)

CORE RULES:
- You must ONLY answer Economics-related requests.
- If the student's query is NOT related to economics, econometrics, or economic policy, you must politely, briefly, and firmly state that it is out of scope of the 'Economics Learning Lab (Beta)' and invite them to ask an economics-related topic instead. No exceptions.
- Answers must be rigorous, clear, and structured. Usually 2 to 5 short paragraphs. 
- The renderer does not support LaTeX. Use Unicode math notation for expressions (e.g., "Y = C + I + G", "∂Y/∂K", "α + β = 1"), never $...$ or $$...$$ or \frac{}{} style LaTeX commands.
- If a statistic is not present in the RESULTS JSON or provided context, return null and never invent a value. Cite only numbers present in the raw output.
- State definitions clearly, explain economic intuition, and reference standard diagrams or proofs in textual description.
- Never hallucinate dates or facts. If unsure, say you are not sure and suggest they verify it in standard reference materials.
`;

      const contents = history.map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }));

      const resultsJson = history.length > 0 ? `\n\nRESULTS JSON (for context):\n${JSON.stringify(history.filter((h: any) => h.results).map((h: any) => h.results), null, 2)}` : '';

      contents.push({
        role: 'user',
        parts: [{ text: question + resultsJson }]
      });

      const response = await generateContentWithFallbackAndRetry(ai, {
        model: "deepseek-v4-pro",
        contents,
        config: {
          systemInstruction,
          temperature: 0.3,
        }
      });

      res.json({ response: response.text });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Professor Desk Error:", error);
      res.status(500).json({ error: error.message || "Failed to secure professor consultation" });
    }
  });

  app.post("/api/gemini/academic-lab", async (req, res) => {
    try {
      const { topicOrUnit, mode } = req.body;
      if (!topicOrUnit || !mode) {
        return res.status(400).json({ error: "topicOrUnit and mode parameters are required" });
      }

      const ai = getGeminiClient();

      const systemInstruction = `You are a Senior Academic Economist and UGC-NET Coach specializing in deep topic synthesis, stress tests, and analytical writing for MA and CUET PG level economics.
You help economics students connect concepts across different domains (e.g., comparing Keynesian vs Monetarist views on inflation, or modeling the impact of relaxing capital control assumptions in India's Trilemma setting).

CORE RULES:
- If the topic is NOT related to economics, econometrics, or policy, refuse politely and say that it is out of scope.
- Structure your output strictly based on the requested mode:
  1. Topic Overview: Offer a structured breakdown. Start with a rigorous definition, trace the core transmission mechanism step-by-step, outline algebraic/graphical setting in text (with LaTeX math), elaborate on policy relevance, and link it specifically to the Indian context where possible.
  2. Compare & Contrast: Create a formal comparison. Compare the chosen concepts side-by-side using an elegant markdown table, discuss central divergences in theory, and summarize key testable differences.
  3. Past Question Style Answer: Draft a perfect 12-15 mark exam-style answer. Include a formal Introduction (definitions and context), 2 or 3 well-argued core paragraphs with subpoints, and a concise, balanced academic Conclusion.
  4. Assumption Stress Test: Detail the underlying assumptions of the theoretical model (e.g., wage-price flexibility, perfect capital mobility) and evaluate how the model's policy predictions or transmission channels decay or morph when relaxed in realistic emerging-market setups.
  5. Policy Memo: Draft a formal, high-impact policy memorandum directed from an expert economist to a key policymaker (e.g., Governor of the RBI, Finance Ministry, or CEO of NITI Aayog). Group it into 4 clear sections: problem description, theoretical context, core recommendations, and implementation hurdles.
`;

      const prompt = `Synthesize following econometric/economics topic under the requested module setting:
Topic: ${topicOrUnit}
Mode: ${mode}
Level: MA/UGC-NET Economics`;

      const response = await generateContentWithFallbackAndRetry(ai, {
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.4,
        }
      });

      res.json({ response: response.text });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Academic Lab Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate topic synthesis" });
    }
  });

  app.post("/api/gemini/teacher-mode", async (req, res) => {
    try {
      const { questionPrompt, studentAnswer, level = "MA / UGC-NET" } = req.body;
      if (!questionPrompt || !studentAnswer) {
        return res.status(400).json({ error: "questionPrompt and studentAnswer parameters are required" });
      }

      const ai = getGeminiClient();

      const systemInstruction = `You are a strict but highly supportive and coaching-oriented Economics Professor grading essay answers for the ${level} exam.
Evaluate the student's answer against rigorous economic standards: theoretical definition depth, logical consistency, correctness, mathematical/algebraic clarity, and empirical accuracy. The renderer does not support LaTeX -- write all math using Unicode notation (e.g., "∂Y/∂K", "α + β = 1", "K·(∂Y/∂K) + L·(∂Y/∂L) = rY"), never $...$, $$...$$, or \frac{}{} style LaTeX commands.

You MUST analyze the inputs and generate a structured JSON feedback report that conforms precisely to the requested schema. Do not output any markdown codeblock headers like \`\`\`json, output only raw valid JSON.

JSON SCHEMA:
{
  "verdict": "A concise overall evaluation (2-3 sentences) summarizing the student's level of understanding, praise for outstanding logic, and the biggest content or modeling deficit.",
  "strengths": [
    "List of 3 to 6 distinct strengths found in their definitions, rationale, application, or layout."
  ],
  "improvements": [
    "List of 3 to 6 actionable improvements needed (e.g., missing assumptions, wrong diagram description, weak empirical support, algebraic typos)."
  ],
  "modelAnswerSnippets": [
    "1 or 2 perfect model sentences/bullet points illustrating how to state core mathematical models or definitions accurately to score full marks."
  ]
}
`;

      const prompt = `QUESTION PROMPT: ${questionPrompt}
STUDENT ANSWER FOR EVALUATION: ${studentAnswer}
EXAM TARGET: ${level}`;

      const response = await generateContentWithFallbackAndRetry(ai, {
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING },
              strengths: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              improvements: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              modelAnswerSnippets: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["verdict", "strengths", "improvements", "modelAnswerSnippets"]
          }
        }
      });

      const data = JSON.parse(response.text.trim());
      res.json(data);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Teacher Mode Error:", error);
      res.status(500).json({ error: error.message || "Failed to analyze student essay" });
    }
  });

  app.post("/api/gemini/interpret-model", async (req, res) => {
    try {
      const { moduleName, specification, results, researchContext } = req.body;
      const ai = getGeminiClient();

      const systemInstruction = `You are an expert econometrician and statistician. Your task is to interpret a regression or statistical model run and provide two different levels of analysis (Beginner/Wooldridge-style and Advanced/Referee-style) as a structured JSON object.

CRITICAL FORMATTING AND CONTENT RULES:
1. NEVER use LaTeX $...$ or $$...$$ strings under any circumstances.
2. Use plain-text ASCII math notation only (for example: beta_0, beta_1, epsilon, sigma^2, R^2, Sigma, y-hat, mu, ->). Do NOT use combining Unicode accent characters, subscripts, superscripts, or LaTeX.
3. If a statistic is not present in the RESULTS (JSON), return null and never invent, extrapolate, or hallucinate a value. Cite ONLY numbers explicitly present in the RESULTS (JSON).
4. Keep the tone for Beginner: respectful, clear, pedagogical, like Wooldridge's Chapter 2 textbook explanations. Avoid condescending language or childish analogies.
5. Keep the tone for Advanced: terse, technical, direct, like an academic journal referee report or a dissertation supervisor's marginal comments.
6. The "interpretationCautions" paragraph in the beginner section MUST end with an explicit, plain language epistemic-boundary statement explaining exactly what the estimate can NOT claim (specifically warning about potential selection bias, omitted variables, and stating clearly that no causal identification is possible unless a specific experimental or quasi-experimental design is explicitly provided in the research context).
7. All JSON output must strictly match the schema.`;

      const prompt = `Here is the econometric model specification and results to interpret:
MODEL TYPE / MODULE: ${moduleName}
SPECIFICATION: ${specification}
RESULTS (JSON): ${JSON.stringify(results, null, 2)}
RESEARCH CONTEXT: ${researchContext ? JSON.stringify(researchContext) : 'none'}

Please parse these outputs and populate both the beginner and advanced econometric reviews. For the beginner review, write clean explanatory sentences, and construct a clean coefficient table with practical meanings.
Crucially, ensure that the "interpretationCautions" section ends with an epistemic-boundary paragraph in plain language, describing exactly what the estimate can NOT claim (selection bias, omitted variables, and no causal identification unless a design explicitly supports it). Cite only numbers present in the RESULTS (JSON). For the advanced review, write technical memo-style evaluations, provide model spec, diagnostic summaries, and extensions using Unicode math (no LaTeX!).`;

      const response = await generateContentWithFallbackAndRetry(ai, {
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              beginner: {
                type: Type.OBJECT,
                properties: {
                  modelSpecification: { type: Type.STRING },
                  coefficients: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        variable: { type: Type.STRING },
                        estimate: { type: Type.STRING },
                        se: { type: Type.STRING },
                        significance: { type: Type.STRING },
                        meaning: { type: Type.STRING }
                      },
                      required: ["variable", "estimate", "se", "significance", "meaning"]
                    }
                  },
                  modelFit: { type: Type.STRING },
                  assumptionChecks: { type: Type.STRING },
                  interpretationCautions: { type: Type.STRING }
                },
                required: ["modelSpecification", "coefficients", "modelFit", "assumptionChecks", "interpretationCautions"]
              },
              advanced: {
                type: Type.OBJECT,
                properties: {
                  modelSpecificationIdentification: { type: Type.STRING },
                  coefficientsEconomicSignificance: { type: Type.STRING },
                  modelFitParsimony: { type: Type.STRING },
                  identificationThreats: { type: Type.STRING },
                  assumptionDiagnostics: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        test: { type: Type.STRING },
                        result: { type: Type.STRING },
                        implication: { type: Type.STRING }
                      },
                      required: ["test", "result", "implication"]
                    }
                  },
                  recommendedExtensions: {
                    type: Type.ARRAY,
                    items: { type: Type.STRING }
                  }
                },
                required: [
                  "modelSpecificationIdentification",
                  "coefficientsEconomicSignificance",
                  "modelFitParsimony",
                  "identificationThreats",
                  "assumptionDiagnostics",
                  "recommendedExtensions"
                ]
              }
            },
            required: ["beginner", "advanced"]
          }
        }
      });

      res.json({ response: response.text });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Interpret Model Error:", error);
      res.status(500).json({ error: error.message || "Failed to interpret econometric model" });
    }
  });

  app.post("/api/gemini/lab-partner", async (req, res) => {
    try {
      const { message, history = [], workspaceContext } = req.body;
      if (!message) {
        return res.status(400).json({ error: "message parameter is required" });
      }

      const ai = getGeminiClient();

      const systemInstruction = `You are "Lab Partner", a workspace-aware research assistant embedded in the Economics Learning Lab econometrics platform. You can see a summary of the user's current dataset and every model they have run this session, provided to you as WORKSPACE CONTEXT (JSON).

CRITICAL RULES:
1. Only reference numbers, variables, dataset names, or diagnostic statistics that literally appear in the WORKSPACE CONTEXT JSON. Never invent, estimate, or extrapolate a value that is not present. If something isn't in the context, say you don't have that information.
2. Always answer in plain, conversational markdown text (short paragraphs, bullet points where helpful). NEVER reply with raw JSON or code blocks containing JSON — the user is reading this as chat, not consuming structured data.
3. The renderer does not support LaTeX. Use Unicode math notation only (e.g. "β", "R²", "p < 0.05"), never $...$ or \\frac{}{}.
4. When flagging a statistical issue (e.g. heteroscedasticity via Breusch-Pagan, non-normal residuals via Jarque-Bera, multicollinearity via VIF), cite the specific run and the specific statistic value from the context that supports the flag.
5. If the WORKSPACE CONTEXT has no runs yet, say so plainly and suggest the user run an analysis first.
6. Keep answers focused and useful — avoid generic econometrics lecturing unless asked; ground everything in the user's actual workspace.`;

      const contents = history.map((h: any) => ({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: h.text }]
      }));

      const contextJson = `\n\nWORKSPACE CONTEXT (JSON):\n${JSON.stringify(workspaceContext || {}, null, 2)}`;

      contents.push({
        role: 'user',
        parts: [{ text: message + contextJson }]
      });

      const response = await generateContentWithFallbackAndRetry(ai, {
        model: "deepseek-v4-pro",
        contents,
        config: {
          systemInstruction,
          temperature: 0.2,
        }
      });

      res.json({ response: response.text });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Lab Partner Error:", error);
      res.status(500).json({ error: error.message || "Failed to reach Lab Partner" });
    }
  });

  app.post("/api/gemini/specification-curve-summary", async (req, res) => {
    try {
      const { specifications, yVar, xVar } = req.body;
      const ai = getGeminiClient();

      let specsList = specifications;
      if (!Array.isArray(specsList) && specsList && typeof specsList === 'object') {
        specsList = (specsList as any).specifications || Object.values(specsList).find(Array.isArray) || [];
      }
      if (!Array.isArray(specsList)) {
        specsList = [];
      }

      const systemInstruction = `You are an elite econometric referee and professor. Your role is to write a highly precise, 1-2 paragraph academic summary of a Specification Curve Analysis (also known as Multiverse Analysis).
Focus on:
1. The range and median of the coefficient estimates for the focal variable.
2. The percentage of specifications that are statistically significant at the 5% level.
3. Specific choices or combinations of choices (like standard error adjustments, specific control sets, estimators, or outlier trims) that cause the coefficient to lose significance or flip signs.
4. Keep the tone clinical, objective, and highly scholarly (no marketing hype). Use plain-text ASCII notation for math (for example: beta, p-value, R^2); do NOT use LaTeX or combining Unicode accent characters.`;

      const prompt = `Please summarize the following specification curve results:
Focal Variable: ${xVar}
Dependent Variable: ${yVar}
Total specifications run: ${specsList.length}
Raw specifications summary statistics (as JSON): ${JSON.stringify(specsList.map((s: any) => ({
        estimate: s.estimate,
        pValue: s.pValue,
        seType: s.seType,
        outlierTrim: s.outlierTrim,
        estimator: s.estimator,
        controls: s.controls
      })).slice(0, 40))} (and many others...)

Please write a highly rigorous, 2-paragraph academic summary following this format:
"The estimated effect of ${xVar} on ${yVar} ranges from [X] to [Y] across [N] specifications, with a median estimate of [M]... The effect loses statistical significance when..."`;

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.2
        }
      });

      res.json({ 
        response: result.text,
        summary: result.text 
      });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Specification Curve Summary Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate AI summary of specification curve" });
    }
  });

  app.post("/api/gemini/digest", async (req, res) => {
    try {
      const { recentRuns = [] } = req.body;
      const ai = getGeminiClient();

      const prompt = `You are an econometrics research assistant. A researcher ran the following models this week: ${JSON.stringify(recentRuns)}. Write exactly 3 sentences: (1) summarize what methods and variables they used, (2) state their strongest finding with the specific coefficient and p-value, (3) give one methodological observation about robustness or specification choices. Be specific and academic in tone.
      
      CRITICAL RULE: If a statistic is not present in the provided RESULTS JSON, return null and never invent a value. Cite only numbers present in the raw output.`;

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          temperature: 0.3
        }
      });

      res.json({ digest: result.text || "" });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Research Digest Error:", error);
      res.status(500).json({ error: "AI digest failed" });
    }
  });

  app.post("/api/gemini/referee-report", async (req, res) => {
    try {
      const { history = [], datasetMetadata = {} } = req.body;
      const ai = getGeminiClient();

      // Rule-based checks to feed the prompt
      const ruleViolations: string[] = [];
      let hasHeteroMismatch = false;
      let hasR2Leakage = false;
      let hasMultiTesting = false;
      let hasWeakInstrument = false;
      let hasClusteringIssue = false;

      // 1. Check for heteroskedasticity with classical standard errors
      history.forEach((h: any) => {
        const results = h.results || {};
        const diagnostics = results.diagnostics || {};
        
        // BP test p-value < 0.05 means heteroskedasticity exists
        if (diagnostics.breuschPaganPValue < 0.05 && (!results.robust && !results.clusterVar)) {
          hasHeteroMismatch = true;
          ruleViolations.push(`Heteroskedasticity detected in ${h.specification} (Breusch-Pagan p = ${diagnostics.breuschPaganPValue?.toFixed(4)}) but classical standard errors were used.`);
        }

        // 2. Check for R-squared near 1 (potential data leakage)
        if (results.rSquared > 0.98) {
          hasR2Leakage = true;
          ruleViolations.push(`Suspiciously high R-squared of ${results.rSquared?.toFixed(4)} in ${h.specification}, suggesting potential data leakage, circular definition, or multicollinearity.`);
        }

        // 3. Check for weak instruments (F < 10) in 2SLS or IV models
        if (h.module === "Causal" && results.firstStageF !== undefined && results.firstStageF < 10) {
          hasWeakInstrument = true;
          ruleViolations.push(`First-stage F-statistic of ${results.firstStageF} is below the Stock-Yogo threshold of 10 in ${h.specification}, indicating weak instrument bias.`);
        }

        // 4. Check for small cluster count
        if (results.clusterVar && results.numClusters !== undefined && results.numClusters < 30) {
          hasClusteringIssue = true;
          ruleViolations.push(`Clustered standard errors used at the level of '${results.clusterVar}' in ${h.specification} but only ${results.numClusters} clusters exist. Inference is likely overconfident as G < 30.`);
        }
      });

      // 5. Multiple testing exposure (checking unique outcomes estimated)
      const outcomes = new Set(history.map((h: any) => h.results?.yVar || h.specification?.split("~")?.[0]?.trim()));
      if (outcomes.size >= 3) {
        hasMultiTesting = true;
        ruleViolations.push(`Multiple dependent variables (${outcomes.size}) were tested across the session. This inflates family-wise Type I error rate without a multiple-testing correction (e.g., Bonferroni or Benjamini-Hochberg).`);
      }

      // Add default seeds if history is empty or clean
      if (ruleViolations.length === 0) {
        ruleViolations.push("No explicit rule-based violations detected. Note possible standard threats like missing panel parallel-trends tests if DiD was used.");
      }

      const systemInstruction = `You are a hostile, highly analytical, and academically rigorous journal referee for a top-tier Economics journal (e.g., American Economic Review, Quarterly Journal of Economics).
Your job is to review the student's entire empirical analysis session and write a comprehensive referee report.
You must return a JSON response matching the following schema:
{
  "verdict": "A cynical, constructive, and demanding 3-paragraph executive summary of the paper's methodological gaps.",
  "reports": [
    {
      "id": "ref_1",
      "severity": "major" | "minor",
      "title": "Short title of the concern",
      "issue": "Detailed econometric description of the methodological flaw or risk.",
      "evidence": "What we saw in the session (e.g., 'In model 2, R2 is 0.99...', 'Heteroskedasticity is present but classical errors were used...').",
      "suggestion": "Exact step-by-step fix in the app (e.g., 'Switch standard errors to HC3', 'Include year fixed effects', 'Add a first-stage F-statistic diagnostic check')."
    }
  ]
}

CORE RULES:
- If a statistic is not present in the SESSION HISTORY OF ESTIMATED MODELS, return null and never invent a value.
- Ensure all suggestions link to real actions or tools available in the Economics Learning Lab. Stay in character: demanding, precise, and deeply knowledgeable about identification and causal inference. No LaTeX math inside JSON.`;

      const prompt = `Review the following econometric history and session details:
STATED RESEARCH CONTEXT: ${JSON.stringify(datasetMetadata)}
SESSION HISTORY OF ESTIMATED MODELS:
${JSON.stringify(history.map((h: any) => ({
  module: h.module,
  specification: h.specification,
  rSquared: h.results?.rSquared,
  n: h.results?.n,
  robust: h.results?.robust,
  clusterVar: h.results?.clusterVar,
  diagnostics: h.results?.diagnostics
})))}

RULE-BASED METHODOLOGICAL VIOLATIONS SEEDED FROM RUNTIME:
${ruleViolations.map((v, i) => `${i+1}. ${v}`).join("\n")}

Please generate the referee report conforming exactly to the JSON schema.`;

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              verdict: { type: Type.STRING },
              reports: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    severity: { type: Type.STRING, enum: ["major", "minor"] },
                    title: { type: Type.STRING },
                    issue: { type: Type.STRING },
                    evidence: { type: Type.STRING },
                    suggestion: { type: Type.STRING }
                  },
                  required: ["id", "severity", "title", "issue", "evidence", "suggestion"]
                }
              }
            },
            required: ["verdict", "reports"]
          }
        }
      });

      res.json(JSON.parse((result.text || '').trim()));
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Referee Report Error:", error);
      res.status(500).json({ error: error.message || "Failed to compile AI referee report" });
    }
  });

  app.post("/api/ai/explain", async (req, res) => {
    try {
      const { result, type, mode, researchQuestion, format } = req.body;
      const ai = getGeminiClient();

      let systemPrompt = `You are an academic economist. Translate raw statistical and econometric indices into structured, rigorous, and highly readable explanations.
CRITICAL MANDATE: NEVER invent, hallucinate, or extrapolate any statistical values, coefficient sizes, standard errors, t-statistics, or p-values. You are strictly restricted to the raw model statistics provided in the prompt. If a statistical value is not present in the raw results, do NOT mention it or refer to it. Your explanation must be 100% mathematically and factually faithful to the raw input.`;
      
      if (format === 'apa') {
        systemPrompt = `You are an academic economist. Write a results paragraph in strict APA 7th edition format. State the test used, degrees of freedom, statistic value, p-value, and effect size. Use past tense. Do not interpret causal claims unless an experimental design is described. Write in APA 7th edition format. Include: test statistic name, value to 2 decimal places, degrees of freedom in parentheses, exact p-value (or p < .001), and effect size where calculable.
CRITICAL MANDATE: NEVER invent, hallucinate, or extrapolate any statistical values, coefficient sizes, standard errors, t-statistics, or p-values. You are strictly restricted to the raw model statistics provided in the prompt. If a statistical value is not present in the raw results, do NOT mention it or refer to it. Your explanation must be 100% mathematically and factually faithful to the raw input.`;
      }

      const prompt = `
        Write a rigorous, professional APA-style (American Psychological Association) results paragraph in academic English for an Economics research paper. 
        Here are the model statistics and specifications:
        - Framework/Model Type: ${type || 'Econometric Model'}
        - Research Question Context: ${researchQuestion ? JSON.stringify(researchQuestion) : 'none'}
        - User Learning Mode: ${mode || 'student'}
        - Raw Results: ${JSON.stringify(result || {})}

        Guidelines:
        - Reference specific coefficient sizes, direction of relationship, t/z stats, and p-values in APA style (e.g., b = X, t(df) = Y, p = Z).
        - Do not write standard templates or generic lists. Provide an elegant academic prose paragraph.
        - Restrict discussion purely to the economics domain.
        - Keep the paragraph cohesive and ready for peer-reviewed journal submission.
      `;

      const response = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          systemInstruction: systemPrompt
        }
      });

      const generatedText = response.text || "";

      // Post-hoc Verification Engine
      const extractAllNumbers = (text: string): number[] => {
        const regex = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|-?\.\d+(?:[eE][+-]?\d+)?/g;
        const matches = text.match(regex);
        if (!matches) return [];
        return matches.map(m => parseFloat(m));
      };

      const rawNumbers = extractAllNumbers(JSON.stringify(result || {}));
      const generatedNumbers = extractAllNumbers(generatedText);
      const unmatchedNumbers: number[] = [];

      for (const num of generatedNumbers) {
        const absoluteNum = Math.abs(num);
        // Exclude common thresholds and standard scale integers
        if ([0, 1, 2, 3, 4, 5, 10, 100, 0.05, 0.01, 0.10, 0.001, 1.96, 2.58].includes(absoluteNum)) {
          continue;
        }

        let matched = false;
        for (const rawVal of rawNumbers) {
          if (Math.abs(num - rawVal) < 1e-9) {
            matched = true;
            break;
          }
          // Check for rounding down to 4 decimal places
          for (let k = 1; k <= 4; k++) {
            const roundedRaw = parseFloat(rawVal.toFixed(k));
            if (Math.abs(num - roundedRaw) < 1e-9) {
              matched = true;
              break;
            }
          }
          if (matched) break;
        }
        if (!matched) {
          unmatchedNumbers.push(num);
        }
      }

      let responseText = generatedText;
      if (unmatchedNumbers.length > 0) {
        responseText += `\n\n*âš ï¸ Post-Hoc Verification Warning: The following numbers in the generated prose could not be verified against the raw input dataset and may be hallucinated: ${Array.from(new Set(unmatchedNumbers)).join(", ")}.*`;
      }

      res.json({ response: responseText });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("AI Explain Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate AI explanation" });
    }
  });

  app.post("/api/gemini/generate-quiz", async (req, res) => {
    try {
      const { contextType, contextValue, modelContext } = req.body;
      const ai = getGeminiClient();

      const prompt = `
        You are a Senior Econometrician and Teaching Professor.
        Generate a set of 5 to 10 high-quality multiple-choice questions for an econometrics quiz testing ${contextValue}.
        
        CONTEXT:
        Type: ${contextType}
        Topic/Value: ${contextValue}
        ${modelContext ? `Model Details: ${JSON.stringify(modelContext)}` : ''}

        REQUIREMENTS:
        1. Exactly 4 options per question.
        2. Difficulty levels: 'beginner', 'intermediate', or 'advanced'.
        3. Questions must be concise, academic, and focused on econometric theory, identification, or interpretation.
        4. Avoid specific numeric hallucinations unless they come directly from the provided model details.
        5. Include a short, clear explanation for why the correct answer is right.
      `;

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                question: { type: Type.STRING },
                options: { 
                  type: Type.ARRAY,
                  items: { type: Type.STRING }
                },
                correct: { type: Type.INTEGER },
                explanation: { type: Type.STRING },
                difficulty: { 
                  type: Type.STRING,
                  enum: ['beginner', 'intermediate', 'advanced']
                },
                topic: { type: Type.STRING }
              },
              required: ['question', 'options', 'correct', 'explanation', 'difficulty', 'topic']
            }
          }
        }
      });

      res.json(JSON.parse((result.text || '').trim()));
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Generate Quiz Error:", error);
      res.status(500).json({ error: error.message || "Failed to compile academic quiz questions" });
    }
  });

  app.post("/api/gemini/generate-report", async (req, res) => {
    try {
      const { historyItem, researchQuestion, datasetName } = req.body;
      const ai = getGeminiClient();

      const rqStr = typeof researchQuestion === 'object' ? JSON.stringify(researchQuestion) : researchQuestion;
      const modelRuns = [historyItem];
      const robustnessItems: any[] = [];

      const prompt = generateReportPrompt(rqStr, modelRuns, robustnessItems);

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
      });

      res.json({ response: result.text || "Report generation failed." });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Report Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate report" });
    }
  });

  app.post("/api/gemini/recommend-model", async (req, res) => {
    try {
      const { datasetMetadata, researchQuestion } = req.body;
      const ai = getGeminiClient();

      const prompt = `
        You are a Senior Econometrician and Teaching Professor.
        Analyze the provided dataset metadata and research context to recommend the most appropriate econometric model.

        DATASET METADATA:
        ${JSON.stringify(datasetMetadata)}

        RESEARCH CONTEXT:
        Research Question: ${researchQuestion.hypothesis || 'Comparing variables'}
        Stated Goal: ${researchQuestion.goal} (e.g., explanation, causal, forecasting)
        Data Structure: ${researchQuestion.structure} (e.g., cross-section, panel, time-series)

        RECOMMNEND ONE OF THESE MODULES: 'OLS', 'FE', 'ARIMA', 'Causal', 'Limited'.

        OUTPUT FORMAT (JSON):
        {
          "type": "Data Paradigm (e.g., Panel, Time Series)",
          "recommendation": "Model Name",
          "reason": "Detailed explanation of why this model is appropriate based on the data structure and research goal.",
          "warning": "Key pitfall or assumption to watch out for.",
          "target": "One of: ols, fe, arima, causal, limited"
        }
      `;

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              recommendation: { type: Type.STRING },
              reason: { type: Type.STRING },
              warning: { type: Type.STRING },
              target: { 
                type: Type.STRING,
                enum: ['ols', 'fe', 'arima', 'causal', 'limited']
              }
            },
            required: ['type', 'recommendation', 'reason', 'warning', 'target']
          }
        }
      });

      res.json(JSON.parse((result.text || '').trim()));
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Recommend Model Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate recommendation" });
    }
  });

  app.post("/api/gemini/recommend-power-design", async (req, res) => {
    try {
      const { studyDescription } = req.body;
      const ai = getGeminiClient();

      const prompt = `
        You are a Senior Econometrician advising on statistical power analysis study design.
        A researcher has briefly described their study. Recommend which power-analysis
        design module they should use.

        STUDY DESCRIPTION:
        ${studyDescription || 'No description provided.'}

        THE THREE AVAILABLE MODULES:
        - 'rct': RCT / Policy Evaluation -- comparing treatment vs. control groups, individually
          randomized, two-sample comparison of means (Cohen's d effect size).
        - 'ols_coef': Regression Coefficient -- estimating power to detect a continuous OLS slope
          coefficient in an observational regression, accounting for noise and multicollinearity (VIF).
        - 'cluster_did': Clustered Design / DiD -- treatment assigned at a group/cluster level
          (villages, schools, clinics, firms), requiring intraclass correlation (ICC) / design-effect
          adjustments, or a difference-in-differences rollout.

        RECOMMEND EXACTLY ONE OF: 'rct', 'ols_coef', 'cluster_did'.

        OUTPUT FORMAT (JSON):
        {
          "recommendation": "One of: rct, ols_coef, cluster_did",
          "confidence": "One of: high, medium, low",
          "reason": "Concise explanation (2-3 sentences) of why this design module fits the described study."
        }
      `;

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              recommendation: {
                type: Type.STRING,
                enum: ['rct', 'ols_coef', 'cluster_did']
              },
              confidence: {
                type: Type.STRING,
                enum: ['high', 'medium', 'low']
              },
              reason: { type: Type.STRING }
            },
            required: ['recommendation', 'confidence', 'reason']
          }
        }
      });

      res.json(JSON.parse((result.text || '').trim()));
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Recommend Power Design Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate power design recommendation" });
    }
  });

  app.post("/api/gemini/generate-meta-analysis", async (req, res) => {
    try {
      const { history, researchQuestion, dataset } = req.body;
      const ai = getGeminiClient();

      const modelRuns = (history || []).map((h: any) => ({
        moduleName: h.module,
        specification: h.specification,
        results: h.results
      }));

      const basePrompt = generateMetaAnalysisPrompt(modelRuns);
      const prompt = `
        ${basePrompt}

        CRITICAL FAITHFULNESS MANDATE:
        NEVER invent, hallucinate, extrapolate, or estimate any statistical indicators, standard errors, R-squared values, sample sizes, or regression coefficients that are missing from the inputs.
        If a statistic (like R-squared, F-stat, or sample size) is not explicitly present in the results of a specific model in the input array, you MUST label it as "N/A" or "Not Reported" in the comparison table. Do NOT fabricate plausible values.

        TASK:
        Generate the synthesized report and divide it into four sections matching the following JSON schema:
        1. "abstract": A concise abstract summarizing the findings across all models.
        2. "results": A comparison of coefficients (robustness, signs, magnitudes), including a markdown Cross-Model Summary Table.
        3. "diagnostics": A summary of model fit, Best Specification choice, and any Red Flags across specifications.
        4. "implications": The final collective takeaways and recommended next steps for future research.

        Ensure all markdown within JSON values is clean and properly formatted.
      `;

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              abstract: { type: Type.STRING },
              results: { type: Type.STRING },
              diagnostics: { type: Type.STRING },
              implications: { type: Type.STRING }
            },
            required: ["abstract", "results", "diagnostics", "implications"]
          }
        }
      });

      res.json(JSON.parse((result.text || '').trim()));
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Meta Analysis Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate meta analysis" });
    }
  });

  app.post("/api/gemini/stats-interpreter", async (req, res) => {
    try {
      const { toolType, analysisType, rawOutput, researchContext } = req.body;
      if (!rawOutput) {
        return res.status(400).json({ error: "Raw statistical output is required" });
      }

      const ai = getGeminiClient();

      let responseSchema: any;
      let promptInstructionCustom = "";

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
      } else if (analysisType === "Factor Analysis") {
        promptInstructionCustom = `The analysis type is Factor Analysis. Instead of standard regression coefficients, you must return loadings and variance details in the "factorAnalysis" field.
The "factorAnalysis" object must contain:
- "loadings": An array of objects for each variable, each containing:
  - "variable": Name of the indicator/variable (e.g., "x1")
  - "loading": Principal factor loading (e.g., "0.8412" or null if absent)
  - "uniqueness": Uniqueness value (e.g., "0.2924" or null if absent)
- "varianceExplained": An array of objects, each containing:
  - "factor": Factor identifier (e.g., "Factor1")
  - "eigenvalue": Eigenvalue (e.g., "3.412" or null if absent)
  - "variancePercent": Percentage of variance explained (e.g., "45.12" or null if absent)
  - "cumulativePercent": Cumulative percentage explained (e.g., "45.12" or null if absent)

Keep the "coefficients" field empty or omit it. The "factorAnalysis" field is mandatory.`;

        responseSchema = {
          type: Type.OBJECT,
          properties: {
            factorAnalysis: {
              type: Type.OBJECT,
              properties: {
                loadings: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      variable: { type: Type.STRING },
                      loading: { type: Type.STRING },
                      uniqueness: { type: Type.STRING }
                    },
                    required: ["variable", "loading", "uniqueness"]
                  }
                },
                varianceExplained: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      factor: { type: Type.STRING },
                      eigenvalue: { type: Type.STRING },
                      variancePercent: { type: Type.STRING },
                      cumulativePercent: { type: Type.STRING }
                    },
                    required: ["factor", "eigenvalue", "variancePercent", "cumulativePercent"]
                  }
                }
              },
              required: ["loadings", "varianceExplained"]
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
          required: ["factorAnalysis", "diagnostics", "assumptions", "apaParagraph"]
        };
      } else {
        // Standard regression models (OLS, Robust OLS, WLS, Logit, Probit, Panel FE, Panel RE, IV, DiD, Poisson, Tobit, Quantile, ARIMA, Cox PH, Chi-square etc.)
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

      const systemInstruction = `You are a Senior Statistician and Applied Econometrician. Your role is to interpret raw statistical outputs from popular data tools (R, SPSS, Stata, Python) and convert them into a highly structured, mathematically precise, and publication-ready academic format.

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
        RESEARCH CONTEXT (OPTIONAL): ${researchContext || "None provided"}
        
        RAW STATISTICAL OUTPUT:
        ${rawOutput}
      `;

      const result = await ai.models.generateContent({
        model: "deepseek-v4-pro",
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.1,
          responseMimeType: "application/json",
          responseSchema
        }
      });

      const responseData = JSON.parse((result.text || '').trim());

      // Helper function to extract all decimal numbers (as strings) from an object/JSON
      const extractResponseDecimals = (obj: any): string[] => {
        const decimals = new Set<string>();
        const decimalRegex = /-?\d+\.\d+(?:[eE][+-]?\d+)?|-?\.\d+(?:[eE][+-]?\d+)?/g;

        const recurse = (val: any) => {
          if (val === null || val === undefined) return;
          if (typeof val === 'string') {
            const matches = val.match(decimalRegex);
            if (matches) {
              for (const m of matches) {
                decimals.add(m);
              }
            }
          } else if (typeof val === 'number') {
            if (val % 1 !== 0) {
              decimals.add(val.toString());
            }
          } else if (Array.isArray(val)) {
            for (const item of val) {
              recurse(item);
            }
          } else if (typeof val === 'object') {
            for (const key of Object.keys(val)) {
              recurse(val[key]);
            }
          }
        };

        recurse(obj);
        return Array.from(decimals);
      };

      // Helper to extract all numbers (including integers and decimals) from raw text
      const extractAllNumbers = (text: string): number[] => {
        const regex = /-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|-?\.\d+(?:[eE][+-]?\d+)?/g;
        const matches = text.match(regex);
        if (!matches) return [];
        return matches.map(m => parseFloat(m));
      };

      // Helper to get number of decimal places of a string decimal representation
      const getDecimalPlaces = (str: string): number => {
        if (str.includes('e') || str.includes('E')) {
          const parts = str.toLowerCase().split('e');
          const base = parts[0] || '';
          const exp = parseInt(parts[1] || '0', 10);
          const baseDecimals = base.includes('.') ? (base.split('.')[1] || '').length : 0;
          return Math.max(0, baseDecimals - exp);
        }
        if (str.includes('.')) {
          return str.split('.').pop()!.length;
        }
        return 0;
      };

      const rawNumbers = extractAllNumbers(rawOutput);
      const responseDecimals = extractResponseDecimals(responseData);
      const warningsSet = new Set<string>();

      for (const respStr of responseDecimals) {
        const respVal = parseFloat(respStr);
        if (isNaN(respVal)) continue;

        const k = getDecimalPlaces(respStr);
        let matched = false;

        for (const rawVal of rawNumbers) {
          // Exact match
          if (Math.abs(respVal - rawVal) < 1e-9) {
            matched = true;
            break;
          }

          // Rounding check
          if (k > 0) {
            try {
              const roundedRaw = parseFloat(rawVal.toFixed(k));
              const roundedResp = parseFloat(respVal.toFixed(k));
              if (Math.abs(roundedRaw - roundedResp) < 1e-9) {
                matched = true;
                break;
              }
            } catch (e) {
              // Ignore toFixed range/invalid values
            }
          }
        }

        if (!matched) {
          warningsSet.add(`Value ${respStr} not found in your pasted output — verify before use.`);
        }
      }

      responseData.warnings = Array.from(warningsSet);
      res.json(responseData);
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Stats Interpreter Error:", error);
      res.status(500).json({ error: error.message || "Failed to interpret statistical output" });
    }
  });

  app.post("/api/gemini/generate-manuscript-section", async (req, res) => {
    try {
      const { section, historyItem, researchQuestion, dataset, targetJournal } = req.body;
      const ai = getGeminiClient();

      let sectionKey: "abstract" | "introduction" | "literature_review" | "methodology" | "results" | "discussion" | "conclusion" = "introduction";
      const s = String(section || "").toLowerCase();
      if (s.includes("abstract")) {
        sectionKey = "abstract";
      } else if (s.includes("method")) {
        sectionKey = "methodology";
      } else if (s.includes("result")) {
        sectionKey = "results";
      } else if (s.includes("diagnost") || s.includes("limit") || s.includes("discuss")) {
        sectionKey = "discussion";
      } else if (s.includes("policy") || s.includes("conclud") || s.includes("implication")) {
        sectionKey = "conclusion";
      } else if (s.includes("lit") || s.includes("review")) {
        sectionKey = "literature_review";
      }

      const targetJournalName = targetJournal || "Journal of Development Economics";
      const tjLower = targetJournalName.toLowerCase();

      let wordCount = 1000;
      let styleGuidance = "standard academic format";

      if (tjLower.includes("aer") || tjLower.includes("american economic review") ||
          tjLower.includes("qje") || tjLower.includes("quarterly journal of economics") ||
          tjLower.includes("jpe") || tjLower.includes("journal of political economy")) {
        // AER/QJE/JPE: 10,000–12,000 words total, very technical, referee-level
        const targets = {
          abstract: 250,
          introduction: 1500,
          literature_review: 2500,
          methodology: 2000,
          results: 2000,
          discussion: 2000,
          conclusion: 750
        };
        wordCount = targets[sectionKey] || 1500;
        styleGuidance = "very technical, referee-level style with extreme mathematical/rigorous focus";
      } else if (tjLower.includes("jde") || tjLower.includes("journal of development economics") ||
                 tjLower.includes("jeem") || tjLower.includes("journal of environmental economics") ||
                 tjLower.includes("ej") || tjLower.includes("economic journal") ||
                 tjLower.includes("review of economic studies") || tjLower.includes("restud") ||
                 tjLower.includes("journal of labor economics") || tjLower.includes("jle")) {
        // JDE/JEEM/EJ/REStud/JLE: 8,000–10,000 words, applied focus
        const targets = {
          abstract: 200,
          introduction: 1200,
          literature_review: 2000,
          methodology: 1800,
          results: 1800,
          discussion: 1500,
          conclusion: 500
        };
        wordCount = targets[sectionKey] || 1200;
        styleGuidance = "applied empirical focus with robust policy mechanisms and descriptive real-world context";
      } else {
        // Other: 8,000 words, standard academic format
        const targets = {
          abstract: 150,
          introduction: 1000,
          literature_review: 1800,
          methodology: 1500,
          results: 1500,
          discussion: 1200,
          conclusion: 500
        };
        wordCount = targets[sectionKey] || 1000;
        styleGuidance = "standard academic format, accessible but rigorous analysis";
      }

      const rqStr = typeof researchQuestion === 'object' ? JSON.stringify(researchQuestion) : researchQuestion;
      const modelRuns = [{
        moduleName: historyItem.module,
        specification: historyItem.specification,
        results: historyItem.results,
        notes: historyItem.notes
      }];

      let prompt = generateManuscriptSectionPrompt(sectionKey, {
        researchQuestion: rqStr,
        modelRuns,
        journalTarget: targetJournalName,
        wordCount
      });

      // Append specific style guidance for consistency
      prompt += `\nAdditional journal styling requirement: Please draft this section in a ${styleGuidance} suited for ${targetJournalName}.\n`;

      const result = await generateContentWithFallbackAndRetry(ai, {
        model: "deepseek-v4-pro",
        contents: prompt,
      });

      res.json({ response: result.text || "Generation failed." });
    } catch (error: any) {
      if (error?.status !== 429 && !error?.message?.includes('429')) console.error("Manuscript Generation Error:", error);
      res.status(500).json({ error: error.message || "Failed to generate manuscript section" });
    }
  });

  app.post("/api/gemini/recommended-readings", async (req, res) => {
    const stageId = req.body.stageId || "ideation";
    try {
      const { stageLabel } = req.body;
      if (!req.body.stageId || !stageLabel) {
        return res.status(400).json({ error: "stageId and stageLabel parameters are required" });
      }

      // Map stages to specific focused prompts for highly targeted economics papers search
      let searchFocus = "";
      if (stageId === 'ideation') {
        searchFocus = "seminal papers in economics, literature review methodology, theoretical modeling, or hypothesis formulation. Search for classic methodology papers like Milton Friedman's 'The Methodology of Positive Economics' or papers on how to do economics research.";
      } else if (stageId === 'data-cleaning') {
        searchFocus = "econometrics data cleaning, panel data construction, data prep guidelines, or dealing with measurement errors. Search for resources like Joshua Angrist & JÃ¶rn-Steffen Pischke's 'Mostly Harmless Econometrics' chapters on data, or Wooldridge's data guides.";
      } else if (stageId === 'regression') {
        searchFocus = "seminal econometrics papers on regression modeling, instrumental variables, panel data estimation, fixed effects, or causal inference. Search for papers by Joshua Angrist, Guido Imbens, Donald Rubin, or Wooldridge.";
      } else if (stageId === 'manuscript') {
        searchFocus = "guides for writing and formatting economics papers, constructing regression tables, and styling econ manuscripts. Search for John Cochrane's 'Writing Tips for Ph.D. Students' or Claudia Goldin's writing advice, and standard academic guidelines.";
      } else {
        searchFocus = "seminal papers in economic theory and methodology.";
      }

      // Search first, with Tavily -- real results the model can't fabricate
      // around, since generation only ever sees what search actually found.
      const tavilyKey = process.env.TAVILY_API_KEY;
      if (!tavilyKey) {
        throw new Error("TAVILY_API_KEY environment variable is required. Please provision it in Settings > Secrets.");
      }

      const tavilyResponse = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: tavilyKey,
          query: `${searchFocus} for the "${stageLabel}" phase of economics research`,
          max_results: 5,
        }),
      });

      if (!tavilyResponse.ok) {
        const errText = await tavilyResponse.text();
        throw new Error(`Tavily search error (${tavilyResponse.status}): ${errText}`);
      }

      const tavilyData = await tavilyResponse.json();
      const searchResults: { title: string; url: string; content: string }[] = (tavilyData.results || [])
        .filter((r: any) => r.url && r.title)
        .slice(0, 5)
        .map((r: any) => ({ title: r.title, url: r.url, content: (r.content || "").slice(0, 500) }));

      if (searchResults.length === 0) {
        throw new Error("Tavily returned no search results for this stage.");
      }

      // Links displayed to the user are built directly from the real search
      // results, never parsed out of the model's response -- what's shown is
      // guaranteed to be what Tavily actually found, not what the model claims
      // it found.
      const links = searchResults.map(r => ({ title: r.title, url: r.url }));

      const ai = getGeminiClient();

      const systemInstruction = `You are an elite Academic Research Librarian specializing in Economics and Econometrics.
Your task is to write a concise, professional paragraph for each of the search results provided below, summarizing its core economic insight, theoretical or econometric contribution, and why an economics student in the "${stageLabel}" phase must read it.
CRITICAL MANDATE: You may ONLY discuss the search results listed below. Do NOT add, substitute, invent, or reference any publication, author, title, or URL that is not explicitly listed. If a listed result's content doesn't give enough detail to write a confident paragraph, write a shorter one grounded only in what's given rather than inventing detail.
Always return response in clean Markdown. Include inline links with the syntax [Title](URL) using the exact URLs given. Keep your tone encouraging, scholarly, and helpful.`;

      const prompt = `Write recommended-reading summaries for the "${stageLabel}" research phase using ONLY these real search results (JSON):
${JSON.stringify(searchResults, null, 2)}`;

      const result = await generateContentWithFallbackAndRetry(ai, {
        contents: prompt,
        config: {
          systemInstruction,
          temperature: 0.3,
        }
      });

      res.json({
        response: result.text || "",
        links
      });
    } catch (error: any) {
      console.warn("Recommended Readings Error (Tavily/DeepSeek -- using curated academic fallback):", error.message);
      
      const fallbacks: Record<string, { response: string, links: { title: string, url: string }[] }> = {
        'ideation': {
          response: `### ðŸ“š Seminal Readings: Ideation Phase

1. **"How to Build an Economic Model in Your Spare Time"** by Hal R. Varian (1997)
   An absolute masterpiece for early-stage economists on the art of crafting simple, elegant economic models. Varian demystifies the theoretical modeling process and teaches you to think intuitively before running complex mathematics.
   
2. **"The Methodology of Positive Economics"** by Milton Friedman (1953)
   A classic essay laying down the epistemological and methodological foundations of economic research, explaining how predictive power, realistic assumptions, and empirical verification relate to economic theory.
   
3. **"Writing Tips for Ph.D. Students"** by John H. Cochrane (2005)
   Contains invaluable advice on how to structure a research proposal, formulate a sharp hypothesis, structure an abstract, and write introduction sections that make contributions clear from the outset.`,
          links: [
            { title: "Hal Varian - How to Build an Economic Model (PDF)", url: "https://microeconomics.ca/hal_varian/how_to_build_an_economic_model_1997.pdf" },
            { title: "John Cochrane - Writing Tips for Ph.D. Students (PDF)", url: "https://faculty.chicagobooth.edu/john.cochrane/research/papers/phd_paper_writing_tips.pdf" },
            { title: "Milton Friedman - The Methodology of Positive Economics (JSTOR)", url: "https://www.jstor.org/stable/2224097" }
          ]
        },
        'data-cleaning': {
          response: `### ðŸ§¹ Seminal Readings: Data Cleaning & Prep

1. **"Mostly Harmless Econometrics"** by Joshua Angrist & JÃ¶rn-Steffen Pischke (2009)
   Chapters 1-3 provide an excellent introduction to empirical strategies and how to structure your sample, handle data, and understand the selection bias challenge.
   
2. **"Econometric Analysis of Cross Section and Panel Data"** by Jeffrey M. Wooldridge (2010)
   The definitive textbook guide on panel data construction, panel attrition, longitudinal structuring, and how to balance datasets without losing valuable information.
   
3. **"Development Research Group Data Guidelines"** by World Bank
   Offers clear, reproducible guidelines on structuring panel files, dealing with missing values, coding outliers, and establishing high-grade data pipelines.`,
          links: [
            { title: "Mostly Harmless Econometrics Companion Site", url: "https://www.mostlyharmlesseconometrics.com/" },
            { title: "Wooldridge - Econometric Analysis (MIT Press)", url: "https://mitpress.mit.edu/9780262232586/econometric-analysis-of-cross-section-and-panel-data/" },
            { title: "World Bank Development Economics Research Group", url: "https://www.worldbank.org/en/research" }
          ]
        },
        'regression': {
          response: `### ðŸ“ˆ Seminal Readings: Regression & Causal Inference

1. **"Identification of Causal Effects Using Instrumental Variables"** by Joshua Angrist, Guido Imbens, & Donald Rubin (1996)
   The landmark paper establishing the LATE (Local Average Treatment Effect) framework, reconciling regression frameworks with potential outcome models.
   
2. **"Regression Discontinuity Designs in Economics"** by Guido Imbens & Thomas Lemieux (2008)
   A comprehensive practical review paper detailing how to implement, test assumptions, and present sharp and fuzzy regression discontinuity designs.
   
3. **"How Much Should We Trust Differences-in-Differences Estimates?"** by Marianne Bertrand, Esther Duflo, & Sendhil Mullainathan (2004)
   A crucial paper highlighting problems of serial correlation in panel difference-in-differences regression models, along with solutions.`,
          links: [
            { title: "Angrist, Imbens, Rubin - IV Identification (JSTOR)", url: "https://www.jstor.org/stable/2291629" },
            { title: "Imbens & Lemieux - Regression Discontinuity (ScienceDirect)", url: "https://www.sciencedirect.com/science/article/pii/S030440760700185X" },
            { title: "Bertrand, Duflo, Mullainathan - DiD Serial Correlation (OUP)", url: "https://academic.oup.com/qje/article-abstract/119/1/249/1876067" }
          ]
        },
        'manuscript': {
          response: `### âœï¸ Seminal Readings: Manuscript & Publication

1. **"Writing Tips for Ph.D. Students"** by John H. Cochrane (2005)
   Invaluable advice on presenting regression results, table layouts, formatting figures, and structuring economic narratives clearly.
   
2. **"The Rhetoric of Economics"** by Deirdre N. McCloskey (1985)
   An insightful critique of how economists write and argue, emphasizing clarity, precision, and persuasive empirical and mathematical arguments.
   
3. **"American Economic Review Style Guide"**
   The primary guidelines on writing conventions, mathematical formatting, tables of coefficients, standard error notation, and references.`,
          links: [
            { title: "John Cochrane - Writing Tips for Ph.D. Students (PDF)", url: "https://faculty.chicagobooth.edu/john.cochrane/research/papers/phd_paper_writing_tips.pdf" },
            { title: "Deirdre McCloskey - The Rhetoric of Economics (JSTOR)", url: "https://www.jstor.org/stable/2725515" },
            { title: "American Economic Association (AEA) Style Guide", url: "https://www.aeaweb.org/journals/policies/style-guide" }
          ]
        }
      };

      const fallback = (fallbacks[stageId] || fallbacks['ideation']) as { response: string; links: any[] };
      res.json({
        response: fallback.response + "\n\n*(Note: Showing pre-curated seminal academic literature. The real-time AI search is currently offline due to monthly API quota restrictions.)*",
        links: fallback.links
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Econometrics Lab server running at http://localhost:${PORT}`);
  });
}

startServer();
