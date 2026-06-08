import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Activity, ArrowDownRight, ArrowUpRight, Award, BarChart3, Bot, Check, Clock3,
  ClipboardList, DollarSign, Gauge, GitCompare, History, Layers3, Minus,
  Network, Pencil, RefreshCw, Save, Search, Settings, ShieldAlert, Sparkles, Trash2,
  TrendingDown, TrendingUp, X
} from 'lucide-react';
import 'bootstrap/dist/css/bootstrap.min.css';
import './styles.css';

const initialDraft = {
  name: '', description: '', businessModelType: '', industry: '', customerSegment: '', region: '',
  pricingType: '', contractTerm: '', billingFrequency: '', fundingModel: '', bundleType: '',
  transactionVolumeBand: '', transactionVolume: '', expectedRevenueBand: '', expectedRevenue: '',
  complianceRegions: [], complianceRegionsText: '', integrationCount: 0, processComplexityBand: '', processComplexity: ''
};

function App() {
  const [apiBase] = useState(import.meta.env.VITE_API_BASE || 'http://localhost:4000');
  const [apiKey] = useState(import.meta.env.VITE_API_KEY || 'local-dev-key');
  const api = useMemo(() => makeApi(apiBase, apiKey), [apiBase, apiKey]);
  const [activePage, setActivePage] = useState('dashboard');
  const [scenarios, setScenarios] = useState([]);
  const [selectedScenarioId, setSelectedScenarioId] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [impactDetails, setImpactDetails] = useState(null);
  const [scenarioCharts, setScenarioCharts] = useState(null);
  const [recommendationView, setRecommendationView] = useState(null);
  const [recommendationError, setRecommendationError] = useState('');
  const [suggestion, setSuggestion] = useState(null);
  const [suggestionError, setSuggestionError] = useState(null);
  const [comparison, setComparison] = useState([]);
  const [comparisonDetails, setComparisonDetails] = useState(null);
  const [dashboard, setDashboard] = useState({});
  const [audit, setAudit] = useState([]);
  const [health, setHealth] = useState({});
  const [referenceData, setReferenceData] = useState({ fields: {} });
  const [draft, setDraft] = useState(initialDraft);
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState({});
  const [toast, setToast] = useState('');
  const selectedScenario = scenarios.find((item) => item.id === selectedScenarioId) || null;

  useEffect(() => { loadAll(); loadDashboard(); }, []);
  useEffect(() => {
    if (activePage === 'recommendation' && selectedScenarioId) loadRecommendationView(selectedScenarioId);
    if (activePage === 'dashboard') loadDashboard();
  }, [activePage, selectedScenarioId]);

  async function loadAll() {
    try {
      const [scenarioRows, auditRows, healthBody, ref] = await Promise.all([
        api('/api/scenarios'), api('/api/audit'), api('/api/health'), api('/api/reference-data/scenario-fields')
      ]);
      setScenarios(scenarioRows);
      setAudit(auditRows);
      setHealth(healthBody);
      setReferenceData(ref);
      setSelectedScenarioId((current) => scenarioRows.find((item) => item.id === current)?.id || scenarioRows[0]?.id || '');
    } catch (error) {
      show(error.message);
    }
  }

  async function loadDashboard() {
    setLoadingFlag('dashboard', true);
    try {
      setDashboard(await api('/api/dashboard/summary'));
    } finally {
      setLoadingFlag('dashboard', false);
    }
  }

  async function loadRecommendationView(id = selectedScenarioId) {
    if (!id) return;
    try {
      setRecommendationView(await api(`/api/scenarios/${id}/recommendation`));
      setRecommendationError('');
    } catch (error) {
      setRecommendationError(error.message);
    }
  }

  async function saveScenario(runAnalysis) {
    try {
      setLoadingFlag('createScenario', true);
      setFormError('');
      const payload = buildScenarioPayload(draft, referenceData.fields || {});
      validateDraft(payload);
      const scenario = await api('/api/scenarios', { method: 'POST', body: JSON.stringify(payload) });
      setSelectedScenarioId(scenario.id);
      await loadAll();
      show('Scenario saved');
      if (runAnalysis) await analyzeScenario(scenario.id);
    } catch (error) {
      setFormError(error.message);
      window.alert(error.message);
    } finally {
      setLoadingFlag('createScenario', false);
    }
  }

  async function analyzeScenario(id = selectedScenarioId) {
    if (!id) return show('Select a scenario first');
    try {
      setActivePage('impact');
      setLoadingFlag('analysis', true);
      const result = await api(`/api/scenarios/${id}/analyze`, { method: 'POST' });
      setAnalysis({ ...result, impactRows: objectToRows(result.impact?.o2cImpactScores), predictionRows: objectToRows(result.prediction?.predictions) });
      const [details, charts] = await Promise.all([api(`/api/scenarios/${id}/impact/details`), api(`/api/scenarios/${id}/charts`)]);
      setImpactDetails(details);
      setScenarioCharts(prepareCharts(charts));
      setSuggestion(null);
      await Promise.all([loadRecommendationView(id), loadAll(), loadDashboard()]);
      show('Analysis complete');
    } catch (error) {
      window.alert(error.message);
    } finally {
      setLoadingFlag('analysis', false);
    }
  }

  async function compareAll() {
    if (scenarios.length < 2) return show('Create at least two scenarios');
    try {
      setLoadingFlag('comparison', true);
      const result = await api('/api/scenarios/compare/details', { method: 'POST', body: JSON.stringify({ scenarioIds: scenarios.map((item) => item.id) }) });
      setComparison(result.ranking || []);
      setComparisonDetails(prepareComparisonDetails(result));
    } catch (error) {
      window.alert(error.message);
    } finally {
      setLoadingFlag('comparison', false);
    }
  }

  async function renameScenario(id = selectedScenarioId, currentName = selectedScenario?.name) {
    if (!id) return show('Select a scenario first');
    const nextName = window.prompt('Rename scenario', currentName || '');
    if (nextName === null) return;
    const name = nextName.trim();
    if (!name) return window.alert('Scenario name is required.');
    if (name === currentName) return;
    try {
      setLoadingFlag('renameScenario', true);
      const updated = await api(`/api/scenarios/${id}`, { method: 'PATCH', body: JSON.stringify({ name }) });
      applyScenarioRename(id, currentName, updated.name);
      await Promise.all([loadAll(), loadDashboard()]);
      if (activePage === 'recommendation') await loadRecommendationView(id);
      show('Scenario renamed');
    } catch (error) {
      window.alert(error.message);
    } finally {
      setLoadingFlag('renameScenario', false);
    }
  }

  async function deleteScenario(id, name) {
    if (!window.confirm(`Delete scenario "${name}" and its analysis history from this local workspace?`)) return;
    try {
      setLoadingFlag('deleteScenario', true);
      const result = await api(`/api/scenarios/${id}`, { method: 'DELETE' });
      if (selectedScenarioId === id) {
        setAnalysis(null); setImpactDetails(null); setScenarioCharts(null); setRecommendationView(null); setSuggestion(null);
      }
      await Promise.all([loadAll(), loadDashboard()]);
      setComparison((rows) => rows.filter((row) => row.scenarioId !== id));
      show(result.message || 'Scenario deleted');
    } catch (error) {
      window.alert(error.message);
    } finally {
      setLoadingFlag('deleteScenario', false);
    }
  }

  async function suggestBetterModel() {
    if (!selectedScenarioId) return show('Select a scenario first');
    if (!analysis && !recommendationView?.originalPrediction) return show('Run impact analysis first');
    try {
      setLoadingFlag('suggestion', true);
      setSuggestionError(null);
      const result = await api(`/api/scenarios/${selectedScenarioId}/suggest-better-model`, { method: 'POST', body: JSON.stringify({ comparisonContext: comparison }) });
      setSuggestion(prepareSuggestion(result));
      await loadRecommendationView(selectedScenarioId);
      show(result.noBetterModelFound ? 'Current model appears optimal.' : 'AI suggestion ready.');
    } catch (error) {
      setSuggestionError({ message: error.message, details: error.details, errorCode: error.errorCode });
    } finally {
      setLoadingFlag('suggestion', false);
    }
  }

  async function useSuggestedModel() {
    const suggestionId = recommendationView?.suggestionId || suggestion?.suggestionId;
    if (!suggestionId) return window.alert('No suggested model is available to use.');
    try {
      setLoadingFlag('recommendationAction', true);
      const result = await api(`/api/scenarios/${selectedScenarioId}/use-suggested-model`, { method: 'POST', body: JSON.stringify({ suggestionId, recommendationId: recommendationView?.recommendationId }) });
      setSelectedScenarioId(result.newScenarioId);
      await loadAll();
      await analyzeScenario(result.newScenarioId);
      show(result.message);
    } catch (error) {
      window.alert(error.message);
    } finally {
      setLoadingFlag('recommendationAction', false);
    }
  }

  async function compareSuggestion() {
    const suggestionId = recommendationView?.suggestionId || suggestion?.suggestionId;
    if (!suggestionId) return window.alert('No suggested model is available to compare.');
    try {
      const result = await api(`/api/scenarios/${selectedScenarioId}/compare-suggestion`, { method: 'POST', body: JSON.stringify({ suggestionId }) });
      setComparison(result.ranking || []);
      setComparisonDetails(prepareComparisonDetails(result));
      setActivePage('compare');
    } catch (error) {
      window.alert(error.message);
    }
  }

  async function discardSuggestion() {
    const suggestionId = recommendationView?.suggestionId || suggestion?.suggestionId;
    if (!suggestionId) return window.alert('No suggested model is available to discard.');
    if (!window.confirm('Do you want to discard this AI suggestion?')) return;
    const result = await api(`/api/scenarios/${selectedScenarioId}/discard-suggestion`, { method: 'POST', body: JSON.stringify({ suggestionId }) });
    setSuggestion((current) => current ? { ...current, status: 'discarded' } : current);
    await loadRecommendationView(selectedScenarioId);
    show(result.message);
  }

  async function regenerateRecommendation() {
    if (!selectedScenarioId) return;
    try {
      setLoadingFlag('recommendation', true);
      const result = await api(`/api/scenarios/${selectedScenarioId}/recommendation/regenerate`, { method: 'POST' });
      setRecommendationView(result);
      show(result.predictiveOnly ? 'Predictive analysis is available; AI recommendation can be retried.' : 'Recommendation regenerated');
    } catch (error) {
      setRecommendationError(error.message);
      window.alert(error.message);
    } finally {
      setLoadingFlag('recommendation', false);
    }
  }

  async function trainModel() {
    try {
      const result = await api('/api/train', { method: 'POST', body: JSON.stringify({ growthRows: 500, regenerateData: true }) });
      await loadAll();
      show(`Model trained on ${result.trainingRows} rows from ${result.datasetRows} generated records`);
    } catch (error) {
      window.alert(error.message);
    }
  }

  function setLoadingFlag(key, value) { setLoading((current) => ({ ...current, [key]: value })); }
  function show(message) { setToast(message); window.setTimeout(() => setToast(''), 2400); }
  function applyScenarioRename(id, previousName, name) {
    setScenarios((rows) => rows.map((row) => row.id === id ? { ...row, name } : row));
    setAnalysis((current) => current?.scenario?.id === id ? { ...current, scenario: { ...current.scenario, name } } : current);
    setImpactDetails((current) => current?.scenarioOverview && (!current.scenarioOverview.id || current.scenarioOverview.id === id || current.scenarioOverview.name === previousName) ? { ...current, scenarioOverview: { ...current.scenarioOverview, name } } : current);
    setRecommendationView((current) => current?.originalScenario?.id === id ? { ...current, originalScenario: { ...current.originalScenario, name } } : current);
    setComparison((rows) => rows.map((row) => row.scenarioId === id ? { ...row, name } : row));
    setComparisonDetails((current) => renameComparisonDetails(current, previousName, name));
  }

  return (
    <div className="appShell">
      <header className="shellBar">
        <div className="brandCluster">
          <div className="brandMark"><Sparkles size={18}/></div>
          <div><strong>AI Business Model Simulation</strong><span>O2C Impact Analysis Engine</span></div>
        </div>
        <div className="shellMeta"><span>{health.status || 'checking'}</span><div className="avatar">AI</div></div>
      </header>
      <div className="layoutRoot">
        <nav className="sideNav">
          <div className="navTitle">Workspace</div>
          {[
            ['dashboard', 'Dashboard', BarChart3], ['create', 'Create Scenario', ClipboardList], ['impact', 'Impact Analysis', Activity],
            ['compare', 'Compare Scenarios', GitCompare], ['recommendation', 'AI Recommendation', Bot], ['audit', 'History', History], ['admin', 'Settings', Settings]
          ].map(([key, label, Icon]) => <button key={key} className={activePage === key ? 'nav active' : 'nav'} onClick={() => setActivePage(key)}><Icon size={17}/><span>{label}</span></button>)}
        </nav>
        <main className="contentPane">
          <section className="toolbarBand">
            <div><span className="eyebrow">Enterprise planning cockpit</span><h1>Commercial Model Simulation Cockpit</h1><p>Assess revenue, risk, compliance and downstream process impact before model rollout.</p></div>
            {activePage !== 'create' && <div className="toolbarActions"><select className="form-select" value={selectedScenarioId} onChange={(e) => setSelectedScenarioId(e.target.value)}>{scenarios.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button className="btn btn-light" onClick={() => renameScenario()} disabled={!selectedScenarioId || loading.renameScenario}><Pencil size={16}/>Rename</button><button className="btn btn-light" onClick={() => { loadAll(); loadDashboard(); }}><RefreshCw size={16}/>Refresh</button></div>}
          </section>
          {activePage === 'dashboard' && <DashboardPage dashboard={dashboard} setActivePage={setActivePage}/>}
          {activePage === 'create' && <CreatePage draft={draft} setDraft={setDraft} referenceData={referenceData} formError={formError} saveScenario={saveScenario} loading={loading}/>}
          {activePage === 'impact' && <ImpactPage impactDetails={impactDetails} scenarioCharts={scenarioCharts} analysis={analysis} suggestion={suggestion} suggestionError={suggestionError} loading={loading} analyze={() => analyzeScenario()} suggestBetterModel={suggestBetterModel} useSuggestedModel={useSuggestedModel} compareSuggestion={compareSuggestion} discardSuggestion={discardSuggestion}/>}
          {activePage === 'compare' && <ComparePage comparison={comparison} comparisonDetails={comparisonDetails} compareAll={compareAll} renameScenario={renameScenario} deleteScenario={deleteScenario} loading={loading}/>}
          {activePage === 'recommendation' && <RecommendationPage recommendationView={recommendationView} recommendationError={recommendationError} loading={loading} suggestBetterModel={suggestBetterModel} regenerateRecommendation={regenerateRecommendation} useSuggestedModel={useSuggestedModel} compareSuggestion={compareSuggestion} discardSuggestion={discardSuggestion} setActivePage={setActivePage} suggestionError={suggestionError}/>}
          {activePage === 'audit' && <AuditPage audit={audit}/>}
          {activePage === 'admin' && <AdminPage health={health} loadAll={loadAll} trainModel={trainModel}/>}
        </main>
      </div>
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function DashboardPage({ dashboard, setActivePage }) {
  if (dashboard.emptyState) return <section className="panel dashboardEmpty"><span className="eyebrow">Portfolio insights</span><h2>{dashboard.emptyState.title}</h2><p>{dashboard.emptyState.message}</p><button className="primary" onClick={() => setActivePage('create')}>Create Scenario</button></section>;
  const summary = dashboard.executiveSummary || {};
  return <div className="pageStack">
    <section className="panel executivePanel"><div className="panelIntro"><span className="eyebrow">Portfolio pulse</span><h2>Executive Portfolio Overview</h2></div><div className="kpiRow">{[['Analyzed Scenarios', summary.totalScenarios, 'documents'], ['Average Risk', `${summary.averageRiskScore || 0}%`, 'risk'], ['Average Effort', `${summary.averageEffortScore || 0}%`, 'effort'], ['Revenue Opportunity', `${summary.averageRevenueImpact || 0}%`, 'revenue']].map(([label, value, tone]) => <div className={`kpiTile ${tone}`} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div></section>
    <div className="sectionGrid"><DonutChart title="Business Model Portfolio Summary" rows={dashboard.businessModelDistribution || []} label="modelType" value="averageScore"/><DonutChart title="Risk Distribution" rows={dashboard.riskDistribution || []} label="riskLevel" value="count"/><DonutChart title="Implementation Effort Breakdown" rows={dashboard.implementationEffortBreakdown || []} label="area" value="averageEffort"/></div>
    <RiskRevenueScatter rows={dashboard.riskRevenueMatrix || []}/>
    <O2CImpactMap rows={dashboard.o2cImpactHeatmap || []}/>
    <div className="sectionGrid"><AttentionInsights rows={dashboard.scenariosRequiringAttention || []}/><ActivityTrend rows={dashboard.recentActivity || []}/></div>
  </div>;
}

function CreatePage({ draft, setDraft, referenceData, formError, saveScenario, loading }) {
  const fields = referenceData.fields || {};
  const update = (key, value) => setDraft((current) => ({ ...current, [key]: value }));
  return <section className="panel createScenarioPage"><div className="formHero"><div><span className="eyebrow">Scenario design</span><h2>Scenario Builder</h2><p>Create a commercial model scenario with stable enterprise parameters for O2C impact analysis.</p></div><ClipboardList size={28}/></div>{formError && <div className="message error">{formError}</div>}<div className="scenarioFormSections">
    <div className="formSection"><div className="formSectionTitle"><strong>Scenario Identity</strong><span>Business context and market scope</span></div><div className="createScenarioForm"><Field label="Scenario Name" value={draft.name} onChange={(v) => update('name', v)}/><Field label="Industry" value={draft.industry} onChange={(v) => update('industry', v)} options={fields.industries}/><Field wide label="Description" value={draft.description} onChange={(v) => update('description', v)} textarea/><Field label="Customer Segment" value={draft.customerSegment} onChange={(v) => update('customerSegment', v)} options={fields.customerSegments}/><Field label="Region" value={draft.region} onChange={(v) => update('region', v)} options={fields.regions}/></div></div>
    <div className="formSection"><div className="formSectionTitle"><strong>Commercial Model</strong><span>Pricing, bundle and billing design</span></div><div className="createScenarioForm"><Field label="Business Model Type" value={draft.businessModelType} onChange={(v) => update('businessModelType', v)} options={fields.businessModelTypes}/><Field label="Pricing Type" value={draft.pricingType} onChange={(v) => update('pricingType', v)} options={fields.pricingTypes}/><Field label="Contract Term" value={draft.contractTerm} onChange={(v) => update('contractTerm', v)} options={['12 Months','24 Months','36 Months','No Fixed Contract']}/><Field label="Bundle Type" value={draft.bundleType} onChange={(v) => update('bundleType', v)} options={fields.bundleTypes}/><Field label="Billing Frequency" value={draft.billingFrequency} onChange={(v) => update('billingFrequency', v)} options={fields.billingFrequencies}/><Field label="Funding Model" value={draft.fundingModel} onChange={(v) => update('fundingModel', v)} options={fields.fundingModels}/></div></div>
    <div className="formSection"><div className="formSectionTitle"><strong>Operational Inputs</strong><span>Volumes, complexity and compliance footprint</span></div><div className="createScenarioForm"><Field label="Transaction Volume" value={draft.transactionVolume} onChange={(v) => update('transactionVolume', v)} placeholder="Numeric override"/><Field label="Expected Revenue" value={draft.expectedRevenue} onChange={(v) => update('expectedRevenue', v)} placeholder="Numeric override"/><Field label="Integration Count" value={draft.integrationCount} onChange={(v) => update('integrationCount', v)} type="number"/><Field label="Process Complexity" value={draft.processComplexityBand} onChange={(v) => update('processComplexityBand', v)} options={(fields.processComplexities || []).map((x) => String(x.value))}/><Field wide label="Compliance Regions" value={draft.complianceRegionsText} onChange={(v) => update('complianceRegionsText', v)} placeholder="Comma-separated regions"/></div></div>
  </div><div className="actions formActions"><button onClick={() => saveScenario(false)} disabled={loading.createScenario}><Save size={16}/>Save Scenario</button><button className="primary" onClick={() => saveScenario(true)} disabled={loading.createScenario}><Activity size={16}/>Save and Run Impact Analysis</button></div></section>;
}

function ImpactPage({ impactDetails, scenarioCharts, analysis, suggestion, suggestionError, loading, analyze, suggestBetterModel, useSuggestedModel, compareSuggestion, discardSuggestion }) {
  return <div className="pageStack"><section className="panel"><div className="panelHeader"><div><h2>{impactDetails?.scenarioOverview?.name || 'Impact Analysis'}</h2><p>{impactDetails?.scenarioOverview ? `${impactDetails.scenarioOverview.industry} | ${impactDetails.scenarioOverview.region} | ${impactDetails.scenarioOverview.billingFrequency} billing` : 'Run analysis to view O2C impact details.'}</p></div><div className="actions"><button onClick={analyze}><Activity size={16}/>Run Analysis</button><button className="primary" onClick={suggestBetterModel} disabled={!analysis || loading.suggestion}><Bot size={16}/>Suggest Better Business Model</button></div></div>{suggestionError && <div className="message error">{suggestionError.message}<small>{suggestionError.details}</small></div>}</section>
    <div className="sectionGrid"><ImpactAreaHeatmap rows={impactDetails?.areaDetails || []}/><ChartList title="Risk and Effort" rows={impactDetails?.riskMetrics || []} label="name" value="value"/></div>
    <div className="sectionGrid"><ChartList title="O2C Impact by Area" rows={scenarioCharts?.o2cImpactByArea || []} label="label" value="value"/><ChartList title="Dependency Distribution" rows={scenarioCharts?.dependencyDistribution || []} label="label" value="value"/><ChartList title="Severity Breakdown" rows={scenarioCharts?.severityBreakdown || []} label="label" value="value"/></div>
    {suggestion && <SuggestionPanel suggestion={suggestion} useSuggestedModel={useSuggestedModel} compareSuggestion={compareSuggestion} discardSuggestion={discardSuggestion} loading={loading}/>}
  </div>;
}

function ComparePage({ comparison, comparisonDetails, compareAll, renameScenario, deleteScenario, loading }) {
  const best = comparison[0] || {};
  const riskValues = comparison.map((row) => Number(row.risk)).filter(Number.isFinite);
  const revenueValues = comparison.map((row) => Number(row.revenueImpact)).filter(Number.isFinite);
  const stats = [
    ['Scenarios', comparison.length, GitCompare, 'neutral'],
    ['Best Score', best.recommendationScore ?? 0, Award, 'good'],
    ['Lowest Risk', riskValues.length ? Math.min(...riskValues) : 0, ShieldAlert, 'warn'],
    ['Revenue Range', revenueValues.length ? `${Math.min(...revenueValues).toFixed(1)}-${Math.max(...revenueValues).toFixed(1)}%` : '0%', DollarSign, 'revenue']
  ];
  return <div className="pageStack compareWorkspace">
    <section className="panel compareHero"><div className="panelHeader"><div><span className="eyebrow">Decision intelligence</span><h2>Scenario Comparison</h2><p>{comparisonDetails?.bestFitRecommendation || 'Compare analyzed scenarios to identify the strongest commercial model trade-off.'}</p></div><button className="primary" onClick={compareAll} disabled={loading.comparison}><GitCompare size={16}/>{loading.comparison ? 'Comparing...' : 'Compare All Scenarios'}</button></div></section>
    <div className="compareKpiGrid">{stats.map(([label, value, Icon, tone]) => <div className={`compareKpi ${tone}`} key={label}><div><span>{label}</span><strong>{formatCell(value)}</strong></div><Icon size={20}/></div>)}</div>
    {comparisonDetails?.tradeOffExplanation && <div className="message compareMessage">{comparisonDetails.tradeOffExplanation}</div>}
    <section className="panel compareTablePanel"><div className="panelHeader tableTitle"><div><h2>Ranked Scenario Matrix</h2><p>Recommendation score balances revenue upside, implementation effort, compliance exposure and downstream complexity.</p></div><span className="badge">{comparison.length} ranked</span></div><CompareScenarioTable rows={comparison} renameScenario={renameScenario} deleteScenario={deleteScenario} loading={loading}/></section>
    <div className="sectionGrid chartDeck"><ChartList title="Revenue Impact Comparison" rows={comparisonDetails?.charts?.revenueImpactComparison || []} label="label" value="value"/><ChartList title="Risk Score Comparison" rows={comparisonDetails?.charts?.riskComparison || []} label="label" value="value"/><ChartList title="Dependency Count Comparison" rows={comparisonDetails?.charts?.dependencyCountComparison || []} label="label" value="value"/></div>
  </div>;
}

function RecommendationPage({ recommendationView, recommendationError, loading, suggestBetterModel, regenerateRecommendation, useSuggestedModel, compareSuggestion, discardSuggestion, setActivePage, suggestionError }) {
  if (recommendationError) return <section className="panel errorPanel">{recommendationError}</section>;
  const view = recommendationView || {};
  return <div className="pageStack">{view.predictiveOnly && <section className="panel errorPanel"><h2>AI recommendation is temporarily unavailable</h2><p>{view.customerMessage}</p><button onClick={() => setActivePage('impact')}>View Predictive Impact Details</button></section>}<section className="panel aiHero"><div className="panelHeader"><div><h2>AI Recommendation Workspace</h2><p>{view.originalScenario?.name}</p><span className="badge">{view.recommendationStatus}</span></div><div><strong>{view.recommendedModel}</strong><p>{confidenceText(view.confidence)}</p></div></div></section><div className="sectionGrid"><section className="panel widePanel"><h2>{view.predictiveOnly ? 'Predictive Executive Readout' : 'Executive Recommendation'}</h2><p>{view.predictiveOnly ? view.predictiveAnalysis?.historicalPatternSummary : view.executiveSummary}</p><MetricInsightGrid rows={view.riskAndBenefitBreakdown || []}/></section><section className="panel recommendationActionsPanel"><h2>Recommendation Actions</h2><div className="actionButtonStack"><button className="primary" onClick={suggestBetterModel} disabled={loading.suggestion || loading.recommendationAction}><Bot size={16}/>Suggest Better Business Model</button><button onClick={regenerateRecommendation} disabled={loading.recommendation}><RefreshCw size={16}/>Regenerate Executive Recommendation</button>{view.suggestionId && <><button onClick={useSuggestedModel} disabled={view.suggestionStatus === 'accepted' || view.suggestionStatus === 'discarded'}><Check size={16}/>Use Suggested Model</button><button onClick={compareSuggestion} disabled={view.suggestionStatus === 'discarded'}><GitCompare size={16}/>Compare With Current Model</button><button onClick={discardSuggestion} disabled={view.suggestionStatus === 'accepted' || view.suggestionStatus === 'discarded'}><X size={16}/>Discard Suggestion</button></>}</div>{suggestionError && <div className="message error">{suggestionError.message}</div>}</section></div><ComparisonVisual rows={view.comparisonRows || []}/></div>;
}

function SuggestionPanel({ suggestion, useSuggestedModel, compareSuggestion, discardSuggestion, loading }) {
  const benefits = [
    ['Risk Reduction', suggestion.riskReduction, 'risk'],
    ['Revenue Improvement', suggestion.revenueImprovement, 'revenue'],
    ['Effort Change', suggestion.effortChange, 'effort'],
    ['Confidence', Math.round((Number(suggestion.confidence) || 0) * 100), 'confidence']
  ];
  return <section className="panel suggestionPanel"><div className="panelHeader"><div><span className="eyebrow">Model intelligence</span><h2>AI-Suggested Better Business Model</h2></div><span className="badge">{suggestion.source || 'GenAI'}</span></div>{suggestion.noBetterModelFound && <div className="message success">{suggestion.message}</div>}<p>{suggestion.improvementSummary || suggestion.aiRationale}</p><div className="metricStrip">{benefits.map(([label, value, tone]) => <div className={`metricPill ${tone}`} key={label}><span>{label}</span><strong>{formatMetric(value)}</strong></div>)}</div><ScoreComparisonBars rows={suggestion.scoreRows || []}/>{suggestion.o2cImpactChanges?.length > 0 && <div className="insightList">{suggestion.o2cImpactChanges.slice(0, 4).map((item, index) => <div className="insightItem" key={item.area || index}><strong>{item.area || item.label}</strong><span>{item.change || item.benefit || item.impact}</span></div>)}</div>}<div className="actions"><button onClick={discardSuggestion} disabled={!canAct(suggestion, loading)}><X size={16}/>Discard</button><button onClick={compareSuggestion} disabled={suggestion.status === 'discarded'}><GitCompare size={16}/>Compare</button><button className="primary" onClick={useSuggestedModel} disabled={!canAct(suggestion, loading)}><Check size={16}/>Use Suggested Model</button></div></section>;
}

function AuditPage({ audit }) { return <section className="panel"><h2>Audit Trail</h2><DataTable rows={audit} columns={['timestamp','action','modelVersion','promptVersion']}/></section>; }
function AdminPage({ health, loadAll, trainModel }) { return <section className="panel"><h2>Service Health</h2><p>Status: {health.status}</p><p>AI provider: {health.aiProvider}</p><p>AI model: {health.aiModel}</p><p>AI configured: {String(health.aiConfigured)}</p><p>ML model: {health.ml?.modelVersion}</p><p>Dataset rows: {health.ml?.datasetRows}</p><div className="actions"><button onClick={loadAll}>Check Health</button><button className="primary" onClick={trainModel}>Train Predictive Model</button></div></section>; }

function ChartList({ title, rows = [], label, value }) {
  const numericValues = rows.map((row) => Math.abs(Number(row[value]))).filter(Number.isFinite);
  const maxValue = Math.max(...numericValues, 1);
  return <section className={`panel chartPanel ${rows.length > 5 ? 'denseChartPanel' : ''}`}>
    <div className="chartListHeader">
      <h2>{title}</h2>
      {rows.length > 0 && <span>{rows.length}</span>}
    </div>
    {rows.length === 0 && <p>No data yet.</p>}
    <div className="chartListBody">
      {rows.map((row, index) => {
        const labelText = row[label];
        const metricValue = row[value];
        return <div className="chartRow compact" key={labelText || index}>
          <span className="chartRank">{index + 1}</span>
          <div className="chartLabel">
            <strong title={labelText}>{labelText}</strong>
            <div className="barTrack"><div className="barFill impactBar" style={{ width: relativeWidth(metricValue, maxValue) }}/></div>
          </div>
          <b>{formatCell(metricValue)}</b>
        </div>;
      })}
    </div>
  </section>;
}
function DonutChart({ title, rows = [], label, value }) {
  const total = rows.reduce((sum, row) => sum + Math.max(0, Number(row[value]) || 0), 0);
  const colors = ['#1b63d8', '#087f8c', '#1f7a4d', '#b86100', '#6656c7', '#bf3b3b'];
  let offset = 25;
  return <section className="panel chartPanel"><h2>{title}</h2>{total <= 0 ? <p>No data yet.</p> : <div className="donutLayout"><svg viewBox="0 0 42 42" className="donutChart" role="img" aria-label={title}>{rows.map((row, index) => { const amount = Math.max(0, Number(row[value]) || 0); const dash = amount / total * 100; const item = <circle key={row[label] || index} cx="21" cy="21" r="15.915" fill="transparent" stroke={colors[index % colors.length]} strokeWidth="6" strokeDasharray={`${dash} ${100 - dash}`} strokeDashoffset={offset}><title>{row[label]}: {amount}</title></circle>; offset -= dash; return item; })}<text x="21" y="20" textAnchor="middle" className="donutValue">{total}</text><text x="21" y="25" textAnchor="middle" className="donutLabel">total</text></svg><div className="chartLegend">{rows.map((row, index) => <div key={row[label] || index}><i style={{ background: colors[index % colors.length] }}/><span>{row[label]}</span><strong>{row[value]}</strong></div>)}</div></div>}</section>;
}
function O2CImpactMap({ rows = [] }) {
  const sorted = [...rows].sort((a, b) => Number(b.averageImpactScore) - Number(a.averageImpactScore));
  return <section className="panel widePanel o2cMapPanel compactPanel"><div className="panelHeader"><div><h2>O2C Impact Heatmap</h2><p>Impact areas are grouped by severity and sized visually by average impact score.</p></div><span className="badge">{rows.length} areas</span></div>{sorted.length === 0 ? <p>No O2C impact data yet.</p> : <div className="o2cMatrix">{sorted.map((item) => <div className={`o2cTile ${riskTone(item.averageImpactScore)}`} key={item.area} title={`${item.area}: ${item.averageImpactScore} (${item.severity})`}><div><strong>{item.area}</strong><span>{item.severity}</span></div><b>{formatCell(item.averageImpactScore)}</b><div className="tileIntensity"><i style={{ width: pctWidth(item.averageImpactScore) }}/></div></div>)}</div>}</section>;
}
function RiskRevenueScatter({ rows = [] }) {
  const usable = rows.filter((row) => Number.isFinite(Number(row.riskScore)) && Number.isFinite(Number(row.revenueImpact)));
  const revenueValues = usable.map((row) => Number(row.revenueImpact));
  const minRevenue = Math.min(...revenueValues, 0);
  const maxRevenue = Math.max(...revenueValues, 10);
  const revenueRange = Math.max(1, maxRevenue - minRevenue);
  const topRows = [...usable].sort((a, b) => Number(b.revenueImpact) - Number(a.revenueImpact)).slice(0, 4);
  return <section className="panel widePanel visualPanel compactPanel"><div className="panelHeader"><div><h2>Risk vs Revenue Opportunity</h2><p>Bubble position shows risk and revenue impact. Size reflects transaction volume.</p></div><span className="badge">{usable.length} scenarios</span></div>{usable.length === 0 ? <p>No scenario comparison data yet.</p> : <div className="scatterLayout"><div className="scatterCanvas" role="img" aria-label="Risk versus revenue opportunity bubble chart"><div className="axisLabel yAxisLabel">Revenue impact</div><div className="axisLabel xAxisLow">Lower risk</div><div className="axisLabel xAxisHigh">Higher risk</div><div className="axisValue yTop">{maxRevenue.toFixed(1)}%</div><div className="axisValue yBottom">{minRevenue.toFixed(1)}%</div>{usable.map((row, index) => { const x = 8 + clampNum(row.riskScore, 0, 100) * 0.84; const y = ((Number(row.revenueImpact) - minRevenue) / revenueRange) * 100; const size = Math.max(0.75, Math.min(1.85, Math.log10((Number(row.transactionVolume) || 1) + 1) / 2.5)); return <button type="button" className={`bubblePoint ${riskTone(row.riskScore)}`} key={row.scenarioName || index} style={{ left: `${x}%`, bottom: `${clampNum(y, 12, 88)}%`, width: `${size}rem`, height: `${size}rem` }} title={`${row.scenarioName}: risk ${formatCell(row.riskScore)}, revenue ${formatCell(row.revenueImpact)}%, volume ${formatCell(row.transactionVolume)}`}/>; })}</div><div className="scatterSummary"><span className="eyebrow">Top revenue impact</span>{topRows.map((row) => <div className="scatterSummaryRow" key={row.scenarioName}><strong title={row.scenarioName}>{row.scenarioName}</strong><span>{formatCell(row.revenueImpact)}% revenue | {formatCell(row.riskScore)} risk</span></div>)}</div></div>}</section>;
}
function AttentionInsights({ rows = [] }) {
  return <section className="panel widePanel"><div className="panelHeader"><div><h2>Scenarios Requiring Attention</h2><p>Highest-risk scenarios are summarized as priority cards for faster executive review.</p></div><span className="badge">{rows.length} flagged</span></div>{rows.length === 0 ? <p>No scenarios require attention.</p> : <div className="attentionGrid">{rows.slice(0, 6).map((row) => <div className="attentionCard" key={row.scenarioId || row.scenarioName}><div><strong title={row.scenarioName}>{row.scenarioName}</strong><span>{row.businessModelType}</span></div><RiskBadge value={row.riskScore}/><ProgressMetric label="Compliance" value={row.complianceRisk}/><ProgressMetric label="Delay" value={row.delayProbability}/><small>{row.mostImpactedArea}</small></div>)}</div>}</section>;
}
function ActivityTrend({ rows = [] }) {
  return <section className="panel chartPanel activityPanel"><div className="panelHeader"><div><h2>Recent Scenario Activity</h2><p>Latest portfolio movements and recommendation status.</p></div><span className="badge">{rows.length} events</span></div>{rows.length === 0 ? <p>No activity yet.</p> : <div className="activityTimeline">{rows.slice(0, 6).map((item, index) => <div className="activityItem" key={item.scenarioId + item.timestamp}><span className="activityDot">{index + 1}</span><div><strong title={item.scenarioName}>{item.scenarioName}</strong><small>{item.timestamp ? new Date(item.timestamp).toLocaleString() : 'Recent update'}</small></div><StatusPill value={item.recommendationStatus}/></div>)}</div>}</section>;
}
function LineChart({ rows = [] }) {
  const points = rows.map((row, index) => `${8 + (index / Math.max(1, rows.length - 1)) * 86},${52 - (Number(row.value) / Math.max(1, rows.length)) * 42}`);
  return <svg className="lineChart" viewBox="0 0 100 60" preserveAspectRatio="none" role="img" aria-label="Activity trend"><polyline points={points.join(' ')}/>{rows.map((row, index) => { const [x, y] = points[index].split(',').map(Number); return <circle key={row.label + index} cx={x} cy={y} r="1.8"><title>{row.label}: {row.status}</title></circle>; })}</svg>;
}
function ImpactAreaHeatmap({ rows = [] }) {
  return <section className="panel widePanel"><div className="panelHeader"><div><h2>O2C Impact Matrix</h2><p>Impact areas are shown as heatmap cards so severe areas stand out immediately.</p></div><span className="badge">{rows.length} areas</span></div>{rows.length === 0 ? <p>Run analysis to view O2C impact areas.</p> : <div className="impactAreaGrid">{rows.map((row) => <div className={`impactAreaCard ${riskTone(row.score)}`} key={row.label}><div><strong>{row.label}</strong><span>{row.severity}</span></div><ScoreMeter value={row.score}/><p title={row.reason}>{row.reason}</p><small>{row.dependencyCount} dependencies</small></div>)}</div>}</section>;
}
function MetricInsightGrid({ rows = [] }) {
  return <div className="metricInsightGrid">{rows.length === 0 ? <p>No metric breakdown available.</p> : rows.map((row) => <div className="metricInsight" key={row.label}><span>{row.label}</span><strong>{formatMetricWithUnit(row.value, row.unit)}</strong><ProgressMetric value={row.value}/><small>{row.source}</small></div>)}</div>;
}
function ComparisonVisual({ rows = [] }) {
  const changed = rows.filter((row) => !sameValue(row.original, row.suggested)).length;
  const numericRows = rows.filter((row) => isNumericLike(row.original) && isNumericLike(row.suggested));
  return <section className="panel comparisonPanel"><div className="panelHeader"><div><h2>Current vs Suggested Model</h2><p>Only meaningful differences are emphasized; unchanged fields stay visually quiet.</p></div><div className="comparisonSummary"><span>{changed} changed</span><span>{numericRows.length} numeric</span></div></div>{rows.length === 0 ? <p>No suggested model is available for comparison.</p> : <div className="comparisonGrid improved">{rows.map((row) => <ComparisonCard row={row} key={row.name}/>)}</div>}</section>;
}
function ComparisonCard({ row }) {
  const numeric = isNumericLike(row.original) && isNumericLike(row.suggested);
  const changed = !sameValue(row.original, row.suggested);
  const original = Number(row.original);
  const suggested = Number(row.suggested);
  const max = numeric ? Math.max(Math.abs(original), Math.abs(suggested), 1) : 1;
  return <div className={`comparisonCard improved ${changed ? 'changed' : 'same'}`}><div className="comparisonCardHeader"><strong>{row.name}</strong><span>{changed ? 'Changed' : 'No change'}</span></div>{numeric ? <div className="numberCompare"><div><span>Current</span><b>{formatCell(row.original)}</b><i><em style={{ width: `${Math.max(5, Math.abs(original) / max * 100)}%` }}/></i></div><div><span>Suggested</span><b>{formatCell(row.suggested)}</b><i><em style={{ width: `${Math.max(5, Math.abs(suggested) / max * 100)}%` }}/></i></div></div> : <div className="categoryCompare"><div><span>Current</span><b title={row.original}>{formatCell(row.original)}</b></div><ArrowDownRight size={18}/><div><span>Suggested</span><b title={row.suggested}>{formatCell(row.suggested)}</b></div></div>}<DeltaBadge value={row.changeText || delta(row.original, row.suggested)}/></div>;
}
function ScoreComparisonBars({ rows = [] }) {
  return <div className="scoreComparison">{rows.length === 0 ? <p>No score comparison available.</p> : rows.map((row) => <div className="scoreCompareRow" key={row.name}><div><strong>{row.name}</strong><DeltaBadge value={row.change}/></div><div className="dualBars"><ProgressMetric label="Current" value={row.original}/><ProgressMetric label="Suggested" value={row.suggested}/></div></div>)}</div>;
}
function ProgressMetric({ label, value }) {
  return <div className="progressMetric">{label && <span>{label}</span>}<div className="progressTrack"><i style={{ width: pctWidth(value) }}/></div><strong>{formatCell(value)}</strong></div>;
}
function CompareScenarioTable({ rows = [], renameScenario, deleteScenario, loading }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'rank', direction: 'asc' });
  const visibleRows = useMemo(() => sortRows(filterRows(rows, query), sort), [rows, query, sort]);
  const headers = [
    ['rank', 'Rank'], ['name', 'Scenario'], ['recommendationScore', 'Fit'], ['risk', 'Risk'],
    ['revenueImpact', 'Revenue'], ['implementationEffort', 'Effort'], ['compliance', 'Compliance'],
    ['delayProbability', 'Delay'], ['dependencyCount', 'Deps']
  ];
  if (!rows.length) return <div className="compareEmpty"><Search size={22}/><strong>No comparison yet</strong><span>Run Compare All Scenarios to generate the ranked decision matrix.</span></div>;
  return <div className="compareDataGrid">
    <div className="tableControls"><div><strong>{visibleRows.length}</strong><span> of {rows.length} scenarios</span></div><div className="input-group input-group-sm tableSearch"><span className="input-group-text"><Search size={14}/></span><input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter scenarios, models, scores"/></div></div>
    <div className="compareTableWrap table-responsive"><table className="table table-hover align-middle mb-0 compareTable"><colgroup><col className="rankCol"/><col className="scenarioCol"/><col className="fitCol"/><col className="riskCol"/><col className="metricCol"/><col className="metricCol"/><col className="metricCol"/><col className="metricCol"/><col className="metricCol"/><col className="actionCol"/></colgroup><thead className="table-light"><tr>{headers.map(([key, label]) => <th key={key} aria-sort={sort.key === key ? sort.direction : 'none'}><button className="sortButton" onClick={() => setSort(nextSort(sort, key))}>{label}<span>{sortIndicator(sort, key)}</span></button></th>)}<th className="actionColumn"></th></tr></thead><tbody>{visibleRows.map((row) => <tr className={Number(row.rank) === 1 ? 'highlightWinner' : ''} key={row.scenarioId || row.name}><td data-label="Rank"><span className={`rankBadge ${Number(row.rank) === 1 ? 'winner' : ''}`}>#{row.rank}</span></td><td data-label="Scenario"><div className="scenarioCell"><strong title={row.name}>{row.name}</strong><span title={row.businessModelType}>{row.businessModelType}</span></div></td><td data-label="Fit"><ScoreMeter value={row.recommendationScore}/></td><td data-label="Risk"><RiskBadge value={row.risk}/></td><td data-label="Revenue"><MetricWithIcon value={row.revenueImpact} icon={TrendingUp} suffix="%"/></td><td data-label="Effort"><MetricWithIcon value={row.implementationEffort} icon={Gauge}/></td><td data-label="Compliance"><MetricWithIcon value={row.compliance} icon={ShieldAlert}/></td><td data-label="Delay"><MetricWithIcon value={row.delayProbability} icon={Clock3} suffix="%"/></td><td data-label="Deps"><MetricWithIcon value={row.dependencyCount} icon={Network}/></td><td data-label="Action"><div className="rowActions"><button className="btn btn-sm btn-outline-primary iconButton" onClick={() => renameScenario(row.scenarioId, row.name)} disabled={loading.renameScenario} title="Rename scenario"><Pencil size={16}/></button><button className="btn btn-sm btn-outline-danger iconDanger" onClick={() => deleteScenario(row.scenarioId, row.name)} disabled={loading.deleteScenario} title="Delete scenario"><Trash2 size={16}/></button></div></td></tr>)}</tbody></table></div>
    {visibleRows.length === 0 && <div className="noData"><Search size={18}/><strong>No matching scenarios</strong><span>Adjust the table filter to see more rows.</span></div>}
  </div>;
}
function DataTable({ rows = [], columns = [], action }) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: columns[0] || '', direction: 'asc' });
  const visibleRows = useMemo(() => sortRows(filterRows(rows, query), sort), [rows, query, sort]);
  return <div className="dataGrid">
    <div className="dataGridTop"><div><strong>{visibleRows.length}</strong><span>{rows.length === visibleRows.length ? (rows.length === 1 ? ' record' : ' records') : ` of ${rows.length} records`}</span></div><div className="input-group input-group-sm tableSearch"><span className="input-group-text"><Search size={14}/></span><input className="form-control" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter table"/></div></div>
    <div className="tableWrap table-responsive"><table className="table table-hover align-middle mb-0 tableModern"><thead className="table-light"><tr>{columns.map((col) => <th key={col} className={columnType(col)} aria-sort={sort.key === col ? sort.direction : 'none'}><button className="sortButton" onClick={() => setSort(nextSort(sort, col))}>{labelize(col)}<span>{sortIndicator(sort, col)}</span></button></th>)}{action && <th>Action</th>}</tr></thead><tbody>{visibleRows.map((row, i) => <tr key={row.id || row.scenarioId || row.name || i}>{columns.map((col) => <td key={col} data-label={labelize(col)} className={columnType(col)} title={cellText(row[col])}>{renderCell(row[col], col, row)}</td>)}{action && <td data-label="Action">{action(row)}</td>}</tr>)}</tbody></table></div>
    {rows.length === 0 && <div className="noData"><Search size={18}/><strong>No data available</strong><span>Run an analysis or create scenarios to populate this view.</span></div>}
    {rows.length > 0 && visibleRows.length === 0 && <div className="noData"><Search size={18}/><strong>No matching rows</strong><span>Adjust the table filter to see more records.</span></div>}
  </div>;
}
function Field({ label, value, onChange, options, textarea, type = 'text', placeholder = '', wide }) { return <label className={wide ? 'field wide' : 'field'}><span className="form-label">{label}</span>{textarea ? <textarea className="form-control" value={value || ''} onChange={(e) => onChange(e.target.value)}/> : options ? <><input className="form-control" list={label} value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}/><datalist id={label}>{options.map((item) => <option key={item} value={item}/>)}</datalist></> : <input className="form-control" type={type} value={value ?? ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}/>}</label>; }
function ScoreMeter({ value }) { return <div className="scoreMeter"><strong>{formatCell(value)}</strong><div className="scoreTrack"><span style={{ width: pctWidth(value) }}/></div></div>; }
function RiskBadge({ value }) { return <span className={`riskBadge ${riskTone(value)}`}><ShieldAlert size={14}/>{formatCell(value)}</span>; }
function MetricWithIcon({ value, icon: Icon = Layers3, suffix = '' }) { return <span className="metricCell"><Icon size={14}/>{formatCell(value)}{suffix}</span>; }
function StatusPill({ value }) { return <span className={`statusPill ${statusTone(value)}`}>{value || 'Updated'}</span>; }

function makeApi(base, key) { return async (path, options = {}) => { const response = await fetch(base + path, { ...options, headers: { 'Content-Type': 'application/json', 'x-api-key': key, ...(options.headers || {}) } }); if (!response.ok) { const body = await response.json().catch(() => ({})); const error = new Error(body.customerMessage || body.message || 'API request failed'); error.errorCode = body.errorCode; error.details = body.details; throw error; } return response.json(); }; }
function buildScenarioPayload(draft, fields) { const custom = String(draft.complianceRegionsText || '').split(',').map((x) => x.trim()).filter(Boolean); const complianceRegions = [...new Set([...(draft.complianceRegions || []), ...custom])]; return { name: draft.name, description: draft.description, businessModelType: draft.businessModelType, industry: draft.industry, customerSegment: draft.customerSegment, region: draft.region, pricingType: draft.pricingType, contractTerm: toContractMonths(draft.contractTerm), billingFrequency: draft.billingFrequency, fundingModel: draft.fundingModel, bundleType: draft.bundleType, transactionVolume: toNumberOrBand(draft.transactionVolume, draft.transactionVolumeBand, fields.transactionVolumeBands), expectedRevenue: toNumberOrBand(draft.expectedRevenue, draft.expectedRevenueBand, fields.expectedRevenueBands), complianceRegions, integrationCount: Number(draft.integrationCount), processComplexity: toNumberOrBand(draft.processComplexity, draft.processComplexityBand, fields.processComplexities) }; }
function validateDraft(draft) { const required = ['name','businessModelType','industry','customerSegment','region','pricingType','billingFrequency','fundingModel','bundleType']; const missing = required.filter((field) => !draft[field]); if (missing.length) throw new Error(`Complete mandatory fields before saving: ${missing.join(', ')}`); if (!draft.complianceRegions.length) throw new Error('Add at least one compliance region.'); if (!draft.transactionVolume || !draft.expectedRevenue || !draft.processComplexity) throw new Error('Provide transaction volume, expected revenue and process complexity.'); }
function toContractMonths(value) { const text = String(value || '').trim().toLowerCase(); if (!text || text.includes('no fixed')) return 1; const match = text.match(/\d+/); return match ? Number(match[0]) : Number(value || 1); }
function toNumberOrBand(value, band, options = []) { const numeric = Number(String(value || '').replace(/,/g, '')); if (Number.isFinite(numeric) && numeric > 0) return numeric; const found = options.find((item) => item.label === band || String(item.value) === String(band)); return found ? Number(found.value) : Number(band || 0); }
function objectToRows(value) { if (!value) return []; return Object.keys(value).map((key) => typeof value[key] === 'object' ? { name: key, score: value[key].score, severity: value[key].severity } : { name: key, score: value[key] }); }
function prepareCharts(charts) { return { ...charts, o2cImpactByArea: charts.o2cImpactByArea || [], dependencyDistribution: charts.dependencyDistribution || [], severityBreakdown: charts.severityBreakdown || [] }; }
function prepareComparisonDetails(details) { return { ...details, charts: details.charts || {} }; }
function renameComparisonDetails(details, previousName, name) {
  if (!details || !previousName) return details;
  const renameRows = (rows = []) => rows.map((row) => row.label === previousName ? { ...row, label: name } : row);
  return {
    ...details,
    charts: {
      ...(details.charts || {}),
      revenueImpactComparison: renameRows(details.charts?.revenueImpactComparison),
      riskComparison: renameRows(details.charts?.riskComparison),
      dependencyCountComparison: renameRows(details.charts?.dependencyCountComparison)
    }
  };
}
function prepareSuggestion(suggestion) { if (suggestion.noBetterModelFound) return { ...suggestion, scoreRows: [] }; const rows = [{ name: 'Recommendation Score', original: suggestion.originalScore?.recommendationScore, suggested: suggestion.suggestedScore?.recommendationScore }, { name: 'Risk', original: suggestion.originalScore?.risk, suggested: suggestion.suggestedScore?.risk }, { name: 'Effort', original: suggestion.originalScore?.implementationEffort, suggested: suggestion.suggestedScore?.implementationEffort }, { name: 'Revenue Impact', original: suggestion.originalImpact?.revenueImpact, suggested: suggestion.suggestedImpact?.revenueImpact }]; return { ...suggestion, scoreRows: rows.map((row) => ({ ...row, change: delta(row.original, row.suggested) })) }; }
function canAct(suggestion, loading) { return suggestion?.suggestionId && suggestion?.suggestedScenario && !loading.recommendationAction && suggestion.status !== 'accepted' && suggestion.status !== 'discarded'; }
function pctWidth(value) { return `${Math.max(4, Math.min(100, Math.round(Number(value) || 0)))}%`; }
function relativeWidth(value, maxValue) { return `${Math.max(4, Math.min(100, Math.round(Math.abs(Number(value) || 0) / Math.max(1, maxValue) * 100)))}%`; }
function clampNum(value, min = 0, max = 100) { return Math.max(min, Math.min(max, Number(value) || 0)); }
function confidenceText(value) { return `${Math.round((Number(value) || 0) * 100)}% confidence`; }
function labelize(value = '') { return String(value).replace(/([A-Z])/g, ' $1').replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^./, (c) => c.toUpperCase()); }
function formatCell(value) { if (Array.isArray(value)) return value.join(', '); if (value && typeof value === 'object') return JSON.stringify(value); if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toLocaleString(undefined, { maximumFractionDigits: 2 }); return value ?? ''; }
function formatMetric(value) { const number = Number(value); if (!Number.isFinite(number)) return value ?? '0'; return `${number > 0 ? '+' : ''}${Number.isInteger(number) ? number : number.toFixed(1)}${Math.abs(number) <= 100 ? '%' : ''}`; }
function formatMetricWithUnit(value, unit) { const text = formatCell(value); return unit ? `${text}${unit === '%' ? '%' : ` ${unit}`}` : text; }
function filterRows(rows, query) { const needle = String(query || '').trim().toLowerCase(); if (!needle) return rows; return rows.filter((row) => Object.values(row || {}).some((value) => cellText(value).toLowerCase().includes(needle))); }
function sortRows(rows, sort) { if (!sort?.key) return rows; return [...rows].sort((a, b) => compareValues(a?.[sort.key], b?.[sort.key]) * (sort.direction === 'desc' ? -1 : 1)); }
function compareValues(a, b) { const an = Number(a), bn = Number(b); if (Number.isFinite(an) && Number.isFinite(bn)) return an - bn; return cellText(a).localeCompare(cellText(b), undefined, { numeric: true, sensitivity: 'base' }); }
function nextSort(current, key) { return { key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }; }
function sortIndicator(sort, key) { if (sort.key !== key) return '↕'; return sort.direction === 'asc' ? '↑' : '↓'; }
function cellText(value) { if (Array.isArray(value)) return value.join(', '); if (value && typeof value === 'object') return JSON.stringify(value); return String(value ?? ''); }
function isNumericLike(value) { return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)); }
function sameValue(a, b) { return cellText(a).trim().toLowerCase() === cellText(b).trim().toLowerCase(); }
function columnType(col) { const key = String(col).toLowerCase(); if (['severity','status','recommendationstatus','source','unit'].includes(key)) return 'cellBadge'; if (key.includes('score') || key.includes('risk') || key.includes('effort') || key.includes('impact') || key.includes('probability') || key.includes('confidence') || ['value','original','suggested','change','rank','dependencycount','integrationcount','transactionvolume'].includes(key)) return 'cellNumeric'; return ''; }
function renderCell(value, col, row) {
  const key = String(col).toLowerCase();
  if (['severity','status','recommendationstatus','source'].includes(key)) return <span className={`statusChip ${statusTone(value)}`}>{formatCell(value)}</span>;
  if (key === 'change' || key === 'changetext') return <DeltaBadge value={value}/>;
  if (columnType(col) === 'cellNumeric' && Number.isFinite(Number(value))) return <NumericCell value={Number(value)} col={col}/>;
  if (key === 'name' || key.includes('scenario')) return <span className="primaryCell">{formatCell(value)}</span>;
  return formatCell(value);
}
function NumericCell({ value, col }) { const positive = value > 0; return <span className="numericCell"><span>{formatCell(value)}</span>{shouldShowMiniBar(col) && <i><b style={{ width: pctWidth(Math.abs(value)) }}/></i>}{positive ? <ArrowUpRight size={13}/> : value < 0 ? <ArrowDownRight size={13}/> : <Minus size={13}/>}</span>; }
function DeltaBadge({ value }) { const number = typeof value === 'number' ? value : Number(String(value || '').replace(/[+%]/g, '')); const tone = number > 0 ? 'up' : number < 0 ? 'down' : 'flat'; const Icon = number > 0 ? TrendingUp : number < 0 ? TrendingDown : Minus; return <span className={`deltaBadge ${tone}`}><Icon size={14}/>{formatMetric(Number.isFinite(number) ? number : value)}</span>; }
function statusTone(value) { const text = String(value || '').toLowerCase(); if (text.includes('very high') || text.includes('error') || text.includes('discard')) return 'danger'; if (text.includes('high') || text.includes('warning') || text.includes('pending')) return 'warn'; if (text.includes('accepted') || text.includes('success') || text.includes('low') || text.includes('ready')) return 'good'; return 'neutral'; }
function riskTone(value) { const number = Number(value); if (number >= 70) return 'danger'; if (number >= 50) return 'warn'; return 'good'; }
function shouldShowMiniBar(col) { const key = String(col).toLowerCase(); return key.includes('score') || key.includes('risk') || key.includes('effort') || key.includes('impact') || key.includes('probability') || key === 'value' || key === 'original' || key === 'suggested'; }
function delta(original, suggested) { const next = JsonNumber(suggested) - JsonNumber(original); return Number.isFinite(next) ? Math.round(next * 10) / 10 : ''; }
function JsonNumber(value) { const n = Number(value); return Number.isFinite(n) ? n : 0; }

createRoot(document.getElementById('root')).render(<App />);
