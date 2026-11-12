import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/designs/:id — one design with its canvas_state + placement.
 * PATCH /api/v1/designs/:id — save a draft. Body: { name?, placementSpec?,
 *   canvasState? } — placementSpec is stored inside canvas_state.placement_spec.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin()
      .from('designs')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (error || !data) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No design ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const canvasState = (data.canvas_state ?? {}) as Record<string, unknown>;
    return NextResponse.json({
      design: {
        id: data.id,
        projectId: data.id,
        name: data.name,
        blankId: data.supplier_catalog_product_id,
        status: data.status,
        canvasState,
        placementSpec: canvasState.placement_spec ?? null,
        garmentColor: data.garment_color,
        productType: data.product_type,
        retailPrice: data.retail_price,
        publishedProductId: data.published_product_id,
      },
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load design.');
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { data: existing, error: getErr } = await supabaseAdmin()
      .from('designs')
      .select('canvas_state')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (getErr || !existing) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No design ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const canvasState = { ...((existing.canvas_state ?? {}) as Record<string, unknown>) };
    if (body.placementSpec !== undefined) canvasState.placement_spec = body.placementSpec;
    if (body.canvasState !== undefined) Object.assign(canvasState, body.canvasState);
    const patch: Record<string, unknown> = { canvas_state: canvasState, updated_at: new Date().toISOString() };
    if (typeof body.name === 'string') patch.name = body.name;
    if (typeof body.status === 'string') patch.status = body.status;
    if (typeof body.isTemplate === 'boolean') patch.is_template = body.isTemplate;
    // Save to Collection (create action in the Studio drawers).
    if (typeof body.collectionId === 'string' || body.collectionId === null) {
      patch.collection_id = body.collectionId;
    }
    const { data, error } = await supabaseAdmin()
      .from('designs')
      .update(patch)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .select('id,name,status')
      .single();
    if (error) throw new Error(`designs update: ${error.message}`);
    return NextResponse.json({ id: data.id, projectId: data.id, name: data.name, status: data.status });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to save design.');
  }
}
