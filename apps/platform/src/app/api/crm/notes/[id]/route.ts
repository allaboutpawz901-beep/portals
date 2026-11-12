import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * PATCH /api/crm/notes/[id] — edit a note's body and/or note_type.
 * Body: { body?, note_type? }
 * Tenant-scoped; only the note's own row is touched.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('body' in body && typeof body.body === 'string' && body.body.trim()) updates.body = body.body.trim();
  if ('note_type' in body && typeof body.note_type === 'string' && body.note_type) updates.note_type = body.note_type;
  if ('is_pinned' in body) updates.is_pinned = Boolean(body.is_pinned);

  const { data, error } = await supabaseAdmin()
    .from('crm_notes')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: error?.message || 'Note not found', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }

  return NextResponse.json({ data });
}

/**
 * DELETE /api/crm/notes/[id] — permanently remove a note.
 * Tenant-scoped so a cross-tenant id can't be deleted.
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { error } = await supabaseAdmin()
    .from('crm_notes')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }

  return NextResponse.json({ data: { id, deleted: true } });
}
