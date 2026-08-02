# =============================================================================
# Ridge / LASSO / Elastic Net  vs  R's glmnet
# Fixture: penalized_series.csv (4 regressors; x2 and x4 are truly zero)
# NOTE ON CONVENTION: glmnet's `alpha` is the mixing parameter (0=Ridge,
# 1=Lasso) and `lambda` is the penalty strength -- same naming your app uses.
# Ridge in your app / sklearn uses penalty lambda*||b||^2 with NO 1/n scaling;
# glmnet's Ridge (alpha=0) uses (1/2n)*RSS + lambda*penalty, so to match you
# must convert: glmnet_lambda = app_lambda / n. This is the single most
# common source of "mismatch" when comparing glmnet to other engines --
# don't skip this conversion.
# =============================================================================
# install.packages("glmnet")
library(glmnet)

df <- read.csv("../src/lib/econometrics/__tests__/fixtures/penalized_series.csv")
X <- as.matrix(df[, c("x1","x2","x3","x4")])
y <- df$y
n <- nrow(df)

cat("=== Ridge (glmnet alpha=0), app lambda=5.0 -> glmnet lambda =", 5.0/n, "===\n")
ridge <- glmnet(X, y, alpha = 0, lambda = 5.0/n, standardize = FALSE)
print(coef(ridge))
# Compare: Intercept 3.051563, x1 1.93871829, x2 0.02373429, x3 -1.39494498, x4 0.12707441

cat("\n=== LASSO (glmnet alpha=1), app lambda=0.3 (same (1/2n) convention as glmnet) ===\n")
lasso <- glmnet(X, y, alpha = 1, lambda = 0.3, standardize = FALSE)
print(coef(lasso))
# Compare: Intercept 3.031173, x1 1.71810613, x2 0 (selected out), x3 -1.12964583, x4 0 (selected out)

cat("\n=== Elastic Net (glmnet alpha=0.5), app lambda=0.3 ===\n")
en <- glmnet(X, y, alpha = 0.5, lambda = 0.3, standardize = FALSE)
print(coef(en))
# Compare: Intercept 3.031798, x1 1.60847867, x2 0 (selected out), x3 -1.1144153, x4 0.06046565
# =============================================================================
