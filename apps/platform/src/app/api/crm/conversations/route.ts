import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/crm/conversations — the support queue inbox list.
 *
 * Query params:
 *   ?status=open|all|resolved   (open includes 'pending'; resolved includes 'closed')
 *   ?channel=web_form|email|chat
 *   ?assigned=me|unassigned|all (?staff_id= optionally scopes "me")
 *   ?q=  search across subject / last message body / from addresses
 *
 * Three queries total — conversations, their messages (grouped in JS for
 * last_message + counts, so no N+1), and staff names.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get('status');
  const channel = searchParams.get('channel');
  const assigned = searchParams.get('assigned');
  const staffId = searchParams.get('staff_id');
  const q = searchParams.get('q')?.trim().toLowerCase();

  // 1) All conversations for the tenant — meta counts need the full set anyway
  const { data: conversations, error } = await supabaseAdmin()
    .from('crm_conversations')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(500);

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  const rows = conversations || [];
  const ids = rows.map(c => c.id);

  // 2) Messages for ALL listed conversations in ONE query (created_at asc, so
  //    the last write per conversation wins → last_message / last inbound from)
  interface MsgRow {
    conversation_id: string;
    subject: string | null;
    body: string | null;
    from_address: string | null;
    direction: string;
    created_at: string;
  }
  let messages: MsgRow[] = [];
  if (ids.length > 0) {
    const msgRes = await supabaseAdmin()
      .from('crm_messages')
      .select('conversation_id, subject, body, from_address, direction, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: true })
      .limit(2000);
    if (msgRes.error) {
      return NextResponse.json({ error: { code: 'INTERNAL', message: msgRes.error.message, requestId: crypto.randomUUID() } }, { status: 500 });
    }
    messages = (msgRes.data as MsgRow[]) || [];
  }

  const lastByConv = new Map<string, MsgRow>();
  const lastInboundFrom = new Map<string, string | null>();
  const countByConv = new Map<string, number>();
  for (const m of messages) {
    lastByConv.set(m.conversation_id, m);
    countByConv.set(m.conversation_id, (countByConv.get(m.conversation_id) || 0) + 1);
    if (m.direction === 'inbound') lastInboundFrom.set(m.conversation_id, m.from_address);
  }

  // 3) Staff names — one query, joined in JS
  const staffRes = await supabaseAdmin()
    .from('crm_staff')
    .select('id, display_name')
    .eq('tenant_id', DEFAULT_TENANT_ID);
  const staffNames = new Map<string, string>(
    ((staffRes.data as { id: string; display_name: string }[] | null) || []).map(s => [s.id, s.display_name]),
  );

  const items = rows.map(c => {
    const last = lastByConv.get(c.id) || null;
    return {
      ...c,
      last_message: last
        ? { subject: last.subject, body: last.body, from_address: last.from_address, direction: last.direction, created_at: last.created_at }
        : null,
      last_inbound_from: lastInboundFrom.get(c.id) || null,
      message_count: countByConv.get(c.id) || 0,
      assigned_staff_name: c.assigned_staff_id ? staffNames.get(c.assigned_staff_id) || null : null,
    };
  });

  // Tenant-wide meta (unfiltered — tabs/counters stay truthful under any filter)
  const isActive = (c: (typeof rows)[number]) => c.status === 'open' || c.status === 'pending';
  const meta = {
    open: rows.filter(isActive).length,
    unassigned: rows.filter(c => isActive(c) && !c.assigned_staff_id).length,
    resolved: rows.filter(c => c.status === 'resolved' || c.status === 'closed').length,
  };

  // Apply filters
  let filtered = items;
  if (status === 'open') filtered = filtered.filter(c => c.status === 'open' || c.status === 'pending');
  else if (status === 'resolved') filtered = filtered.filter(c => c.status === 'resolved' || c.status === 'closed');

  if (channel && channel !== 'all') filtered = filtered.filter(c => c.channel === channel);

  if (assigned === 'unassigned') {
    filtered = filtered.filter(c => !c.assigned_staff_id);
  } else if (assigned === 'me') {
    // No auth session in this ERP yet: with a staff_id we scope to that person,
    // otherwise "me" falls back to "assigned to someone" (single-operator tenant)
    filtered = staffId ? filtered.filter(c => c.assigned_staff_id === staffId) : filtered.filter(c => !!c.assigned_staff_id);
  }

  if (q) {
    filtered = filtered.filter(c =>
      (c.subject || '').toLowerCase().includes(q) ||
      (c.last_inbound_from || '').toLowerCase().includes(q) ||
      (c.last_message?.subject || '').toLowerCase().includes(q) ||
      (c.last_message?.body || '').toLowerCase().includes(q) ||
      (c.last_message?.from_address || '').toLowerCase().includes(q));
  }

  return NextResponse.json({ data: filtered, meta });
}
