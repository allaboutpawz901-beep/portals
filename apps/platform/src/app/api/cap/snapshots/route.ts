import { NextRequest, NextResponse } from 'next/server';
import { freezeCapSnapshot, getEquityApiResponse } from '@/lib/equityStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const snapshot = freezeCapSnapshot({
      reason: body.reason || 'board',
      as_of_date: body.as_of_date,
    });
    const state = getEquityApiResponse();
    return NextResponse.json({ snapshot, state });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to freeze snapshot.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
