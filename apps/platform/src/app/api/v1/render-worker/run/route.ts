import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { processRenderQueue } from '@/lib/renderWorker';

/**
 * POST /api/v1/render-worker/run — the render worker's run entry point.
 * Claims a batch of queued design_renders rows (FOR UPDATE SKIP LOCKED
 * via the claim_design_renders RPC; stuck rows > 5 min are recovered
 * inside the claim) and renders each. One bad row never fails the batch.
 * Body: { limit?: number } (default 5, max 20).
 *
 * Serve intent (the actual serving is the platform/CDN's job): outputs
 * are hash-addressed and immutable —
 * Cache-Control: public, max-age=31536000, immutable.
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: unknown };
    const limit =
      typeof body.limit === 'number'
        ? Math.min(20, Math.max(1, Math.floor(body.limit)))
        : 5;
    const result = await processRenderQueue(limit);
    return NextResponse.json({
      ...result,
      serve: {
        cacheControl: 'public, max-age=31536000, immutable',
        note: 'Outputs are hash-addressed under /r/{input_hash}/…; serving is the platform/CDN job.',
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Render worker failed.');
  }
}

/** GET /api/v1/render-worker/run — queue depths, for the review grid. */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('design_renders')
      .select('status')
      .eq('tenant_id', DEFAULT_TENANT_ID);
    if (error) throw new Error(error.message);
    const counts: Record<string, number> = {
      queued: 0,
      running: 0,
      succeeded: 0,
      failed: 0,
      stale: 0,
    };
    for (const r of data ?? []) {
      const s = r.status as string;
      if (s in counts) counts[s]++;
    }
    return NextResponse.json({ counts });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to read render queue.');
  }
}
