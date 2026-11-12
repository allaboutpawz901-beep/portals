import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/blanks/:id/approve-render — set render_state='render_ready'
 * (Lane 5, acceptance test 4's precondition). REFUSED with a reason unless:
 *   1. the blank has at least one linked, active render contract row, and
 *   2. every linked view is verified, and
 *   3. a test render for this blank reached status 'succeeded'
 *      (contract §5: render_ready only when every view is verified AND a
 *      Test Render is approved).
 * :id is a canonical_product_id or a supplier_catalog_product id.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    let canonical: string | null = null;
    const { data: canon } = await supabaseAdmin()
      .from('canonical_products')
      .select('id,render_state')
      .eq('id', id)
      .maybeSingle();
    if (canon) {
      canonical = canon.id as string;
    } else {
      const { data: product } = await supabaseAdmin()
        .from('supplier_catalog_products')
        .select('canonical_product_id')
        .eq('id', id)
        .maybeSingle();
      if (!product || !product.canonical_product_id) {
        return NextResponse.json(
          { error: { code: 'NOT_FOUND', message: `No blank ${id}.`, requestId: crypto.randomUUID() } },
          { status: 404 },
        );
      }
      canonical = product.canonical_product_id as string;
    }

    const refuse = (reason: string, extra?: Record<string, unknown>) =>
      NextResponse.json(
        {
          error: {
            code: 'NOT_RENDER_READY',
            message: reason,
            requestId: crypto.randomUUID(),
          },
          ...extra,
        },
        { status: 422 },
      );

    const { data: views, error: vErr } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select('view_angle,verified')
      .eq('canonical_product_id', canonical)
      .eq('is_active', true);
    if (vErr) throw new Error(`product_canvas_templates: ${vErr.message}`);
    const rows = views ?? [];
    if (rows.length === 0) {
      return refuse(
        'This blank has no linked render contract rows — the render workspace cannot approve a blank with no views.',
        { blankId: canonical, testRenderApproved: false },
      );
    }
    const unverified = rows.filter((v) => !v.verified).map((v) => String(v.view_angle));
    if (unverified.length > 0) {
      return refuse(
        `Approval refused: ${unverified.length} view(s) still unverified (${unverified.join(', ')}). Confirm each print box first.`,
        { blankId: canonical, unverifiedViews: unverified, testRenderApproved: false },
      );
    }

    const { data: testRenders, error: tErr } = await supabaseAdmin()
      .from('design_renders')
      .select('id,status')
      .eq('canonical_product_id', canonical)
      .eq('kind', 'mockup')
      .eq('status', 'succeeded')
      .limit(1);
    if (tErr) throw new Error(`design_renders: ${tErr.message}`);
    if (!testRenders || testRenders.length === 0) {
      return refuse(
        'Approval refused: no test render for this blank has succeeded yet. Queue a test render and wait for the worker to approve it.',
        { blankId: canonical, testRenderApproved: false },
      );
    }

    const { error: updErr } = await supabaseAdmin()
      .from('canonical_products')
      .update({ render_state: 'render_ready' })
      .eq('id', canonical);
    if (updErr) throw new Error(`canonical_products update: ${updErr.message}`);
    return NextResponse.json({
      blankId: canonical,
      renderState: 'render_ready',
      testRenderApproved: true,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to approve the render.');
  }
}
