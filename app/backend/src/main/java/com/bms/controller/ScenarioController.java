package com.bms.controller;

import com.bms.config.BmsProperties;
import com.bms.repository.JsonStoreRepository;
import com.bms.service.*;
import com.bms.util.ApiException;
import com.bms.util.Json;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.*;

@RestController
public class ScenarioController {
  private final JsonStoreRepository repository;
  private final ScenarioValidator validator;
  private final AuditService auditService;
  private final MlClient mlClient;
  private final ImpactService impactService;
  private final ComparisonService comparisonService;
  private final GenAiService genAiService;
  private final ImpactDetailsService impactDetailsService;
  private final DashboardService dashboardService;
  private final ReferenceDataService referenceDataService;
  private final RecommendationViewService recommendationViewService;
  private final SuggestionService suggestionService;
  private final BmsProperties properties;

  public ScenarioController(JsonStoreRepository repository, ScenarioValidator validator, AuditService auditService, MlClient mlClient,
      ImpactService impactService, ComparisonService comparisonService, GenAiService genAiService, ImpactDetailsService impactDetailsService,
      DashboardService dashboardService, ReferenceDataService referenceDataService, RecommendationViewService recommendationViewService,
      SuggestionService suggestionService, BmsProperties properties) {
    this.repository = repository; this.validator = validator; this.auditService = auditService; this.mlClient = mlClient;
    this.impactService = impactService; this.comparisonService = comparisonService; this.genAiService = genAiService;
    this.impactDetailsService = impactDetailsService; this.dashboardService = dashboardService; this.referenceDataService = referenceDataService;
    this.recommendationViewService = recommendationViewService; this.suggestionService = suggestionService; this.properties = properties;
  }

  @GetMapping("/api/health")
  public Map<String, Object> health() {
    Object ml;
    try { ml = mlClient.getModelInfo(); } catch (Exception error) { ml = Json.obj("status", "unavailable", "message", error.getMessage()); }
    return Json.obj("status", "ok", "service", "business-model-simulation-api", "ml", ml, "aiProvider", properties.getAi().getProvider(), "aiModel", properties.getAi().getModel(), "aiConfigured", properties.getAi().getBaseUrl() != null && !properties.getAi().getBaseUrl().isBlank() && properties.getAi().getModel() != null && !properties.getAi().getModel().isBlank());
  }

  @GetMapping("/api/dashboard/summary")
  public Map<String, Object> dashboardSummary() { return dashboardService.buildDashboardSummary(repository.read()); }

  @GetMapping("/api/dashboard/charts")
  public Map<String, Object> dashboardCharts() { return dashboardService.buildDashboardCharts(repository.read()); }

  @GetMapping("/api/reference-data/scenario-fields")
  public Map<String, Object> referenceData() { return Json.obj("success", true, "fields", referenceDataService.scenarioFields()); }

  @PostMapping("/api/scenarios")
  public ResponseEntity<Object> createScenario(@RequestBody Map<String, Object> body) {
    Map<String, Object> payload = validator.validate(body == null ? Map.of() : body);
    String now = Instant.now().toString();
    Map<String, Object> scenario = new LinkedHashMap<>(); scenario.put("id", Json.id()); scenario.putAll(payload); scenario.put("createdAt", now); scenario.put("updatedAt", now);
    repository.mutate(state -> { JsonStoreRepository.collection(state, "scenarios").add(0, scenario); return scenario; });
    auditService.audit("SCENARIO_CREATED", Json.obj("request", payload, "response", Json.obj("scenarioId", scenario.get("id"))));
    return ResponseEntity.status(201).body(scenario);
  }

  @GetMapping("/api/scenarios")
  public Object listScenarios() { return repository.read().get("scenarios"); }

  @GetMapping("/api/scenarios/{id}")
  public Map<String, Object> getScenario(@PathVariable String id) {
    return require(repository.read(), "scenarios", "id", id, "Scenario not found.");
  }

  @DeleteMapping("/api/scenarios/{id}")
  public Map<String, Object> deleteScenario(@PathVariable String id) {
    @SuppressWarnings("unchecked")
    Map<String, Object> result = (Map<String, Object>) repository.mutate(state -> deleteScenarioRecords(state, id));
    auditService.audit("SCENARIO_DELETED", Json.obj("request", Json.obj("scenarioId", id), "response", result));
    return Json.obj("success", true, "scenarioId", id, "scenarioName", result.get("scenarioName"), "deletedRecords", result.get("deletedRecords"), "remainingScenarioCount", result.get("remainingScenarioCount"), "message", "Scenario \"" + result.get("scenarioName") + "\" was deleted.");
  }

