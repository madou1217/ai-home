# Reconnect Incident Playbook

- Owner: SRE On-call
- Severity target: SEV2/SEV1 when reconnect storm causes sustained user impact
- Last updated: 2026-03-01

## 1. Incident Definition

Treat as reconnect incident when any of the following is sustained for >= 5 minutes:

- reconnect attempts surge and successful session recovery drops
- user-facing task/session operations repeatedly fail after disconnect
- daemon side shows repeated connect-disconnect loops across many clients

## 2. Detection Signals

Primary signals:

- Reconnect attempt rate exceeds baseline by 3x+
- Reconnect success ratio < 95%
- P95 reconnect latency > 15s
- Task failure ratio rises with network/reset error signatures

Secondary signals:

- Spike in `5xx` from control/task endpoints
- Frequent client-side timeout/canceled transitions after reconnect
- Alert noise from multiple regions at the same time

## 3. 0-30 Minute Response Timeline

### 0-5 min: Triage and containment

1. Declare incident channel and assign roles (incident commander, comms, operator).
2. Freeze non-essential deploys touching remote runtime/proxy/network paths.
3. Confirm blast radius (regions, tenants, client versions).

Operator commands:

```bash
# Local health baseline
aih doctor

# Proxy runtime status (if proxy path is involved)
aih proxy status

# Fast process-level health check (replace port/host to your env)
curl -sS http://127.0.0.1:8317/health || true
```

Expected signals:

- `aih doctor` returns no new critical failures unrelated to known incident
- proxy/daemon health endpoint responds quickly (< 2s)
- if health endpoint fails consistently, prioritize service restoration over deep diagnosis

### 5-15 min: Scope and hypothesis

1. Identify whether issue is capacity, network path, auth/session churn, or release regression.
2. Compare affected vs unaffected cohorts (region/version/account type).
3. Validate whether a recent change correlates with start time.

Operator commands:

```bash
# Check active proxy process and restart if process is wedged
aih proxy status
aih proxy restart

# Sample task/session behavior through API-compatible endpoint
curl -sS http://127.0.0.1:8317/v1/models | head -c 400
```

Expected signals:

- after controlled restart, reconnect success ratio should improve within 3-5 minutes
- endpoint timeout/connection-reset frequency should drop
- if no improvement, escalate to rollback decision gate

### 15-30 min: Mitigation and stabilization

1. Apply one mitigation at a time and observe 5-minute windows.
2. Preferred order:
- reduce reconnect concurrency / add jitter
- temporarily increase reconnect backoff window
- isolate noisy tenant/region if needed
- fail over to healthy region/path when available
3. Publish customer-facing update every 15 minutes.

Expected stabilization criteria:

- reconnect success ratio >= 98% for 10 continuous minutes
- reconnect latency returns near baseline (within +20%)
- task failure ratio returns to pre-incident band

## 4. Mitigation Decision Matrix

- Capacity saturation:
- scale out daemon/proxy replicas, enforce reconnect jitter/backoff, drain hot nodes
- Network path degradation:
- reroute traffic, disable unstable edge path, pin to healthy transport route
- Release regression:
- stop rollout immediately, begin rollback to last known good build
- Auth/session churn bug:
- invalidate problematic token cohort in batches, avoid global hard reset unless SEV1

## 5. Rollback Procedure

Trigger rollback when either condition is true:

- no measurable recovery after 2 mitigation cycles (about 10 minutes)
- error budget burn indicates >= SEV1 trajectory

Steps:

1. Identify target version: last known good release tag.
2. Execute staged rollback (canary -> 25% -> 100%).
3. Verify each stage for 3-5 minutes before expanding.
4. Keep mitigations (jitter/backoff/throttle) until metrics fully normalize.

Operator checklist:

```bash
# Record current runtime version (replace with your deployment command)
echo "capture current version"

# Trigger rollback via your deployment controller
echo "rollback to <last-known-good>"

# Re-check service health and API behavior
aih doctor
aih proxy status
curl -sS http://127.0.0.1:8317/health || true
```

Expected signals:

- reconnect and failure metrics trend down within first 5 minutes post-rollback
- no new cross-region expansion of failures
- incident severity can be downgraded only after stabilization criteria are met

## 6. Communication Templates

Internal update template:

- Current severity:
- Start time (UTC):
- Impact summary:
- Hypothesis:
- Mitigation in progress:
- Next checkpoint time:

External update template:

- We identified elevated reconnect failures affecting part of remote sessions.
- Mitigation and rollback safeguards are active.
- Next update in 15 minutes.

## 7. Exit Criteria and Postmortem

Resolve incident when all are true for >= 30 minutes:

- reconnect success ratio stable above SLO
- latency and failure metrics back to normal band
- no active customer escalation trend

Postmortem actions (within 48 hours):

- timeline with exact trigger and detection gap
- permanent fixes (retry policy, capacity guardrails, circuit breaker)
- alert threshold tuning and runbook updates
- chaos drill scenario added/revised for reconnect storm replay
