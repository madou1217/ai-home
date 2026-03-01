#!/usr/bin/env bash
set -euo pipefail

batch="${1:-}"
if [[ -z "$batch" ]]; then
  echo "usage: scripts/ops/pr-batch.sh <desktop|remote|mobile|plan|list>"
  exit 1
fi

if [[ "$batch" == "list" ]]; then
  echo "desktop"
  echo "remote"
  echo "mobile"
  echo "plan"
  exit 0
fi

case "$batch" in
  desktop)
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
    ;;
  remote)
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
    ;;
  mobile)
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
    ;;
  plan)
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
      docs/security \
      docs/release/pr-cutover-plan-2026-03-02.md
    git add -u plans/active plans/archive docs/scaleout_tasks
    ;;
  *)
    echo "unknown batch: $batch"
    exit 1
    ;;
esac

echo "staged batch: $batch"
