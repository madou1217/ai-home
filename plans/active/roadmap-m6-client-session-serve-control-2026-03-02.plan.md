# Plan: m6-client-session-serve-control

- plan_id: m6-client-session-serve-control-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T10:31:20+08:00
- updated_at: 2026-03-02T02:48:58Z
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
- [ ] T005 Desktop Tauri proxy control command bridge
- [x] T006 Desktop dashboard serve control panel
- [x] T007 Desktop session history and continue-chat panel
- [ ] T008 Regression tests and API contract docs update

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
  done_at: 2026-03-02T02:47:05Z
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
  status: blocked
  owner: cs005
  claimed_at: 2026-03-02T10:35:53+08:00
  done_at: 
  priority: P0
  depends_on: [T002, T003, T004]
  branch: feat/cs005-m6-t005
  pr_or_commit:
  blocker: watchdog_relaunch_exhausted_2_in_10m
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
  owner: cs007
  claimed_at: 2026-03-02T10:35:55+08:00
  done_at: 2026-03-02T02:48:02Z
  priority: P1
  depends_on: [T001]
  branch: feat/cs007-m6-t007
  pr_or_commit: 0916d2c
  blocker:
  deliverable: Session history list with continue-chat action bound to session_id.
  acceptance:
  - User can browse recent sessions and continue selected session directly.
  - Resume failures show actionable diagnostics and fallback hints.
  files:
  - desktop/tauri/src/views/session-launcher.tsx

- id: T008
  title: Regression tests and API contract docs update
  scope: Add/adjust tests and docs for session tracking, continue-chat, restart, port/api_key controls.
  status: doing
  owner: cs008
  claimed_at: 2026-03-02T10:35:56+08:00
  done_at: 
  priority: P1
  depends_on: [T002, T003, T004, T005, T006, T007]
  branch: feat/cs008-m6-t008
  pr_or_commit: local-uncommitted
  blocker: upstream_restart_and_desktop_bridge_contract_not_implemented_yet
  deliverable: Tests and docs proving client control-plane and session continuity paths.
  acceptance:
  - Automated tests cover restart endpoint and session-continue happy/error paths.
  - Docs define client-visible API request/response fields.
  files:
  - test/proxy.management-router.test.js
  - test/proxy.entry.test.js
  - test/desktop.gui.smoke.e2e.test.js
  - docs/product/client-session-and-serve-control.md

## Activity Log
- 2026-03-02T10:31:20+08:00 [coordinator] Plan created for client session tracking + serve restart/port/api_key control.

- 2026-03-02T10:35:49+08:00 [aih-auto] Claimed T001 (m6-t001-cs001) owner=cs001 branch=feat/cs001-m6-t001.

- 2026-03-02T10:35:50+08:00 [aih-auto] Claimed T002 (m6-t002-cs002) owner=cs002 branch=feat/cs002-m6-t002.

- 2026-03-02T10:35:51+08:00 [aih-auto] Claimed T003 (m6-t003-cs003) owner=cs003 branch=feat/cs003-m6-t003.

- 2026-03-02T10:35:52+08:00 [aih-auto] Claimed T004 (m6-t004-cs004) owner=cs004 branch=feat/cs004-m6-t004.

- 2026-03-02T10:35:53+08:00 [aih-auto] Claimed T005 (m6-t005-cs005) owner=cs005 branch=feat/cs005-m6-t005.

- 2026-03-02T10:35:54+08:00 [aih-auto] Claimed T006 (m6-t006-cs006) owner=cs006 branch=feat/cs006-m6-t006.

- 2026-03-02T10:35:55+08:00 [aih-auto] Claimed T007 (m6-t007-cs007) owner=cs007 branch=feat/cs007-m6-t007.

- 2026-03-02T10:35:56+08:00 [aih-auto] Claimed T008 (m6-t008-cs008) owner=cs008 branch=feat/cs008-m6-t008.

