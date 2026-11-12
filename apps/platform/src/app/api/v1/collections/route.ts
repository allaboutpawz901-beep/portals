import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/collections — the collections a design can be saved to.
 * Reads the live `collections` table (name + slug); active collections
 * first. Used by the Studio drawer's "Save to Collection" create action.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin()
      .from('collections')
      .select('id,name,slug,is_active')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('is_active', { ascending: false })
      .order('name', { ascending: true });
    if (error) throw new Error(`collections: ${error.message}`);
    return NextResponse.json({
      items: (data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        active: c.is_active,
      })),
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list collections.');
  }
}
