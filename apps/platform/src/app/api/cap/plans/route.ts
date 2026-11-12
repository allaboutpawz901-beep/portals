import { NextRequest, NextResponse } from 'next/server';
import { createEquityPlan } from '@/lib/equityStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state = createEquityPlan(body);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create equity plan.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
