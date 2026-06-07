import { average, labelize, stateFromScore } from './formatters.js';
import { scoreScenario } from './comparisonEngine.js';

function findScenario(state, id) {
  return state.scenarios.find((scenario) => scenario.id === id);
}

function severity(score) {
  if (score >= 75) return 'Very High';
  if (score >= 55) return 'High';
  if (score >= 35) return 'Medium';
  return 'Low';
}

function riskLevel(score) {
  if (score >= 75) return 'Critical Risk';
  if (score >= 55) return 'High Risk';
  if (score >= 35) return 'Medium Risk';
  return 'Low Risk';
}

function recommendationStatus(item) {
  const risk = item.predictionValues.implementationRisk || item.impact.complianceRisk || 0;
  if (item.recommendation?.recommendedModel && item.recommendation.recommendedModel !== item.scenario.businessModelType) return 'Opportunity Found';
  if (risk >= 75) return 'High Risk';
  if (risk >= 55) return 'Needs Review';
  return 'Recommended';
}

function latestAnalyses(state) {
  return state.impacts
    .map((impact) => {
      const scenario = findScenario(state, impact.scenarioId);
      const prediction = state.predictions.find((item) => item.scenarioId === impact.scenarioId);
      const recommendation = state.recommendations.find((item) => item.scenarioId === impact.scenarioId);
      const predictionValues = prediction?.predictions || {};
      return { impact, scenario, prediction, predictionValues, recommendation };
    })
    .filter((item) => item.scenario);
}

function mostImpactedArea(impact) {
  return Object.entries(impact.o2cImpactScores || {})
    .map(([area, value]) => ({ area, score: value.score ?? value }))
    .sort((a, b) => b.score - a.score)[0];
}

function topRecommended(analyses) {
  return analyses
    .map((item) => ({
      item,
      score: scoreScenario(item.scenario, item.impact, item.predictionValues)
    }))
    .sort((a, b) => b.score.recommendationScore - a.score.recommendationScore)[0];
}

