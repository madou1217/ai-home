# Plan: Roadmap M5 Mobile Command Center

- plan_id: roadmap-m5-mobile-command-center-2026-03-01
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
- [ ] T001 Mobile control workflows
- [ ] T002 Mobile reconnect and notifications
- [ ] T003 Mobile information hierarchy and quick actions

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Mobile control workflows
  scope: Build mobile-first remote control flow for task trigger, state tracking, and result receipt
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: Mobile MVP flow for starting tasks and tracking remote execution status
  acceptance:
  - Mobile can trigger at least one full remote task lifecycle
  - Result receipt is visible and actionable from session/task screens
  files:
  - mobile/app/src/screens/SessionScreen.tsx
  - mobile/app/src/screens/TaskScreen.tsx

- id: T002
  title: Mobile reconnect and notifications
  scope: Implement resilient connection/retry model and push notifications for key remote events
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P0
  depends_on: []
  branch:
  pr_or_commit:
  blocker:
  deliverable: Reliable reconnect and event notification layer for mobile command center
  acceptance:
  - Disconnect/timeout/auth failures provide explicit recovery guidance
  - Push notifications cover completion/failure/quota alerts
  files:
  - mobile/app/src/services/daemonClient.ts
  - mobile/app/src/services/reconnectManager.ts
  - mobile/app/src/services/pushNotifications.ts

- id: T003
  title: Mobile information hierarchy and quick actions
  scope: Optimize small-screen layout, log folding, and one-handed high-frequency operations
  status: todo
  owner: unassigned
  claimed_at:
  done_at:
  priority: P1
  depends_on: [T001, T002]
  branch:
  pr_or_commit:
  blocker:
  deliverable: Mobile UX tuned for concise status-first operation and rapid task control
  acceptance:
  - Core actions complete in 1-2 steps for common flows
  - Log/summary views prioritize status and keep details collapsible
  files:
  - mobile/app/src/screens/OpsQuickActions.tsx
  - mobile/app/src/components/StatusPriorityCard.tsx
  - mobile/app/src/components/LogCollapsePanel.tsx

## Activity Log
- 2026-03-01T21:18:48+08:00 [ai-coordinator] Plan created from ROADMAP Milestone 5 (UTC+8).
