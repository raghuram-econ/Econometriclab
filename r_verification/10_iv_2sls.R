# =============================================================================
# Instrumental Variables / 2SLS (Mroz wife earnings)
# Fixture: mroz_iv.csv (hearnw, educw, educwm)
# install.packages("AER")
# =============================================================================
# Specification: hearnw ~ 1 + [educw ~ educwm]   (wife's hourly earnings
# regressed on her education, instrumented by her mother's education)
#
# This is the exact same fixture and spec as
# src/lib/econometrics/__tests__/reference.test.ts ("IV/2SLS against
# linearmodels (Mroz wife earnings)"), which checks the app's
# estimateModel('IV', ...) function against Python's
# linearmodels.iv.IV2SLS(cov_type='unadjusted', debiased=True) to <0.01%
# (coefficients) / <0.1% (SEs) relative error. This script is a second,
# independent cross-check using R's AER::ivreg on identical data.

library(AER)

df <- read.csv("../src/lib/econometrics/__tests__/fixtures/mroz_iv.csv")
cat("n =", nrow(df), "\n")

fit <- ivreg(hearnw ~ educw | educwm, data = df)
cat("\n=== AER::ivreg, classical (homoskedastic) SEs ===\n")
print(summary(fit, vcov = vcov(fit)))

cat("\nR-squared:", summary(fit)$r.squared, "\n")

# --- Expected values (from reference.test.ts, computed live 2026-07-24 via
# Python linearmodels.IV2SLS with debiased=True -- i.e. small-sample n/(n-k)
# corrected SEs, which is this codebase's convention and NOT linearmodels'
# or ivreg's default) ---
cat("\n=== Compare against app's estimateModel('IV', ...) ===\n")
cat("Intercept: coef = -1.249006361734, se = 1.402040593591\n")
cat("educw:     coef =  0.294914557975, se = 0.113738903031\n")
cat("R-squared: 0.08905683982385526\n")
cat("\nNote: ivreg's default SEs are asymptotic (n-denominator). The app\n")
cat("uses debiased/small-sample (n-k denominator) SEs, matching\n")
cat("linearmodels(debiased=True). To compare SEs apples-to-apples, scale\n")
cat("ivreg's reported SE by sqrt((n-k)/n) where n =", nrow(df), "and k = 2,\n")
cat("or equivalently scale the app's SE down by sqrt(n/(n-k)). Coefficients\n")
cat("require no adjustment and should match directly.\n")
# =============================================================================
