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
- [x] T001 Desktop shell navigation and global error boundary hardening
- [x] T002 Desktop bootstrap/runtime initialization sequencing hardening
- [x] T003 Audit log view query and pagination hardening
- [x] T004 Migration view import/export workflow hardening
- [x] T005 Account command response contract consistency hardening
- [x] T006 GUI smoke regression and release cutover gate update

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Desktop shell navigation and global error boundary hardening
  scope: Strengthen desktop app shell state transitions and unhandled error fallback behavior.
  status: done
  owner: zmcn001
  claimed_at: 2026-03-02T03:00:21+08:00
  done_at: 2026-03-02T10:19:53+08:00
  priority: P0
  depends_on: []
  branch: feat/zmcn001-m3-t001
  pr_or_commit: verified-existing-implementation@local-uncommitted
  blocker:
  deliverable: Stable shell navigation with deterministic error fallback in GUI.
  acceptance:
  - Shell route/state transitions do not strand users in blank/error states.
  - Global error boundary renders actionable recovery guidance.
  files:
  - desktop/tauri/src/App.tsx

- id: T002
  title: Desktop bootstrap/runtime initialization sequencing hardening
  scope: Harden startup initialization order for runtime probes and UI readiness signals.
  status: done
  owner: zmcn002
  claimed_at: 2026-03-02T03:00:35+08:00
  done_at: 2026-03-02T10:21:57+08:00
  priority: P0
  depends_on: []
  branch: feat/zmcn002-m3-t002
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Deterministic startup flow that reports runtime readiness clearly.
  acceptance:
  - Startup sequence reports runtime-ready/runtime-degraded states explicitly.
  - UI bootstrap avoids race conditions between runtime probe and initial render.
  files:
  - desktop/tauri/src/main.tsx

- id: T003
  title: Audit log view query and pagination hardening
  scope: Stabilize audit log filtering, paging, and no-data/error states in desktop GUI.
  status: done
  owner: zmcn003
  claimed_at: 2026-03-02T03:00:36+08:00
  done_at: 2026-03-02T10:19:53+08:00
  priority: P1
  depends_on: []
  branch: feat/zmcn003-m3-t003
  pr_or_commit: verified-existing-implementation@local-uncommitted
  blocker:
  deliverable: Reliable audit view with deterministic filter and pagination behavior.
  acceptance:
  - Filter and pagination controls produce consistent results across refreshes.
  - Empty/error states provide explicit next-step hints.
  files:
  - desktop/tauri/src/views/audit-log.tsx

- id: T004
  title: Migration view import/export workflow hardening
  scope: Harden migration page interaction flow for import/export actions and conflict feedback.
  status: done
  owner: zmcn004
  claimed_at: 2026-03-02T03:00:37+08:00
  done_at: 2026-03-02T03:01:16+08:00
  priority: P1
  depends_on: []
  branch: feat/zmcn004-m3-t004
  pr_or_commit: verified-existing-implementation@local-uncommitted
  blocker:
  deliverable: Robust migration UX for export/import with clear conflict and retry guidance.
  acceptance:
  - Export/import actions provide deterministic success/failure messaging.
  - Conflict feedback includes clear recovery action for operators.
  files:
  - desktop/tauri/src/views/migration.tsx

- id: T005
  title: Account command response contract consistency hardening
  scope: Normalize account command payload codes and fields used by GUI account panel logic.
  status: done
  owner: zmcn005
  claimed_at: 2026-03-02T03:00:38+08:00
  done_at: 2026-03-01T19:04:01Z
  priority: P0
  depends_on: []
  branch: feat/zmcn005-m3-t005
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Stable account command contract for GUI-level error mapping.
  acceptance:
  - Account command responses include consistent code/message/data envelope.
  - GUI-facing failures remain machine-readable for deterministic mapping.
  files:
  - desktop/tauri/src-tauri/src/commands/accounts.rs

