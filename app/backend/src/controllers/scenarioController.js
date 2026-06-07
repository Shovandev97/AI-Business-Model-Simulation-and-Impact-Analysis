import { nanoid } from 'nanoid';
import { validateScenario } from '../services/scenarioValidator.js';
import { mutateStore, readStore } from '../store/jsonStore.js';
import { audit } from '../services/auditService.js';
import { predictScenario } from '../services/mlClient.js';
import { analyzeImpact } from '../services/impactEngine.js';
import { compareAnalyzedScenarios } from '../services/comparisonEngine.js';
import { generateRecommendation } from '../services/genAiService.js';
import { buildImpactDetails, buildScenarioCharts } from '../services/impactDetailsService.js';
import { buildDashboardCharts, buildDashboardSummary } from '../services/dashboardService.js';
import { buildSuggestion, acceptSuggestionRecord, discardSuggestionRecord } from '../services/suggestionService.js';
import { buildComparisonDetails } from '../services/comparisonDetailsService.js';
import { scenarioFieldReferenceData } from '../services/referenceDataService.js';
import { buildPredictiveAnalysis, buildRecommendationView } from '../services/recommendationViewService.js';
import { deleteScenarioRecords } from '../services/scenarioLifecycleService.js';

export async function createScenario(req, res, next) {
  try {
    const payload = validateScenario(req.body);
    const now = new Date().toISOString();
    const scenario = { id: nanoid(), ...payload, createdAt: now, updatedAt: now };
    await mutateStore((state) => state.scenarios.unshift(scenario));
    await audit('SCENARIO_CREATED', { request: payload, response: { scenarioId: scenario.id } });
    res.status(201).json(scenario);
  } catch (error) {
    next(error);
  }
}

export async function listScenarios(req, res, next) {
  try {
    const state = await readStore();
    res.json(state.scenarios);
  } catch (error) {
    next(error);
  }
}

export async function getScenario(req, res, next) {
  try {
    const state = await readStore();
    const scenario = state.scenarios.find((item) => item.id === req.params.id);
    if (!scenario) return res.status(404).json({ error: 'NotFound', message: 'Scenario not found.' });
    res.json(scenario);
  } catch (error) {
    next(error);
  }
}

export async function deleteScenario(req, res, next) {
  try {
    const scenarioId = req.params.id;
    const result = await mutateStore((state) => deleteScenarioRecords(state, scenarioId));
    await audit('SCENARIO_DELETED', {
      request: { scenarioId },
      response: {
        scenarioId,
        scenarioName: result.scenario.name,
        deletedRecords: result.counts,
        remainingScenarioCount: result.remainingScenarioCount
      }
    });
    res.json({
      success: true,
      scenarioId,
      scenarioName: result.scenario.name,
      deletedRecords: result.counts,
      remainingScenarioCount: result.remainingScenarioCount,
      message: `Scenario "${result.scenario.name}" was deleted.`
    });
  } catch (error) {
    next(error);
  }
}

export async function analyzeScenarioRecord(scenario) {
  const prediction = await predictScenario(scenario);
  const impact = analyzeImpact(scenario, prediction.predictions || prediction);
  return { scenario, prediction, impact };
}

export async function analyzeScenario(req, res, next) {
  try {
    const state = await readStore();
    const scenario = state.scenarios.find((item) => item.id === req.params.id);
    if (!scenario) return res.status(404).json({ error: 'NotFound', message: 'Scenario not found.' });

    const current = await analyzeScenarioRecord(scenario);
    const compared = compareAnalyzedScenarios([{ scenario, impact: current.impact, prediction: current.prediction.predictions || current.prediction }]);
    const predictiveAnalysis = buildPredictiveAnalysis(scenario, current.impact, current.prediction);
    const recommendation = await generateRecommendation({
      scenario,
      impact: current.impact,
      prediction: current.prediction,
      predictiveAnalysis,
      comparison: compared
    });
    const aiRecommendation = {
      id: nanoid(),
      scenarioId: scenario.id,
      recommendedModel: compared[0]?.businessModelType || scenario.businessModelType,
      rationale: recommendation.rationale || recommendation.executiveSummary,
      keyDrivers: current.prediction.topContributingFactors || [],
      risks: recommendation.risks || [],
      alternativesCompared: compared,
      confidence: current.prediction.confidence || current.prediction.predictions?.confidence || 0.6,
      generatedAt: recommendation.generatedAt,
      content: recommendation
    };

    await mutateStore((mutable) => {
      mutable.predictions = mutable.predictions.filter((item) => item.scenarioId !== scenario.id);
      mutable.impacts = mutable.impacts.filter((item) => item.scenarioId !== scenario.id);
      mutable.recommendations = mutable.recommendations.filter((item) => item.scenarioId !== scenario.id);
      mutable.predictions.unshift({ scenarioId: scenario.id, ...current.prediction });
      mutable.impacts.unshift(current.impact);
      mutable.recommendations.unshift(aiRecommendation);
    });
    await audit('SCENARIO_ANALYZED', {
      modelVersion: current.prediction.modelVersion,
      promptVersion: recommendation.promptVersion,
      request: { scenarioId: scenario.id },
      response: { impact: current.impact, prediction: current.prediction, recommendation: aiRecommendation }
    });

    res.json({ scenario, impact: current.impact, prediction: current.prediction, comparison: compared, recommendation: aiRecommendation });
  } catch (error) {
    next(error);
  }
}

