'use client';
/**
 * ProductFormDrawer — the ONE form for creating and editing catalog products.
 * Mirrors PartyFormDrawer: every "New product" button and every profile Edit
 * opens this drawer. Create → POST /api/products; edit → PATCH /api/products/[id].
 * Fields map to real `products` columns (name, description, status, category,
 * brand, tags, merchandising flags, fulfillment type).
 */
import { useEffect, useMemo, useState } from 'react';
import { fetchJson, useProductCategories } from '@/hooks/useCrmApi';

export interface ProductFormEditTarget {
  id: string;
  name: string;
  description?: string | null;
  short_description?: string | null;
  status?: string | null;
  category_id?: string | null;
  brand?: string | null;
  tags?: string[];
  is_featured?: boolean;
  is_new?: boolean;
  is_best_seller?: boolean;
  is_house_favorite?: boolean;
  fulfillment_type?: string | null;
}

interface ProductFormDrawerProps {
  open: boolean;
  editing?: ProductFormEditTarget | null;
  onClose: () => void;
  onSaved?: (name: string, mode: 'created' | 'updated') => void;
  onToast: (m: string) => void;
}

const STATUSES = [
  { id: 'draft', label: 'Draft' },
  { id: 'published', label: 'Published' },
  { id: 'archived', label: 'Archived' },
];

const FULFILLMENT_TYPES = [
  { id: 'stocked', label: 'Stocked (warehouse)' },
  { id: 'pod', label: 'Print-on-demand' },
  { id: 'digital', label: 'Digital' },
];

