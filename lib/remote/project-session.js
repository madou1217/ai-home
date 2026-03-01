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

  async function runCommand(request = {}) {
    const context = environmentManager.buildExecutionContext({
      runtimeProfile: request.runtimeProfile,
      env: request.env,
      workspaceDir: runner.workspaceDir
    });

    const result = await runner.run({
      command: request.command,
      args: request.args,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      input: request.input,
      shell: request.shell,
      env: context.env
    });

    return {
      kind: 'command_result',
      sessionId,
      profile: context.profile,
      runtimeFiles: context.runtimeFiles,
      workspaceDir: runner.workspaceDir,
      result
    };
  }

  async function writeProjectFile(request = {}) {
    if (!request.path) {
      throw new Error('path is required');
    }
    const filePath = resolveSubPath(runner.workspaceDir, request.path, pathImpl);
    const content = request.content == null ? '' : String(request.content);
    const encoding = request.encoding || 'utf8';
    await fsImpl.mkdir(pathImpl.dirname(filePath), { recursive: true });
    await fsImpl.writeFile(filePath, content, { encoding });

    return {
      kind: 'write_result',
      sessionId,
      workspaceDir: runner.workspaceDir,
      path: filePath,
      bytes: Buffer.byteLength(content, encoding)
    };
  }

  async function readProjectFile(request = {}) {
    if (!request.path) {
      throw new Error('path is required');
    }
    const filePath = resolveSubPath(runner.workspaceDir, request.path, pathImpl);
    const encoding = request.encoding || 'utf8';
    const content = await fsImpl.readFile(filePath, { encoding });
    return {
      kind: 'read_result',
      sessionId,
      workspaceDir: runner.workspaceDir,
      path: filePath,
      content
    };
  }

  return {
    sessionId,
    workspaceDir: runner.workspaceDir,
    runCommand,
    writeProjectFile,
    readProjectFile
  };
}

module.exports = {
  createProjectSession
};
