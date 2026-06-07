package com.bms.service;

import com.bms.config.BmsProperties;
import com.bms.util.ApiException;
import com.bms.util.Json;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Instant;
import java.util.List;
import java.util.Map;

@Service
public class GenAiService {
  public static final String PROMPT_VERSION = "business-model-rec-v1";
  public static final String SUGGESTION_PROMPT_VERSION = "business-model-suggestion-v1";
  private final BmsProperties properties;
  private final RestClient restClient;
  private final ObjectMapper mapper;

  public GenAiService(BmsProperties properties, RestClient.Builder builder, ObjectMapper mapper) {
    this.properties = properties;
    this.restClient = builder.build();
    this.mapper = mapper;
  }

  public Map<String, Object> generateRecommendation(Map<String, Object> input) {
    if (properties.getAi().getBaseUrl() == null || properties.getAi().getBaseUrl().isBlank() || properties.getAi().getModel() == null || properties.getAi().getModel().isBlank()) {
      return unavailableRecommendation("Configure SAP AI Core or an OpenAI-compatible GenAI endpoint before requesting recommendations.");
    }
    try {
      String content = callAi(buildPrompt(input), 220);
      Map<String, Object> parsed = parseJson(content);
      parsed.put("source", properties.getAi().getProvider());
      parsed.put("promptVersion", PROMPT_VERSION);
      parsed.put("model", properties.getAi().getModel());
      parsed.put("generatedAt", Instant.now().toString());
      return parsed;
    } catch (Exception error) {
      return unavailableRecommendation(error.getMessage());
    }
  }

