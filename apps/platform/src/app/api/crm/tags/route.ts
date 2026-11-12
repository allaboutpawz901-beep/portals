import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/tags?entity_type=customer — list tags for an entity type. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const entityType = searchParams.get('entity_type');
  let query = supabaseAdmin().from('crm_tags').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name', { ascending: true });
  if (entityType) query = query.eq('entity_type', entityType);
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data });
}

/** POST /api/crm/tags. Required: entity_type, name, slug. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.entity_type || !body.name) return NextResponse.json({ error: { code: 'VALIDATION', message: 'entity_type and name are required', requestId: crypto.randomUUID() } }, { status: 400 });
  const name = String(body.name);
  const slug = String(body.slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    entity_type: String(body.entity_type),
    name,
    slug,
    description: body.description || null,
    is_system: false,
    color: body.color || null,
  };
  const { data, error } = await supabaseAdmin().from('crm_tags').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data }, { status: 201 });
}
