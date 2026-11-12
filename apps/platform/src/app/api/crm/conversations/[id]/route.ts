import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/conversations/[id] — one conversation + its full thread.
 * Staff list is NOT included (client fetches /api/crm/staff separately).
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: conversation, error } = await supabaseAdmin()
    .from('crm_conversations')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();

  if (error || !conversation) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }

  const { data: messages, error: msgError } = await supabaseAdmin()
    .from('crm_messages')
    .select('*')
    .eq('conversation_id', id)
    .order('created_at', { ascending: true })
    .limit(500);

  if (msgError) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: msgError.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  return NextResponse.json({ data: { conversation, messages: messages || [] } });
}

/**
 * PATCH /api/crm/conversations/[id] — assign / resolve / reopen / bump.
 * Body: { assigned_staff_id?, status?, resolved_at?, last_message_at? }
 *   - status='resolved' → resolved_at = now (unless provided)
 *   - status='open' (reopen) → resolved_at = null
 *   - assigned_staff_id may be explicitly null (unassign)
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if ('assigned_staff_id' in body) updates.assigned_staff_id = body.assigned_staff_id ?? null;
  if ('last_message_at' in body && body.last_message_at) updates.last_message_at = body.last_message_at;

  if (typeof body.status === 'string' && body.status) {
    updates.status = body.status;
    if (body.status === 'resolved') {
      updates.resolved_at = body.resolved_at || new Date().toISOString();
    } else if (body.status === 'open') {
      updates.resolved_at = null; // reopening clears the resolution timestamp
    } else if ('resolved_at' in body) {
      updates.resolved_at = body.resolved_at ?? null;
    }
  } else if ('resolved_at' in body) {
    updates.resolved_at = body.resolved_at ?? null;
  }

  const { data, error } = await supabaseAdmin()
    .from('crm_conversations')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();

  if (error || !data) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Conversation not found', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  return NextResponse.json({ data });
}
