package com.bms.service;

import com.bms.util.ApiException;
import com.bms.util.Json;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class RecommendationViewService {
  private final ComparisonService comparisonService;

  public RecommendationViewService(ComparisonService comparisonService) {
    this.comparisonService = comparisonService;
  }

  public Map<String, Object> buildRecommendationView(Map<String, Object> state, String scenarioId) {
    Map<String, Object> scenario = find(state, "scenarios", "id", scenarioId);
    if (scenario == null) throw new ApiException(HttpStatus.NOT_FOUND, "SCENARIO_NOT_FOUND", "Scenario not found.");
    Map<String, Object> impact = find(state, "impacts", "scenarioId", scenarioId);
    Map<String, Object> prediction = find(state, "predictions", "scenarioId", scenarioId);
    Map<String, Object> recommendation = find(state, "recommendations", "scenarioId", scenarioId);
    if (impact == null || prediction == null || recommendation == null) throw new ApiException(HttpStatus.NOT_FOUND, "RECOMMENDATION_NOT_FOUND", "Run impact analysis before viewing the AI recommendation.");
    Map<String, Object> suggestion = Json.array(state.get("suggestions")).stream().map(Json::map).filter(item -> scenarioId.equals(Json.str(item.get("sourceScenarioId"))) && !"discarded".equals(item.get("status"))).findFirst().orElse(null);
    if (suggestion == null) suggestion = Json.array(state.get("suggestions")).stream().map(Json::map).filter(item -> scenarioId.equals(Json.str(item.get("sourceScenarioId")))).findFirst().orElse(null);
    Map<String, Object> originalValues = comparisonService.predictionValues(prediction);
    boolean genAiUnavailable = isGenAiUnavailable(recommendation);
    Map<String, Object> suggestedScenario = suggestion == null ? null : Json.map(suggestion.get("suggestedPayload"));
    Map<String, Object> suggestedPrediction = suggestion == null ? null : Json.map(suggestion.get("suggestedPrediction"));
    Map<String, Object> suggestedImpact = suggestion == null ? null : Json.map(suggestion.get("suggestedImpact"));
    Map<String, Object> originalScore = comparisonService.compareAnalyzedScenarios(List.of(Json.obj("scenario", scenario, "impact", impact, "prediction", originalValues))).get(0);
    Map<String, Object> suggestedScore = suggestedScenario == null || suggestedImpact == null || suggestedPrediction == null ? null : comparisonService.compareAnalyzedScenarios(List.of(Json.obj("scenario", Json.obj("id", "suggestion-preview", "name", suggestedScenario.get("name"), "businessModelType", suggestedScenario.get("businessModelType")), "impact", suggestedImpact, "prediction", comparisonService.predictionValues(suggestedPrediction)))).get(0);
    return Json.obj(
        "success", !genAiUnavailable,
        "status", genAiUnavailable ? "GENAI_UNAVAILABLE" : "READY",
        "message", genAiUnavailable ? "AI recommendation is temporarily unavailable." : null,
        "customerMessage", genAiUnavailable ? "We could not generate a new AI recommendation right now. Predictive impact scores and historical analysis are still available. Please retry after checking the AI service configuration." : null,
        "technicalDetails", genAiUnavailable ? Json.map(recommendation.get("content")).get("technicalDetails") : null,
        "predictiveOnly", genAiUnavailable,
        "recommendationId", recommendation.getOrDefault("id", Json.id()),
        "suggestionId", suggestion == null ? null : suggestion.get("id"),
        "suggestionStatus", suggestion == null ? null : suggestion.get("status"),
        "sourceScenarioId", scenario.get("id"),
        "originalScenario", scenario,
        "suggestedScenario", suggestedScenario,
        "originalPrediction", prediction,
        "suggestedPrediction", suggestedPrediction,
        "executiveSummary", genAiUnavailable ? "" : firstText(suggestion == null ? null : suggestion.get("improvementSummary"), Json.map(recommendation.get("content")).get("executiveSummary"), recommendation.get("rationale")),
        "recommendedModel", genAiUnavailable ? "" : suggestedScenario != null ? suggestedScenario.get("businessModelType") : recommendation.getOrDefault("recommendedModel", scenario.get("businessModelType")),
        "recommendationStatus", genAiUnavailable ? "Predictive Analysis Only" : recommendationStatus(Json.num(originalValues.getOrDefault("implementationRisk", impact.get("complianceRisk"))), suggestion),
        "confidence", recommendation.getOrDefault("confidence", suggestion == null ? prediction.getOrDefault("confidence", impact.get("confidenceScore")) : suggestion.get("confidence")),
        "predictiveAnalysis", buildPredictiveAnalysis(scenario, impact, prediction),
        "improvementSummary", genAiUnavailable ? "" : firstText(suggestion == null ? null : suggestion.get("improvementSummary"), Json.map(recommendation.get("content")).get("businessImpact")),
        "aiRationale", genAiUnavailable ? "" : firstText(suggestion == null ? null : suggestion.get("aiRationale"), recommendation.get("rationale"), Json.map(recommendation.get("content")).get("rationale")),
        "expectedBenefits", suggestion == null ? Json.obj("revenueImprovement", impact.getOrDefault("revenueImpact", originalValues.getOrDefault("revenueImpactPct", 0)), "riskReduction", 0, "effortChange", 0, "delayReduction", 0) : suggestion.get("expectedBenefits"),
        "businessDrivers", List.of(),
        "riskAndBenefitBreakdown", riskBreakdown(impact, prediction, suggestion),
        "o2cImpactChanges", suggestion == null ? Json.map(impact.get("o2cImpactScores")).entrySet().stream().map(e -> Json.obj("area", e.getKey(), "currentImpact", Json.map(e.getValue()).getOrDefault("score", e.getValue()), "severity", Json.map(e.getValue()).get("severity"))).toList() : suggestion.get("o2cImpactChanges"),
        "tradeOffs", genAiUnavailable ? List.of() : suggestion == null ? List.of() : suggestion.getOrDefault("tradeOffs", List.of()),
        "assumptions", genAiUnavailable ? List.of() : suggestion == null ? Json.map(recommendation.get("content")).getOrDefault("assumptions", List.of()) : suggestion.getOrDefault("assumptions", List.of()),
        "customerFriendlyReasoning", List.of(),
        "comparisonRows", comparisonRows(scenario, suggestedScenario, prediction, suggestedPrediction, impact, suggestedImpact),
        "originalScore", originalScore,
        "suggestedScore", suggestedScore,
        "acceptedScenarioId", suggestion == null ? null : suggestion.get("suggestedScenarioId"),
        "audit", Json.obj("generatedAt", recommendation.get("generatedAt"), "model", Json.map(recommendation.get("content")).get("model"), "promptVersion", Json.map(recommendation.get("content")).get("promptVersion")));
  }

  public Map<String, Object> buildPredictiveAnalysis(Map<String, Object> scenario, Map<String, Object> impact, Map<String, Object> prediction) {
    Map<String, Object> values = comparisonService.predictionValues(prediction);
    return Json.obj("modelVersion", prediction.getOrDefault("modelVersion", "local-predictive-model"), "confidence", prediction.getOrDefault("confidence", impact.getOrDefault("confidenceScore", 0)), "historicalPatternSummary", "The model uses the locally trained synthetic historical commercial-model dataset. For " + scenario.get("businessModelType") + ", historical patterns point to the scenario complexity, integration scope and commercial model inputs as the main drivers.", "riskDrivers", List.of(), "topContributingFactors", prediction.getOrDefault("topContributingFactors", List.of()), "predictedOutputs", values);
  }

  private Map<String, Object> find(Map<String, Object> state, String collection, String field, String value) {
    return Json.array(state.get(collection)).stream().map(Json::map).filter(item -> value.equals(Json.str(item.get(field)))).findFirst().orElse(null);
  }

  private boolean isGenAiUnavailable(Map<String, Object> recommendation) {
    Map<String, Object> content = Json.map(recommendation.get("content"));
    return Boolean.TRUE.equals(content.get("predictiveOnly")) || "GENAI_UNAVAILABLE".equals(content.get("status")) || "unavailable".equals(content.get("source")) || "fallback".equals(content.get("source"));
  }

  private String firstText(Object... values) {
    for (Object value : values) if (value != null && !Json.str(value).isBlank()) return Json.str(value);
    return "";
  }

  private String recommendationStatus(double risk, Map<String, Object> suggestion) {
    if (suggestion != null && "accepted".equals(suggestion.get("status"))) return "Accepted";
    if (suggestion != null && "discarded".equals(suggestion.get("status"))) return "Discarded";
    if (suggestion != null && suggestion.get("id") != null) return "Better Alternative Found";
    if (risk >= 75) return "High Risk"; if (risk >= 55) return "Needs Review"; return "Recommended";
  }

  private List<Map<String, Object>> riskBreakdown(Map<String, Object> impact, Map<String, Object> prediction, Map<String, Object> suggestion) {
    Map<String, Object> values = comparisonService.predictionValues(prediction);
    if (suggestion == null) return List.of(Json.obj("label", "Implementation Risk", "value", values.getOrDefault("implementationRisk", impact.getOrDefault("complianceRisk", 0)), "unit", "%", "source", "Predictive AI"), Json.obj("label", "Revenue Impact", "value", impact.getOrDefault("revenueImpact", values.getOrDefault("revenueImpactPct", 0)), "unit", "%", "source", "Predictive AI / impact engine"), Json.obj("label", "Implementation Effort", "value", impact.getOrDefault("implementationEffort", values.getOrDefault("operationalEffort", 0)), "unit", "%", "source", "Impact engine"), Json.obj("label", "Delay Probability", "value", impact.getOrDefault("delayProbability", values.getOrDefault("delayProbability", 0)), "unit", "%", "source", "Predictive AI / impact engine"), Json.obj("label", "Compliance Risk", "value", impact.getOrDefault("complianceRisk", values.getOrDefault("complianceRisk", 0)), "unit", "%", "source", "Impact engine"), Json.obj("label", "Confidence", "value", Math.round(Json.num(prediction.getOrDefault("confidence", impact.getOrDefault("confidenceScore", 0))) * 100), "unit", "%", "source", "Predictive AI"));
    return List.of(Json.obj("label", "Risk Reduction", "value", suggestion.getOrDefault("riskReduction", 0), "unit", "%", "source", "Suggested model comparison"), Json.obj("label", "Revenue Improvement", "value", suggestion.getOrDefault("revenueImprovement", 0), "unit", "%", "source", "Predictive AI / impact engine"), Json.obj("label", "Effort Change", "value", suggestion.getOrDefault("effortChange", 0), "unit", "%", "source", "Suggested model comparison"), Json.obj("label", "Delay Reduction", "value", Json.map(suggestion.get("expectedBenefits")).getOrDefault("delayReduction", 0), "unit", "%", "source", "Suggested model comparison"), Json.obj("label", "O2C Impact Areas", "value", Json.map(impact.get("o2cImpactScores")).size(), "unit", "areas", "source", "Impact engine"), Json.obj("label", "Confidence", "value", Math.round(Json.num(suggestion.getOrDefault("confidence", prediction.getOrDefault("confidence", impact.get("confidenceScore")))) * 100), "unit", "%", "source", "Predictive AI / GenAI"));
  }

  private List<Map<String, Object>> comparisonRows(Map<String, Object> original, Map<String, Object> suggested, Map<String, Object> op, Map<String, Object> sp, Map<String, Object> oi, Map<String, Object> si) {
    if (suggested == null) return List.of();
    return List.of("Business Model Type", "Pricing Type", "Billing Frequency", "Funding Model", "Contract Term", "Transaction Volume", "Expected Revenue", "Integration Count", "Process Complexity").stream()
        .map(name -> Json.obj("name", name, "original", field(original, name), "suggested", field(suggested, name), "changeText", "", "changeState", "None")).toList();
  }

  private Object field(Map<String, Object> scenario, String name) {
    return scenario.get(switch (name) {
      case "Business Model Type" -> "businessModelType"; case "Pricing Type" -> "pricingType"; case "Billing Frequency" -> "billingFrequency"; case "Funding Model" -> "fundingModel"; case "Contract Term" -> "contractTerm"; case "Transaction Volume" -> "transactionVolume"; case "Expected Revenue" -> "expectedRevenue"; case "Integration Count" -> "integrationCount"; default -> "processComplexity";
    });
  }
}
