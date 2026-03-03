'use strict';

function runProxyCommandRouter(args, deps = {}) {
  const processImpl = deps.processImpl || process;
  const showProxyUsage = deps.showProxyUsage;
  const getProxyDaemonStatus = deps.getProxyDaemonStatus;
  const getProxyAutostartStatus = deps.getProxyAutostartStatus;
  const installProxyAutostart = deps.installProxyAutostart;
  const uninstallProxyAutostart = deps.uninstallProxyAutostart;
  const stopProxyDaemon = deps.stopProxyDaemon;
  const startProxyDaemon = deps.startProxyDaemon;
  const parseProxyEnvArgs = deps.parseProxyEnvArgs;
  const parseProxyServeArgs = deps.parseProxyServeArgs;
  const startLocalProxyServer = deps.startLocalProxyServer;
  const parseProxySyncArgs = deps.parseProxySyncArgs;
  const syncCodexAccountsToProxy = deps.syncCodexAccountsToProxy;

  const action = String(args[1] || '').trim();
  if (action === 'help' || action === '--help' || action === '-h') {
    showProxyUsage();
    processImpl.exit(0);
    return;
  }

  if (action === 'status') {
    const st = getProxyDaemonStatus();
    if (st.running) {
      console.log(`\x1b[36m[aih]\x1b[0m proxy is running (pid=${st.pid})`);
      console.log('  base_url: http://127.0.0.1:8317/v1');
      console.log('  api_key: dummy');
      console.log(`  pid_file: ${st.pidFile}`);
      console.log(`  log_file: ${st.logFile}`);
    } else {
      console.log('\x1b[90m[aih]\x1b[0m proxy is not running');
    }
    const auto = getProxyAutostartStatus();
    if (auto.supported) {
      console.log(`  autostart: installed=${auto.installed} loaded=${auto.loaded}`);
    } else {
      console.log('  autostart: unsupported_on_this_platform');
    }
    processImpl.exit(0);
    return;
  }

  if (action === 'autostart') {
    const sub = String(args[2] || 'status').trim().toLowerCase();
    try {
      if (sub === 'install') {
        installProxyAutostart();
        console.log(`\x1b[32m[aih]\x1b[0m proxy autostart installed`);
        processImpl.exit(0);
        return;
      }
      if (sub === 'uninstall' || sub === 'remove') {
        uninstallProxyAutostart();
        console.log(`\x1b[32m[aih]\x1b[0m proxy autostart removed`);
        processImpl.exit(0);
        return;
      }
      const st = getProxyAutostartStatus();
      if (!st.supported) {
        console.log('\x1b[90m[aih]\x1b[0m autostart is unsupported on this platform');
        processImpl.exit(0);
        return;
      }
      console.log(`\x1b[36m[aih]\x1b[0m proxy autostart status`);
      console.log(`  installed: ${st.installed}`);
      console.log(`  loaded: ${st.loaded}`);
      console.log(`  plist: ${st.plist}`);
      processImpl.exit(0);
      return;
    } catch (e) {
      console.error(`\x1b[31m[aih] proxy autostart failed: ${e.message}\x1b[0m`);
      processImpl.exit(1);
      return;
    }
  }

  if (action === 'stop') {
    const res = stopProxyDaemon();
    if (res.stopped) {
      console.log(`\x1b[32m[aih]\x1b[0m proxy stopped (pid=${res.pid})${res.forced ? ' [forced]' : ''}`);
      processImpl.exit(0);
      return;
    }
    console.log(`\x1b[90m[aih]\x1b[0m proxy stop skipped (${res.reason || 'not_running'})`);
    processImpl.exit(0);
    return;
  }

  if (action === 'start' || !action || action.startsWith('-')) {
    (async () => {
      try {
        const serveArgs = action === 'start' ? args.slice(2) : args.slice(1);
        const result = await startProxyDaemon(serveArgs);
        if (result.alreadyRunning) {
          console.log(`\x1b[90m[aih]\x1b[0m proxy already running (pid=${result.pid})`);
        } else if (result.started) {
          console.log(`\x1b[32m[aih]\x1b[0m proxy started in background (pid=${result.pid})`);
        } else {
          console.log(`\x1b[33m[aih]\x1b[0m proxy process created (pid=${result.pid}), but health check timed out`);
        }
        console.log('  base_url: http://127.0.0.1:8317/v1');
        console.log('  api_key: dummy');
        processImpl.exit(0);
      } catch (e) {
        console.error(`\x1b[31m[aih] proxy start failed: ${e.message}\x1b[0m`);
        processImpl.exit(1);
      }
    })();
    return;
  }

  if (action === 'restart') {
    const stopped = stopProxyDaemon();
    if (stopped.stopped) {
      console.log(`\x1b[90m[aih]\x1b[0m proxy stopped for restart (pid=${stopped.pid})`);
    }
    (async () => {
      try {
        const result = await startProxyDaemon(args.slice(2));
        if (result.alreadyRunning) {
          console.log(`\x1b[90m[aih]\x1b[0m proxy already running (pid=${result.pid})`);
        } else if (result.started) {
          console.log(`\x1b[32m[aih]\x1b[0m proxy restarted in background (pid=${result.pid})`);
        } else {
          console.log(`\x1b[33m[aih]\x1b[0m proxy process created (pid=${result.pid}), but health check timed out`);
        }
        console.log('  base_url: http://127.0.0.1:8317/v1');
        console.log('  api_key: dummy');
        processImpl.exit(0);
      } catch (e) {
        console.error(`\x1b[31m[aih] proxy restart failed: ${e.message}\x1b[0m`);
        processImpl.exit(1);
      }
    })();
    return;
  }

  if (action === 'env') {
    let envOpts;
    try {
      envOpts = parseProxyEnvArgs(args.slice(2));
    } catch (e) {
      console.error(`\x1b[31m[aih] ${e.message}\x1b[0m`);
      console.log('\x1b[90mUsage:\x1b[0m aih proxy env [--base-url <url>] [--api-key <key>]');
      processImpl.exit(1);
      return;
    }
    console.log(`export OPENAI_BASE_URL="${envOpts.baseUrl}"`);
    console.log(`export OPENAI_API_KEY="${envOpts.apiKey}"`);
    processImpl.exit(0);
    return;
  }

  if (action === 'serve') {
    let serveOpts;
    try {
      const serveArgs = action === 'serve' ? args.slice(2) : args.slice(1);
      serveOpts = parseProxyServeArgs(serveArgs);
    } catch (e) {
      console.error(`\x1b[31m[aih] ${e.message}\x1b[0m`);
      console.log('\x1b[90mUsage:\x1b[0m aih proxy [--port <n>]  (or: aih proxy serve [options])');
      processImpl.exit(1);
      return;
    }
    (async () => {
      try {
        await startLocalProxyServer(serveOpts);
      } catch (e) {
        console.error(`\x1b[31m[aih] proxy serve failed: ${e.message}\x1b[0m`);
        processImpl.exit(1);
      }
    })();
    return;
  }

  if (action === 'sync-codex' || action === 'sync_codex') {
    let syncOpts;
    try {
      syncOpts = parseProxySyncArgs(args.slice(2));
    } catch (e) {
      console.error(`\x1b[31m[aih] ${e.message}\x1b[0m`);
      console.log('\x1b[90mUsage:\x1b[0m aih proxy sync-codex [--management-url <url>] [--key <management-key>] [--parallel <1-32>] [--limit <n>] [--dry-run]');
      processImpl.exit(1);
      return;
    }
    (async () => {
      try {
        const result = await syncCodexAccountsToProxy(syncOpts);
        const modeLabel = result.dryRun ? 'dry-run' : 'write';
        console.log(`\x1b[36m[aih]\x1b[0m proxy sync-codex done (${modeLabel})`);
        console.log(`  management: ${result.managementUrl}`);
        console.log(`  scanned: ${result.scanned}`);
        console.log(`  eligible: ${result.eligible}`);
        console.log(`  uploaded: ${result.uploaded}`);
        console.log(`  invalid: ${result.skippedInvalid}`);
        if (!result.dryRun) {
          console.log(`  failed: ${result.failed}`);
          if (result.firstError) {
            console.log(`  first_error: ${result.firstError}`);
          }
        }
        processImpl.exit(result.failed > 0 ? 1 : 0);
      } catch (e) {
        console.error(`\x1b[31m[aih] proxy sync-codex failed: ${e.message}\x1b[0m`);
        processImpl.exit(1);
      }
    })();
    return;
  }

  console.error(`\x1b[31m[aih] Unknown proxy action '${action}'.\x1b[0m`);
  showProxyUsage();
  processImpl.exit(1);
}

module.exports = {
  runProxyCommandRouter
};

