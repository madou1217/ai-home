'use strict';

const { runCodexAccountImport } = require('../account-import');
const {
  canImportAccounts,
  listAccountImportSupportedAiClis
} = require('./provider-registry');

function runAiCliAccountAction(cliName, accountAction, actionArgs, deps = {}) {
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const exit = deps.exit || ((code) => process.exit(code));
  const parseCodexBulkImportArgs = deps.parseCodexBulkImportArgs;
  const importCodexTokensFromOutput = deps.importCodexTokensFromOutput;

  if (accountAction !== 'import') {
    error(`\x1b[31m[aih] Unknown account action '${accountAction || ''}'.\x1b[0m`);
    log(`\x1b[90mUsage:\x1b[0m aih ${cliName} account import [sourceDir] [--parallel <1-32>] [--limit <n>] [--dry-run]`);
    exit(1);
    return;
  }

  if (!canImportAccounts(cliName)) {
    const supported = listAccountImportSupportedAiClis().join(', ') || 'none';
    error(`\x1b[31m[aih] ${cliName} account import is not implemented yet. Currently supported: ${supported}.\x1b[0m`);
    exit(1);
    return;
  }

  runCodexAccountImport(actionArgs, {
    parseCodexBulkImportArgs,
    importCodexTokensFromOutput,
    log,
    error,
    exit
  });
}

module.exports = {
  runAiCliAccountAction
};
