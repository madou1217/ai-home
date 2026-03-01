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
- [x] T101 Windows installer validation matrix
- [x] T102 Linux installer validation matrix
- [x] T103 macOS installer validation matrix
- [x] T104 Desktop rollback runbook
- [x] T105 Desktop signing/notarization checklist
- [x] T106 Release artifact manifest and checksum flow

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T101
  title: Windows installer validation matrix
  scope: Define executable installer validation cases for Windows GA
  status: done
  owner: rel101
  claimed_at: 2026-03-01T23:56:04+08:00
  done_at: 2026-03-01T23:56:51+08:00
  priority: P0
  depends_on: []
  branch: feat/rel101-m3-t101
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Windows validation matrix with pass/fail criteria
  acceptance:
  - covers install launch upgrade uninstall scenarios
  - includes codex claude gemini launcher smoke path
  files:
  - docs/release/windows-validation-matrix.md

- id: T102
  title: Linux installer validation matrix
  scope: Define executable installer validation cases for Linux GA
  status: done
  owner: rel102
  claimed_at: 2026-03-01T23:56:04+08:00
  done_at: 2026-03-01T23:58:36+08:00
  priority: P0
  depends_on: []
  branch: feat/rel102-m3-t102
  pr_or_commit: local:pending-commit
  blocker:
  deliverable: Linux validation matrix with pass/fail criteria
  acceptance:
  - covers package install launch upgrade uninstall scenarios
  - includes distro and dependency edge checks
  files:
  - docs/release/linux-validation-matrix.md

- id: T103
  title: macOS installer validation matrix
  scope: Define executable installer validation cases for macOS GA
  status: done
  owner: rel103
  claimed_at: 2026-03-01T23:56:04+08:00
  done_at: 2026-03-01T23:59:20+08:00
  priority: P0
  depends_on: []
  branch: feat/rel103-m3-t103
  pr_or_commit: fb27cc0
  blocker:
  deliverable: macOS validation matrix with pass/fail criteria
  acceptance:
  - covers notarization gatekeeper launch update uninstall scenarios
  - includes universal arch and permission prompts checklist
  files:
  - docs/release/macos-validation-matrix.md

- id: T104
  title: Desktop rollback runbook
  scope: Prepare rollback decision tree and execution SOP for bad releases
  status: done
  owner: rel104
  claimed_at: 2026-03-01T23:56:04+08:00
  done_at: 2026-03-01T23:59:29+08:00
  priority: P0
  depends_on: [T101, T102, T103]
  branch: feat/rel104-m3-t104
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Rollback runbook with concrete trigger conditions
  acceptance:
  - includes rollback triggers communication and owner map
  - includes time-boxed rollback execution steps
  files:
  - docs/release/desktop-rollback-runbook.md

- id: T105
  title: Desktop signing/notarization checklist
  scope: Standardize signing and notarization preflight checklist
  status: done
  owner: rel105
  claimed_at: 2026-03-01T23:56:05+08:00
  done_at: 2026-03-02T00:04:26+08:00
  priority: P1
  depends_on: []
  branch: feat/rel105-m3-t105
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Release-time signing/notarization checklist
  acceptance:
  - captures required cert keys and secure storage points
  - includes verification commands and expected output
  files:
  - docs/release/signing-notarization-checklist.md

- id: T106
  title: Release artifact manifest and checksum flow
  scope: Define artifact manifest and checksum publication process
  status: done
  owner: rel106
  claimed_at: 2026-03-01T23:56:05+08:00
  done_at: 2026-03-01T23:58:34+08:00
  priority: P1
  depends_on: [T101, T102, T103]
  branch: feat/rel106-m3-t106
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Artifact manifest/checksum SOP for release distribution
  acceptance:
  - includes deterministic naming and hash generation format
  - includes publication and verification instructions
  files:
  - docs/release/artifact-manifest-checksum.md

## Activity Log
- 2026-03-01T23:55:30+08:00 [ai-coordinator] Plan created for M3 release operations parallelization.

- 2026-03-01T23:56:04+08:00 [aih-auto] Claimed T101 (m3-t101-rel101) owner=rel101 branch=feat/rel101-m3-t101.

