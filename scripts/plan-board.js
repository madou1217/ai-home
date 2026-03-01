#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const os = require('os');

const rootDir = path.resolve(__dirname, '..');
const plansDir = path.join(rootDir, 'plans');
const showAll = process.argv.includes('--all');
const sessionRegistryPath = path.join(os.homedir(), '.ai_home', 'codex_task_sessions.json');

function readPlanFiles() {
  if (!fs.existsSync(plansDir)) return [];
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
  const header = ['plan', 'task', 'check', 'status', 'owner', 'session_id', 'title', 'branch', 'claimed_at'];
  const all = [header, ...rows];
  const widths = header.map((_, idx) => Math.max(...all.map((r) => String(r[idx] || '').length)));
  const fmt = (r) => r.map((v, i) => String(v || '').padEnd(widths[i], ' ')).join(' | ');

  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('-|-'));
  rows.forEach((r) => console.log(fmt(r)));
}

function readPlanSessionMap() {
  if (!fs.existsSync(sessionRegistryPath)) return new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(sessionRegistryPath, 'utf8'));
    const plans = parsed && typeof parsed === 'object' && parsed.plans && typeof parsed.plans === 'object'
      ? parsed.plans
      : {};
    const map = new Map();
    Object.values(plans).forEach((entry) => {
      if (!entry || !entry.planPath || !entry.sessionId) return;
      map.set(path.resolve(entry.planPath), String(entry.sessionId));
    });
    return map;
  } catch (e) {
    return new Map();
  }
}

const planFiles = readPlanFiles();
if (planFiles.length === 0) {
  console.log('[board] no plan files found under plans/*.plan.md');
  process.exit(0);
}

const rows = [];
const planSessionMap = readPlanSessionMap();
let total = 0;
let doing = 0;
let blocked = 0;
let todo = 0;
let done = 0;

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
      const sid = planSessionMap.get(path.resolve(absPath)) || '-';
      rows.push([
        planName,
        t.id,
        checked ? '[x]' : '[ ]',
        t.status || '-',
        t.owner || '-',
        sid,
        t.title || '-',
        t.branch || '-',
        t.claimedAt || '-'
      ]);
    }
  });
}

console.log('AIH Subagent Task Board');
console.log(`summary: total=${total}, doing=${doing}, blocked=${blocked}, todo=${todo}, done=${done}`);

if (rows.length === 0) {
  console.log(showAll ? '[board] no tasks found' : '[board] no active tasks (doing/blocked)');
  process.exit(0);
}

renderTable(rows);
if (!showAll) {
  console.log('\nHint: run `npm run plan:board -- --all` to view all tasks.');
}
