// Merges the packaged CSR-annexure seed (financials.json / partners.json) into the
// stores on the persistent disk. For every company-year present in the seed, the seed
// rows replace what is on disk; all other uploaded rows are kept untouched.
// Usage: node apply.cjs <seedDir> <dataDir>
const fs = require("node:fs");
const path = require("node:path");
const [seedDir, dataDir] = process.argv.slice(2);
for (const kind of ["financials", "partners"]) {
  const seedFile = path.join(seedDir, `${kind}.json`);
  if (!fs.existsSync(seedFile)) continue;
  const seed = JSON.parse(fs.readFileSync(seedFile, "utf8"));
  const target = path.join(dataDir, `${kind}.json`);
  let existing = [];
  if (fs.existsSync(target)) {
    try { existing = JSON.parse(fs.readFileSync(target, "utf8")).records || []; } catch { existing = []; }
    fs.copyFileSync(target, `${target}.before-seed`);
  }
  const covered = new Set(seed.records.map((r) => `${r.companyKey}|${r.year}`));
  const kept = existing.filter((r) => !covered.has(`${r.companyKey}|${r.year}`));
  const store = { kind, uploadedAt: new Date().toISOString(), fileName: seed.fileName, records: [...kept, ...seed.records] };
  const tmp = `${target}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store), "utf8");
  fs.renameSync(tmp, target);
  console.log(`[entrypoint] ${kind}: ${seed.records.length} seed rows applied, ${kept.length} other rows kept`);
}
