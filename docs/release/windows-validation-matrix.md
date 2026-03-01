# Windows Installer Validation Matrix

## Scope
This matrix defines Windows GA validation for installer lifecycle and launcher smoke coverage.

Targets:
- Windows 10 (22H2) x64
- Windows 11 (23H2/24H2) x64

Build under test (fill before execution):
- Version: `<desktop-vX.Y.Z>`
- Installer artifact: `<ai-home-setup.exe>`
- SHA256: `<hash>`

## Exit Criteria
- All `P0` cases must pass.
- No unresolved crash/data-loss/security blocker.
- Any `P1` failure must have approved workaround and owner.

## Validation Matrix
| ID | Priority | Scenario | Preconditions | Steps | Expected Result | Pass/Fail |
| --- | --- | --- | --- | --- | --- | --- |
| WIN-001 | P0 | Fresh install launch | Clean machine, no prior install | Run installer with default options, finish install, launch app | Installer succeeds, app opens to home screen without crash | [ ] |
| WIN-002 | P0 | Install to custom path | Clean machine | Install to non-default path (for example `D:\Apps\AIH`), launch app | Install path honored; app launches normally | [ ] |
| WIN-003 | P0 | Start menu + desktop shortcut | Standard install completed | Launch app from Start menu and desktop shortcut | Both shortcuts exist and start the same build | [ ] |
| WIN-004 | P0 | CLI launcher smoke: codex | App installed and terminal available | Run `aih codex --help` | Command exits 0 and prints codex usage | [ ] |
| WIN-005 | P0 | CLI launcher smoke: claude | App installed and terminal available | Run `aih claude --help` | Command exits 0 and prints claude usage | [ ] |
| WIN-006 | P0 | CLI launcher smoke: gemini | App installed and terminal available | Run `aih gemini --help` | Command exits 0 and prints gemini usage | [ ] |
| WIN-007 | P0 | In-place upgrade keeps profiles | Older GA build installed with existing profiles | Run new installer and choose upgrade | Upgrade succeeds; existing profiles and default account remain intact | [ ] |
| WIN-008 | P1 | Re-run installer on same version | Same version already installed | Run installer again and complete flow | No corruption; installer handles repair/reinstall path gracefully | [ ] |
| WIN-009 | P0 | Uninstall from Apps & Features | Installed app exists | Uninstall via Windows Settings > Apps, then verify filesystem/shortcuts | Uninstall succeeds; executable and shortcuts removed; optional user data policy is respected | [ ] |
| WIN-010 | P1 | Uninstall and reinstall | App previously uninstalled | Reinstall latest build and launch | Reinstall succeeds with clean executable state | [ ] |
| WIN-011 | P1 | Non-admin user install path behavior | Standard non-admin account | Attempt install without elevation where applicable | Behavior matches installer design (prompt/elevation/failure message is clear) | [ ] |
| WIN-012 | P1 | Defender/SmartScreen first-run signal | Fresh downloaded installer | Run installer and first launch | No unsigned/unknown publisher regression; prompts match expected signing state | [ ] |

## Defect Logging
For every failed case, record:
- Case ID
- Environment (OS version/build)
- Observed behavior
- Expected behavior
- Log/screenshot path
- Owner and target fix milestone

## Sign-off
- QA owner: `<name>`
- Release owner: `<name>`
- Validation date: `<YYYY-MM-DD>`
- Final decision: `[ ] GO  [ ] NO-GO`