export default function ProductFormDrawer({ open, editing, onClose, onSaved, onToast }: ProductFormDrawerProps) {
  const isEdit = !!editing;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [categoryId, setCategoryId] = useState('');
  const [brand, setBrand] = useState('');
  const [tagsText, setTagsText] = useState('');
  const [fulfillmentType, setFulfillmentType] = useState('stocked');
  const [isFeatured, setIsFeatured] = useState(false);
  const [isNew, setIsNew] = useState(false);
  const [isBestSeller, setIsBestSeller] = useState(false);
  const [isHouseFavorite, setIsHouseFavorite] = useState(false);
  const [saving, setSaving] = useState(false);

  const { data: categories } = useProductCategories();

  // Group categories by parent for <optgroup>-style selects
  const grouped = useMemo(() => {
    const byId = new Map(categories.map(c => [c.id, c]));
    const roots = categories.filter(c => !c.parent_id || !byId.has(c.parent_id));
    const childrenOf = new Map<string, typeof categories>();
    for (const c of categories) {
      if (c.parent_id && byId.has(c.parent_id)) {
        const arr = childrenOf.get(c.parent_id) || [];
        arr.push(c);
        childrenOf.set(c.parent_id, arr);
      }
    }
    return { roots, childrenOf, byId };
  }, [categories]);

  // Prefill on open
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setName(editing.name || '');
      setDescription(editing.description || '');
      setStatus(editing.status || 'draft');
      setCategoryId(editing.category_id || '');
      setBrand(editing.brand || '');
      setTagsText((editing.tags || []).join(', '));
      setFulfillmentType(editing.fulfillment_type || 'stocked');
      setIsFeatured(!!editing.is_featured);
      setIsNew(!!editing.is_new);
      setIsBestSeller(!!editing.is_best_seller);
      setIsHouseFavorite(!!editing.is_house_favorite);
    } else {
      setName('');
      setDescription('');
      setStatus('draft');
      setCategoryId('');
      setBrand('');
      setTagsText('');
      setFulfillmentType('stocked');
      setIsFeatured(false);
      setIsNew(false);
      setIsBestSeller(false);
      setIsHouseFavorite(false);
    }
  }, [open, editing]);

  if (!open) return null;

  const tags = tagsText.split(',').map(t => t.trim()).filter(Boolean);

  async function handleSave() {
    if (!name.trim()) {
      onToast('Product name is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        status,
        category_id: categoryId || null,
        brand: brand.trim() || null,
        tags,
        fulfillment_type: fulfillmentType,
        is_featured: isFeatured,
        is_new: isNew,
        is_best_seller: isBestSeller,
        is_house_favorite: isHouseFavorite,
      };
      const res = isEdit && editing
        ? await fetchJson(`/api/products/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) })
        : await fetchJson('/api/products', { method: 'POST', body: JSON.stringify(payload) });
      if (res.ok) {
        onToast(isEdit ? 'Product saved' : 'Product created');
        onSaved?.(name.trim(), isEdit ? 'updated' : 'created');
        onClose();
      } else {
        onToast(`Save failed: ${res.error}`);
      }
    } catch (e: unknown) {
      onToast(`Error: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="drawer-scrim open" onClick={onClose} />
      <div className="drawer open" role="dialog" aria-label={isEdit ? 'Edit product' : 'New product'} style={{ width: 520 }}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
          <div className="min-w-0">
            <h3 className="text-[16px] font-semibold">{isEdit ? 'Edit product' : 'New product'}</h3>
            <div className="text-[11px] text-on-surface-variant truncate">
              {isEdit ? 'Changes save to the products table' : 'Creates a row in the products table'}
            </div>
          </div>
          <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div>
            <label className="field-label" htmlFor="pf-name">Product name</label>
            <input id="pf-name" className="field-input" autoFocus placeholder="e.g. Kin Keeper Ceramic Mug" value={name} onChange={e => setName(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="pf-status">Status</label>
              <select id="pf-status" className="field-input" value={status} onChange={e => setStatus(e.target.value)}>
                {STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="pf-category">Category</label>
              <select id="pf-category" className="field-input" value={categoryId} onChange={e => setCategoryId(e.target.value)}>
                <option value="">— No category —</option>
                {grouped.roots.map(root => (
                  <optgroup key={root.id} label={root.name}>
                    <option value={root.id}>{root.name}</option>
                    {(grouped.childrenOf.get(root.id) || []).map(child => (
                      <option key={child.id} value={child.id}>{root.name} › {child.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="pf-brand">Brand</label>
              <input id="pf-brand" className="field-input" placeholder="e.g. Gildan" value={brand} onChange={e => setBrand(e.target.value)} />
            </div>
            <div>
              <label className="field-label" htmlFor="pf-fulfillment">Fulfillment type</label>
              <select id="pf-fulfillment" className="field-input" value={fulfillmentType} onChange={e => setFulfillmentType(e.target.value)}>
                {FULFILLMENT_TYPES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="field-label" htmlFor="pf-desc">Description</label>
            <textarea id="pf-desc" className="field-textarea" rows={4} placeholder="What is this product? Shown on the storefront and the product profile." value={description} onChange={e => setDescription(e.target.value)} />
          </div>

          <div>
            <label className="field-label" htmlFor="pf-tags">Tags <span className="font-normal text-on-surface-variant">(comma-separated)</span></label>
            <input id="pf-tags" className="field-input" placeholder="gifts, family, ceramic" value={tagsText} onChange={e => setTagsText(e.target.value)} />
          </div>

          <div>
            <label className="field-label">Merchandising flags</label>
            <div className="grid grid-cols-2 gap-2 pt-1">
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={isFeatured} onChange={e => setIsFeatured(e.target.checked)} /> Featured
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={isNew} onChange={e => setIsNew(e.target.checked)} /> New
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={isBestSeller} onChange={e => setIsBestSeller(e.target.checked)} /> Best seller
              </label>
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={isHouseFavorite} onChange={e => setIsHouseFavorite(e.target.checked)} /> House favorite
              </label>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
          <button className="h-8 px-4 border border-surface-dim rounded text-[13px] hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button
            className="h-8 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-50"
            disabled={!name.trim() || saving}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : isEdit ? 'Save and close' : 'Create product'}
          </button>
        </div>
      </div>
    </>
  );
}
