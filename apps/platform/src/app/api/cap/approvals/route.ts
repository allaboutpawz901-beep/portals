import { NextRequest, NextResponse } from 'next/server';
import { createBoardApproval } from '@/lib/equityStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state = createBoardApproval(body);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to record board approval.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
