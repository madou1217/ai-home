const { spawnSync } = require('child_process');
const path = require('path');

const WINDOWS_EXEC_EXT_PRIORITY = ['.cmd', '.bat', '.exe', '.com'];

function resolveCommandPath(cmdName, options = {}) {
  if (!cmdName) return '';

  const spawnSyncImpl = options.spawnSyncImpl || spawnSync;
  const platform = options.platform || process.platform;

  if (platform === 'win32') {
    const probe = spawnSyncImpl('where', [cmdName], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
    if (!probe || probe.status !== 0) return '';
    const lines = String(probe.stdout || '')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    if (lines.length === 0) return '';

    const byExt = new Map();
    lines.forEach((candidate) => {
      const ext = path.extname(candidate).toLowerCase();
      if (!ext || byExt.has(ext)) return;
      byExt.set(ext, candidate);
    });

    for (const ext of WINDOWS_EXEC_EXT_PRIORITY) {
      const hit = byExt.get(ext);
      if (hit) return hit;
    }

    // Some environments may output extensionless shims first.
    // Returning the command name lets cmd.exe resolve PATHEXT safely.
    return String(cmdName).trim();
  }

  const safe = String(cmdName).replace(/(["\\$`])/g, '\\$1');
  const probe = spawnSyncImpl('sh', ['-lc', `command -v "${safe}"`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (!probe || probe.status !== 0) return '';
  return String(probe.stdout || '').trim();
}

module.exports = {
  resolveCommandPath
};
