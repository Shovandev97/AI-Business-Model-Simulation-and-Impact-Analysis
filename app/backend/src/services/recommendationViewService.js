import { nanoid } from 'nanoid';
import { compareAnalyzedScenarios } from './comparisonEngine.js';

function latestByScenario(state, collection, scenarioId) {
  return state[collection].find((item) => item.scenarioId === scenarioId);
}

function latestSuggestion(state, scenarioId) {
  return state.suggestions.find((item) => item.sourceScenarioId === scenarioId && item.status !== 'discarded') ||
    state.suggestions.find((item) => item.sourceScenarioId === scenarioId);
}

function severityFromScore(score) {
  if (score >= 75) return 'Very High';
  if (score >= 55) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

function recommendationStatus(risk, suggestion) {
  if (suggestion?.status === 'accepted') return 'Accepted';
  if (suggestion?.status === 'discarded') return 'Discarded';
  if (suggestion?.id) return 'Better Alternative Found';
  if (risk >= 75) return 'High Risk';
  if (risk >= 55) return 'Needs Review';
  return 'Recommended';
}

function isGenAiUnavailable(recommendation) {
  const content = recommendation?.content || {};
  const assumptions = Array.isArray(content.assumptions) ? content.assumptions.join(' ') : '';
  return content.predictiveOnly === true ||
    content.status === 'GENAI_UNAVAILABLE' ||
    content.source === 'unavailable' ||
    content.source === 'fallback' ||
    /provider was unavailable|deterministic analysis outputs/i.test(assumptions);
}

function decodeJsonString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

function cleanBusinessText(value, preferredKeys = []) {
  if (value === undefined || value === null) return '';
  if (Array.isArray(value)) return value.map((item) => cleanBusinessText(item, preferredKeys)).filter(Boolean).join(' ');
  if (typeof value === 'object') {
    for (const key of preferredKeys) {
      const selected = cleanBusinessText(value[key], preferredKeys);
      if (selected) return selected;
    }
    return '';
  }
  const text = String(value).trim();
  if (!text) return '';
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text);
      const selected = cleanBusinessText(parsed, preferredKeys);
      if (selected) return selected;
    } catch {
      for (const key of preferredKeys) {
        const match = text.match(new RegExp(`"${key}"\\s*:\\s*"((?:\\\\.|[^"\\\\])*)"`));
        if (match?.[1]) return decodeJsonString(match[1]).trim();
      }
    }
  }
  return text.replace(/\s+/g, ' ');
}

export function formatFeatureLabel(featureName = '') {
  return String(featureName)
    .replace(/^cat__|^num__/, '')
    .replace(/ = /g, ': ')
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\busage-event\b/i, 'Usage Event Based')
    .replace(/\bsubscription\b/i, 'Subscription')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

function formatChoice(value, type) {
  if (value === undefined || value === null || value === '') return '';
  const mapped = {
    businessModelType: {
      subscription: 'Subscription',
      'consumption-based': 'Consumption Based',
      tiered: 'Tiered',
      'bundled-services': 'Bundled Services',
      'outcome-based': 'Outcome Based',
      'flexible-funding': 'Flexible Funding',
      hybrid: 'Hybrid'
    },
    pricingType: {
      flat: 'Flat Pricing',
      tiered: 'Tiered Pricing',
      usage: 'Usage Based',
      outcome: 'Outcome Based',
      bundle: 'Bundled Pricing',
      hybrid: 'Hybrid Pricing'
    },
    billingFrequency: {
      monthly: 'Monthly',
      quarterly: 'Quarterly',
      annual: 'Annual',
      milestone: 'Milestone Based',
      'usage-event': 'Usage Event Based'
    },
    fundingModel: {
      capex: 'Capex',
      opex: 'Opex',
      mixed: 'Mixed',
      'partner-funded': 'Partner Funded',
      'customer-funded': 'Customer Funded'
    }
  };
  return mapped[type]?.[value] || formatFeatureLabel(String(value));
}

function formatCompactNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return value === undefined || value === null ? '' : String(value);
  const abs = Math.abs(number);
  if (abs >= 1_000_000) return `${Number((number / 1_000_000).toFixed(2))}M`;
  if (abs >= 1_000) return `${Number((number / 1_000).toFixed(1))}K`;
  return String(Number(number.toFixed(2)));
}

function formatPercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '';
  return `${Number(number.toFixed(2))}%`;
}

function formatComparisonValue(name, value) {
  if (Array.isArray(value)) return value.join(', ');
  const formatters = {
    'Business Model Type': (item) => formatChoice(item, 'businessModelType'),
    'Pricing Type': (item) => formatChoice(item, 'pricingType'),
    'Billing Frequency': (item) => formatChoice(item, 'billingFrequency'),
    'Funding Model': (item) => formatChoice(item, 'fundingModel'),
    'Contract Term': (item) => `${item} months`,
    'Transaction Volume': formatCompactNumber,
    'Expected Revenue': formatCompactNumber,
    'Risk Score': formatPercent,
    'Effort Score': formatPercent,
    'Revenue Impact': formatPercent,
    'Delay Probability': formatPercent,
    'Compliance Risk': formatPercent
  };
  return (formatters[name] || ((item) => String(item ?? '')))(value);
}

function buildDelta(name, original, suggested) {
  const originalNumber = Number(original);
  const suggestedNumber = Number(suggested);
  if (!Number.isFinite(originalNumber) || !Number.isFinite(suggestedNumber)) {
    return { changeText: '', changeState: 'None' };
  }
  const delta = Number((suggestedNumber - originalNumber).toFixed(2));
  if (delta === 0) return { changeText: 'No change', changeState: 'None' };
  const lowerIsBetter = ['Risk Score', 'Effort Score', 'Delay Probability', 'Compliance Risk', 'Integration Count', 'Process Complexity'].includes(name);
  const higherIsBetter = ['Revenue Impact', 'Expected Revenue'].includes(name);
  const improved = (lowerIsBetter && delta < 0) || (higherIsBetter && delta > 0);
  const prefix = delta > 0 ? '+' : '';
  const unit = ['Risk Score', 'Effort Score', 'Revenue Impact', 'Delay Probability', 'Compliance Risk'].includes(name) ? '%' : '';
  return {
    changeText: `${prefix}${delta}${unit}`,
    changeState: improved ? 'Success' : 'Warning'
  };
}

function featureKey(featureName = '') {
  return String(featureName).replace(/^cat__|^num__/, '').split(' = ')[0];
}

