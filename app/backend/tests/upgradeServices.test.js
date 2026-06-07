import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDashboardSummary, buildDashboardCharts } from '../src/services/dashboardService.js';
import { buildImpactDetails } from '../src/services/impactDetailsService.js';
import { buildComparisonDetails } from '../src/services/comparisonDetailsService.js';
import { generateBetterModelSuggestion, generateRecommendation } from '../src/services/genAiService.js';
import { env } from '../src/config/env.js';
import { buildRecommendationView, explainFeatureImpact, formatFeatureLabel } from '../src/services/recommendationViewService.js';
import { acceptSuggestionRecord, candidateScenarios, discardSuggestionRecord } from '../src/services/suggestionService.js';
import { deleteScenarioRecords } from '../src/services/scenarioLifecycleService.js';

const scenario = {
  id: 's1',
  name: 'Enterprise subscription',
  businessModelType: 'subscription',
  industry: 'Industrial Manufacturing',
  customerSegment: 'Enterprise',
  region: 'North America',
  pricingType: 'tiered',
  contractTerm: 36,
  billingFrequency: 'monthly',
  fundingModel: 'opex',
  bundleType: 'software-service',
  transactionVolume: 90000,
  expectedRevenue: 12000000,
  complianceRegions: ['US', 'EU'],
  integrationCount: 9,
  processComplexity: 7
};

const impact = {
  scenarioId: 's1',
  o2cImpactScores: {
    billing: { score: 78, severity: 'Very High' },
    integrations: { score: 72, severity: 'High' }
  },
  integrationImpactScores: { impactedInterfaces: 15, dataMappingComplexity: 70 },
  complianceRisk: 64,
  implementationEffort: 76,
  revenueImpact: 7.2,
  delayProbability: 58,
  confidenceScore: 0.83,
  generatedAt: '2026-06-06T00:00:00.000Z'
};

const prediction = {
  scenarioId: 's1',
  predictions: {
    implementationRisk: 68,
    billingComplexity: 79,
    revenueImpactPct: 7.2,
    complianceRisk: 61,
    delayProbability: 58,
    dependencyCount: 22,
    operationalEffort: 74,
    downstreamIntegrationImpact: 73
  },
  confidence: 0.83,
  topContributingFactors: [{ factor: 'processComplexity', importance: 0.6 }]
};

const recommendation = {
  id: 'rec1',
  scenarioId: 's1',
  recommendedModel: 'subscription',
  rationale: 'The model balances recurring revenue with implementation risk.',
  keyDrivers: prediction.topContributingFactors,
  confidence: 0.83,
  generatedAt: '2026-06-06T00:01:00.000Z',
  content: {
    executiveSummary: 'Subscription model is recommended based on risk, effort and revenue balance.',
    businessImpact: 'Revenue impact is positive with manageable risk.',
    rationale: 'Predictive outputs show implementation risk and billing complexity are the main constraints.',
    assumptions: ['Current integration landscape remains stable.'],
    implementationConsiderations: 'Validate billing and revenue recognition controls.',
    model: 'test-model',
    promptVersion: 'test-prompt'
  }
};

const suggestion = {
  id: 'sug1',
  sourceScenarioId: 's1',
  suggestedScenarioId: null,
  suggestedPayload: { ...scenario, name: 'Enterprise subscription - AI Suggested', pricingType: 'hybrid' },
  originalPrediction: prediction,
  suggestedPrediction: { ...prediction, scenarioId: 'suggestion-preview', predictions: { ...prediction.predictions, implementationRisk: 55, revenueImpactPct: 9.1 } },
  originalImpact: impact,
  suggestedImpact: { ...impact, scenarioId: 'suggestion-preview', implementationEffort: 70, revenueImpact: 9.1, delayProbability: 45 },
  aiRationale: 'Hybrid pricing reduces billing exceptions while preserving recurring revenue.',
  improvementSummary: 'Lower risk and higher revenue impact.',
  assumptions: ['Customer accepts hybrid pricing.'],
  expectedBenefits: { revenueImprovement: 1.9, riskReduction: 13, effortChange: -6, delayReduction: 13 },
  riskReduction: 13,
  revenueImprovement: 1.9,
  effortChange: -6,
  o2cImpactChanges: [{ area: 'Billing', change: 'Simplified rating model' }],
  tradeOffs: ['Requires pricing governance.'],
  status: 'suggested',
  confidence: 0.82,
  createdAt: '2026-06-06T00:02:00.000Z',
  updatedAt: '2026-06-06T00:02:00.000Z'
};

