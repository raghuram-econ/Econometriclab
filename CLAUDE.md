# Econometrics Lab — Engineering Guide

A browser-based econometrics workbench (React/TS frontend, Express `server.ts`, FastAPI `backend/main.py`). Every rule below exists because it would have caught a real bug that shipped or nearly shipped in this repo — not generic best practice.

## Definition of "done" for a new estimator or AI feature

A feature is not done when the code compiles. It is done when all of these are true:

1. **Reuses tested primitives instead of hand-rolling math.** New estimators call existing tested functions (`estimateModel('IV', ...)`, `runOLS`, etc.) for their core math rather than re-deriving it inline. Most numerical bugs this project has had came from hand-rolled math duplicating logic that already existed and was already tested elsewhere.
2. **Verified against a real external reference**, not just internal self-consistency: R, Stata, `statsmodels`/`scipy` called directly inside the test (not through this app's own code), or a published worked example with cited numbers. Write the reference computation *inside the test file* so it's independent of the implementation being checked.
3. **All three integration layers are actually connected**, checked explicitly, not assumed from each layer compiling in isolation:
   - Python endpoint (`backend/main.py`)
   - Node proxy registration (`PYTHON_JSON_ROUTES` in `server.ts` for `/api/python/*`, or the direct `app.post` route for `/api/gemini/*` and `/api/ai/*`)
   - Frontend caller (`apiClient.ts` / `gemini.ts` function) actually invoked from a component, not just exported
   
   Run `diff <(grep -oP '@app\.post\("\K/python/[a-z-]+' backend/main.py | sort) <(grep -oP '"\K/python/[a-z-]+(?=",)' server.ts | sort)` — any output means a route exists on one side but not the other. Do the equivalent check for AI endpoints: grep every `app.post("/api/gemini/...")` / `/api/ai/...` in `server.ts`, then grep `src/` for an actual `fetch(...)` call to that same path from a `.tsx` component. An endpoint with a working `curl` response but zero UI callers is not done.
4. **Model/library names, slugs, and API attribute names are verified against the live provider**, not assumed or pattern-matched from memory. Before trusting a model slug, DataFrame column name, or SDK attribute a piece of code depends on, actually call the real API/library once and inspect the response — don't infer it from what "sounds right."
5. **`npx tsc --noEmit` and `npm test` both pass**, run by you in your own shell — not accepted from another agent's self-report without re-running.
6. **Honest-fallback pattern preserved for AI features**: every Gemini/OpenRouter-backed call must show a clearly-labeled fallback state (visually distinct, e.g. amber/"FALLBACK") if the real call fails — never a fabricated-looking confident answer. Never invent a statistic not present in the raw input; if a value isn't there, return `null`/`"N/A"`, don't estimate it.

## Before calling agent-produced work "verified"

An agent's summary describes what it intended to do, not necessarily what it did. Before accepting a background agent's report as done:
- Read the actual diff yourself.
- Re-run `tsc`/tests yourself, in your own shell/Python environment — not the agent's sandbox. A package installed inside an agent's sandbox does not persist to your own verification shell; if a test claims to pass, confirm the dependency is actually importable where *you* run it.
- If the agent's report and your own verification disagree, trust your own re-run.

## Concurrency

- **Check for a running deploy or another active session before starting work that touches shared files** (`server.ts`, `backend/main.py`, `useStore.ts` are hot spots). Run `git log --oneline -5` and `git status` first — if there's a recent commit you don't recognize, another session may be active on this repo right now. Read it before building on top of or alongside it.
- **Don't run multiple agents/sessions concurrently against overlapping files without coordination.** A real incident this project had: two concurrent background agents editing overlapping files caused a `git stash`/`stash pop` recovery in one agent to silently discard the other agent's already-completed work. If you must parallelize, partition by file, not by feature — never let two agents touch the same file in the same window.
- If you discover another session's uncommitted or freshly-committed work while starting a task, verify it independently (per the Definition of Done above) rather than either blindly trusting it or redoing it from scratch.

## Git discipline

- Never commit without being asked, every single time — a prior "yes" does not carry forward to the next change.
- Stage only the files that belong to the change being committed. When unrelated uncommitted work exists in the tree from another process, leave it alone — don't bundle it in, don't revert it, don't comment on it unless asked.
- Never push without being asked, every single time.
- Prefer new commits over `--amend`; never force-push without explicit instruction.

## Local dev commands

- `npm run dev` — Node/Express only (port 3000)
- `npm run dev:python` — FastAPI backend only (port 8000)
- `npm run dev:all` — both concurrently
- `npm run lint` — `tsc --noEmit`
- `npm test` — jest (frontend)
- `python -m pytest backend/tests/` — backend tests (run with the same Python your own shell resolves `python`/`pip` to — check `python -c "import <package>"` before trusting a test result that depends on it)

## Deployment

- Two independent Render services, both auto-deploy on push to `main`: `econometrics-lab` (Node, serves frontend + proxies AI/Python calls) and `econometrics-lab-python` (FastAPI backend). A change to `backend/main.py` needs the *python* service to redeploy, not just the Node one — check both services' Events tabs after pushing.
- Free-tier Render services spin down when idle; the first request after idle can take 50s+ and briefly shows a generic "Application loading" page. Don't mistake that for a broken deploy.
- Env vars live in each service's Render dashboard independently from local `.env` — a key working locally does not mean it's set in production, and vice versa.
- After deploying a change to an AI/OpenRouter-backed endpoint, verify the actual OpenRouter workspace **guardrail** (Settings → Guardrails → Model & Provider Access) allow-lists whatever model slug the code requests. A valid API key with a valid model slug still 404s if the workspace's guardrail restriction mode doesn't include that specific model.
