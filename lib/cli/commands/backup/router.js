'use strict';

function isNumericAccountId(name) {
  return /^\d+$/.test(String(name || ''));
}

function collectCredentialRelativePaths(provider) {
  const hiddenDir = `.${String(provider || '').trim()}`;
  return [
    '.aih_env.json',
    `${hiddenDir}/auth.json`,
    `${hiddenDir}/oauth_creds.json`,
    `${hiddenDir}/oauth.json`,
    `${hiddenDir}/token.json`,
    `${hiddenDir}/tokens.json`,
    `${hiddenDir}/credentials.json`,
    `${hiddenDir}/.credentials.json`,
    `${hiddenDir}/settings.json`,
    `${hiddenDir}/google_accounts.json`
  ];
}

function collectSelectedAccountDirs({ fs, path, aiHomeDir, targetPaths }) {
  const profilesRoot = path.join(aiHomeDir, 'profiles');
  if (!fs.existsSync(profilesRoot) || !fs.statSync(profilesRoot).isDirectory()) return [];

  const selected = new Map();
  const addAccount = (provider, id) => {
    if (!provider || !isNumericAccountId(id)) return;
    const key = `${provider}:${id}`;
    if (selected.has(key)) return;
    const profileDir = path.join(profilesRoot, provider, String(id));
    if (!fs.existsSync(profileDir) || !fs.statSync(profileDir).isDirectory()) return;
    selected.set(key, { provider, id: String(id), profileDir });
  };

  const addProviderAccounts = (provider) => {
    const providerDir = path.join(profilesRoot, provider);
    if (!fs.existsSync(providerDir) || !fs.statSync(providerDir).isDirectory()) return;
    fs.readdirSync(providerDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && isNumericAccountId(entry.name))
      .forEach((entry) => addAccount(provider, entry.name));
  };

  const seen = new Set(Array.isArray(targetPaths) ? targetPaths : []);
  if (seen.has('profiles')) {
    fs.readdirSync(profilesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => addProviderAccounts(entry.name));
    return Array.from(selected.values());
  }

  Array.from(seen).forEach((raw) => {
    const rel = String(raw || '').trim();
    if (!rel || !rel.startsWith('profiles/')) return;
    const parts = rel.split('/').filter(Boolean);
    if (parts.length < 2) return;

    const provider = parts[1];
    if (parts.length === 2) {
      addProviderAccounts(provider);
      return;
    }

    addAccount(provider, parts[2]);
  });

  return Array.from(selected.values());
}

function stageSelectedProfilesAsAccounts({ fs, path, fse, aiHomeDir, targetPaths, stageRoot }) {
  const accountsDir = path.join(stageRoot, 'accounts');
  fse.ensureDirSync(accountsDir);
  const providerSet = new Set();
  let copiedAccounts = 0;
  let copiedFiles = 0;

  const selectedAccounts = collectSelectedAccountDirs({
    fs,
    path,
    aiHomeDir,
    targetPaths
  });

  selectedAccounts.forEach((account) => {
    const relFiles = collectCredentialRelativePaths(account.provider);
    let accountCopied = false;
    relFiles.forEach((relFile) => {
      const src = path.join(account.profileDir, relFile);
      if (!fs.existsSync(src) || !fs.statSync(src).isFile()) return;

      const dst = path.join(accountsDir, account.provider, account.id, relFile);
      fse.ensureDirSync(path.dirname(dst));
      fse.copySync(src, dst, { overwrite: true });
      copiedFiles += 1;
      accountCopied = true;
    });

    if (accountCopied) {
      copiedAccounts += 1;
      providerSet.add(account.provider);
    }
  });

  return {
    accountsDir,
    copiedAccounts,
    copiedFiles,
    providerDirs: Array.from(providerSet).sort()
  };
}

function summarizeAccountImportResult(result) {
  const out = {
    providers: [],
    imported: 0,
    duplicates: 0,
    invalid: 0,
    failed: 0
  };
  if (!result || typeof result !== 'object') return out;
  out.providers = Array.isArray(result.providers) ? result.providers.slice() : [];
  const providerResults = Array.isArray(result.providerResults) ? result.providerResults : [];
  providerResults.forEach((item) => {
    out.imported += Number(item.imported || 0);
    out.duplicates += Number(item.duplicates || 0);
    out.invalid += Number(item.invalid || 0);
    out.failed += Number(item.failed || 0);
  });
  return out;
}

