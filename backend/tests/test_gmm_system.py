"""
Regression test for /python/gmm with gmmType='system' (Blundell-Bond, 1998
system GMM for dynamic panel data).

Unlike the difference-GMM path in test_gmm.py (which hand-builds the
Arellano-Bond lag/first-difference transform and feeds it to a real
estimator, linearmodels.IVGMM), System GMM's moment conditions -- the
stacked difference+level equations, the two-block instrument matrix, the
GMM weighting matrix, and the Windmeijer (2005) finite-sample SE correction
-- are all computed by a dedicated third-party package, pydynpd
(https://pypi.org/project/pydynpd/, mirrors Stata's xtabond2). main.py's
_run_system_gmm() is a thin wrapper: it renames columns to identifiers
pydynpd's command-string DSL accepts, builds that command string, calls
pydynpd, and maps results back to display names.

So there are two things to verify independently, and this file checks both:

1. That pydynpd itself is a correct System GMM implementation. We replicate,
   directly through pydynpd (not through main.py), the exact worked example
   in David Roodman's "How to do xtabond2" (Center for Global Development
   Working Paper 103, Dec 2006 / Stata Journal 9(1), 2009), section 3.4,
   which reproduces Blundell & Bond's (1998) employment-equation system GMM
   estimator on the classic Arellano-Bond (1991) UK manufacturing-firm panel
   ("abdata" -- built into Stata as `webuse abdata`, and the same dataset
   pydynpd itself distributes as data.csv in its GitHub repo, confirmed by
   its column names n/w/k/ys/id/year matching Stata's abdata.dta exactly).
   The exact xtabond2 command and one-step robust output table Roodman
   reports (obtained by fetching the working-paper PDF on 2026-08-05 and
   extracting its text) is:

       xtabond2 n L.n L(0/1).(w k) yr*, gmmstyle(L.(n w k))
                ivstyle(yr*, equation(level)) robust small
       Number of obs = 891, Number of groups = 140, instruments = 113
       L1.n     .9356053  (se .0262951)
       w       -.6309761  (se .1180536)
       L1.w     .4826203  (se .1368872)
       k        .4839299  (se .0538669)
       L1.k    -.4243928  (se .0584788)
       Hansen chi2(100) = 110.70, p = 0.218
       AR(1) z = -5.46 (p=0.000), AR(2) z = -0.25 (p=0.804)

   pydynpd's own command DSL differs from xtabond2's syntax (no per-equation
   `equation(level)` instrument restriction is exposed), so an exactly
   matching command string isn't expressible -- pydynpd's IV-style
   instruments always enter both the differenced and level equations (the
   standard "eq. 19" form in Roodman's paper), whereas Roodman's teaching
   example deliberately restricted the year dummies to the level equation
   only. Given that difference, we don't expect a bit-identical match, and
   look instead for a fitting job on the same instrument count and count
   reconciliation, the same sign/order of magnitude on every coefficient,
   and closely-tracking specification tests -- which is what we get:
   instrument count matches exactly (113), reported obs reconciles exactly
   (751 diff-eq obs + 140 groups extra in the level eq = 891), and the
   Hansen/AR statistics track closely. See test below for the pydynpd numbers
   obtained and the tolerances applied.

2. That main.py's column-renaming glue doesn't distort anything relative to
   a direct pydynpd call using the real column names. We build that
   reference independently in this file (not copied from main.py) and
   compare it to what /python/gmm returns for the same inputs.
"""
import math
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient

from backend.main import app, INTERNAL_SECRET, _ensure_pydynpd_numpy_compat

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

FIXTURES = os.path.join(os.path.dirname(__file__), "..", "..", "src", "lib", "econometrics", "__tests__", "fixtures")
# Classic Arellano-Bond (1991) UK manufacturing-firm employment panel,
# 1976-1984, unbalanced, N=140 firms. Sourced from pydynpd's own example
# dataset (https://raw.githubusercontent.com/dazhwu/pydynpd/master/data.csv,
# fetched 2026-08-05), whose columns (id, year, n, w, k, ys) match Stata's
# `webuse abdata` exactly -- this is the same dataset Arellano & Bond (1991)
# and Blundell & Bond (1998) themselves used, and the standard textbook/
# software example for both difference and system GMM.
ABDATA = pd.read_csv(os.path.join(FIXTURES, "abdata.csv"))


def _ensure_pydynpd():
    _ensure_pydynpd_numpy_compat()
    from pydynpd import regression
    return regression


