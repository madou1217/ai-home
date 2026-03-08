const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createUnifiedImportService } = require('../lib/cli/services/import/unified-import');

test('parseUnifiedImportArgs supports mixed sources and provider prefix', () => {
  const service = createUnifiedImportService({
    fs,
    path,
    os,
    fse: require('fs-extra'),
    execSync: () => {},
    spawnImpl: () => {},
    processImpl: { platform: 'linux' },
    cryptoImpl: require('node:crypto'),
    aiHomeDir: '/tmp/.ai_home',
    cliConfigs: { codex: {}, gemini: {} },
    runGlobalAccountImport: async () => ({}),
    importCliproxyapiCodexAuths: async () => ({})
  });

  const parsed = service.parseUnifiedImportArgs(['codex', 'folder1', 'backup.zip', 'cliproxyapi', '--dry-run', '-f', 'inside', '-j', '16'], '');
  assert.deepEqual(parsed, {
    provider: 'codex',
    dryRun: true,
    folder: 'inside',
    jobs: 16,
    sources: ['folder1', 'backup.zip', 'cliproxyapi']
  });
});

test('runUnifiedImport imports mixed directory and cliproxyapi sources with progress summary', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-unified-import-'));
  try {
    const accountsRoot = path.join(root, 'accounts');
    fs.mkdirSync(path.join(accountsRoot, 'codex', '1001'), { recursive: true });

    const progress = [];
    const service = createUnifiedImportService({
      fs,
      path,
      os,
      fse: require('fs-extra'),
      execSync: () => {},
      spawnImpl: () => {},
      processImpl: { platform: 'linux' },
      cryptoImpl: require('node:crypto'),
      aiHomeDir: path.join(root, '.ai_home'),
      cliConfigs: { codex: {} },
      parseCodexBulkImportArgs: () => ({}),
      importCodexTokensFromOutput: async () => ({}),
      runGlobalAccountImport: async (args) => ({
        providers: ['codex'],
        failedProviders: [],
        providerResults: [{
          provider: 'codex',
          imported: args[0].includes('__aih_import_root') ? 1 : 2,
          duplicates: 0,
          invalid: 0,
          failed: 0
        }]
      }),
      importCliproxyapiCodexAuths: async () => ({
        imported: 3,
        duplicates: 1,
        invalid: 0,
        failed: 0
      })
    });

    const result = await service.runUnifiedImport([accountsRoot, 'cliproxyapi'], {
      log: () => {},
      error: () => {},
      renderStageProgress: (_prefix, current, total, label) => progress.push({ current, total, label })
    });

    assert.deepEqual(result.providers, ['codex']);
    assert.equal(result.sourceResults.length, 2);
    assert.equal(result.sourceResults[0].imported, 2);
    assert.equal(result.sourceResults[1].imported, 3);
    assert.equal(progress.length > 0, true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runUnifiedImport auto-discovers nested zip files and provider folders under a container directory', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-unified-import-discover-'));
  try {
    const containerDir = path.join(root, 'codexes');
    const folderSource = path.join(containerDir, 'folder1');
    const zipSource = path.join(containerDir, '1001.zip');
    const zipExtractDir = path.join(root, 'zip-extract');
    fs.mkdirSync(path.join(folderSource, 'accounts', 'codex', '2001'), { recursive: true });
    fs.mkdirSync(path.join(zipExtractDir, 'accounts', 'codex', '3001'), { recursive: true });
    fs.mkdirSync(containerDir, { recursive: true });
    fs.writeFileSync(zipSource, 'fake-zip');

    const calls = [];
    const progress = [];
    const service = createUnifiedImportService({
      fs,
      path,
      os,
      fse: require('fs-extra'),
      execSync: () => {},
      spawnImpl: () => {},
      processImpl: { platform: 'linux' },
      cryptoImpl: require('node:crypto'),
      aiHomeDir: path.join(root, '.ai_home'),
      cliConfigs: { codex: {} },
      getDefaultParallelism: () => 4,
      parseCodexBulkImportArgs: () => ({}),
      importCodexTokensFromOutput: async () => ({}),
      ensureArchiveExtractedByHashImpl: async ({ zipPath, onHashProgress, onExtractProgress }) => {
        onHashProgress(10, 10);
        onExtractProgress(100);
        return {
          extractDir: zipPath === zipSource ? zipExtractDir : root,
          cacheHit: false
        };
      },
      runGlobalAccountImport: async (args, opts) => {
        calls.push({ sourceRoot: args[0], parallel: opts.parallel });
        return {
          providers: ['codex'],
          failedProviders: [],
          providerResults: [{
            provider: 'codex',
            imported: args[0] === folderSource ? 2 : 3,
            duplicates: 0,
            invalid: 0,
            failed: 0
          }]
        };
      },
      importCliproxyapiCodexAuths: async () => ({
        imported: 0,
        duplicates: 0,
        invalid: 0,
        failed: 0
      })
    });

    const result = await service.runUnifiedImport([containerDir, '-j', '8'], {
      log: () => {},
      error: () => {},
      renderStageProgress: (_prefix, current, total, label) => progress.push({ current, total, label })
    });

    assert.equal(result.sourceCount, 2);
    assert.deepEqual(calls, [
      { sourceRoot: path.join(folderSource, 'accounts'), parallel: 4 },
      { sourceRoot: path.join(zipExtractDir, 'accounts'), parallel: 4 }
    ]);
    assert.equal(result.sourceResults.length, 2);
    assert.equal(progress.some((entry) => String(entry.label).includes('discovering')), true);
    assert.equal(progress.some((entry) => String(entry.label).includes('in_flight=')), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runUnifiedImport imports provider-fixed zip when extracted root is direct account directory layout', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-unified-import-provider-zip-'));
  try {
    const zipPath = path.join(root, '1111.zip');
    const zipExtractDir = path.join(root, 'zip-extract');
    fs.writeFileSync(zipPath, 'fake-zip');
    fs.mkdirSync(path.join(zipExtractDir, '10001', '.codex'), { recursive: true });
    fs.writeFileSync(path.join(zipExtractDir, '10001', '.codex', 'auth.json'), '{"refresh_token":"rt_x"}');

    const calls = [];
    const service = createUnifiedImportService({
      fs,
      path,
      os,
      fse: require('fs-extra'),
      execSync: () => {},
      spawnImpl: () => {},
      processImpl: { platform: 'linux' },
      cryptoImpl: require('node:crypto'),
      aiHomeDir: path.join(root, '.ai_home'),
      cliConfigs: { codex: {} },
      parseCodexBulkImportArgs: () => ({}),
      importCodexTokensFromOutput: async () => ({}),
      ensureArchiveExtractedByHashImpl: async () => ({
        extractDir: zipExtractDir,
        cacheHit: false
      }),
      runGlobalAccountImport: async (args) => {
        calls.push(args[0]);
        return {
          providers: ['codex'],
          failedProviders: [],
          providerResults: [{
            provider: 'codex',
            imported: 1,
            duplicates: 0,
            invalid: 0,
            failed: 0
          }]
        };
      },
      importCliproxyapiCodexAuths: async () => ({
        imported: 0,
        duplicates: 0,
        invalid: 0,
        failed: 0
      })
    });

    const result = await service.runUnifiedImport([zipPath], {
      provider: 'codex',
      log: () => {},
      error: () => {}
    });

    assert.equal(result.failedSources.length, 0);
    assert.equal(result.sourceResults.length, 1);
    assert.equal(result.sourceResults[0].imported, 1);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].includes('__aih_import_root'), true);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
