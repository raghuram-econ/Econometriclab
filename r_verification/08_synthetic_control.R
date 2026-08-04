# =============================================================================
# Synthetic Control Method  vs  R's Synth package (the original
# Abadie-Diamond-Hainmueller implementation your app's Python engine --
# pysyncon -- is built to match)
# Fixture: synthetic_control_panel.csv (unit, year, outcome, predictor1)
# True injected post-2009 treatment effect = 5.0
# =============================================================================
# install.packages("Synth")
library(Synth)

df <- read.csv("../src/lib/econometrics/__tests__/fixtures/synthetic_control_panel.csv")
df$unit_num <- as.integer(factor(df$unit, levels = c("Treated","D1","D2","D3","D4","D5")))

dp <- dataprep(
  foo = df, predictors = "predictor1", predictors.op = "mean",
  time.predictors.prior = 2000:2009, dependent = "outcome",
  unit.variable = "unit_num", time.variable = "year",
  treatment.identifier = 1, controls.identifier = 2:6,
  time.optimize.ssr = 2000:2009, unit.names.variable = "unit",
  time.plot = 2000:2014   # REQUIRED, else Y1plot/Y0plot only cover the
                           # pre-period and any post-treatment gap is NA
)

synth_out <- synth(dp)
cat("=== Synthetic Control weights ===\n"); print(synth_out$solution.w)
# Compare (pysyncon on the identical fixture): D1=0.588, D2=0.194, D3=0.000,
# D4=0.000, D5=0.218
# NOTE: these commonly do NOT match closely -- when donor units are similar,
# the pre-treatment-fit optimization can have multiple different weight
# combinations that all achieve a good fit ("weight indeterminacy"), and
# Synth vs pysyncon use different default optimizers/starting values. This
# is expected, well-documented behavior, not a disagreement between the two
# packages. What actually matters is the fit quality (MSPE) and the
# recovered treatment effect below, not identical weights.

# Positional indexing (NOT row-name indexing) -- Synth's Y1plot/Y0plot
# dimnames aren't guaranteed to be the literal year strings, so index by
# position against the known year sequence instead. Requires time.plot to
# have been set in dataprep() above (2000:2014, 15 periods).
gaps_vec <- as.vector(dp$Y1plot) - as.vector(dp$Y0plot %*% synth_out$solution.w)

cat("\nPre-treatment MSPE:", mean(gaps_vec[1:10]^2), "\n")
# Compare: pysyncon pre-treatment MSPE = 0.422375

cat("Estimated post-treatment ATT (true injected effect = 5.0):", mean(gaps_vec[11:15]), "\n")
# Compare: pysyncon ATT = 6.697536, SE = 0.163540
# =============================================================================
