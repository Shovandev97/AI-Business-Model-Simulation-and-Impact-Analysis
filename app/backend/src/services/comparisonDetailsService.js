import { compareAnalyzedScenarios } from './comparisonEngine.js';
import { labelize } from './formatters.js';

function avgO2C(impact) {
  const values = Object.values(impact.o2cImpactScores || {}).map((item) => item.score ?? item);
  return values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
}

export function buildComparisonDetails(items) {
  const ranking = compareAnalyzedScenarios(items.map((item) => ({
    scenario: item.scenario,
    impact: item.impact,
    prediction: item.prediction.predictions || item.prediction
  })));
  const rows = ranking.map((ranked) => {
    const source = items.find((item) => item.scenario.id === ranked.scenarioId);
    const prediction = source.prediction.predictions || source.prediction;
    return {
      ...ranked,
      revenueImpact: Number(source.impact.revenueImpact || prediction.revenueImpactPct || 0),
      delayProbability: Math.round(source.impact.delayProbability || prediction.delayProbability || 0),
      dependencyCount: prediction.dependencyCount || source.impact.integrationImpactScores?.impactedInterfaces || 0,
      o2cAverageImpact: avgO2C(source.impact),
      impactedInterfaces: source.impact.integrationImpactScores?.impactedInterfaces || 0
    };
  });
  const best = rows[0];
  const charts = {
    revenueImpactComparison: rows.map((row) => ({ label: row.name, value: row.revenueImpact })),
    riskComparison: rows.map((row) => ({ label: row.name, value: row.risk })),
    effortRevenue: rows.map((row) => ({ label: row.name, effort: row.implementationEffort, revenueImpact: row.revenueImpact, score: row.recommendationScore })),
    complianceExposure: rows.map((row) => ({ label: row.name, value: row.compliance })),
    dependencyCountComparison: rows.map((row) => ({ label: row.name, value: row.dependencyCount })),
    o2cImpactComparison: items.flatMap((item) => Object.entries(item.impact.o2cImpactScores || {}).map(([area, value]) => ({
      scenario: item.scenario.name,
      label: labelize(area),
      value: value.score ?? value
    })))
  };
  return {
    ranking: rows,
    bestFitRecommendation: best ? `${best.name} ranks highest for weighted revenue, risk, effort, compliance and downstream complexity.` : '',
    tradeOffExplanation: rows.length > 1
      ? 'Use the ranking with risk, effort, delay, compliance and dependency views to choose the model that best matches implementation capacity and revenue appetite.'
      : 'Add at least two scenarios to evaluate trade-offs.',
    charts,
    generatedAt: new Date().toISOString()
  };
}
