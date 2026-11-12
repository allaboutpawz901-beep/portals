import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/products?q=&status=
 * The global Catalog products list. Real rows from the `products` table with
 * variant aggregates (count, price range) and order rollups (units, revenue)
 * computed from product_variants + order_items. This is the list the Catalog
 * domain's Products screen renders; every row opens the ProductProfile page.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get('q') || '').trim().toLowerCase();
  const status = searchParams.get('status') || 'all';

  const sb = supabaseAdmin();

  // Small bounded tables (36 products / 169 variants / 32 order items) —
  // fetch the slices and aggregate in-route rather than 3 queries per row.
  const [productsRes, variantsRes, orderItemsRes] = await Promise.all([
    sb.from('products')
      .select('id,name,slug,description,short_description,status,category_id,brand,tags,is_featured,is_new,is_best_seller,is_house_favorite,fulfillment_type,created_at,updated_at,published_at,categories(id,name,slug)')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('updated_at', { ascending: false })
      .limit(500),
    sb.from('product_variants')
      .select('id,product_id,sku,price,compare_at_price,is_active,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(2000),
    sb.from('order_items')
      .select('id,order_id,product_variant_id,quantity,unit_price')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .limit(2000),
  ]);

  if (productsRes.error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: productsRes.error.message } }, { status: 500 });
  }

  // variant → product lookup + per-product aggregates
  const variantProduct = new Map<string, string>();
  const agg = new Map<string, { variant_count: number; active_variant_count: number; price_min: number | null; price_max: number | null }>();
  for (const v of (variantsRes.data || [])) {
    variantProduct.set(v.id, v.product_id);
    const a = agg.get(v.product_id) || { variant_count: 0, active_variant_count: 0, price_min: null, price_max: null };
    a.variant_count++;
    if (v.is_active && v.status === 'active') a.active_variant_count++;
    const p = Number(v.price);
    if (!Number.isNaN(p)) {
      a.price_min = a.price_min == null ? p : Math.min(a.price_min, p);
      a.price_max = a.price_max == null ? p : Math.max(a.price_max, p);
    }
    agg.set(v.product_id, a);
  }

  // order rollups per product (via variant → order item)
  const sold = new Map<string, { units_sold: number; order_count: number; revenue: number; order_ids: Set<string> }>();
  for (const oi of (orderItemsRes.data || [])) {
    const pid = variantProduct.get(oi.product_variant_id);
    if (!pid) continue;
    const s = sold.get(pid) || { units_sold: 0, order_count: 0, revenue: 0, order_ids: new Set<string>() };
    s.units_sold += Number(oi.quantity) || 0;
    s.revenue += (Number(oi.quantity) || 0) * (Number(oi.unit_price) || 0);
    s.order_ids.add(oi.order_id);
    sold.set(pid, s);
  }

  let rows = (productsRes.data || []).map((p: any) => {
    const a = agg.get(p.id) || { variant_count: 0, active_variant_count: 0, price_min: null, price_max: null };
    const s = sold.get(p.id);
    return {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      short_description: p.short_description,
      status: p.status,
      category: p.categories ? { id: p.categories.id, name: p.categories.name, slug: p.categories.slug } : null,
      brand: p.brand,
      tags: p.tags || [],
      is_featured: p.is_featured,
      is_new: p.is_new,
      is_best_seller: p.is_best_seller,
      is_house_favorite: p.is_house_favorite,
      fulfillment_type: p.fulfillment_type,
      variant_count: a.variant_count,
      active_variant_count: a.active_variant_count,
      price_min: a.price_min,
      price_max: a.price_max,
      units_sold: s?.units_sold || 0,
      order_count: s?.order_ids.size || 0,
      revenue: +(s?.revenue || 0).toFixed(2),
      created_at: p.created_at,
      updated_at: p.updated_at,
      published_at: p.published_at,
    };
  });

  // Search filter — name, brand, slug, tags, description
  if (q) {
    rows = rows.filter((r: any) =>
      [r.name, r.brand, r.slug, r.description, (r.tags || []).join(' ')]
        .filter(Boolean).join(' ').toLowerCase().includes(q)
    );
  }
  if (status && status !== 'all') {
    rows = rows.filter((r: any) => r.status === status);
  }

  return NextResponse.json({ data: rows });
}

/**
 * POST /api/products — create a catalog product.
 * Mirrors /api/parties POST: REQUIRED columns without defaults are resolved
 * here (slug dedup from name, tenant scoping).
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const sb = supabaseAdmin();

  const name = String(body.name || '').trim();
  if (!name) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required' } }, { status: 400 });
  }

  // slug: from name, deduped with a numeric suffix
  const baseSlug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'product';
  const { data: existingSlugs } = await sb.from('products')
    .select('slug').eq('tenant_id', DEFAULT_TENANT_ID).like('slug', `${baseSlug}%`);
  const taken = new Set((existingSlugs || []).map((r: any) => r.slug));
  let slug = baseSlug;
  let n = 2;
  while (taken.has(slug)) slug = `${baseSlug}-${n++}`;

  // category_id must exist when provided
  if (body.category_id) {
    const { data: cat } = await sb.from('categories').select('id').eq('id', body.category_id).maybeSingle();
    if (!cat) return NextResponse.json({ error: { code: 'VALIDATION', message: 'Unknown category_id' } }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    // products.id has no DB default — generate here.
    id: crypto.randomUUID(),
    tenant_id: DEFAULT_TENANT_ID,
    name,
    slug,
    description: body.description ?? null,
    short_description: body.short_description ?? null,
    status: body.status || 'draft',
    category_id: body.category_id || null,
    brand: body.brand ?? null,
    tags: Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : null,
    is_featured: !!body.is_featured,
    is_new: !!body.is_new,
    is_best_seller: !!body.is_best_seller,
    is_house_favorite: !!body.is_house_favorite,
    fulfillment_type: body.fulfillment_type || 'stocked',
  };
  if (body.status === 'published') insert.published_at = new Date().toISOString();

  const { data, error } = await sb.from('products').insert(insert).select('*').single();
  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
  }
  return NextResponse.json({ data });
}
