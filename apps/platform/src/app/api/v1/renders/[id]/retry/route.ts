import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/renders/:id/retry — re-queue a FAILED render.
 * Only failed rows can be retried (409 otherwise). Attempts are kept —
 * the claim increments them, and 3 attempts fails the row for good —
 * the error is cleared and the row goes back to queued.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: row, error } = await supabaseAdmin()
      .from('design_renders')
      .select('id,status,attempts')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `No render ${id}.`, requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    if (row.status !== 'failed') {
      return NextResponse.json(
        {
          error: {
            code: 'NOT_FAILED',
            message: `Render ${id} is ${row.status}, not failed — only failed renders can be retried.`,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 409 },
      );
    }
    const { data, error: updErr } = await supabaseAdmin()
      .from('design_renders')
      .update({
        status: 'queued',
        error: null,
        last_error: null,
        claimed_at: null,
        finished_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .select('id,design_id,view_angle,color,kind,status,attempts')
      .single();
    if (updErr) throw new Error(updErr.message);
    return NextResponse.json({ render: data });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to retry render.');
  }
}
