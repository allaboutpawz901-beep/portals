'use client';

import { useState } from 'react';
import type { BlankCard } from '@/lib/podApi';

/**
 * ProductCard — the approved catalog card design (upload/product cards.html).
 *
 * ┌──────────────────────────┐
 * │ [4/3 image]      [badge] │  badge = "2 Suppliers" | "Printify" | "Printful"
 * │ [N Variants]             │  bottom-left, black/70 pill
 * ├──────────────────────────┤
 * │ Product name (15px semibold, truncate)
 * │ SKU: BC-3001-UNI (11px mono)
 * │ ┌ Best Price      $8.50 ┐│  white row, sell icon, green price
 * │ ┌ Est. Shipping  2.5 d  ┐│  white row, truck icon
 * ├──────────────────────────┤
 * │ [View] [Design] [edit]   │  Design = blue #1e6dc9
 * └──────────────────────────┘
 *
 * Hover lifts the card. Click image/name → product page. Design → canvas.
 */
export function isUsableImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const u = url.trim();
  return u.startsWith('http://') || u.startsWith('https://') || u.startsWith('/');
}

export function ProductThumb({
  name,
  imageUrl,
  className,
  style,
}: {
  name: string;
  imageUrl?: string | null;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
  const showImg = !failed && isUsableImageUrl(imageUrl);
  return (
    <span
      className={className}
      style={{
        ...style,
        position: 'relative',
        overflow: 'hidden',
        display: 'block',
      }}
    >
      <span
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f4f3f7',
          color: '#9aa0a6',
          fontWeight: 600,
          fontSize: (style?.fontSize as number | string | undefined) ?? 20,
        }}
      >
        {initials || '•'}
      </span>
      {showImg && (
        <img
          src={imageUrl as string}
          alt={name}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
          onError={() => setFailed(true)}
        />
      )}
    </span>
  );
}

/** Supplier badges — exact palette from the approved design. */
export function SupplierBadge({ card }: { card: BlankCard }) {
  const suppliers = card.suppliers ?? [{ name: card.supplier, slug: card.supplierSlug }];
  const n = card.supplierCount ?? suppliers.length;
  if (n >= 2) {
    // amber "2 Suppliers"
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          padding: '2px 8px',
          borderRadius: 12,
          fontSize: 10,
          fontWeight: 600,
          background: '#fef3c7',
          color: '#92400e',
          boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
          border: '1px solid rgba(0,0,0,0.05)',
        }}
      >
        {n} Suppliers
      </span>
    );
  }
  const slug = (suppliers[0]?.slug ?? '').toLowerCase();
  const isPrintify = slug.includes('printify');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 12,
        fontSize: 10,
        fontWeight: 600,
        background: isPrintify ? '#e0f2fe' : '#f3e8ff',
        color: isPrintify ? '#0369a1' : '#6b21a8',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
        border: '1px solid rgba(0,0,0,0.05)',
      }}
    >
      {suppliers[0]?.name ?? card.supplier}
    </span>
  );
}

/** Small data row — "Best Price $8.50" / "Est. Shipping 2.5 days". */
function DataRow({
  icon,
  label,
  value,
  valueColor,
}: {
  icon: string;
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        background: '#ffffff',
        padding: '8px',
        borderRadius: 6,
        border: '1px solid #dad9dd',
      }}
    >
      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontSize: 12,
          color: '#5a6355',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
          {icon}
        </span>
        {label}
      </span>
      <span style={{ fontSize: 13, fontWeight: 600, color: valueColor ?? '#1a1c1e' }}>{value}</span>
    </div>
  );
}

export default function ProductCard({
  card,
  selected,
  onToggleSelect,
  onDesign,
  onView,
  onEdit,
}: {
  card: BlankCard;
  selected?: boolean;
  onToggleSelect?: () => void;
  onDesign: () => void;
  onView: () => void;
  onEdit?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const variantCount = card.variantCount ?? 0;
  const money = (n: number | null) =>
    n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <article
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        background: '#fff',
        border: '1px solid #dad9dd',
        borderRadius: 12,
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        transition: 'transform 0.2s, box-shadow 0.2s',
        transform: hover ? 'translateY(-2px)' : 'none',
        boxShadow: hover
          ? '0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05)'
          : 'none',
        position: 'relative',
      }}
    >
      {/* Image area — click opens product page */}
      <div
        style={{ cursor: 'pointer', position: 'relative' }}
        onClick={onView}
        role="button"
        tabIndex={0}
        aria-label={`View ${card.name}`}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onView();
        }}
      >
        <ProductThumb
          name={card.name}
          imageUrl={card.mockupThumbUrl}
          style={{ width: '100%', aspectRatio: '4 / 3', display: 'block', background: '#f4f3f7' }}
        />
        {/* Top-right supplier badge */}
        <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 4 }}>
          <SupplierBadge card={card} />
        </div>
        {/* Bottom-left variant badge */}
        {variantCount > 0 && (
          <span
            style={{
              position: 'absolute',
              bottom: 12,
              left: 12,
              background: 'rgba(0,0,0,0.7)',
              color: '#fff',
              fontSize: 10,
              fontWeight: 600,
              padding: '4px 8px',
              borderRadius: 4,
              backdropFilter: 'blur(2px)',
            }}
          >
            {variantCount} Variants
          </span>
        )}
        {/* Checkbox — top-left, compact (multi-select stays) */}
        {onToggleSelect && (
          <label
            style={{
              position: 'absolute',
              top: 8,
              left: 8,
              background: 'rgba(255,255,255,0.92)',
              borderRadius: 4,
              padding: 2,
              lineHeight: 1,
              cursor: 'pointer',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <input
              type="checkbox"
              aria-label={`Select ${card.name}`}
              checked={selected ?? false}
              onChange={onToggleSelect}
              style={{ margin: 0, cursor: 'pointer' }}
            />
          </label>
        )}
      </div>

      {/* Content area */}
      <div style={{ padding: 16, flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* Title & SKU */}
        <div style={{ marginBottom: 12 }}>
          <h3
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: '#1a1c1e',
              lineHeight: 1.25,
              margin: 0,
              marginBottom: 4,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={card.name}
          >
            {card.name}
          </h3>
          <div style={{ fontSize: 11, color: '#5a6355', fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>
            {card.sku ? `SKU: ${card.sku}` : card.brand || '—'}
          </div>
        </div>

        {/* Key data points */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16, flex: 1 }}>
          <DataRow icon="sell" label="Best Price" value={money(card.baseCost)} valueColor="#0a6400" />
          <DataRow
            icon="local_shipping"
            label="Est. Shipping"
            value={card.estShipping ?? '—'}
          />
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, marginTop: 'auto' }}>
          <button
            type="button"
            onClick={onView}
            style={{
              flex: 1,
              height: 32,
              border: '1px solid #dad9dd',
              borderRadius: 6,
              background: '#fff',
              fontSize: 12,
              fontWeight: 600,
              color: '#1a1c1e',
              cursor: 'pointer',
            }}
          >
            View
          </button>
          <button
            type="button"
            onClick={onDesign}
            style={{
              flex: 1,
              height: 32,
              border: 'none',
              borderRadius: 6,
              background: '#1e6dc9',
              color: '#fff',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Design
          </button>
          <button
            type="button"
            title={`Edit ${card.name}`}
            aria-label={`Edit ${card.name}`}
            onClick={onEdit ?? onView}
            style={{
              width: 32,
              height: 32,
              border: '1px solid #dad9dd',
              borderRadius: 6,
              background: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#5a6355',
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              edit
            </span>
          </button>
        </div>
      </div>
    </article>
  );
}