export function explainFeatureImpact(featureName, featureValue, importanceScore, scenario, impactResult, aiRationale = '') {
  const key = featureKey(featureName);
  const importance = Number(importanceScore || 0);
  const impactArea = {
    processComplexity: 'Implementation Effort / O2C Complexity',
    integrationCount: 'Downstream Integration Risk',
    complianceRegionCount: 'Compliance / Rollout Risk',
    billingFrequency: 'Billing Operations',
    businessModelType: 'Commercial Model Strategy',
    transactionVolume: 'Operational Scale',
    expectedRevenue: 'Revenue Opportunity'
  }[key] || 'Business Model Impact';
  const severity = severityFromScore(Math.min(100, importance * 140));

  const definitions = {
    processComplexity: {
      title: 'Process Complexity is a major decision driver',
      businessMeaning: `This scenario has process complexity ${scenario.processComplexity}/10, which can increase configuration effort, testing scope and downstream O2C risk.`,
      whyItMatters: `Complex processes usually require more validation, exception handling and cross-team coordination. Current implementation effort is ${Math.round(impactResult.implementationEffort || 0)}%.`
    },
    integrationCount: {
      title: 'Integration volume increases downstream dependency risk',
      businessMeaning: `This scenario touches ${scenario.integrationCount} integrations, so the AI expects more coordination across charging, billing, invoicing, reporting and revenue recognition.`,
      whyItMatters: `Every integration adds data mapping, interface testing and cutover dependency. The current integration impact is ${impactResult.integrationImpactScores?.impactedInterfaces || scenario.integrationCount} impacted interfaces.`
    },
    complianceRegionCount: {
      title: 'Compliance coverage increases rollout risk',
      businessMeaning: `The scenario applies across ${scenario.complianceRegions?.length || 0} compliance region(s): ${(scenario.complianceRegions || []).join(', ')}.`,
      whyItMatters: `Regional tax, invoicing, data handling and commercial rules can increase validation effort. Current compliance risk is ${Math.round(impactResult.complianceRisk || 0)}%.`
    },
    billingFrequency: {
      title: 'Billing cadence influences operational complexity',
      businessMeaning: `${formatFeatureLabel(featureName)} affects rating, billing cycles, reconciliation and exception handling.`,
      whyItMatters: `More frequent or event-based billing usually needs stronger mediation, charging accuracy and dispute controls. Current delay probability is ${Math.round(impactResult.delayProbability || 0)}%.`
    },
    businessModelType: {
      title: 'Commercial model structure influences revenue and lifecycle effort',
      businessMeaning: `${formatFeatureLabel(featureName)} shapes revenue predictability, contract lifecycle handling, billing design and customer operations.`,
      whyItMatters: `The model choice influences pricing, renewals, upgrades, cancellations, revenue recognition and reporting complexity.`
    },
    transactionVolume: {
      title: 'Transaction volume drives operational scale',
      businessMeaning: `The scenario volume is ${scenario.transactionVolume}, which affects billing throughput, reconciliation load and operational monitoring.`,
      whyItMatters: `Higher volume increases the need for automation, exception handling and performance validation.`
    },
    expectedRevenue: {
      title: 'Revenue opportunity changes the implementation trade-off',
      businessMeaning: `Expected revenue is ${scenario.expectedRevenue}, so the implementation effort should be weighed against measurable commercial upside.`,
      whyItMatters: `Large revenue opportunities can justify higher implementation effort when compliance and O2C risks are managed.`
    }
  };

  const fallback = {
    title: `${formatFeatureLabel(featureName)} influences the recommendation`,
    businessMeaning: `The predictive model identified ${formatFeatureLabel(featureName)} as a contributor based on this scenario and historical patterns.`,
    whyItMatters: aiRationale || 'This factor affects the balance of revenue opportunity, risk, effort and downstream O2C complexity.'
  };
  const selected = definitions[key] || fallback;
  return {
    ...selected,
    impactArea,
    severity,
    sourceFeature: featureName,
    featureValue,
    importanceScore: Number(importance.toFixed(4))
  };
}

export function buildCustomerFriendlyReasoning({ scenario, impact, prediction, recommendation, suggestion }) {
  const factors = prediction?.topContributingFactors || recommendation?.keyDrivers || [];
  return factors.slice(0, 6).map((factor) => explainFeatureImpact(
    factor.factor,
    scenario[featureKey(factor.factor)],
    factor.importance,
    scenario,
    impact,
    recommendation?.rationale || suggestion?.aiRationale || ''
  ));
}

