import csv
import argparse
import json
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "app" / "ml" / "data"
RNG = random.Random(42)

BUSINESS_MODELS = ["subscription", "consumption-based", "tiered", "bundled-services", "outcome-based", "flexible-funding", "hybrid"]
INDUSTRIES = ["Industrial Manufacturing", "Utilities", "Telecommunications", "Healthcare", "Financial Services", "Retail", "Public Sector"]
SEGMENTS = ["SMB", "Mid-Market", "Enterprise", "Strategic"]
REGIONS = ["North America", "Europe", "APJ", "Latin America", "Middle East"]
PRICING = ["flat", "tiered", "usage", "outcome", "bundle", "hybrid"]
BILLING = ["monthly", "quarterly", "annual", "milestone", "usage-event"]
FUNDING = ["capex", "opex", "mixed", "partner-funded", "customer-funded"]
BUNDLES = ["single-offer", "software-service", "hardware-software-service", "multi-product", "partner-ecosystem"]
COMPLIANCE = ["US", "EU", "UK", "DE", "IN", "SG", "BR", "UAE"]

MODEL_COMPLEXITY = {
    "subscription": 1.05,
    "consumption-based": 1.28,
    "tiered": 1.16,
    "bundled-services": 1.22,
    "outcome-based": 1.55,
    "flexible-funding": 1.30,
    "hybrid": 1.44,
}

MODEL_UPLIFT = {
    "subscription": 7.5,
    "consumption-based": 10.5,
    "tiered": 6.5,
    "bundled-services": 8.8,
    "outcome-based": 12.8,
    "flexible-funding": 5.8,
    "hybrid": 9.6,
}

def clamp(value, low, high):
    return max(low, min(high, value))

def choose_compliance(industry, region, complexity):
    count = 1 + int(complexity > 5) + int(industry in ["Healthcare", "Financial Services", "Public Sector"]) + int(region == "Europe")
    return sorted(RNG.sample(COMPLIANCE, clamp(count, 1, 5)))

