#!/usr/bin/env node

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const rootDir = path.resolve(__dirname, '..');

function parseArgs(argv) {
  const out = {
    plan: '',
    goal: '',
    dryRun: false,
    help: false
  };
  for (let i = 0; i < argv.length; i++) {
    const cur = String(argv[i] || '');
    if (cur === '--help' || cur === '-h') out.help = true;
    else if (cur === '--dry-run') out.dryRun = true;
    else if ((cur === '--plan' || cur === '-p') && i + 1 < argv.length) out.plan = String(argv[++i] || '').trim();
    else if (cur.startsWith('--plan=')) out.plan = cur.slice('--plan='.length).trim();
    else if ((cur === '--goal' || cur === '-g') && i + 1 < argv.length) out.goal = String(argv[++i] || '').trim();
    else if (cur.startsWith('--goal=')) out.goal = cur.slice('--goal='.length).trim();
  }
  return out;
}

function resolveOrchestratorSkillToken() {
  const candidates = [
    { token: '$aih-task-orchestrator', file: path.join(rootDir, 'skills', 'aih-task-orchestrator', 'SKILL.md') },
    { token: '$project-plan-coordinator', file: path.join(rootDir, 'skills', 'project-plan-coordinator', 'SKILL.md') },
    { token: '$plan-orchestrator', file: path.join(rootDir, 'skills', 'plan-orchestrator', 'SKILL.md') }
  ];
  for (const c of candidates) {
    if (fs.existsSync(c.file)) return c.token;
  }
  return '$plan-orchestrator';
}

function quote(arg) {
  if (/^[a-zA-Z0-9_./:-]+$/.test(arg)) return arg;
  return JSON.stringify(arg);
}

function printHelp() {
  console.log(`Usage:\n  npm run plan:orchestrate -- --plan plans/active/roadmap-m4-remote-runtime-2026-03-01.plan.md --goal "派发下一批并行任务"\n\nOptions:\n  --plan, -p <path>   Target plan file\n  --goal, -g <text>   Coordinator goal\n  --dry-run           Print command only\n  -h, --help          Show help\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.plan) {
    printHelp();
    process.exit(args.help ? 0 : 1);
  }

  const skill = resolveOrchestratorSkillToken();
  const goal = args.goal || '请根据当前看板状态继续派发并行任务，并确保执行者闭环回写 done/blocked。';
  const prompt = `使用 ${skill} skill。目标计划文件：${args.plan}。${goal}`;

  const cmd = [
    'node', 'bin/ai-home.js', 'codex', 'auto', 'exec',
    '--plan', args.plan,
    prompt
  ];

  console.log('[plan-orchestrate] cmd:', cmd.map(quote).join(' '));
  if (args.dryRun) process.exit(0);

  const child = spawn(cmd[0], cmd.slice(1), {
    cwd: rootDir,
    stdio: 'inherit',
    env: process.env
  });
  child.on('exit', (code) => process.exit(Number(code) || 0));
  child.on('error', () => process.exit(1));
}

main();
