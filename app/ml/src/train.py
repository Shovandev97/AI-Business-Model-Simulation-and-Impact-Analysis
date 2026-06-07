import json
import subprocess
import sys
import argparse
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
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
NUMERIC = ["contractTerm", "transactionVolume", "expectedRevenue", "complianceRegionCount", "integrationCount", "processComplexity"]

def ensure_data(regenerate=False, rows=None, seed=42):
    if regenerate or not DATA_FILE.exists():
        script = Path(__file__).resolve().parents[3] / "scripts" / "generate_synthetic_data.py"
        command = [sys.executable, str(script)]
        if rows:
            command.extend(["--rows", str(rows)])
        if seed is not None:
            command.extend(["--seed", str(seed)])
        subprocess.run(command, check=True)

def train(regenerate=False, rows=None, seed=42):
    ensure_data(regenerate=regenerate, rows=rows, seed=seed)
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(DATA_FILE)
    x = df[CATEGORICAL + NUMERIC]
    y = df[TARGETS]
    x_train, x_test, y_train, y_test = train_test_split(x, y, test_size=0.2, random_state=42)
    preprocessor = ColumnTransformer(
        transformers=[
            ("cat", OneHotEncoder(handle_unknown="ignore"), CATEGORICAL),
            ("num", StandardScaler(), NUMERIC),
        ]
    )
    model = RandomForestRegressor(n_estimators=180, min_samples_leaf=3, random_state=42, n_jobs=-1)
    pipeline = Pipeline([("preprocessor", preprocessor), ("model", model)])
    pipeline.fit(x_train, y_train)
    predictions = pipeline.predict(x_test)
    metrics = {
        "mae": float(mean_absolute_error(y_test, predictions)),
        "r2": float(r2_score(y_test, predictions, multioutput="variance_weighted")),
    }
    artifact = {
        "pipeline": pipeline,
        "targets": TARGETS,
        "categorical": CATEGORICAL,
        "numeric": NUMERIC,
        "feature_names": CATEGORICAL + NUMERIC,
    }
    joblib.dump(artifact, MODEL_FILE)
    info = {
        "modelVersion": "rf-o2c-2026.06",
        "trainedAt": datetime.now(timezone.utc).isoformat(),
        "datasetRows": int(len(df)),
        "trainingRows": int(len(x_train)),
        "testRows": int(len(x_test)),
        "metrics": metrics,
        "targets": TARGETS,
        "algorithm": "RandomForestRegressor with one-hot encoded categorical features",
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
