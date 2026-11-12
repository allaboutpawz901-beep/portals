import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { latestMockupProof } from '@/lib/renderWorker';

/**
 * GET /api/v1/support/tickets/:id/proof — the design proof for a ticket.
 * A ticket on a POD order shows the composited mockup inline: the ticket's
 * order → its POD lines → their designs → the latest succeeded mockup
 * render, as a signed URL. No POD order on the ticket → empty proofs,
 * never an invented image.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: ticketId } = await params;
  try {
    const { data: ticket, error } = await supabaseAdmin()
      .from('support_tickets')
      .select('id,subject,order_id,product_id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', ticketId)
      .single();
    if (error || !ticket) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No ticket ${ticketId}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const designIds = new Map<string, { productName: string | null }>();
    const orderId = ticket.order_id as string | null;
    if (orderId) {
      const { data: items } = await supabaseAdmin()
        .from('order_items')
        .select('design_publication_id,product_variant_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('order_id', orderId);
      for (const item of items ?? []) {
        const pubId = item.design_publication_id as string | null;
        if (!pubId) continue;
        const { data: pub } = await supabaseAdmin()
          .from('design_publications')
          .select('design_id,product_variant_id')
          .eq('id', pubId)
          .single();
        if (!pub?.design_id) continue;
        let productName: string | null = null;
        const variantId = (pub.product_variant_id as string | null) ?? (item.product_variant_id as string | null);
        if (variantId) {
          const { data: v } = await supabaseAdmin()
            .from('product_variants')
            .select('product_id')
            .eq('id', variantId)
            .single();
          if (v?.product_id) {
            const { data: p } = await supabaseAdmin()
              .from('products')
              .select('name')
              .eq('id', v.product_id as string)
              .single();
            productName = (p?.name as string | null) ?? null;
          }
        }
        designIds.set(pub.design_id as string, { productName });
      }
    }
    // Fallback: the ticket names a product directly.
    if (designIds.size === 0 && ticket.product_id) {
      const { data: pubs } = await supabaseAdmin()
        .from('design_publications')
        .select('design_id,product_variant_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .limit(100);
      const { data: variants } = await supabaseAdmin()
        .from('product_variants')
        .select('id')
        .eq('product_id', ticket.product_id as string);
      const variantSet = new Set((variants ?? []).map((v) => v.id as string));
      for (const pub of pubs ?? []) {
        if (variantSet.has(pub.product_variant_id as string)) {
          const { data: p } = await supabaseAdmin()
            .from('products')
            .select('name')
            .eq('id', ticket.product_id as string)
            .single();
          designIds.set(pub.design_id as string, { productName: (p?.name as string | null) ?? null });
        }
      }
    }

    const proofs: {
      designId: string;
      productName: string | null;
      view: string;
      color: string;
      storagePath: string;
      url: string | null;
    }[] = [];
    for (const [designId, meta] of designIds) {
      const proof = await latestMockupProof(designId);
      if (!proof) continue;
      proofs.push({
        designId,
        productName: meta.productName,
        view: proof.view,
        color: proof.color,
        storagePath: proof.storagePath,
        url: proof.url,
      });
    }
    return NextResponse.json({
      ticketId,
      subject: ticket.subject,
      orderId,
      status: ticket.status,
      proofs,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load design proof.');
  }
}
