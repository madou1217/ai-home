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
- [ ] T001 macOS arm64 build entry and npm command wiring
- [ ] T002 Tauri macOS bundle configuration hardening
- [ ] T003 macOS artifact collection and checksum export
- [ ] T004 macOS installer smoke test automation
- [ ] T005 client test guide for manual verification
- [ ] T006 CI workflow for macOS arm64 packaging

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: macOS arm64 build entry and npm command wiring
  scope: Add one-click local build entry for macOS arm64 package generation.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/pkg501-m3-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - `npm run` exposes a dedicated macOS arm64 packaging command.
  - Build command points to desktop/tauri packaging flow and documents expected output directory.
  files:
  - package.json
  - scripts/release/build-macos-arm64.sh

- id: T002
  title: Tauri macOS bundle configuration hardening
  scope: Ensure Tauri bundle config is valid for macOS arm64 packaging and installer metadata.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/pkg502-m3-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - macOS bundle targets and metadata are explicit and valid.
  - Config changes do not alter Linux/Windows packaging entries.
  files:
  - desktop/tauri/src-tauri/tauri.conf.json

- id: T003
  title: macOS artifact collection and checksum export
  scope: Add artifact collection script for generated macOS package and checksum manifest.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002]
  branch: feat/pkg503-m3-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - Artifacts are copied to a deterministic output directory.
  - SHA256 manifest is generated for produced installer files.
  files:
  - scripts/release/collect-macos-artifacts.sh

- id: T004
  title: macOS installer smoke test automation
  scope: Add minimal smoke test to verify package presence and installability signals.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002]
  branch: feat/pkg504-m3-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - Test checks installer artifact existence and basic metadata expectations.
  - Test can be executed independently via node test runner.
  files:
  - test/macos-arm-installer.smoke.test.js

- id: T005
  title: client test guide for manual verification
  scope: Write operator-facing steps to validate install and first-run on macOS arm64.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T003, T004]
  branch: feat/pkg505-m3-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - Includes install, launch, session actions, and rollback checkpoints.
  - Includes pass/fail checklist and evidence capture section.
  files:
  - docs/release/macos-arm-client-test-guide.md

- id: T006
  title: CI workflow for macOS arm64 packaging
  scope: Add dedicated CI workflow to run macOS arm64 package build and publish artifacts.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002, T003]
  branch: feat/pkg506-m3-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - Workflow builds macOS arm64 package and uploads artifacts.
  - Workflow includes clear trigger and concurrency controls.
  files:
  - .github/workflows/desktop-macos-arm64-packaging.yml

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
