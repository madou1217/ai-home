# Plan: m6-unblock-wave3

- plan_id: m6-unblock-wave3-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T12:12:32+08:00
- updated_at: 2026-03-02T17:10:07+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Unblock blocked tasks caused by missing proxy command bridge file.
- [ ] Unblock remote connector task locked by relaunch-window policy.
- [ ] Close blocker-led tasks and resync checklist/status.

## Checklist
- [ ] T001 Add missing desktop proxy command bridge file
- [ ] T002 Register proxy command bridge in Tauri command surface
- [ ] T003 Remote connector relaunch-window unblock and retry policy fix
- [ ] T004 Blocked task reconciliation and closure audit

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Add missing desktop proxy command bridge file
  scope: Create and wire the missing `proxy.rs` command module required by blocked desktop control tasks.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/ub001-m6-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - Missing-file blocker for T005 is removed.
  - Command module builds with existing commands namespace.
  files:
  - desktop/tauri/src-tauri/src/commands/proxy.rs

- id: T002
  title: Register proxy command bridge in Tauri command surface
  scope: Hook newly added proxy command module into main Tauri invoke handler map.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/ub002-m6-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - `main.rs` command registration includes proxy command handlers.
  - Desktop bridge blocker for T008 is removed.
  files:
  - desktop/tauri/src-tauri/src/main.rs

- id: T003
  title: Remote connector relaunch-window unblock and retry policy fix
  scope: Address connector behavior causing repeated relaunch-window exhaustion and blocked state.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  branch: feat/w1la003-m6-t003
  pr_or_commit: 
  deliverable: Connector retry behavior no longer enters avoidable relaunch-loop block.
  acceptance:
  - T001 remote connector task can move from blocked to doing/done.
  - Retry outcomes are deterministic with explicit error classification.
  files:
  - lib/remote/connector.js

  blocker: 
- id: T004
  title: Blocked task reconciliation and closure audit
  scope: Reconcile blocked tasks after unblock fixes and ensure status/checklist/activity log consistency.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002, T003]
  branch: feat/ub004-m6-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - `m6-client-session-serve-control` T005/T008 and `m4-remote-runtime-wave1` T001 statuses are reconciled.
  - Checklist/status parity holds after reconciliation.
  files:
  - plans/active/roadmap-m6-client-session-serve-control-2026-03-02.plan.md
  - plans/active/roadmap-m4-remote-runtime-wave1-2026-03-02.plan.md

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
