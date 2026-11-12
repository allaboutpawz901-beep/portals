import { NextRequest, NextResponse } from 'next/server';
import { getEquityApiResponse } from '@/lib/equityStore';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const asOfDate = sp.get('as_of') || undefined;
    const snapshotId = sp.get('snapshot_id') || undefined;
    const denominatorMethod =
      sp.get('denominator') === 'allocated_only'
        ? 'allocated_only'
        : 'allocated_plus_pool';

    const state = getEquityApiResponse({
      asOfDate,
      snapshotId,
      denominatorMethod,
    });
    return NextResponse.json(state.derived_cap_table);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to derive cap table.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
