'use strict';

const path = require('node:path');
const { spawn } = require('node:child_process');

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

  async function run(request = {}) {
    const command = request.command || request.cmd;
    if (!command || typeof command !== 'string') {
      throw new Error('command is required');
    }

    const args = Array.isArray(request.args) ? request.args.map((item) => String(item)) : [];
    const cwd = resolveSubPath(workspaceDir, request.cwd || '.', pathImpl);
    const env = { ...(request.env || {}) };
    const timeoutMs = Number(request.timeoutMs) > 0 ? Number(request.timeoutMs) : 0;
    const shell = Boolean(request.shell);
    const input = request.input == null ? '' : String(request.input);

    return new Promise((resolve) => {
      const startedAtMs = clock();
      const startedAt = new Date(startedAtMs).toISOString();
      const child = spawnImpl(command, args, {
        cwd,
        env,
        shell
      });

      let timedOut = false;
      let timeout = null;
      let spawnError = null;
      let stdout = '';
      let stderr = '';

      if (timeoutMs > 0) {
        timeout = setTimeout(() => {
          timedOut = true;
          child.kill('SIGTERM');
        }, timeoutMs);
      }

      child.stdout.on('data', (chunk) => {
        stdout += String(chunk);
      });

      child.stderr.on('data', (chunk) => {
        stderr += String(chunk);
      });

      child.on('error', (error) => {
        spawnError = error;
      });

      child.on('close', (exitCode, signal) => {
        if (timeout) {
          clearTimeout(timeout);
        }
        const finishedAtMs = clock();
        const finishedAt = new Date(finishedAtMs).toISOString();
        if (spawnError && !stderr) {
          stderr = spawnError.message || String(spawnError);
        }
        resolve({
          command,
          args,
          cwd,
          exitCode: typeof exitCode === 'number' ? exitCode : null,
          signal: signal || null,
          timedOut,
          ok: !timedOut && exitCode === 0 && !spawnError,
          stdout,
          stderr,
          startedAt,
          finishedAt,
          durationMs: Math.max(0, finishedAtMs - startedAtMs)
        });
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
