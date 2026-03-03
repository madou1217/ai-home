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
