#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const plansDir = path.join(rootDir, 'plans', 'active');
const hostHomeDir = (() => {
  if (process.env.AIH_HOST_HOME && process.env.AIH_HOST_HOME.trim()) {
    return path.resolve(process.env.AIH_HOST_HOME.trim());
  }
  try {
    const info = os.userInfo();
    if (info && info.homedir) return info.homedir;
  } catch (_) {}
  return os.homedir();
})();
const sessionRegistryPath = path.join(hostHomeDir, '.ai_home', 'codex_task_sessions.json');

function nowIsoUtc8() {
  const d = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const f = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${f(d.getUTCMonth() + 1)}-${f(d.getUTCDate())}T${f(d.getUTCHours())}:${f(d.getUTCMinutes())}:${f(d.getUTCSeconds())}+08:00`;
}

function isPidAlive(pid) {
  const n = Number(pid);
  if (!Number.isFinite(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function parseArgs(argv) {
  return {
    repair: argv.includes('--repair'),
    intervalSec: (() => {
      const idx = argv.findIndex((x) => x === '--interval-sec');
      if (idx >= 0 && idx + 1 < argv.length) return Number(argv[idx + 1]) || 30;
      const inline = argv.find((x) => x.startsWith('--interval-sec='));
      if (inline) return Number(inline.split('=')[1]) || 30;
      return 0;
    })(),
    once: argv.includes('--once') || !argv.includes('--loop'),
    prompt: (() => {
      const idx = argv.findIndex((x) => x === '--prompt');
      if (idx >= 0 && idx + 1 < argv.length) return String(argv[idx + 1] || '').trim();
      const inline = argv.find((x) => x.startsWith('--prompt='));
      if (inline) return String(inline.split('=').slice(1).join('=') || '').trim();
      return '使用 $aih-task-worker skill。检测到 worker 中断，请在原 session 内继续当前任务并闭环回写 done/blocked（含 done_at/pr_or_commit/checklist/activity log）。';
    })()
  };
}

function readPlans() {
  if (!fs.existsSync(plansDir)) return [];
  return fs.readdirSync(plansDir)
    .filter((x) => x.endsWith('.plan.md') && x !== '_template.plan.md')
    .map((x) => path.join(plansDir, x))
    .sort();
}

function parsePlanTasks(content) {
  const lines = content.split(/\r?\n/);
  const tasks = [];
  let cur = null;
  let start = -1;

  function flush(endIdx) {
    if (!cur) return;
    cur._start = start;
    cur._end = endIdx;
    tasks.push(cur);
    cur = null;
    start = -1;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idMatch = line.match(/^- id:\s*(T\d+)/i);
    if (idMatch) {
      if (cur) flush(i);
      cur = { id: idMatch[1], title: '', status: '', owner: '', branch: '', blocker: '' };
      start = i;
      continue;
    }
    if (!cur) continue;
    const field = line.match(/^\s{2}([a-z_]+):\s*(.*)$/);
    if (!field) continue;
    const key = field[1];
    const val = String(field[2] || '').trim();
    if (key === 'title') cur.title = val;
    if (key === 'status') cur.status = val;
    if (key === 'owner') cur.owner = val;
    if (key === 'branch') cur.branch = val;
    if (key === 'blocker') cur.blocker = val;
  }
  if (cur) flush(lines.length);

  return { lines, tasks };
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
  return `${milestoneMatch[1]}-t${taskIdNum[1]}-${owner}`;
}

function readTaskSessions() {
  if (!fs.existsSync(sessionRegistryPath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionRegistryPath, 'utf8'));
    return parsed && parsed.tasks && typeof parsed.tasks === 'object' ? parsed.tasks : {};
  } catch (_) {
    return {};
  }
}

function readRunningIndex() {
  const byTaskKey = new Map();
  const bySessionId = new Map();
  try {
    const out = String(execSync('ps -axo pid=,command=', { encoding: 'utf8' }) || '');
    out.split(/\r?\n/).forEach((line) => {
      const m = line.trim().match(/^(\d+)\s+(.+)$/);
      if (!m) return;
      const pid = m[1];
      const cmd = m[2];
      if (!pid || !cmd) return;
      const tkInline = cmd.match(/--task-key=([a-zA-Z0-9._:-]+)/);
      const tkSpaced = cmd.match(/--task-key\s+([a-zA-Z0-9._:-]+)/);
      const taskKey = tkInline ? tkInline[1] : (tkSpaced ? tkSpaced[1] : '');
      if (taskKey && !byTaskKey.has(taskKey)) byTaskKey.set(taskKey, pid);
      const sid = (cmd.match(/\bresume\s+([0-9a-f]{8}-[0-9a-f-]{27})\b/i) || [])[1] || '';
      if (sid && !bySessionId.has(sid)) bySessionId.set(sid, pid);
    });
  } catch (_) {}
  return { byTaskKey, bySessionId };
}

function replaceField(lines, task, field, value) {
  const re = new RegExp(`^\\s{2}${field}:\\s*(.*)$`);
  for (let i = task._start + 1; i < task._end; i++) {
    if (re.test(lines[i])) {
      lines[i] = `  ${field}: ${value}`;
      return;
    }
  }
  lines.splice(task._end, 0, `  ${field}: ${value}`);
}

function appendActivity(lines, msg) {
  const idx = lines.findIndex((x) => x.trim() === '## Activity Log');
  if (idx < 0) return;
  lines.push(msg);
}

function updateUpdatedAt(lines, iso) {
  const idx = lines.findIndex((x) => /^- updated_at:\s*/.test(x));
  if (idx >= 0) lines[idx] = `- updated_at: ${iso}`;
}

function setChecklist(lines, taskId, done) {
  const re = new RegExp(`^(\\s*-\\s*\\[)( |x|X)(\\]\\s*${taskId}\\b.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (m) {
      lines[i] = `${m[1]}${done ? 'x' : ' '}${m[3]}`;
      return;
    }
  }
}

