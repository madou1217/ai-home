# Plan: m3-desktop-runtime-hotfix

- plan_id: m3-desktop-runtime-hotfix-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T01:36:00+08:00
- updated_at: 2026-03-02T01:54:59+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Fix desktop packaged runtime so GUI works outside repo.
- [ ] Unblock account list/default switch/session launch in packaged app.
- [ ] Rebuild and verify mac arm installer with production path checks.

## Checklist
- [ ] T001 Desktop backend runtime resolver for packaged app
- [ ] T002 Bundle/runtime packaging wiring for CLI assets
- [ ] T003 Dashboard/launcher command-path + error contract hardening
- [ ] T004 Packaged-mode smoke tests and release verification notes

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Desktop backend runtime resolver for packaged app
  scope: Ensure Tauri backend can resolve executable/entrypoint in installed app instead of repo-only path.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/w000001-m3-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - Backend command execution no longer hard-depends on `bin/ai-home.js` existing in cwd/repo root.
  - Packaged-mode fallback path is explicit and returns actionable error if runtime missing.
  files:
  - desktop/tauri/src-tauri/src/main.rs
  - desktop/tauri/src-tauri/src/runtime.rs

- id: T002
  title: Bundle/runtime packaging wiring for CLI assets
  scope: Wire tauri bundle/build settings so packaged app carries required runtime assets.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/w000002-m3-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - Build config includes required runtime resources for packaged app.
  - Packaged app startup can find runtime assets using deterministic path.
  files:
  - desktop/tauri/src-tauri/tauri.conf.json
  - desktop/tauri/src-tauri/Cargo.toml

- id: T003
  title: Dashboard/launcher command-path + error contract hardening
  scope: Make UI flows robust when runtime path or command bootstrap fails.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/w000003-m3-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - Dashboard account actions surface packaged-runtime specific failure guidance.
  - Session launcher retries and diagnostics include runtime-path checks.
  files:
  - desktop/tauri/src/views/dashboard.tsx
  - desktop/tauri/src/views/session-launcher.tsx

- id: T004
  title: Packaged-mode smoke tests and release verification notes
  scope: Add tests/docs validating packaged-mode core flows and release gates.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T002, T003]
  branch: feat/w000004-m3-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - Smoke test covers packaged-mode command bootstrap and core flow health.
  - Release checklist explicitly gates packaged-mode account/session verification.
  files:
  - test/desktop.gui.smoke.e2e.test.js
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
