'use strict';

const FALLBACK_MODELS = [
  'gpt-4o-mini',
  'gpt-4.1-mini',
  'gpt-4.1'
];

function normalizeModelId(modelRaw) {
  return String(modelRaw || '').trim().toLowerCase();
}

function initModelRegistry() {
  return {
    updatedAt: Date.now(),
    providers: {
      codex: new Set(['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-4.1']),
      gemini: new Set(['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'])
    }
  };
}

function addModelToRegistry(registry, provider, model) {
  if (!registry || !registry.providers) return;
  if (!provider || !registry.providers[provider]) return;
  const m = normalizeModelId(model);
  if (!m) return;
  registry.providers[provider].add(m);
  registry.updatedAt = Date.now();
}

function getRegistryModelList(registry, providerMode = 'auto') {
  if (!registry || !registry.providers) return FALLBACK_MODELS.slice();
  const out = new Set();
  if (providerMode === 'codex' || providerMode === 'auto') {
    registry.providers.codex.forEach((m) => out.add(m));
  }
  if (providerMode === 'gemini' || providerMode === 'auto') {
    registry.providers.gemini.forEach((m) => out.add(m));
  }
  if (out.size === 0) return FALLBACK_MODELS.slice();
  return Array.from(out).sort();
}

function buildOpenAIModelsList(models) {
  const now = Math.floor(Date.now() / 1000);
  const safe = Array.isArray(models) ? models : [];
  return {
    object: 'list',
    data: safe.map((id) => ({
      id,
      object: 'model',
      created: now,
      owned_by: 'aih-server'
    }))
  };
}

module.exports = {
  FALLBACK_MODELS,
  initModelRegistry,
  addModelToRegistry,
  getRegistryModelList,
  buildOpenAIModelsList
};
