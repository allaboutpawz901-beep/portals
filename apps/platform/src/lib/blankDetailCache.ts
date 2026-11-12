/**
 * Shared in-memory TTL cache for GET /api/v1/blanks/:id payloads.
 *
 * The detail route aggregates ~20 Supabase roundtrips plus supplier-API
 * enrichments — several seconds per cold call in this environment. The
 * same blank is re-fetched on every canvas open, product-page visit and
 * post-ingest reload, so a short-lived cache turns those into instants.
 *
 * Writers that change what the detail would say (ingest, view QA PATCH)
 * bust the entry so a reload never serves a stale render contract.
 */

const TTL_MS = 5 * 60 * 1000;

const cache = new Map<string, { at: number; body: unknown }>();

export function blankDetailCacheGet(id: string): unknown | undefined {
  const hit = cache.get(id);
  if (!hit) return undefined;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(id);
    return undefined;
  }
  return hit.body;
}

export function blankDetailCacheSet(id: string, body: unknown): void {
  cache.set(id, { at: Date.now(), body });
}

/** Drop a blank's cached detail — call after any write that changes it. */
export function blankDetailCacheBust(id: string): void {
  cache.delete(id);
}
