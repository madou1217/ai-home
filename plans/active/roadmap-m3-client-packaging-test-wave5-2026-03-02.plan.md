# Plan: roadmap-m3-client-packaging-test-wave5

- plan_id: m3-client-packaging-test-wave5-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T13:34:20+08:00
- updated_at: 2026-03-02T13:45:06+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.
- All timestamps use UTC+8.

## TodoList
- Deliver a testable macOS arm64 desktop client package ASAP.
- Keep each task file scope isolated for parallel execution.

## Checklist
- [x] T001 macOS arm64 build entry and npm command wiring
- [x] T002 Tauri macOS bundle configuration hardening
- [x] T003 macOS artifact collection and checksum export
- [x] T004 macOS installer smoke test automation
- [x] T005 client test guide for manual verification
- [x] T006 CI workflow for macOS arm64 packaging

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: macOS arm64 build entry and npm command wiring
  scope: Add one-click local build entry for macOS arm64 package generation.
  status: done
  owner: pkg501
  claimed_at: 2026-03-02T13:35:21+08:00
  done_at: 2026-03-02T13:42:17+08:00
  priority: P0
  depends_on: []
  branch: feat/pkg501-m3-t001
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Local command path that builds macOS arm64 package from repo root.
  acceptance:
  - `npm run` exposes a dedicated macOS arm64 packaging command.
  - Build command points to desktop/tauri packaging flow and documents expected output directory.
  files:
  - package.json
  - scripts/release/build-macos-arm64.sh

- id: T002
  title: Tauri macOS bundle configuration hardening
  scope: Ensure Tauri bundle config is valid for macOS arm64 packaging and installer metadata.
  status: done
  owner: pkg502
  claimed_at: 2026-03-02T13:35:21+08:00
  done_at: 2026-03-02T13:36:30+08:00
  priority: P0
  depends_on: []
  branch: feat/pkg502-m3-t002
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Stable Tauri macOS bundle configuration for arm64 output.
  acceptance:
  - macOS bundle targets and metadata are explicit and valid.
  - Config changes do not alter Linux/Windows packaging entries.
  files:
  - desktop/tauri/src-tauri/tauri.conf.json

- id: T003
  title: macOS artifact collection and checksum export
  scope: Add artifact collection script for generated macOS package and checksum manifest.
  status: done
  owner: pkg503
  claimed_at: 2026-03-02T13:35:20+08:00
  done_at: 2026-03-02T13:43:29+08:00
  priority: P1
  depends_on: [T001, T002]
  branch: feat/pkg503-m3-t003
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Script that gathers build outputs and emits checksum records.
  acceptance:
  - Artifacts are copied to a deterministic output directory.
  - SHA256 manifest is generated for produced installer files.
  files:
  - scripts/release/collect-macos-artifacts.sh

- id: T004
  title: macOS installer smoke test automation
  scope: Add minimal smoke test to verify package presence and installability signals.
  status: done
  owner: pkg504
  claimed_at: 2026-03-02T13:35:20+08:00
  done_at: 2026-03-02T13:37:17+08:00
  priority: P1
  depends_on: [T001, T002]
  branch: feat/pkg504-m3-t004
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Automated smoke test for macOS package output.
  acceptance:
  - Test checks installer artifact existence and basic metadata expectations.
  - Test can be executed independently via node test runner.
  files:
  - test/macos-arm-installer.smoke.test.js

- id: T005
  title: client test guide for manual verification
  scope: Write operator-facing steps to validate install and first-run on macOS arm64.
  status: done
  owner: pkg505
  claimed_at: 2026-03-02T13:35:21+08:00
  done_at: 2026-03-02T13:36:53+08:00
  priority: P1
  depends_on: [T003, T004]
  branch: feat/pkg505-m3-t005
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Manual test guide for your local client validation.
  acceptance:
  - Includes install, launch, session actions, and rollback checkpoints.
  - Includes pass/fail checklist and evidence capture section.
  files:
  - docs/release/macos-arm-client-test-guide.md

- id: T006
  title: CI workflow for macOS arm64 packaging
  scope: Add dedicated CI workflow to run macOS arm64 package build and publish artifacts.
  status: done
  owner: pkg506
  claimed_at: 2026-03-02T13:35:21+08:00
  done_at: 2026-03-02T13:45:06+08:00
  priority: P1
  depends_on: [T001, T002, T003]
  branch: feat/pkg506-m3-t006
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Runnable GitHub Actions workflow for macOS arm64 packaging pipeline.
  acceptance:
  - Workflow builds macOS arm64 package and uploads artifacts.
  - Workflow includes clear trigger and concurrency controls.
  files:
  - .github/workflows/desktop-macos-arm64-packaging.yml

## Activity Log
- 2026-03-02T13:34:20+08:00 [coordinator] Plan created for macOS arm64 client packaging and test delivery.

- 2026-03-02T13:35:20+08:00 [aih-auto] Claimed T003 (m3-t003-pkg503) owner=pkg503 branch=feat/pkg503-m3-t003.

- 2026-03-02T13:35:20+08:00 [aih-auto] Claimed T004 (m3-t004-pkg504) owner=pkg504 branch=feat/pkg504-m3-t004.

- 2026-03-02T13:35:21+08:00 [aih-auto] Claimed T005 (m3-t005-pkg505) owner=pkg505 branch=feat/pkg505-m3-t005.

