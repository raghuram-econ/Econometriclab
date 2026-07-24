"""
Regression tests for /python/arima-full.

This endpoint is a thin wrapper around statsmodels.tsa.arima.model.ARIMA, so
its coefficients/AIC/BIC/log-likelihood are correct by construction -- these
tests exist to catch bugs in the *wrapper* (serialization, rounding, the
forecast/confidence-interval plumbing), not to re-verify statsmodels itself.
Each test computes its own expectation with a direct statsmodels call on the
same data, so a version bump that changes statsmodels' numbers keeps the
tests honest instead of silently drifting from a hardcoded constant.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))

os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from statsmodels.tsa.arima.model import ARIMA

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

SERIES = [10, 12, 11, 13, 14, 16, 15, 17, 18, 20, 19, 21, 22, 24, 23, 25, 26, 28, 27, 29]


def _reference(order, horizon):
    res = ARIMA(pd.Series(SERIES, dtype=float), order=order).fit()
    fc = res.get_forecast(steps=horizon)
    ci = fc.conf_int(alpha=0.05)
    return res, fc, ci


def test_requires_internal_token():
    resp = client.post("/python/arima-full", json={"series": SERIES, "p": 1, "d": 1, "q": 0, "horizon": 3})
    assert resp.status_code == 401


@pytest.mark.parametrize("order", [(1, 1, 0), (1, 1, 1)])
def test_coefficients_aic_bic_llf_match_statsmodels(order):
    horizon = 3
    resp = client.post(
        "/python/arima-full",
        json={"series": SERIES, "p": order[0], "d": order[1], "q": order[2], "horizon": horizon},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()

    res, _, _ = _reference(order, horizon)

    assert body["aic"] == pytest.approx(res.aic, abs=1e-3)
    assert body["bic"] == pytest.approx(res.bic, abs=1e-3)
    assert body["logLikelihood"] == pytest.approx(res.llf, abs=1e-3)
    assert body["n_obs"] == int(res.nobs)

    returned = {c["variable"]: c for c in body["coefficients"]}
    assert set(returned.keys()) == set(res.params.index)
    for name in res.params.index:
        assert returned[name]["estimate"] == pytest.approx(res.params[name], abs=1e-4)
        assert returned[name]["stdError"] == pytest.approx(res.bse[name], abs=1e-4)


@pytest.mark.parametrize("order", [(1, 1, 0), (1, 1, 1)])
def test_forecast_and_ci_match_statsmodels(order):
    horizon = 4
    resp = client.post(
        "/python/arima-full",
        json={"series": SERIES, "p": order[0], "d": order[1], "q": order[2], "horizon": horizon},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()

    _, fc, ci = _reference(order, horizon)

    assert "forecast" in body, "endpoint must return forecast values, not just fitted coefficients"
    assert "forecastCI" in body
    assert len(body["forecast"]) == horizon
    assert len(body["forecastCI"]) == horizon

    expected_mean = list(fc.predicted_mean)
    for got, want in zip(body["forecast"], expected_mean):
        assert got == pytest.approx(want, abs=1e-3)

    for i, (got_lo, got_hi) in enumerate(body["forecastCI"]):
        assert got_lo == pytest.approx(ci.iloc[i, 0], abs=1e-3)
        assert got_hi == pytest.approx(ci.iloc[i, 1], abs=1e-3)


def test_rejects_underdetermined_specification():
    # ARIMA(5,0,5) on 2 observations has more parameters than data.
    resp = client.post(
        "/python/arima-full",
        json={"series": [1.0, 2.0], "p": 5, "d": 0, "q": 5, "horizon": 3},
        headers=HEADERS,
    )
    assert resp.status_code == 422


def test_horizon_is_clamped_to_a_sane_range():
    resp = client.post(
        "/python/arima-full",
        json={"series": SERIES, "p": 1, "d": 1, "q": 0, "horizon": 100000},
        headers=HEADERS,
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["forecast"]) <= 100
