import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../../../.env'), override: false });

function sapAiBaseUrl() {
  if (process.env.SAP_AI_CORE_BASE_URL) return process.env.SAP_AI_CORE_BASE_URL;
  if (process.env.SAP_AI_CORE_REGION && process.env.SAP_AI_CORE_DEPLOYMENT_ID) {
    return `https://api.ai.${process.env.SAP_AI_CORE_REGION}.aws.ml.hana.ondemand.com/v2/inference/deployments/${process.env.SAP_AI_CORE_DEPLOYMENT_ID}/invoke`;
  }
  return '';
}

const aiTimeoutMs = Number(process.env.AI_REQUEST_TIMEOUT_MS || process.env.OPEN_SOURCE_AI_TIMEOUT_MS || process.env.SAP_AI_TIMEOUT_MS || 120000);

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 4000),
  apiKey: process.env.API_KEY || 'local-dev-key',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8080',
  mlServiceUrl: process.env.LOCAL_ML_SERVICE_URL || process.env.ML_SERVICE_URL || 'http://localhost:5001',
  dataStorePath: process.env.DATA_STORE_PATH || './data/store.json',
  openSourceAi: {
    provider: process.env.SAP_AI_CORE_BASE_URL || process.env.SAP_AI_CORE_REGION ? 'sap-ai-core' : (process.env.OPEN_SOURCE_AI_PROVIDER || 'ollama'),
    baseUrl: sapAiBaseUrl() || process.env.OPEN_SOURCE_AI_BASE_URL || 'http://localhost:11434/v1/chat/completions',
    apiKey: process.env.SAP_AI_CORE_AUTH_TOKEN || process.env.OPEN_SOURCE_AI_API_KEY || '',
    model: process.env.SAP_AI_CORE_MODEL || process.env.OPEN_SOURCE_AI_MODEL || 'qwen3:8b',
    timeoutMs: aiTimeoutMs,
    deploymentId: process.env.SAP_AI_CORE_DEPLOYMENT_ID || '',
    region: process.env.SAP_AI_CORE_REGION || ''
  }
};
