import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * /api/crm/templates/[id] — update or delete a single CRM message template.
 *
 *   PATCH  → update only the provided fields (name, channel, subject, body,
 *            variables, category, is_active) + bump updated_at.
 *   DELETE → remove the row.
 */

const CHANNELS = ['email', 'sms', 'chat'] as const;

function validationError(message: string) {
  return NextResponse.json(
    { error: { code: 'VALIDATION', message, requestId: crypto.randomUUID() } },
    { status: 400 },
  );
}

/** string[] (Postgres text[] shape) or comma-separated string → string[] */
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

/** PATCH /api/crm/templates/[id] */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return validationError('Invalid JSON body');
  }

  // Only allow the mutable fields — never id/tenant_id/created_at/is_system.
  const updates: Record<string, unknown> = {};

  if ('name' in body) {
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) return validationError('name cannot be empty');
    updates.name = name;
  }
  if ('channel' in body) {
    const channel = typeof body.channel === 'string' ? body.channel.trim() : '';
    if (!(CHANNELS as readonly string[]).includes(channel)) {
      return validationError(`channel must be one of: ${CHANNELS.join(', ')}`);
    }
    updates.channel = channel;
  }
  if ('subject' in body) updates.subject = typeof body.subject === 'string' ? body.subject : null;
  if ('body' in body) updates.body = typeof body.body === 'string' ? body.body : null;
  if ('variables' in body) updates.variables = normalizeVariables(body.variables);
  if ('category' in body) {
    updates.category =
      typeof body.category === 'string' && body.category.trim() ? body.category.trim() : null;
  }
  if ('is_active' in body) {
    if (typeof body.is_active !== 'boolean') return validationError('is_active must be a boolean');
    updates.is_active = body.is_active;
  }

  if (Object.keys(updates).length === 0) {
    return validationError('No updatable fields provided');
  }
  updates.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin()
    .from('crm_message_templates')
    .update(updates)
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: error.message, requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  return NextResponse.json({ data });
}

/** DELETE /api/crm/templates/[id] */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { error } = await supabaseAdmin()
    .from('crm_message_templates')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  return NextResponse.json({ data: { id } });
}
