# Desktop Platform Release Checklist

## Scope
This checklist is for the desktop production release built by `.github/workflows/desktop-release.yml`.
Target platforms:
- Windows
- macOS
- Linux

## Pre-release
- [ ] Confirm release tag format is `desktop-vX.Y.Z`.
- [ ] Confirm workflow run `desktop-release` completed successfully on all three matrix targets.
- [ ] Download CI artifacts:
  - [ ] `desktop-bundle-windows`
  - [ ] `desktop-bundle-macos`
  - [ ] `desktop-bundle-linux`
- [ ] Verify each artifact contains installable package output from `target/release/bundle`.

## GUI Functional Verification
Run the installed desktop app per platform and verify:

### 1) Add account path
- [ ] Open app and navigate to account management view.
- [ ] Add an account/profile with valid credentials.
- [ ] Account appears in list with expected status.

### 2) Switch default account path
- [ ] In account list, set another account as default.
- [ ] Restart app.
- [ ] Default account state remains correct after restart.

### 3) Export path
- [ ] Open migration/export view.
- [ ] Start export and select output path.
- [ ] Export finishes with success state.
- [ ] Output artifact exists and is readable.

### 4) Import path
- [ ] Open migration/import view.
- [ ] Select previously exported artifact.
- [ ] Import finishes with success state.
- [ ] Imported account/config is visible and usable.

## Basic Regression
- [ ] Dashboard loads without blank screen.
- [ ] Audit log view loads and can query entries.
- [ ] No crash during startup, account switch, export, import.

## Sign-off
- [ ] Windows verification complete.
- [ ] macOS verification complete.
- [ ] Linux verification complete.
- [ ] Release notes updated.
- [ ] Approval recorded by release owner.
