# AI-Powered Business Model Simulation & Impact Analysis Engine

Enterprise SAP Fiori-style application for simulating commercial models, predicting downstream Order-to-Cash impact, comparing alternatives, and generating explainable executive recommendations with SAP AI Core or an OpenAI-compatible generative AI endpoint.

## Architecture

```text
SAP UI5/Fiori Frontend
        |
        v
Node.js Express API  ----->  SAP AI Core / GenAI chat endpoint
        |
        v
Local Python FastAPI Predictive Service
        |
        v
Synthetic historical data + trained scikit-learn model artifact
```

## Services

- `app/frontend`: SAP UI5 dashboard, scenario wizard, comparison grid, impact matrix, prediction details, recommendation, audit and settings pages.
- `app/backend`: Express REST API, validation, impact analysis, comparison scoring, open-source AI integration, JSON persistence and audit trail.
- `app/ml`: FastAPI predictive service, synthetic-data training pipeline, model metadata, inference with confidence and top contributing factors.
- `scripts/generate_synthetic_data.py`: reproducible enterprise-realistic synthetic historical data generator.

## Upgrade Highlights

- Dynamic SAP Fiori-style dashboard metrics for analyzed scenarios, average risk, effort, revenue impact, compliance, delay, most impacted O2C area and integration impact.
- Dashboard cockpit data is visible only on the Dashboard page and is generated from stored scenarios, impact results, predictive outputs and recommendation history.
- Impact Analysis includes scenario context, detailed O2C impact reasons, affected systems, required changes, dependency counts, risk/effort metrics and predictive AI explainability.
- Comparison includes ranking, recommendation score, revenue, effort, risk, compliance, delay, dependencies and side-by-side chart data.
- New AI-driven `Suggest Better Business Model` flow evaluates a GenAI-proposed model with the local predictive service before the user accepts it.
- Suggested models are stored with traceability, status and source scenario links.
- Create Scenario uses a stable manual-entry form with editable enterprise fields, input validation, custom compliance regions and an optional create-and-analyze action.
- The AI Recommendation workspace is backed by a normalized recommendation view API, supports regeneration, and keeps suggested-model actions enabled only when a live suggestion exists.
- Technical ML feature importance is translated into customer-friendly business reasoning so business users see O2C, compliance, billing, revenue and integration drivers rather than raw model internals.
- When GenAI is unavailable, the app now returns and displays a clean `Predictive Analysis Only` state instead of presenting deterministic fallback text as an AI recommendation.
- Current-vs-suggested comparison rows are populated from stored AI suggestion, impact and predictive outputs, with customer-friendly labels, compact number formatting and improvement indicators.

## Setup

Prerequisites:

- Node.js 20+ or the workspace-local `.node` installation
- Python 3.9+
- SAP AI Core credentials, or Ollama/LM Studio/vLLM/another OpenAI-compatible chat-completions endpoint

```bash
source scripts/use-node.sh
npm run install:all
python3 -m venv .venv
source .venv/bin/activate
pip install -r app/ml/requirements.txt
cp .env.example app/backend/.env
npm run generate:data
npm run train:ml
```

For local open-source AI with Ollama:

```bash
ollama pull qwen3:8b
ollama serve
```

Run the services in three terminals:

```bash
npm run dev:ml
npm run dev:backend
npm run dev:frontend
```

Open `http://localhost:8080`.

For API calls, include `x-api-key: local-dev-key` unless you change `API_KEY`.

## Synthetic Data

The generator creates historical business model transformations with O2C variables such as pricing model, contract term, billing frequency, compliance regions, integrations, process complexity, expected revenue, impacted systems, billing errors, revenue leakage, implementation delay, compliance findings, churn risk and collections impact.

Data is generated from weighted enterprise patterns rather than independent random fields. For example, outcome-based contracts in regulated regions increase compliance and revenue-recognition pressure, while simple subscription models with fewer integrations tend to have lower delay and billing complexity. Noise is added so the model learns patterns without deterministic labels.

Generated files:

- `app/ml/data/historical_training_records.csv`
- `app/ml/data/train.csv`
- `app/ml/data/test.csv`
- `app/ml/data/data_dictionary.json`

## Model Training

`app/ml/src/train.py` trains multi-output regression models using scikit-learn pipelines with one-hot encoding and random forests. It saves:

- `app/ml/models/business_model_predictor.joblib`
- `app/ml/models/model_info.json`

Predicted outputs:

- implementation risk
- billing complexity
- revenue impact percentage
- compliance risk
- delay probability
- dependency count
- operational effort
- downstream integration impact

Each prediction includes confidence, model version, training metadata and top contributing factors derived from feature importance. The Admin page `Train Predictive Model` action calls `POST /api/train`, regenerates the synthetic historical dataset with 500 additional records by default, retrains the model, and updates `datasetRows`, `trainingRows`, `testRows`, metrics and `trainedAt`.

