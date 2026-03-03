'use strict';

const path = require('path');
const crypto = require('crypto');

function createHostConfigSyncer(deps) {
  const {
    fs,
    fse,
    ensureDir,
    getProfileDir,
    hostHomeDir,
    cliConfigs
  } = deps;

  function pruneBackupFiles(filePaths, keep = 3) {
    const sorted = (filePaths || [])
      .filter((p) => fs.existsSync(p))
      .map((p) => {
        let mtimeMs = 0;
        try {
          mtimeMs = fs.statSync(p).mtimeMs || 0;
        } catch (e) {}
        return { path: p, mtimeMs };
      })
      .sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (sorted.length <= keep) return 0;
    const toDelete = sorted.slice(keep);
    let deleted = 0;
    toDelete.forEach((entry) => {
      try {
        fs.unlinkSync(entry.path);
        deleted += 1;
      } catch (e) {}
    });
    return deleted;
  }

  function backupHostGlobalConfig(cliName, hostGlobalDir, maxBackups = 3) {
    const backupFileByCli = {
      codex: 'auth.json',
      claude: '.credentials.json',
      gemini: 'google_accounts.json'
    };
    const baseName = backupFileByCli[cliName];
    if (!baseName) return { created: false };

    const target = path.join(hostGlobalDir, baseName);
    if (!fs.existsSync(target)) return { created: false };

    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
    const backupPath = path.join(hostGlobalDir, `${baseName}.aih.bak.${stamp}`);
    fse.copySync(target, backupPath, { overwrite: true, errorOnExist: false });

    let removed = 0;
    try {
      const names = fs.readdirSync(hostGlobalDir);
      const backupCandidates = names
        .filter((n) => n.startsWith(`${baseName}.aih.bak.`) || n.startsWith(`${baseName}.bak.`))
        .map((n) => path.join(hostGlobalDir, n));
      removed = pruneBackupFiles(backupCandidates, maxBackups);
    } catch (e) {}

    return { created: true, backupPath, removed };
  }

  function syncDirEntriesSafe(srcDir, dstDir) {
    ensureDir(dstDir);
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    entries.forEach((entry) => {
      if (entry.isSymbolicLink()) return;
      const srcPath = path.join(srcDir, entry.name);
      const dstPath = path.join(dstDir, entry.name);
      if (fs.existsSync(dstPath)) {
        try {
          const srcIsDir = fs.statSync(srcPath).isDirectory();
          const dstIsDir = fs.statSync(dstPath).isDirectory();
          if (srcIsDir !== dstIsDir) {
            fse.removeSync(dstPath);
          }
        } catch (e) {}
      }
      fse.copySync(srcPath, dstPath, { overwrite: true, errorOnExist: false });
    });
  }

  function hashFileContent(filePath) {
    const h = crypto.createHash('sha1');
    const buf = fs.readFileSync(filePath);
    h.update(buf);
    return h.digest('hex');
  }

  function collectDirFingerprintEntries(rootDir, rel = '') {
    const dirPath = rel ? path.join(rootDir, rel) : rootDir;
    let entries = [];
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch (e) {
      return [];
    }
    const out = [];
    entries.sort((a, b) => a.name.localeCompare(b.name));
    entries.forEach((entry) => {
      if (entry.isSymbolicLink()) return;
      const childRel = rel ? path.join(rel, entry.name) : entry.name;
      const childPath = path.join(rootDir, childRel);
      if (entry.isDirectory()) {
        out.push(`d:${childRel}`);
        out.push(...collectDirFingerprintEntries(rootDir, childRel));
        return;
      }
      if (!entry.isFile()) return;
      try {
        const st = fs.statSync(childPath);
        const digest = hashFileContent(childPath);
        out.push(`f:${childRel}:${st.size}:${digest}`);
      } catch (e) {}
    });
    return out;
  }

  function isDirContentEquivalent(aDir, bDir) {
    if (!fs.existsSync(aDir) || !fs.existsSync(bDir)) return false;
    try {
      if (!fs.statSync(aDir).isDirectory()) return false;
      if (!fs.statSync(bDir).isDirectory()) return false;
    } catch (e) {
      return false;
    }
    const a = collectDirFingerprintEntries(aDir).join('\n');
    const b = collectDirFingerprintEntries(bDir).join('\n');
    return a === b;
  }

  return function syncGlobalConfigToHost(cliName, id) {
    const cfg = cliConfigs[cliName];
    if (!cfg || !cfg.globalDir) {
      return { ok: false, reason: 'unsupported-cli' };
    }

    const accountGlobalDir = path.join(getProfileDir(cliName, id), cfg.globalDir);
    if (!fs.existsSync(accountGlobalDir)) {
      return { ok: false, reason: 'missing-account-global-dir', accountGlobalDir };
    }

    const hostGlobalDir = path.join(hostHomeDir, cfg.globalDir);
    ensureDir(hostGlobalDir);
    if (isDirContentEquivalent(accountGlobalDir, hostGlobalDir)) {
      return { ok: true, accountGlobalDir, hostGlobalDir, backup: { created: false }, skippedSync: true, reason: 'already_in_sync' };
    }
    const backup = backupHostGlobalConfig(cliName, hostGlobalDir, 3);
    syncDirEntriesSafe(accountGlobalDir, hostGlobalDir);
    return { ok: true, accountGlobalDir, hostGlobalDir, backup };
  };
}

module.exports = {
  createHostConfigSyncer
};
