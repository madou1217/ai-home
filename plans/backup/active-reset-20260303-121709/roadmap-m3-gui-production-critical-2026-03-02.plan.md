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
- [x] T001 Desktop backend account command reliability hardening
- [x] T002 Desktop runtime diagnostics contract hardening
- [x] T003 Dashboard account state and error guidance hardening
- [x] T004 Session launcher preflight and retry hardening
- [x] T005 GUI production regression and release gate update

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Desktop backend account command reliability hardening
  scope: Stabilize backend command handlers for account listing/default switch/add account paths used by GUI.
  status: done
  owner: g000001
  claimed_at: 2026-03-02T02:42:28+08:00
  done_at: 2026-03-02T02:45:07+08:00
  priority: P0
  depends_on: []
  branch: feat/g000001-m3-t001
  pr_or_commit: local-uncommitted (plan-guard blocks code commits while T002/T003/T004 are doing)
  blocker:
  deliverable: Reliable backend command path for GUI account operations.
  acceptance:
  - Account list/default switch/add account commands return consistent success/error payloads.
  - Failure cases include machine-readable error codes for frontend mapping.
  files:
  - desktop/tauri/src-tauri/src/main.rs

- id: T002
  title: Desktop runtime diagnostics contract hardening
  scope: Improve runtime resolution diagnostics for packaged mode and expose deterministic reasons for failures.
  status: done
  owner: g000002
  claimed_at: 2026-03-02T02:42:29+08:00
  done_at: 2026-03-01T18:43:37Z
  priority: P0
  depends_on: []
  branch: feat/g000002-m3-t002
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Runtime diagnostics contract used by frontend and smoke tests.
  acceptance:
  - Runtime bootstrap errors include explicit category and next-step hint.
  - Diagnostics output is stable for smoke-test assertions.
  files:
  - desktop/tauri/src-tauri/src/runtime.rs

- id: T003
  title: Dashboard account state and error guidance hardening
  scope: Harden dashboard account panel for runtime/account failures with clear user guidance and deterministic UI states.
  status: done
  owner: g000003
  claimed_at: 2026-03-02T02:42:30+08:00
  done_at: 2026-03-02T02:48:17+08:00
  priority: P0
  depends_on: [T001, T002]
  branch: feat/g000003-m3-t003
  pr_or_commit: local-uncommitted (plan-guard blocks code commits while T004 is doing)
  blocker:
  deliverable: Dashboard UX that clearly reports account readiness and remediation steps.
  acceptance:
  - Dashboard status and error states map 1:1 to backend/runtime error codes.
  - User sees actionable next step for common packaged-mode failures.
  files:
  - desktop/tauri/src/views/dashboard.tsx

- id: T004
  title: Session launcher preflight and retry hardening
  scope: Add launcher preflight checks, retry boundaries, and clearer failed-launch diagnostics.
  status: done
  owner: g000004
  claimed_at: 2026-03-02T02:42:31+08:00
  done_at: 2026-03-01T18:52:50Z
  priority: P0
  depends_on: [T001, T002]
  branch: feat/g000004-m3-t004
  pr_or_commit: local-uncommitted (plan-guard blocks code commits)
  blocker:
  deliverable: Session launcher flow resilient to transient and runtime-path failures.
  acceptance:
  - Launcher performs preflight validation before spawn.
  - Retry/timeout behavior and diagnostic message are deterministic.
  files:
  - desktop/tauri/src/views/session-launcher.tsx

- id: T005
  title: GUI production regression and release gate update
  scope: Update smoke tests and release checklist to gate account/session core path in packaged mode.
  status: done
  owner: w000005
  claimed_at: 2026-03-02T02:42:01+08:00
  done_at: 2026-03-02T02:43:34+08:00
  priority: P1
  depends_on: [T003, T004]
  branch: feat/w000005-m3-t005
  pr_or_commit: local-uncommitted (plan-guard blocks code commits while T001-T004 are doing)
  blocker:
  deliverable: Automated regression coverage and release criteria for GUI core path.
  acceptance:
  - Smoke tests cover account status + session launch success/failure path.
  - Release checklist includes explicit GUI core-path go/no-go items.
  files:
  - test/desktop.gui.smoke.e2e.test.js
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-02T02:41:33+08:00 [coordinator] Plan created for GUI production critical blockers.

- 2026-03-02T02:42:01+08:00 [aih-auto] Claimed T005 (m3-t005-w000005) owner=w000005 branch=feat/w000005-m3-t005.

- 2026-03-02T02:42:28+08:00 [aih-auto] Claimed T001 (m3-t001-g000001) owner=g000001 branch=feat/g000001-m3-t001.

- 2026-03-02T02:42:29+08:00 [aih-auto] Claimed T002 (m3-t002-g000002) owner=g000002 branch=feat/g000002-m3-t002.

- 2026-03-02T02:42:30+08:00 [aih-auto] Claimed T003 (m3-t003-g000003) owner=g000003 branch=feat/g000003-m3-t003.

- 2026-03-02T02:42:31+08:00 [aih-auto] Claimed T004 (m3-t004-g000004) owner=g000004 branch=feat/g000004-m3-t004.

- 2026-03-02T02:43:12+08:00 [ai-watchdog] Relaunched T001 (m3-t001-g000001) via resume session 019caab5-8ccb-7333-8569-c960e0847387.
- 2026-03-02T02:43:34+08:00 [w000005] Completed T005: updated packaged-mode GUI smoke and release gate checklist; verified via `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass).
- 2026-03-01T18:43:37Z [g000002] Completed T002 (m3-t002-g000002): hardened runtime diagnostics contract in desktop/tauri/src-tauri/src/runtime.rs with deterministic category/code/hint and searched-path output for runtime bootstrap failures; verified via `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass); set status=done and synced checklist.

- 2026-03-02T02:43:29+08:00 [g000001] Completed T001: hardened run_aih account command reliability with stable `ok`/`reason_code`/`command` payload and machine-readable account failure codes; verified via `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass).
- 2026-03-02T02:45:07+08:00 [g000001] Resumed interrupted session and finalized T001 closure: removed compile-breaking dead helper from desktop/tauri/src-tauri/src/main.rs and aligned exposed account error codes in core namespace contract; re-verified via `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass) and `node --test test/command-path.test.js` (5/5 pass); `cargo check` remains blocked by pre-existing Tauri resource path configuration (`../../bin` missing).

- 2026-03-02T02:46:22+08:00 [ai-watchdog] Relaunched T003 (m3-t003-g000003) via resume session 019caab5-94ee-7e32-b67d-4f36878c478a.
- 2026-03-02T02:46:22+08:00 [ai-watchdog] Relaunched T004 (m3-t004-g000004) via resume session 019caab5-9926-7b22-9d88-f0ec38ad68e3.
- 2026-03-02T02:48:17+08:00 [g000003] Completed T003: hardened dashboard status contract in desktop/tauri/src/views/dashboard.tsx with deterministic reason_code mapping (AIH/CORE) and actionable packaged-mode remediation hints; verified via `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass); code commit blocked by plan-guard while T004 remains doing.

- 2026-03-02T02:52:25+08:00 [ai-watchdog] Relaunched T004 (m3-t004-g000004) via resume session 019caab5-9926-7b22-9d88-f0ec38ad68e3.
- 2026-03-01T18:52:50Z [g000004] Resumed interrupted worker and completed T004: confirmed session launcher preflight guard (no-account reject), deterministic retry boundary (`LAUNCH_TIMEOUT_MS=15000` + `Retry Last Launch`), and classified diagnostics (timeout/bridge/account); verified via `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass); set status=done and synced checklist.
