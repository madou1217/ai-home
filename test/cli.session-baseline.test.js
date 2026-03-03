const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aih-cli-baseline-'));
}

function runCli(args, hostHomeDir) {
  return spawnSync(process.execPath, ['bin/ai-home.js', ...args], {
    cwd: REPO_ROOT,
    env: {
      ...process.env,
      AIH_HOST_HOME: hostHomeDir,
      HOME: hostHomeDir
    },
    encoding: 'utf8'
  });
}

test('`aih ls` is read-only and does not create profile directories', (t) => {
  const homeDir = mkTmpDir();
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));

  const result = runCli(['ls'], homeDir);
  assert.equal(result.status, 0, `stdout=${result.stdout}\nstderr=${result.stderr}`);

  const aiHomeDir = path.join(homeDir, '.ai_home');
  assert.equal(fs.existsSync(aiHomeDir), false, 'read-only list command should not create ~/.ai_home');
});

test('`set-default` updates default pointer, syncs host config, and preserves session topology', (t) => {
  const homeDir = mkTmpDir();
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));

  const toolDir = path.join(homeDir, '.ai_home', 'profiles', 'codex');
  const accountDir = path.join(toolDir, '1');
  const sandboxConfigDir = path.join(accountDir, '.codex');
  const sandboxSessionsDir = path.join(sandboxConfigDir, 'sessions');
  const sandboxAuthPath = path.join(sandboxConfigDir, 'auth.json');
  fs.mkdirSync(sandboxSessionsDir, { recursive: true });
  fs.writeFileSync(path.join(sandboxSessionsDir, 'local-session.json'), '{"local":true}\n');
  fs.writeFileSync(sandboxAuthPath, '{"sandbox":"auth"}\n');

  const globalCodexDir = path.join(homeDir, '.codex');
  fs.mkdirSync(globalCodexDir, { recursive: true });
  fs.writeFileSync(path.join(globalCodexDir, 'history.jsonl'), '{"global":true}\n');

  const result = runCli(['codex', 'set-default', '1'], homeDir);
  assert.equal(result.status, 0, `stdout=${result.stdout}\nstderr=${result.stderr}`);

  const defaultPath = path.join(toolDir, '.aih_default');
  assert.equal(fs.readFileSync(defaultPath, 'utf8').trim(), '1');

  const sandboxSessionsStat = fs.lstatSync(sandboxSessionsDir);
  assert.equal(sandboxSessionsStat.isDirectory(), true, 'sandbox sessions path should remain a directory');
  assert.equal(sandboxSessionsStat.isSymbolicLink(), false, 'set-default must not rewrite sessions into symlink topology');
  assert.equal(
    fs.existsSync(path.join(sandboxSessionsDir, 'local-session.json')),
    true,
    'existing sandbox session content should remain untouched'
  );
  assert.equal(
    fs.existsSync(path.join(globalCodexDir, 'history.jsonl')),
    true,
    'native global codex topology should remain untouched'
  );
  assert.equal(
    fs.readFileSync(path.join(globalCodexDir, 'auth.json'), 'utf8'),
    '{"sandbox":"auth"}\n',
    'set-default should sync selected account config into native global tool directory'
  );
});

test('`aih ls` ignores lock-like non-numeric entries under tool profile dir', (t) => {
  const homeDir = mkTmpDir();
  t.after(() => fs.rmSync(homeDir, { recursive: true, force: true }));

  const codexToolDir = path.join(homeDir, '.ai_home', 'profiles', 'codex');
  const lockLikeDir = path.join(codexToolDir, '.aih_auto_pool.lock');
  const numericAccountDir = path.join(codexToolDir, '1', '.codex');
  fs.mkdirSync(lockLikeDir, { recursive: true });
  fs.mkdirSync(numericAccountDir, { recursive: true });

  const result = runCli(['ls'], homeDir);
  assert.equal(result.status, 0, `stdout=${result.stdout}\nstderr=${result.stderr}`);
  assert.equal(result.stdout.includes('Account ID: .aih_auto_pool.lock'), false);
  assert.equal(result.stdout.includes('Account ID: \x1b[36m1\x1b[0m'), true);
});