- 2026-03-02T10:36:14+08:00 [ai-watchdog] Relaunched T001 (m6-t001-cs001) via resume session 019cac66-fe5a-7fd0-8812-cfdb74df69ea (attempt_window=1/2 in 10m).
- 2026-03-02T10:36:14+08:00 [ai-watchdog] Relaunched T002 (m6-t002-cs002) via resume session 019cac67-1332-7bb0-86f8-96611495e727 (attempt_window=1/2 in 10m).
- 2026-03-02T10:36:14+08:00 [ai-watchdog] Relaunched T003 (m6-t003-cs003) via resume session 019cac67-2372-7bb2-80eb-cbc9a9ca0909 (attempt_window=1/2 in 10m).
- 2026-03-02T10:36:14+08:00 [ai-watchdog] Relaunched T004 (m6-t004-cs004) via resume session 019cac67-0030-7b92-afb1-43b7bd565523 (attempt_window=1/2 in 10m).
- 2026-03-02T10:36:14+08:00 [ai-watchdog] Relaunched T005 (m6-t005-cs005) via resume session 019cac66-fdd9-7d93-80c8-bc27ced9146d (attempt_window=1/2 in 10m).
- 2026-03-02T10:36:14+08:00 [ai-watchdog] Relaunched T006 (m6-t006-cs006) via resume session 019cac67-0247-7f22-b4ca-5d141deb89b5 (attempt_window=1/2 in 10m).
- 2026-03-02T10:36:14+08:00 [ai-watchdog] Relaunched T007 (m6-t007-cs007) via resume session 019cac67-161c-7b53-a396-e40dfc104474 (attempt_window=1/2 in 10m).
- 2026-03-02T10:36:14+08:00 [ai-watchdog] Marked T008 blocked: worker offline and no recoverable session.

- 2026-03-02T10:36:25+08:00 [aih-auto] Claimed T008 (m6-t008-cs008) owner=cs008 branch=feat/cs008-m6-t008.

- 2026-03-02T10:37:01+08:00 [aih-auto] Claimed T008 (m6-t008-cs008) owner=cs008 branch=feat/cs008-m6-t008.
- 2026-03-02T02:38:33Z [cs006] Completed T006 (m6-t006-cs006): added dashboard proxy serve control panel with port/api_key apply+restart and runtime/apply status feedback; verification: `npm test -- test/desktop.gui.smoke.e2e.test.js`.
- 2026-03-02T10:37:54+08:00 [cs003] Continued interrupted session 019cac67-2372-7bb2-80eb-cbc9a9ca0909; hardened lib/proxy/daemon.js with deterministic appliedConfig snapshot, explicit restart() result contract, and stale pid cleanup after failed/offline process paths. Verification: `node --test test/proxy.management-router.test.js`, `node --test test/proxy.entry.test.js`, `node --test test/proxy.smoke.test.js` (all pass). Closed T003 with checklist synced and pr_or_commit=local-uncommitted.
- 2026-03-02T10:38:30+08:00 [cs004] Continued interrupted session 019cac67-0030-7b92-afb1-43b7bd565523; hardened lib/proxy/args.js port/api_key contract (strict port range 1-65535, --api-key support with AIH_PROXY_API_KEY env alias, explicit error code/detail fields, and consistent apiKey/apiKeyConfigured output), verified via `node --test test/proxy.entry.test.js test/proxy.smoke.test.js` (4/4 pass), and closed T004 with checklist synced/pr_or_commit=local-uncommitted.
- 2026-03-02T10:40:06+08:00 [cs008] Continued interrupted task in current session; implemented T008 file-scope updates (`test/proxy.management-router.test.js`, `test/proxy.entry.test.js`, `test/desktop.gui.smoke.e2e.test.js`, `docs/product/client-session-and-serve-control.md`) and verified via `node --test test/proxy.management-router.test.js test/proxy.entry.test.js test/desktop.gui.smoke.e2e.test.js` (pass=15, skipped=1). Marked T008 blocked because `/v0/management/restart` and desktop `proxy_restart` bridge remain upstream gaps; checklist kept `[ ]`, done_at/pr_or_commit filled for closure traceability.

