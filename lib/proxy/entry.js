'use strict';

async function runProxyEntry(args, deps) {
  const {
    fs,
    fetchImpl,
    http,
    processObj,
    logFile,
    getToolAccountIds,
    getToolConfigDir,
    getProfileDir,
    checkStatus,
    syncCodexAccountsToProxy,
    startLocalProxyServerModule,
    runProxyCommand,
    showProxyUsage,
    proxyDaemon,
    parseProxySyncArgs,
    parseProxyServeArgs,
    parseProxyEnvArgs
  } = deps;

  const syncCodex = (opts) => syncCodexAccountsToProxy(opts, {
    fs,
    getToolAccountIds,
    getToolConfigDir,
    fetchImpl
  });

  const startLocalProxyServer = (opts) => startLocalProxyServerModule(opts, {
    http,
    fs,
    processObj,
    logFile,
    getToolAccountIds,
    getToolConfigDir,
    getProfileDir,
    checkStatus
  });

  return runProxyCommand(args, {
    showProxyUsage,
    proxyDaemon,
    parseProxySyncArgs,
    parseProxyServeArgs,
    parseProxyEnvArgs,
    startLocalProxyServer,
    syncCodexAccountsToProxy: syncCodex
  });
}

module.exports = {
  runProxyEntry
};
