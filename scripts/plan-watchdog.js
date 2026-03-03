#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execSync, spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const plansDir = path.join(rootDir, 'plans', 'active');
const WATCHDOG_RELAUNCH_LIMIT = Number(process.env.AIH_WATCHDOG_RELAUNCH_LIMIT || 2);
const WATCHDOG_RELAUNCH_WINDOW_MS = Number(process.env.AIH_WATCHDOG_RELAUNCH_WINDOW_MS || (10 * 60 * 1000));
const WATCHDOG_BLOCK_COOLDOWN_MS = Number(process.env.AIH_WATCHDOG_BLOCK_COOLDOWN_MS || (3 * 60 * 1000));
const WATCHDOG_RELAUNCH_MIN_INTERVAL_MS = Number(process.env.AIH_WATCHDOG_RELAUNCH_MIN_INTERVAL_MS || (90 * 1000));
const WATCHDOG_MAX_RELAUNCH_PER_SCAN = Math.max(0, Number(process.env.AIH_WATCHDOG_MAX_RELAUNCH_PER_SCAN || 20));
const WATCHDOG_NEW_CLAIM_GRACE_MS = Math.max(0, Number(process.env.AIH_WATCHDOG_NEW_CLAIM_GRACE_MS || (2 * 60 * 1000)));
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
const watchdogStatePath = path.join(hostHomeDir, '.ai_home', 'watchdog_state.json');

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
  const hasLoopFlag = argv.includes('--loop');
  const hasOnceFlag = argv.includes('--once');
  const hasScanFlag = argv.includes('--scan');
  const hasRepairFlag = argv.includes('--repair');
  const hasForceReviveFlag = argv.includes('--force-revive');
  const hasNoForceReviveFlag = argv.includes('--no-force-revive');

  return {
    // Default behavior: keep repairing in loop without requiring extra flags.
    repair: hasScanFlag ? false : (hasRepairFlag || true),
    intervalSec: (() => {
      const idx = argv.findIndex((x) => x === '--interval-sec');
      if (idx >= 0 && idx + 1 < argv.length) return Number(argv[idx + 1]) || 15;
      const inline = argv.find((x) => x.startsWith('--interval-sec='));
      if (inline) return Number(inline.split('=')[1]) || 15;
      return 0;
    })(),
    once: hasOnceFlag ? true : (hasLoopFlag ? false : false),
    reviveBlocked: !argv.includes('--no-revive-blocked'),
    forceRevive: hasNoForceReviveFlag ? false : (hasForceReviveFlag || true),
    prompt: (() => {
      const idx = argv.findIndex((x) => x === '--prompt');
      if (idx >= 0 && idx + 1 < argv.length) return String(argv[idx + 1] || '').trim();
      const inline = argv.find((x) => x.startsWith('--prompt='));
      if (inline) return String(inline.split('=').slice(1).join('=') || '').trim();
      return '使用 $aih-task-worker skill。检测到 worker 中断，请在原 session 内继续当前任务并闭环回写 done/blocked（含 done_at/pr_or_commit/checklist/activity log）；若 files 中目标文件不存在，先创建再实现，不要以 scope_file_missing 直接阻塞。';
    })()
  };
}

function isRecoverableBlockedReason(blocker) {
  const b = String(blocker || '').trim().toLowerCase();
  if (!b) return true;
  // Only auto-revive transient runtime/connectivity issues. Product/scope/
  // dependency blockers must remain blocked until coordinator replans.
  if (b.startsWith('no_progress_session_stuck')) return true;
  if (b.startsWith('watchdog_relaunch_exhausted_')) return true;
  if (b === 'worker_offline_no_recoverable_session') return true;
  if (b === 'missing_session_binding') return true;
  if (b === 'detached_session') return true;
  if (b === 'stale_pid') return true;
  return false;
}

function isDependencyBlockerResolved(blocker, taskStatusById) {
  const b = String(blocker || '').trim().toLowerCase();
  if (!b.startsWith('upstream_dependencies_not_done_t')) return false;
  const m = b.match(/upstream_dependencies_not_done_(t\d+)/);
  if (!m) return false;
  const depId = String(m[1] || '').toUpperCase();
  if (!depId) return false;
  return String(taskStatusById[depId] || '').toLowerCase() === 'done';
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
      cur = { id: idMatch[1], title: '', status: '', owner: '', branch: '', blocker: '', claimedAt: '', doneAt: '' };
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
    if (key === 'claimed_at') cur.claimedAt = val;
    if (key === 'done_at') cur.doneAt = val;
  }
  if (cur) flush(lines.length);

  return { lines, tasks };
}

