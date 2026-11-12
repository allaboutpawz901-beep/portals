'use client';
/**
 * PartyFormDrawer — THE canonical create/edit party experience.
 *
 * Every surface that creates or edits a party (CRM overview, Parties list,
 * Customers, Vendors, Suppliers, quick-create, row menus) opens THIS drawer.
 *
 * Field contract (the "nothing gets dropped" rule):
 *   - Every input in this form maps 1:1 to a real column in the party's
 *     source table. No decorative fields, no fake selects.
 *   - Role decides which sections render — a vendor has no address columns,
 *     so the vendor form shows no address fields.
 *   - One role per record: customers, vendors, suppliers and leads live in
 *     different tables, so a record is exactly one of them.
 *
 * Save paths:
 *   create → POST /api/parties            (routes to the right table by role)
 *   edit   → PATCH /api/parties/[id]?source=…
 */
import { useEffect, useRef, useState } from 'react';
import { usePlatformMutations, useParty, fetchJson } from '@/hooks/useCrmApi';
import { usePlatformStore } from '@/lib/platformStore';
import { supabaseRecordToStoreParty, type SupabasePartyRecord } from '@/lib/partyMirror';

/* Roles in the data model. 'Contact' has no table — intentionally absent. */
export const PARTY_ROLES = ['Customer', 'Vendor', 'Supplier', 'Seller', 'Lead'] as const;
export type PartyRoleKey = 'customer' | 'vendor' | 'supplier' | 'seller' | 'lead';

export function sourceToRole(source: string): PartyRoleKey {
  if (source === 'acct_vendors') return 'vendor';
  if (source === 'suppliers') return 'supplier';
  if (source === 'crm_leads') return 'lead';
  if (source === 'sellers') return 'seller';
  return 'customer';
}

export interface PartyFormEditTarget {
  id: string;
  source: string;
  name: string;
  email: string;
  phone: string;
  address: string;
  roles: string[];
  /* Full prefill — edit shows the SAME fields create does. */
  company?: string | null;      // customers: company_name
  first?: string | null;
  last?: string | null;
  display?: string | null;      // customers: preferred_name
  mobile?: string | null;       // customers: mobile_phone
  address2?: string | null;     // customers: address_line2
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;      // stored as code ('US')
  customerType?: string | null; // customers: customer_type
  marketingEmail?: boolean | null;  // customers: marketing_email_opt_in
  marketingSms?: boolean | null;    // customers: marketing_sms_opt_in
  /* Vendors */
  terms?: number | null;        // acct_vendors.payment_terms_days
  is1099?: boolean | null;      // acct_vendors.is_1099_vendor
  taxNumber?: string | null;    // acct_vendors.tax_number
  w9Received?: boolean | null;  // acct_vendors.w9_received_at
  /* Suppliers */
  kind?: string | null;         // suppliers.kind
  apiUrl?: string | null;       // suppliers.api_base_url
  /* Leads */
  leadSource?: string | null;   // crm_leads.lead_source
  leadType?: string | null;     // crm_leads.lead_type
  leadStatus?: string | null;   // crm_leads.status
  nextFollowUp?: string | null; // crm_leads.next_follow_up_at (yyyy-mm-dd)
  leadNotes?: string | null;    // crm_leads.notes
  /* Sellers */
  website?: string | null;          // sellers.website
  commissionRate?: string | null;   // sellers.commission_rate (%)
  applicantType?: string | null;    // seller_self_serve_profiles.applicant_type
}

export interface PartyFormDrawerProps {
  open: boolean;
  editing?: PartyFormEditTarget | null;
  /** Role pre-selected when creating (e.g. 'Customer' from the overview). */
  preselectRole?: string;
  onClose: () => void;
  /** Called after a successful save so the caller can refresh its list. */
  onSaved?: (partyName: string, mode: 'created' | 'updated') => void;
  onToast: (m: string) => void;
}