- 2026-03-02T10:43:53+08:00 [ai-watchdog] Relaunched T002 (m6-t002-cs002) via resume session 019cac67-1332-7bb0-86f8-96611495e727 (attempt_window=2/2 in 10m).
- 2026-03-02T10:43:53+08:00 [ai-watchdog] Relaunched T004 (m6-t004-cs004) via resume session 019cac67-0030-7b92-afb1-43b7bd565523 (attempt_window=2/2 in 10m).
- 2026-03-02T10:43:53+08:00 [ai-watchdog] Relaunched T005 (m6-t005-cs005) via resume session 019cac66-fdd9-7d93-80c8-bc27ced9146d (attempt_window=2/2 in 10m).
- 2026-03-02T10:43:53+08:00 [ai-watchdog] Relaunched T007 (m6-t007-cs007) via resume session 019cac67-161c-7b53-a396-e40dfc104474 (attempt_window=2/2 in 10m).
- 2026-03-02T10:44:22+08:00 [cs004] Continued interrupted session 019cac67-0030-7b92-afb1-43b7bd565523; revalidated `lib/proxy/args.js` serve arg/api_key contract with deterministic `effectiveConfig.portSource/apiKeySource` and strict env-key validation, verified via `node --test test/proxy.entry.test.js test/proxy.management-router.test.js test/proxy.smoke.test.js` (11 pass, 1 skip) plus parser probe, and closed T004 with status=done/checklist synced/pr_or_commit=local-uncommitted.
- 2026-03-02T10:44:43+08:00 [cs008] Continued interrupted T008 in original session context; reconciled desktop smoke doc assertions with current `docs/product/client-session-and-serve-control.md`, re-ran `node --test test/proxy.management-router.test.js test/proxy.entry.test.js test/desktop.gui.smoke.e2e.test.js` (14 pass, 1 skip), and kept T008 `status=blocked` with checklist `[ ]` and blocker `upstream_restart_and_desktop_bridge_contract_not_implemented_yet`.

- 2026-03-02T10:45:35+08:00 [ai-watchdog] Marked T005 blocked: relaunch loop detected (2/2 in 10m).

- 2026-03-02T10:45:37+08:00 [aih-auto] Claimed T008 (m6-t008-cs008) owner=cs008 branch=feat/cs008-m6-t008.
- 2026-03-02T10:45:44+08:00 [cs007] Continued interrupted session 019cac67-161c-7b53-a396-e40dfc104474; implemented `desktop/tauri/src/views/session-launcher.tsx` session history + continue-chat panel with session_id input path, actionable failure diagnostics/fallback hints, and continue request status UX; verified via `node --test test/desktop.gui.smoke.e2e.test.js` (6/6 pass), then closed T007 with status=done/checklist synced/pr_or_commit=local-uncommitted.
- 2026-03-02T10:46:31+08:00 [cs007] Resumed original session 019cac67-161c-7b53-a396-e40dfc104474 and finalized T007 by wiring in-file fallback bridge for session history refresh/continue-chat (`run_aih` based when parent callbacks are absent), re-verified `node --test test/desktop.gui.smoke.e2e.test.js` (6/6 pass), and refreshed done_at/pr_or_commit with checklist kept `[x]`.
- 2026-03-02T02:47:05Z [cs002] Continued interrupted session 019cac67-1332-7bb0-86f8-96611495e727; implemented `/v0/management/restart` in `lib/proxy/management-router.js` with deterministic success/unavailable/failure payloads and stable machine-readable error codes, verified via `node --test test/proxy.management-router.test.js`, and closed T002 with checklist synced/pr_or_commit=local-uncommitted.
- 2026-03-02T02:48:02Z [cs007] Continued interrupted original session 019cac67-161c-7b53-a396-e40dfc104474; updated `desktop/tauri/src/views/session-launcher.tsx` to support standalone optional-props mode, codex session-history parsing, and direct continue-chat over `run_aih` resume with actionable diagnostics/fallback hints; verification: `node --test test/desktop.gui.smoke.e2e.test.js` (6/6 pass). Kept T007 `status=done` with checklist `[x]`.
- 2026-03-02T02:48:58Z [cs007] Wrote back closure fields for T007 after commit: `pr_or_commit=0916d2c`, `status=done`, checklist `[x]`, and retained latest verification evidence.
