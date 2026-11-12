import { NextRequest, NextResponse } from 'next/server';
import { grantEquityAward } from '@/lib/equityStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state = grantEquityAward(body);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to grant equity award.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
