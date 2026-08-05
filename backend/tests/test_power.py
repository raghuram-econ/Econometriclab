"""
Regression tests for /python/power (statistical power / sample-size analysis).

The `ttest` design is a thin wrapper around statsmodels' `TTestIndPower`, so
it is correct by construction -- these tests call `TTestIndPower` directly
(not by importing anything from main.py) and check the endpoint matches.
The `cluster-main` design has no external library backing it in main.py; it
is a closed-form design-effect formula (matches PowerUpR's `power.cra2`).
That formula is re-derived independently here from the textbook definition
(MDES = (z_alpha + z_beta) * sqrt(4 * DE * (1 - R^2) / N), DE = 1 + (m-1)*ICC)
rather than copied from main.py, and checked against the endpoint.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import numpy as np
import pytest
from fastapi.testclient import TestClient
from scipy import stats
from statsmodels.stats.power import TTestIndPower

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}


def test_requires_internal_token():
    resp = client.post("/python/power", json={"design": "ttest", "solveFor": "n", "effectSize": 0.3})
    assert resp.status_code == 401


def test_ttest_solve_for_n_matches_direct_ttestindpower():
    an = TTestIndPower()
    n1 = an.solve_power(effect_size=0.3, alpha=0.05, power=0.80, ratio=1.0, alternative="two-sided")
    n1c = float(np.ceil(n1))

    resp = client.post(
        "/python/power",
        json={"design": "ttest", "solveFor": "n", "alpha": 0.05, "power": 0.80, "effectSize": 0.3, "ratio": 1.0},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["design"] == "ttest"
    assert body["solveFor"] == "n"
    assert body["nPerGroup"] == pytest.approx(n1c, abs=1e-6)
    assert body["nTotal"] == pytest.approx(n1c * 2.0, abs=1e-6)


def test_ttest_solve_for_power_matches_direct_ttestindpower():
    an = TTestIndPower()
    pw = an.solve_power(effect_size=0.3, nobs1=100, alpha=0.05, ratio=1.0, alternative="two-sided")

    resp = client.post(
        "/python/power",
        json={"design": "ttest", "solveFor": "power", "alpha": 0.05, "effectSize": 0.3, "nPerGroup": 100, "ratio": 1.0},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["solveFor"] == "power"
    assert body["power"] == pytest.approx(pw, abs=1e-6)


def test_ttest_solve_for_mdes_matches_direct_ttestindpower():
    an = TTestIndPower()
    es = an.solve_power(nobs1=100, alpha=0.05, power=0.80, ratio=1.0, alternative="two-sided")

    resp = client.post(
        "/python/power",
        json={"design": "ttest", "solveFor": "mdes", "alpha": 0.05, "power": 0.80, "nPerGroup": 100, "ratio": 1.0},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["solveFor"] == "mdes"
    assert body["mdes"] == pytest.approx(es, abs=1e-6)


def test_cluster_main_matches_independent_design_effect_formula():
    alpha, power = 0.05, 0.80
    n_clusters, cluster_size, icc, r_squared, effect_size = 30, 50, 0.10, 0.0, 0.25

    za = float(stats.norm.ppf(1 - alpha / 2))
    zb = float(stats.norm.ppf(power))
    m, K = cluster_size, n_clusters
    N = K * m
    DE = 1 + (m - 1) * icc
    mdes = (za + zb) * float(np.sqrt(4 * DE * (1 - r_squared) / N))
    req_k = int(np.ceil(4 * DE * (1 - r_squared) * (za + zb) ** 2 / (m * effect_size ** 2)))

    resp = client.post(
        "/python/power",
        json={
            "design": "cluster-main", "alpha": alpha, "power": power,
            "nClusters": n_clusters, "clusterSize": cluster_size, "icc": icc,
            "rSquared": r_squared, "effectSize": effect_size,
        },
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["design"] == "cluster-main"
    assert body["designEffect"] == pytest.approx(DE, abs=1e-6)
    assert body["mdes"] == pytest.approx(mdes, abs=1e-6)
    assert body["nTotal"] == int(N)
    assert body["requiredClusters"] == req_k


def test_unknown_design_is_rejected():
    resp = client.post("/python/power", json={"design": "bogus"}, headers=HEADERS)
    assert resp.status_code == 422
