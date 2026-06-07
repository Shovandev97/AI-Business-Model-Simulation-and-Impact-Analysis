package com.bms.service;

import com.bms.util.ApiException;
import com.bms.util.Json;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class SuggestionService {
  private final GenAiService genAiService;
  private final ScenarioValidator validator;
  private final MlClient mlClient;
  private final ImpactService impactService;
  private final ImpactDetailsService detailsService;
  private final ComparisonService comparisonService;

  public SuggestionService(GenAiService genAiService, ScenarioValidator validator, MlClient mlClient, ImpactService impactService, ImpactDetailsService detailsService, ComparisonService comparisonService) {
    this.genAiService = genAiService;
    this.validator = validator;
    this.mlClient = mlClient;
    this.impactService = impactService;
    this.detailsService = detailsService;
    this.comparisonService = comparisonService;
  }

  public Map<String, Object> buildSuggestion(Map<String, Object> state, Map<String, Object> scenario, List<Object> comparisonContext) {
    Map<String, Object> originalPrediction = latestFor(state, "predictions", Json.str(scenario.get("id")));
    Map<String, Object> originalImpact = latestFor(state, "impacts", Json.str(scenario.get("id")));
    if (originalPrediction == null || originalImpact == null) throw new ApiException(HttpStatus.BAD_REQUEST, "REQUEST_ERROR", "Run impact analysis before requesting a better model suggestion.");
    Map<String, Object> impactDetails = detailsService.buildImpactDetails(scenario, originalImpact, originalPrediction);
    Map<String, Object> aiSuggestion;
    try {
      aiSuggestion = genAiService.generateBetterModelSuggestion(Json.obj("scenario", scenario, "impact", originalImpact, "prediction", originalPrediction, "impactDetails", impactDetails, "comparisonContext", comparisonContext == null ? List.of() : comparisonContext));
    } catch (ApiException error) {
      if (!"INVALID_AI_RESPONSE".equals(error.getErrorCode())) throw error;
      aiSuggestion = buildPredictiveFallbackSuggestion(scenario, originalImpact, originalPrediction, error);
    }
    if (Boolean.TRUE.equals(aiSuggestion.get("noBetterModelFound"))) {
      return Json.obj("suggestion", null, "response", Json.obj("success", true, "noBetterModelFound", true, "message", aiSuggestion.get("message"), "aiRationale", aiSuggestion.get("aiRationale"), "confidence", aiSuggestion.getOrDefault("confidence", 0), "originalScenario", scenario, "originalPrediction", originalPrediction, "originalImpact", originalImpact, "source", aiSuggestion.get("source"), "promptVersion", aiSuggestion.get("promptVersion"), "generatedAt", aiSuggestion.get("generatedAt")));
    }
    Map<String, Object> normalized = normalizeSuggestedScenario(scenario, Json.map(aiSuggestion.get("suggestedScenario")));
    Map<String, Object> preview = new LinkedHashMap<>(normalized);
    preview.put("id", "suggestion-preview");
    Map<String, Object> suggestedPrediction = Json.map(aiSuggestion.get("suggestedPrediction")).isEmpty() ? mlClient.predictScenario(preview) : Json.map(aiSuggestion.get("suggestedPrediction"));
    Map<String, Object> suggestedImpact = Json.map(aiSuggestion.get("suggestedImpact")).isEmpty() ? impactService.analyzeImpact(preview, comparisonService.predictionValues(suggestedPrediction)) : Json.map(aiSuggestion.get("suggestedImpact"));
    Map<String, Object> originalScore = comparisonService.compareAnalyzedScenarios(List.of(Json.obj("scenario", scenario, "impact", originalImpact, "prediction", comparisonService.predictionValues(originalPrediction)))).get(0);
    Map<String, Object> suggestedScore = comparisonService.compareAnalyzedScenarios(List.of(Json.obj("scenario", preview, "impact", suggestedImpact, "prediction", comparisonService.predictionValues(suggestedPrediction)))).get(0);
    String now = Instant.now().toString();
    Map<String, Object> benefits = calculatedBenefits(originalImpact, originalPrediction, suggestedImpact, suggestedPrediction, originalScore, suggestedScore);
    String summary = dynamicSummary(scenario, normalized, benefits, originalScore, suggestedScore, aiSuggestion.get("improvementSummary"));
    String rationale = dynamicRationale(scenario, normalized, originalPrediction, suggestedPrediction, benefits, aiSuggestion.get("aiRationale"));
    List<Object> impactChanges = dynamicImpactChanges(originalImpact, suggestedImpact, originalPrediction, suggestedPrediction, aiSuggestion.get("o2cImpactChanges"));
    Map<String, Object> suggestion = Json.obj("id", Json.id(), "sourceScenarioId", scenario.get("id"), "suggestedScenarioId", null, "suggestedPayload", normalized, "originalPrediction", originalPrediction, "suggestedPrediction", suggestedPrediction, "originalImpact", originalImpact, "suggestedImpact", suggestedImpact, "aiRationale", rationale, "improvementSummary", summary, "assumptions", aiSuggestion.getOrDefault("assumptions", List.of()), "confidence", confidence(aiSuggestion, suggestedPrediction, originalImpact), "expectedBenefits", benefits, "riskReduction", benefits.getOrDefault("riskReduction", 0), "revenueImprovement", benefits.getOrDefault("revenueImprovement", 0), "effortChange", benefits.getOrDefault("effortChange", 0), "o2cImpactChanges", impactChanges, "tradeOffs", aiSuggestion.getOrDefault("tradeOffs", List.of()), "originalScore", originalScore, "suggestedScore", suggestedScore, "status", "suggested", "source", aiSuggestion.get("source"), "promptVersion", aiSuggestion.get("promptVersion"), "createdAt", now, "updatedAt", now);
    Map<String, Object> response = new LinkedHashMap<>(Json.obj("success", true, "originalScenario", scenario, "suggestedScenario", normalized, "originalPrediction", originalPrediction, "suggestedPrediction", suggestedPrediction, "originalImpact", originalImpact, "suggestedImpact", suggestedImpact, "improvementSummary", suggestion.get("improvementSummary"), "aiRationale", suggestion.get("aiRationale"), "assumptions", suggestion.get("assumptions"), "confidence", suggestion.get("confidence"), "riskReduction", suggestion.get("riskReduction"), "revenueImprovement", suggestion.get("revenueImprovement"), "effortChange", suggestion.get("effortChange"), "o2cImpactChanges", suggestion.get("o2cImpactChanges"), "tradeOffs", suggestion.get("tradeOffs"), "originalScore", originalScore, "suggestedScore", suggestedScore, "suggestionId", suggestion.get("id")));
    return Json.obj("suggestion", suggestion, "response", response);
  }

  private Map<String, Object> buildPredictiveFallbackSuggestion(Map<String, Object> scenario, Map<String, Object> originalImpact, Map<String, Object> originalPrediction, ApiException aiError) {
    Map<String, Object> values = comparisonService.predictionValues(originalPrediction);
    double riskPressure = Math.max(
        Math.max(Json.num(values.get("implementationRisk")), Json.num(values.get("billingComplexity"))),
        Math.max(Json.num(values.get("operationalEffort")), Json.num(originalImpact.get("implementationEffort"))));
    boolean highBilling = Json.num(values.get("billingComplexity")) >= 65;
    boolean highIntegration = Json.num(values.get("downstreamIntegrationImpact")) >= 65 || Json.num(scenario.get("integrationCount")) >= 8;
    String currentModel = Json.str(scenario.get("businessModelType")).toLowerCase();
    String suggestedModel = currentModel.contains("subscription") ? "consumption-based" : "subscription";
    double integrationFactor = riskPressure >= 75 ? 0.62 : riskPressure >= 55 ? 0.75 : 0.88;
    int complexityReduction = riskPressure >= 75 ? 3 : riskPressure >= 55 ? 2 : 1;

    Map<String, Object> suggestedScenario = Json.obj(
        "name", scenario.get("name") + " - Predictive Alternative",
        "businessModelType", suggestedModel,
        "pricingType", highBilling ? "tiered" : "usage",
        "billingFrequency", highBilling ? "monthly" : "usage-event",
        "contractTerm", scenario.get("contractTerm"),
        "fundingModel", Json.str(scenario.get("fundingModel")).isBlank() ? "opex" : scenario.get("fundingModel"),
        "bundleType", highIntegration ? "software-service" : scenario.get("bundleType"),
        "transactionVolume", scenario.get("transactionVolume"),
        "expectedRevenue", Math.max(1000, Math.round(Json.num(scenario.get("expectedRevenue")) * 1.04)),
        "complianceRegions", scenario.get("complianceRegions"),
        "integrationCount", Math.max(0, Math.min(100, (int) Math.round(Json.num(scenario.get("integrationCount")) * integrationFactor))),
        "processComplexity", Math.max(1, Math.min(10, Json.integer(scenario.get("processComplexity")) - complexityReduction)));

    return Json.obj(
        "success", true,
        "source", "predictive-fallback",
        "promptVersion", "business-model-suggestion-v1",
        "model", "local-predictive-fallback",
        "suggestedScenario", suggestedScenario,
        "improvementSummary", "",
        "aiRationale", "",
        "expectedBenefits", Json.obj(),
        "o2cImpactChanges", List.of(
            Json.obj("area", "Integrations", "change", "Integration count is reduced to lower downstream dependency and testing risk."),
            Json.obj("area", "Process Complexity", "change", "Process complexity is reduced to simplify O2C implementation and support effort."),
            Json.obj("area", "Billing", "change", "Billing and pricing choices are adjusted based on predicted billing pressure.")),
        "tradeOffs", List.of(
            "Commercial governance should review the revised pricing and billing model.",
            "Implementation teams should validate the reduced integration assumptions before rollout."),
        "assumptions", List.of(
            "Customer segment, region and compliance scope remain unchanged.",
            "The local predictive model is used for directional planning and should be validated before final approval.",
            "GenAI parsing failed with " + aiError.getErrorCode() + ", so this recommendation is predictive rather than narrative AI output."),
        "confidence", Math.min(0.82, Math.max(0.58, Json.num(originalPrediction.getOrDefault("confidence", originalImpact.getOrDefault("confidenceScore", 0.65))))),
        "generatedAt", Instant.now().toString());
  }

  private Map<String, Object> calculatedBenefits(Map<String, Object> originalImpact, Map<String, Object> originalPrediction, Map<String, Object> suggestedImpact, Map<String, Object> suggestedPrediction, Map<String, Object> originalScore, Map<String, Object> suggestedScore) {
    Map<String, Object> originalValues = comparisonService.predictionValues(originalPrediction);
    Map<String, Object> suggestedValues = comparisonService.predictionValues(suggestedPrediction);
    double riskReduction = Json.round2(Json.num(originalScore.get("risk")) - Json.num(suggestedScore.get("risk")));
    double revenueImprovement = Json.round2(Json.num(suggestedImpact.getOrDefault("revenueImpact", suggestedValues.get("revenueImpactPct"))) - Json.num(originalImpact.getOrDefault("revenueImpact", originalValues.get("revenueImpactPct"))));
    double effortChange = Json.round2(Json.num(suggestedImpact.get("implementationEffort")) - Json.num(originalImpact.get("implementationEffort")));
    double delayReduction = Json.round2(Json.num(originalImpact.getOrDefault("delayProbability", originalValues.get("delayProbability"))) - Json.num(suggestedImpact.getOrDefault("delayProbability", suggestedValues.get("delayProbability"))));
    double scoreImprovement = Json.round2(Json.num(suggestedScore.get("recommendationScore")) - Json.num(originalScore.get("recommendationScore")));
    return Json.obj("revenueImprovement", revenueImprovement, "riskReduction", riskReduction, "effortChange", effortChange, "delayReduction", delayReduction, "scoreImprovement", scoreImprovement);
  }

  private String dynamicSummary(Map<String, Object> original, Map<String, Object> suggested, Map<String, Object> benefits, Map<String, Object> originalScore, Map<String, Object> suggestedScore, Object aiSummary) {
    String modelChange = Json.str(original.get("businessModelType")).equalsIgnoreCase(Json.str(suggested.get("businessModelType")))
        ? "keeps the " + Json.str(suggested.get("businessModelType")) + " model"
        : "moves from " + Json.str(original.get("businessModelType")) + " to " + Json.str(suggested.get("businessModelType"));
    String integrationText = deltaText(Json.num(original.get("integrationCount")), Json.num(suggested.get("integrationCount")), "integration");
    String complexityText = deltaText(Json.num(original.get("processComplexity")), Json.num(suggested.get("processComplexity")), "process complexity point");
    return "The suggested scenario " + modelChange + " with " + integrationText + " and " + complexityText + ". The current scoring engine projects "
        + signed(Json.num(benefits.get("riskReduction"))) + " risk reduction, " + signed(Json.num(benefits.get("revenueImprovement"))) + " revenue impact movement, and a "
        + signed(Json.num(benefits.get("scoreImprovement"))) + " recommendation-score change versus the current model."
        + (Json.str(aiSummary).isBlank() ? "" : " GenAI context: " + Json.str(aiSummary));
  }

  private String dynamicRationale(Map<String, Object> original, Map<String, Object> suggested, Map<String, Object> originalPrediction, Map<String, Object> suggestedPrediction, Map<String, Object> benefits, Object aiRationale) {
    Map<String, Object> originalValues = comparisonService.predictionValues(originalPrediction);
    Map<String, Object> suggestedValues = comparisonService.predictionValues(suggestedPrediction);
    String driver = biggestImprovement(originalValues, suggestedValues);
    String rationale = "This recommendation is based on live prediction deltas for " + original.get("name") + ". The strongest modeled movement is " + driver
        + ", while billing changes from " + original.get("billingFrequency") + " to " + suggested.get("billingFrequency") + " and pricing uses " + suggested.get("pricingType") + ".";
    return Json.str(aiRationale).isBlank() ? rationale : rationale + " GenAI rationale: " + Json.str(aiRationale);
  }

  private List<Object> dynamicImpactChanges(Map<String, Object> originalImpact, Map<String, Object> suggestedImpact, Map<String, Object> originalPrediction, Map<String, Object> suggestedPrediction, Object aiChanges) {
    Map<String, Object> originalValues = comparisonService.predictionValues(originalPrediction);
    Map<String, Object> suggestedValues = comparisonService.predictionValues(suggestedPrediction);
    List<Object> rows = new java.util.ArrayList<>();
    rows.add(Json.obj("area", "Implementation Risk", "change", signed(Json.num(originalValues.get("implementationRisk")) - Json.num(suggestedValues.get("implementationRisk"))) + " modeled risk reduction"));
    rows.add(Json.obj("area", "Billing Complexity", "change", signed(Json.num(originalValues.get("billingComplexity")) - Json.num(suggestedValues.get("billingComplexity"))) + " billing complexity reduction"));
    rows.add(Json.obj("area", "Operational Effort", "change", signed(Json.num(originalImpact.get("implementationEffort")) - Json.num(suggestedImpact.get("implementationEffort"))) + " implementation effort reduction"));
    rows.add(Json.obj("area", "Revenue Impact", "change", signed(Json.num(suggestedImpact.get("revenueImpact")) - Json.num(originalImpact.get("revenueImpact"))) + " revenue impact movement"));
    if (!Json.array(aiChanges).isEmpty()) rows.addAll(Json.array(aiChanges));
    return rows;
  }

  private double confidence(Map<String, Object> aiSuggestion, Map<String, Object> suggestedPrediction, Map<String, Object> originalImpact) {
    double aiConfidence = Json.num(aiSuggestion.get("confidence"));
    if (aiConfidence > 0) return Math.min(1, aiConfidence);
    return Math.min(0.92, Math.max(0.45, Json.num(suggestedPrediction.getOrDefault("confidence", originalImpact.getOrDefault("confidenceScore", 0.65)))));
  }

  private String biggestImprovement(Map<String, Object> originalValues, Map<String, Object> suggestedValues) {
    String best = "implementation risk";
    double delta = Json.num(originalValues.get("implementationRisk")) - Json.num(suggestedValues.get("implementationRisk"));
    for (String key : List.of("billingComplexity", "complianceRisk", "delayProbability", "operationalEffort", "downstreamIntegrationImpact")) {
      double candidate = Json.num(originalValues.get(key)) - Json.num(suggestedValues.get(key));
      if (candidate > delta) { delta = candidate; best = Json.labelize(key); }
    }
    return Json.labelize(best) + " at " + signed(Json.round2(delta));
  }

  private String deltaText(double original, double suggested, String unit) {
    double change = Json.round2(original - suggested);
    if (change > 0) return signed(change) + " fewer " + plural(unit, change);
    if (change < 0) return signed(Math.abs(change)) + " additional " + plural(unit, change);
    return "no change in " + plural(unit, 2);
  }

  private String plural(String unit, double value) {
    return Math.abs(value) == 1 ? unit : unit + "s";
  }

  private String signed(double value) {
    double rounded = Json.round2(value);
    return (rounded > 0 ? "+" : "") + (rounded == Math.rint(rounded) ? String.valueOf((int) rounded) : String.valueOf(rounded));
  }

  public Map<String, Object> acceptSuggestionRecord(Map<String, Object> state, String sourceScenarioId, String suggestionId) {
    Map<String, Object> suggestion = Json.array(state.get("suggestions")).stream().map(Json::map).filter(item -> suggestionId.equals(item.get("id")) && sourceScenarioId.equals(item.get("sourceScenarioId"))).findFirst().orElse(null);
    if (suggestion == null) throw new ApiException(HttpStatus.NOT_FOUND, "REQUEST_ERROR", "Suggestion not found.");
    if ("discarded".equals(suggestion.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "SUGGESTION_DISCARDED", "This AI suggestion has been discarded and cannot be used.");
    if ("accepted".equals(suggestion.get("status")) && suggestion.get("suggestedScenarioId") != null) {
      String acceptedId = Json.str(suggestion.get("suggestedScenarioId"));
      return Json.obj("scenario", latestFor(state, "scenarios", acceptedId, "id"), "impact", latestFor(state, "impacts", acceptedId), "prediction", latestFor(state, "predictions", acceptedId), "suggestion", suggestion, "alreadyAccepted", true);
    }
    String now = Instant.now().toString();
    Map<String, Object> scenario = new LinkedHashMap<>(Json.map(suggestion.get("suggestedPayload")));
    scenario.put("id", Json.id());
    scenario.put("description", (Json.str(scenario.get("description")) + " Linked to source scenario " + sourceScenarioId + ".").trim());
    scenario.put("createdAt", now); scenario.put("updatedAt", now);
    Map<String, Object> impact = new LinkedHashMap<>(Json.map(suggestion.get("suggestedImpact"))); impact.put("scenarioId", scenario.get("id")); impact.put("generatedAt", now);
    Map<String, Object> prediction = new LinkedHashMap<>(Json.map(suggestion.get("suggestedPrediction"))); prediction.put("scenarioId", scenario.get("id"));
    suggestion.put("status", "accepted"); suggestion.put("suggestedScenarioId", scenario.get("id")); suggestion.put("updatedAt", now);
    JsonStore(state, "scenarios").add(0, scenario); JsonStore(state, "impacts").add(0, impact); JsonStore(state, "predictions").add(0, prediction);
    JsonStore(state, "scenarioLinks").add(0, Json.obj("originalScenarioId", sourceScenarioId, "newScenarioId", scenario.get("id"), "relationshipType", "AI_SUGGESTED_MODEL", "createdAt", now));
    return Json.obj("scenario", scenario, "impact", impact, "prediction", prediction, "suggestion", suggestion);
  }

  public Map<String, Object> discardSuggestionRecord(Map<String, Object> state, String sourceScenarioId, String suggestionId) {
    Map<String, Object> suggestion = Json.array(state.get("suggestions")).stream().map(Json::map).filter(item -> suggestionId.equals(item.get("id")) && sourceScenarioId.equals(item.get("sourceScenarioId"))).findFirst().orElse(null);
    if (suggestion == null) throw new ApiException(HttpStatus.NOT_FOUND, "REQUEST_ERROR", "Suggestion not found.");
    if ("accepted".equals(suggestion.get("status"))) throw new ApiException(HttpStatus.CONFLICT, "SUGGESTION_ACCEPTED", "This AI suggestion has already been accepted.");
    suggestion.put("status", "discarded"); suggestion.put("updatedAt", Instant.now().toString());
    return suggestion;
  }

  private Map<String, Object> normalizeSuggestedScenario(Map<String, Object> original, Map<String, Object> suggested) {
    Map<String, Object> merged = new LinkedHashMap<>(original);
    merged.remove("id"); merged.remove("createdAt"); merged.remove("updatedAt");
    merged.put("name", first(suggested.get("name"), original.get("name") + " - AI Suggested"));
    merged.put("description", "AI-suggested model based on " + original.get("name"));
    for (String key : List.of("businessModelType", "pricingType", "billingFrequency", "fundingModel", "bundleType")) merged.put(key, first(suggested.get(key), original.get(key)));
    for (String key : List.of("contractTerm", "transactionVolume", "expectedRevenue", "integrationCount", "processComplexity")) merged.put(key, suggested.get(key) == null ? original.get(key) : Json.num(suggested.get(key)));
    merged.put("industry", original.get("industry")); merged.put("customerSegment", original.get("customerSegment")); merged.put("region", original.get("region"));
    merged.put("complianceRegions", Json.array(suggested.get("complianceRegions")).isEmpty() ? original.get("complianceRegions") : suggested.get("complianceRegions"));
    return validator.validate(merged);
  }

  private Object first(Object value, Object fallback) { return value == null || Json.str(value).isBlank() ? fallback : value; }
  private Map<String, Object> latestFor(Map<String, Object> state, String collection, String scenarioId) { return latestFor(state, collection, scenarioId, "scenarioId"); }
  private Map<String, Object> latestFor(Map<String, Object> state, String collection, String id, String field) { return Json.array(state.get(collection)).stream().map(Json::map).filter(item -> id.equals(Json.str(item.get(field)))).findFirst().orElse(null); }
  @SuppressWarnings("unchecked")
  private List<Map<String, Object>> JsonStore(Map<String, Object> state, String key) { return (List<Map<String, Object>>) state.computeIfAbsent(key, ignored -> new java.util.ArrayList<>()); }
}
