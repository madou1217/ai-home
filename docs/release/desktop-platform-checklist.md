# Desktop Platform GA Checklist and Sign-off

## Scope
This checklist is for desktop GA releases built by `.github/workflows/desktop-release.yml`.
Target platforms:
- Windows
- macOS
- Linux

Use this as a release gate. Any failed P0 gate is `NO-GO`.

## Release Metadata
- Release version:
- Release tag (must match `desktop-vX.Y.Z`):
- Release owner:
- Build workflow run URL:
- Sign-off timestamp (UTC):

## Pre-release Gates
- [ ] Confirm tag format is exactly `desktop-vX.Y.Z`.
- [ ] Confirm `desktop-release` workflow succeeded for all matrix targets.
- [ ] Confirm artifacts are published and downloadable:
  - [ ] `desktop-bundle-windows`
  - [ ] `desktop-bundle-macos`
  - [ ] `desktop-bundle-linux`
- [ ] Confirm each artifact contains installable output from `target/release/bundle`.
- [ ] Confirm checksums/signature files (if configured) are present and match.
- [ ] Confirm release notes include known issues + rollback contact.

## Platform Verification Matrix
Record one row per OS.

| Platform | Installer/Bundle | Install | Launch | Functional | Regression | Result | Evidence |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Windows |  |  |  |  |  |  |  |
| macOS |  |  |  |  |  |  |  |
| Linux |  |  |  |  |  |  |  |

## GUI Functional Verification (P0)
Run on each platform with installed artifact.

### 1) Add account flow
- [ ] Open app and navigate to account management.
- [ ] Add account/profile with valid credentials.
- [ ] New account appears with correct status/metadata.

### 2) Switch default account flow
- [ ] Set a different account as default.
- [ ] Restart app.
- [ ] Default account remains correct after restart.

### 3) Export flow
- [ ] Open migration/export view.
- [ ] Trigger export and choose output path.
- [ ] Export reaches success terminal state.
- [ ] Export artifact exists and is readable.

### 4) Import flow
- [ ] Open migration/import view.
- [ ] Select a valid export artifact.
- [ ] Import reaches success terminal state.
- [ ] Imported account/config is visible and usable.

### 5) Launcher flow (codex/claude/gemini)
- [ ] Open session launcher.
- [ ] Start codex session and verify status/result feedback.
- [ ] Start claude session and verify status/result feedback.
- [ ] Start gemini session and verify status/result feedback.
- [ ] Failure path (network/tool unavailable) shows actionable retry guidance.

## Basic Regression (P0)
- [ ] Dashboard loads without blank screen or unhandled error.
- [ ] Audit log loads, filters, and paginates entries.
- [ ] No crash on startup, account switch, export, import, or launcher actions.
- [ ] Global fallback/error boundary is recoverable (no app dead-end).

## Pass/Fail Gates
All items below must pass for `GO`:
- [ ] All P0 functional and regression checks pass on Windows/macOS/Linux.
- [ ] No unresolved P0/P1 defects opened during validation.
- [ ] Release artifacts/installers are reproducible from tagged workflow run.
- [ ] Rollback package/version pointer is verified and ready.

If any gate fails: mark `NO-GO`, block release, and execute rollback trigger policy.

## Rollback Triggers
Trigger rollback immediately if any condition occurs after publish:
- P0 crash, startup failure, or unrecoverable blank screen on any supported OS.
- Account default/switch corruption or data loss.
- Import/export data integrity failure.
- Launcher cannot recover from retryable failure and blocks normal usage.
- Signed package integrity mismatch or installation breakage.

## Rollback Actions
1. Pause/stop release distribution channel.
2. Re-point to previous known-good version.
3. Publish incident note with impact and workaround.
4. Open incident owner + ETA for hotfix or re-release.

## Sign-off
- [ ] Windows verification complete.
- [ ] macOS verification complete.
- [ ] Linux verification complete.
- [ ] Release notes finalized.
- [ ] GA approval recorded by release owner.

Sign-off record:
- Decision: `GO` / `NO-GO`
- Approved by:
- Date (UTC):
- Evidence links:
