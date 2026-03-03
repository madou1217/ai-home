# Plan: Roadmap M5 Mobile Command Center

- plan_id: roadmap-m5-mobile-command-center-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T21:34:22+08:00
- updated_at: 2026-03-01T22:40:27+08:00
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
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/frank-m5-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - session screen displays key remote state and entry actions
  - critical actions are reachable within 1-2 taps
  files:
  - mobile/app/src/screens/SessionScreen.tsx

- id: T002
  title: Mobile task screen flow
  scope: Build task-centric mobile screen for start/track/result interactions
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/grace-m5-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - users can trigger task and track lifecycle status transitions
  - result summary and error guidance are visible in the task flow
  files:
  - mobile/app/src/screens/TaskScreen.tsx

- id: T003
  title: Mobile daemon client
  scope: Implement mobile-side client API for remote daemon control calls
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/heidi-m5-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - client supports session/task status and trigger calls
  - transport errors are normalized into UI-consumable forms
  files:
  - mobile/app/src/services/daemonClient.ts

- id: T004
  title: Mobile reconnect manager
  scope: Implement reconnect strategy for intermittent network and daemon restarts
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T003]
  branch: feat/ivan-m5-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - disconnect and timeout scenarios auto-retry with bounded policy
  - UI receives clear reconnect state updates and next-step hints
  files:
  - mobile/app/src/services/reconnectManager.ts

- id: T005
  title: Mobile push notification bridge
  scope: Implement notification service for completion/failure/quota alert events
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T003]
  branch: feat/judy-m5-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - completion/failure/quota events generate actionable notifications
  - notification payload maps users to relevant app destinations
  files:
  - mobile/app/src/services/pushNotifications.ts

- id: T006
  title: Mobile quick actions panel
  scope: Build one-handed quick action panel for retry/stop/switch-account operations
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001, T002]
  branch: feat/heidi-m5-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - retry/stop/switch-account actions are reachable with minimal taps
  - action results feed back into session/task state immediately
  files:
  - mobile/app/src/screens/OpsQuickActions.tsx

- id: T007
  title: Mobile status priority card
  scope: Build compact component to surface critical state before secondary details
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001]
  branch: feat/dave-m5-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - critical status fields are visible above secondary details
  - component supports warning/error emphasis states
  files:
  - mobile/app/src/components/StatusPriorityCard.tsx

- id: T008
  title: Mobile collapsible log panel
  scope: Build foldable log panel to keep signal-first UI while preserving diagnostics access
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T002]
  branch: feat/erin-m5-t008
  pr_or_commit: 
  blocker: 
  acceptance:
  - logs default to collapsed summary with expandable details
  - expanded view keeps timestamp/level/message scanability
  files:
  - mobile/app/src/components/LogCollapsePanel.tsx

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
