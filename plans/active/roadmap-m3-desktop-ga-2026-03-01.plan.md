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
- [x] T001 Tauri command contract freeze
- [x] T002 Desktop accounts command reliability
- [x] T003 Desktop migration command reliability
- [x] T004 Desktop audit command performance
- [x] T005 Dashboard production UX pass
- [x] T006 Session launcher stability pass
- [x] T007 Migration UI state and error handling
- [x] T008 Audit UI query and paging UX
- [x] T009 Desktop app shell and navigation hardening
- [x] T010 Cross-platform packaging metadata hardening
- [x] T011 Desktop release CI workflow hardening
- [x] T012 Desktop GA checklist and sign-off doc

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Tauri command contract freeze
  scope: Finalize desktop invoke command registration and error mapping contract
  status: done
  owner: gui01
  claimed_at: 2026-03-01T23:38:43+08:00
  done_at: 2026-03-01T23:40:38+08:00
  priority: P0
  depends_on: []
  branch: feat/gui01-m3-t001
  pr_or_commit: local:main-rs-contract-freeze
  blocker:
  deliverable: Stable invoke contract for desktop GUI entrypoint
  acceptance:
  - command registration covers required GUI actions for GA
  - command errors map to deterministic frontend codes
  files:
  - desktop/tauri/src-tauri/src/main.rs

- id: T002
  title: Desktop accounts command reliability
  scope: Harden account list/default/switch command behavior for production traffic
  status: done
  owner: gui02
  claimed_at: 2026-03-01T23:38:43+08:00
  done_at: 2026-03-01T23:40:14+08:00
  priority: P0
  depends_on: [T001]
  branch: feat/gui02-m3-t002
  pr_or_commit: local:pending-commit
  blocker:
  deliverable: Reliable accounts command module with strict response contract
  acceptance:
  - account operations are idempotent and deterministic
  - error payloads are consistent for GUI rendering
  files:
  - desktop/tauri/src-tauri/src/commands/accounts.rs

- id: T003
  title: Desktop migration command reliability
  scope: Harden export/import command behavior and progress/result reporting
  status: done
  owner: gui03
  claimed_at: 2026-03-01T23:38:43+08:00
  done_at: 2026-03-01T23:41:48+08:00
  priority: P0
  depends_on: [T001]
  branch: feat/gui03-m3-t003
  pr_or_commit: local:pending-commit
  blocker:
  deliverable: Migration command module with production-safe states
  acceptance:
  - export/import trigger returns stable progress and final result schema
  - recoverable failure reasons are surfaced to GUI
  files:
  - desktop/tauri/src-tauri/src/commands/migration.rs

- id: T004
  title: Desktop audit command performance
  scope: Improve audit query filtering/pagination performance for local searchability
  status: done
  owner: gui04
  claimed_at: 2026-03-01T23:38:44+08:00
  done_at: 2026-03-01T15:40:16Z
  priority: P1
  depends_on: [T001]
  branch: feat/gui04-m3-t004
  pr_or_commit: local:uncommitted
  blocker:
  deliverable: Audit command module supports responsive query experience
  acceptance:
  - filtered query returns stable cursor semantics
  - command performance is acceptable on large local logs
  files:
  - desktop/tauri/src-tauri/src/commands/audit.rs

- id: T005
  title: Dashboard production UX pass
  scope: Final UX and state behavior pass for desktop status dashboard
  status: done
  owner: gui05
  claimed_at: 2026-03-01T23:43:07+08:00
  done_at: 2026-03-02T00:37:43+08:00
  priority: P0
  depends_on: [T002]
  branch: feat/gui05-m3-t005
  pr_or_commit: verified-existing-implementation@4ce70e1
  blocker:
  deliverable: Production-grade dashboard for account/tool visibility
  acceptance:
  - dashboard surfaces status/default/usage/recent actions clearly
  - loading/empty/error states are complete and user-actionable
  files:
  - desktop/tauri/src/views/dashboard.tsx

- id: T006
  title: Session launcher stability pass
  scope: Harden one-click launcher flow for codex claude gemini session start
  status: done
  owner: gui06
  claimed_at: 2026-03-01T23:43:08+08:00
  done_at: 2026-03-01T15:44:34Z
  priority: P0
  depends_on: [T002]
  branch: feat/gui06-m3-t006
  pr_or_commit: local:uncommitted
  blocker:
  deliverable: Stable launcher flow for all supported tools
  acceptance:
  - launcher supports codex claude gemini start actions
  - launcher failure states provide retry and diagnosis hints
  files:
  - desktop/tauri/src/views/session-launcher.tsx

