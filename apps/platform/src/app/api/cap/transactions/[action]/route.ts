import { NextRequest, NextResponse } from 'next/server';
import { recordSecurityTransaction } from '@/lib/equityStore';

const ALLOWED_ACTIONS = new Set([
  'exercise',
  'transfer',
  'repurchase',
  'cancel',
  'convert',
  'split',
  'file83b',
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ action: string }> }
) {
  try {
    const { action } = await context.params;
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json(
        { error: `Unsupported transaction action: ${action}` },
        { status: 400 }
      );
    }
    const body = await req.json();
    const state = recordSecurityTransaction(
      action as
        | 'exercise'
        | 'transfer'
        | 'repurchase'
        | 'cancel'
        | 'convert'
        | 'split'
        | 'file83b',
      body
    );
    return NextResponse.json(state);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Transaction failed.';
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
