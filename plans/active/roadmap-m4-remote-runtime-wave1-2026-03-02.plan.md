# Plan: m4-remote-runtime-wave1

- plan_id: m4-remote-runtime-wave1-2026-03-02
- coordinator: codex
- created_at: 2026-03-02T10:23:40+08:00
- updated_at: 2026-03-02T10:25:28+08:00
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
  status: doing
  owner: rne3001
  claimed_at: 2026-03-02T10:24:09+08:00
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/rne3001-m4-t001
  pr_or_commit:
  blocker:
  deliverable: Deterministic connector retry semantics and clearer failure classification.
  acceptance:
  - Connector handshake failures are classified with stable machine-readable codes.
  - Retry policy has bounded attempts with deterministic backoff behavior.
  files:
  - lib/remote/connector.js

- id: T002
  title: Remote project session lifecycle hardening
  scope: Harden remote session start/stop/recover flow under transient network and process restarts.
  status: doing
  owner: rne3002
  claimed_at: 2026-03-02T10:24:19+08:00
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/rne3002-m4-t002
  pr_or_commit:
  blocker:
  deliverable: Reliable project-session lifecycle transitions.
  acceptance:
  - Session state transitions stay consistent across reconnect/resume paths.
  - Orphan session cleanup paths are explicit and safe.
  files:
  - lib/remote/project-session.js

- id: T003
  title: Remote patch return idempotency hardening
  scope: Ensure patch-return channel handles duplicate and partial return flows safely.
  status: doing
  owner: rne3003
  claimed_at: 2026-03-02T10:24:20+08:00
  done_at: 
  priority: P1
  depends_on: [T002]
  branch: feat/rne3003-m4-t003
  pr_or_commit:
  blocker:
  deliverable: Idempotent patch-return behavior with deterministic error handling.
  acceptance:
  - Duplicate patch-return submissions do not corrupt task/session state.
  - Partial failures expose actionable error metadata.
  files:
  - lib/remote/patch-return.js

- id: T004
  title: Runtime command-path fallback hardening
  scope: Improve CLI/runtime command-path fallback and diagnostics for remote execution context.
  status: doing
  owner: rne3004
  claimed_at: 2026-03-02T10:24:21+08:00
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/rne3004-m4-t004
  pr_or_commit:
  blocker: worker_offline_no_recoverable_session
  deliverable: Safer runtime command-path resolution for remote tasks.
  acceptance:
  - Command-path fallback order is deterministic and logged.
  - Missing runtime prerequisites produce actionable remediation hints.
  files:
  - lib/runtime/command-path.js

- id: T005
  title: Watchdog recovery behavior hardening
  scope: Prevent repeated stale-loop relaunch patterns and improve blocked/relaunch decision quality.
  status: doing
  owner: rne3005
  claimed_at: 2026-03-02T10:24:22+08:00
  done_at: 
  priority: P0
  depends_on: [T001, T002]
  branch: feat/rne3005-m4-t005
  pr_or_commit:
  blocker: worker_offline_no_recoverable_session
  deliverable: Stable watchdog recovery loop with reduced false relaunches.
  acceptance:
  - Watchdog avoids repeated relaunch loops for unrecoverable sessions.
  - Blocked vs relaunched decision path is deterministic and auditable.
  files:
  - scripts/plan-watchdog.js

- id: T006
  title: Remote runtime regression contract update
  scope: Expand remote runtime regression tests for connector/session/patch-return/watchdog interactions.
  status: blocked
  owner: rne3006
  claimed_at: 2026-03-02T10:24:23+08:00
  done_at: 
  priority: P1
  depends_on: [T001, T002, T003, T004, T005]
  branch: feat/rne3006-m4-t006
  pr_or_commit:
  blocker: worker_offline_no_recoverable_session
  deliverable: Regression coverage for remote runtime wave1 go-live checks.
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
  status: doing
  owner: worker-codex
  claimed_at: 2026-03-02T02:26:10Z
  done_at:
  priority: P1
  depends_on: []
  branch: feat/worker-codex-m4-t007
  pr_or_commit:
  blocker:
  deliverable: Safer PATH-scan resolution logic that only accepts runnable command targets.
  acceptance:
  - PATH scan skips directory entries and non-executable files on non-Windows platforms.
  - Tests cover rejected invalid candidates and successful fallback behavior.
  files:
  - lib/runtime/command-path.js
  - test/command-path.test.js

