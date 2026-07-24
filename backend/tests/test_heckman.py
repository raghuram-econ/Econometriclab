"""
Parameter-recovery test for /python/heckman.

No independent third-party Heckman implementation was available to diff
against in this environment (no R/`sampleSelection`, no Stata, no PyPI
package) -- unlike the other backend tests in this directory, this is *not*
a "matches trusted external software" benchmark. What it does check: the
Probit selection stage and OLS-with-inverse-Mills-ratio outcome stage are
themselves direct statsmodels calls (correct by construction); the custom
code is the Murphy-Topel corrected-covariance formula (main.py:299-336),
which was cross-checked by hand against Wooldridge (2010), "Econometric
Analysis of Cross Section and Panel Data", Procedure 19.1 / eq. 19.29, and
matches its structure term-for-term.

This test instead verifies the whole pipeline on a synthetic dataset with a
*known* selection-bias data-generating process: selection and outcome
errors are correlated (true rho = 0.7), so naive OLS on the selected
subsample alone is biased (verified below to actually be biased -- the
correction has something real to fix), and the two-step Heckman estimate
should land close to the true parameters despite that.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

TRUE_BETA = {"Intercept": 2.0, "x1": 1.5}
TRUE_GAMMA = {"Intercept": 0.5, "z1": 1.0, "z2": -0.5}
TRUE_RHO = 0.7


def _synthetic_data(seed=2024, n=3000):
    rng = np.random.RandomState(seed)
    z1 = rng.normal(0, 1, n)
    z2 = rng.normal(0, 1, n)
    x1 = rng.normal(0, 1, n)
    errs = rng.multivariate_normal([0, 0], [[1, TRUE_RHO], [TRUE_RHO, 1]], n)
    u_select, u_outcome = errs[:, 0], errs[:, 1]

    select_index = TRUE_GAMMA["Intercept"] + TRUE_GAMMA["z1"] * z1 + TRUE_GAMMA["z2"] * z2 + u_select
    selected = (select_index > 0).astype(int)
    y_star = TRUE_BETA["Intercept"] + TRUE_BETA["x1"] * x1 + u_outcome
    y = np.where(selected == 1, y_star, np.nan)
    return z1, z2, x1, y, selected


def test_naive_ols_on_selected_subsample_is_actually_biased():
    # Sanity check on the DGP itself: if naive OLS weren't biased here, this
    # test wouldn't be exercising anything the Heckman correction is for.
    import statsmodels.api as sm
    _, _, x1, y, selected = _synthetic_data()
    mask = selected == 1
    naive = sm.OLS(y[mask], sm.add_constant(x1[mask])).fit()
    intercept_bias = abs(naive.params[0] - TRUE_BETA["Intercept"])
    assert intercept_bias > 0.1, "expected the naive-OLS DGP to show real selection bias"


def test_two_step_heckman_recovers_true_parameters():
    z1, z2, x1, y, selected = _synthetic_data()
    n = len(z1)
    payload = {
        "outcome_y": [None if np.isnan(v) else float(v) for v in y],
        "outcome_X": [[1.0, float(x1[i])] for i in range(n)],
        "outcome_names": ["Intercept", "x1"],
        "selection_z": [[1.0, float(z1[i]), float(z2[i])] for i in range(n)],
        "selection_names": ["Intercept", "z1", "z2"],
        "n_obs_total": n,
    }
    resp = client.post("/python/heckman", json=payload, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    assert body["n_selected"] == int(selected.sum())

    outcome = {c["term"]: c["coef"] for c in body["outcome_equation"]}
    for name, true_val in TRUE_BETA.items():
        assert abs(outcome[name] - true_val) < 0.15, f"{name}: got {outcome[name]}, true {true_val}"

    selection = {c["term"]: c["coef"] for c in body["selection_equation"]}
    for name, true_val in TRUE_GAMMA.items():
        assert abs(selection[name] - true_val) < 0.15, f"{name}: got {selection[name]}, true {true_val}"

    assert abs(body["rho"] - TRUE_RHO) < 0.2
    # This is exactly the case the correction exists for: reject the null
    # that there's no selection bias.
    assert body["lambda_significant"] is True


def test_standard_errors_are_positive_and_finite():
    z1, z2, x1, y, selected = _synthetic_data()
    n = len(z1)
    payload = {
        "outcome_y": [None if np.isnan(v) else float(v) for v in y],
        "outcome_X": [[1.0, float(x1[i])] for i in range(n)],
        "outcome_names": ["Intercept", "x1"],
        "selection_z": [[1.0, float(z1[i]), float(z2[i])] for i in range(n)],
        "selection_names": ["Intercept", "z1", "z2"],
        "n_obs_total": n,
    }
    resp = client.post("/python/heckman", json=payload, headers=HEADERS)
    body = resp.json()
    for c in body["outcome_equation"] + body["selection_equation"]:
        assert c["se"] > 0
        assert np.isfinite(c["se"])
