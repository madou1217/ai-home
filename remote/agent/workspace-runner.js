'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

const DEFAULT_KILL_AFTER_MS = 1000;
const DEFAULT_MAX_OUTPUT_BYTES = 1024 * 1024;

function resolveWorkspacePath(workspaceRoot, projectDir, pathImpl = path) {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    throw new Error('workspaceRoot is required');
  }
  const root = pathImpl.resolve(workspaceRoot);
  const project = projectDir && String(projectDir).trim() ? String(projectDir).trim() : '.';
  const candidate = pathImpl.resolve(root, project);
  const relative = pathImpl.relative(root, candidate);
  if (relative === '..' || relative.startsWith(`..${pathImpl.sep}`) || pathImpl.isAbsolute(relative)) {
    throw new Error(`projectDir escapes workspaceRoot: ${projectDir}`);
  }
  return candidate;
}

function resolveSubPath(baseDir, target, pathImpl = path) {
  const normalized = target && String(target).trim() ? String(target).trim() : '.';
  const candidate = pathImpl.resolve(baseDir, normalized);
  const relative = pathImpl.relative(baseDir, candidate);
  if (relative === '..' || relative.startsWith(`..${pathImpl.sep}`) || pathImpl.isAbsolute(relative)) {
    throw new Error(`path escapes workspace: ${target}`);
  }
  return candidate;
}

