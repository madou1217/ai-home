'use strict';

const {
  mapProgressRange,
  formatBytes,
  ensureArchiveExtractedByHash
} = require('../backup/archive-import');

function createUnifiedImportService(options = {}) {
  const {
    fs,
    path,
    os,
    fse,
    execSync,
    spawnImpl,
    processImpl,
    cryptoImpl,
    aiHomeDir,
    cliConfigs,
    runGlobalAccountImport,
    importCliproxyapiCodexAuths,
    parseCodexBulkImportArgs,
    importCodexTokensFromOutput,
    ensureArchiveExtractedByHashImpl = ensureArchiveExtractedByHash
  } = options;

  function directoryExists(targetPath) {
    try {
      return fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory();
    } catch (_error) {
      return false;
    }
  }

  function isZipFile(targetPath) {
    try {
      return fs.existsSync(targetPath) && fs.statSync(targetPath).isFile() && /\.zip$/i.test(String(targetPath || ''));
    } catch (_error) {
      return false;
    }
  }

  function listChildDirectories(targetPath) {
    if (!directoryExists(targetPath)) return [];
    try {
      return fs.readdirSync(targetPath, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => String(entry.name || '').trim())
        .filter(Boolean);
    } catch (_error) {
      return [];
    }
  }

  function normalizeFolderHint(rawValue) {
    const normalized = String(rawValue || '').trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+$/, '');
    if (!normalized) throw new Error('Missing value for -f/--folder');
    if (path.isAbsolute(normalized)) throw new Error('Folder hint must be a relative path inside zip');
    if (normalized.split('/').includes('..')) throw new Error('Folder hint cannot contain ".."');
    return normalized;
  }

  function isProviderToken(value) {
    const key = String(value || '').trim().toLowerCase();
    return !!(key && cliConfigs && cliConfigs[key]);
  }

  function parseUnifiedImportArgs(rawArgs, fixedProvider = '') {
    const tokens = Array.isArray(rawArgs) ? rawArgs.slice() : [];
    const sources = [];
    let provider = String(fixedProvider || '').trim().toLowerCase();
    let dryRun = false;
    let folder = '';

    for (let i = 0; i < tokens.length; i += 1) {
      const arg = String(tokens[i] || '').trim();
      if (!arg) continue;
      if (arg === '--dry-run') {
        dryRun = true;
        continue;
      }
      if (arg === '-f' || arg === '--folder' || arg === '--from') {
        folder = normalizeFolderHint(tokens[i + 1]);
        i += 1;
        continue;
      }
      if (arg.startsWith('--folder=')) {
        folder = normalizeFolderHint(arg.slice('--folder='.length));
        continue;
      }
      if (arg.startsWith('--from=')) {
        folder = normalizeFolderHint(arg.slice('--from='.length));
        continue;
      }
      if (!provider && isProviderToken(arg) && i + 1 < tokens.length) {
        provider = arg.toLowerCase();
        continue;
      }
      if (arg.startsWith('-')) {
        throw new Error(`Unknown option: ${arg}`);
      }
      sources.push(arg);
    }

    if (sources.length === 0) {
      sources.push('accounts');
    }

    return {
      provider,
      dryRun,
      folder,
      sources
    };
  }

  function resolveImportSourceRoot({ extractDir, provider, folderHint }) {
    const safeProvider = String(provider || '').trim().toLowerCase();
    const providerMode = safeProvider && isProviderToken(safeProvider);
    const hint = String(folderHint || '').trim();
    const baseDir = hint ? path.join(extractDir, hint) : extractDir;

    if (!directoryExists(baseDir)) {
      throw new Error(`Import folder not found: ${hint || baseDir}`);
    }

    if (providerMode) {
      const candidateProviderDirs = [
        path.join(baseDir, 'accounts', safeProvider),
        path.join(baseDir, safeProvider),
        baseDir
      ];
      const providerDir = candidateProviderDirs.find((dir) => directoryExists(dir));
      if (!providerDir) {
        throw new Error(`Provider folder not found: ${safeProvider}`);
      }

      if (path.basename(providerDir) === safeProvider) {
        return { sourceRoot: path.dirname(providerDir) };
      }

      const mappedRoot = path.join(extractDir, '__aih_import_root');
      const mappedProviderDir = path.join(mappedRoot, safeProvider);
      if (directoryExists(mappedRoot)) fse.removeSync(mappedRoot);
      fse.ensureDirSync(mappedRoot);
      fse.copySync(providerDir, mappedProviderDir, { overwrite: true });
      return { sourceRoot: mappedRoot };
    }

    const candidateRoots = [
      path.join(baseDir, 'accounts'),
      baseDir
    ];
    for (const root of candidateRoots) {
      if (!directoryExists(root)) continue;
      const subdirs = listChildDirectories(root);
      if (subdirs.length === 0) continue;
      if (subdirs.some((name) => isProviderToken(name))) {
        return { sourceRoot: root };
      }
      if (path.basename(root) && isProviderToken(path.basename(root))) {
        const mappedRoot = path.join(extractDir, '__aih_import_root');
        const mappedProviderDir = path.join(mappedRoot, path.basename(root));
        if (directoryExists(mappedRoot)) fse.removeSync(mappedRoot);
        fse.ensureDirSync(mappedRoot);
        fse.copySync(root, mappedProviderDir, { overwrite: true });
        return { sourceRoot: mappedRoot };
      }
    }

    throw new Error('Import source does not contain importable provider directories.');
  }

  function classifySource(rawSource) {
    const source = String(rawSource || '').trim();
    if (!source) throw new Error('Empty import source is not allowed.');
    if (source.toLowerCase() === 'cliproxyapi') {
      return {
        kind: 'cliproxyapi',
        source,
        display: 'cliproxyapi'
      };
    }
    const resolvedPath = path.resolve(source);
    if (isZipFile(resolvedPath)) {
      return { kind: 'zip', source: resolvedPath, display: resolvedPath };
    }
    if (directoryExists(resolvedPath)) {
      return { kind: 'directory', source: resolvedPath, display: resolvedPath };
    }
    throw new Error(`Import source not found: ${source}`);
  }

  function summarizeGlobalImportResult(result) {
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

  async function importDirectorySource(sourcePath, parsed, onProgress) {
    const resolved = resolveImportSourceRoot({
      extractDir: sourcePath,
      provider: parsed.provider,
      folderHint: ''
    });
    const result = await runGlobalAccountImport([resolved.sourceRoot, ...(parsed.dryRun ? ['--dry-run'] : [])], {
      fs,
      log: () => {},
      error: () => {},
      quiet: true,
      providerLog: false,
      parseCodexBulkImportArgs,
      importCodexTokensFromOutput,
      onProviderProgress: (processedProviders, totalProviders, providerName) => {
        const ratio = totalProviders > 0 ? processedProviders / totalProviders : 1;
        if (typeof onProgress === 'function') {
          onProgress(ratio, `providers ${processedProviders}/${totalProviders} last=${providerName}`);
        }
      }
    });
    return {
      type: 'directory',
      source: sourcePath,
      ...summarizeGlobalImportResult(result),
      rawResult: result
    };
  }

  async function importZipSource(zipPath, parsed, onProgress) {
    const prepared = await ensureArchiveExtractedByHashImpl({
      fs,
      path,
      os,
      fse,
      execSync,
      processImpl,
      cryptoImpl,
      zipPath,
      aiHomeDir,
      spawnImpl,
      onHashProgress: (processed, total) => {
        const ratio = total > 0 ? processed / total : 1;
        if (typeof onProgress === 'function') {
          onProgress((mapProgressRange(0, 34, ratio) / 100), `hashing ${formatBytes(processed)} / ${formatBytes(total)}`);
        }
      },
      onExtractProgress: (extractPct) => {
        const ratio = Math.max(0, Math.min(1, (Number(extractPct) || 0) / 100));
        if (typeof onProgress === 'function') {
          onProgress((mapProgressRange(35, 86, ratio) / 100), `extracting ${Math.round(ratio * 100)}%`);
        }
      }
    });
    const resolved = resolveImportSourceRoot({
      extractDir: prepared.extractDir,
      provider: parsed.provider,
      folderHint: parsed.folder
    });
    const result = await runGlobalAccountImport([resolved.sourceRoot, ...(parsed.dryRun ? ['--dry-run'] : [])], {
      fs,
      log: () => {},
      error: () => {},
      quiet: true,
      providerLog: false,
      parseCodexBulkImportArgs,
      importCodexTokensFromOutput,
      onProviderProgress: (processedProviders, totalProviders, providerName) => {
        const ratio = totalProviders > 0 ? processedProviders / totalProviders : 1;
        if (typeof onProgress === 'function') {
          onProgress((mapProgressRange(87, 100, ratio) / 100), `importing ${providerName} ${processedProviders}/${totalProviders}`);
        }
      }
    });
    return {
      type: 'zip',
      source: zipPath,
      cacheHit: !!prepared.cacheHit,
      ...summarizeGlobalImportResult(result),
      rawResult: result
    };
  }

  async function importCliproxyapiSource(parsed, onProgress) {
    if (parsed.provider && parsed.provider !== 'codex') {
      throw new Error(`cliproxyapi source currently supports codex only, got: ${parsed.provider}`);
    }
    const result = await importCliproxyapiCodexAuths({
      dryRun: parsed.dryRun,
      onProgress: (progress) => {
        const total = Number(progress && progress.total) || 1;
        const scanned = Number(progress && progress.scanned) || 0;
        const ratio = total > 0 ? scanned / total : 1;
        const email = String(progress && progress.email || progress && progress.fileName || '').trim();
        if (typeof onProgress === 'function') {
          onProgress(ratio, `${String(progress && progress.status || 'scan')} ${scanned}/${total}${email ? ` ${email}` : ''}`);
        }
      }
    });
    return {
      type: 'cliproxyapi',
      source: 'cliproxyapi',
      providers: ['codex'],
      imported: Number(result.imported || 0),
      duplicates: Number(result.duplicates || 0),
      invalid: Number(result.invalid || 0),
      failed: Number(result.failed || 0),
      rawResult: result
    };
  }

  async function runUnifiedImport(rawArgs, runOptions = {}) {
    const log = typeof runOptions.log === 'function' ? runOptions.log : console.log;
    const error = typeof runOptions.error === 'function' ? runOptions.error : console.error;
    const renderStageProgress = typeof runOptions.renderStageProgress === 'function' ? runOptions.renderStageProgress : null;
    const parsed = parseUnifiedImportArgs(rawArgs, runOptions.provider);
    const sourceEntries = parsed.sources.map(classifySource);
    const providersTouched = new Set();
    const sourceResults = [];
    const failedSources = [];

    const renderSourceProgress = (sourceIndex, ratio, label) => {
      if (!renderStageProgress) return;
      const current = sourceIndex + Math.max(0, Math.min(1, Number(ratio) || 0));
      renderStageProgress('[aih import]', current, sourceEntries.length, `source ${sourceIndex + 1}/${sourceEntries.length} ${label}`);
    };

    for (let i = 0; i < sourceEntries.length; i += 1) {
      const sourceEntry = sourceEntries[i];
      renderSourceProgress(i, 0, `${sourceEntry.kind} ${sourceEntry.display}`);
      try {
        let result;
        if (sourceEntry.kind === 'directory') {
          result = await importDirectorySource(sourceEntry.source, parsed, (ratio, label) => {
            renderSourceProgress(i, ratio, `${sourceEntry.kind} ${label}`);
          });
        } else if (sourceEntry.kind === 'zip') {
          result = await importZipSource(sourceEntry.source, parsed, (ratio, label) => {
            renderSourceProgress(i, ratio, `${sourceEntry.kind} ${label}`);
          });
        } else {
          result = await importCliproxyapiSource(parsed, (ratio, label) => {
            renderSourceProgress(i, ratio, `${sourceEntry.kind} ${label}`);
          });
        }
        sourceResults.push(result);
        (result.providers || []).forEach((provider) => providersTouched.add(provider));
        renderSourceProgress(i, 1, `${sourceEntry.kind} done imported=${result.imported} dup=${result.duplicates} invalid=${result.invalid} failed=${result.failed}`);
      } catch (sourceError) {
        failedSources.push({ source: sourceEntry.display, error: sourceError.message });
        error(`\x1b[31m[aih] import source failed (${sourceEntry.display}): ${sourceError.message}\x1b[0m`);
        renderSourceProgress(i, 1, `${sourceEntry.kind} failed`);
      }
    }

    log('\x1b[36m[aih]\x1b[0m import summary');
    sourceResults.forEach((item) => {
      log(`  - ${item.type}: source=${item.source} imported=${item.imported} duplicates=${item.duplicates} invalid=${item.invalid} failed=${item.failed}`);
    });

    return {
      provider: parsed.provider || '',
      dryRun: parsed.dryRun,
      folder: parsed.folder,
      sourceCount: sourceEntries.length,
      providers: Array.from(providersTouched).sort(),
      sourceResults,
      failedSources
    };
  }

  return {
    parseUnifiedImportArgs,
    runUnifiedImport
  };
}

module.exports = {
  createUnifiedImportService
};
