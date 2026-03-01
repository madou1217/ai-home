'use strict';

function buildManagementStatusPayload(state, options) {
  const now = Date.now();
  const codex = state.accounts.codex || [];
  const gemini = state.accounts.gemini || [];
  const activeCodex = codex.filter((a) => now >= (a.cooldownUntil || 0)).length;
  const activeGemini = gemini.filter((a) => now >= (a.cooldownUntil || 0)).length;
  const total = codex.length + gemini.length;
  const active = activeCodex + activeGemini;
  const cooldown = total - active;
  const requests = Math.max(1, state.metrics.totalRequests);
  return {
    ok: true,
    backend: options.backend,
    providerMode: options.provider,
    strategy: state.strategy,
    totalAccounts: total,
    activeAccounts: active,
    cooldownAccounts: cooldown,
    providers: {
      codex: { total: codex.length, active: activeCodex },
      gemini: { total: gemini.length, active: activeGemini }
    },
    queue: {
      codex: state.executors.codex.snapshot(),
      gemini: state.executors.gemini.snapshot()
    },
    modelsCached: Array.isArray(state.modelsCache.ids) ? state.modelsCache.ids.length : 0,
    modelsUpdatedAt: state.modelsCache.updatedAt || 0,
    modelRegistryUpdatedAt: state.modelRegistry.updatedAt || 0,
    successRate: Number((state.metrics.totalSuccess / requests).toFixed(4)),
    timeoutRate: Number((state.metrics.totalTimeouts / requests).toFixed(4)),
    totalRequests: state.metrics.totalRequests,
    uptimeSec: Math.floor((Date.now() - state.startedAt) / 1000)
  };
}

function buildManagementMetricsPayload(state) {
  const requests = Math.max(1, state.metrics.totalRequests);
  return {
    ok: true,
    totalRequests: state.metrics.totalRequests,
    totalSuccess: state.metrics.totalSuccess,
    totalFailures: state.metrics.totalFailures,
    totalTimeouts: state.metrics.totalTimeouts,
    successRate: Number((state.metrics.totalSuccess / requests).toFixed(4)),
    timeoutRate: Number((state.metrics.totalTimeouts / requests).toFixed(4)),
    routeCounts: state.metrics.routeCounts,
    providerCounts: state.metrics.providerCounts,
    providerSuccess: state.metrics.providerSuccess,
    providerFailures: state.metrics.providerFailures,
    queue: {
      codex: state.executors.codex.snapshot(),
      gemini: state.executors.gemini.snapshot()
    },
    lastErrors: state.metrics.lastErrors
  };
}

function buildManagementAccountsPayload(state) {
  const allAccounts = [...(state.accounts.codex || []), ...(state.accounts.gemini || [])];
  return {
    ok: true,
    accounts: allAccounts.map((a) => ({
      id: a.id,
      provider: a.provider || 'codex',
      email: a.email,
      accountId: a.accountId,
      hasAccessToken: !!a.accessToken,
      hasRefreshToken: !!a.refreshToken,
      cooldownUntil: a.cooldownUntil || 0,
      lastRefresh: a.lastRefresh,
      consecutiveFailures: a.consecutiveFailures || 0,
      successCount: a.successCount || 0,
      failCount: a.failCount || 0,
      lastError: a.lastError || ''
    }))
  };
}

function applyReloadState(state, runtimeAccounts) {
  state.accounts = runtimeAccounts;
  state.cursors = { codex: 0, gemini: 0 };
  state.modelsCache = {
    updatedAt: 0,
    ids: [],
    byAccount: {},
    sourceCount: 0
  };
}

module.exports = {
  buildManagementStatusPayload,
  buildManagementMetricsPayload,
  buildManagementAccountsPayload,
  applyReloadState
};