  public Map<String, Object> generateBetterModelSuggestion(Map<String, Object> input) {
    if (properties.getAi().getBaseUrl() == null || properties.getAi().getBaseUrl().isBlank()) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GENAI_UNAVAILABLE", "AI suggestion service is not configured.", "Configure SAP AI Core or an OpenAI-compatible GenAI endpoint before requesting suggestions.");
    }
    try {
      Map<String, Object> parsed = parseJson(callAi(buildSuggestionPrompt(input), 1200));
      if (Boolean.TRUE.equals(parsed.get("noBetterModelFound"))) {
        parsed.putIfAbsent("message", "The current model appears optimal based on the available impact and prediction data.");
      } else if (!parsed.containsKey("suggestedScenario") || !parsed.containsKey("expectedBenefits")) {
        throw new ApiException(HttpStatus.BAD_GATEWAY, "INVALID_AI_RESPONSE", "AI suggestion response could not be parsed as valid structured JSON.", "The GenAI response did not match the required better-model suggestion schema after one correction retry.");
      }
      parsed.put("success", true);
      parsed.put("source", properties.getAi().getProvider());
      parsed.put("promptVersion", SUGGESTION_PROMPT_VERSION);
      parsed.put("model", properties.getAi().getModel());
      parsed.put("generatedAt", Instant.now().toString());
      return parsed;
    } catch (ApiException error) {
      throw error;
    } catch (Exception error) {
      throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "GENAI_NETWORK_ERROR", "AI suggestion request failed due to a network or provider connection issue.", "Check that the configured GenAI endpoint is reachable and retry.");
    }
  }

  private String callAi(String prompt, int maxTokens) throws Exception {
    Map<String, Object> body = Json.obj("model", properties.getAi().getModel(), "messages", List.of(Json.obj("role", "user", "content", prompt)), "stream", false, "think", false, "format", "json", "options", Json.obj("num_predict", maxTokens, "temperature", 0.2), "max_tokens", maxTokens, "temperature", 0.2, "response_format", Json.obj("type", "json_object"));
    @SuppressWarnings("unchecked")
    Map<String, Object> response = restClient.post().uri(aiEndpointUrl()).header("Content-Type", "application/json").headers(headers -> {
      if (properties.getAi().getApiKey() != null && !properties.getAi().getApiKey().isBlank()) headers.setBearerAuth(properties.getAi().getApiKey());
    }).body(body).retrieve().body(Map.class);
    return parseModelContent(response);
  }

  private String aiEndpointUrl() {
    String url = properties.getAi().getBaseUrl();
    if ("ollama".equals(properties.getAi().getProvider()) && (url.contains("localhost:11434") || url.contains("127.0.0.1:11434"))) {
      return url.replaceAll("/v1/chat/completions/?$", "/api/chat").replaceAll("/v1/?$", "/api/chat");
    }
    return url;
  }

  private String parseModelContent(Map<String, Object> body) throws Exception {
    Object choices = body == null ? null : body.get("choices");
    if (choices instanceof List<?> list && !list.isEmpty()) return Json.str(Json.map(Json.map(list.get(0)).get("message")).get("content"));
    if (body != null && Json.map(body.get("message")).get("content") != null) return Json.str(Json.map(body.get("message")).get("content"));
    if (body != null && body.get("response") != null) return Json.str(body.get("response"));
    if (body != null && body.get("output_text") != null) return Json.str(body.get("output_text"));
    return mapper.writeValueAsString(body);
  }

  @SuppressWarnings("unchecked")
  private Map<String, Object> parseJson(String content) throws Exception {
    String trimmed = content == null ? "" : content.trim();
    trimmed = trimmed.replaceFirst("^```(?:json)?\\s*", "").replaceFirst("\\s*```$", "");
    try {
      return mapper.readValue(trimmed, Map.class);
    } catch (Exception ignored) {
      return Json.obj("executiveSummary", content);
    }
  }

  private String buildPrompt(Map<String, Object> input) {
    return String.join("\n",
        "You are an enterprise commercial model transformation advisor for SAP Order-to-Cash programs.",
        "Return only valid compact JSON. No markdown.",
        "Generate a concise JSON object with keys executiveSummary, recommendation, rationale, risks, assumptions, businessImpact, implementationConsiderations, whyThisModel.",
        "Base every statement on supplied scenario, impact analysis, predictive model output and comparison scores.",
        "Scenario: " + json(input.get("scenario")),
        "Impact analysis: " + json(input.get("impact")),
        "Predictive output: " + json(input.get("prediction")),
        "Predictive historical analysis: " + json(input.get("predictiveAnalysis")),
        "Comparison: " + json(input.get("comparison")));
  }

  private String buildSuggestionPrompt(Map<String, Object> input) {
    return String.join("\n",
        "You are an enterprise SAP Order-to-Cash commercial model architect.",
        "Return only valid JSON. No markdown, no prose outside JSON.",
        "The JSON must include suggestedScenario, improvementSummary, aiRationale, expectedBenefits, o2cImpactChanges, tradeOffs, assumptions and confidence, or noBetterModelFound.",
        "Allowed businessModelType values: subscription, consumption-based, tiered, bundled-services, outcome-based, flexible-funding, hybrid.",
        "Allowed pricingType values: flat, tiered, usage, outcome, bundle, hybrid.",
        "Allowed billingFrequency values: monthly, quarterly, annual, milestone, usage-event.",
        "Original scenario: " + json(input.get("scenario")),
        "Impact analysis: " + json(input.get("impact")),
        "Predictive AI output: " + json(input.get("prediction")),
        "Impact details: " + json(input.get("impactDetails")),
        "Comparison context: " + json(input.get("comparisonContext")));
  }

  private String json(Object value) {
    try { return mapper.writeValueAsString(value); } catch (Exception ignored) { return "{}"; }
  }

  private Map<String, Object> unavailableRecommendation(String details) {
    return Json.obj("success", false, "status", "GENAI_UNAVAILABLE", "source", "unavailable", "promptVersion", PROMPT_VERSION, "model", properties.getAi().getModel(), "message", "AI recommendation is temporarily unavailable.", "customerMessage", "We could not generate a new AI recommendation right now. Predictive impact scores and historical analysis are still available. Please retry after checking the AI service configuration.", "technicalDetails", details, "predictiveOnly", true, "suggestedScenario", null, "executiveSummary", "", "recommendation", "", "rationale", "", "risks", List.of(), "assumptions", List.of(), "businessImpact", "", "implementationConsiderations", "", "whyThisModel", "", "generatedAt", Instant.now().toString());
  }
}
