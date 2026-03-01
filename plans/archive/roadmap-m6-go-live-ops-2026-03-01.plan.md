# Plan: Roadmap M6 Go-Live Ops

- plan_id: roadmap-m6-go-live-ops-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T23:21:19+08:00
- updated_at: 2026-03-01T23:28:59+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [ ] T001 CLI go-live command hardening
- [ ] T002 Board reliability and data integrity checks
- [ ] T003 Task dispatcher parallel execution wrapper
- [x] T004 Orchestrator execution guardrails
- [ ] T005 Watchdog recovery policy hardening
- [ ] T006 Commit guard release-mode enforcement
- [ ] T007 Hook installer bootstrap reliability
- [ ] T008 Go-live runbook and rollback SOP
- [ ] T009 Scheduler/worker integration tests
- [ ] T010 Board/watchdog regression tests

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: CLI go-live command hardening
  scope: Harden CLI entry command behaviors used by scheduler and workers in go-live runs
  status: doing
  owner: alice
  claimed_at: 2026-03-01T23:23:27+08:00
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/alice-m6-t001
  pr_or_commit:
  blocker:
  deliverable: Stable CLI behavior for auto exec/review/resume in production flow
  acceptance:
  - codex auto exec/review/resume paths keep deterministic argument behavior
  - runtime output includes enough metadata for board/watchdog ingestion
  files:
  - bin/ai-home.js

- id: T002
  title: Board reliability and data integrity checks
  scope: Improve task board rendering robustness and integrity visibility for go-live operations
  status: blocked
  owner: bob
  claimed_at: 2026-03-01T23:25:31+08:00
  done_at: 2026-03-01T23:28:59+08:00
  priority: P0
  depends_on: []
  branch: feat/bob-m6-t002
  pr_or_commit: blocked:plan-guard-active-doing-tasks
  blocker: commit_guard_active_doing_tasks_prevented_code_commit
  deliverable: Board output clearly signals invalid/stale task state and source fields
  acceptance:
  - board validates malformed task session bindings without crashing
  - board output highlights stale/invalid rows with deterministic fields
  files:
  - scripts/plan-board.js

- id: T003
  title: Task dispatcher parallel execution wrapper
  scope: Add robust parallel dispatch wrapper for multi-task worker launch
  status: doing
  owner: carol
  claimed_at: 2026-03-01T23:25:31+08:00
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/carol-m6-t003
  pr_or_commit:
  blocker:
  deliverable: Dispatcher supports batched concurrent launch with clear per-task exit reporting
  acceptance:
  - dispatcher can launch multiple tasks concurrently with bounded concurrency
  - dispatcher emits machine-readable success/failure summary by task
  files:
  - scripts/plan-run.js

- id: T004
  title: Orchestrator execution guardrails
  scope: Strengthen orchestrator command constraints so planning/assignment stays deterministic
  status: done
  owner: dave
  claimed_at: 2026-03-01T23:25:31+08:00
  done_at: 2026-03-01T23:27:20+08:00
  priority: P0
  depends_on: []
  branch: feat/dave-m6-t004
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Orchestrator wrapper enforces explicit plan target and safe goal defaults
  acceptance:
  - orchestrator rejects ambiguous plan inputs
  - orchestrator emits traceable command context for audit/debug
  files:
  - scripts/plan-orchestrate.js

- id: T005
  title: Watchdog recovery policy hardening
  scope: Improve stale-task recovery and blocked downgrade policy for unattended execution
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Watchdog can recover interrupted tasks with deterministic fallback and clear logs
  acceptance:
  - stale doing tasks are resumed or blocked with explicit reason codes
  - recovery actions always update updated_at/checklist/activity log
  files:
  - scripts/plan-watchdog.js

- id: T006
  title: Commit guard release-mode enforcement
  scope: Tighten commit guard behavior to prevent unsafe submission while active tasks exist
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T003]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Guard policy supports release-mode strict checks with clear override paths
  acceptance:
  - non-plan commits are blocked when critical doing tasks exist
  - guard output provides exact blocking tasks and unblock action
  files:
  - scripts/plan-commit-guard.js

