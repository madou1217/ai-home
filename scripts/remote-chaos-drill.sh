#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/remote-chaos-drill.sh [options]

Options:
  --target <name>        Target environment label (default: local-sim)
  --seed <number>        Deterministic seed for simulated timings (default: 106)
  --output <path>        JSON report path (default: logs/remote-chaos-drill-<ts>.json)
  --dry-run              Skip command execution and run deterministic simulation
  -h, --help             Show help

Env Hooks (optional):
  CHAOS_CMD_DISCONNECT   Command to inject disconnect timeout fault
  CHAOS_CMD_RESTART      Command to inject daemon restart fault
  HEALTH_CHECK_CMD       Command that must succeed after each fault (exit 0)
EOF
}

TARGET="local-sim"
SEED=106
DRY_RUN=0
TS="$(date +%Y%m%d-%H%M%S)"
OUTPUT="logs/remote-chaos-drill-${TS}.json"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --seed)
      SEED="${2:-}"
      shift 2
      ;;
    --output)
      OUTPUT="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! [[ "$SEED" =~ ^[0-9]+$ ]]; then
  echo "--seed must be an integer" >&2
  exit 2
fi

mkdir -p "$(dirname "$OUTPUT")"

det_ms() {
  local scenario="$1"
  local sum
  sum="$(printf '%s' "$scenario" | cksum | awk '{print $1}')"
  echo $(( (sum + SEED) % 700 + 200 ))
}

run_cmd() {
  local cmd="$1"
  if [[ -z "$cmd" || "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  bash -lc "$cmd"
}

run_health() {
  if [[ -z "${HEALTH_CHECK_CMD:-}" || "$DRY_RUN" -eq 1 ]]; then
    return 0
  fi
  bash -lc "$HEALTH_CHECK_CMD"
}

run_scenario() {
  local name="$1"
  local cmd="$2"
  local expected_signal="$3"
  local ms
  ms="$(det_ms "$name")"

  local inject_rc=0
  local health_rc=0
  local rollback="none"
  local status="pass"

  if ! run_cmd "$cmd"; then
    inject_rc=$?
    status="fail"
    rollback="inject_command_failed"
  fi

  if ! run_health; then
    health_rc=$?
    status="fail"
    rollback="post_fault_health_check_failed"
  fi

  printf '{'
  printf '"name":"%s",' "$name"
  printf '"status":"%s",' "$status"
  printf '"target":"%s",' "$TARGET"
  printf '"injection_ms":%s,' "$ms"
  printf '"inject_exit":%s,' "$inject_rc"
  printf '"health_exit":%s,' "$health_rc"
  printf '"expected_signal":"%s",' "$expected_signal"
  printf '"rollback_trigger":"%s"' "$rollback"
  printf '}'
}

disconnect_json="$(run_scenario "disconnect-timeout" "${CHAOS_CMD_DISCONNECT:-}" "reconnect_detected")"
restart_json="$(run_scenario "daemon-restart-fault" "${CHAOS_CMD_RESTART:-}" "session_recovered")"

overall="pass"
if [[ "$disconnect_json" == *'"status":"fail"'* || "$restart_json" == *'"status":"fail"'* ]]; then
  overall="fail"
fi

cat > "$OUTPUT" <<EOF
{
  "tool": "remote-chaos-drill",
  "version": 1,
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "target": "$TARGET",
  "seed": $SEED,
  "dry_run": $DRY_RUN,
  "overall_status": "$overall",
  "scenarios": [
    $disconnect_json,
    $restart_json
  ]
}
EOF

echo "remote-chaos-drill: $overall"
echo "report: $OUTPUT"

if [[ "$overall" == "pass" ]]; then
  exit 0
fi
exit 1
