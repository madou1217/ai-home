# Plan: Roadmap M4 SRE Ops

- plan_id: roadmap-m4-sre-ops-2026-03-01
- coordinator: ai-coordinator
- created_at: 2026-03-01T23:55:30+08:00
- updated_at: 2026-03-02T00:05:55+08:00
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [ ] T101 Remote daemon metrics schema
- [ ] T102 Remote daemon alert thresholds
- [ ] T103 Reconnect incident playbook
- [ ] T104 Workspace isolation incident playbook
- [ ] T105 Protocol compatibility matrix
- [ ] T106 Remote chaos test script baseline

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T101
  title: Remote daemon metrics schema
  scope: Define production metrics contract for remote daemon observability
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: []
  branch: feat/sre101-m4-t101
  pr_or_commit: 
  blocker: 
  acceptance:
  - includes session lifecycle and command execution metrics
  - includes reconnect and error-rate metrics taxonomy
  files:
  - docs/remote/daemon-metrics-schema.md

- id: T102
  title: Remote daemon alert thresholds
  scope: Define alert rules and on-call thresholds for remote runtime
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T101]
  branch: feat/sre102-m4-t102
  pr_or_commit: 
  deliverable: Alert policy with severity and escalation mapping
  acceptance:
  - warning/critical thresholds are numerically defined
  - each alert maps to explicit first-response actions
  files:
  - docs/remote/daemon-alert-thresholds.md

- id: T103
  title: Reconnect incident playbook
  scope: Prepare operational recovery SOP for reconnect storms
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T101]
  branch: feat/sre103-m4-t103
  pr_or_commit: 
  blocker: 
  acceptance:
  - includes detection triage mitigation rollback timeline
  - includes operator commands and expected signals
  files:
  - docs/remote/reconnect-incident-playbook.md

- id: T104
  title: Workspace isolation incident playbook
  scope: Prepare incident SOP for workspace escape and isolation failures
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P0
  depends_on: [T101]
  branch: feat/sre104-m4-t104
  pr_or_commit: 
  deliverable: Isolation incident response runbook
  acceptance:
  - includes containment and forensics checklist
  - includes post-incident hardening feedback loop
  files:
  - docs/remote/workspace-isolation-playbook.md

- id: T105
  title: Protocol compatibility matrix
  scope: Track version compatibility between local CLI and remote daemon protocol
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T101]
  branch: feat/sre105-m4-t105
  pr_or_commit: 
  blocker: 
  acceptance:
  - includes CLI-daemon version pairing table
  - includes fallback behavior and upgrade guidance
  files:
  - docs/remote/protocol-compatibility-matrix.md

- id: T106
  title: Remote chaos test script baseline
  scope: Add baseline chaos script for disconnect timeout and restart faults
  status: todo
  owner: 
  claimed_at: 
  done_at: 
  priority: P1
  depends_on: [T102, T103, T104]
  branch: feat/sre106-m4-t106
  pr_or_commit: 
  blocker: 
- 2026-03-02T00:05:55+08:00 [sre101] Completed T101 in docs/remote/daemon-metrics-schema.md; task closed as done.
- 2026-03-02T00:07:37+08:00 [sre106] Completed T106; validated with `bash scripts/remote-chaos-drill.sh --dry-run` (pass), report=logs/remote-chaos-drill-20260302-000733.json.

## Activity Log
- 2026-03-03T04:17:29.652Z [operator] Global reset: reinitialized all tasks to todo for fresh planning cycle (manual mode, no exec-plan session bindings).
