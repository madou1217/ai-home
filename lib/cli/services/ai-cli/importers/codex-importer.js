'use strict';

const { runCodexAccountImport } = require('../../account-import');

function runCodexImporter(actionArgs, deps = {}) {
  return runCodexAccountImport(actionArgs, {
    parseCodexBulkImportArgs: deps.parseCodexBulkImportArgs,
    importCodexTokensFromOutput: deps.importCodexTokensFromOutput,
    log: deps.log,
    error: deps.error,
    exit: deps.exit
  });
}

module.exports = {
  runCodexImporter
};
