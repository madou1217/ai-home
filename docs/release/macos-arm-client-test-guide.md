# macOS Arm64 Client Manual Test Guide

## Scope
This guide validates installer usability and first-run behavior for the desktop client package on macOS arm64.

## Preconditions
- macOS arm64 host (Apple Silicon), 13+ recommended.
- A packaged installer artifact is available from local build or CI output.
- Test account is ready for CLI/session actions.
- Previous client version (if any) is known for rollback checks.

## Install Validation
1. Locate installer artifact (`.dmg` or `.app` bundle output) in release output directory.
2. Verify artifact filename, size, and checksum match release manifest.
3. Open installer and complete install flow to `/Applications`.
4. Confirm app bundle is present: `/Applications/AI Home.app`.

Expected result:
- Installer launches without corruption warning.
- Installation completes without manual patching.
- Installed app bundle metadata (name/icon/version) is correct.

## First-Run and Launch Validation
1. Start app from Finder and from Spotlight (two launch paths).
2. Confirm initial screen renders and no crash occurs in first 60 seconds.
3. Open the built-in terminal/session entry and run a harmless command.
4. Restart app once and verify state recovery (account/session list still readable).

Expected result:
- Launch is successful in both paths.
- No blocking error dialog on startup.
- Session entry works for at least one command.

## Session Action Validation
1. Trigger a new session from desktop UI.
2. Run one command and confirm output appears in UI/log area.
3. If session history is available, resume one existing session.
4. Validate account switch path (if configured) does not break session listing.

Expected result:
- New session creation works.
- Resume path works or provides actionable error text.
- Session state remains consistent after account context change.

## Rollback Checkpoints
1. Remove installed app (`/Applications/AI Home.app`).
2. Reinstall previous known-good package version.
3. Launch previous version and confirm it starts successfully.
4. Ensure rollback does not leave broken symlinks/launch items.

Expected result:
- Previous version can be restored within 10 minutes.
- No orphan launch items or unusable app state after rollback.

## Pass/Fail Checklist
- [ ] Installer artifact exists and matches checksum.
- [ ] Install flow succeeds without manual workaround.
- [ ] App launches from Finder and Spotlight.
- [ ] First-run page/session entry is usable.
- [ ] New session execution works.
- [ ] Session resume behavior is valid.
- [ ] Rollback to previous version is successful.

Pass criteria:
- All checklist items are checked.

Fail criteria:
- Any checklist item is unchecked, or a crash/data-loss issue is observed.

## Evidence Capture
- Record macOS version, hardware model, and timestamp.
- Save installer filename + checksum used in this run.
- Capture screenshots for install success, first launch, and session execution.
- Collect relevant logs (app log, terminal output, crash report if any).
- Summarize final result with:
  - `result`: pass/fail
  - `owner`: tester name
  - `date`: ISO8601 timestamp
  - `notes`: blockers, anomalies, rollback outcome