export function buildPredictiveAnalysis(scenario, impact, prediction) {
  const values = prediction?.predictions || prediction || {};
  const factors = prediction?.topContributingFactors || [];
  const training = prediction?.trainingMetadata || {};
  const modelVersion = prediction?.modelVersion || training.modelVersion || 'local-predictive-model';
  const confidence = prediction?.confidence || impact?.confidenceScore || 0;
  const strongestDrivers = factors.slice(0, 3).map((factor) => formatFeatureLabel(factor.factor));
  const driverText = strongestDrivers.length
    ? strongestDrivers.join(', ')
    : 'the scenario complexity, integration scope and commercial model inputs';
  const metrics = [
    ['implementation risk', values.implementationRisk ?? impact?.complianceRisk],
    ['billing complexity', values.billingComplexity],
    ['delay probability', values.delayProbability ?? impact?.delayProbability],
    ['downstream integration impact', values.downstreamIntegrationImpact]
  ];
  const metricParts = metrics
    .filter(([, value]) => Number.isFinite(Number(value)))
    .map(([label, value]) => `${label} ${formatPercent(value)}`);
  const trainingText = training.trainingRows
    ? `The model was trained on ${formatCompactNumber(training.trainingRows)} synthetic historical commercial-model records`
    : 'The model uses the locally trained synthetic historical commercial-model dataset';
  const qualityText = training.metrics?.r2 !== undefined
    ? ` with validation R2 ${Number(training.metrics.r2).toFixed(2)}.`
    : '.';

  return {
    modelVersion,
    confidence,
    historicalPatternSummary: `${trainingText}${qualityText} For ${scenario.businessModelType || 'this model'}, historical patterns point to ${driverText} as the main drivers.${metricParts.length ? ` Current predictive outputs indicate ${metricParts.join(', ')}.` : ''}`,
    riskDrivers: factors.slice(0, 6).map((factor) => explainFeatureImpact(
      factor.factor,
      scenario[featureKey(factor.factor)],
      factor.importance,
      scenario,
      impact,
      ''
    )),
    topContributingFactors: factors,
    predictedOutputs: values
  };
}

function buildComparisonRows(originalScenario, suggestedScenario, originalPrediction, suggestedPrediction, originalImpact, suggestedImpact) {
  if (!suggestedScenario) return [];
  const originalValues = originalPrediction?.predictions || originalPrediction || {};
  const suggestedValues = suggestedPrediction?.predictions || suggestedPrediction || {};
  const rows = [
    ['Business Model Type', originalScenario?.businessModelType, suggestedScenario?.businessModelType],
    ['Pricing Type', originalScenario?.pricingType, suggestedScenario?.pricingType],
    ['Billing Frequency', originalScenario?.billingFrequency, suggestedScenario?.billingFrequency],
    ['Funding Model', originalScenario?.fundingModel, suggestedScenario?.fundingModel],
    ['Contract Term', originalScenario?.contractTerm, suggestedScenario?.contractTerm],
    ['Transaction Volume', originalScenario?.transactionVolume, suggestedScenario?.transactionVolume],
    ['Expected Revenue', originalScenario?.expectedRevenue, suggestedScenario?.expectedRevenue],
    ['Compliance Regions', (originalScenario?.complianceRegions || []).join(', '), (suggestedScenario?.complianceRegions || []).join(', ')],
    ['Integration Count', originalScenario?.integrationCount, suggestedScenario?.integrationCount],
    ['Process Complexity', originalScenario?.processComplexity, suggestedScenario?.processComplexity],
    ['Risk Score', originalValues.implementationRisk, suggestedValues.implementationRisk],
    ['Effort Score', originalImpact?.implementationEffort, suggestedImpact?.implementationEffort],
    ['Revenue Impact', originalImpact?.revenueImpact, suggestedImpact?.revenueImpact],
    ['Delay Probability', originalImpact?.delayProbability, suggestedImpact?.delayProbability],
    ['Compliance Risk', originalImpact?.complianceRisk ?? originalValues.complianceRisk, suggestedImpact?.complianceRisk ?? suggestedValues.complianceRisk]
  ];
  return rows.map(([name, original, suggested]) => ({
    name,
    originalRaw: original,
    suggestedRaw: suggested,
    original: formatComparisonValue(name, original),
    suggested: formatComparisonValue(name, suggested),
    ...buildDelta(name, original, suggested)
  }));
}