## API Contract

Backend:

- `GET /api/dashboard/summary`
- `GET /api/dashboard/charts`
- `POST /api/scenarios`
- `GET /api/scenarios`
- `GET /api/scenarios/:id`
- `POST /api/scenarios/:id/analyze`
- `POST /api/scenarios/compare`
- `POST /api/scenarios/compare/details`
- `GET /api/scenarios/:id/impact`
- `GET /api/scenarios/:id/impact/details`
- `GET /api/scenarios/:id/charts`
- `GET /api/scenarios/:id/prediction`
- `GET /api/scenarios/:id/recommendation`
- `POST /api/scenarios/:id/suggest-better-model`
- `POST /api/scenarios/:id/use-suggested-model`
- `POST /api/scenarios/:id/compare-suggestion`
- `POST /api/scenarios/:id/discard-suggestion`
- `POST /api/scenarios/:id/recommendation/regenerate`
- `GET /api/reference-data/scenario-fields`
- `GET /api/audit`
- `POST /api/train`
- `GET /api/health`
- `POST /ai/recommend`
- `POST /ai/explain`
- `POST /ai/summarize`

ML service:

- `POST /ml/predict`
- `POST /ml/train`
- `GET /ml/model-info`

Sample scenario:

```json
{
  "name": "Industrial subscription launch",
  "businessModelType": "subscription",
  "industry": "Industrial Manufacturing",
  "customerSegment": "Enterprise",
  "region": "North America",
  "pricingType": "tiered",
  "contractTerm": 36,
  "billingFrequency": "monthly",
  "fundingModel": "opex",
  "bundleType": "hardware-software-service",
  "transactionVolume": 85000,
  "expectedRevenue": 12500000,
  "complianceRegions": ["US", "EU"],
  "integrationCount": 9,
  "processComplexity": 7
}
```

`POST /api/scenarios/:id/analyze` returns impact matrices, predictive outputs, comparison candidates, and an AI-generated recommendation when GenAI is available. If the configured AI provider is unavailable or the endpoint fails, the recommendation record is marked `GENAI_UNAVAILABLE` / `Predictive Analysis Only`; predictive scores and impact analysis remain available, but the app does not present a fake AI narrative or create a fake suggested model.

### Create Scenario Flow

The SAP UI5 Create Scenario page is intentionally manual rather than template-based. Business users can enter scenario basics, commercial model structure, pricing, billing, funding, expected revenue, volume, process complexity, integration count and compliance scope.

Validation runs before submission:

- required text fields must be present
- numeric values are converted from bands or typed values into API-ready numbers
- compliance regions combine selected known regions with custom comma-separated regions
- invalid values stay on the form and surface in a message strip instead of clearing user input

The form supports:

- `Save Scenario`: persists the scenario and keeps it selected.
- `Create and Analyze`: persists the scenario, runs `/api/scenarios/:id/analyze`, refreshes comparison, impact, prediction and recommendation state, and navigates to Impact Analysis.

Create Scenario stability notes:

- the hidden UI5 tab container is bound to one stable `activePage` key
- the global scenario selector is hidden while the user is entering a new scenario, so global selected-scenario changes do not overwrite draft form data
- the draft is initialized once in the app model and is not reset while typing
- save/analyze buttons use a page-specific loading flag to avoid remounting or layout flicker

### Dashboard API

`GET /api/dashboard/summary` returns a route-specific executive cockpit payload:

- `executiveSummary`: total analyzed scenarios, portfolio health, average risk, effort, revenue impact and latest recommendation status.
- `businessModelDistribution`: dynamic distribution by business model type with average recommendation score.
- `riskRevenueMatrix`: scenario-level risk, effort, revenue impact, transaction volume and integration count.
- `o2cImpactHeatmap`: average O2C area impact and severity.
- `riskDistribution`: Low, Medium, High and Critical risk buckets.
- `implementationEffortBreakdown`: average effort across configuration, integration, testing, compliance, data migration and reporting.
- `topRecommendedModel`: best-ranked model from real impact and prediction outputs.
- `scenariosRequiringAttention`: scenarios with elevated risk, compliance exposure or delay probability.
- `recentActivity`: recent analyzed scenarios with status, recommendation status and confidence.

If no scenarios have been analyzed, the API returns empty arrays plus:

```json
{
  "emptyState": {
    "title": "No scenarios analyzed yet",
    "message": "Create and analyze your first business model scenario to see portfolio insights.",
    "actionText": "Create Scenario"
  }
}
```

Dashboard components are mounted only inside the Dashboard page. Other pages use the shared shell, navigation and scenario selector only; they do not render dashboard KPI cards, dashboard charts or dashboard summaries.

### Suggest Better Business Model

After a scenario has been analyzed, call:

