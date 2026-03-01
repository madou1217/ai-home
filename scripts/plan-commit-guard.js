#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const plansDir = path.join(rootDir, 'plans', 'active');

function run(cmd) {
  try {
    return String(execSync(cmd, { cwd: rootDir, encoding: 'utf8' }) || '').trim();
  } catch (e) {
    return '';
  }
}

function getStagedFiles() {
  const out = run('git diff --cached --name-only');
  if (!out) return [];
  return out.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
}

function isPlanOnlyCommit(files) {
  if (!files.length) return true;
  return files.every((f) => f.startsWith('plans/'));
}

function listActivePlans() {
  if (!fs.existsSync(plansDir)) return [];
  return fs.readdirSync(plansDir)
    .filter((x) => x.endsWith('.plan.md') && x !== '_template.plan.md')
    .map((x) => path.join(plansDir, x))
    .sort();
}

function parseDoingTasks(planPath) {
  const text = fs.readFileSync(planPath, 'utf8');
  const lines = text.split(/\r?\n/);
  const out = [];
  let current = null;

  function flush() {
    if (!current) return;
    if (current.status === 'doing' && current.owner && current.owner !== 'unassigned') {
      out.push(current);
    }
    current = null;
  }

  for (const line of lines) {
    const idMatch = line.match(/^- id:\s*(T\d+)/i);
    if (idMatch) {
      flush();
      current = {
        id: idMatch[1],
        owner: '',
        status: '',
        title: ''
      };
      continue;
    }
    if (!current) continue;
    const field = line.match(/^\s{2}([a-z_]+):\s*(.*)$/);
    if (!field) continue;
    const key = field[1];
    const val = String(field[2] || '').trim();
    if (key === 'owner') current.owner = val;
    if (key === 'status') current.status = val;
    if (key === 'title') current.title = val;
  }
  flush();
  return out;
}

function main() {
  const staged = getStagedFiles();
  if (!staged.length) process.exit(0);
  if (isPlanOnlyCommit(staged)) process.exit(0);

  const doing = [];
  listActivePlans().forEach((planPath) => {
    const planName = path.basename(planPath);
    parseDoingTasks(planPath).forEach((t) => {
      doing.push({
        plan: planName,
        id: t.id,
        owner: t.owner,
        title: t.title || ''
      });
    });
  });

  if (doing.length === 0) process.exit(0);

  console.error('\n[plan-guard] Blocked: there are active doing tasks.');
  console.error('[plan-guard] Close them to done/blocked in plan files before committing code.');
  doing.slice(0, 20).forEach((t) => {
    console.error(`  - ${t.plan} ${t.id} owner=${t.owner} title=${t.title}`);
  });
  if (doing.length > 20) {
    console.error(`  ... and ${doing.length - 20} more`);
  }
  console.error('\n[plan-guard] Allowed without closure: plan-only commit (files under plans/).');
  process.exit(1);
}

main();

