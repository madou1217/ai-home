const test = require('node:test');
const assert = require('node:assert/strict');
const EventEmitter = require('node:events');
const fsBase = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPtyRuntime } = require('../lib/cli/services/pty/runtime');

function createMockProcess(env = {}, platform = 'linux') {
  const proc = new EventEmitter();
  const rawModeCalls = [];
  const writes = [];

  const stdout = new EventEmitter();
  stdout.columns = 80;
  stdout.rows = 24;
  stdout.write = (chunk) => { writes.push(String(chunk || '')); };

  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = (enabled) => rawModeCalls.push(Boolean(enabled));
  stdin.resume = () => {};
  stdin.pause = () => {};

  proc.env = { ...env };
  proc.platform = platform;
  proc.execPath = process.execPath;
  proc.argv = [process.execPath, '/tmp/ai-home.js'];
  proc.stdout = stdout;
  proc.stdin = stdin;
  proc.cwd = () => '/tmp';
  proc.exit = (code) => {
    throw new Error(`EXIT:${code}`);
  };

  return { proc, rawModeCalls, writes };
}

function createRuntimeHarness(env = {}, overrides = {}) {
  const { proc, rawModeCalls, writes } = createMockProcess(env, overrides.platform || 'linux');
  proc.pid = Number(overrides.pid || 10001);
  const lockRoot = fsBase.mkdtempSync(path.join(os.tmpdir(), 'aih-pty-lock-'));
  const alivePids = overrides.alivePids instanceof Set ? overrides.alivePids : null;
  proc.kill = (pid, signal) => {
    if (signal === 0) {
      const safePid = Number(pid);
      if (alivePids) {
        if (alivePids.has(safePid)) return;
      } else if (safePid === proc.pid) {
        return;
      }
    }
    throw new Error('ESRCH');
  };
  const spawns = [];
  const backgroundSpawns = [];
  const ptyWrites = [];
  let schedulerCalls = 0;
  const pty = {
    spawn(command, args, options) {
      const spawnedProc = {
        onData(cb) { this._onData = cb; },
        onExit(cb) { this._onExit = cb; },
        write(chunk) { ptyWrites.push(chunk); },
        resize() {},
        kill() {}
      };
      spawns.push({ command, args, options, proc: spawnedProc });
      return spawnedProc;
    }
  };

  const spawnImpl = overrides.spawn || (() => {
    const listeners = {};
    const child = {
      on(event, cb) { listeners[event] = cb; },
      kill() {}
    };
    backgroundSpawns.push({ child, listeners });
    return child;
  });

  const fsImpl = {
    existsSync: (target) => {
      const normalized = String(target || '');
      if (normalized.endsWith('.aih_env.json')) return false;
      return fsBase.existsSync(normalized);
    },
    readFileSync: fsBase.readFileSync.bind(fsBase),
    mkdirSync: fsBase.mkdirSync.bind(fsBase),
    openSync: fsBase.openSync.bind(fsBase),
    writeFileSync: fsBase.writeFileSync.bind(fsBase),
    closeSync: fsBase.closeSync.bind(fsBase),
    unlinkSync: fsBase.unlinkSync.bind(fsBase)
  };

  const runtime = createPtyRuntime({
    path: require('node:path'),
    fs: fsImpl,
    processObj: proc,
    pty,
    spawn: spawnImpl,
    execSync: overrides.execSync || (() => {}),
    resolveCliPath: () => '/usr/bin/codex',
    buildPtyLaunch: (command, args) => ({ command, args }),
    resolveWindowsBatchLaunch: (_cliName, cliBin) => ({ launchBin: cliBin, envPatch: {} }),
    readUsageConfig: () => ({}),
    cliConfigs: { codex: { pkg: '@openai/codex', loginArgs: ['login'] } },
    aiHomeDir: overrides.aiHomeDir || lockRoot,
    getProfileDir: () => '/tmp/.ai_home/profiles/codex/10086',
    askYesNo: () => false,
    stripAnsi: (s) => s,
    ensureSessionStoreLinks: () => ({ migrated: 0, linked: 0 }),
    ensureUsageSnapshot: () => null,
    readUsageCache: overrides.readUsageCache || (() => null),
    getUsageRemainingPercentValues: overrides.getUsageRemainingPercentValues || (() => []),
    getNextAvailableId: () => null,
    markActiveAccount: () => {},
    ensureAccountUsageRefreshScheduler: () => { schedulerCalls += 1; },
    refreshIndexedStateForAccount: () => {}
  });

  return {
    runtime,
    proc,
    writes,
    ptyWrites,
    spawns,
    backgroundSpawns,
    rawModeCalls,
    getSchedulerCalls: () => schedulerCalls,
    lockRoot
  };
}

