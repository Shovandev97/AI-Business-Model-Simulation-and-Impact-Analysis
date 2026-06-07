import Joi from 'joi';

const scenarioSchema = Joi.object({
  name: Joi.string().trim().min(3).max(120).required(),
  description: Joi.string().trim().allow('').default(''),
  businessModelType: Joi.string().trim().min(2).max(80).required(),
  industry: Joi.string().trim().min(2).max(80).required(),
  customerSegment: Joi.string().trim().min(2).max(80).required(),
  region: Joi.string().trim().min(2).max(80).required(),
  pricingType: Joi.string().trim().min(2).max(80).required(),
  contractTerm: Joi.number().integer().min(1).max(120).required(),
  billingFrequency: Joi.string().trim().min(2).max(80).required(),
  fundingModel: Joi.string().trim().min(2).max(80).required(),
  bundleType: Joi.string().trim().min(2).max(120).required(),
  transactionVolume: Joi.number().integer().min(1).max(50000000).required(),
  expectedRevenue: Joi.number().min(1000).max(1000000000).required(),
  complianceRegions: Joi.array().items(Joi.string().trim().min(2).max(30)).min(1).max(8).required(),
  integrationCount: Joi.number().integer().min(0).max(100).required(),
  processComplexity: Joi.number().integer().min(1).max(10).required()
});

export function validateScenario(input) {
  const { value, error } = scenarioSchema.validate(input, { stripUnknown: true, abortEarly: false });
  if (error) {
    const details = error.details.map((item) => item.message);
    const validationError = new Error(details.join('; '));
    validationError.status = 400;
    throw validationError;
  }
  return value;
}
