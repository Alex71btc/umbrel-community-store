#!/usr/bin/env bash
set -euo pipefail

echo "[patches] Applying backend patches..."

# Helper: copy if source exists
copy_patch() {
  local src="$1"
  local dst="$2"
  if [[ ! -f "$src" ]]; then
    echo "[patches] ERROR: missing patch file: $src" >&2
    exit 1
  fi
  mkdir -p "$(dirname "$dst")"
  cp -f "$src" "$dst"
  echo "[patches] Patched: $dst"
}

# These destination paths MUST match the paths inside the mempool API image
copy_patch "/patches/backend/common.js" \
          "/backend/package/api/common.js"

copy_patch "/patches/backend/network-sync.service.js" \
          "/backend/package/tasks/lightning/network-sync.service.js"

copy_patch "/patches/backend/funding-tx-fetcher.js" \
          "/backend/package/tasks/lightning/sync-tasks/funding-tx-fetcher.js"

copy_patch "/patches/backend/stats-importer.js" \
          "/backend/package/tasks/lightning/sync-tasks/stats-importer.js"

copy_patch "/patches/backend/clightning-convert.js" \
          "/backend/package/api/lightning/clightning/clightning-convert.js"

echo "[patches] Done."
