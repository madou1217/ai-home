#!/usr/bin/env bash
set -euo pipefail

ACTION="${1:-install}"
LABEL="com.aihome.planforeman"
UID_NUM="$(id -u)"
resolve_home_dir() {
  if [[ -n "${AIH_HOST_HOME:-}" ]]; then
    echo "${AIH_HOST_HOME}"
    return
  fi

  local console_user
  console_user="$(stat -f '%Su' /dev/console 2>/dev/null || true)"
  if [[ -n "${console_user}" && "${console_user}" != "root" ]]; then
    local console_home
    console_home="$(dscl . -read "/Users/${console_user}" NFSHomeDirectory 2>/dev/null | awk '{print $2}' || true)"
    if [[ -n "${console_home}" ]]; then
      echo "${console_home}"
      return
    fi
  fi

  echo "${HOME}"
}

HOME_DIR="$(resolve_home_dir)"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PLIST_DIR="${HOME_DIR}/Library/LaunchAgents"
PLIST_PATH="${PLIST_DIR}/${LABEL}.plist"
LOG_DIR="${HOME_DIR}/Library/Logs/aihome"
OUT_LOG="${LOG_DIR}/plan-foreman.launchd.out.log"
ERR_LOG="${LOG_DIR}/plan-foreman.launchd.err.log"
NODE_BIN="${AIH_NODE_BIN:-$(command -v node || true)}"
FOREMAN_JS="${REPO_ROOT}/scripts/plan-foreman.js"

if [[ -z "${NODE_BIN}" ]]; then
  echo "[foreman-launchd] node binary not found. Set AIH_NODE_BIN explicitly."
  exit 1
fi

if [[ ! -x "${NODE_BIN}" ]]; then
  echo "[foreman-launchd] node binary not executable: ${NODE_BIN}"
  exit 1
fi

if [[ ! -f "${FOREMAN_JS}" ]]; then
  echo "[foreman-launchd] missing foreman script: ${FOREMAN_JS}"
  exit 1
fi

install_service() {
  mkdir -p "${PLIST_DIR}" "${LOG_DIR}"

  cat > "${PLIST_PATH}" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${FOREMAN_JS}</string>
    <string>--interval-sec</string>
    <string>20</string>
    <string>--relaunch-max</string>
    <string>6</string>
    <string>--relaunch-cooldown-sec</string>
    <string>90</string>
    <string>--zombie-sec</string>
    <string>600</string>
    <string>--suspend-sec</string>
    <string>600</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${REPO_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key>
    <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:${HOME_DIR}/.nvm/versions/node/v22.16.0/bin</string>
    <key>AIH_DEEP_USAGE_CHECK</key>
    <string>1</string>
  </dict>
</dict>
</plist>
EOF

  launchctl bootout "gui/${UID_NUM}" "${PLIST_PATH}" >/dev/null 2>&1 || true
  launchctl bootstrap "gui/${UID_NUM}" "${PLIST_PATH}"
  launchctl enable "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1 || true
  launchctl kickstart -k "gui/${UID_NUM}/${LABEL}" >/dev/null 2>&1 || true

  echo "[foreman-launchd] installed ${LABEL}"
  echo "[foreman-launchd] plist: ${PLIST_PATH}"
  echo "[foreman-launchd] logs: ${OUT_LOG} | ${ERR_LOG}"
  launchctl print "gui/${UID_NUM}/${LABEL}" | rg -n "state =|pid =|last exit code =|path =" || true
}

uninstall_service() {
  launchctl bootout "gui/${UID_NUM}" "${PLIST_PATH}" >/dev/null 2>&1 || true
  rm -f "${PLIST_PATH}"
  echo "[foreman-launchd] uninstalled ${LABEL}"
}

status_service() {
  if [[ -f "${PLIST_PATH}" ]]; then
    echo "[foreman-launchd] plist present: ${PLIST_PATH}"
  else
    echo "[foreman-launchd] plist missing: ${PLIST_PATH}"
  fi
  launchctl print "gui/${UID_NUM}/${LABEL}" | rg -n "state =|pid =|last exit code =|path =" || true
}

case "${ACTION}" in
  install) install_service ;;
  uninstall) uninstall_service ;;
  status) status_service ;;
  *)
    echo "Usage: $0 {install|uninstall|status}"
    exit 1
    ;;
esac
