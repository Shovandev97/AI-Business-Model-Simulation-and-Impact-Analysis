import { clamp, labelize, stateFromScore } from './formatters.js';

const areaSystems = {
  productConfiguration: ['SAP CPQ', 'SAP S/4HANA Product Master'],
  pricing: ['SAP Pricing', 'Condition Contracts'],
  charging: ['Usage Mediation', 'Rating Engine'],
  billing: ['SAP Billing', 'Subscription Billing'],
  invoicing: ['SAP S/4HANA FI-CA', 'Output Management'],
  collections: ['Collections Management', 'Dispute Management'],
  revenueRecognition: ['RAR', 'Universal Journal'],
  reporting: ['SAP Analytics Cloud', 'Data Warehouse'],
  customerService: ['SAP Service Cloud', 'Interaction Center'],
  integrations: ['Integration Suite', 'API Management']
};

function reasonFor(area, scenario, prediction, score) {
  const drivers = [];
  if (scenario.billingFrequency === 'usage-event' || scenario.pricingType === 'usage') drivers.push('usage-event charging cadence');
  if (scenario.integrationCount > 8) drivers.push(`${scenario.integrationCount} integrations`);
  if (scenario.complianceRegions.length > 2) drivers.push(`${scenario.complianceRegions.length} compliance regions`);
  if (scenario.processComplexity > 6) drivers.push(`process complexity ${scenario.processComplexity}/10`);
  if (prediction.billingComplexity > 65 && ['billing', 'charging', 'invoicing'].includes(area)) drivers.push(`predicted billing complexity ${Math.round(prediction.billingComplexity)}`);
  if (prediction.complianceRisk > 60 && area === 'revenueRecognition') drivers.push(`predicted compliance exposure ${Math.round(prediction.complianceRisk)}`);
  return drivers.length
    ? `${labelize(area)} is impacted by ${drivers.join(', ')}.`
    : `${labelize(area)} impact is primarily driven by the selected ${scenario.businessModelType} model and transaction profile.`;
}

function requiredChanges(area, scenario, prediction, score) {
  const changes = [];
  if (score >= 55) changes.push(`Update ${labelize(area)} operating design`);
  if (['charging', 'billing'].includes(area) && prediction.billingComplexity >= 55) changes.push('Validate rating, billing-event and adjustment rules');
  if (area === 'revenueRecognition') changes.push('Confirm revenue recognition treatment and close controls');
  if (area === 'integrations') changes.push('Map upstream/downstream API and data contract changes');
  if (scenario.complianceRegions.length > 1 && ['invoicing', 'reporting', 'revenueRecognition'].includes(area)) changes.push('Review regional compliance and tax reporting requirements');
  return changes.length ? changes : ['Monitor process design during implementation planning'];
}

export function buildImpactDetails(scenario, impact, predictionEnvelope) {
  const prediction = predictionEnvelope?.predictions || predictionEnvelope || {};
  const areaDetails = Object.entries(impact.o2cImpactScores || {}).map(([area, value]) => {
    const score = value.score ?? value;
    const dependencyCount = Math.max(1, Math.round((score / 25) + scenario.integrationCount / 3 + (prediction.dependencyCount || 0) / 12));
    return {
      area,
      label: labelize(area),
      score,
      severity: value.severity,
      state: stateFromScore(score),
      reason: reasonFor(area, scenario, prediction, score),
      affectedSystems: areaSystems[area] || ['SAP S/4HANA'],
      requiredChanges: requiredChanges(area, scenario, prediction, score),
      dependencyCount
    };
  });

  const riskMetrics = [
    { name: 'Implementation Risk', value: clamp(prediction.implementationRisk || impact.complianceRisk), state: stateFromScore(prediction.implementationRisk || impact.complianceRisk) },
    { name: 'Operational Effort', value: clamp(prediction.operationalEffort || impact.implementationEffort), state: stateFromScore(prediction.operationalEffort || impact.implementationEffort) },
    { name: 'Compliance Risk', value: clamp(impact.complianceRisk), state: stateFromScore(impact.complianceRisk) },
    { name: 'Delay Probability', value: clamp(impact.delayProbability), state: stateFromScore(impact.delayProbability) },
    { name: 'Integration Complexity', value: clamp(prediction.downstreamIntegrationImpact || impact.integrationImpactScores?.dataMappingComplexity), state: stateFromScore(prediction.downstreamIntegrationImpact || impact.integrationImpactScores?.dataMappingComplexity) },
    { name: 'Customer Impact', value: clamp((prediction.billingComplexity || 0) * 0.45 + (impact.delayProbability || 0) * 0.35 + scenario.processComplexity * 2), state: stateFromScore((prediction.billingComplexity || 0) * 0.45 + (impact.delayProbability || 0) * 0.35 + scenario.processComplexity * 2) }
  ];

  return {
    scenarioOverview: {
      name: scenario.name,
      businessModelType: scenario.businessModelType,
      industry: scenario.industry,
      region: scenario.region,
      billingFrequency: scenario.billingFrequency,
      contractTerm: scenario.contractTerm,
      transactionVolume: scenario.transactionVolume
    },
    areaDetails,
    riskMetrics,
    predictiveAi: {
      predictedRiskScore: prediction.implementationRisk,
      predictedRevenueImpact: prediction.revenueImpactPct,
      predictedImplementationDelay: prediction.delayProbability,
      predictedComplianceExposure: prediction.complianceRisk,
      confidenceScore: predictionEnvelope?.confidence || impact.confidenceScore,
      topContributingFactors: predictionEnvelope?.topContributingFactors || []
    },
    charts: buildScenarioCharts(scenario, impact, predictionEnvelope),
    generatedAt: new Date().toISOString()
  };
}

export function buildScenarioCharts(scenario, impact, predictionEnvelope) {
  const prediction = predictionEnvelope?.predictions || predictionEnvelope || {};
  const o2c = Object.entries(impact.o2cImpactScores || {}).map(([area, value]) => ({
    label: labelize(area),
    value: value.score ?? value,
    severity: value.severity
  }));
  const severityBreakdown = o2c.reduce((acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  }, {});
  return {
    o2cImpactByArea: o2c,
    riskEffortBreakdown: [
      { label: 'Risk', value: clamp(prediction.implementationRisk || impact.complianceRisk) },
      { label: 'Effort', value: clamp(prediction.operationalEffort || impact.implementationEffort) },
      { label: 'Compliance', value: clamp(impact.complianceRisk) },
      { label: 'Delay', value: clamp(impact.delayProbability) }
    ],
    predictionConfidence: [{ label: 'Confidence', value: clamp((predictionEnvelope?.confidence || impact.confidenceScore || 0) * 100) }],
    dependencyDistribution: [
      { label: 'Interfaces', value: impact.integrationImpactScores?.impactedInterfaces || scenario.integrationCount },
      { label: 'Model Dependencies', value: prediction.dependencyCount || 0 },
      { label: 'Compliance Regions', value: scenario.complianceRegions.length }
    ],
    severityBreakdown: Object.entries(severityBreakdown).map(([label, value]) => ({ label, value }))
  };
}
