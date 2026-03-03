'use strict';

function normalizeManagementBase(url) {
  const base = String(url || '').trim();
  if (!base) throw new Error('Empty management URL');
  return base.replace(/\/+$/, '');
}

function parseServerSyncArgs(rawArgs) {
  const out = {
    managementUrl: 'http://127.0.0.1:8317/v0/management',
    key: String(process.env.AIH_SERVER_MANAGEMENT_KEY || '').trim(),
    parallel: 8,
    limit: 0,
    dryRun: false,
    namePrefix: 'aih-codex-'
  };
  const tokens = Array.isArray(rawArgs) ? rawArgs.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const arg = String(tokens[i] || '').trim();
    if (!arg) continue;
    if (arg === '--management-url') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --management-url value');
      out.managementUrl = normalizeManagementBase(val);
      i += 1;
      continue;
    }
    if (arg === '--key' || arg === '--management-key') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --key value');
      out.key = val;
      i += 1;
      continue;
    }
    if (arg === '--parallel') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --parallel value');
      out.parallel = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --limit value');
      out.limit = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--name-prefix') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --name-prefix value');
      out.namePrefix = val;
      i += 1;
      continue;
    }
    if (arg === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  out.parallel = Math.max(1, Math.min(32, Number(out.parallel) || 1));
  out.limit = Math.max(0, Number(out.limit) || 0);
  return out;
}

