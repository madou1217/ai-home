# Plan: m4-remote-runtime-wave1

- plan_id: m4-remote-runtime-wave1-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T10:23:40+08:00
- updated_at: 2026-03-03T11:49:04+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- [ ] Strengthen remote runtime/session stability and operator observability.
- [ ] Close reconnect and patch-return reliability gaps for production workloads.

## Checklist
- [ ] T001 Remote connector handshake and retry hardening
- [ ] T002 Remote project session lifecycle hardening
- [ ] T003 Remote patch return idempotency hardening
- [ ] T004 Runtime command-path fallback hardening
- [ ] T005 Watchdog recovery behavior hardening
- [ ] T006 Remote runtime regression contract update
- [ ] T007 Runtime PATH scan executable validation hardening

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Remote connector handshake and retry hardening
  scope: Stabilize connector handshake failures and retry boundaries for long-lived remote sessions.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  depends_on: []
  branch: feat/wne3001-m4-t001
  pr_or_commit: 
  deliverable: Deterministic connector retry semantics and clearer failure classification.
  acceptance:
  - Connector handshake failures are classified with stable machine-readable codes.
  - Retry policy has bounded attempts with deterministic backoff behavior.
  files:
  - lib/remote/connector.js

- id: T002
  title: Remote project session lifecycle hardening
  scope: Harden remote session start/stop/recover flow under transient network and process restarts.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/rne3002-m4-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - Session state transitions stay consistent across reconnect/resume paths.
  - Orphan session cleanup paths are explicit and safe.
  files:
  - lib/remote/project-session.js

- id: T003
  title: Remote patch return idempotency hardening
  scope: Ensure patch-return channel handles duplicate and partial return flows safely.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T002]
  branch: feat/rne3003-m4-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - Duplicate patch-return submissions do not corrupt task/session state.
  - Partial failures expose actionable error metadata.
  files:
  - lib/remote/patch-return.js

- id: T004
  title: Runtime command-path fallback hardening
  scope: Improve CLI/runtime command-path fallback and diagnostics for remote execution context.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/rne3004-m4-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - Command-path fallback order is deterministic and logged.
  - Missing runtime prerequisites produce actionable remediation hints.
  files:
  - lib/runtime/command-path.js

- id: T005
  title: Watchdog recovery behavior hardening
  scope: Prevent repeated stale-loop relaunch patterns and improve blocked/relaunch decision quality.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001, T002]
  branch: feat/rne3005-m4-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - Watchdog avoids repeated relaunch loops for unrecoverable sessions.
  - Blocked vs relaunched decision path is deterministic and auditable.
  files:
  - scripts/plan-watchdog.js

- id: T006
  title: Remote runtime regression contract update
  scope: Expand remote runtime regression tests for connector/session/patch-return/watchdog interactions.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002, T003, T004, T005]
  branch: feat/rne3006-m4-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - Test assertions cover reconnect, session recovery, and patch-return idempotency.
  - Failures map to clear diagnosis in release workflow.
  files:
  - test/remote.connector.resilience.test.js
  - test/remote.project-session.test.js
  - test/remote.protocol.contract.test.js

- id: T007
  title: Runtime PATH scan executable validation hardening
  scope: Ensure command-path fallback rejects non-executable targets and directories while preserving deterministic diagnostics.
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/worker-codex-m4-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - PATH scan skips directory entries and non-executable files on non-Windows platforms.
  - Tests cover rejected invalid candidates and successful fallback behavior.
  files:
  - lib/runtime/command-path.js
  - test/command-path.test.js

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
