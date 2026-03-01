# Plan: <topic>

- plan_id: <topic>-<yyyy-mm-dd>
- coordinator: <ai-name>
- created_at: <ISO8601>
- updated_at: <ISO8601>
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

- id: T001
  title: <task-title>
  scope: <clear-boundary>
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: <what to deliver>
  acceptance:
  - <check-1>
  - <check-2>
  files:
  - <path-a>
  - <path-b>

- id: T002
  title: <task-title>
  scope: <clear-boundary>
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: <what to deliver>
  acceptance:
  - <check-1>
  files:
  - <path>

## Activity Log
- <ISO8601> [coordinator] Plan created.

