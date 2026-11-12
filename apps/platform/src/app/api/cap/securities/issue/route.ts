import { NextRequest, NextResponse } from 'next/server';
import { issueSecurity } from '@/lib/equityStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state = issueSecurity(body);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to issue security.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
