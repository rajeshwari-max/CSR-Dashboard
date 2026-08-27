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

exec "$@"
