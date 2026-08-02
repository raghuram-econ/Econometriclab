# =============================================================================
# Poisson MLE and Negative Binomial  --  simulated count data
# Fixtures: poisson_series.csv (true beta = [0.5, 0.8, -0.4])
#           negbin_series.csv  (true beta = [0.6, 0.5, -0.3], true alpha = 0.8)
# =============================================================================
# install.packages("MASS")  # for glm.nb
library(MASS)

pois_df <- read.csv("../src/lib/econometrics/__tests__/fixtures/poisson_series.csv")
pois_fit <- glm(y ~ x1 + x2, data = pois_df, family = poisson())
cat("=== Poisson ===\n"); print(summary(pois_fit))
cat("logLik:", logLik(pois_fit), "\n")

# --- Compare against (verified in your app vs statsmodels) ---
# Intercept 0.499918 (se 0.042907) | x1 0.774022 (se 0.032904)
# x2 -0.402078 (se 0.033742)       | logLik -640.6564058743643

nb_df <- read.csv("../src/lib/econometrics/__tests__/fixtures/negbin_series.csv")
nb_fit <- glm.nb(y ~ x1 + x2, data = nb_df)
cat("\n=== Negative Binomial ===\n"); print(summary(nb_fit))
cat("logLik:", logLik(nb_fit), " | theta (=1/alpha):", nb_fit$theta, "\n")

# --- Compare against (verified in your app vs statsmodels) ---
# Intercept 0.519509 (se 0.060472) | x1 0.614028 (se 0.059012)
# x2 -0.297648 (se 0.058976)       | alpha 1.087239 | logLik -914.0682009148125
# =============================================================================
