# Workspace Isolation Incident Playbook

## Purpose
Provide a standard operating procedure for handling suspected workspace escape, sandbox bypass, or cross-workspace access in remote runtime environments.

## Scope
- Runtime: remote workspace runner, container/namespace sandbox, workspace filesystem mount.
- Incident classes:
  - Workspace escape attempt or confirmed breakout.
  - Unauthorized read/write across workspace boundaries.
  - Sandbox policy drift causing isolation guarantees to fail.

## Severity Model
- Sev1: confirmed escape with potential host or multi-tenant impact.
- Sev2: strong indicators of isolation failure, impact contained to one tenant/workspace.
- Sev3: suspicious signals with no confirmed breach, requires investigation.

## Detection Signals
- Unexpected file access outside allowed workspace root.
- Runtime logs showing denied namespace/cgroup/seccomp operations at abnormal rate.
- Command execution traces referencing host paths or sibling workspace IDs.
- Integrity monitor mismatch on sandbox profile or container template.
- Alert correlation with reconnect storms or sudden privilege escalation events.

## Roles
- Incident Commander (IC): owns timeline and decision points.
- Runtime Operator: executes containment and recovery commands.
- Security Lead: directs forensics, evidence preservation, and disclosure scope.
- Communications Owner: handles internal/external updates and postmortem scheduling.

## 0-15 Minutes: Containment
1. Declare incident and assign IC, Security Lead, and Runtime Operator.
2. Freeze risky automation:
   - stop non-essential deploy pipelines affecting runtime/sandbox.
   - block config rollout for container template and sandbox profiles.
3. Isolate impacted assets:
   - quarantine affected workspace runner node/pool.
   - revoke task scheduling to suspected workspace IDs.
   - rotate short-lived runtime credentials/tokens used by impacted workers.
4. Enforce blast-radius controls:
   - disable cross-workspace mount features if available.
   - switch admission policy to strict deny on unknown namespace transitions.
5. Start evidence timer and incident log with UTC timestamps.

## 15-60 Minutes: Triage and Forensics
1. Determine exposure:
   - list potentially impacted workspace IDs, tenant IDs, node IDs.
   - identify earliest suspicious event time and latest confirmed malicious action.
2. Preserve volatile evidence before restart:
   - capture runner process list and parent-child tree.
   - snapshot namespace/cgroup/container metadata.
   - export relevant runtime, proxy, and audit logs to immutable storage.
3. Gather filesystem and execution evidence:
   - collect hashes of sandbox config, container template, runtime binaries.
   - archive suspicious command payloads and task transcripts.
   - record unauthorized path probes and write attempts.
4. Validate control-plane integrity:
   - verify protocol/version compatibility around the incident window.
   - check recent config changes, releases, and manual interventions.
5. Decision gate:
   - if ongoing exploitation cannot be ruled out, keep affected pool offline and escalate to Sev1.

## Forensics Checklist
- [ ] Incident timeline with first-seen, containment, and mitigation timestamps.
- [ ] Impacted workspace/tenant inventory completed.
- [ ] Volatile runtime metadata preserved before service restarts.
- [ ] Sandbox/container config digests collected and compared to known-good baseline.
- [ ] Suspect commands, payloads, and access paths archived.
- [ ] Credential and token rotation evidence recorded.
- [ ] Chain-of-custody documented for all exported artifacts.

## Recovery and Validation
1. Patch or rollback root cause:
   - revert to known-good sandbox profile/container template.
   - apply runtime guard updates for violated boundary condition.
2. Rebuild trust boundaries:
   - reprovision affected runner nodes from clean image.
   - invalidate and reissue runtime credentials.
3. Controlled restore:
   - re-enable scheduling only for validated workspace cohorts.
   - monitor high-signal metrics: denied syscalls, cross-root path probes, privileged exec attempts.
4. Exit criteria:
   - no new isolation violations for at least 24 hours.
   - Security Lead signs off on containment and evidence completeness.

## Communication Cadence
- Sev1: updates every 30 minutes until containment, then hourly.
- Sev2: hourly updates until mitigation complete.
- Include: current impact scope, containment status, user-facing risk, next decision time.

## Post-Incident Hardening Feedback Loop
1. Within 24 hours:
   - hold incident review with IC, Security, Runtime, and On-call Engineering.
   - convert root causes and contributing factors into tracked action items.
2. Within 72 hours:
   - ship guardrail improvements (sandbox policy tests, startup integrity checks, config drift alarms).
   - add or tighten alerts for precursor signals observed in this incident.
3. Within 7 days:
   - run a chaos drill reproducing the failure mode and validate detection-to-containment SLA.
   - update this playbook and related runbooks based on drill findings.
4. Closure requirements:
   - every action item has owner, due date, and verification evidence.
   - leadership review confirms residual risk is accepted or mitigated.

## Evidence References
- Runtime logs: `remote/daemon`, `remote/agent/workspace-runner`.
- Sandbox assets: `remote/runtime/sandbox-profile.nsjail.cfg`, `remote/runtime/container-template.Dockerfile`.
- Protocol surfaces: `remote/proto/control.proto`, `lib/remote/*`.
