import { NextRequest, NextResponse } from 'next/server';
import { adoptValuationReport } from '@/lib/equityStore';

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const state = adoptValuationReport(id, body);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Board adoption failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
