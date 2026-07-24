"""
Regression tests for the two Cox PH routes (/api/run-cox-ph, /python/cox).

Both are thin wrappers around lifelines.CoxPHFitter, so coefficients are
correct by construction; these tests exist to catch bugs in the *wrapper*
(field extraction, JSON serialization), using the Rossi recidivism dataset --
the canonical Cox PH teaching example, shipped with lifelines itself and
widely cited (e.g. Allison, "Survival Analysis Using SAS").
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import pytest
from fastapi.testclient import TestClient
from lifelines import CoxPHFitter
from lifelines.datasets import load_rossi

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

ROSSI = load_rossi()
COVARIATES = ["fin", "age", "race", "wexp", "mar", "paro", "prio"]


def _reference():
    cph = CoxPHFitter()
    cph.fit(ROSSI, duration_col="week", event_col="arrest")
    return cph


def test_run_cox_ph_matches_direct_lifelines_fit():
    payload = {
        "data": ROSSI.to_dict(orient="records"),
        "durationVar": "week",
        "eventVar": "arrest",
        "covariates": COVARIATES,
    }
    resp = client.post("/api/run-cox-ph", json=payload, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    ref = _reference()

    assert body["n"] == len(ROSSI)
    assert body["nEvents"] == int(ROSSI["arrest"].sum())
    assert body["concordanceIndex"] == pytest.approx(ref.concordance_index_, abs=1e-6)
    assert body["logLikelihood"] == pytest.approx(ref.log_likelihood_, abs=1e-3)

    returned = {c["variable"]: c for c in body["coefficients"]}
    assert set(returned.keys()) == set(COVARIATES)
    for cov in COVARIATES:
        assert returned[cov]["estimate"] == pytest.approx(ref.summary.loc[cov, "coef"], abs=1e-4)
        assert returned[cov]["stdError"] == pytest.approx(ref.summary.loc[cov, "se(coef)"], abs=1e-4)
        assert returned[cov]["pValue"] == pytest.approx(ref.summary.loc[cov, "p"], abs=1e-4)
        assert returned[cov]["hazardRatio"] == pytest.approx(ref.summary.loc[cov, "exp(coef)"], abs=1e-4)


def test_python_cox_matches_direct_lifelines_fit():
    payload = {
        "time": ROSSI["week"].tolist(),
        "event": ROSSI["arrest"].tolist(),
        "covariates": ROSSI[COVARIATES].values.tolist(),
        "covarNames": COVARIATES,
    }
    resp = client.post("/python/cox", json=payload, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    ref = _reference()

    assert body["concordanceIndex"] == pytest.approx(ref.concordance_index_, abs=1e-6)
    assert body["logLikelihood"] == pytest.approx(ref.log_likelihood_, abs=1e-3)

    returned = {c["variable"]: c for c in body["coefficients"]}
    for cov in COVARIATES:
        assert returned[cov]["estimate"] == pytest.approx(ref.summary.loc[cov, "coef"], abs=1e-4)
        assert returned[cov]["stdError"] == pytest.approx(ref.summary.loc[cov, "se(coef)"], abs=1e-4)