function parseServerServeArgs(rawArgs, envObj = process.env) {
  const out = {
    host: String(envObj.AIH_SERVER_HOST || '127.0.0.1').trim(),
    port: Number(envObj.AIH_SERVER_PORT || 8317),
    upstream: String(envObj.AIH_SERVER_UPSTREAM || 'https://api.openai.com').trim(),
    strategy: String(envObj.AIH_SERVER_STRATEGY || 'random').trim().toLowerCase(),
    clientKey: String(envObj.AIH_SERVER_CLIENT_KEY || '').trim(),
    managementKey: String(envObj.AIH_SERVER_MANAGEMENT_KEY || '').trim(),
    cooldownMs: Number(envObj.AIH_SERVER_COOLDOWN_MS || 60000),
    upstreamTimeoutMs: Number(envObj.AIH_SERVER_UPSTREAM_TIMEOUT_MS || 45000),
    maxAttempts: Number(envObj.AIH_SERVER_MAX_ATTEMPTS || 3),
    modelsCacheTtlMs: Number(envObj.AIH_SERVER_MODELS_CACHE_TTL_MS || 300000),
    modelsProbeAccounts: Number(envObj.AIH_SERVER_MODELS_PROBE_ACCOUNTS || 2),
    backend: String(envObj.AIH_SERVER_BACKEND || 'codex-local').trim().toLowerCase(),
    provider: String(envObj.AIH_SERVER_PROVIDER || 'auto').trim().toLowerCase(),
    failureThreshold: Number(envObj.AIH_SERVER_FAILURE_THRESHOLD || 2),
    logRequests: String(envObj.AIH_SERVER_LOG_REQUESTS || '1').trim() !== '0',
    sessionAffinityTtlMs: Number(envObj.AIH_SERVER_SESSION_AFFINITY_TTL_MS || 1800000),
    sessionAffinityMaxEntries: Number(envObj.AIH_SERVER_SESSION_AFFINITY_MAX || 10000),
    localMaxAttempts: Number(envObj.AIH_SERVER_LOCAL_MAX_ATTEMPTS || 2)
  };
  const tokens = Array.isArray(rawArgs) ? rawArgs.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const arg = String(tokens[i] || '').trim();
    if (!arg) continue;
    if (arg === '--host') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --host value');
      out.host = val;
      i += 1;
      continue;
    }
    if (arg === '--port') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --port value');
      out.port = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--upstream') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --upstream value');
      out.upstream = val;
      i += 1;
      continue;
    }
    if (arg === '--strategy') {
      const val = String(tokens[i + 1] || '').trim().toLowerCase();
      if (!['round-robin', 'random'].includes(val)) throw new Error('Invalid --strategy value');
      out.strategy = val;
      i += 1;
      continue;
    }
    if (arg === '--client-key') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --client-key value');
      out.clientKey = val;
      i += 1;
      continue;
    }
    if (arg === '--management-key') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --management-key value');
      out.managementKey = val;
      i += 1;
      continue;
    }
    if (arg === '--cooldown-ms') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --cooldown-ms value');
      out.cooldownMs = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--upstream-timeout-ms') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --upstream-timeout-ms value');
      out.upstreamTimeoutMs = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--max-attempts') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --max-attempts value');
      out.maxAttempts = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--models-cache-ttl-ms') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --models-cache-ttl-ms value');
      out.modelsCacheTtlMs = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--models-probe-accounts') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --models-probe-accounts value');
      out.modelsProbeAccounts = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--backend') {
      const val = String(tokens[i + 1] || '').trim().toLowerCase();
      if (!['codex-local', 'openai-upstream'].includes(val)) throw new Error('Invalid --backend value');
      out.backend = val;
      i += 1;
      continue;
    }
    if (arg === '--provider') {
      const val = String(tokens[i + 1] || '').trim().toLowerCase();
      if (!['codex', 'gemini', 'auto'].includes(val)) throw new Error('Invalid --provider value');
      out.provider = val;
      i += 1;
      continue;
    }
    if (arg === '--failure-threshold') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --failure-threshold value');
      out.failureThreshold = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--session-affinity-ttl-ms') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --session-affinity-ttl-ms value');
      out.sessionAffinityTtlMs = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--session-affinity-max') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --session-affinity-max value');
      out.sessionAffinityMaxEntries = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--local-max-attempts') {
      const val = String(tokens[i + 1] || '').trim();
      if (!/^\d+$/.test(val)) throw new Error('Invalid --local-max-attempts value');
      out.localMaxAttempts = Number(val);
      i += 1;
      continue;
    }
    if (arg === '--no-request-log') {
      out.logRequests = false;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  out.upstream = out.upstream.replace(/\/+$/, '');
  out.upstreamTimeoutMs = Math.max(1000, out.upstreamTimeoutMs || 15000);
  out.maxAttempts = Math.max(1, Math.min(32, out.maxAttempts || 3));
  out.modelsCacheTtlMs = Math.max(1000, out.modelsCacheTtlMs || 300000);
  out.modelsProbeAccounts = Math.max(1, Math.min(8, out.modelsProbeAccounts || 2));
  if (!['codex-local', 'openai-upstream'].includes(out.backend)) out.backend = 'codex-local';
  if (!['codex', 'gemini', 'auto'].includes(out.provider)) out.provider = 'auto';
  out.failureThreshold = Math.max(1, Math.min(10, Number(out.failureThreshold) || 2));
  out.sessionAffinityTtlMs = Math.max(30000, Number(out.sessionAffinityTtlMs) || 1800000);
  out.sessionAffinityMaxEntries = Math.max(100, Math.min(100000, Number(out.sessionAffinityMaxEntries) || 10000));
  out.localMaxAttempts = Math.max(1, Math.min(8, Number(out.localMaxAttempts) || 2));
  return out;
}

function parseServerEnvArgs(rawArgs) {
  const out = {
    baseUrl: 'http://127.0.0.1:8317/v1',
    apiKey: 'dummy'
  };
  const tokens = Array.isArray(rawArgs) ? rawArgs.slice() : [];
  for (let i = 0; i < tokens.length; i += 1) {
    const arg = String(tokens[i] || '').trim();
    if (!arg) continue;
    if (arg === '--base-url') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --base-url value');
      out.baseUrl = val;
      i += 1;
      continue;
    }
    if (arg === '--api-key') {
      const val = String(tokens[i + 1] || '').trim();
      if (!val) throw new Error('Invalid --api-key value');
      out.apiKey = val;
      i += 1;
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return out;
}

module.exports = {
  parseServerSyncArgs,
  parseServerServeArgs,
  parseServerEnvArgs
};
