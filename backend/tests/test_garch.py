"""
Regression test for /python/garch (GARCH(p,q) via the `arch` package).

`arch_model(...).fit()` is the real MLE estimator, so it is correct by
construction -- the risk is in the endpoint's wrapper (parameter extraction,
persistence computation, rounding/serialization of the conditional-volatility
path). This test fits `arch_model` directly on the same fixture series (not
by importing anything from main.py) and checks the endpoint's response
matches that independent fit.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import numpy as np
import pytest
from arch import arch_model
from fastapi.testclient import TestClient

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "src", "lib", "econometrics", "__tests__", "fixtures")
SERIES = np.loadtxt(os.path.join(FIXTURES, "garch_series.csv")).tolist()


def _reference(p=1, q=1):
    y = np.asarray(SERIES, dtype=float)
    return arch_model(y, mean="Constant", vol="GARCH", p=p, q=q, dist="normal").fit(disp="off")


def test_requires_internal_token():
    resp = client.post("/python/garch", json={"series": SERIES, "p": 1, "q": 1})
    assert resp.status_code == 401


def test_params_and_fit_stats_match_direct_arch_model_fit():
    res = _reference(1, 1)

    resp = client.post("/python/garch", json={"series": SERIES, "p": 1, "q": 1}, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    pr = res.params.to_dict()
    assert body["omega"] == pytest.approx(pr["omega"], abs=1e-4)
    assert body["alpha"] == pytest.approx(pr["alpha[1]"], abs=1e-4)
    assert body["beta"] == pytest.approx(pr["beta[1]"], abs=1e-4)
    assert body["mu"] == pytest.approx(pr["mu"], abs=1e-4)
    assert body["persistence"] == pytest.approx(pr["alpha[1]"] + pr["beta[1]"], abs=1e-4)
    assert body["logLik"] == pytest.approx(res.loglikelihood, abs=1e-3)
    assert body["aic"] == pytest.approx(res.aic, abs=1e-3)
    assert body["bic"] == pytest.approx(res.bic, abs=1e-3)
    assert body["nobs"] == int(res.nobs)


def test_conditional_volatility_path_matches_direct_arch_model_fit():
    res = _reference(1, 1)

    resp = client.post("/python/garch", json={"series": SERIES, "p": 1, "q": 1}, headers=HEADERS)
    body = resp.json()

    expected_vol = res.conditional_volatility.tolist()
    assert len(body["conditionalVolatility"]) == len(expected_vol)
    for got, want in zip(body["conditionalVolatility"], expected_vol):
        assert got == pytest.approx(want, abs=1e-3)


def test_too_short_series_is_rejected():
    resp = client.post("/python/garch", json={"series": SERIES[:19], "p": 1, "q": 1}, headers=HEADERS)
    assert resp.status_code == 422
