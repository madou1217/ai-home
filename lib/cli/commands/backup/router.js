'use strict';

const nodeFs = require('node:fs');
const nodeCrypto = require('node:crypto');

function isNumericAccountId(name) {
  return /^\d+$/.test(String(name || ''));
}

const KNOWN_IMPORT_PROVIDERS = new Set(['codex', 'gemini', 'claude']);

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

function directoryExists(fs, targetPath) {
  try {
    return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
  } catch (_error) {
    return false;
  }
}

function listChildDirectories(fs, targetPath) {
  if (!directoryExists(fs, targetPath)) return [];
  try {
    return fs.readdirSync(targetPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => String(entry.name || '').trim())
      .filter(Boolean);
  } catch (_error) {
    return [];
  }
}

function resolveBundled7zipPath({ fs = nodeFs, sevenZipBin } = {}) {
  try {
    const bundled = sevenZipBin || require('7zip-bin');
    const candidates = [bundled && bundled.path7za, bundled && bundled.path7x]
      .map((entry) => String(entry || '').trim())
      .filter(Boolean);
    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate)) return candidate;
      } catch (_error) {}
    }
  } catch (_error) {}
  return '';
}

function tryExtractZipWith7z({ execSync, zipPath, extractDir, processImpl, bundled7zPath }) {
  const outDir = String(extractDir || '').replace(/"/g, '\\"');
  const inZip = String(zipPath || '').replace(/"/g, '\\"');
  const tryCommands = [];

  if (processImpl.platform === 'win32') {
    tryCommands.push(`7z x -y -bb0 -bd -mmt=on -o"${outDir}" "${inZip}"`);
    tryCommands.push(`7za x -y -bb0 -bd -mmt=on -o"${outDir}" "${inZip}"`);
    tryCommands.push(`"C:\\Program Files\\7-Zip\\7z.exe" x -y -bb0 -bd -mmt=on -o"${outDir}" "${inZip}"`);
  } else {
    tryCommands.push(`7z x -y -bb0 -bd -mmt=on -o"${outDir}" "${inZip}"`);
    tryCommands.push(`7za x -y -bb0 -bd -mmt=on -o"${outDir}" "${inZip}"`);
  }

  const bundled = String(bundled7zPath || '').trim();
  if (bundled) {
    const bundledCmd = String(bundled).replace(/"/g, '\\"');
    tryCommands.push(`"${bundledCmd}" x -y -bb0 -bd -mmt=on -o"${outDir}" "${inZip}"`);
  }

  for (const cmd of tryCommands) {
    try {
      execSync(cmd, { stdio: 'ignore' });
      return true;
    } catch (_error) {}
  }
  return false;
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

function extractZipArchive({ execSync, processImpl, zipPath, extractDir, fs }) {
  const bundled7zPath = resolveBundled7zipPath({ fs });
  if (tryExtractZipWith7z({ execSync, zipPath, extractDir, processImpl, bundled7zPath })) {
    return;
  }
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

function resolveImportSourceRoot({
  fs,
  path,
  fse,
  extractDir,
  provider,
  folderHint
}) {
  const safeProvider = String(provider || '').trim().toLowerCase();
  const providerMode = safeProvider && KNOWN_IMPORT_PROVIDERS.has(safeProvider);
  const hint = String(folderHint || '').trim();
  const baseDir = hint ? path.join(extractDir, hint) : extractDir;

  if (!directoryExists(fs, baseDir)) {
    throw new Error(`Import folder not found in zip: ${hint}`);
  }

  if (providerMode) {
    const candidateProviderDirs = [
      path.join(baseDir, 'accounts', safeProvider),
      path.join(baseDir, safeProvider),
      baseDir
    ];
    const providerDir = candidateProviderDirs.find((dir) => directoryExists(fs, dir));
    if (!providerDir) {
      throw new Error(`Provider folder not found in zip: ${safeProvider}`);
    }

    if (path.basename(providerDir) === safeProvider) {
      return { sourceRoot: path.dirname(providerDir) };
    }

    const mappedRoot = path.join(extractDir, '__aih_import_root');
    const mappedProviderDir = path.join(mappedRoot, safeProvider);
    if (directoryExists(fs, mappedRoot)) fse.removeSync(mappedRoot);
    fse.ensureDirSync(mappedRoot);
    fse.copySync(providerDir, mappedProviderDir, { overwrite: true });
    return { sourceRoot: mappedRoot };
  }

  const candidateRoots = [
    path.join(baseDir, 'accounts'),
    baseDir
  ];
  for (const root of candidateRoots) {
    if (!directoryExists(fs, root)) continue;
    const subdirs = listChildDirectories(fs, root);
    if (subdirs.length === 0) continue;
    return { sourceRoot: root };
  }

  throw new Error('Backup zip does not contain importable provider directories.');
}

function computeFileSha256(fs, cryptoImpl, filePath) {
  const hash = (cryptoImpl || nodeCrypto).createHash('sha256');
  if (typeof fs.createReadStream !== 'function') {
    hash.update(fs.readFileSync(filePath));
    return Promise.resolve(hash.digest('hex'));
  }
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function isArchiveExtractCacheReady(fs, path, cacheDir) {
  const extractDir = path.join(cacheDir, 'extract');
  const markerPath = path.join(cacheDir, '.ready.json');
  return directoryExists(fs, extractDir) && fs.existsSync(markerPath);
}

async function ensureArchiveExtractedByHash({
  fs,
  path,
  os,
  fse,
  execSync,
  processImpl,
  cryptoImpl,
  zipPath,
  aiHomeDir
}) {
  const hash = await computeFileSha256(fs, cryptoImpl, zipPath);
  const cacheRoot = aiHomeDir
    ? path.join(aiHomeDir, '.cache', 'import-zip')
    : path.join(os.tmpdir(), 'aih_import_zip_cache');
  fse.ensureDirSync(cacheRoot);

  const cacheDir = path.join(cacheRoot, hash);
  const extractDir = path.join(cacheDir, 'extract');
  const markerPath = path.join(cacheDir, '.ready.json');
  if (isArchiveExtractCacheReady(fs, path, cacheDir)) {
    return {
      hash,
      extractDir,
      cacheHit: true
    };
  }

  const stagingDir = fs.mkdtempSync(path.join(cacheRoot, `${hash}.tmp-`));
  const stagingExtractDir = path.join(stagingDir, 'extract');
  fse.ensureDirSync(stagingExtractDir);

  try {
    extractZipArchive({
      execSync,
      processImpl,
      zipPath,
      extractDir: stagingExtractDir,
      fs
    });

    if (isArchiveExtractCacheReady(fs, path, cacheDir)) {
      fse.removeSync(stagingDir);
      return {
        hash,
        extractDir,
        cacheHit: true
      };
    }

    if (directoryExists(fs, cacheDir)) {
      fse.removeSync(cacheDir);
    }
    fse.moveSync(stagingDir, cacheDir, { overwrite: true });
    fs.writeFileSync(markerPath, `${JSON.stringify({
      hash,
      sourceName: path.basename(zipPath),
      createdAt: new Date().toISOString()
    }, null, 2)}\n`);

    return {
      hash,
      extractDir,
      cacheHit: false
    };
  } catch (error) {
    if (directoryExists(fs, stagingDir)) {
      fse.removeSync(stagingDir);
    }
    throw error;
  }
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
    importCodexTokensFromOutput,
    aiHomeDir,
    crypto: cryptoImpl
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
  let provider = '';
  let folderHint = '';
  try {
    const parsed = parseImportArgs(args.slice(1));
    targetFile = parsed.targetFile;
    provider = String(parsed.provider || '').trim().toLowerCase();
    folderHint = String(parsed.folder || '').trim();
    if (parsed.overwrite) {
      consoleImpl.log('\x1b[90m[aih]\x1b[0m -o/--overwrite ignored for zip import (same behavior as account import).');
    }
  } catch (error) {
    consoleImpl.error('\x1b[31m[aih] '
      + `${error.message}. Usage: aih import [provider] <file.zip> [-f <folder>]\x1b[0m`);
    processImpl.exit(1);
    return true;
  }

  if (!targetFile || !fs.existsSync(targetFile)) {
    consoleImpl.error('\x1b[31m[aih] File not found. Usage: aih import [provider] <file.zip> [-f <folder>]\x1b[0m');
    processImpl.exit(1);
    return true;
  }

  const targetPath = path.resolve(targetFile);
  let exitCode = 0;

  try {
    const importStages = 4;
    renderStageProgress('[aih import]', 1, importStages, 'Hashing archive');
    const prepared = await ensureArchiveExtractedByHash({
      fs,
      path,
      os,
      fse,
      execSync,
      processImpl,
      zipPath: targetPath,
      cryptoImpl,
      aiHomeDir
    });
    const preparedLabel = prepared.cacheHit
      ? `Using cached extraction (${prepared.hash.slice(0, 12)})`
      : `Extracting zip archive (${prepared.hash.slice(0, 12)})`;
    renderStageProgress('[aih import]', 2, importStages, preparedLabel);

    const resolved = resolveImportSourceRoot({
      fs,
      path,
      fse,
      extractDir: prepared.extractDir,
      provider,
      folderHint
    });

    renderStageProgress('[aih import]', 3, importStages, 'Running account import');
    const importResult = await runGlobalAccountImport([resolved.sourceRoot], {
      fs,
      log: (line) => consoleImpl.log(line),
      error: (line) => consoleImpl.error(line),
      parseCodexBulkImportArgs,
      importCodexTokensFromOutput
    });

    const summary = summarizeAccountImportResult(importResult);
    renderStageProgress('[aih import]', 4, importStages, 'Completed');
    consoleImpl.log(`\x1b[32m[Success] Import completed!\x1b[0m providers=${summary.providers.join(', ') || 'none'} imported=${summary.imported}, duplicates=${summary.duplicates}, invalid=${summary.invalid}, failed=${summary.failed}`);
  } catch (error) {
    exitCode = 1;
    consoleImpl.error(`\n\x1b[31m[Error] Failed to import: ${error.message}\x1b[0m`);
  }

  processImpl.exit(exitCode);
  return true;
}

module.exports = {
  runBackupCommand,
  __private: {
    resolveImportSourceRoot,
    resolveBundled7zipPath,
    tryExtractZipWith7z,
    directoryExists,
    listChildDirectories,
    computeFileSha256,
    ensureArchiveExtractedByHash,
    isArchiveExtractCacheReady
  }
};