  @PostMapping("/api/scenarios/{id}/analyze")
  public Map<String, Object> analyze(@PathVariable String id) {
    Map<String, Object> state = repository.read();
    Map<String, Object> scenario = require(state, "scenarios", "id", id, "Scenario not found.");
    Map<String, Object> prediction = mlClient.predictScenario(scenario);
    Map<String, Object> impact = impactService.analyzeImpact(scenario, comparisonService.predictionValues(prediction));
    List<Map<String, Object>> compared = comparisonService.compareAnalyzedScenarios(List.of(Json.obj("scenario", scenario, "impact", impact, "prediction", comparisonService.predictionValues(prediction))));
    Map<String, Object> predictiveAnalysis = recommendationViewService.buildPredictiveAnalysis(scenario, impact, prediction);
    Map<String, Object> recommendation = genAiService.generateRecommendation(Json.obj("scenario", scenario, "impact", impact, "prediction", prediction, "predictiveAnalysis", predictiveAnalysis, "comparison", compared));
    Map<String, Object> aiRecommendation = Json.obj("id", Json.id(), "scenarioId", scenario.get("id"), "recommendedModel", compared.isEmpty() ? scenario.get("businessModelType") : compared.get(0).get("businessModelType"), "rationale", recommendation.getOrDefault("rationale", recommendation.get("executiveSummary")), "keyDrivers", prediction.getOrDefault("topContributingFactors", List.of()), "risks", recommendation.getOrDefault("risks", List.of()), "alternativesCompared", compared, "confidence", prediction.getOrDefault("confidence", Json.map(prediction.get("predictions")).getOrDefault("confidence", 0.6)), "generatedAt", recommendation.get("generatedAt"), "content", recommendation);
    repository.mutate(mutable -> {
      replaceByScenario(mutable, "predictions", id, withScenarioId(prediction, id));
      replaceByScenario(mutable, "impacts", id, impact);
      replaceByScenario(mutable, "recommendations", id, aiRecommendation);
      return null;
    });
    auditService.audit("SCENARIO_ANALYZED", Json.obj("modelVersion", prediction.get("modelVersion"), "promptVersion", recommendation.get("promptVersion"), "request", Json.obj("scenarioId", id), "response", Json.obj("impact", impact, "prediction", prediction, "recommendation", aiRecommendation)));
    return Json.obj("scenario", scenario, "impact", impact, "prediction", prediction, "comparison", compared, "recommendation", aiRecommendation);
  }

  @PostMapping("/api/scenarios/compare")
  public Map<String, Object> compare(@RequestBody Map<String, Object> body) {
    List<String> ids = Json.array(body == null ? null : body.get("scenarioIds")).stream().map(Json::str).toList();
    List<Map<String, Object>> selected = Json.array(repository.read().get("scenarios")).stream().map(Json::map).filter(item -> ids.contains(Json.str(item.get("id")))).toList();
    if (selected.size() < 2) throw new ApiException(HttpStatus.BAD_REQUEST, "REQUEST_ERROR", "Provide at least two scenarioIds.");
    List<Map<String, Object>> analyzed = selected.stream().map(this::analyzeScenarioRecord).toList();
    List<Map<String, Object>> comparison = comparisonService.compareAnalyzedScenarios(analyzed);
    auditService.audit("SCENARIOS_COMPARED", Json.obj("request", Json.obj("scenarioIds", ids), "response", comparison));
    return Json.obj("comparison", comparison, "analyzed", analyzed);
  }

  @PostMapping("/api/scenarios/compare/details")
  public Map<String, Object> compareDetails(@RequestBody Map<String, Object> body) {
    List<String> ids = Json.array(body == null ? null : body.get("scenarioIds")).stream().map(Json::str).toList();
    Map<String, Object> state = repository.read();
    List<Map<String, Object>> selected = Json.array(state.get("scenarios")).stream().map(Json::map).filter(item -> ids.contains(Json.str(item.get("id")))).toList();
    if (selected.size() < 2) throw new ApiException(HttpStatus.BAD_REQUEST, "REQUEST_ERROR", "Provide at least two scenarioIds.");
    List<Map<String, Object>> analyzed = selected.stream().map(scenario -> {
      Map<String, Object> impact = find(state, "impacts", "scenarioId", Json.str(scenario.get("id")));
      Map<String, Object> prediction = find(state, "predictions", "scenarioId", Json.str(scenario.get("id")));
      return impact != null && prediction != null ? Json.obj("scenario", scenario, "impact", impact, "prediction", prediction) : analyzeScenarioRecord(scenario);
    }).toList();
    Map<String, Object> details = comparisonService.buildComparisonDetails(analyzed);
    auditService.audit("SCENARIOS_COMPARED_DETAILS", Json.obj("request", Json.obj("scenarioIds", ids), "response", details));
    Map<String, Object> response = new LinkedHashMap<>(details); response.put("analyzed", analyzed); return response;
  }

