import { env } from '../config/env.js';

const promptVersion = 'business-model-rec-v1';
const suggestionPromptVersion = 'business-model-suggestion-v1';

function compactImpact(impact = {}) {
  const o2c = Object.entries(impact.o2cImpactScores || {})
    .map(([area, value]) => ({ area, score: value.score ?? value, severity: value.severity }))
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, 6);
  return {
    scenarioId: impact.scenarioId,
    complianceRisk: impact.complianceRisk,
    implementationEffort: impact.implementationEffort,
    revenueImpact: impact.revenueImpact,
    delayProbability: impact.delayProbability,
    confidenceScore: impact.confidenceScore,
    integrationImpactScores: impact.integrationImpactScores,
    topO2CAreas: o2c
  };
}

function compactPrediction(prediction = {}) {
  const values = prediction.predictions || prediction;
  return {
    predictions: values,
    confidence: prediction.confidence,
    modelVersion: prediction.modelVersion,
    trainingMetadata: prediction.trainingMetadata,
    topContributingFactors: (prediction.topContributingFactors || []).slice(0, 6)
  };
}

function compactPredictiveAnalysis(analysis = {}) {
  return {
    modelVersion: analysis.modelVersion,
    confidence: analysis.confidence,
    historicalPatternSummary: analysis.historicalPatternSummary,
    topContributingFactors: (analysis.topContributingFactors || []).slice(0, 6),
    predictedOutputs: analysis.predictedOutputs
  };
}

function compactImpactDetails(details = {}) {
  return {
    scenarioOverview: details.scenarioOverview,
    predictiveAi: details.predictiveAi,
    riskMetrics: (details.riskMetrics || []).slice(0, 8),
    areaDetails: (details.areaDetails || []).slice(0, 8).map((area) => ({
      label: area.label,
      score: area.score,
      severity: area.severity,
      reason: area.reason,
      affectedSystems: area.affectedSystems,
      dependencyCount: area.dependencyCount
    }))
  };
}

function buildPrompt({ scenario, impact, prediction, predictiveAnalysis, comparison }) {
  return [
    'You are an enterprise commercial model transformation advisor for SAP Order-to-Cash programs.',
    'Return only valid compact JSON. No markdown.',
    'Generate a concise JSON object with keys executiveSummary, recommendation, rationale, risks, assumptions, businessImpact, implementationConsiderations, whyThisModel.',
    'Base every statement on the supplied scenario, O2C impact analysis, local predictive AI historical analysis, predictive model output, contributing factors and comparison scores. Do not invent external facts.',
    'Use the predictive AI outputs as the quantitative evidence and write the recommendation as business-readable reasoning.',
    `Scenario: ${JSON.stringify(scenario)}`,
    `Impact analysis: ${JSON.stringify(compactImpact(impact))}`,
    `Predictive output: ${JSON.stringify(compactPrediction(prediction))}`,
    `Predictive historical analysis: ${JSON.stringify(compactPredictiveAnalysis(predictiveAnalysis || {}))}`,
    `Comparison: ${JSON.stringify(comparison || [])}`
  ].join('\n');
}

function unavailableRecommendation(details) {
  return {
    success: false,
    status: 'GENAI_UNAVAILABLE',
    source: 'unavailable',
    promptVersion,
    model: env.openSourceAi.model,
    message: 'AI recommendation is temporarily unavailable.',
    customerMessage: 'We could not generate a new AI recommendation right now. Predictive impact scores and historical analysis are still available. Please retry after checking the AI service configuration.',
    technicalDetails: details || 'The configured GenAI endpoint is unavailable or not configured.',
    predictiveOnly: true,
    suggestedScenario: null,
    executiveSummary: '',
    recommendation: '',
    rationale: '',
    risks: [],
    assumptions: [],
    businessImpact: '',
    implementationConsiderations: '',
    whyThisModel: '',
    generatedAt: new Date().toISOString()
  };
}

