#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

const rootDir = path.resolve(__dirname, '..');
const plansRoot = path.join(rootDir, 'plans');

function resolveWorkerSkillToken() {
  const candidates = [
    { token: '$aih-task-worker', file: path.join(rootDir, 'skills', 'aih-task-worker', 'SKILL.md') },
    { token: '$plan-worker', file: path.join(rootDir, 'skills', 'plan-worker', 'SKILL.md') }
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.file)) return c.token;
  }
  return '$plan-worker';
}

const DEFAULT_PROMPT = [
  `使用 ${resolveWorkerSkillToken()} skill。`,
  '你是本仓库执行 AI，严格按 worker skill 闭环。',
  '先确认并保持本任务为 doing（owner/claimed_at/branch）。',
  '只允许修改该任务 files 范围内文件并完成可运行实现。',
  '完成后必须在当前会话内回写计划文件：status=done、done_at、pr_or_commit、Checklist=[x]、Activity Log。',
  '若无法完成，回写 status=blocked 与 blocker，并保持 Checklist=[ ]。',
  '最后仅回复：task_id、status(done/blocked)、pr_or_commit、变更文件列表。'
].join(' ');

function parseArgs(argv) {
  const out = {
    taskKey: '',
    tasks: [],
    plan: '',
    prompt: DEFAULT_PROMPT,
    concurrency: 1,
    dryRun: false,
    printOnly: false,
    help: false
  };

  for (let i = 0; i < argv.length; i++) {
    const cur = String(argv[i] || '');
    if (cur === '--help' || cur === '-h') {
      out.help = true;
      continue;
    }
    if (cur === '--dry-run') {
      out.dryRun = true;
      continue;
    }
    if (cur === '--print-only' || cur === '--print') {
      out.printOnly = true;
      continue;
    }
    if ((cur === '--task-key' || cur === '--task') && i + 1 < argv.length) {
      out.taskKey = String(argv[++i] || '').trim();
      continue;
    }
    if (cur.startsWith('--task-key=')) {
      out.taskKey = cur.slice('--task-key='.length).trim();
      continue;
    }
    if (cur.startsWith('--task=')) {
      out.taskKey = cur.slice('--task='.length).trim();
      continue;
    }
    if (cur === '--tasks' && i + 1 < argv.length) {
      out.tasks = String(argv[++i] || '').split(',').map((x) => x.trim()).filter(Boolean);
      continue;
    }
    if (cur.startsWith('--tasks=')) {
      out.tasks = cur.slice('--tasks='.length).split(',').map((x) => x.trim()).filter(Boolean);
      continue;
    }
    if (cur === '--plan' && i + 1 < argv.length) {
      out.plan = String(argv[++i] || '').trim();
      continue;
    }
    if (cur.startsWith('--plan=')) {
      out.plan = cur.slice('--plan='.length).trim();
      continue;
    }
    if (cur === '--prompt' && i + 1 < argv.length) {
      out.prompt = String(argv[++i] || '').trim() || DEFAULT_PROMPT;
      continue;
    }
    if (cur.startsWith('--prompt=')) {
      out.prompt = cur.slice('--prompt='.length).trim() || DEFAULT_PROMPT;
      continue;
    }
    if (cur === '--concurrency' && i + 1 < argv.length) {
      out.concurrency = Number.parseInt(String(argv[++i] || ''), 10);
      continue;
    }
    if (cur.startsWith('--concurrency=')) {
      out.concurrency = Number.parseInt(cur.slice('--concurrency='.length), 10);
      continue;
    }
  }

  if (!Number.isFinite(out.concurrency) || out.concurrency < 1) out.concurrency = 1;
  if (out.tasks.length === 0 && out.taskKey) out.tasks = [out.taskKey];
  return out;
}

function sanitizeTaskKey(raw) {
  return String(raw || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 120);
}

function parseTaskKeyMeta(taskKey) {
  const m = String(taskKey || '').toLowerCase().match(/^m(\d+)-t(\d+)-([a-z0-9._-]+)$/);
  if (!m) return null;
  const milestone = `m${String(Number(m[1]))}`;
  const taskId = `T${String(Number(m[2])).padStart(3, '0')}`;
  const owner = String(m[3] || '').trim();
  if (!milestone || !taskId || !owner) return null;
  return { milestone, taskId, owner };
}

function listPlanFiles() {
  const activeDir = path.join(plansRoot, 'active');
  if (fs.existsSync(activeDir)) {
    return fs.readdirSync(activeDir)
      .filter((x) => x.endsWith('.plan.md') && x !== '_template.plan.md')
      .map((x) => path.join(activeDir, x))
      .sort();
  }
  if (!fs.existsSync(plansRoot)) return [];
  return fs.readdirSync(plansRoot)
    .filter((x) => x.endsWith('.plan.md') && x !== '_template.plan.md')
    .map((x) => path.join(plansRoot, x))
    .sort();
}

function findTaskInPlan(planAbs, taskId) {
  try {
    const lines = fs.readFileSync(planAbs, 'utf8').split(/\r?\n/);
    const start = lines.findIndex((line) => line.trim() === `- id: ${taskId}`);
    if (start < 0) return null;
    let end = lines.length;
    for (let i = start + 1; i < lines.length; i++) {
      if (/^- id:\s+\S+/.test(lines[i].trim())) {
        end = i;
        break;
      }
    }
    let owner = '';
    for (let i = start + 1; i < end; i++) {
      const m = lines[i].match(/^\s{2}owner:\s*(.*)$/);
      if (m) {
        owner = String(m[1] || '').trim().toLowerCase();
        break;
      }
    }
    return { owner };
  } catch (_) {
    return null;
  }
}

