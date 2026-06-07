const modelWeights = {
  subscription: 1.1,
  'consumption-based': 1.35,
  tiered: 1.2,
  'bundled-services': 1.25,
  'outcome-based': 1.55,
  'flexible-funding': 1.3,
  hybrid: 1.45
};

const areaProfiles = {
  productConfiguration: 0.85,
  pricing: 1.05,
  charging: 1.15,
  billing: 1.2,
  invoicing: 0.95,
  collections: 0.8,
  revenueRecognition: 1.25,
  reporting: 0.9,
  customerService: 0.75,
  integrations: 1.3
};

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function severity(score) {
  if (score >= 75) return 'Very High';
  if (score >= 55) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

export function analyzeImpact(scenario, prediction = {}) {
  const modelFactor = modelWeights[scenario.businessModelType] || 1;
  const volumeFactor = Math.min(18, Math.log10(scenario.transactionVolume + 10) * 3);
  const revenueFactor = Math.min(16, Math.log10(scenario.expectedRevenue + 1000) * 2.2);
  const complianceFactor = scenario.complianceRegions.length * 4;
  const integrationFactor = scenario.integrationCount * 1.4;
  const complexityFactor = scenario.processComplexity * 5;
  const billingFactor = ['usage-event', 'milestone'].includes(scenario.billingFrequency) ? 12 : scenario.billingFrequency === 'monthly' ? 7 : 3;

  const base = (complexityFactor + integrationFactor + complianceFactor + volumeFactor + billingFactor) * modelFactor;
  const o2cImpactScores = Object.fromEntries(
    Object.entries(areaProfiles).map(([area, weight]) => {
      const predictionSignal = Number(prediction.billingComplexity || prediction.downstreamIntegrationImpact || 50) * 0.12;
      const score = clamp(base * weight + revenueFactor + predictionSignal);
      return [area, { score, severity: severity(score) }];
    })
  );

  const complianceRisk = clamp((prediction.complianceRisk ?? 40) * 0.75 + complianceFactor * 4 + (scenario.businessModelType === 'outcome-based' ? 12 : 0));
  const implementationEffort = clamp((prediction.operationalEffort ?? 45) * 0.7 + complexityFactor + integrationFactor);
  const revenueImpact = Number((prediction.revenueImpactPct ?? 0).toFixed ? prediction.revenueImpactPct.toFixed(2) : prediction.revenueImpactPct || 0);
  const delayProbability = clamp((prediction.delayProbability ?? 35) * 0.85 + scenario.integrationCount * 0.8);

  return {
    scenarioId: scenario.id,
    o2cImpactScores,
    systemImpactScores: {
      erp: severity(clamp(base * 0.95)),
      billingPlatform: severity(clamp(base * 1.25)),
      crm: severity(clamp(base * 0.8)),
      dataWarehouse: severity(clamp(base * 0.9)),
      taxEngine: severity(complianceRisk)
    },
    processImpactScores: {
      quoteToContract: clamp(base * 0.9),
      orderCapture: clamp(base * 0.75),
      usageMediation: clamp(base * 1.15),
      invoiceDispute: clamp(base * 0.85),
      revenueClose: clamp(base * 1.05)
    },
    integrationImpactScores: {
      impactedInterfaces: Math.max(1, Math.round(scenario.integrationCount + (prediction.dependencyCount || 0) / 3)),
      dataMappingComplexity: clamp(base * 0.82),
      apiChangeRisk: clamp(base * 0.7 + scenario.integrationCount * 2)
    },
    complianceRisk,
    implementationEffort,
    revenueImpact,
    delayProbability,
    confidenceScore: prediction.confidence || 0.62,
    generatedAt: new Date().toISOString()
  };
}
