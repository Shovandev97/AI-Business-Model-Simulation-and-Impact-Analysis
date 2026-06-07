package com.bms.service;

import com.bms.util.Json;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class ImpactService {
  private static final Map<String, Double> MODEL_WEIGHTS = Map.of(
      "subscription", 1.1, "consumption-based", 1.35, "tiered", 1.2,
      "bundled-services", 1.25, "outcome-based", 1.55, "flexible-funding", 1.3, "hybrid", 1.45);
  private static final Map<String, Double> AREA_PROFILES = new LinkedHashMap<>() {{
    put("productConfiguration", 0.85); put("pricing", 1.05); put("charging", 1.15); put("billing", 1.2);
    put("invoicing", 0.95); put("collections", 0.8); put("revenueRecognition", 1.25); put("reporting", 0.9);
    put("customerService", 0.75); put("integrations", 1.3);
  }};

  public Map<String, Object> analyzeImpact(Map<String, Object> scenario, Map<String, Object> prediction) {
    double modelFactor = MODEL_WEIGHTS.getOrDefault(Json.str(scenario.get("businessModelType")), 1.0);
    double volumeFactor = Math.min(18, Math.log10(Json.num(scenario.get("transactionVolume")) + 10) * 3);
    double revenueFactor = Math.min(16, Math.log10(Json.num(scenario.get("expectedRevenue")) + 1000) * 2.2);
    double complianceFactor = Json.array(scenario.get("complianceRegions")).size() * 4.0;
    double integrationFactor = Json.num(scenario.get("integrationCount")) * 1.4;
    double complexityFactor = Json.num(scenario.get("processComplexity")) * 5;
    String billing = Json.str(scenario.get("billingFrequency"));
    double billingFactor = billing.equals("usage-event") || billing.equals("milestone") ? 12 : billing.equals("monthly") ? 7 : 3;
    double base = (complexityFactor + integrationFactor + complianceFactor + volumeFactor + billingFactor) * modelFactor;

    Map<String, Object> o2c = new LinkedHashMap<>();
    for (var entry : AREA_PROFILES.entrySet()) {
      double predictionSignal = Json.num(prediction.getOrDefault("billingComplexity", prediction.getOrDefault("downstreamIntegrationImpact", 50))) * 0.12;
      int score = Json.clamp(base * entry.getValue() + revenueFactor + predictionSignal);
      o2c.put(entry.getKey(), Json.obj("score", score, "severity", severity(score)));
    }
    int complianceRisk = Json.clamp(Json.num(prediction.getOrDefault("complianceRisk", 40)) * 0.75 + complianceFactor * 4 + ("outcome-based".equals(scenario.get("businessModelType")) ? 12 : 0));
    int implementationEffort = Json.clamp(Json.num(prediction.getOrDefault("operationalEffort", 45)) * 0.7 + complexityFactor + integrationFactor);
    double revenueImpact = Json.round2(Json.num(prediction.getOrDefault("revenueImpactPct", 0)));
    int delayProbability = Json.clamp(Json.num(prediction.getOrDefault("delayProbability", 35)) * 0.85 + Json.num(scenario.get("integrationCount")) * 0.8);

    return Json.obj(
        "scenarioId", scenario.get("id"),
        "o2cImpactScores", o2c,
        "systemImpactScores", Json.obj("erp", severity(Json.clamp(base * 0.95)), "billingPlatform", severity(Json.clamp(base * 1.25)), "crm", severity(Json.clamp(base * 0.8)), "dataWarehouse", severity(Json.clamp(base * 0.9)), "taxEngine", severity(complianceRisk)),
        "processImpactScores", Json.obj("quoteToContract", Json.clamp(base * 0.9), "orderCapture", Json.clamp(base * 0.75), "usageMediation", Json.clamp(base * 1.15), "invoiceDispute", Json.clamp(base * 0.85), "revenueClose", Json.clamp(base * 1.05)),
        "integrationImpactScores", Json.obj("impactedInterfaces", Math.max(1, Math.round(Json.num(scenario.get("integrationCount")) + Json.num(prediction.get("dependencyCount")) / 3)), "dataMappingComplexity", Json.clamp(base * 0.82), "apiChangeRisk", Json.clamp(base * 0.7 + Json.num(scenario.get("integrationCount")) * 2)),
        "complianceRisk", complianceRisk,
        "implementationEffort", implementationEffort,
        "revenueImpact", revenueImpact,
        "delayProbability", delayProbability,
        "confidenceScore", prediction.getOrDefault("confidence", 0.62),
        "generatedAt", Instant.now().toString());
  }

  public String severity(double score) {
    if (score >= 75) return "Very High";
    if (score >= 55) return "High";
    if (score >= 35) return "Medium";
    return "Low";
  }
}
