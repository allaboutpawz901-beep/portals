import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

/**
 * GET /api/products/categories
 * The category tree for product forms (grouped by parent for select options).
 */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('categories')
    .select('id,name,slug,parent_id')
    .order('name', { ascending: true })
    .limit(500);
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message } }, { status: 500 });
  }
  return NextResponse.json({ data: data || [] });
}
