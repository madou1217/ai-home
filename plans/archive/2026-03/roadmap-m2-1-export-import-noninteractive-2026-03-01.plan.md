# Plan: M2.1 Non-Interactive Export and Import

- plan_id: roadmap-m2-1-export-import-noninteractive-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T10:00:45Z
- updated_at: 2026-03-01T19:16:10+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [x] T001 Build non-interactive export/import flow with conflict strategy controls

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Build non-interactive export/import flow with conflict strategy controls
  scope: Implement parameterized migration pipeline for export, import, and conflict policy handling
  status: done
  owner: bob
  claimed_at: 2026-03-01T18:18:42+08:00
  done_at: 2026-03-01T19:16:10+08:00
  priority: P0
  depends_on: []
  branch: feat/bob-m2
  pr_or_commit: not_committed (per request)
  blocker:
  deliverable: Scriptable export/import with skip/overwrite/report conflict policies
  acceptance:
  - Export/import runs fully via CLI flags in non-interactive mode
  - Conflict resolution outcomes are deterministic and reported
  files:
  - lib/migration/exporter.js
  - lib/migration/importer.js
  - test/migration.noninteractive.test.js

## Activity Log
- 2026-03-01T10:00:45Z [ai-coordinator] Plan created from roadmap milestone M2.1.
- 2026-03-01T10:04:03Z [ai-coordinator] Relaxed cross-track dependency to increase parallel execution.
- 2026-03-01T18:14:58+08:00 [ai-coordinator] Reset invalid pre-assignment; ready for manual claim in UTC+8.
- 2026-03-01T18:18:42+08:00 [bob] Claimed T001, set status=doing, branch=feat/bob-m2.
- 2026-03-01T19:16:10+08:00 [bob] Completed T001. Added non-interactive migration exporter/importer modules and tests (npm test passed).
