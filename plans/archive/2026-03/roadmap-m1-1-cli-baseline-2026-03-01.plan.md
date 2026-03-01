# Plan: M1.1 CLI Session Baseline

- plan_id: roadmap-m1-1-cli-baseline-2026-03-01
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
- [x] T001 Stabilize single global session source and side-effect-free read flows

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Stabilize single global session source and side-effect-free read flows
  scope: Enforce native global session directories and keep read commands write-free
  status: done
  owner: alice
  claimed_at: 2026-03-01T18:16:21+08:00
  done_at: 2026-03-01T19:13:54+08:00
  priority: P0
  depends_on: []
  branch: feat/alice-m1
  pr_or_commit: WIP
  blocker:
  deliverable: Stable CLI baseline for global session source and default switching minimalism
  acceptance:
  - Read-only account listing does not trigger account-wide writes
  - Default account switching does not mutate native tool directory topology
  files:
  - bin/ai-home.js
  - lib/session/global-source.js
  - test/cli.session-baseline.test.js

## Activity Log
- 2026-03-01T10:00:45Z [ai-coordinator] Plan created from roadmap milestone M1.1.
- 2026-03-01T18:14:58+08:00 [ai-coordinator] Reset invalid pre-assignment; ready for manual claim in UTC+8.
- 2026-03-01T18:16:21+08:00 [alice] Claimed T001, set status to doing on branch feat/alice-m1.
- 2026-03-01T19:13:54+08:00 [alice] Completed T001 (global session source module + read-only ls behavior + set-default no topology mutation) with tests passing.
