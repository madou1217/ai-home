# Plan: M2.2 Post-Import Usability Validation

- plan_id: roadmap-m2-2-post-import-validation-2026-03-01
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
- [x] T001 Verify imported accounts are immediately runnable

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Verify imported accounts are immediately runnable
  scope: Add post-import lightweight startup and auth usability checks
  status: done
  owner: bob
  claimed_at: 2026-03-01T18:18:42+08:00
  done_at: 2026-03-01T19:16:10+08:00
  priority: P1
  depends_on: [T001@roadmap-m2-1-export-import-noninteractive-2026-03-01]
  branch: feat/bob-m2
  pr_or_commit: not_committed (per request)
  blocker:
  deliverable: Post-import validation pipeline with explicit pass/fail report
  acceptance:
  - Imported accounts are automatically validated for startup readiness
  - Validation report clearly identifies unusable imports and causes
  files:
  - lib/migration/post-import-verify.js
  - test/migration.post-import-verify.test.js
  - docs/migration/post-import-validation.md

## Activity Log
- 2026-03-01T10:00:45Z [ai-coordinator] Plan created from roadmap milestone M2.2.
- 2026-03-01T18:14:58+08:00 [ai-coordinator] Reset invalid pre-assignment; ready for manual claim in UTC+8.
- 2026-03-01T18:18:42+08:00 [bob] Claimed T001, set status=doing, branch=feat/bob-m2.
- 2026-03-01T19:16:10+08:00 [bob] Completed T001. Added post-import validation module, docs, and tests (npm test passed).
