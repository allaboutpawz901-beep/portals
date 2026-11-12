'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import styles from './ListPrimitives.module.css';

export interface RowMenuItem {
  label: string;
  icon?: string;
  danger?: boolean;
  onClick: () => void;
  disabled?: boolean;
  dividerBefore?: boolean;
}

export interface RowMenuProps {
  items: RowMenuItem[];
  ariaLabel?: string;
}

/**
 * Shared row ⋯ dropdown menu for list pages.
 * Uses position:fixed with computed coordinates so it's NEVER clipped by
 * parent overflow:hidden/auto containers. Flips above the button when near
 * the bottom of the viewport.
 */
export default function RowMenu({ items, ariaLabel = 'Row actions' }: RowMenuProps) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);

  // Compute position when opening — position:fixed relative to viewport.
  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuW = 220;
    const menuH = Math.min(items.length * 36 + 16, 400);
    const top = r.bottom + 4 + menuH > window.innerHeight
      ? Math.max(10, r.top - menuH - 4)
      : r.bottom + 4;
    const left = Math.min(r.right - menuW, window.innerWidth - menuW - 10);
    setMenuPos({ top, left });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        ref.current &&
        !ref.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className={styles.rowMenuWrap}>
      <button
        ref={btnRef}
        type="button"
        className={styles.rowMenuBtn}
        aria-label={ariaLabel}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((prev) => !prev);
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
          more_horiz
        </span>
      </button>
      {open && menuPos && (
        <div
          ref={ref}
          className={styles.rowMenu}
          role="menu"
          style={{ position: 'fixed', top: menuPos.top, left: menuPos.left, right: 'auto' }}
        >
          {items.map((item, idx) => (
            <div key={idx}>
              {item.dividerBefore && <div className={styles.rowMenuDivider} />}
              <button
                type="button"
                className={`${styles.rowMenuItem} ${
                  item.danger ? styles.rowMenuItemDanger : ''
                }`}
                disabled={item.disabled}
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  if (!item.disabled) item.onClick();
                }}
              >
                {item.icon && (
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    {item.icon}
                  </span>
                )}
                {item.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Shared bulk-bar that appears when rows are selected on a list page.
 * Shows count + action buttons + dismiss.
 */
export interface BulkAction {
  label: string;
  icon?: string;
  onClick: (ids: string[]) => void;
  danger?: boolean;
}

export interface BulkBarProps {
  selectedIds: string[];
  onClear: () => void;
  actions: BulkAction[];
}

export function BulkBar({ selectedIds, onClear, actions }: BulkBarProps) {
  if (selectedIds.length === 0) return null;
  return (
    <div className={styles.bulkBar}>
      <span className={styles.bulkBarText}>
        {selectedIds.length} selected
      </span>
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className={`${styles.bulkBarBtn} ${
            action.danger ? styles.bulkBarBtnDanger : ''
          }`}
          onClick={() => action.onClick(selectedIds)}
        >
          {action.icon && (
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {action.icon}
            </span>
          )}
          {action.label}
        </button>
      ))}
      <span className={styles.bulkBarSpacer} />
      <button
        type="button"
        className={styles.bulkBarClose}
        onClick={onClear}
        aria-label="Clear selection"
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          close
        </span>
      </button>
    </div>
  );
}
