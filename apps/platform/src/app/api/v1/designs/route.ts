import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/designs — the user's design drafts (tenant-scoped).
 * POST /api/v1/designs — Start designing: creates the draft design row.
 * Body: { name, blankId (canonical_product_id), supplierCatalogProductId,
 *   garmentColor, productType, categoryId?, collectionId?, productTitle?,
 *   description?, retailPrice? }
 */
/**
 * GET /api/v1/designs — the user's design drafts (tenant-scoped).
 * POST /api/v1/designs — Start designing: creates the draft design row.
 * Body: { name, blankId (canonical_product_id), supplierCatalogProductId,
 *   garmentColor, productType, categoryId?, collectionId?, productTitle?,
 *   description?, retailPrice? }
 *
 * List filters: ?status= (draft|approved|published) — 'published' means
 * the design itself is marked published OR it has a published publication
 * (the publish flow writes design_publications, not designs.status, so a
 * plain status filter would miss designs with live listings).
 * ?collectionId= filters to one collection. Each item carries its
 * collection_id and its publications [{ id, status, mockup_url,
 * product_variant_id }] so Collection + Published render from this call.
 */
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const status = params.get('status');
    const template = params.get('template');
    const q = params.get('q');
    const collectionId = params.get('collectionId');
    const blankId = params.get('blankId');
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
    let query = supabaseAdmin()
      .from('designs')
      .select('id,name,status,supplier_catalog_product_id,garment_color,product_type,retail_price,is_template,collection_id,created_at,updated_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('updated_at', { ascending: false })
      .limit(limit);
    if (status && status !== 'published') query = query.eq('status', status);
    if (template === 'true') query = query.eq('is_template', true);
    if (q) query = query.ilike('name', `%${q}%`);
    if (collectionId) query = query.eq('collection_id', collectionId);
    // Associated designs for one blank: designs link to blanks through
    // supplier_catalog_product_id (no canonical column on designs).
    if (blankId) query = query.eq('supplier_catalog_product_id', blankId);
    if (status === 'published') {
      const { data: pubs } = await supabaseAdmin()
        .from('design_publications')
        .select('design_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('status', 'published');
      const publishedIds = [...new Set((pubs ?? []).map((p) => p.design_id as string))];
      if (publishedIds.length > 0) {
        query = query.or(`status.eq.published,id.in.(${publishedIds.join(',')})`);
      } else {
        query = query.eq('status', 'published');
      }
    }
    const { data, error } = await query;
    if (error) throw new Error(`designs: ${error.message}`);
    const items = data ?? [];
    // Publications per design (mockup_url + status for the list rows).
    const pubsByDesign = new Map<string, { id: string; status: string; mockup_url: string | null; product_variant_id: string | null }[]>();
    if (items.length > 0) {
      const { data: pubs } = await supabaseAdmin()
        .from('design_publications')
        .select('id,design_id,status,mockup_url,product_variant_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('design_id', items.map((d) => d.id as string));
      for (const p of pubs ?? []) {
        const list = pubsByDesign.get(p.design_id as string) ?? [];
        list.push({
          id: p.id as string,
          status: p.status as string,
          mockup_url: p.mockup_url as string | null,
          product_variant_id: p.product_variant_id as string | null,
        });
        pubsByDesign.set(p.design_id as string, list);
      }
    }
    return NextResponse.json({
      items: items.map((d) => ({
        ...d,
        publications: pubsByDesign.get(d.id as string) ?? [],
      })),
      nextCursor: null,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list designs.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? '').trim();
    if (!name) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'name is required.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const insert: Record<string, unknown> = {
      tenant_id: DEFAULT_TENANT_ID,
      name,
      status: 'draft',
      source: 'konva',
      canvas_state: {},
      supplier_catalog_product_id: body.supplierCatalogProductId ?? null,
      garment_color: body.garmentColor ?? null,
      product_type: body.productType ?? name,
      product_title: body.productTitle ?? name,
      description: body.description ?? null,
      retail_price: body.retailPrice ?? null,
      category_id: body.categoryId ?? null,
      collection_id: body.collectionId ?? null,
    };
    const { data, error } = await supabaseAdmin()
      .from('designs')
      .insert(insert)
      .select('id,name,status,supplier_catalog_product_id')
      .single();
    if (error) throw new Error(`designs insert: ${error.message}`);
    return NextResponse.json(
      {
        id: data.id,
        projectId: data.id,
        name: data.name,
        blankId: body.blankId ?? null,
        status: data.status,
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to create design.');
  }
}
