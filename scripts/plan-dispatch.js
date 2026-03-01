#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const plansDir = path.join(rootDir, 'plans', 'active');

function parseArgs(argv) {
  const out = {
    scope: '',
    plan: '',
    launchMax: 32,
    ownerPrefix: 'w',
    prompt: [
      '使用 $aih-task-worker skill。',
      '你是执行者，必须在当前会话闭环：实现任务 files 范围、回写 status=done/blocked、done_at、pr_or_commit、Checklist、Activity Log。',
      '只输出 task_id/status/pr_or_commit/changed_files。'
    ].join(' '),
    dryRun: false,
    loop: false,
    intervalSec: 10,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const cur = String(argv[i] || '');
    if (cur === '--help' || cur === '-h') out.help = true;
    else if (cur === '--dry-run') out.dryRun = true;
    else if (cur === '--loop') out.loop = true;
    else if ((cur === '--scope' || cur === '-s') && i + 1 < argv.length) out.scope = String(argv[++i] || '').trim();
    else if (cur.startsWith('--scope=')) out.scope = cur.slice('--scope='.length).trim();
    else if ((cur === '--plan' || cur === '-p') && i + 1 < argv.length) out.plan = String(argv[++i] || '').trim();
    else if (cur.startsWith('--plan=')) out.plan = cur.slice('--plan='.length).trim();
    else if ((cur === '--launch-max' || cur === '-n') && i + 1 < argv.length) out.launchMax = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--launch-max=')) out.launchMax = Number.parseInt(cur.slice('--launch-max='.length), 10);
    else if ((cur === '--interval-sec' || cur === '-i') && i + 1 < argv.length) out.intervalSec = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--interval-sec=')) out.intervalSec = Number.parseInt(cur.slice('--interval-sec='.length), 10);
    else if ((cur === '--owner-prefix' || cur === '-o') && i + 1 < argv.length) out.ownerPrefix = String(argv[++i] || '').trim();
    else if (cur.startsWith('--owner-prefix=')) out.ownerPrefix = cur.slice('--owner-prefix='.length).trim();
    else if ((cur === '--prompt') && i + 1 < argv.length) out.prompt = String(argv[++i] || '').trim() || out.prompt;
    else if (cur.startsWith('--prompt=')) out.prompt = cur.slice('--prompt='.length).trim() || out.prompt;
  }

  if (!Number.isFinite(out.launchMax) || out.launchMax < 1) out.launchMax = 1;
  if (!Number.isFinite(out.intervalSec) || out.intervalSec < 3) out.intervalSec = 3;
  if (!out.ownerPrefix) out.ownerPrefix = 'w';
  return out;
}

function printHelp() {
  console.log(`Usage:\n  npm run plan:dispatch -- --scope roadmap-m8-hyper-scale- --launch-max 64\n\nOptions:\n  --scope, -s <name-part>     only dispatch plans containing this text\n  --plan, -p <filename>       dispatch one specific plan file\n  --launch-max, -n <number>   max tasks to launch in one round (default 32)\n  --owner-prefix, -o <prefix> task owner prefix (default w)\n  --loop                      keep dispatching in rounds\n  --interval-sec, -i <sec>    loop interval (default 10)\n  --dry-run                   print commands only\n  -h, --help                  show help\n`);
}

function readPlanFiles(args) {
  if (!fs.existsSync(plansDir)) return [];
  const all = fs.readdirSync(plansDir)
    .filter((x) => x.endsWith('.plan.md') && x !== '_template.plan.md')
    .sort();

  if (args.plan) {
    const exact = all.find((x) => x === args.plan || path.basename(x) === args.plan);
    return exact ? [path.join(plansDir, exact)] : [];
  }
  if (args.scope) {
    return all.filter((x) => x.includes(args.scope)).map((x) => path.join(plansDir, x));
  }
  return all.map((x) => path.join(plansDir, x));
}

