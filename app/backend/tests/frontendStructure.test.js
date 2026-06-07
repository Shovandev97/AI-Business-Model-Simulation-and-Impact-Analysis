import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

const root = path.resolve(process.cwd(), '../..');
const view = fs.readFileSync(path.join(root, 'app/frontend/webapp/view/App.view.xml'), 'utf8');
const css = fs.readFileSync(path.join(root, 'app/frontend/webapp/css/style.css'), 'utf8');

test('frontend keeps only the left navigation visible', () => {
  assert.match(view, /<VBox class="sideNav">/);
  assert.match(view, /selectedKey="\{app>\/activePage\}" expandable="false" class="workTabs singleNavContent"/);
  assert.match(css, /\.singleNavContent \.sapMITBHead/);
});

test('dashboard cockpit is route-specific and not in shared layout', () => {
  const iconTabIndex = view.indexOf('<IconTabBar');
  const beforeRoutes = view.slice(0, iconTabIndex);
  const dashboardStart = view.indexOf('<IconTabFilter key="dashboard"');
  const createStart = view.indexOf('<IconTabFilter key="create"');
  const dashboardView = view.slice(dashboardStart, createStart);
  assert.doesNotMatch(beforeRoutes, /dashboard\/executiveSummary/);
  assert.doesNotMatch(beforeRoutes, /Business Model Portfolio Summary/);
  assert.match(view, /Executive Portfolio Overview/);
  assert.match(view, /O2C Impact Heatmap/);
  assert.match(view, /Scenarios Requiring Attention/);
  assert.doesNotMatch(dashboardView, /AI Status/);
  assert.doesNotMatch(dashboardView, /portfolioHealth/);
});

test('scenario form supports manual entry without templates', () => {
  assert.doesNotMatch(view, /Start from Template/i);
  assert.doesNotMatch(view, /template/i);
  assert.match(view, /Scenario Basics/);
  assert.match(view, /Commercial Model/);
  assert.match(view, /Billing and Funding/);
  assert.match(view, /Operational Complexity/);
  assert.match(view, /Compliance and Integrations/);
  assert.match(view, /createScenarioPage/);
  assert.match(view, /createScenarioGrid/);
  assert.match(view, /createScenarioField/);
  assert.match(view, /createScenarioWideField/);
  assert.doesNotMatch(view, /SimpleForm/);
  assert.match(view, /<ComboBox width="100%" value="\{app>\/newScenario\/industry\}"/);
  assert.match(view, /<MultiComboBox width="100%" selectedKeys="\{app>\/newScenario\/complianceRegions\}"/);
  assert.match(view, /activePage\} !== 'create'/);
  assert.match(view, /loading\/createScenario/);
  assert.match(css, /\.createScenarioGrid\s*\{/);
  assert.match(css, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.createScenarioField \.sapMInputBase/);
  assert.match(css, /\.createScenarioField \.sapMMultiComboBox/);
  assert.match(css, /max-height: 6rem/);
  assert.match(css, /@media \(max-width: 900px\)/);
});

test('AI recommendation workspace contains enterprise sections and retryable suggestion state', () => {
  assert.match(view, /AI Recommendation Workspace/);
  assert.match(view, /Predictive AI Historical Analysis/);
  assert.match(view, /Predictive Executive Readout/);
  assert.match(view, /Predictive AI Active/);
  assert.match(view, /predictiveAnalysis\/historicalPatternSummary/);
  assert.match(view, /predictiveAnalysis\/riskDrivers/);
  assert.match(view, /Executive Recommendation/);
  assert.match(view, /Current vs Suggested Model/);
  assert.match(view, /Assumptions/);
  assert.match(view, /Trade-Offs/);
  assert.match(view, /onRetrySuggestion/);
  assert.match(view, /suggestionProgress/);
  assert.match(view, /customerFriendlyReasoning/);
  assert.match(view, /AI recommendation is temporarily unavailable/);
  assert.match(view, /canUseSuggestion/);
  assert.match(view, /canCompareSuggestion/);
  assert.match(view, /canDiscardSuggestion/);
  assert.match(view, /Suggest Better Business Model/);
  assert.match(view, /Use predictive AI plus Ollama to generate an alternative model/);
  assert.match(view, /Regenerate Executive Recommendation/);
  assert.match(view, /recommendationActionsPanel/);
  assert.match(view, /actionButtonStack/);
  assert.match(view, /canRequestSuggestion/);
  assert.match(view, /Use Suggest Better Business Model to compare alternatives/);
  assert.match(css, /\.predictiveExecutivePanel/);
  assert.match(css, /\.recommendationActionsPanel/);
  assert.match(css, /\.actionButtonStack/);
  assert.match(css, /\.actionHint/);
  assert.match(view, /<Column><Text text="Change"\/><\/Column>/);
  assert.doesNotMatch(view, /recommendation\/keyDrivers/);
  assert.doesNotMatch(view, /Importance \{app>importance\}/);
  assert.doesNotMatch(view, /open-source AI provider was unavailable/);
});

test('compare scenarios table exposes scenario delete action', () => {
  assert.match(view, /Scenario Comparison/);
  assert.match(view, /<Column hAlign="End"><Text text="Action"\/><\/Column>/);
  assert.match(view, /sap-icon:\/\/delete/);
  assert.match(view, /Delete scenario/);
  assert.match(view, /onDeleteScenarioFromCompare/);
  assert.match(view, /loading\/deleteScenario/);
});

test('admin predictive training status shows dataset and split rows', () => {
  assert.match(view, /Train Predictive Model/);
  assert.match(view, /Dataset rows: \{app>\/health\/ml\/datasetRows\}/);
  assert.match(view, /Training rows: \{app>\/health\/ml\/trainingRows\}/);
  assert.match(view, /Test rows: \{app>\/health\/ml\/testRows\}/);
  assert.match(view, /Last trained: \{app>\/health\/ml\/trainedAt\}/);
});
