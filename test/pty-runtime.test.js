const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const { createPtyRuntime } = require('../lib/cli/services/pty/runtime');

function createMockProcess(env = {}) {
  const proc = new EventEmitter();
  const rawModeCalls = [];

  const stdout = new EventEmitter();
  stdout.columns = 80;
  stdout.rows = 24;
  stdout.write = () => {};

  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = (enabled) => rawModeCalls.push(Boolean(enabled));
  stdin.resume = () => {};
  stdin.pause = () => {};

  proc.env = { ...env };
  proc.platform = 'linux';
  proc.stdout = stdout;
  proc.stdin = stdin;
  proc.cwd = () => '/tmp';
  proc.exit = (code) => {
    throw new Error(`EXIT:${code}`);
  };

  return { proc, rawModeCalls };
}

function createRuntimeHarness(env = {}) {
  const { proc, rawModeCalls } = createMockProcess(env);
  const spawns = [];
  const pty = {
    spawn(command, args, options) {
      const spawnedProc = {
        onData(cb) { this._onData = cb; },
        onExit(cb) { this._onExit = cb; },
        write() {},
        resize() {},
        kill() {}
      };
      spawns.push({ command, args, options, proc: spawnedProc });
      return spawnedProc;
    }
  };

  const runtime = createPtyRuntime({
    path: require('node:path'),
    fs: { existsSync: () => false, readFileSync: () => '' },
    processObj: proc,
    pty,
    execSync: () => {},
    resolveCliPath: () => '/usr/bin/codex',
    buildPtyLaunch: (command, args) => ({ command, args }),
    resolveWindowsBatchLaunch: (_cliName, cliBin) => ({ launchBin: cliBin, envPatch: {} }),
    readUsageConfig: () => ({}),
    cliConfigs: { codex: { pkg: '@openai/codex', loginArgs: ['login'] } },
    aiHomeDir: '/tmp/.ai_home',
    getProfileDir: () => '/tmp/.ai_home/profiles/codex/10086',
    askYesNo: () => false,
    stripAnsi: (s) => s,
    ensureSessionStoreLinks: () => ({ migrated: 0, linked: 0 }),
    ensureUsageSnapshot: () => null,
    readUsageCache: () => null,
    getUsageRemainingPercentValues: () => [],
    getNextAvailableId: () => null,
    markActiveAccount: () => {},
    ensureAccountUsageRefreshScheduler: () => {},
    refreshIndexedStateForAccount: () => {}
  });

  return { runtime, proc, spawns, rawModeCalls };
}

test('runtime does not inject --skip-git-repo-check by default', () => {
  const { runtime, proc, spawns, rawModeCalls } = createRuntimeHarness();
  runtime.runCliPtyTracked('codex', '10086', ['--version'], false);
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ['--version']);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
  assert.deepEqual(rawModeCalls, [true, false]);
});

test('runtime injects --skip-git-repo-check only when explicitly enabled', () => {
  const { runtime, proc, spawns, rawModeCalls } = createRuntimeHarness({
    AIH_CODEX_AUTO_SKIP_REPO_CHECK: '1'
  });
  runtime.runCliPtyTracked('codex', '10086', ['--version'], false);
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ['--skip-git-repo-check', '--version']);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
  assert.deepEqual(rawModeCalls, [true, false]);
});