test('dashboard summary and charts use stored analysis data', () => {
  const state = {
    scenarios: [scenario],
    impacts: [impact],
    predictions: [prediction],
    recommendations: [],
    audits: []
  };
  const summary = buildDashboardSummary(state);
  const charts = buildDashboardCharts(state);
  assert.equal(summary.success, true);
  assert.equal(summary.executiveSummary.totalScenarios, 1);
  assert.equal(summary.riskRevenueMatrix[0].riskScore, 68);
  assert.equal(summary.o2cImpactHeatmap.length, 2);
  assert.equal(summary.scenariosRequiringAttention[0].mostImpactedArea, 'Billing');
  assert.equal(charts.riskDistribution.reduce((sum, item) => sum + item.value, 0), 1);
});

test('dashboard summary returns empty-state-safe response without fake values', () => {
  const summary = buildDashboardSummary({ scenarios: [], impacts: [], predictions: [], recommendations: [], audits: [] });
  assert.equal(summary.success, true);
  assert.equal(summary.executiveSummary.totalScenarios, 0);
  assert.equal(summary.emptyState.title, 'No scenarios analyzed yet');
  assert.deepEqual(summary.businessModelDistribution, []);
  assert.deepEqual(summary.riskRevenueMatrix, []);
});

test('dashboard summary handles missing prediction data gracefully', () => {
  const summary = buildDashboardSummary({
    scenarios: [scenario],
    impacts: [impact],
    predictions: [],
    recommendations: [],
    audits: []
  });
  assert.equal(summary.success, true);
  assert.equal(summary.executiveSummary.totalScenarios, 1);
  assert.equal(summary.riskRevenueMatrix[0].riskScore, 64);
});

test('impact details enrich O2C rows with reasons, systems and dependencies', () => {
  const details = buildImpactDetails(scenario, impact, prediction);
  assert.equal(details.areaDetails.length, 2);
  assert.ok(details.areaDetails[0].reason.includes('Billing'));
  assert.ok(details.areaDetails[0].affectedSystems.length > 0);
  assert.ok(details.riskMetrics.length >= 6);
});

test('comparison details returns ranking and chart data', () => {
  const details = buildComparisonDetails([{ scenario, impact, prediction }]);
  assert.equal(details.ranking.length, 1);
  assert.equal(details.charts.riskComparison[0].value, 68);
});

test('better model suggestion fails cleanly when AI is not configured', async () => {
  const originalBaseUrl = env.openSourceAi.baseUrl;
  env.openSourceAi.baseUrl = '';
  await assert.rejects(
    generateBetterModelSuggestion({ scenario, impact, prediction, impactDetails: {}, comparisonContext: [] }),
    /AI suggestion service is not configured/
  );
  env.openSourceAi.baseUrl = originalBaseUrl;
});

test('better model suggestion rejects invalid AI JSON after retry', async () => {
  const originalBaseUrl = env.openSourceAi.baseUrl;
  const originalFetch = global.fetch;
  env.openSourceAi.baseUrl = 'http://ai.invalid/v1/chat/completions';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({ choices: [{ message: { content: '{"not":"valid"}' } }] })
  });
  await assert.rejects(
    generateBetterModelSuggestion({ scenario, impact, prediction, impactDetails: {}, comparisonContext: [] }),
    /valid structured JSON/
  );
  global.fetch = originalFetch;
  env.openSourceAi.baseUrl = originalBaseUrl;
});

