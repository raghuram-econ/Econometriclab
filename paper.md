---
title: 'Econometrics Lab: A Browser-Based Workbench for Teaching and Research in Applied Econometrics'
tags:
  - econometrics
  - education
  - reproducibility
  - panel data
  - causal inference
authors:
  - name: Raghuram M
    orcid: 0009-0000-0031-0525
    affiliation: 1
affiliations:
  - name: Bharathiar University, India
    index: 1
date: 12 August 2026
bibliography: paper.bib
---

# Summary

Econometrics Lab is a browser-based workbench that runs a broad suite of econometric
estimators directly in the client, or on a companion FastAPI backend for methods that
require an established statistical package. Supported methods span ordinary least
squares, panel fixed- and random-effects, instrumental-variables/2SLS, regression
discontinuity (sharp and fuzzy, including an `rdrobust`-equivalent research-grade path),
difference-in-differences (including Callaway–Sant'Anna staggered adoption), dynamic-panel
GMM (Arellano–Bond [@arellano1991some] and Blundell–Bond [@blundell1998initial]), the
synthetic control method [@abadie2010synthetic], generalized linear models (Poisson,
negative binomial, logit, probit), Heckman sample selection, ARIMA/VAR/GARCH
time-series models, and Cox proportional-hazards survival models. Every
result can be paired with a plain-language, AI-generated interpretation alongside its
technical output, and every result can export the Stata, R, and Python code needed to
reproduce that exact estimate outside the application.

# Statement of need

Econometrics instruction and applied econometric research both depend on the same
underlying estimators, but are usually served by different tools: point-and-click
teaching software that abstracts away the mechanics students need to eventually
understand, versus command-line statistical packages (Stata, R, Python) that assume
fluency the software does not build. Econometrics Lab targets both audiences with one
engine: students get guided, annotated workflows with plain-language interpretation next
to the technical output, while researchers get an estimator suite computed against real,
established statistical packages (`statsmodels` [@seabold2010statsmodels],
`linearmodels`, `rdrobust` [@calonico2014robust], `pydynpd` [@wu2023pydynpd], `pysyncon`
[@fordham2022pysyncon], and `csdid` [@callaway2024csdid], implementing
[@callaway2021difference]) and a replication-code exporter that lets a result computed
in the browser be reproduced exactly in Stata, R, or Python.

A central design constraint is that the replication code shown to the user must actually
reproduce the number the application computed -- not merely resemble syntactically
plausible code for the general method. Several estimators in this codebase are
deliberately simplified relative to their canonical form (for example, an
Anderson-Hsiao-style single-instrument difference-GMM path, and a cumulative-threshold
binary-logit approximation to ordered logit), and the exported replication code mirrors
the estimator that actually ran rather than the textbook version of the method, with the
distinction documented in-app. Numerical correctness is further certified against the
NIST Statistical Reference Datasets [@nist-strd] for baseline linear regression
precision, and the full estimator suite is covered by an automated test corpus that
checks results against independently computed reference values rather than only internal
self-consistency.

Econometrics Lab is aimed at instructors introducing applied econometrics who want
students to see a plain-language interpretation next to the formal statistics, and at
researchers who want a fast environment to prototype a specification before handing off
a verified replication script for the final analysis. The deployed application also
includes ancillary study features (a concept glossary, a quiz mode, an AI tutoring
chat) built on top of this estimation core; these are outside the scope of this paper,
which concerns the econometric-computation engine and its numerical and
replication-code fidelity.

# State of the field

Applied econometrics is typically taught and practiced with command-line statistical
packages (Stata, R, Python), which offer full estimator coverage and are the standard
for publication-grade work but assume programming fluency and provide no guided,
plain-language interpretation layer. General-purpose point-and-click statistics
software aimed at teaching, such as jamovi and JASP, lowers that barrier but is not
econometrics-specific: neither offers native support for panel-data fixed/random
effects, dynamic-panel GMM, regression discontinuity, difference-in-differences, or
synthetic control. Gretl is a free, econometrics-specific alternative closer in scope,
but is desktop software requiring local installation and does not pair results with
plain-language interpretation or export multi-language replication code. Econometrics
Lab occupies the remaining gap: zero-install, browser-based access to an
econometrics-specific estimator suite that pairs guided interpretation with
verified-fidelity replication-code export in the same interface.

# References
