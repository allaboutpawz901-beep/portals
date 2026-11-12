import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/crm/messages — send a human reply on a conversation.
 * Body: { conversation_id, body, subject?, authored_by_staff_id?, channel? }
 * Inserts direction='outbound', status='sent', sent_at=now,
 * to_address = the conversation customer's email (when known),
 * from_address = the authoring staff member's email (when known),
 * then bumps the conversation's last_message_at / updated_at.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const conversationId = typeof body.conversation_id === 'string' ? body.conversation_id : null;
  const text = typeof body.body === 'string' ? body.body.trim() : '';
  if (!conversationId || !text) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'conversation_id and body are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const { data: conversation, error: convError } = await supabaseAdmin()
    .from('crm_conversations')
    .select('id, customer_id, channel, subject')
    .eq('id', conversationId)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();

  if (convError || !conversation) {
    return NextResponse.json({ error: { code: 'NOT_FOUND', message: 'Conversation not found', requestId: crypto.randomUUID() } }, { status: 404 });
  }

  // to_address: the customer's email, when the conversation is linked to one
  let toAddress: string | null = null;
  if (conversation.customer_id) {
    const { data: customer } = await supabaseAdmin()
      .from('crm_customers')
      .select('email')
      .eq('id', conversation.customer_id)
      .maybeSingle();
    toAddress = (customer as { email?: string } | null)?.email || null;
  }

  // from_address: the replying staff member's email, when provided
  let fromAddress: string | null = null;
  const staffId = typeof body.authored_by_staff_id === 'string' ? body.authored_by_staff_id : null;
  if (staffId) {
    const { data: staff } = await supabaseAdmin()
      .from('crm_staff')
      .select('email')
      .eq('id', staffId)
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .maybeSingle();
    fromAddress = (staff as { email?: string } | null)?.email || null;
  }

  const now = new Date().toISOString();
  const subject =
    (typeof body.subject === 'string' && body.subject.trim()) ||
    (conversation.subject ? `Re: ${conversation.subject}` : null);

  const { data: message, error } = await supabaseAdmin()
    .from('crm_messages')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      conversation_id: conversation.id,
      customer_id: conversation.customer_id,
      channel: (typeof body.channel === 'string' && body.channel) || conversation.channel,
      direction: 'outbound',
      status: 'sent',
      from_address: fromAddress,
      to_address: toAddress,
      subject,
      body: text,
      body_text: text,
      authored_by_staff_id: staffId,
      is_auto_reply: false,
      sent_at: now,
      // NOT NULL columns with no DB default — mirror the inbound seed shape
      metadata: {},
      email_references: [],
      cc_addresses: [],
      bcc_addresses: [],
      quoted_content_stripped: false,
      is_system_generated: false,
    })
    .select('*')
    .single();

  if (error || !message) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error?.message || 'Message insert failed', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // Bump the conversation so queues re-sort on last activity
  const { error: bumpError } = await supabaseAdmin()
    .from('crm_conversations')
    .update({ last_message_at: now, updated_at: now })
    .eq('id', conversation.id);

  if (bumpError) {
    // Message landed; the bump is best-effort — report but don't fail the send
    return NextResponse.json({ data: message, warnings: [bumpError.message] }, { status: 201 });
  }

  return NextResponse.json({ data: message }, { status: 201 });
}

/**
 * DELETE /api/crm/messages?id=<id> (or body { id }) — remove a message.
 * Used for test cleanup and moderation; safe no-op shape { data: { id, deleted } }.
 */
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  let id = searchParams.get('id');

  if (!id) {
    try {
      const body = await req.json();
      if (typeof body?.id === 'string') id = body.id;
    } catch {
      /* no body — fall through to the validation error */
    }
  }

  if (!id) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'id is required (query ?id= or body { id })', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const { error } = await supabaseAdmin()
    .from('crm_messages')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  return NextResponse.json({ data: { id, deleted: true } });
}
