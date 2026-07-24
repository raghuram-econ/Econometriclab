"""
Regression tests for /python/johansen.

The trace/max-eigenvalue statistics and critical values come directly from
statsmodels.tsa.vector_ar.vecm.coint_johansen, so they're correct by
construction. The one piece of hand-written logic in the wrapper is the
cointegration-rank determination loop (sequentially test H0: rank<=i,
stop at the first non-rejection) -- these tests check that logic against a
synthetic system with a *known* true rank by construction (two series
sharing exactly one common stochastic trend => rank 1), not just that the
statsmodels numbers pass through unchanged.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import numpy as np
import pytest
from fastapi.testclient import TestClient
from statsmodels.tsa.vector_ar.vecm import coint_johansen

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}


def _cointegrated_pair(seed, n, noise_sd):
    rng = np.random.RandomState(seed)
    common_trend = np.cumsum(rng.normal(0, 1, n))
    y1 = common_trend + rng.normal(0, noise_sd, n)
    y2 = 2 * common_trend + rng.normal(0, noise_sd, n)
    return np.column_stack([y1, y2])


def test_trace_and_max_eig_stats_match_statsmodels():
    data = _cointegrated_pair(seed=123, n=1000, noise_sd=0.2)
    resp = client.post(
        "/python/johansen",
        json={"data": data.tolist(), "variable_names": ["y1", "y2"], "det_order": 0, "k_ar_diff": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()

    ref = coint_johansen(data, 0, 1)

    for got, want in zip(body["trace_stat"], ref.lr1):
        assert got == pytest.approx(want, abs=1e-3)
    for got, want in zip(body["max_eig_stat"], ref.lr2):
        assert got == pytest.approx(want, abs=1e-3)
    for got, want in zip(body["trace_cv_95"], ref.cvt[:, 1]):
        assert got == pytest.approx(want, abs=1e-6)


def test_rank_selection_recovers_the_true_rank_on_a_clean_system():
    # By construction, y1 and y2 share exactly one common stochastic trend,
    # so the true cointegration rank is 1 -- not 0 (they're not independent
    # random walks) and not 2 (they're not both individually stationary).
    data = _cointegrated_pair(seed=123, n=1000, noise_sd=0.2)
    resp = client.post(
        "/python/johansen",
        json={"data": data.tolist(), "variable_names": ["y1", "y2"], "det_order": 0, "k_ar_diff": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["cointegration_rank"] == 1
    assert len(body["cointegrating_vectors"]) > 0
    assert "error" not in body["vecm_coefficients"]


def test_rank_selection_reports_zero_for_two_independent_random_walks():
    rng = np.random.RandomState(456)
    n = 500
    y1 = np.cumsum(rng.normal(0, 1, n))
    y2 = np.cumsum(rng.normal(0, 1, n))  # independent random walk, no shared trend
    data = np.column_stack([y1, y2])

    resp = client.post(
        "/python/johansen",
        json={"data": data.tolist(), "variable_names": ["y1", "y2"], "det_order": 0, "k_ar_diff": 1},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["cointegration_rank"] == 0
    assert body["vecm_coefficients"]["fit_rank"] == 0
