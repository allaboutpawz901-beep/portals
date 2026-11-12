import { NextRequest, NextResponse } from 'next/server';
import { updateCompanyProfile } from '@/lib/equityStore';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const state = updateCompanyProfile(body);
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update company profile.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