interface PartyFormState {
  /* Shared */
  email: string; phone: string; mobile: string; notes: string;
  /* Person names (customers) */
  first: string; last: string; display: string;
  /* Company / primary name */
  name: string;
  /* Address (customers only — the only party table with address columns) */
  street1: string; street2: string; city: string; state: string; zip: string; country: string;
  /* Customer extras */
  customerType: string;
  marketingEmail: boolean; marketingSms: boolean;
  /* Vendor extras */
  vendorTerms: string; is1099: boolean; taxNumber: string; w9Received: boolean;
  /* Supplier extras */
  kind: string; apiUrl: string;
  /* Lead extras */
  leadSource: string; leadType: string; leadStatus: string; nextFollowUp: string;
  /* Seller extras */
  website: string; commissionRate: string; applicantType: string;
}

const EMPTY_FORM: PartyFormState = {
  email: '', phone: '', mobile: '', notes: '',
  first: '', last: '', display: '',
  name: '',
  street1: '', street2: '', city: '', state: '', zip: '', country: 'US',
  customerType: 'Retail',
  marketingEmail: false, marketingSms: false,
  vendorTerms: '30', is1099: false, taxNumber: '', w9Received: false,
  kind: 'pod', apiUrl: '',
  leadSource: 'Website', leadType: 'general', leadStatus: 'new', nextFollowUp: '',
  website: '', commissionRate: '', applicantType: 'individual',
};

/* Country labels ↔ ISO codes (crm_customers.country stores the code). */
const COUNTRY_LABELS = ['United States', 'Canada', 'United Kingdom', 'Australia'];
const COUNTRY_TO_CODE: Record<string, string> = { 'United States': 'US', 'Canada': 'CA', 'United Kingdom': 'UK', 'Australia': 'AU' };
const CODE_TO_LABEL: Record<string, string> = { US: 'United States', CA: 'Canada', UK: 'United Kingdom', AU: 'Australia' };

const CUSTOMER_TYPES = ['Retail', 'Wholesale'];
/* Supplier kind — the DB check constraint (suppliers_kind_check) allows
   exactly these three values; verified against the live schema. */
const SUPPLIER_KINDS = [
  { value: 'pod', label: 'Print on demand' },
  { value: 'dropship', label: 'Dropship' },
  { value: 'marketplace', label: 'Marketplace' },
];
const LEAD_SOURCES = ['Website', 'Referral', 'Social Media', 'Google', 'Event', 'Cold outreach', 'manual'];
const LEAD_TYPES = ['general', 'custom_order', 'bulk_order', 'design_help'];
const LEAD_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'working', label: 'Working' },
  { value: 'pending', label: 'Pending' },
  { value: 'converted', label: 'Won / converted' },
  { value: 'lost', label: 'Lost' },
];