- 2026-03-01T23:56:04+08:00 [aih-auto] Claimed T104 (m3-t104-rel104) owner=rel104 branch=feat/rel104-m3-t104.

- 2026-03-01T23:56:04+08:00 [aih-auto] Claimed T102 (m3-t102-rel102) owner=rel102 branch=feat/rel102-m3-t102.

- 2026-03-01T23:56:04+08:00 [aih-auto] Claimed T103 (m3-t103-rel103) owner=rel103 branch=feat/rel103-m3-t103.

- 2026-03-01T23:56:05+08:00 [aih-auto] Claimed T106 (m3-t106-rel106) owner=rel106 branch=feat/rel106-m3-t106.

- 2026-03-01T23:56:05+08:00 [aih-auto] Claimed T105 (m3-t105-rel105) owner=rel105 branch=feat/rel105-m3-t105.

- 2026-03-01T23:56:51+08:00 [rel101] Completed T101: added docs/release/windows-validation-matrix.md with install/launch/upgrade/uninstall and codex/claude/gemini smoke coverage.

- 2026-03-01T23:56:48+08:00 [ai-watchdog] Relaunched T106 (m3-t106-rel106) via resume session 019caa1d-3a4f-7e82-81f4-06fa7c2e120b.

- 2026-03-01T23:57:08+08:00 [ai-watchdog] Relaunched T104 (m3-t104-rel104) via resume session 019caa1d-36c4-78a2-b7e9-c8f31fdea52e.

- 2026-03-01T23:57:28+08:00 [ai-watchdog] Marked T105 blocked: worker offline and no recoverable session.

- 2026-03-01T23:57:48+08:00 [ai-watchdog] Relaunched T102 (m3-t102-rel102) via resume session 019caa1d-37b3-7502-a568-b37ca913ad50.
- 2026-03-01T23:57:48+08:00 [ai-watchdog] Relaunched T103 (m3-t103-rel103) via resume session 019caa1d-3853-73b1-962f-dd3104edb3f0.

- 2026-03-01T23:58:07+08:00 [ai-watchdog] Marked T102 blocked: worker offline and no recoverable session.
- 2026-03-01T23:58:07+08:00 [ai-watchdog] Marked T103 blocked: worker offline and no recoverable session.
- 2026-03-01T23:58:07+08:00 [ai-watchdog] Marked T104 blocked: worker offline and no recoverable session.
- 2026-03-01T23:58:07+08:00 [ai-watchdog] Marked T106 blocked: worker offline and no recoverable session.
- 2026-03-01T23:58:36+08:00 [rel102] Completed T102: added docs/release/linux-validation-matrix.md and closed task with checklist/status sync.

- 2026-03-01T23:58:34+08:00 [rel106] Completed T106: added docs/release/artifact-manifest-checksum.md with deterministic naming, SHA256 generation, publication, and consumer verification flow.

- 2026-03-01T23:59:20+08:00 [rel103] Continued T103 on original session context 019caa1d-3853-73b1-962f-dd3104edb3f0 and completed closure: finalized docs/release/macos-validation-matrix.md, set status=done, synced checklist, and recorded pr_or_commit=fb27cc0.

- 2026-03-02T00:00:04+08:00 [rel104] Completed T104: added docs/release/desktop-rollback-runbook.md with rollback triggers, communication/owner map, and time-boxed execution SOP.

- 2026-03-02T00:01:26+08:00 [aih-auto] Claimed T105 (m3-t105-rel105) owner=rel105 branch=feat/rel105-m3-t105.

- 2026-03-02T00:04:05+08:00 [ai-watchdog] Relaunched T105 (m3-t105-rel105) via resume session 019caa22-1fb6-7243-a572-6eb91c1b0002.

- 2026-03-02T00:04:26+08:00 [rel105] Continued T105 on original session 019caa22-1fb6-7243-a572-6eb91c1b0002 and completed closure: finalized docs/release/signing-notarization-checklist.md, set status=done, synced checklist, and recorded pr_or_commit=local-uncommitted.