export async function compareScenarios(req, res, next) {
  try {
    const ids = Array.isArray(req.body.scenarioIds) ? req.body.scenarioIds : [];
    const state = await readStore();
    const selected = state.scenarios.filter((item) => ids.includes(item.id));
    if (selected.length < 2) {
      return res.status(400).json({ error: 'RequestError', message: 'Provide at least two scenarioIds.' });
    }
    const analyzed = await Promise.all(selected.map(analyzeScenarioRecord));
    const comparison = compareAnalyzedScenarios(analyzed.map((item) => ({
      scenario: item.scenario,
      impact: item.impact,
      prediction: item.prediction.predictions || item.prediction
    })));
    await audit('SCENARIOS_COMPARED', { request: { scenarioIds: ids }, response: comparison });
    res.json({ comparison, analyzed });
  } catch (error) {
    next(error);
  }
}

export async function compareScenarioDetails(req, res, next) {
  try {
    const ids = Array.isArray(req.body.scenarioIds) ? req.body.scenarioIds : [];
    const state = await readStore();
    const selected = state.scenarios.filter((item) => ids.includes(item.id));
    if (selected.length < 2) {
      return res.status(400).json({ error: 'RequestError', message: 'Provide at least two scenarioIds.' });
    }
    const analyzed = await Promise.all(selected.map(async (scenario) => {
      const storedImpact = state.impacts.find((item) => item.scenarioId === scenario.id);
      const storedPrediction = state.predictions.find((item) => item.scenarioId === scenario.id);
      if (storedImpact && storedPrediction) return { scenario, impact: storedImpact, prediction: storedPrediction };
      return analyzeScenarioRecord(scenario);
    }));
    const details = buildComparisonDetails(analyzed);
    await audit('SCENARIOS_COMPARED_DETAILS', { request: { scenarioIds: ids }, response: details });
    res.json({ ...details, analyzed });
  } catch (error) {
    next(error);
  }
}

export async function getImpact(req, res, next) {
  try {
    const state = await readStore();
    const impact = state.impacts.find((item) => item.scenarioId === req.params.id);
    if (!impact) return res.status(404).json({ error: 'NotFound', message: 'Impact result not found. Run analysis first.' });
    res.json(impact);
  } catch (error) {
    next(error);
  }
}

export async function getPrediction(req, res, next) {
  try {
    const state = await readStore();
    const prediction = state.predictions.find((item) => item.scenarioId === req.params.id);
    if (!prediction) return res.status(404).json({ error: 'NotFound', message: 'Prediction not found. Run analysis first.' });
    res.json(prediction);
  } catch (error) {
    next(error);
  }
}

export async function getRecommendation(req, res, next) {
  try {
    const state = await readStore();
    res.json(buildRecommendationView(state, req.params.id));
  } catch (error) {
    next(error);
  }
}

