from app.ml.src.model_service import service

def test_prediction_contract():
    result = service.predict({
        "id": "test",
        "businessModelType": "subscription",
        "industry": "Industrial Manufacturing",
        "customerSegment": "Enterprise",
        "region": "North America",
        "pricingType": "tiered",
        "contractTerm": 36,
        "billingFrequency": "monthly",
        "fundingModel": "opex",
        "bundleType": "hardware-software-service",
        "transactionVolume": 85000,
        "expectedRevenue": 12500000,
        "complianceRegions": ["US", "EU"],
        "integrationCount": 9,
        "processComplexity": 7,
    })
    assert "predictions" in result
    assert "implementationRisk" in result["predictions"]
    assert result["confidence"] > 0
    assert "selectedModel" in result["trainingMetadata"]
    assert "perTargetMetrics" in result["trainingMetadata"]
