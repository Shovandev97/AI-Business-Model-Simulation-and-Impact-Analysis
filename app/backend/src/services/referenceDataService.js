export function scenarioFieldReferenceData() {
  return {
    industries: ['Telecom', 'Software / SaaS', 'Digital Services / FinTech', 'Retail', 'Manufacturing', 'Healthcare', 'Utilities', 'Media and Entertainment'],
    customerSegments: ['Retail / Family Customers', 'Enterprise Customers', 'Small and Medium Businesses', 'SMB', 'Mid-Market', 'Enterprise', 'Strategic'],
    regions: ['India', 'Singapore', 'US', 'Europe', 'Germany', 'France', 'UK', 'Australia', 'North America', 'APJ'],
    businessModelTypes: ['Subscription', 'Subscription + Bundled Services', 'Consumption-Based Pricing', 'Tiered Pricing', 'Outcome-Based Contract', 'Prepaid Wallet / Flexible Funding Model', 'Hybrid Commercial Model'],
    pricingTypes: ['Flat Subscription Pricing', 'Tiered Subscription Pricing', 'Usage-Based Pricing', 'Prepaid Credit-Based Pricing', 'Outcome-Based Pricing', 'Hybrid Pricing'],
    billingFrequencies: ['Monthly', 'Quarterly', 'Annual', 'Real-Time Balance Deduction', 'Usage Event Based', 'Milestone Based'],
    fundingModels: ['Prepaid', 'Postpaid', 'Wallet', 'Credit-Based', 'Hybrid', 'OPEX', 'CAPEX', 'Mixed'],
    bundleTypes: ['Mobile Data + OTT + Family Add-ons', 'API Calls + Storage + Premium Support', 'Wallet Credits + Add-on Services', 'Software + Service', 'Hardware + Software + Service', 'Partner Ecosystem'],
    transactionVolumeBands: [
      { label: 'Low', value: 10000 },
      { label: 'Medium', value: 75000 },
      { label: 'Medium to High', value: 250000 },
      { label: 'High', value: 1000000 },
      { label: 'Very High', value: 5000000 }
    ],
    expectedRevenueBands: [
      { label: 'Low', value: 250000 },
      { label: 'Medium', value: 2500000 },
      { label: 'Medium to High', value: 10000000 },
      { label: 'High', value: 50000000 },
      { label: 'Very High', value: 150000000 }
    ],
    processComplexities: [
      { label: 'Low', value: 2 },
      { label: 'Medium', value: 5 },
      { label: 'High', value: 8 },
      { label: 'Very High', value: 10 }
    ],
    complianceRegions: ['India', 'Singapore', 'US', 'Germany', 'France', 'Europe', 'UK', 'Australia']
  };
}
