# Plan: Roadmap M3 Desktop GA

- plan_id: roadmap-m3-desktop-ga-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T23:29:02+08:00
- updated_at: 2026-03-02T00:37:43+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList
- Wave 1 (bootstrap): T001
- Wave 2 (parallel core): T002, T003, T004, T010
- Wave 3 (parallel UI): T005, T006, T007, T008, T011
- Wave 4 (integration): T009
- Wave 5 (go-live sign-off): T012

## Checklist
- [ ] T001 Tauri command contract freeze
- [ ] T002 Desktop accounts command reliability
- [ ] T003 Desktop migration command reliability
- [ ] T004 Desktop audit command performance
- [ ] T005 Dashboard production UX pass
- [ ] T006 Session launcher stability pass
- [ ] T007 Migration UI state and error handling
- [ ] T008 Audit UI query and paging UX
- [ ] T009 Desktop app shell and navigation hardening
- [ ] T010 Cross-platform packaging metadata hardening
- [ ] T011 Desktop release CI workflow hardening
- [ ] T012 Desktop GA checklist and sign-off doc

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Tauri command contract freeze
  scope: Finalize desktop invoke command registration and error mapping contract
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/gui01-m3-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - command registration covers required GUI actions for GA
  - command errors map to deterministic frontend codes
  files:
  - desktop/tauri/src-tauri/src/main.rs

- id: T002
  title: Desktop accounts command reliability
  scope: Harden account list/default/switch command behavior for production traffic
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/gui02-m3-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - account operations are idempotent and deterministic
  - error payloads are consistent for GUI rendering
  files:
  - desktop/tauri/src-tauri/src/commands/accounts.rs

- id: T003
  title: Desktop migration command reliability
  scope: Harden export/import command behavior and progress/result reporting
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/gui03-m3-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - export/import trigger returns stable progress and final result schema
  - recoverable failure reasons are surfaced to GUI
  files:
  - desktop/tauri/src-tauri/src/commands/migration.rs

- id: T004
  title: Desktop audit command performance
  scope: Improve audit query filtering/pagination performance for local searchability
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001]
  branch: feat/gui04-m3-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - filtered query returns stable cursor semantics
  - command performance is acceptable on large local logs
  files:
  - desktop/tauri/src-tauri/src/commands/audit.rs

- id: T005
  title: Dashboard production UX pass
  scope: Final UX and state behavior pass for desktop status dashboard
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002]
  branch: feat/gui05-m3-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - dashboard surfaces status/default/usage/recent actions clearly
  - loading/empty/error states are complete and user-actionable
  files:
  - desktop/tauri/src/views/dashboard.tsx

- id: T006
  title: Session launcher stability pass
  scope: Harden one-click launcher flow for codex claude gemini session start
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T002]
  branch: feat/gui06-m3-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - launcher supports codex claude gemini start actions
  - launcher failure states provide retry and diagnosis hints
  files:
  - desktop/tauri/src/views/session-launcher.tsx

- id: T007
  title: Migration UI state and error handling
  scope: Harden migration UI state machine including progress success failure recovery
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T003]
  branch: feat/gui07-m3-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - export/import UI reflects real-time status and terminal states
  - UI offers clear next actions on failure
  files:
  - desktop/tauri/src/views/migration.tsx

- id: T008
  title: Audit UI query and paging UX
  scope: Improve audit log browsing/search/filter UX for local operational review
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T004]
  branch: feat/gui08-m3-t008
  pr_or_commit: 
  blocker: 
  acceptance:
  - query filter and pagination interactions are consistent
  - detail view supports fast triage workflows
  files:
  - desktop/tauri/src/views/audit-log.tsx

- id: T009
  title: Desktop app shell and navigation hardening
  scope: Harden app-level boot route and shared state wiring for release stability
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T005, T006, T007, T008]
  branch: feat/gui10-m3-t009
  pr_or_commit: 
  blocker: 
  acceptance:
  - app boot and navigation handle all target views deterministically
  - global error boundary and fallback UI are complete
  files:
  - desktop/tauri/src/App.tsx

- id: T010
  title: Cross-platform packaging metadata hardening
  scope: Finalize tauri packaging metadata/signing/notarization placeholders for Win Linux macOS
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/bob-m3-t010
  pr_or_commit: 
  blocker: 
  acceptance:
  - config includes platform-specific metadata required for GA packaging
  - config supports CI release workflow without manual patching
  files:
  - desktop/tauri/src-tauri/tauri.conf.json

- id: T011
  title: Desktop release CI workflow hardening
  scope: Harden release workflow for reproducible Win Linux macOS artifacts
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T010]
  branch: feat/gui09-m3-t011
  pr_or_commit: 
  blocker: 
  acceptance:
  - workflow produces installable artifacts across three platforms
  - workflow includes failure-fast checks and artifact naming consistency
  files:
  - .github/workflows/desktop-release.yml

- id: T012
  title: Desktop GA checklist and sign-off doc
  scope: Produce final operator checklist and launch sign-off criteria for desktop GA
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T005, T006, T007, T008, T010, T011]
  branch: feat/gui11-m3-t012
  pr_or_commit: 
  blocker: 
  acceptance:
  - checklist covers add account switch default export import and launcher flows
  - sign-off criteria include pass/fail gates and rollback triggers
  files:
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