function parseModelContent(body) {
  return body?.choices?.[0]?.message?.content
    || body?.message?.content
    || body?.response
    || body?.output_text
    || body?.content?.[0]?.text
    || JSON.stringify(body);
}

function parseJsonContent(content) {
  const trimmed = content.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return { executiveSummary: content };
  }
}

function buildSuggestionPrompt({ scenario, impact, prediction, impactDetails, comparisonContext }) {
  const values = prediction?.predictions || prediction || {};
  return [
    'You are an enterprise SAP Order-to-Cash commercial model architect.',
    'Suggest a better business model only if the supplied evidence indicates a measurable improvement opportunity.',
    'Return only valid JSON. No markdown, no prose outside JSON.',
    'The JSON must match this schema:',
    JSON.stringify({
      noBetterModelFound: false,
      message: '',
      suggestedScenario: {
        name: '',
        businessModelType: '',
        pricingType: '',
        billingFrequency: '',
        contractTerm: 0,
        fundingModel: '',
        bundleType: '',
        transactionVolume: 0,
        expectedRevenue: 0,
        complianceRegions: [],
        integrationCount: 0,
        processComplexity: 0
      },
      improvementSummary: '',
      aiRationale: '',
      expectedBenefits: {
        revenueImprovement: 0,
        riskReduction: 0,
        effortChange: 0,
        delayReduction: 0
      },
      o2cImpactChanges: [],
      tradeOffs: [],
      assumptions: [],
      confidence: 0
    }),
    'If no better model exists, return {"noBetterModelFound":true,"message":"The current model appears optimal based on the available impact and prediction data.","aiRationale":"","confidence":0}.',
    'Allowed businessModelType values: subscription, consumption-based, tiered, bundled-services, outcome-based, flexible-funding, hybrid.',
    'Allowed pricingType values: flat, tiered, usage, outcome, bundle, hybrid.',
    'Allowed billingFrequency values: monthly, quarterly, annual, milestone, usage-event.',
    'Allowed fundingModel values: capex, opex, mixed, partner-funded, customer-funded.',
    'Allowed bundleType values: single-offer, software-service, hardware-software-service, multi-product, partner-ecosystem.',
    'Use only scenario data, impact analysis, predictive output, O2C affected areas, compliance regions, integration complexity, revenue expectations and comparison criteria.',
    'If comparison context includes previousSuggestedModel entries, avoid repeating the same model, pricing type and billing frequency unless the predictive evidence clearly proves it remains best.',
    'Suggested values must be adapted to the submitted scenario; do not reuse a generic recommendation pattern across unrelated industries, customer segments, regions or O2C risk profiles.',
    'Only return noBetterModelFound when implementationRisk, billingComplexity, operationalEffort, implementationEffort and delayProbability are all moderate or low.',
    `Evidence threshold check: ${JSON.stringify({
      mustSuggestAlternative: evidenceRequiresAlternative({ scenario, impact, prediction }),
      implementationRisk: values.implementationRisk,
      billingComplexity: values.billingComplexity,
      operationalEffort: values.operationalEffort,
      implementationEffort: impact?.implementationEffort,
      delayProbability: values.delayProbability ?? impact?.delayProbability,
      processComplexity: scenario?.processComplexity,
      integrationCount: scenario?.integrationCount
    })}`,
    `Original scenario: ${JSON.stringify(scenario)}`,
    `Impact analysis: ${JSON.stringify(compactImpact(impact))}`,
    `Predictive AI output: ${JSON.stringify(compactPrediction(prediction))}`,
    `Impact details: ${JSON.stringify(compactImpactDetails(impactDetails))}`,
    `Comparison context: ${JSON.stringify(comparisonContext || [])}`
  ].join('\n');
}

function evidenceRequiresAlternative({ scenario = {}, impact = {}, prediction = {} }) {
  const values = prediction.predictions || prediction || {};
  return Number(values.implementationRisk || 0) >= 60
    || Number(values.billingComplexity || 0) >= 70
    || Number(values.operationalEffort || 0) >= 70
    || Number(values.delayProbability ?? impact.delayProbability ?? 0) >= 50
    || Number(impact.implementationEffort || 0) >= 70
    || Number(scenario.processComplexity || 0) >= 7
    || Number(scenario.integrationCount || 0) >= 12;
}

function noBetterResult(parsed) {
  return {
    success: true,
    source: env.openSourceAi.provider,
    promptVersion: suggestionPromptVersion,
    model: env.openSourceAi.model,
    noBetterModelFound: true,
    message: parsed.message || 'The current model appears optimal based on the available impact and prediction data.',
    aiRationale: parsed.aiRationale || '',
    confidence: Number(parsed.confidence || 0),
    generatedAt: new Date().toISOString()
  };
}

function validateSuggestionShape(parsed, requiresAlternative) {
  if (parsed.noBetterModelFound) {
    if (requiresAlternative) throw new Error('Predictive evidence requires an alternative suggestion');
    return noBetterResult(parsed);
  }
  if (!parsed.suggestedScenario || !parsed.expectedBenefits) {
    throw new Error('Missing suggestedScenario or expectedBenefits');
  }
  return null;
}

function aiRequestBody(prompt, maxTokens) {
  const body = {
    model: env.openSourceAi.model,
    messages: [{ role: 'user', content: prompt }],
    stream: false,
    think: false,
    format: 'json',
    options: {
      num_predict: maxTokens,
      temperature: 0.2
    }
  };
  if (!isNativeOllama()) {
    body.max_tokens = maxTokens;
    body.temperature = 0.2;
    body.response_format = { type: 'json_object' };
  }
  return body;
}

function isNativeOllama() {
  return env.openSourceAi.provider === 'ollama' && /localhost:11434|127\.0\.0\.1:11434/.test(env.openSourceAi.baseUrl);
}

function aiEndpointUrl() {
  if (!isNativeOllama()) return env.openSourceAi.baseUrl;
  return env.openSourceAi.baseUrl
    .replace(/\/v1\/chat\/completions\/?$/, '/api/chat')
    .replace(/\/v1\/?$/, '/api/chat');
}

function createAiError(errorCode, message, details, status = 503) {
  const error = new Error(message);
  error.status = status;
  error.errorCode = errorCode;
  error.details = details;
  return error;
}

function validateAiConfig() {
  if (!env.openSourceAi.baseUrl || !env.openSourceAi.model) {
    throw createAiError(
      'GENAI_UNAVAILABLE',
      'AI suggestion service is not configured.',
      'Configure SAP AI Core or an OpenAI-compatible GenAI endpoint before requesting suggestions.'
    );
  }
}

async function callConfiguredAiOnce(prompt, maxTokens = 1200) {
  validateAiConfig();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.openSourceAi.timeoutMs);
  const headers = { 'Content-Type': 'application/json' };
  if (env.openSourceAi.apiKey) {
    headers.Authorization = `Bearer ${env.openSourceAi.apiKey}`;
  }

  try {
    const response = await fetch(aiEndpointUrl(), {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify(aiRequestBody(prompt, maxTokens))
    });
    if (!response.ok) {
      throw createAiError(
        'GENAI_PROVIDER_ERROR',
        'AI provider returned an unsuccessful response.',
        `The GenAI service returned HTTP ${response.status}.`,
        502
      );
    }
    const body = await response.json();
    return parseModelContent(body);
  } catch (error) {
    if (error.name === 'AbortError') {
      console.warn('AI request timed out or was aborted', {
        provider: env.openSourceAi.provider,
        timeoutMs: env.openSourceAi.timeoutMs,
        errorName: error.name
      });
      throw createAiError(
        'AI_REQUEST_TIMEOUT',
        'AI suggestion request timed out. Please retry.',
        'The GenAI service did not respond within the configured timeout.',
        504
      );
    }
    if (error.errorCode) throw error;
    console.warn('AI request failed', {
      provider: env.openSourceAi.provider,
      errorName: error.name,
      message: error.message
    });
    throw createAiError(
      'GENAI_NETWORK_ERROR',
      'AI suggestion request failed due to a network or provider connection issue.',
      'Check that the configured GenAI endpoint is reachable and retry.',
      503
    );
  } finally {
    clearTimeout(timeout);
  }
}

