'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PROFILE_LOCAL = 'local';
const PROFILE_CONTAINER = 'container';
const PROFILE_SANDBOX = 'sandbox';

const BINDING_STATE_IDLE = 'idle';
const BINDING_STATE_BINDING = 'binding';
const BINDING_STATE_REBINDING = 'rebinding';
const BINDING_STATE_RESTARTING = 'restarting';
const BINDING_STATE_BOUND = 'bound';
const BINDING_STATE_ERROR = 'error';

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
  const runtimeRoot = options.runtimeRoot;

  let activeProfile = defaultProfile;
  let sequence = 0;
  let bindingState = {
    status: BINDING_STATE_IDLE,
    sequence,
    action: 'init',
    targetProfile: activeProfile,
    profile: activeProfile,
    runtimeFiles: []
  };

  function snapshotBindingState() {
    return {
      status: bindingState.status,
      sequence: bindingState.sequence,
      action: bindingState.action,
      targetProfile: bindingState.targetProfile,
      profile: bindingState.profile,
      runtimeFiles: Array.isArray(bindingState.runtimeFiles) ? [...bindingState.runtimeFiles] : [],
      error: bindingState.error || null
    };
  }

  function snapshotState() {
    return {
      activeProfile,
      binding: snapshotBindingState()
    };
  }

  function setTransitionState(status, action, targetProfile) {
    sequence += 1;
    bindingState = {
      status,
      sequence,
      action,
      targetProfile,
      profile: activeProfile,
      runtimeFiles: [],
      error: null
    };
  }

  function finalizeSuccess(action, artifacts) {
    activeProfile = artifacts.profile;
    bindingState = {
      status: BINDING_STATE_BOUND,
      sequence,
      action,
      targetProfile: artifacts.profile,
      profile: artifacts.profile,
      runtimeFiles: artifacts.runtimeFiles,
      error: null
    };
    return {
      profile: artifacts.profile,
      runtimeFiles: artifacts.runtimeFiles,
      runtimeRoot: artifacts.runtimeRoot,
      state: snapshotState()
    };
  }

  function finalizeFailure(error, action, targetProfile) {
    bindingState = {
      status: BINDING_STATE_ERROR,
      sequence,
      action,
      targetProfile,
      profile: activeProfile,
      runtimeFiles: [],
      error: {
        message: error && error.message ? String(error.message) : String(error),
        code: error && error.code ? String(error.code) : null
      }
    };

    const wrapped = new Error(bindingState.error.message);
    wrapped.code = bindingState.error.code || 'RUNTIME_BIND_FAILURE';
    wrapped.cause = error;
    wrapped.state = snapshotState();
    throw wrapped;
  }

  function transition(action, request = {}) {
    const targetProfile = normalizeRuntimeProfile(
      request.runtimeProfile || (action === 'bind' ? defaultProfile : activeProfile)
    );

    if (action === 'bind') {
      setTransitionState(BINDING_STATE_BINDING, action, targetProfile);
    } else if (action === 'rebind') {
      setTransitionState(BINDING_STATE_REBINDING, action, targetProfile);
    } else if (action === 'restart') {
      setTransitionState(BINDING_STATE_RESTARTING, action, targetProfile);
    } else {
      throw new Error(`unsupported transition action: ${action}`);
    }

    try {
      const artifacts = resolveRuntimeArtifacts(targetProfile, { runtimeRoot }, deps);
      return finalizeSuccess(action, artifacts);
    } catch (error) {
      return finalizeFailure(error, action, targetProfile);
    }
  }

  function bind(request = {}) {
    return transition('bind', request);
  }

  function rebind(request = {}) {
    return transition('rebind', request);
  }

  function restart(request = {}) {
    return transition('restart', request);
  }

  function buildExecutionContext(request = {}) {
    const selectedProfile = request.runtimeProfile || activeProfile || defaultProfile;
    const artifacts = resolveRuntimeArtifacts(selectedProfile, { runtimeRoot }, deps);

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
      env,
      state: snapshotState()
    };
  }

  return {
    defaultProfile,
    getActiveProfile: () => activeProfile,
    getBindingSequence: () => sequence,
    getState: snapshotState,
    bind,
    rebind,
    restart,
    buildExecutionContext
  };
}

module.exports = {
  PROFILE_LOCAL,
  PROFILE_CONTAINER,
  PROFILE_SANDBOX,
  BINDING_STATE_IDLE,
  BINDING_STATE_BINDING,
  BINDING_STATE_REBINDING,
  BINDING_STATE_RESTARTING,
  BINDING_STATE_BOUND,
  BINDING_STATE_ERROR,
  normalizeRuntimeProfile,
  resolveRuntimeArtifacts,
  createEnvironmentManager
};
