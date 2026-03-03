'use strict';

async function runCodexAccountImport(args, deps = {}) {
  const parseCodexBulkImportArgs = deps.parseCodexBulkImportArgs;
  const importCodexTokensFromOutput = deps.importCodexTokensFromOutput;
  const log = typeof deps.log === 'function' ? deps.log : console.log;
  const error = typeof deps.error === 'function' ? deps.error : console.error;
  const exit = typeof deps.exit === 'function' ? deps.exit : null;

  if (typeof parseCodexBulkImportArgs !== 'function' || typeof importCodexTokensFromOutput !== 'function') {
    error('\x1b[31m[aih] account import service misconfigured.\x1b[0m');
    if (exit) exit(1);
    throw new Error('account import service misconfigured');
  }

  let parsedOptions;
  try {
    parsedOptions = parseCodexBulkImportArgs(args);
  } catch (e) {
    error(`\x1b[31m[aih] ${e.message}\x1b[0m`);
    log('\x1b[90mUsage:\x1b[0m aih codex account import [sourceDir] [--dry-run]');
    if (exit) exit(1);
    throw e;
  }

  try {
    const result = await importCodexTokensFromOutput(parsedOptions);
    const modeLabel = result.dryRun ? 'dry-run' : 'write';
    log(`\x1b[36m[aih]\x1b[0m codex account import done (${modeLabel})`);
    log(`  source: ${result.sourceDir}`);
    log(`  files: ${result.scannedFiles}`);
    log(`  parsed: ${result.parsedLines}`);
    log(`  imported: ${result.imported}`);
    log(`  duplicates: ${result.duplicates}`);
    log(`  invalid: ${result.invalid}`);
    if (!result.dryRun) {
      log(`  failed: ${result.failed || 0}`);
      if (result.firstError) {
        log(`  first_error: ${result.firstError}`);
      }
    }
    if (exit) exit(0);
    return result;
  } catch (e) {
    error(`\x1b[31m[aih] account import failed: ${e.message}\x1b[0m`);
    if (exit) exit(1);
    throw e;
  }
}

module.exports = {
  runCodexAccountImport
};
