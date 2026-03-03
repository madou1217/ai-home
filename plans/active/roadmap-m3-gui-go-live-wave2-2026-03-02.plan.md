# Plan: m3-gui-go-live-wave2

- plan_id: m3-gui-go-live-wave2-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T02:59:50+08:00
- updated_at: 2026-03-02T10:21:57+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Complete GUI go-live wave2 hardening for launcher, migration, audit, and account operations.
- [ ] Ensure desktop GUI regression and release cutover gates are updated for production use.

## Checklist
- [ ] T001 Desktop shell navigation and global error boundary hardening
- [ ] T002 Desktop bootstrap/runtime initialization sequencing hardening
- [ ] T003 Audit log view query and pagination hardening
- [ ] T004 Migration view import/export workflow hardening
- [ ] T005 Account command response contract consistency hardening
- [ ] T006 GUI smoke regression and release cutover gate update

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Desktop shell navigation and global error boundary hardening
  scope: Strengthen desktop app shell state transitions and unhandled error fallback behavior.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/zmcn001-m3-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - Shell route/state transitions do not strand users in blank/error states.
  - Global error boundary renders actionable recovery guidance.
  files:
  - desktop/tauri/src/App.tsx

- id: T002
  title: Desktop bootstrap/runtime initialization sequencing hardening
  scope: Harden startup initialization order for runtime probes and UI readiness signals.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/zmcn002-m3-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - Startup sequence reports runtime-ready/runtime-degraded states explicitly.
  - UI bootstrap avoids race conditions between runtime probe and initial render.
  files:
  - desktop/tauri/src/main.tsx

- id: T003
  title: Audit log view query and pagination hardening
  scope: Stabilize audit log filtering, paging, and no-data/error states in desktop GUI.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/zmcn003-m3-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - Filter and pagination controls produce consistent results across refreshes.
  - Empty/error states provide explicit next-step hints.
  files:
  - desktop/tauri/src/views/audit-log.tsx

- id: T004
  title: Migration view import/export workflow hardening
  scope: Harden migration page interaction flow for import/export actions and conflict feedback.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/zmcn004-m3-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - Export/import actions provide deterministic success/failure messaging.
  - Conflict feedback includes clear recovery action for operators.
  files:
  - desktop/tauri/src/views/migration.tsx

- id: T005
  title: Account command response contract consistency hardening
  scope: Normalize account command payload codes and fields used by GUI account panel logic.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/zmcn005-m3-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - Account command responses include consistent code/message/data envelope.
  - GUI-facing failures remain machine-readable for deterministic mapping.
  files:
  - desktop/tauri/src-tauri/src/commands/accounts.rs

- id: T006
  title: GUI smoke regression and release cutover gate update
  scope: Expand smoke assertions and release cutover checklist for GUI go-live wave2.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002, T003, T004, T005]
  branch: feat/zmcn006-m3-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - Smoke test validates shell/bootstrap/account/migration/audit critical paths.
  - Cutover plan includes explicit go/no-go checks for GUI wave2.
  files:
  - test/desktop.gui.smoke.e2e.test.js
  - docs/release/pr-cutover-plan-2026-03-02.md

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
