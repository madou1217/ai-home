# Desktop Rollback Runbook

## Purpose
This runbook defines when and how to roll back a desktop release across Windows, macOS, and Linux when a GA build causes critical impact.

## Known Pre-Release Build Blocker Pattern
If desktop packaging fails before release because Tauri Rust manifests are missing:
- Symptom: build fails in `desktop/tauri/src-tauri` before bundle generation.
- Common root cause: only UI/config files were changed, while `Cargo.toml`/`build.rs` were absent.
- Immediate action: do not start rollout; treat as pre-release gate failure, not post-release incident.
- Recovery owner: Packaging Owner + Desktop Eng Lead.

## Scope
- Release channel: production desktop installers and update feeds.
- In scope: release metadata, download endpoints, desktop update pointers, release announcement correction.
- Out of scope: server-side feature rollback unrelated to desktop artifacts.

## Severity And Rollback Triggers

### P0 (Immediate rollback)
Trigger any one of the following:
- Installer cannot complete on one or more primary platforms for more than 15 minutes.
- App crash-on-start rate is at or above 20% for any platform after release.
- Data-loss or irreversible profile corruption is confirmed.
- Critical security issue is confirmed in shipped desktop binary.

Action:
- Start rollback immediately (no patch-first attempt).

### P1 (Time-boxed rollback decision)
Trigger any one of the following:
- Upgrade flow fails at or above 10% on a primary platform for more than 30 minutes.
- Major workflow (account switch/export/import/session launch) is broken for a large cohort.
- Severe regression with no mitigation and no fix candidate within 30 minutes.

Action:
- Start 30-minute fix window. If unresolved, execute rollback.

### P2 (No rollback by default)
Examples:
- Cosmetic/UI issues.
- Non-blocking performance degradation with mitigation.

Action:
- Keep release, open hotfix track.

## Owner Map
- Incident Commander (IC): Release owner on call. Owns go/no-go and timeline.
- Desktop Eng Lead: Validates defect scope and rollback candidate version.
- Packaging Owner: Re-publishes previous good installers/artifacts.
- CDN/Infra Owner: Switches download/feed pointers and cache invalidation.
- QA Owner: Executes rollback verification matrix.
- Comms Owner: Posts internal and external status updates.

## Communication Plan

### Internal Channels
- `#release-war-room`: all tactical updates every 10 minutes.
- `#desktop-eng`: technical root cause and fix/rollback details.
- `#support`: customer-facing symptom summary and workaround.

### External Channels
- Status page incident update.
- Release notes correction/changelog annotation.
- Support macro update for rollback confirmation and next steps.

### Update Template
- Impact: <who/what is broken>
- Decision: <rollback / hold / hotfix>
- Scope: <platforms + versions>
- ETA: <next checkpoint time>
- Owner: <IC>

## Time-Boxed Rollback SOP

### T+0 to T+5 min: Incident Declaration
- IC declares incident and severity.
- Freeze new desktop rollout promotions.
- Assign named owners from the map above.

Exit criteria:
- Severity set and owner map assigned in war room.

### T+5 to T+15 min: Confirm Rollback Target
- Identify last known good release version (`N-1`).
- Verify checksums and signatures for `N-1` artifacts.
- Confirm availability for all platforms.

Exit criteria:
- `N-1` artifact set verified and approved by Desktop Eng Lead + Packaging Owner.

### T+15 to T+30 min: Execute Rollback
- Re-point update feed/manifest from `N` to `N-1`.
- Re-point download links to `N-1` installers.
- Invalidate CDN caches for release metadata and download landing pages.
- Stop/disable broken release pipeline job if auto-promotion exists.

Exit criteria:
- Public metadata and download endpoints resolve to `N-1` globally.

### T+30 to T+45 min: Verification
- QA validates install/launch/upgrade on Windows, macOS, Linux using `N-1`.
- Support verifies new downloads/installers match `N-1` checksums.
- Observe crash and upgrade metrics for recovery trend.

Exit criteria:
- Core flows pass on all platforms and incident impact is no longer expanding.

### T+45 to T+60 min: Communication And Close
- Publish rollback completed update with exact affected versions and time window.
- Document temporary workaround (if any).
- Keep war room open until two consecutive healthy metric intervals.

Exit criteria:
- IC marks rollback complete and opens postmortem action list.

## Decision Tree
1. Is there P0 trigger? If yes, rollback now.
2. If not P0, is there P1 trigger? If no, no rollback.
3. If P1 trigger exists, can fix be verified in 30 minutes? If yes, ship hotfix.
4. If fix cannot be verified in 30 minutes, rollback.

## Rollback Completion Checklist
- [ ] Update feed points to `N-1`.
- [ ] Download links point to `N-1` for all platforms.
- [ ] CDN cache invalidated.
- [ ] Windows/macOS/Linux smoke checks pass.
- [ ] Status page and release notes updated.
- [ ] Support handoff completed.

## Post-Rollback Follow-Up (Within 24 Hours)
- Publish incident timeline with trigger, decision, and restoration checkpoints.
- Capture root cause and prevention actions.
- Add new regression guardrails to release checklist and CI gates.