function createWorkspaceRunner(options = {}, deps = {}) {
  const spawnImpl = deps.spawn || spawn;
  const clock = deps.now || Date.now;
  const pathImpl = deps.path || path;
  const workspaceRoot = options.workspaceRoot || process.cwd();
  const projectDir = options.projectDir || '.';
  const workspaceDir = resolveWorkspacePath(workspaceRoot, projectDir, pathImpl);

  function emitEvent(emit, event) {
    if (typeof emit === 'function') {
      try {
        emit(event);
      } catch (_) {
        // Keep command execution stable even if observers fail.
      }
    }
  }

  async function run(request = {}) {
    const commandRaw = request.command || request.cmd;
    const command = typeof commandRaw === 'string' ? commandRaw.trim() : '';
    if (!command) {
      throw new Error('command is required');
    }
    if (command.includes('\u0000')) {
      throw new Error('command contains unsupported null bytes');
    }

    if (request.shell === true) {
      throw new Error('shell execution is blocked');
    }

    if (request.args != null && !Array.isArray(request.args)) {
      throw new Error('args must be an array');
    }
    const args = Array.isArray(request.args) ? request.args.map((item) => String(item)) : [];
    for (const arg of args) {
      if (arg.includes('\u0000')) {
        throw new Error('args contain unsupported null bytes');
      }
    }

    const cwdInput = request.cwd == null ? '.' : String(request.cwd).trim();
    const cwd = resolveSubPath(workspaceDir, cwdInput || '.', pathImpl);

    if (request.env != null && (Array.isArray(request.env) || typeof request.env !== 'object')) {
      throw new Error('env must be an object');
    }
    const envEntries = Object.entries(request.env || {});
    const safeEnv = {};
    for (const [key, value] of envEntries) {
      if (!key || key.includes('=') || key.includes('\u0000')) {
        throw new Error(`invalid env key: ${key}`);
      }
      const normalized = String(value);
      if (normalized.includes('\u0000')) {
        throw new Error(`env value for ${key} contains unsupported null bytes`);
      }
      safeEnv[key] = normalized;
    }
    const env = request.inheritEnv === false
      ? safeEnv
      : { ...process.env, ...safeEnv };

    const timeoutMs = Number(request.timeoutMs) > 0 ? Number(request.timeoutMs) : 0;
    const killAfterMs = Number(request.killAfterMs) > 0 ? Number(request.killAfterMs) : DEFAULT_KILL_AFTER_MS;
    const maxOutputBytes = Number(request.maxOutputBytes) > 0 ? Number(request.maxOutputBytes) : DEFAULT_MAX_OUTPUT_BYTES;
    const input = request.input == null ? '' : String(request.input);
    const emit = request.onEvent;

    return new Promise((resolve) => {
      const startedAtMs = clock();
      const startedAt = new Date(startedAtMs).toISOString();
      let timedOut = false;
      let timeout = null;
      let hardKillTimeout = null;
      let spawnError = null;
      let stdout = '';
      let stderr = '';
      let outputTruncated = false;
      let child = null;

      function appendChunk(base, chunk) {
        const currentSize = Buffer.byteLength(base, 'utf8');
        if (currentSize >= maxOutputBytes) {
          outputTruncated = true;
          return base;
        }
        const chunkBuffer = Buffer.from(chunk, 'utf8');
        const remaining = maxOutputBytes - currentSize;
        if (chunkBuffer.length <= remaining) {
          return base + chunk;
        }
        outputTruncated = true;
        return base + chunkBuffer.subarray(0, remaining).toString('utf8');
      }

      try {
        child = spawnImpl(command, args, {
          cwd,
          env,
          shell: false
        });
      } catch (error) {
        spawnError = error;
        const finishedAtMs = clock();
        const finishedAt = new Date(finishedAtMs).toISOString();
        const message = error && error.message ? error.message : String(error);
        emitEvent(emit, {
          type: 'error',
          command,
          args,
          cwd,
          message,
          at: finishedAt
        });
        const result = {
          command,
          args,
          cwd,
          exitCode: null,
          signal: null,
          timedOut: false,
          ok: false,
          stdout: '',
          stderr: message,
          outputTruncated: false,
          error: message,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAtMs - startedAtMs)
        };
        emitEvent(emit, {
          type: 'exit',
          ...result
        });
        resolve(result);
        return;
      }

      emitEvent(emit, {
        type: 'start',
        command,
        args,
        cwd,
        pid: child.pid || null,
        startedAt
      });

      if (timeoutMs > 0) {
        timeout = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
          emitEvent(emit, {
            type: 'timeout',
            command,
            args,
            cwd,
            timeoutMs,
            at: new Date(clock()).toISOString()
          });
          hardKillTimeout = setTimeout(() => {
            if (child.exitCode == null) {
              child.kill('SIGKILL');
            }
          }, killAfterMs);
        }, timeoutMs);
      }

      child.stdout.on('data', (chunk) => {
        const text = String(chunk);
        stdout = appendChunk(stdout, text);
        emitEvent(emit, {
          type: 'stdout',
          command,
          args,
          cwd,
          chunk: text,
          at: new Date(clock()).toISOString()
        });
      });

      child.stderr.on('data', (chunk) => {
        const text = String(chunk);
        stderr = appendChunk(stderr, text);
        emitEvent(emit, {
          type: 'stderr',
          command,
          args,
          cwd,
          chunk: text,
          at: new Date(clock()).toISOString()
        });
      });

      child.on('error', (error) => {
        spawnError = error;
        emitEvent(emit, {
          type: 'error',
          command,
          args,
          cwd,
          message: error && error.message ? error.message : String(error),
          at: new Date(clock()).toISOString()
        });
      });

      child.on('close', (exitCode, signal) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        if (hardKillTimeout) {
          clearTimeout(hardKillTimeout);
        }
        const finishedAtMs = clock();
        const finishedAt = new Date(finishedAtMs).toISOString();
        if (spawnError && !stderr) {
          stderr = spawnError.message || String(spawnError);
        }
        const result = {
          command,
          args,
          cwd,
          exitCode: typeof exitCode === 'number' ? exitCode : null,
          signal: signal || null,
          timedOut,
          ok: !timedOut && exitCode === 0 && !spawnError,
          stdout,
          stderr,
          outputTruncated,
          error: spawnError ? (spawnError.message || String(spawnError)) : null,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAtMs - startedAtMs)
        };
        emitEvent(emit, {
          type: 'exit',
          ...result
        });
        resolve(result);
      });

      if (input) {
        child.stdin.write(input);
      }
      child.stdin.end();
    });
  }

  return {
    workspaceDir,
    run
  };
}

module.exports = {
  createWorkspaceRunner,
  resolveWorkspacePath,
  resolveSubPath
};
