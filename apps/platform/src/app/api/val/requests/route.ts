import { NextRequest, NextResponse } from 'next/server';
import { createValuationRequest } from '@/lib/equityStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = createValuationRequest(body);
    return NextResponse.json(res);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to create 409A valuation request.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
