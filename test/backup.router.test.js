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

test('ensureArchiveExtractedByHash reuses cached extraction for same archive hash', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-backup-router-'));
  try {
    const aiHomeDir = path.join(root, '.ai_home');
    fs.mkdirSync(aiHomeDir, { recursive: true });
    const zipPath = path.join(root, 'sample.zip');
    fs.writeFileSync(zipPath, 'fake-zip-content');

    let unzipCalls = 0;
    const execSync = (cmd) => {
      const text = String(cmd || '');
      if (text.startsWith('7z ') || text.startsWith('7za ')) {
        throw new Error('7z unavailable in test');
      }
      const m = text.match(/-d "([^"]+)"/);
      if (!m) throw new Error(`unexpected command: ${text}`);
      const outDir = m[1];
      fs.mkdirSync(path.join(outDir, 'accounts', 'codex', '1', '.codex'), { recursive: true });
      fs.writeFileSync(path.join(outDir, 'accounts', 'codex', '1', '.codex', 'auth.json'), '{"ok":true}');
      unzipCalls += 1;
    };

    const first = await __private.ensureArchiveExtractedByHash({
      fs,
      path,
      os,
      fse,
      execSync,
      processImpl: { platform: 'linux' },
      cryptoImpl: require('node:crypto'),
      zipPath,
      aiHomeDir
    });
    const second = await __private.ensureArchiveExtractedByHash({
      fs,
      path,
      os,
      fse,
      execSync,
      processImpl: { platform: 'linux' },
      cryptoImpl: require('node:crypto'),
      zipPath,
      aiHomeDir
    });

    assert.equal(first.cacheHit, false);
    assert.equal(second.cacheHit, true);
    assert.equal(second.hash, first.hash);
    assert.equal(second.extractDir, first.extractDir);
    assert.equal(unzipCalls, 1);
    assert.equal(fs.existsSync(path.join(second.extractDir, 'accounts', 'codex', '1', '.codex', 'auth.json')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('resolveBundled7zipPath picks first existing bundled binary candidate', () => {
  const fakeFs = {
    existsSync: (candidate) => String(candidate).includes('/ok/7za')
  };
  const resolved = __private.resolveBundled7zipPath({
    fs: fakeFs,
    sevenZipBin: {
      path7za: '/ok/7za',
      path7x: '/nope/7x.sh'
    }
  });
  assert.equal(resolved, '/ok/7za');
});

test('tryExtractZipWith7z falls back to bundled binary after system commands fail', () => {
  const commands = [];
  const ok = __private.tryExtractZipWith7z({
    execSync: (cmd) => {
      const text = String(cmd || '');
      commands.push(text);
      if (text.startsWith('7z ') || text.startsWith('7za ') || text.includes('Program Files\\7-Zip')) {
        throw new Error('system 7z not found');
      }
      if (text.includes('bundle\\7za.exe')) return;
      throw new Error(`unexpected command: ${text}`);
    },
    zipPath: 'C:\\tmp\\a.zip',
    extractDir: 'C:\\tmp\\out',
    processImpl: { platform: 'win32' },
    bundled7zPath: 'C:\\bundle\\7za.exe'
  });

  assert.equal(ok, true);
  assert.equal(commands.length, 4);
  assert.equal(commands[0].startsWith('7z x '), true);
  assert.equal(commands[1].startsWith('7za x '), true);
  assert.equal(commands[2].includes('Program Files\\7-Zip\\7z.exe'), true);
  assert.equal(commands[3].includes('bundle\\7za.exe'), true);
});
