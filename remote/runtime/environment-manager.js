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
const BINDING_STATE_RECOVERY = 'recovery';
const BINDING_STATE_BOUND = 'bound';
const BINDING_STATE_ERROR = 'error';

const DIAGNOSTIC_OK = 'RUNTIME_OK';
const DIAGNOSTIC_PROFILE_UNSUPPORTED = 'RUNTIME_PROFILE_UNSUPPORTED';
const DIAGNOSTIC_ARTIFACT_MISSING = 'RUNTIME_ARTIFACT_MISSING';
const DIAGNOSTIC_RUNTIME_ROOT_INVALID = 'RUNTIME_RUNTIME_ROOT_INVALID';
const DIAGNOSTIC_TRANSITION_UNSUPPORTED = 'RUNTIME_TRANSITION_UNSUPPORTED';
const DIAGNOSTIC_BIND_FAILURE = 'RUNTIME_BIND_FAILURE';

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
  const error = new Error(`unsupported runtime profile: ${profile}`);
  error.code = DIAGNOSTIC_PROFILE_UNSUPPORTED;
  throw error;
}

function normalizeRuntimeRequest(request) {
  if (!request || typeof request !== 'object') {
    return {};
  }
  return request;
}

function resolveRuntimeRoot(runtimeRoot, pathImpl) {
  const candidate = runtimeRoot == null ? __dirname : runtimeRoot;
  const normalized = String(candidate).trim();
  if (!normalized) {
    const error = new Error('runtimeRoot must be a non-empty path');
    error.code = DIAGNOSTIC_RUNTIME_ROOT_INVALID;
    throw error;
  }
  return pathImpl.resolve(normalized);
}

function classifyRuntimeError(error) {
  if (error && error.code) {
    return String(error.code);
  }
  const message = String(error && error.message ? error.message : '').toLowerCase();
  if (message.includes('artifact not found')) {
    return DIAGNOSTIC_ARTIFACT_MISSING;
  }
  if (message.includes('unsupported runtime profile')) {
    return DIAGNOSTIC_PROFILE_UNSUPPORTED;
  }
  if (message.includes('runtimeRoot')) {
    return DIAGNOSTIC_RUNTIME_ROOT_INVALID;
  }
  if (message.includes('unsupported transition action')) {
    return DIAGNOSTIC_TRANSITION_UNSUPPORTED;
  }
  return DIAGNOSTIC_BIND_FAILURE;
}

