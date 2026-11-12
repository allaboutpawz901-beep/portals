import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/parties — the unified party list (§1.1: one person/company record).
 * Merges crm_customers (customers), acct_vendors (vendors), suppliers
 * (fulfillment suppliers), crm_leads (leads), and sellers (marketplace
 * sellers — same party model, own table pair) into one shape.
 * Query: ?role=customer|vendor|supplier|lead|seller & ?q=search
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role');
  const q = searchParams.get('q')?.trim().toLowerCase();

  const needCustomers = !role || role === 'customer' || role === 'all';
  const needVendors = !role || role === 'vendor' || role === 'all';
  const needSuppliers = !role || role === 'supplier' || role === 'all';
  const needLeads = !role || role === 'lead' || role === 'all';
  const needSellers = !role || role === 'seller' || role === 'all';

  const [custRes, vendRes, supRes, leadRes, sellerRes] = await Promise.all([
    needCustomers
      ? supabaseAdmin().from('crm_customers')
          .select('id, first_name, last_name, company_name, email, phone, city, state, outstanding_balance, lifetime_value, lifecycle_stage, lifecycle_status, created_at, updated_at, last_activity_at, archived_at')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .is('archived_at', null)
          .order('updated_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as never[], error: null }),
    needVendors
      ? supabaseAdmin().from('acct_vendors')
          .select('id, vendor_number, legal_name, email, phone, payment_terms_days, is_1099_vendor, is_active, w9_received_at, created_at, updated_at')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .eq('is_active', true)
          .order('updated_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as never[], error: null }),
    needSuppliers
      ? supabaseAdmin().from('suppliers')
          .select('id, name, slug, kind, ordering_status, created_at')
          .order('created_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as never[], error: null }),
    needLeads
      ? supabaseAdmin().from('crm_leads')
          .select('id, contact_name, email, phone, status, lead_source, created_at, updated_at')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .order('updated_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as never[], error: null }),
    needSellers
      ? supabaseAdmin().from('sellers')
          .select('id, legal_name, display_name, email, phone, website, commission_rate, status, seller_type, slug, created_at, updated_at')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          // Archived sellers (operations_paused) leave the unified list, the
          // same way is_active=false hides vendors. The Seller relationships
          // module still shows them — it owns the enforcement view.
          .eq('operations_paused', false)
          .order('updated_at', { ascending: false })
          .limit(500)
      : Promise.resolve({ data: [] as never[], error: null }),
  ]);

  if (custRes.error || vendRes.error || supRes.error || leadRes.error || sellerRes.error) {
    const err = custRes.error || vendRes.error || supRes.error || leadRes.error || sellerRes.error;
    return NextResponse.json({ error: { code: 'INTERNAL', message: err!.message } }, { status: 500 });
  }

  type Party = {
    id: string;
    source: string;
    name: string;
    email: string | null;
    phone: string | null;
    roles: string[];
    company: string | null;
    city: string | null;
    state: string | null;
    balance: number;
    lifetimeValue: number;
    lifecycleStage: string | null;
    terms: number | null;
    is1099: boolean;
    w9Received: boolean;
    isActive: boolean;
    orderingStatus: string | null;
    sellerType: string | null;
    sellerStatus: string | null;
    website: string | null;
    commissionRate: number | null;
    addedAt: string;
    lastActivity: string | null;
  };

  const parties: Party[] = [];

  for (const c of custRes.data || []) {
    parties.push({
      id: c.id,
      source: 'crm_customers',
      name: [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || c.email || 'Unnamed',
      email: c.email,
      phone: c.phone,
      roles: ['customer'],
      company: c.company_name,
      city: c.city,
      state: c.state,
      balance: Number(c.outstanding_balance) || 0,
      lifetimeValue: Number(c.lifetime_value) || 0,
      lifecycleStage: c.lifecycle_stage,
      terms: null,
      is1099: false,
      w9Received: false,
      isActive: !c.archived_at && c.lifecycle_status !== 'inactive',
      orderingStatus: null,
      sellerType: null,
      sellerStatus: null,
      website: null,
      commissionRate: null,
      addedAt: c.created_at,
      lastActivity: c.last_activity_at || c.updated_at,
    });
  }

  for (const v of vendRes.data || []) {
    parties.push({
      id: v.id,
      source: 'acct_vendors',
      name: v.legal_name || 'Unnamed vendor',
      email: v.email,
      phone: v.phone,
      roles: ['vendor'],
      company: v.legal_name,
      city: null,
      state: null,
      balance: 0,
      lifetimeValue: 0,
      lifecycleStage: null,
      terms: v.payment_terms_days,
      is1099: v.is_1099_vendor ?? false,
      w9Received: !!v.w9_received_at,
      isActive: v.is_active ?? true,
      orderingStatus: null,
      sellerType: null,
      sellerStatus: null,
      website: null,
      commissionRate: null,
      addedAt: v.created_at,
      lastActivity: v.updated_at,
    });
  }

  for (const s of supRes.data || []) {
    parties.push({
      id: s.id,
      source: 'suppliers',
      name: s.name,
      email: null,
      phone: null,
      roles: ['supplier'],
      company: s.name,
      city: null,
      state: null,
      balance: 0,
      lifetimeValue: 0,
      lifecycleStage: null,
      terms: null,
      is1099: false,
      w9Received: false,
      isActive: true,
      orderingStatus: s.ordering_status,
      sellerType: null,
      sellerStatus: null,
      website: null,
      commissionRate: null,
      addedAt: s.created_at,
      lastActivity: s.created_at,
    });
  }

  for (const l of leadRes.data || []) {
    parties.push({
      id: l.id,
      source: 'crm_leads',
      name: l.contact_name || l.email || 'Unnamed lead',
      email: l.email,
      phone: l.phone,
      roles: ['lead'],
      company: null,
      city: null,
      state: null,
      balance: 0,
      lifetimeValue: 0,
      lifecycleStage: l.status,
      terms: null,
      is1099: false,
      w9Received: false,
      isActive: !['lost', 'converted'].includes(l.status),
      orderingStatus: null,
      sellerType: null,
      sellerStatus: null,
      website: null,
      commissionRate: null,
      addedAt: l.created_at,
      lastActivity: l.updated_at,
    });
  }

  // Sellers — marketplace sellers are a contact type: same unified list,
  // their own table (sellers) + profile extension (seller_self_serve_profiles).
  for (const s of sellerRes.data || []) {
    parties.push({
      id: s.id,
      source: 'sellers',
      name: s.display_name || s.legal_name || 'Unnamed seller',
      email: s.email,
      phone: s.phone,
      roles: ['seller'],
      company: s.legal_name,
      city: null,
      state: null,
      balance: 0,
      lifetimeValue: 0,
      lifecycleStage: s.status,
      terms: null,
      is1099: false,
      w9Received: false,
      isActive: s.status !== 'declined',
      orderingStatus: null,
      sellerType: s.seller_type,
      sellerStatus: s.status,
      website: s.website,
      // percent at the API boundary (stored as a 0–1 fraction)
      commissionRate: s.commission_rate != null ? Number(s.commission_rate) * 100 : null,
      addedAt: s.created_at,
      lastActivity: s.updated_at,
    });
  }

  const filtered = q
    ? parties.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.company || '').toLowerCase().includes(q) ||
        (p.phone || '').includes(q))
    : parties;

  const counts = {
    all: parties.length,
    customer: parties.filter(p => p.roles.includes('customer')).length,
    vendor: parties.filter(p => p.roles.includes('vendor')).length,
    supplier: parties.filter(p => p.roles.includes('supplier')).length,
    lead: parties.filter(p => p.roles.includes('lead')).length,
    seller: parties.filter(p => p.roles.includes('seller')).length,
  };

  return NextResponse.json({ data: filtered, meta: { total: filtered.length, counts } });
}

/**
 * POST /api/parties — create a party. `role` routes the insert to the
 * correct Supabase table: customer → crm_customers, vendor → acct_vendors,
 * supplier → suppliers, lead → crm_leads.
 *
 * Field contract: EVERY field the PartyFormDrawer collects is written to a
 * real column here. Columns that are REQUIRED in the schema but have no
 * form input (acct_vendors.vendor_number / ap_account_id / currency,
 * suppliers.slug / catalog_source) are auto-resolved server-side so a
 * create never 400s on a column the user was never shown.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const role = body.role || 'customer';

  if (role === 'customer') {
    const { data, error } = await supabaseAdmin()
      .from('crm_customers')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        first_name: body.first_name || null,
        last_name: body.last_name || null,
        // Display name → preferred_name (real column), never stuffed into company.
        preferred_name: body.preferred_name || body.display || null,
        company_name: body.company_name || null,
        email: body.email || null,
        phone: body.phone || null,
        mobile_phone: body.mobile_phone || null,
        address_line1: body.address || null,
        address_line2: body.address2 || body.street2 || null,
        city: body.city || null,
        state: body.state || null,
        postal_code: body.zip || null,
        country: body.country || 'US',
        // Real form select — falls back to the old company-derived default.
        customer_type: body.customer_type || (body.company_name ? 'Wholesale' : 'Retail'),
        marketing_email_opt_in: !!body.marketing_email_opt_in,
        marketing_sms_opt_in: !!body.marketing_sms_opt_in,
        lifecycle_stage: 'new_customer',
        lifecycle_status: 'active',
        lead_status: 'converted',
        first_contact_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        is_active: true,
      })
      .select('id, first_name, last_name, company_name, email, phone, city, state, outstanding_balance, lifetime_value, lifecycle_stage, created_at')
      .single();
    if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
    // The create-form notes box lands in crm_notes — same store the Notes
    // tab reads, so it round-trips into the profile immediately.
    if (body.notes && String(body.notes).trim()) {
      await supabaseAdmin().from('crm_notes').insert({
        tenant_id: DEFAULT_TENANT_ID,
        customer_id: data.id,
        note_type: 'general',
        body: String(body.notes).trim(),
      });
    }
    return NextResponse.json({ data: { ...data, source: 'crm_customers', roles: ['customer'] } }, { status: 201 });
  }

  if (role === 'vendor') {
    // Auto-resolve the REQUIRED bookkeeping columns the form doesn't show:
    // vendor_number continues the tenant's VND-#### sequence, ap_account_id
    // points at the tenant's Accounts Payable (subtype accounts_payable).
    const [numRes, apRes] = await Promise.all([
      supabaseAdmin()
        .from('acct_vendors')
        .select('vendor_number')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .like('vendor_number', 'VND-%'),
      supabaseAdmin()
        .from('acct_chart_of_accounts')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('is_active', true)
        .eq('subtype', 'accounts_payable')
        .limit(1),
    ]);
    let nextNum = 1;
    for (const row of numRes.data || []) {
      const m = /^VND-(\d+)$/.exec(row.vendor_number || '');
      if (m) nextNum = Math.max(nextNum, parseInt(m[1], 10) + 1);
    }
    const vendorNumber = `VND-${String(nextNum).padStart(4, '0')}`;
    const apAccountId = apRes.data?.[0]?.id;
    if (!apAccountId) {
      return NextResponse.json({ error: { code: 'CONFIG', message: 'No Accounts Payable account found in acct_chart_of_accounts — cannot create vendor' } }, { status: 500 });
    }

    const is1099 = !!body.is1099;
    const { data, error } = await supabaseAdmin()
      .from('acct_vendors')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        vendor_number: vendorNumber,
        legal_name: body.name || body.company_name,
        email: body.email || null,
        phone: body.phone || null,
        currency: 'USD',
        ap_account_id: apAccountId,
        payment_terms_days: body.terms ?? 30,
        is_1099_vendor: is1099,
        tax_number: body.tax_number || null,
        tax_form_type: is1099 ? (body.tax_form_type || 'W-9') : null,
        w9_received_at: body.w9_received ? new Date().toISOString() : null,
        is_active: true,
        metadata: {},
      })
      .select('id, legal_name, email, phone, payment_terms_days, is_1099_vendor, is_active, created_at')
      .single();
    if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
    return NextResponse.json({ data: { ...data, source: 'acct_vendors', roles: ['vendor'] } }, { status: 201 });
  }

  if (role === 'supplier') {
    const baseName = body.name || body.company_name || 'Supplier';
    const baseSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'supplier';
    // Slug is REQUIRED + unique — dedupe against existing rows.
    const { data: existing } = await supabaseAdmin()
      .from('suppliers')
      .select('slug')
      .like('slug', `${baseSlug}%`);
    const taken = new Set((existing || []).map((r: { slug: string }) => r.slug));
    let slug = baseSlug;
    for (let i = 2; taken.has(slug); i++) slug = `${baseSlug}-${i}`;

    const apiBaseUrl = body.api_base_url || body.api_url || null;
    const { data, error } = await supabaseAdmin()
      .from('suppliers')
      .insert({
        name: baseName,
        slug,
        kind: body.kind || 'pod',
        // Manual form entries are 'manual'; an API URL implies 'api'.
        catalog_source: apiBaseUrl ? 'api' : 'manual',
        api_base_url: apiBaseUrl,
        ordering_status: body.ordering_status || 'catalog_only',
      })
      .select('id, name, kind, ordering_status, created_at')
      .single();
    if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
    return NextResponse.json({ data: { ...data, source: 'suppliers', roles: ['supplier'] } }, { status: 201 });
  }

  if (role === 'lead') {
    const statusVocab = ['new', 'contacted', 'qualified', 'pending', 'working', 'converted', 'lost'];
    const rawStatus = String(body.status || 'new').toLowerCase().replace(/\s+/g, '_');
    const { data, error } = await supabaseAdmin()
      .from('crm_leads')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        contact_name: body.name || [body.first_name, body.last_name].filter(Boolean).join(' ') || null,
        email: body.email || null,
        phone: body.phone || null,
        lead_source: body.lead_source || 'manual',
        lead_type: body.lead_type || 'general',
        status: statusVocab.includes(rawStatus) ? rawStatus : 'new',
        first_contact_at: new Date().toISOString(),
        next_follow_up_at: body.next_follow_up_at || null,
        notes: body.notes || null,
      })
      .select('id, contact_name, email, phone, status, created_at')
      .single();
    if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
    return NextResponse.json({ data: { ...data, source: 'crm_leads', roles: ['lead'] } }, { status: 201 });
  }

  if (role === 'seller') {
    // Sellers are a contact type in the unified party model. The canonical
    // record lands in `sellers` (contact-shaped: legal/display name, email,
    // phone, website, commission_rate) and the extended self-serve profile
    // lands in `seller_self_serve_profiles` — same chain POST /api/sellers
    // uses, so both the Parties module and the Seller relationships module
    // read the same rows.
    const legalName = String(body.name || body.legal_name || '').trim();
    if (!legalName) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Legal name is required' } }, { status: 400 });
    }
    const displayName = String(body.display_name || body.display || '').trim() || legalName;
    const applicantType =
      body.applicant_type === 'business' || body.applicant_type === 'business_seller'
        ? 'business_seller'
        : 'individual_seller';

    // slug is REQUIRED + unique — dedupe against existing rows.
    const baseSlug = legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seller';
    const { data: existing } = await supabaseAdmin()
      .from('sellers')
      .select('slug')
      .like('slug', `${baseSlug}%`);
    const taken = new Set((existing || []).map((r: { slug: string }) => r.slug));
    let slug = baseSlug;
    for (let i = 2; taken.has(slug); i++) slug = `${baseSlug}-${i}`;

    const commissionRatePct =
      body.commission_rate != null && body.commission_rate !== ''
        ? Number(body.commission_rate)
        : null;
    if (commissionRatePct != null && (Number.isNaN(commissionRatePct) || commissionRatePct < 0 || commissionRatePct > 100)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'commission_rate must be a percentage between 0 and 100' } }, { status: 400 });
    }

    const sb = supabaseAdmin();
    // 1. canonical sellers row
    const { data: sellerRow, error: sellerError } = await sb
      .from('sellers')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        seller_type: 'marketplace',
        legal_name: legalName,
        display_name: displayName,
        slug,
        email: body.email || null,
        phone: body.phone || null,
        website: body.website || null,
        // The column stores a 0–1 fraction (numeric(4,4)-style); the API
        // contract speaks percent (12.5 → 0.125) so forms stay human.
        commission_rate: commissionRatePct != null ? commissionRatePct / 100 : null,
      })
      .select('id, legal_name, display_name, email, phone, website, commission_rate, status, seller_type, slug, created_at')
      .single();
    if (sellerError) return NextResponse.json({ error: { code: 'VALIDATION', message: sellerError.message } }, { status: 400 });

    // 2. self-serve profile row (fresh applicant account id; a new seller is
    //    below the tax reporting threshold → 'not_required')
    const { error: profileError } = await sb
      .from('seller_self_serve_profiles')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        seller_id: sellerRow.id,
        user_id: crypto.randomUUID(),
        legal_name: legalName,
        display_name: displayName,
        applicant_type: applicantType,
        tax_form_status: 'not_required',
        owners: {},
        categories: {},
      });
    if (profileError) {
      // roll the canonical row back so a failed profile leaves no orphan seller
      await sb.from('sellers').delete().eq('id', sellerRow.id);
      return NextResponse.json({ error: { code: 'VALIDATION', message: profileError.message } }, { status: 400 });
    }

    return NextResponse.json({ data: {
      ...sellerRow,
      // percent at the API boundary (stored as a 0–1 fraction)
      commission_rate: sellerRow.commission_rate != null ? Number(sellerRow.commission_rate) * 100 : null,
      source: 'sellers', roles: ['seller'],
    } }, { status: 201 });
  }

  return NextResponse.json({ error: { code: 'VALIDATION', message: `Unknown role: ${role}` } }, { status: 400 });
}