def make_record(index):
    business_model = RNG.choices(BUSINESS_MODELS, weights=[18, 15, 16, 14, 11, 10, 16])[0]
    industry = RNG.choice(INDUSTRIES)
    segment = RNG.choices(SEGMENTS, weights=[16, 26, 38, 20])[0]
    region = RNG.choice(REGIONS)
    complexity_anchor = {"SMB": 3, "Mid-Market": 5, "Enterprise": 7, "Strategic": 8}[segment]
    process_complexity = clamp(round(RNG.gauss(complexity_anchor, 1.4)), 1, 10)
    integration_count = clamp(round(RNG.gauss(process_complexity * 1.35 + (2 if segment in ["Enterprise", "Strategic"] else 0), 2.1)), 0, 32)
    compliance_regions = choose_compliance(industry, region, process_complexity)
    pricing = {
        "subscription": RNG.choice(["flat", "tiered", "bundle"]),
        "consumption-based": RNG.choice(["usage", "tiered", "hybrid"]),
        "tiered": "tiered",
        "bundled-services": RNG.choice(["bundle", "hybrid"]),
        "outcome-based": "outcome",
        "flexible-funding": RNG.choice(["flat", "hybrid"]),
        "hybrid": "hybrid",
    }[business_model]
    billing = RNG.choices(BILLING, weights=[35, 19, 12, 15, 19])[0]
    if pricing in ["usage", "outcome", "hybrid"]:
        billing = RNG.choices(["monthly", "quarterly", "milestone", "usage-event"], weights=[24, 15, 18, 43])[0]
    contract_term = RNG.choice([12, 24, 36, 48, 60])
    transaction_volume = int(clamp(RNG.lognormvariate(10.0 + process_complexity / 14, 0.9), 500, 3000000))
    expected_revenue = round(clamp(transaction_volume * RNG.uniform(28, 180) * (1 + process_complexity / 12), 50000, 250000000), 2)
    model_factor = MODEL_COMPLEXITY[business_model]
    regulated = industry in ["Healthcare", "Financial Services", "Public Sector"] or "EU" in compliance_regions
    billing_complexity = clamp(22 + process_complexity * 5.8 + integration_count * 1.8 + (14 if billing == "usage-event" else 0) + (10 if pricing in ["usage", "outcome", "hybrid"] else 0) + RNG.gauss(0, 6), 1, 100)
    downstream_impact = clamp(18 + integration_count * 2.7 + process_complexity * 4.2 + (10 if business_model == "hybrid" else 0) + RNG.gauss(0, 5), 1, 100)
    compliance_risk = clamp(12 + len(compliance_regions) * 9 + (18 if regulated else 0) + (12 if business_model == "outcome-based" else 0) + process_complexity * 2.3 + RNG.gauss(0, 6), 1, 100)
    operational_effort = clamp(20 + process_complexity * 6.1 + integration_count * 1.9 + model_factor * 8 + RNG.gauss(0, 7), 1, 100)
    implementation_risk = clamp((billing_complexity * 0.28 + downstream_impact * 0.24 + compliance_risk * 0.22 + operational_effort * 0.26) * model_factor / 1.25 + RNG.gauss(0, 4), 1, 100)
    revenue_impact_pct = clamp(MODEL_UPLIFT[business_model] - compliance_risk * 0.035 - billing_complexity * 0.025 + math.log10(expected_revenue) * 0.45 + RNG.gauss(0, 2.8), -18, 28)
    delay_probability = clamp(implementation_risk * 0.58 + integration_count * 1.1 + (10 if billing == "usage-event" else 0) + RNG.gauss(0, 8), 1, 98)
    dependency_count = clamp(round(integration_count * 1.2 + process_complexity * 1.4 + len(compliance_regions) * 1.6 + RNG.gauss(0, 2)), 1, 80)
    billing_errors = clamp(round(billing_complexity / 6 + RNG.gauss(0, 3)), 0, 40)
    revenue_leakage_pct = clamp(billing_complexity * 0.035 + downstream_impact * 0.018 + RNG.gauss(0, 0.6), 0, 8)
    delay_days = clamp(round(delay_probability * 0.9 + RNG.gauss(0, 12)), 0, 180)
    compliance_findings = clamp(round(compliance_risk / 18 + RNG.gauss(0, 1.2)), 0, 12)
    churn_risk = clamp(15 + billing_errors * 1.5 + delay_probability * 0.22 - revenue_impact_pct * 0.5 + RNG.gauss(0, 5), 1, 100)
    collections_impact = clamp(10 + billing_complexity * 0.35 + revenue_leakage_pct * 3.8 + RNG.gauss(0, 5), 1, 100)
    success = int(implementation_risk < 64 and revenue_impact_pct > 2 and compliance_findings < 6)
    return {
        "record_id": f"HIST-{index:05d}",
        "businessModelType": business_model,
        "industry": industry,
        "customerSegment": segment,
        "region": region,
        "pricingType": pricing,
        "contractTerm": contract_term,
        "billingFrequency": billing,
        "fundingModel": RNG.choice(FUNDING),
        "bundleType": RNG.choice(BUNDLES),
        "transactionVolume": transaction_volume,
        "expectedRevenue": expected_revenue,
        "complianceRegionCount": len(compliance_regions),
        "complianceRegions": "|".join(compliance_regions),
        "integrationCount": integration_count,
        "processComplexity": process_complexity,
        "billingErrors": billing_errors,
        "revenueLeakagePct": round(revenue_leakage_pct, 2),
        "implementationDelayDays": delay_days,
        "complianceFindings": compliance_findings,
        "customerChurnRisk": round(churn_risk, 2),
        "collectionsImpact": round(collections_impact, 2),
        "implementationRisk": round(implementation_risk, 2),
        "billingComplexity": round(billing_complexity, 2),
        "revenueImpactPct": round(revenue_impact_pct, 2),
        "complianceRisk": round(compliance_risk, 2),
        "delayProbability": round(delay_probability, 2),
        "dependencyCount": dependency_count,
        "operationalEffort": round(operational_effort, 2),
        "downstreamIntegrationImpact": round(downstream_impact, 2),
        "successfulOutcome": success,
    }

def main():
    parser = argparse.ArgumentParser(description="Generate synthetic enterprise O2C historical training data.")
    parser.add_argument("--rows", type=int, default=2500, help="Number of historical records to generate.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for reproducible generation.")
    args = parser.parse_args()
    if args.rows < 1000:
        raise ValueError("--rows must be at least 1000 for meaningful model training.")
    global RNG
    RNG = random.Random(args.seed)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    records = [make_record(i) for i in range(1, args.rows + 1)]
    fieldnames = list(records[0].keys())
    all_path = DATA_DIR / "historical_training_records.csv"
    with all_path.open("w", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(records)
    RNG.shuffle(records)
    split = int(len(records) * 0.8)
    for name, subset in [("train.csv", records[:split]), ("test.csv", records[split:])]:
        with (DATA_DIR / name).open("w", newline="") as file:
            writer = csv.DictWriter(file, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(subset)
    dictionary = {
        "rows": len(records),
        "seed": args.seed,
        "description": "Synthetic enterprise historical commercial model transformations with O2C outcomes.",
        "targets": ["implementationRisk", "billingComplexity", "revenueImpactPct", "complianceRisk", "delayProbability", "dependencyCount", "operationalEffort", "downstreamIntegrationImpact"],
        "pattern_notes": "Fields are generated from industry, segment, model type, pricing, billing cadence, integrations, process complexity and compliance footprint with realistic weighted relationships and calibrated noise."
    }
    (DATA_DIR / "data_dictionary.json").write_text(json.dumps(dictionary, indent=2))
    print(f"Generated {len(records)} records in {DATA_DIR}")

if __name__ == "__main__":
    main()
