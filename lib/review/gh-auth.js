'use strict';

function buildGhEnv(hostHomeDir, fs, path, baseEnv) {
  const env = { ...(baseEnv || process.env) };
  if (!hostHomeDir) return env;
  env.HOME = hostHomeDir;
  if (!env.GH_CONFIG_DIR) {
    const ghConfigDir = path.join(hostHomeDir, '.config', 'gh');
    if (fs.existsSync(ghConfigDir)) env.GH_CONFIG_DIR = ghConfigDir;
  }
  return env;
}

function ensureGhAuthForReview(options = {}) {
  const {
    spawnSync,
    cwd,
    env,
    hostHomeDir,
    runtimeHome
  } = options;
  const run = spawnSync('gh', ['auth', 'status'], {
    cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
  if (run.status === 0) return { ok: true };
  const detail = String((run.stderr || run.stdout || '')).trim();
  return {
    ok: false,
    message: [
      '[aih review] gh auth is not available for auto-merge.',
      `[aih review] runtime HOME=${runtimeHome || '-'}`,
      `[aih review] host_home=${hostHomeDir || '-'}`,
      '[aih review] Fix: login once on host env (`gh auth login`) or set `AIH_HOST_HOME=/Users/<you>` before running review.',
      detail ? `[aih review] gh: ${detail.split(/\r?\n/).slice(0, 3).join(' | ')}` : ''
    ].filter(Boolean)
  };
}

module.exports = {
  buildGhEnv,
  ensureGhAuthForReview
};
