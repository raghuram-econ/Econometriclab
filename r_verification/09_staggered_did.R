# =============================================================================
# Staggered-Adoption DiD (Callaway-Sant'Anna)  vs  R's did package (the
# original implementation your app's Python engine -- csdid -- ports)
# Fixture: staggered_did_panel.csv (id, year, y, g)
#   g = period each unit is first treated (0 = never treated); cohorts are
#   2004, 2006, 2008. True injected treatment effect = 3.0 in every
#   post-treatment period.
# =============================================================================
# install.packages("did")
library(did)

df <- read.csv("../src/lib/econometrics/__tests__/fixtures/staggered_did_panel.csv")

att_gt <- att_gt(yname = "y", tname = "year", idname = "id", gname = "g",
                  data = df, control_group = "nevertreated")
cat("=== Group-time ATT(g,t) ===\n"); print(summary(att_gt))

dyn <- aggte(att_gt, type = "dynamic")
cat("\n=== Event-study (dynamic) aggregation ===\n"); print(summary(dyn))
# Compare (csdid on the identical fixture) -- event time : ATT (SE):
#   -7: 0.168075 (0.231923)   -6: 0.080729 (0.249202)
#   -5: -0.118198 (0.218326)  -4: -0.018469 (0.176075)
#   -3: -0.058766 (0.149400)  -2: -0.010343 (0.129493)
#   -1: 0.085722 (0.145270)
#    0: 3.112753 (0.134040)    1: 2.969399 (0.126167)
#    2: 3.108102 (0.144605)    3: 2.942487 (0.171858)
#    4: 2.973653 (0.170036)    5: 3.039854 (0.262808)
#    6: 3.371563 (0.233404)
# Overall (dynamic-average) ATT = 3.073973, SE = 0.124991
# Note pre-treatment (e<0) coefficients are all statistically indistinguishable
# from zero -- that's the parallel-trends check working correctly -- while
# post-treatment (e>=0) coefficients cluster tightly around the true
# injected effect of 3.0.

simple <- aggte(att_gt, type = "simple")
cat("\n=== Simple aggregated ATT ===\n"); print(summary(simple))
# Compare: csdid simple overall ATT = 3.050282, SE = 0.112785
# =============================================================================