- 2026-03-02T13:35:21+08:00 [aih-auto] Claimed T001 (m3-t001-pkg501) owner=pkg501 branch=feat/pkg501-m3-t001.

- 2026-03-02T13:35:21+08:00 [aih-auto] Claimed T006 (m3-t006-pkg506) owner=pkg506 branch=feat/pkg506-m3-t006.

- 2026-03-02T13:35:21+08:00 [aih-auto] Claimed T002 (m3-t002-pkg502) owner=pkg502 branch=feat/pkg502-m3-t002.

- 2026-03-02T13:35:47+08:00 [ai-watchdog] Relaunched T004 (m3-t004-pkg504) via resume session 019cad0b-45ba-7781-931a-afd1d27247ba (attempt_window=1/2 in 10m).
- 2026-03-02T13:36:30+08:00 [pkg502] Completed T002 by hardening and validating `desktop/tauri/src-tauri/tauri.conf.json` for macOS arm64 packaging: explicit mac targets (`app`, `dmg`), macOS bundle section present, and installer metadata populated; verification passed via `node -e` config check.
- 2026-03-02T13:36:53+08:00 [pkg505] Completed T005 by adding `docs/release/macos-arm-client-test-guide.md` with install/launch/session/rollback flow, pass-fail checklist, and evidence capture template. Verification: `test -f docs/release/macos-arm-client-test-guide.md` and `rg -n "Install Validation|Session Action Validation|Rollback Checkpoints|Pass/Fail Checklist|Evidence Capture" docs/release/macos-arm-client-test-guide.md`.
- 2026-03-02T13:37:17+08:00 [pkg504] Completed T004 by adding `test/macos-arm-installer.smoke.test.js` to validate installer artifact presence, extension, arm64 naming, and non-empty metadata checks; verification passed via `node --test test/macos-arm-installer.smoke.test.js`.
- 2026-03-02T13:37:41+08:00 [pkg502] Follow-up hardening for T002: added explicit `bundle.macOS.frameworks` and `bundle.macOS.files` in `desktop/tauri/src-tauri/tauri.conf.json`; verification passed via `node -e` bundle config assertion.

- 2026-03-02T13:42:01+08:00 [ai-watchdog] Relaunched T001 (m3-t001-pkg501) via resume session 019cad0b-479d-7580-bbc7-70c110b6f372 (attempt_window=1/2 in 10m).
- 2026-03-02T13:42:01+08:00 [ai-watchdog] Relaunched T003 (m3-t003-pkg503) via resume session 019cad0b-4327-76b3-8555-a5f167959406 (attempt_window=1/2 in 10m).
- 2026-03-02T13:42:01+08:00 [ai-watchdog] Relaunched T006 (m3-t006-pkg506) via resume session 019cad0b-491c-77c1-975e-3ab2a65d0845 (attempt_window=1/2 in 10m).
- 2026-03-02T13:42:17+08:00 [worker-codex] Continued interrupted original session 019cad0b-479d-7580-bbc7-70c110b6f372; completed T001 by adding root npm command `package:desktop:macos-arm64` and executable script `scripts/release/build-macos-arm64.sh` (desktop tauri build + target `aarch64-apple-darwin` with deterministic output path), verified via `AIH_DRY_RUN=1 npm run package:desktop:macos-arm64`, then wrote back `status=done`, checklist `[x]`, `done_at`, and `pr_or_commit=local-uncommitted`.
- 2026-03-02T13:42:48+08:00 [worker-codex] Continued interrupted original session 019cad0b-4327-76b3-8555-a5f167959406; T003 closure writeback set `status=blocked` after verification found `scripts/release/collect-macos-artifacts.sh` missing. Writeback synced `done_at`, kept checklist `[ ]`, set `pr_or_commit=local-uncommitted`, blocker, and next_step to create script + validate deterministic artifact copy and SHA256 manifest generation.
- 2026-03-02T13:42:48+08:00 [worker-codex] Continued interrupted original session 019cad0b-491c-77c1-975e-3ab2a65d0845; T006 closure writeback set `status=blocked` after verification found `.github/workflows/desktop-macos-arm64-packaging.yml` missing and dependency T003 not done. Writeback synced `done_at`, kept checklist `[ ]`, set `pr_or_commit=local-uncommitted`, blocker, and next_step to add workflow (trigger + concurrency + build + artifact upload) after T003 delivery.
- 2026-03-02T13:43:29+08:00 [worker-codex] Continued interrupted original session 019cad0b-4327-76b3-8555-a5f167959406; completed T003 by adding `scripts/release/collect-macos-artifacts.sh` and verifying deterministic artifact collection + SHA256 manifest generation with temp fixtures. Writeback synced `status=done`, checklist `[x]`, `done_at`, `pr_or_commit=local-uncommitted`, and cleared blocker.
- 2026-03-02T13:45:06+08:00 [worker-codex] Continued interrupted original session 019cad0b-491c-77c1-975e-3ab2a65d0845; completed T006 by adding `.github/workflows/desktop-macos-arm64-packaging.yml` with trigger paths (`push`/`pull_request`/`workflow_dispatch`), concurrency control, macOS arm64 build, artifact collection, and upload steps. Writeback synced `status=done`, checklist `[x]`, `done_at`, `pr_or_commit=local-uncommitted`, and cleared blocker.
