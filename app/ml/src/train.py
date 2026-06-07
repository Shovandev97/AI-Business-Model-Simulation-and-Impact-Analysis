import json
import math
import subprocess
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.base import clone
from sklearn.ensemble import ExtraTreesRegressor, HistGradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import KFold, train_test_split
from sklearn.multioutput import MultiOutputRegressor
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).resolve().parents[3]
DATA_DIR = ROOT / "ml" / "data" if (ROOT / "ml").exists() else Path(__file__).resolve().parents[1] / "data"
MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
DATA_FILE = DATA_DIR / "historical_training_records.csv"
MODEL_FILE = MODEL_DIR / "business_model_predictor.joblib"
INFO_FILE = MODEL_DIR / "model_info.json"

TARGETS = ["implementationRisk", "billingComplexity", "revenueImpactPct", "complianceRisk", "delayProbability", "dependencyCount", "operationalEffort", "downstreamIntegrationImpact"]
CATEGORICAL = ["businessModelType", "industry", "customerSegment", "region", "pricingType", "billingFrequency", "fundingModel", "bundleType"]
BASE_NUMERIC = ["contractTerm", "transactionVolume", "expectedRevenue", "complianceRegionCount", "integrationCount", "processComplexity"]
DERIVED_NUMERIC = [
    "revenuePerTransaction",
    "monthlyContractValue",
    "integrationComplexityIndex",
    "complianceDensity",
    "revenueScale",
    "transactionVolumeScale",
    "enterpriseComplexityIndex",
]
NUMERIC = BASE_NUMERIC + DERIVED_NUMERIC

def ensure_data(regenerate=False, rows=None, seed=42):
    if regenerate or not DATA_FILE.exists():
        script = Path(__file__).resolve().parents[3] / "scripts" / "generate_synthetic_data.py"
        command = [sys.executable, str(script)]
        if rows:
            command.extend(["--rows", str(rows)])
        if seed is not None:
            command.extend(["--seed", str(seed)])
        subprocess.run(command, check=True)

def safe_divide(numerator, denominator):
    denominator = denominator.replace(0, 1)
    return numerator / denominator

def add_derived_features(df):
    enriched = df.copy()
    enriched["transactionVolume"] = pd.to_numeric(enriched["transactionVolume"], errors="coerce").fillna(0)
    enriched["expectedRevenue"] = pd.to_numeric(enriched["expectedRevenue"], errors="coerce").fillna(0)
    enriched["contractTerm"] = pd.to_numeric(enriched["contractTerm"], errors="coerce").fillna(1)
    enriched["integrationCount"] = pd.to_numeric(enriched["integrationCount"], errors="coerce").fillna(0)
    enriched["processComplexity"] = pd.to_numeric(enriched["processComplexity"], errors="coerce").fillna(1)
    enriched["complianceRegionCount"] = pd.to_numeric(enriched["complianceRegionCount"], errors="coerce").fillna(0)

    enriched["revenuePerTransaction"] = safe_divide(enriched["expectedRevenue"], enriched["transactionVolume"])
    enriched["monthlyContractValue"] = safe_divide(enriched["expectedRevenue"], enriched["contractTerm"])
    enriched["integrationComplexityIndex"] = enriched["integrationCount"] * enriched["processComplexity"]
    enriched["complianceDensity"] = safe_divide(enriched["complianceRegionCount"], enriched["processComplexity"])
    enriched["revenueScale"] = (enriched["expectedRevenue"].clip(lower=1)).map(math.log10)
    enriched["transactionVolumeScale"] = (enriched["transactionVolume"].clip(lower=1)).map(math.log10)
    enriched["enterpriseComplexityIndex"] = (
        enriched["processComplexity"] * 10
        + enriched["integrationCount"] * 2
        + enriched["complianceRegionCount"] * 5
    )
    return enriched

def build_pipeline(model):
    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CATEGORICAL),
            ("num", StandardScaler(), NUMERIC),
        ],
        remainder="drop",
    )
    return Pipeline([("preprocessor", preprocessor), ("model", model)])

def candidate_models(seed):
    return {
        "extra_trees": ExtraTreesRegressor(
            n_estimators=360,
            min_samples_leaf=2,
            max_features=0.85,
            random_state=seed,
            n_jobs=-1,
        ),
        "random_forest": RandomForestRegressor(
            n_estimators=320,
            min_samples_leaf=2,
            max_features=0.85,
            random_state=seed,
            n_jobs=-1,
        ),
        "hist_gradient_boosting": MultiOutputRegressor(
            HistGradientBoostingRegressor(
                max_iter=260,
                learning_rate=0.05,
                l2_regularization=0.08,
                random_state=seed,
            )
        ),
    }

