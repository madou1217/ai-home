const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { EventEmitter } = require('node:events');
const fse = require('fs-extra');
const { __private } = require('../lib/cli/commands/backup/router');

function writeJson(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(payload));
}

function createSpawnStub(handler) {
  return (command, args) => {
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    process.nextTick(() => handler({ command, args, child }));
    return child;
  };
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
      aiHomeDir,
      spawnImpl: createSpawnStub(({ child }) => child.emit('close', 1))
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
      aiHomeDir,
      spawnImpl: createSpawnStub(({ child }) => child.emit('close', 1))
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

test('tryExtractZipWith7z falls back to bundled binary after system commands fail', async () => {
  const commands = [];
  const ok = await __private.tryExtractZipWith7z({
    zipPath: 'C:\\tmp\\a.zip',
    extractDir: 'C:\\tmp\\out',
    processImpl: { platform: 'win32' },
    bundled7zPath: 'C:\\bundle\\7za.exe',
    spawnImpl: createSpawnStub(({ command, child }) => {
      commands.push(String(command || ''));
      if (String(command || '').includes('bundle\\7za.exe')) {
        child.stdout.emit('data', '17%');
        child.stdout.emit('data', '100%');
        child.emit('close', 0);
        return;
      }
      child.emit('close', 1);
    })
  });

  assert.equal(ok, true);
  assert.equal(commands.length, 4);
  assert.equal(commands[0], '7z');
  assert.equal(commands[1], '7za');
  assert.equal(commands[2], 'C:\\Program Files\\7-Zip\\7z.exe');
  assert.equal(commands[3], 'C:\\bundle\\7za.exe');
});
