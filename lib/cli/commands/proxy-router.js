'use strict';

const { runServerCommandRouter } = require('./server-router');

function runProxyCommandRouter(args, deps = {}) {
  return runServerCommandRouter(args, {
    ...deps,
    showServerUsage: deps.showProxyUsage || deps.showServerUsage,
    getServerDaemonStatus: deps.getProxyDaemonStatus || deps.getServerDaemonStatus,
    getServerAutostartStatus: deps.getProxyAutostartStatus || deps.getServerAutostartStatus,
    installServerAutostart: deps.installProxyAutostart || deps.installServerAutostart,
    uninstallServerAutostart: deps.uninstallProxyAutostart || deps.uninstallServerAutostart,
    stopServerDaemon: deps.stopProxyDaemon || deps.stopServerDaemon,
    startServerDaemon: deps.startProxyDaemon || deps.startServerDaemon,
    parseServerEnvArgs: deps.parseProxyEnvArgs || deps.parseServerEnvArgs,
    parseServerServeArgs: deps.parseProxyServeArgs || deps.parseServerServeArgs,
    startLocalServer: deps.startLocalProxyServer || deps.startLocalServer,
    parseServerSyncArgs: deps.parseProxySyncArgs || deps.parseServerSyncArgs,
    syncCodexAccountsToServer: deps.syncCodexAccountsToProxy || deps.syncCodexAccountsToServer
  });
}

module.exports = {
  runProxyCommandRouter,
  runServerCommandRouter
};
