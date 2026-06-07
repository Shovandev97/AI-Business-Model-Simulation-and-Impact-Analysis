from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional

from .model_service import service

class Scenario(BaseModel):
    id: Optional[str] = None
    name: Optional[str] = None
    businessModelType: str
    industry: str
    customerSegment: str
    region: str
    pricingType: str
    contractTerm: int = Field(ge=1, le=120)
    billingFrequency: str
    fundingModel: str
    bundleType: str
    transactionVolume: int = Field(ge=1)
    expectedRevenue: float = Field(ge=1000)
    complianceRegions: List[str]
    integrationCount: int = Field(ge=0)
    processComplexity: int = Field(ge=1, le=10)

class TrainRequest(BaseModel):
    growthRows: int = Field(default=500, ge=0, le=10000)
    targetRows: Optional[int] = Field(default=None, ge=1000, le=100000)
    regenerateData: bool = True
    seed: int = 42

app = FastAPI(title="Business Model Predictive AI Service", version="1.0.0")

@app.get("/ml/model-info")
def model_info():
    try:
        return service.model_info()
    except Exception as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc

@app.post("/ml/train")
def train(request: Optional[TrainRequest] = None):
    try:
        config = request or TrainRequest()
        return {
            "status": "trained",
            **service.train(
                growth_rows=config.growthRows,
                target_rows=config.targetRows,
                regenerate_data=config.regenerateData,
                seed=config.seed
            )
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

@app.post("/ml/predict")
def predict(scenario: Scenario):
    try:
        return service.predict(scenario.model_dump())
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
