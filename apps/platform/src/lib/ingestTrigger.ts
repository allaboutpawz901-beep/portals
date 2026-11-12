import { supabaseAdmin } from './supabaseAdmin';

/**
 * Shared publish/serve helpers.
 *
 * trigger(productId) — fire-and-forget blank ingestion with an in-flight
 * guard. Used by the skeleton route (lazy-first: opening a blank harvests
 * it) and the publish route (a publish attempt on an un-ingested blank
 * kicks the harvest so the re-publish succeeds).
 *
 * storageFetchUrl(storagePath) — a LONG-lived fetchable URL for a
 * `bucket/path` storage path. Suppliers (Printful) fetch print files
 * asynchronously after the API call returns, so the URL must outlive the
 * request: 7 days (604800s), Supabase's maximum signed-URL lifetime.
 */

const ingestInFlight = new Set<string>();

export function trigger(productId: string): void {
  if (ingestInFlight.has(productId)) return;
  ingestInFlight.add(productId);
  void import('./blankIngest')
    .then((m) => m.ingestBlank(productId))
    .catch(() => undefined)
    .finally(() => ingestInFlight.delete(productId));
}

/** Fetchable URL (7-day signed) for a `bucket/path` storage path. */
export async function storageFetchUrl(storagePath: string): Promise<string> {
  const slash = storagePath.indexOf('/');
  if (slash <= 0) throw new Error(`Bad storage path: ${storagePath}`);
  const bucket = storagePath.slice(0, slash);
  const path = storagePath.slice(slash + 1);
  const { data, error } = await supabaseAdmin()
    .storage.from(bucket)
    .createSignedUrl(path, 604800);
  if (error || !data?.signedUrl) {
    throw new Error(`Could not sign ${storagePath}: ${error?.message ?? 'no url'}`);
  }
  return data.signedUrl;
}
