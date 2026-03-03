#!/usr/bin/env node

const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const boardScript = path.join(rootDir, 'scripts', 'plan-board.js');

function parseArgs(argv) {
  const out = {
    all: false,
    intervalSec: 1,
    once: false
  };
  for (let i = 0; i < argv.length; i++) {
    const cur = String(argv[i] || '');
    if (cur === '--all') out.all = true;
    else if (cur === '--once') out.once = true;
    else if (cur === '--interval-sec' && i + 1 < argv.length) out.intervalSec = Number.parseInt(String(argv[++i] || ''), 10);
    else if (cur.startsWith('--interval-sec=')) out.intervalSec = Number.parseInt(cur.split('=')[1], 10);
  }
  if (!Number.isFinite(out.intervalSec) || out.intervalSec < 1) out.intervalSec = 1;
  return out;
}

function readBoardJson(all) {
  const args = [boardScript, '--json'];
  if (all) args.push('--all');
  const out = execFileSync('node', args, {
    cwd: rootDir,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024
  });
  return JSON.parse(String(out || '{}'));
}

function truncate(v, n) {
  const s = String(v || '');
  if (s.length <= n) return s;
  if (n <= 1) return s.slice(0, n);
  return `${s.slice(0, n - 1)}…`;
}

function renderTable(rows) {
  const header = ['plan', 'status', 'task_key', 'binding_state', 'ai_type', 'account_id', 'session_id', 'proc', 'title', 'branch', 'claimed_at'];
  const widths = [30, 8, 18, 16, 7, 10, 36, 6, 32, 24, 11];
  const allRows = [header, ...rows];
  const fmt = (r) => r.map((v, i) => truncate(v, widths[i]).padEnd(widths[i], ' ')).join(' | ');
  const sep = widths.map((w) => '-'.repeat(w)).join('-|-');
  console.log(fmt(header));
  console.log(sep);
  allRows.slice(1).forEach((r) => console.log(fmt(r)));
}

function clearIfTty() {
  if (process.stdout.isTTY) process.stdout.write('\x1Bc');
}

function nowLocalText() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let lastSig = '';
  let lastChangeAt = '';
  let running = false;

  const tick = () => {
    if (running) return;
    running = true;
    try {
      const board = readBoardJson(opts.all);
      const sig = JSON.stringify({
        summary: board.summary || {},
        tasks: Array.isArray(board.tasks) ? board.tasks.map((t) => [
          t.plan,
          t.task,
          t.status,
          t.binding_state,
          t.ai_type,
          t.account_id,
          t.session_id,
          t.pid,
          t.alive,
          t.title,
          t.branch,
          t.claimed_at
        ]) : []
      });
      if (sig !== lastSig) {
        lastSig = sig;
        lastChangeAt = nowLocalText();
      }
      clearIfTty();
      const s = board.summary || {};
      console.log('AIH Live Task Board');
      console.log(`now=${nowLocalText()}  last_change=${lastChangeAt || '-'}  interval=${opts.intervalSec}s  scope=${opts.all ? 'all' : 'active'}`);
      console.log(`summary: total=${s.total || 0}, doing=${s.doing || 0}, blocked=${s.blocked || 0}, todo=${s.todo || 0}, done=${s.done || 0}, stale_bindings=${s.stale_bindings || 0}, invalid_bindings=${s.invalid_bindings || 0}`);
      const tasks = Array.isArray(board.tasks) ? board.tasks : [];
      if (tasks.length === 0) {
        console.log(opts.all ? '[board-live] no tasks found' : '[board-live] no active tasks');
      } else {
        const rows = tasks.map((t) => ([
          t.plan || '-',
          t.status || '-',
          t.task_key || '-',
          t.binding_state || '-',
          t.ai_type || '-',
          t.account_id || '-',
          t.session_id || '-',
          t.pid || '-',
          t.title || '-',
          t.branch || '-',
          t.claimed_at || '-'
        ]));
        renderTable(rows);
      }
      if (!opts.once) {
        console.log('\nPress Ctrl+C to exit.');
      }
    } catch (e) {
      clearIfTty();
      console.log('AIH Live Task Board');
      console.log(`now=${nowLocalText()}  interval=${opts.intervalSec}s  scope=${opts.all ? 'all' : 'active'}`);
      console.log(`[board-live] read error: ${e && e.message ? e.message : String(e)}`);
    } finally {
      running = false;
    }
  };

  tick();
  if (opts.once) return;
  setInterval(tick, opts.intervalSec * 1000);
}

main();