function buildRiskBreakdown(impact, prediction, suggestion) {
  const values = prediction?.predictions || prediction || {};
  if (!suggestion) {
    return [
      { label: 'Implementation Risk', value: values.implementationRisk ?? impact?.complianceRisk ?? 0, unit: '%', source: 'Predictive AI' },
      { label: 'Revenue Impact', value: impact?.revenueImpact ?? values.revenueImpactPct ?? 0, unit: '%', source: 'Predictive AI / impact engine' },
      { label: 'Implementation Effort', value: impact?.implementationEffort ?? values.operationalEffort ?? 0, unit: '%', source: 'Impact engine' },
      { label: 'Delay Probability', value: impact?.delayProbability ?? values.delayProbability ?? 0, unit: '%', source: 'Predictive AI / impact engine' },
      { label: 'Compliance Risk', value: impact?.complianceRisk ?? values.complianceRisk ?? 0, unit: '%', source: 'Impact engine' },
      { label: 'Confidence', value: Math.round((prediction?.confidence || impact?.confidenceScore || 0) * 100), unit: '%', source: 'Predictive AI' }
    ];
  }
  return [
    { label: 'Risk Reduction', value: suggestion?.riskReduction ?? 0, unit: '%', source: 'Suggested model comparison' },
    { label: 'Revenue Improvement', value: suggestion?.revenueImprovement ?? impact?.revenueImpact ?? values.revenueImpactPct ?? 0, unit: '%', source: 'Predictive AI / impact engine' },
    { label: 'Effort Change', value: suggestion?.effortChange ?? 0, unit: '%', source: 'Suggested model comparison' },
    { label: 'Delay Reduction', value: suggestion?.expectedBenefits?.delayReduction ?? 0, unit: '%', source: 'Suggested model comparison' },
    { label: 'O2C Impact Areas', value: Object.keys(impact?.o2cImpactScores || {}).length, unit: 'areas', source: 'Impact engine' },
    { label: 'Confidence', value: Math.round((suggestion?.confidence || prediction?.confidence || impact?.confidenceScore || 0) * 100), unit: '%', source: 'Predictive AI / GenAI' }
  ];
}

