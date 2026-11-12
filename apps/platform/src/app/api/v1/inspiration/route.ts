import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/inspiration?q=&limit= — design-inspiration imagery from
 * Wikimedia Commons.
 *
 * The drawer's fuel: curated themes preload on mount, and the search bar
 * overrides them with a live query. The MediaWiki API is called
 * server-side (no CORS concerns at all, plus a 10-minute memory cache) and
 * mapped to exactly what the drawer needs per image:
 *   - thumbUrl  → the <img> tiles (200px, instant UI)
 *   - url       → the full-resolution source, sent to the AI engine
 *   - title     → the caption / AI prompt seed
 *   - pageUrl   → the Commons file page (attribution / license)
 *
 * No bot or OAuth application is needed: this is the anonymous public
 * MediaWiki API at a low, cached volume.
 */

export interface InspirationImage {
  title: string;
  thumbUrl: string;
  url: string;
  width: number | null;
  height: number | null;
  pageUrl: string;
}

const TTL_MS = 10 * 60 * 1000;
const MAX_CACHE = 200;
const cache = new Map<string, { at: number; images: InspirationImage[] }>();

function cacheGet(key: string): InspirationImage[] | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > TTL_MS) {
    cache.delete(key);
    return null;
  }
  return hit.images;
}

function cacheSet(key: string, images: InspirationImage[]): void {
  cache.set(key, { at: Date.now(), images });
  if (cache.size > MAX_CACHE) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

interface CommonsPage {
  title?: string;
  imageinfo?: {
    thumburl?: string;
    url?: string;
    width?: number;
    height?: number;
    mime?: string;
  }[];
}

/** Wikimedia's UA policy: identify the bot/script with contact info —
 *  lightweight anonymous UAs from datacenter IPs get 403-rate-limited. */
const COMMONS_UA =
  'UnsaidStudio-DesignCanvas/1.0 (design inspiration drawer; contact: ops@unsaidstudio.app) node-fetch';

async function commonsFetch(url: string): Promise<Response> {
  let lastErr: Error = new Error('unreachable');
  // Wikimedia answers bursts with 403 "too many requests" — retry with backoff.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) {
      await new Promise((r) => setTimeout(r, 900 * attempt * attempt));
    }
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': COMMONS_UA, 'Api-User-Agent': COMMONS_UA },
        signal: AbortSignal.timeout(12_000),
      });
      if (res.status === 403 || res.status === 429) {
        lastErr = new Error(`Commons ${res.status} (rate-limited, attempt ${attempt + 1})`);
        continue;
      }
      return res;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error('fetch failed');
    }
  }
  throw lastErr;
}

async function searchCommons(
  q: string,
  limit: number,
): Promise<InspirationImage[]> {
  const params = new URLSearchParams({
    action: 'query',
    generator: 'search',
    gsrsearch: `${q} filetype:bitmap`,
    gsrnamespace: '6', // File namespace — image files only
    gsrlimit: String(limit),
    prop: 'imageinfo',
    iiprop: 'url|size|mime',
    iiurlwidth: '200', // lightweight thumbnail for the drawer tiles
    format: 'json',
  });
  const res = await commonsFetch(
    `https://commons.wikimedia.org/w/api.php?${params.toString()}`,
  );
  if (!res.ok) throw new Error(`Commons ${res.status}`);
  const json = (await res.json()) as { query?: { pages?: Record<string, CommonsPage> } };
  const pages = Object.values(json.query?.pages ?? {});
  const images: InspirationImage[] = [];
  for (const p of pages) {
    const ii = p.imageinfo?.[0];
    if (!ii?.url || !ii.thumburl) continue;
    const title = (p.title ?? 'Untitled').replace(/^File:/, '').replace(/\.[a-z0-9]+$/i, '');
    images.push({
      title,
      thumbUrl: ii.thumburl,
      url: ii.url,
      width: ii.width ?? null,
      height: ii.height ?? null,
      pageUrl: `https://commons.wikimedia.org/wiki/${encodeURIComponent((p.title ?? '').replace(/ /g, '_'))}`,
    });
  }
  return images;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const q = (sp.get('q') ?? '').trim().slice(0, 120);
    const limit = Math.min(Math.max(Number(sp.get('limit') ?? 12) || 12, 1), 50);
    if (!q) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'Missing ?q — the search term.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const key = `${q.toLowerCase()}#${limit}`;
    const cached = cacheGet(key);
    if (cached) return NextResponse.json({ query: q, results: cached, cached: true });

    const images = await searchCommons(q, limit);
    cacheSet(key, images);
    return NextResponse.json({ query: q, results: images, cached: false });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Inspiration search failed.');
  }
}
