import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { apiError, KEEPER_SUPPLIER_SLUGS } from '@/lib/podServer';
import { blankIngestStatus, ingestBlank } from '@/lib/blankIngest';
import { blankDetailCacheBust } from '@/lib/blankDetailCache';

/**
 * GET /api/v1/blanks/:id/ingest — the blank's render-contract status:
 * which views are linked, which have stored bases, verified flags, and
 * the canonical render_state. Null when the blank has no canonical id.
 *
 * POST /api/v1/blanks/:id/ingest — run ingestion NOW (lazy-first policy:
 * the canvas calls this before the first preview on an un-ingested
 * blank). Harvests color × view photos from the supplier catalog API,
 * stores them in our bucket, writes product_canvas_templates rows.
 * Idempotent — an ingested blank short-circuits unless { force: true }.
 * The harvest is bounded (5 views, 40 images) and every per-image
 * failure is reported in `skipped`, never thrown.
 */

/** Keeper gate — the same rule the skeleton/detail routes apply. */
async function keeperGate(id: string): Promise<{ ok: boolean; message?: string }> {
  const { data: product, error } = await supabaseAdmin()
    .from('supplier_catalog_products')
    .select('id,supplier_id')
    .eq('id', id)
    .single();
  if (error || !product) return { ok: false, message: `No blank ${id}.` };
  const { data: supplier } = await supabaseAdmin()
    .from('suppliers')
    .select('slug')
    .eq('id', product.supplier_id as string)
    .single();
  if (!supplier || !KEEPER_SUPPLIER_SLUGS.includes(supplier.slug as string)) {
    return { ok: false, message: 'This product’s supplier is not enabled for the designer.' };
  }
  return { ok: true };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await keeperGate(id);
    if (!gate.ok) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: gate.message, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const status = await blankIngestStatus(id);
    if (!status) {
      return NextResponse.json(
        {
          error: {
            code: 'NO_CANONICAL',
            message: 'Blank has no canonical_product_id — ingestion is not possible.',
            requestId: crypto.randomUUID(),
          },
        },
        { status: 404 },
      );
    }
    return NextResponse.json(status);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load ingest status.');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const gate = await keeperGate(id);
    if (!gate.ok) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: gate.message, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const body = (await req.json().catch(() => ({}))) as { force?: unknown };
    const report = await ingestBlank(id, { force: body.force === true });
    // Ingestion rewrote the render contract — drop the cached detail so
    // the canvas's post-ingest reload sees the stored bases.
    blankDetailCacheBust(id);
    return NextResponse.json(report, { status: report.alreadyIngested ? 200 : 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Blank ingestion failed.');
  }
}
