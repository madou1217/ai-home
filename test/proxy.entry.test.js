const test = require('node:test');
const assert = require('node:assert/strict');
const { runProxyEntry } = require('../lib/proxy/entry');

test('runProxyEntry wires start/sync delegates into runProxyCommand', async () => {
  let seenStart = false;
  let seenSync = false;
  const fakeRunProxyCommand = async (_args, deps) => {
    assert.equal(typeof deps.startLocalProxyServer, 'function');
    assert.equal(typeof deps.syncCodexAccountsToProxy, 'function');

    const syncResult = await deps.syncCodexAccountsToProxy({ dryRun: true });
    assert.equal(syncResult.ok, true);
    seenSync = true;

    const startResult = await deps.startLocalProxyServer({ port: 1 });
    assert.equal(startResult.ok, true);
    seenStart = true;

    return 0;
  };

  const code = await runProxyEntry(['proxy'], {
    fs: {},
    fetchImpl: async () => ({ ok: true }),
    http: {},
    processObj: { cwd: () => '/' },
    logFile: '/tmp/x.log',
    getToolAccountIds: () => [],
    getToolConfigDir: () => '',
    getProfileDir: () => '',
    checkStatus: () => ({ configured: false }),
    syncCodexAccountsToProxy: async () => ({ ok: true }),
    startLocalProxyServerModule: async () => ({ ok: true }),
    runProxyCommand: fakeRunProxyCommand,
    showProxyUsage: () => {},
    proxyDaemon: {},
    parseProxySyncArgs: () => ({}),
    parseProxyServeArgs: () => ({}),
    parseProxyEnvArgs: () => ({})
  });

  assert.equal(code, 0);
  assert.equal(seenSync, true);
  assert.equal(seenStart, true);
});
