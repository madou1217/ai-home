# Plan: M1.2 Doctor and Observability

- plan_id: roadmap-m1-2-doctor-observability-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T10:00:45Z
- updated_at: 2026-03-01T19:13:54+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [x] T001 Add doctor checks and CLI audit observability layer

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Add doctor checks and CLI audit observability layer
  scope: Implement diagnostics for links/permissions/config completeness and auditable CLI operations
  status: done
  owner: alice
  claimed_at: 2026-03-01T18:16:21+08:00
  done_at: 2026-03-01T19:13:54+08:00
  priority: P0
  depends_on: [T001@roadmap-m1-1-cli-baseline-2026-03-01]
  branch: feat/alice-m1
  pr_or_commit: WIP
  blocker:
  deliverable: `aih doctor` coverage plus action audit logging on critical flows
  acceptance:
  - Doctor detects link, permission, and required config anomalies
  - Audit logs include actionable context for key CLI state changes
  files:
  - lib/doctor/checks.js
  - lib/audit/logger.js
  - test/doctor.checks.test.js

## Activity Log
- 2026-03-01T10:00:45Z [ai-coordinator] Plan created from roadmap milestone M1.2.
- 2026-03-01T10:01:54Z [ai-coordinator] Fixed deliverable text after shell interpolation issue.
- 2026-03-01T18:14:58+08:00 [ai-coordinator] Reset invalid pre-assignment; ready for manual claim in UTC+8.
- 2026-03-01T18:16:21+08:00 [alice] Claimed T001, set status to doing on branch feat/alice-m1.
- 2026-03-01T19:13:54+08:00 [alice] Completed T001 (doctor checks + audit logger + CLI doctor/audit integration) with tests passing.
