# Independent R Verification

These scripts cross-check the app's econometric engine against **native R**
execution of the packages it's designed to match — going one step beyond the
Python-based verification already in `src/lib/econometrics/__tests__/`.

## Setup

1. Install [R](https://www.r-project.org/) and (recommended)
   [RStudio Desktop](https://posit.co/download/rstudio-desktop/).
2. Open this folder (`r_verification/`) as your working directory in R/RStudio.
3. Each script installs its own packages via a commented `install.packages(...)`
   line at the top — run that line once per package, then re-run the script.

## Scripts

| Script | Method | Fixture used | R package |
|---|---|---|---|
| `01_ols_longley.R` | OLS (NIST benchmark) | `longley.csv` | base R `lm` |
| `02_panel_fe_re.R` | Fixed/Random Effects, Hausman | `grunfeld.csv` | `plm` |
| `03_poisson_negbin.R` | Poisson, Negative Binomial | `poisson_series.csv`, `negbin_series.csv` | base R `glm`, `MASS::glm.nb` |
| `04_ridge_lasso_elasticnet.R` | Ridge, LASSO, Elastic Net | `penalized_series.csv` | `glmnet` |
| `05_arima_unitroot_var_garch.R` | ARIMA, KPSS/PP, VAR, GARCH | `arima_series.csv`, `kpss_pp_series.csv`, `var_series.csv`, `garch_series.csv` | `forecast`, `urca`, `vars`, `rugarch` |
| `06_did_and_matching.R` | Simple DiD, propensity matching | `did_synthetic.csv`, `psm_series.csv` | base R `lm`, manual (matches app's exact algorithm) |
| `07_quantile_regression.R` | Quantile regression | `engel.csv` | `quantreg` |
| `08_synthetic_control.R` | Synthetic Control | `synthetic_control_panel.csv` | `Synth` |
| `09_staggered_did.R` | Staggered DiD (Callaway-Sant'Anna) | `staggered_did_panel.csv` | `did` |

## How to use the output

Each script prints its own R results **and** the expected values as comments.
For scripts 01–07 those comments are copied directly from
`src/lib/econometrics/__tests__/reference.test.ts` (the same numbers your
app's automated test suite checks against). For scripts 08–09 the comments
are the exact output of the app's own Python engine (`pysyncon` / `csdid`)
re-run on the identical saved fixture, computed at the same time the
fixture was generated — so all nine scripts are genuine digit-for-digit (or
near-digit) checks against native R, using the exact same data in every
case. No script regenerates or simulates data itself.

## Citing this in your thesis

> "In addition to automated verification against Stata, statsmodels, and
> sklearn (see `reference.test.ts`), a subset of core methods were
> independently cross-checked against native R execution of the packages
> the platform is designed to match (`plm`, `glmnet`, `forecast`, `urca`,
> `vars`, `rugarch`, `quantreg`, `Synth`, `did`), using identical fixture
> data where available. Scripts are provided in `r_verification/`."