```bash
POST /api/scenarios/:id/suggest-better-model
```

The backend sends the original scenario, impact details, predictive AI output, O2C affected areas and comparison context to the configured GenAI provider. The AI must return structured JSON. The backend validates and normalizes the suggested scenario, predicts it with the local ML model, calculates its impact, stores a `SuggestedModel` record and returns side-by-side original vs suggested results.

AI suggestion calls use `AI_REQUEST_TIMEOUT_MS`, defaulting to `120000` milliseconds. Timeout, abort, network, provider and invalid JSON failures return structured JSON errors such as `AI_REQUEST_TIMEOUT`, `GENAI_NETWORK_ERROR`, `GENAI_UNAVAILABLE`, or `INVALID_AI_RESPONSE`. The frontend shows a retryable enterprise error state and does not fake a better-model suggestion.

Accepting a suggestion:

```bash
POST /api/scenarios/:id/use-suggested-model
{ "suggestionId": "..." }
```

This creates a linked scenario, stores the suggested prediction and impact, marks the suggestion as `accepted`, and records a scenario link with relationship type `AI_SUGGESTED_MODEL`.

Comparing or discarding:

```bash
POST /api/scenarios/:id/compare-suggestion
POST /api/scenarios/:id/discard-suggestion
```

### AI Recommendation View

`GET /api/scenarios/:id/recommendation` returns a normalized page model used by the AI Recommendation workspace:

```json
{
  "success": true,
  "recommendationId": "rec_...",
  "suggestionId": "sug_...",
  "suggestionStatus": "proposed",
  "recommendedModel": "hybrid",
  "recommendationStatus": "Better Alternative Found",
  "confidence": 0.82,
  "executiveSummary": "Dynamic GenAI summary based on scenario, impact and prediction output.",
  "predictiveAnalysis": {
    "modelVersion": "rf-o2c-2026.06",
    "confidence": 0.87,
    "historicalPatternSummary": "Dynamic summary from local predictive model metadata, training rows, contributing factors and predicted outputs.",
    "riskDrivers": [],
    "topContributingFactors": [],
    "predictedOutputs": {
      "implementationRisk": 68,
      "billingComplexity": 79,
      "revenueImpactPct": 7.2
    }
  },
  "customerFriendlyReasoning": [
    {
      "title": "Integration volume increases downstream dependency risk",
      "impactArea": "Downstream Integration Risk",
      "severity": "High",
      "businessMeaning": "Business-readable explanation of why the factor matters.",
      "whyItMatters": "Operational rationale tied to O2C and predictive outputs.",
      "sourceFeature": "integrationCount",
      "importanceScore": 0.41
    }
  ],
  "comparisonRows": [
    {
      "name": "Pricing Type",
      "original": "Tiered Pricing",
      "suggested": "Hybrid Pricing",
      "changeText": "",
      "changeState": "None"
    },
    {
      "name": "Risk Score",
      "original": "68%",
      "suggested": "55%",
      "changeText": "-13%",
      "changeState": "Success"
    }
  ],
  "riskAndBenefitBreakdown": [],
  "assumptions": [],
  "tradeOffs": [],
  "audit": {
    "generatedAt": "2026-06-06T00:00:00.000Z",
    "model": "anthropic-claude-4.5-opus_autogenerated",
    "promptVersion": "recommendation-v1"
  }
}
```

The recommendation page actions call real backend flows:

- `Regenerate Recommendation`: calls `POST /api/scenarios/:id/recommendation/regenerate`, rebuilds the GenAI recommendation from current scenario, impact, prediction and suggestion context, then refreshes the normalized recommendation view.
- `Use Suggested Model`: calls `POST /api/scenarios/:id/use-suggested-model` with the stored suggestion id, creates a linked scenario once, then analyzes the accepted scenario.
- `Compare With Current Model`: calls `POST /api/scenarios/:id/compare-suggestion` and opens the comparison results using real current-vs-suggested prediction and impact data.
- `Discard Suggestion`: calls `POST /api/scenarios/:id/discard-suggestion`, marks the stored suggestion as discarded for traceability, and disables suggestion-only actions.

If no live suggested model exists, suggestion action buttons remain disabled. The frontend does not invent suggestion ids or fake recommendation content.

When no suggested model exists, `comparisonRows` is an empty array and the UI shows:

```text
No suggested model is available yet. Generate a recommendation to compare alternatives.
```

When GenAI is unavailable, the normalized response uses this shape:

