# PR Cutover Plan (UTC+8 2026-03-02)

## Goal
Ship current completed work with minimal merge risk by splitting into 4 focused PRs.

## Preconditions
- Branch is dirty by design (parallel worker output).
- Run once before each PR batch:
  - `npm test`
  - `npm run plan:board`

## GUI Wave2 Go/No-Go Gate
- Smoke path checks must pass in packaged mode for:
  - `Shell` route fallback and global error boundary recovery action.
  - `Bootstrap` runtime readiness signal before primary view interaction.
  - `Account` list/default switch/status rendering and failure remediation hint.
  - `Migration` export/import action feedback with deterministic retry guidance.
  - `Audit` query/filter/pagination stability with actionable empty/error states.
- Required command:
  - `node --test test/desktop.gui.smoke.e2e.test.js`
- Go decision:
  - All checks green and no P0/P1 regression in GUI critical paths.
- No-Go decision:
  - Any failure above blocks release cutover and triggers rollback policy.

## PR-1 Desktop GUI + Packaging
- Scope:
  - `.github/workflows/desktop-release.yml`
  - `desktop/tauri/**`
  - `docs/release/desktop-platform-checklist.md`
- Stage command:
```bash
git add \
  .github/workflows/desktop-release.yml \
  desktop/tauri/src-tauri/src/commands/accounts.rs \
  desktop/tauri/src-tauri/src/commands/audit.rs \
  desktop/tauri/src-tauri/src/commands/migration.rs \
  desktop/tauri/src-tauri/src/main.rs \
  desktop/tauri/src-tauri/tauri.conf.json \
  desktop/tauri/src/App.tsx \
  desktop/tauri/src/views/audit-log.tsx \
  desktop/tauri/src/views/migration.tsx \
  desktop/tauri/src/views/session-launcher.tsx \
  docs/release/desktop-platform-checklist.md
```
- Commit message:
  - `feat(desktop): finalize tauri gui commands and release packaging`

## PR-2 Remote Runtime + Protocol + Isolation
- Scope:
  - `remote/**`
  - `lib/remote/patch-return.js`
  - `scripts/remote-chaos-drill.sh`
  - `test/remote.*` + remote protocol tests
- Stage command:
```bash
git add \
  lib/remote/patch-return.js \
  remote/agent/workspace-runner.js \
  remote/proto/control.proto \
  remote/runtime/container-template.Dockerfile \
  remote/runtime/environment-manager.js \
  remote/runtime/sandbox-profile.nsjail.cfg \
  scripts/remote-chaos-drill.sh \
  test/remote.project-session.test.js \
  test/remote.protocol.contract.test.js
```
- Commit message:
  - `feat(remote): harden protocol, workspace runner, and runtime isolation`

## PR-3 Mobile Command Center + Notifications
- Scope:
  - `mobile/app/**`
  - mobile e2e/unit tests
  - mobile docs
- Stage command:
```bash
git add \
  mobile/app/src/components/LogCollapsePanel.tsx \
  mobile/app/src/components/StatusPriorityCard.tsx \
  mobile/app/src/screens/OpsQuickActions.tsx \
  mobile/app/src/screens/SessionScreen.tsx \
  mobile/app/src/services/daemonClient.ts \
  mobile/app/src/services/pushNotifications.ts \
  mobile/app/src/services/reconnectManager.ts \
  docs/mobile/analytics-event-taxonomy.md \
  docs/mobile/notification-quality-dashboard-spec.md \
  docs/mobile/one-hand-ux-checklist.md \
  docs/mobile/release-readiness-checklist.md \
  docs/mobile/weak-network-test-matrix.md \
  test/mobile.push.bridge.test.js \
  test/mobile.reconnect.e2e.test.js
```
- Commit message:
  - `feat(mobile): complete session control, reconnect, and push bridge`

## PR-4 Planning/Ops Hygiene and Cleanup
- Scope:
  - `plans/active/*.plan.md` completed state updates
  - archived/virtual task deletions
  - ops scripts/tests and release docs
- Stage command:
```bash
git add \
  plans/active/roadmap-m3-desktop-ga-2026-03-01.plan.md \
  plans/active/roadmap-m5-mobile-ga-2026-03-01.plan.md \
  plans/active/roadmap-m3-release-ops-2026-03-01.plan.md \
  plans/active/roadmap-m4-sre-ops-2026-03-01.plan.md \
  plans/active/roadmap-m5-growth-ops-2026-03-01.plan.md \
  scripts/plan-dispatch.js \
  scripts/ops/collect-runtime-metrics.sh \
  scripts/ops/release-gate-report.js \
  scripts/ops/session-orphan-cleaner.sh \
  test/desktop.gui.smoke.e2e.test.js \
  test/ops.watchdog.recovery.test.js \
  test/proxy.smoke.test.js \
  docs/release/artifact-manifest-checksum.md \
  docs/release/linux-validation-matrix.md \
  docs/release/macos-validation-matrix.md \
  docs/release/signing-notarization-checklist.md \
  docs/release/windows-validation-matrix.md \
  docs/ops \
  docs/product \
  docs/reliability \
  docs/remote \
  docs/security

git add -u plans/active plans/archive docs/scaleout_tasks
```
- Commit message:
  - `chore(plan): close milestones and remove virtual scaleout artifacts`

## Do Not Commit
- `accounts.zip`
- `logs/`

## Review and Merge Order
1. PR-2 Remote Runtime
2. PR-1 Desktop GUI
3. PR-3 Mobile
4. PR-4 Planning/Ops cleanup

## Auto Review Command
Use this per PR after push:
```bash
aih codex auto review --pr <PR_NUMBER> "按回归风险优先检查：协议兼容、会话恢复、GUI关键路径、计划回写一致性。通过后自动合并。"
```
