/**
 * Dataset persistence. Writes are atomic (temp file + rename) and the previous
 * dataset is kept as a backup so an upload can be rolled back.
 */

import fs from "node:fs";
import path from "node:path";

import { buildMeta, type BuiltDataset } from "@/lib/etl/build";
import { clearResponseCache } from "@/lib/cache";

/*
 * On a host with a mounted persistent disk (Render, Railway, a VPS) point
 * CSR_DATA_DIR at that mount so uploaded datasets survive redeploys. Falls back
 * to ./data for local development.
 */
const DATA_DIR = process.env.CSR_DATA_DIR
  ? path.resolve(process.env.CSR_DATA_DIR)
  : path.join(process.cwd(), "data");
const BACKUP_DIR = path.join(DATA_DIR, "backup");
const DATASET = path.join(DATA_DIR, "dataset.json");
const META = path.join(DATA_DIR, "meta.json");

export function datasetExists(): boolean {
  return fs.existsSync(DATASET);
}

export function readDataset(): BuiltDataset | null {
  if (!datasetExists()) return null;
  try {
    return JSON.parse(fs.readFileSync(DATASET, "utf8")) as BuiltDataset;
  } catch {
    return null;
  }
}

function writeAtomic(file: string, contents: string) {
  const temporary = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(temporary, contents, "utf8");
  fs.renameSync(temporary, file);
}

export function backupCurrent(): string | null {
  if (!datasetExists()) return null;
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const target = path.join(BACKUP_DIR, `dataset-${stamp}.json`);
  fs.copyFileSync(DATASET, target);
  if (fs.existsSync(META)) fs.copyFileSync(META, path.join(BACKUP_DIR, `meta-${stamp}.json`));

  // Keep the five most recent backups.
  const backups = fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith("dataset-"))
    .sort()
    .reverse();
  for (const stale of backups.slice(5)) {
    fs.rmSync(path.join(BACKUP_DIR, stale), { force: true });
    fs.rmSync(path.join(BACKUP_DIR, stale.replace("dataset-", "meta-")), { force: true });
  }
  return path.basename(target);
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .filter((name) => name.startsWith("dataset-"))
    .sort()
    .reverse()
    .map((name) => {
      const stats = fs.statSync(path.join(BACKUP_DIR, name));
      return { name, savedAt: stats.mtime.toISOString(), bytes: stats.size };
    });
}

export function restoreBackup(name: string): boolean {
  const source = path.join(BACKUP_DIR, path.basename(name));
  if (!fs.existsSync(source)) return false;
  const dataset = JSON.parse(fs.readFileSync(source, "utf8")) as BuiltDataset;
  persist(dataset);
  return true;
}

/** Write dataset + meta, then drop the in-process caches so the next request re-reads. */
export function persist(dataset: BuiltDataset) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  writeAtomic(DATASET, JSON.stringify(dataset));
  writeAtomic(META, JSON.stringify(buildMeta(dataset), null, 2));
  invalidateCaches();
}

/**
 * The query engine memoises the decoded dataset on globalThis for speed; after
 * an upload those caches must go or the dashboard would keep serving old data.
 */
export function invalidateCaches() {
  const store = globalThis as unknown as Record<string, unknown>;
  delete store.__csrDataset;
  delete store.__csrMeta;
  delete store.__csrNationalRanking;
  clearResponseCache();
}
