sap.ui.define([
  "sap/ui/core/UIComponent",
  "sap/ui/model/json/JSONModel"
], function (UIComponent, JSONModel) {
  "use strict";

  return UIComponent.extend("bms.Component", {
    metadata: { manifest: "json" },
    init: function () {
      UIComponent.prototype.init.apply(this, arguments);
      this.setModel(new JSONModel({
        apiBase: "http://localhost:4000",
        apiKey: "local-dev-key",
        activePage: "dashboard",
        scenarios: [],
        selectedScenarioId: "",
        selectedScenario: null,
        analysis: null,
        recommendationView: null,
        recommendationError: null,
        recommendationProgress: "",
        impactDetails: null,
        scenarioCharts: null,
        suggestion: null,
        suggestionVisible: false,
        suggestionError: null,
        suggestionProgress: "",
        referenceData: { fields: {} },
        comparisonDetails: null,
        dashboard: { metrics: [], recentAnalyses: [], latestRecommendation: null },
        dashboardCharts: {},
        comparison: [],
        audit: [],
        health: {},
        loading: {
          dashboard: false,
          analysis: false,
          recommendation: false,
          recommendationAction: false,
          suggestion: false,
          comparison: false,
          createScenario: false,
          deleteScenario: false
        },
        kpis: {
          scenarios: 0,
          avgRisk: 0,
          avgRevenue: 0,
          aiSource: "Not run"
        },
        newScenario: {
          name: "",
          description: "",
          businessModelType: "",
          industry: "",
          customerSegment: "",
          region: "",
          pricingType: "",
          contractTerm: "",
          billingFrequency: "",
          fundingModel: "",
          bundleType: "",
          transactionVolumeBand: "",
          transactionVolume: "",
          expectedRevenueBand: "",
          expectedRevenue: "",
          complianceRegions: [],
          complianceRegionsText: "",
          integrationCount: 0,
          processComplexityBand: "",
          processComplexity: ""
        }
      }), "app");
    }
  });
});
