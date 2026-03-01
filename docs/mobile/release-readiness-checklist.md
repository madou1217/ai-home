# Mobile Release Readiness Checklist

## Scope
This checklist defines the final go/no-go gates for Mobile Command Center GA release.
Release can proceed only when all must-pass gates are green and required owners sign off.

## Must-pass Gates (Go Criteria)

### Product and UX
- [ ] Core journeys verified on iOS and Android: login, command execution, task status refresh, account switch.
- [ ] One-hand UX heuristic checklist reviewed with no P0/P1 usability failures.
- [ ] Empty/loading/error states verified for major views.

### Reliability and Performance
- [ ] Key-path latency SLO meets agreed target (p50/p95) for release candidate build.
- [ ] Weak-network test matrix completed (loss, high latency, disconnect/reconnect) with expected fallback behavior.
- [ ] Crash-free session rate and ANR/jank indicators meet release threshold for the last 7 days.

### Analytics and Observability
- [ ] Analytics event taxonomy implemented for critical journeys with required properties.
- [ ] Dashboard/alerts configured for command failures, sync delays, push delivery quality, and client crash spikes.
- [ ] Runbook links are available in alert descriptions.

### Security and Compliance
- [ ] No critical/high unresolved security findings in current mobile release scope.
- [ ] Secrets/token handling validated (storage, transport, rotation path).
- [ ] Privacy checks completed for analytics fields and retention boundary.

### Release Operations
- [ ] RC build provenance and artifact integrity verified.
- [ ] Rollout strategy confirmed (phased rollout %, region/device guardrails, rollback plan).
- [ ] On-call staffing and communication channels confirmed for launch window.

## No-go Conditions
Release must be blocked if any condition below is true:
- Any must-pass gate is incomplete or red.
- Any open Sev-1/Sev-2 defect affecting core journey.
- SLO breach trend indicates unresolved regression risk.
- Missing owner sign-off for required functions.
- Rollback drill or production rollback path is unverified.

## Owner Sign-off Matrix
| Area | Required owner | Backup owner | Sign-off status | Timestamp |
| --- | --- | --- | --- | --- |
| Product/UX | Mobile PM | Design Lead | [ ] Pending | |
| iOS Engineering | iOS Tech Lead | Senior iOS IC | [ ] Pending | |
| Android Engineering | Android Tech Lead | Senior Android IC | [ ] Pending | |
| Backend/API | API Lead | Platform Engineer | [ ] Pending | |
| QA/Release | QA Lead | Release Manager | [ ] Pending | |
| SRE/Operations | Mobile SRE Lead | Incident Commander | [ ] Pending | |
| Security/Privacy | Security Lead | Privacy Counsel | [ ] Pending | |

## Escalation Tree
1. Gate owner identifies blocker and opens incident/release blocker ticket.
2. Notify Release Manager and Incident Commander in launch channel within 15 minutes.
3. If blocker unresolved after 30 minutes, escalate to Engineering Manager + Product Director.
4. If customer impact risk is high, escalate to Exec-on-call and force no-go decision.
5. Resume release only after blocker owner and Release Manager both mark resolved.

## Final Decision Record
- Release decision: [ ] Go  [ ] No-go
- Decision time:
- Decision owner:
- Notes / blocker links:
