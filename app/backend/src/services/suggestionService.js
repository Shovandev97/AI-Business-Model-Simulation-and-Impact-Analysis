import { nanoid } from 'nanoid';
import { validateScenario } from './scenarioValidator.js';
import { analyzeImpact } from './impactEngine.js';
import { buildImpactDetails } from './impactDetailsService.js';
import { generateBetterModelSuggestion } from './genAiService.js';
import { predictScenario } from './mlClient.js';
import { compareAnalyzedScenarios } from './comparisonEngine.js';

function latestFor(state, collection, scenarioId) {
  return state[collection].find((item) => item.scenarioId === scenarioId);
}

function normalizeSuggestedScenario(original, suggested) {
  const merged = {
    ...original,
    id: undefined,
    name: suggested.name || `${original.name} - AI Suggested`,
    description: `AI-suggested model based on ${original.name}`,
    businessModelType: suggested.businessModelType || original.businessModelType,
    industry: original.industry,
    customerSegment: original.customerSegment,
    region: original.region,
    pricingType: suggested.pricingType || original.pricingType,
    contractTerm: Number(suggested.contractTerm || original.contractTerm),
    billingFrequency: suggested.billingFrequency || original.billingFrequency,
    fundingModel: suggested.fundingModel || original.fundingModel,
    bundleType: suggested.bundleType || original.bundleType,
    transactionVolume: Number(suggested.transactionVolume || original.transactionVolume),
    expectedRevenue: Number(suggested.expectedRevenue || original.expectedRevenue),
    complianceRegions: Array.isArray(suggested.complianceRegions) && suggested.complianceRegions.length ? suggested.complianceRegions : original.complianceRegions,
    integrationCount: Number(suggested.integrationCount ?? original.integrationCount),
    processComplexity: Number(suggested.processComplexity ?? original.processComplexity)
  };
  delete merged.createdAt;
  delete merged.updatedAt;
  delete merged.id;
  return validateScenario(merged);
}

function boundedInteger(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(Number(value || 0))));
}

