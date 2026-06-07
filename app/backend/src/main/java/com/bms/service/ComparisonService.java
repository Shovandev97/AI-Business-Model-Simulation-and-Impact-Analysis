package com.bms.service;

import com.bms.util.Json;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.IntStream;

@Service
public class ComparisonService {
  public Map<String, Object> scoreScenario(Map<String, Object> scenario, Map<String, Object> impact, Map<String, Object> prediction) {
    double revenueScore = Math.max(0, Math.min(100, 50 + Json.num(impact.get("revenueImpact")) * 2));
    double effortPenalty = Json.num(impact.getOrDefault("implementationEffort", prediction.getOrDefault("operationalEffort", 50)));
    double riskPenalty = Json.num(prediction.getOrDefault("implementationRisk", impact.getOrDefault("complianceRisk", 50)));
    double compliancePenalty = Json.num(impact.getOrDefault("complianceRisk", 50));
    double complexityPenalty = Json.num(prediction.getOrDefault("downstreamIntegrationImpact", 50));
    int recommendationScore = (int) Math.round(revenueScore * 0.34 + (100 - effortPenalty) * 0.2 + (100 - riskPenalty) * 0.22 + (100 - compliancePenalty) * 0.12 + (100 - complexityPenalty) * 0.12);
    return Json.obj(
        "scenarioId", scenario.get("id"), "name", scenario.get("name"), "businessModelType", scenario.get("businessModelType"),
        "revenuePotential", Math.round(revenueScore), "implementationEffort", Math.round(effortPenalty), "risk", Math.round(riskPenalty),
        "compliance", Math.round(compliancePenalty), "downstreamComplexity", Math.round(complexityPenalty), "recommendationScore", recommendationScore);
  }

  public List<Map<String, Object>> compareAnalyzedScenarios(List<Map<String, Object>> items) {
    List<Map<String, Object>> sorted = items.stream()
        .map(item -> scoreScenario(Json.map(item.get("scenario")), Json.map(item.get("impact")), predictionValues(Json.map(item.get("prediction")))))
        .sorted(Comparator.comparing(row -> -Json.num(row.get("recommendationScore"))))
        .map(row -> {
          Map<String, Object> copy = new LinkedHashMap<>(row);
          return copy;
        }).toList();
    return IntStream.range(0, sorted.size()).mapToObj(i -> {
      sorted.get(i).put("rank", i + 1);
      return sorted.get(i);
    }).toList();
  }

  public Map<String, Object> buildComparisonDetails(List<Map<String, Object>> items) {
    List<Map<String, Object>> ranking = compareAnalyzedScenarios(items);
    List<Map<String, Object>> rows = ranking.stream().map(ranked -> {
      Map<String, Object> source = items.stream().filter(item -> Json.str(Json.map(item.get("scenario")).get("id")).equals(Json.str(ranked.get("scenarioId")))).findFirst().orElse(Map.of());
      Map<String, Object> impact = Json.map(source.get("impact"));
      Map<String, Object> prediction = predictionValues(Json.map(source.get("prediction")));
      Map<String, Object> row = new LinkedHashMap<>(ranked);
      row.put("revenueImpact", Json.num(impact.getOrDefault("revenueImpact", prediction.getOrDefault("revenueImpactPct", 0))));
      row.put("delayProbability", Math.round(Json.num(impact.getOrDefault("delayProbability", prediction.getOrDefault("delayProbability", 0)))));
      row.put("dependencyCount", Json.num(prediction.getOrDefault("dependencyCount", Json.map(impact.get("integrationImpactScores")).getOrDefault("impactedInterfaces", 0))));
      row.put("o2cAverageImpact", avgO2C(impact));
      row.put("impactedInterfaces", Json.map(impact.get("integrationImpactScores")).getOrDefault("impactedInterfaces", 0));
      return row;
    }).toList();
    Map<String, Object> charts = Json.obj(
        "revenueImpactComparison", rows.stream().map(row -> Json.obj("label", row.get("name"), "value", row.get("revenueImpact"))).toList(),
        "riskComparison", rows.stream().map(row -> Json.obj("label", row.get("name"), "value", row.get("risk"))).toList(),
        "effortRevenue", rows.stream().map(row -> Json.obj("label", row.get("name"), "effort", row.get("implementationEffort"), "revenueImpact", row.get("revenueImpact"), "score", row.get("recommendationScore"))).toList(),
        "complianceExposure", rows.stream().map(row -> Json.obj("label", row.get("name"), "value", row.get("compliance"))).toList(),
        "dependencyCountComparison", rows.stream().map(row -> Json.obj("label", row.get("name"), "value", row.get("dependencyCount"))).toList(),
        "o2cImpactComparison", items.stream().flatMap(item -> Json.map(Json.map(item.get("impact")).get("o2cImpactScores")).entrySet().stream().map(entry -> Json.obj("scenario", Json.map(item.get("scenario")).get("name"), "label", Json.labelize(entry.getKey()), "value", Json.map(entry.getValue()).getOrDefault("score", entry.getValue())))).toList());
    Map<String, Object> best = rows.isEmpty() ? null : rows.get(0);
    return Json.obj(
        "ranking", rows,
        "bestFitRecommendation", best == null ? "" : best.get("name") + " ranks highest for weighted revenue, risk, effort, compliance and downstream complexity.",
        "tradeOffExplanation", rows.size() > 1 ? "Use the ranking with risk, effort, delay, compliance and dependency views to choose the model that best matches implementation capacity and revenue appetite." : "Add at least two scenarios to evaluate trade-offs.",
        "charts", charts,
        "generatedAt", Instant.now().toString());
  }

  public Map<String, Object> predictionValues(Map<String, Object> prediction) {
    return prediction.containsKey("predictions") ? Json.map(prediction.get("predictions")) : prediction;
  }

  private int avgO2C(Map<String, Object> impact) {
    List<Double> values = Json.map(impact.get("o2cImpactScores")).values().stream().map(value -> Json.num(Json.map(value).getOrDefault("score", value))).toList();
    return Json.average(values);
  }
}
