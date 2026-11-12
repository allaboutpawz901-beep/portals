'use client';
import './sales.css';
import { useState, useMemo, useRef, useEffect } from 'react';
import { SalesScreenProps, SALES_NAV } from './types';
import { exportToCsv } from '@/lib/csvExport';

type ProductStatus = 'Published' | 'Draft' | 'Archived';

interface ProductRow {
  id: string;
  name: string;
  skus: string;
  supplier: string;
  price: string;
  margin: string;
  marginTone: 'green' | 'muted';
  status: ProductStatus;
  thumbClass: string;
  archived?: boolean;
}

const PRODUCTS: ProductRow[] = [
  {
    id: 'p1',
    name: 'Classic Tee',
    skus: 'TEE-001, TEE-002, TEE-003',
    supplier: 'Printful',
    price: '$24.00',
    margin: '62%',
    marginTone: 'green',
    status: 'Published',
    thumbClass: 'bg-gradient-to-br from-qb-blue to-qb-navy',
  },
  {
    id: 'p2',
    name: 'Canvas Tote',
    skus: 'TOTE-014',
    supplier: 'Gelato',
    price: '$18.00',
    margin: '55%',
    marginTone: 'green',
    status: 'Published',
    thumbClass: 'bg-gradient-to-br from-qb-green to-qb-teal',
  },
  {
    id: 'p3',
    name: 'Mug 11oz',
    skus: 'MUG-003',
    supplier: 'Printify',
    price: '$14.00',
    margin: '48%',
    marginTone: 'muted',
    status: 'Draft',
    thumbClass: 'bg-gradient-to-br from-qb-maroon to-qb-navy',
  },
  {
    id: 'p4',
    name: 'Hoodie — Heavyweight',
    skus: 'HD-210, HD-211, HD-212, HD-213',
    supplier: 'Printful',
    price: '$58.00',
    margin: '64%',
    marginTone: 'green',
    status: 'Published',
    thumbClass: 'bg-gradient-to-br from-qb-teal to-qb-green',
  },
  {
    id: 'p5',
    name: 'Design retainer',
    skus: 'SVC-001',
    supplier: '—',
    price: '$1,200.00',
    margin: '88%',
    marginTone: 'green',
    status: 'Published',
    thumbClass: 'bg-gradient-to-br from-qb-blue to-qb-teal',
  },
  {
    id: 'p6',
    name: 'Sticker pack (old)',
    skus: 'STK-09',
    supplier: 'Gelato',
    price: '$8.00',
    margin: '40%',
    marginTone: 'muted',
    status: 'Archived',
    thumbClass: 'bg-surface-container',
    archived: true,
  },
];

type TabKey = 'All' | 'Published' | 'Draft' | 'Archived';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'All', label: 'All' },
  { key: 'Published', label: 'Published' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Archived', label: 'Archived' },
];

const SUPPLIERS = ['', 'Printful', 'Gelato', 'Printify'];

const ROW_MENU_ACTIONS: {
  key: string;
  label: string;
  icon: string;
  sepAfter?: boolean;
  danger?: boolean;
}[] = [
  { key: 'edit', label: 'Edit', icon: 'edit' },
  { key: 'duplicate', label: 'Duplicate', icon: 'content_copy', sepAfter: true },
  { key: 'publish', label: 'Publish', icon: 'publish' },
  { key: 'reprice', label: 'Reprice', icon: 'sell' },
  { key: 'studio', label: 'Open in Studio', icon: 'palette', sepAfter: true },
  { key: 'invoices', label: 'View sales', icon: 'receipt_long' },
  { key: 'supplier', label: 'View supplier', icon: 'factory', sepAfter: true },
  { key: 'archive', label: 'Archive', icon: 'archive' },
  { key: 'delete', label: 'Delete', icon: 'delete', danger: true },
];

