#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const boardScript = path.join(rootDir, 'scripts', 'plan-board.js');
const watchdogScript = path.join(rootDir, 'scripts', 'plan-watchdog.js');
const plansDir = path.join(rootDir, 'plans');
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
const lockPath = path.join(hostHomeDir, '.ai_home', 'plan_foreman.lock');
const statePath = path.join(hostHomeDir, '.ai_home', 'plan_foreman_state.json');

function parseArgs(argv) {
  const out = {
    intervalSec: 20,
    relaunchMax: 4,
    relaunchCooldownSec: 90,
    zombieSec: 600,
    suspendSec: 3600,
    once: false
  };
  for (let i = 0; i < argv.length; i++) {
    const cur = String(argv[i] || '');
    if (cur === '--once') out.once = true;
    else if (cur === '--interval-sec' && i + 1 < argv.length) out.intervalSec = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--interval-sec=')) out.intervalSec = Number.parseInt(cur.slice('--interval-sec='.length), 10);
    else if (cur === '--relaunch-max' && i + 1 < argv.length) out.relaunchMax = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--relaunch-max=')) out.relaunchMax = Number.parseInt(cur.slice('--relaunch-max='.length), 10);
    else if (cur === '--relaunch-cooldown-sec' && i + 1 < argv.length) out.relaunchCooldownSec = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--relaunch-cooldown-sec=')) out.relaunchCooldownSec = Number.parseInt(cur.slice('--relaunch-cooldown-sec='.length), 10);
    else if (cur === '--zombie-sec' && i + 1 < argv.length) out.zombieSec = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--zombie-sec=')) out.zombieSec = Number.parseInt(cur.slice('--zombie-sec='.length), 10);
    else if (cur === '--suspend-sec' && i + 1 < argv.length) out.suspendSec = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--suspend-sec=')) out.suspendSec = Number.parseInt(cur.slice('--suspend-sec='.length), 10);
  }
  if (!Number.isFinite(out.intervalSec) || out.intervalSec < 5) out.intervalSec = 20;
  if (!Number.isFinite(out.relaunchMax) || out.relaunchMax < 1) out.relaunchMax = 4;
  if (!Number.isFinite(out.relaunchCooldownSec) || out.relaunchCooldownSec < 0) out.relaunchCooldownSec = 90;
  if (!Number.isFinite(out.zombieSec) || out.zombieSec < 300) out.zombieSec = 600;
  if (!Number.isFinite(out.suspendSec) || out.suspendSec < 300) out.suspendSec = 3600;
  return out;
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

function readLock() {
  if (!fs.existsSync(lockPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch (_) {
    return null;
  }
}

function writeLock() {
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, ts: new Date().toISOString() }, null, 2) + '\n');
}

function clearLock() {
  try {
    const lock = readLock();
    if (lock && Number(lock.pid) === process.pid) fs.unlinkSync(lockPath);
  } catch (_) {}
}

function readState() {
  if (!fs.existsSync(statePath)) return { lastRelaunchAt: {}, suspendUntil: {} };
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return { lastRelaunchAt: {}, suspendUntil: {} };
    if (!parsed.lastRelaunchAt || typeof parsed.lastRelaunchAt !== 'object') parsed.lastRelaunchAt = {};
    if (!parsed.suspendUntil || typeof parsed.suspendUntil !== 'object') parsed.suspendUntil = {};
    return parsed;
  } catch (_) {
    return { lastRelaunchAt: {}, suspendUntil: {} };
  }
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
}

function runNormalize() {
  execFileSync(process.execPath, [watchdogScript, '--repair', '--once', '--no-force-revive', '--no-revive-blocked'], {
    cwd: rootDir,
    stdio: 'pipe',
    env: {
      ...process.env,
      AIH_WATCHDOG_MAX_RELAUNCH_PER_SCAN: '0'
    }
  });
}

function readBoardAll() {
  const out = execFileSync(process.execPath, [boardScript, '--json', '--all'], {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024
  });
  return JSON.parse(out);
}

function planPriority(planName) {
  const p = String(planName || '').toLowerCase();
  if (p.includes('m3-client-packaging')) return 1;
  if (p.includes('m6-client-auth')) return 2;
  if (p.includes('m6-usage-session')) return 3;
  if (p.includes('m4-remote-runtime')) return 4;
  return 9;
}

function toMs(value) {
  const ms = Date.parse(String(value || '').trim());
  return Number.isFinite(ms) ? ms : 0;
}

function resolvePlanPath(planName) {
  const base = String(planName || '').trim();
  if (!base) return '';
  const active = path.join(plansDir, 'active', base);
  if (fs.existsSync(active)) return active;
  const legacy = path.join(plansDir, base);
  if (fs.existsSync(legacy)) return legacy;
  return '';
}

function setChecklistUnchecked(lines, taskId) {
  const re = new RegExp(`^(\\s*-\\s*\\[)( |x|X)(\\]\\s*${String(taskId).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b.*)$`);
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    lines[i] = `${m[1]} ${m[3]}`;
    return;
  }
}

