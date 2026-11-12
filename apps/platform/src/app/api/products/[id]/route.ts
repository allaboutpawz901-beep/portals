import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/products/[id]
 * The single read behind the ProductProfile page — the product row plus every
 * tab's data in ONE response (mirrors /api/parties/[id] for parties):
 *
 *   product    — the canonical row + category join
 *   variants   — product_variants for this product
 *   orders     — orders containing this product (via order_items → variant),
 *                with per-order quantity/line totals for THIS product
 *   shipping   — methods observed on those orders + the supplier default
 *                rate card (shipping_profiles is_default=true)
 *   pricing    — variant price matrix + associated design retail prices
 *   designs    — designs published onto this product's variants
 *                (design_publications → designs) with publication counts
 *   stats      — variant counts, price range, units sold, revenue
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: p, error } = await sb
    .from('products')
    .select('*, categories(id,name,slug)')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (error || !p) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: error?.message || 'Product not found' } }, { status: 404 });
  }

  // Variants for this product
  const { data: variants } = await sb
    .from('product_variants')
    .select('*')
    .eq('product_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true });
  const variantRows = variants || [];
  const variantIds = variantRows.map((v: any) => v.id);

  // Publications (designs on this product's variants) + the designs themselves
  let publications: any[] = [];
  let designsById = new Map<string, any>();
  if (variantIds.length > 0) {
    const { data: pubs } = await sb
      .from('design_publications')
      .select('id,design_id,product_variant_id,status,mockup_url,published_at,created_at')
      .in('product_variant_id', variantIds)
      .order('published_at', { ascending: false, nullsFirst: false })
      .limit(500);
    publications = pubs || [];
    const designIds = [...new Set(publications.map(x => x.design_id))];
    if (designIds.length > 0) {
      const { data: des } = await sb
        .from('designs')
        .select('id,name,status,retail_price,product_type,garment_color,updated_at')
        .in('id', designIds);
      for (const d of (des || [])) designsById.set(d.id, d);
    }
  }

  // Orders containing this product (via order_items on this product's variants)
  let orderRows: any[] = [];
  if (variantIds.length > 0) {
    const { data: oiRows } = await sb
      .from('order_items')
      .select('id,order_id,product_variant_id,quantity,unit_price')
      .in('product_variant_id', variantIds)
      .limit(1000);
    const items = (oiRows || []) as any[];
    if (items.length > 0) {
      const orderIds = [...new Set(items.map(i => i.order_id))];
      const { data: ords } = await sb
        .from('orders')
        .select('id,status,total,shipping_address,shipping_method,shipping_cost,created_at')
        .in('id', orderIds)
        .order('created_at', { ascending: false });
      const ordersById = new Map((ords || []).map((o: any) => [o.id, o]));
      // Roll the product's items into per-order lines
      const byOrder = new Map<string, { qty: number; line_total: number }>();
      for (const it of items) {
        const b = byOrder.get(it.order_id) || { qty: 0, line_total: 0 };
        b.qty += Number(it.quantity) || 0;
        b.line_total += (Number(it.quantity) || 0) * (Number(it.unit_price) || 0);
        byOrder.set(it.order_id, b);
      }
      orderRows = [...byOrder.entries()].map(([orderId, b]) => {
        const o = ordersById.get(orderId) || {} as any;
        const addr = o.shipping_address || {};
        return {
          id: orderId,
          order_number: addr.order_number || `UM-${orderId.slice(0, 8).toUpperCase()}`,
          placed_at: o.created_at,
          customer_name: addr.name || 'Guest',
          customer_email: addr.email || null,
          destination: [addr.city, addr.state].filter(Boolean).join(', ') || addr.country || '—',
          status: o.status,
          shipping_method: o.shipping_method,
          shipping_cost: o.shipping_cost,
          order_total: Number(o.total) || 0,
          qty: b.qty,
          line_total: +b.line_total.toFixed(2),
        };
      }).sort((a, b) => new Date(b.placed_at || 0).getTime() - new Date(a.placed_at || 0).getTime());
    }
  }

  // Shipping — methods observed on this product's orders (real usage)
  const observed = new Map<string, { method: string; orders: number; total_cost: number; last_used: string | null }>();
  for (const o of orderRows) {
    if (!o.shipping_method) continue;
    const m = observed.get(o.shipping_method) || { method: o.shipping_method, orders: 0, total_cost: 0, last_used: null };
    m.orders++;
    m.total_cost += Number(o.shipping_cost) || 0;
    if (!m.last_used || (o.placed_at && o.placed_at > m.last_used)) m.last_used = o.placed_at;
    observed.set(o.shipping_method, m);
  }
  // Supplier default rate card (platform shipping profiles, is_default=true)
  const { data: profiles } = await sb
    .from('shipping_profiles')
    .select('supplier_id,profile_name,method_name,origin_country,first_item_cost,additional_item_cost,min_days,max_days')
    .eq('is_default', true)
    .limit(50);
  let supplierRates: any[] = [];
  if ((profiles || []).length > 0) {
    const supplierIds = [...new Set((profiles || []).map((x: any) => x.supplier_id))];
    const { data: sups } = await sb.from('suppliers').select('id,name,kind').in('id', supplierIds);
    const supName = new Map((sups || []).map((s: any) => [s.id, s.name]));
    supplierRates = (profiles || []).map((x: any) => ({
      supplier_name: supName.get(x.supplier_id) || 'Supplier',
      profile_name: x.profile_name,
      method_name: x.method_name,
      origin_country: x.origin_country,
      first_item_cost: x.first_item_cost,
      additional_item_cost: x.additional_item_cost,
      min_days: x.min_days,
      max_days: x.max_days,
    }));
  }

  // Designs rollup — publication count per design + sample mockup
  const designAgg = new Map<string, { publications: number; sample_mockup: string | null; latest_published_at: string | null }>();
  for (const pub of publications) {
    const d = designAgg.get(pub.design_id) || { publications: 0, sample_mockup: null, latest_published_at: null };
    d.publications++;
    if (!d.sample_mockup && pub.mockup_url) d.sample_mockup = pub.mockup_url;
    if (pub.published_at && (!d.latest_published_at || pub.published_at > d.latest_published_at)) {
      d.latest_published_at = pub.published_at;
    }
    designAgg.set(pub.design_id, d);
  }
  const designs = [...designAgg.entries()].map(([designId, a]) => {
    const d = designsById.get(designId) || {} as any;
    return {
      id: designId,
      name: d.name || 'Untitled design',
      status: d.status || 'draft',
      retail_price: d.retail_price != null ? Number(d.retail_price) : null,
      product_type: d.product_type,
      garment_color: d.garment_color,
      publications: a.publications,
      sample_mockup: a.sample_mockup,
      latest_published_at: a.latest_published_at,
    };
  }).sort((a, b) => b.publications - a.publications);

  // Stats
  const prices = variantRows.map((v: any) => Number(v.price)).filter(n => !Number.isNaN(n));
  const units_sold = orderRows.reduce((s, o) => s + o.qty, 0);
  const revenue = +orderRows.reduce((s, o) => s + o.line_total, 0).toFixed(2);

  return NextResponse.json({ data: {
    product: {
      id: p.id,
      name: p.name,
      slug: p.slug,
      description: p.description,
      short_description: p.short_description,
      details: p.details,
      specifications: p.specifications,
      directions: p.directions,
      warnings: p.warnings,
      status: p.status,
      category: p.categories ? { id: p.categories.id, name: p.categories.name, slug: p.categories.slug } : null,
      brand: p.brand,
      tags: p.tags || [],
      is_featured: p.is_featured,
      is_new: p.is_new,
      is_best_seller: p.is_best_seller,
      is_house_favorite: p.is_house_favorite,
      fulfillment_type: p.fulfillment_type,
      owner_type: p.owner_type,
      supplier_id: p.supplier_id,
      preferred_supplier_id: p.preferred_supplier_id,
      created_at: p.created_at,
      updated_at: p.updated_at,
      published_at: p.published_at,
    },
    variants: variantRows.map((v: any) => ({
      id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      price: Number(v.price),
      compare_at_price: v.compare_at_price != null ? Number(v.compare_at_price) : null,
      is_active: v.is_active,
      status: v.status,
      in_stock: v.in_stock,
      stock_quantity: v.stock_quantity,
      reorder_level: v.reorder_level,
      weight_lb: v.weight_lb,
      updated_at: v.updated_at,
    })),
    orders: orderRows,
    shipping: {
      observed: [...observed.values()].map(m => ({
        method: m.method,
        orders: m.orders,
        avg_cost: +(m.total_cost / Math.max(1, m.orders)).toFixed(2),
        last_used: m.last_used,
      })),
      supplier_rates: supplierRates,
    },
    pricing: {
      variant_prices: variantRows.map((v: any) => ({
        variant_id: v.id,
        sku: v.sku,
        size: v.size,
        color: v.color,
        price: Number(v.price),
        compare_at_price: v.compare_at_price != null ? Number(v.compare_at_price) : null,
      })),
      design_prices: designs.filter(d => d.retail_price != null).map(d => ({
        design_id: d.id,
        name: d.name,
        retail_price: d.retail_price,
      })),
    },
    designs,
    stats: {
      variant_count: variantRows.length,
      active_variant_count: variantRows.filter((v: any) => v.is_active && v.status === 'active').length,
      price_min: prices.length ? Math.min(...prices) : null,
      price_max: prices.length ? Math.max(...prices) : null,
      units_sold: units_sold,
      order_count: orderRows.length,
      revenue: revenue,
      design_count: designs.length,
    },
  } });
}

