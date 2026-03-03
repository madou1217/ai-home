#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/desktop/tauri"
TARGET_TRIPLE="aarch64-apple-darwin"
OUTPUT_DIR="$DESKTOP_DIR/src-tauri/target/$TARGET_TRIPLE/release/bundle"

echo "[aih] macOS arm64 packaging entry"
echo "[aih] repo root: $ROOT_DIR"
echo "[aih] desktop tauri: $DESKTOP_DIR"
echo "[aih] expected output: $OUTPUT_DIR"

if [[ "${AIH_DRY_RUN:-0}" == "1" ]]; then
  echo "[aih] dry-run enabled; skip build"
  exit 0
fi

if [[ ! -d "$DESKTOP_DIR" ]]; then
  echo "[aih] error: desktop tauri project not found: $DESKTOP_DIR" >&2
  exit 1
fi

if [[ "$(uname -s)" != "Darwin" ]]; then
  echo "[aih] error: macOS arm64 packaging must run on Darwin host" >&2
  exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
  echo "[aih] warning: non-arm64 host detected; cross-target build may fail"
fi

pushd "$DESKTOP_DIR" >/dev/null
npm install
npm run build
npm exec tauri build -- --target "$TARGET_TRIPLE"
popd >/dev/null

echo "[aih] build done. artifacts should be under: $OUTPUT_DIR"
