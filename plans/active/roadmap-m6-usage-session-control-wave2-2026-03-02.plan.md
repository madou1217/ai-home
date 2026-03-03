# Plan: m6-usage-session-control-wave2

- plan_id: m6-usage-session-control-wave2-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T10:44:21+08:00
- updated_at: 2026-03-03T11:49:04+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Add usage refresh scheduler and threshold-based auto account switching.
- [ ] Add persistent unified permission policy for exec sessions.
- [x] Add session list delete/manual account switch/auto switch while preserving session continuity.
- [ ] Expose all controls in desktop client.

## Checklist
- [ ] T001 Usage scheduler core (1m/3m/hourly lanes)
- [ ] T002 Threshold-based auto switch engine
- [ ] T003 Usage scheduler config persistence and defaults
- [ ] T004 Session registry delete/retain semantics
- [ ] T005 Session resume with manual account override
- [ ] T006 Unified persistent permission policy
- [ ] T007 Desktop settings panel for usage threshold and intervals
- [ ] T008 Desktop session list actions (delete/manual/auto switch)
- [ ] T009 API/CLI docs and regression tests

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Usage scheduler core (1m/3m/hourly lanes)
  scope: Implement periodic usage refresh scheduler lanes for active account and background accounts.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/usg001-m6-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - Active account refresh interval can be set to 1m or 3m.
  - Non-active accounts refresh lane runs hourly by default.
  files:
  - lib/usage/scheduler.js

- id: T002
  title: Threshold-based auto switch engine
  scope: Auto-switch account when usage threshold is crossed and target account is available.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/usg002-m6-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - Threshold can be configured and evaluated from trusted usage snapshots.
  - Switch decisions are auditable and avoid exhausted accounts.
  files:
  - lib/usage/threshold-switch.js

- id: T003
  title: Usage scheduler config persistence and defaults
  scope: Persist refresh interval and threshold config at repo/user runtime level.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002]
  branch: feat/usg003-m6-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - Config supports active_refresh_interval, background_refresh_interval, threshold_pct.
  - Missing config falls back to safe defaults.
  files:
  - lib/usage/config-store.js

- id: T004
  title: Session registry delete/retain semantics
  scope: Add explicit session deletion behavior without corrupting other session links.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/usg004-m6-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - Users can delete selected session entries cleanly.
  - Deleting one session does not impact other session bindings.
  files:
  - lib/session/session-registry.js

- id: T005
  title: Session resume with manual account override
  scope: Resume existing session with manual account selection or auto-select while preserving session continuity.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T004]
  branch: feat/usg005-m6-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - Manual account override can continue a selected session.
  - Auto-select path can continue same session when account rotates.
  files:
  - bin/ai-home.js

- id: T006
  title: Unified persistent permission policy
  scope: Persist and apply a unified exec permission policy to avoid repetitive full-access prompts.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/woy1006-m6-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - Full access preference can be stored and reused across exec sessions.
  - Policy change takes effect without manual per-session reconfiguration.
  files:
  - lib/runtime/permission-policy.js

- id: T007
  title: Desktop settings panel for usage threshold and intervals
  scope: Add client UI controls for refresh cadence and threshold settings.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002, T003]
  branch: feat/usg007-m6-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - User can set active refresh interval and threshold from client UI.
  - Settings persist and reflect effective runtime values.
  files:
  - desktop/tauri/src/views/settings.tsx

- id: T008
  title: Desktop session list actions (delete/manual/auto switch)
  scope: Add session list controls for delete session and continue with manual/auto account mode.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T004, T005]
  branch: feat/woy1008-m6-t008
  pr_or_commit: 
  blocker: 
  acceptance:
  - Session list supports delete action.
  - Continue action supports manual account select and auto-select mode.
  files:
  - desktop/tauri/src/views/sessions.tsx

- id: T009
  title: API/CLI docs and regression tests
  scope: Add tests and docs for usage scheduler, threshold switch, permission policy, and session controls.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  depends_on: [T001, T002, T003, T004, T005, T006, T007, T008]
  branch: feat/woy1009-m6-t009
  pr_or_commit: 
  blocker: 
  acceptance:
  - Regression tests validate switching and session continuity paths.
  - Docs describe interval/threshold semantics and client operations.
  files:
  - test/usage.scheduler.test.js
  - test/session.management.test.js
  - docs/product/usage-threshold-and-session-control.md

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