function normalizeToken(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function suggestionSignature(scenario = {}) {
  return [
    scenario.businessModelType,
    scenario.pricingType,
    scenario.billingFrequency,
    scenario.fundingModel,
    scenario.bundleType,
    scenario.contractTerm,
    scenario.integrationCount,
    scenario.processComplexity
  ].map(normalizeToken).join('|');
}

function commercialSignature(scenario = {}) {
  return [
    scenario.businessModelType,
    scenario.pricingType,
    scenario.billingFrequency
  ].map(normalizeToken).join('|');
}

function modelStrategyPool(original, impact = {}, prediction = {}, previousSuggestions = []) {
  const values = prediction.predictions || prediction || {};
  const highBillingComplexity = Number(values.billingComplexity || 0) >= 70;
  const highIntegrationImpact = Number(values.downstreamIntegrationImpact || 0) >= 70 || Number(original.integrationCount || 0) >= 10;
  const highDelay = Number(values.delayProbability ?? impact.delayProbability ?? 0) >= 50;
  const highCompliance = Number(values.complianceRisk ?? impact.complianceRisk ?? 0) >= 55;
  const highRevenue = Number(values.revenueImpactPct ?? impact.revenueImpact ?? 0) >= 7;
  const current = normalizeToken(original.businessModelType);
  const priorTypes = new Set(previousSuggestions.map((item) => normalizeToken(item.suggestedPayload?.businessModelType)));

  const pool = [
    {
      businessModelType: highBillingComplexity ? 'subscription' : 'consumption-based',
      pricingType: highBillingComplexity ? 'tiered' : 'usage',
      billingFrequency: highBillingComplexity || highDelay ? 'monthly' : 'usage-event',
      fundingModel: highRevenue ? 'opex' : 'customer-funded',
      bundleType: highIntegrationImpact ? 'software-service' : 'single-offer',
      priority: (highBillingComplexity ? 4 : 1) + (highDelay ? 2 : 0)
    },
    {
      businessModelType: highIntegrationImpact ? 'bundled-services' : 'tiered',
      pricingType: highIntegrationImpact ? 'bundle' : 'tiered',
      billingFrequency: highCompliance ? 'quarterly' : 'monthly',
      fundingModel: highRevenue ? 'mixed' : 'partner-funded',
      bundleType: highIntegrationImpact ? 'partner-ecosystem' : 'multi-product',
      priority: (highIntegrationImpact ? 4 : 1) + (highCompliance ? 2 : 0)
    },
    {
      businessModelType: highRevenue ? 'outcome-based' : 'hybrid',
      pricingType: highRevenue ? 'outcome' : 'hybrid',
      billingFrequency: highDelay ? 'milestone' : 'quarterly',
      fundingModel: highRevenue ? 'customer-funded' : 'mixed',
      bundleType: 'multi-product',
      priority: (highRevenue ? 4 : 2) + (highDelay ? 2 : 0)
    },
    {
      businessModelType: highCompliance ? 'flexible-funding' : 'hybrid',
      pricingType: highCompliance ? 'flat' : 'hybrid',
      billingFrequency: highCompliance ? 'quarterly' : 'monthly',
      fundingModel: highCompliance ? 'partner-funded' : 'mixed',
      bundleType: highIntegrationImpact ? 'hardware-software-service' : 'software-service',
      priority: (highCompliance ? 4 : 2) + (highIntegrationImpact ? 1 : 0)
    },
    {
      businessModelType: current.includes('subscription') ? 'consumption-based' : 'subscription',
      pricingType: current.includes('subscription') ? 'usage' : 'tiered',
      billingFrequency: current.includes('subscription') ? 'usage-event' : 'monthly',
      fundingModel: current.includes('subscription') ? 'customer-funded' : 'opex',
      bundleType: current.includes('subscription') ? 'single-offer' : 'software-service',
      priority: priorTypes.has(current) ? 2 : 1
    }
  ];

  return pool
    .filter((item) => normalizeToken(item.businessModelType) !== current || normalizeToken(item.pricingType) !== normalizeToken(original.pricingType))
    .sort((a, b) => b.priority - a.priority);
}

function candidateName(original, strategy, candidate) {
  const model = strategy.businessModelType
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  const focus = candidate.processComplexity < Number(original.processComplexity || 0)
    ? 'Complexity-Reduced'
    : candidate.integrationCount < Number(original.integrationCount || 0)
      ? 'Integration-Optimized'
      : 'Revenue-Balanced';
  return `${original.name} - ${focus} ${model}`;
}

export function candidateScenarios(original, impact = {}, prediction = {}, previousSuggestions = []) {
  const baseRevenue = Number(original.expectedRevenue || 0);
  const baseIntegrations = Number(original.integrationCount || 0);
  const baseComplexity = Number(original.processComplexity || 1);
  const values = prediction.predictions || prediction || {};
  const riskPressure = Math.max(
    Number(values.implementationRisk || 0),
    Number(values.billingComplexity || 0),
    Number(values.operationalEffort || 0),
    Number(impact.implementationEffort || 0)
  );
  const integrationReduction = riskPressure >= 80 ? 0.58 : riskPressure >= 65 ? 0.72 : 0.85;
  const complexityReduction = riskPressure >= 80 ? 3 : riskPressure >= 65 ? 2 : 1;
  const revenueLift = Number(values.revenueImpactPct ?? impact.revenueImpact ?? 0) >= 8 ? 1.12 : 1.04;
  const previousSignatures = new Set(previousSuggestions.map((item) => suggestionSignature(item.suggestedPayload)));
  const previousCommercialSignatures = new Set(previousSuggestions.map((item) => commercialSignature(item.suggestedPayload)));

  const generated = modelStrategyPool(original, impact, prediction, previousSuggestions)
    .flatMap((strategy, index) => {
      const adjustment = 1 - (index * 0.04);
      const primary = {
        ...strategy,
        contractTerm: strategy.billingFrequency === 'milestone' ? Math.max(6, Number(original.contractTerm || 6)) : Math.max(12, Number(original.contractTerm || 12)),
        transactionVolume: Number(original.transactionVolume || 1),
        expectedRevenue: Math.max(1000, Math.round(baseRevenue * (revenueLift + (strategy.priority * 0.01) - (index * 0.015)))),
        complianceRegions: original.complianceRegions,
        integrationCount: boundedInteger(baseIntegrations * integrationReduction * adjustment, 0, 100),
        processComplexity: boundedInteger(baseComplexity - complexityReduction + (index % 2), 1, 10)
      };
      const conservative = {
        ...primary,
        billingFrequency: primary.billingFrequency === 'usage-event' ? 'monthly' : primary.billingFrequency,
        fundingModel: primary.fundingModel === 'customer-funded' ? 'partner-funded' : primary.fundingModel,
        expectedRevenue: Math.max(1000, Math.round(baseRevenue * (1.01 + (strategy.priority * 0.008)))),
        integrationCount: boundedInteger(primary.integrationCount + 1, 0, 100),
        processComplexity: boundedInteger(primary.processComplexity + 1, 1, 10)
      };
      return [primary, conservative];
    })
    .map((candidate) => ({ ...candidate, name: candidateName(original, candidate, candidate) }))
    .map((candidate) => normalizeSuggestedScenario(original, candidate));

  const unique = [];
  const seen = new Set();
  for (const candidate of generated) {
    const signature = suggestionSignature(candidate);
    const commercial = commercialSignature(candidate);
    if (seen.has(signature) || previousSignatures.has(signature) || previousCommercialSignatures.has(commercial)) continue;
    seen.add(signature);
    unique.push(candidate);
  }

  return unique.length ? unique : generated.filter((candidate, index) => index < 3);
}

function businessDeltaSummary(originalImpact, originalPrediction, suggestedImpact, suggestedPrediction) {
  const originalValues = originalPrediction.predictions || originalPrediction;
  const suggestedValues = suggestedPrediction.predictions || suggestedPrediction;
  const riskReduction = Number(((originalValues.implementationRisk || 0) - (suggestedValues.implementationRisk || 0)).toFixed(2));
  const revenueImprovement = Number(((suggestedImpact.revenueImpact || suggestedValues.revenueImpactPct || 0) - (originalImpact.revenueImpact || originalValues.revenueImpactPct || 0)).toFixed(2));
  const effortChange = Number(((suggestedImpact.implementationEffort || 0) - (originalImpact.implementationEffort || 0)).toFixed(2));
  const delayReduction = Number(((originalImpact.delayProbability || originalValues.delayProbability || 0) - (suggestedImpact.delayProbability || suggestedValues.delayProbability || 0)).toFixed(2));
  return { riskReduction, revenueImprovement, effortChange, delayReduction };
}

async function buildPredictiveFallbackSuggestion({ scenario, originalImpact, originalPrediction, previousSuggestions = [], aiError }) {
  const originalValues = originalPrediction.predictions || originalPrediction;
  const originalScore = compareAnalyzedScenarios([{ scenario, impact: originalImpact, prediction: originalValues }])[0];
  const evaluated = await Promise.all(candidateScenarios(scenario, originalImpact, originalPrediction, previousSuggestions).map(async (candidate) => {
    const suggestedPrediction = await predictScenario({ ...candidate, id: 'suggestion-preview' });
    const suggestedImpact = analyzeImpact({ ...candidate, id: 'suggestion-preview' }, suggestedPrediction.predictions || suggestedPrediction);
    const suggestedScore = compareAnalyzedScenarios([{ scenario: { id: 'suggestion-preview', ...candidate }, impact: suggestedImpact, prediction: suggestedPrediction.predictions || suggestedPrediction }])[0];
    const deltas = businessDeltaSummary(originalImpact, originalPrediction, suggestedImpact, suggestedPrediction);
    return { candidate, suggestedPrediction, suggestedImpact, suggestedScore, deltas };
  }));
  evaluated.sort((a, b) => {
    const scoreDelta = (b.suggestedScore?.recommendationScore || 0) - (a.suggestedScore?.recommendationScore || 0);
    if (scoreDelta !== 0) return scoreDelta;
    return b.deltas.riskReduction - a.deltas.riskReduction;
  });
  const best = evaluated[0];
  const deltas = best.deltas;
  return {
    success: true,
    source: 'ollama-predictive-validated',
    promptVersion: 'business-model-suggestion-v1',
    model: aiError?.model || 'local-predictive-fallback',
    suggestedScenario: best.candidate,
    suggestedPrediction: best.suggestedPrediction,
    suggestedImpact: best.suggestedImpact,
    originalScore,
    suggestedScore: best.suggestedScore,
    improvementSummary: `Predictive candidate scoring selected ${best.candidate.businessModelType} with ${best.candidate.pricingType} pricing because it changes the recommendation score from ${originalScore?.recommendationScore || 0} to ${best.suggestedScore?.recommendationScore || 0}, lowers risk by ${deltas.riskReduction}% and adjusts expected revenue by ${deltas.revenueImprovement}%.`,
    aiRationale: `Ollama was invoked for a structured recommendation. When the response could not be used safely, the local predictive model dynamically generated and scored ${evaluated.length} alternatives using this scenario's risk, billing, compliance, integration and revenue signals. This option ranked highest for the current business case.`,
    expectedBenefits: {
      revenueImprovement: deltas.revenueImprovement,
      riskReduction: deltas.riskReduction,
      effortChange: deltas.effortChange,
      delayReduction: deltas.delayReduction
    },
    o2cImpactChanges: [
      { area: 'Billing', change: `Billing frequency changes to ${best.candidate.billingFrequency} to reduce rating and settlement volatility.` },
      { area: 'Integrations', change: `Impacted integration count is reduced from ${scenario.integrationCount} to ${best.candidate.integrationCount}.` },
      { area: 'Process Complexity', change: `Process complexity is reduced from ${scenario.processComplexity}/10 to ${best.candidate.processComplexity}/10.` }
    ],
    tradeOffs: [
      'Commercial governance must approve the revised pricing and funding model.',
      'Customer communications should explain the migration path from the current model to the suggested structure.'
    ],
    assumptions: [
      'Demand volume remains within the submitted scenario range.',
      'Existing compliance regions and customer segment remain unchanged.',
      'Predictive model confidence is sufficient for directional planning, not final pricing approval.'
    ],
    confidence: Math.min(0.9, Math.max(0.6, Number(best.suggestedPrediction.confidence || originalPrediction.confidence || 0.7))),
    generatedAt: new Date().toISOString()
  };
}

export async function buildSuggestion({ state, scenario, comparisonContext = [] }) {
  const originalPrediction = latestFor(state, 'predictions', scenario.id);
  const originalImpact = latestFor(state, 'impacts', scenario.id);
  if (!originalPrediction || !originalImpact) {
    const error = new Error('Run impact analysis before requesting a better model suggestion.');
    error.status = 400;
    throw error;
  }
  const impactDetails = buildImpactDetails(scenario, originalImpact, originalPrediction);
  const previousSuggestions = (state.suggestions || []).filter((item) => item.sourceScenarioId === scenario.id);
  const enrichedComparisonContext = [
    ...(comparisonContext || []),
    ...previousSuggestions.slice(0, 5).map((item) => ({
      previousSuggestedModel: item.suggestedPayload?.businessModelType,
      previousPricingType: item.suggestedPayload?.pricingType,
      previousBillingFrequency: item.suggestedPayload?.billingFrequency,
      previousStatus: item.status
    }))
  ];
  let aiSuggestion;
  try {
    aiSuggestion = await generateBetterModelSuggestion({
      scenario,
      impact: originalImpact,
      prediction: originalPrediction,
      impactDetails,
      comparisonContext: enrichedComparisonContext
    });
  } catch (error) {
    if (!['INVALID_AI_RESPONSE', 'AI_REQUEST_TIMEOUT'].includes(error.errorCode)) throw error;
    aiSuggestion = await buildPredictiveFallbackSuggestion({
      scenario,
      originalImpact,
      originalPrediction,
      previousSuggestions,
      aiError: error
    });
  }
  if (aiSuggestion.noBetterModelFound) {
    return {
      suggestion: null,
      response: {
        success: true,
        noBetterModelFound: true,
        message: aiSuggestion.message,
        aiRationale: aiSuggestion.aiRationale,
        confidence: aiSuggestion.confidence,
        originalScenario: scenario,
        originalPrediction,
        originalImpact,
        source: aiSuggestion.source,
        promptVersion: aiSuggestion.promptVersion,
        generatedAt: aiSuggestion.generatedAt
      }
    };
  }
  const normalizedScenario = normalizeSuggestedScenario(scenario, aiSuggestion.suggestedScenario);
  const suggestedPrediction = aiSuggestion.suggestedPrediction || await predictScenario({ ...normalizedScenario, id: 'suggestion-preview' });
  const suggestedImpact = aiSuggestion.suggestedImpact || analyzeImpact({ ...normalizedScenario, id: 'suggestion-preview' }, suggestedPrediction.predictions || suggestedPrediction);
  const originalPredictionValues = originalPrediction.predictions || originalPrediction;
  const suggestedPredictionValues = suggestedPrediction.predictions || suggestedPrediction;
  const originalScore = aiSuggestion.originalScore || compareAnalyzedScenarios([{ scenario, impact: originalImpact, prediction: originalPredictionValues }])[0];
  const suggestedScore = aiSuggestion.suggestedScore || compareAnalyzedScenarios([{ scenario: { ...normalizedScenario, id: 'suggestion-preview' }, impact: suggestedImpact, prediction: suggestedPredictionValues }])[0];
  const now = new Date().toISOString();
  const suggestion = {
    id: nanoid(),
    sourceScenarioId: scenario.id,
    suggestedScenarioId: null,
    suggestedPayload: normalizedScenario,
    originalPrediction,
    suggestedPrediction,
    originalImpact,
    suggestedImpact,
    aiRationale: aiSuggestion.aiRationale,
    improvementSummary: aiSuggestion.improvementSummary,
    assumptions: aiSuggestion.assumptions || [],
    confidence: Number(aiSuggestion.confidence || 0),
    expectedBenefits: aiSuggestion.expectedBenefits || {},
    riskReduction: Number(aiSuggestion.expectedBenefits?.riskReduction ?? ((originalPredictionValues.implementationRisk || 0) - (suggestedPredictionValues.implementationRisk || 0)).toFixed(2)),
    revenueImprovement: Number(aiSuggestion.expectedBenefits?.revenueImprovement ?? ((suggestedPredictionValues.revenueImpactPct || 0) - (originalPredictionValues.revenueImpactPct || 0)).toFixed(2)),
    effortChange: Number(aiSuggestion.expectedBenefits?.effortChange ?? ((suggestedImpact.implementationEffort || 0) - (originalImpact.implementationEffort || 0)).toFixed(2)),
    o2cImpactChanges: aiSuggestion.o2cImpactChanges || [],
    tradeOffs: aiSuggestion.tradeOffs || [],
    originalScore,
    suggestedScore,
    status: 'suggested',
    source: aiSuggestion.source,
    promptVersion: aiSuggestion.promptVersion,
    createdAt: now,
    updatedAt: now
  };
  return {
    suggestion,
    response: {
      success: true,
      originalScenario: scenario,
      suggestedScenario: normalizedScenario,
      originalPrediction,
      suggestedPrediction,
      originalImpact,
      suggestedImpact,
      improvementSummary: suggestion.improvementSummary,
      aiRationale: suggestion.aiRationale,
      assumptions: suggestion.assumptions,
      confidence: suggestion.confidence,
      riskReduction: suggestion.riskReduction,
      revenueImprovement: suggestion.revenueImprovement,
      effortChange: suggestion.effortChange,
      o2cImpactChanges: suggestion.o2cImpactChanges,
      tradeOffs: suggestion.tradeOffs,
      originalScore,
      suggestedScore,
      suggestionId: suggestion.id
    }
  };
}

export function acceptSuggestionRecord(state, sourceScenarioId, suggestionId) {
  const suggestion = state.suggestions.find((item) => item.id === suggestionId && item.sourceScenarioId === sourceScenarioId);
  if (!suggestion) {
    const error = new Error('Suggestion not found.');
    error.status = 404;
    throw error;
  }
  if (suggestion.status === 'discarded') {
    const error = new Error('This AI suggestion has been discarded and cannot be used.');
    error.status = 409;
    error.errorCode = 'SUGGESTION_DISCARDED';
    throw error;
  }
  if (suggestion.status === 'accepted' && suggestion.suggestedScenarioId) {
    const scenario = state.scenarios.find((item) => item.id === suggestion.suggestedScenarioId);
    const impact = state.impacts.find((item) => item.scenarioId === suggestion.suggestedScenarioId);
    const prediction = state.predictions.find((item) => item.scenarioId === suggestion.suggestedScenarioId);
    return { scenario, impact, prediction, suggestion, alreadyAccepted: true };
  }
  const now = new Date().toISOString();
  const scenario = {
    id: nanoid(),
    ...suggestion.suggestedPayload,
    description: `${suggestion.suggestedPayload.description || ''} Linked to source scenario ${sourceScenarioId}.`.trim(),
    createdAt: now,
    updatedAt: now
  };
  const impact = { ...suggestion.suggestedImpact, scenarioId: scenario.id, generatedAt: now };
  const prediction = { ...suggestion.suggestedPrediction, scenarioId: scenario.id };
  suggestion.status = 'accepted';
  suggestion.suggestedScenarioId = scenario.id;
  suggestion.updatedAt = now;
  state.scenarios.unshift(scenario);
  state.impacts.unshift(impact);
  state.predictions.unshift(prediction);
  state.scenarioLinks.unshift({
    originalScenarioId: sourceScenarioId,
    newScenarioId: scenario.id,
    relationshipType: 'AI_SUGGESTED_MODEL',
    createdAt: now
  });
  return { scenario, impact, prediction, suggestion };
}

export function discardSuggestionRecord(state, sourceScenarioId, suggestionId) {
  const suggestion = state.suggestions.find((item) => item.id === suggestionId && item.sourceScenarioId === sourceScenarioId);
  if (!suggestion) {
    const error = new Error('Suggestion not found.');
    error.status = 404;
    throw error;
  }
  if (suggestion.status === 'accepted') {
    const error = new Error('This AI suggestion has already been accepted.');
    error.status = 409;
    error.errorCode = 'SUGGESTION_ACCEPTED';
    throw error;
  }
  suggestion.status = 'discarded';
  suggestion.updatedAt = new Date().toISOString();
  return suggestion;
}
