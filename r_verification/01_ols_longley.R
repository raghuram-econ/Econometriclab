# =============================================================================
# OLS vs NIST / your app  --  Longley dataset (the classic ill-conditioned
# regression NIST uses as a numerical accuracy benchmark)
# Fixture: src/lib/econometrics/__tests__/fixtures/longley.csv
# =============================================================================
df <- read.csv("../src/lib/econometrics/__tests__/fixtures/longley.csv")

fit <- lm(TOTEMP ~ GNPDEFL + GNP + UNEMP + ARMED + POP + YEAR, data = df)
print(summary(fit))

# --- Compare against (already verified in your app's own NIST test suite) ---
# Intercept -3482258.63459582   |  GNPDEFL  15.0618722713733
# GNP       -0.035819179292591  |  UNEMP    -2.02022980381683
# ARMED     -1.03322686717359   |  POP      -0.0511041056535807
# YEAR       1829.15146461355   |  R^2       0.995479
# =============================================================================