- id: T007
  title: Migration UI state and error handling
  scope: Harden migration UI state machine including progress success failure recovery
  status: done
  owner: gui07
  claimed_at: 2026-03-01T23:43:07+08:00
  done_at: 2026-03-01T15:44:19Z
  priority: P0
  depends_on: [T003]
  branch: feat/gui07-m3-t007
  pr_or_commit: local:pending-commit
  blocker:
  deliverable: Production-safe migration UI flow
  acceptance:
  - export/import UI reflects real-time status and terminal states
  - UI offers clear next actions on failure
  files:
  - desktop/tauri/src/views/migration.tsx

- id: T008
  title: Audit UI query and paging UX
  scope: Improve audit log browsing/search/filter UX for local operational review
  status: done
  owner: gui08
  claimed_at: 2026-03-01T23:43:07+08:00
  done_at: 2026-03-01T15:44:58Z
  priority: P1
  depends_on: [T004]
  branch: feat/gui08-m3-t008
  pr_or_commit: local:pending-commit
  blocker:
  deliverable: Usable audit browser for operators
  acceptance:
  - query filter and pagination interactions are consistent
  - detail view supports fast triage workflows
  files:
  - desktop/tauri/src/views/audit-log.tsx

- id: T009
  title: Desktop app shell and navigation hardening
  scope: Harden app-level boot route and shared state wiring for release stability
  status: done
  owner: gui10
  claimed_at: 2026-03-01T23:43:46+08:00
  done_at: 2026-03-01T23:45:02+08:00
  priority: P0
  depends_on: [T005, T006, T007, T008]
  branch: feat/gui10-m3-t009
  pr_or_commit: local:pending-commit
  blocker:
  deliverable: Stable desktop app shell for production entry
  acceptance:
  - app boot and navigation handle all target views deterministically
  - global error boundary and fallback UI are complete
  files:
  - desktop/tauri/src/App.tsx

- id: T010
  title: Cross-platform packaging metadata hardening
  scope: Finalize tauri packaging metadata/signing/notarization placeholders for Win Linux macOS
  status: done
  owner: bob
  claimed_at: 2026-03-01T23:38:10+08:00
  done_at: 2026-03-01T23:39:53+08:00
  priority: P0
  depends_on: []
  branch: feat/bob-m3-t010
  pr_or_commit: local:pending-commit
  blocker:
  deliverable: Packaging config ready for three-platform artifact generation
  acceptance:
  - config includes platform-specific metadata required for GA packaging
  - config supports CI release workflow without manual patching
  files:
  - desktop/tauri/src-tauri/tauri.conf.json

- id: T011
  title: Desktop release CI workflow hardening
  scope: Harden release workflow for reproducible Win Linux macOS artifacts
  status: done
  owner: gui09
  claimed_at: 2026-03-01T23:43:07+08:00
  done_at: 2026-03-01T15:44:19Z
  priority: P0
  depends_on: [T010]
  branch: feat/gui09-m3-t011
  pr_or_commit: local:pending-commit
  blocker:
  deliverable: Reliable desktop release workflow
  acceptance:
  - workflow produces installable artifacts across three platforms
  - workflow includes failure-fast checks and artifact naming consistency
  files:
  - .github/workflows/desktop-release.yml

- id: T012
  title: Desktop GA checklist and sign-off doc
  scope: Produce final operator checklist and launch sign-off criteria for desktop GA
  status: done
  owner: gui11
  claimed_at: 2026-03-01T23:43:46+08:00
  done_at: 2026-03-02T00:36:09+0800
  priority: P0
  depends_on: [T005, T006, T007, T008, T010, T011]
  branch: feat/gui11-m3-t012
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Release checklist and sign-off process doc
  acceptance:
  - checklist covers add account switch default export import and launcher flows
  - sign-off criteria include pass/fail gates and rollback triggers
  files:
  - docs/release/desktop-platform-checklist.md

## Activity Log
- 2026-03-01T23:29:02+08:00 [ai-coordinator] Plan created for Milestone 3 GUI GA with Win/Linux/macOS release target.
- 2026-03-01T23:32:40+08:00 [ai-coordinator] Optimized dependency graph for high-parallel GUI delivery waves.

- 2026-03-01T23:38:10+08:00 [aih-auto] Claimed T010 (m3-t010-bob) owner=bob branch=feat/bob-m3-t010.

- 2026-03-01T23:38:43+08:00 [aih-auto] Claimed T002 (m3-t002-gui02) owner=gui02 branch=feat/gui02-m3-t002.

- 2026-03-01T23:38:43+08:00 [aih-auto] Claimed T001 (m3-t001-gui01) owner=gui01 branch=feat/gui01-m3-t001.

- 2026-03-01T23:38:43+08:00 [aih-auto] Claimed T003 (m3-t003-gui03) owner=gui03 branch=feat/gui03-m3-t003.

