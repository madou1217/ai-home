# Plan: Proxy Modularization Parallel Execution

- plan_id: proxy-parallel-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T00:00:00Z
- updated_at: 2026-03-01T00:00:00Z
- status: active

## Global Rules
- This plan is authoritative for parallel execution.
- Every AI must claim a task by editing this file before coding.
- Do not edit files listed in another AI's `files` while that task is `doing`.

## TodoList

- id: T001
  title: Stabilize proxy module boundaries and exports
  scope: Audit proxy modules and normalize export contracts
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: Consistent module API across `lib/proxy/*`
  acceptance:
  - `npm test` passes
  - No circular dependency warnings
  files:
  - lib/proxy/*.js

- id: T002
  title: Add integration tests for v1 router paths
  scope: Cover `/v1/models`, `/v1/chat/completions`, `/v1/responses`
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: New integration tests and CI-stable assertions
  acceptance:
  - Tests pass locally
  - Includes success and error path
  files:
  - test/proxy*.test.js

- id: T003
  title: Add management API auth + error contract tests
  scope: `/v0/management/*` auth and not-found/invalid cases
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: Extended management router tests
  acceptance:
  - Unauthorized and valid management requests covered
  - Error payload format assertions present
  files:
  - test/proxy.management-router.test.js

- id: T004
  title: Plan/skill governance automation docs
  scope: Document how every AI uses plan claim lifecycle
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: Usage docs + examples for claim/release flow
  acceptance:
  - Includes claim example
  - Includes blocked-state handling
  files:
  - plans/README.md
  - skills/project-plan-coordinator/SKILL.md

- id: T005
  title: CLI UX regression sweep for proxy commands
  scope: Validate `proxy start|stop|status|serve|env|sync-codex`
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Regression checklist + fixes if needed
  acceptance:
  - Command outputs remain user-friendly
  - No command exit code regression
  files:
  - bin/ai-home.js
  - lib/proxy/*.js

## Activity Log
- 2026-03-01T00:00:00Z [ai-coordinator] Initial parallel plan created.

