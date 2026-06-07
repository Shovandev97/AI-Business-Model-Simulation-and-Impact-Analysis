package com.bms.service;

import com.bms.util.Json;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

@Service
public class ReferenceDataService {
  public Map<String, Object> scenarioFields() {
    return Json.obj(
        "industries", List.of("Telecom", "Software / SaaS", "Digital Services / FinTech", "Retail", "Manufacturing", "Healthcare", "Utilities", "Media and Entertainment"),
        "customerSegments", List.of("Retail / Family Customers", "Enterprise Customers", "Small and Medium Businesses", "SMB", "Mid-Market", "Enterprise", "Strategic"),
        "regions", List.of("India", "Singapore", "US", "Europe", "Germany", "France", "UK", "Australia", "North America", "APJ"),
        "businessModelTypes", List.of("Subscription", "Subscription + Bundled Services", "Consumption-Based Pricing", "Tiered Pricing", "Outcome-Based Contract", "Prepaid Wallet / Flexible Funding Model", "Hybrid Commercial Model"),
        "pricingTypes", List.of("Flat Subscription Pricing", "Tiered Subscription Pricing", "Usage-Based Pricing", "Prepaid Credit-Based Pricing", "Outcome-Based Pricing", "Hybrid Pricing"),
        "billingFrequencies", List.of("Monthly", "Quarterly", "Annual", "Real-Time Balance Deduction", "Usage Event Based", "Milestone Based"),
        "fundingModels", List.of("Prepaid", "Postpaid", "Wallet", "Credit-Based", "Hybrid", "OPEX", "CAPEX", "Mixed"),
        "bundleTypes", List.of("Mobile Data + OTT + Family Add-ons", "API Calls + Storage + Premium Support", "Wallet Credits + Add-on Services", "Software + Service", "Hardware + Software + Service", "Partner Ecosystem"),
        "transactionVolumeBands", List.of(Json.obj("label", "Low", "value", 10000), Json.obj("label", "Medium", "value", 75000), Json.obj("label", "Medium to High", "value", 250000), Json.obj("label", "High", "value", 1000000), Json.obj("label", "Very High", "value", 5000000)),
        "expectedRevenueBands", List.of(Json.obj("label", "Low", "value", 250000), Json.obj("label", "Medium", "value", 2500000), Json.obj("label", "Medium to High", "value", 10000000), Json.obj("label", "High", "value", 50000000), Json.obj("label", "Very High", "value", 150000000)),
        "processComplexities", List.of(Json.obj("label", "Low", "value", 2), Json.obj("label", "Medium", "value", 5), Json.obj("label", "High", "value", 8), Json.obj("label", "Very High", "value", 10)),
        "complianceRegions", List.of("India", "Singapore", "US", "Germany", "France", "Europe", "UK", "Australia"));
  }
}
