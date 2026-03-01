# Troubleshooting Playbook

This playbook helps operators quickly detect, isolate, and recover common AI Home failures across CLI, Desktop, Mobile, and Remote runtime paths.

## Incident Severity

| Severity | Definition | Target Response |
| --- | --- | --- |
| S1 | Broad outage or data-loss risk | Start mitigation in 5 minutes |
| S2 | Core flow degraded for many users | Start mitigation in 15 minutes |
| S3 | Scoped failure or workaround exists | Start mitigation in 1 hour |

## First 10 Minutes Checklist

1. Confirm blast radius: account(s), platform(s), region, and first observed timestamp.
2. Capture latest logs from CLI, app UI, and daemon/runtime services.
3. Classify the symptom into one of the categories below.
4. Apply immediate containment (stop retries, isolate bad workspace, disable broken endpoint).
5. Post incident status update with owner and next checkpoint.

## Symptom-to-Action Matrix

| Symptom | Likely Domain | First Checks | Immediate Mitigation |
| --- | --- | --- | --- |
| CLI command hangs or exits non-zero | Local runtime / auth / network | `aih --help`, `aih ls`, account token validity, proxy reachability | Re-auth profile, restart CLI session, switch fallback endpoint |
| Desktop cannot start session | Desktop shell bridge / local daemon | Desktop logs, daemon health, local port conflicts | Restart desktop app + daemon, clear stuck session lock |
| Mobile status never updates | Mobile polling/stream, push channel, daemon API | API connectivity, reconnect manager state, task endpoint latency | Force pull refresh, rebind session, disable push-only mode |
| Remote workspace commands fail | Remote agent/runtime isolation | Agent heartbeat, workspace quota, sandbox policy errors | Route to healthy workspace pool, throttle new task scheduling |
| Repeated task failures after reconnect | Session resume / protocol compatibility | protocol version match, retry counters, transient vs terminal error ratio | Freeze retries, run controlled resume, rollback to last stable transport mode |

## Diagnostic Commands

Run from repository root where applicable:

```bash
node bin/ai-home.js --help
node bin/ai-home.js ls
node bin/ai-home.js doctor
npm run plan:board -- --all
```

If remote runtime is enabled, also verify:

```bash
node bin/ai-home.js remote status
node bin/ai-home.js remote logs --tail 200
```

## Recovery Procedures

### 1) Authentication and Profile Failures

1. Validate active profile and credential freshness.
2. Rotate or re-import credentials if token expiration is suspected.
3. Re-run minimal command (`aih ls`) before restoring full traffic.
4. Record affected profile IDs without exposing secrets.

### 2) Local Daemon or Desktop Runtime Issues

1. Check daemon process liveness and port occupancy.
2. Restart daemon first, then desktop shell.
3. Retry one known-safe command path.
4. If failure persists, collect diagnostics bundle and escalate to platform owner.

### 3) Remote Workspace Degradation

1. Identify failed workspace IDs and isolate them from new scheduling.
2. Drain in-flight tasks to healthy pool when possible.
3. Verify sandbox profile checksum and runtime image compatibility.
4. Run a controlled smoke command against replacement workspace.

### 4) Mobile Reconnect/Task Sync Incidents

1. Confirm task/session IDs remain stable after reconnect.
2. Compare mobile-visible state with daemon task snapshot.
3. Trigger bounded retry with backoff; avoid unbounded polling loops.
4. Surface explicit user actions: retry, reconnect, or escalate.

## Escalation Rules

Escalate to incident commander when any condition is met:

- S1 condition lasts longer than 10 minutes.
- Recovery attempts fail 3 consecutive times.
- Data integrity risk, security concern, or audit evidence gap is observed.
- Multiple platforms (CLI + Desktop + Mobile) fail with shared root cause.

## Evidence Collection

Attach the following to the incident ticket:

- Timeline with UTC timestamps.
- Commands executed and exit summaries.
- Relevant log excerpts with sensitive data redacted.
- Affected task/session IDs and account scope.
- Final root cause and corrective actions.

## Exit Criteria

Incident can be closed when all are true:

- Error rate returns to baseline for at least 30 minutes.
- Core user flows succeed: login, launch session, trigger task, view result.
- Mitigation rollback or permanent fix is documented.
- Follow-up action items are tracked with owners and due dates.
