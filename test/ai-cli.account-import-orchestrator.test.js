const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  parseGlobalAccountImportArgs,
  runGlobalAccountImport
} = require('../lib/cli/services/ai-cli/account-import-orchestrator');

test('parseGlobalAccountImportArgs supports default root and passthrough flags', () => {
  const parsedDefault = parseGlobalAccountImportArgs(['--dry-run', '--parallel', '4']);
  assert.equal(parsedDefault.sourceRoot, 'accounts');
  assert.deepEqual(parsedDefault.passthroughArgs, ['--dry-run', '--parallel', '4']);

  const parsedCustom = parseGlobalAccountImportArgs(['/tmp/accounts', '--limit', '8']);
  assert.equal(parsedCustom.sourceRoot, '/tmp/accounts');
  assert.deepEqual(parsedCustom.passthroughArgs, ['--limit', '8']);
});

test('runGlobalAccountImport scans accounts/<provider> and invokes supported importers', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'aih-global-import-'));
  const accountsRoot = path.join(root, 'accounts');
  const codexDir = path.join(accountsRoot, 'codex');
  const geminiDir = path.join(accountsRoot, 'gemini');
  fs.mkdirSync(codexDir, { recursive: true });
  fs.mkdirSync(geminiDir, { recursive: true });

  let seenSourceDir = '';
  const result = await runGlobalAccountImport([accountsRoot, '--dry-run'], {
    fs,
    log: () => {},
    error: () => {},
    parseCodexBulkImportArgs: (args) => {
      seenSourceDir = String(args[0] || '');
      return { sourceDir: seenSourceDir, dryRun: true, parallel: 1, limit: 0 };
    },
    importCodexTokensFromOutput: async () => ({
      dryRun: true,
      sourceDir: seenSourceDir,
      scannedFiles: 0,
      parsedLines: 0,
      imported: 0,
      duplicates: 0,
      invalid: 0
    })
  });

  assert.equal(seenSourceDir, codexDir);
  assert.deepEqual(result.providers, ['codex']);
  assert.deepEqual(result.failedProviders, []);
});