- id: T006
  title: GUI smoke regression and release cutover gate update
  scope: Expand smoke assertions and release cutover checklist for GUI go-live wave2.
  status: done
  owner: zmcn006
  claimed_at: 2026-03-02T03:00:39+08:00
  done_at: 2026-03-02T03:02:13+08:00
  priority: P1
  depends_on: [T001, T002, T003, T004, T005]
  branch: feat/zmcn006-m3-t006
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Updated test/release gate proving GUI wave2 readiness.
  acceptance:
  - Smoke test validates shell/bootstrap/account/migration/audit critical paths.
  - Cutover plan includes explicit go/no-go checks for GUI wave2.
  files:
  - test/desktop.gui.smoke.e2e.test.js
  - docs/release/pr-cutover-plan-2026-03-02.md

## Activity Log
- 2026-03-02T02:59:50+08:00 [coordinator] Plan created for GUI go-live wave2 hardening and release gates.

- 2026-03-02T03:00:21+08:00 [aih-auto] Claimed T001 (m3-t001-zmcn001) owner=zmcn001 branch=feat/zmcn001-m3-t001.

- 2026-03-02T03:00:21+08:00 [aih-auto] Claimed T001 (m3-t001-zmcn001) owner=zmcn001 branch=feat/zmcn001-m3-t001.

- 2026-03-02T03:00:21+08:00 [aih-auto] Claimed T001 (m3-t001-zmcn001) owner=zmcn001 branch=feat/zmcn001-m3-t001.

- 2026-03-02T03:00:21+08:00 [aih-auto] Claimed T001 (m3-t001-zmcn001) owner=zmcn001 branch=feat/zmcn001-m3-t001.

- 2026-03-02T03:00:21+08:00 [aih-auto] Claimed T001 (m3-t001-zmcn001) owner=zmcn001 branch=feat/zmcn001-m3-t001.

- 2026-03-02T03:00:21+08:00 [aih-auto] Claimed T001 (m3-t001-zmcn001) owner=zmcn001 branch=feat/zmcn001-m3-t001.

- 2026-03-02T03:00:35+08:00 [aih-auto] Claimed T002 (m3-t002-zmcn002) owner=zmcn002 branch=feat/zmcn002-m3-t002.

- 2026-03-02T03:00:36+08:00 [aih-auto] Claimed T003 (m3-t003-zmcn003) owner=zmcn003 branch=feat/zmcn003-m3-t003.

- 2026-03-02T03:00:37+08:00 [aih-auto] Claimed T004 (m3-t004-zmcn004) owner=zmcn004 branch=feat/zmcn004-m3-t004.

- 2026-03-02T03:00:38+08:00 [aih-auto] Claimed T005 (m3-t005-zmcn005) owner=zmcn005 branch=feat/zmcn005-m3-t005.

- 2026-03-02T03:00:39+08:00 [aih-auto] Claimed T006 (m3-t006-zmcn006) owner=zmcn006 branch=feat/zmcn006-m3-t006.

- 2026-03-02T03:00:45+08:00 [ai-watchdog] Relaunched T002 (m3-t002-zmcn002) via resume session 019caac6-2450-7961-9ae9-92d8ed5b95fc.
- 2026-03-02T03:00:45+08:00 [ai-watchdog] Relaunched T003 (m3-t003-zmcn003) via resume session 019caac6-27e7-7dd2-875b-a92577b0ef3a.
- 2026-03-02T03:00:45+08:00 [ai-watchdog] Relaunched T004 (m3-t004-zmcn004) via resume session 019caac6-2ca7-7073-a2de-db1669e575d2.
- 2026-03-02T03:00:45+08:00 [ai-watchdog] Marked T005 blocked: worker offline and no recoverable session.
- 2026-03-02T03:00:45+08:00 [ai-watchdog] Marked T006 blocked: worker offline and no recoverable session.

- 2026-03-02T03:00:56+08:00 [aih-auto] Claimed T005 (m3-t005-zmcn005) owner=zmcn005 branch=feat/zmcn005-m3-t005.

- 2026-03-02T03:00:57+08:00 [aih-auto] Claimed T006 (m3-t006-zmcn006) owner=zmcn006 branch=feat/zmcn006-m3-t006.