function parseTasks(content) {
  const lines = content.split(/\r?\n/);
  const tasks = [];
  let cur = null;

  function flush() {
    if (cur && cur.id) tasks.push(cur);
    cur = null;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const idm = line.match(/^- id:\s*(T\d+)/i);
    if (idm) {
      flush();
      cur = { id: idm[1], status: '', owner: '', branch: '' };
      continue;
    }
    if (!cur) continue;
    const fm = line.match(/^\s{2}([a-z_]+):\s*(.*)$/);
    if (!fm) continue;
    const key = fm[1];
    const val = String(fm[2] || '').trim();
    if (key === 'status') cur.status = val;
    if (key === 'owner') cur.owner = val;
    if (key === 'branch') cur.branch = val;
  }

  flush();
  return tasks;
}

function milestoneFromPlanName(planName) {
  const m = String(planName || '').toLowerCase().match(/roadmap-(m\d+)-/);
  return m ? m[1] : '';
}

function taskNumFromId(taskId) {
  const m = String(taskId || '').match(/^T(\d+)$/i);
  if (!m) return '';
  return String(Number(m[1])).padStart(3, '0');
}

function buildOwner(planName, taskId, prefix) {
  const m = String(planName || '').match(/(\d{3})-\d{4}-\d{2}-\d{2}\.plan\.md$/);
  const batch = m ? m[1] : '000';
  const n = taskNumFromId(taskId);
  return `${prefix}${batch}${n}`.toLowerCase();
}

function buildTaskQueue(files, ownerPrefix) {
  const queue = [];
  for (const abs of files) {
    const planName = path.basename(abs);
    const milestone = milestoneFromPlanName(planName);
    if (!milestone) continue;

    const content = fs.readFileSync(abs, 'utf8');
    const tasks = parseTasks(content);
    for (const t of tasks) {
      if (t.status !== 'todo') continue;
      if (t.owner && t.owner !== 'unassigned') continue;
      const tn = taskNumFromId(t.id);
      if (!tn) continue;
      const owner = buildOwner(planName, t.id, ownerPrefix);
      const taskKey = `${milestone}-t${tn}-${owner}`;
      queue.push({
        planRel: path.relative(rootDir, abs),
        taskId: t.id,
        taskKey,
        owner,
        planName
      });
    }
  }
  return queue;
}

function runOne(job, prompt, dryRun) {
  const cmd = [
    'node',
    'bin/ai-home.js',
    'codex',
    'auto',
    'exec',
    '--task-key',
    job.taskKey,
    '--plan',
    job.planRel,
    prompt
  ];

  if (dryRun) {
    console.log(`[dispatch] dry-run ${job.taskKey} -> ${job.planRel}`);
    return { ok: true, dryRun: true };
  }

  try {
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: rootDir,
      detached: true,
      stdio: 'ignore',
      env: process.env
    });
    child.unref();
    return { ok: true, pid: child.pid || 0 };
  } catch (e) {
    return { ok: false, error: e && e.message ? e.message : String(e) };
  }
}

function dispatchOnce(args) {
  const files = readPlanFiles(args);
  const queue = buildTaskQueue(files, args.ownerPrefix);
  const pick = queue.slice(0, args.launchMax);

  let ok = 0;
  let fail = 0;

  pick.forEach((job) => {
    const result = runOne(job, args.prompt, args.dryRun);
    if (result.ok) {
      ok += 1;
      const pidInfo = result.pid ? ` pid=${result.pid}` : '';
      console.log(`[dispatch] launched ${job.taskKey} (${job.taskId})${pidInfo}`);
    } else {
      fail += 1;
      console.log(`[dispatch] failed ${job.taskKey}: ${result.error}`);
    }
  });

  console.log(`[dispatch] plans=${files.length} candidates=${queue.length} launched=${ok} failed=${fail} limit=${args.launchMax}`);
  return { files: files.length, candidates: queue.length, launched: ok, failed: fail };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  const run = () => dispatchOnce(args);

  if (!args.loop) {
    run();
    return;
  }

  run();
  setInterval(run, args.intervalSec * 1000);
}

main();
