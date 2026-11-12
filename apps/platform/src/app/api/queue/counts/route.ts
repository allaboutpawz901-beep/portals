import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/queue/counts — LIVE badge counts for the sidebar queues.
 *
 * Everything is derived from real rows (no mock numbers):
 *   attention      = conversations awaiting a reply (last message inbound)
 *                  + overdue open tasks + due lead follow-ups
 *                  + unresolved crm_needs_attention flags
 *   customer-queue = open customer conversations (web_form / email / chat)
 *   seller-queue   = pending seller appeals + open seller violations
 *
 * Resilience: each of the 7 queries is checked for .error individually.
 * A transient Supabase failure no longer throws an unhandled 500 (an
 * unhandled Promise.all rejection was exactly the earlier 500) — failed
 * datasets are skipped, logged server-side, and reported in meta.errors.
 * A total failure still returns JSON 200 with degraded:true so the shell
 * badges degrade to 0 instead of crashing.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const tenant = DEFAULT_TENANT_ID;

  const queries = [
    { key: 'conversations', run: () => sb.from('crm_conversations').select('id, status, channel, customer_id').eq('tenant_id', tenant) },
    { key: 'messages', run: () => sb.from('crm_messages').select('id, conversation_id, direction, created_at').eq('tenant_id', tenant).order('created_at', { ascending: true }) },
    { key: 'tasks', run: () => sb.from('crm_tasks').select('id, status, due_at').eq('tenant_id', tenant) },
    { key: 'leads', run: () => sb.from('crm_leads').select('id, status, next_follow_up_at').eq('tenant_id', tenant) },
    { key: 'needs_attention', run: () => sb.from('crm_needs_attention').select('id, status').eq('tenant_id', tenant) },
    { key: 'appeals', run: () => sb.from('seller_appeals').select('id, status').eq('tenant_id', tenant) },
    { key: 'violations', run: () => sb.from('seller_violations').select('id, status').eq('tenant_id', tenant) },
  ];

  const settled = await Promise.allSettled(queries.map(q => q.run()));

  const rows: Record<string, any[]> = {};
  const errors: Record<string, string> = {};
  queries.forEach((q, i) => {
    const s = settled[i];
    if (s.status === 'fulfilled') {
      if (s.value.error) {
        errors[q.key] = s.value.error.message;
        console.error(`[queue/counts] ${q.key} query failed:`, s.value.error.message);
        rows[q.key] = [];
      } else {
        rows[q.key] = s.value.data || [];
      }
    } else {
      // Query REJECTED (network error etc.) — this is what used to blow up
      // the whole route as an unhandled 500.
      errors[q.key] = s.reason?.message || String(s.reason);
      console.error(`[queue/counts] ${q.key} threw:`, s.reason);
      rows[q.key] = [];
    }
  });

  try {
    const now = new Date().toISOString();

    // Last message per conversation (messages ordered ascending — the final
    // entry per conversation_id wins).
    const lastByConv = new Map<string, string>();
    for (const m of rows.messages || []) {
      lastByConv.set(m.conversation_id, m.direction);
    }

    const convs = rows.conversations || [];
    const openConvs = convs.filter(c => c.status === 'open');
    const awaitingReply = openConvs.filter(c => {
      const last = lastByConv.get(c.id);
      // No message yet, or the last one is inbound → needs a human reply
      return !last || last === 'inbound';
    }).length;

    const overdueTasks = (rows.tasks || []).filter(
      t => t.status !== 'done' && t.due_at && t.due_at < now,
    ).length;

    const dueFollowUps = (rows.leads || []).filter(
      l => l.next_follow_up_at && l.next_follow_up_at < now && !['converted', 'lost'].includes(l.status),
    ).length;

    const openFlags = (rows.needs_attention || []).filter(f => f.status !== 'resolved').length;

    const pendingAppeals = (rows.appeals || []).filter(a => a.status === 'pending').length;
    const openViolations = (rows.violations || []).filter(v => v.status === 'open').length;

    const counts = {
      attention: awaitingReply + overdueTasks + dueFollowUps + openFlags,
      'customer-queue': openConvs.length,
      'seller-queue': pendingAppeals + openViolations,
    };

    const degraded = Object.keys(errors).length > 0;
    return NextResponse.json({
      data: counts,
      meta: {
        awaitingReply, overdueTasks, dueFollowUps, openFlags,
        openConvs: openConvs.length, pendingAppeals, openViolations,
        ...(degraded ? { degraded: true, errors } : {}),
      },
    });
  } catch (e: any) {
    // Absolutely nothing should turn badge counts into a 500.
    console.error('[queue/counts] compute failed:', e);
    return NextResponse.json({
      data: { attention: 0, 'customer-queue': 0, 'seller-queue': 0 },
      meta: { degraded: true, errors: { compute: e?.message || String(e) } },
    });
  }
}
