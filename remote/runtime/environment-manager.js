'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROFILE_LOCAL = 'local';
const PROFILE_CONTAINER = 'container';
const PROFILE_SANDBOX = 'sandbox';

const RUNTIME_FILES = {
  [PROFILE_LOCAL]: [],
  [PROFILE_CONTAINER]: ['container-template.Dockerfile'],
  [PROFILE_SANDBOX]: ['sandbox-profile.nsjail.cfg']
};

function normalizeRuntimeProfile(profile) {
  if (!profile) {
    return PROFILE_LOCAL;
  }
  const normalized = String(profile).trim().toLowerCase();
  if (normalized === PROFILE_LOCAL || normalized === PROFILE_CONTAINER || normalized === PROFILE_SANDBOX) {
    return normalized;
  }
  throw new Error(`unsupported runtime profile: ${profile}`);
}

function resolveRuntimeArtifacts(profile, options = {}, deps = {}) {
  const pathImpl = deps.path || path;
  const fsImpl = deps.fs || fs;
  const runtimeRoot = options.runtimeRoot || __dirname;
  const selected = normalizeRuntimeProfile(profile);
  const required = RUNTIME_FILES[selected] || [];
  const files = required.map((name) => pathImpl.resolve(runtimeRoot, name));

  for (const filePath of files) {
    if (!fsImpl.existsSync(filePath)) {
      throw new Error(`runtime artifact not found: ${filePath}`);
    }
  }

  return {
    profile: selected,
    runtimeRoot: pathImpl.resolve(runtimeRoot),
    runtimeFiles: files
  };
}

function createEnvironmentManager(options = {}, deps = {}) {
  const defaultProfile = normalizeRuntimeProfile(options.defaultProfile || PROFILE_LOCAL);
  const baseEnv = { ...(options.baseEnv || {}) };

  function buildExecutionContext(request = {}) {
    const artifacts = resolveRuntimeArtifacts(
      request.runtimeProfile || defaultProfile,
      { runtimeRoot: options.runtimeRoot },
      deps
    );

    const env = {
      ...(request.includeProcessEnv === false ? {} : process.env),
      ...baseEnv,
      ...(request.env || {}),
      AIH_RUNTIME_PROFILE: artifacts.profile
    };

    if (request.workspaceDir) {
      env.AIH_WORKSPACE_DIR = String(request.workspaceDir);
    }

    return {
      profile: artifacts.profile,
      runtimeFiles: artifacts.runtimeFiles,
      runtimeRoot: artifacts.runtimeRoot,
      env
    };
  }

  return {
    defaultProfile,
    buildExecutionContext
  };
}

module.exports = {
  PROFILE_LOCAL,
  PROFILE_CONTAINER,
  PROFILE_SANDBOX,
  normalizeRuntimeProfile,
  resolveRuntimeArtifacts,
  createEnvironmentManager
};