function blockTaskInPlan(planName, taskId, blocker, note) {
  const abs = resolvePlanPath(planName);
  if (!abs) return false;
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  const ts = `${now.getUTCFullYear()}-${p2(now.getUTCMonth() + 1)}-${p2(now.getUTCDate())}T${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())}+08:00`;
  const idNeedle = `- id: ${taskId}`;
  const start = lines.findIndex((x) => x.trim() === idNeedle);
  if (start < 0) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^- id:\s+\S+/.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  let statusIdx = -1;
  let blockerIdx = -1;
  let doneIdx = -1;
  for (let i = start + 1; i < end; i++) {
    if (/^\s{2}status:\s*/.test(lines[i])) statusIdx = i;
    else if (/^\s{2}blocker:\s*/.test(lines[i])) blockerIdx = i;
    else if (/^\s{2}done_at:\s*/.test(lines[i])) doneIdx = i;
  }
  if (statusIdx < 0) return false;
  lines[statusIdx] = '  status: blocked';
  if (blockerIdx >= 0) lines[blockerIdx] = `  blocker: ${blocker}`;
  if (doneIdx >= 0) lines[doneIdx] = '  done_at: ';
  setChecklistUnchecked(lines, taskId);
  const updatedIdx = lines.findIndex((x) => /^- updated_at:\s*/.test(x));
  if (updatedIdx >= 0) lines[updatedIdx] = `- updated_at: ${ts}`;
  const activityIdx = lines.findIndex((x) => x.trim() === '## Activity Log');
  if (activityIdx >= 0) {
    lines.push(`- ${ts} [foreman] ${note}`);
  }
  fs.writeFileSync(abs, lines.join('\n').replace(/\n+$/, '') + '\n');
  return true;
}

function markTaskDoingInPlan(planName, taskId, note) {
  const abs = resolvePlanPath(planName);
  if (!abs) return false;
  const lines = fs.readFileSync(abs, 'utf8').split(/\r?\n/);
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const p2 = (n) => String(n).padStart(2, '0');
  const ts = `${now.getUTCFullYear()}-${p2(now.getUTCMonth() + 1)}-${p2(now.getUTCDate())}T${p2(now.getUTCHours())}:${p2(now.getUTCMinutes())}:${p2(now.getUTCSeconds())}+08:00`;
  const idNeedle = `- id: ${taskId}`;
  const start = lines.findIndex((x) => x.trim() === idNeedle);
  if (start < 0) return false;
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (/^- id:\s+\S+/.test(lines[i].trim())) {
      end = i;
      break;
    }
  }
  let statusIdx = -1;
  let blockerIdx = -1;
  let doneIdx = -1;
  for (let i = start + 1; i < end; i++) {
    if (/^\s{2}status:\s*/.test(lines[i])) statusIdx = i;
    else if (/^\s{2}blocker:\s*/.test(lines[i])) blockerIdx = i;
    else if (/^\s{2}done_at:\s*/.test(lines[i])) doneIdx = i;
  }
  if (statusIdx < 0) return false;
  lines[statusIdx] = '  status: doing';
  if (blockerIdx >= 0) lines[blockerIdx] = '  blocker: ';
  if (doneIdx >= 0) lines[doneIdx] = '  done_at: ';
  setChecklistUnchecked(lines, taskId);
  const updatedIdx = lines.findIndex((x) => /^- updated_at:\s*/.test(x));
  if (updatedIdx >= 0) lines[updatedIdx] = `- updated_at: ${ts}`;
  const activityIdx = lines.findIndex((x) => x.trim() === '## Activity Log');
  if (activityIdx >= 0) {
    lines.push(`- ${ts} [foreman] ${note}`);
  }
  fs.writeFileSync(abs, lines.join('\n').replace(/\n+$/, '') + '\n');
  return true;
}

function shouldSkipAutoRelaunchByBlocker(blocker) {
  const b = String(blocker || '').trim().toLowerCase();
  if (!b) return false;
  // no_progress_session_stuck_* is a runtime-stuck signal and should be recoverable
  // when session binding still exists (STALE_PID case).
  if (b.includes('manual_replan_required')) return true;
  if (b.includes('concurrent_plan_write_conflict')) return true;
  if (b.includes('dependency_out_of_scope')) return true;
  if (b.startsWith('upstream_')) return true;
  if (b.startsWith('dependencies_')) return true;
  return false;
}

