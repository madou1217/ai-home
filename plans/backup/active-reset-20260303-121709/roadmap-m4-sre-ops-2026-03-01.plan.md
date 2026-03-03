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
- [x] T101 Remote daemon metrics schema
- [x] T102 Remote daemon alert thresholds
- [x] T103 Reconnect incident playbook
- [x] T104 Workspace isolation incident playbook
- [x] T105 Protocol compatibility matrix
- [x] T106 Remote chaos test script baseline

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T101
  title: Remote daemon metrics schema
  scope: Define production metrics contract for remote daemon observability
  status: done
  owner: sre101
  claimed_at: 2026-03-01T23:56:05+08:00
  done_at: 2026-03-02T00:05:55+08:00
  priority: P0
  depends_on: []
  branch: feat/sre101-m4-t101
  pr_or_commit: local:docs-remote-daemon-metrics-schema-uncommitted
  blocker:
  deliverable: Metrics schema reference for daemon health and throughput
  acceptance:
  - includes session lifecycle and command execution metrics
  - includes reconnect and error-rate metrics taxonomy
  files:
  - docs/remote/daemon-metrics-schema.md

- id: T102
  title: Remote daemon alert thresholds
  scope: Define alert rules and on-call thresholds for remote runtime
  status: done
  owner: sre102
  claimed_at: 2026-03-01T23:56:04+08:00
  done_at: 2026-03-01T23:56:34+08:00
  priority: P0
  depends_on: [T101]
  branch: feat/sre102-m4-t102
  pr_or_commit:
  blocker:
  deliverable: Alert policy with severity and escalation mapping
  acceptance:
  - warning/critical thresholds are numerically defined
  - each alert maps to explicit first-response actions
  files:
  - docs/remote/daemon-alert-thresholds.md

- id: T103
  title: Reconnect incident playbook
  scope: Prepare operational recovery SOP for reconnect storms
  status: done
  owner: sre103
  claimed_at: 2026-03-01T23:56:04+08:00
  done_at: 2026-03-01T23:57:04+08:00
  priority: P0
  depends_on: [T101]
  branch: feat/sre103-m4-t103
  pr_or_commit: local:docs-reconnect-playbook-uncommitted
  blocker:
  deliverable: Incident playbook for reconnect degradation events
  acceptance:
  - includes detection triage mitigation rollback timeline
  - includes operator commands and expected signals
  files:
  - docs/remote/reconnect-incident-playbook.md

- id: T104
  title: Workspace isolation incident playbook
  scope: Prepare incident SOP for workspace escape and isolation failures
  status: done
  owner: sre104
  claimed_at: 2026-03-01T23:56:05+08:00
  done_at: 2026-03-01T23:57:19+08:00
  priority: P0
  depends_on: [T101]
  branch: feat/sre104-m4-t104
  pr_or_commit:
  blocker:
  deliverable: Isolation incident response runbook
  acceptance:
  - includes containment and forensics checklist
  - includes post-incident hardening feedback loop
  files:
  - docs/remote/workspace-isolation-playbook.md

- id: T105
  title: Protocol compatibility matrix
  scope: Track version compatibility between local CLI and remote daemon protocol
  status: done
  owner: sre105
  claimed_at: 2026-03-01T23:56:05+08:00
  done_at: 2026-03-01T23:57:56+08:00
  priority: P1
  depends_on: [T101]
  branch: feat/sre105-m4-t105
  pr_or_commit: local@working-tree (docs only, no commit)
  blocker:
  deliverable: Compatibility matrix with supported/unsupported combinations
  acceptance:
  - includes CLI-daemon version pairing table
  - includes fallback behavior and upgrade guidance
  files:
  - docs/remote/protocol-compatibility-matrix.md

- id: T106
  title: Remote chaos test script baseline
  scope: Add baseline chaos script for disconnect timeout and restart faults
  status: done
  owner: sre106
  claimed_at: 2026-03-01T23:56:04+08:00
  done_at: 2026-03-02T00:07:37+08:00
  priority: P1
  depends_on: [T102, T103, T104]
  branch: feat/sre106-m4-t106
  pr_or_commit: local:scripts-remote-chaos-drill-uncommitted
  blocker:

- 2026-03-02T00:05:05+08:00 [ai-coordinator] Corrected T101 from blocked to doing because session is alive and actively executing.
- 2026-03-02T00:05:55+08:00 [sre101] Completed T101 in docs/remote/daemon-metrics-schema.md; task closed as done.
- 2026-03-02T00:07:37+08:00 [sre106] Completed T106; validated with `bash scripts/remote-chaos-drill.sh --dry-run` (pass), report=logs/remote-chaos-drill-20260302-000733.json.
