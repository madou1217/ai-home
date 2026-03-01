# Plan: Roadmap M4 Remote Runtime Layer

- plan_id: roadmap-m4-remote-runtime-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T21:34:22+08:00
- updated_at: 2026-03-01T22:14:10+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [x] T001 Remote daemon core lifecycle
- [x] T002 Remote transport contract
- [ ] T003 Remote connector auth/reconnect
- [ ] T004 Remote workspace runner
- [ ] T005 Remote project session bridge
- [ ] T006 Remote patch return channel
- [x] T007 Runtime isolation templates
- [ ] T008 Runtime environment manager
- [ ] T009 Remote session integration tests

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Remote daemon core lifecycle
  scope: Implement daemon lifecycle and remote control host behavior (Linux-first)
  status: done
  owner: carol
  claimed_at: 2026-03-01T22:11:26+08:00
  done_at: 2026-03-01T22:14:10+08:00
  priority: P0
  depends_on: []
  branch: feat/carol-m4-t001
  pr_or_commit: 604b595
  blocker:
  deliverable: Stable remote daemon lifecycle control surface
  acceptance:
  - daemon start/stop/restart behavior is deterministic
  - runtime state transitions are observable for reconnect flows
  files:
  - remote/daemon/src/main.rs

- id: T002
  title: Remote transport contract
  scope: Define and stabilize control transport protocol for auth/session/project operations
  status: done
  owner: dave
  claimed_at: 2026-03-01T22:11:26+08:00
  done_at: 2026-03-01T22:14:10+08:00
  priority: P0
  depends_on: []
  branch: feat/dave-m4-t002
  pr_or_commit: a056478
  blocker:
  deliverable: Versioned transport contract for local<->remote control channel
  acceptance:
  - protocol covers auth/session/project lifecycle messages
  - backward-compatible field strategy documented in proto comments
  files:
  - remote/proto/control.proto

- id: T003
  title: Remote connector auth/reconnect
  scope: Implement connector-side auth handshake and reconnect/session reattach behavior
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T002]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Local connector with robust reconnect behavior
  acceptance:
  - connector can reattach control session after transient disconnect
  - auth failure and retry paths surface explicit error reasons
  files:
  - lib/remote/connector.js

- id: T004
  title: Remote workspace runner
  scope: Implement remote workspace command execution loop for project-scoped operations
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Workspace runner supporting command execution in isolated project dirs
  acceptance:
  - runner executes commands in selected remote workspace context
  - execution output and exit states are emitted with structured metadata
  files:
  - remote/agent/workspace-runner.js

- id: T005
  title: Remote project session bridge
  scope: Bridge local CLI task/session operations to remote workspace runner control
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T003, T004]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Project session bridge for remote CLI development loop
  acceptance:
  - local commands can target remote project session context
  - session operations preserve context across reconnect and retries
  files:
  - lib/remote/project-session.js

- id: T006
  title: Remote patch return channel
  scope: Implement minimal patch/file return path from remote agent to local controller
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T004]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Patch-return channel for remote file modifications
  acceptance:
  - remote edits can be serialized and returned as patch payloads
  - local side can apply/inspect returned patch metadata
  files:
  - lib/remote/patch-return.js

- id: T007
  title: Runtime isolation templates
  scope: Deliver deterministic container/sandbox templates for remote tool execution
  status: done
  owner: erin
  claimed_at: 2026-03-01T22:11:54+08:00
  done_at: 2026-03-01T22:14:10+08:00
  priority: P1
  depends_on: []
  branch: feat/erin-m4-t007
  pr_or_commit: b674ffd
  blocker:
  deliverable: Rebuildable isolation templates for codex/claude/gemini runtime
  acceptance:
  - template artifacts build reproducibly
  - template selection supports runtime profile switching
  files:
  - remote/runtime/container-template.Dockerfile
  - remote/runtime/sandbox-profile.nsjail.cfg

- id: T008
  title: Runtime environment manager
  scope: Implement profile binding/rebind/restart state manager for isolated runtimes
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T007]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Runtime manager with deterministic binding state machine
  acceptance:
  - runtime manager exposes active profile + binding sequence state
  - restart/rebind behavior is deterministic across recovery cases
  files:
  - remote/runtime/environment-manager.js

- id: T009
  title: Remote session integration tests
  scope: Add integration coverage for remote project session and runtime isolation behavior
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T005, T006, T008]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Test coverage validating end-to-end remote session loop
  acceptance:
  - remote session tests cover success, reconnect, and failure branches
  - runtime isolation tests verify profile/binding contract behavior
  files:
  - test/remote.project-session.test.js
  - test/remote.runtime-isolation.test.js

## Activity Log
- 2026-03-01T21:34:22+08:00 [ai-coordinator] Plan expanded for high-parallel execution from ROADMAP Milestone 4 (UTC+8).
- 2026-03-01T21:37:57+08:00 [carol] Claimed T001, set status=doing, branch=feat/carol-m4-t001.

- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T001 for carol (feat/carol-m4-t001) to enable conflict-free parallel coding.
- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T002 for dave (feat/dave-m4-t002) to enable conflict-free parallel coding.
- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T007 for erin (feat/erin-m4-t007) to enable conflict-free parallel coding.
- 2026-03-01T21:57:34+08:00 [ai-coordinator] Normalized in-flight task metadata for stable board rendering (claimed_at/branch cleanup).

- 2026-03-01T22:09:01+08:00 [ai-coordinator] Reconciled stale doing tasks to todo (no live worker process): T001, T002, T007.

- 2026-03-01T22:11:26+08:00 [aih-auto] Claimed T002 (m4-t002-dave) owner=dave branch=feat/dave-m4-t002.

- 2026-03-01T22:11:26+08:00 [aih-auto] Claimed T001 (m4-t001-carol) owner=carol branch=feat/carol-m4-t001.

- 2026-03-01T22:11:54+08:00 [aih-auto] Claimed T007 (m4-t007-erin) owner=erin branch=feat/erin-m4-t007.

- 2026-03-01T22:14:10+08:00 [ai-coordinator] Marked done by worker commits: T001@604b595, T002@a056478, T007@b674ffd.
