'use strict';

async function runRootAccountCommand(args, deps = {}) {
  const processObj = deps.processObj || process;
  const consoleImpl = deps.consoleImpl || console;
  const fs = deps.fs;

  const action = String(args[1] || '').trim().toLowerCase();
  if (action === 'help' || action === '--help' || action === '-h' || !action) {
    consoleImpl.log('\x1b[90mUsage:\x1b[0m aih account import [sourceDir] [--dry-run]');
    processObj.exit(0);
    return;
  }
  if (action !== 'import') {
    consoleImpl.error(`\x1b[31m[aih] Unknown account action '${action}'.\x1b[0m`);
    consoleImpl.log('\x1b[90mUsage:\x1b[0m aih account import [sourceDir] [--dry-run]');
    processObj.exit(1);
    return;
  }

  try {
    const result = await deps.runGlobalAccountImport(args.slice(2), {
      fs,
      log: consoleImpl.log,
      error: consoleImpl.error,
      parseCodexBulkImportArgs: deps.parseCodexBulkImportArgs,
      importCodexTokensFromOutput: deps.importCodexTokensFromOutput
    });
    if (result.failedProviders.length > 0) {
      consoleImpl.error(`\x1b[31m[aih] account import completed with failures: ${result.failedProviders.join(', ')}\x1b[0m`);
      processObj.exit(1);
      return;
    }
    result.providers.forEach((provider) => {
      deps.refreshAccountStateIndexForProvider(provider, { refreshSnapshot: false });
    });
    consoleImpl.log(`\x1b[32m[aih]\x1b[0m account import completed for providers: ${result.providers.join(', ')}`);
    processObj.exit(0);
  } catch (e) {
    consoleImpl.error(`\x1b[31m[aih] account import failed: ${e.message}\x1b[0m`);
    processObj.exit(1);
  }
}

module.exports = {
  runRootAccountCommand
};
