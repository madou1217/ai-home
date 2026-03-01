# Plan: Roadmap M5 Mobile Command Center

- plan_id: roadmap-m5-mobile-command-center-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T21:34:22+08:00
- updated_at: 2026-03-01T22:09:01+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [ ] T001 Mobile session screen flow
- [ ] T002 Mobile task screen flow
- [ ] T003 Mobile daemon client
- [ ] T004 Mobile reconnect manager
- [ ] T005 Mobile push notification bridge
- [ ] T006 Mobile quick actions panel
- [ ] T007 Mobile status priority card
- [ ] T008 Mobile collapsible log panel

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Mobile session screen flow
  scope: Build session-centric mobile control screen for remote node status and entry actions
  status: todo
  owner: unassigned
  claimed_at: 
  done_at:
  priority: P0
  depends_on: []
  branch: 
  pr_or_commit:
  blocker:
  deliverable: Session screen optimized for small-screen control and monitoring
  acceptance:
  - session screen displays key remote state and entry actions
  - critical actions are reachable within 1-2 taps
  files:
  - mobile/app/src/screens/SessionScreen.tsx

- id: T002
  title: Mobile task screen flow
  scope: Build task-centric mobile screen for start/track/result interactions
  status: todo
  owner: unassigned
  claimed_at: 
  done_at:
  priority: P0
  depends_on: []
  branch: 
  pr_or_commit:
  blocker:
  deliverable: Task screen supporting full task trigger-to-result path
  acceptance:
  - users can trigger task and track lifecycle status transitions
  - result summary and error guidance are visible in the task flow
  files:
  - mobile/app/src/screens/TaskScreen.tsx

- id: T003
  title: Mobile daemon client
  scope: Implement mobile-side client API for remote daemon control calls
  status: todo
  owner: unassigned
  claimed_at: 
  done_at:
  priority: P0
  depends_on: []
  branch: 
  pr_or_commit:
  blocker:
  deliverable: Mobile daemon client service with stable request contract
  acceptance:
  - client supports session/task status and trigger calls
  - transport errors are normalized into UI-consumable forms
  files:
  - mobile/app/src/services/daemonClient.ts

- id: T004
  title: Mobile reconnect manager
  scope: Implement reconnect strategy for intermittent network and daemon restarts
  status: todo
  owner: unassigned
  claimed_at: 
  done_at:
  priority: P0
  depends_on: [T003]
  branch: 
  pr_or_commit:
  blocker:
  deliverable: Reconnect manager with explicit recoverability state transitions
  acceptance:
  - disconnect and timeout scenarios auto-retry with bounded policy
  - UI receives clear reconnect state updates and next-step hints
  files:
  - mobile/app/src/services/reconnectManager.ts

- id: T005
  title: Mobile push notification bridge
  scope: Implement notification service for completion/failure/quota alert events
  status: todo
  owner: unassigned
  claimed_at: 
  done_at:
  priority: P0
  depends_on: [T003]
  branch: 
  pr_or_commit:
  blocker:
  deliverable: Push notification channel integrated with task lifecycle events
  acceptance:
  - completion/failure/quota events generate actionable notifications
  - notification payload maps users to relevant app destinations
  files:
  - mobile/app/src/services/pushNotifications.ts

- id: T006
  title: Mobile quick actions panel
  scope: Build one-handed quick action panel for retry/stop/switch-account operations
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T001, T002]
  branch:
  pr_or_commit:
  blocker:
  deliverable: High-frequency quick actions optimized for mobile ergonomics
  acceptance:
  - retry/stop/switch-account actions are reachable with minimal taps
  - action results feed back into session/task state immediately
  files:
  - mobile/app/src/screens/OpsQuickActions.tsx

- id: T007
  title: Mobile status priority card
  scope: Build compact component to surface critical state before secondary details
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T001]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Status-first card component for mobile command center hierarchy
  acceptance:
  - critical status fields are visible above secondary details
  - component supports warning/error emphasis states
  files:
  - mobile/app/src/components/StatusPriorityCard.tsx

- id: T008
  title: Mobile collapsible log panel
  scope: Build foldable log panel to keep signal-first UI while preserving diagnostics access
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T002]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Collapsible log component that preserves mobile readability
  acceptance:
  - logs default to collapsed summary with expandable details
  - expanded view keeps timestamp/level/message scanability
  files:
  - mobile/app/src/components/LogCollapsePanel.tsx

## Activity Log
- 2026-03-01T21:34:22+08:00 [ai-coordinator] Plan expanded for high-parallel execution from ROADMAP Milestone 5 (UTC+8).
- 2026-03-01T21:37:56+08:00 [judy] Claimed T005; set status to doing, owner to judy, and branch to feat/judy-m5-t005 (UTC+8).
- 2026-03-01T21:38:17+08:00 [heidi] Claimed T003; set status to doing, owner to heidi, and branch to feat/heidi-m5-t003 (UTC+8).

- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T001 for frank (feat/frank-m5-t001) to enable conflict-free parallel coding.
- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T002 for grace (feat/grace-m5-t002) to enable conflict-free parallel coding.
- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T003 for heidi (feat/heidi-m5-t003) to enable conflict-free parallel coding.
- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T004 for ivan (feat/ivan-m5-t004) to enable conflict-free parallel coding.
- 2026-03-01T21:38:58+08:00 [ai-coordinator] Force-claimed T005 for judy (feat/judy-m5-t005) to enable conflict-free parallel coding.
- 2026-03-01T21:57:34+08:00 [ai-coordinator] Normalized in-flight task metadata for stable board rendering (claimed_at/branch cleanup).

- 2026-03-01T22:09:01+08:00 [ai-coordinator] Reconciled stale doing tasks to todo (no live worker process): T001, T002, T003, T004, T005.
