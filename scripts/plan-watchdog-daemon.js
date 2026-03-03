#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const watchdogScript = path.join(rootDir, 'scripts', 'plan-watchdog.js');
const hostHomeDir = (() => {
  if (process.env.AIH_HOST_HOME && process.env.AIH_HOST_HOME.trim()) {
    return path.resolve(process.env.AIH_HOST_HOME.trim());
  }
  try {
    const info = os.userInfo();
    if (info && info.homedir) return info.homedir;
  } catch (_) {}
  return os.homedir();
})();
const stateDir = path.join(hostHomeDir, '.ai_home');
const lockPath = path.join(stateDir, 'watchdog_daemon.lock');

function parseArgs(argv) {
  const out = {
    intervalSec: 15,
    maxPerScan: 20
  };
  for (let i = 0; i < argv.length; i++) {
    const cur = String(argv[i] || '');
    if (cur === '--interval-sec' && i + 1 < argv.length) out.intervalSec = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--interval-sec=')) out.intervalSec = Number.parseInt(cur.slice('--interval-sec='.length), 10);
    else if (cur === '--max-per-scan' && i + 1 < argv.length) out.maxPerScan = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--max-per-scan=')) out.maxPerScan = Number.parseInt(cur.slice('--max-per-scan='.length), 10);
  }
  if (!Number.isFinite(out.intervalSec) || out.intervalSec < 3) out.intervalSec = 3;
  if (!Number.isFinite(out.maxPerScan) || out.maxPerScan < 1) out.maxPerScan = 20;
  return out;
}

function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function readLock() {
  if (!fs.existsSync(lockPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (_) {
    return null;
  }
}

function writeLock() {
  fs.mkdirSync(stateDir, { recursive: true });
  const body = {
    pid: process.pid,
    started_at: new Date().toISOString(),
    cmd: 'plan-watchdog-daemon'
  };
  fs.writeFileSync(lockPath, JSON.stringify(body, null, 2) + '\n');
}

function clearLock() {
  try {
    const lock = readLock();
    if (lock && Number(lock.pid) === process.pid) fs.unlinkSync(lockPath);
  } catch (_) {}
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const existing = readLock();
  if (existing && isPidAlive(existing.pid) && Number(existing.pid) !== process.pid) {
    console.log(`[watchdog-daemon] already running pid=${existing.pid}`);
    process.exit(0);
  }
  writeLock();
  process.on('SIGINT', () => {
    clearLock();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    clearLock();
    process.exit(0);
  });
  process.on('exit', () => clearLock());

  console.log(`[watchdog-daemon] started pid=${process.pid} interval=${args.intervalSec}s max_per_scan=${args.maxPerScan}`);
  while (true) {
    try {
      spawnSync(process.execPath, [
        watchdogScript,
        '--repair',
        '--once',
        '--force-revive'
      ], {
        cwd: rootDir,
        stdio: 'inherit',
        env: {
          ...process.env,
          AIH_WATCHDOG_MAX_RELAUNCH_PER_SCAN: String(args.maxPerScan),
          AIH_WATCHDOG_RELAUNCH_MIN_INTERVAL_MS: '5000'
        }
      });
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.log(`[watchdog-daemon] scan error: ${msg}`);
    }
    await sleep(args.intervalSec * 1000);
  }
}

main();
