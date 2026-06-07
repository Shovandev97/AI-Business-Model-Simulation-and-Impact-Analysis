import { nanoid } from 'nanoid';
import { mutateStore, readStore } from '../store/jsonStore.js';

export async function audit(action, payload = {}) {
  const entry = {
    id: nanoid(),
    action,
    timestamp: new Date().toISOString(),
    modelVersion: payload.modelVersion || null,
    promptVersion: payload.promptVersion || null,
    request: payload.request || null,
    response: payload.response || null
  };
  await mutateStore((state) => {
    state.audits.unshift(entry);
    state.audits = state.audits.slice(0, 500);
  });
  return entry;
}

export async function listAudit() {
  const state = await readStore();
  return state.audits;
}