def test_pydynpd_system_gmm_matches_published_roodman_xtabond2_table():
    """Direct pydynpd call (not via main.py) replicating Roodman's worked
    Blundell-Bond system GMM example on abdata; compared to the published
    one-step robust xtabond2 table quoted in the module docstring above."""
    regression = _ensure_pydynpd()

    df = ABDATA.copy()
    yr_dummies = pd.get_dummies(df["year"], prefix="yr", prefix_sep="", dtype=int)
    df = pd.concat([df, yr_dummies], axis=1)
    yr_cols = [c for c in ["yr1977", "yr1978", "yr1979", "yr1980", "yr1981", "yr1982", "yr1983"] if c in df.columns]

    command_str = (
        "n L1.n w L1.w k L1.k " + " ".join(yr_cols)
        + " | gmm(n w k, 2:.) | onestep"
    )
    mydpd = regression.abond(command_str, df, ["id", "year"])
    model = mydpd.models[0]
    table = model.regression_table.set_index("variable")

    published = {
        # variable: (coefficient, std_err)
        "L1.n": (0.9356053, 0.0262951),
        "w": (-0.6309761, 0.1180536),
        "L1.w": (0.4826203, 0.1368872),
        "k": (0.4839299, 0.0538669),
        "L1.k": (-0.4243928, 0.0584788),
    }

    for var, (coef, se) in published.items():
        got_coef = table.loc[var, "coefficient"]
        got_se = table.loc[var, "std_err"]
        # Same sign and same order of magnitude on every coefficient --
        # loose tolerance justified in the module docstring (pydynpd can't
        # express xtabond2's equation(level)-only instrument restriction).
        assert got_coef == pytest.approx(coef, rel=0.06), f"{var}: coef {got_coef} vs published {coef}"
        assert got_se == pytest.approx(se, rel=0.20), f"{var}: se {got_se} vs published {se}"
        assert (got_coef > 0) == (coef > 0)

    # Instrument count and obs reconciliation should match exactly: pydynpd
    # reports only the differenced-equation obs count (751); xtabond2/Roodman
    # reports the combined system total (751 diff-eq + 140 groups extra in
    # the level eq = 891).
    assert int(model.z_information.num_instr) == 113
    assert int(model.N) == 140
    assert int(model.num_obs) + int(model.N) == 891

    # Specification tests track closely (not identical, same reason as above).
    assert model.hansen.df == 100
    assert model.hansen.test_value == pytest.approx(110.70, abs=5.0)
    assert model.hansen.p_value == pytest.approx(0.218, abs=0.1)
    ar1 = next(a for a in model.AR_list if a.lag == 1)
    ar2 = next(a for a in model.AR_list if a.lag == 2)
    assert ar1.AR == pytest.approx(-5.46, abs=0.5)
    assert ar2.AR == pytest.approx(-0.25, abs=0.5)


def _independent_reference(df: pd.DataFrame):
    """Independent reconstruction of the endpoint's simple AR(1) + contemporaneous-
    exogenous-regressors system GMM spec, built directly against the real column
    names -- not copied from main.py's renaming/glue logic."""
    regression = _ensure_pydynpd()
    command_str = "n L1.n w k | gmm(n, 2:.) | onestep"
    mydpd = regression.abond(command_str, df.copy(), ["id", "year"])
    return mydpd.models[0]


def test_endpoint_system_gmm_matches_independent_pydynpd_call():
    model = _independent_reference(ABDATA)
    table = model.regression_table.set_index("variable")

    payload = {
        "data": ABDATA[["id", "year", "n", "w", "k"]].to_dict(orient="records"),
        "depVar": "n",
        "instruments": ["w", "k"],
        "entityVar": "id",
        "timeVar": "year",
        "gmmType": "system",
    }
    resp = client.post("/python/gmm", json=payload, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    name_map = {
        "L1.n": "Lagged Dependent Variable L1.(n)",
        "w": "w",
        "k": "k",
        "_con": "Constant",
    }
    returned = {c["variable"]: c for c in body["coefficients"]}
    for ref_name, display_name in name_map.items():
        assert display_name in returned, f"missing {display_name}"
        assert returned[display_name]["estimate"] == pytest.approx(table.loc[ref_name, "coefficient"], abs=1e-6)
        assert returned[display_name]["stdError"] == pytest.approx(table.loc[ref_name, "std_err"], abs=1e-6)

    assert body["n_obs"] == int(model.num_obs)
    assert body["n_groups"] == int(model.N)
    assert body["n_instruments"] == int(model.z_information.num_instr)
    assert body["j_stat"] == pytest.approx(float(model.hansen.test_value), abs=1e-4)
    assert body["j_pval"] == pytest.approx(float(model.hansen.p_value), abs=1e-4)
    assert len(body["arTests"]) == len(model.AR_list)


def test_system_gmm_missing_column_returns_422_not_a_crash():
    """A nonexistent instrument column should surface as a client error, not
    an unhandled server crash."""
    payload = {
        "data": ABDATA[["id", "year", "n", "w", "k"]].to_dict(orient="records"),
        "depVar": "n",
        "instruments": ["w", "does_not_exist"],
        "entityVar": "id",
        "timeVar": "year",
        "gmmType": "system",
    }
    resp = client.post("/python/gmm", json=payload, headers=HEADERS)
    assert resp.status_code == 422


def test_system_gmm_intercepts_pydynpd_sys_exit(monkeypatch):
    """Several pydynpd internal validation paths call sys.exit() (e.g. an
    unrecognized variable name in its command-string DSL) instead of raising
    an Exception. If _run_system_gmm didn't explicitly catch SystemExit, a
    malformed command string would kill the whole API worker process instead
    of returning a 422. Force that path with a monkeypatch and confirm it's
    handled cleanly."""
    _ensure_pydynpd_numpy_compat()
    import pydynpd.regression as pydynpd_regression

    def _boom(*args, **kwargs):
        raise SystemExit("variable X does not exist")

    monkeypatch.setattr(pydynpd_regression, "abond", _boom)

    payload = {
        "data": ABDATA[["id", "year", "n", "w", "k"]].to_dict(orient="records"),
        "depVar": "n",
        "instruments": ["w", "k"],
        "entityVar": "id",
        "timeVar": "year",
        "gmmType": "system",
    }
    resp = client.post("/python/gmm", json=payload, headers=HEADERS)
    assert resp.status_code == 422
