package com.bms.service;

import com.bms.util.Json;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class DashboardService {
  private final ComparisonService comparisonService;

  public DashboardService(ComparisonService comparisonService) {
    this.comparisonService = comparisonService;
  }

  public Map<String, Object> buildDashboardSummary(Map<String, Object> state) {
    List<Map<String, Object>> analyses = latestAnalyses(state);
    List<Double> risks = analyses.stream().map(item -> Json.num(Json.map(item.get("predictionValues")).getOrDefault("implementationRisk", Json.map(item.get("impact")).get("complianceRisk")))).toList();
    List<Double> efforts = analyses.stream().map(item -> Json.num(Json.map(item.get("impact")).getOrDefault("implementationEffort", Json.map(item.get("predictionValues")).get("operationalEffort")))).toList();
    List<Double> revenues = analyses.stream().map(item -> Json.num(Json.map(item.get("impact")).getOrDefault("revenueImpact", Json.map(item.get("predictionValues")).get("revenueImpactPct")))).toList();
    int avgRisk = Json.average(risks);
    int avgEffort = Json.average(efforts);
    int avgRevenue = Json.average(revenues);
    Map<String, Object> latestRecommendation = analyses.isEmpty() ? null : Json.map(analyses.get(0).get("recommendation"));
    String portfolioHealth = analyses.isEmpty() ? "No Data" : avgRisk >= 75 ? "High Risk" : avgRisk >= 55 ? "Needs Review" : avgRevenue > 7 ? "Opportunity Found" : "Healthy";
    Map<String, List<Map<String, Object>>> modelGroups = analyses.stream().collect(java.util.stream.Collectors.groupingBy(item -> Json.str(Json.map(item.get("scenario")).get("businessModelType")), LinkedHashMap::new, java.util.stream.Collectors.toList()));
    Map<String, List<Double>> o2cGroups = new LinkedHashMap<>();
    analyses.forEach(item -> Json.map(Json.map(item.get("impact")).get("o2cImpactScores")).forEach((area, value) -> o2cGroups.computeIfAbsent(area, k -> new java.util.ArrayList<>()).add(Json.num(Json.map(value).getOrDefault("score", value)))));
    List<Map<String, Object>> riskBuckets = List.of("Low Risk", "Medium Risk", "High Risk", "Critical Risk").stream().map(level -> Json.obj("riskLevel", level, "count", risks.stream().filter(r -> riskLevel(r).equals(level)).count())).toList();
    Map<String, Object> best = analyses.stream().map(item -> Json.obj("item", item, "score", comparisonService.scoreScenario(Json.map(item.get("scenario")), Json.map(item.get("impact")), Json.map(item.get("predictionValues"))))).max(Comparator.comparing(item -> Json.num(Json.map(item.get("score")).get("recommendationScore")))).orElse(null);
    return Json.obj(
        "success", true,
        "calculatedAt", Instant.now().toString(),
        "emptyState", analyses.isEmpty() ? Json.obj("title", "No scenarios analyzed yet", "message", "Create and analyze your first business model scenario to see portfolio insights.", "actionText", "Create Scenario") : null,
        "executiveSummary", Json.obj("totalScenarios", analyses.size(), "portfolioHealth", portfolioHealth, "portfolioHealthState", Json.stateFromScore(avgRisk), "averageRiskScore", avgRisk, "averageEffortScore", avgEffort, "averageRevenueImpact", avgRevenue, "latestRecommendationStatus", latestRecommendation == null ? "No recommendation yet" : recommendationStatus(analyses.get(0))),
        "businessModelDistribution", modelGroups.entrySet().stream().map(entry -> Json.obj("modelType", entry.getKey(), "count", entry.getValue().size(), "averageScore", Json.average(entry.getValue().stream().map(item -> Json.num(comparisonService.scoreScenario(Json.map(item.get("scenario")), Json.map(item.get("impact")), Json.map(item.get("predictionValues"))).get("recommendationScore"))).toList()))).toList(),
        "riskRevenueMatrix", analyses.stream().map(item -> matrixRow(item)).toList(),
        "o2cImpactHeatmap", o2cGroups.entrySet().stream().map(entry -> { int average = Json.average(entry.getValue()); return Json.obj("area", Json.labelize(entry.getKey()), "averageImpactScore", average, "severity", severity(average), "state", Json.stateFromScore(average)); }).sorted((a, b) -> Double.compare(Json.num(b.get("averageImpactScore")), Json.num(a.get("averageImpactScore")))).toList(),
        "riskDistribution", riskBuckets,
        "implementationEffortBreakdown", effortBreakdown(analyses),
        "topRecommendedModel", best == null ? null : topRecommended(best),
        "scenariosRequiringAttention", analyses.stream().filter(item -> Json.num(Json.map(item.get("predictionValues")).getOrDefault("implementationRisk", Json.map(item.get("impact")).get("complianceRisk"))) >= 55 || Json.num(Json.map(item.get("impact")).get("delayProbability")) >= 55 || Json.num(Json.map(item.get("impact")).get("complianceRisk")) >= 55).map(this::attentionRow).limit(8).toList(),
        "recentActivity", analyses.stream().limit(8).map(this::recentRow).toList());
  }

  public Map<String, Object> buildDashboardCharts(Map<String, Object> state) {
    Map<String, Object> summary = buildDashboardSummary(state);
    List<Map<String, Object>> recent = Json.array(summary.get("recentActivity")).stream().map(Json::map).toList();
    List<Map<String, Object>> matrix = Json.array(summary.get("riskRevenueMatrix")).stream().map(Json::map).toList();
    java.util.Collections.reverse(recent);
    return Json.obj("scenarioVolumeTrend", java.util.stream.IntStream.range(0, recent.size()).mapToObj(i -> Json.obj("label", "Run " + (i + 1), "value", i + 1, "scenario", recent.get(i).get("scenarioName"))).toList(),
        "riskDistribution", Json.array(summary.get("riskDistribution")).stream().map(Json::map).map(item -> Json.obj("label", item.get("riskLevel"), "value", item.get("count"))).toList(),
        "revenueVsEffort", matrix.stream().map(item -> Json.obj("label", item.get("scenarioName"), "revenueImpact", item.get("revenueImpact"), "implementationEffort", item.get("effortScore"), "risk", item.get("riskScore"))).toList(),
        "latestScenarioPerformance", matrix.stream().skip(Math.max(0, matrix.size() - 6)).map(item -> Json.obj("label", item.get("scenarioName"), "revenueImpact", item.get("revenueImpact"), "risk", item.get("riskScore"), "effort", item.get("effortScore"))).toList());
  }

  private List<Map<String, Object>> latestAnalyses(Map<String, Object> state) {
    List<Map<String, Object>> scenarios = Json.array(state.get("scenarios")).stream().map(Json::map).toList();
    return Json.array(state.get("impacts")).stream().map(Json::map).map(impact -> {
      Map<String, Object> scenario = scenarios.stream().filter(s -> Json.str(s.get("id")).equals(Json.str(impact.get("scenarioId")))).findFirst().orElse(null);
      if (scenario == null) return null;
      Map<String, Object> prediction = Json.array(state.get("predictions")).stream().map(Json::map).filter(p -> Json.str(p.get("scenarioId")).equals(Json.str(impact.get("scenarioId")))).findFirst().orElse(Map.of());
      Map<String, Object> recommendation = Json.array(state.get("recommendations")).stream().map(Json::map).filter(r -> Json.str(r.get("scenarioId")).equals(Json.str(impact.get("scenarioId")))).findFirst().orElse(Map.of());
      return Json.obj("impact", impact, "scenario", scenario, "prediction", prediction, "predictionValues", comparisonService.predictionValues(prediction), "recommendation", recommendation);
    }).filter(java.util.Objects::nonNull).toList();
  }

  private Map<String, Object> matrixRow(Map<String, Object> item) {
    Map<String, Object> scenario = Json.map(item.get("scenario")); Map<String, Object> impact = Json.map(item.get("impact")); Map<String, Object> p = Json.map(item.get("predictionValues"));
    return Json.obj("scenarioId", scenario.get("id"), "scenarioName", scenario.get("name"), "businessModelType", scenario.get("businessModelType"), "riskScore", Math.round(Json.num(p.getOrDefault("implementationRisk", impact.get("complianceRisk")))), "effortScore", Math.round(Json.num(impact.getOrDefault("implementationEffort", p.get("operationalEffort")))), "revenueImpact", Json.num(impact.getOrDefault("revenueImpact", p.get("revenueImpactPct"))), "transactionVolume", scenario.get("transactionVolume"), "integrationCount", scenario.get("integrationCount"));
  }

  private List<Map<String, Object>> effortBreakdown(List<Map<String, Object>> analyses) {
    return List.of("Configuration", "Integration", "Testing", "Compliance", "Data Migration", "Reporting").stream().map(area -> Json.obj("area", area, "averageEffort", Json.average(analyses.stream().map(item -> effortValue(area, Json.map(item.get("impact")))).toList()))).toList();
  }

  private double effortValue(String area, Map<String, Object> impact) {
    return switch (area) {
      case "Configuration" -> Json.num(Json.map(impact.get("processImpactScores")).getOrDefault("quoteToContract", impact.get("implementationEffort")));
      case "Integration" -> Json.num(Json.map(impact.get("integrationImpactScores")).get("dataMappingComplexity"));
      case "Testing" -> Json.num(impact.get("delayProbability"));
      case "Compliance" -> Json.num(impact.get("complianceRisk"));
      case "Data Migration" -> Json.num(Json.map(impact.get("integrationImpactScores")).get("apiChangeRisk"));
      default -> Json.num(Json.map(impact.get("processImpactScores")).get("revenueClose"));
    };
  }

  private Map<String, Object> topRecommended(Map<String, Object> best) {
    Map<String, Object> item = Json.map(best.get("item")); Map<String, Object> scenario = Json.map(item.get("scenario")); Map<String, Object> impact = Json.map(item.get("impact")); Map<String, Object> p = Json.map(item.get("predictionValues")); Map<String, Object> score = Json.map(best.get("score")); Map<String, Object> rec = Json.map(item.get("recommendation"));
    return Json.obj("scenarioId", scenario.get("id"), "scenarioName", scenario.get("name"), "businessModelType", scenario.get("businessModelType"), "recommendationScore", score.get("recommendationScore"), "reasonSummary", Json.map(rec.get("content")).getOrDefault("whyThisModel", rec.getOrDefault("rationale", "Best weighted balance of revenue potential, effort, risk, compliance and downstream complexity.")), "expectedBenefit", Json.num(impact.getOrDefault("revenueImpact", p.get("revenueImpactPct"))) + "% revenue impact with " + Math.round(Json.num(impact.get("implementationEffort"))) + "% implementation effort.");
  }

  private Map<String, Object> attentionRow(Map<String, Object> item) {
    Map<String, Object> scenario = Json.map(item.get("scenario")); Map<String, Object> impact = Json.map(item.get("impact")); Map<String, Object> p = Json.map(item.get("predictionValues"));
    Map<String, Object> impacted = Json.map(impact.get("o2cImpactScores")).entrySet().stream().map(e -> Json.obj("area", e.getKey(), "score", Json.map(e.getValue()).getOrDefault("score", e.getValue()))).max(Comparator.comparing(e -> Json.num(e.get("score")))).orElse(null);
    return Json.obj("scenarioId", scenario.get("id"), "scenarioName", scenario.get("name"), "businessModelType", scenario.get("businessModelType"), "riskScore", Math.round(Json.num(p.getOrDefault("implementationRisk", impact.get("complianceRisk")))), "complianceRisk", Math.round(Json.num(impact.get("complianceRisk"))), "delayProbability", Math.round(Json.num(impact.get("delayProbability"))), "mostImpactedArea", impacted == null ? "Not available" : Json.labelize(Json.str(impacted.get("area"))));
  }

  private Map<String, Object> recentRow(Map<String, Object> item) {
    Map<String, Object> scenario = Json.map(item.get("scenario")); Map<String, Object> impact = Json.map(item.get("impact")); Map<String, Object> p = Json.map(item.get("predictionValues")); Map<String, Object> rec = Json.map(item.get("recommendation"));
    return Json.obj("scenarioId", scenario.get("id"), "scenarioName", scenario.get("name"), "timestamp", impact.get("generatedAt"), "status", riskLevel(Json.num(p.getOrDefault("implementationRisk", impact.get("complianceRisk")))), "recommendationStatus", recommendationStatus(item), "confidenceScore", rec.getOrDefault("confidence", Json.map(item.get("prediction")).getOrDefault("confidence", impact.getOrDefault("confidenceScore", 0))));
  }

  private String recommendationStatus(Map<String, Object> item) {
    Map<String, Object> scenario = Json.map(item.get("scenario")); Map<String, Object> rec = Json.map(item.get("recommendation")); double risk = Json.num(Json.map(item.get("predictionValues")).getOrDefault("implementationRisk", Json.map(item.get("impact")).get("complianceRisk")));
    if (rec.get("recommendedModel") != null && !Json.str(rec.get("recommendedModel")).equals(Json.str(scenario.get("businessModelType")))) return "Opportunity Found";
    if (risk >= 75) return "High Risk"; if (risk >= 55) return "Needs Review"; return "Recommended";
  }

  private String severity(double score) { if (score >= 75) return "Very High"; if (score >= 55) return "High"; if (score >= 35) return "Medium"; return "Low"; }
  private String riskLevel(double score) { if (score >= 75) return "Critical Risk"; if (score >= 55) return "High Risk"; if (score >= 35) return "Medium Risk"; return "Low Risk"; }
}
