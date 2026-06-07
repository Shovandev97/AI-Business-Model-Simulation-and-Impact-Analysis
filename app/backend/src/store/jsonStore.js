import fs from 'fs/promises';
import path from 'path';
import { env } from '../config/env.js';

const initialState = {
  scenarios: [],
  impacts: [],
  predictions: [],
  recommendations: [],
  suggestions: [],
  scenarioLinks: [],
  audits: []
};

const storePath = path.resolve(process.cwd(), env.dataStorePath);

async function ensureStore() {
  await fs.mkdir(path.dirname(storePath), { recursive: true });
  try {
    await fs.access(storePath);
  } catch {
    await fs.writeFile(storePath, JSON.stringify(initialState, null, 2));
  }
}

export async function readStore() {
  await ensureStore();
  const content = await fs.readFile(storePath, 'utf8');
  return { ...initialState, ...JSON.parse(content) };
}

export async function writeStore(state) {
  await ensureStore();
  await fs.writeFile(storePath, JSON.stringify(state, null, 2));
}

export async function mutateStore(mutator) {
  const state = await readStore();
  const result = await mutator(state);
  await writeStore(state);
  return result;
}