export async function regenerateRecommendation(req, res, next) {
  try {
    const state = await readStore();
    const scenario = state.scenarios.find((item) => item.id === req.params.id);
    const impact = state.impacts.find((item) => item.scenarioId === req.params.id);
    const prediction = state.predictions.find((item) => item.scenarioId === req.params.id);
    if (!scenario || !impact || !prediction) {
      return res.status(404).json({ success: false, errorCode: 'ANALYSIS_REQUIRED', error: 'NotFound', message: 'Run impact analysis before regenerating recommendation.' });
    }
    const suggestion = state.suggestions.find((item) => item.sourceScenarioId === scenario.id && item.status !== 'discarded');
    const comparison = suggestion
      ? compareAnalyzedScenarios([
        { scenario, impact, prediction: prediction.predictions || prediction },
        { scenario: { id: 'suggestion-preview', ...suggestion.suggestedPayload }, impact: suggestion.suggestedImpact, prediction: suggestion.suggestedPrediction.predictions || suggestion.suggestedPrediction }
      ])
      : [];
    const recommendation = await generateRecommendation({
      scenario,
      impact,
      prediction,
      predictiveAnalysis: buildPredictiveAnalysis(scenario, impact, prediction),
      comparison
    });
    const aiRecommendation = {
      id: nanoid(),
      scenarioId: scenario.id,
      recommendedModel: recommendation.recommendedModel || recommendation.recommendation || scenario.businessModelType,
      rationale: recommendation.rationale || recommendation.executiveSummary,
      keyDrivers: prediction.topContributingFactors || [],
      risks: recommendation.risks || [],
      alternativesCompared: [],
      confidence: prediction.confidence || 0.6,
      generatedAt: recommendation.generatedAt,
      content: recommendation
    };
    await mutateStore((mutable) => {
      mutable.recommendations = mutable.recommendations.filter((item) => item.scenarioId !== scenario.id);
      mutable.recommendations.unshift(aiRecommendation);
    });
    await audit('RECOMMENDATION_REGENERATED', { promptVersion: recommendation.promptVersion, request: { scenarioId: scenario.id }, response: aiRecommendation });
    const refreshed = await readStore();
    res.json(buildRecommendationView(refreshed, scenario.id));
  } catch (error) {
    next(error);
  }
}

export async function getReferenceScenarioFields(req, res) {
  res.json({ success: true, fields: scenarioFieldReferenceData() });
}

export async function getDashboardSummary(req, res, next) {
  try {
    const state = await readStore();
    res.json(buildDashboardSummary(state));
  } catch (error) {
    next(error);
  }
}

export async function getDashboardCharts(req, res, next) {
  try {
    const state = await readStore();
    res.json(buildDashboardCharts(state));
  } catch (error) {
    next(error);
  }
}

export async function getImpactDetails(req, res, next) {
  try {
    const state = await readStore();
    const scenario = state.scenarios.find((item) => item.id === req.params.id);
    const impact = state.impacts.find((item) => item.scenarioId === req.params.id);
    const prediction = state.predictions.find((item) => item.scenarioId === req.params.id);
    if (!scenario || !impact || !prediction) {
      return res.status(404).json({ error: 'NotFound', message: 'Impact details not found. Run analysis first.' });
    }
    res.json(buildImpactDetails(scenario, impact, prediction));
  } catch (error) {
    next(error);
  }
}

export async function getScenarioCharts(req, res, next) {
  try {
    const state = await readStore();
    const scenario = state.scenarios.find((item) => item.id === req.params.id);
    const impact = state.impacts.find((item) => item.scenarioId === req.params.id);
    const prediction = state.predictions.find((item) => item.scenarioId === req.params.id);
    if (!scenario || !impact || !prediction) {
      return res.status(404).json({ error: 'NotFound', message: 'Scenario chart data not found. Run analysis first.' });
    }
    res.json(buildScenarioCharts(scenario, impact, prediction));
  } catch (error) {
    next(error);
  }
}

export async function suggestBetterModel(req, res, next) {
  try {
    const state = await readStore();
    const scenario = state.scenarios.find((item) => item.id === req.params.id);
    if (!scenario) return res.status(404).json({ error: 'NotFound', message: 'Scenario not found.' });
    const { suggestion, response } = await buildSuggestion({
      state,
      scenario,
      comparisonContext: req.body?.comparisonContext || []
    });
    if (suggestion) {
      await mutateStore((mutable) => {
        mutable.suggestions.unshift(suggestion);
      });
    }
    await audit('BETTER_MODEL_SUGGESTED', {
      modelVersion: response.suggestedPrediction?.modelVersion,
      promptVersion: suggestion?.promptVersion || response.promptVersion,
      request: { scenarioId: scenario.id },
      response
    });
    res.json(response);
  } catch (error) {
    next(error);
  }
}

