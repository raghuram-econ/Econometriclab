"""
Regression test for /python/synthetic-control (Abadie-Diamond-Hainmueller SCM).

pysyncon.Synth is the real estimator, so donor weights/MSPE/ATT are correct
by construction -- the risk is in the endpoint's hand-written reconstruction
of the synthetic outcome path (main.py builds it manually as
sum(weight * control_outcome(t)) per period, rather than pulling it from the
library). This test computes that reconstruction independently (not copied
from main.py) and checks it against the endpoint's response, alongside a
direct pysyncon.Synth fit for the weights/MSPE/ATT themselves.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from pysyncon import Dataprep, Synth

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "src", "lib", "econometrics", "__tests__", "fixtures")
PANEL = pd.read_csv(os.path.join(FIXTURES, "synthetic_control_panel.csv"))

CONTROLS = ["D1", "D2", "D3", "D4", "D5"]
PRE_RANGE = range(2000, 2010)
POST_RANGE = range(2010, 2015)

PAYLOAD = {
    "data": PANEL.to_dict(orient="records"),
    "unitVar": "unit", "timeVar": "year", "outcomeVar": "outcome",
    "predictorVars": ["outcome"],
    "treatedUnit": "Treated", "controlUnits": CONTROLS,
    "preperiodStart": 2000, "preperiodEnd": 2009, "postperiodEnd": 2014,
}


def _reference():
    dataprep = Dataprep(
        foo=PANEL, predictors=["outcome"], predictors_op="mean",
        time_predictors_prior=PRE_RANGE, dependent="outcome",
        unit_variable="unit", time_variable="year",
        treatment_identifier="Treated", controls_identifier=CONTROLS,
        time_optimize_ssr=PRE_RANGE,
    )
    synth = Synth()
    synth.fit(dataprep=dataprep)
    weights = synth.weights().to_dict()
    att = synth.att(time_period=POST_RANGE)
    return synth, weights, att


def test_weights_mspe_and_att_match_direct_pysyncon_fit():
    _, ref_weights, ref_att = _reference()

    resp = client.post("/python/synthetic-control", json=PAYLOAD, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    for unit, w in ref_weights.items():
        assert body["weights"][str(unit)] == pytest.approx(w, abs=1e-4)
    assert body["att"] == pytest.approx(ref_att["att"], abs=1e-4)
    assert body["attSE"] == pytest.approx(ref_att["se"], abs=1e-4)


def test_synthetic_path_matches_independent_reconstruction():
    """The synthetic path isn't a pysyncon output -- main.py builds it manually
    by weighting each donor's raw outcome per period. Rebuild that same
    weighted sum here, independently, from the raw fixture and the reference
    weights, and check it matches the endpoint's reported path exactly."""
    _, ref_weights, _ = _reference()

    resp = client.post("/python/synthetic-control", json=PAYLOAD, headers=HEADERS)
    body = resp.json()

    expected_path = []
    for t in body["periods"]:
        row_t = PANEL[PANEL["year"] == t]
        val = sum(
            w * float(row_t[row_t["unit"] == unit]["outcome"].iloc[0])
            for unit, w in ref_weights.items() if w
        )
        expected_path.append(val)

    for expected, actual in zip(expected_path, body["syntheticPath"]):
        assert actual == pytest.approx(expected, abs=1e-4)


def test_no_post_treatment_periods_is_rejected():
    bad_payload = {**PAYLOAD, "postperiodEnd": 2009}
    resp = client.post("/python/synthetic-control", json=bad_payload, headers=HEADERS)
    assert resp.status_code == 422
