# Plan: m3-gui-production-critical

- plan_id: m3-gui-production-critical-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T02:41:33+08:00
- updated_at: 2026-03-01T18:52:50Z
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Close GUI production blockers for account status and session launch reliability.
- [ ] Make packaged mode errors actionable in UI and backend diagnostics.
- [ ] Add regression gates for GUI core account/session flow.

## Checklist
- [ ] T001 Desktop backend account command reliability hardening
- [ ] T002 Desktop runtime diagnostics contract hardening
- [ ] T003 Dashboard account state and error guidance hardening
- [ ] T004 Session launcher preflight and retry hardening
- [ ] T005 GUI production regression and release gate update

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Desktop backend account command reliability hardening
  scope: Stabilize backend command handlers for account listing/default switch/add account paths used by GUI.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/g000001-m3-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - Account list/default switch/add account commands return consistent success/error payloads.
  - Failure cases include machine-readable error codes for frontend mapping.
  files:
  - desktop/tauri/src-tauri/src/main.rs

- id: T002
  title: Desktop runtime diagnostics contract hardening
  scope: Improve runtime resolution diagnostics for packaged mode and expose deterministic reasons for failures.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/g000002-m3-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - Runtime bootstrap errors include explicit category and next-step hint.
  - Diagnostics output is stable for smoke-test assertions.
  files:
  - desktop/tauri/src-tauri/src/runtime.rs

- id: T003
  title: Dashboard account state and error guidance hardening
  scope: Harden dashboard account panel for runtime/account failures with clear user guidance and deterministic UI states.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001, T002]
  branch: feat/g000003-m3-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - Dashboard status and error states map 1:1 to backend/runtime error codes.
  - User sees actionable next step for common packaged-mode failures.
  files:
  - desktop/tauri/src/views/dashboard.tsx

- id: T004
  title: Session launcher preflight and retry hardening
  scope: Add launcher preflight checks, retry boundaries, and clearer failed-launch diagnostics.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001, T002]
  branch: feat/g000004-m3-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - Launcher performs preflight validation before spawn.
  - Retry/timeout behavior and diagnostic message are deterministic.
  files:
  - desktop/tauri/src/views/session-launcher.tsx

- id: T005
  title: GUI production regression and release gate update
  scope: Update smoke tests and release checklist to gate account/session core path in packaged mode.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T003, T004]
  branch: feat/w000005-m3-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - Smoke tests cover account status + session launch success/failure path.
  - Release checklist includes explicit GUI core-path go/no-go items.
  files:
  - test/desktop.gui.smoke.e2e.test.js
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