def evaluate_predictions(y_true, predictions):
    per_target = {}
    for index, target in enumerate(TARGETS):
        per_target[target] = {
            "mae": float(mean_absolute_error(y_true.iloc[:, index], predictions[:, index])),
            "r2": float(r2_score(y_true.iloc[:, index], predictions[:, index])),
        }
    return {
        "mae": float(mean_absolute_error(y_true, predictions)),
        "r2": float(r2_score(y_true, predictions, multioutput="variance_weighted")),
        "perTarget": per_target,
    }

def cross_validate_model(name, model, x, y, seed):
    folds = KFold(n_splits=3, shuffle=True, random_state=seed)
    fold_metrics = []
    for train_index, validation_index in folds.split(x):
        pipeline = build_pipeline(clone(model))
        pipeline.fit(x.iloc[train_index], y.iloc[train_index])
        predictions = pipeline.predict(x.iloc[validation_index])
        metrics = evaluate_predictions(y.iloc[validation_index], predictions)
        fold_metrics.append({"mae": metrics["mae"], "r2": metrics["r2"]})
    return {
        "name": name,
        "meanMae": float(sum(item["mae"] for item in fold_metrics) / len(fold_metrics)),
        "meanR2": float(sum(item["r2"] for item in fold_metrics) / len(fold_metrics)),
        "folds": fold_metrics,
    }

def training_profile(df):
    return {
        "numericRanges": {
            column: {
                "min": float(df[column].min()),
                "max": float(df[column].max()),
            }
            for column in NUMERIC
        },
        "categories": {
            column: sorted(df[column].dropna().astype(str).unique().tolist())
            for column in CATEGORICAL
        },
    }

def train(regenerate=False, rows=None, seed=42):
    ensure_data(regenerate=regenerate, rows=rows, seed=seed)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    df = add_derived_features(pd.read_csv(DATA_FILE))
    x = df[CATEGORICAL + NUMERIC]
    y = df[TARGETS]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=seed)
    candidates = candidate_models(seed)
    candidate_metrics = [
        cross_validate_model(name, model, x_train, y_train, seed)
        for name, model in candidates.items()
    ]
    best = sorted(candidate_metrics, key=lambda item: (item["meanMae"], -item["meanR2"]))[0]
    pipeline = build_pipeline(clone(candidates[best["name"]]))
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)
    metrics = evaluate_predictions(y_test, predictions)
    artifact = {
        "pipeline": pipeline,
        "targets": TARGETS,
        "categorical": CATEGORICAL,
        "numeric": NUMERIC,
        "feature_names": CATEGORICAL + NUMERIC,
        "base_numeric": BASE_NUMERIC,
        "derived_numeric": DERIVED_NUMERIC,
        "training_profile": training_profile(x_train),
    }
    joblib.dump(artifact, MODEL_FILE)
    info = {
        "modelVersion": "tabular-o2c-2026.06.1",
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "datasetRows": int(len(df)),
        "trainingRows": int(len(x_train)),
        "testRows": int(len(x_test)),
        "metrics": {
            "mae": metrics["mae"],
            "r2": metrics["r2"],
        },
        "perTargetMetrics": metrics["perTarget"],
        "targets": TARGETS,
        "selectedModel": best["name"],
        "candidateMetrics": candidate_metrics,
        "featureNames": CATEGORICAL + NUMERIC,
        "derivedFeatures": DERIVED_NUMERIC,
        "validation": {
            "selection": "3-fold cross-validation on the training split; final metrics reported on a held-out 20% test split.",
            "selectionMetric": "lowest mean cross-validation MAE, tie-broken by higher R2",
        },
        "algorithm": "Automatically selected scikit-learn tabular regressor with one-hot categorical features and engineered business indicators",
    }
    INFO_FILE.write_text(json.dumps(info, indent=2))
    print(json.dumps(info, indent=2))
    return info

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Train the local predictive O2C model.")
    parser.add_argument("--regenerate-data", action="store_true", help="Regenerate the synthetic historical dataset before training.")
    parser.add_argument("--rows", type=int, default=None, help="Dataset row count to generate when regenerating data.")
    parser.add_argument("--seed", type=int, default=42, help="Synthetic data seed.")
    args = parser.parse_args()
    train(regenerate=args.regenerate_data, rows=args.rows, seed=args.seed)
