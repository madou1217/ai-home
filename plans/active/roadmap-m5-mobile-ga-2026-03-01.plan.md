# Plan: Roadmap M5 Mobile Command Center GA

- plan_id: roadmap-m5-mobile-ga-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T23:48:40+08:00
- updated_at: 2026-03-01T16:37:44Z
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [ ] T001 Mobile daemon client reliability
- [ ] T002 Mobile reconnect strategy hardening
- [ ] T003 Mobile push notification bridge hardening
- [ ] T004 Mobile session screen UX hardening
- [ ] T005 Mobile task screen UX hardening
- [ ] T006 Mobile quick actions panel hardening
- [ ] T007 Mobile status priority card polish
- [ ] T008 Mobile collapsible log panel polish
- [ ] T009 Mobile GA regression test expansion

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Mobile daemon client reliability
  scope: Harden mobile daemon client API contract and failure normalization
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/mob01-m5-t001
  pr_or_commit: 
  blocker: 
  acceptance:
  - client request/response schemas are deterministic
  - transport errors map to actionable UI-level states
  files:
  - mobile/app/src/services/daemonClient.ts

- id: T002
  title: Mobile reconnect strategy hardening
  scope: Harden reconnect/backoff/offline hint behavior for unstable mobile networks
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001]
  branch: feat/mob02-m5-t002
  pr_or_commit: 
  blocker: 
  acceptance:
  - reconnect strategy handles transient and persistent failures
  - state updates remain consistent across rapid network changes
  files:
  - mobile/app/src/services/reconnectManager.ts

- id: T003
  title: Mobile push notification bridge hardening
  scope: Harden lifecycle for completion failure quota alert notifications
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T001]
  branch: feat/mob03-m5-t003
  pr_or_commit: 
  blocker: 
  acceptance:
  - completion failure quota events produce deterministic payloads
  - duplicate delivery and stale events are handled safely
  files:
  - mobile/app/src/services/pushNotifications.ts

- id: T004
  title: Mobile session screen UX hardening
  scope: Optimize session screen hierarchy and quick status readability
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001, T002]
  branch: feat/mob04-m5-t004
  pr_or_commit: 
  blocker: 
  acceptance:
  - key status and controls are visible in one-hand usage
  - loading and offline states are clear and recoverable
  files:
  - mobile/app/src/screens/SessionScreen.tsx

- id: T005
  title: Mobile task screen UX hardening
  scope: Optimize task trigger tracking and result summary interaction flow
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001, T002]
  branch: feat/mob05-m5-t005
  pr_or_commit: 
  blocker: 
  acceptance:
  - trigger to result path is concise and state-consistent
  - task errors provide clear retry and escalation options
  files:
  - mobile/app/src/screens/TaskScreen.tsx

- id: T006
  title: Mobile quick actions panel hardening
  scope: Harden quick-action paths for retry stop switch account operations
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T004, T005]
  branch: feat/mob06-m5-t006
  pr_or_commit: 
  blocker: 
  acceptance:
  - high-frequency actions complete in 1-2 taps
  - action results feed back into visible session/task state quickly
  files:
  - mobile/app/src/screens/OpsQuickActions.tsx

- id: T007
  title: Mobile status priority card polish
  scope: Final polish for status-first card semantics and emphasis rules
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T004]
  branch: feat/mob07-m5-t007
  pr_or_commit: 
  blocker: 
  acceptance:
  - critical fields are prioritized with consistent severity styling
  - component remains readable on narrow screens
  files:
  - mobile/app/src/components/StatusPriorityCard.tsx

- id: T008
  title: Mobile collapsible log panel polish
  scope: Improve collapsed summary and expanded readability for operation logs
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T005]
  branch: feat/mob08-m5-t008
  pr_or_commit: 
  blocker: 
  acceptance:
  - collapsed mode preserves key signal without noise
  - expanded mode supports quick forensic scanning
  files:
  - mobile/app/src/components/LogCollapsePanel.tsx

- id: T009
  title: Mobile GA regression test expansion
  scope: Expand regression tests for reconnect daemon client and key UI flows
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T001, T002, T004, T005, T006, T007, T008]
  branch: feat/mob09-m5-t009
  pr_or_commit: 
  blocker: 
  acceptance:
  - tests cover reconnect daemon client and core interaction flows
  - regression suite catches state desync and retry edge cases
  files:
  - test/proxy.smoke.test.js

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
