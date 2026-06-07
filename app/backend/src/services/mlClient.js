import { env } from '../config/env.js';

async function postJson(url, payload) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`ML service returned ${response.status}`);
  }
  return response.json();
}

export async function predictScenario(scenario) {
  return postJson(`${env.mlServiceUrl}/ml/predict`, scenario);
}

export async function trainModel(options = {}) {
  return postJson(`${env.mlServiceUrl}/ml/train`, options);
}

export async function getModelInfo() {
  const response = await fetch(`${env.mlServiceUrl}/ml/model-info`);
  if (!response.ok) throw new Error(`ML service returned ${response.status}`);
  return response.json();
}