export function buildRecommendationView(state, scenarioId) {
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) {
    const error = new Error('Scenario not found.');
    error.status = 404;
    error.errorCode = 'SCENARIO_NOT_FOUND';
    throw error;
  }
  const impact = latestByScenario(state, 'impacts', scenarioId);
  const prediction = latestByScenario(state, 'predictions', scenarioId);
  const recommendation = latestByScenario(state, 'recommendations', scenarioId);
  if (!impact || !prediction || !recommendation) {
    const error = new Error('Run impact analysis before viewing the AI recommendation.');
    error.status = 404;
    error.errorCode = 'RECOMMENDATION_NOT_FOUND';
    throw error;
  }
  const suggestion = latestSuggestion(state, scenarioId);
  const suggestedScenario = suggestion?.suggestedPayload || null;
  const suggestedPrediction = suggestion?.suggestedPrediction || null;
  const suggestedImpact = suggestion?.suggestedImpact || null;
  const originalPredictionValues = prediction.predictions || prediction;
  const genAiUnavailable = isGenAiUnavailable(recommendation);
  const predictiveAnalysis = buildPredictiveAnalysis(scenario, impact, prediction);
  const recommendedModel = genAiUnavailable ? '' : suggestion?.suggestedPayload?.businessModelType || recommendation.recommendedModel || scenario.businessModelType;
  const status = genAiUnavailable ? 'Predictive Analysis Only' : recommendationStatus(originalPredictionValues.implementationRisk || impact.complianceRisk || 0, suggestion);
  const customerFriendlyReasoning = genAiUnavailable ? [] : buildCustomerFriendlyReasoning({ scenario, impact, prediction, recommendation, suggestion });
  const originalScore = compareAnalyzedScenarios([{ scenario, impact, prediction: originalPredictionValues }])[0];
  const suggestedScore = suggestedScenario && suggestedImpact && suggestedPrediction
    ? compareAnalyzedScenarios([{ scenario: { id: 'suggestion-preview', ...suggestedScenario }, impact: suggestedImpact, prediction: suggestedPrediction.predictions || suggestedPrediction }])[0]
    : null;
  const executiveSummary = suggestion?.improvementSummary ||
    cleanBusinessText(recommendation.content?.executiveSummary || recommendation.rationale, ['executiveSummary', 'summary', 'recommendation']);
  const businessImpact = suggestion?.improvementSummary ||
    cleanBusinessText(recommendation.content?.businessImpact, ['businessImpact', 'impact', 'executiveSummary']);
  const aiRationale = suggestion?.aiRationale ||
    cleanBusinessText(recommendation.rationale || recommendation.content?.rationale, ['rationale', 'whyThisModel', 'recommendation']);
  const implementationConsiderations = cleanBusinessText(
    recommendation.content?.implementationConsiderations,
    ['implementationConsiderations', 'implementationNotes', 'recommendation']
  );

  return {
    success: !genAiUnavailable,
    status: genAiUnavailable ? 'GENAI_UNAVAILABLE' : 'READY',
    message: genAiUnavailable ? 'AI recommendation is temporarily unavailable.' : undefined,
    customerMessage: genAiUnavailable
      ? 'We could not generate a new AI recommendation right now. Predictive impact scores and historical analysis are still available. Please retry after checking the AI service configuration.'
      : undefined,
    technicalDetails: genAiUnavailable ? recommendation.content?.technicalDetails : undefined,
    predictiveOnly: genAiUnavailable,
    recommendationId: recommendation.id || nanoid(),
    suggestionId: suggestion?.id || null,
    suggestionStatus: suggestion?.status || null,
    sourceScenarioId: scenario.id,
    originalScenario: scenario,
    suggestedScenario,
    originalPrediction: prediction,
    suggestedPrediction,
    executiveSummary: genAiUnavailable ? '' : executiveSummary,
    recommendedModel,
    recommendationStatus: status,
    confidence: recommendation.confidence || suggestion?.confidence || prediction.confidence || impact.confidenceScore || 0,
    predictiveAnalysis,
    improvementSummary: genAiUnavailable ? '' : businessImpact,
    aiRationale: genAiUnavailable ? '' : aiRationale,
    expectedBenefits: suggestion?.expectedBenefits || {
      revenueImprovement: impact.revenueImpact || originalPredictionValues.revenueImpactPct || 0,
      riskReduction: 0,
      effortChange: 0,
      delayReduction: 0
    },
    businessDrivers: customerFriendlyReasoning.map((item) => item.title),
    riskAndBenefitBreakdown: buildRiskBreakdown(impact, prediction, suggestion),
    o2cImpactChanges: suggestion?.o2cImpactChanges || Object.entries(impact.o2cImpactScores || {}).map(([area, value]) => ({
      area,
      currentImpact: value.score ?? value,
      severity: value.severity
    })),
    tradeOffs: genAiUnavailable ? [] : suggestion?.tradeOffs?.length ? suggestion.tradeOffs : [implementationConsiderations].filter(Boolean),
    assumptions: genAiUnavailable ? [] : suggestion?.assumptions || recommendation.content?.assumptions || [],
    customerFriendlyReasoning,
    comparisonRows: buildComparisonRows(scenario, suggestedScenario, prediction, suggestedPrediction, impact, suggestedImpact),
    originalScore,
    suggestedScore,
    acceptedScenarioId: suggestion?.suggestedScenarioId || null,
    audit: {
      generatedAt: recommendation.generatedAt,
      model: recommendation.content?.model || suggestion?.model || null,
      promptVersion: recommendation.content?.promptVersion || suggestion?.promptVersion || null
    }
  };
}
