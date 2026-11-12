import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/ingest/status — read-only ingest status (Lane 4).
 *
 * Per supplier (printful, printify):
 *   - flag: the image-terms flag in platform_feature_flags
 *     ('image_terms_printful' / 'image_terms_printify'). Ingest refuses
 *     unless the flag exists and enabled=true.
 *   - templatesPersisted: product_canvas_templates rows with source=<supplier>,
 *     a stored_base_path and a base_sha256 (our storage, hashed — never a
 *     supplier URL as the live asset).
 *   - stillUrlOnly: harvest rows with no stored copy yet. Printful counts
 *     supplier_mockup_templates rows with stored_image_path null. Printify
 *     has no mockup-template rows; it counts distinct canonical blanks in
 *     supplier_catalog_variants that have no stored canvas row yet.
 * Plus publishedMockups: the contract's 158 published mockups are never
 * persisted by ingest. No table in the live schema holds 158 published
 * mockup rows (measured: 35 published products, 3 published designs,
 * 3 design_renders mockups), so the endpoint reports the contract figure
 * alongside what was actually located — and ingest touches none of them.
 *
 * No writes. PostgREST caps at 1000 rows/request; the Printify distinct
 * scan paginates with .range().
 */

const SUPPLIERS = ['printful', 'printify'] as const;
type Supplier = (typeof SUPPLIERS)[number];

const FLAG_KEY: Record<Supplier, string> = {
  printful: 'image_terms_printful',
  printify: 'image_terms_printify',
};

interface PersistedRow {
  canonicalProductId: string;
  view: string;
  baseSha256: string;
  storedBasePath: string;
  storedShadingPath: string | null;
  storedMaskPath: string | null;
  pxPerInch: number | null;
  verified: boolean;
}

async function flagState(supplier: Supplier) {
  const { data, error } = await supabaseAdmin()
    .from('platform_feature_flags')
    .select('flag_key,enabled,description')
    .eq('flag_key', FLAG_KEY[supplier])
    .maybeSingle();
  if (error) throw new Error(`platform_feature_flags: ${error.message}`);
  return {
    key: FLAG_KEY[supplier],
    state: !data ? ('missing' as const) : data.enabled === true ? ('allowed' as const) : ('disabled' as const),
    enabled: data?.enabled ?? null,
  };
}

async function persisted(supplier: Supplier): Promise<{ count: number; rows: PersistedRow[] }> {
  const { count, error: countErr } = await supabaseAdmin()
    .from('product_canvas_templates')
    .select('id', { count: 'exact', head: true })
    .eq('source', supplier)
    .eq('is_active', true)
    .not('stored_base_path', 'is', null)
    .not('base_sha256', 'is', null);
  if (countErr) throw new Error(`product_canvas_templates count: ${countErr.message}`);
  const { data, error } = await supabaseAdmin()
    .from('product_canvas_templates')
    .select('canonical_product_id,view_angle,base_sha256,stored_base_path,stored_shading_path,stored_mask_path,px_per_inch,verified')
    .eq('source', supplier)
    .eq('is_active', true)
    .not('stored_base_path', 'is', null)
    .not('base_sha256', 'is', null)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw new Error(`product_canvas_templates: ${error.message}`);
  return {
    count: count ?? 0,
    rows: (data ?? []).map((r) => ({
      canonicalProductId: r.canonical_product_id as string,
      view: r.view_angle as string,
      baseSha256: r.base_sha256 as string,
      storedBasePath: r.stored_base_path as string,
      storedShadingPath: r.stored_shading_path as string | null,
      storedMaskPath: r.stored_mask_path as string | null,
      pxPerInch: r.px_per_inch as number | null,
      verified: r.verified as boolean,
    })),
  };
}

async function stillUrlOnlyPrintful(): Promise<number> {
  const { count, error } = await supabaseAdmin()
    .from('supplier_mockup_templates')
    .select('id', { count: 'exact', head: true })
    .eq('supplier_name', 'printful')
    .is('stored_image_path', null);
  if (error) throw new Error(`supplier_mockup_templates count: ${error.message}`);
  return count ?? 0;
}

async function stillUrlOnlyPrintify(): Promise<number> {
  // Distinct canonical blanks with Printify variants, minus blanks that
  // already have a stored Printify canvas row. Paginated scan (.range).
  const { data: supplier } = await supabaseAdmin()
    .from('suppliers')
    .select('id')
    .ilike('name', 'printify')
    .maybeSingle();
  if (!supplier) return 0;
  const blankIds = new Set<string>();
  let from = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin()
      .from('supplier_catalog_variants')
      .select('canonical_product_id')
      .eq('supplier_id', supplier.id)
      .not('print_specs', 'is', null)
      .not('canonical_product_id', 'is', null)
      .range(from, from + 999);
    if (error) throw new Error(`supplier_catalog_variants scan: ${error.message}`);
    for (const r of data ?? []) blankIds.add(r.canonical_product_id as string);
    if (!data || data.length < 1000) break;
    from += 1000;
  }
  const storedBlankIds = new Set<string>();
  let cFrom = 0;
  for (;;) {
    const { data, error } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select('canonical_product_id')
      .eq('source', 'printify')
      .eq('is_active', true)
      .not('stored_base_path', 'is', null)
      .range(cFrom, cFrom + 999);
    if (error) throw new Error(`product_canvas_templates scan: ${error.message}`);
    for (const r of data ?? []) storedBlankIds.add(r.canonical_product_id as string);
    if (!data || data.length < 1000) break;
    cFrom += 1000;
  }
  let pending = 0;
  for (const id of blankIds) if (!storedBlankIds.has(id)) pending++;
  return pending;
}

export async function GET() {
  try {
    const suppliers: Record<string, unknown> = {};
    for (const supplier of SUPPLIERS) {
      const [flag, templates] = await Promise.all([
        flagState(supplier),
        persisted(supplier),
      ]);
      const urlOnly =
        supplier === 'printful' ? await stillUrlOnlyPrintful() : await stillUrlOnlyPrintify();
      suppliers[supplier] = {
        flag,
        templatesPersisted: templates,
        stillUrlOnly: {
          count: urlOnly,
          source:
            supplier === 'printful'
              ? 'supplier_mockup_templates rows with stored_image_path null'
              : 'distinct canonical blanks in supplier_catalog_variants with no stored canvas row',
        },
      };
    }

    // Published mockups: ingest never writes them. Report the contract
    // figure next to what the live schema actually holds.
    const { count: publishedProducts } = await supabaseAdmin()
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published');
    const { count: publishedDesigns } = await supabaseAdmin()
      .from('designs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'published');
    const { count: unattributedCanvasRows } = await supabaseAdmin()
      .from('product_canvas_templates')
      .select('id', { count: 'exact', head: true })
      .is('source', null);

    return NextResponse.json({
      tenantId: DEFAULT_TENANT_ID,
      suppliers,
      publishedMockups: {
        contractCount: 158,
        locatedInLiveSchema: 0,
        publishedProducts: publishedProducts ?? 0,
        publishedDesigns: publishedDesigns ?? 0,
        untouched: true,
        note: 'No table in the live schema holds 158 published mockup rows; the 158 figure comes from the render contract. Ingest reads only supplier harvest tables and writes only product_canvas_templates, so published mockups are untouched by construction.',
      },
      unattributedCanvasRows: unattributedCanvasRows ?? 0,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to read ingest status.');
  }
}
