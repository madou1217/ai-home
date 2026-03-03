'use strict';

function createProxyServerState(options, deps) {
  const {
    loadServerRuntimeAccounts,
    initProxyMetrics,
    createProviderExecutor,
    initModelRegistry,
    fs,
    aiHomeDir,
    getToolAccountIds,
    getToolConfigDir,
    getProfileDir,
    checkStatus
  } = deps;

  const runtimeAccounts = loadServerRuntimeAccounts({ fs, aiHomeDir, getToolAccountIds, getToolConfigDir, getProfileDir, checkStatus });
  return {
    strategy: options.strategy,
    cursors: { codex: 0, gemini: 0 },
    accounts: {
      codex: runtimeAccounts.codex,
      gemini: runtimeAccounts.gemini
    },
    startedAt: Date.now(),
    metrics: initProxyMetrics(),
    executors: {
      codex: createProviderExecutor('codex', options.codexMaxConcurrency, options.queueLimit),
      gemini: createProviderExecutor('gemini', options.geminiMaxConcurrency, options.queueLimit)
    },
    modelRegistry: initModelRegistry(),
    modelsCache: {
      updatedAt: 0,
      ids: [],
      byAccount: {},
      sourceCount: 0
    }
  };
}

function printProxyServeStartup(options, state, requiredClientKey, requiredManagementKey) {
  console.log(`\x1b[36m[aih]\x1b[0m server serve started`);
  console.log(`  listen: http://${options.host}:${options.port}`);
  console.log(`  upstream: ${options.upstream}`);
  console.log(`  backend: ${options.backend}`);
  console.log(`  provider_mode: ${options.provider}`);
  console.log(`  strategy: ${options.strategy}`);
  console.log(`  accounts: codex=${state.accounts.codex.length}, gemini=${state.accounts.gemini.length}`);
  if (requiredClientKey) {
    console.log('  client_auth: enabled (Bearer key required)');
  } else {
    console.log('  client_auth: disabled');
  }
  if (requiredManagementKey) {
    console.log('  management_auth: enabled (Bearer key required)');
  } else {
    console.log('  management_auth: disabled');
  }
  console.log('  management: /v0/management/status');
  console.log('  metrics: /v0/management/metrics');
  console.log('  gateway: /v1/*');
  console.log('  openai_base_url: ' + `http://${options.host}:${options.port}/v1`);
  console.log('  tip: export OPENAI_BASE_URL=' + `"http://${options.host}:${options.port}/v1"`);
  console.log('  tip: export OPENAI_API_KEY="dummy"');
}

module.exports = {
  createProxyServerState,
  printProxyServeStartup
};
