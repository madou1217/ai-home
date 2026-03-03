# Plan: m6-client-session-serve-control

- plan_id: m6-client-session-serve-control-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T10:31:20+08:00
- updated_at: 2026-03-02T09:08:29Z
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Add client session tracking so historical sessions can be resumed from client UI.
- [ ] Add client-capable serve lifecycle controls: restart, port config, api_key config.
- [ ] Add regression coverage for session history/continue and serve control APIs.

## Checklist
- [ ] T001 CLI session history and resume query contract hardening
- [ ] T002 Proxy management restart API for client control
- [ ] T003 Proxy daemon restart/apply config behavior hardening
- [ ] T004 Proxy serve arg contract for port and api_key hardening
- [ ] T005 Desktop Tauri proxy control command bridge
- [ ] T006 Desktop dashboard serve control panel
- [ ] T007 Desktop session history and continue-chat panel
- [ ] T008 Regression tests and API contract docs update

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: CLI session history and resume query contract hardening
  scope: Provide stable session history payload and resume lookup contract for client consumption.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/cs001-m6-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - Session list includes enough metadata for client-side continuation selection.
  - Continue-chat path can resume by session_id without ambiguous fallback.
  files:
  - bin/ai-home.js

- id: T002
  title: Proxy management restart API for client control
  scope: Add/revise management endpoint contract for proxy restart and control-plane trigger from client.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/cs002-m6-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - Management API exposes explicit restart action with deterministic result payload.
  - Unauthorized/invalid requests return stable machine-readable errors.
  files:
  - lib/proxy/management-router.js

- id: T003
  title: Proxy daemon restart/apply config behavior hardening
  scope: Ensure daemon restart behavior applies requested runtime config safely and predictably.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002]
  branch: feat/cs003-m6-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - Restart applies requested config and reports final listen settings.
  - Failed restart does not leave stale pid or half-running state.
  files:
  - lib/proxy/daemon.js

- id: T004
  title: Proxy serve arg contract for port and api_key hardening
  scope: Harden serve arg/env parsing contract for port and api_key settings consumed by client.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002, T003]
  branch: feat/cs004-m6-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - Port/api_key validation errors are explicit and machine-readable.
  - Final effective config can be surfaced consistently to client.
  files:
  - lib/proxy/args.js

- id: T005
  title: Desktop Tauri proxy control command bridge
  scope: Add Tauri command bridge so desktop client can trigger proxy restart and update serve config.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002, T003, T004]
  branch: feat/cs005-m6-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - Desktop backend exposes restart/set-port/set-api-key commands for GUI.
  - Command response schema is stable for frontend mapping.
  files:
  - desktop/tauri/src-tauri/src/commands/proxy.rs

- id: T006
  title: Desktop dashboard serve control panel
  scope: Implement dashboard panel for proxy restart and serve config (port/api_key) control.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T005]
  branch: feat/cs006-m6-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - User can set port/api_key and trigger restart from dashboard in <=2 interactions.
  - UI displays last apply result and current running status.
  files:
  - desktop/tauri/src/views/dashboard.tsx

- id: T007
  title: Desktop session history and continue-chat panel
  scope: Add client session tracking panel with resume action for historical sessions.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001]
  branch: feat/wsgz007-m6-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - User can browse recent sessions and continue selected session directly.
  - Resume failures show actionable diagnostics and fallback hints.
  files:
  - desktop/tauri/src/views/session-launcher.tsx

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
