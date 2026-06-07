import json
import subprocess
import sys
from pathlib import Path

import joblib
import numpy as np
import pandas as pd

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
        frame = pd.DataFrame([{key: row.get(key) for key in features}])
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
            },
        }

    def _confidence(self, frame, raw_prediction):
        model = self.artifact["pipeline"].named_steps["model"]
        transformed = self.artifact["pipeline"].named_steps["preprocessor"].transform(frame)
        tree_predictions = np.array([tree.predict(transformed)[0] for tree in model.estimators_])
        dispersion = float(np.mean(np.std(tree_predictions, axis=0)))
        confidence = max(0.52, min(0.94, 0.92 - dispersion / 85))
        return round(confidence, 2)

    def _top_factors(self, frame):
        preprocessor = self.artifact["pipeline"].named_steps["preprocessor"]
        model = self.artifact["pipeline"].named_steps["model"]
        names = preprocessor.get_feature_names_out()
        importances = model.feature_importances_
        pairs = sorted(zip(names, importances), key=lambda item: item[1], reverse=True)[:6]
        readable = []
        for name, importance in pairs:
            label = name.replace("cat__", "").replace("num__", "").replace("_", " = ")
            readable.append({"factor": label, "importance": round(float(importance), 4)})
        return readable

service = ModelService()
