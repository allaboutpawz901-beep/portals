import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * Studio settings (A9) — stored in the existing `tenant_settings` table
 * (PK tenant_id + section), section 'design_studio'. No new table.
 *
 * GET /api/v1/settings?section=design_studio — returns the stored data
 * merged over the defaults (default supplier + default price rule).
 * PATCH /api/v1/settings { section, data } — upserts the section.
 *
 * Defaults: default_supplier 'printify' (the reference flow; keepers only),
 * price_markup 1.55 (a SUGGESTION — the user sets the price on the card),
 * price_rule 'suggested'.
 */
export const DESIGN_STUDIO_DEFAULTS = {
  default_supplier: 'printify',
  price_markup: 1.55,
  price_rule: 'suggested',
};

export async function GET(req: NextRequest) {
  try {
    const section = new URL(req.url).searchParams.get('section') ?? 'design_studio';
    const { data, error } = await supabaseAdmin()
      .from('tenant_settings')
      .select('section,data,updated_at')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('section', section)
      .maybeSingle();
    if (error) throw new Error(`tenant_settings: ${error.message}`);
    const stored = (data?.data ?? {}) as Record<string, unknown>;
    const merged =
      section === 'design_studio' ? { ...DESIGN_STUDIO_DEFAULTS, ...stored } : stored;
    return NextResponse.json({
      section,
      data: merged,
      updatedAt: data?.updated_at ?? null,
      isDefault: !data,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load settings.');
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      section?: string;
      data?: Record<string, unknown>;
    };
    const section = String(body.section ?? 'design_studio');
    if (!body.data || typeof body.data !== 'object' || Array.isArray(body.data)) {
      return apiError('PATCH /api/v1/settings needs { section, data } with data an object.', 422);
    }
    if (section === 'design_studio') {
      const markup = (body.data as Record<string, unknown>).price_markup;
      if (markup !== undefined && (typeof markup !== 'number' || !(markup > 0))) {
        return apiError('price_markup must be a number above 0.', 422);
      }
      const supplier = (body.data as Record<string, unknown>).default_supplier;
      if (
        supplier !== undefined &&
        !['printify', 'printful', 'cloudprinter'].includes(String(supplier))
      ) {
        return apiError('default_supplier must be a keeper supplier: printify, printful or cloudprinter.', 422);
      }
    }
    const { data, error } = await supabaseAdmin()
      .from('tenant_settings')
      .upsert(
        {
          tenant_id: DEFAULT_TENANT_ID,
          section,
          data: body.data,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'tenant_id,section' },
      )
      .select('section,data,updated_at')
      .single();
    if (error) throw new Error(`tenant_settings upsert: ${error.message}`);
    return NextResponse.json({ section: data.section, data: data.data, updatedAt: data.updated_at });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to save settings.');
  }
}
