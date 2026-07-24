import os
from fastapi import FastAPI, HTTPException, Header, Security
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
import pandas as pd
import numpy as np
import statsmodels.api as sm
import warnings
warnings.filterwarnings('ignore')

INTERNAL_SECRET = os.getenv("INTERNAL_SECRET", "ell_internal_token_secure_9832")

async def verify_internal_token(x_internal_token: str = Header(None)):
    if x_internal_token != INTERNAL_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized internal access")

app = FastAPI(
    title="Economics Lab Backend", 
    version="1.0.0",
    dependencies=[Security(verify_internal_token)]
)

# Read allowed origins from environment or default to local development ports
origins_env = os.getenv("CORS_ALLOWED_ORIGINS", "")
if origins_env:
    allowed_origins = [orig.strip() for orig in origins_env.split(",") if orig.strip()]
else:
    allowed_origins = ["http://localhost:5173", "http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Helpers ──────────────────────────────────────────────────
def get_stars(p: float) -> str:
    if p < 0.01: return "***"
    if p < 0.05: return "**"
    if p < 0.10: return "*"
    return ""

def safe_float(val) -> Optional[float]:
    try:
        f = float(val)
        return None if (np.isnan(f) or np.isinf(f)) else round(f, 6)
    except: return None

def build_coef_row(name, est, se, t, p) -> dict:
    e, s = safe_float(est), safe_float(se)
    has_vals = (e is not None) and (s is not None)
    return {
        "variable": name,
        "estimate": e, "stdError": s,
        "tStat": safe_float(t), "pValue": safe_float(p),
        "confLow": round(e - 1.96*s, 6) if has_vals else None,
        "confHigh": round(e + 1.96*s, 6) if has_vals else None,
        "ciLower": f"{e - 1.96*s:.4f}" if has_vals else None,
        "ciUpper": f"{e + 1.96*s:.4f}" if has_vals else None,
        "stars": get_stars(float(p)) if p is not None else "",
    }

# ── Request Models ────────────────────────────────────────────
class CoxPHRequest(BaseModel):
    data: List[Dict[str, Any]]
    durationVar: str; eventVar: str
    covariates: List[str]

class MarginalEffectsRequest(BaseModel):
    model_type: str  # "logit" or "probit"
    y: List[float]
    X: List[List[float]]
    variable_names: List[str]

class QuantileRequest(BaseModel):
    data: List[Dict[str, Any]]
    yVar: str; xVars: List[str]
    quantile: float = 0.5
    includeIntercept: bool = True

class HeckmanRequest(BaseModel):
    outcome_y: List[Optional[float]]
    outcome_X: List[List[float]]
    selection_z: List[List[float]]
    outcome_names: List[str]
    selection_names: List[str]
    n_obs_total: int

class JohansenRequest(BaseModel):
    data: List[List[float]]
    variable_names: List[str]
    det_order: int
    k_ar_diff: int

class SurveyOLSRequest(BaseModel):
    y: List[float]
    X: List[List[float]]
    weights: List[float]
    cluster_var: List[Any]
    strata_var: List[Any]
    variable_names: List[str]
    fpc: Optional[float] = None

# ── Endpoints ─────────────────────────────────────────────────
@app.get("/health")
def health(): return {"status": "ok", "message": "Economics Lab backend is running"}

@app.post("/api/run-cox-ph")
def run_cox_ph(req: CoxPHRequest):
    try:
        from lifelines import CoxPHFitter
        df = pd.DataFrame(req.data).dropna(subset=[req.durationVar,req.eventVar]+req.covariates)
        cols = [req.durationVar, req.eventVar] + req.covariates
        cph = CoxPHFitter()
        cph.fit(df[cols], duration_col=req.durationVar, event_col=req.eventVar)
        s = cph.summary
        coefs = [{
            "variable": idx,
            "estimate": safe_float(s.loc[idx,'coef']),
            "hazardRatio": safe_float(s.loc[idx,'exp(coef)']),
            "stdError": safe_float(s.loc[idx,'se(coef)']),
            "pValue": safe_float(s.loc[idx,'p']),
            "confLow": safe_float(s.loc[idx,'exp(coef) lower 95%']),
            "confHigh": safe_float(s.loc[idx,'exp(coef) upper 95%']),
            "stars": get_stars(float(s.loc[idx,'p'])),
        } for idx in s.index]
        return {
            "coefficients": coefs,
            "concordanceIndex": safe_float(cph.concordance_index_),
            "logLikelihood": safe_float(cph.log_likelihood_),
            "partialAIC": safe_float(cph.AIC_partial_),
            "n": int(len(df)),
            "nEvents": int(df[req.eventVar].sum()),
        }
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/api/run-quantile")
def run_quantile(req: QuantileRequest):
    try:
        df = pd.DataFrame(req.data).dropna(subset=[req.yVar]+req.xVars)
        # Match the TypeScript engine, which refuses fewer than k + 2 observations
        # rather than returning a degenerate fit with null standard errors.
        min_obs = len(req.xVars) + (1 if req.includeIntercept else 0) + 2
        if len(df) < min_obs:
            raise HTTPException(
                status_code=422,
                detail=f"Insufficient observations for quantile regression. Found {len(df)}, need at least {min_obs}."
            )
        y = df[req.yVar].astype(float)
        X = df[req.xVars].astype(float)
        if y.nunique() <= 1:
            raise HTTPException(
                status_code=422,
                detail="The dependent variable has zero variance (is constant across all observations). Estimation is undefined."
            )
        if req.includeIntercept:
            X = sm.add_constant(X, has_constant='add')
        result = sm.QuantReg(y, X).fit(q=req.quantile)
        coefs = [build_coef_row(n, result.params[n], result.bse[n],
                                result.tvalues[n], result.pvalues[n])
                 for n in result.params.index]
        return {
            "coefficients": coefs,
            "quantile": req.quantile,
            "pseudoR2": safe_float(result.prsquared),
            "n": int(result.nobs),
            "df": int(result.df_resid),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/python/marginal-effects")
def get_marginal_effects(req: MarginalEffectsRequest):
    try:
        from statsmodels.discrete.discrete_model import Logit, Probit
        # Convert y and X to numpy arrays
        y = np.array(req.y, dtype=float)
        X = np.array(req.X, dtype=float)
        
        # Fit Logit or Probit model
        if req.model_type.lower() == "logit":
            model = Logit(y, X)
        elif req.model_type.lower() == "probit":
            model = Probit(y, X)
        else:
            raise HTTPException(status_code=400, detail="Invalid model type. Must be 'logit' or 'probit'.")
            
        result = model.fit(disp=0)
        me = result.get_margeff(at="overall")
        
        # Identify non-constant columns in X to match variable names
        # Standard marginal effects drop constant intercept from coefficients
        non_const_indices = []
        for col_idx in range(X.shape[1]):
            col = X[:, col_idx]
            if not np.all(col == col[0]):
                non_const_indices.append(col_idx)
                
        # If no columns are constant, keep all
        if len(non_const_indices) == 0:
            non_const_indices = list(range(X.shape[1]))
            
        margeff = me.margeff
        margeff_se = me.margeff_se
        tvalues = me.tvalues
        pvalues = me.pvalues
        conf_int = me.conf_int() # shape: (num_vars, 2)
        
        results = []
        for i, idx in enumerate(non_const_indices):
            if idx < len(req.variable_names):
                var_name = req.variable_names[idx]
                results.append({
                    "variable": var_name,
                    "dy_dx": float(margeff[i]),
                    "std_err": float(margeff_se[i]),
                    "z_stat": float(tvalues[i]),
                    "p_value": float(pvalues[i]),
                    "ci_low": float(conf_int[i][0]),
                    "ci_high": float(conf_int[i][1])
                })
            
        return results
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/python/heckman")
def run_heckman(req: HeckmanRequest):
    try:
        from statsmodels.discrete.discrete_model import Probit
        from statsmodels.regression.linear_model import OLS
        from scipy.stats import norm

        # 1. Clean outcome_y and create selection_y indicator (1 = selected, 0 = unselected)
        y_clean = []
        for val in req.outcome_y:
            if val is None:
                y_clean.append(np.nan)
            else:
                try:
                    y_clean.append(float(val))
                except ValueError:
                    y_clean.append(np.nan)
        
        outcome_y_arr = np.array(y_clean)
        selection_y = np.where(np.isnan(outcome_y_arr), 0, 1)

        Z = np.array(req.selection_z, dtype=float)
        X = np.array(req.outcome_X, dtype=float)

        # 2. Fit Probit selection model
        probit_model = Probit(selection_y, Z)
        probit_result = probit_model.fit(disp=0)

        # 3. Compute Inverse Mills Ratio (IMR)
        # index is z_i' * gamma
        index = np.dot(Z, probit_result.params)
        pdf_val = norm.pdf(index)
        cdf_val = norm.cdf(index)
        cdf_val_clipped = np.clip(cdf_val, 1e-15, 1.0)
        imr = pdf_val / cdf_val_clipped

        # 4. Fit OLS on selected observations with IMR as extra regressor
        selected_mask = (selection_y == 1)
        y_selected = outcome_y_arr[selected_mask]
        X_selected = X[selected_mask]
        imr_selected = imr[selected_mask]

        if len(y_selected) < X_selected.shape[1] + 2:
            raise HTTPException(status_code=422, detail="Too few selected observations to estimate the outcome equation with the Inverse Mills Ratio.")

        X_selected_with_imr = np.column_stack((X_selected, imr_selected))

        ols_model = OLS(y_selected, X_selected_with_imr)
        ols_result = ols_model.fit()

        # 5. Extract Probit coefficients
        selection_equation = []
        for i, name in enumerate(req.selection_names):
            coef = float(probit_result.params[i])
            se = float(probit_result.bse[i])
            z = float(probit_result.tvalues[i])
            p = float(probit_result.pvalues[i])
            selection_equation.append({
                "term": name,
                "coef": round(coef, 6),
                "se": round(se, 6),
                "z": round(z, 6),
                "p_value": round(p, 6),
                "stars": get_stars(p)
            })

        # --- Compute Heckman standard error correction (Murphy-Topel) ---
        lambda_coef = float(ols_result.params[-1])
        residuals = ols_result.resid
        n_obs = X_selected_with_imr.shape[0]
        k_vars = X_selected_with_imr.shape[1]
        s2 = np.sum(residuals**2) / (n_obs - k_vars) if n_obs > k_vars else np.mean(residuals**2)
        
        index_selected = index[selected_mask]
        delta_selected = imr_selected * (imr_selected + index_selected)
        mean_delta = np.mean(delta_selected)

        sigma2 = s2 + (lambda_coef ** 2) * mean_delta
        sigma = np.sqrt(max(0.0, sigma2))

        if sigma > 1e-8:
            rho = lambda_coef / sigma
            rho = np.clip(rho, -1.0, 1.0)
        else:
            rho = 0.0

        se_corrected = ols_result.bse
        try:
            cov_probit = probit_result.cov_params()
            Z_selected = Z[selected_mask]
            X2 = X_selected_with_imr
            D = delta_selected
            
            inv_X2X = np.linalg.inv(X2.T @ X2)
            X2_R_X2 = X2.T @ X2 - (rho**2) * (X2.T * D) @ X2
            Z_D = Z_selected * D[:, np.newaxis]
            X2_Z_D = X2.T @ Z_D
            Q = (rho**2) * X2_Z_D @ cov_probit @ X2_Z_D.T
            
            cov_corrected = (sigma**2) * inv_X2X @ (X2_R_X2 + Q) @ inv_X2X
            se_corrected = np.sqrt(np.clip(np.diag(cov_corrected), 1e-15, np.inf))
        except Exception as se_err:
            print("Warning: Heckman two-step SE correction failed, falling back to OLS:", se_err)

        # 6. Extract OLS outcome coefficients with corrected SEs
        outcome_names_with_imr = req.outcome_names + ["Inverse Mills Ratio (Lambda)"]
        outcome_equation = []
        for i, name in enumerate(outcome_names_with_imr):
            coef = float(ols_result.params[i])
            se = float(se_corrected[i])
            t = coef / se if se > 0 else 0.0
            p = float(2 * (1 - norm.cdf(abs(t))))
            outcome_equation.append({
                "term": name,
                "coef": round(coef, 6),
                "se": round(se, 6),
                "t": round(t, 6),
                "p_value": round(p, 6),
                "stars": get_stars(p)
            })

        # 7. Compute Heckman statistics
        lambda_se = float(se_corrected[-1])
        lambda_t = lambda_coef / lambda_se if lambda_se > 0 else 0.0
        lambda_p = float(2 * (1 - norm.cdf(abs(lambda_t))))
        lambda_significant = lambda_p < 0.05

        return {
            "selection_equation": selection_equation,
            "outcome_equation": outcome_equation,
            "lambda_coef": round(lambda_coef, 6),
            "lambda_se": round(lambda_se, 6),
            "lambda_significant": lambda_significant,
            "n_selected": int(len(y_selected)),
            "n_total": int(req.n_obs_total),
            "rho": round(float(rho), 6),
            "sigma": round(float(sigma), 6)
        }

    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/python/johansen")
def run_johansen(req: JohansenRequest):
    try:
        from statsmodels.tsa.vector_ar.vecm import coint_johansen, VECM
        import numpy as np

        arr_data = np.array(req.data, dtype=float)
        k = len(req.variable_names)

        # 1. Run Johansen Cointegration Test
        # coint_johansen expects det_order: -1=none, 0=constant, 1=trend, and k_ar_diff: lagged differences
        johansen_result = coint_johansen(arr_data, req.det_order, req.k_ar_diff)

        # Extract stats & critical values
        trace_stat = [float(x) for x in johansen_result.lr1]
        trace_cv_90 = [float(x) for x in johansen_result.cvt[:, 0]]
        trace_cv_95 = [float(x) for x in johansen_result.cvt[:, 1]]
        max_eig_stat = [float(x) for x in johansen_result.lr2]
        max_eig_cv_95 = [float(x) for x in johansen_result.cvm[:, 1]]

        # Determine cointegration rank based on trace test at 95%
        cointegration_rank = 0
        for i in range(k):
            if johansen_result.lr1[i] > johansen_result.cvt[i, 1]:
                cointegration_rank += 1
            else:
                break

        # 2. Fit VECM only if cointegration_rank > 0
        coinating_vectors = []
        adjust_speeds = []
        vecm_coefficients = {}

        if cointegration_rank == 0:
            vecm_coefficients = {
                "message": "No cointegrating relationship found (Rank = 0). A Vector Error Correction Model (VECM) cannot be fitted.",
                "fit_rank": 0,
            }
        else:
            fit_rank = min(cointegration_rank, k - 1)
            det_map = {-1: "nc", 0: "co", 1: "lo"}
            det_str = det_map.get(req.det_order, "co")

            try:
                vecm_model = VECM(arr_data, k_ar_diff=req.k_ar_diff, coint_rank=fit_rank, deterministic=det_str)
                vecm_result = vecm_model.fit()
                
                coinating_vectors = vecm_result.beta.tolist()
                adjust_speeds = vecm_result.alpha.tolist()
                
                gamma = vecm_result.gamma.tolist() if hasattr(vecm_result, "gamma") else []
                det_coef = vecm_result.det_coef.tolist() if getattr(vecm_result, "det_coef", None) is not None else []
                
                vecm_coefficients = {
                    "gamma": gamma,
                    "det_coef": det_coef,
                    "names_outcome": req.variable_names,
                    "fit_rank": fit_rank,
                }
            except Exception as vecm_e:
                vecm_coefficients = {"error": str(vecm_e)}

        return {
            "trace_stat": trace_stat,
            "trace_cv_90": trace_cv_90,
            "trace_cv_95": trace_cv_95,
            "max_eig_stat": max_eig_stat,
            "max_eig_cv_95": max_eig_cv_95,
            "cointegration_rank": cointegration_rank,
            "cointegrating_vectors": coinating_vectors,
            "adjustment_speeds": adjust_speeds,
            "vecm_coefficients": vecm_coefficients
        }

    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

@app.post("/python/survey-ols")
def run_survey_ols(req: SurveyOLSRequest):
    try:
        import numpy as np
        import scipy.stats as stats

        arr_y = np.array(req.y, dtype=float)
        arr_X = np.array(req.X, dtype=float)
        arr_w = np.array(req.weights, dtype=float)
        arr_cluster = np.array(req.cluster_var)
        arr_strata = np.array(req.strata_var)

        N, K = arr_X.shape

        if N < K or N < 3:
            raise HTTPException(status_code=422, detail="Insufficient data observations for survey regression.")

        # 1. Point Estimates: Weighted Least Squares (WLS)
        X_weighted = arr_X * arr_w[:, np.newaxis]
        XtWX = arr_X.T @ X_weighted
        XtWy = arr_X.T @ (arr_y * arr_w)
        
        try:
            M = np.linalg.pinv(XtWX)
            beta = M @ XtWy
        except Exception as inv_e:
            raise HTTPException(status_code=422, detail=f"Singular design matrix in weighted OLS: {str(inv_e)}")

        # Residuals
        E = arr_y - arr_X @ beta

        # 2. Taylor-linearized standard errors accounting for stratification & clustering
        M_X = arr_X @ M
        WE = arr_w * E
        U = M_X * WE[:, np.newaxis]

        unique_strata = np.unique(arr_strata)
        V = np.zeros((K, K))

        for h_val in unique_strata:
            stratum_mask = (arr_strata == h_val)
            U_h = U[stratum_mask]
            clusters_h = arr_cluster[stratum_mask]

            unique_clusters_h = np.unique(clusters_h)
            n_h = len(unique_clusters_h)

            if n_h == 0:
                continue

            U_h_psu = []
            for c_val in unique_clusters_h:
                cluster_mask = (clusters_h == c_val)
                U_hj = U_h[cluster_mask].sum(axis=0)
                U_h_psu.append(U_hj)

            U_h_psu = np.array(U_h_psu)
            mean_U_h = U_h_psu.mean(axis=0)

            if n_h > 1:
                diff = U_h_psu - mean_U_h
                cov_h = (diff.T @ diff) * (n_h / (n_h - 1))
            else:
                diff = U_h_psu - mean_U_h
                cov_h = diff.T @ diff

            if req.fpc is not None:
                cov_h *= (1.0 - req.fpc)

            V += cov_h

        # Survey standard errors
        se_survey = np.sqrt(np.maximum(1e-12, np.diag(V)))

        # 3. Simple Random Sampling (SRS) standard errors for comparison (Design Effect DEFF)
        try:
            XtX = arr_X.T @ arr_X
            M_srs = np.linalg.pinv(XtX)
            beta_srs = M_srs @ (arr_X.T @ arr_y)
            E_srs = arr_y - arr_X @ beta_srs
            sigma2 = np.sum(E_srs**2) / (N - K) if N > K else np.sum(E_srs**2) / N
            V_srs = sigma2 * M_srs
            se_srs = np.sqrt(np.maximum(1e-12, np.diag(V_srs)))
        except Exception as fallback_e:
            se_srs = se_survey

        # Design Effect (DEFF)
        deffs = []
        for s_survey, s_srs in zip(se_survey, se_srs):
            if s_srs > 0:
                deffs.append(float((s_survey**2) / (s_srs**2)))
            else:
                deffs.append(1.0)

        mean_deff = float(np.mean(deffs)) if len(deffs) > 0 else 1.0
        effective_sample_size = float(N / mean_deff) if mean_deff > 0 else float(N)

        # 4. Inference
        num_clusters = len(np.unique(arr_cluster))
        num_strata = len(unique_strata)
        df = num_clusters - num_strata
        if df <= 0:
            df = N - K

        t_stats = beta / se_survey
        p_values = 2 * (1 - stats.t.cdf(np.abs(t_stats), df=df))

        coef_rows = []
        for i, name in enumerate(req.variable_names):
            est = float(beta[i])
            se = float(se_survey[i])
            t = float(t_stats[i])
            p = float(p_values[i])
            deff_val = deffs[i]

            t_crit = float(stats.t.ppf(0.975, df=df))
            ci_low = est - t_crit * se
            ci_high = est + t_crit * se

            coef_rows.append({
                "variable": name,
                "estimate": round(est, 6),
                "stdError": round(se, 6),
                "tStat": round(t, 4),
                "pValue": round(p, 6),
                "confLow": round(ci_low, 6),
                "confHigh": round(ci_high, 6),
                "ciLower": f"{ci_low:.4f}",
                "ciUpper": f"{ci_high:.4f}",
                "stars": get_stars(p),
                "deff": round(deff_val, 4)
            })

        return {
            "coefficients": coef_rows,
            "effective_sample_size": round(effective_sample_size, 2),
            "n_obs": N,
            "num_clusters": num_clusters,
            "num_strata": num_strata,
            "df": df,
            "mean_deff": round(mean_deff, 4)
        }

    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


from fastapi import UploadFile, File
import pyreadstat
import tempfile
import os

@app.post("/api/parse-sav")
async def parse_sav(file: UploadFile = File(...)):
    # 1. Reject uploads over 100MB
    MAX_SIZE = 100 * 1024 * 1024  # 100MB
    if file.size and file.size > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 100MB)")

    tmp_path = None
    try:
        # Create a temporary file and stream content chunk by chunk to verify the actual size
        total_size = 0
        with tempfile.NamedTemporaryFile(delete=False, suffix=".sav") as tmp:
            while True:
                chunk = await file.read(1024 * 1024)  # Read 1MB chunk
                if not chunk:
                    break
                total_size += len(chunk)
                if total_size > MAX_SIZE:
                    tmp.close()
                    try:
                        os.unlink(tmp.name)
                    except:
                        pass
                    raise HTTPException(status_code=413, detail="File too large (max 100MB)")
                tmp.write(chunk)
            tmp_path = tmp.name

        # Parse using pyreadstat
        df, meta = pyreadstat.read_sav(tmp_path)
        
        # Handle nan values by replacing with None so JSON serialization works
        df = df.replace({float('nan'): None})

        return {
            "headers": df.columns.tolist(),
            "rows": df.values.tolist(),
            "variable_labels": meta.column_names_to_labels,
            "value_labels": meta.variable_value_labels
        }
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
    finally:
        # 2. Move temp-file deletion into a finally block
        if tmp_path and os.path.exists(tmp_path):
            os.remove(tmp_path)



class GMMRequest(BaseModel):
    data: List[Any]
    entityVar: str
    timeVar: str
    depVar: str
    instruments: List[str]

@app.post("/python/gmm")
def run_gmm(req: GMMRequest):
    try:
        from linearmodels.iv import IVGMM
        import pandas as pd
        import numpy as np
        import statsmodels.api as sm
        
        if len(req.data) > 0 and isinstance(req.data[0], list):
            df = pd.DataFrame(req.data)
            dep_col = int(req.depVar)
            instr_cols = [int(i) for i in req.instruments]
            ent_col = int(req.entityVar) if req.entityVar else None
            time_col = int(req.timeVar) if req.timeVar else None
        else:
            df = pd.DataFrame(req.data)
            dep_col = req.depVar
            instr_cols = req.instruments
            ent_col = req.entityVar
            time_col = req.timeVar
            
        if ent_col is None or time_col is None:
            raise HTTPException(
                status_code=422, 
                detail="Entity and Time variables are required to sort, lag, and difference panel data for Arellano-Bond dynamic GMM."
            )
            
        # Ensure correct panel alignment and sorting
        df = df.set_index([ent_col, time_col])
        df = df.sort_index(level=[0, 1])
        
        # 1. Construct lag-1 and lag-2 of dependent variable for GMM instrumenting
        df['y_lag1'] = df.groupby(level=0)[dep_col].shift(1)
        df['y_lag2'] = df.groupby(level=0)[dep_col].shift(2)
        
        # 2. First-differencing: dy_it and dy_it-1
        df['dy'] = df[dep_col] - df['y_lag1']
        df['dy_lag1'] = df['y_lag1'] - df['y_lag2']
        
        # 3. Differencing exogenous controls
        exog_cols = []
        for col in instr_cols:
            if col != dep_col:
                diff_col_name = f"d_{col}"
                df[diff_col_name] = df[col] - df.groupby(level=0)[col].shift(1)
                exog_cols.append(diff_col_name)
                
        # Drop NaN rows arising from first-differencing and lags
        model_df = df[['dy', 'dy_lag1', 'y_lag2'] + exog_cols].dropna()
        
        if len(model_df) < len(exog_cols) + 5:
            raise HTTPException(
                status_code=422, 
                detail="Insufficient data points after lagging and first-differencing. Ensure you have at least 3 periods per panel entity."
            )
            
        y_dep = model_df['dy'].astype(float)
        endog = model_df['dy_lag1'].astype(float)
        instr = model_df['y_lag2'].astype(float)
        
        if len(exog_cols) > 0:
            exog = model_df[exog_cols].astype(float)
            exog = sm.add_constant(exog, has_constant='add')
        else:
            exog = pd.Series(1, index=model_df.index, name='const')
            
        mod = IVGMM(y_dep, exog, endog, instr)
        res = mod.fit()
        
        coef_rows = []
        name_map = {'const': 'Constant (Trend)', 'dy_lag1': f'Lagged Dependent Variable L1.({dep_col})'}
        for col in instr_cols:
            if col != dep_col:
                name_map[f"d_{col}"] = f"Diff.{col}"
                
        for name in res.params.index:
            display_name = name_map.get(str(name), str(name))
            coef_rows.append(build_coef_row(
                display_name, res.params[name], res.std_errors[name],
                res.tstats[name], res.pvalues[name]
            ))
            
        # The instrument set is y_lag2 alone against the single endogenous
        # regressor dy_lag1, so the model is exactly identified and the Hansen J
        # test has no overidentifying restrictions to test — its p-value is NaN.
        # NaN is not JSON-serialisable, and the failure would occur during response
        # serialisation (after this handler returns), so the except block below
        # cannot catch it. Emit None instead, and say why.
        def _finite(value):
            try:
                v = float(value)
            except (TypeError, ValueError):
                return None
            return v if v == v and v not in (float('inf'), float('-inf')) else None

        j_stat = _finite(getattr(res, 'j_stat', None) and res.j_stat.stat)
        j_pval = _finite(getattr(res, 'j_stat', None) and res.j_stat.pval)

        return {
            "coefficients": coef_rows,
            "n_obs": int(res.nobs),
            "j_stat": round(j_stat, 4) if j_stat is not None else None,
            "j_pval": round(j_pval, 6) if j_pval is not None else None,
            "j_note": (
                None if j_pval is not None else
                "Model is exactly identified (one instrument, one endogenous regressor), "
                "so the Hansen J test of overidentifying restrictions is not defined."
            ),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

class CointegrationRequest(BaseModel):
    series: List[List[float]]
    seriesNames: List[str]

@app.post("/python/cointegration")
def run_cointegration(req: CointegrationRequest):
    try:
        from statsmodels.tsa.stattools import coint
        import numpy as np
        arr = np.array(req.series, dtype=float)
        if arr.shape[1] < 2:
            raise ValueError("Need at least 2 series for cointegration.")
        y0 = arr[:, 0]
        y1 = arr[:, 1:] if arr.shape[1] > 2 else arr[:, 1]
        coint_t, pvalue, crit_value = coint(y0, y1)
        return {
            "t_stat": round(float(coint_t), 4),
            "p_value": round(float(pvalue), 6),
            "crit_values": [round(float(cv), 4) for cv in crit_value]
        }
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

class CoxRequest(BaseModel):
    time: List[float]
    event: List[int]
    covariates: List[List[float]]
    covarNames: List[str]

@app.post("/python/cox")
def run_cox(req: CoxRequest):
    try:
        from lifelines import CoxPHFitter
        import pandas as pd
        df = pd.DataFrame(req.covariates, columns=req.covarNames)
        df['__time__'] = req.time
        df['__event__'] = req.event
        
        cph = CoxPHFitter()
        cph.fit(df, duration_col='__time__', event_col='__event__')
        
        s = cph.summary
        coefs = []
        for idx in s.index:
            coefs.append({
                "variable": idx,
                "estimate": safe_float(s.loc[idx,'coef']),
                "hazardRatio": safe_float(s.loc[idx,'exp(coef)']),
                "stdError": safe_float(s.loc[idx,'se(coef)']),
                "pValue": safe_float(s.loc[idx,'p']),
                "confLow": safe_float(s.loc[idx,'exp(coef) lower 95%']),
                "confHigh": safe_float(s.loc[idx,'exp(coef) upper 95%']),
                "stars": get_stars(float(s.loc[idx,'p'])),
            })
            
        return {
            "coefficients": coefs,
            "concordanceIndex": safe_float(cph.concordance_index_),
            "logLikelihood": safe_float(cph.log_likelihood_),
            "n": int(len(df)),
            "nEvents": int(df['__event__'].sum()),
        }
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

class ARIMARequest(BaseModel):
    series: List[float]
    p: int
    d: int
    q: int
    horizon: int = 10

@app.post("/python/arima-full")
def run_arima_full(req: ARIMARequest):
    try:
        from statsmodels.tsa.arima.model import ARIMA
        import pandas as pd
        series = pd.Series(req.series, dtype=float)
        # Refuse specifications the data cannot support. Without this, e.g.
        # ARIMA(5,0,5) on two observations returns a "fitted" model with
        # meaningless t-statistics in the millions.
        n_params = req.p + req.q + (1 if req.d == 0 else 0) + 1
        if len(series) < n_params + 5:
            raise HTTPException(
                status_code=422,
                detail=(f"Series too short for ARIMA({req.p},{req.d},{req.q}). "
                        f"Have {len(series)} observations, need at least {n_params + 5} "
                        f"for {n_params} parameters.")
            )
        model = ARIMA(series, order=(req.p, req.d, req.q))
        res = model.fit()

        coef_rows = []
        for name in res.params.index:
            try:
                cl = safe_float(res.conf_int()[0][name]) if name in res.conf_int()[0] else None
                ch = safe_float(res.conf_int()[1][name]) if name in res.conf_int()[1] else None
            except:
                cl, ch = None, None

            coef_rows.append(build_coef_row(
                str(name), res.params[name], res.bse[name],
                res.tvalues[name], res.pvalues[name]
            ))
            # Just to override confLow and confHigh nicely if they failed in build_coef_row
            if cl is not None: coef_rows[-1]["confLow"] = cl
            if ch is not None: coef_rows[-1]["confHigh"] = ch

        horizon = max(1, min(req.horizon, 100))
        forecast_obj = res.get_forecast(steps=horizon)
        forecast_mean = [safe_float(v) for v in forecast_obj.predicted_mean]
        forecast_ci_df = forecast_obj.conf_int(alpha=0.05)
        forecast_ci = [
            [safe_float(forecast_ci_df.iloc[i, 0]), safe_float(forecast_ci_df.iloc[i, 1])]
            for i in range(len(forecast_ci_df))
        ]

        return {
            "coefficients": coef_rows,
            "aic": round(res.aic, 4),
            "bic": round(res.bic, 4),
            "logLikelihood": round(res.llf, 4),
            "n_obs": int(res.nobs),
            "forecast": forecast_mean,
            "forecastCI": forecast_ci
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
