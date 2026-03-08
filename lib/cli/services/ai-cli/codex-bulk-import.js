'use strict';

function createCodexBulkImportService(options = {}) {
  const {
    path,
    fs,
    crypto,
    profilesDir,
    getDefaultParallelism,
    getToolAccountIds,
    ensureDir,
    getProfileDir,
    getToolConfigDir
  } = options;

  function parseCodexBulkImportArgs(rawArgs) {
    let sourceDir = 'accounts';
    let parallel = getDefaultParallelism();
    let limit = 0;
    let dryRun = false;

    const tokens = Array.isArray(rawArgs) ? rawArgs.slice() : [];
    for (let i = 0; i < tokens.length; i += 1) {
      const arg = String(tokens[i] || '').trim();
      if (!arg) continue;
      if (arg === '--dry-run') {
        dryRun = true;
        continue;
      }
      if (arg === '--parallel' || arg === '-p') {
        const val = String(tokens[i + 1] || '').trim();
        if (!/^\d+$/.test(val)) throw new Error('Invalid --parallel value');
        parallel = Math.max(1, Math.min(32, Number(val)));
        i += 1;
        continue;
      }
      if (arg === '--limit') {
        const val = String(tokens[i + 1] || '').trim();
        if (!/^\d+$/.test(val)) throw new Error('Invalid --limit value');
        limit = Number(val);
        i += 1;
        continue;
      }
      if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
      sourceDir = arg;
    }

    return { sourceDir, parallel, limit, dryRun };
  }

  function parseCodexRefreshTokenLine(line) {
    const payload = line && typeof line === 'object' ? line : null;
    if (!payload) return null;
    const refreshToken = payload.refresh_token || (payload.tokens && payload.tokens.refresh_token) || '';
    if (!refreshToken.startsWith('rt_')) return null;
    const idToken = String(payload.id_token || (payload.tokens && payload.tokens.id_token) || '').trim();
    const accessToken = String(payload.access_token || (payload.tokens && payload.tokens.access_token) || '').trim();
    const email = String(payload.email || '').trim();
    const explicitAccountId = String(payload.account_id || (payload.tokens && payload.tokens.account_id) || '').trim();
    const accountSlug = explicitAccountId || (email ? email.split('@')[0] : '');
    return { email, accountSlug, refreshToken, idToken, accessToken };
  }

  function buildCodexAuthFromRefreshToken(entry) {
    const accountId = entry.accountSlug || `imported-${crypto.randomBytes(6).toString('hex')}`;
    return {
      auth_mode: 'chatgpt',
      OPENAI_API_KEY: null,
      tokens: {
        id_token: String(entry.idToken || ''),
        access_token: String(entry.accessToken || ''),
        refresh_token: entry.refreshToken,
        account_id: accountId
      },
      last_refresh: new Date().toISOString()
    };
  }

  function getNextNumericId(cliName) {
    const ids = getToolAccountIds(cliName).map((x) => Number(x)).filter((n) => Number.isFinite(n));
    if (ids.length === 0) return 1;
    return Math.max(...ids) + 1;
  }

  function claimNextNumericId(cliName, importSession = null) {
    let candidate = importSession && Number.isFinite(importSession.nextNumericId)
      ? Math.max(1, Math.floor(importSession.nextNumericId))
      : getNextNumericId(cliName);
    const providerRoot = path.join(profilesDir, cliName);
    ensureDir(providerRoot);
    while (true) {
      const id = String(candidate);
      const profileDir = getProfileDir(cliName, id);
      try {
        fs.mkdirSync(profileDir);
        if (importSession) {
          importSession.nextNumericId = candidate + 1;
        }
        return id;
      } catch (error) {
        if (error && error.code === 'EEXIST') {
          candidate += 1;
          if (importSession) {
            importSession.nextNumericId = candidate;
          }
          continue;
        }
        throw error;
      }
    }
  }

  function collectJsonFilesRecursively(rootDir) {
    const out = [];
    const stack = [rootDir];
    while (stack.length > 0) {
      const current = stack.pop();
      let entries = [];
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch (_error) {
        continue;
      }
      for (const entry of entries) {
        const fullPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(fullPath);
          continue;
        }
        if (entry.isFile() && /\.json$/i.test(entry.name)) {
          out.push(fullPath);
        }
      }
    }
    return out.sort();
  }

  function collectExistingCodexRefreshTokens() {
    const out = new Set();
    const codexRoot = path.join(profilesDir, 'codex');
    if (!fs.existsSync(codexRoot)) return out;
    let entries = [];
    try {
      entries = fs.readdirSync(codexRoot, { withFileTypes: true });
    } catch (_error) {
      return out;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || !/^\d+$/.test(entry.name)) continue;
      const authPath = path.join(codexRoot, entry.name, '.codex', 'auth.json');
      if (!fs.existsSync(authPath)) continue;
      try {
        const parsed = JSON.parse(fs.readFileSync(authPath, 'utf8'));
        const token = String((parsed && parsed.tokens && parsed.tokens.refresh_token) || '').trim();
        if (token.startsWith('rt_')) out.add(token);
      } catch (_error) {}
    }
    return out;
  }

  async function importCodexTokensFromOutput(optionsArg) {
    const onProgress = typeof optionsArg.onProgress === 'function' ? optionsArg.onProgress : null;
    const sourceDir = path.resolve(optionsArg.sourceDir);
    const importSession = optionsArg && typeof optionsArg.importSession === 'object' && optionsArg.importSession
      ? optionsArg.importSession
      : null;
    if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
      throw new Error(`Source directory not found: ${sourceDir}`);
    }

    const tokenFiles = collectJsonFilesRecursively(sourceDir);
    if (tokenFiles.length === 0) {
      return {
        sourceDir, scannedFiles: 0, parsedLines: 0, imported: 0, duplicates: 0, invalid: 0, dryRun: !!optionsArg.dryRun
      };
    }

    let parsedLines = 0;
    let imported = 0;
    let duplicates = 0;
    let invalid = 0;
    let failed = 0;
    let firstError = '';
    const seenRefreshTokens = importSession && importSession.seenRefreshTokens instanceof Set
      ? importSession.seenRefreshTokens
      : collectExistingCodexRefreshTokens();
    if (importSession && !(importSession.seenRefreshTokens instanceof Set)) {
      importSession.seenRefreshTokens = seenRefreshTokens;
    }
    const maxConcurrency = Math.max(1, Number(optionsArg.parallel) || 8);
    const limit = Math.max(0, Number(optionsArg.limit) || 0);
    const queue = [];

    const emitProgress = (extra = {}) => {
      if (!onProgress) return;
      onProgress({
        sourceDir,
        totalFiles: tokenFiles.length,
        parsedLines,
        imported,
        duplicates,
        invalid,
        failed,
        dryRun: !!optionsArg.dryRun,
        ...extra
      });
    };

    emitProgress({ scannedFiles: 0, status: 'start' });

    for (let fileIndex = 0; fileIndex < tokenFiles.length; fileIndex += 1) {
      const tokenFile = tokenFiles[fileIndex];
      const scannedFiles = fileIndex + 1;
      if (limit > 0 && parsedLines >= limit) break;
      let parsedJson = null;
      try {
        const content = fs.readFileSync(tokenFile, 'utf8');
        parsedJson = JSON.parse(content);
      } catch (_error) {
        invalid += 1;
        emitProgress({ scannedFiles, status: 'invalid', filePath: tokenFile });
        continue;
      }
      const parsed = parseCodexRefreshTokenLine(parsedJson);
      if (!parsed) {
        invalid += 1;
        emitProgress({ scannedFiles, status: 'invalid', filePath: tokenFile });
        continue;
      }
      parsedLines += 1;
      if (seenRefreshTokens.has(parsed.refreshToken)) {
        duplicates += 1;
        emitProgress({ scannedFiles, status: 'duplicate', filePath: tokenFile, email: parsed.email || '' });
        continue;
      }
      seenRefreshTokens.add(parsed.refreshToken);
      queue.push(parsed);
      emitProgress({ scannedFiles, status: 'queued', filePath: tokenFile, email: parsed.email || '' });
    }

    if (optionsArg.dryRun) {
      imported = queue.length;
      emitProgress({ scannedFiles: tokenFiles.length, status: 'done' });
    } else if (queue.length > 0) {
      let cursor = 0;
      const worker = async () => {
        while (true) {
          const idx = cursor;
          cursor += 1;
          if (idx >= queue.length) return;
          const entry = queue[idx];
          try {
            const id = claimNextNumericId('codex', importSession);
            const codexDir = getToolConfigDir('codex', id);
            ensureDir(codexDir);
            const authPayload = buildCodexAuthFromRefreshToken(entry);
            fs.writeFileSync(path.join(codexDir, 'auth.json'), JSON.stringify(authPayload, null, 2));
            imported += 1;
            emitProgress({ scannedFiles: tokenFiles.length, status: 'imported', id, email: entry.email || '', queuedIndex: idx + 1, queueTotal: queue.length });
          } catch (error) {
            failed += 1;
            if (!firstError) firstError = error.message;
            emitProgress({ scannedFiles: tokenFiles.length, status: 'failed', error: error.message, queuedIndex: idx + 1, queueTotal: queue.length });
          }
        }
      };
      const workerCount = Math.min(maxConcurrency, queue.length);
      const workers = [];
      for (let i = 0; i < workerCount; i += 1) {
        workers.push(worker());
      }
      await Promise.all(workers);
      emitProgress({ scannedFiles: tokenFiles.length, status: 'done' });
    } else {
      emitProgress({ scannedFiles: tokenFiles.length, status: 'done' });
    }

    return {
      sourceDir,
      scannedFiles: tokenFiles.length,
      parsedLines,
      imported,
      duplicates,
      invalid,
      failed,
      firstError,
      dryRun: !!optionsArg.dryRun
    };
  }

  return {
    parseCodexBulkImportArgs,
    importCodexTokensFromOutput
  };
}

module.exports = {
  createCodexBulkImportService
};
