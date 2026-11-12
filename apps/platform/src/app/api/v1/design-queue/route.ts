import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * /api/v1/design-queue — the Design Queue inspector's persisted queue,
 * one row per queued blank, per tenant. "Start designing" takes the first
 * queued row, opens its blank in the Studio, and marks it done — finishing
 * one advances to the next.
 *   GET    — queued rows (oldest first) with the blank's name/brand/image.
 *   POST   { supplierCatalogProductId?, designId? } — enqueue (409 if already queued).
 *   PATCH  { id, status: 'queued'|'active'|'done' } — advance a row.
 *   DELETE ?id= — remove a row from the queue.
 */

interface QueueRow {
  id: string;
  supplier_catalog_product_id: string | null;
  design_id: string | null;
  position: number;
  status: string;
  created_at: string;
}

async function listQueued() {
  const { data, error } = await supabaseAdmin()
    .from('design_queue')
    .select('id,supplier_catalog_product_id,design_id,position,status,created_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'queued')
    .order('position', { ascending: true })
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`design_queue: ${error.message}`);
  const rows = (data ?? []) as QueueRow[];
  const productIds = rows
    .map((r) => r.supplier_catalog_product_id)
    .filter((x): x is string => Boolean(x));
  let products = new Map<string, { name: string; brand: string; imageUrl: string | null }>();
  if (productIds.length > 0) {
    const { data: prods } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .select('id,name,brand_name,image_url')
      .in('id', productIds);
    products = new Map(
      (prods ?? []).map((p) => [
        p.id as string,
        {
          name: p.name as string,
          brand: (p.brand_name as string | null) ?? 'Generic brand',
          imageUrl: (p.image_url as string | null) ?? null,
        },
      ]),
    );
  }
  return rows.map((r) => {
    const p = r.supplier_catalog_product_id
      ? products.get(r.supplier_catalog_product_id)
      : undefined;
    return {
      id: r.id,
      supplierCatalogProductId: r.supplier_catalog_product_id,
      designId: r.design_id,
      position: r.position,
      status: r.status,
      createdAt: r.created_at,
      name: p?.name ?? null,
      brand: p?.brand ?? null,
      imageUrl: p?.imageUrl ?? null,
    };
  });
}

export async function GET() {
  try {
    return NextResponse.json({ queue: await listQueued() });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list the queue.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const productId = (body?.supplierCatalogProductId as string | null) || null;
    const designId = (body?.designId as string | null) || null;
    if (!productId && !designId) {
      return apiError('Enqueue needs a supplierCatalogProductId or a designId.', 400);
    }
    if (productId) {
      const { data: existing } = await supabaseAdmin()
        .from('design_queue')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('supplier_catalog_product_id', productId)
        .eq('status', 'queued')
        .maybeSingle();
      if (existing) {
        return NextResponse.json(
          { error: { code: 'ALREADY_QUEUED', message: 'This blank is already in the queue.', requestId: crypto.randomUUID() } },
          { status: 409 },
        );
      }
    }
    const { data: maxRow } = await supabaseAdmin()
      .from('design_queue')
      .select('position')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('status', 'queued')
      .order('position', { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = ((maxRow?.position as number | undefined) ?? -1) + 1;
    const { data, error } = await supabaseAdmin()
      .from('design_queue')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        supplier_catalog_product_id: productId,
        design_id: designId,
        position,
        status: 'queued',
      })
      .select('id,supplier_catalog_product_id,design_id,position,status,created_at')
      .single();
    if (error) throw new Error(`design_queue insert: ${error.message}`);
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to enqueue.');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const id = String(body?.id ?? '');
    const status = String(body?.status ?? '');
    if (!id) return apiError('Queue row id is required.', 400);
    if (!['queued', 'active', 'done'].includes(status)) {
      return apiError(`Unknown queue status ${status}.`, 422);
    }
    const { data, error } = await supabaseAdmin()
      .from('design_queue')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .select('id,status')
      .single();
    if (error) throw new Error(`design_queue update: ${error.message}`);
    return NextResponse.json({ item: data });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to update the queue.');
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = new URL(req.url).searchParams.get('id');
    if (!id) return apiError('Queue row id is required (?id=).', 400);
    const { error } = await supabaseAdmin()
      .from('design_queue')
      .delete()
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id);
    if (error) throw new Error(`design_queue delete: ${error.message}`);
    return NextResponse.json({ removed: id });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to remove from the queue.');
  }
}
