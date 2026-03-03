'use strict';

const path = require('node:path');
const { resolveAccountImporter, listImporterSupportedAiClis } = require('./importers');

function parseGlobalAccountImportArgs(rawArgs) {
  let sourceRoot = 'accounts';
  const passthroughArgs = [];
  const tokens = Array.isArray(rawArgs) ? rawArgs.slice() : [];
  const VALUE_OPTIONS = new Set(['--parallel', '-p', '--limit', '--name-prefix']);
  for (let i = 0; i < tokens.length; i += 1) {
    const token = String(tokens[i] || '').trim();
    if (!token) continue;
    if (VALUE_OPTIONS.has(token)) {
      passthroughArgs.push(token);
      const nextVal = String(tokens[i + 1] || '').trim();
      if (nextVal) {
        passthroughArgs.push(nextVal);
        i += 1;
      }
      continue;
    }
    if (!token.startsWith('-') && sourceRoot === 'accounts') {
      sourceRoot = token;
      continue;
    }
    passthroughArgs.push(token);
  }
  return {
    sourceRoot,
    passthroughArgs
  };
}

async function runGlobalAccountImport(rawArgs, deps = {}) {
  const fs = deps.fs;
  const log = deps.log || console.log;
  const error = deps.error || console.error;
  const parseCodexBulkImportArgs = deps.parseCodexBulkImportArgs;
  const importCodexTokensFromOutput = deps.importCodexTokensFromOutput;

  const parsed = parseGlobalAccountImportArgs(rawArgs);
  const rootDir = path.resolve(parsed.sourceRoot);
  if (!fs.existsSync(rootDir) || !fs.statSync(rootDir).isDirectory()) {
    throw new Error(`Account source root not found: ${rootDir}`);
  }

  const entries = fs.readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  if (entries.length === 0) {
    throw new Error(`No provider directories found under ${rootDir}`);
  }

  const supported = [];
  const unsupported = [];
  for (const provider of entries) {
    if (resolveAccountImporter(provider)) {
      supported.push(provider);
    } else {
      unsupported.push(provider);
    }
  }

  if (supported.length === 0) {
    const supportedList = listImporterSupportedAiClis().join(', ') || 'none';
    throw new Error(`No supported importers found under ${rootDir}. supported_importers=${supportedList}`);
  }

  if (unsupported.length > 0) {
    log(`\x1b[90m[aih]\x1b[0m skipped unsupported provider dirs: ${unsupported.join(', ')}`);
  }

  log(`\x1b[36m[aih]\x1b[0m account import providers: ${supported.join(', ')}`);

  const failures = [];
  for (const provider of supported) {
    const importer = resolveAccountImporter(provider);
    const providerSourceDir = path.join(rootDir, provider);
    let exitCode = 0;
    // Reuse provider-level importer contract while keeping global flow in-process.
    await importer([providerSourceDir, ...parsed.passthroughArgs], {
      parseCodexBulkImportArgs,
      importCodexTokensFromOutput,
      log: (line) => log(`[${provider}] ${line}`),
      error: (line) => error(`[${provider}] ${line}`),
      exit: (code) => { exitCode = Number(code) || 0; }
    });
    if (exitCode !== 0) {
      failures.push(provider);
    }
  }

  return {
    sourceRoot: rootDir,
    providers: supported,
    failedProviders: failures
  };
}

module.exports = {
  parseGlobalAccountImportArgs,
  runGlobalAccountImport
};