- id: T007
  title: Hook installer bootstrap reliability
  scope: Ensure hook installer idempotency and predictable local bootstrap behavior
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T006]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Hook install process is repeatable and safe across fresh/dirty repos
  acceptance:
  - repeated hook install does not duplicate or corrupt hook content
  - installer returns actionable messages for unsupported states
  files:
  - scripts/install-plan-hook.js

- id: T008
  title: Go-live runbook and rollback SOP
  scope: Produce operator-grade runbook for launch/rollback and incident response
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T001, T002, T005]
  branch:
  pr_or_commit:
  blocker:
  deliverable: One runbook covering launch sequence, verification, rollback, and owner matrix
  acceptance:
  - runbook includes minute-level go-live checklist and rollback trigger conditions
  - runbook maps each operation to exact CLI command and expected output
  files:
  - docs/release/go-live-runbook.md

- id: T009
  title: Scheduler/worker integration tests
  scope: Add automated tests for scheduler dispatch and worker task writeback loop
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T003, T004]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Integration tests covering claim->execute->writeback lifecycle
  acceptance:
  - tests cover successful done path and blocked fallback path
  - tests validate task ownership/session linkage and checklist sync
  files:
  - test/plan-scheduler-worker.integration.test.js

- id: T010
  title: Board/watchdog regression tests
  scope: Add regression tests for board field rendering and watchdog stale-task transitions
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T002, T005]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Regression suite for board/watchdog behavior under real failure patterns
  acceptance:
  - tests cover pid/alive rendering and invalid session metadata handling
  - tests cover stale doing to resume or blocked transitions with log assertions
  files:
  - test/plan-board-watchdog.regression.test.js

## Activity Log
- 2026-03-01T23:21:19+08:00 [ai-coordinator] Plan created for M6 go-live scheduler, assignment, and supervision hardening.

- 2026-03-01T23:23:27+08:00 [aih-auto] Claimed T001 (m6-t001-alice) owner=alice branch=feat/alice-m6-t001.
- 2026-03-01T23:24:09+08:00 [codex] Claimed T002 (m6-t002-codex) owner=codex branch=feat/codex-m6-t002.

- 2026-03-01T23:24:28+08:00 [ai-watchdog] Marked T002 blocked: worker offline and no recoverable session.
- 2026-03-01T23:24:56+08:00 [ai-coordinator] Reset T002 to todo/unassigned after invalid worker claim; will redispatch with strict task pinning.

- 2026-03-01T23:25:31+08:00 [aih-auto] Claimed T003 (m6-t003-carol) owner=carol branch=feat/carol-m6-t003.

- 2026-03-01T23:25:31+08:00 [aih-auto] Claimed T004 (m6-t004-dave) owner=dave branch=feat/dave-m6-t004.

- 2026-03-01T23:25:31+08:00 [aih-auto] Claimed T002 (m6-t002-bob) owner=bob branch=feat/bob-m6-t002.

- 2026-03-01T23:26:08+08:00 [ai-watchdog] Relaunched T001 (m6-t001-alice) via resume session 019ca9ff-59cc-74c3-bfc8-e820699e9024.
- 2026-03-01T23:27:20+08:00 [codex] Completed T004 (m6-t004-dave); added deterministic --plan validation and orchestrator execution context logging in scripts/plan-orchestrate.js.

- 2026-03-01T23:28:08+08:00 [ai-watchdog] Relaunched T002 (m6-t002-bob) via resume session 019caa01-50d1-7911-89c0-792cf4b8e894.
- 2026-03-01T23:28:08+08:00 [ai-watchdog] Relaunched T003 (m6-t003-carol) via resume session 019caa01-50e2-7bf0-a4f9-94da67a5caf6.
- 2026-03-01T23:28:59+08:00 [bob] Resumed T002 in session 019caa01-50d1-7911-89c0-792cf4b8e894, completed scoped implementation in scripts/plan-board.js, and closed as blocked because plan commit guard disallowed non-plan commit while active doing tasks remain.
