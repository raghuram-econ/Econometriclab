"""
Regression tests for /python/unit-root (ADF / KPSS / Phillips-Perron).

Each of these three tests is a thin wrapper around a real statistical test
(statsmodels' `adfuller`/`kpss`, arch's `PhillipsPerron`), so the underlying
statistic is correct by construction -- the risk is in the endpoint's
argument translation (regression/trend spec) and response serialization.
These tests call each library function directly on the same fixture series
(not by importing anything from main.py) and check the endpoint's response
matches that independent call.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import numpy as np
import pytest
from arch.unitroot import PhillipsPerron
from fastapi.testclient import TestClient
from statsmodels.tsa.stattools import adfuller, kpss

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "src", "lib", "econometrics", "__tests__", "fixtures")
SERIES = np.loadtxt(os.path.join(FIXTURES, "kpss_pp_series.csv")).tolist()


def test_requires_internal_token():
    resp = client.post("/python/unit-root", json={"series": SERIES, "test": "adf", "regression": "c"})
    assert resp.status_code == 401


def test_adf_matches_direct_statsmodels_adfuller():
    y = np.asarray(SERIES, dtype=float)
    stat, pval, lags, nobs, crit, _ = adfuller(y, regression="c", autolag="AIC")

    resp = client.post("/python/unit-root", json={"series": SERIES, "test": "adf", "regression": "c"}, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    assert body["test"] == "ADF"
    assert body["stat"] == pytest.approx(stat, abs=1e-6)
    assert body["pValue"] == pytest.approx(pval, abs=1e-6)
    assert body["lags"] == int(lags)
    assert body["nobs"] == int(nobs)
    for k, v in crit.items():
        assert body["critValues"][k] == pytest.approx(v, abs=1e-6)


def test_kpss_matches_direct_statsmodels_kpss():
    y = np.asarray(SERIES, dtype=float)
    stat, pval, lags, crit = kpss(y, regression="c", nlags="auto")

    resp = client.post("/python/unit-root", json={"series": SERIES, "test": "kpss", "regression": "c"}, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    assert body["test"] == "KPSS"
    assert body["stat"] == pytest.approx(stat, abs=1e-6)
    assert body["pValue"] == pytest.approx(pval, abs=1e-6)
    assert body["lags"] == int(lags)
    for k, v in crit.items():
        assert body["critValues"][k] == pytest.approx(v, abs=1e-6)


def test_pp_matches_direct_arch_phillips_perron():
    y = np.asarray(SERIES, dtype=float)
    pp = PhillipsPerron(y, trend="c")

    resp = client.post("/python/unit-root", json={"series": SERIES, "test": "pp", "regression": "c"}, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    assert body["test"] == "PP"
    assert body["stat"] == pytest.approx(pp.stat, abs=1e-6)
    assert body["pValue"] == pytest.approx(pp.pvalue, abs=1e-6)
    assert body["lags"] == int(pp.lags)
    assert body["nobs"] == int(pp.nobs)
    for k, v in pp.critical_values.items():
        assert body["critValues"][k] == pytest.approx(v, abs=1e-6)


def test_too_short_series_is_rejected():
    resp = client.post("/python/unit-root", json={"series": SERIES[:11], "test": "adf", "regression": "c"}, headers=HEADERS)
    assert resp.status_code == 422


def test_unknown_test_type_is_rejected():
    resp = client.post("/python/unit-root", json={"series": SERIES, "test": "bogus", "regression": "c"}, headers=HEADERS)
    assert resp.status_code == 422
