"""
Regression test for /python/cointegration (Engle-Granger two-step test).

`statsmodels.tsa.stattools.coint` is the real test, so it is correct by
construction -- the risk is in the endpoint's array reshaping (splitting the
incoming `series` matrix into a dependent series and one-or-more regressor
series). This test builds a synthetic cointegrated pair with a fixed seed,
calls `coint` directly (not by importing anything from main.py), and checks
the endpoint's response matches that independent call.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import numpy as np
import pytest
from fastapi.testclient import TestClient
from statsmodels.tsa.stattools import coint

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

rng = np.random.default_rng(2025)
_n = 250
_x = np.cumsum(rng.normal(0, 1, _n))          # random walk
_y = 2.0 * _x + rng.normal(0, 1, _n)          # cointegrated with x
SERIES = [list(row) for row in np.column_stack([_y, _x])]


def test_requires_internal_token():
    resp = client.post("/python/cointegration", json={"series": SERIES, "seriesNames": ["y", "x"]})
    assert resp.status_code == 401


def test_two_series_matches_direct_statsmodels_coint():
    coint_t, pvalue, crit_value = coint(_y, _x)

    resp = client.post("/python/cointegration", json={"series": SERIES, "seriesNames": ["y", "x"]}, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    assert body["t_stat"] == pytest.approx(coint_t, abs=1e-4)
    assert body["p_value"] == pytest.approx(pvalue, abs=1e-6)
    for got, want in zip(body["crit_values"], crit_value):
        assert got == pytest.approx(want, abs=1e-4)


def test_multivariate_regressors_matches_direct_statsmodels_coint():
    z = rng.normal(0, 1, _n)
    series = [list(row) for row in np.column_stack([_y, _x, z])]

    coint_t, pvalue, crit_value = coint(_y, np.column_stack([_x, z]))

    resp = client.post(
        "/python/cointegration",
        json={"series": series, "seriesNames": ["y", "x", "z"]},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()

    assert body["t_stat"] == pytest.approx(coint_t, abs=1e-4)
    assert body["p_value"] == pytest.approx(pvalue, abs=1e-6)
    for got, want in zip(body["crit_values"], crit_value):
        assert got == pytest.approx(want, abs=1e-4)


def test_single_series_is_rejected():
    single = [[v] for v in _y]
    resp = client.post("/python/cointegration", json={"series": single, "seriesNames": ["y"]}, headers=HEADERS)
    assert resp.status_code == 422
