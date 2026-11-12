'use client';
/* UniversalPickers.tsx — The 3 universal pickers from platform-component-map.md §1.4
   These appear in every Document, Task, Ticket, Campaign.
   - PartyPicker: typeahead, role-filtered, +Add new opens Party drawer inline, shows balance pill
   - ItemPicker: search by name/SKU, shows price/cost/stock pill, +Add product opens Item drawer
   - AccountPicker: typeahead with account type grouping, +Add account opens CoA drawer */

import { useState, useRef, useEffect, useMemo } from 'react';
import { usePlatformStore, type PartyRole, type Party, type Item, type Account, type AccountType } from '@/lib/platformStore';

/* ═══════════════════════════════════════════════════
   PARTY PICKER
   Typeahead, role-filtered, shows balance pill.
   §1.4: "Every Document, Task, Ticket, Campaign target"
   ═══════════════════════════════════════════════════ */

interface PartyPickerProps {
  value: string | null;
  onChange: (partyId: string | null) => void;
  role?: PartyRole | null; // filter by role
  label?: string;
  placeholder?: string;
  required?: boolean;
  onAddNew?: () => void; // opens Party drawer
}

export function PartyPicker({ value, onChange, role, label = 'Party', placeholder, required, onAddNew }: PartyPickerProps) {
  const parties = usePlatformStore(s => s.parties);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const selected = value ? parties.find(p => p.id === value) : null;
  const filtered = useMemo(() => {
    let list = parties;
    if (role) list = list.filter(p => p.roles.includes(role));
    if (query) list = list.filter(p => (p.name + ' ' + p.email + ' ' + p.phone).toLowerCase().includes(query.toLowerCase()));
    return list.slice(0, 20);
  }, [parties, role, query]);

  return (
    <div ref={ref} className="relative">
      {label && <label className="field-label">{label}{required && ' *'}</label>}
      {selected ? (
        <div className="flex items-center gap-2 border border-surface-dim rounded px-2 py-1.5 bg-white">
          <div className="avatar" style={{ width: 24, height: 24, fontSize: 9 }}>{selected.name.slice(0, 2).toUpperCase()}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{selected.name}</div>
            <div className="text-[10px] text-on-surface-variant">{selected.roles.join(', ')}</div>
          </div>
          {selected.balance !== 0 && (
            <span className={`pill ${selected.balance > 0 ? 'bad' : 'info'}`} style={{ fontSize: 9 }}>
              {selected.balance > 0 ? `+$${selected.balance.toFixed(0)}` : `-$${Math.abs(selected.balance).toFixed(0)}`}
            </span>
          )}
          <button type="button" className="text-on-surface-variant hover:text-error" onClick={() => onChange(null)}>
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
          <button type="button" className="text-on-surface-variant hover:text-primary" onClick={() => setOpen(true)}>
            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
          </button>
        </div>
      ) : (
        <input
          type="text"
          className="field-input"
          placeholder={placeholder || `Search ${role || 'parties'}…`}
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
        />
      )}
      {open && !selected && (
        <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, right: 0, minWidth: '100%', marginTop: 4, zIndex: 9999 }}>
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-[12px] text-on-surface-variant">No matches found.</div>
          ) : (
            filtered.map(p => (
              <button key={p.id} type="button" className="w-full text-left px-3 py-2 hover:bg-surface-container-low flex items-center gap-2" onClick={() => { onChange(p.id); setOpen(false); setQuery(''); }}>
                <div className="avatar" style={{ width: 24, height: 24, fontSize: 9 }}>{p.name.slice(0, 2).toUpperCase()}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-medium truncate">{p.name}</div>
                  <div className="text-[10px] text-on-surface-variant truncate">{p.email}</div>
                </div>
                <div className="flex gap-1">{p.roles.slice(0, 2).map(r => <span key={r} className="pill role" style={{ fontSize: 8, padding: '1px 4px' }}>{r}</span>)}</div>
              </button>
            ))
          )}
          {onAddNew && (
            <>
              <div className="sep" />
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-surface-container-low text-primary font-semibold flex items-center gap-2" onClick={() => { onAddNew(); setOpen(false); }}>
                <span className="material-symbols-outlined text-[16px]">person_add</span>Add new {role || 'party'}…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ITEM PICKER
   Search by name/SKU, shows price/cost/stock pill.
   §1.4: "Invoice/Bill/PO/Order lines, Bundles, Discounts"
   ═══════════════════════════════════════════════════ */

interface ItemPickerProps {
  value: string | null;
  onChange: (itemId: string | null) => void;
  label?: string;
  placeholder?: string;
  onAddNew?: () => void;
}

export function ItemPicker({ value, onChange, label = 'Item', placeholder, onAddNew }: ItemPickerProps) {
  const items = usePlatformStore(s => s.items);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const selected = value ? items.find(i => i.id === value) : null;
  const filtered = useMemo(() => {
    if (!query) return items.slice(0, 20);
    return items.filter(i => (i.name + ' ' + i.sku + ' ' + i.category).toLowerCase().includes(query.toLowerCase())).slice(0, 20);
  }, [items, query]);

  return (
    <div ref={ref} className="relative">
      {label && <label className="field-label">{label}</label>}
      {selected ? (
        <div className="flex items-center gap-2 border border-surface-dim rounded px-2 py-1.5 bg-white">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{selected.name}</div>
            <div className="text-[10px] text-on-surface-variant">{selected.sku} · ${selected.price.toFixed(2)}</div>
          </div>
          {selected.trackInventory && (
            <span className={`pill ${selected.stockOnHand <= selected.reorderPoint ? 'bad' : 'ok'}`} style={{ fontSize: 9 }}>
              {selected.stockOnHand} in stock
            </span>
          )}
          <button type="button" className="text-on-surface-variant hover:text-error" onClick={() => onChange(null)}>
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      ) : (
        <input type="text" className="field-input" placeholder={placeholder || 'Search by name or SKU…'} value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      )}
      {open && !selected && (
        <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, right: 0, minWidth: '100%', marginTop: 4, zIndex: 9999 }}>
          {filtered.map(i => (
            <button key={i.id} type="button" className="w-full text-left px-3 py-2 hover:bg-surface-container-low flex items-center gap-2" onClick={() => { onChange(i.id); setOpen(false); setQuery(''); }}>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-medium truncate">{i.name}</div>
                <div className="text-[10px] text-on-surface-variant">{i.sku} · ${i.price.toFixed(2)}</div>
              </div>
              {i.trackInventory && <span className={`pill ${i.stockOnHand <= i.reorderPoint ? 'bad' : 'ok'}`} style={{ fontSize: 8, padding: '1px 4px' }}>{i.stockOnHand}</span>}
              <span className="pill role" style={{ fontSize: 8, padding: '1px 4px' }}>{i.type}</span>
            </button>
          ))}
          {onAddNew && (
            <>
              <div className="sep" />
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-surface-container-low text-primary font-semibold flex items-center gap-2" onClick={() => { onAddNew(); setOpen(false); }}>
                <span className="material-symbols-outlined text-[16px]">add_circle</span>Add new item…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   ACCOUNT PICKER
   Typeahead with account type grouping.
   §1.4: "Expense, Bill lines, Journal, Transfer, Rules"
   ═══════════════════════════════════════════════════ */

interface AccountPickerProps {
  value: string | null;
  onChange: (accountId: string | null) => void;
  label?: string;
  filterType?: AccountType | null;
  placeholder?: string;
  onAddNew?: () => void;
}

export function AccountPicker({ value, onChange, label = 'Account', filterType, placeholder, onAddNew }: AccountPickerProps) {
  const accounts = usePlatformStore(s => s.accounts);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const selected = value ? accounts.find(a => a.id === value) : null;
  const filtered = useMemo(() => {
    let list = accounts.filter(a => a.active);
    if (filterType) list = list.filter(a => a.type === filterType);
    if (query) list = list.filter(a => (a.name + ' ' + a.number + ' ' + a.type).toLowerCase().includes(query.toLowerCase()));
    return list.slice(0, 30);
  }, [accounts, filterType, query]);

  // Group by type
  const grouped = useMemo(() => {
    const groups: Record<string, typeof filtered> = {};
    filtered.forEach(a => { if (!groups[a.type]) groups[a.type] = []; groups[a.type].push(a); });
    return groups;
  }, [filtered]);

  return (
    <div ref={ref} className="relative">
      {label && <label className="field-label">{label}</label>}
      {selected ? (
        <div className="flex items-center gap-2 border border-surface-dim rounded px-2 py-1.5 bg-white">
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate">{selected.name}</div>
            <div className="text-[10px] text-on-surface-variant">{selected.number} · {selected.type}</div>
          </div>
          <button type="button" className="text-on-surface-variant hover:text-error" onClick={() => onChange(null)}>
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      ) : (
        <input type="text" className="field-input" placeholder={placeholder || 'Search accounts…'} value={query} onChange={e => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
      )}
      {open && !selected && (
        <div className="row-menu open" style={{ position: 'absolute', top: '100%', left: 0, right: 0, minWidth: '100%', marginTop: 4, maxHeight: '400px', overflowY: 'auto', zIndex: 9999 }}>
          {Object.entries(grouped).map(([type, accts]) => (
            <div key={type}>
              <div className="menu-header">{type}</div>
              {accts.map(a => (
                <button key={a.id} type="button" className="w-full text-left px-3 py-2 hover:bg-surface-container-low flex items-center gap-2" onClick={() => { onChange(a.id); setOpen(false); setQuery(''); }}>
                  <span className="code-mono text-[10px] text-on-surface-variant">{a.number}</span>
                  <span className="text-[13px] flex-1">{a.name}</span>
                  {a.balance !== 0 && <span className="text-[10px] text-on-surface-variant tabular-nums">${Math.abs(a.balance).toLocaleString()}</span>}
                </button>
              ))}
            </div>
          ))}
          {onAddNew && (
            <>
              <div className="sep" />
              <button type="button" className="w-full text-left px-3 py-2 hover:bg-surface-container-low text-primary font-semibold flex items-center gap-2" onClick={() => { onAddNew(); setOpen(false); }}>
                <span className="material-symbols-outlined text-[16px]">add_circle</span>Add new account…
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
