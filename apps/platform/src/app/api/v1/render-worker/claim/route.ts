import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { processRenderQueue } from '@/lib/renderWorker';

/**
 * POST /api/v1/render-worker/claim — the render worker's entry point.
 * Claims a batch of queued design_renders rows (FOR UPDATE SKIP LOCKED
 * via the claim_design_renders RPC), composites each with sharp, uploads
 * real files to storage, and marks rows succeeded with storage_path.
 * Stuck rows (>5 min running) are requeued by the claim function while
 * attempts remain; 3 attempts → failed. One bad row never fails the batch.
 * Body: { batchSize?: number } (default 5, max 20).
 */
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as { batchSize?: unknown };
    const batchSize =
      typeof body.batchSize === 'number'
        ? Math.min(20, Math.max(1, Math.floor(body.batchSize)))
        : 5;
    const result = await processRenderQueue(batchSize);
    return NextResponse.json(result);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Render worker failed.');
  }
}

/** GET /api/v1/render-worker/claim — queue depths, for the review grid. */
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