async function callConfiguredAi(prompt, maxTokens = 1200, retries = 1) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await callConfiguredAiOnce(prompt, maxTokens);
    } catch (error) {
      lastError = error;
      if (!['AI_REQUEST_TIMEOUT', 'GENAI_NETWORK_ERROR'].includes(error.errorCode) || attempt === retries) {
        throw error;
      }
    }
  }
  throw lastError;
}

export async function generateRecommendation(input) {
  const prompt = buildPrompt(input);
  if (!env.openSourceAi.baseUrl || !env.openSourceAi.model) {
    return unavailableRecommendation('Configure SAP AI Core or an OpenAI-compatible GenAI endpoint before requesting recommendations.');
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.openSourceAi.timeoutMs);
  const headers = { 'Content-Type': 'application/json' };
  if (env.openSourceAi.apiKey) {
    headers.Authorization = `Bearer ${env.openSourceAi.apiKey}`;
  }

  try {
    const response = await fetch(aiEndpointUrl(), {
      method: 'POST',
      signal: controller.signal,
      headers,
      body: JSON.stringify(aiRequestBody(prompt, 220))
    });
    if (!response.ok) throw new Error(`${env.openSourceAi.provider} returned ${response.status}`);
    const body = await response.json();
    const parsed = parseJsonContent(parseModelContent(body));
    return {
      source: env.openSourceAi.provider,
      promptVersion,
      model: env.openSourceAi.model,
      ...parsed,
      generatedAt: new Date().toISOString()
    };
  } catch (error) {
    return unavailableRecommendation(error.message || 'The configured GenAI endpoint could not be reached.');
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateBetterModelSuggestion(input) {
  const prompt = buildSuggestionPrompt(input);
  const requiresAlternative = evidenceRequiresAlternative(input);
  let content;
  try {
    content = await callConfiguredAi(prompt, 320, 1);
  } catch (error) {
    const controlled = new Error(error.message);
    controlled.status = error.status || 503;
    controlled.errorCode = error.errorCode || 'GENAI_UNAVAILABLE';
    controlled.details = error.details;
    throw controlled;
  }

  let parsed;
  try {
    parsed = parseJsonContent(content);
    const noBetter = validateSuggestionShape(parsed, requiresAlternative);
    if (noBetter) return noBetter;
  } catch {
    const correctionPrompt = [
      'The previous response was invalid JSON, missed required keys, or incorrectly returned noBetterModelFound for a high-risk scenario.',
      'Return only corrected JSON matching the requested schema.',
      requiresAlternative
        ? 'Predictive evidence requires a concrete suggestedScenario. Do not return noBetterModelFound.'
        : 'Return noBetterModelFound only if the predictive evidence is moderate or low risk.',
      `Invalid response: ${content}`,
      `Original request: ${prompt}`
    ].join('\n');
    const retryContent = await callConfiguredAi(correctionPrompt, 260, 0);
    try {
      parsed = parseJsonContent(retryContent);
      const noBetter = validateSuggestionShape(parsed, requiresAlternative);
      if (noBetter) return noBetter;
    } catch {
      throw createAiError(
        'INVALID_AI_RESPONSE',
        'AI suggestion response could not be parsed as valid structured JSON.',
        'The GenAI response did not match the required better-model suggestion schema after one correction retry.',
        502
      );
    }
  }

  return {
    success: true,
    source: env.openSourceAi.provider,
    promptVersion: suggestionPromptVersion,
    model: env.openSourceAi.model,
    ...parsed,
    generatedAt: new Date().toISOString()
  };
}
