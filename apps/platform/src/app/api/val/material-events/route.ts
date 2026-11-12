import { NextRequest, NextResponse } from 'next/server';
import { logMaterialEvent } from '@/lib/equityStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state = logMaterialEvent(body);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to log material event.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
