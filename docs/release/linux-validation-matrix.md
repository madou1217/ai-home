# Linux Installer Validation Matrix

## Scope
This matrix defines Linux GA validation for package install, launch, upgrade, and uninstall paths.

Package formats and targets:
- `deb`: Ubuntu 22.04 LTS, Ubuntu 24.04 LTS, Debian 12
- `rpm`: Fedora 40, RHEL 9 (or Rocky Linux 9)
- `AppImage` smoke: Ubuntu 24.04 LTS

## Test Environment Baseline
- Fresh VM snapshot per distro before each case.
- Non-root test user with `sudo` access.
- No pre-existing `aih` binaries in `PATH`.
- Network available for initial dependency installation and auth flows.

## Validation Matrix

| ID | Category | Scenario | Command / Action | Pass Criteria |
| --- | --- | --- | --- | --- |
| LNX-001 | Install | Clean install on Ubuntu 24.04 (`deb`) | `sudo apt install ./aih_<ver>_amd64.deb` | Install exits 0; package registered by `dpkg -l`; launcher command available. |
| LNX-002 | Install | Clean install on Fedora 40 (`rpm`) | `sudo dnf install ./aih-<ver>.x86_64.rpm` | Install exits 0; package registered by `rpm -qa`; launcher command available. |
| LNX-003 | Install | Install on Debian 12 with dependency resolution | `sudo apt install ./aih_<ver>_amd64.deb` | Missing runtime deps are resolved; no broken package state in `apt -f install`. |
| LNX-004 | Install | Reinstall same version | Re-run install for same artifact | Command is idempotent; no duplicate entries or corrupted links. |
| LNX-005 | Launch | CLI help smoke after install | `aih --help` | Exit code 0 and usage text printed. |
| LNX-006 | Launch | Provider command smoke | `aih codex --help`, `aih claude --help`, `aih gemini --help` | All commands return usage text without crash. |
| LNX-007 | Launch | First-run profile directory bootstrap | `aih ls` | `~/.ai_home` is created with expected subdirs and readable permissions. |
| LNX-008 | Launch | Non-interactive command path | `aih doctor` (or equivalent health check) | Command completes and outputs status; no hanging TTY dependency. |
| LNX-009 | Upgrade | Minor version upgrade (`N -> N+1`) on `deb` | Install new `deb` over existing | Version updates correctly; user profile data remains intact. |
| LNX-010 | Upgrade | Minor version upgrade (`N -> N+1`) on `rpm` | Install new `rpm` over existing | Version updates correctly; launcher still works. |
| LNX-011 | Upgrade | Downgrade protection/behavior | Install older package after newer one | Behavior matches policy (blocked or succeeds with explicit warning); no broken runtime state. |
| LNX-012 | Upgrade | Config compatibility after upgrade | Run `aih ls` and provider help post-upgrade | Existing accounts/profiles still visible and usable. |
| LNX-013 | Uninstall | Remove package on Ubuntu/Debian | `sudo apt remove aih` | Binary removed from `PATH`; package no longer listed. |
| LNX-014 | Uninstall | Purge package + config handling | `sudo apt purge aih` | System files removed; user-home data policy matches expectation (preserve or purge via explicit step). |
| LNX-015 | Uninstall | Remove package on Fedora/RHEL | `sudo dnf remove aih` | Package removed cleanly; no orphaned service/link errors. |
| LNX-016 | Edge | Install without `sudo` | Attempt install as normal user | Fails safely with permission error and no partial registration. |
| LNX-017 | Edge | Missing dependency precheck | Remove required runtime dep then run `aih --help` | Error message is actionable and points to missing dependency. |
| LNX-018 | Edge | Conflicting old symlink/binary in `/usr/local/bin` | Pre-create conflicting file then install | Installer behavior matches policy (replace or fail) with clear message. |
| LNX-019 | Edge | Wayland/X11 display session launch | Run app/launcher under both session types where applicable | Startup succeeds in supported session types; unsupported path has clear error. |
| LNX-020 | Edge | Offline launch after successful install | Disable network, run `aih ls` | Local commands work without network; network-required commands fail gracefully. |
| LNX-021 | Edge | AppImage executable permission | `chmod -x` then run, then `chmod +x` and run | Non-executable fails with clear error; executable runs successfully. |
| LNX-022 | Security | Package signature/integrity verification | Verify checksum/signature before install | Artifact checksum/signature matches published manifest. |

## Distro/Dependency Edge Checklist
- [ ] `glibc` compatibility confirmed on minimum supported version.
- [ ] `libstdc++` compatibility confirmed on minimum supported version.
- [ ] `openssl` runtime compatibility confirmed (system OpenSSL variations).
- [ ] SELinux enforcing mode smoke validated on RHEL/Rocky target.
- [ ] `PATH` propagation verified for login shell and non-login shell.
- [ ] File permissions validated for binaries and `~/.ai_home`.

## Exit Criteria
- All P0 scenarios pass: `LNX-001` to `LNX-015`.
- No unresolved blocker in edge/security scenarios.
- Any known deviations are documented in release notes with mitigation.
