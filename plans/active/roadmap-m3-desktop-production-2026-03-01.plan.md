# Plan: Roadmap M3 Desktop Production

- plan_id: roadmap-m3-desktop-production-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T21:34:22+08:00
- updated_at: 2026-03-01T22:38:31+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [ ] T001 Tauri command registration
- [ ] T002 Desktop accounts command module
- [ ] T003 Desktop migration command module
- [ ] T004 Desktop audit command module
- [ ] T005 Desktop dashboard and launcher UI
- [ ] T006 Desktop migration and audit UI
- [ ] T007 Desktop packaging config
- [ ] T008 Desktop release workflow and checklist

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Tauri command registration
  scope: Wire Rust command endpoints and unified error mapping entrypoint
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/alice-m3-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - main entry registers account/migration/audit command namespaces
  - command registration failures map to deterministic frontend-visible errors
  files:
  - desktop/tauri/src-tauri/src/main.rs

- id: T002
  title: Desktop accounts command module
  scope: Implement Rust command module for account list/status/default switch operations
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/alice-m3-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - GUI-callable commands cover account list and default switch
  - command responses include machine-consumable status fields
  files:
  - desktop/tauri/src-tauri/src/commands/accounts.rs

- id: T003
  title: Desktop migration command module
  scope: Implement Rust command module for export/import trigger and progress/result reporting
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/bob-m3-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - GUI can trigger export/import and receive structured result payload
  - failure states carry actionable reason codes
  files:
  - desktop/tauri/src-tauri/src/commands/migration.rs

- id: T004
  title: Desktop audit command module
  scope: Implement Rust command module for local audit query and filtering
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001]
  branch: feat/carol-m3-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - GUI can query audit records with filters and pagination cursor
  - response schema remains stable for frontend rendering
  files:
  - desktop/tauri/src-tauri/src/commands/audit.rs

- id: T005
  title: Desktop dashboard and launcher UI
  scope: Build desktop dashboard and one-click session launcher core UI flows
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002]
  branch: feat/dave-m3-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - dashboard shows status/default/usage/recent actions
  - one-click launcher supports codex/claude/gemini entry actions
  files:
  - desktop/tauri/src/App.tsx
  - desktop/tauri/src/views/dashboard.tsx
  - desktop/tauri/src/views/session-launcher.tsx

- id: T006
  title: Desktop migration and audit UI
  scope: Build visual export/import workflow and local audit browsing UI
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T003, T004]
  branch: feat/ivan-m3-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - migration UI supports trigger/status/result states
  - audit UI supports search/filter and detail expansion
  files:
  - desktop/tauri/src/views/migration.tsx
  - desktop/tauri/src/views/audit-log.tsx

- id: T007
  title: Desktop packaging config
  scope: Harden Tauri packaging config for Win/Linux/macOS release artifacts
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/bob-m3-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - configuration includes platform-specific packaging metadata
  - build config is compatible with CI release workflow
  files:
  - desktop/tauri/src-tauri/tauri.conf.json

- id: T008
  title: Desktop release workflow and checklist
  scope: Create CI release workflow and release-verification checklist for desktop production
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T007]
  branch: feat/judy-m3-t008
  pr_or_commit: 
  blocker: 
  acceptance:
  - workflow emits installable artifacts for three platforms
  - checklist covers add account/switch default/export/import GUI paths
  files:
  - .github/workflows/desktop-release.yml
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
