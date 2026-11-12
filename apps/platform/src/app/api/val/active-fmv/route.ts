import { NextResponse } from 'next/server';
import { getEquityApiResponse } from '@/lib/equityStore';

export async function GET() {
  try {
    const state = getEquityApiResponse();
    return NextResponse.json(state.active_fmv);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load active FMV.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
