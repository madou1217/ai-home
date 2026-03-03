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
- [x] T002 Proxy management restart API for client control
- [x] T003 Proxy daemon restart/apply config behavior hardening
- [x] T004 Proxy serve arg contract for port and api_key hardening
- [x] T005 Desktop Tauri proxy control command bridge
- [x] T006 Desktop dashboard serve control panel
- [x] T007 Desktop session history and continue-chat panel
- [x] T008 Regression tests and API contract docs update

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: CLI session history and resume query contract hardening
  scope: Provide stable session history payload and resume lookup contract for client consumption.
  status: done
  owner: cs001
  claimed_at: 2026-03-02T10:35:49+08:00
  done_at: 2026-03-02T10:38:30+08:00
  priority: P0
  depends_on: []
  branch: feat/cs001-m6-t001
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Stable machine-readable session list and continue-chat lookup path.
  acceptance:
  - Session list includes enough metadata for client-side continuation selection.
  - Continue-chat path can resume by session_id without ambiguous fallback.
  files:
  - bin/ai-home.js

- id: T002
  title: Proxy management restart API for client control
  scope: Add/revise management endpoint contract for proxy restart and control-plane trigger from client.
  status: done
  owner: cs002
  claimed_at: 2026-03-02T10:35:50+08:00
  done_at: 2026-03-02T06:20:36Z
  priority: P0
  depends_on: []
  branch: feat/cs002-m6-t002
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Auth-protected management API that supports restart control.
  acceptance:
  - Management API exposes explicit restart action with deterministic result payload.
  - Unauthorized/invalid requests return stable machine-readable errors.
  files:
  - lib/proxy/management-router.js

- id: T003
  title: Proxy daemon restart/apply config behavior hardening
  scope: Ensure daemon restart behavior applies requested runtime config safely and predictably.
  status: done
  owner: cs003
  claimed_at: 2026-03-02T10:35:51+08:00
  done_at: 2026-03-02T10:37:54+08:00
  priority: P0
  depends_on: [T002]
  branch: feat/cs003-m6-t003
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Reliable restart flow with clear applied-config snapshot.
  acceptance:
  - Restart applies requested config and reports final listen settings.
  - Failed restart does not leave stale pid or half-running state.
  files:
  - lib/proxy/daemon.js

- id: T004
  title: Proxy serve arg contract for port and api_key hardening
  scope: Harden serve arg/env parsing contract for port and api_key settings consumed by client.
  status: done
  owner: cs004
  claimed_at: 2026-03-02T10:35:52+08:00
  done_at: 2026-03-02T10:44:22+08:00
  priority: P0
  depends_on: [T002, T003]
  branch: feat/cs004-m6-t004
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Strict and deterministic parsing/validation for port and api_key.
  acceptance:
  - Port/api_key validation errors are explicit and machine-readable.
  - Final effective config can be surfaced consistently to client.
  files:
  - lib/proxy/args.js

- id: T005
  title: Desktop Tauri proxy control command bridge
  scope: Add Tauri command bridge so desktop client can trigger proxy restart and update serve config.
  status: done
  owner: cs005
  claimed_at: 2026-03-02T10:35:53+08:00
  done_at: 2026-03-02T05:29:14Z
  priority: P0
  depends_on: [T002, T003, T004]
  branch: feat/cs005-m6-t005
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Tauri backend command surface for proxy control actions.
  acceptance:
  - Desktop backend exposes restart/set-port/set-api-key commands for GUI.
  - Command response schema is stable for frontend mapping.
  files:
  - desktop/tauri/src-tauri/src/commands/proxy.rs

- id: T006
  title: Desktop dashboard serve control panel
  scope: Implement dashboard panel for proxy restart and serve config (port/api_key) control.
  status: done
  owner: cs006
  claimed_at: 2026-03-02T10:35:54+08:00
  done_at: 2026-03-02T02:38:33Z
  priority: P1
  depends_on: [T005]
  branch: feat/cs006-m6-t006
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: GUI controls for restart + port/api_key edit and status feedback.
  acceptance:
  - User can set port/api_key and trigger restart from dashboard in <=2 interactions.
  - UI displays last apply result and current running status.
  files:
  - desktop/tauri/src/views/dashboard.tsx

- id: T007
  title: Desktop session history and continue-chat panel
  scope: Add client session tracking panel with resume action for historical sessions.
  status: done
  owner: wsgz007
  claimed_at: 2026-03-02T17:07:14+08:00
  done_at: 2026-03-02T09:08:29Z
  priority: P1
  depends_on: [T001]
  branch: feat/wsgz007-m6-t007
  pr_or_commit: local-uncommitted
  blocker: 
  deliverable: Session history list with continue-chat action bound to session_id.
  acceptance:
  - User can browse recent sessions and continue selected session directly.
  - Resume failures show actionable diagnostics and fallback hints.
  files:
  - desktop/tauri/src/views/session-launcher.tsx

## Activity Log
- 2026-03-02T06:40:24Z [worker-codex] Continued interrupted original session for T007 (session_id=019cac67-161c-7b53-a396-e40dfc104474); blocked closure finalized: status=blocked, done_at=2026-03-02T06:40:24Z, pr_or_commit=0916d2c, checklist [ ], blocker=concurrent_plan_write_conflict_t007_section_overwritten_outside_task_scope.

- 2026-03-02T08:34:28.813Z [operator] Reopened blocked tasks as todo for re-dispatch: T007.

- 2026-03-02T16:35:22+08:00 [aih-auto] Claimed T007 (m6-t007-wsgz007) owner=wsgz007 branch=feat/wsgz007-m6-t007.

- 2026-03-02T16:35:24+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:35:27+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:35:29+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:35:31+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:35:53+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:43:52+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:51:55+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:53:55+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T08:54:32.985Z [operator] Reopened blocked tasks as todo for watchdog-disabled serial dispatch: T007.

- 2026-03-02T16:55:09+08:00 [aih-auto] Claimed T007 (m6-t007-wsgz007) owner=wsgz007 branch=feat/wsgz007-m6-t007.

- 2026-03-02T16:56:34+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:58:02+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T16:58:17+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T17:00:55+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T17:02:07+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T17:03:10+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T17:06:05+08:00 [ai-watchdog] Marked T007 blocked: worker offline and no recoverable session.

- 2026-03-02T09:06:54.279Z [operator] Reset tasks to todo for foreground session relaunch: T007.

- 2026-03-02T17:07:14+08:00 [aih-auto] Claimed T007 (m6-t007-wsgz007) owner=wsgz007 branch=feat/wsgz007-m6-t007.

- 2026-03-02T09:08:29Z [worker-codex] Completed T007 closure: verified desktop session history + continue-chat panel acceptance in desktop/tauri/src/views/session-launcher.tsx; validated `node --test test/desktop.gui.smoke.e2e.test.js` (6/6 pass) and `node --test test/client.auth-session.e2e.test.js` (2/2 pass); synced status=done/checklist [x]/pr_or_commit=local-uncommitted.
