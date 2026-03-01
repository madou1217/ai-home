'use strict';

const path = require('node:path');

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
  const maxPayloadBytes = Number(options.maxPayloadBytes) > 0
    ? Number(options.maxPayloadBytes)
    : 2 * 1024 * 1024;

  const patches = [];

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
      truncated: false
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

    return {
      kind: 'patch_return',
      sessionId,
      createdAt,
      truncated,
      summary: {
        patchCount: summary.patchCount,
        files: summary.files,
        totalPatchBytes: summary.totalPatchBytes,
        maxPayloadBytes
      },
      patches: payloadPatches,
      patch: payloadPatch
    };
  }

  function clear() {
    patches.length = 0;
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
    patchCount: patches.length,
    files,
    totalPatchBytes,
    hasCombinedPatch: Boolean(payload.patch)
  };
}

module.exports = {
  createPatchReturnChannel,
  inspectPatchPayload
};
