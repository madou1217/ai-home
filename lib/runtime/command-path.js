const { spawnSync } = require('child_process');

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
    return lines[0] || '';
  }

  const safe = String(cmdName).replace(/(["\\$`])/g, '\\$1');
  const probe = spawnSyncImpl('sh', ['-lc', `command -v "${safe}"`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  if (!probe || probe.status !== 0) return '';
  return String(probe.stdout || '').trim();
}

module.exports = {
  resolveCommandPath
};
