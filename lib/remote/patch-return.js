'use strict';

const path = require('node:path');
const crypto = require('node:crypto');

const APPLY_STATUS_PENDING = 'pending';
const APPLY_STATUS_APPLIED = 'applied';
const APPLY_STATUS_PARTIAL = 'partial';
const APPLY_STATUS_REJECTED = 'rejected';
const APPLY_STATUS_SKIPPED = 'skipped';
const TRANSMISSION_STATUS_IDLE = 'idle';
const TRANSMISSION_STATUS_SENT = 'sent';
const TRANSMISSION_STATUS_FAILED = 'failed';
const DEFAULT_RETRY_MAX_ATTEMPTS = 1;
const DEFAULT_RETRY_BACKOFF_MS = 0;

function toPosixPath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('path is required');
  }

  const normalized = inputPath.replace(/\\/g, '/').trim();
  if (!normalized) {
    throw new Error('path is required');
  }
  if (normalized.startsWith('/') || normalized.includes('..')) {
    throw new Error(`invalid patch path: ${inputPath}`);
  }

  return normalized;
}

function normalizeContent(content) {
  if (content == null) return '';
  return String(content);
}

function splitLines(text) {
  if (!text) return [];
  const lines = text.split('\n');
  return lines;
}

function normalizeRetryOptions(options = {}) {
  const maxAttempts = Number.isFinite(options.maxAttempts)
    ? Number(options.maxAttempts)
    : DEFAULT_RETRY_MAX_ATTEMPTS;
  const backoffMs = Number.isFinite(options.backoffMs)
    ? Number(options.backoffMs)
    : DEFAULT_RETRY_BACKOFF_MS;
  return {
    maxAttempts: Math.max(1, maxAttempts),
    backoffMs: Math.max(0, backoffMs)
  };
}

function wait(ms) {
  if (!ms || ms <= 0) {
    return Promise.resolve();
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeApplyStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === APPLY_STATUS_APPLIED) return APPLY_STATUS_APPLIED;
  if (normalized === APPLY_STATUS_PARTIAL) return APPLY_STATUS_PARTIAL;
  if (normalized === APPLY_STATUS_REJECTED) return APPLY_STATUS_REJECTED;
  if (normalized === APPLY_STATUS_SKIPPED) return APPLY_STATUS_SKIPPED;
  return APPLY_STATUS_PENDING;
}

function normalizeDiagnosticEntry(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const message = entry.trim();
    if (!message) return null;
    return {
      code: '',
      message,
      stage: '',
      path: '',
      retriable: false,
      hint: ''
    };
  }
  if (typeof entry !== 'object') {
    return null;
  }
  const code = String(entry.code || '').trim();
  const message = String(entry.message || '').trim();
  if (!code && !message) return null;
  return {
    code,
    message: message || code || 'diagnostic',
    stage: String(entry.stage || '').trim(),
    path: String(entry.path || '').trim(),
    retriable: Boolean(entry.retriable),
    hint: String(entry.hint || '').trim()
  };
}

function inferApplyStatusFromDiagnostics(diagnostics) {
  if (!Array.isArray(diagnostics) || diagnostics.length === 0) {
    return APPLY_STATUS_PENDING;
  }
  let sawError = false;
  let sawWarning = false;
  for (const item of diagnostics) {
    const code = String(item.code || '').toUpperCase();
    if (code.includes('ERROR') || code.includes('FAIL') || code.includes('REJECT')) {
      sawError = true;
      continue;
    }
    if (code.includes('WARN') || code.includes('PARTIAL')) {
      sawWarning = true;
    }
  }
  if (sawError && sawWarning) return APPLY_STATUS_PARTIAL;
  if (sawError) return APPLY_STATUS_REJECTED;
  if (sawWarning) return APPLY_STATUS_PARTIAL;
  return APPLY_STATUS_APPLIED;
}

function createReplacePatch(filePath, beforeText, afterText) {
  const beforeLines = splitLines(beforeText);
  const afterLines = splitLines(afterText);
  const lines = [];

  lines.push(`diff --git a/${filePath} b/${filePath}`);
  lines.push(`--- a/${filePath}`);
  lines.push(`+++ b/${filePath}`);
  lines.push(`@@ -1,${beforeLines.length} +1,${afterLines.length} @@`);

  for (const line of beforeLines) {
    lines.push(`-${line}`);
  }
  for (const line of afterLines) {
    lines.push(`+${line}`);
  }

  return lines.join('\n');
}