function enforceZombieGuard(board, state, args) {
  const tasks = Array.isArray(board.tasks) ? board.tasks : [];
  const now = Date.now();
  const zombieMs = Math.max(300, Number(args.zombieSec) || 1800) * 1000;
  const suspendMs = Math.max(300, Number(args.suspendSec) || 3600) * 1000;
  let blocked = 0;
  let killed = 0;
  for (const t of tasks) {
    if (!t || t.status !== 'doing') continue;
    if (t.binding_state !== 'ATTACHED') continue;
    if (!t.pid || t.pid === '-') continue;
    if (!t.task_key || t.task_key === '-') continue;
    const bindingMs = toMs(t.binding_updated_at);
    const claimMs = toMs(t.claimed_at_iso);
    const baseline = Math.max(bindingMs, claimMs);
    if (!baseline) continue;
    if ((now - baseline) < zombieMs) continue;
    try {
      process.kill(Number(t.pid), 'SIGTERM');
      killed += 1;
    } catch (_) {}
    const blocker = 'no_progress_session_stuck_over_2h_needs_replan';
    const note = `Auto-blocked ${t.task} (${t.task_key}) due to zombie session timeout; pid=${t.pid}, idle_minutes=${Math.floor((now - baseline) / 60000)}.`;
    if (blockTaskInPlan(t.plan, t.task, blocker, note)) blocked += 1;
    if (!state.suspendUntil || typeof state.suspendUntil !== 'object') state.suspendUntil = {};
    state.suspendUntil[t.task_key] = now + suspendMs;
  }
  return { blocked, killed };
}

function pickRelaunchCandidates(board, maxN, state, cooldownSec) {
  const tasks = Array.isArray(board.tasks) ? board.tasks : [];
  const now = Date.now();
  const cooldownMs = Math.max(0, Number(cooldownSec) || 0) * 1000;
  const lastMap = state && state.lastRelaunchAt ? state.lastRelaunchAt : {};
  const suspendMap = state && state.suspendUntil ? state.suspendUntil : {};
  return tasks
    .filter((t) =>
      t &&
      t.status === 'blocked' &&
      t.binding_state === 'STALE_PID' &&
      t.session_id &&
      t.session_id !== '-' &&
      t.task_key &&
      t.task_key !== '-')
    .filter((t) => !shouldSkipAutoRelaunchByBlocker(t.blocker))
    .filter((t) => {
      const last = Number(lastMap[t.task_key] || 0);
      if (last && (now - last) < cooldownMs) return false;
      const suspended = Number(suspendMap[t.task_key] || 0);
      if (suspended && now < suspended) return false;
      return true;
    })
    .sort((a, b) => {
      const pa = planPriority(a.plan);
      const pb = planPriority(b.plan);
      if (pa !== pb) return pa - pb;
      const la = Number(lastMap[a.task_key] || 0);
      const lb = Number(lastMap[b.task_key] || 0);
      if (la !== lb) return la - lb;
      return String(a.task_key).localeCompare(String(b.task_key));
    })
    .slice(0, maxN);
}

function relaunch(task) {
  const prompt = '使用 $aih-task-worker skill。优先闭环：仅处理本任务 files 范围；若 files 中目标文件不存在，先创建再实现，禁止用 scope_file_missing 直接阻塞；回写 status=done/blocked、done_at、checklist、activity log；若遇真实依赖阻塞，写明 blocker 后立即结束会话，不要保持空闲挂起。';
  const child = spawn(process.execPath, [
    'bin/ai-home.js',
    'codex',
    'auto',
    'exec',
    'resume',
    String(task.session_id),
    prompt
  ], {
    cwd: rootDir,
    detached: true,
    stdio: 'ignore',
    env: process.env
  });
  child.unref();
  return child.pid || 0;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const existing = readLock();
  if (existing && isPidAlive(existing.pid) && Number(existing.pid) !== process.pid) {
    console.log(`[foreman] already running pid=${existing.pid}`);
    return;
  }
  writeLock();
  process.on('SIGINT', () => { clearLock(); process.exit(0); });
  process.on('SIGTERM', () => { clearLock(); process.exit(0); });
  process.on('exit', () => clearLock());

  do {
    try {
      const state = readState();
      runNormalize();
      const board = readBoardAll();
      const guard = enforceZombieGuard(board, state, args);
      const boardAfterGuard = guard.blocked > 0 ? readBoardAll() : board;
      const picks = pickRelaunchCandidates(boardAfterGuard, args.relaunchMax, state, args.relaunchCooldownSec);
      const pids = picks.map((t) => {
        const pid = relaunch(t);
        if (pid > 0) {
          const note = `Auto-relaunched ${t.task} (${t.task_key}) via resume session ${t.session_id}; status normalized to doing.`;
          markTaskDoingInPlan(t.plan, t.task, note);
        }
        return { task: t.task_key, pid };
      });
      const now = Date.now();
      for (const p of pids) state.lastRelaunchAt[p.task] = now;
      writeState(state);
      console.log(`[foreman] zombie_blocked=${guard.blocked} zombie_killed=${guard.killed} relaunched=${pids.length} tasks=${pids.map((x) => `${x.task}:${x.pid}`).join(',') || '-'}`);
    } catch (e) {
      const msg = e && e.message ? e.message : String(e);
      console.log(`[foreman] cycle_error=${msg}`);
    }
    if (!args.once) await sleep(args.intervalSec * 1000);
  } while (!args.once);
}

main();
