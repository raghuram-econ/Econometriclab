# =============================================================================
# Panel Fixed Effects / Random Effects / Hausman  --  Grunfeld investment data
# Fixture: src/lib/econometrics/__tests__/fixtures/grunfeld.csv
# =============================================================================
# install.packages(c("plm", "lmtest", "sandwich"))
library(plm)
library(lmtest)    # needed for coeftest() below
library(sandwich)  # needed for vcovHC() below

df <- read.csv("../src/lib/econometrics/__tests__/fixtures/grunfeld.csv")
pdf <- pdata.frame(df, index = c("firm", "year"))

fe <- plm(invest ~ value + capital, data = pdf, model = "within")
re <- plm(invest ~ value + capital, data = pdf, model = "random")

cat("\n=== Fixed Effects ===\n"); print(summary(fe))
cat("\n=== Random Effects ===\n"); print(summary(re))
cat("\n=== Hausman test (FE vs RE) ===\n"); print(phtest(fe, re))

# Clustered SE version (matches the grunfeld_fe_clustered golden fixture)
# NOTE: use plm::vcovHC explicitly (not the bare sandwich::vcovHC generic) --
# loading both plm and sandwich can otherwise dispatch to the wrong method,
# since plm objects don't carry a standard `terms` component the way lm
# objects do.
cat("\n=== FE with clustered (by firm) SE ===\n")
print(coeftest(fe, vcov = plm::vcovHC(fe, cluster = "group")))

# --- Compare against your app's golden-fixtures.json values (grunfeld_fe /
# grunfeld_fe_clustered / grunfeld_re), computed live from linearmodels
# PanelOLS -- same numerical foundation as R's plm. ---
# =============================================================================
