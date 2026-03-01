# Plan: Roadmap M3 Desktop Production

- plan_id: roadmap-m3-desktop-production-2026-03-01
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
- [ ] T001 Tauri backend command layer
- [ ] T002 Desktop GUI core features
- [ ] T003 Cross-platform package pipeline

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Tauri backend command layer
  scope: Implement desktop-side Rust command handlers for account state, default switch, export/import, and audit query
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: Stable Rust command interface for GUI control plane actions
  acceptance:
  - GUI can invoke account list/default switch/export/import/audit query commands
  - Command error model is explicit and consumable by frontend
  files:
  - desktop/tauri/src-tauri/src/main.rs
  - desktop/tauri/src-tauri/src/commands/accounts.rs
  - desktop/tauri/src-tauri/src/commands/migration.rs
  - desktop/tauri/src-tauri/src/commands/audit.rs

- id: T002
  title: Desktop GUI core features
  scope: Build production desktop UI for dashboard, one-click session launch, migration screens, and local audit browsing
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Desktop GUI that covers roadmap-defined key operations end-to-end
  acceptance:
  - Dashboard shows account/tool status, default account, usage, and recent actions
  - GUI provides launch controls and export/import plus audit browsing flows
  files:
  - desktop/tauri/src/App.tsx
  - desktop/tauri/src/views/dashboard.tsx
  - desktop/tauri/src/views/migration.tsx
  - desktop/tauri/src/views/audit-log.tsx
  - desktop/tauri/src/views/session-launcher.tsx

- id: T003
  title: Cross-platform package pipeline
  scope: Prepare Windows/Linux/macOS packaging and verification workflow for production desktop delivery
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T001, T002]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Reproducible multi-platform packaging pipeline and release checklist
  acceptance:
  - CI produces installable artifacts for Win/Linux/macOS
  - Release checklist covers core GUI operations before publish
  files:
  - .github/workflows/desktop-release.yml
  - desktop/tauri/src-tauri/tauri.conf.json
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-01T21:18:48+08:00 [ai-coordinator] Plan created from ROADMAP Milestone 3 (UTC+8).
