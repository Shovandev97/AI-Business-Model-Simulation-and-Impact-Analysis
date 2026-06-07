export function scoreScenario(scenario, impact, prediction) {
  const revenueScore = Math.max(0, Math.min(100, 50 + Number(impact.revenueImpact || 0) * 2));
  const effortPenalty = Number(impact.implementationEffort || prediction.operationalEffort || 50);
  const riskPenalty = Number(prediction.implementationRisk || impact.complianceRisk || 50);
  const compliancePenalty = Number(impact.complianceRisk || 50);
  const complexityPenalty = Number(prediction.downstreamIntegrationImpact || 50);
  const recommendationScore = Math.round(
    revenueScore * 0.34 +
      (100 - effortPenalty) * 0.2 +
      (100 - riskPenalty) * 0.22 +
      (100 - compliancePenalty) * 0.12 +
      (100 - complexityPenalty) * 0.12
  );
  return {
    scenarioId: scenario.id,
    name: scenario.name,
    businessModelType: scenario.businessModelType,
    revenuePotential: Math.round(revenueScore),
    implementationEffort: Math.round(effortPenalty),
    risk: Math.round(riskPenalty),
    compliance: Math.round(compliancePenalty),
    downstreamComplexity: Math.round(complexityPenalty),
    recommendationScore
  };
}

export function compareAnalyzedScenarios(items) {
  return items
    .map(({ scenario, impact, prediction }) => scoreScenario(scenario, impact, prediction))
    .sort((a, b) => b.recommendationScore - a.recommendationScore)
    .map((item, index) => ({ ...item, rank: index + 1 }));
}