  @GetMapping("/api/scenarios/{id}/impact")
  public Map<String, Object> impact(@PathVariable String id) { return require(repository.read(), "impacts", "scenarioId", id, "Impact result not found. Run analysis first."); }

  @GetMapping("/api/scenarios/{id}/prediction")
  public Map<String, Object> prediction(@PathVariable String id) { return require(repository.read(), "predictions", "scenarioId", id, "Prediction not found. Run analysis first."); }

  @GetMapping("/api/scenarios/{id}/recommendation")
  public Map<String, Object> recommendation(@PathVariable String id) { return recommendationViewService.buildRecommendationView(repository.read(), id); }

  @PostMapping("/api/scenarios/{id}/recommendation/regenerate")
  public Map<String, Object> regenerate(@PathVariable String id) {
    Map<String, Object> state = repository.read();
    Map<String, Object> scenario = find(state, "scenarios", "id", id), impact = find(state, "impacts", "scenarioId", id), prediction = find(state, "predictions", "scenarioId", id);
    if (scenario == null || impact == null || prediction == null) throw new ApiException(HttpStatus.NOT_FOUND, "ANALYSIS_REQUIRED", "Run impact analysis before regenerating recommendation.");
    Map<String, Object> recommendation = genAiService.generateRecommendation(Json.obj("scenario", scenario, "impact", impact, "prediction", prediction, "predictiveAnalysis", recommendationViewService.buildPredictiveAnalysis(scenario, impact, prediction), "comparison", List.of()));
    Map<String, Object> aiRecommendation = Json.obj("id", Json.id(), "scenarioId", id, "recommendedModel", recommendation.getOrDefault("recommendedModel", scenario.get("businessModelType")), "rationale", recommendation.getOrDefault("rationale", recommendation.get("executiveSummary")), "keyDrivers", prediction.getOrDefault("topContributingFactors", List.of()), "risks", recommendation.getOrDefault("risks", List.of()), "alternativesCompared", List.of(), "confidence", prediction.getOrDefault("confidence", 0.6), "generatedAt", recommendation.get("generatedAt"), "content", recommendation);
    repository.mutate(mutable -> { replaceByScenario(mutable, "recommendations", id, aiRecommendation); return null; });
    auditService.audit("RECOMMENDATION_REGENERATED", Json.obj("promptVersion", recommendation.get("promptVersion"), "request", Json.obj("scenarioId", id), "response", aiRecommendation));
    return recommendationViewService.buildRecommendationView(repository.read(), id);
  }

  @GetMapping("/api/scenarios/{id}/impact/details")
  public Map<String, Object> impactDetails(@PathVariable String id) {
    Map<String, Object> state = repository.read();
    Map<String, Object> scenario = find(state, "scenarios", "id", id), impact = find(state, "impacts", "scenarioId", id), prediction = find(state, "predictions", "scenarioId", id);
    if (scenario == null || impact == null || prediction == null) throw new ApiException(HttpStatus.NOT_FOUND, "REQUEST_ERROR", "Impact details not found. Run analysis first.");
    return impactDetailsService.buildImpactDetails(scenario, impact, prediction);
  }

  @GetMapping("/api/scenarios/{id}/charts")
  public Map<String, Object> charts(@PathVariable String id) {
    Map<String, Object> state = repository.read();
    Map<String, Object> scenario = find(state, "scenarios", "id", id), impact = find(state, "impacts", "scenarioId", id), prediction = find(state, "predictions", "scenarioId", id);
    if (scenario == null || impact == null || prediction == null) throw new ApiException(HttpStatus.NOT_FOUND, "REQUEST_ERROR", "Scenario chart data not found. Run analysis first.");
    return impactDetailsService.buildScenarioCharts(scenario, impact, prediction);
  }

