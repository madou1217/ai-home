'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

function createProxyDaemonController(opts) {
  const options = opts || {};
  const ensureDir = options.ensureDir;
  const parseProxyServeArgs = options.parseProxyServeArgs;
  const aiHomeDir = options.aiHomeDir;
  const pidFile = options.pidFile;
  const logFile = options.logFile;
  const launchdLabel = options.launchdLabel;
  const launchdPlist = options.launchdPlist;
  const entryScriptPath = options.entryScriptPath;
  const nodeExecPath = options.nodeExecPath || process.execPath;

  if (typeof ensureDir !== 'function') throw new Error('proxy_daemon_missing_ensureDir');
  if (typeof parseProxyServeArgs !== 'function') throw new Error('proxy_daemon_missing_parseProxyServeArgs');
  if (!aiHomeDir || !pidFile || !logFile || !launchdLabel || !launchdPlist || !entryScriptPath) {
    throw new Error('proxy_daemon_missing_paths');
  }

  function readProxyPid() {
    if (!fs.existsSync(pidFile)) return 0;
    try {
      const val = String(fs.readFileSync(pidFile, 'utf8')).trim();
      return /^\d+$/.test(val) ? Number(val) : 0;
    } catch (e) {
      return 0;
    }
  }

  function clearPidFile() {
    try {
      fs.unlinkSync(pidFile);
    } catch (e) {}
  }

  function buildAppliedConfig(parsed) {
    const cfg = parsed || {};
    return {
      host: cfg.host,
      port: cfg.port,
      upstream: cfg.upstream,
      strategy: cfg.strategy,
      backend: cfg.backend,
      provider: cfg.provider,
      cooldownMs: cfg.cooldownMs,
      upstreamTimeoutMs: cfg.upstreamTimeoutMs,
      maxAttempts: cfg.maxAttempts,
      modelsCacheTtlMs: cfg.modelsCacheTtlMs,
      modelsProbeAccounts: cfg.modelsProbeAccounts,
      failureThreshold: cfg.failureThreshold,
      logRequests: cfg.logRequests,
      codexMaxConcurrency: cfg.codexMaxConcurrency,
      geminiMaxConcurrency: cfg.geminiMaxConcurrency,
      queueLimit: cfg.queueLimit,
      localMaxAttempts: cfg.localMaxAttempts,
      clientKeyConfigured: Boolean(cfg.clientKey),
      managementKeyConfigured: Boolean(cfg.managementKey)
    };
  }

  function isProcessAlive(pid) {
    if (!Number.isFinite(pid) || pid <= 0) return false;
    try {
      process.kill(pid, 0);
      return true;
    } catch (e) {
      return false;
    }
  }

  function waitForProxyReady(port, timeoutMs = 5000) {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve) => {
      const tick = async () => {
        if (Date.now() > deadline) {
          resolve(false);
          return;
        }
        try {
          const res = await fetch(`http://127.0.0.1:${port}/healthz`);
          if (res.ok) {
            resolve(true);
            return;
          }
        } catch (e) {}
        setTimeout(tick, 150);
      };
      tick();
    });
  }

  async function start(rawServeArgs) {
    ensureDir(aiHomeDir);
    const parsed = parseProxyServeArgs(rawServeArgs || []);
    const appliedConfig = buildAppliedConfig(parsed);
    const existingPid = readProxyPid();
    if (isProcessAlive(existingPid)) {
      return { alreadyRunning: true, pid: existingPid, started: true, appliedConfig };
    }
    if (existingPid) clearPidFile();

    const outFd = fs.openSync(logFile, 'a');
    const child = spawn(nodeExecPath, [entryScriptPath, 'proxy', 'serve', ...(rawServeArgs || [])], {
      detached: true,
      stdio: ['ignore', outFd, outFd],
      env: process.env
    });
    child.unref();
    fs.writeFileSync(pidFile, String(child.pid));
    const started = await waitForProxyReady(parsed.port, 7000);
    if (!isProcessAlive(child.pid)) {
      clearPidFile();
      return {
        alreadyRunning: false,
        pid: child.pid,
        started: false,
        failed: true,
        reason: 'process_exited_before_ready',
        appliedConfig
      };
    }
    return { alreadyRunning: false, pid: child.pid, started, failed: !started, appliedConfig };
  }

  function stop() {
    const pid = readProxyPid();
    if (!pid) return { stopped: false, reason: 'not_running' };
    if (!isProcessAlive(pid)) {
      try { fs.unlinkSync(pidFile); } catch (e) {}
      return { stopped: false, reason: 'stale_pid', pid };
    }
    try {
      process.kill(pid, 'SIGTERM');
    } catch (e) {
      return { stopped: false, reason: 'kill_failed', pid };
    }
    const deadline = Date.now() + 3000;
    while (Date.now() < deadline) {
      if (!isProcessAlive(pid)) {
        try { fs.unlinkSync(pidFile); } catch (e) {}
        return { stopped: true, pid };
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 80);
    }
    try {
      process.kill(pid, 'SIGKILL');
    } catch (e) {}
    try { fs.unlinkSync(pidFile); } catch (e) {}
    return { stopped: true, pid, forced: true };
  }

  function status() {
    const pid = readProxyPid();
    const running = isProcessAlive(pid);
    if (!running && pid) clearPidFile();
    return {
      running,
      pid: running ? pid : 0,
      pidFile,
      logFile
    };
  }

  function autostartStatus() {
    if (process.platform !== 'darwin') {
      return { supported: false, installed: false, loaded: false };
    }
    const installed = fs.existsSync(launchdPlist);
    let loaded = false;
    try {
      const out = spawnSync('launchctl', ['list', launchdLabel], { encoding: 'utf8' });
      loaded = out.status === 0;
    } catch (e) {
      loaded = false;
    }
    return { supported: true, installed, loaded, plist: launchdPlist, label: launchdLabel };
  }

  function installAutostart() {
    if (process.platform !== 'darwin') {
      throw new Error('autostart is currently implemented for macOS launchd only');
    }
    ensureDir(path.dirname(launchdPlist));
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${launchdLabel}</string>
    <key>ProgramArguments</key>
    <array>
      <string>${nodeExecPath}</string>
      <string>${entryScriptPath}</string>
      <string>proxy</string>
      <string>serve</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>${logFile}</string>
    <key>StandardErrorPath</key>
    <string>${logFile}</string>
    <key>EnvironmentVariables</key>
    <dict>
      <key>PATH</key>
      <string>${process.env.PATH || ''}</string>
    </dict>
  </dict>
</plist>
`;
    fs.writeFileSync(launchdPlist, plist);
    spawnSync('launchctl', ['unload', launchdPlist], { stdio: 'ignore' });
    const load = spawnSync('launchctl', ['load', launchdPlist], { encoding: 'utf8' });
    if (load.status !== 0) {
      throw new Error(String(load.stderr || load.stdout || 'launchctl load failed').trim());
    }
  }

  function uninstallAutostart() {
    if (process.platform !== 'darwin') {
      throw new Error('autostart is currently implemented for macOS launchd only');
    }
    if (fs.existsSync(launchdPlist)) {
      spawnSync('launchctl', ['unload', launchdPlist], { stdio: 'ignore' });
      fs.unlinkSync(launchdPlist);
    }
  }

  async function restart(rawServeArgs) {
    const stopped = stop();
    const started = await start(rawServeArgs || []);
    return {
      stopped,
      started,
      running: Boolean(started && started.started),
      pid: started && started.pid ? started.pid : 0,
      appliedConfig: started && started.appliedConfig ? started.appliedConfig : {}
    };
  }

  return {
    start,
    restart,
    stop,
    status,
    autostartStatus,
    installAutostart,
    uninstallAutostart
  };
}

module.exports = {
  createProxyDaemonController
};
