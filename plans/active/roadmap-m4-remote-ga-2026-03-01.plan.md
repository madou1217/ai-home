# Plan: Roadmap M4 Remote Runtime GA

- plan_id: roadmap-m4-remote-ga-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T23:48:40+08:00
- updated_at: 2026-03-01T23:52:04+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [x] T001 Remote daemon lifecycle hardening
- [x] T002 Remote workspace runner hardening
- [x] T003 Remote connector auth reconnect reliability
- [x] T004 Remote transport protocol contract freeze
- [x] T005 Remote patch return channel reliability
- [x] T006 Runtime environment manager hardening
- [x] T007 Runtime container template baseline
- [ ] T008 Runtime nsjail sandbox profile baseline
- [ ] T009 Remote integration test expansion

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Remote daemon lifecycle hardening
  scope: Stabilize daemon startup shutdown session lifecycle behavior
  status: done
  owner: rem01
  claimed_at: 2026-03-01T23:48:56+08:00
  done_at: 2026-03-01T15:51:41Z
  priority: P0
  depends_on: []
  branch: feat/rem01-m4-t001
  pr_or_commit: addc239
  blocker:
  deliverable: Stable daemon process lifecycle for remote control
  acceptance:
  - daemon start stop restart paths are deterministic
  - failures surface actionable reason codes
  files:
  - remote/daemon/src/main.rs

- id: T002
  title: Remote workspace runner hardening
  scope: Harden workspace command execution and filesystem safety boundaries
  status: done
  owner: rem02
  claimed_at: 2026-03-01T23:48:57+08:00
  done_at: 2026-03-01T23:50:25+08:00
  priority: P0
  depends_on: [T001]
  branch: feat/rem02-m4-t002
  pr_or_commit: local-change-no-commit
  blocker:
  deliverable: Reliable workspace runner for remote project operations
  acceptance:
  - command execution respects workspace isolation
  - path traversal and invalid command inputs are blocked
  files:
  - remote/agent/workspace-runner.js

- id: T003
  title: Remote connector auth reconnect reliability
  scope: Harden connector authentication and reconnect state management
  status: done
  owner: rem03
  claimed_at: 2026-03-01T23:48:56+08:00
  done_at: 2026-03-01T15:49:55Z
  priority: P0
  depends_on: []
  branch: feat/rem03-m4-t003
  pr_or_commit: verified-existing-implementation@6bd359b
  blocker:
  deliverable: Reliable client connector for unstable network conditions
  acceptance:
  - reconnect attempts follow bounded policy with clear states
  - auth failures are distinguishable from transport failures
  files:
  - lib/remote/connector.js

- id: T004
  title: Remote transport protocol contract freeze
  scope: Freeze protocol contract for control and streaming channels
  status: done
  owner: rem04
  claimed_at: 2026-03-01T23:48:57+08:00
  done_at: 2026-03-01T15:50:18Z
  priority: P0
  depends_on: [T001]
  branch: feat/rem04-m4-t004
  pr_or_commit: working-tree (no commit requested)
  blocker:
  deliverable: Stable protocol schema for local-remote interoperability
  acceptance:
  - protocol messages cover session control and status streaming
  - backward compatibility constraints are documented in schema
  files:
  - remote/proto/control.proto

- id: T005
  title: Remote patch return channel reliability
  scope: Harden patch upload and apply feedback semantics
  status: done
  owner: rem05
  claimed_at: 2026-03-01T23:48:56+08:00
  done_at: 2026-03-01T15:51:17Z
  priority: P1
  depends_on: [T002, T004]
  branch: feat/rem05-m4-t005
  pr_or_commit: working-tree (no commit requested)
  blocker:
  deliverable: Predictable patch return workflow with failure reporting
  acceptance:
  - patch transmission retries and failure paths are deterministic
  - return payload includes precise apply status and diagnostics
  files:
  - lib/remote/patch-return.js

- id: T006
  title: Runtime environment manager hardening
  scope: Stabilize runtime environment bind/rebind and health checks
  status: done
  owner: rem06
  claimed_at: 2026-03-01T23:48:56+08:00
  done_at: 2026-03-01T23:51:37+08:00
  priority: P0
  depends_on: [T001]
  branch: feat/rem06-m4-t006
  pr_or_commit: working-tree (no commit requested)
  blocker:
  deliverable: Deterministic runtime manager for isolated execution targets
  acceptance:
  - bind rebind recover flows are deterministic
  - state transitions expose machine-readable diagnostics
  files:
  - remote/runtime/environment-manager.js

- id: T007
  title: Runtime container template baseline
  scope: Harden container template for reproducible tool runtime
  status: done
  owner: rem07
  claimed_at: 2026-03-01T23:48:57+08:00
  done_at: 2026-03-01T23:50:29+08:00
  priority: P1
  depends_on: [T006]
  branch: feat/rem07-m4-t007
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Rebuildable container template for codex/claude/gemini runtime
  acceptance:
  - template includes deterministic dependency baseline
  - build reproducibility guidance is captured in comments
  files:
  - remote/runtime/container-template.Dockerfile