function escapePowerShellPath(value) {
  return String(value || '').replace(/'/g, "''");
}

function createZipArchive({ execSync, processImpl, stageDir, outPath }) {
  if (processImpl.platform === 'win32') {
    const src = escapePowerShellPath(stageDir);
    const dst = escapePowerShellPath(outPath);
    execSync(`powershell -NoProfile -Command "Compress-Archive -Path '${src}\\accounts' -DestinationPath '${dst}' -Force"`, {
      stdio: 'ignore'
    });
    return;
  }
  execSync(`cd "${stageDir}" && zip -rq "${outPath}" "accounts"`, { stdio: 'ignore' });
}

function extractZipArchive({ execSync, processImpl, zipPath, extractDir }) {
  if (processImpl.platform === 'win32') {
    const src = escapePowerShellPath(zipPath);
    const dst = escapePowerShellPath(extractDir);
    execSync(`powershell -NoProfile -Command "Expand-Archive -Path '${src}' -DestinationPath '${dst}' -Force"`, {
      stdio: 'ignore'
    });
    return;
  }
  execSync(`unzip -oq "${zipPath}" -d "${extractDir}"`, { stdio: 'ignore' });
}

async function runBackupCommand(cmd, args, deps = {}) {
  if (cmd !== 'export' && cmd !== 'import') return false;

  const {
    fs,
    path,
    os,
    fse,
    execSync,
    readline,
    consoleImpl,
    processImpl,
    ensureAesSuffix,
    defaultExportName,
    parseExportArgs,
    parseImportArgs,
    expandSelectorsToPaths,
    renderStageProgress,
    runGlobalAccountImport,
    parseCodexBulkImportArgs,
    importCodexTokensFromOutput
  } = deps;

  if (cmd === 'export') {
    const { targetFile: parsedTargetFile, selectors } = parseExportArgs(args.slice(1));
    const targetFile = ensureAesSuffix(parsedTargetFile || defaultExportName());
    const targetPaths = expandSelectorsToPaths(selectors);

    if (selectors.length > 0) {
      if (targetPaths.length === 0) {
        consoleImpl.error('\x1b[31m[aih] No matching profiles found for the given selectors.\x1b[0m');
        processImpl.exit(1);
        return true;
      }
      consoleImpl.log(`\x1b[36m[aih]\x1b[0m Preparing export targets:\n  - ${targetPaths.join('\n  - ')}`);
    } else {
      consoleImpl.log('\x1b[36m[aih]\x1b[0m Exporting credential JSON files only (accounts/<provider>/<id>/...).');
    }

    const tmpStageDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aih_export_stage_'));
    let exitCode = 0;
    try {
      const exportStages = 3;
      renderStageProgress('[aih export]', 1, exportStages, 'Collecting credential files');
      const staged = stageSelectedProfilesAsAccounts({
        fs,
        path,
        fse,
        aiHomeDir: deps.aiHomeDir,
        targetPaths,
        stageRoot: tmpStageDir
      });
      if (staged.copiedAccounts === 0 || staged.copiedFiles === 0) {
        throw new Error('No credential files found in selected accounts.');
      }

      renderStageProgress('[aih export]', 2, exportStages, 'Building zip archive');
      const outPath = path.resolve(targetFile);
      createZipArchive({
        execSync,
        processImpl,
        stageDir: tmpStageDir,
        outPath
      });

      renderStageProgress('[aih export]', 3, exportStages, 'Completed');
      consoleImpl.log(`\x1b[90m[aih]\x1b[0m providers=${staged.providerDirs.join(', ')} accounts=${staged.copiedAccounts} files=${staged.copiedFiles}`);
      consoleImpl.log(`\x1b[32m[Success] Backup exported:\x1b[0m ${outPath}`);
    } catch (error) {
      exitCode = 1;
      consoleImpl.error(`\n\x1b[31m[Error] Failed to export: ${error.message}\x1b[0m`);
    } finally {
      if (fs.existsSync(tmpStageDir)) fse.removeSync(tmpStageDir);
    }

    processImpl.exit(exitCode);
    return true;
  }

  let targetFile = '';
  try {
    const parsed = parseImportArgs(args.slice(1));
    targetFile = parsed.targetFile;
    if (parsed.overwrite) {
      consoleImpl.log('\x1b[90m[aih]\x1b[0m -o/--overwrite ignored for zip import (same behavior as account import).');
    }
  } catch (error) {
    consoleImpl.error(`\x1b[31m[aih] ${error.message}. Usage: aih import <file.zip>\x1b[0m`);
    processImpl.exit(1);
    return true;
  }

  if (!targetFile || !fs.existsSync(targetFile)) {
    consoleImpl.error('\x1b[31m[aih] File not found. Usage: aih import <file.zip>\x1b[0m');
    processImpl.exit(1);
    return true;
  }

  const targetPath = path.resolve(targetFile);
  const tmpExtractDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aih_restore_'));
  let exitCode = 0;

  try {
    const importStages = 3;
    renderStageProgress('[aih import]', 1, importStages, 'Extracting zip archive');
    extractZipArchive({
      execSync,
      processImpl,
      zipPath: targetPath,
      extractDir: tmpExtractDir
    });

    const accountsDir = path.join(tmpExtractDir, 'accounts');
    if (!fs.existsSync(accountsDir) || !fs.statSync(accountsDir).isDirectory()) {
      throw new Error('Backup zip does not contain accounts/ directory.');
    }

    renderStageProgress('[aih import]', 2, importStages, 'Running account import');
    const importResult = await runGlobalAccountImport([accountsDir], {
      fs,
      log: (line) => consoleImpl.log(line),
      error: (line) => consoleImpl.error(line),
      parseCodexBulkImportArgs,
      importCodexTokensFromOutput
    });

    const summary = summarizeAccountImportResult(importResult);
    renderStageProgress('[aih import]', 3, importStages, 'Completed');
    consoleImpl.log(`\x1b[32m[Success] Import completed!\x1b[0m providers=${summary.providers.join(', ') || 'none'} imported=${summary.imported}, duplicates=${summary.duplicates}, invalid=${summary.invalid}, failed=${summary.failed}`);
  } catch (error) {
    exitCode = 1;
    consoleImpl.error(`\n\x1b[31m[Error] Failed to import: ${error.message}\x1b[0m`);
  } finally {
    if (fs.existsSync(tmpExtractDir)) fse.removeSync(tmpExtractDir);
  }

  processImpl.exit(exitCode);
  return true;
}

module.exports = {
  runBackupCommand
};
