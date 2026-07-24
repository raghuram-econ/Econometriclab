"""
Regression test for /python/gmm (Arellano-Bond style first-difference GMM).

linearmodels.IVGMM is the real estimator, so it's correct by construction --
the risk is in the hand-written panel lag/first-difference construction that
feeds it. This test builds the same transform independently (from the
textbook Arellano-Bond definition, not copied from main.py) on the real
Grunfeld investment panel, and checks the endpoint's coefficients match a
direct IVGMM fit on that independently-built data.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import pandas as pd
import pytest
import statsmodels.api as sm
from fastapi.testclient import TestClient
from linearmodels.iv import IVGMM

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "src", "lib", "econometrics", "__tests__", "fixtures")
GRUNFELD = pd.read_csv(os.path.join(FIXTURES, "grunfeld.csv"))


def _reference():
    df = GRUNFELD.sort_values(["firm", "year"]).set_index(["firm", "year"]).copy()
    g = df.groupby(level=0)
    df["y_lag1"] = g["invest"].shift(1)
    df["y_lag2"] = g["invest"].shift(2)
    df["dy"] = df["invest"] - df["y_lag1"]
    df["dy_lag1"] = df["y_lag1"] - df["y_lag2"]
    df["d_value"] = df["value"] - g["value"].shift(1)
    df["d_capital"] = df["capital"] - g["capital"].shift(1)
    model_df = df[["dy", "dy_lag1", "y_lag2", "d_value", "d_capital"]].dropna()

    y = model_df["dy"].astype(float)
    endog = model_df["dy_lag1"].astype(float)
    instr = model_df["y_lag2"].astype(float)
    exog = sm.add_constant(model_df[["d_value", "d_capital"]].astype(float))
    return IVGMM(y, exog, endog, instr).fit(), len(model_df)


def test_lag_diff_construction_matches_independent_arellano_bond_transform():
    ref_res, ref_n = _reference()

    payload = {
        "data": GRUNFELD.to_dict(orient="records"),
        "depVar": "invest",
        "instruments": ["value", "capital"],
        "entityVar": "firm",
        "timeVar": "year",
    }
    resp = client.post("/python/gmm", json=payload, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    name_map = {
        "const": "Constant (Trend)",
        "dy_lag1": "Lagged Dependent Variable L1.(invest)",
        "d_value": "Diff.value",
        "d_capital": "Diff.capital",
    }
    returned = {c["variable"]: c for c in body["coefficients"]}
    for ref_name, display_name in name_map.items():
        assert display_name in returned, f"missing {display_name}"
        assert returned[display_name]["estimate"] == pytest.approx(ref_res.params[ref_name], abs=1e-4)
        assert returned[display_name]["stdError"] == pytest.approx(ref_res.std_errors[ref_name], abs=1e-3)
