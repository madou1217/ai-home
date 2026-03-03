# Plan: Roadmap M4 Remote Runtime GA

- plan_id: roadmap-m4-remote-ga-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T23:48:40+08:00
- updated_at: 2026-03-01T23:57:01+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [ ] T001 Remote daemon lifecycle hardening
- [ ] T002 Remote workspace runner hardening
- [ ] T003 Remote connector auth reconnect reliability
- [ ] T004 Remote transport protocol contract freeze
- [ ] T005 Remote patch return channel reliability
- [ ] T006 Runtime environment manager hardening
- [ ] T007 Runtime container template baseline
- [ ] T008 Runtime nsjail sandbox profile baseline
- [ ] T009 Remote integration test expansion

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Remote daemon lifecycle hardening
  scope: Stabilize daemon startup shutdown session lifecycle behavior
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/rem01-m4-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - daemon start stop restart paths are deterministic
  - failures surface actionable reason codes
  files:
  - remote/daemon/src/main.rs

- id: T002
  title: Remote workspace runner hardening
  scope: Harden workspace command execution and filesystem safety boundaries
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/rem02-m4-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - command execution respects workspace isolation
  - path traversal and invalid command inputs are blocked
  files:
  - remote/agent/workspace-runner.js

- id: T003
  title: Remote connector auth reconnect reliability
  scope: Harden connector authentication and reconnect state management
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/rem03-m4-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - reconnect attempts follow bounded policy with clear states
  - auth failures are distinguishable from transport failures
  files:
  - lib/remote/connector.js

- id: T004
  title: Remote transport protocol contract freeze
  scope: Freeze protocol contract for control and streaming channels
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/rem04-m4-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - protocol messages cover session control and status streaming
  - backward compatibility constraints are documented in schema
  files:
  - remote/proto/control.proto

- id: T005
  title: Remote patch return channel reliability
  scope: Harden patch upload and apply feedback semantics
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T002, T004]
  branch: feat/rem05-m4-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - patch transmission retries and failure paths are deterministic
  - return payload includes precise apply status and diagnostics
  files:
  - lib/remote/patch-return.js

- id: T006
  title: Runtime environment manager hardening
  scope: Stabilize runtime environment bind/rebind and health checks
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/rem06-m4-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - bind rebind recover flows are deterministic
  - state transitions expose machine-readable diagnostics
  files:
  - remote/runtime/environment-manager.js

- id: T007
  title: Runtime container template baseline
  scope: Harden container template for reproducible tool runtime
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T006]
  branch: feat/rem07-m4-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - template includes deterministic dependency baseline
  - build reproducibility guidance is captured in comments
  files:
  - remote/runtime/container-template.Dockerfile

- id: T008
  title: Runtime nsjail sandbox profile baseline
  scope: Harden nsjail profile for least-privilege execution path
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T006]
  branch: feat/rem08-m4-t008
  pr_or_commit: 
  blocker: 
  acceptance:
  - profile blocks unsafe syscalls and filesystem escapes
  - profile supports required tool execution capabilities
  files:
  - remote/runtime/sandbox-profile.nsjail.cfg

- id: T009
  title: Remote integration test expansion
  scope: Expand remote integration tests for daemon connector workspace patch flows
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002, T003, T004, T005, T006]
  branch: feat/rem09-m4-t009
  pr_or_commit: 
  blocker: 
  acceptance:
  - tests cover connect execute patch reconnect end-to-end path
  - flaky conditions are reproduced with deterministic assertions
  files:
  - test/remote.project-session.test.js

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
