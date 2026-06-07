import json
import subprocess
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

from .train import add_derived_features

MODEL_DIR = Path(__file__).resolve().parents[1] / "models"
MODEL_FILE = MODEL_DIR / "business_model_predictor.joblib"
INFO_FILE = MODEL_DIR / "model_info.json"
DATA_FILE = Path(__file__).resolve().parents[1] / "data" / "historical_training_records.csv"

class ModelService:
    def __init__(self):
        self.artifact = None
        self.info = None

    def ensure_loaded(self):
        if not MODEL_FILE.exists():
            self.train()
        if self.artifact is None:
            self.artifact = joblib.load(MODEL_FILE)
            self.info = json.loads(INFO_FILE.read_text())

    def _current_dataset_rows(self):
        if not DATA_FILE.exists():
            return 0
        with DATA_FILE.open("r", encoding="utf-8") as file:
            return max(0, sum(1 for _ in file) - 1)

    def train(self, growth_rows=500, target_rows=None, regenerate_data=True, seed=42):
        script = Path(__file__).resolve().parent / "train.py"
        command = [sys.executable, str(script)]
        if regenerate_data:
            current_rows = self._current_dataset_rows()
            rows = target_rows or max(2500, current_rows + growth_rows)
            command.extend(["--regenerate-data", "--rows", str(rows), "--seed", str(seed)])
        subprocess.run(command, check=True)
        self.artifact = joblib.load(MODEL_FILE)
        self.info = json.loads(INFO_FILE.read_text())
        return self.info

    def model_info(self):
        self.ensure_loaded()
        return {"status": "ready", **self.info}

    def predict(self, scenario):
        self.ensure_loaded()
        features = self.artifact["categorical"] + self.artifact["numeric"]
        row = scenario.copy()
        row["complianceRegionCount"] = len(row.get("complianceRegions", []))
        frame = add_derived_features(pd.DataFrame([row]))
        frame = frame.reindex(columns=features)
        raw = self.artifact["pipeline"].predict(frame)[0]
        targets = self.artifact["targets"]
        predictions = {target: round(float(value), 2) for target, value in zip(targets, raw)}
        predictions["dependencyCount"] = int(round(predictions["dependencyCount"]))
        confidence = self._confidence(frame, raw)
        factors = self._top_factors(frame)
        return {
            "scenarioId": scenario.get("id"),
            "predictions": predictions,
            "confidence": confidence,
            "topContributingFactors": factors,
            "modelVersion": self.info["modelVersion"],
            "trainingMetadata": {
                "trainedAt": self.info["trainedAt"],
                "datasetRows": self.info.get("datasetRows"),
                "trainingRows": self.info["trainingRows"],
                "testRows": self.info.get("testRows"),
                "metrics": self.info["metrics"],
                "perTargetMetrics": self.info.get("perTargetMetrics", {}),
                "selectedModel": self.info.get("selectedModel", "random_forest"),
                "derivedFeatures": self.info.get("derivedFeatures", self.artifact.get("derived_numeric", [])),
            },
        }

    def _confidence(self, frame, raw_prediction):
        base = self._metric_confidence()
        dispersion_penalty = self._ensemble_dispersion_penalty(frame)
        distribution_penalty = self._distribution_penalty(frame)
        confidence = max(0.45, min(0.96, base - dispersion_penalty - distribution_penalty))
        return round(confidence, 2)

    def _metric_confidence(self):
        r2 = float(self.info.get("metrics", {}).get("r2", 0.75))
        return 0.56 + max(0, min(1, r2)) * 0.38

    def _ensemble_dispersion_penalty(self, frame):
        model = self.artifact["pipeline"].named_steps["model"]
        if not hasattr(model, "estimators_"):
            return 0
        transformed = self.artifact["pipeline"].named_steps["preprocessor"].transform(frame)
        predictions = []
        for estimator in model.estimators_:
            prediction = estimator.predict(transformed)[0]
            if np.ndim(prediction) == 0:
                return 0
            predictions.append(prediction)
        if not predictions:
            return 0
        dispersion = float(np.mean(np.std(np.array(predictions), axis=0)))
        return min(0.18, dispersion / 100)

    def _distribution_penalty(self, frame):
        profile = self.artifact.get("training_profile", {})
        penalty = 0
        numeric_ranges = profile.get("numericRanges", {})
        for column, bounds in numeric_ranges.items():
            value = frame.iloc[0].get(column)
            if value is None or pd.isna(value):
                penalty += 0.02
                continue
            if value < bounds.get("min", value) or value > bounds.get("max", value):
                penalty += 0.03
        categories = profile.get("categories", {})
        for column, values in categories.items():
            value = str(frame.iloc[0].get(column))
            if value and value not in values:
                penalty += 0.03
        return min(0.18, penalty)

    def _top_factors(self, frame):
        preprocessor = self.artifact["pipeline"].named_steps["preprocessor"]
        model = self.artifact["pipeline"].named_steps["model"]
        importances = self._feature_importances(model)
        if importances is None:
            return self._domain_factors(frame)
        names = preprocessor.get_feature_names_out()
        pairs = sorted(zip(names, importances), key=lambda item: item[1], reverse=True)[:6]
        readable = []
        for name, importance in pairs:
            label = self._readable_feature_name(name)
            readable.append({"factor": label, "importance": round(float(importance), 4)})
        return readable

    def _feature_importances(self, model):
        if hasattr(model, "feature_importances_"):
            return model.feature_importances_
        estimators = getattr(model, "estimators_", [])
        nested = [estimator.feature_importances_ for estimator in estimators if hasattr(estimator, "feature_importances_")]
        if not nested:
            return None
        return np.mean(np.array(nested), axis=0)

    def _readable_feature_name(self, name):
        clean = name.replace("cat__", "").replace("num__", "")
        for field in self.artifact["categorical"]:
            prefix = f"{field}_"
            if clean.startswith(prefix):
                return f"{self._labelize(field)}: {clean[len(prefix):]}"
        return self._labelize(clean)

    def _labelize(self, value):
        text = "".join([f" {char}" if char.isupper() else char for char in value]).strip()
        return text.replace("_", " ").title()

    def _domain_factors(self, frame):
        row = frame.iloc[0]
        candidates = [
            ("Enterprise Complexity Index", row.get("enterpriseComplexityIndex", 0)),
            ("Integration Count", row.get("integrationCount", 0) * 5),
            ("Process Complexity", row.get("processComplexity", 0) * 10),
            ("Compliance Region Count", row.get("complianceRegionCount", 0) * 12),
            ("Revenue Scale", row.get("revenueScale", 0) * 10),
            ("Transaction Volume Scale", row.get("transactionVolumeScale", 0) * 8),
        ]
        total = sum(max(0, float(value or 0)) for _, value in candidates) or 1
        return [
            {"factor": label, "importance": round(max(0, float(value or 0)) / total, 4)}
            for label, value in sorted(candidates, key=lambda item: item[1], reverse=True)[:6]
        ]

service = ModelService()
