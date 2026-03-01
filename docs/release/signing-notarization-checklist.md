# Desktop Signing and Notarization Checklist

## Task Status
- Task ID: `T105`
- Status: `done`
- Updated At: `2026-03-01`
- Notes: Checklist content completed, including secret custody, signing/notarization commands, verification expectations, and failure handling gates.

## Scope
This checklist standardizes release-time signing and notarization for desktop artifacts, with emphasis on key custody, deterministic command execution, and verifiable outputs.

## Required Secrets and Secure Storage
- [ ] Apple Developer ID Application certificate installed in macOS keychain used by CI/release host.
- [ ] Apple Team ID confirmed and matches release account.
- [ ] `APPLE_ID` available from secret manager (not plain text in repo or shell history).
- [ ] `APPLE_APP_SPECIFIC_PASSWORD` available from secret manager.
- [ ] `APPLE_TEAM_ID` available from secret manager.
- [ ] Optional: `NOTARYTOOL_PROFILE` configured via `xcrun notarytool store-credentials`.
- [ ] Release signing key access restricted to release operators only.
- [ ] Secret rotation date and owner recorded in release notes.

## Preflight
- [ ] Build artifacts are final release binaries (not debug builds).
- [ ] Bundle identifier and version match release tag.
- [ ] All target files requiring signing are enumerated (`.app`, `.dmg`, `.pkg`).
- [ ] Signing identity resolved on host:

```bash
security find-identity -v -p codesigning
```

Expected: one valid `Developer ID Application: ...` identity is listed and used for signing.

## Signing Checklist
- [ ] Sign app bundle with hardened runtime:

```bash
codesign --force --options runtime --timestamp --sign "Developer ID Application: <TEAM_NAME> (<TEAM_ID>)" "dist/mac/AIH.app"
```

Expected: command exits `0` with no signing errors.

- [ ] Verify signature and entitlements:

```bash
codesign --verify --deep --strict --verbose=2 "dist/mac/AIH.app"
codesign -dvv "dist/mac/AIH.app"
```

Expected: verification passes; output includes `TeamIdentifier=<TEAM_ID>` and valid authority chain.

- [ ] Build signed installer/package (`.dmg` or `.pkg`) and verify signature:

```bash
pkgutil --check-signature "dist/mac/AIH.pkg"
```

Expected: package signature is valid and references Developer ID Installer/Application as required by release format.

## Notarization Checklist
- [ ] Submit artifact to Apple notarization service:

```bash
xcrun notarytool submit "dist/mac/AIH.dmg" \
  --apple-id "$APPLE_ID" \
  --password "$APPLE_APP_SPECIFIC_PASSWORD" \
  --team-id "$APPLE_TEAM_ID" \
  --wait
```

Expected: final status is `Accepted`.

- [ ] Staple ticket after acceptance:

```bash
xcrun stapler staple "dist/mac/AIH.app"
xcrun stapler staple "dist/mac/AIH.dmg"
```

Expected: stapler completes successfully for each artifact.

- [ ] Validate Gatekeeper acceptance on signed/stapled output:

```bash
spctl -a -t exec -vv "dist/mac/AIH.app"
spctl -a -t open -vv "dist/mac/AIH.dmg"
```

Expected: output includes `accepted` and correct origin identity.

## Release Evidence
- [ ] Attach sanitized command transcript (no secrets) to release record.
- [ ] Record notarization submission ID and acceptance timestamp.
- [ ] Record SHA256 for signed artifacts post-staple.
- [ ] Confirm operator sign-off and secondary reviewer sign-off.

## Failure Handling
- [ ] If notarization fails, capture `notarytool log` output and stop release publication.
- [ ] If signature verification fails, rebuild from clean workspace and repeat signing.
- [ ] Document failure reason and remediation in release incident notes.