function resolvePlanFromTaskKey(taskKey) {
  const meta = parseTaskKeyMeta(taskKey);
  if (!meta) return '';

  const milestoneToken = `roadmap-${meta.milestone}-`;
  const planFiles = listPlanFiles().filter((abs) => path.basename(abs).toLowerCase().includes(milestoneToken));
  const withTask = planFiles
    .map((abs) => ({ abs, task: findTaskInPlan(abs, meta.taskId) }))
    .filter((x) => !!x.task);

  if (withTask.length === 0) return '';
  if (withTask.length === 1) return path.relative(rootDir, withTask[0].abs);

  const ownerMatched = withTask.filter((x) => x.task.owner === meta.owner);
  if (ownerMatched.length === 1) return path.relative(rootDir, ownerMatched[0].abs);

  const unassignedMatched = withTask.filter((x) => !x.task.owner || x.task.owner === 'unassigned');
  if (unassignedMatched.length === 1) return path.relative(rootDir, unassignedMatched[0].abs);

  return '';
}

function buildCommand(taskKey, plan, prompt) {
  return [
    'node',
    'bin/ai-home.js',
    'codex',
    'auto',
    'exec',
    '--task-key',
    taskKey,
    '--plan',
    plan,
    prompt
  ];
}

function quote(arg) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(arg)) return arg;
  return JSON.stringify(arg);
}

function printHelp() {
  console.log(`Usage:
  npm run plan:run -- --task-key m3-t002-alice
  npm run plan:run -- --tasks m3-t002-alice,m4-t003-erin

Options:
  --task-key, --task <key>     Single task key
  --tasks <k1,k2,...>          Batch task keys
  --plan <path>                Override plan path
  --prompt <text>              Override default prompt
  --concurrency <n>            Max parallel tasks for --tasks (default: 1)
  --dry-run                    Print commands and exit
  --print-only                 Same as --dry-run
  -h, --help                   Show help
`);
}

function runSingle(args, idx, total, options) {
  return new Promise((resolve) => {
    const startedAt = new Date();
    const taskKey = sanitizeTaskKey(args.taskKey);
    const plan = options.plan || resolvePlanFromTaskKey(taskKey);
    if (!taskKey || !plan) {
      console.error(`[plan-run] invalid task or unresolved/ambiguous plan: task=${taskKey} plan=${plan || '-'} (use --plan to bind explicitly)`);
      const endedAt = new Date();
      resolve({
        taskKey,
        plan,
        index: idx,
        total,
        cmd: [],
        exitCode: 1,
        startedAt: startedAt.toISOString(),
        finishedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime()
      });
      return;
    }

    const cmd = buildCommand(taskKey, plan, options.prompt);
    const pretty = cmd.map(quote).join(' ');
    console.log(`\n[plan-run] (${idx}/${total}) ${taskKey}`);
    console.log(`[plan-run] cmd: ${pretty}`);

    if (options.dryRun || options.printOnly) {
      const endedAt = new Date();
      resolve({
        taskKey,
        plan,
        index: idx,
        total,
        cmd,
        exitCode: 0,
        startedAt: startedAt.toISOString(),
        finishedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime()
      });
      return;
    }

    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env
    });

    child.on('exit', (code) => {
      const endedAt = new Date();
      resolve({
        taskKey,
        plan,
        index: idx,
        total,
        cmd,
        exitCode: Number(code) || 0,
        startedAt: startedAt.toISOString(),
        finishedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime()
      });
    });
    child.on('error', () => {
      const endedAt = new Date();
      resolve({
        taskKey,
        plan,
        index: idx,
        total,
        cmd,
        exitCode: 1,
        startedAt: startedAt.toISOString(),
        finishedAt: endedAt.toISOString(),
        durationMs: endedAt.getTime() - startedAt.getTime()
      });
    });
  });
}

async function runWithConcurrency(taskKeys, options) {
  const total = taskKeys.length;
  const concurrency = Math.max(1, Math.min(options.concurrency, total));
  const results = new Array(total);
  let cursor = 0;
  let active = 0;

  return new Promise((resolve) => {
    const launchNext = () => {
      while (active < concurrency && cursor < total) {
        const index = cursor;
        cursor += 1;
        active += 1;
        runSingle({ taskKey: taskKeys[index] }, index + 1, total, options)
          .then((result) => {
            results[index] = result;
          })
          .finally(() => {
            active -= 1;
            if (cursor >= total && active === 0) {
              resolve(results);
              return;
            }
            launchNext();
          });
      }
    };
    launchNext();
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  if (parsed.help) {
    printHelp();
    process.exit(0);
  }

  if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
    console.error('[plan-run] missing --task-key/--task or --tasks');
    printHelp();
    process.exit(1);
  }

  const startedAt = new Date();
  const results = await runWithConcurrency(parsed.tasks, parsed);
  const finishedAt = new Date();
  const failed = results.filter((r) => !r || r.exitCode !== 0);
  const summary = {
    type: 'plan-run-summary',
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationMs: finishedAt.getTime() - startedAt.getTime(),
    total: results.length,
    succeeded: results.length - failed.length,
    failed: failed.length,
    concurrency: Math.max(1, Math.min(parsed.concurrency, results.length || 1)),
    results: results.map((r) => ({
      taskKey: r.taskKey,
      plan: r.plan,
      exitCode: r.exitCode,
      status: r.exitCode === 0 ? 'success' : 'failed',
      startedAt: r.startedAt,
      finishedAt: r.finishedAt,
      durationMs: r.durationMs
    }))
  };
  console.log(`[plan-run] summary-json: ${JSON.stringify(summary)}`);
  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`[plan-run] unexpected error: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
