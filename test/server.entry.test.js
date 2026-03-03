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

test('runProxyEntry forwards daemon and parser contracts for serve control actions', async () => {
  const fakeDaemon = { restart: async () => ({ running: true }) };
  const fakeRunProxyCommand = async (_args, deps) => {
    assert.equal(deps.proxyDaemon, fakeDaemon);
    assert.equal(typeof deps.parseProxySyncArgs, 'function');
    assert.equal(typeof deps.parseProxyServeArgs, 'function');
    assert.equal(typeof deps.parseProxyEnvArgs, 'function');
    return 0;
  };

  const code = await runProxyEntry(['proxy', 'restart'], {
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
    proxyDaemon: fakeDaemon,
    parseProxySyncArgs: () => ({}),
    parseProxyServeArgs: () => ({}),
    parseProxyEnvArgs: () => ({})
  });

  assert.equal(code, 0);
});

test('runProxyEntry forwards parse helpers and daemon controller for serve-control flows', async () => {
  const parsed = [];
  const fakeRunProxyCommand = async (_args, deps) => {
    parsed.push(deps.parseProxySyncArgs(['--dry-run']));
    parsed.push(deps.parseProxyServeArgs(['--port', '8321']));
    parsed.push(deps.parseProxyEnvArgs(['--api-key', 'x']));
    assert.equal(typeof deps.proxyDaemon, 'object');
    assert.equal(typeof deps.showProxyUsage, 'function');
    return 0;
  };

  const code = await runProxyEntry(['proxy', 'serve'], {
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
    proxyDaemon: { restart: () => ({ ok: true }) },
    parseProxySyncArgs: (args) => ({ kind: 'sync', args }),
    parseProxyServeArgs: (args) => ({ kind: 'serve', args }),
    parseProxyEnvArgs: (args) => ({ kind: 'env', args })
  });

  assert.equal(code, 0);
  assert.deepEqual(parsed, [
    { kind: 'sync', args: ['--dry-run'] },
    { kind: 'serve', args: ['--port', '8321'] },
    { kind: 'env', args: ['--api-key', 'x'] }
  ]);
});
