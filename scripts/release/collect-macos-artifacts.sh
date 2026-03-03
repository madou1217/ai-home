#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
BUILD_ROOT="${1:-$ROOT_DIR/desktop/tauri/src-tauri/target/aarch64-apple-darwin/release/bundle}"
OUT_DIR="${2:-$ROOT_DIR/dist/macos-arm64}"
MANIFEST="$OUT_DIR/checksums.sha256"

mkdir -p "$OUT_DIR"

collect_candidates() {
  find "$BUILD_ROOT" -type f \( \
    -name '*.dmg' -o \
    -name '*.pkg' -o \
    -name '*.zip' -o \
    -name '*.tar.gz' \
  \) 2>/dev/null | sort
}

mapfile -t ARTIFACTS < <(collect_candidates)
if [ "${#ARTIFACTS[@]}" -eq 0 ]; then
  echo "[collect-macos-artifacts] no macOS package artifacts found under: $BUILD_ROOT" >&2
  echo "[collect-macos-artifacts] expected examples: *.dmg, *.pkg, *.zip, *.tar.gz" >&2
  exit 2
fi

for src in "${ARTIFACTS[@]}"; do
  cp -f "$src" "$OUT_DIR/"
  echo "[collect-macos-artifacts] copied: $(basename "$src")"
done

: > "$MANIFEST"
if command -v shasum >/dev/null 2>&1; then
  (
    cd "$OUT_DIR"
    for f in *; do
      [ "$f" = "$(basename "$MANIFEST")" ] && continue
      [ -f "$f" ] || continue
      shasum -a 256 "$f" >> "$(basename "$MANIFEST")"
    done
  )
elif command -v sha256sum >/dev/null 2>&1; then
  (
    cd "$OUT_DIR"
    for f in *; do
      [ "$f" = "$(basename "$MANIFEST")" ] && continue
      [ -f "$f" ] || continue
      sha256sum "$f" >> "$(basename "$MANIFEST")"
    done
  )
else
  echo "[collect-macos-artifacts] missing checksum tool: shasum/sha256sum" >&2
  exit 3
fi

count=$(grep -c '.' "$MANIFEST" || true)
if [ "$count" -eq 0 ]; then
  echo "[collect-macos-artifacts] checksum manifest is empty: $MANIFEST" >&2
  exit 4
fi

echo "[collect-macos-artifacts] output: $OUT_DIR"
echo "[collect-macos-artifacts] checksum manifest: $MANIFEST ($count entries)"
