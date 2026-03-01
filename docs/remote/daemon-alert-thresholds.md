# Remote Daemon Alert Thresholds

## Scope
This document defines warning and critical alert thresholds for the remote daemon runtime, plus first-response and escalation actions for on-call operators.

## Severity Model
- `warning`: service degradation is emerging; user impact is possible if trend continues.
- `critical`: active reliability risk or user-visible impact; immediate mitigation required.

## Alert Rules

| Alert ID | Signal | Warning Threshold | Critical Threshold | Evaluation Window | First Response (0-10m) | Escalation |
| --- | --- | --- | --- | --- | --- | --- |
| `RD-CPU-SATURATION` | Daemon host CPU usage | `>= 75%` for `10m` | `>= 90%` for `5m` | 1-minute samples | Confirm top processes, throttle non-essential jobs, record impacted sessions | Page platform on-call if critical persists `> 10m` |
| `RD-MEMORY-PRESSURE` | Daemon host memory usage | `>= 80%` for `10m` | `>= 92%` for `5m` or OOM event | 1-minute samples | Check memory growth by process, cap burst workers, protect control path | Immediate page on OOM; escalate to runtime owner if unresolved after `15m` |
| `RD-RECONNECT-STORM` | Reconnect attempts per daemon | `> 30/min` for `5m` | `> 80/min` for `3m` | 1-minute rate | Validate network path and auth token health, apply reconnect backoff guardrails | Page networking on-call when critical and error-rate also elevated |
| `RD-CMD-FAIL-RATE` | Command execution failure rate | `>= 3%` for `15m` | `>= 8%` for `5m` | rolling window | Sample failing commands, classify as user-input vs runtime failures, pause risky automation | Page runtime on-call if critical `>= 5m` |
| `RD-CMD-P95-LATENCY` | Command execution p95 latency | `>= 1500ms` for `15m` | `>= 3000ms` for `5m` | rolling window | Verify queue depth and workspace I/O saturation, shed low-priority load | Escalate to infra on-call if no recovery in `15m` |
| `RD-SESSION-DROP-RATE` | Session disconnect ratio | `>= 2%` for `10m` | `>= 5%` for `5m` | rolling window | Correlate with daemon restarts and transport errors, freeze risky deploys | Page incident commander on critical with multi-region spread |
| `RD-DAEMON-RESTARTS` | Unexpected daemon restarts | `>= 2` in `30m` | `>= 4` in `30m` | event counter | Confirm crash signatures, pin last known good config, disable auto-rollouts | Critical triggers immediate SEV-2 declaration |
| `RD-DISK-PRESSURE` | Daemon disk utilization | `>= 80%` for `15m` | `>= 90%` for `10m` | 1-minute samples | Clear transient artifacts/log burst files, verify patch spool usage | Escalate to storage on-call if critical `> 10m` |

## Paging and Escalation Policy
- Warning alerts create ticket + Slack notification in `#remote-ops`; no pager unless warning persists beyond 30 minutes.
- Critical alerts trigger pager immediately for primary on-call (`remote-runtime`) and open SEV tracking document.
- If no operator acknowledgment within 5 minutes, auto-escalate to secondary on-call.
- If no mitigation progress within 15 minutes on critical, escalate to incident commander and relevant domain owner.

## Response Checklist
1. Validate signal integrity (metrics pipeline health, scrape freshness, label correctness).
2. Confirm impact radius (single daemon, shard, region, or global).
3. Execute alert-specific first response from table above.
4. Post status update to incident channel every 10 minutes until stable.
5. Close with root-cause tag and follow-up action items.

## Exit Criteria
- All critical conditions clear for at least 15 continuous minutes.
- Warning-only conditions trend downward and remain below thresholds for 30 minutes.
- Incident notes include mitigation commands, affected session count, and owner for permanent fix.
