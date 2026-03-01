# Plan: M4.1 Remote Connectivity Layer

- plan_id: roadmap-m4-1-remote-connectivity-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T10:00:45Z
- updated_at: 2026-03-01T19:16:41+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [x] T001 Implement remote daemon connectivity and session transport foundation

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Implement remote daemon connectivity and session transport foundation
  scope: Build daemon entrypoint, control protocol, and client connector with auth-ready connection flow
  status: done
  owner: dave
  claimed_at: 2026-03-01T18:19:13+08:00
  done_at: 2026-03-01T18:35:36+08:00
  priority: P0
  depends_on: []
  branch: feat/dave-m4-1
  pr_or_commit: N/A (no commit requested)
  blocker:
  deliverable: Stable local-to-remote control channel for daemon session management
  acceptance:
  - Local client establishes authenticated control session with remote daemon
  - Connection lifecycle handles reconnect-oriented state transitions
  files:
  - remote/daemon/src/main.rs
  - remote/proto/control.proto
  - lib/remote/connector.js

## Activity Log
- 2026-03-01T10:00:45Z [ai-coordinator] Plan created from roadmap milestone M4.1.
- 2026-03-01T10:04:03Z [ai-coordinator] Relaxed cross-track dependency to increase parallel execution.
- 2026-03-01T18:14:58+08:00 [ai-coordinator] Reset invalid pre-assignment; ready for manual claim in UTC+8.
- 2026-03-01T18:19:13+08:00 [dave] Claimed T001, set status to doing, owner=dave, branch=feat/dave-m4-1.
- 2026-03-01T18:35:36+08:00 [dave] Completed T001 across remote/daemon/src/main.rs, remote/proto/control.proto, lib/remote/connector.js; set status to done and recorded pr_or_commit.
- 2026-03-01T19:16:41+08:00 [dave] Performed post-completion verification: connector module load, rust daemon compile, and daemon+connector reconnect smoke test passed.
