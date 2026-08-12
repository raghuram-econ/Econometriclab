# Econometrics Lab

A browser-based econometrics workbench for **teaching and research**: run OLS through
dynamic-panel GMM and synthetic control on real data, get AI-guided plain-language
interpretation alongside the technical output, and export the exact Stata/R/Python code
needed to reproduce every result outside the app.

Live app: https://econometrics-lab.onrender.com

## For reviewers

Most estimators (OLS, Panel FE/RE, IV/2SLS, GLM, ARIMA/VAR/GARCH, Tobit, Heckman,
sharp/fuzzy RD via the browser engine, etc.) work immediately via "Continue as Guest" on
the live app, no account needed. A handful of estimators that run on the Python backend
(dynamic-panel GMM, Synthetic Control, Staggered DiD, and the `rdrobust`-equivalent
research-grade RD path) require signing in. A reviewer account with access to those is
available on request — see the JOSS review thread, or open an issue.

## What it does

**For learning:** every module ships guided context (when to use this method, what it
requires, common pitfalls), a plain-language explanation next to the technical
statistics for each result, and mistake detection that flags common specification
errors before you run them.

**For research:** a full estimator suite — OLS, Panel FE/RE, IV/2SLS, Regression
Discontinuity (rdrobust-grade), Difference-in-Differences (including Callaway-Sant'Anna
staggered adoption), dynamic-panel GMM (Arellano-Bond / Blundell-Bond), Synthetic
Control, GLM (Poisson/NegBin/Logit/Probit), Heckman selection, ARIMA/VAR/GARCH, Cox
proportional hazards, Tobit, and more — computed against real statistical packages
(`statsmodels`, `linearmodels`, `rdrobust`, `pydynpd`, `pysyncon`, `csdid`) rather than
reimplemented from scratch, and certified against NIST StRD benchmarks. Every result can
export replication code in Stata, R, and Python that reproduces the app's own numbers.

## Architecture

- **Frontend**: React + TypeScript (Vite)
- **Node server** (`server.ts`): serves the frontend and proxies AI-interpretation and
  Python-backend requests
- **Python backend** (`backend/main.py`): FastAPI service running the estimators that
  need a real statistical package rather than a browser-side implementation

## Getting started

**Prerequisites:** Node.js, Python 3.

```bash
npm install
cp .env.example .env.local   # fill in the keys you need — see comments in the file
npm run dev:all              # Node server (port 3000) + Python backend (port 8000)
```

Run only one side with `npm run dev` (Node) or `npm run dev:python` (Python).

Most estimators run entirely client-side and need no API keys. AI interpretation needs
`OPENROUTER_API_KEY`; a few Python-backend estimators (research-grade RD, GMM, Synthetic
Control, Staggered DiD) need the Python backend running locally or `PYTHON_BACKEND_URL`
pointed at one, and additionally require an authenticated (non-guest) session — see
[CONTRIBUTING.md](CONTRIBUTING.md) for local auth setup.

## Testing

```bash
npm test                        # frontend (Jest)
python -m pytest backend/tests/ # Python backend
npm run certify                 # NIST StRD numerical-accuracy certification
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Citing this software

If you use Econometrics Lab in your research or teaching, please cite it — see
[CITATION.cff](CITATION.cff).

## License

MIT — see [LICENSE](LICENSE).