- 2026-03-01T23:38:44+08:00 [aih-auto] Claimed T004 (m3-t004-gui04) owner=gui04 branch=feat/gui04-m3-t004.
- 2026-03-01T23:40:38+08:00 [gui01] Completed T001 in desktop/tauri/src-tauri/src/main.rs by adding core_namespace_info contract and deterministic core io-kind error mapping; set status=done and synced checklist.
- 2026-03-01T23:39:53+08:00 [bob] Completed T010 (m3-t010-bob); hardened tauri.conf.json packaging metadata for Win/Linux/macOS, synced checklist, and wrote back status=done.
- 2026-03-01T23:40:14+08:00 [gui02] Completed T002 (m3-t002-gui02); hardened accounts command reliability contract in accounts.rs, synced checklist, and wrote back status=done.
- 2026-03-01T23:41:48+08:00 [gui03] Completed T003 (m3-t003-gui03); hardened migration command progress extraction and failure reason mapping in migration.rs, synced checklist, and wrote back status=done.
- 2026-03-01T15:40:16Z [gui04] Completed T004 (m3-t004-gui04); optimized audit_query with stable idx cursor pagination and single-pass filtered windowing in commands/audit.rs, synced checklist, and wrote back status=done.

- 2026-03-01T23:43:07+08:00 [aih-auto] Claimed T005 (m3-t005-gui05) owner=gui05 branch=feat/gui05-m3-t005.

- 2026-03-01T23:43:07+08:00 [aih-auto] Claimed T011 (m3-t011-gui09) owner=gui09 branch=feat/gui09-m3-t011.

- 2026-03-01T23:43:07+08:00 [aih-auto] Claimed T008 (m3-t008-gui08) owner=gui08 branch=feat/gui08-m3-t008.

- 2026-03-01T23:43:07+08:00 [aih-auto] Claimed T007 (m3-t007-gui07) owner=gui07 branch=feat/gui07-m3-t007.

- 2026-03-01T23:43:08+08:00 [aih-auto] Claimed T006 (m3-t006-gui06) owner=gui06 branch=feat/gui06-m3-t006.
- 2026-03-01T15:44:34Z [gui06] Completed T006 in desktop/tauri/src/views/session-launcher.tsx; added per-tool launch state machine with timeout/error diagnosis/retry hints, synced checklist, and wrote back status=done.
- 2026-03-01T15:44:58Z [gui08] Completed T008 (m3-t008-gui08); improved audit query/filter consistency with page reset, added pagination controls (size + prev/next), and added split list/detail triage view in audit-log.tsx; set status=done and synced checklist.
- 2026-03-01T15:44:19Z [gui09] Completed T011 (m3-t011-gui09); hardened desktop-release workflow with preflight config checks, cross-platform installable bundle validation, and deterministic artifact naming; set status=done and synced checklist.

- 2026-03-01T23:43:46+08:00 [aih-auto] Claimed T009 (m3-t009-gui10) owner=gui10 branch=feat/gui10-m3-t009.
- 2026-03-01T23:45:02+08:00 [gui10] Completed T009 (m3-t009-gui10); hardened App.tsx boot hash routing, added session launcher navigation, and introduced global error boundary fallback UI; synced checklist and wrote back status=done.

- 2026-03-01T23:43:46+08:00 [aih-auto] Claimed T012 (m3-t012-gui11) owner=gui11 branch=feat/gui11-m3-t012.
- 2026-03-01T15:44:19Z [gui07] Completed T007 in desktop/tauri/src/views/migration.tsx by hardening migration UI phase transitions, failure recovery guidance, retry/reset actions, and progress timeline rendering; set status=done and synced checklist.

- 2026-03-02T00:34:48+08:00 [ai-watchdog] Relaunched T005 (m3-t005-gui05) via resume session 019caa11-5bb8-7371-84b5-6c648d73e6c6.

- 2026-03-02T00:35:09+08:00 [ai-watchdog] Relaunched T005 (m3-t005-gui05) via resume session 019caa11-5bb8-7371-84b5-6c648d73e6c6.
- 2026-03-02T00:35:09+08:00 [ai-watchdog] Relaunched T012 (m3-t012-gui11) via resume session 019caa11-f058-7b82-b584-e8bff2857949.

- 2026-03-02T00:35:48+08:00 [ai-watchdog] Relaunched T005 (m3-t005-gui05) via resume session 019caa11-5bb8-7371-84b5-6c648d73e6c6.
- 2026-03-02T00:36:09+0800 [gui11] Completed T012 in docs/release/desktop-platform-checklist.md; expanded desktop GA checklist with launcher validation, pass/fail release gates, rollback triggers/actions, and structured cross-platform sign-off evidence; set status=done and synced checklist.
- 2026-03-02T00:37:43+08:00 [gui05] Completed T005 in desktop/tauri/src/views/dashboard.tsx by closing the production UX/state pass (status/default/usage/recent-actions visibility with complete loading/empty/error handling); set status=done, synced checklist, and recorded pr_or_commit=verified-existing-implementation@4ce70e1.
