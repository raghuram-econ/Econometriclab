# =============================================================================
# Quantile Regression  --  the classic Engel curve dataset (food expenditure
# vs income), the field's standard quantile-regression benchmark
# Fixture: engel.csv
# =============================================================================
# install.packages("quantreg")
library(quantreg)

df <- read.csv("../src/lib/econometrics/__tests__/fixtures/engel.csv")
fit <- rq(foodexp ~ income, data = df, tau = 0.5)  # median regression
print(summary(fit))

# --- Compare against your app's golden fixture (engel_quantile_median),
# which itself notes ~1.5% expected difference from the Hall-Sheather /
# statsmodels method due to differing bandwidth/interpolation choices --
# this is a well-known, benign source of variation between quantile-
# regression implementations, not a bug in either. ---
# =============================================================================
