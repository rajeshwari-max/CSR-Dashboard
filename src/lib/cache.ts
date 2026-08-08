/**
 * Server-side response memoisation.
 *
 * Every aggregate endpoint is a pure function of (dataset, query string), so
 * repeated requests — flipping between pages, re-opening a filter, two panels
 * asking for the same breakdown — can be served from memory instead of
 * rescanning the fact table.
 *
 * The cache key embeds the dataset's `generatedAt`, so uploading new data
 * invalidates everything automatically without any explicit purge.
 */

interface Entry {
  value: unknown;
  at: number;
}

const MAX_ENTRIES = 120;
const TTL_MS = 10 * 60 * 1000;

function store(): Map<string, Entry> {
  const global = globalThis as unknown as { __csrResponseCache?: Map<string, Entry> };
  if (!global.__csrResponseCache) global.__csrResponseCache = new Map();
  return global.__csrResponseCache;
}

export function cached<T>(key: string, compute: () => T): T {
  const map = store();
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) {
    // Refresh recency so the hot working set survives eviction.
    map.delete(key);
    map.set(key, hit);
    return hit.value as T;
  }

  const value = compute();
  map.set(key, { value, at: Date.now() });

  // Oldest-first eviction; Map preserves insertion order.
  while (map.size > MAX_ENTRIES) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  return value;
}

export function clearResponseCache() {
  store().clear();
}
