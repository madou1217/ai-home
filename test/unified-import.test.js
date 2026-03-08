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

  const parsed = service.parseUnifiedImportArgs(['codex', 'folder1', 'backup.zip', 'cliproxyapi', '--dry-run', '-f', 'inside'], '');
  assert.deepEqual(parsed, {
    provider: 'codex',
    dryRun: true,
    folder: 'inside',
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
