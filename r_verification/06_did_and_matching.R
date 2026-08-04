# =============================================================================
# Difference-in-Differences (simple 2x2) and Nearest-Neighbor Propensity
# Score Matching
# Fixtures: did_synthetic.csv (unit, treated, post, x, y)
#           psm_series.csv (pscore, T, Y -- propensity scores already computed,
#                            so this isolates just the MATCHING algorithm)
# =============================================================================
# No extra packages needed -- both parts use base R only. (The matching
# below is written out manually rather than via MatchIt, specifically so it
# mirrors the app's own nearest-neighbor algorithm exactly for comparison.)

# --- Simple DiD via OLS interaction (the standard textbook approach) ---
did_df <- read.csv("../src/lib/econometrics/__tests__/fixtures/did_synthetic.csv")
did_fit <- lm(y ~ treated * post + x, data = did_df)
cat("=== Simple 2x2 DiD (interaction coefficient = ATT) ===\n")
print(summary(did_fit))
# The treated:post coefficient is your ATT -- compare against your app's
# did_synthetic golden fixture value.

# --- Nearest-neighbor matching, with replacement, on a GIVEN propensity
# score (isolates the matching algorithm itself, since your app's
# propensity-score calculation is already separately verified against
# statsmodels Logit) ---
psm_df <- read.csv("../src/lib/econometrics/__tests__/fixtures/psm_series.csv")

treated_idx <- which(psm_df$T == 1)
control_idx <- which(psm_df$T == 0)
matched_control_idx <- sapply(treated_idx, function(ti) {
  diffs <- abs(psm_df$pscore[ti] - psm_df$pscore[control_idx])
  control_idx[which.min(diffs)]   # first minimum on ties, same as the app's loop
})

att <- mean(psm_df$Y[treated_idx]) - mean(psm_df$Y[matched_control_idx])
unmatched_diff <- mean(psm_df$Y[treated_idx]) - mean(psm_df$Y[control_idx])

cat("\n=== Nearest-neighbor matching (manual, mirrors the app's exact algorithm) ===\n")
cat("ATT =", att, "\n")
cat("Unmatched difference =", unmatched_diff, "\n")
cat("First 10 matched control indices (0-indexed to compare with the app):\n")
print(matched_control_idx[1:10] - 1)
# Compare: ATT ~3.403643, unmatchedDiff ~6.563627
# matched indices (0-indexed) [1:10] = 24, 7, 24, 50, 24, 24, 24, 24, 27, 24
# =============================================================================