## Activity Log
- 2026-03-02T10:23:40+08:00 [coordinator] Plan created for remote runtime wave1 hardening.

- 2026-03-02T10:24:09+08:00 [aih-auto] Claimed T001 (m4-t001-rne3001) owner=rne3001 branch=feat/rne3001-m4-t001.

- 2026-03-02T10:24:09+08:00 [aih-auto] Claimed T001 (m4-t001-rne3001) owner=rne3001 branch=feat/rne3001-m4-t001.

- 2026-03-02T10:24:09+08:00 [aih-auto] Claimed T001 (m4-t001-rne3001) owner=rne3001 branch=feat/rne3001-m4-t001.

- 2026-03-02T10:24:09+08:00 [aih-auto] Claimed T001 (m4-t001-rne3001) owner=rne3001 branch=feat/rne3001-m4-t001.

- 2026-03-02T10:24:09+08:00 [aih-auto] Claimed T001 (m4-t001-rne3001) owner=rne3001 branch=feat/rne3001-m4-t001.

- 2026-03-02T10:24:09+08:00 [aih-auto] Claimed T001 (m4-t001-rne3001) owner=rne3001 branch=feat/rne3001-m4-t001.

- 2026-03-02T10:24:19+08:00 [aih-auto] Claimed T002 (m4-t002-rne3002) owner=rne3002 branch=feat/rne3002-m4-t002.

- 2026-03-02T10:24:20+08:00 [aih-auto] Claimed T003 (m4-t003-rne3003) owner=rne3003 branch=feat/rne3003-m4-t003.

- 2026-03-02T10:24:21+08:00 [aih-auto] Claimed T004 (m4-t004-rne3004) owner=rne3004 branch=feat/rne3004-m4-t004.

- 2026-03-02T10:24:22+08:00 [aih-auto] Claimed T005 (m4-t005-rne3005) owner=rne3005 branch=feat/rne3005-m4-t005.

- 2026-03-02T10:24:23+08:00 [aih-auto] Claimed T006 (m4-t006-rne3006) owner=rne3006 branch=feat/rne3006-m4-t006.

- 2026-03-02T10:24:38+08:00 [ai-watchdog] Relaunched T002 (m4-t002-rne3002) via resume session 019cac5c-6295-7711-8c79-5a70d2d53ecb.
- 2026-03-02T10:24:38+08:00 [ai-watchdog] Relaunched T003 (m4-t003-rne3003) via resume session 019cac5c-676d-74a0-b022-a0fa62c6cdaf.
- 2026-03-02T10:24:38+08:00 [ai-watchdog] Marked T004 blocked: worker offline and no recoverable session.
- 2026-03-02T10:24:38+08:00 [ai-watchdog] Marked T005 blocked: worker offline and no recoverable session.
- 2026-03-02T10:24:38+08:00 [ai-watchdog] Marked T006 blocked: worker offline and no recoverable session.

- 2026-03-02T10:24:59+08:00 [aih-auto] Claimed T004 (m4-t004-rne3004) owner=rne3004 branch=feat/rne3004-m4-t004.

- 2026-03-02T10:25:00+08:00 [aih-auto] Claimed T005 (m4-t005-rne3005) owner=rne3005 branch=feat/rne3005-m4-t005.

- 2026-03-02T10:25:01+08:00 [aih-auto] Claimed T006 (m4-t006-rne3006) owner=rne3006 branch=feat/rne3006-m4-t006.
- 2026-03-02T02:26:10Z [worker-codex] Claimed T007 (m4-t007-worker-codex) owner=worker-codex branch=feat/worker-codex-m4-t007.

- 2026-03-02T10:25:28+08:00 [ai-watchdog] Relaunched T004 (m4-t004-rne3004) via resume session 019cac5d-02f2-73e0-8fa4-a7a38061015b.
- 2026-03-02T10:25:28+08:00 [ai-watchdog] Relaunched T005 (m4-t005-rne3005) via resume session 019cac5d-076f-71d3-b35b-e441ef1ec8ce.
- 2026-03-02T10:25:28+08:00 [ai-watchdog] Marked T006 blocked: worker offline and no recoverable session.
