'use strict';

const {
  resolveAccountImporter,
  listImporterSupportedAiClis
} = require('./importers');

function runAiCliAccountAction(cliName, accountAction, actionArgs, deps = {}) {
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const exit = deps.exit || ((code) => process.exit(code));
  if (accountAction !== 'import') {
    error(`\x1b[31m[aih] Unknown account action '${accountAction || ''}'.\x1b[0m`);
    log(`\x1b[90mUsage:\x1b[0m aih ${cliName} account import [sourceDir] [--parallel <1-32>] [--limit <n>] [--dry-run]`);
    exit(1);
    return;
  }

  const importer = resolveAccountImporter(cliName);
  if (!importer) {
    const supported = listImporterSupportedAiClis().join(', ') || 'none';
    error(`\x1b[31m[aih] ${cliName} account import is not implemented yet. Currently supported: ${supported}.\x1b[0m`);
    exit(1);
    return;
  }

  importer(actionArgs, {
    parseCodexBulkImportArgs: deps.parseCodexBulkImportArgs,
    importCodexTokensFromOutput: deps.importCodexTokensFromOutput,
    log,
    error,
    exit
  });
}

module.exports = {
  runAiCliAccountAction
};