  @PostMapping("/api/scenarios/{id}/suggest-better-model")
  public Map<String, Object> suggest(@PathVariable String id, @RequestBody(required = false) Map<String, Object> body) {
    Map<String, Object> state = repository.read();
    Map<String, Object> scenario = require(state, "scenarios", "id", id, "Scenario not found.");
    Map<String, Object> built = suggestionService.buildSuggestion(state, scenario, Json.array(body == null ? null : body.get("comparisonContext")));
    Map<String, Object> suggestion = Json.map(built.get("suggestion"));
    if (!suggestion.isEmpty()) repository.mutate(mutable -> { JsonStoreRepository.collection(mutable, "suggestions").add(0, suggestion); return null; });
    auditService.audit("BETTER_MODEL_SUGGESTED", Json.obj("modelVersion", Json.map(Json.map(built.get("response")).get("suggestedPrediction")).get("modelVersion"), "promptVersion", suggestion.getOrDefault("promptVersion", Json.map(built.get("response")).get("promptVersion")), "request", Json.obj("scenarioId", id), "response", built.get("response")));
    return Json.map(built.get("response"));
  }

  @PostMapping("/api/scenarios/{id}/use-suggested-model")
  public ResponseEntity<Object> useSuggestion(@PathVariable String id, @RequestBody Map<String, Object> body) {
    String suggestionId = Json.str(body == null ? null : body.get("suggestionId"));
    if (suggestionId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "REQUEST_ERROR", "suggestionId is required.");
    @SuppressWarnings("unchecked") Map<String, Object> result = (Map<String, Object>) repository.mutate(state -> suggestionService.acceptSuggestionRecord(state, id, suggestionId));
    auditService.audit("BETTER_MODEL_ACCEPTED", Json.obj("request", Json.obj("sourceScenarioId", id, "suggestionId", suggestionId), "response", result));
    return ResponseEntity.status(201).body(Json.obj("success", true, "newScenarioId", Json.map(result.get("scenario")).get("id"), "sourceScenarioId", id, "relationshipType", "AI_SUGGESTED_MODEL", "status", "accepted", "analysisStatus", result.get("impact") != null && result.get("prediction") != null ? "completed" : "pending", "alreadyAccepted", Boolean.TRUE.equals(result.get("alreadyAccepted")), "message", Boolean.TRUE.equals(result.get("alreadyAccepted")) ? "Suggested model was already saved as a new scenario." : "Suggested model has been saved as a new scenario.", "scenario", result.get("scenario"), "impact", result.get("impact"), "prediction", result.get("prediction")));
  }

  @PostMapping("/api/scenarios/{id}/discard-suggestion")
  public Map<String, Object> discard(@PathVariable String id, @RequestBody Map<String, Object> body) {
    String suggestionId = Json.str(body == null ? null : body.get("suggestionId"));
    if (suggestionId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "REQUEST_ERROR", "suggestionId is required.");
    @SuppressWarnings("unchecked") Map<String, Object> result = (Map<String, Object>) repository.mutate(state -> suggestionService.discardSuggestionRecord(state, id, suggestionId));
    auditService.audit("BETTER_MODEL_DISCARDED", Json.obj("request", Json.obj("sourceScenarioId", id, "suggestionId", suggestionId), "response", result));
    return Json.obj("success", true, "status", "discarded", "message", "AI suggestion discarded.", "suggestionId", result.get("id"), "sourceScenarioId", id);
  }

  @PostMapping("/api/scenarios/{id}/compare-suggestion")
  public Map<String, Object> compareSuggestion(@PathVariable String id, @RequestBody Map<String, Object> body) {
    String suggestionId = Json.str(body == null ? null : body.get("suggestionId"));
    if (suggestionId.isBlank()) throw new ApiException(HttpStatus.BAD_REQUEST, "REQUEST_ERROR", "suggestionId is required.");
    Map<String, Object> state = repository.read();
    Map<String, Object> suggestion = Json.array(state.get("suggestions")).stream().map(Json::map).filter(item -> suggestionId.equals(item.get("id")) && id.equals(item.get("sourceScenarioId"))).findFirst().orElseThrow(() -> new ApiException(HttpStatus.NOT_FOUND, "REQUEST_ERROR", "Suggestion not found."));
    Map<String, Object> original = require(state, "scenarios", "id", id, "Scenario not found.");
    Map<String, Object> details = comparisonService.buildComparisonDetails(List.of(Json.obj("scenario", original, "impact", suggestion.get("originalImpact"), "prediction", suggestion.get("originalPrediction")), Json.obj("scenario", Json.obj("id", "suggestion-preview", "name", Json.map(suggestion.get("suggestedPayload")).get("name"), "businessModelType", Json.map(suggestion.get("suggestedPayload")).get("businessModelType")), "impact", suggestion.get("suggestedImpact"), "prediction", suggestion.get("suggestedPrediction"))));
    Map<String, Object> response = new LinkedHashMap<>(Json.obj("success", true, "comparisonId", Json.id(), "suggestionId", suggestionId, "originalScenario", original, "suggestedScenario", suggestion.get("suggestedPayload"), "comparison", Json.obj("o2cImpactChanges", suggestion.getOrDefault("o2cImpactChanges", List.of()), "tradeOffs", suggestion.getOrDefault("tradeOffs", List.of()))));
    response.putAll(details); return response;
  }

