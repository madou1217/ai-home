# Plan: Roadmap M3 Desktop Production

- plan_id: roadmap-m3-desktop-production-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T21:34:22+08:00
- updated_at: 2026-03-01T21:57:34+08:00
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
  status: doing
  owner: alice
  claimed_at: 2026-03-01T21:38:58+08:00
  done_at:
  priority: P0
  depends_on: []
  branch: feat/alice-m3-t001
  pr_or_commit:
  blocker:
  deliverable: Main Tauri entry exposes stable command registration for GUI calls
  acceptance:
  - main entry registers account/migration/audit command namespaces
  - command registration failures map to deterministic frontend-visible errors
  files:
  - desktop/tauri/src-tauri/src/main.rs

- id: T002
  title: Desktop accounts command module
  scope: Implement Rust command module for account list/status/default switch operations
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Accounts command module callable from GUI
  acceptance:
  - GUI-callable commands cover account list and default switch
  - command responses include machine-consumable status fields
  files:
  - desktop/tauri/src-tauri/src/commands/accounts.rs

- id: T003
  title: Desktop migration command module
  scope: Implement Rust command module for export/import trigger and progress/result reporting
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Migration command module with explicit result contract
  acceptance:
  - GUI can trigger export/import and receive structured result payload
  - failure states carry actionable reason codes
  files:
  - desktop/tauri/src-tauri/src/commands/migration.rs

- id: T004
  title: Desktop audit command module
  scope: Implement Rust command module for local audit query and filtering
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Audit command module for local searchable operation logs
  acceptance:
  - GUI can query audit records with filters and pagination cursor
  - response schema remains stable for frontend rendering
  files:
  - desktop/tauri/src-tauri/src/commands/audit.rs

- id: T005
  title: Desktop dashboard and launcher UI
  scope: Build desktop dashboard and one-click session launcher core UI flows
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: [T002]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Dashboard view with account/tool status and session launch controls
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
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T003, T004]
  branch:
  pr_or_commit:
  blocker:
  deliverable: GUI flows for migration and audit visibility
  acceptance:
  - migration UI supports trigger/status/result states
  - audit UI supports search/filter and detail expansion
  files:
  - desktop/tauri/src/views/migration.tsx
  - desktop/tauri/src/views/audit-log.tsx

- id: T007
  title: Desktop packaging config
  scope: Harden Tauri packaging config for Win/Linux/macOS release artifacts
  status: doing
  owner: bob
  claimed_at: 2026-03-01T21:38:58+08:00
  done_at:
  priority: P1
  depends_on: []
  branch: feat/bob-m3-t007
  pr_or_commit:
  blocker:
  deliverable: Cross-platform packaging configuration tuned for production deliverables
  acceptance:
  - configuration includes platform-specific packaging metadata
  - build config is compatible with CI release workflow
  files:
  - desktop/tauri/src-tauri/tauri.conf.json

- id: T008
  title: Desktop release workflow and checklist
  scope: Create CI release workflow and release-verification checklist for desktop production
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T007]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Repeatable release workflow with quality gate checklist
  acceptance:
  - workflow emits installable artifacts for three platforms
  - checklist covers add account/switch default/export/import GUI paths
  files:
  - .github/workflows/desktop-release.yml
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-01T21:34:22+08:00 [ai-coordinator] Plan expanded for high-parallel execution from ROADMAP Milestone 3 (UTC+8).
- 2026-03-01T21:38:06+08:00 [bob] Claimed T007; set status to doing, owner to bob, and branch to feat/bob-m3-t007.

- 2026-03-01T21:38:21+08:00 [alice] Claimed T001; set status to doing, owner to alice, and branch to feat/alice-m3-t001.
- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T001 for alice (feat/alice-m3-t001) to enable conflict-free parallel coding.
- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T007 for bob (feat/bob-m3-t007) to enable conflict-free parallel coding.
- 2026-03-01T21:57:34+08:00 [ai-coordinator] Normalized in-flight task metadata for stable board rendering (claimed_at/branch cleanup).