function relaunchBySession(sessionId, prompt) {
  if (!sessionId) return false;
  try {
    const child = spawn('node', ['bin/ai-home.js', 'codex', 'auto', 'exec', 'resume', sessionId, prompt], {
      cwd: rootDir,
      detached: true,
      stdio: 'ignore',
      env: process.env
    });
    child.unref();
    return true;
  } catch (_) {
    return false;
  }
}

function scanAndRepair(opts) {
  const taskSessions = readTaskSessions();
  const running = readRunningIndex();

  let staleCount = 0;
  let relaunched = 0;
  let blocked = 0;

  for (const planPath of readPlans()) {
    const planName = path.basename(planPath);
    const parsed = parsePlanTasks(fs.readFileSync(planPath, 'utf8'));
    const lines = parsed.lines;
    let changed = false;

    for (const t of parsed.tasks) {
      if (t.status !== 'doing') continue;
      const taskKey = deriveTaskKey(planName, t);
      const bind = taskSessions[taskKey] || {};
      const sid = bind.sessionId ? String(bind.sessionId) : '';
      const pidTask = taskKey ? running.byTaskKey.get(taskKey) : '';
      const pidSid = sid ? running.bySessionId.get(sid) : '';
      const pid = pidTask || pidSid || (bind.pid ? String(bind.pid) : '');
      const alive = pid ? isPidAlive(pid) : false;
      if (alive) continue;

      staleCount += 1;
      if (!opts.repair) continue;

      const ts = nowIsoUtc8();
      if (sid && relaunchBySession(sid, opts.prompt)) {
        relaunched += 1;
        updateUpdatedAt(lines, ts);
        appendActivity(lines, `- ${ts} [ai-watchdog] Relaunched ${t.id} (${taskKey}) via resume session ${sid}.`);
        changed = true;
      } else {
        blocked += 1;
        replaceField(lines, t, 'status', 'blocked');
        replaceField(lines, t, 'blocker', 'worker_offline_no_recoverable_session');
        setChecklist(lines, t.id, false);
        updateUpdatedAt(lines, ts);
        appendActivity(lines, `- ${ts} [ai-watchdog] Marked ${t.id} blocked: worker offline and no recoverable session.`);
        changed = true;
      }
    }

    if (changed) fs.writeFileSync(planPath, lines.join('\n').replace(/\n+$/, '') + '\n');
  }

  console.log(`[watchdog] stale=${staleCount}, relaunched=${relaunched}, blocked=${blocked}, mode=${opts.repair ? 'repair' : 'scan'}`);
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.once) {
    scanAndRepair(opts);
    return;
  }
  const sec = Math.max(5, Number(opts.intervalSec) || 30);
  scanAndRepair(opts);
  setInterval(() => scanAndRepair(opts), sec * 1000);
}

main();
