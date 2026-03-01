#!/usr/bin/env node

const path = require('path');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

const DEFAULT_PROMPT = '继续执行当前任务：仅修改该任务 files 范围内文件并完成可运行实现；完成后本地 git commit（不要 push），只回复 commit hash 和文件列表。';

function parseArgs(argv) {
  const out = {
    taskKey: '',
    tasks: [],
    plan: '',
    prompt: DEFAULT_PROMPT,
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
  }

  if (out.tasks.length === 0 && out.taskKey) out.tasks = [out.taskKey];
  return out;
}

function sanitizeTaskKey(raw) {
  return String(raw || '').trim().replace(/[^a-zA-Z0-9._:-]/g, '_').slice(0, 120);
}

function resolvePlanFromTaskKey(taskKey) {
  const m = String(taskKey || '').toLowerCase().match(/^m(\d+)-t(\d+)-/);
  if (!m) return '';
  const milestone = `m${String(Number(m[1]))}`;
  if (milestone === 'm3') return 'plans/active/roadmap-m3-desktop-production-2026-03-01.plan.md';
  if (milestone === 'm4') return 'plans/active/roadmap-m4-remote-runtime-2026-03-01.plan.md';
  if (milestone === 'm5') return 'plans/active/roadmap-m5-mobile-command-center-2026-03-01.plan.md';
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
  --dry-run                    Print commands and exit
  --print-only                 Same as --dry-run
  -h, --help                   Show help
`);
}

function runSingle(args, idx, total, options) {
  return new Promise((resolve) => {
    const taskKey = sanitizeTaskKey(args.taskKey);
    const plan = options.plan || resolvePlanFromTaskKey(taskKey);
    if (!taskKey || !plan) {
      console.error(`[plan-run] invalid task or unresolved plan: task=${taskKey} plan=${plan}`);
      resolve(1);
      return;
    }

    const cmd = buildCommand(taskKey, plan, options.prompt);
    const pretty = cmd.map(quote).join(' ');
    console.log(`\n[plan-run] (${idx}/${total}) ${taskKey}`);
    console.log(`[plan-run] cmd: ${pretty}`);

    if (options.dryRun || options.printOnly) {
      resolve(0);
      return;
    }

    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: rootDir,
      stdio: 'inherit',
      env: process.env
    });

    child.on('exit', (code) => resolve(Number(code) || 0));
    child.on('error', () => resolve(1));
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

  for (let i = 0; i < parsed.tasks.length; i++) {
    const code = await runSingle({ taskKey: parsed.tasks[i] }, i + 1, parsed.tasks.length, parsed);
    if (code !== 0) {
      process.exit(code);
      return;
    }
  }
}

main().catch((e) => {
  console.error(`[plan-run] unexpected error: ${e && e.message ? e.message : e}`);
  process.exit(1);
});
