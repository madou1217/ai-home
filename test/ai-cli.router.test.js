const test = require('node:test');
const assert = require('node:assert/strict');
const { runAiCliCommandRouter } = require('../lib/cli/commands/ai-cli/router');

test('`aih codex` without explicit action uses auto account routing', () => {
  const runCalls = [];
  const exits = [];
  const logs = [];

  const processImpl = {
    exit: (code) => exits.push(code)
  };
  const fs = {
    existsSync: () => true
  };

  const originalLog = console.log;
  const originalError = console.error;
  console.log = (msg) => logs.push(String(msg));
  console.error = () => {};

  try {
    runAiCliCommandRouter('codex', ['codex'], {
      processImpl,
      fs,
      PROFILES_DIR: '/tmp/aih-test-profiles',
      HOST_HOME_DIR: '/tmp',
      extractActiveEnv: () => null,
      getNextAvailableId: () => '2',
      runCliPty: (cliName, id, forwardArgs) => runCalls.push({ cliName, id, forwardArgs })
    });
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }

  assert.deepEqual(exits, []);
  assert.deepEqual(runCalls, [{ cliName: 'codex', id: '2', forwardArgs: [] }]);
  assert.equal(logs.some((line) => line.includes('Auto-selected Account ID')), true);
});

test('`aih codex ls <id>` forwards id filter to listProfiles', () => {
  const exits = [];
  const listCalls = [];
  runAiCliCommandRouter('codex', ['codex', 'ls', '24444'], {
    processImpl: { exit: (code) => exits.push(code) },
    fs: { existsSync: () => true },
    listProfiles: (cliName, id) => listCalls.push({ cliName, id }),
    showLsHelp: () => {}
  });
  assert.deepEqual(listCalls, [{ cliName: 'codex', id: '24444' }]);
  assert.deepEqual(exits, [0]);
});