function parseIsoTimestampFromLine(line) {
  const m = String(line || '').match(/^-\s+(\d{4}-\d{2}-\d{2}T\S+)\s+\[/);
  if (!m) return 0;
  const ms = Date.parse(m[1]);
  return Number.isFinite(ms) ? ms : 0;
}

function parseTimeMs(value) {
  const ms = Date.parse(String(value || '').trim());
  return Number.isFinite(ms) ? ms : 0;
}

function parseWatchdogTaskHistory(lines, task) {
  const nowMs = Date.now();
  const relaunchNeedle = `[ai-watchdog] Relaunched ${task.id} `;
  const blockedNeedle = `[ai-watchdog] Marked ${task.id} blocked:`;
  let relaunchRecent = 0;
  let relaunchTotal = 0;
  let lastRelaunchMs = 0;
  let lastBlockedMs = 0;

  for (const line of lines) {
    if (!line || !line.includes('[ai-watchdog]')) continue;
    const tsMs = parseIsoTimestampFromLine(line);
    if (line.includes(relaunchNeedle)) {
      relaunchTotal += 1;
      if (tsMs > lastRelaunchMs) lastRelaunchMs = tsMs;
      if (tsMs > 0 && (nowMs - tsMs) <= WATCHDOG_RELAUNCH_WINDOW_MS) relaunchRecent += 1;
      continue;
    }
    if (line.includes(blockedNeedle) && tsMs > lastBlockedMs) lastBlockedMs = tsMs;
  }

  return { relaunchRecent, relaunchTotal, lastRelaunchMs, lastBlockedMs };
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

function readWatchdogState() {
  if (!fs.existsSync(watchdogStatePath)) return {};
  try {
    const parsed = JSON.parse(fs.readFileSync(watchdogStatePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

function writeWatchdogState(state) {
  try {
    fs.mkdirSync(path.dirname(watchdogStatePath), { recursive: true });
    fs.writeFileSync(watchdogStatePath, JSON.stringify(state, null, 2) + '\n');
  } catch (_) {}
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
      env: {
        ...process.env,
        AIH_WATCHDOG_CHILD: '1'
      }
    });
    child.unref();
    return true;
  } catch (_) {
    return false;
  }
}

function taskStateKey(planName, task) {
  return `${planName}:${task.id}:${String(task.owner || '').trim().toLowerCase() || 'unassigned'}`;
}

function scanAndRepair(opts) {
  const taskSessions = readTaskSessions();
  const running = readRunningIndex();
  const watchdogState = readWatchdogState();

  let staleCount = 0;
  let relaunched = 0;
  let blocked = 0;
  let throttled = 0;
  let scanRelaunchCount = 0;
  let stateChanged = false;

  for (const planPath of readPlans()) {
    const planName = path.basename(planPath);
    const parsed = parsePlanTasks(fs.readFileSync(planPath, 'utf8'));
    const lines = parsed.lines;
    const taskStatusById = {};
    for (const task of parsed.tasks) {
      const taskId = String(task.id || '').toUpperCase();
      if (!taskId) continue;
      taskStatusById[taskId] = String(task.status || '').trim().toLowerCase();
    }
    let changed = false;

    for (const t of parsed.tasks) {
      const status = String(t.status || '').trim().toLowerCase();
      const dependencyResolved = status === 'blocked' && isDependencyBlockerResolved(t.blocker, taskStatusById);
      const recoverableBlocked = status === 'blocked' && opts.reviveBlocked && (isRecoverableBlockedReason(t.blocker) || dependencyResolved);
      if (status !== 'doing' && !recoverableBlocked) continue;
      if (status !== 'done' && String(t.doneAt || '').trim()) {
        const ts = nowIsoUtc8();
        replaceField(lines, t, 'done_at', '');
        updateUpdatedAt(lines, ts);
        appendActivity(lines, `- ${ts} [ai-watchdog] Cleared stale done_at for ${t.id} (status=${status}).`);
        changed = true;
      }
      const taskKey = deriveTaskKey(planName, t);
      const bind = taskSessions[taskKey] || {};
      const sid = bind.sessionId ? String(bind.sessionId) : '';
      const pidTask = taskKey ? running.byTaskKey.get(taskKey) : '';
      const pidSid = sid ? running.bySessionId.get(sid) : '';
      const pid = pidTask || pidSid || (bind.pid ? String(bind.pid) : '');
      const alive = pid ? isPidAlive(pid) : false;
      const stateKey = taskStateKey(planName, t);
      if (alive) {
        if (recoverableBlocked) {
          const ts = nowIsoUtc8();
          replaceField(lines, t, 'status', 'doing');
          replaceField(lines, t, 'blocker', '');
          setChecklist(lines, t.id, false);
          updateUpdatedAt(lines, ts);
          appendActivity(lines, `- ${ts} [ai-watchdog] Revived ${t.id}: process attached, status moved blocked -> doing.`);
          changed = true;
        }
        if (watchdogState[stateKey]) {
          delete watchdogState[stateKey];
          stateChanged = true;
        }
        continue;
      }

      staleCount += 1;
      if (!opts.repair) continue;

      const ts = nowIsoUtc8();
      const history = parseWatchdogTaskHistory(lines, t);
      const shouldBlockOnLoop = !opts.forceRevive && status === 'doing' && sid && history.relaunchRecent >= WATCHDOG_RELAUNCH_LIMIT;
      const state = watchdogState[stateKey] || {};
      const now = Date.now();
      const claimedAtMs = parseTimeMs(t.claimedAt);
      const isNewClaimGrace =
        status === 'doing' &&
        claimedAtMs > 0 &&
        (now - claimedAtMs) >= 0 &&
        (now - claimedAtMs) < WATCHDOG_NEW_CLAIM_GRACE_MS;
      if (isNewClaimGrace) {
        continue;
      }
      const inBlockedCooldown = !opts.forceRevive && Number(state.blockedAtMs) > 0 && (now - Number(state.blockedAtMs)) < WATCHDOG_BLOCK_COOLDOWN_MS;
      if (shouldBlockOnLoop) {
        blocked += 1;
        replaceField(lines, t, 'status', 'blocked');
        replaceField(lines, t, 'blocker', `watchdog_relaunch_exhausted_${WATCHDOG_RELAUNCH_LIMIT}_in_${Math.floor(WATCHDOG_RELAUNCH_WINDOW_MS / 60000)}m`);
        setChecklist(lines, t.id, false);
        updateUpdatedAt(lines, ts);
        appendActivity(lines, `- ${ts} [ai-watchdog] Marked ${t.id} blocked: relaunch loop detected (${history.relaunchRecent}/${WATCHDOG_RELAUNCH_LIMIT} in ${Math.floor(WATCHDOG_RELAUNCH_WINDOW_MS / 60000)}m).`);
        watchdogState[stateKey] = {
          blockedAtMs: now,
          reason: 'relaunch_loop_detected'
        };
        stateChanged = true;
        changed = true;
      } else if (inBlockedCooldown) {
        continue;
      } else if (scanRelaunchCount >= WATCHDOG_MAX_RELAUNCH_PER_SCAN) {
        throttled += 1;
        continue;
      } else if (!opts.forceRevive && Number(state.lastRelaunchAtMs) > 0 && (now - Number(state.lastRelaunchAtMs)) < WATCHDOG_RELAUNCH_MIN_INTERVAL_MS) {
        throttled += 1;
        continue;
      } else if (sid && relaunchBySession(sid, opts.prompt)) {
        relaunched += 1;
        scanRelaunchCount += 1;
        const attempts = Number(state.attempts) || 0;
        watchdogState[stateKey] = {
          attempts: attempts + 1,
          lastRelaunchAtMs: now
        };
        stateChanged = true;
        if (recoverableBlocked) {
          replaceField(lines, t, 'status', 'doing');
          replaceField(lines, t, 'blocker', '');
          setChecklist(lines, t.id, false);
        }
        updateUpdatedAt(lines, ts);
        appendActivity(lines, `- ${ts} [ai-watchdog] Relaunched ${t.id} (${taskKey}) via resume session ${sid} (attempt_window=${history.relaunchRecent + 1}/${WATCHDOG_RELAUNCH_LIMIT} in ${Math.floor(WATCHDOG_RELAUNCH_WINDOW_MS / 60000)}m).${recoverableBlocked ? ' status blocked -> doing.' : ''}`);
        changed = true;
      } else {
        blocked += 1;
        replaceField(lines, t, 'status', 'blocked');
        replaceField(lines, t, 'blocker', 'worker_offline_no_recoverable_session');
        setChecklist(lines, t.id, false);
        updateUpdatedAt(lines, ts);
        appendActivity(lines, `- ${ts} [ai-watchdog] Marked ${t.id} blocked: worker offline and no recoverable session.`);
        watchdogState[stateKey] = {
          blockedAtMs: now,
          reason: 'worker_offline_no_recoverable_session'
        };
        stateChanged = true;
        changed = true;
      }
    }

    if (changed) fs.writeFileSync(planPath, lines.join('\n').replace(/\n+$/, '') + '\n');
  }
  if (stateChanged) writeWatchdogState(watchdogState);

  console.log(`[watchdog] stale=${staleCount}, relaunched=${relaunched}, blocked=${blocked}, throttled=${throttled}, mode=${opts.repair ? 'repair' : 'scan'}`);
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
