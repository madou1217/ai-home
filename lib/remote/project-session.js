'use strict';

const fs = require('node:fs/promises');
const path = require('node:path');
const { createWorkspaceRunner, resolveSubPath } = require('../../remote/agent/workspace-runner');
const { createEnvironmentManager } = require('../../remote/runtime/environment-manager');

function createSessionId() {
  return `sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function createProjectSession(options = {}, deps = {}) {
  const fsImpl = deps.fs || fs;
  const pathImpl = deps.path || path;
  const idFactory = deps.createId || createSessionId;

  if (!options.workspaceRoot) {
    throw new Error('workspaceRoot is required');
  }

  const runner = createWorkspaceRunner(
    {
      workspaceRoot: options.workspaceRoot,
      projectDir: options.projectDir || '.'
    },
    deps
  );

  const environmentManager = createEnvironmentManager({
    defaultProfile: options.runtimeProfile || 'local',
    runtimeRoot: options.runtimeRoot
  }, deps);

  const sessionId = idFactory();
  const retryDefaults = normalizeRetryOptions(options.retry);
  const context = {
    controlSessionId: normalizeOptionalToken(options.controlSessionId),
    remoteSessionId: normalizeOptionalToken(options.remoteSessionId),
    projectSessionId: normalizeOptionalToken(options.projectSessionId) || sessionId,
    connectionId: normalizeOptionalToken(options.connectionId),
    workspaceDir: runner.workspaceDir,
    runtimeProfile: options.runtimeProfile || 'local',
    runtimeFiles: {},
    sequence: Number.isFinite(options.sequence) ? Number(options.sequence) : 0,
    lastOperationAt: normalizeOptionalToken(options.lastOperationAt),
    lastError: ''
  };

  function buildContextSnapshot() {
    return {
      sessionId,
      projectSessionId: context.projectSessionId,
      controlSessionId: context.controlSessionId,
      remoteSessionId: context.remoteSessionId,
      connectionId: context.connectionId,
      workspaceDir: context.workspaceDir,
      runtimeProfile: context.runtimeProfile,
      runtimeFiles: { ...context.runtimeFiles },
      sequence: context.sequence,
      lastOperationAt: context.lastOperationAt,
      lastError: context.lastError
    };
  }

  function bumpSequence() {
    context.sequence += 1;
    context.lastOperationAt = new Date().toISOString();
    return context.sequence;
  }

  function bindRemoteSession(request = {}) {
    context.controlSessionId = normalizeOptionalToken(request.controlSessionId) || context.controlSessionId;
    context.remoteSessionId = normalizeOptionalToken(request.remoteSessionId) || context.remoteSessionId;
    context.projectSessionId = normalizeOptionalToken(request.projectSessionId) || context.projectSessionId;
    context.connectionId = normalizeOptionalToken(request.connectionId) || context.connectionId;
    return {
      kind: 'bind_result',
      sessionId,
      sequence: bumpSequence(),
      context: buildContextSnapshot()
    };
  }

  async function executeWithRetry(request, action) {
    const retry = normalizeRetryOptions(request && request.retry, retryDefaults);
    let attempt = 0;
    let lastError = null;
    while (attempt < retry.maxAttempts) {
      attempt += 1;
      try {
        const data = await action(attempt);
        context.lastError = '';
        return { attempt, data };
      } catch (err) {
        lastError = err;
        context.lastError = String((err && err.message) || err || 'unknown error');
        if (attempt >= retry.maxAttempts || !isRetryableError(err, request)) {
          throw err;
        }
        if (retry.backoffMs > 0) {
          await wait(retry.backoffMs);
        }
      }
    }
    throw lastError || new Error('operation failed');
  }

  async function runCommand(request = {}) {
    const executionContext = environmentManager.buildExecutionContext({
      runtimeProfile: request.runtimeProfile,
      env: request.env,
      workspaceDir: runner.workspaceDir
    });

    const executed = await executeWithRetry(request, async () => runner.run({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      input: request.input,
      shell: request.shell,
      env: executionContext.env
    }));
    const sequence = bumpSequence();
    context.runtimeProfile = executionContext.profile;
    context.runtimeFiles = executionContext.runtimeFiles;

    return {
      kind: 'command_result',
      sessionId,
      sequence,
      profile: executionContext.profile,
      runtimeFiles: executionContext.runtimeFiles,
      workspaceDir: runner.workspaceDir,
      attempt: executed.attempt,
      result: executed.data,
      context: buildContextSnapshot()
    };
  }

  async function writeProjectFile(request = {}) {
    if (!request.path) {
      throw new Error('path is required');
    }
    const filePath = resolveSubPath(runner.workspaceDir, request.path, pathImpl);
    const content = request.content == null ? '' : String(request.content);
    const encoding = request.encoding || 'utf8';
    const executed = await executeWithRetry(request, async () => {
      await fsImpl.mkdir(pathImpl.dirname(filePath), { recursive: true });
      await fsImpl.writeFile(filePath, content, { encoding });
      return { bytes: Buffer.byteLength(content, encoding) };
    });
    const sequence = bumpSequence();

    return {
      kind: 'write_result',
      sessionId,
      sequence,
      workspaceDir: runner.workspaceDir,
      path: filePath,
      bytes: executed.data.bytes,
      attempt: executed.attempt,
      context: buildContextSnapshot()
    };
  }

  async function readProjectFile(request = {}) {
    if (!request.path) {
      throw new Error('path is required');
    }
    const filePath = resolveSubPath(runner.workspaceDir, request.path, pathImpl);
    const encoding = request.encoding || 'utf8';
    const executed = await executeWithRetry(request, async () => {
      const content = await fsImpl.readFile(filePath, { encoding });
      return {
        content,
        bytes: Buffer.byteLength(content, encoding)
      };
    });
    const sequence = bumpSequence();
    return {
      kind: 'read_result',
      sessionId,
      sequence,
      workspaceDir: runner.workspaceDir,
      path: filePath,
      content: executed.data.content,
      bytes: executed.data.bytes,
      attempt: executed.attempt,
      context: buildContextSnapshot()
    };
  }

  async function handleOperation(request = {}) {
    const op = String(request.op || '').toLowerCase();
    if (!op || op === 'run' || op === 'run_command' || op === 'command') {
      return runCommand(request);
    }
    if (op === 'write' || op === 'write_file') {
      return writeProjectFile(request);
    }
    if (op === 'read' || op === 'read_file') {
      return readProjectFile(request);
    }
    if (op === 'bind' || op === 'bind_session') {
      return bindRemoteSession(request);
    }
    if (op === 'snapshot' || op === 'get_context') {
      return {
        kind: 'snapshot_result',
        sessionId,
        sequence: context.sequence,
        context: buildContextSnapshot()
      };
    }
    throw new Error(`unsupported operation: ${request.op || '<empty>'}`);
  }

  return {
    sessionId,
    workspaceDir: runner.workspaceDir,
    handleOperation,
    bindRemoteSession,
    getContextSnapshot: buildContextSnapshot,
    runCommand,
    writeProjectFile,
    readProjectFile
  };
}

function normalizeOptionalToken(value) {
  const normalized = String(value == null ? '' : value).trim();
  return normalized || '';
}

function normalizeRetryOptions(overrides, base) {
  const src = (overrides && typeof overrides === 'object') ? overrides : {};
  const fallback = (base && typeof base === 'object') ? base : {};
  const maxAttempts = Number.isFinite(src.maxAttempts)
    ? Number(src.maxAttempts)
    : (Number.isFinite(fallback.maxAttempts) ? Number(fallback.maxAttempts) : 1);
  const backoffMs = Number.isFinite(src.backoffMs)
    ? Number(src.backoffMs)
    : (Number.isFinite(fallback.backoffMs) ? Number(fallback.backoffMs) : 0);
  return {
    maxAttempts: Math.max(1, maxAttempts),
    backoffMs: Math.max(0, backoffMs)
  };
}

function isRetryableError(err, request) {
  if (request && request.retry && request.retry.force === false) {
    return false;
  }
  if (!err) return false;
  const code = String(err.code || '').toUpperCase();
  if (['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'EAI_AGAIN', 'ENETUNREACH'].includes(code)) {
    return true;
  }
  const message = String(err.message || '').toLowerCase();
  if (!message) return false;
  return message.includes('timeout')
    || message.includes('temporarily unavailable')
    || message.includes('not ready')
    || message.includes('connection reset');
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

module.exports = {
  createProjectSession
};
