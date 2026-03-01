# Chaos Experiment Catalog

- Owner: Reliability Engineering / SRE
- Last updated: 2026-03-02
- Scope: desktop, remote runtime, proxy, and mobile control paths

## 1. Purpose

This catalog defines repeatable chaos experiments used to validate incident readiness, recovery speed, and operational playbooks before production incidents occur.

## 2. Safety Guardrails

- Run in staging by default; production runs require explicit incident commander approval.
- Schedule within a change window and freeze unrelated high-risk deployments.
- Define abort conditions before injection and assign an on-call operator to stop tests immediately.
- Limit blast radius to one region, one tenant cohort, or one service shard at a time.
- Capture all evidence artifacts during test execution for post-drill review.

## 3. Standard Execution Template

For each experiment:

1. State hypothesis and measurable success criteria.
2. Capture pre-check baseline (availability, latency, error rate, reconnect success ratio).
3. Inject fault for a fixed window.
4. Observe alerts, dashboards, and user-facing signals.
5. Execute rollback/recovery steps.
6. Validate return-to-baseline criteria.
7. Archive evidence and create follow-up actions.

## 4. Experiment Catalog

## C001 Remote Daemon Restart Storm

- Hypothesis: client reconnect logic and daemon failover can recover without sustained user impact.
- Injection: restart remote daemon process repeatedly (3-5 cycles over 10 minutes).
- Blast radius: single staging region.
- Expected detection: reconnect attempt spike, reconnect success dip, short control-plane error burst.
- Success criteria:
  - reconnect success ratio recovers to >= 98% within 5 minutes after final restart.
  - no unresolved task/session failures after stabilization window.
- Rollback: stop restarts, ensure daemon healthy, and drain unstable nodes.
- Evidence: daemon logs, reconnect metrics graph, incident timeline notes.

## C002 Workspace Runner Isolation Deny Spike

- Hypothesis: sandbox/isolation controls block suspicious operations and alerts fire quickly.
- Injection: run controlled commands that attempt blocked namespace or cross-root access.
- Blast radius: one synthetic workspace.
- Expected detection: denied operation counters increase; isolation alerts trigger.
- Success criteria:
  - blocked operations are denied with no cross-workspace file access.
  - on-call receives actionable alert in defined SLA window.
- Rollback: stop synthetic payloads; verify workspace cleanup and policy integrity.
- Evidence: runner audit logs, denied syscall/path traces, alert event IDs.

## C003 Proxy Upstream Timeout Burst

- Hypothesis: retry/backoff and circuit-breaker logic prevent prolonged request failure cascades.
- Injection: introduce upstream latency/timeouts for 5 minutes.
- Blast radius: one proxy shard.
- Expected detection: timeout and 5xx increase; downstream retries/backoff observed.
- Success criteria:
  - p95 latency returns to baseline band within 10 minutes post-injection.
  - no sustained 5xx burn beyond error budget threshold.
- Rollback: remove latency rule and restart affected proxy workers if needed.
- Evidence: proxy access/error logs, latency/error dashboard snapshots.

## C004 Auth Token Expiry Churn

- Hypothesis: token refresh paths recover cleanly without mass session invalidation.
- Injection: expire short-lived tokens for a controlled user cohort.
- Blast radius: synthetic tenant cohort only.
- Expected detection: auth refresh calls spike; failed refresh alerts if path regresses.
- Success criteria:
  - refresh success >= 99% for test cohort.
  - no manual intervention required to restore sessions.
- Rollback: restore token policy and reissue cohort tokens.
- Evidence: auth service metrics, refresh failure samples, session recovery stats.

## C005 Mobile Push Delivery Degradation

- Hypothesis: mobile clients remain usable with degraded push and surface clear status to user.
- Injection: delay/drop push notifications for controlled test users.
- Blast radius: staging mobile project only.
- Expected detection: push delivery success rate drop and client-side reconnect polling increase.
- Success criteria:
  - critical operations remain functional via in-app/manual refresh.
  - recovery notification latency returns to target after rollback.
- Rollback: restore push bridge and force health recheck.
- Evidence: mobile telemetry events, notification delivery report, UX validation notes.

## C006 Desktop Local Daemon Crash Loop

- Hypothesis: desktop app can detect daemon crash loops and guide operator recovery.
- Injection: crash local daemon process repeatedly on desktop test host.
- Blast radius: single test machine.
- Expected detection: crash-loop counter increases and local health warning displayed.
- Success criteria:
  - app surfaces actionable remediation steps.
  - stable daemon state achieved within runbook RTO target.
- Rollback: restart daemon and clear synthetic fault trigger.
- Evidence: desktop logs, UI capture, recovery command output.

## C007 Config Drift on Runtime Sandbox Profile

- Hypothesis: config integrity checks detect unauthorized sandbox profile drift before wide impact.
- Injection: apply controlled drift to sandbox profile checksum or runtime template.
- Blast radius: one staging node.
- Expected detection: integrity mismatch alarms and deployment guardrail blocks.
- Success criteria:
  - drift detected before rollout expansion.
  - node quarantined or rollout blocked automatically.
- Rollback: restore known-good profile/template and re-verify checksums.
- Evidence: config diff, integrity checker output, guardrail event logs.

## C008 On-call Handoff During Active Incident

- Hypothesis: incident continuity remains intact across operator handoff.
- Injection: perform timed handoff midway through an active chaos drill.
- Blast radius: process-only (no additional service fault).
- Expected detection: none (organizational drill), but timeline continuity must be preserved.
- Success criteria:
  - handoff completed with no gap in decision log or comm cadence.
  - incoming operator can execute next mitigation step within 5 minutes.
- Rollback: not applicable; complete drill and review.
- Evidence: handoff checklist, timestamped incident log, comm transcript.

## 5. Evidence and Reporting Requirements

- Required artifacts:
  - experiment charter (hypothesis, scope, owner, schedule)
  - metrics snapshots (before/during/after)
  - alert timeline and command transcript
  - rollback confirmation and return-to-baseline proof
- Post-drill report fields:
  - what failed as expected vs unexpectedly
  - detection gap and response gap
  - corrective actions, owners, and due dates

## 6. Exit and Readiness Criteria

Catalog run status is considered healthy when:

- all P1 experiment families are executed at least once per quarter.
- all failed success criteria have tracked remediation with owners.
- no unresolved critical action item is older than one release cycle.
