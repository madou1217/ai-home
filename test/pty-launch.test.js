const test = require('node:test');
const assert = require('node:assert/strict');
const { buildPtyLaunch } = require('../lib/runtime/pty-launch');

test('buildPtyLaunch keeps direct launch on linux', () => {
  const launch = buildPtyLaunch('/usr/local/bin/codex', ['--help'], { platform: 'linux' });
  assert.equal(launch.command, '/usr/local/bin/codex');
  assert.deepEqual(launch.args, ['--help']);
});

test('buildPtyLaunch wraps .cmd with cmd.exe on windows', () => {
  const launch = buildPtyLaunch(
    'C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd',
    ['--sandbox', 'danger-full-access'],
    { platform: 'win32', windowsCommandName: 'codex' }
  );
  assert.equal(launch.command, 'cmd.exe');
  assert.equal(launch.args[0], '/d');
  assert.equal(launch.args[1], '/c');
  assert.equal(launch.args[2], 'C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd');
  assert.equal(launch.args[3], '--sandbox');
  assert.equal(launch.args[4], 'danger-full-access');
});

test('buildPtyLaunch wraps extensionless command with cmd.exe on windows', () => {
  const launch = buildPtyLaunch('codex', ['login'], { platform: 'win32' });
  assert.equal(launch.command, 'cmd.exe');
  assert.deepEqual(launch.args.slice(0, 2), ['/d', '/c']);
  assert.equal(launch.args[2], 'codex');
  assert.equal(launch.args[3], 'login');
});

test('buildPtyLaunch keeps native exe direct on windows', () => {
  const launch = buildPtyLaunch(
    'C:\\Program Files\\OpenAI\\codex.exe',
    ['--version'],
    { platform: 'win32' }
  );
  assert.equal(launch.command, 'C:\\Program Files\\OpenAI\\codex.exe');
  assert.deepEqual(launch.args, ['--version']);
});

test('buildPtyLaunch can keep cmd shim path when commandName is not provided', () => {
  const launch = buildPtyLaunch(
    'C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd',
    ['--version'],
    { platform: 'win32' }
  );
  assert.equal(launch.command, 'cmd.exe');
  assert.equal(launch.args[2], 'C:\\Users\\me\\AppData\\Roaming\\npm\\codex.cmd');
});
