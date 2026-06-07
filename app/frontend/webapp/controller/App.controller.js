sap.ui.define([
  "sap/ui/core/mvc/Controller",
  "sap/m/MessageToast",
  "sap/m/MessageBox"
], function (Controller, MessageToast, MessageBox) {
  "use strict";

  return Controller.extend("bms.controller.App", {
    onInit: function () {
      this.loadAll();
      this.loadDashboard();
    },

    model: function () {
      return this.getOwnerComponent().getModel("app");
    },

    api: async function (path, options) {
      const model = this.model();
      const base = model.getProperty("/apiBase");
      const apiKey = model.getProperty("/apiKey");
      const response = await fetch(base + path, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          ...(options && options.headers ? options.headers : {})
        }
      });
      if (!response.ok) {
        const body = await response.json().catch(function () { return {}; });
        const error = new Error(body.customerMessage || body.message || "API request failed");
        error.errorCode = body.errorCode;
        error.details = body.details;
        error.customerMessage = body.customerMessage;
        throw error;
      }
      return response.json();
    },

    loadAll: async function () {
      try {
        await Promise.all([this.loadScenarios(), this.loadAudit(), this.loadHealth(), this.loadReferenceData()]);
      } catch (error) {
        MessageToast.show(error.message);
      }
    },

    loadReferenceData: async function () {
      const data = await this.api("/api/reference-data/scenario-fields");
      this.model().setProperty("/referenceData", data);
    },

    loadDashboard: async function () {
      const model = this.model();
      model.setProperty("/loading/dashboard", true);
      try {
        const result = await Promise.all([
          this.api("/api/dashboard/summary"),
          this.api("/api/dashboard/charts")
        ]);
        model.setProperty("/dashboard", result[0]);
        model.setProperty("/dashboardCharts", this.prepareDashboardCharts(result[1]));
      } finally {
        model.setProperty("/loading/dashboard", false);
      }
    },

    loadScenarios: async function () {
      const scenarios = await this.api("/api/scenarios");
      this.model().setProperty("/scenarios", scenarios);
      this.model().setProperty("/kpis/scenarios", scenarios.length);
      const selectedId = this.model().getProperty("/selectedScenarioId");
      const selectedScenario = scenarios.find(function (item) { return item.id === selectedId; });
      if (selectedScenario) {
        this.model().setProperty("/selectedScenario", selectedScenario);
      } else if (scenarios.length) {
        this.model().setProperty("/selectedScenarioId", scenarios[0].id);
        this.model().setProperty("/selectedScenario", scenarios[0]);
      } else {
        this.model().setProperty("/selectedScenarioId", "");
        this.model().setProperty("/selectedScenario", null);
      }
    },

    loadAudit: async function () {
      this.model().setProperty("/audit", await this.api("/api/audit"));
    },

    loadHealth: async function () {
      this.model().setProperty("/health", await this.api("/api/health"));
    },

    onRefresh: async function () {
      await this.loadAll();
      if (this.model().getProperty("/activePage") === "dashboard") {
        await this.loadDashboard();
      }
    },

    onNav: function (event) {
      const fallback = {
        "Dashboard": "dashboard",
        "Create Scenario": "create",
        "Impact Analysis": "impact",
        "Compare Scenarios": "compare",
        "Compare": "compare",
        "Impact": "impact",
        "Prediction": "prediction",
        "AI Recommendation": "recommendation",
        "Audit Trail": "audit",
        "History": "audit",
        "Settings": "admin",
        "Admin": "admin"
      };
      const key = event.getSource().data("key") || fallback[event.getSource().getText()];
      if (!key || this.model().getProperty("/activePage") === key) {
        if (key === "recommendation") this.loadRecommendationView();
        return;
      }
      this.navigateToPage(key);
      if (key === "dashboard") {
        this.loadDashboard();
      }
      if (key === "recommendation") {
        this.loadRecommendationView();
      }
    },

    navigateToPage: function (key) {
      this.model().setProperty("/activePage", key);
      this.byId("tabs").setSelectedKey(key);
    },

    onSelectScenario: function () {
      const id = this.model().getProperty("/selectedScenarioId");
      const scenario = this.model().getProperty("/scenarios").find(function (item) { return item.id === id; });
      this.model().setProperty("/selectedScenario", scenario || null);
      if (this.model().getProperty("/activePage") === "recommendation") {
        this.loadRecommendationView(id);
      }
    },

    onScenarioTableSelect: function (event) {
      const item = event.getParameter("listItem");
      const scenario = item.getBindingContext("app").getObject();
      this.model().setProperty("/selectedScenarioId", scenario.id);
      this.model().setProperty("/selectedScenario", scenario);
    },

    onCreateScenario: async function () {
      await this.saveScenario(false);
    },

    onCreateAndAnalyzeScenario: async function () {
      await this.saveScenario(true);
    },

    saveScenario: async function (runAnalysis) {
      try {
        this.model().setProperty("/loading/createScenario", true);
        this.model().setProperty("/formError", null);
        const draft = { ...this.model().getProperty("/newScenario") };
        const selectedCompliance = draft.complianceRegions || [];
        const customCompliance = String(draft.complianceRegionsText || "")
          .split(",")
          .map(function (item) { return item.trim(); })
          .filter(Boolean);
        draft.complianceRegions = selectedCompliance.concat(customCompliance).filter(function (item, index, values) {
          return item && values.indexOf(item) === index;
        });
        delete draft.complianceRegionsText;
        draft.contractTerm = this.toContractMonths(draft.contractTerm);
        draft.transactionVolume = this.toNumberOrBand(draft.transactionVolume, draft.transactionVolumeBand, "/referenceData/fields/transactionVolumeBands");
        draft.expectedRevenue = this.toNumberOrBand(draft.expectedRevenue, draft.expectedRevenueBand, "/referenceData/fields/expectedRevenueBands");
        draft.integrationCount = Number(draft.integrationCount);
        draft.processComplexity = this.toNumberOrBand(draft.processComplexity, draft.processComplexityBand, "/referenceData/fields/processComplexities");
        delete draft.transactionVolumeBand;
        delete draft.expectedRevenueBand;
        delete draft.processComplexityBand;
        this.validateDraft(draft);
        const scenario = await this.api("/api/scenarios", { method: "POST", body: JSON.stringify(draft) });
        this.model().setProperty("/selectedScenarioId", scenario.id);
        this.model().setProperty("/selectedScenario", scenario);
        await this.loadScenarios();
        MessageToast.show("Scenario saved");
        if (runAnalysis) {
          await this.onAnalyzeSelected();
        }
      } catch (error) {
        this.model().setProperty("/formError", error.message);
        MessageBox.error(error.message);
      } finally {
        this.model().setProperty("/loading/createScenario", false);
      }
    },

    onAnalyzeSelected: async function () {
      const id = this.model().getProperty("/selectedScenarioId");
      if (!id) {
        MessageToast.show("Select a scenario first");
        return;
      }
      try {
        this.navigateToPage("impact");
        const analysis = await this.api("/api/scenarios/" + id + "/analyze", { method: "POST" });
        analysis.impactRows = this.objectToRows(analysis.impact.o2cImpactScores);
        analysis.predictionRows = this.objectToRows(analysis.prediction.predictions);
        this.model().setProperty("/analysis", analysis);
        const detailResults = await Promise.all([
          this.api("/api/scenarios/" + id + "/impact/details"),
          this.api("/api/scenarios/" + id + "/charts")
        ]);
        this.model().setProperty("/impactDetails", detailResults[0]);
        this.model().setProperty("/scenarioCharts", this.prepareScenarioCharts(detailResults[1]));
        this.model().setProperty("/suggestion", null);
        this.model().setProperty("/suggestionVisible", false);
        await this.loadRecommendationView(id);
        this.updateKpis();
        await this.loadAudit();
        MessageToast.show("Analysis complete");
      } catch (error) {
        MessageBox.error(error.message);
      }
    },

    onCompareAll: async function () {
      const scenarios = this.model().getProperty("/scenarios");
      if (scenarios.length < 2) {
        MessageToast.show("Create at least two scenarios");
        return;
      }
      try {
        this.model().setProperty("/loading/comparison", true);
        const result = await this.api("/api/scenarios/compare/details", {
          method: "POST",
          body: JSON.stringify({ scenarioIds: scenarios.map(function (item) { return item.id; }) })
        });
        this.model().setProperty("/comparison", result.ranking);
        this.model().setProperty("/comparisonDetails", this.prepareComparisonDetails(result));
        this.updateComparisonKpis(result.ranking);
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        this.model().setProperty("/loading/comparison", false);
      }
    },

    onDeleteScenarioFromCompare: function (event) {
      const row = event.getSource().getBindingContext("app")?.getObject();
      if (!row?.scenarioId) {
        MessageToast.show("Scenario is not available for deletion");
        return;
      }
      MessageBox.confirm("Delete scenario \"" + row.name + "\" and its analysis history from this local workspace?", {
        title: "Delete Scenario",
        actions: ["Delete", MessageBox.Action.CANCEL],
        emphasizedAction: "Delete",
        onClose: async function (action) {
          if (action === "Delete") {
            await this.deleteScenario(row.scenarioId);
          }
        }.bind(this)
      });
    },

    deleteScenario: async function (scenarioId) {
      try {
        this.model().setProperty("/loading/deleteScenario", true);
        const result = await this.api("/api/scenarios/" + scenarioId, { method: "DELETE" });
        this.removeDeletedScenarioFromClientState(scenarioId);
        await this.loadScenarios();
        await Promise.all([this.loadAudit(), this.loadDashboard()]);
        const remaining = this.model().getProperty("/scenarios") || [];
        if (this.model().getProperty("/activePage") === "compare" && remaining.length >= 2) {
          await this.onCompareAll();
        }
        MessageToast.show(result.message || "Scenario deleted");
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        this.model().setProperty("/loading/deleteScenario", false);
      }
    },

    removeDeletedScenarioFromClientState: function (scenarioId) {
      const comparison = (this.model().getProperty("/comparison") || []).filter(function (item) {
        return item.scenarioId !== scenarioId;
      });
      this.model().setProperty("/comparison", comparison);
      if (comparison.length < 2) {
        this.model().setProperty("/comparisonDetails", null);
      }
      const selectedId = this.model().getProperty("/selectedScenarioId");
      if (selectedId === scenarioId) {
        this.model().setProperty("/analysis", null);
        this.model().setProperty("/impactDetails", null);
        this.model().setProperty("/scenarioCharts", null);
        this.model().setProperty("/recommendationView", null);
        this.model().setProperty("/suggestion", null);
        this.model().setProperty("/suggestionVisible", false);
      }
    },

    goCreateScenario: function () {
      this.navigateToPage("create");
    },

    goRecommendation: function () {
      this.navigateToPage("recommendation");
      this.loadRecommendationView();
    },

    openImpactFromRow: function (event) {
      const row = event.getSource().getBindingContext("app")?.getObject();
      if (row?.scenarioId) {
        this.model().setProperty("/selectedScenarioId", row.scenarioId);
        this.onSelectScenario();
      }
      this.navigateToPage("impact");
    },

    onSuggestBetterModel: async function () {
      const id = this.model().getProperty("/selectedScenarioId");
      if (!id) {
        MessageToast.show("Select a scenario first");
        return;
      }
      if (!this.model().getProperty("/analysis") && !this.model().getProperty("/recommendationView/originalPrediction")) {
        MessageToast.show("Run impact analysis first");
        return;
      }
      try {
        this.model().setProperty("/loading/suggestion", true);
        this.model().setProperty("/suggestionError", null);
        this.model().setProperty("/suggestionProgress", "Analyzing current impact results...");
        await this.delay(350);
        this.model().setProperty("/suggestionProgress", "Evaluating alternative business models...");
        await this.delay(350);
        this.model().setProperty("/suggestionProgress", "Generating AI recommendation...");
        const suggestion = await this.api("/api/scenarios/" + id + "/suggest-better-model", {
          method: "POST",
          body: JSON.stringify({ comparisonContext: this.model().getProperty("/comparison") || [] })
        });
        this.model().setProperty("/suggestion", this.prepareSuggestion(suggestion));
        this.model().setProperty("/suggestionVisible", true);
        await this.loadRecommendationView(id);
        this.model().setProperty("/suggestionProgress", suggestion.noBetterModelFound ? "Current model appears optimal." : "AI suggestion ready.");
        if (!suggestion.noBetterModelFound && this.model().getProperty("/activePage") === "recommendation") {
          MessageToast.show("Suggested model generated from Ollama and predictive AI.");
        }
      } catch (error) {
        this.model().setProperty("/suggestionError", {
          title: this.errorTitle(error),
          message: error.message,
          details: error.details,
          errorCode: error.errorCode
        });
        this.model().setProperty("/suggestionVisible", false);
      } finally {
        this.model().setProperty("/loading/suggestion", false);
      }
    },

    onRetrySuggestion: function () {
      this.onSuggestBetterModel();
    },

    onUseSuggestedModel: async function () {
      const sourceId = this.model().getProperty("/selectedScenarioId");
      const suggestionId = this.model().getProperty("/recommendationView/suggestionId") || this.model().getProperty("/suggestion/suggestionId");
      const suggestedScenario = this.model().getProperty("/recommendationView/suggestedScenario");
      if (!suggestionId || !suggestedScenario) {
        MessageBox.error("No suggested model is available to use.");
        return;
      }
      try {
        this.model().setProperty("/loading/recommendationAction", true);
        const result = await this.api("/api/scenarios/" + sourceId + "/use-suggested-model", {
          method: "POST",
          body: JSON.stringify({
            suggestionId: suggestionId,
            recommendationId: this.model().getProperty("/recommendationView/recommendationId")
          })
        });
        this.model().setProperty("/selectedScenarioId", result.newScenarioId);
        this.model().setProperty("/selectedScenario", result.scenario);
        await this.loadScenarios();
        await this.onAnalyzeSelected();
        MessageToast.show(result.message);
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        this.model().setProperty("/loading/recommendationAction", false);
      }
    },

    onCompareSuggestion: async function () {
      const sourceId = this.model().getProperty("/selectedScenarioId");
      const suggestionId = this.model().getProperty("/recommendationView/suggestionId") || this.model().getProperty("/suggestion/suggestionId");
      const suggestedScenario = this.model().getProperty("/recommendationView/suggestedScenario");
      const originalScenario = this.model().getProperty("/recommendationView/originalScenario");
      if (!suggestionId || !suggestedScenario || !originalScenario) {
        MessageBox.error("No suggested model is available to compare.");
        return;
      }
      try {
        this.model().setProperty("/loading/recommendationAction", true);
        const result = await this.api("/api/scenarios/" + sourceId + "/compare-suggestion", {
          method: "POST",
          body: JSON.stringify({
            suggestionId: suggestionId,
            recommendationId: this.model().getProperty("/recommendationView/recommendationId")
          })
        });
        this.model().setProperty("/comparison", result.ranking);
        this.model().setProperty("/comparisonDetails", this.prepareComparisonDetails(result));
        this.navigateToPage("compare");
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        this.model().setProperty("/loading/recommendationAction", false);
      }
    },

    onDiscardSuggestion: async function () {
      MessageBox.confirm("Do you want to discard this AI suggestion?", {
        actions: [MessageBox.Action.OK, MessageBox.Action.CANCEL],
        emphasizedAction: MessageBox.Action.OK,
        onClose: async function (action) {
          if (action === MessageBox.Action.OK) {
            await this.discardSuggestion();
          }
        }.bind(this)
      });
    },

    discardSuggestion: async function () {
      const sourceId = this.model().getProperty("/selectedScenarioId");
      const suggestionId = this.model().getProperty("/recommendationView/suggestionId") || this.model().getProperty("/suggestion/suggestionId");
      if (!suggestionId) {
        MessageBox.error("No suggested model is available to discard.");
        return;
      }
      try {
        this.model().setProperty("/loading/recommendationAction", true);
        const result = await this.api("/api/scenarios/" + sourceId + "/discard-suggestion", {
          method: "POST",
          body: JSON.stringify({
            suggestionId: suggestionId,
            recommendationId: this.model().getProperty("/recommendationView/recommendationId")
          })
        });
        this.model().setProperty("/suggestion/status", "discarded");
        await this.loadRecommendationView(sourceId);
        MessageToast.show(result.message);
      } catch (error) {
        MessageBox.error(error.message);
      } finally {
        this.model().setProperty("/loading/recommendationAction", false);
      }
    },

    onRegenerateRecommendation: async function () {
      const id = this.model().getProperty("/selectedScenarioId");
      try {
        this.model().setProperty("/loading/recommendation", true);
        this.model().setProperty("/recommendationError", null);
        this.model().setProperty("/recommendationProgress", "Loading scenario context...");
        await this.delay(250);
        this.model().setProperty("/recommendationProgress", "Running predictive comparison...");
        await this.delay(250);
        this.model().setProperty("/recommendationProgress", "Generating AI recommendation...");
        const result = await this.api("/api/scenarios/" + id + "/recommendation/regenerate", { method: "POST" });
        this.model().setProperty("/recommendationProgress", "Preparing recommendation details...");
        this.applyRecommendationView(result);
        MessageToast.show(result.predictiveOnly ? "Predictive analysis is available; AI recommendation can be retried." : "Recommendation regenerated");
      } catch (error) {
        this.model().setProperty("/recommendationError", error.message);
        MessageBox.error(error.message);
      } finally {
        this.model().setProperty("/loading/recommendation", false);
        this.model().setProperty("/recommendationProgress", "");
      }
    },

    loadRecommendationView: async function (scenarioId) {
      const id = scenarioId || this.model().getProperty("/selectedScenarioId");
      if (!id) return;
      try {
        const view = await this.api("/api/scenarios/" + id + "/recommendation");
        this.applyRecommendationView(view);
      } catch (error) {
        this.model().setProperty("/recommendationError", error.message);
      }
    },

    applyRecommendationView: function (view) {
      const prepared = {
        ...view,
        comparisonRows: view.suggestedScenario ? view.comparisonRows || [] : [],
        predictiveAnalysis: view.predictiveAnalysis || {
          modelVersion: "",
          confidence: 0,
          historicalPatternSummary: "",
          riskDrivers: [],
          topContributingFactors: [],
          predictedOutputs: {}
        },
        customerFriendlyReasoning: view.customerFriendlyReasoning || [],
        riskAndBenefitBreakdown: view.riskAndBenefitBreakdown || [],
        assumptions: view.assumptions || [],
        tradeOffs: view.tradeOffs || []
      };
      this.model().setProperty("/recommendationView", prepared);
      this.model().setProperty("/recommendationError", null);
      if (prepared.suggestionId) {
        this.model().setProperty("/suggestion", {
          ...(this.model().getProperty("/suggestion") || {}),
          suggestionId: prepared.suggestionId,
          status: prepared.suggestionStatus,
          suggestedScenario: prepared.suggestedScenario,
          assumptions: prepared.assumptions,
          tradeOffs: prepared.tradeOffs,
          riskReduction: prepared.expectedBenefits?.riskReduction,
          revenueImprovement: prepared.expectedBenefits?.revenueImprovement,
          effortChange: prepared.expectedBenefits?.effortChange
        });
      }
    },

    onViewPredictionDetails: function () {
      this.navigateToPage("prediction");
    },

    onTrain: async function () {
      try {
        const result = await this.api("/api/train", { method: "POST", body: JSON.stringify({ growthRows: 500, regenerateData: true }) });
        await this.loadHealth();
        MessageToast.show("Model trained on " + result.trainingRows + " rows from " + result.datasetRows + " generated records");
      } catch (error) {
        MessageBox.error(error.message);
      }
    },

    objectToRows: function (value) {
      if (!value) return [];
      return Object.keys(value).map(function (key) {
        const item = value[key];
        if (typeof item === "object") {
          return { name: key, score: item.score, severity: item.severity };
        }
        return { name: key, score: item };
      });
    },

    prepareDashboardCharts: function (charts) {
      return {
        ...charts,
        riskDistribution: this.withBarWidths(charts.riskDistribution || []),
        latestScenarioPerformance: this.withBarWidths(charts.latestScenarioPerformance || [], "risk"),
        revenueVsEffort: charts.revenueVsEffort || [],
        scenarioVolumeTrend: this.withBarWidths(charts.scenarioVolumeTrend || [])
      };
    },

    pctWidth: function (value) {
      return Math.max(4, Math.min(100, Math.round(Number(value) || 0))) + "%";
    },

    countWidth: function (value) {
      const distribution = this.model().getProperty("/dashboard/riskDistribution") || [];
      const max = Math.max.apply(null, distribution.map(function (item) { return Number(item.count || 0); }).concat([1]));
      return Math.max(4, Math.round((Number(value) || 0) / max * 100)) + "%";
    },

    prepareScenarioCharts: function (charts) {
      return {
        ...charts,
        o2cImpactByArea: this.withBarWidths(charts.o2cImpactByArea || []),
        riskEffortBreakdown: this.withBarWidths(charts.riskEffortBreakdown || []),
        dependencyDistribution: this.withBarWidths(charts.dependencyDistribution || []),
        severityBreakdown: this.withBarWidths(charts.severityBreakdown || [])
      };
    },

    prepareComparisonDetails: function (details) {
      const prepared = { ...details };
      prepared.ranking = this.withBarWidths(details.ranking || [], "recommendationScore");
      prepared.charts = {
        ...details.charts,
        revenueImpactComparison: this.withBarWidths(details.charts?.revenueImpactComparison || []),
        riskComparison: this.withBarWidths(details.charts?.riskComparison || []),
        complianceExposure: this.withBarWidths(details.charts?.complianceExposure || []),
        dependencyCountComparison: this.withBarWidths(details.charts?.dependencyCountComparison || [])
      };
      return prepared;
    },

    prepareSuggestion: function (suggestion) {
      if (suggestion.noBetterModelFound) {
        return {
          ...suggestion,
          scoreRows: []
        };
      }
      return {
        ...suggestion,
        scoreRows: [
          { name: "Recommendation Score", original: suggestion.originalScore?.recommendationScore, suggested: suggestion.suggestedScore?.recommendationScore },
          { name: "Risk", original: suggestion.originalScore?.risk, suggested: suggestion.suggestedScore?.risk },
          { name: "Effort", original: suggestion.originalScore?.implementationEffort, suggested: suggestion.suggestedScore?.implementationEffort },
          { name: "Revenue Impact", original: suggestion.originalImpact?.revenueImpact, suggested: suggestion.suggestedImpact?.revenueImpact }
        ]
      };
    },

    delay: function (ms) {
      return new Promise(function (resolve) { setTimeout(resolve, ms); });
    },

    errorTitle: function (error) {
      const titles = {
        AI_REQUEST_TIMEOUT: "AI request timed out",
        GENAI_NETWORK_ERROR: "AI provider is unreachable",
        GENAI_UNAVAILABLE: "GenAI is unavailable",
        INVALID_AI_RESPONSE: "Invalid AI response",
        GENAI_PROVIDER_ERROR: "AI provider error"
      };
      return titles[error.errorCode] || "AI suggestion failed";
    },

    validateDraft: function (draft) {
      const required = ["name", "businessModelType", "industry", "customerSegment", "region", "pricingType", "billingFrequency", "fundingModel", "bundleType"];
      const missing = required.filter(function (field) { return !draft[field]; });
      if (missing.length) {
        throw new Error("Complete mandatory fields before saving: " + missing.join(", "));
      }
      if (!draft.complianceRegions.length) throw new Error("Add at least one compliance region.");
      if (!draft.transactionVolume || !draft.expectedRevenue || !draft.processComplexity) {
        throw new Error("Provide transaction volume, expected revenue and process complexity.");
      }
    },

    toContractMonths: function (value) {
      const text = String(value || "").trim().toLowerCase();
      if (!text || text.includes("no fixed")) return 1;
      const match = text.match(/\d+/);
      return match ? Number(match[0]) : Number(value || 1);
    },

    toNumberOrBand: function (value, band, referencePath) {
      const numeric = Number(String(value || "").replace(/,/g, ""));
      if (Number.isFinite(numeric) && numeric > 0) return numeric;
      const options = this.model().getProperty(referencePath) || [];
      const found = options.find(function (item) { return item.label === band || String(item.value) === String(band); });
      return found ? Number(found.value) : Number(band || 0);
    },

    navType: function (activePage, key) {
      return activePage === key ? "Emphasized" : "Transparent";
    },

    recommendationBadge: function (risk) {
      const value = Number(risk || 0);
      if (this.model().getProperty("/recommendationView/suggestionId")) return "Better Alternative Found";
      if (value >= 75) return "High Risk";
      if (value >= 55) return "Needs Review";
      return "Recommended";
    },

    recommendationBadgeState: function (risk) {
      const value = Number(risk || 0);
      if (this.model().getProperty("/recommendationView/suggestionId")) return "Information";
      if (value >= 75) return "Error";
      if (value >= 55) return "Warning";
      return "Success";
    },

    canUseSuggestion: function (suggestionId, status, loading, suggestedScenario) {
      return Boolean(suggestionId && suggestedScenario) && !loading && status !== "accepted" && status !== "discarded";
    },

    canCompareSuggestion: function (originalScenario, suggestedScenario, loading, status) {
      return Boolean(originalScenario && suggestedScenario) && !loading && status !== "discarded";
    },

    canDiscardSuggestion: function (suggestionId, status, loading) {
      return Boolean(suggestionId) && !loading && status !== "accepted" && status !== "discarded";
    },

    canRequestSuggestion: function (loadingSuggestion, loadingAction, predictiveOnly, originalPrediction) {
      return Boolean(originalPrediction) && !loadingSuggestion && !loadingAction;
    },

    withBarWidths: function (rows, valueKey) {
      const key = valueKey || "value";
      const max = Math.max.apply(null, rows.map(function (row) { return Math.abs(Number(row[key] || row.value || 0)); }).concat([1]));
      return rows.map(function (row) {
        const value = Number(row[key] ?? row.value ?? 0);
        return { ...row, barWidth: Math.max(4, Math.round(Math.abs(value) / max * 100)) + "%" };
      });
    },

    scoreState: function (score) {
      if (score >= 75) return "Error";
      if (score >= 55) return "Warning";
      return "Success";
    },

    severityState: function (severity) {
      if (severity === "Very High" || severity === "High") return "Error";
      if (severity === "Medium") return "Warning";
      return "Success";
    },

    confidencePct: function (value) {
      return Math.round((Number(value) || 0) * 100);
    },

    confidenceText: function (value) {
      return Math.round((Number(value) || 0) * 100) + "% confidence";
    },

    joinList: function (value) {
      return Array.isArray(value) ? value.join(", ") : value || "";
    },

    updateKpis: function () {
      const analysis = this.model().getProperty("/analysis");
      if (!analysis) return;
      this.model().setProperty("/kpis/avgRisk", Math.round(analysis.prediction.predictions.implementationRisk));
      this.model().setProperty("/kpis/avgRevenue", Math.round(analysis.prediction.predictions.revenueImpactPct));
      this.model().setProperty("/kpis/aiSource", analysis.recommendation.content.source);
    },

    updateComparisonKpis: function (comparison) {
      if (!comparison.length) return;
      const avgRisk = comparison.reduce(function (sum, item) { return sum + item.risk; }, 0) / comparison.length;
      const avgRevenue = comparison.reduce(function (sum, item) { return sum + item.revenuePotential; }, 0) / comparison.length;
      this.model().setProperty("/kpis/avgRisk", Math.round(avgRisk));
      this.model().setProperty("/kpis/avgRevenue", Math.round(avgRevenue - 50));
    }
  });
});
