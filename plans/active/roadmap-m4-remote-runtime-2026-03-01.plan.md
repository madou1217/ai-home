# Plan: Roadmap M4 Remote Runtime Layer

- plan_id: roadmap-m4-remote-runtime-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T21:18:48+08:00
- updated_at: 2026-03-01T21:18:48+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [ ] T001 Remote daemon and transport control
- [ ] T002 Remote project execution and patch return
- [ ] T003 Isolated runtime reproducibility

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Remote daemon and transport control
  scope: Implement remote daemon lifecycle, transport/auth handshake, and session continuity control
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: Linux-first remote daemon + control channel with reconnect-safe session contracts
  acceptance:
  - Local CLI can authenticate and connect to remote daemon endpoint
  - Session control supports reconnection without losing control context
  files:
  - remote/daemon/src/main.rs
  - remote/proto/control.proto
  - lib/remote/connector.js

- id: T002
  title: Remote project execution and patch return
  scope: Enable local CLI to operate in remote project workspaces with command execution and file change return
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: End-to-end remote project operation path with patch/file result return
  acceptance:
  - Local codex/claude/gemini commands execute against remote project directory
  - File modifications and command outputs are returned reliably to local side
  files:
  - remote/agent/workspace-runner.js
  - lib/remote/project-session.js
  - lib/remote/patch-return.js
  - test/remote.project-session.test.js

- id: T003
  title: Isolated runtime reproducibility
  scope: Deliver container/sandbox execution templates and deterministic runtime manager behavior
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Rebuildable isolated runtime templates for codex/claude/gemini remote execution
  acceptance:
  - Runtime templates are reproducible and selectable by profile
  - Rebind/restart behavior is deterministic under daemon recovery cases
  files:
  - remote/runtime/container-template.Dockerfile
  - remote/runtime/sandbox-profile.nsjail.cfg
  - remote/runtime/environment-manager.js
  - test/remote.runtime-isolation.test.js

## Activity Log
- 2026-03-01T21:18:48+08:00 [ai-coordinator] Plan created from ROADMAP Milestone 4 (UTC+8).
