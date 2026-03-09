const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const fse = require('fs-extra');
const os = require('node:os');
const path = require('node:path');
const { createSessionStoreService } = require('../lib/cli/services/session-store');

function mkTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'aih-session-store-'));
}

test('ensureSessionStoreLinks migrates codex shared config entries into host store and keeps auth isolated', (t) => {
  const root = mkTmpDir();
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));

  const hostHomeDir = path.join(root, 'home');
  const profilesDir = path.join(root, 'profiles');
  const accountConfigDir = path.join(profilesDir, 'codex', '1', '.codex');
  const hostCodexDir = path.join(hostHomeDir, '.codex');
  fs.mkdirSync(accountConfigDir, { recursive: true });
  fs.writeFileSync(path.join(accountConfigDir, 'auth.json'), '{"token":"secret"}\n');
  fs.writeFileSync(path.join(accountConfigDir, 'config.toml'), 'model = "gpt-5"\n');
  fs.mkdirSync(path.join(accountConfigDir, 'memories'), { recursive: true });
  fs.writeFileSync(path.join(accountConfigDir, 'memories', 'note.md'), 'remember me\n');

  const service = createSessionStoreService({
    fs,
    fse,
    path,
    processObj: process,
    hostHomeDir,
    cliConfigs: { codex: { globalDir: '.codex' } },
    getProfileDir: (cliName, id) => path.join(profilesDir, cliName, String(id)),
    ensureDir: (dir) => fs.mkdirSync(dir, { recursive: true })
  });

  const result = service.ensureSessionStoreLinks('codex', '1');
  assert.equal(result.migrated >= 2, true);
  assert.equal(fs.readFileSync(path.join(hostCodexDir, 'config.toml'), 'utf8'), 'model = "gpt-5"\n');
  assert.equal(fs.readFileSync(path.join(hostCodexDir, 'memories', 'note.md'), 'utf8'), 'remember me\n');
  assert.equal(fs.lstatSync(path.join(accountConfigDir, 'config.toml')).isSymbolicLink(), true);
  assert.equal(fs.lstatSync(path.join(accountConfigDir, 'memories')).isSymbolicLink(), true);
  assert.equal(fs.lstatSync(path.join(accountConfigDir, 'auth.json')).isSymbolicLink(), false);
  assert.equal(fs.readFileSync(path.join(accountConfigDir, 'auth.json'), 'utf8'), '{"token":"secret"}\n');
});
