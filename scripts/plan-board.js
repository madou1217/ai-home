#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const plansDir = path.join(rootDir, 'plans');
const showAll = process.argv.includes('--all');
const hostHomeDir = (() => {
  if (process.env.AIH_HOST_HOME && process.env.AIH_HOST_HOME.trim()) {
    return path.resolve(process.env.AIH_HOST_HOME.trim());
  }
  try {
    const info = os.userInfo();
    if (info && info.homedir) return info.homedir;
  } catch (e) {
    // fallback below
  }
  return os.homedir();
})();
const sessionRegistryPath = path.join(hostHomeDir, '.ai_home', 'codex_task_sessions.json');

function readPlanFiles() {
  if (!fs.existsSync(plansDir)) return [];

  const activeDir = path.join(plansDir, 'active');
  if (fs.existsSync(activeDir)) {
    const active = fs.readdirSync(activeDir)
      .filter((name) => name.endsWith('.plan.md') && name !== '_template.plan.md')
      .map((name) => path.join(activeDir, name))
      .sort();
    if (active.length > 0) return active;
  }

  // Backward compatibility: legacy flat structure under plans/*.plan.md
  return fs.readdirSync(plansDir)
    .filter((name) => name.endsWith('.plan.md') && name !== '_template.plan.md')
    .map((name) => path.join(plansDir, name))
    .sort();
}

function parseTasks(content) {
  const lines = content.split(/\r?\n/);
  const tasks = [];
  let current = null;

  function flush() {
    if (current && current.id) tasks.push(current);
    current = null;
  }

  for (const line of lines) {
    const idMatch = line.match(/^- id:\s*(\S+)/);
    if (idMatch) {
      flush();
      current = {
        id: idMatch[1],
        title: '',
        status: '',
        owner: '',
        branch: '',
        claimedAt: '',
        doneAt: ''
      };
      continue;
    }

    if (!current) continue;

    const fieldMatch = line.match(/^\s{2}([a-z_]+):\s*(.*)$/);
    if (!fieldMatch) continue;
    const key = fieldMatch[1];
    const val = (fieldMatch[2] || '').trim();

    if (key === 'title') current.title = val;
    if (key === 'status') current.status = val;
    if (key === 'owner') current.owner = val;
    if (key === 'branch') current.branch = val;
    if (key === 'claimed_at') current.claimedAt = val;
    if (key === 'done_at') current.doneAt = val;
  }

  flush();
  return tasks;
}

function parseChecklist(content) {
  const lines = content.split(/\r?\n/);
  const map = new Map();
  for (const line of lines) {
    const m = line.match(/^\s*-\s*\[( |x|X)\]\s*(T\d+)\b/);
    if (!m) continue;
    map.set(m[2], m[1].toLowerCase() === 'x');
  }
  return map;
}

function renderTable(rows) {
  const header = ['plan', 'task', 'check', 'status', 'owner', 'task_key', 'binding_state', 'ai_type', 'account_id', 'session_id', 'pid', 'alive', 'title', 'branch', 'claimed_at'];
  const all = [header, ...rows];
  const widths = header.map((_, idx) => Math.max(...all.map((r) => String(r[idx] || '').length)));
  const fmt = (r) => r.map((v, i) => String(v || '').padEnd(widths[i], ' ')).join(' | ');

  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
  rows.forEach((r) => console.log(fmt(r)));
}

function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (e) {
    return false;
  }
}

function normalizeString(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function readTaskSessionMap() {
  const result = {
    validByTaskKey: new Map(),
    invalidByTaskKey: new Map(),
    registryError: ''
  };

  if (!fs.existsSync(sessionRegistryPath)) return result;
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionRegistryPath, 'utf8'));
    const tasks = parsed && typeof parsed === 'object' && parsed.tasks && typeof parsed.tasks === 'object' && !Array.isArray(parsed.tasks)
      ? parsed.tasks
      : {};
    Object.entries(tasks).forEach(([taskKey, entry]) => {
      const key = normalizeString(taskKey);
      if (!key) return;
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        result.invalidByTaskKey.set(key, { code: 'INVALID_ENTRY_OBJECT' });
        return;
      }

      const sessionId = normalizeString(entry.sessionId);
      if (!sessionId) {
        result.invalidByTaskKey.set(key, { code: 'MISSING_SESSION_ID' });
        return;
      }

      const cli = normalizeString(entry.cli);
      const accountId = normalizeString(entry.accountId);
      const pidRaw = normalizeString(entry.pid);
      const pid = pidRaw && /^\d+$/.test(pidRaw) ? pidRaw : '';
      if (pidRaw && !pid) {
        result.invalidByTaskKey.set(key, { code: 'INVALID_PID' });
        return;
      }

      result.validByTaskKey.set(key, {
        sessionId,
        cli,
        accountId,
        pid
      });
    });
    return result;
  } catch (e) {
    result.registryError = 'SESSION_REGISTRY_PARSE_ERROR';
    return result;
  }
}

