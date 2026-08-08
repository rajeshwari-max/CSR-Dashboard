#!/bin/sh
# Seed the persistent disk on first boot only. If a dataset is already there
# (because someone uploaded one), leave it alone.
set -e

DATA_DIR="${CSR_DATA_DIR:-/var/data}"
mkdir -p "$DATA_DIR"

if [ ! -f "$DATA_DIR/dataset.json" ] && [ -f "./seed-data/dataset.json" ]; then
  echo "[entrypoint] empty data volume — seeding from the image"
  cp ./seed-data/dataset.json "$DATA_DIR/dataset.json"
  [ -f ./seed-data/meta.json ] && cp ./seed-data/meta.json "$DATA_DIR/meta.json"
else
  echo "[entrypoint] using existing dataset at $DATA_DIR"
fi

exec "$@"
