import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * /api/crm/templates — CRM message templates (Supabase: crm_message_templates).
 *
 *   GET  → list all templates for the tenant, updated_at desc.
 *          Optional ?channel=email|sms|chat narrows to one channel.
 *   POST → create a template (always is_system=false, is_active=true).
 */

const CHANNELS = ['email', 'sms', 'chat'] as const;

function validationError(message: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, requestId: crypto.randomUUID() } },
    { status: 400 },
  );
}

/** Normalize whatever the client sent for `variables` into a clean string[].
 *  Tolerates null/undefined, a string[] (Postgres text[] shape), or a
 *  comma-separated string. */
function normalizeVariables(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw
      .filter((v): v is string => typeof v === 'string')
      .map(v => v.trim())
      .filter(Boolean);
  }
  if (typeof raw === 'string' && raw.trim()) {
    return raw.split(',').map(v => v.trim()).filter(Boolean);
  }
  return [];
}

/** GET /api/crm/templates */
export async function GET(req: NextRequest) {
  const channel = req.nextUrl.searchParams.get('channel');

  let query = supabaseAdmin()
    .from('crm_message_templates')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('updated_at', { ascending: false });

  if (channel) {
    if (!(CHANNELS as readonly string[]).includes(channel)) {
      return validationError(`channel must be one of: ${CHANNELS.join(', ')}`);
    }
    query = query.eq('channel', channel);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: data || [] });
}

/** POST /api/crm/templates */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return validationError('Invalid JSON body');
  }

  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const channel = typeof body.channel === 'string' ? body.channel.trim() : '';
  if (!name) return validationError('name is required');
  if (!(CHANNELS as readonly string[]).includes(channel)) {
    return validationError(`channel is required and must be one of: ${CHANNELS.join(', ')}`);
  }

  const subject = typeof body.subject === 'string' ? body.subject : null;
  const bodyText = typeof body.body === 'string' ? body.body : null;
  const category =
    typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;

  const { data, error } = await supabaseAdmin()
    .from('crm_message_templates')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name,
      channel,
      subject,
      body: bodyText,
      variables: normalizeVariables(body.variables),
      category,
      is_system: false,
      is_active: true,
    })
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data }, { status: 201 });
}