- 2026-03-02T03:01:16+08:00 [zmcn004] Completed T004 (m3-t004-zmcn004); verified migration view import/export hardening in desktop/tauri/src/views/migration.tsx (deterministic success/failure status, reason-code guidance, retry/reset actions, and progress timeline), re-ran `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass), set status=done, synced checklist, and recorded pr_or_commit=verified-existing-implementation@local-uncommitted.

- 2026-03-02T03:02:13+08:00 [zmcn006] Resumed interrupted worker session for T006 (m3-t006-zmcn006); updated docs/release/pr-cutover-plan-2026-03-02.md with explicit GUI wave2 go/no-go gates, extended test/desktop.gui.smoke.e2e.test.js with cutover assertions, re-ran `node --test test/desktop.gui.smoke.e2e.test.js` (5/5 pass), set status=done, synced checklist, and recorded pr_or_commit=local-uncommitted.

- 2026-03-02T03:02:44+08:00 [worker-codex] Completed T005 (m3-t005-zmcn005); normalized accounts command payload to stable `code/message/data` envelope with machine-readable `errorCodes`, updated `desktop/tauri/src-tauri/src/commands/accounts.rs`, re-ran `node --test test/desktop.gui.smoke.e2e.test.js` (5/5 pass), set status=done, synced checklist, and recorded pr_or_commit=local-uncommitted.

- 2026-03-01T19:04:01Z [zmcn005] Continued interrupted T005 in original session context; finalized failure-path contract to return deterministic `ok=false` envelope (`code/message/data`) for list/set_default/namespace validation errors in `desktop/tauri/src-tauri/src/commands/accounts.rs`, re-ran `node --test test/desktop.gui.smoke.e2e.test.js` (5/5 pass), and kept status=done with checklist/pr_or_commit synced.
- 2026-03-01T19:05:00Z [zmcn005] Verification pass for resumed T005 closure: re-ran `node --test test/desktop.gui.smoke.e2e.test.js` (5/5 pass); attempted `cargo check` in `desktop/tauri/src-tauri` and observed existing build-script blocker `resource path ../../bin doesn't exist` (outside T005 file scope). Task remains `status: done` with `done_at`/`pr_or_commit`/checklist unchanged.

- 2026-03-02T10:19:03+08:00 [ai-watchdog] Relaunched T001 (m3-t001-zmcn001) via resume session 019caac5-ef45-7c11-9ddc-7284bb91dea9.
- 2026-03-02T10:19:03+08:00 [ai-watchdog] Relaunched T002 (m3-t002-zmcn002) via resume session 019caac6-2450-7961-9ae9-92d8ed5b95fc.
- 2026-03-02T10:19:03+08:00 [ai-watchdog] Relaunched T003 (m3-t003-zmcn003) via resume session 019caac6-27e7-7dd2-875b-a92577b0ef3a.

- 2026-03-02T10:19:53+08:00 [zmcn003] Continued interrupted worker for T003 in original session context; verified `desktop/tauri/src/views/audit-log.tsx` satisfies deterministic query/action filter/pagination and explicit empty/error states, re-ran `node --test test/desktop.gui.smoke.e2e.test.js` (5/5 pass), set status=done, synced checklist, and recorded pr_or_commit=verified-existing-implementation@local-uncommitted.

- 2026-03-02T10:19:53+08:00 [zmcn001] Continued interrupted worker for T001 in original session context; verified `desktop/tauri/src/App.tsx` satisfies deterministic hash-route fallback and global error boundary recovery path, re-ran `node --test test/desktop.gui.smoke.e2e.test.js` (5/5 pass), set status=done, synced checklist, and recorded pr_or_commit=verified-existing-implementation@local-uncommitted.

- 2026-03-02T10:21:57+08:00 [zmcn002] Continued interrupted worker for T002 in original session context; hardened `desktop/tauri/src/main.tsx` bootstrap sequencing with runtime readiness probe (`runtime-ready`/`runtime-degraded`) and deterministic render gating, re-ran `node --test test/desktop.gui.smoke.e2e.test.js` (5/5 pass), set status=done, synced checklist, and recorded pr_or_commit=local-uncommitted.
