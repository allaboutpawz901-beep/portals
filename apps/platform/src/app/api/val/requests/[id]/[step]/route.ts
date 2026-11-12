import { NextRequest, NextResponse } from 'next/server';
import {
  generateValuationReport,
  runValuationAllocation,
  runValuationDlom,
  saveValuationApproaches,
  saveValuationComps,
  saveValuationInputs,
} from '@/lib/equityStore';

export async function PUT(
  req: NextRequest,
  context: { params: Promise<{ id: string; step: string }> }
) {
  try {
    const { id, step } = await context.params;
    const body = await req.json();

    if (step === 'inputs') {
      const state = saveValuationInputs(id, body);
      return NextResponse.json(state);
    }
    if (step === 'comps') {
      const state = saveValuationComps(id, body.comps || []);
      return NextResponse.json(state);
    }
    if (step === 'approaches') {
      const state = saveValuationApproaches(
        id,
        body.approaches || [],
        body.time_to_liquidity_yrs
      );
      return NextResponse.json(state);
    }

    return NextResponse.json({ error: `Unsupported PUT step: ${step}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Valuation step update failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string; step: string }> }
) {
  try {
    const { id, step } = await context.params;
    const body = await req.json().catch(() => ({}));

    if (step === 'run-allocation') {
      const state = runValuationAllocation(id, body);
      return NextResponse.json(state);
    }
    if (step === 'run-dlom') {
      const state = runValuationDlom(id, body);
      return NextResponse.json(state);
    }
    if (step === 'generate-report') {
      const state = generateValuationReport(id);
      return NextResponse.json(state);
    }

    return NextResponse.json({ error: `Unsupported POST step: ${step}` }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Valuation computation step failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
