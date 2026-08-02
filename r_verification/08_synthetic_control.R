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
  time.optimize.ssr = 2000:2009, unit.names.variable = "unit"
)

synth_out <- synth(dp)
cat("=== Synthetic Control weights ===\n"); print(synth_out$solution.w)
# Compare (pysyncon on the identical fixture): D1=0.588, D2=0.194, D3=0.000,
# D4=0.000, D5=0.218

synth_path <- dp$Y0plot %*% synth_out$solution.w
gaps <- dp$Y1plot - synth_path
pre_gaps <- gaps[as.character(2000:2009), ]
post_gap <- mean(gaps[as.character(2010:2014), ])

cat("\nPre-treatment MSPE:", mean(pre_gaps^2), "\n")
# Compare: pysyncon pre-treatment MSPE = 0.422375

cat("Estimated post-treatment ATT (true injected effect = 5.0):", post_gap, "\n")
# Compare: pysyncon ATT = 6.697536, SE = 0.163540
# =============================================================================
