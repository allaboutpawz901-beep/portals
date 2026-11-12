import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * PATCH /api/v1/blanks/[id]/hide  { hidden: boolean }
 *
 * Toggles `supplier_catalog_products.is_hidden` for one row.
 *
 * Hidden = not eligible for search results, not eligible for design.
 * The GET /api/v1/blanks route filters `.eq('is_hidden', false)` by
 * default, so hidden products vanish from the catalog grid immediately.
 * The "Hidden" view under My Products passes `?hidden=true` to list them.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    if (!id) return apiError('Missing blank id.');

    const body = await req.json().catch(() => ({}));
    const hidden = Boolean(body?.hidden);

    const { data, error } = await supabaseAdmin()
      .from('supplier_catalog_products')
      .update({ is_hidden: hidden })
      .eq('id', id)
      .select('id,is_hidden')
      .single();

    if (error) {
      return NextResponse.json(
        { error: `Failed to toggle hidden: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      id: data.id,
      isHidden: data.is_hidden,
      hidden: data.is_hidden,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to toggle hidden.');
  }
}