export async function useSuggestedModel(req, res, next) {
  try {
    const suggestionId = req.body?.suggestionId;
    if (!suggestionId) return res.status(400).json({ error: 'RequestError', message: 'suggestionId is required.' });
    const result = await mutateStore((state) => acceptSuggestionRecord(state, req.params.id, suggestionId));
    await audit('BETTER_MODEL_ACCEPTED', { request: { sourceScenarioId: req.params.id, suggestionId }, response: result });
    res.status(201).json({
      success: true,
      newScenarioId: result.scenario?.id,
      sourceScenarioId: req.params.id,
      relationshipType: 'AI_SUGGESTED_MODEL',
      status: 'accepted',
      analysisStatus: result.impact && result.prediction ? 'completed' : 'pending',
      alreadyAccepted: Boolean(result.alreadyAccepted),
      message: result.alreadyAccepted ? 'Suggested model was already saved as a new scenario.' : 'Suggested model has been saved as a new scenario.',
      scenario: result.scenario,
      impact: result.impact,
      prediction: result.prediction
    });
  } catch (error) {
    next(error);
  }
}

export async function discardSuggestedModel(req, res, next) {
  try {
    const suggestionId = req.body?.suggestionId;
    if (!suggestionId) return res.status(400).json({ error: 'RequestError', message: 'suggestionId is required.' });
    const result = await mutateStore((state) => discardSuggestionRecord(state, req.params.id, suggestionId));
    await audit('BETTER_MODEL_DISCARDED', { request: { sourceScenarioId: req.params.id, suggestionId }, response: result });
    res.json({
      success: true,
      status: 'discarded',
      message: 'AI suggestion discarded.',
      suggestionId: result.id,
      sourceScenarioId: req.params.id
    });
  } catch (error) {
    next(error);
  }
}

export async function compareSuggestion(req, res, next) {
  try {
    const suggestionId = req.body?.suggestionId;
    if (!suggestionId) return res.status(400).json({ error: 'RequestError', message: 'suggestionId is required.' });
    const state = await readStore();
    const suggestion = state.suggestions.find((item) => item.id === suggestionId && item.sourceScenarioId === req.params.id);
    if (!suggestion) return res.status(404).json({ error: 'NotFound', message: 'Suggestion not found.' });
    if (!suggestion.suggestedPayload || !suggestion.suggestedImpact || !suggestion.suggestedPrediction) {
      return res.status(409).json({ success: false, errorCode: 'SUGGESTION_INCOMPLETE', error: 'RequestError', message: 'Suggested model comparison data is not available. Regenerate the recommendation and try again.' });
    }
    const originalScenario = state.scenarios.find((item) => item.id === req.params.id);
    if (!originalScenario) return res.status(404).json({ error: 'NotFound', message: 'Scenario not found.' });
    const details = buildComparisonDetails([
      { scenario: originalScenario, impact: suggestion.originalImpact, prediction: suggestion.originalPrediction },
      { scenario: { id: 'suggestion-preview', ...suggestion.suggestedPayload }, impact: suggestion.suggestedImpact, prediction: suggestion.suggestedPrediction }
    ]);
    const originalPredictionValues = suggestion.originalPrediction?.predictions || suggestion.originalPrediction || {};
    const suggestedPredictionValues = suggestion.suggestedPrediction?.predictions || suggestion.suggestedPrediction || {};
    const comparison = {
      riskDelta: Number(((suggestedPredictionValues.implementationRisk || 0) - (originalPredictionValues.implementationRisk || 0)).toFixed(2)),
      effortDelta: Number(((suggestion.suggestedImpact?.implementationEffort || 0) - (suggestion.originalImpact?.implementationEffort || 0)).toFixed(2)),
      revenueDelta: Number(((suggestion.suggestedImpact?.revenueImpact || suggestedPredictionValues.revenueImpactPct || 0) - (suggestion.originalImpact?.revenueImpact || originalPredictionValues.revenueImpactPct || 0)).toFixed(2)),
      delayDelta: Number(((suggestion.suggestedImpact?.delayProbability || suggestedPredictionValues.delayProbability || 0) - (suggestion.originalImpact?.delayProbability || originalPredictionValues.delayProbability || 0)).toFixed(2)),
      complianceDelta: Number(((suggestion.suggestedImpact?.complianceRisk || suggestedPredictionValues.complianceRisk || 0) - (suggestion.originalImpact?.complianceRisk || originalPredictionValues.complianceRisk || 0)).toFixed(2)),
      o2cImpactChanges: suggestion.o2cImpactChanges || [],
      tradeOffs: suggestion.tradeOffs || []
    };
    await audit('BETTER_MODEL_COMPARED', { request: { sourceScenarioId: req.params.id, suggestionId }, response: details });
    res.json({
      success: true,
      comparisonId: nanoid(),
      suggestionId,
      originalScenario,
      suggestedScenario: suggestion.suggestedPayload,
      comparison,
      ...details
    });
  } catch (error) {
    next(error);
  }
}
