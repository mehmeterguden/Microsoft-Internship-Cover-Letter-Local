#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VERSION_LABEL="${1:-stable}"
OUTPUT_DIR="${2:-$ROOT_DIR/release-artifacts}"
BUNDLE_NAME="cover-letter-local-${VERSION_LABEL}-bundle"
TMP_DIR="$(mktemp -d)"
STAGE_DIR="$TMP_DIR/$BUNDLE_NAME"

cleanup() {
  rm -rf "$TMP_DIR"
}

trap cleanup EXIT

mkdir -p "$STAGE_DIR" "$OUTPUT_DIR"

rsync -a \
  --exclude '.git' \
  --exclude '.github' \
  --exclude '.agents' \
  --exclude '.claude' \
  --exclude '.pytest_cache' \
  --exclude '.mypy_cache' \
  --exclude '.ruff_cache' \
  --exclude 'venv' \
  --exclude '.venv' \
  --exclude 'env' \
  --exclude 'ENV' \
  --exclude 'data' \
  --exclude 'runtime-data' \
  --exclude 'release-artifacts' \
  --exclude 'frontend/node_modules' \
  --exclude 'frontend/dist' \
  --exclude 'backend/data' \
  --exclude '__pycache__' \
  --exclude '*.pyc' \
  --exclude '.DS_Store' \
  "$ROOT_DIR/" "$STAGE_DIR/"

tar -C "$TMP_DIR" -czf "$OUTPUT_DIR/$BUNDLE_NAME.tar.gz" "$BUNDLE_NAME"
(
  cd "$TMP_DIR"
  zip -qr "$OUTPUT_DIR/$BUNDLE_NAME.zip" "$BUNDLE_NAME"
)

(
  cd "$OUTPUT_DIR"
  shasum -a 256 "$BUNDLE_NAME.tar.gz" "$BUNDLE_NAME.zip" > SHA256SUMS.txt
)

echo "Created $OUTPUT_DIR/$BUNDLE_NAME.tar.gz"
echo "Created $OUTPUT_DIR/$BUNDLE_NAME.zip"
echo "Created $OUTPUT_DIR/SHA256SUMS.txt"
