package com.bms.service;

import com.bms.util.Json;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class ImpactDetailsService {
  private static final Map<String, List<String>> AREA_SYSTEMS = new LinkedHashMap<>() {{
    put("productConfiguration", List.of("SAP CPQ", "SAP S/4HANA Product Master")); put("pricing", List.of("SAP Pricing", "Condition Contracts"));
    put("charging", List.of("Usage Mediation", "Rating Engine")); put("billing", List.of("SAP Billing", "Subscription Billing"));
    put("invoicing", List.of("SAP S/4HANA FI-CA", "Output Management")); put("collections", List.of("Collections Management", "Dispute Management"));
    put("revenueRecognition", List.of("RAR", "Universal Journal")); put("reporting", List.of("SAP Analytics Cloud", "Data Warehouse"));
    put("customerService", List.of("SAP Service Cloud", "Interaction Center")); put("integrations", List.of("Integration Suite", "API Management"));
  }};

  public Map<String, Object> buildImpactDetails(Map<String, Object> scenario, Map<String, Object> impact, Map<String, Object> predictionEnvelope) {
    Map<String, Object> prediction = Json.map(predictionEnvelope.getOrDefault("predictions", predictionEnvelope));
    List<Map<String, Object>> areaDetails = Json.map(impact.get("o2cImpactScores")).entrySet().stream().map(entry -> {
      Map<String, Object> value = Json.map(entry.getValue());
      double score = Json.num(value.getOrDefault("score", entry.getValue()));
      int dependencyCount = Math.max(1, (int) Math.round((score / 25) + Json.num(scenario.get("integrationCount")) / 3 + Json.num(prediction.get("dependencyCount")) / 12));
      return Json.obj("area", entry.getKey(), "label", Json.labelize(entry.getKey()), "score", score, "severity", value.get("severity"),
          "state", Json.stateFromScore(score), "reason", reasonFor(entry.getKey(), scenario, prediction), "affectedSystems", AREA_SYSTEMS.getOrDefault(entry.getKey(), List.of("SAP S/4HANA")),
          "requiredChanges", requiredChanges(entry.getKey(), scenario, prediction, score), "dependencyCount", dependencyCount);
    }).toList();
    List<Map<String, Object>> riskMetrics = List.of(
        metric("Implementation Risk", Json.num(prediction.getOrDefault("implementationRisk", impact.get("complianceRisk")))),
        metric("Operational Effort", Json.num(prediction.getOrDefault("operationalEffort", impact.get("implementationEffort")))),
        metric("Compliance Risk", Json.num(impact.get("complianceRisk"))),
        metric("Delay Probability", Json.num(impact.get("delayProbability"))),
        metric("Integration Complexity", Json.num(prediction.getOrDefault("downstreamIntegrationImpact", Json.map(impact.get("integrationImpactScores")).get("dataMappingComplexity")))),
        metric("Customer Impact", Json.num(prediction.get("billingComplexity")) * 0.45 + Json.num(impact.get("delayProbability")) * 0.35 + Json.num(scenario.get("processComplexity")) * 2));
    return Json.obj(
        "scenarioOverview", Json.obj("name", scenario.get("name"), "businessModelType", scenario.get("businessModelType"), "industry", scenario.get("industry"), "region", scenario.get("region"), "billingFrequency", scenario.get("billingFrequency"), "contractTerm", scenario.get("contractTerm"), "transactionVolume", scenario.get("transactionVolume")),
        "areaDetails", areaDetails,
        "riskMetrics", riskMetrics,
        "predictiveAi", Json.obj("predictedRiskScore", prediction.get("implementationRisk"), "predictedRevenueImpact", prediction.get("revenueImpactPct"), "predictedImplementationDelay", prediction.get("delayProbability"), "predictedComplianceExposure", prediction.get("complianceRisk"), "confidenceScore", predictionEnvelope.getOrDefault("confidence", impact.get("confidenceScore")), "topContributingFactors", predictionEnvelope.getOrDefault("topContributingFactors", List.of())),
        "charts", buildScenarioCharts(scenario, impact, predictionEnvelope),
        "generatedAt", Instant.now().toString());
  }

  public Map<String, Object> buildScenarioCharts(Map<String, Object> scenario, Map<String, Object> impact, Map<String, Object> predictionEnvelope) {
    Map<String, Object> prediction = Json.map(predictionEnvelope.getOrDefault("predictions", predictionEnvelope));
    List<Map<String, Object>> o2c = Json.map(impact.get("o2cImpactScores")).entrySet().stream().map(entry -> {
      Map<String, Object> value = Json.map(entry.getValue());
      return Json.obj("label", Json.labelize(entry.getKey()), "value", value.getOrDefault("score", entry.getValue()), "severity", value.get("severity"));
    }).toList();
    Map<String, Long> severityBreakdown = o2c.stream().collect(java.util.stream.Collectors.groupingBy(row -> Json.str(row.get("severity")), LinkedHashMap::new, java.util.stream.Collectors.counting()));
    return Json.obj(
        "o2cImpactByArea", o2c,
        "riskEffortBreakdown", List.of(Json.obj("label", "Risk", "value", Json.clamp(prediction.getOrDefault("implementationRisk", impact.get("complianceRisk")))), Json.obj("label", "Effort", "value", Json.clamp(prediction.getOrDefault("operationalEffort", impact.get("implementationEffort")))), Json.obj("label", "Compliance", "value", Json.clamp(impact.get("complianceRisk"))), Json.obj("label", "Delay", "value", Json.clamp(impact.get("delayProbability")))),
        "predictionConfidence", List.of(Json.obj("label", "Confidence", "value", Json.clamp(Json.num(predictionEnvelope.getOrDefault("confidence", impact.get("confidenceScore"))) * 100))),
        "dependencyDistribution", List.of(Json.obj("label", "Interfaces", "value", Json.map(impact.get("integrationImpactScores")).getOrDefault("impactedInterfaces", scenario.get("integrationCount"))), Json.obj("label", "Model Dependencies", "value", prediction.getOrDefault("dependencyCount", 0)), Json.obj("label", "Compliance Regions", "value", Json.array(scenario.get("complianceRegions")).size())),
        "severityBreakdown", severityBreakdown.entrySet().stream().map(e -> Json.obj("label", e.getKey(), "value", e.getValue())).toList());
  }

  private Map<String, Object> metric(String name, double value) {
    int clamped = Json.clamp(value);
    return Json.obj("name", name, "value", clamped, "state", Json.stateFromScore(clamped));
  }

  private String reasonFor(String area, Map<String, Object> scenario, Map<String, Object> prediction) {
    java.util.ArrayList<String> drivers = new java.util.ArrayList<>();
    if ("usage-event".equals(scenario.get("billingFrequency")) || "usage".equals(scenario.get("pricingType"))) drivers.add("usage-event charging cadence");
    if (Json.num(scenario.get("integrationCount")) > 8) drivers.add(Json.integer(scenario.get("integrationCount")) + " integrations");
    if (Json.array(scenario.get("complianceRegions")).size() > 2) drivers.add(Json.array(scenario.get("complianceRegions")).size() + " compliance regions");
    if (Json.num(scenario.get("processComplexity")) > 6) drivers.add("process complexity " + Json.integer(scenario.get("processComplexity")) + "/10");
    if (Json.num(prediction.get("billingComplexity")) > 65 && List.of("billing", "charging", "invoicing").contains(area)) drivers.add("predicted billing complexity " + Math.round(Json.num(prediction.get("billingComplexity"))));
    if (Json.num(prediction.get("complianceRisk")) > 60 && "revenueRecognition".equals(area)) drivers.add("predicted compliance exposure " + Math.round(Json.num(prediction.get("complianceRisk"))));
    return drivers.isEmpty() ? Json.labelize(area) + " impact is primarily driven by the selected " + scenario.get("businessModelType") + " model and transaction profile." : Json.labelize(area) + " is impacted by " + String.join(", ", drivers) + ".";
  }

  private List<String> requiredChanges(String area, Map<String, Object> scenario, Map<String, Object> prediction, double score) {
    java.util.ArrayList<String> changes = new java.util.ArrayList<>();
    if (score >= 55) changes.add("Update " + Json.labelize(area) + " operating design");
    if (List.of("charging", "billing").contains(area) && Json.num(prediction.get("billingComplexity")) >= 55) changes.add("Validate rating, billing-event and adjustment rules");
    if ("revenueRecognition".equals(area)) changes.add("Confirm revenue recognition treatment and close controls");
    if ("integrations".equals(area)) changes.add("Map upstream/downstream API and data contract changes");
    if (Json.array(scenario.get("complianceRegions")).size() > 1 && List.of("invoicing", "reporting", "revenueRecognition").contains(area)) changes.add("Review regional compliance and tax reporting requirements");
    return changes.isEmpty() ? List.of("Monitor process design during implementation planning") : changes;
  }
}