test('better model suggestion supports no better model found response', async () => {
  const originalBaseUrl = env.openSourceAi.baseUrl;
  const originalFetch = global.fetch;
  const lowRiskScenario = { ...scenario, integrationCount: 3, processComplexity: 3 };
  const lowRiskImpact = { ...impact, implementationEffort: 38, delayProbability: 22, complianceRisk: 31 };
  const lowRiskPrediction = {
    ...prediction,
    predictions: {
      ...prediction.predictions,
      implementationRisk: 34,
      billingComplexity: 42,
      complianceRisk: 30,
      delayProbability: 22,
      operationalEffort: 36,
      downstreamIntegrationImpact: 39
    }
  };
  env.openSourceAi.baseUrl = 'http://ai.valid/v1/chat/completions';
  global.fetch = async () => ({
    ok: true,
    json: async () => ({
      choices: [{
        message: {
          content: JSON.stringify({
            noBetterModelFound: true,
            message: 'The current model appears optimal based on the available impact and prediction data.',
            aiRationale: 'Risk, effort and revenue balance is already favorable.',
            confidence: 0.74
          })
        }
      }]
    })
  });
  const result = await generateBetterModelSuggestion({
    scenario: lowRiskScenario,
    impact: lowRiskImpact,
    prediction: lowRiskPrediction,
    impactDetails: {},
    comparisonContext: []
  });
  assert.equal(result.success, true);
  assert.equal(result.noBetterModelFound, true);
  assert.equal(result.confidence, 0.74);
  global.fetch = originalFetch;
  env.openSourceAi.baseUrl = originalBaseUrl;
});

test('predictive fallback candidates are dynamic and avoid previous suggestions', () => {
  const walletScenario = {
    ...scenario,
    name: 'Prepaid wallet',
    businessModelType: 'Prepaid Wallet / Flexible Funding Model',
    pricingType: 'Prepaid Credit-Based Pricing',
    billingFrequency: 'Real-Time Balance Deduction',
    fundingModel: 'Prepaid',
    bundleType: 'Wallet Credits + Add-on Services',
    integrationCount: 15,
    processComplexity: 8,
    expectedRevenue: 2500000
  };
  const walletPrediction = {
    ...prediction,
    predictions: {
      ...prediction.predictions,
      implementationRisk: 82,
      billingComplexity: 94,
      operationalEffort: 98,
      downstreamIntegrationImpact: 91
    }
  };
  const walletCandidates = candidateScenarios(walletScenario, impact, walletPrediction, []);
  const industrialCandidates = candidateScenarios(scenario, impact, prediction, []);
  assert.ok(walletCandidates.length > 3);
  assert.ok(new Set(walletCandidates.map((item) => `${item.businessModelType}|${item.pricingType}|${item.billingFrequency}`)).size > 3);
  assert.notDeepEqual(
    walletCandidates.slice(0, 3).map((item) => item.businessModelType),
    industrialCandidates.slice(0, 3).map((item) => item.businessModelType)
  );

  const previous = [{ suggestedPayload: walletCandidates[0], status: 'suggested' }];
  const nextCandidates = candidateScenarios(walletScenario, impact, walletPrediction, previous);
  assert.notEqual(
    `${nextCandidates[0].businessModelType}|${nextCandidates[0].pricingType}|${nextCandidates[0].billingFrequency}`,
    `${walletCandidates[0].businessModelType}|${walletCandidates[0].pricingType}|${walletCandidates[0].billingFrequency}`
  );
});

test('customer-friendly reasoning maps technical features to business explanations', () => {
  assert.equal(formatFeatureLabel('processComplexity'), 'Process Complexity');
  const explanation = explainFeatureImpact('processComplexity', 7, 0.6385, scenario, impact, recommendation.rationale);
  assert.equal(explanation.sourceFeature, 'processComplexity');
  assert.match(explanation.title, /Process Complexity/);
  assert.match(explanation.businessMeaning, /7\/10/);
  assert.doesNotMatch(explanation.title, /processComplexity/);
});

