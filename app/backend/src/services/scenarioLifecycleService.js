export function deleteScenarioRecords(state, scenarioId) {
  const scenario = state.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) {
    const error = new Error('Scenario not found.');
    error.status = 404;
    throw error;
  }
  const counts = {
    scenarios: 1,
    impacts: state.impacts.filter((item) => item.scenarioId === scenarioId).length,
    predictions: state.predictions.filter((item) => item.scenarioId === scenarioId).length,
    recommendations: state.recommendations.filter((item) => item.scenarioId === scenarioId).length,
    suggestions: state.suggestions.filter((item) => item.sourceScenarioId === scenarioId || item.suggestedScenarioId === scenarioId).length,
    scenarioLinks: state.scenarioLinks.filter((item) => item.originalScenarioId === scenarioId || item.newScenarioId === scenarioId).length
  };
  state.scenarios = state.scenarios.filter((item) => item.id !== scenarioId);
  state.impacts = state.impacts.filter((item) => item.scenarioId !== scenarioId);
  state.predictions = state.predictions.filter((item) => item.scenarioId !== scenarioId);
  state.recommendations = state.recommendations.filter((item) => item.scenarioId !== scenarioId);
  state.suggestions = state.suggestions.filter((item) => item.sourceScenarioId !== scenarioId && item.suggestedScenarioId !== scenarioId);
  state.scenarioLinks = state.scenarioLinks.filter((item) => item.originalScenarioId !== scenarioId && item.newScenarioId !== scenarioId);
  return { scenario, counts, remainingScenarioCount: state.scenarios.length };
}
