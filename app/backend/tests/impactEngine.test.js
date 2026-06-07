import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeImpact } from '../src/services/impactEngine.js';

test('analyzeImpact returns enterprise O2C scores', () => {
  const impact = analyzeImpact({
    id: 's1',
    businessModelType: 'outcome-based',
    complianceRegions: ['US', 'EU'],
    integrationCount: 8,
    processComplexity: 7,
    transactionVolume: 90000,
    expectedRevenue: 12000000,
    billingFrequency: 'usage-event'
  }, {
    billingComplexity: 70,
    downstreamIntegrationImpact: 72,
    complianceRisk: 65,
    operationalEffort: 68,
    revenueImpactPct: 9.4,
    delayProbability: 61,
    dependencyCount: 14,
    confidence: 0.78
  });

  assert.equal(impact.scenarioId, 's1');
  assert.ok(impact.o2cImpactScores.billing.score > 0);
  assert.ok(impact.implementationEffort >= 0);
});