test('recommendation view returns complete customer-facing response', () => {
  const view = buildRecommendationView({
    scenarios: [scenario],
    impacts: [impact],
    predictions: [prediction],
    recommendations: [recommendation],
    suggestions: [suggestion],
    scenarioLinks: [],
    audits: []
  }, 's1');
  assert.equal(view.success, true);
  assert.equal(view.recommendationId, 'rec1');
  assert.equal(view.suggestionId, 'sug1');
  assert.equal(view.suggestedScenario.pricingType, 'hybrid');
  assert.equal(view.executiveSummary, suggestion.improvementSummary);
  assert.equal(view.aiRationale, suggestion.aiRationale);
  assert.equal(view.predictiveAnalysis.modelVersion, prediction.modelVersion || 'local-predictive-model');
  assert.equal(view.predictiveAnalysis.predictedOutputs.implementationRisk, 68);
  assert.match(view.predictiveAnalysis.historicalPatternSummary, /historical/i);
  assert.ok(view.predictiveAnalysis.riskDrivers.length > 0);
  assert.equal(view.comparisonRows.length, 15);
  assert.equal(view.comparisonRows.find((row) => row.name === 'Pricing Type').suggested, 'Hybrid Pricing');
  assert.equal(view.comparisonRows.find((row) => row.name === 'Expected Revenue').original, '12M');
  assert.ok(view.comparisonRows.find((row) => row.name === 'Risk Score').changeText);
  assert.ok(view.customerFriendlyReasoning.length > 0);
  assert.ok(view.riskAndBenefitBreakdown.length > 0);
  assert.ok(view.comparisonRows.some((row) => row.name === 'Business Model Type'));
});

