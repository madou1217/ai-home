# Plan: Roadmap M7 Scaleout Adoption

- plan_id: roadmap-m7-scaleout-adoption-2026-03-02
- coordinator: ai-coordinator
- created_at: 2026-03-02T00:09:40+08:00
- updated_at: 2026-03-01T16:12:14Z
- status: active

## Global Rules
- Single source of truth: this file only.
- Claim before coding.
- One AI can hold multiple tasks only if scopes do not overlap.

## TodoList

## Checklist
- [x] T001 Desktop first-run guide
- [x] T002 Remote project quickstart
- [x] T003 Mobile command center quickstart
- [x] T004 Troubleshooting playbook
- [x] T005 Chaos experiment catalog
- [x] T006 Recovery RTO RPO guide
- [ ] T007 Audit evidence template
- [x] T008 Data retention policy
- [x] T009 Desktop GUI smoke e2e tests
- [ ] T010 Desktop release workflow tests
- [ ] T011 Mobile reconnect e2e tests
- [ ] T012 Watchdog recovery tests

Keep this checklist synced with `status`:
- `status: done` => `[x]`
- others => `[ ]`

- id: T001
  title: Desktop first-run guide
  scope: Execute scoped deliverable for Desktop first-run guide
  status: done
  owner: sca01
  claimed_at: 2026-03-02T00:10:18+08:00
  done_at: 2026-03-01T16:11:39Z
  priority: P1
  depends_on: []
  branch: feat/sca01-m7-t001
  pr_or_commit: working-tree
  blocker:
  deliverable: Desktop first-run guide deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - docs/product/desktop-first-run-guide.md

- id: T002
  title: Remote project quickstart
  scope: Execute scoped deliverable for Remote project quickstart
  status: done
  owner: sca02
  claimed_at: 2026-03-02T00:10:16+08:00
  done_at: 2026-03-02T00:11:29+08:00
  priority: P1
  depends_on: []
  branch: feat/sca02-m7-t002
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Remote project quickstart deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - docs/product/remote-project-quickstart.md

- id: T003
  title: Mobile command center quickstart
  scope: Execute scoped deliverable for Mobile command center quickstart
  status: done
  owner: sca03
  claimed_at: 2026-03-02T00:10:17+08:00
  done_at: 2026-03-02T00:12:07+08:00
  priority: P1
  depends_on: []
  branch: feat/sca03-m7-t003
  pr_or_commit: local-uncommitted (plan-guard blocked non-plan commit)
  blocker:
  deliverable: Mobile command center quickstart deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - docs/product/mobile-command-center-quickstart.md

- id: T004
  title: Troubleshooting playbook
  scope: Execute scoped deliverable for Troubleshooting playbook
  status: done
  owner: sca04
  claimed_at: 2026-03-02T00:10:17+08:00
  done_at: 2026-03-01T16:11:13Z
  priority: P1
  depends_on: []
  branch: feat/sca04-m7-t004
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Troubleshooting playbook deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - docs/product/troubleshooting-playbook.md

- id: T005
  title: Chaos experiment catalog
  scope: Execute scoped deliverable for Chaos experiment catalog
  status: done
  owner: sca05
  claimed_at: 2026-03-02T00:10:16+08:00
  done_at: 2026-03-02T00:10:57+08:00
  priority: P1
  depends_on: []
  branch: feat/sca05-m7-t005
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Chaos experiment catalog deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - docs/reliability/chaos-experiment-catalog.md

- id: T006
  title: Recovery RTO RPO guide
  scope: Execute scoped deliverable for Recovery RTO RPO guide
  status: done
  owner: sca06
  claimed_at: 2026-03-02T00:10:17+08:00
  done_at: 2026-03-01T16:11:22Z
  priority: P1
  depends_on: []
  branch: feat/sca06-m7-t006
  pr_or_commit: working-tree
  blocker:
  deliverable: Recovery RTO RPO guide deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - docs/reliability/recovery-rto-rpo.md

- id: T007
  title: Audit evidence template
  scope: Execute scoped deliverable for Audit evidence template
  status: doing
  owner: sca07
  claimed_at: 2026-03-02T00:10:18+08:00
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/sca07-m7-t007
  pr_or_commit:
  blocker:
  deliverable: Audit evidence template deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - docs/compliance/audit-evidence-template.md

- id: T008
  title: Data retention policy
  scope: Execute scoped deliverable for Data retention policy
  status: done
  owner: sca08
  claimed_at: 2026-03-02T00:10:17+08:00
  done_at: 2026-03-01T16:11:13Z
  priority: P1
  depends_on: []
  branch: feat/sca08-m7-t008
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Data retention policy deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - docs/compliance/data-retention-policy.md

- id: T009
  title: Desktop GUI smoke e2e tests
  scope: Execute scoped deliverable for Desktop GUI smoke e2e tests
  status: done
  owner: sca09
  claimed_at: 2026-03-02T00:10:17+08:00
  done_at: 2026-03-01T16:12:10Z
  priority: P1
  depends_on: []
  branch: feat/sca09-m7-t009
  pr_or_commit: local-uncommitted
  blocker:
  deliverable: Desktop GUI smoke e2e tests deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - test/desktop.gui.smoke.e2e.test.js

- id: T010
  title: Desktop release workflow tests
  scope: Execute scoped deliverable for Desktop release workflow tests
  status: blocked
  owner: sca10
  claimed_at: 2026-03-02T00:10:19+08:00
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/sca10-m7-t010
  pr_or_commit:
  blocker: missing_test_file:test/desktop.release.workflow.test.js
  deliverable: Desktop release workflow tests deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - test/desktop.release.workflow.test.js