/**
 * PATCH /api/products/[id] — edit the product (from the profile's Edit drawer).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const sb = supabaseAdmin();

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (body.name !== undefined) updates.name = String(body.name).trim();
  if (body.description !== undefined) updates.description = body.description;
  if (body.short_description !== undefined) updates.short_description = body.short_description;
  if (body.details !== undefined) updates.details = body.details;
  if (body.specifications !== undefined) updates.specifications = body.specifications;
  if (body.directions !== undefined) updates.directions = body.directions;
  if (body.warnings !== undefined) updates.warnings = body.warnings;
  if (body.category_id !== undefined) updates.category_id = body.category_id || null;
  if (body.brand !== undefined) updates.brand = body.brand;
  if (body.tags !== undefined) updates.tags = Array.isArray(body.tags) && body.tags.length > 0 ? body.tags : null;
  if (body.is_featured !== undefined) updates.is_featured = !!body.is_featured;
  if (body.is_new !== undefined) updates.is_new = !!body.is_new;
  if (body.is_best_seller !== undefined) updates.is_best_seller = !!body.is_best_seller;
  if (body.is_house_favorite !== undefined) updates.is_house_favorite = !!body.is_house_favorite;
  if (body.fulfillment_type !== undefined) updates.fulfillment_type = body.fulfillment_type;
  if (body.status !== undefined) {
    const allowed = ['draft', 'published', 'archived'];
    if (!allowed.includes(body.status)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: `status must be one of ${allowed.join(', ')}` } }, { status: 400 });
    }
    updates.status = body.status;
    updates.published_at = body.status === 'published' ? new Date().toISOString() : null;
  }

  const { data, error } = await sb
    .from('products')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();
  if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
  return NextResponse.json({ data });
}

/**
 * DELETE /api/products/[id] — archive (status='archived'). The row is kept:
 * orders/designs reference it.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error } = await supabaseAdmin()
    .from('products')
    .update({ status: 'archived', published_at: null, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message } }, { status: 500 });
  return NextResponse.json({ data: { id, archived: true } });
}