test('recommendation view sanitizes malformed stored executive JSON', () => {
  const malformedRecommendation = {
    ...recommendation,
    content: {
      ...recommendation.content,
      executiveSummary: '{"executiveSummary":"Clean executive summary from local AI.","recommendation":"Adopt a phased rollout",',
      businessImpact: '{"businessImpact":"Cleaner business impact text."',
      rationale: '{"rationale":"Cleaner rationale text."'
    }
  };
  const view = buildRecommendationView({
    scenarios: [scenario],
    impacts: [impact],
    predictions: [prediction],
    recommendations: [malformedRecommendation],
    suggestions: [],
    scenarioLinks: [],
    audits: []
  }, 's1');
  assert.equal(view.executiveSummary, 'Clean executive summary from local AI.');
  assert.equal(view.improvementSummary, 'Cleaner business impact text.');
  assert.doesNotMatch(view.executiveSummary, /\{"executiveSummary"/);
});

test('recommendation view returns clear predictive-only state when GenAI is unavailable', () => {
  const unavailableRecommendation = {
    ...recommendation,
    content: {
      source: 'unavailable',
      status: 'GENAI_UNAVAILABLE',
      predictiveOnly: true,
      customerMessage: 'We could not generate a new AI recommendation right now. Predictive impact scores are still available. Please retry after checking the AI service configuration.',
      technicalDetails: 'Connection refused',
      assumptions: []
    }
  };
  const view = buildRecommendationView({
    scenarios: [scenario],
    impacts: [impact],
    predictions: [prediction],
    recommendations: [unavailableRecommendation],
    suggestions: [],
    scenarioLinks: [],
    audits: []
  }, 's1');
  assert.equal(view.success, false);
  assert.equal(view.status, 'GENAI_UNAVAILABLE');
  assert.equal(view.predictiveOnly, true);
  assert.equal(view.recommendationStatus, 'Predictive Analysis Only');
  assert.equal(view.suggestedScenario, null);
  assert.equal(view.predictiveAnalysis.predictedOutputs.implementationRisk, 68);
  assert.match(view.predictiveAnalysis.historicalPatternSummary, /historical/i);
  assert.deepEqual(view.assumptions, []);
  assert.deepEqual(view.comparisonRows, []);
  assert.doesNotMatch(JSON.stringify(view), /open-source AI provider was unavailable/i);
});

test('generateRecommendation returns structured unavailable state instead of fake narrative', async () => {
  const originalBaseUrl = env.openSourceAi.baseUrl;
  env.openSourceAi.baseUrl = '';
  const result = await generateRecommendation({ scenario, impact, prediction: prediction.predictions, comparison: [] });
  assert.equal(result.success, false);
  assert.equal(result.status, 'GENAI_UNAVAILABLE');
  assert.equal(result.predictiveOnly, true);
  assert.equal(result.suggestedScenario, null);
  assert.match(result.customerMessage, /Predictive impact scores and historical analysis are still available/);
  assert.equal(result.executiveSummary, '');
  env.openSourceAi.baseUrl = originalBaseUrl;
});

test('accepting a suggestion creates a linked scenario only once', () => {
  const state = {
    scenarios: [scenario],
    impacts: [impact],
    predictions: [prediction],
    recommendations: [recommendation],
    suggestions: [{ ...suggestion }],
    scenarioLinks: [],
    audits: []
  };
  const first = acceptSuggestionRecord(state, 's1', 'sug1');
  const second = acceptSuggestionRecord(state, 's1', 'sug1');
  assert.equal(first.suggestion.status, 'accepted');
  assert.equal(second.alreadyAccepted, true);
  assert.equal(state.scenarioLinks.length, 1);
});

test('accepting a discarded suggestion returns a controlled error', () => {
  const state = {
    scenarios: [scenario],
    impacts: [impact],
    predictions: [prediction],
    recommendations: [recommendation],
    suggestions: [{ ...suggestion, status: 'discarded' }],
    scenarioLinks: [],
    audits: []
  };
  assert.throws(() => acceptSuggestionRecord(state, 's1', 'sug1'), /discarded/);
});

test('discarding a suggestion updates status for audit-safe UI state', () => {
  const state = {
    scenarios: [scenario],
    impacts: [impact],
    predictions: [prediction],
    recommendations: [recommendation],
    suggestions: [{ ...suggestion }],
    scenarioLinks: [],
    audits: []
  };
  const result = discardSuggestionRecord(state, 's1', 'sug1');
  assert.equal(result.status, 'discarded');
});

test('deleting a scenario removes linked analysis and suggestion records', () => {
  const state = {
    scenarios: [scenario, { ...scenario, id: 's2', name: 'Keep me' }],
    impacts: [impact, { ...impact, scenarioId: 's2' }],
    predictions: [prediction, { ...prediction, scenarioId: 's2' }],
    recommendations: [recommendation, { ...recommendation, id: 'rec2', scenarioId: 's2' }],
    suggestions: [suggestion, { ...suggestion, id: 'sug2', sourceScenarioId: 's2' }],
    scenarioLinks: [{ originalScenarioId: 's1', newScenarioId: 'linked1' }, { originalScenarioId: 's2', newScenarioId: 'linked2' }],
    audits: []
  };
  const result = deleteScenarioRecords(state, 's1');
  assert.equal(result.scenario.name, scenario.name);
  assert.equal(result.counts.scenarios, 1);
  assert.deepEqual(state.scenarios.map((item) => item.id), ['s2']);
  assert.deepEqual(state.impacts.map((item) => item.scenarioId), ['s2']);
  assert.deepEqual(state.predictions.map((item) => item.scenarioId), ['s2']);
  assert.deepEqual(state.recommendations.map((item) => item.scenarioId), ['s2']);
  assert.deepEqual(state.suggestions.map((item) => item.sourceScenarioId), ['s2']);
  assert.deepEqual(state.scenarioLinks.map((item) => item.originalScenarioId), ['s2']);
});