- id: T008
  title: Runtime nsjail sandbox profile baseline
  scope: Harden nsjail profile for least-privilege execution path
  status: blocked
  owner: rem08
  claimed_at: 2026-03-01T23:48:56+08:00
  done_at: 
  priority: P1
  depends_on: [T006]
  branch: feat/rem08-m4-t008
  pr_or_commit:
  blocker: worker_offline_no_recoverable_session
  deliverable: Safe sandbox profile for lightweight isolation option
  acceptance:
  - profile blocks unsafe syscalls and filesystem escapes
  - profile supports required tool execution capabilities
  files:
  - remote/runtime/sandbox-profile.nsjail.cfg

- id: T009
  title: Remote integration test expansion
  scope: Expand remote integration tests for daemon connector workspace patch flows
  status: blocked
  owner: rem09
  claimed_at: 2026-03-01T23:48:57+08:00
  done_at: 
  priority: P0
  depends_on: [T002, T003, T004, T005, T006]
  branch: feat/rem09-m4-t009
  pr_or_commit:
  blocker: plan_guard_blocks_code_commit_until_other_active_doing_tasks_close; resumed_session=019caa16-b2f8-7232-be5a-54a310db670f
  deliverable: Integration test suite covering critical remote workflows
  acceptance:
  - tests cover connect execute patch reconnect end-to-end path
  - flaky conditions are reproduced with deterministic assertions
  files:
  - test/remote.project-session.test.js

## Activity Log
- 2026-03-01T23:48:40+08:00 [ai-coordinator] Plan created for Milestone 4 remote runtime GA.

- 2026-03-01T23:48:56+08:00 [aih-auto] Claimed T001 (m4-t001-rem01) owner=rem01 branch=feat/rem01-m4-t001.

- 2026-03-01T23:48:56+08:00 [aih-auto] Claimed T005 (m4-t005-rem05) owner=rem05 branch=feat/rem05-m4-t005.

- 2026-03-01T23:48:56+08:00 [aih-auto] Claimed T003 (m4-t003-rem03) owner=rem03 branch=feat/rem03-m4-t003.

- 2026-03-01T23:48:56+08:00 [aih-auto] Claimed T008 (m4-t008-rem08) owner=rem08 branch=feat/rem08-m4-t008.

- 2026-03-01T23:48:56+08:00 [aih-auto] Claimed T006 (m4-t006-rem06) owner=rem06 branch=feat/rem06-m4-t006.

- 2026-03-01T23:48:57+08:00 [aih-auto] Claimed T004 (m4-t004-rem04) owner=rem04 branch=feat/rem04-m4-t004.

- 2026-03-01T23:48:57+08:00 [aih-auto] Claimed T009 (m4-t009-rem09) owner=rem09 branch=feat/rem09-m4-t009.

- 2026-03-01T23:48:57+08:00 [aih-auto] Claimed T007 (m4-t007-rem07) owner=rem07 branch=feat/rem07-m4-t007.

- 2026-03-01T23:48:57+08:00 [aih-auto] Claimed T002 (m4-t002-rem02) owner=rem02 branch=feat/rem02-m4-t002.

- 2026-03-01T15:49:55Z [rem03] Completed T003 validation for lib/remote/connector.js; bounded reconnect and auth/transport error distinction verified via test run.

- 2026-03-01T23:49:36+08:00 [ai-watchdog] Marked T008 blocked: worker offline and no recoverable session.

- 2026-03-01T23:49:48+08:00 [ai-watchdog] Relaunched T001 (m4-t001-rem01) via resume session 019caa16-ad56-7401-bc2c-6622085833a7.

- 2026-03-01T23:50:03+08:00 [ai-watchdog] Marked T001 blocked: worker offline and no recoverable session.

- 2026-03-01T23:50:29+08:00 [rem07] Completed T007 in remote/runtime/container-template.Dockerfile; added deterministic dependency baseline controls and reproducibility guidance comments.

- 2026-03-01T15:50:18Z [codex] Completed T004 in remote/proto/control.proto; added additive status streaming RPC/messages and explicit stream backward-compatibility notes.

- 2026-03-01T23:50:25+08:00 [rem02] Completed T002 in remote/agent/workspace-runner.js; enforced workspace-safe cwd resolution, blocked shell mode and null-byte/invalid env inputs, and verified remote project-session tests.

- 2026-03-01T23:51:08+08:00 [ai-watchdog] Relaunched T009 (m4-t009-rem09) via resume session 019caa16-b2f8-7232-be5a-54a310db670f.

- 2026-03-01T15:51:17Z [rem05] Completed T005 in lib/remote/patch-return.js; added deterministic transmit retry state, apply diagnostics/status payload fields, and payload inspection support.

- 2026-03-01T23:51:37+08:00 [rem06] Completed T006 in remote/runtime/environment-manager.js; hardened deterministic bind/rebind/recover diagnostics and added runtime health-check contract with machine-readable status codes.

- 2026-03-01T15:51:41Z [rem01] Completed T001 in remote/daemon/src/main.rs; bound remote sessions to lifecycle generation, invalidated sessions on stop/restart, and added deterministic daemon-stopped reason codes for blocked operations.

- 2026-03-01T23:52:04+08:00 [rem09] Blocked T009 after resume session 019caa16-b2f8-7232-be5a-54a310db670f: expanded test/remote.project-session.test.js and verified pass (6/6), but plan-guard rejected code commit because other plan tasks remained doing at commit time; kept checklist unchecked and left done_at/pr_or_commit empty.
