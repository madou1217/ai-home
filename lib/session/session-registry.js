const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_REGISTRY_FILE = path.join(os.homedir(), '.ai_home', 'codex_task_sessions.json');

function sanitizeTaskKey(value) {
  const key = String(value || '').trim();
  return /^[a-z0-9][a-z0-9._:-]*$/i.test(key) ? key : '';
}

function normalizePlanPath(planPathRaw, cwd = process.cwd()) {
  const value = String(planPathRaw || '').trim();
  if (!value) return '';
  const abs = path.resolve(cwd, value);
  return abs.endsWith('.plan.md') ? abs : '';
}

function normalizeRegistry(raw) {
  if (!raw || typeof raw !== 'object') {
    return { tasks: {}, plans: {}, sessions: [] };
  }

  const tasks = raw.tasks && typeof raw.tasks === 'object' ? { ...raw.tasks } : {};
  const plans = raw.plans && typeof raw.plans === 'object' ? { ...raw.plans } : {};
  const sessions = Array.isArray(raw.sessions) ? raw.sessions.filter(Boolean) : [];
  return { tasks, plans, sessions };
}

function readRegistry(filePath = DEFAULT_REGISTRY_FILE) {
  if (!fs.existsSync(filePath)) return { tasks: {}, plans: {}, sessions: [] };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (parsed && (parsed.tasks || parsed.plans || parsed.sessions)) {
      return normalizeRegistry(parsed);
    }
    const tasks = {};
    Object.entries(parsed || {}).forEach(([taskKey, entry]) => {
      if (!entry || typeof entry !== 'object' || !entry.sessionId) return;
      const safeTaskKey = sanitizeTaskKey(taskKey);
      if (!safeTaskKey) return;
      tasks[safeTaskKey] = { ...entry, taskKey: safeTaskKey };
    });
    return { tasks, plans: {}, sessions: [] };
  } catch (_error) {
    return { tasks: {}, plans: {}, sessions: [] };
  }
}

function writeRegistry(data, filePath = DEFAULT_REGISTRY_FILE) {
  const normalized = normalizeRegistry(data);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(normalized, null, 2));
  return normalized;
}

function upsertTaskSession(taskKey, sessionId, metadata = {}, options = {}) {
  const key = sanitizeTaskKey(taskKey);
  if (!key || !sessionId) return { ok: false, reason: 'invalid_task_or_session' };
  const filePath = options.filePath || DEFAULT_REGISTRY_FILE;
  const registry = readRegistry(filePath);
  registry.tasks[key] = {
    taskKey: key,
    sessionId: String(sessionId),
    updatedAt: new Date().toISOString(),
    ...metadata
  };
  writeRegistry(registry, filePath);
  return { ok: true, registry };
}

function upsertPlanSession(planPath, sessionId, metadata = {}, options = {}) {
  const filePath = options.filePath || DEFAULT_REGISTRY_FILE;
  const normalizedPlanPath = normalizePlanPath(planPath, options.cwd);
  if (!normalizedPlanPath || !sessionId) return { ok: false, reason: 'invalid_plan_or_session' };
  const registry = readRegistry(filePath);
  registry.plans[normalizedPlanPath] = {
    planPath: normalizedPlanPath,
    sessionId: String(sessionId),
    updatedAt: new Date().toISOString(),
    ...metadata
  };
  writeRegistry(registry, filePath);
  return { ok: true, registry };
}

function appendRecentSession(sessionId, metadata = {}, options = {}) {
  if (!sessionId) return { ok: false, reason: 'invalid_session' };
  const filePath = options.filePath || DEFAULT_REGISTRY_FILE;
  const limit = Number.isInteger(options.limit) && options.limit > 0 ? options.limit : 200;
  const registry = readRegistry(filePath);
  const target = String(sessionId);
  const next = registry.sessions.filter((entry) => entry && entry.sessionId !== target);
  next.unshift({ sessionId: target, updatedAt: new Date().toISOString(), ...metadata });
  registry.sessions = next.slice(0, limit);
  writeRegistry(registry, filePath);
  return { ok: true, registry };
}

function deleteSession(sessionId, options = {}) {
  if (!sessionId) return { ok: false, reason: 'invalid_session' };
  const filePath = options.filePath || DEFAULT_REGISTRY_FILE;
  const target = String(sessionId);
  const registry = readRegistry(filePath);

  let removedTasks = 0;
  let removedPlans = 0;
  let removedRecent = 0;

  Object.keys(registry.tasks).forEach((taskKey) => {
    const entry = registry.tasks[taskKey];
    if (entry && String(entry.sessionId || '') === target) {
      delete registry.tasks[taskKey];
      removedTasks += 1;
    }
  });

  Object.keys(registry.plans).forEach((planKey) => {
    const entry = registry.plans[planKey];
    if (entry && String(entry.sessionId || '') === target) {
      delete registry.plans[planKey];
      removedPlans += 1;
    }
  });

  const before = registry.sessions.length;
  registry.sessions = registry.sessions.filter((entry) => String(entry && entry.sessionId || '') !== target);
  removedRecent = before - registry.sessions.length;

  writeRegistry(registry, filePath);
  return {
    ok: true,
    changed: removedTasks + removedPlans + removedRecent > 0,
    removed: {
      tasks: removedTasks,
      plans: removedPlans,
      recentSessions: removedRecent
    },
    registry
  };
}

module.exports = {
  DEFAULT_REGISTRY_FILE,
  normalizePlanPath,
  normalizeRegistry,
  readRegistry,
  writeRegistry,
  upsertTaskSession,
  upsertPlanSession,
  appendRecentSession,
  deleteSession
};