function createPatchReturnChannel(options = {}) {
  const sessionId = options.sessionId || null;
  const nowImpl = options.now || Date.now;
  const pathImpl = options.path || path;
  const waitImpl = options.wait || wait;
  const retryOptions = normalizeRetryOptions(options.retry);
  const maxPayloadBytes = Number(options.maxPayloadBytes) > 0
    ? Number(options.maxPayloadBytes)
    : 2 * 1024 * 1024;
  const transmitImpl = typeof options.transmit === 'function' ? options.transmit : null;

  const patches = [];
  let payloadSequence = 0;
  const transmission = {
    status: TRANSMISSION_STATUS_IDLE,
    attempts: 0,
    maxAttempts: retryOptions.maxAttempts,
    sentAt: null,
    lastError: '',
    diagnostics: []
  };
  const apply = {
    status: APPLY_STATUS_PENDING,
    appliedAt: null,
    filesApplied: 0,
    filesRejected: 0,
    diagnostics: []
  };
  const idempotency = {
    cache: new Map(),
    lastKey: '',
    duplicateHits: 0
  };

  function buildDedupKey(payload, explicitKey) {
    const rawKey = String(explicitKey || '').trim();
    if (rawKey) return rawKey;
    const hashSource = JSON.stringify({
      sessionId: payload.sessionId || '',
      patchCount: payload.summary && payload.summary.patchCount || 0,
      totalPatchBytes: payload.summary && payload.summary.totalPatchBytes || 0,
      patch: payload.patch || '',
      patches: Array.isArray(payload.patches)
        ? payload.patches.map((item) => ({
          path: item.path || '',
          patchBytes: Number(item.patchBytes) || 0
        }))
        : []
    });
    return `payload:${crypto.createHash('sha256').update(hashSource).digest('hex')}`;
  }

  function addFilePatch(request = {}) {
    const filePath = toPosixPath(request.path);
    const beforeText = normalizeContent(request.before);
    const afterText = normalizeContent(request.after);
    const patchText = createReplacePatch(filePath, beforeText, afterText);

    const record = {
      path: filePath,
      mode: request.mode || 'update',
      encoding: request.encoding || 'utf8',
      bytesBefore: Buffer.byteLength(beforeText, 'utf8'),
      bytesAfter: Buffer.byteLength(afterText, 'utf8'),
      patch: patchText,
      patchBytes: Buffer.byteLength(patchText, 'utf8')
    };

    patches.push(record);
    return record;
  }

  function addRawPatch(request = {}) {
    const filePath = toPosixPath(request.path);
    const patchText = normalizeContent(request.patch);
    if (!patchText.trim()) {
      throw new Error('patch is required');
    }

    const record = {
      path: filePath,
      mode: request.mode || 'update',
      encoding: request.encoding || 'utf8',
      bytesBefore: Number(request.bytesBefore) >= 0 ? Number(request.bytesBefore) : null,
      bytesAfter: Number(request.bytesAfter) >= 0 ? Number(request.bytesAfter) : null,
      patch: patchText,
      patchBytes: Buffer.byteLength(patchText, 'utf8')
    };

    patches.push(record);
    return record;
  }

  function inspect() {
    const summary = {
      sessionId,
      patchCount: patches.length,
      files: patches.map((item) => item.path),
      totalPatchBytes: 0,
      maxPayloadBytes,
      truncated: false,
      transmission: {
        status: transmission.status,
        attempts: transmission.attempts,
        maxAttempts: transmission.maxAttempts,
        sentAt: transmission.sentAt,
        lastError: transmission.lastError,
        diagnostics: transmission.diagnostics.slice()
      },
      idempotency: {
        cacheSize: idempotency.cache.size,
        lastKey: idempotency.lastKey,
        duplicateHits: idempotency.duplicateHits
      },
      apply: {
        status: apply.status,
        appliedAt: apply.appliedAt,
        filesApplied: apply.filesApplied,
        filesRejected: apply.filesRejected,
        diagnostics: apply.diagnostics.slice()
      }
    };

    for (const item of patches) {
      summary.totalPatchBytes += item.patchBytes;
    }

    return summary;
  }

  function buildPayload() {
    const createdAt = new Date(nowImpl()).toISOString();
    const summary = inspect();
    const combinedPatch = patches.map((item) => item.patch).join('\n\n');

    let payloadPatch = combinedPatch;
    let payloadPatches = patches.slice();
    let truncated = false;

    if (summary.totalPatchBytes > maxPayloadBytes) {
      truncated = true;
      payloadPatch = '';
      payloadPatches = [];
    }

    payloadSequence += 1;
    const diagnostics = [];
    if (truncated) {
      diagnostics.push({
        code: 'PATCH_TRUNCATED',
        message: 'patch payload exceeds maxPayloadBytes and has been truncated'
      });
    }

    return {
      kind: 'patch_return',
      sessionId,
      sequence: payloadSequence,
      createdAt,
      truncated,
      summary: {
        patchCount: summary.patchCount,
        files: summary.files,
        totalPatchBytes: summary.totalPatchBytes,
        maxPayloadBytes
      },
      transmission: {
        status: transmission.status,
        attempts: transmission.attempts,
        maxAttempts: transmission.maxAttempts,
        sentAt: transmission.sentAt,
        lastError: transmission.lastError,
        diagnostics: transmission.diagnostics.slice()
      },
      apply: {
        status: apply.status,
        appliedAt: apply.appliedAt,
        filesApplied: apply.filesApplied,
        filesRejected: apply.filesRejected,
        diagnostics: diagnostics.concat(apply.diagnostics)
      },
      patches: payloadPatches,
      patch: payloadPatch
    };
  }

  function resetTransmissionState() {
    transmission.status = TRANSMISSION_STATUS_IDLE;
    transmission.attempts = 0;
    transmission.sentAt = null;
    transmission.lastError = '';
    transmission.diagnostics = [];
  }

  function recordApplyResult(result = {}) {
    const providedDiagnostics = Array.isArray(result.diagnostics) ? result.diagnostics : [];
    const diagnostics = providedDiagnostics
      .map(normalizeDiagnosticEntry)
      .filter(Boolean);
    const filesApplied = Number.isFinite(result.filesApplied)
      ? Math.max(0, Number(result.filesApplied))
      : patches.length;
    const filesRejected = Number.isFinite(result.filesRejected)
      ? Math.max(0, Number(result.filesRejected))
      : 0;
    let status = normalizeApplyStatus(result.status);
    if (status === APPLY_STATUS_PENDING) {
      status = inferApplyStatusFromDiagnostics(diagnostics);
    }
    if (status === APPLY_STATUS_PENDING && filesRejected === 0 && filesApplied > 0) {
      status = APPLY_STATUS_APPLIED;
    } else if (status === APPLY_STATUS_PENDING && filesRejected > 0 && filesApplied > 0) {
      status = APPLY_STATUS_PARTIAL;
    } else if (status === APPLY_STATUS_PENDING && filesRejected > 0 && filesApplied === 0) {
      status = APPLY_STATUS_REJECTED;
    }

    apply.status = status;
    apply.appliedAt = new Date(nowImpl()).toISOString();
    apply.filesApplied = filesApplied;
    apply.filesRejected = filesRejected;
    apply.diagnostics = diagnostics;

    return {
      status: apply.status,
      appliedAt: apply.appliedAt,
      filesApplied: apply.filesApplied,
      filesRejected: apply.filesRejected,
      diagnostics: apply.diagnostics.slice()
    };
  }

  async function transmit(request = {}) {
    const sender = typeof request.transmit === 'function' ? request.transmit : transmitImpl;
    if (typeof sender !== 'function') {
      throw new Error('transmit function is required');
    }
    const retry = normalizeRetryOptions(request.retry || retryOptions);
    transmission.maxAttempts = retry.maxAttempts;
    transmission.attempts = 0;
    transmission.status = TRANSMISSION_STATUS_IDLE;
    transmission.sentAt = null;
    transmission.lastError = '';
    transmission.diagnostics = [];

    const payload = buildPayload();
    const dedupKey = buildDedupKey(payload, request.idempotencyKey);
    idempotency.lastKey = dedupKey;
    const cached = idempotency.cache.get(dedupKey);
    if (cached && cached.ok) {
      idempotency.duplicateHits += 1;
      transmission.status = TRANSMISSION_STATUS_SENT;
      transmission.attempts = cached.attempt;
      transmission.sentAt = cached.sentAt;
      transmission.lastError = '';
      transmission.diagnostics = [{
        code: 'DUPLICATE_TRANSMIT_SUPPRESSED',
        message: 'duplicate patch-return transmit suppressed by idempotency key',
        stage: 'transmit',
        path: '',
        retriable: false,
        hint: 'use a unique idempotency key for different payloads'
      }];
      return {
        ok: true,
        attempt: cached.attempt,
        payload: cached.payload,
        duplicate: true,
        idempotencyKey: dedupKey
      };
    }
    for (let attempt = 1; attempt <= retry.maxAttempts; attempt += 1) {
      transmission.attempts = attempt;
      try {
        const sendResult = await sender({
          attempt,
          sessionId,
          payload
        });
        transmission.status = TRANSMISSION_STATUS_SENT;
        transmission.sentAt = new Date(nowImpl()).toISOString();
        transmission.lastError = '';
        if (sendResult && typeof sendResult === 'object' && sendResult.apply) {
          recordApplyResult(sendResult.apply);
        }
        idempotency.cache.set(dedupKey, {
          ok: true,
          attempt,
          sentAt: transmission.sentAt,
          payload
        });
        return {
          ok: true,
          attempt,
          payload,
          duplicate: false,
          idempotencyKey: dedupKey
        };
      } catch (err) {
        const message = String((err && err.message) || err || 'transmit failed');
        transmission.lastError = message;
        transmission.diagnostics = [{
          code: 'TRANSMIT_FAILED',
          message,
          stage: 'transmit',
          path: '',
          retriable: attempt < retry.maxAttempts,
          hint: attempt < retry.maxAttempts ? 'retry with backoff' : 'inspect transport connectivity and session health'
        }];
        if (attempt >= retry.maxAttempts) {
          transmission.status = TRANSMISSION_STATUS_FAILED;
          return {
            ok: false,
            attempt,
            error: message,
            payload,
            duplicate: false,
            idempotencyKey: dedupKey
          };
        }
        if (retry.backoffMs > 0) {
          await waitImpl(retry.backoffMs);
        }
      }
    }
    transmission.status = TRANSMISSION_STATUS_FAILED;
    return {
      ok: false,
      attempt: retry.maxAttempts,
      error: transmission.lastError || 'transmit failed',
      payload,
      duplicate: false,
      idempotencyKey: dedupKey
    };
  }

  function clear() {
    patches.length = 0;
    payloadSequence = 0;
    resetTransmissionState();
    apply.status = APPLY_STATUS_PENDING;
    apply.appliedAt = null;
    apply.filesApplied = 0;
    apply.filesRejected = 0;
    apply.diagnostics = [];
    idempotency.cache.clear();
    idempotency.lastKey = '';
    idempotency.duplicateHits = 0;
  }

  function resolveProjectPath(baseDir, targetPath) {
    const safePath = toPosixPath(targetPath);
    const candidate = pathImpl.resolve(baseDir, safePath);
    const relative = pathImpl.relative(baseDir, candidate);
    if (relative === '..' || relative.startsWith(`..${pathImpl.sep}`) || pathImpl.isAbsolute(relative)) {
      throw new Error(`path escapes workspace: ${targetPath}`);
    }
    return candidate;
  }

  return {
    addFilePatch,
    addRawPatch,
    inspect,
    buildPayload,
    transmit,
    recordApplyResult,
    clear,
    resolveProjectPath
  };
}

