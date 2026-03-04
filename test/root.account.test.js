const test = require('node:test');
const assert = require('node:assert/strict');
const { runRootAccountCommand } = require('../lib/cli/commands/root/account');

function createHarness() {
  const logs = [];
  const errors = [];
  let exitCode = null;

  return {
    logs,
    errors,
    getExitCode: () => exitCode,
    deps: {
      processObj: {
        exit: (code) => {
          exitCode = code;
        }
      },
      consoleImpl: {
        log: (msg) => logs.push(String(msg)),
        error: (msg) => errors.push(String(msg))
      },
      fs: {},
      parseCodexBulkImportArgs: () => ({}),
      importCodexTokensFromOutput: async () => ({}),
      refreshAccountStateIndexForProvider: () => {}
    }
  };
}

test('runRootAccountCommand prints usage and exits 0 for help', async () => {
  const h = createHarness();
  await runRootAccountCommand(['account', 'help'], h.deps);
  assert.equal(h.getExitCode(), 0);
  assert.equal(h.errors.length, 0);
  assert.match(h.logs[0] || '', /Usage:/);
});

test('runRootAccountCommand exits 1 for unknown account action', async () => {
  const h = createHarness();
  await runRootAccountCommand(['account', 'remove'], h.deps);
  assert.equal(h.getExitCode(), 1);
  assert.equal(h.logs.length, 1);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /Unknown account action/);
});

test('runRootAccountCommand runs global import and refreshes providers', async () => {
  const h = createHarness();
  const refreshed = [];
  const seenImportArgs = [];
  h.deps.runGlobalAccountImport = async (args) => {
    seenImportArgs.push(...args);
    return {
      providers: ['codex', 'gemini'],
      failedProviders: []
    };
  };
  h.deps.refreshAccountStateIndexForProvider = (provider, opts) => {
    refreshed.push({ provider, opts });
  };

  await runRootAccountCommand(['account', 'import', '/tmp/accounts'], h.deps);
  assert.equal(h.getExitCode(), 0);
  assert.deepEqual(seenImportArgs, ['/tmp/accounts']);
  assert.deepEqual(refreshed, [
    { provider: 'codex', opts: { refreshSnapshot: false } },
    { provider: 'gemini', opts: { refreshSnapshot: false } }
  ]);
});

test('runRootAccountCommand exits 1 when import has failed providers', async () => {
  const h = createHarness();
  h.deps.runGlobalAccountImport = async () => ({
    providers: ['codex'],
    failedProviders: ['gemini']
  });

  await runRootAccountCommand(['account', 'import'], h.deps);
  assert.equal(h.getExitCode(), 1);
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0], /completed with failures/);
});
