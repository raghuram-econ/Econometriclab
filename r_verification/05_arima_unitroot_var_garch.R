# =============================================================================
# ARIMA, KPSS / Phillips-Perron, VAR, GARCH
# Fixtures: arima_series.csv (no header, true ARMA(1,1): ar=0.6, ma=0.3)
#           kpss_pp_series.csv (no header, stationary AR(1) series)
#           var_series.csv (y1,y2 header, synthetic bivariate VAR(2) system)
#           garch_series.csv (no header)
# =============================================================================
# install.packages(c("forecast", "urca", "vars", "rugarch"))
library(forecast)
library(urca)
library(vars)
library(rugarch)

# --- ARIMA: pure AR(1) (your app's browser engine only supports q=0) ---
arima_x <- scan("../src/lib/econometrics/__tests__/fixtures/arima_series.csv")
ar1 <- Arima(arima_x, order = c(1, 0, 0))
cat("=== AR(1) only ===\n"); print(ar1)
# Compare: ar1 coefficient ~0.7305 (misspecified vs true 0.6, because the
# true DGP is ARMA(1,1) -- this is the correct comparison point, see the
# doc-comment on runARIMA in the app's source)

# --- Full ARMA(1,1), for reference against the Python /api/python/arima-full
# endpoint (NOT the browser engine, which deliberately rejects q>0) ---
arma11 <- Arima(arima_x, order = c(1, 0, 1))
cat("\n=== Full ARMA(1,1) (compare to the Python backend, not the browser) ===\n")
print(arma11)
# Compare: ar.L1 ~0.577, ma.L1 ~0.351 (statsmodels values from reference.test.ts)

# --- KPSS & Phillips-Perron ---
kpss_x <- scan("../src/lib/econometrics/__tests__/fixtures/kpss_pp_series.csv")
cat("\n=== KPSS (level) ===\n"); print(ur.kpss(kpss_x, type = "mu", lags = "short"))
# Compare: kpssStat ~0.05828 (level/constant-only case)
cat("\n=== KPSS (trend) ===\n"); print(ur.kpss(kpss_x, type = "tau", lags = "short"))
# Compare: kpssStat ~0.03467

cat("\n=== Phillips-Perron ===\n"); print(pp.test(kpss_x))
# Compare: Z-tau statistic ~ -6.770186 (from the arch package reference)

# --- VAR(2) ---
var_df <- read.csv("../src/lib/econometrics/__tests__/fixtures/var_series.csv")
v <- VAR(var_df[, c("y1","y2")], p = 2, type = "const")
cat("\n=== VAR(2) ===\n"); print(summary(v))
# Compare: y1 eq: Intercept -0.037533, y1.l1 0.385776, y2.l1 0.234644,
#                 y1.l2 0.012315, y2.l2 -0.027766
#          AIC -0.049856, BIC 0.116218 (from statsmodels VAR reference)

# --- GARCH(1,1) ---
garch_x <- scan("../src/lib/econometrics/__tests__/fixtures/garch_series.csv")
spec <- ugarchspec(variance.model = list(model = "sGARCH", garchOrder = c(1,1)),
                    mean.model = list(armaOrder = c(0,0), include.mean = TRUE))
g <- ugarchfit(spec, garch_x)
cat("\n=== GARCH(1,1) ===\n"); print(g)
# Compare (joint-MLE reference, arch package): omega 0.079703, alpha 0.101989,
# beta 0.807517. Your app's BROWSER engine is honestly documented as a
# "sanity check, few % difference expected" against this -- it uses a
# two-step (mean then GARCH) fit, not joint MLE. The Python /api/python/garch
# endpoint (arch package) should match this R output closely.
# =============================================================================