function readRunningProcessIndex() {
  const byTaskKey = new Map();
  const bySessionId = new Map();
  try {
    const output = execSync('ps -axo pid=,command=', { encoding: 'utf8' });
    const lines = String(output || '').split(/\r?\n/);
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      const m = trimmed.match(/^(\d+)\s+(.+)$/);
      if (!m) return;
      const pid = String(m[1] || '');
      const cmd = String(m[2] || '');
      if (!pid || !cmd) return;
      const looksLikeAihAuto = cmd.includes('bin/ai-home.js codex auto exec');
      const looksLikeCodexResume = cmd.includes('codex') && cmd.includes(' resume ');
      if (!looksLikeAihAuto && !looksLikeCodexResume) return;

      const inline = cmd.match(/--task-key=([a-zA-Z0-9._:-]+)/);
      const spaced = cmd.match(/--task-key\s+([a-zA-Z0-9._:-]+)/);
      const key = inline ? inline[1] : (spaced ? spaced[1] : '');
      if (key && !byTaskKey.has(key)) byTaskKey.set(key, pid);

      const sidMatch = cmd.match(/\bresume\s+([0-9a-f]{8}-[0-9a-f-]{27})\b/i);
      const sid = sidMatch ? String(sidMatch[1]) : '';
      if (sid && !bySessionId.has(sid)) bySessionId.set(sid, pid);
    });
  } catch (e) {
    return { byTaskKey, bySessionId };
  }
  return { byTaskKey, bySessionId };
}

function deriveTaskKey(planName, task) {
  const owner = String(task.owner || '').trim().toLowerCase();
  if (!owner || owner === 'unassigned') return '';

  const branch = String(task.branch || '').trim().toLowerCase();
  const branchMatch = branch.match(/\b(m\d+-t\d+)\b/);
  if (branchMatch) return `${branchMatch[1]}-${owner}`;

  const milestoneMatch = String(planName).toLowerCase().match(/roadmap-(m\d+)-/);
  const taskIdNum = String(task.id || '').match(/^T(\d+)$/i);
  if (!milestoneMatch || !taskIdNum) return '';
  const milestone = milestoneMatch[1];
  const taskNum = `t${taskIdNum[1]}`;
  return `${milestone}-${taskNum}-${owner}`;
}

function formatClaimedAtShort(value) {
  const raw = String(value || '').trim();
  if (!raw) return '-';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  return `${mm}-${dd} ${hh}:${mi}`;
}

const planFiles = readPlanFiles();
if (planFiles.length === 0) {
  console.log('[board] no plan files found under plans/active/*.plan.md or plans/*.plan.md');
  process.exit(0);
}

const rows = [];
const taskSessionRegistry = readTaskSessionMap();
const runningProcessIndex = readRunningProcessIndex();
let total = 0;
let doing = 0;
let blocked = 0;
let todo = 0;
let done = 0;
let staleBindingCount = 0;
let invalidBindingCount = 0;

for (const absPath of planFiles) {
  const planName = path.basename(absPath);
  const content = fs.readFileSync(absPath, 'utf8');
  const tasks = parseTasks(content);
  const checklist = parseChecklist(content);

  tasks.forEach((t) => {
    total += 1;
    if (t.status === 'doing') doing += 1;
    else if (t.status === 'blocked') blocked += 1;
    else if (t.status === 'todo') todo += 1;
    else if (t.status === 'done') done += 1;

    const isActive = t.status === 'doing' || t.status === 'blocked';
    if (showAll || isActive) {
      const doneByStatus = t.status === 'done';
      const checked = checklist.has(t.id) ? checklist.get(t.id) : doneByStatus;
      const taskKey = deriveTaskKey(planName, t);
      const binding = (taskKey && taskSessionRegistry.validByTaskKey.get(taskKey)) || null;
      const invalidBinding = (taskKey && taskSessionRegistry.invalidByTaskKey.get(taskKey)) || null;
      const sid = binding && binding.sessionId ? binding.sessionId : '-';
      const aiType = binding && binding.cli ? binding.cli : '-';
      const accountId = binding && binding.accountId ? binding.accountId : '-';
      const runtimePidByTaskKey = taskKey ? runningProcessIndex.byTaskKey.get(taskKey) : '';
      const runtimePidBySession = sid !== '-' ? runningProcessIndex.bySessionId.get(sid) : '';
      const pid = runtimePidByTaskKey || runtimePidBySession || (binding && binding.pid ? binding.pid : '-');
      const alive = pid !== '-' ? (isPidAlive(pid) ? 'yes' : 'no') : '-';
      let bindingState = '-';
      if (t.status === 'doing' || t.status === 'blocked') {
        if (!taskKey) {
          bindingState = 'UNBOUND_TASK_KEY';
          invalidBindingCount += 1;
        } else if (invalidBinding) {
          bindingState = invalidBinding.code;
          invalidBindingCount += 1;
        } else if (!binding) {
          bindingState = 'MISSING_SESSION_BINDING';
          invalidBindingCount += 1;
        } else if (alive === 'yes') {
          bindingState = 'ATTACHED';
        } else if (pid !== '-') {
          bindingState = 'STALE_PID';
          staleBindingCount += 1;
        } else {
          bindingState = 'DETACHED_SESSION';
          staleBindingCount += 1;
        }
      }
      rows.push([
        planName,
        t.id,
        checked ? '[x]' : '[ ]',
        t.status || '-',
        t.owner || '-',
        taskKey || '-',
        bindingState,
        aiType,
        accountId,
        sid,
        pid,
        alive,
        t.title || '-',
        t.branch || '-',
        formatClaimedAtShort(t.claimedAt)
      ]);
    }
  });
}

console.log('AIH Subagent Task Board');
const registryErr = taskSessionRegistry.registryError ? `, registry_error=${taskSessionRegistry.registryError}` : '';
console.log(`summary: total=${total}, doing=${doing}, blocked=${blocked}, todo=${todo}, done=${done}, stale_bindings=${staleBindingCount}, invalid_bindings=${invalidBindingCount}${registryErr}`);

if (rows.length === 0) {
  console.log(showAll ? '[board] no tasks found' : '[board] no active tasks (doing/blocked)');
  process.exit(0);
}

renderTable(rows);
if (!showAll) {
  console.log('\nHint: run `npm run plan:board -- --all` to view all tasks.');
}