export default function ProductsServicesScreen({
  onNavigate,
  onToast,
  onCreate,
  onOpenCreateFlyout,
}: SalesScreenProps) {
  const [activeTab, setActiveTab] = useState<TabKey>('All');
  const [searchText, setSearchText] = useState('');
  const [supplierFilter, setSupplierFilter] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenuOpen, setRowMenuOpen] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [currentRow, setCurrentRow] = useState<ProductRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<ProductRow | null>(null);
  const [purchaseEnabled, setPurchaseEnabled] = useState(true);

  const rowMenuRef = useRef<HTMLDivElement | null>(null);

  // Filtered rows based on tab + search + supplier filter
  const filteredRows = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return PRODUCTS.filter((p) => {
      if (activeTab !== 'All' && p.status !== activeTab) return false;
      if (supplierFilter && p.supplier !== supplierFilter) return false;
      if (q) {
        const hay = `${p.name} ${p.skus} ${p.supplier}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [activeTab, searchText, supplierFilter]);

  const countLabel = `1–${filteredRows.length} of ${PRODUCTS.length}`;

  // Bulk bar
  const bulkVisible = selected.size > 0;
  const allChecked =
    filteredRows.length > 0 && filteredRows.every((p) => selected.has(p.id));

  const toggleRow = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filteredRows.map((p) => p.id)));
    }
  };

  const clearSelection = () => setSelected(new Set());

  const handleBulkAction = (
    action: 'publish' | 'archive' | 'reprice' | 'export' | 'delete',
  ) => {
    const n = selected.size;
    onToast(`${action.toUpperCase()} on ${n} product${n !== 1 ? 's' : ''}`);
    clearSelection();
  };

  // Row ⋯ menu — close on outside click
  useEffect(() => {
    if (!rowMenuOpen) return;
    const handle = (e: MouseEvent) => {
      if (rowMenuRef.current && !rowMenuRef.current.contains(e.target as Node)) {
        setRowMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [rowMenuOpen]);

  const openRowMenu = (e: React.MouseEvent<HTMLButtonElement>, product: ProductRow) => {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    const menuWidth = 200;
    const menuHeight = 300;
    const top = r.bottom + 4 + menuHeight > window.innerHeight
      ? Math.max(10, r.top - menuHeight - 4)
      : r.bottom + 4;
    const left = Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 20);
    setRowMenuPos({ top, left });
    setCurrentRow(product);
    setRowMenuOpen(true);
  };

  const closeRowMenu = () => {
    setRowMenuOpen(false);
    setCurrentRow(null);
    setRowMenuPos(null);
  };

  const handleRowMenuAction = (action: string) => {
    const name = currentRow?.name ?? 'product';
    closeRowMenu();
    if (action === 'edit' && currentRow) {
      openDrawer(currentRow);
      return;
    }
    if (action === 'delete') {
      onToast(`Delete "${name}"? Confirm in modal.`);
      return;
    }
    onToast(`${action.charAt(0).toUpperCase() + action.slice(1)} → ${name}`);
  };

  // Drawer
  const openDrawer = (product: ProductRow | null) => {
    setDrawerProduct(product);
    setDrawerOpen(true);
  };

  const closeDrawer = () => setDrawerOpen(false);

  const handleNewProduct = () => openDrawer(null);

  const handleSave = () => {
    closeDrawer();
    onToast('Product saved');
  };

  const handleSaveAndNew = () => {
    onToast('Product saved');
    setDrawerProduct(null);
  };

  // Row click → drawer (skip when clicking checkbox / ⋯ button)
  const handleRowClick = (
    e: React.MouseEvent<HTMLTableRowElement>,
    product: ProductRow,
  ) => {
    if ((e.target as HTMLElement).closest('input,button')) return;
    openDrawer(product);
  };

  const drawerTitle = drawerProduct ? drawerProduct.name : 'New product';

  const statusBadgeClass = (s: ProductStatus) =>
    s === 'Published'
      ? 'bg-secondary-container text-on-secondary-container'
      : 'bg-surface-container text-on-surface-variant';

  const cellMuted = (p: ProductRow) => (p.archived ? 'text-on-surface-variant' : '');

  const marginClass = (p: ProductRow) => {
    if (p.archived) return 'text-on-surface-variant';
    if (p.marginTone === 'green') return 'text-secondary font-medium';
    return '';
  };

  return (
    <>
      {/* Context header */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
            account_balance
          </span>
          <span className="text-label-md font-semibold">Finance</span>
          <span className="text-outline">/</span>
          <button
            type="button"
            onClick={() => onNavigate(...SALES_NAV.overview())}
            className="text-label-md hover:text-primary hover:underline"
          >
            Sales &amp; Get Paid
          </button>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">
            Products &amp; services
          </span>
        </div>
      </div>

      <main className="px-6 pb-12">
        {/* Page header */}
        <div className="flex items-center justify-between gap-4 py-4">
          <div>
            <h1 className="text-headline-lg">Products &amp; services</h1>
            <p className="text-body-sm text-on-surface-variant mt-0.5">
              Same list as Catalog › Products. §B3 drawer: Basic · Sales · Purchasing ·
              Inventory · Commerce.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex split-btn">
              <button
                onClick={handleNewProduct}
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main"
              >
                <span className="material-symbols-outlined text-[16px]">add</span>New product
              </button>
              <button
                onClick={handleNewProduct}
                className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow"
              >
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <button
              onClick={() => {
                const cols = [
                  { key: 'name', label: 'Name' },
                  { key: 'skus', label: 'SKUs' },
                  { key: 'supplier', label: 'Supplier' },
                  { key: 'price', label: 'Price' },
                  { key: 'margin', label: 'Margin' },
                  { key: 'status', label: 'Status' },
                ];
                exportToCsv(filteredRows as unknown as Record<string, unknown>[], cols, 'products-services');
                onToast(`Exported ${filteredRows.length} records to CSV`);
              }}
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>Export
            </button>
            <button
              onClick={() => onToast('Customize panel')}
              className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">tune</span>Customize
            </button>
          </div>
        </div>

        {/* Create actions row */}
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">
            Create actions:
          </span>
          <button
            onClick={() => onCreate('Product')}
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">checkroom</span>Product
          </button>
          <button
            onClick={() => onCreate('Service')}
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">handyman</span>Service
          </button>
          <button
            onClick={() => onCreate('Bundle')}
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">inventory_2</span>Bundle
          </button>
          <button
            onClick={() => onCreate('Category')}
            className="h-8 px-3 rounded-lg bg-white border border-surface-dim hover:bg-primary hover:text-white text-on-surface text-label-sm flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">category</span>Category
          </button>
          <button
            onClick={() => onOpenCreateFlyout()}
            className="h-8 px-3 rounded-lg bg-surface-container hover:bg-surface-container-high text-label-sm flex items-center gap-1"
          >
            <span className="material-symbols-outlined text-[16px]">apps</span>Show all
          </button>
        </div>

        {/* Table card */}
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
          {/* Tabs */}
          <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`h-full px-3 text-label-md tab-underline ${
                  activeTab === t.key ? 'active' : 'text-on-surface-variant'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Filter bar */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">
                search
              </span>
              <input
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                placeholder="Filter by name, SKU, supplier…"
              />
            </div>
            <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-on-surface-variant">
                factory
              </span>
              <span className="text-on-surface-variant">Supplier:</span>
              <select
                value={supplierFilter}
                onChange={(e) => setSupplierFilter(e.target.value)}
                className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none"
              >
                {SUPPLIERS.map((s) => (
                  <option key={s} value={s}>
                    {s === '' ? 'All' : s}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => onToast('Open filter panel')}
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter
            </button>
            <button
              onClick={() => onToast('Saved views')}
              className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[14px]">bookmark</span>Saved views
            </button>
            <span className="ml-auto text-[11px] text-on-surface-variant">{countLabel}</span>
          </div>

          {/* Bulk bar */}
          <div className={`bulk-bar ${bulkVisible ? 'show' : ''}`}>
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => handleBulkAction('publish')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">
                publish
              </span>
              Publish
            </button>
            <button onClick={() => handleBulkAction('archive')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">
                archive
              </span>
              Archive
            </button>
            <button onClick={() => handleBulkAction('reprice')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">
                sell
              </span>
              Reprice
            </button>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => handleBulkAction('export')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">
                download
              </span>
              Export
            </button>
            <button onClick={() => handleBulkAction('delete')}>
              <span className="material-symbols-outlined text-[14px] align-middle mr-1">
                delete
              </span>
              Delete
            </button>
            <button className="ml-auto" onClick={clearSelection}>
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>

          {/* Table */}
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    className="row-check"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
                <th className="px-3 py-2 w-14">Thumb</th>
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">SKUs</th>
                <th className="px-3 py-2">Supplier</th>
                <th className="px-3 py-2 text-right">Price</th>
                <th className="px-3 py-2 text-right">Margin</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filteredRows.map((p) => (
                <tr
                  key={p.id}
                  onClick={(e) => handleRowClick(e, p)}
                  className="hover:bg-surface-container-low cursor-pointer"
                >
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={selected.has(p.id)}
                      onChange={() => toggleRow(p.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <div className={`w-10 h-10 rounded ${p.thumbClass}`}></div>
                  </td>
                  <td className={`px-3 py-2 font-medium ${cellMuted(p)}`}>{p.name}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{p.skus}</td>
                  <td className={`px-3 py-2 ${cellMuted(p)}`}>{p.supplier}</td>
                  <td className={`px-3 py-2 text-right tabular-nums ${cellMuted(p)}`}>
                    {p.price}
                  </td>
                  <td className={`px-3 py-2 text-right tabular-nums ${marginClass(p)}`}>
                    {p.margin}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`px-2 py-0.5 rounded-full text-label-sm ${statusBadgeClass(
                        p.status,
                      )}`}
                    >
                      {p.status}
                    </span>
                  </td>
                  <td className="px-2 py-2 text-right">
                    <button
                      onClick={(e) => openRowMenu(e, p)}
                      className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                    >
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                        more_horiz
                      </span>
                    </button>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-3 py-8 text-center text-on-surface-variant"
                  >
                    No products match the current filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>

      {/* Row ⋯ menu (positioned dropdown) */}
      <div
        ref={rowMenuRef}
        className={`row-menu ${rowMenuOpen ? 'open' : ''}`}
        style={
          rowMenuPos
            ? { top: rowMenuPos.top, left: rowMenuPos.left }
            : undefined
        }
      >
        {ROW_MENU_ACTIONS.map((a) => (
          <div key={a.key}>
            <button
              onClick={() => handleRowMenuAction(a.key)}
              className={a.danger ? 'danger' : ''}
            >
              <span className="material-symbols-outlined text-[16px] text-on-surface-variant">
                {a.icon}
              </span>
              {a.label}
            </button>
            {a.sepAfter && <div className="sep"></div>}
          </div>
        ))}
      </div>

      {/* Drawer scrim */}
      <div
        className={`drawer-scrim ${drawerOpen ? 'open' : ''}`}
        onClick={closeDrawer}
      />

      {/* Drawer */}
      <div className={`drawer ${drawerOpen ? 'open' : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-primary">
              checkroom
            </span>
            <div>
              <div className="text-headline-sm">{drawerTitle}</div>
              <div className="text-[11px] text-on-surface-variant">
                §B3 — Basic · Sales · Purchasing · Inventory · Commerce
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onToast('Maximize drawer')}
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              title="Maximize"
            >
              <span className="material-symbols-outlined text-[18px]">open_in_full</span>
            </button>
            <button
              onClick={closeDrawer}
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* SECTION 1 — Basic info */}
          <section>
            <div className="section-h">Basic info</div>
            <div className="space-y-3">
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">
                  Name
                </label>
                <input
                  className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                  defaultValue={drawerProduct?.name ?? ''}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    Type
                  </label>
                  <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary">
                    <option>Product</option>
                    <option>Service</option>
                    <option>Bundle</option>
                  </select>
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    SKU
                  </label>
                  <input
                    className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                    defaultValue={
                      drawerProduct?.skus?.split(',')[0]?.trim() ?? ''
                    }
                  />
                </div>
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    Category
                  </label>
                  <div className="relative flex items-center">
                    <input
                      className="w-full h-9 px-2.5 pr-8 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                      defaultValue="Apparel"
                    />
                    <span className="material-symbols-outlined absolute right-2 text-[16px] text-outline">
                      expand_more
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => onToast('New category')}
                  className="h-9 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">add</span>New
                </button>
              </div>
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">
                  Image
                </label>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-16 h-16 rounded ${
                      drawerProduct?.thumbClass ??
                      'bg-gradient-to-br from-qb-blue to-qb-navy'
                    } shrink-0`}
                  ></div>
                  <button
                    onClick={() => onToast('Upload image')}
                    className="h-8 px-3 border border-dashed border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[14px]">upload</span>
                    Upload
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 2 — Sales */}
          <section className="border-t border-surface-dim pt-4">
            <div className="section-h">Sales</div>
            <div className="space-y-3">
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">
                  Description
                </label>
                <textarea
                  className="w-full h-16 p-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                  defaultValue="Heavyweight 100% cotton tee. Unisex sizing."
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    Sales price
                  </label>
                  <div className="relative flex items-center">
                    <span className="absolute left-2.5 text-on-surface-variant text-body-md">
                      $
                    </span>
                    <input
                      className="w-full h-9 pl-6 pr-2.5 border border-surface-dim rounded text-body-md tabular-nums focus:outline-none focus:border-primary"
                      defaultValue={drawerProduct?.price?.replace('$', '') ?? '24.00'}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    Income account
                  </label>
                  <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary">
                    <option>Sales — Apparel</option>
                    <option>Sales — Wall Art</option>
                    <option>Sales — Drinkware</option>
                  </select>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 3 — Purchasing */}
          <section className="border-t border-surface-dim pt-4">
            <div className="section-h">Purchasing</div>
            <label className="flex items-center gap-2 mb-3 cursor-pointer">
              <input
                type="checkbox"
                className="row-check"
                checked={purchaseEnabled}
                onChange={(e) => setPurchaseEnabled(e.target.checked)}
              />
              <span className="text-body-md">
                I purchase this from a supplier
              </span>
            </label>
            {purchaseEnabled ? (
              <div className="space-y-3">
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    Purchase description
                  </label>
                  <input
                    className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary"
                    defaultValue="Blank tee (Printful 64000)"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">
                      Cost
                    </label>
                    <div className="relative flex items-center">
                      <span className="absolute left-2.5 text-on-surface-variant text-body-md">
                        $
                      </span>
                      <input
                        className="w-full h-9 pl-6 pr-2.5 border border-surface-dim rounded text-body-md tabular-nums focus:outline-none focus:border-primary"
                        defaultValue="9.12"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">
                      Preferred supplier
                    </label>
                    <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary">
                      <option>Printful</option>
                      <option>Gelato</option>
                      <option>Printify</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    Expense / COGS account{' '}
                    {purchaseEnabled && <span className="text-error">*</span>}
                  </label>
                  <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary">
                    <option value="">— Select account —</option>
                    <option>COGS — Apparel</option>
                    <option>COGS — Wall Art</option>
                    <option>COGS — Drinkware</option>
                  </select>
                  <p className="text-[11px] text-on-surface-variant mt-1">
                    Required when &quot;I purchase this from a supplier&quot; is checked.
                  </p>
                </div>
              </div>
            ) : (
              <div className="text-[11px] text-on-surface-variant italic mt-2">
                Not purchased from a supplier. Sales-only product.
              </div>
            )}
          </section>

          {/* SECTION 4 — Inventory */}
          <section className="border-t border-surface-dim pt-4">
            <div className="section-h">Inventory</div>
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" className="row-check" />
                <span className="text-body-md">Track quantity</span>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    Quantity on hand
                  </label>
                  <input
                    className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md tabular-nums focus:outline-none focus:border-primary"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">
                    Reorder point
                  </label>
                  <input
                    className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md tabular-nums focus:outline-none focus:border-primary"
                    placeholder="—"
                  />
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 5 — Commerce */}
          <section className="border-t border-surface-dim pt-4">
            <div className="section-h">Commerce</div>
            <div className="space-y-3">
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">
                  Design
                </label>
                <div className="flex items-center justify-between h-9 px-2.5 border border-surface-dim rounded">
                  <span className="text-body-md flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px] text-primary">
                      palette
                    </span>
                    {drawerProduct
                      ? `${drawerProduct.name} — Sunrise`
                      : 'Classic Tee — Sunrise'}
                  </span>
                  <button
                    onClick={() => onNavigate('catalog', 'studio')}
                    className="text-[11px] text-primary font-semibold hover:underline"
                  >
                    Open Studio
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">
                  Variants
                </label>
                <div className="flex flex-wrap gap-1">
                  <span className="px-2 py-0.5 rounded bg-surface-container-low text-[11px]">
                    S / White
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-low text-[11px]">
                    M / White
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-low text-[11px]">
                    L / White
                  </span>
                  <span className="px-2 py-0.5 rounded bg-surface-container-low text-[11px]">
                    XL / White
                  </span>
                  <button
                    onClick={() => onToast('Add variant')}
                    className="px-2 py-0.5 rounded border border-dashed border-surface-dim text-[11px] text-on-surface-variant hover:bg-surface-container-low"
                  >
                    + Add
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">
                  Channels
                </label>
                <div className="flex flex-wrap gap-2">
                  <label className="flex items-center gap-1.5 text-label-sm">
                    <input type="checkbox" className="row-check" defaultChecked />
                    Storefront
                  </label>
                  <label className="flex items-center gap-1.5 text-label-sm">
                    <input type="checkbox" className="row-check" defaultChecked />
                    Shopify
                  </label>
                  <label className="flex items-center gap-1.5 text-label-sm">
                    <input type="checkbox" className="row-check" />
                    TikTok Shop
                  </label>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button
            onClick={closeDrawer}
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onNavigate('catalog', 'studio')}
              className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1"
            >
              <span className="material-symbols-outlined text-[16px]">palette</span>
              Open Studio
            </button>
            <div className="flex split-btn">
              <button
                onClick={handleSaveAndNew}
                className="h-8 px-3 bg-white border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low split-btn-main"
              >
                Save and new
              </button>
              <button className="h-8 px-1.5 bg-white border border-surface-dim hover:bg-surface-container-low split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
            <div className="flex split-btn">
              <button
                onClick={handleSave}
                className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main"
              >
                Save and close
              </button>
              <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow">
                <span className="material-symbols-outlined text-[16px]">expand_more</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
