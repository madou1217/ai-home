'use strict';

function createPtyRuntime(options = {}) {
  const {
    path,
    fs,
    processObj,
    pty,
    execSync,
    resolveCliPath,
    buildPtyLaunch,
    resolveWindowsBatchLaunch,
    readUsageConfig,
    cliConfigs,
    aiHomeDir,
    getProfileDir,
    askYesNo,
    stripAnsi,
    ensureSessionStoreLinks,
    ensureUsageSnapshot,
    readUsageCache,
    getUsageRemainingPercentValues,
    getNextAvailableId,
    markActiveAccount,
    ensureAccountUsageRefreshScheduler,
    refreshIndexedStateForAccount
  } = options;

  function spawnPty(cliName, cliBin, id, forwardArgs, isLogin) {
    const sandboxDir = getProfileDir(cliName, id);

    let loadedEnv = {};
    const envPath = path.join(sandboxDir, '.aih_env.json');
    if (fs.existsSync(envPath)) {
      try { loadedEnv = JSON.parse(fs.readFileSync(envPath, 'utf8')); } catch (_error) {}
    }

    const envOverrides = {
      ...processObj.env,
      ...loadedEnv,
      HOME: sandboxDir,
      USERPROFILE: sandboxDir,
      CLAUDE_CONFIG_DIR: path.join(sandboxDir, '.claude'),
      CODEX_HOME: path.join(sandboxDir, '.codex'),
      GEMINI_CLI_SYSTEM_SETTINGS_PATH: path.join(sandboxDir, '.gemini', 'settings.json')
    };

    const argsToRunBase = isLogin ? (cliConfigs[cliName]?.loginArgs || []) : forwardArgs;
    const argsToRun = Array.isArray(argsToRunBase) ? [...argsToRunBase] : [];
    if (
      cliName === 'codex'
      && !isLogin
      && String(processObj.env.AIH_CODEX_AUTO_SKIP_REPO_CHECK || '0') === '1'
      && !argsToRun.includes('--skip-git-repo-check')
    ) {
      argsToRun.unshift('--skip-git-repo-check');
    }
    const batchLaunch = resolveWindowsBatchLaunch(cliName, cliBin || cliName, envOverrides, processObj.platform);
    const launchBin = batchLaunch.launchBin || cliName;
    Object.assign(envOverrides, batchLaunch.envPatch || {});
    const launch = buildPtyLaunch(launchBin, argsToRun, { platform: processObj.platform });
    return pty.spawn(launch.command, launch.args, {
      name: 'xterm-color',
      cols: processObj.stdout.columns || 80,
      rows: processObj.stdout.rows || 24,
      cwd: processObj.cwd(),
      env: envOverrides
    });
  }

  function runCliPty(cliName, initialId, forwardArgs, isLogin = false) {
    let cliPath = resolveCliPath(cliName);
    if (!cliPath) {
      console.log(`\x1b[33m[aih] Native CLI '${cliName}' not found.\x1b[0m`);
      const ans = askYesNo('Do you want to automatically install it via npm?');
      if (ans) {
        const pkg = cliConfigs[cliName].pkg;
        console.log(`\n\x1b[36m[aih]\x1b[0m Installing \x1b[33m${pkg}\x1b[0m...`);
        execSync(`npm install -g ${pkg}`, { stdio: 'inherit' });
        console.log(`\x1b[32m[aih] Successfully installed ${cliName}!\x1b[0m\n`);
      } else {
        processObj.exit(1);
      }
      cliPath = resolveCliPath(cliName);
      if (!cliPath) {
        console.error(`\x1b[31m[aih] ${cliName} is still not in PATH after install.\x1b[0m`);
        processObj.exit(1);
      }
    }

    console.log(`\n\x1b[36m[aih]\x1b[0m 🚀 Running \x1b[33m${cliName}\x1b[0m (Account ID: \x1b[32m${initialId}\x1b[0m) via PTY Sandbox`);
    const initialSessionSync = ensureSessionStoreLinks(cliName, initialId);
    if (initialSessionSync.migrated > 0 || initialSessionSync.linked > 0) {
      console.log(`\x1b[36m[aih]\x1b[0m Session links ready (${cliName}): migrated ${initialSessionSync.migrated}, linked ${initialSessionSync.linked}.`);
    }

    let activeId = String(initialId || '').trim();
    let ptyProc = spawnPty(cliName, cliPath, activeId, forwardArgs, isLogin);

    const waveFrames = ['.', '..', '...', ' ..', '  .', '   '];
    let waveIdx = 0;
    let hasReceivedData = false;

    const waveInterval = setInterval(() => {
      if (!hasReceivedData) {
        processObj.stdout.write(`\r\x1b[36m[aih]\x1b[0m Waiting for ${cliName} to boot${waveFrames[waveIdx++]}\x1b[K`);
        waveIdx %= waveFrames.length;
      }
    }, 200);

    const onResize = () => {
      if (ptyProc) {
        try { ptyProc.resize(processObj.stdout.columns, processObj.stdout.rows); } catch (_error) {}
      }
    };
    processObj.stdout.on('resize', onResize);

    const canUseRawMode = !!(processObj.stdin && processObj.stdin.isTTY && typeof processObj.stdin.setRawMode === 'function');
    if (canUseRawMode) {
      processObj.stdin.setRawMode(true);
    }
    processObj.stdin.resume();

    const onStdinData = (data) => {
      if (ptyProc) ptyProc.write(data);
    };
    processObj.stdin.on('data', onStdinData);

    let outputBuffer = '';
    let isSwapping = false;
    let thresholdTimer = null;
    let sigintHandler = null;
    let cleanedUp = false;

    function cleanupTerminalHooks() {
      if (cleanedUp) return;
      cleanedUp = true;
      clearInterval(waveInterval);
      try { processObj.stdout.off('resize', onResize); } catch (_error) {}
      try { processObj.stdin.off('data', onStdinData); } catch (_error) {}
      if (sigintHandler) {
        try { processObj.off('SIGINT', sigintHandler); } catch (_error) {}
      }
      try { processObj.stdin.pause(); } catch (_error) {}
      if (canUseRawMode) {
        try { processObj.stdin.setRawMode(false); } catch (_error) {}
      }
    }

    function getThresholdPct() {
      const cfg = readUsageConfig({ filePath: path.join(aiHomeDir, 'usage-config.json') });
      const val = Number(cfg && cfg.threshold_pct);
      if (!Number.isFinite(val)) return 95;
      return Math.max(1, Math.min(100, Math.floor(val)));
    }

    function getCurrentRemainingPct(id) {
      const cache = ensureUsageSnapshot(cliName, id, readUsageCache(cliName, id));
      const values = getUsageRemainingPercentValues(cache);
      if (!values.length) return null;
      return Math.min(...values);
    }

    function switchToAccount(targetId, reasonLabel) {
      const nextId = String(targetId || '').trim();
      if (!/^\d+$/.test(nextId) || nextId === activeId || !ptyProc || isSwapping) return;
      isSwapping = true;
      const fromId = activeId;
      processObj.stdout.write(`\r\n\x1b[33m[aih] ${reasonLabel}. Auto-switch: ${fromId} -> ${nextId}\x1b[0m\r\n`);
      activeId = nextId;
      try { ptyProc.kill(); } catch (_error) {}
      setTimeout(() => {
        ptyProc = spawnPty(cliName, cliPath, activeId, forwardArgs, isLogin);
        attachOnData(ptyProc);
        isSwapping = false;
      }, 250);
    }

    function startThresholdWatcher() {
      const enabled = String(processObj.env.AIH_RUNTIME_AUTO_SWITCH || '1') !== '0';
      const interactive = !isLogin && (!Array.isArray(forwardArgs) || forwardArgs.length === 0);
      if (!enabled || !interactive || cliName !== 'codex') return;
      const intervalMs = Math.max(30_000, Number(processObj.env.AIH_RUNTIME_THRESHOLD_CHECK_MS) || 60_000);
      thresholdTimer = setInterval(() => {
        if (isSwapping || !ptyProc) return;
        const remaining = getCurrentRemainingPct(activeId);
        if (!Number.isFinite(remaining)) return;
        const usagePct = Math.max(0, Math.min(100, 100 - remaining));
        const thresholdPct = getThresholdPct();
        if (usagePct < thresholdPct) return;
        const nextId = getNextAvailableId(cliName, activeId);
        if (!nextId || String(nextId) === activeId) {
          processObj.stdout.write(`\r\n\x1b[90m[aih] usage ${remaining.toFixed(1)}% remaining (>= threshold hit), no eligible standby account.\x1b[0m\r\n`);
          return;
        }
        switchToAccount(nextId, `usage threshold reached (${remaining.toFixed(1)}% remaining)`);
      }, intervalMs);
      if (thresholdTimer && typeof thresholdTimer.unref === 'function') thresholdTimer.unref();
    }

    function stopThresholdWatcher() {
      if (thresholdTimer) {
        clearInterval(thresholdTimer);
        thresholdTimer = null;
      }
    }

    function attachOnData(proc) {
      proc.onData((data) => {
        if (!hasReceivedData) {
          hasReceivedData = true;
          clearInterval(waveInterval);
          processObj.stdout.write('\r\x1b[K');
        }

        processObj.stdout.write(data);
        outputBuffer += stripAnsi(data);
        if (outputBuffer.length > 1000) outputBuffer = outputBuffer.slice(-1000);

        const lowerOut = outputBuffer.toLowerCase();
        if (isLogin && (lowerOut.includes('failed to login') || lowerOut.includes('socket disconnected') || lowerOut.includes('connection error'))) {
          outputBuffer = '';
          processObj.stdout.write('\r\n\x1b[33m[aih] Detected Network/Auth Error. Attempting to auto-restart the auth process...\x1b[0m\r\n');
          isSwapping = true;
          proc.kill();
          setTimeout(() => {
            isSwapping = false;
            ptyProc = spawnPty(cliName, cliPath, activeId, [], true);
            attachOnData(ptyProc);
          }, 1500);
        }
      });

      proc.onExit(({ exitCode }) => {
        if (!isSwapping) {
          if (isLogin && exitCode === 0) {
            stopThresholdWatcher();
            cleanupTerminalHooks();
            console.log('\n\x1b[32m[aih] Auth completed! Booting standard session...\x1b[0m');
            setTimeout(() => {
              runCliPty(cliName, activeId, forwardArgs, false);
            }, 500);
          } else {
            stopThresholdWatcher();
            cleanupTerminalHooks();
            processObj.stdout.write('\r\n');
            processObj.exit(exitCode || 0);
          }
        }
      });
    }

    attachOnData(ptyProc);
    startThresholdWatcher();

    sigintHandler = () => {
      stopThresholdWatcher();
      cleanupTerminalHooks();
      processObj.exit(0);
    };
    processObj.on('SIGINT', sigintHandler);
  }

  function runCliPtyTracked(cliName, id, forwardArgs, isLogin) {
    markActiveAccount(cliName, id);
    ensureAccountUsageRefreshScheduler();
    refreshIndexedStateForAccount(cliName, id, { refreshSnapshot: false });
    return runCliPty(cliName, id, forwardArgs, isLogin);
  }

  return {
    runCliPtyTracked
  };
}

module.exports = {
  createPtyRuntime
};
