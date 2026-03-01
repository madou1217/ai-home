# Plan: m3-desktop-runtime-hotfix

- plan_id: m3-desktop-runtime-hotfix-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T01:36:00+08:00
- updated_at: 2026-03-02T01:41:38+08:00
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
- [x] T001 Desktop backend runtime resolver for packaged app
- [x] T002 Bundle/runtime packaging wiring for CLI assets
- [ ] T003 Dashboard/launcher command-path + error contract hardening
- [x] T004 Packaged-mode smoke tests and release verification notes

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Desktop backend runtime resolver for packaged app
  scope: Ensure Tauri backend can resolve executable/entrypoint in installed app instead of repo-only path.
  status: done
  owner: w000001
  claimed_at: 2026-03-02T01:38:06+08:00
  done_at: 2026-03-02T01:41:38+08:00
  priority: P0
  depends_on: []
  branch: feat/w000001-m3-t001
  pr_or_commit: local-uncommitted (plan-guard blocks code commits while T003 is doing)
  blocker:
  deliverable: Runtime resolution layer that works in both dev repo and packaged app.
  acceptance:
  - Backend command execution no longer hard-depends on `bin/ai-home.js` existing in cwd/repo root.
  - Packaged-mode fallback path is explicit and returns actionable error if runtime missing.
  files:
  - desktop/tauri/src-tauri/src/main.rs
  - desktop/tauri/src-tauri/src/runtime.rs

- id: T002
  title: Bundle/runtime packaging wiring for CLI assets
  scope: Wire tauri bundle/build settings so packaged app carries required runtime assets.
  status: done
  owner: w000002
  claimed_at: 2026-03-02T01:38:07+08:00
  done_at: 2026-03-01T17:39:36Z
  priority: P0
  depends_on: [T001]
  branch: feat/w000002-m3-t002
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Build config that bundles runtime dependencies and validates presence at startup.
  acceptance:
  - Build config includes required runtime resources for packaged app.
  - Packaged app startup can find runtime assets using deterministic path.
  files:
  - desktop/tauri/src-tauri/tauri.conf.json
  - desktop/tauri/src-tauri/Cargo.toml

- id: T003
  title: Dashboard/launcher command-path + error contract hardening
  scope: Make UI flows robust when runtime path or command bootstrap fails.
  status: doing
  owner: w000003
  claimed_at: 2026-03-02T01:38:07+08:00
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/w000003-m3-t003
  pr_or_commit:
  blocker:
  deliverable: Reliable account/session UX with precise error feedback in packaged mode.
  acceptance:
  - Dashboard account actions surface packaged-runtime specific failure guidance.
  - Session launcher retries and diagnostics include runtime-path checks.
  files:
  - desktop/tauri/src/views/dashboard.tsx
  - desktop/tauri/src/views/session-launcher.tsx

- id: T004
  title: Packaged-mode smoke tests and release verification notes
  scope: Add tests/docs validating packaged-mode core flows and release gates.
  status: done
  owner: w000004
  claimed_at: 2026-03-02T01:38:07+08:00
  done_at: 2026-03-02T01:39:26+08:00
  priority: P1
  depends_on: [T002, T003]
  branch: feat/w000004-m3-t004
  pr_or_commit: working-tree (no commit requested)
  blocker:
  deliverable: Regression checks proving packaged app can run account/session core path.
  acceptance:
  - Smoke test covers packaged-mode command bootstrap and core flow health.
  - Release checklist explicitly gates packaged-mode account/session verification.
  files:
  - test/desktop.gui.smoke.e2e.test.js
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-02T01:36:00+08:00 [coordinator] Plan created for desktop packaged-runtime hotfix.

- 2026-03-02T01:38:06+08:00 [aih-auto] Claimed T001 (m3-t001-w000001) owner=w000001 branch=feat/w000001-m3-t001.
- 2026-03-02T01:41:38+08:00 [w000001] Completed T001: added desktop runtime resolver with cwd/env/packaged fallback and actionable missing-runtime errors; verified `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass); code commit blocked by plan-guard while T003 remains doing.

- 2026-03-02T01:38:07+08:00 [aih-auto] Claimed T003 (m3-t003-w000003) owner=w000003 branch=feat/w000003-m3-t003.

- 2026-03-02T01:38:07+08:00 [aih-auto] Claimed T002 (m3-t002-w000002) owner=w000002 branch=feat/w000002-m3-t002.

- 2026-03-02T01:38:07+08:00 [aih-auto] Claimed T004 (m3-t004-w000004) owner=w000004 branch=feat/w000004-m3-t004.

- 2026-03-02T01:39:26+08:00 [w000004] Completed T004 (m3-t004-w000004): added packaged-mode smoke assertions in test/desktop.gui.smoke.e2e.test.js, added packaged-mode core path release gates in docs/release/desktop-platform-checklist.md, verified via `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass), set status=done with checklist synced.

- 2026-03-01T17:39:36Z [w000002] Completed T002 (m3-t002-w000002): wired tauri bundle resources to include CLI runtime assets (bin/lib/scripts/package manifests), added runtime package metadata in Cargo.toml for deterministic CLI entry reference, verified via `node --test test/desktop.gui.smoke.e2e.test.js` (4/4 pass), set status=done with checklist synced and pr_or_commit=local-uncommitted.
