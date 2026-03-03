# Plan: Roadmap M3 Release Ops

- plan_id: roadmap-m3-release-ops-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T23:55:30+08:00
- updated_at: 2026-03-02T00:04:26+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [ ] T101 Windows installer validation matrix
- [ ] T102 Linux installer validation matrix
- [ ] T103 macOS installer validation matrix
- [ ] T104 Desktop rollback runbook
- [ ] T105 Desktop signing/notarization checklist
- [ ] T106 Release artifact manifest and checksum flow

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T101
  title: Windows installer validation matrix
  scope: Define executable installer validation cases for Windows GA
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/rel101-m3-t101
  pr_or_commit: 
  blocker: 
  acceptance:
  - covers install launch upgrade uninstall scenarios
  - includes codex claude gemini launcher smoke path
  files:
  - docs/release/windows-validation-matrix.md

- id: T102
  title: Linux installer validation matrix
  scope: Define executable installer validation cases for Linux GA
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/rel102-m3-t102
  pr_or_commit: 
  blocker: 
  acceptance:
  - covers package install launch upgrade uninstall scenarios
  - includes distro and dependency edge checks
  files:
  - docs/release/linux-validation-matrix.md

- id: T103
  title: macOS installer validation matrix
  scope: Define executable installer validation cases for macOS GA
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/rel103-m3-t103
  pr_or_commit: 
  blocker: 
  acceptance:
  - covers notarization gatekeeper launch update uninstall scenarios
  - includes universal arch and permission prompts checklist
  files:
  - docs/release/macos-validation-matrix.md

- id: T104
  title: Desktop rollback runbook
  scope: Prepare rollback decision tree and execution SOP for bad releases
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T101, T102, T103]
  branch: feat/rel104-m3-t104
  pr_or_commit: 
  blocker: 
  acceptance:
  - includes rollback triggers communication and owner map
  - includes time-boxed rollback execution steps
  files:
  - docs/release/desktop-rollback-runbook.md

- id: T105
  title: Desktop signing/notarization checklist
  scope: Standardize signing and notarization preflight checklist
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/rel105-m3-t105
  pr_or_commit: 
  blocker: 
  acceptance:
  - captures required cert keys and secure storage points
  - includes verification commands and expected output
  files:
  - docs/release/signing-notarization-checklist.md

- id: T106
  title: Release artifact manifest and checksum flow
  scope: Define artifact manifest and checksum publication process
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T101, T102, T103]
  branch: feat/rel106-m3-t106
  pr_or_commit: 
  blocker: 
  acceptance:
  - includes deterministic naming and hash generation format
  - includes publication and verification instructions
  files:
  - docs/release/artifact-manifest-checksum.md

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
