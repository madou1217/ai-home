const test = require('node:test');
const assert = require('node:assert/strict');
const {
  resolveAccountImporter,
  listImporterSupportedAiClis
} = require('../lib/cli/services/ai-cli/importers');
const { runAiCliAccountAction } = require('../lib/cli/services/ai-cli/account-actions');

test('importer registry resolves codex and rejects unsupported providers', () => {
  const supported = listImporterSupportedAiClis();
  assert.equal(Array.isArray(supported), true);
  assert.equal(supported.includes('codex'), true);
  assert.equal(resolveAccountImporter('codex') instanceof Function, true);
  assert.equal(resolveAccountImporter('gemini'), null);
  assert.equal(resolveAccountImporter('claude'), null);
});

test('account action reports not implemented for unsupported provider import', () => {
  const errors = [];
  let exitCode = null;
  runAiCliAccountAction('gemini', 'import', [], {
    log: () => {},
    error: (msg) => errors.push(String(msg)),
    exit: (code) => { exitCode = code; }
  });
  assert.equal(exitCode, 1);
  assert.equal(errors.some((line) => line.includes('not implemented yet')), true);
});

test('account action routes codex import through importer registry', async () => {
  const logs = [];
  let exitCode = null;
  runAiCliAccountAction('codex', 'import', ['--dry-run'], {
    parseCodexBulkImportArgs: (args) => ({ args, dryRun: true }),
    importCodexTokensFromOutput: async () => ({
      dryRun: true,
      sourceDir: '/tmp',
      scannedFiles: 1,
      parsedLines: 1,
      imported: 1,
      duplicates: 0,
      invalid: 0
    }),
    log: (msg) => logs.push(String(msg)),
    error: () => {},
    exit: (code) => { exitCode = code; }
  });

  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(exitCode, 0);
  assert.equal(logs.some((line) => line.includes('codex account import done')), true);
});