function resolveRuntimeArtifacts(profile, options = {}, deps = {}) {
  const pathImpl = deps.path || path;
  const fsImpl = deps.fs || fs;
  const runtimeRoot = resolveRuntimeRoot(options.runtimeRoot, pathImpl);
  const selected = normalizeRuntimeProfile(profile);
  const required = RUNTIME_FILES[selected] || [];
  const files = required.map((name) => pathImpl.resolve(runtimeRoot, name));

  for (const filePath of files) {
    if (!fsImpl.existsSync(filePath)) {
      const error = new Error(`runtime artifact not found: ${filePath}`);
      error.code = DIAGNOSTIC_ARTIFACT_MISSING;
      throw error;
    }
  }

  return {
    profile: selected,
    runtimeRoot,
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
    runtimeFiles: [],
    diagnostic: {
      code: DIAGNOSTIC_OK,
      recoverable: true,
      timestamp: new Date(0).toISOString()
    }
  };

  function snapshotBindingState() {
    return {
      status: bindingState.status,
      sequence: bindingState.sequence,
      action: bindingState.action,
      targetProfile: bindingState.targetProfile,
      profile: bindingState.profile,
      runtimeFiles: Array.isArray(bindingState.runtimeFiles) ? [...bindingState.runtimeFiles] : [],
      diagnostic: bindingState.diagnostic ? { ...bindingState.diagnostic } : null,
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
      diagnostic: {
        code: DIAGNOSTIC_OK,
        recoverable: true,
        timestamp: new Date().toISOString()
      },
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
      diagnostic: {
        code: DIAGNOSTIC_OK,
        recoverable: true,
        timestamp: new Date().toISOString()
      },
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
      diagnostic: {
        code: classifyRuntimeError(error),
        recoverable: true,
        timestamp: new Date().toISOString()
      },
      error: {
        message: error && error.message ? String(error.message) : String(error),
        code: classifyRuntimeError(error)
      }
    };

    const wrapped = new Error(bindingState.error.message);
    wrapped.code = bindingState.error.code || DIAGNOSTIC_BIND_FAILURE;
    wrapped.cause = error;
    wrapped.state = snapshotState();
    throw wrapped;
  }

  function transition(action, request = {}) {
    const normalizedRequest = normalizeRuntimeRequest(request);
    const targetProfile = normalizeRuntimeProfile(
      normalizedRequest.runtimeProfile || (action === 'bind' ? defaultProfile : activeProfile || defaultProfile)
    );

    if (action === 'bind') {
      setTransitionState(BINDING_STATE_BINDING, action, targetProfile);
    } else if (action === 'rebind') {
      setTransitionState(BINDING_STATE_REBINDING, action, targetProfile);
    } else if (action === 'restart') {
      setTransitionState(BINDING_STATE_RESTARTING, action, targetProfile);
    } else if (action === 'recover') {
      setTransitionState(BINDING_STATE_RECOVERY, action, targetProfile);
    } else {
      const error = new Error(`unsupported transition action: ${action}`);
      error.code = DIAGNOSTIC_TRANSITION_UNSUPPORTED;
      throw error;
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

  function recover(request = {}) {
    const normalizedRequest = normalizeRuntimeRequest(request);
    if (bindingState.status !== BINDING_STATE_ERROR && normalizedRequest.force !== true) {
      return {
        profile: activeProfile,
        runtimeFiles: Array.isArray(bindingState.runtimeFiles) ? [...bindingState.runtimeFiles] : [],
        runtimeRoot: resolveRuntimeRoot(runtimeRoot, path),
        state: snapshotState()
      };
    }
    return transition('recover', normalizedRequest);
  }

  function buildExecutionContext(request = {}) {
    const normalizedRequest = normalizeRuntimeRequest(request);
    const selectedProfile = normalizeRuntimeProfile(
      normalizedRequest.runtimeProfile || activeProfile || defaultProfile
    );
    let context = null;

    if (bindingState.status === BINDING_STATE_ERROR) {
      context = recover({ runtimeProfile: selectedProfile });
    } else if (bindingState.status === BINDING_STATE_IDLE) {
      context = bind({ runtimeProfile: selectedProfile });
    } else if (selectedProfile !== activeProfile) {
      context = rebind({ runtimeProfile: selectedProfile });
    } else {
      const stable = resolveRuntimeArtifacts(activeProfile, { runtimeRoot }, deps);
      context = {
        profile: stable.profile,
        runtimeFiles: stable.runtimeFiles,
        runtimeRoot: stable.runtimeRoot,
        state: snapshotState()
      };
    }

    const env = {
      ...(normalizedRequest.includeProcessEnv === false ? {} : process.env),
      ...baseEnv,
      ...(normalizedRequest.env || {}),
      AIH_RUNTIME_PROFILE: context.profile,
      AIH_RUNTIME_BINDING_SEQUENCE: String(bindingState.sequence),
      AIH_RUNTIME_BINDING_STATE: bindingState.status,
      AIH_RUNTIME_BINDING_ACTION: String(bindingState.action || ''),
      AIH_RUNTIME_BINDING_TARGET_PROFILE: String(bindingState.targetProfile || ''),
      AIH_RUNTIME_DIAGNOSTIC_CODE: String(
        (bindingState.diagnostic && bindingState.diagnostic.code) || DIAGNOSTIC_OK
      )
    };

    if (normalizedRequest.workspaceDir) {
      env.AIH_WORKSPACE_DIR = String(normalizedRequest.workspaceDir);
    }

    return {
      profile: context.profile,
      runtimeFiles: context.runtimeFiles,
      runtimeRoot: context.runtimeRoot,
      env,
      state: snapshotState()
    };
  }

  function checkHealth(request = {}) {
    const normalizedRequest = normalizeRuntimeRequest(request);
    const selectedProfile = normalizeRuntimeProfile(
      normalizedRequest.runtimeProfile || activeProfile || defaultProfile
    );
    try {
      const artifacts = resolveRuntimeArtifacts(selectedProfile, { runtimeRoot }, deps);
      return {
        ok: true,
        status: BINDING_STATE_BOUND,
        profile: selectedProfile,
        runtimeRoot: artifacts.runtimeRoot,
        runtimeFiles: artifacts.runtimeFiles,
        issues: [],
        diagnostic: {
          code: DIAGNOSTIC_OK,
          recoverable: true
        }
      };
    } catch (error) {
      return {
        ok: false,
        status: bindingState.status,
        profile: selectedProfile,
        runtimeRoot: resolveRuntimeRoot(runtimeRoot, path),
        runtimeFiles: [],
        issues: [{
          code: classifyRuntimeError(error),
          message: String(error && error.message ? error.message : error)
        }],
        diagnostic: {
          code: classifyRuntimeError(error),
          recoverable: true
        }
      };
    }
  }

  return {
    defaultProfile,
    getActiveProfile: () => activeProfile,
    getBindingSequence: () => sequence,
    getState: snapshotState,
    bind,
    rebind,
    restart,
    recover,
    checkHealth,
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
  BINDING_STATE_RECOVERY,
  BINDING_STATE_BOUND,
  BINDING_STATE_ERROR,
  DIAGNOSTIC_OK,
  DIAGNOSTIC_PROFILE_UNSUPPORTED,
  DIAGNOSTIC_ARTIFACT_MISSING,
  DIAGNOSTIC_RUNTIME_ROOT_INVALID,
  DIAGNOSTIC_TRANSITION_UNSUPPORTED,
  DIAGNOSTIC_BIND_FAILURE,
  normalizeRuntimeProfile,
  resolveRuntimeArtifacts,
  createEnvironmentManager
};
