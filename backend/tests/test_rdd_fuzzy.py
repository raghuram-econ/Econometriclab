"""
Regression test for /python/rdd-fuzzy (Fuzzy Regression Discontinuity via
`rdrobust`'s `fuzzy=` argument -- the same package and algorithm as R's
rdrobust with fuzzy=).

Unlike the pydynpd/pysyncon endpoints, main.py's fuzzy-RDD handler
(_run_rdd_fuzzy / run_rdd_fuzzy in backend/main.py) is a thin pass-through:
it forwards y, x, and the treatment-status array straight into
`rdrobust(y=y, x=x, c=cutoff, fuzzy=treatment)` and reformats the returned
coef/se/pv/ci DataFrames. So there are two things worth checking
independently, and this file checks both:

1. That `rdrobust`'s fuzzy= option itself produces a sensible, converging
   Local Average Treatment Effect (LATE) estimate on a documented synthetic
   fuzzy-compliance DGP with a known true effect -- rdrobust does not ship a
   worked fuzzy-RD example with a documented reference table (unlike its
   sharp-RD `rdrobust` help examples), so instead of matching a published
   number we validate correctness the standard way for a Wald/IV estimator:
   simulate a DGP with a KNOWN LATE, at a sample size large enough for the
   estimator's asymptotics to have kicked in, and confirm the point estimate
   is within a small multiple of its own reported standard error of the
   truth. The DGP (documented in `_make_fuzzy_dgp` below): running variable
   X ~ Uniform(-1, 1); probability of treatment take-up jumps from 0.2 to
   0.7 exactly at the cutoff X=0 plus a smooth linear trend in X (so
   compliance is genuinely imperfect on both sides, not a sharp 0/1 jump);
   actual treatment status D ~ Bernoulli(that probability); outcome
   Y = 1 + 0.5*X + TRUE_LATE*D + noise, i.e. Y depends on ACTUAL treatment
   D, not on which side of the cutoff X falls on -- so the only way a
   correctly-implemented fuzzy estimator recovers TRUE_LATE is by properly
   instrumenting D with the above/below-cutoff indicator and dividing the
   reduced-form outcome jump by the first-stage compliance jump (a naive
   sharp-RD read of the outcome jump alone would recover
   TRUE_LATE * (first-stage jump) instead, i.e. be biased toward zero by
   the compliance rate -- so this DGP also discriminates a fuzzy estimator
   from an accidentally-sharp one).

2. That main.py's request/response glue doesn't distort anything relative
   to a direct rdrobust call using the same arrays. We build that reference
   independently in this file (not copied from main.py) and compare it to
   what /python/rdd-fuzzy returns for the same inputs.
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
os.environ.setdefault("INTERNAL_SECRET", "test_internal_secret")

import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.main import app, INTERNAL_SECRET

client = TestClient(app)
HEADERS = {"x-internal-token": INTERNAL_SECRET}

TRUE_LATE = 3.0
CUTOFF = 0.0


def _make_fuzzy_dgp(n: int, seed: int):
    """Synthetic fuzzy-RD DGP with a known LATE (see module docstring)."""
    rng = np.random.default_rng(seed)
    x = rng.uniform(-1, 1, n)
    p_treat = 0.2 + 0.1 * (x + 1) + 0.5 * (x >= CUTOFF)
    p_treat = np.clip(p_treat, 0, 1)
    d = rng.binomial(1, p_treat)
    y = 1.0 + 0.5 * x + TRUE_LATE * d + rng.normal(0, 1, n)
    return y, x, d


def _direct_rdrobust_fuzzy(y, x, d):
    from rdrobust import rdrobust
    return rdrobust(y=y, x=x, c=CUTOFF, fuzzy=d)


def test_rdrobust_fuzzy_recovers_known_late_at_large_sample():
    """Direct rdrobust(fuzzy=...) call (not via main.py) on a large sample
    from a DGP with a known, documented LATE of 3.0. Confirms rdrobust's
    fuzzy option is a genuine IV/Wald estimator (dividing the reduced-form
    jump by the first-stage compliance jump), not a mislabeled sharp
    estimate -- the DGP is constructed so the two would differ substantially
    (first-stage jump ~0.5, so a sharp read would be biased toward ~1.5)."""
    y, x, d = _make_fuzzy_dgp(n=20000, seed=7)
    out = _direct_rdrobust_fuzzy(y, x, d)

    robust_coef = float(out.coef.loc["Robust"].iloc[0])
    robust_se = float(out.se.loc["Robust"].iloc[0])

    # Point estimate within ~3 robust SEs of the true LATE.
    assert abs(robust_coef - TRUE_LATE) < 3 * robust_se
    # And nowhere near the biased "sharp read" (~1.5), which is what you'd
    # get from a naive discontinuity in Y that ignored imperfect compliance.
    assert abs(robust_coef - 1.5) > 5 * robust_se

    # First-stage compliance jump should recover the designed ~0.5 jump in
    # treatment probability at the cutoff.
    first_stage_coef = float(out.tau_T.loc["Conventional"].iloc[0])
    assert first_stage_coef == pytest.approx(0.5, abs=0.05)


def test_endpoint_matches_independent_direct_rdrobust_call():
    """main.py's /python/rdd-fuzzy glue should reproduce a direct rdrobust
    fuzzy= call bit-for-bit (same package, same arguments, only JSON
    marshalling in between) on a smaller, reproducible sample."""
    y, x, d = _make_fuzzy_dgp(n=3000, seed=123)
    ref = _direct_rdrobust_fuzzy(y, x, d)

    payload = {
        "y": y.tolist(),
        "x": x.tolist(),
        "treatment": d.tolist(),
        "cutoff": CUTOFF,
    }
    resp = client.post("/python/rdd-fuzzy", json=payload, headers=HEADERS)
    assert resp.status_code == 200
    body = resp.json()

    assert body["coef"] == pytest.approx(float(ref.coef.loc["Conventional"].iloc[0]), abs=1e-4)
    assert body["seRobust"] == pytest.approx(float(ref.se.loc["Robust"].iloc[0]), abs=1e-4)
    assert body["pValueRobust"] == pytest.approx(float(ref.pv.loc["Robust"].iloc[0]), abs=1e-6)
    assert body["ciLow"] == pytest.approx(float(ref.ci.loc["Robust"].iloc[0]), abs=1e-4)
    assert body["ciHigh"] == pytest.approx(float(ref.ci.loc["Robust"].iloc[1]), abs=1e-4)
    assert body["bandwidth"] == pytest.approx(float(ref.bws.iloc[0, 0]), abs=1e-4)
    assert body["firstStageCoef"] == pytest.approx(float(ref.tau_T.loc["Conventional"].iloc[0]), abs=1e-4)
    assert body["firstStageSERobust"] == pytest.approx(float(ref.se_T.loc["Robust"].iloc[0]), abs=1e-4)
    assert body["firstStagePValueRobust"] == pytest.approx(float(ref.pv_T.loc["Robust"].iloc[0]), abs=1e-6)
    assert body["nUsed"] == len(y)
    assert body["cutoff"] == CUTOFF


def test_fuzzy_rdd_requires_at_least_20_observations():
    y, x, d = _make_fuzzy_dgp(n=10, seed=1)
    payload = {"y": y.tolist(), "x": x.tolist(), "treatment": d.tolist(), "cutoff": CUTOFF}
    resp = client.post("/python/rdd-fuzzy", json=payload, headers=HEADERS)
    assert resp.status_code == 422


def test_fuzzy_rdd_missing_auth_header_returns_401():
    y, x, d = _make_fuzzy_dgp(n=200, seed=1)
    payload = {"y": y.tolist(), "x": x.tolist(), "treatment": d.tolist(), "cutoff": CUTOFF}
    resp = client.post("/python/rdd-fuzzy", json=payload)
    assert resp.status_code == 401
