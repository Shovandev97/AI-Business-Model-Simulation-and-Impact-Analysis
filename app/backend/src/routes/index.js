import express from 'express';
import {
  analyzeScenario,
  compareScenarios,
  compareScenarioDetails,
  compareSuggestion,
  createScenario,
  deleteScenario,
  discardSuggestedModel,
  getDashboardCharts,
  getDashboardSummary,
  getImpact,
  getImpactDetails,
  getPrediction,
  getRecommendation,
  getReferenceScenarioFields,
  getScenario,
  getScenarioCharts,
  listScenarios,
  regenerateRecommendation,
  suggestBetterModel,
  useSuggestedModel
} from '../controllers/scenarioController.js';
import { listAudit } from '../services/auditService.js';
import { getModelInfo, trainModel } from '../services/mlClient.js';
import { generateRecommendation } from '../services/genAiService.js';
import { env } from '../config/env.js';

export const router = express.Router();

router.get('/api/health', async (req, res) => {
  let ml = { status: 'unknown' };
  try {
    ml = await getModelInfo();
  } catch (error) {
    ml = { status: 'unavailable', message: error.message };
  }
  res.json({
    status: 'ok',
    service: 'business-model-simulation-api',
    ml,
    aiProvider: env.openSourceAi.provider,
    aiModel: env.openSourceAi.model,
    aiConfigured: Boolean(env.openSourceAi.baseUrl && env.openSourceAi.model)
  });
});

router.get('/api/dashboard/summary', getDashboardSummary);
router.get('/api/dashboard/charts', getDashboardCharts);
router.get('/api/reference-data/scenario-fields', getReferenceScenarioFields);
router.post('/api/scenarios', createScenario);
router.get('/api/scenarios', listScenarios);
router.post('/api/scenarios/compare/details', compareScenarioDetails);
router.post('/api/scenarios/compare', compareScenarios);
router.get('/api/scenarios/:id', getScenario);
router.delete('/api/scenarios/:id', deleteScenario);
router.post('/api/scenarios/:id/analyze', analyzeScenario);
router.get('/api/scenarios/:id/impact/details', getImpactDetails);
router.get('/api/scenarios/:id/charts', getScenarioCharts);
router.post('/api/scenarios/:id/suggest-better-model', suggestBetterModel);
router.post('/api/scenarios/:id/use-suggested-model', useSuggestedModel);
router.post('/api/scenarios/:id/compare-suggestion', compareSuggestion);
router.post('/api/scenarios/:id/discard-suggestion', discardSuggestedModel);
router.post('/api/scenarios/:id/recommendation/regenerate', regenerateRecommendation);
router.get('/api/scenarios/:id/impact', getImpact);
router.get('/api/scenarios/:id/prediction', getPrediction);
router.get('/api/scenarios/:id/recommendation', getRecommendation);

router.get('/api/audit', async (req, res, next) => {
  try {
    res.json(await listAudit());
  } catch (error) {
    next(error);
  }
});

router.post('/api/train', async (req, res, next) => {
  try {
    res.json(await trainModel(req.body || {}));
  } catch (error) {
    next(error);
  }
});

router.post('/ai/recommend', async (req, res, next) => {
  try {
    res.json(await generateRecommendation(req.body));
  } catch (error) {
    next(error);
  }
});
router.post('/ai/explain', async (req, res, next) => {
  try {
    res.json(await generateRecommendation(req.body));
  } catch (error) {
    next(error);
  }
});
router.post('/ai/summarize', async (req, res, next) => {
  try {
    res.json(await generateRecommendation(req.body));
  } catch (error) {
    next(error);
  }
});
