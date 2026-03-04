'use strict';

function createBackupHelperService(options = {}) {
  const {
    fs,
    path,
    processObj,
    aiHomeDir,
    cliConfigs
  } = options;

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  function defaultExportName() {
    const d = new Date();
    const ts = `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}${pad2(d.getHours())}${pad2(d.getMinutes())}`;
    return `ai-home+${ts}.zip`;
  }

  function ensureAesSuffix(fileName) {
    if (!fileName) return defaultExportName();
    return fileName.endsWith('.zip') ? fileName : `${fileName}.zip`;
  }

  function parseExportArgs(exportArgs) {
    if (!exportArgs || exportArgs.length === 0) {
      return { targetFile: defaultExportName(), selectors: [] };
    }

    const first = exportArgs[0];
    const looksLikeSelector = first.includes(':') || cliConfigs[first];

    if (looksLikeSelector) {
      return { targetFile: defaultExportName(), selectors: exportArgs };
    }

    return { targetFile: first, selectors: exportArgs.slice(1) };
  }

  function parseImportArgs(importArgs) {
    let targetFile = '';
    let overwrite = false;
    const extra = [];
    (importArgs || []).forEach((argRaw) => {
      const arg = String(argRaw || '').trim();
      if (!arg) return;
      if (arg === '-o' || arg === '--overwrite') {
        overwrite = true;
        return;
      }
      if (!targetFile) {
        targetFile = arg;
        return;
      }
      extra.push(arg);
    });
    if (extra.length > 0) {
      throw new Error(`Unexpected argument(s): ${extra.join(' ')}`);
    }
    return { targetFile, overwrite };
  }

  function buildProgressBar(current, total, width = 22) {
    const safeTotal = total > 0 ? total : 1;
    const ratio = Math.max(0, Math.min(1, current / safeTotal));
    const filled = Math.round(width * ratio);
    return `[${'█'.repeat(filled)}${'░'.repeat(Math.max(0, width - filled))}]`;
  }

  function renderStageProgress(prefix, current, total, label) {
    const safeTotal = total > 0 ? total : 1;
    const ratio = Math.max(0, Math.min(1, current / safeTotal));
    const pct = Math.round(ratio * 100);
    const bar = buildProgressBar(current, safeTotal);
    processObj.stdout.write(`\r${prefix} ${bar} ${String(pct).padStart(3, ' ')}% ${label}\x1b[K`);
    if (current >= safeTotal) {
      processObj.stdout.write('\n');
    }
  }

  function expandSelectorsToPaths(selectors) {
    if (!selectors || selectors.length === 0) return ['profiles'];
    const targetSet = new Set();

    selectors.forEach((selRaw) => {
      const sel = String(selRaw || '').trim();
      if (!sel) return;

      if (sel.includes(':')) {
        const [toolRaw, idStrRaw] = sel.split(':');
        const tool = (toolRaw || '').trim();
        const idStr = (idStrRaw || '').trim();
        if (!cliConfigs[tool] || !idStr) return;

        const ids = idStr.split(',').map((x) => x.trim()).filter((x) => /^\d+$/.test(x));
        ids.forEach((id) => {
          const p = `profiles/${tool}/${id}`;
          if (fs.existsSync(path.join(aiHomeDir, p))) targetSet.add(p);
        });
        return;
      }

      if (cliConfigs[sel]) {
        const p = `profiles/${sel}`;
        if (fs.existsSync(path.join(aiHomeDir, p))) targetSet.add(p);
      }
    });

    return Array.from(targetSet);
  }

  return {
    ensureAesSuffix,
    defaultExportName,
    parseExportArgs,
    parseImportArgs,
    renderStageProgress,
    expandSelectorsToPaths
  };
}

module.exports = {
  createBackupHelperService
};