export default function PartyFormDrawer({ open, editing, preselectRole, onClose, onSaved, onToast }: PartyFormDrawerProps) {
  const { createParty } = usePlatformMutations(onToast);
  const [form, setForm] = useState<PartyFormState>({ ...EMPTY_FORM });
  const [role, setRole] = useState<PartyRoleKey>('customer');
  const [saving, setSaving] = useState(false);

  const roleKey: PartyRoleKey = editing ? sourceToRole(editing.source) : role;

  /* Edit always prefills from the SOURCE OF TRUTH: the caller's target may
     be a minimal list row, so we fetch the full record (cache-first) and
     hydrate every field as soon as it lands. */
  const { data: fullRecord } = useParty(
    open && editing ? editing.id : '',
    open && editing ? editing.source : '',
  );

  /* Reset the form whenever the drawer opens for a different target — keyed
     on target IDENTITY, not object reference, so parent re-renders never
     clobber in-progress edits. */
  const resetKeyRef = useRef('');
  useEffect(() => {
    if (!open) { resetKeyRef.current = ''; return; }
    const key = editing ? `${editing.id}:${editing.source}` : `new:${preselectRole || ''}`;
    if (key === resetKeyRef.current) return; // same target already loaded — keep user edits
    resetKeyRef.current = key;
    if (editing) {
      setForm({
        ...EMPTY_FORM,
        email: editing.email || '',
        phone: editing.phone || '',
        mobile: editing.mobile || '',
        first: editing.first || '',
        last: editing.last || '',
        display: editing.display || '',
        // Customers: `name` field = company_name (kept separate from person).
        // Sellers: `name` = legal_name (company slot), display = display_name.
        // Other roles: `name` = the primary name (legal_name / name / contact_name).
        name: editing.source === 'crm_customers' ? (editing.company || '')
          : editing.source === 'sellers' ? (editing.company || editing.name || '')
          : (editing.name || ''),
        street1: editing.address || '',
        street2: editing.address2 || '',
        city: editing.city || '',
        state: editing.state || '',
        zip: editing.zip || '',
        country: editing.country || 'US',
        customerType: editing.customerType || 'Retail',
        marketingEmail: !!editing.marketingEmail,
        marketingSms: !!editing.marketingSms,
        vendorTerms: editing.terms != null ? String(editing.terms) : '30',
        is1099: !!editing.is1099,
        taxNumber: editing.taxNumber || '',
        w9Received: !!editing.w9Received,
        kind: editing.kind || 'pod',
        apiUrl: editing.apiUrl || '',
        leadSource: editing.leadSource || 'Website',
        leadType: editing.leadType || 'general',
        leadStatus: editing.leadStatus || 'new',
        nextFollowUp: editing.nextFollowUp ? String(editing.nextFollowUp).slice(0, 10) : '',
        notes: editing.leadNotes || '',
        website: editing.website || '',
        commissionRate: editing.commissionRate != null && editing.commissionRate !== '' ? String(editing.commissionRate) : '',
        applicantType: editing.applicantType || 'individual',
      });
    } else {
      setForm({ ...EMPTY_FORM });
      const pre = (preselectRole || 'Customer').toLowerCase();
      setRole(pre === 'vendor' ? 'vendor' : pre === 'supplier' ? 'supplier' : pre === 'seller' ? 'seller' : pre === 'lead' ? 'lead' : 'customer');
    }
  }, [open, editing, preselectRole]);

  /* Full-record hydration — replaces the partial target prefill with the
     complete source-table row once the fetch lands. Runs at most once per
     record revision so it never clobbers in-progress user edits. */
  const hydratedKeyRef = useRef('');
  useEffect(() => {
    if (!open || !editing || !fullRecord) return;
    const key = `${fullRecord.id}:${fullRecord.source}:${fullRecord.updated_at || ''}`;
    if (key === hydratedKeyRef.current) return;
    hydratedKeyRef.current = key;
    setForm({
      ...EMPTY_FORM,
      email: fullRecord.email || '',
      phone: fullRecord.phone || '',
      notes: fullRecord.lead_notes || '',
      first: fullRecord.first_name || '',
      last: fullRecord.last_name || '',
      display: fullRecord.preferred_name || '',
      name: fullRecord.source === 'crm_customers'
        ? (fullRecord.company || '')
        : fullRecord.source === 'sellers'
          ? (fullRecord.company || fullRecord.name || '')
          : (fullRecord.name || ''),
      street1: fullRecord.address_line1 || '',
      street2: fullRecord.address_line2 || '',
      city: fullRecord.city || '',
      state: fullRecord.state || '',
      zip: fullRecord.postal_code || '',
      country: fullRecord.country || 'US',
      customerType: fullRecord.customer_type || 'Retail',
      marketingEmail: !!fullRecord.marketing_email_opt_in,
      marketingSms: !!fullRecord.marketing_sms_opt_in,
      vendorTerms: fullRecord.payment_terms_days != null ? String(fullRecord.payment_terms_days) : '30',
      is1099: !!fullRecord.is_1099_vendor,
      taxNumber: fullRecord.tax_number || '',
      w9Received: !!fullRecord.w9_received_at,
      kind: fullRecord.kind || 'pod',
      apiUrl: fullRecord.api_base_url || '',
      leadSource: fullRecord.lead_source || 'Website',
      leadType: fullRecord.lead_type || 'general',
      leadStatus: fullRecord.status || 'new',
      nextFollowUp: fullRecord.next_follow_up_at ? String(fullRecord.next_follow_up_at).slice(0, 10) : '',
      website: fullRecord.website || '',
      commissionRate: fullRecord.commission_rate != null ? String(fullRecord.commission_rate) : '',
      applicantType: fullRecord.applicant_type === 'business_seller' ? 'business' : fullRecord.applicant_type === 'individual_seller' ? 'individual' : (fullRecord.applicant_type || 'individual'),
    });
  }, [open, editing, fullRecord]);

  if (!open) return null;

  const set = <K extends keyof PartyFormState>(k: K, v: PartyFormState[K]) =>
    setForm(p => ({ ...p, [k]: v }));

  function primaryName(): string {
    if (roleKey === 'customer') {
      return [form.first.trim(), form.last.trim()].filter(Boolean).join(' ') || form.name.trim();
    }
    return form.name.trim();
  }

  function collect(): { name: string } | null {
    const name = primaryName();
    if (!name) {
      onToast(
        roleKey === 'customer'
          ? 'First or last name (or company) is required'
          : roleKey === 'vendor'
            ? 'Legal name is required'
            : roleKey === 'supplier'
              ? 'Supplier name is required'
              : roleKey === 'seller'
                ? 'Legal name is required'
                : 'Contact name is required'
      );
      return null;
    }
    return { name };
  }

  async function persist(): Promise<boolean> {
    const c = collect();
    if (!c) return false;
    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = { email: form.email || null, phone: form.phone || null };
        if (editing.source === 'crm_customers') {
          Object.assign(payload, {
            first_name: form.first || null,
            last_name: form.last || null,
            company_name: form.name || null,
            preferred_name: form.display || null,
            mobile_phone: form.mobile || null,
            address: form.street1 || null,
            address2: form.street2 || null,
            city: form.city || null,
            state: form.state || null,
            zip: form.zip || null,
            country: COUNTRY_TO_CODE[form.country] || form.country,
            customer_type: form.customerType,
            marketing_email_opt_in: form.marketingEmail,
            marketing_sms_opt_in: form.marketingSms,
          });
        } else if (editing.source === 'acct_vendors') {
          Object.assign(payload, {
            name: form.name || null,
            terms: form.vendorTerms ? Number(form.vendorTerms) : 30,
            is1099: form.is1099,
            tax_number: form.taxNumber || null,
            tax_form_type: form.is1099 ? 'W-9' : null,
            w9_received: form.w9Received,
          });
        } else if (editing.source === 'suppliers') {
          Object.assign(payload, {
            name: form.name || null,
            kind: form.kind,
            api_base_url: form.apiUrl || null,
          });
        } else if (editing.source === 'crm_leads') {
          Object.assign(payload, {
            name: form.name || null,
            lead_source: form.leadSource,
            lead_type: form.leadType,
            status: form.leadStatus,
            next_follow_up_at: form.nextFollowUp ? new Date(`${form.nextFollowUp}T12:00:00Z`).toISOString() : null,
            notes: form.notes || null,
          });
        } else if (editing.source === 'sellers') {
          Object.assign(payload, {
            legal_name: form.name || null,
            display_name: form.display || form.name || null,
            website: form.website || null,
            applicant_type: form.applicantType,
            commission_rate: form.commissionRate !== '' ? Number(form.commissionRate) : null,
          });
        }
        const res = await fetchJson(`/api/parties/${editing.id}?source=${editing.source}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        if (!res.ok) { onToast(`Save failed: ${res.error}`); return false; }
        // Mirror the saved row into platformStore so the document-engine
        // party pickers see the update immediately (Supabase stays the
        // system of record — the store is a read-mirror).
        const savedRow = (res.data as { data?: SupabasePartyRecord } | undefined)?.data;
        if (savedRow?.id) {
          usePlatformStore.getState().mirrorParties([
            supabaseRecordToStoreParty({ ...savedRow, source: editing.source }),
          ]);
        }
        onSaved?.(c.name, 'updated');
        return true;
      } else {
        const base: Record<string, unknown> = { role: roleKey, email: form.email || undefined, phone: form.phone || undefined };
        if (roleKey === 'customer') {
          Object.assign(base, {
            first_name: form.first || undefined,
            last_name: form.last || undefined,
            company_name: form.name || undefined,
            preferred_name: form.display || undefined,
            mobile_phone: form.mobile || undefined,
            address: form.street1 || undefined,
            address2: form.street2 || undefined,
            city: form.city || undefined,
            state: form.state || undefined,
            zip: form.zip || undefined,
            country: COUNTRY_TO_CODE[form.country] || form.country,
            customer_type: form.customerType,
            marketing_email_opt_in: form.marketingEmail,
            marketing_sms_opt_in: form.marketingSms,
            notes: form.notes || undefined,
          });
        } else if (roleKey === 'vendor') {
          Object.assign(base, {
            name: form.name || undefined,
            terms: form.vendorTerms ? Number(form.vendorTerms) : 30,
            is1099: form.is1099,
            tax_number: form.taxNumber || undefined,
            w9_received: form.w9Received,
          });
        } else if (roleKey === 'supplier') {
          Object.assign(base, {
            name: form.name || undefined,
            kind: form.kind,
            api_base_url: form.apiUrl || undefined,
          });
        } else if (roleKey === 'lead') {
          Object.assign(base, {
            name: form.name || undefined,
            lead_source: form.leadSource,
            lead_type: form.leadType,
            status: form.leadStatus,
            next_follow_up_at: form.nextFollowUp ? new Date(`${form.nextFollowUp}T12:00:00Z`).toISOString() : undefined,
            notes: form.notes || undefined,
          });
        } else if (roleKey === 'seller') {
          Object.assign(base, {
            name: form.name || undefined,
            display: form.display || undefined,
            website: form.website || undefined,
            applicant_type: form.applicantType,
            commission_rate: form.commissionRate !== '' ? Number(form.commissionRate) : undefined,
          });
        }
        const res = await createParty(base);
        if (!res.ok) return false;
        // Mirror the created row into platformStore (doc-engine pickers).
        if (res.data?.id) {
          usePlatformStore.getState().mirrorParties([
            supabaseRecordToStoreParty(res.data as SupabasePartyRecord),
          ]);
        }
        onSaved?.(c.name, 'created');
        return true;
      }
    } finally {
      setSaving(false);
    }
  }

  async function saveAndClose() {
    if (await persist()) onClose();
  }
  async function saveAndNew() {
    if (await persist()) {
      setForm({ ...EMPTY_FORM });
      // keep the current role — usually adding several of the same kind
    }
  }

  const titleLabel = roleKey === 'customer' ? 'customer' : roleKey === 'vendor' ? 'vendor' : roleKey === 'supplier' ? 'supplier' : roleKey === 'seller' ? 'seller' : 'lead';

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <div className="drawer open" role="dialog" aria-label={editing ? `Edit ${titleLabel}` : `New ${titleLabel}`}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">
              {roleKey === 'customer' ? 'person' : roleKey === 'vendor' ? 'storefront' : roleKey === 'supplier' ? 'factory' : roleKey === 'seller' ? 'storefront' : 'flag'}
            </span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">{editing ? `Edit ${titleLabel}` : `New ${titleLabel}`}</div>
              <div className="text-[11px] text-on-surface-variant">{editing ? editing.name : `Saved to the ${roleKey} table — every field below persists.`}</div>
            </div>
          </div>
          <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={onClose} aria-label="Close"><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Role — radio behavior: one record, one table. Locked in edit. */}
          <section>
            <div className="section-h">Role</div>
            <div className="flex flex-wrap gap-2">
              {PARTY_ROLES.map(r => {
                const key = r.toLowerCase() as PartyRoleKey;
                const selected = roleKey === key;
                return (
                  <button
                    key={r}
                    type="button"
                    disabled={!!editing}
                    title={editing ? 'Role is fixed — it selects the record’s table' : `${r}s are stored in the ${key === 'customer' ? 'crm_customers' : key === 'vendor' ? 'acct_vendors' : key === 'supplier' ? 'suppliers' : key === 'seller' ? 'sellers' : 'crm_leads'} table`}
                    className={`role-chip-btn ${selected ? 'selected' : ''} ${editing ? 'opacity-80 cursor-default' : ''}`}
                    onClick={() => !editing && setRole(key)}
                    aria-pressed={selected}
                  >
                    <span className="material-symbols-outlined text-[16px]">{key === 'customer' ? 'person' : key === 'vendor' ? 'storefront' : key === 'supplier' ? 'factory' : key === 'seller' ? 'storefront' : 'flag'}</span>{r}
                  </button>
                );
              })}
            </div>
            {!editing && <div className="text-[11px] text-on-surface-variant mt-1.5">A record lives in exactly one table — its role. Everything below adapts to it.</div>}
          </section>

          {/* ── Names & contact (shared shape, role-tuned labels) ── */}
          <section>
            <div className="section-h">Names &amp; contact</div>
            <div className="space-y-3">
              {roleKey === 'customer' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="field-label" htmlFor="pf-first">First name</label><input id="pf-first" className="field-input" placeholder="First" value={form.first} onChange={e => set('first', e.target.value)} /></div>
                    <div><label className="field-label" htmlFor="pf-last">Last name</label><input id="pf-last" className="field-input" placeholder="Last" value={form.last} onChange={e => set('last', e.target.value)} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="field-label" htmlFor="pf-company">Company</label><input id="pf-company" className="field-input" placeholder="e.g. Acme Corp" value={form.name} onChange={e => set('name', e.target.value)} /></div>
                    <div><label className="field-label" htmlFor="pf-display">Display name <span className="text-on-surface-variant font-normal">(preferred)</span></label><input id="pf-display" className="field-input" placeholder="How they like to be called" value={form.display} onChange={e => set('display', e.target.value)} /></div>
                  </div>
                </>
              )}
              {roleKey !== 'customer' && (
                <div>
                  <label className="field-label" htmlFor="pf-name">
                    {roleKey === 'vendor' ? 'Legal name' : roleKey === 'supplier' ? 'Supplier name' : roleKey === 'seller' ? 'Legal name' : 'Contact name'}
                  </label>
                  <input id="pf-name" className="field-input" placeholder={roleKey === 'vendor' ? 'e.g. Gelato ASA' : roleKey === 'supplier' ? 'e.g. Printful' : roleKey === 'seller' ? 'e.g. Jordan Avery Studio LLC' : 'e.g. Jordan Reyes'} value={form.name} onChange={e => set('name', e.target.value)} />
                </div>
              )}
              {/* Sellers also have a display name (sellers.display_name) — the
                  public-facing shop name, separate from the legal name. */}
              {roleKey === 'seller' && (
                <div>
                  <label className="field-label" htmlFor="pf-sdisplay">Display name <span className="text-on-surface-variant font-normal">(shop name)</span></label>
                  <input id="pf-sdisplay" className="field-input" placeholder="e.g. Jordan Avery" value={form.display} onChange={e => set('display', e.target.value)} />
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label" htmlFor="pf-email">Email</label><input id="pf-email" className="field-input" type="email" placeholder="name@company.com" value={form.email} onChange={e => set('email', e.target.value)} /></div>
                <div><label className="field-label" htmlFor="pf-phone">Phone</label><input id="pf-phone" className="field-input" type="tel" placeholder="+1 (555) 000-0000" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
              </div>
              {/* Sellers: website (sellers.website) */}
              {roleKey === 'seller' && (
                <div>
                  <label className="field-label" htmlFor="pf-website">Website</label>
                  <input id="pf-website" className="field-input" placeholder="https://shop.example.com" value={form.website} onChange={e => set('website', e.target.value)} />
                </div>
              )}
              {roleKey === 'customer' && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="field-label" htmlFor="pf-mobile">Mobile <span className="text-on-surface-variant font-normal">(optional)</span></label><input id="pf-mobile" className="field-input" type="tel" placeholder="+1 (555) 000-0000" value={form.mobile ?? ''} onChange={e => set('mobile', e.target.value)} /></div>
                </div>
              )}
            </div>
          </section>

          {/* ── Address — customers only (the only party table with address columns) ── */}
          {roleKey === 'customer' && (
            <section>
              <div className="section-h">Address</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label" htmlFor="pf-street1">Street 1</label><input id="pf-street1" className="field-input" placeholder="Street 1" value={form.street1} onChange={e => set('street1', e.target.value)} /></div>
                <div><label className="field-label" htmlFor="pf-street2">Street 2</label><input id="pf-street2" className="field-input" placeholder="Street 2" value={form.street2} onChange={e => set('street2', e.target.value)} /></div>
                <div><label className="field-label" htmlFor="pf-city">City</label><input id="pf-city" className="field-input" placeholder="City" value={form.city} onChange={e => set('city', e.target.value)} /></div>
                <div><label className="field-label" htmlFor="pf-state">State / Province</label><input id="pf-state" className="field-input" placeholder="State" value={form.state} onChange={e => set('state', e.target.value)} /></div>
                <div><label className="field-label" htmlFor="pf-zip">ZIP / Postal</label><input id="pf-zip" className="field-input" placeholder="ZIP" value={form.zip} onChange={e => set('zip', e.target.value)} /></div>
                <div>
                  <label className="field-label" htmlFor="pf-country">Country</label>
                  <select id="pf-country" className="field-input" value={form.country} onChange={e => set('country', e.target.value)}>
                    {COUNTRY_LABELS.map(label => <option key={label} value={COUNTRY_TO_CODE[label]}>{label}</option>)}
                  </select>
                </div>
              </div>
            </section>
          )}

          {/* ── Customer details — customer_type + marketing opt-ins ── */}
          {roleKey === 'customer' && (
            <div className="role-section">
              <div className="text-label-sm font-bold text-primary mb-2 flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">person</span>Customer details</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="pf-ctype">Customer type</label>
                  <select id="pf-ctype" className="field-input" value={form.customerType} onChange={e => set('customerType', e.target.value)}>
                    {CUSTOMER_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={form.marketingEmail} onChange={e => set('marketingEmail', e.target.checked)} /> Marketing email opt-in</label>
                <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={form.marketingSms} onChange={e => set('marketingSms', e.target.checked)} /> Marketing SMS opt-in</label>
              </div>
            </div>
          )}

          {/* ── Vendor details — terms, 1099, tax, W-9 ── */}
          {roleKey === 'vendor' && (
            <div className="role-section">
              <div className="text-label-sm font-bold text-qb-blue mb-2 flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">storefront</span>Vendor details</div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="field-label" htmlFor="pf-vterms">Payment terms (days)</label><input id="pf-vterms" className="field-input" type="number" min={0} value={form.vendorTerms} onChange={e => set('vendorTerms', e.target.value)} /></div>
                <div><label className="field-label" htmlFor="pf-taxid">Tax ID</label><input id="pf-taxid" className="field-input code-mono" placeholder="XX-XXXXXXX" value={form.taxNumber} onChange={e => set('taxNumber', e.target.value)} /></div>
              </div>
              <div className="mt-3 space-y-1.5">
                <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={form.is1099} onChange={e => set('is1099', e.target.checked)} /> Track for 1099</label>
                {form.is1099 && (
                  <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className="row-check" checked={form.w9Received} onChange={e => set('w9Received', e.target.checked)} /> W-9 received</label>
                )}
              </div>
            </div>
          )}

          {/* ── Supplier details — kind + API URL ── */}
          {roleKey === 'supplier' && (
            <div className="role-section">
              <div className="text-label-sm font-bold text-error mb-2 flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">factory</span>Supplier details</div>
              <div className="space-y-3">
                <div>
                  <label className="field-label" htmlFor="pf-kind">Kind</label>
                  <select id="pf-kind" className="field-input" value={form.kind} onChange={e => set('kind', e.target.value)}>
                    {SUPPLIER_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="pf-apiurl">Catalog / API URL <span className="text-on-surface-variant font-normal">(optional — marks the catalog source as “api”)</span></label>
                  <input id="pf-apiurl" className="field-input code-mono" placeholder="https://supplier.com/api" value={form.apiUrl} onChange={e => set('apiUrl', e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {/* ── Seller details — applicant type + commission rate ── */}
          {roleKey === 'seller' && (
            <div className="role-section">
              <div className="text-label-sm font-bold text-primary mb-2 flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">storefront</span>Seller details</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="pf-atype">Applicant type</label>
                  <select id="pf-atype" className="field-input" value={form.applicantType} onChange={e => set('applicantType', e.target.value)}>
                    <option value="individual">Individual</option>
                    <option value="business">Business</option>
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="pf-comm">Commission rate (%)</label>
                  <input id="pf-comm" className="field-input" type="number" min={0} max={100} step="0.1" placeholder="e.g. 12.5" value={form.commissionRate} onChange={e => set('commissionRate', e.target.value)} />
                </div>
              </div>
              <p className="text-[11px] text-on-surface-variant mt-2">
                New sellers start in the “applied” onboarding state with tax form “not required” — the Seller relationships module tracks onboarding, violations and appeals from there.
              </p>
            </div>
          )}

          {/* ── Lead details — source, type, status, next follow-up, notes ── */}
          {roleKey === 'lead' && (
            <div className="role-section">
              <div className="text-label-sm font-bold text-qb-maroon mb-2 flex items-center gap-1"><span className="material-symbols-outlined text-[16px]">flag</span>Lead details</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label" htmlFor="pf-lsource">Lead source</label>
                  <select id="pf-lsource" className="field-input" value={form.leadSource} onChange={e => set('leadSource', e.target.value)}>
                    {LEAD_SOURCES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="pf-ltype">Lead type</label>
                  <select id="pf-ltype" className="field-input" value={form.leadType} onChange={e => set('leadType', e.target.value)}>
                    {LEAD_TYPES.map(t => <option key={t}>{t.replace('_', ' ')}</option>)}
                  </select>
                </div>
                <div>
                  <label className="field-label" htmlFor="pf-lstatus">Status</label>
                  <select id="pf-lstatus" className="field-input" value={form.leadStatus} onChange={e => set('leadStatus', e.target.value)}>
                    {LEAD_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
                <div><label className="field-label" htmlFor="pf-followup">Next follow-up</label><input id="pf-followup" className="field-input" type="date" value={form.nextFollowUp} onChange={e => set('nextFollowUp', e.target.value)} /></div>
              </div>
              <div className="mt-3">
                <label className="field-label" htmlFor="pf-notes">Notes</label>
                <textarea id="pf-notes" className="field-textarea" placeholder="Context for this lead…" value={form.notes} onChange={e => set('notes', e.target.value)} />
              </div>
            </div>
          )}

          {/* ── Notes — customers only (crm_notes); leads use the notes field above ── */}
          {roleKey === 'customer' && (
            <section>
              <div className="section-h">Notes</div>
              <textarea className="field-textarea" placeholder="Anything worth remembering — lands in the Notes tab of the profile." value={form.notes} onChange={e => set('notes', e.target.value)} />
            </section>
          )}
        </div>

        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <div className="flex items-center gap-2">
            {!editing && <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low disabled:opacity-50" onClick={saveAndNew} disabled={saving}>Save and new</button>}
            <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50" onClick={saveAndClose} disabled={saving}>{saving ? 'Saving…' : 'Save and close'}</button>
          </div>
        </div>
      </div>
    </>
  );
}