export function buildDashboardSummary(state) {
  const analyses = latestAnalyses(state);
  const risks = analyses.map((item) => item.predictionValues.implementationRisk || item.impact.complianceRisk || 0);
  const efforts = analyses.map((item) => item.impact.implementationEffort || item.predictionValues.operationalEffort || 0);
  const revenueImpacts = analyses.map((item) => item.impact.revenueImpact || item.predictionValues.revenueImpactPct || 0);
  const avgRisk = average(risks);
  const avgEffort = average(efforts);
  const avgRevenue = average(revenueImpacts);
  const best = topRecommended(analyses);
  const latestRecommendation = analyses[0]?.recommendation;
  const portfolioHealth = analyses.length === 0
    ? 'No Data'
    : avgRisk >= 75
      ? 'High Risk'
      : avgRisk >= 55
        ? 'Needs Review'
        : avgRevenue > 7
          ? 'Opportunity Found'
          : 'Healthy';

  const modelGroups = analyses.reduce((acc, item) => {
    const key = item.scenario.businessModelType;
    acc[key] ||= [];
    acc[key].push(scoreScenario(item.scenario, item.impact, item.predictionValues).recommendationScore);
    return acc;
  }, {});

  const o2cGroups = analyses.reduce((acc, item) => {
    Object.entries(item.impact.o2cImpactScores || {}).forEach(([area, value]) => {
      acc[area] ||= [];
      acc[area].push(value.score ?? value);
    });
    return acc;
  }, {});

  const riskBuckets = ['Low Risk', 'Medium Risk', 'High Risk', 'Critical Risk'].map((level) => ({
    riskLevel: level,
    count: risks.filter((risk) => riskLevel(risk) === level).length
  }));

  const attention = analyses
    .filter((item) => (item.predictionValues.implementationRisk || item.impact.complianceRisk || 0) >= 55 || item.impact.delayProbability >= 55 || item.impact.complianceRisk >= 55)
    .map((item) => {
      const impacted = mostImpactedArea(item.impact);
      return {
        scenarioId: item.scenario.id,
        scenarioName: item.scenario.name,
        businessModelType: item.scenario.businessModelType,
        riskScore: Math.round(item.predictionValues.implementationRisk || item.impact.complianceRisk || 0),
        complianceRisk: Math.round(item.impact.complianceRisk || 0),
        delayProbability: Math.round(item.impact.delayProbability || 0),
        mostImpactedArea: impacted ? labelize(impacted.area) : 'Not available'
      };
    })
    .slice(0, 8);

  return {
    success: true,
    calculatedAt: new Date().toISOString(),
    emptyState: analyses.length === 0 ? {
      title: 'No scenarios analyzed yet',
      message: 'Create and analyze your first business model scenario to see portfolio insights.',
      actionText: 'Create Scenario'
    } : null,
    executiveSummary: {
      totalScenarios: analyses.length,
      portfolioHealth,
      portfolioHealthState: stateFromScore(avgRisk),
      averageRiskScore: avgRisk,
      averageEffortScore: avgEffort,
      averageRevenueImpact: avgRevenue,
      latestRecommendationStatus: latestRecommendation ? recommendationStatus(analyses[0]) : 'No recommendation yet'
    },
    businessModelDistribution: Object.entries(modelGroups).map(([modelType, scores]) => ({
      modelType,
      count: scores.length,
      averageScore: average(scores)
    })),
    riskRevenueMatrix: analyses.map((item) => ({
      scenarioId: item.scenario.id,
      scenarioName: item.scenario.name,
      businessModelType: item.scenario.businessModelType,
      riskScore: Math.round(item.predictionValues.implementationRisk || item.impact.complianceRisk || 0),
      effortScore: Math.round(item.impact.implementationEffort || item.predictionValues.operationalEffort || 0),
      revenueImpact: Number(item.impact.revenueImpact || item.predictionValues.revenueImpactPct || 0),
      transactionVolume: item.scenario.transactionVolume,
      integrationCount: item.scenario.integrationCount
    })),
    o2cImpactHeatmap: Object.entries(o2cGroups).map(([area, scores]) => {
      const averageImpactScore = average(scores);
      return {
        area: labelize(area),
        averageImpactScore,
        severity: severity(averageImpactScore),
        state: stateFromScore(averageImpactScore)
      };
    }).sort((a, b) => b.averageImpactScore - a.averageImpactScore),
    riskDistribution: riskBuckets,
    implementationEffortBreakdown: [
      { area: 'Configuration', averageEffort: average(analyses.map((item) => item.impact.processImpactScores?.quoteToContract || item.impact.implementationEffort || 0)) },
      { area: 'Integration', averageEffort: average(analyses.map((item) => item.impact.integrationImpactScores?.dataMappingComplexity || 0)) },
      { area: 'Testing', averageEffort: average(analyses.map((item) => item.impact.delayProbability || 0)) },
      { area: 'Compliance', averageEffort: average(analyses.map((item) => item.impact.complianceRisk || 0)) },
      { area: 'Data Migration', averageEffort: average(analyses.map((item) => item.impact.integrationImpactScores?.apiChangeRisk || 0)) },
      { area: 'Reporting', averageEffort: average(analyses.map((item) => item.impact.processImpactScores?.revenueClose || 0)) }
    ],
    topRecommendedModel: best ? {
      scenarioId: best.item.scenario.id,
      scenarioName: best.item.scenario.name,
      businessModelType: best.item.scenario.businessModelType,
      recommendationScore: best.score.recommendationScore,
      reasonSummary: best.item.recommendation?.content?.whyThisModel || best.item.recommendation?.rationale || 'Best weighted balance of revenue potential, effort, risk, compliance and downstream complexity.',
      expectedBenefit: `${Number(best.item.impact.revenueImpact || best.item.predictionValues.revenueImpactPct || 0)}% revenue impact with ${Math.round(best.item.impact.implementationEffort || 0)}% implementation effort.`
    } : null,
    scenariosRequiringAttention: attention,
    recentActivity: analyses.slice(0, 8).map((item) => ({
      scenarioId: item.scenario.id,
      scenarioName: item.scenario.name,
      timestamp: item.impact.generatedAt,
      status: riskLevel(item.predictionValues.implementationRisk || item.impact.complianceRisk || 0),
      recommendationStatus: recommendationStatus(item),
      confidenceScore: item.recommendation?.confidence || item.prediction?.confidence || item.impact.confidenceScore || 0
    }))
  };
}

export function buildDashboardCharts(state) {
  const summary = buildDashboardSummary(state);
  return {
    scenarioVolumeTrend: summary.recentActivity.slice().reverse().map((item, index) => ({ label: `Run ${index + 1}`, value: index + 1, scenario: item.scenarioName })),
    riskDistribution: summary.riskDistribution.map((item) => ({ label: item.riskLevel, value: item.count })),
    revenueVsEffort: summary.riskRevenueMatrix.map((item) => ({
      label: item.scenarioName,
      revenueImpact: item.revenueImpact,
      implementationEffort: item.effortScore,
      risk: item.riskScore
    })),
    latestScenarioPerformance: summary.riskRevenueMatrix.slice(-6).map((item) => ({
      label: item.scenarioName,
      revenueImpact: item.revenueImpact,
      risk: item.riskScore,
      effort: item.effortScore
    }))
  };
}