  @GetMapping("/api/audit")
  public Object audit() { return auditService.listAudit(); }

  @PostMapping("/api/train")
  public Map<String, Object> train(@RequestBody(required = false) Map<String, Object> body) { return mlClient.trainModel(body == null ? Map.of() : body); }

  @PostMapping({"/ai/recommend", "/ai/explain", "/ai/summarize"})
  public Map<String, Object> ai(@RequestBody Map<String, Object> body) { return genAiService.generateRecommendation(body == null ? Map.of() : body); }

  private Map<String, Object> analyzeScenarioRecord(Map<String, Object> scenario) {
    Map<String, Object> prediction = mlClient.predictScenario(scenario);
    Map<String, Object> impact = impactService.analyzeImpact(scenario, comparisonService.predictionValues(prediction));
    return Json.obj("scenario", scenario, "prediction", prediction, "impact", impact);
  }

  private Map<String, Object> require(Map<String, Object> state, String collection, String field, String id, String message) {
    Map<String, Object> found = find(state, collection, field, id);
    if (found == null) throw new ApiException(HttpStatus.NOT_FOUND, "REQUEST_ERROR", message);
    return found;
  }

  private Map<String, Object> find(Map<String, Object> state, String collection, String field, String id) {
    return Json.array(state.get(collection)).stream().map(Json::map).filter(item -> id.equals(Json.str(item.get(field)))).findFirst().orElse(null);
  }

  private void replaceByScenario(Map<String, Object> state, String collection, String scenarioId, Map<String, Object> record) {
    List<Map<String, Object>> rows = JsonStoreRepository.collection(state, collection);
    rows.removeIf(item -> scenarioId.equals(Json.str(item.get("scenarioId"))));
    rows.add(0, record);
  }

  private Map<String, Object> withScenarioId(Map<String, Object> record, String scenarioId) {
    Map<String, Object> copy = new LinkedHashMap<>(record); copy.put("scenarioId", scenarioId); return copy;
  }

  private Map<String, Object> deleteScenarioRecords(Map<String, Object> state, String id) {
    Map<String, Object> scenario = require(state, "scenarios", "id", id, "Scenario not found.");
    Map<String, Object> counts = Json.obj("scenarios", 1, "impacts", count(state, "impacts", "scenarioId", id), "predictions", count(state, "predictions", "scenarioId", id), "recommendations", count(state, "recommendations", "scenarioId", id), "suggestions", Json.array(state.get("suggestions")).stream().map(Json::map).filter(item -> id.equals(item.get("sourceScenarioId")) || id.equals(item.get("suggestedScenarioId"))).count(), "scenarioLinks", Json.array(state.get("scenarioLinks")).stream().map(Json::map).filter(item -> id.equals(item.get("originalScenarioId")) || id.equals(item.get("newScenarioId"))).count());
    JsonStoreRepository.collection(state, "scenarios").removeIf(item -> id.equals(item.get("id")));
    for (String key : List.of("impacts", "predictions", "recommendations")) JsonStoreRepository.collection(state, key).removeIf(item -> id.equals(item.get("scenarioId")));
    JsonStoreRepository.collection(state, "suggestions").removeIf(item -> id.equals(item.get("sourceScenarioId")) || id.equals(item.get("suggestedScenarioId")));
    JsonStoreRepository.collection(state, "scenarioLinks").removeIf(item -> id.equals(item.get("originalScenarioId")) || id.equals(item.get("newScenarioId")));
    return Json.obj("scenarioId", id, "scenarioName", scenario.get("name"), "deletedRecords", counts, "remainingScenarioCount", Json.array(state.get("scenarios")).size());
  }

  private long count(Map<String, Object> state, String collection, String field, String id) {
    return Json.array(state.get(collection)).stream().map(Json::map).filter(item -> id.equals(item.get(field))).count();
  }
}
