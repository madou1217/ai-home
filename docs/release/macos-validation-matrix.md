# macOS Installer Validation Matrix

## Scope
- Target: macOS desktop installer GA validation
- Product path: installer -> first launch -> upgrade -> uninstall -> reinstall
- Coverage focus: notarization, Gatekeeper behavior, universal architecture, permission prompts

## Test Environment Matrix

| Dimension | Coverage |
| --- | --- |
| macOS version | macOS 13 Ventura, macOS 14 Sonoma, macOS 15 Sequoia |
| Chip architecture | Apple Silicon (arm64), Intel (x64 via native build) |
| Package format | `.dmg` drag-install, `.pkg` guided installer (if distributed) |
| Network condition | Stable broadband, constrained network, offline launch |
| Account profile | Fresh profile, existing profile with prior release |

## Validation Cases

| ID | Scenario | Steps | Expected Result | Pass/Fail |
| --- | --- | --- | --- | --- |
| M-001 | Notarization ticket verification | Download artifact, run `spctl --assess --type open --verbose <app_or_pkg>` | Assessment accepted, no unsigned/notarization rejection | |
| M-002 | Gatekeeper first open from DMG | Install app from downloaded DMG and launch via Finder | App opens after standard trust confirmation, no malware warning block | |
| M-003 | Signature integrity | Run `codesign --verify --deep --strict --verbose=2 <App>.app` | Signature verification succeeds for app and embedded binaries | |
| M-004 | Quarantine attribute handling | Check `xattr -l <App>.app`, launch app, re-check attributes | Quarantine attributes handled as expected; app launch remains normal | |
| M-005 | Fresh install boot path | Install on machine without prior app files and launch | App starts successfully, home screen/session entry reachable | |
| M-006 | Tool launcher smoke path | In app, trigger Codex/Claude/Gemini launcher entry | Launcher entry points render and basic action path is reachable | |
| M-007 | Upgrade in place (N-1 -> N) | Install previous GA build, then install candidate build over it | Existing user data retained; binary/version upgraded correctly | |
| M-008 | Downgrade guard | Attempt install older build over newer installed build | Downgrade behavior follows policy (blocked or warned) without corruption | |
| M-009 | Uninstall cleanup | Remove app bundle and related support files per uninstall SOP | Main executable removed; residual files match documented policy | |
| M-010 | Reinstall after uninstall | Reinstall candidate after cleanup | Reinstall succeeds; first-launch behaves like clean or documented carry-over | |
| M-011 | Universal binary architecture check | Run `lipo -info <App>.app/Contents/MacOS/<bin>` | Universal build contains required slices (arm64 + x86_64) if expected | |
| M-012 | Apple Silicon native launch | Launch on arm64 machine and inspect process architecture | Process runs native arm64 (not Rosetta unless explicitly designed) | |
| M-013 | Intel native launch | Launch on Intel machine | App launches and functions without architecture/runtime errors | |
| M-014 | Permission prompt: Notifications | Trigger notification flow first time | Prompt appears once; grant/deny both handled gracefully | |
| M-015 | Permission prompt: Accessibility (if required) | Trigger feature requiring Accessibility permission | Prompt/instructions are clear; deny path does not crash app | |
| M-016 | Permission prompt: Full Disk Access (if required) | Trigger feature requiring filesystem broad access | App provides actionable guidance; failure path is recoverable | |
| M-017 | Permission prompt: Microphone/Camera (if required) | Trigger relevant feature and respond allow/deny | Both allow/deny flows behave as designed and persist correctly | |
| M-018 | Offline launch resilience | Disconnect network then launch app | App launches; offline state messaging is clear; no crash loop | |

## Permission Prompt Checklist

| Prompt Type | Needed for GA | Trigger Path Verified | Allow Path Verified | Deny Path Verified | Notes |
| --- | --- | --- | --- | --- | --- |
| Notifications | Yes/No | [ ] | [ ] | [ ] | |
| Accessibility | Yes/No | [ ] | [ ] | [ ] | |
| Full Disk Access | Yes/No | [ ] | [ ] | [ ] | |
| Microphone | Yes/No | [ ] | [ ] | [ ] | |
| Camera | Yes/No | [ ] | [ ] | [ ] | |

## Release Sign-off Criteria
- All P0 scenarios (M-001 to M-013) pass on at least one Apple Silicon and one Intel environment.
- No notarization/signature/Gatekeeper blocker remains open.
- Required permission prompts have verified allow and deny paths.
- Upgrade and uninstall/reinstall paths show no data-loss or launch-regression beyond documented behavior.

## Execution Notes
- Capture evidence per case: screenshot/log snippet + tester + timestamp + environment.
- Any failed case must include severity, suspected component owner, and retest gate.
- Final release decision must reference this matrix revision and linked evidence bundle.

## Evidence Record Template

| Case ID | Env (OS/Chip) | Build | Result | Evidence Link | Tester | Executed At | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| M-001 | | | Pass/Fail | | | | |
| M-002 | | | Pass/Fail | | | | |
| M-003 | | | Pass/Fail | | | | |

## Severity And Retest Gate
- Sev-1: notarization/signature/Gatekeeper hard block, or app cannot launch on supported architecture.
- Sev-2: upgrade/uninstall data integrity issue, or required permission flow causes broken core path.
- Sev-3: non-blocking UX/prompt wording issues with workaround.
- GA gate: all Sev-1 and Sev-2 issues must be closed and retested with evidence before release.