test('`aih codex ls foo` returns invalid id error', () => {
  const exits = [];
  const errors = [];
  const originalError = console.error;
  console.error = (msg) => errors.push(String(msg));
  try {
    runAiCliCommandRouter('codex', ['codex', 'ls', 'foo'], {
      processImpl: { exit: (code) => exits.push(code) },
      fs: { existsSync: () => true },
      listProfiles: () => {},
      showLsHelp: () => {}
    });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(exits, [1]);
  assert.equal(errors.some((line) => line.includes('Invalid ID. Usage: aih codex ls [id]')), true);
});

test('`aih codex login --no-browser` forwards flag to login PTY flow', () => {
  const exits = [];
  const calls = [];
  runAiCliCommandRouter('codex', ['codex', 'login', '--no-browser'], {
    processImpl: { exit: (code) => exits.push(code) },
    fs: { existsSync: () => true },
    extractActiveEnv: () => null,
    getNextId: () => '42',
    createAccount: () => true,
    runCliPty: (cliName, id, forwardArgs, isLogin) => calls.push({ cliName, id, forwardArgs, isLogin })
  });

  assert.deepEqual(exits, []);
  assert.deepEqual(calls, [{
    cliName: 'codex',
    id: '42',
    forwardArgs: ['--no-browser'],
    isLogin: true
  }]);
});

test('`aih codex <id> --no-browser` logs in the same account when unconfigured', () => {
  const calls = [];
  runAiCliCommandRouter('codex', ['codex', '12', '--no-browser'], {
    processImpl: { exit: () => {} },
    fs: { existsSync: () => true },
    extractActiveEnv: () => null,
    getProfileDir: () => '/tmp/aih-test/codex/12',
    checkStatus: () => ({ configured: false, accountName: 'Unknown' }),
    runCliPty: (cliName, id, forwardArgs, isLogin) => calls.push({ cliName, id, forwardArgs, isLogin })
  });
  assert.deepEqual(calls, [{
    cliName: 'codex',
    id: '12',
    forwardArgs: ['--no-browser'],
    isLogin: true
  }]);
});

test('`aih codex <id> --no-browser` creates new account when target account is already configured', () => {
  const calls = [];
  const logs = [];
  const originalLog = console.log;
  console.log = (msg) => logs.push(String(msg));
  try {
    runAiCliCommandRouter('codex', ['codex', '12', '--no-browser'], {
      processImpl: { exit: () => {} },
      fs: { existsSync: () => true },
      extractActiveEnv: () => null,
      getProfileDir: () => '/tmp/aih-test/codex/12',
      checkStatus: () => ({ configured: true, accountName: 'u@example.com' }),
      getNextId: () => '13',
      createAccount: () => true,
      runCliPty: (cliName, id, forwardArgs, isLogin) => calls.push({ cliName, id, forwardArgs, isLogin })
    });
  } finally {
    console.log = originalLog;
  }
  assert.equal(logs.some((line) => line.includes('already logged in') && line.includes('Creating Account 13')), true);
  assert.deepEqual(calls, [{
    cliName: 'codex',
    id: '13',
    forwardArgs: ['--no-browser'],
    isLogin: true
  }]);
});

test('`aih codex usage -j 200` forwards jobs option to usage scan', async () => {
  const exits = [];
  const calls = [];
  runAiCliCommandRouter('codex', ['codex', 'usage', '-j', '200'], {
    processImpl: { exit: (code) => exits.push(code) },
    fs: { existsSync: () => true },
    printAllUsageSnapshots: async (cliName, opts) => { calls.push({ cliName, opts }); }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [{ cliName: 'codex', opts: { jobs: 200 } }]);
  assert.deepEqual(exits, [0]);
});

test('`aih codex usage --jobs 200` is rejected (single -j flag policy)', () => {
  const exits = [];
  const errors = [];
  const originalError = console.error;
  console.error = (msg) => errors.push(String(msg));
  try {
    runAiCliCommandRouter('codex', ['codex', 'usage', '--jobs', '200'], {
      processImpl: { exit: (code) => exits.push(code) },
      fs: { existsSync: () => true },
      printAllUsageSnapshots: async () => {}
    });
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(exits, [1]);
  assert.equal(errors.some((line) => line.includes('Unknown usage scan arg: --jobs')), true);
});

test('`aih codex usage <id> --no-cache` forwards noCache query option', async () => {
  const exits = [];
  const calls = [];
  runAiCliCommandRouter('codex', ['codex', 'usage', '12', '--no-cache'], {
    processImpl: { exit: (code) => exits.push(code) },
    fs: { existsSync: () => true },
    getProfileDir: () => '/tmp/aih-test/codex/12',
    printUsageSnapshotAsync: async (cliName, id, opts) => {
      calls.push({ cliName, id, opts });
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [{
    cliName: 'codex',
    id: '12',
    opts: { noCache: true }
  }]);
  assert.deepEqual(exits, [0]);
});

test('`aih codex <id> usage --no-cache` forwards noCache query option', async () => {
  const exits = [];
  const calls = [];
  runAiCliCommandRouter('codex', ['codex', '12', 'usage', '--no-cache'], {
    processImpl: { exit: (code) => exits.push(code) },
    fs: { existsSync: () => true },
    extractActiveEnv: () => null,
    getProfileDir: () => '/tmp/aih-test/codex/12',
    printUsageSnapshotAsync: async (cliName, id, opts) => {
      calls.push({ cliName, id, opts });
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(calls, [{
    cliName: 'codex',
    id: '12',
    opts: { noCache: true }
  }]);
  assert.deepEqual(exits, [0]);
});

test('`aih codex import` routes through unified import with fixed provider', async () => {
  const exits = [];
  const calls = [];
  runAiCliCommandRouter('codex', ['codex', 'import', 'folder1', 'zip1.zip', 'cliproxyapi'], {
    processImpl: { exit: (code) => exits.push(code) },
    fs: { existsSync: () => true },
    renderStageProgress: () => {},
    runUnifiedImport: async (args, opts) => {
      calls.push({ args, opts });
      return {
        providers: ['codex'],
        failedSources: []
      };
    }
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args, ['folder1', 'zip1.zip', 'cliproxyapi']);
  assert.equal(calls[0].opts.provider, 'codex');
  assert.equal(calls[0].opts.log, console.log);
  assert.equal(calls[0].opts.error, console.error);
  assert.equal(typeof calls[0].opts.renderStageProgress, 'function');
  assert.deepEqual(exits, [0]);
});