function inspectPatchPayload(payload = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('payload must be an object');
  }

  const patches = Array.isArray(payload.patches) ? payload.patches : [];
  const files = patches.map((item) => item.path).filter(Boolean);
  const totalPatchBytes = patches.reduce((sum, item) => {
    const patchBytes = Number(item && item.patchBytes);
    if (Number.isFinite(patchBytes) && patchBytes >= 0) {
      return sum + patchBytes;
    }
    return sum + Buffer.byteLength(String((item && item.patch) || ''), 'utf8');
  }, 0);

  return {
    kind: payload.kind || null,
    sessionId: payload.sessionId || null,
    truncated: Boolean(payload.truncated),
    sequence: Number.isFinite(payload.sequence) ? Number(payload.sequence) : null,
    patchCount: patches.length,
    files,
    totalPatchBytes,
    hasCombinedPatch: Boolean(payload.patch),
    transmission: {
      status: String(payload.transmission && payload.transmission.status || TRANSMISSION_STATUS_IDLE),
      attempts: Number.isFinite(payload.transmission && payload.transmission.attempts)
        ? Number(payload.transmission.attempts)
        : 0,
      maxAttempts: Number.isFinite(payload.transmission && payload.transmission.maxAttempts)
        ? Number(payload.transmission.maxAttempts)
        : DEFAULT_RETRY_MAX_ATTEMPTS,
      sentAt: payload.transmission && payload.transmission.sentAt
        ? String(payload.transmission.sentAt)
        : null,
      lastError: payload.transmission && payload.transmission.lastError
        ? String(payload.transmission.lastError)
        : ''
    },
    apply: {
      status: normalizeApplyStatus(payload.apply && payload.apply.status),
      appliedAt: payload.apply && payload.apply.appliedAt ? String(payload.apply.appliedAt) : null,
      filesApplied: Number.isFinite(payload.apply && payload.apply.filesApplied)
        ? Number(payload.apply.filesApplied)
        : 0,
      filesRejected: Number.isFinite(payload.apply && payload.apply.filesRejected)
        ? Number(payload.apply.filesRejected)
        : 0,
      diagnostics: Array.isArray(payload.apply && payload.apply.diagnostics)
        ? payload.apply.diagnostics.map(normalizeDiagnosticEntry).filter(Boolean)
        : []
    }
  };
}

module.exports = {
  createPatchReturnChannel,
  inspectPatchPayload
};
