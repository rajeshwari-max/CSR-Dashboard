#!/bin/sh
# Seed an empty persistent disk, or apply a deliberately versioned packaged
# dataset update. Code-only deploys keep the existing uploaded dataset.
set -e

DATA_DIR="${CSR_DATA_DIR:-/var/data}"
SEED_VERSION_FILE="./seed-data/seed-version.txt"
INSTALLED_VERSION_FILE="$DATA_DIR/.seed-version"
mkdir -p "$DATA_DIR"

SEED_VERSION=""
INSTALLED_VERSION=""
[ -f "$SEED_VERSION_FILE" ] && SEED_VERSION="$(cat "$SEED_VERSION_FILE")"
[ -f "$INSTALLED_VERSION_FILE" ] && INSTALLED_VERSION="$(cat "$INSTALLED_VERSION_FILE")"

if [ -f "./seed-data/dataset.json" ] && {
  [ ! -f "$DATA_DIR/dataset.json" ] ||
  { [ -n "$SEED_VERSION" ] && [ "$SEED_VERSION" != "$INSTALLED_VERSION" ]; }
}; then
  echo "[entrypoint] applying packaged dataset seed ${SEED_VERSION:-initial}"
  cp ./seed-data/dataset.json "$DATA_DIR/dataset.json"
  [ -f ./seed-data/meta.json ] && cp ./seed-data/meta.json "$DATA_DIR/meta.json"
  [ -n "$SEED_VERSION" ] && printf '%s' "$SEED_VERSION" > "$INSTALLED_VERSION_FILE"
else
  echo "[entrypoint] using existing dataset at $DATA_DIR"
fi

# CSR annexure data (financials.json / partners.json): merged in once per version, so a
# new packaged extract reaches the disk on deploy while other uploads are kept.
EXTRA_VERSION_FILE="./seed-data/extra/version.txt"
INSTALLED_EXTRA_FILE="$DATA_DIR/.extra-seed-version"
if [ -f "$EXTRA_VERSION_FILE" ] && [ "$(cat "$EXTRA_VERSION_FILE")" != "$(cat "$INSTALLED_EXTRA_FILE" 2>/dev/null)" ]; then
  echo "[entrypoint] applying CSR annexure seed $(cat "$EXTRA_VERSION_FILE")"
  if node ./seed-data/extra/apply.cjs ./seed-data/extra "$DATA_DIR"; then
    cp "$EXTRA_VERSION_FILE" "$INSTALLED_EXTRA_FILE"
  else
    echo "[entrypoint] CSR annexure seed failed; existing data left as it was"
  fi
fi

exec "$@"