- id: T011
  title: Mobile reconnect e2e tests
  scope: Execute scoped deliverable for Mobile reconnect e2e tests
  status: doing
  owner: sca11
  claimed_at: 2026-03-02T00:10:18+08:00
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/sca11-m7-t011
  pr_or_commit:
  blocker:
  deliverable: Mobile reconnect e2e tests deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - test/mobile.reconnect.e2e.test.js

- id: T012
  title: Watchdog recovery tests
  scope: Execute scoped deliverable for Watchdog recovery tests
  status: blocked
  owner: sca12
  claimed_at: 2026-03-02T00:10:17+08:00
  done_at: 
  priority: P1
  depends_on: []
  branch: feat/sca12-m7-t012
  pr_or_commit:
  blocker: missing_test_file:test/ops.watchdog.recovery.test.js
  deliverable: Watchdog recovery tests deliverable completed
  acceptance:
  - output is complete and reviewable
  - result is written back with deterministic status
  files:
  - test/ops.watchdog.recovery.test.js

## Activity Log
- 2026-03-02T00:09:40+08:00 [ai-coordinator] Plan created for parallel scale-out execution.

- 2026-03-02T00:10:16+08:00 [aih-auto] Claimed T002 (m7-t002-sca02) owner=sca02 branch=feat/sca02-m7-t002.

- 2026-03-02T00:10:16+08:00 [aih-auto] Claimed T005 (m7-t005-sca05) owner=sca05 branch=feat/sca05-m7-t005.

- 2026-03-02T00:10:17+08:00 [aih-auto] Claimed T003 (m7-t003-sca03) owner=sca03 branch=feat/sca03-m7-t003.

- 2026-03-02T00:10:17+08:00 [aih-auto] Claimed T009 (m7-t009-sca09) owner=sca09 branch=feat/sca09-m7-t009.

- 2026-03-02T00:10:17+08:00 [aih-auto] Claimed T004 (m7-t004-sca04) owner=sca04 branch=feat/sca04-m7-t004.

- 2026-03-02T00:10:17+08:00 [aih-auto] Claimed T006 (m7-t006-sca06) owner=sca06 branch=feat/sca06-m7-t006.

- 2026-03-02T00:10:17+08:00 [aih-auto] Claimed T012 (m7-t012-sca12) owner=sca12 branch=feat/sca12-m7-t012.

- 2026-03-02T00:10:17+08:00 [aih-auto] Claimed T008 (m7-t008-sca08) owner=sca08 branch=feat/sca08-m7-t008.

- 2026-03-02T00:10:18+08:00 [aih-auto] Claimed T011 (m7-t011-sca11) owner=sca11 branch=feat/sca11-m7-t011.

- 2026-03-02T00:10:18+08:00 [aih-auto] Claimed T001 (m7-t001-sca01) owner=sca01 branch=feat/sca01-m7-t001.

- 2026-03-02T00:10:18+08:00 [aih-auto] Claimed T007 (m7-t007-sca07) owner=sca07 branch=feat/sca07-m7-t007.

- 2026-03-02T00:10:19+08:00 [aih-auto] Claimed T010 (m7-t010-sca10) owner=sca10 branch=feat/sca10-m7-t010.

- 2026-03-02T00:12:07+08:00 [sca03] Completed T003 deliverable by creating docs/product/mobile-command-center-quickstart.md; set status=done, synced checklist, and recorded pr_or_commit=local-uncommitted (plan-guard blocked non-plan commit).

- 2026-03-02T00:11:29+08:00 [sca02] Completed T002 in docs/product/remote-project-quickstart.md; delivered remote project quickstart and synced checklist/status writeback.

- 2026-03-01T16:11:13Z [sca04] Completed T004 (m7-t004-sca04); added docs/product/troubleshooting-playbook.md and synced status/checklist.

- 2026-03-01T16:11:02Z [sca12] Blocked T012: `node --test test/ops.watchdog.recovery.test.js` failed because `test/ops.watchdog.recovery.test.js` does not exist in repository.

- 2026-03-02T00:10:48+08:00 [aih-task-worker] T009 blocked after running `bash scripts/ops/collect-runtime-metrics.sh`: file not found (`scripts/ops/collect-runtime-metrics.sh`).

- 2026-03-02T00:11:08+08:00 [ai-watchdog] Relaunched T003 (m7-t003-sca03) via resume session 019caa2a-395e-7f50-814c-f646289e6bba.
- 2026-03-02T00:11:08+08:00 [ai-watchdog] Relaunched T007 (m7-t007-sca07) via resume session 019caa2a-3dc4-7ff1-9931-8d086974e7d4.
- 2026-03-01T16:11:13Z [sca08] Completed T008 (m7-t008-sca08); added docs/compliance/data-retention-policy.md and synced status/checklist.
- 2026-03-02T00:10:57+08:00 [aih-task-worker] Completed T005 (m7-t005-sca05); created docs/reliability/chaos-experiment-catalog.md and synced status/checklist.
- 2026-03-01T16:11:23Z [aih-task-worker] Blocked T010: `node --test test/desktop.release.workflow.test.js` failed because `test/desktop.release.workflow.test.js` does not exist in repository.
- 2026-03-01T16:11:39Z [sca01] Completed T001 in docs/product/desktop-first-run-guide.md; delivered desktop first-run guide and synced status/checklist.
- 2026-03-01T16:11:22Z [sca06] Completed T006 in docs/reliability/recovery-rto-rpo.md; delivered tiered RTO/RPO targets, recovery modes, execution checks, evidence requirements, and drill cadence; set status=done and synced checklist.
- 2026-03-01T16:12:10Z [aih-task-worker] Completed T009 in test/desktop.gui.smoke.e2e.test.js; created desktop GUI smoke e2e coverage and verified via `node --test test/desktop.gui.smoke.e2e.test.js`.
