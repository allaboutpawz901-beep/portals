import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/stores — My Stores (A6). The channels a listing is live on
 * come from the commerce tables: `commerce_order_channels` is the store
 * list; `commerce_channel_products` links published products to channels
 * (written at publish time when the publish request carries `channels`).
 * Each store carries its live product count. Both tables are empty today,
 * so the screen honestly reports "no stores connected yet" until the
 * first channel is connected and the first listing is published to it.
 */
export async function GET() {
  try {
    const [{ data: channels, error }, { data: links }] = await Promise.all([
      supabaseAdmin()
        .from('commerce_order_channels')
        .select('id,code,name,channel_type,active,configuration')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .order('name', { ascending: true }),
      supabaseAdmin()
        .from('commerce_channel_products')
        .select('channel_id,published')
        .eq('tenant_id', DEFAULT_TENANT_ID),
    ]);
    if (error) throw new Error(`commerce_order_channels: ${error.message}`);
    const liveByChannel = new Map<string, number>();
    for (const l of links ?? []) {
      if (l.published) {
        liveByChannel.set(l.channel_id as string, (liveByChannel.get(l.channel_id as string) ?? 0) + 1);
      }
    }
    return NextResponse.json({
      items: (channels ?? []).map((c) => ({
        id: c.id,
        code: c.code,
        name: c.name,
        channelType: c.channel_type,
        active: c.active,
        liveProducts: liveByChannel.get(c.id as string) ?? 0,
        status: c.active ? 'Connected' : 'Paused',
      })),
      nextCursor: null,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list stores.');
  }
}
