const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const fse = require('fs-extra');
const { __private } = require('../lib/cli/commands/backup/router');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload));
}

test('resolveImportSourceRoot prefers accounts/ root when present', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-backup-router-'));
  try {
    writeJson(path.join(root, 'accounts', 'codex', '1', '.codex', 'auth.json'), { ok: true });
    const resolved = __private.resolveImportSourceRoot({
      fs,
      path,
      fse,
      extractDir: root,
      provider: '',
      folderHint: ''
    });
    assert.equal(resolved.sourceRoot, path.join(root, 'accounts'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveImportSourceRoot supports direct provider root without accounts/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-backup-router-'));
  try {
    writeJson(path.join(root, 'codex', '1', '.codex', 'auth.json'), { ok: true });
    const resolved = __private.resolveImportSourceRoot({
      fs,
      path,
      fse,
      extractDir: root,
      provider: '',
      folderHint: ''
    });
    assert.equal(resolved.sourceRoot, root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveImportSourceRoot maps custom folder to provider root when provider is explicit', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-backup-router-'));
  try {
    writeJson(path.join(root, 'abc', '10001', 'auth.json'), { refresh_token: 'rt_x' });
    const resolved = __private.resolveImportSourceRoot({
      fs,
      path,
      fse,
      extractDir: root,
      provider: 'codex',
      folderHint: 'abc'
    });
    assert.equal(resolved.sourceRoot, path.join(root, '__aih_import_root'));
    assert.equal(fs.existsSync(path.join(resolved.sourceRoot, 'codex')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