```json
{
  "success": false,
  "status": "GENAI_UNAVAILABLE",
  "message": "AI recommendation is temporarily unavailable.",
  "customerMessage": "We could not generate a new AI recommendation right now. Predictive impact scores and historical analysis are still available. Please retry after checking the AI service configuration.",
  "predictiveOnly": true,
  "suggestedScenario": null,
  "comparisonRows": [],
  "predictiveAnalysis": {
    "modelVersion": "rf-o2c-2026.06",
    "confidence": 0.87,
    "historicalPatternSummary": "Dynamic local predictive analysis remains available even when GenAI is unavailable.",
    "riskDrivers": [],
    "topContributingFactors": [],
    "predictedOutputs": {}
  }
}
```

The AI Recommendation page then shows a retryable enterprise message, keeps predictive impact details and historical analysis available, disables suggested-model actions, and keeps `Regenerate Recommendation` enabled.

## Open-Source AI Configuration

## GenAI Configuration

For SAP AI Core:

```text
SAP_AI_CORE_BASE_URL=
SAP_AI_CORE_REGION=
SAP_AI_CORE_DEPLOYMENT_ID=
SAP_AI_CORE_MODEL=anthropic-claude-4.5-opus_autogenerated
SAP_AI_CORE_AUTH_TOKEN=
AI_REQUEST_TIMEOUT_MS=120000
LOCAL_ML_SERVICE_URL=http://localhost:5001
```

If `SAP_AI_CORE_BASE_URL` is not provided but `SAP_AI_CORE_REGION` and `SAP_AI_CORE_DEPLOYMENT_ID` are set, the backend constructs:

```text
https://api.ai.<region>.aws.ml.hana.ondemand.com/v2/inference/deployments/<deploymentId>/invoke
```

For local open-source AI, use an OpenAI-compatible chat-completions endpoint. The default is Ollama:

```text
OPEN_SOURCE_AI_PROVIDER=ollama
OPEN_SOURCE_AI_BASE_URL=http://localhost:11434/v1/chat/completions
OPEN_SOURCE_AI_API_KEY=
OPEN_SOURCE_AI_MODEL=qwen2.5:0.5b
AI_REQUEST_TIMEOUT_MS=120000
```

For fast local executive recommendations, `qwen2.5:0.5b` is the recommended default. For stronger but slower local results, use a larger model if your machine can run it, such as `qwen3:8b`, `qwen3:30b`, `qwen3:235b`, `deepseek-r1:32b`, or a model served through vLLM/LM Studio. The prompt contains scenario inputs, predictive results, comparison scores and impact analysis results. Secrets are never hardcoded.

## UI Pages

- Dashboard: Executive cockpit with analyzed scenarios, average risk, average effort, revenue opportunity, business model distribution, risk/revenue matrix, O2C heatmap, risk distribution, effort breakdown, top recommended model, scenarios requiring attention and recent activity.
- Create Scenario: manual enterprise form with editable ComboBoxes, numeric overrides, compliance multi-select, and no scenario templates or prefilled example scenarios.
- Compare Scenarios: side-by-side ranking with recommendation scores, trade-offs, risk, revenue, effort, compliance, delay and dependencies.
- Impact Analysis: O2C matrix with reasons, affected systems, required changes, dependency counts, risk/effort breakdown and AI better-model suggestion.
- Prediction Details: ML outputs, confidence and contributing factors.
- AI Recommendation: polished AI workspace with recommendation header, predictive historical analysis, executive card, confidence/status, customer-friendly reasoning, current-vs-suggested model comparison, assumptions, trade-offs, actions and audit metadata. Regeneration and suggestion actions are retryable and use persisted backend state. If GenAI is unavailable, it shows a `Predictive Analysis Only` state with retry and predictive-detail navigation instead of fallback prose.
- History / Audit Trail: traceable requests, model versions and AI prompt versions.
- Admin / Settings: service health, environment status and training trigger.

## Tests

```bash
npm run test:backend
npm run test:ml
```

Backend and structure tests cover impact scoring, dashboard summary/charts, dashboard empty-state behavior, missing prediction handling, dashboard-only visibility, stable manual scenario creation structure, impact detail enrichment, comparison details, GenAI-unavailable suggestion and recommendation behavior, invalid AI JSON handling, no-better-model responses, formatted suggested-column rows, customer-friendly recommendation reasoning, normalized recommendation views, disabled-state bindings and idempotent suggestion actions.

## Assumptions

- Local persistence uses JSON for easy hackathon/local execution; the service layer isolates storage so replacing it with PostgreSQL or SAP HANA is straightforward.
- The generative AI provider is configured through environment variables. If the external AI endpoint is unavailable, the app shows a structured predictive-only status and retry path instead of customer-facing fallback prose.
- The UI uses UI5 from the public CDN for local convenience.
- The visible global navigation is the left sidebar. The internal tab container is used only for content switching and its tab header is hidden to avoid duplicate navigation.
- Dashboard visibility can be tested by navigating from Dashboard to Create Scenario, Impact Analysis, Compare Scenarios, AI Recommendation, History and Settings. Dashboard KPI cards and visuals should disappear on every non-dashboard page.
