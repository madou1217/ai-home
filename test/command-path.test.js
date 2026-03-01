const test = require('node:test');
const assert = require('node:assert/strict');
const { resolveCommandPath } = require('../lib/runtime/command-path');

test('resolveCommandPath returns empty for blank command', () => {
  assert.equal(resolveCommandPath(''), '');
});

test('resolveCommandPath uses where on win32 and returns first match', () => {
  const calls = [];
  const out = resolveCommandPath('codex', {
    platform: 'win32',
    spawnSyncImpl: (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return {
        status: 0,
        stdout: 'C:\\\\Users\\\\me\\\\AppData\\\\Roaming\\\\npm\\\\codex.cmd\r\nC:\\\\another\\\\codex.cmd\r\n'
      };
    }
  });

  assert.equal(out, 'C:\\\\Users\\\\me\\\\AppData\\\\Roaming\\\\npm\\\\codex.cmd');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'where');
  assert.deepEqual(calls[0].args, ['codex']);
});

test('resolveCommandPath returns empty on win32 probe failure', () => {
  const out = resolveCommandPath('codex', {
    platform: 'win32',
    spawnSyncImpl: () => ({ status: 1, stdout: '' })
  });
  assert.equal(out, '');
});

test('resolveCommandPath uses command -v on linux and trims output', () => {
  const calls = [];
  const out = resolveCommandPath('codex', {
    platform: 'linux',
    spawnSyncImpl: (cmd, args, options) => {
      calls.push({ cmd, args, options });
      return { status: 0, stdout: '/usr/local/bin/codex\n' };
    }
  });

  assert.equal(out, '/usr/local/bin/codex');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].cmd, 'sh');
  assert.equal(calls[0].args[0], '-lc');
  assert.match(calls[0].args[1], /command -v "codex"/);
});

test('resolveCommandPath escapes special characters for shell probing', () => {
  let commandString = '';
  resolveCommandPath('co"de$x`', {
    platform: 'linux',
    spawnSyncImpl: (_cmd, args) => {
      commandString = args[1];
      return { status: 0, stdout: '/tmp/fake\n' };
    }
  });

  assert.equal(commandString, 'command -v "co\\"de\\$x\\`"');
});