test('runtime does not inject --skip-git-repo-check by default', () => {
  const { runtime, proc, spawns, rawModeCalls } = createRuntimeHarness();
  runtime.runCliPtyTracked('codex', '10086', ['--version'], false);
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ['--version']);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
  assert.deepEqual(rawModeCalls, [true, false]);
});

test('runtime injects --skip-git-repo-check only when explicitly enabled', () => {
  const { runtime, proc, spawns, rawModeCalls } = createRuntimeHarness({
    AIH_CODEX_AUTO_SKIP_REPO_CHECK: '1'
  });
  runtime.runCliPtyTracked('codex', '10086', ['--version'], false);
  assert.equal(spawns.length, 1);
  assert.deepEqual(spawns[0].args, ['--skip-git-repo-check', '--version']);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
  assert.deepEqual(rawModeCalls, [true, false]);
});

test('runtime does not start usage refresh scheduler in PTY mode by default', () => {
  const { runtime, proc, getSchedulerCalls } = createRuntimeHarness();
  runtime.runCliPtyTracked('codex', '10086', ['--version'], false);
  assert.equal(getSchedulerCalls(), 0);
  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime starts usage refresh scheduler only when explicitly enabled', () => {
  const { runtime, proc, getSchedulerCalls } = createRuntimeHarness({
    AIH_RUNTIME_ENABLE_USAGE_SCHEDULER: '1'
  });
  runtime.runCliPtyTracked('codex', '10086', ['--version'], false);
  assert.equal(getSchedulerCalls(), 1);
  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime does not start windows clipboard mirror by default', () => {
  const spawnCalls = [];
  const { runtime, proc } = createRuntimeHarness({
    AIH_RUNTIME_SHOW_USAGE: '0'
  }, {
    platform: 'win32',
    spawn: (cmd, args) => {
      spawnCalls.push({ cmd, args });
      return {
        on() {},
        kill() {}
      };
    }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  assert.equal(spawnCalls.length, 0);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime starts windows clipboard mirror when explicitly enabled', () => {
  const spawnCalls = [];
  const { runtime, proc } = createRuntimeHarness({
    AIH_RUNTIME_SHOW_USAGE: '0',
    AIH_WINDOWS_IMAGE_CLIPBOARD_MIRROR: '1'
  }, {
    platform: 'win32',
    spawn: (cmd, args) => {
      spawnCalls.push({ cmd, args });
      return {
        on() {},
        kill() {}
      };
    }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);

  assert.equal(spawnCalls.length > 0, true);
  const call = spawnCalls[0];
  const encodedCommandIndex = Array.isArray(call.args) ? call.args.indexOf('-EncodedCommand') : -1;
  assert.notEqual(encodedCommandIndex, -1);
  const encoded = call.args[encodedCommandIndex + 1];
  const script = Buffer.from(String(encoded || ''), 'base64').toString('utf16le');
  assert.equal(script.includes('ContainsImage'), true);
  assert.equal(script.includes('$pendingImage = $false'), true);
  assert.equal(script.includes('Add-Type @"'), false);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime enforces single clipboard mirror process across multiple windows PTY instances', () => {
  const sharedHome = fsBase.mkdtempSync(path.join(os.tmpdir(), 'aih-pty-shared-'));
  const alivePids = new Set([11001, 11002]);
  const spawnCalls = [];
  const spawnImpl = (cmd, args) => {
    spawnCalls.push({ cmd, args });
    return {
      on() {},
      kill() {}
    };
  };

  const h1 = createRuntimeHarness({
    AIH_RUNTIME_SHOW_USAGE: '0',
    AIH_WINDOWS_IMAGE_CLIPBOARD_MIRROR: '1'
  }, {
    platform: 'win32',
    aiHomeDir: sharedHome,
    pid: 11001,
    alivePids,
    spawn: spawnImpl
  });
  const h2 = createRuntimeHarness({
    AIH_RUNTIME_SHOW_USAGE: '0',
    AIH_WINDOWS_IMAGE_CLIPBOARD_MIRROR: '1'
  }, {
    platform: 'win32',
    aiHomeDir: sharedHome,
    pid: 11002,
    alivePids,
    spawn: spawnImpl
  });

  h1.runtime.runCliPtyTracked('codex', '10086', [], false);
  h2.runtime.runCliPtyTracked('codex', '10087', [], false);

  assert.equal(spawnCalls.length, 1);

  assert.throws(() => h1.proc.emit('SIGINT'), /EXIT:0/);
  assert.throws(() => h2.proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime recovers stale clipboard mirror lock owned by dead process', () => {
  const sharedHome = fsBase.mkdtempSync(path.join(os.tmpdir(), 'aih-pty-stale-'));
  const lockDir = path.join(sharedHome, 'runtime-locks');
  const lockPath = path.join(lockDir, 'windows-clipboard-mirror.lock');
  fsBase.mkdirSync(lockDir, { recursive: true });
  fsBase.writeFileSync(lockPath, `${JSON.stringify({ pid: 999999, createdAt: Date.now() - 30_000 })}\n`, 'utf8');

  const spawnCalls = [];
  const { runtime, proc } = createRuntimeHarness({
    AIH_RUNTIME_SHOW_USAGE: '0',
    AIH_WINDOWS_IMAGE_CLIPBOARD_MIRROR: '1'
  }, {
    platform: 'win32',
    aiHomeDir: sharedHome,
    pid: 31001,
    spawn: (cmd, args) => {
      spawnCalls.push({ cmd, args });
      return {
        on() {},
        kill() {}
      };
    }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  assert.equal(spawnCalls.length, 1);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime shows usage in PTY and auto-updates after background refresh', () => {
  const now = Date.now();
  let cache = {
    capturedAt: now - (6 * 60 * 1000),
    entries: [{ remainingPct: 75.5 }]
  };
  const { runtime, proc, writes, backgroundSpawns } = createRuntimeHarness({}, {
    readUsageCache: () => cache,
    getUsageRemainingPercentValues: (snapshot) => {
      if (!snapshot || !Array.isArray(snapshot.entries)) return [];
      return snapshot.entries.map((x) => Number(x.remainingPct)).filter((n) => Number.isFinite(n));
    }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  assert.ok(writes.some((line) => line.includes('usage remaining: 75.5%')));
  assert.equal(backgroundSpawns.length, 1);

  cache = {
    capturedAt: now,
    entries: [{ remainingPct: 63.2 }]
  };
  backgroundSpawns[0].listeners.exit?.(0);
  assert.ok(writes.some((line) => line.includes('usage remaining: 63.2%')));

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime shows usage for gemini interactive PTY as well', () => {
  const now = Date.now();
  let cache = {
    capturedAt: now - (6 * 60 * 1000),
    models: [{ remainingPct: 42.8 }]
  };
  const { runtime, proc, writes, backgroundSpawns } = createRuntimeHarness({}, {
    readUsageCache: () => cache,
    getUsageRemainingPercentValues: (snapshot) => {
      if (!snapshot || !Array.isArray(snapshot.models)) return [];
      return snapshot.models.map((x) => Number(x.remainingPct)).filter((n) => Number.isFinite(n));
    }
  });

  runtime.runCliPtyTracked('gemini', '2', [], false);
  assert.ok(writes.some((line) => line.includes('account 2 usage remaining: 42.8%')));
  assert.equal(backgroundSpawns.length, 1);

  cache = {
    capturedAt: now,
    models: [{ remainingPct: 39.1 }]
  };
  backgroundSpawns[0].listeners.exit?.(0);
  assert.ok(writes.some((line) => line.includes('account 2 usage remaining: 39.1%')));

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts windows ctrl+v for clipboard image and writes file path into PTY', () => {
  const { runtime, proc, ptyWrites, rawModeCalls } = createRuntimeHarness({}, {
    platform: 'win32',
    execSync: () => 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120000_001.png\r\n'
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from([0x16]));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120000_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
  assert.deepEqual(rawModeCalls, [true, false]);
});

test('runtime keeps raw ctrl+v behavior when clipboard is not image on windows', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({}, {
    platform: 'win32',
    execSync: () => { throw new Error('no image in clipboard'); }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  const ctrlV = Buffer.from([0x16]);
  proc.stdin.emit('data', ctrlV);

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(Buffer.isBuffer(ptyWrites[0]), true);
  assert.equal(ptyWrites[0][0], 0x16);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts windows shift+insert for clipboard image and writes file path into PTY', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({}, {
    platform: 'win32',
    execSync: () => 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120001_001.png\r\n'
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from('\x1b[2~'));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120001_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts windows alt+v for clipboard image and writes file path into PTY', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({}, {
    platform: 'win32',
    execSync: () => 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120006_001.png\r\n'
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from('\x1bv'));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120006_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts windows ctrl+v CSI-u sequence for clipboard image', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({}, {
    platform: 'win32',
    execSync: () => 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120003_001.png\r\n'
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from('\x1b[118;5u'));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120003_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts windows ctrl+v CSI-u extended sequence for clipboard image', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({}, {
    platform: 'win32',
    execSync: () => 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120005_001.png\r\n'
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from('\x1b[118;5:1u'));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120005_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts windows alt+v CSI-u sequence for clipboard image', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({}, {
    platform: 'win32',
    execSync: () => 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120007_001.png\r\n'
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from('\x1b[118;3u'));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120007_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts empty bracketed paste envelope for clipboard image', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({}, {
    platform: 'win32',
    execSync: () => 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120004_001.png\r\n'
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from('\x1b[200~\x1b[201~'));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), 'C:\\Temp\\aih-image-paste\\aih_clip_20260305_120004_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts ctrl+v in WSL and normalizes windows clipboard path', () => {
  const execCalls = [];
  const { runtime, proc, ptyWrites } = createRuntimeHarness({
    WSL_DISTRO_NAME: 'Ubuntu'
  }, {
    platform: 'linux',
    execSync: (cmd) => {
      execCalls.push(String(cmd));
      if (String(cmd).startsWith('powershell.exe ') || String(cmd).startsWith('powershell ')) {
        return 'C:\\Users\\madou\\AppData\\Local\\Temp\\aih-image-paste\\aih_clip_20260305_120000_001.png\r\n';
      }
      if (String(cmd).startsWith('wslpath -u ')) {
        return '/mnt/c/Users/madou/AppData/Local/Temp/aih-image-paste/aih_clip_20260305_120000_001.png\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from([0x16]));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), '/mnt/c/Users/madou/AppData/Local/Temp/aih-image-paste/aih_clip_20260305_120000_001.png');
  assert.equal(execCalls.some((cmd) => cmd.startsWith('wslpath -u ')), true);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts shift+insert in WSL and normalizes windows clipboard path', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({
    WSL_DISTRO_NAME: 'Ubuntu'
  }, {
    platform: 'linux',
    execSync: (cmd) => {
      if (String(cmd).startsWith('powershell.exe ') || String(cmd).startsWith('powershell ')) {
        return 'C:\\Users\\madou\\AppData\\Local\\Temp\\aih-image-paste\\aih_clip_20260305_120002_001.png\r\n';
      }
      if (String(cmd).startsWith('wslpath -u ')) {
        return '/mnt/c/Users/madou/AppData/Local/Temp/aih-image-paste/aih_clip_20260305_120002_001.png\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from('\x1b[2;2~'));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), '/mnt/c/Users/madou/AppData/Local/Temp/aih-image-paste/aih_clip_20260305_120002_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime intercepts alt+v in WSL and normalizes windows clipboard path', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({
    WSL_DISTRO_NAME: 'Ubuntu'
  }, {
    platform: 'linux',
    execSync: (cmd) => {
      if (String(cmd).startsWith('powershell.exe ') || String(cmd).startsWith('powershell ')) {
        return 'C:\\Users\\madou\\AppData\\Local\\Temp\\aih-image-paste\\aih_clip_20260305_120008_001.png\r\n';
      }
      if (String(cmd).startsWith('wslpath -u ')) {
        return '/mnt/c/Users/madou/AppData/Local/Temp/aih-image-paste/aih_clip_20260305_120008_001.png\n';
      }
      throw new Error(`unexpected command: ${cmd}`);
    }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  proc.stdin.emit('data', Buffer.from('\x1bv'));

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), '/mnt/c/Users/madou/AppData/Local/Temp/aih-image-paste/aih_clip_20260305_120008_001.png');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime keeps non-empty bracketed paste payload as raw input', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({
    WSL_DISTRO_NAME: 'Ubuntu'
  }, {
    platform: 'linux',
    execSync: () => { throw new Error('should not call clipboard for non-empty paste payload'); }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  const payload = Buffer.from('\x1b[200~hello\x1b[201~');
  proc.stdin.emit('data', payload);

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(String(ptyWrites[0]), '\x1b[200~hello\x1b[201~');

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});

test('runtime keeps raw ctrl+v behavior on non-WSL linux', () => {
  const { runtime, proc, ptyWrites } = createRuntimeHarness({}, {
    platform: 'linux',
    execSync: () => { throw new Error('should not call clipboard on non-wsl linux'); }
  });

  runtime.runCliPtyTracked('codex', '10086', [], false);
  const ctrlV = Buffer.from([0x16]);
  proc.stdin.emit('data', ctrlV);

  assert.equal(ptyWrites.length > 0, true);
  assert.equal(Buffer.isBuffer(ptyWrites[0]), true);
  assert.equal(ptyWrites[0][0], 0x16);

  assert.throws(() => proc.emit('SIGINT'), /EXIT:0/);
});
