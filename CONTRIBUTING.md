# Contributing to Econometrics Lab

Thanks for considering a contribution. This project spans a React/TypeScript frontend,
an Express server, and a FastAPI Python backend for estimators that need a real
statistical package — see the Architecture section in [README.md](README.md) before
diving in.

## Setup

```bash
npm install
cp .env.example .env.local   # fill in keys as needed, see comments in the file
npm run dev:all
```

Guest mode covers the full estimator suite without any keys. A few Python-backend
estimators (research-grade RD, GMM, Synthetic Control, Staggered DiD) additionally need
the Python backend running locally (`npm run dev:python`) or `PYTHON_BACKEND_URL`
pointed at one.

## Before opening a pull request

- `npm run lint` (`tsc --noEmit`) and `npm test` must both pass.
- If you touch `backend/`, also run `python -m pytest backend/tests/`.
- New estimators or numerical logic should be verified against a real external
  reference (R, Stata, `statsmodels`/`scipy`, or a published worked example with cited
  numbers) inside the test file — not just checked for internal self-consistency.
- If a change affects an estimator's replication-code export (Stata/R/Python), verify
  the generated code actually reproduces the app's own computed numbers, not just that
  it's syntactically plausible.
- Keep PRs scoped to one change; unrelated formatting or refactors make review harder.

## Reporting bugs

Please include: the module/tab affected, the dataset or specification used, what you
expected vs. what you got, and — for numerical bugs — a reference value from another
source if you have one.

## Code of conduct

Be respectful and constructive. This is an educational and research tool used by
students and researchers at varying levels of statistical background — assume good
faith in issues and reviews.
