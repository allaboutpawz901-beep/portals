'use client';

import React, { useRef, useEffect, useState } from 'react';
import { ActionItem, ALL_ACTIONS_MAP } from './QuickActionsDrawer';
import { DOMAINS, DomainKey, findScreen } from '@/data/shellData';
import styles from './FavoritesFlyout.module.css';

export type PinMode = 'bookmarks' | 'favorites';

export interface BookmarkEntry {
  domain: DomainKey;
  screen: string;
}

interface FavoritesFlyoutProps {
  open: boolean;
  /** Which side of the dual pin is active — the rail button follows this. */
  pinMode: PinMode;
  onPinModeChange: (mode: PinMode) => void;
  /** Saved screen bookmarks (Bookmarks side of the pin). */
  bookmarks: BookmarkEntry[];
  activeDomain: DomainKey;
  activeScreen: string;
  onAddBookmark: (domain: DomainKey, screen: string) => void;
  onRemoveBookmark: (domain: DomainKey, screen: string) => void;
  onNavigateBookmark: (domain: DomainKey, screen: string) => void;
  favoriteIds: string[];
  onClose: () => void;
  onSelectAction: (actionName: string) => void;
  onOpenCustomize: () => void;
  onToast?: (message: string) => void;
}

export function FavoritesFlyout({
  open,
  pinMode,
  onPinModeChange,
  bookmarks,
  activeDomain,
  activeScreen,
  onAddBookmark,
  onRemoveBookmark,
  onNavigateBookmark,
  favoriteIds,
  onClose,
  onSelectAction,
  onOpenCustomize,
  onToast,
}: FavoritesFlyoutProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // Local switcher state — initialized from the pin, snaps back if pin changes elsewhere.
  const [mode, setMode] = useState<PinMode>(pinMode);
  const [anchorTop, setAnchorTop] = useState<number>(136);

  useEffect(() => {
    setMode(pinMode);
  }, [pinMode]);

  // Anchor the flyout to the rail pin button instead of a hardcoded offset.
  useEffect(() => {
    if (!open) return;
    const btn = document.querySelector('[data-rail="favorites"]') as HTMLElement | null;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const desired = Math.max(60, rect.top - 10);
    const clamped = Math.min(desired, Math.max(60, window.innerHeight - 140));
    setAnchorTop(clamped);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (containerRef.current && containerRef.current.contains(target)) return;
      if (target.closest('[data-rail="favorites"]')) return;
      onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, onClose]);

  if (!open) return null;

  const favoriteItems: ActionItem[] = favoriteIds
    .map((id) => ALL_ACTIONS_MAP.get(id))
    .filter((it): it is ActionItem => it !== undefined);

  const bookmarkItems = bookmarks
    .map((b) => {
      const dom = DOMAINS[b.domain];
      if (!dom) return null;
      const screen = findScreen(b.domain, b.screen);
      return {
        ...b,
        label: screen.label,
        icon: dom.icon,
        domainLabel: dom.label,
      };
    })
    .filter((b): b is BookmarkEntry & { label: string; icon: string; domainLabel: string } => b !== null);

  const currentPageBookmarked = bookmarks.some(
    (b) => b.domain === activeDomain && b.screen === activeScreen
  );

  const selectMode = (next: PinMode) => {
    setMode(next);
    onPinModeChange(next);
  };

  const activeCount = mode === 'bookmarks' ? bookmarkItems.length : favoriteItems.length;

  return (
    <div
      ref={containerRef}
      className={styles.flyout}
      style={{ top: anchorTop, maxHeight: `calc(100vh - ${anchorTop + 24}px)` }}
      role="menu"
      aria-label="Bookmarks and favorites"
    >
      <div className={styles.arrow} style={{ top: 18 }} />
      <div className={styles.header}>
        {/* Dual switcher — Bookmarks | Favorites. The rail pin follows the choice. */}
        <div className={styles.switcher} role="tablist" aria-label="Pin switcher">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'bookmarks'}
            data-pinmode="bookmarks"
            className={`${styles.switcherBtn} ${mode === 'bookmarks' ? styles.switcherBtnActive : ''}`}
            onClick={() => selectMode('bookmarks')}
            title="Switch the pin to bookmarks"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>bookmark</span>
            Bookmarks
            {bookmarkItems.length > 0 && (
              <span className={styles.modeCount}>{bookmarkItems.length}</span>
            )}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'favorites'}
            data-pinmode="favorites"
            className={`${styles.switcherBtn} ${mode === 'favorites' ? styles.switcherBtnActive : ''}`}
            onClick={() => selectMode('favorites')}
            title="Switch the pin to favorites"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>star</span>
            Favorites
            {favoriteItems.length > 0 && (
              <span className={styles.modeCount}>{favoriteItems.length}</span>
            )}
          </button>
        </div>

        {mode === 'bookmarks' ? (
          <button
            type="button"
            className={currentPageBookmarked ? styles.removePageBtn : styles.customizeBtn}
            data-bookmark-current={currentPageBookmarked ? 'remove' : 'add'}
            onClick={() => {
              if (currentPageBookmarked) {
                onRemoveBookmark(activeDomain, activeScreen);
                onToast?.('Bookmark removed');
              } else {
                onAddBookmark(activeDomain, activeScreen);
                onToast?.('Page bookmarked');
              }
            }}
            title={
              currentPageBookmarked
                ? 'Remove this page from bookmarks'
                : 'Bookmark the current page'
            }
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              {currentPageBookmarked ? 'bookmark_remove' : 'bookmark_add'}
            </span>
            {currentPageBookmarked ? 'Remove' : 'Add page'}
          </button>
        ) : (
          <button
            type="button"
            className={styles.customizeBtn}
            onClick={() => {
              onClose();
              onOpenCustomize();
            }}
            title="Customize favorites in Quick Actions"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              tune
            </span>
            Edit
          </button>
        )}
      </div>

      <div className={styles.list}>
        {mode === 'bookmarks' ? (
          bookmarkItems.length > 0 ? (
            bookmarkItems.map((item) => {
              const isCurrent = item.domain === activeDomain && item.screen === activeScreen;
              return (
                <div
                  key={`${item.domain}:${item.screen}`}
                  className={styles.bookmarkRow}
                  data-bookmark={`${item.domain}:${item.screen}`}
                >
                  <button
                    type="button"
                    className={styles.item}
                    onClick={() => {
                      onClose();
                      onNavigateBookmark(item.domain, item.screen);
                    }}
                    role="menuitem"
                  >
                    <span className={`material-symbols-outlined ${styles.itemIcon}`}>
                      {item.icon}
                    </span>
                    <span className={styles.itemLabel}>{item.label}</span>
                    <span className={styles.itemGroup}>{item.domainLabel}</span>
                    <span className={`material-symbols-outlined ${styles.itemArrow}`}>
                      {isCurrent ? 'check' : 'arrow_forward'}
                    </span>
                  </button>
                  <button
                    type="button"
                    className={styles.rowRemoveBtn}
                    title="Remove bookmark"
                    aria-label={`Remove bookmark ${item.label}`}
                    onClick={() => {
                      onRemoveBookmark(item.domain, item.screen);
                      onToast?.('Bookmark removed');
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                      close
                    </span>
                  </button>
                </div>
              );
            })
          ) : (
            <div className={styles.emptyState}>
              <span className={`material-symbols-outlined ${styles.emptyIcon}`}>
                bookmark
              </span>
              <p className={styles.emptyTitle}>No bookmarks yet</p>
              <p className={styles.emptyDesc}>
                Bookmark any page in the system and pin it here for one-click access.
              </p>
              <button
                type="button"
                className={styles.emptyActionBtn}
                onClick={() => {
                  onAddBookmark(activeDomain, activeScreen);
                  onToast?.('Page bookmarked');
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  bookmark_add
                </span>
                Bookmark this page
              </button>
            </div>
          )
        ) : favoriteItems.length > 0 ? (
          favoriteItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={styles.item}
              onClick={() => {
                onClose();
                onSelectAction(item.name);
                onToast?.(`Opening ${item.name}`);
              }}
              role="menuitem"
            >
              <span className={`material-symbols-outlined ${styles.itemIcon}`}>
                {item.icon}
              </span>
              <span className={styles.itemLabel}>{item.name}</span>
              <span className={styles.itemGroup}>{item.group}</span>
              <span className={`material-symbols-outlined ${styles.itemArrow}`}>
                arrow_forward
              </span>
            </button>
          ))
        ) : (
          <div className={styles.emptyState}>
            <span className={`material-symbols-outlined ${styles.emptyIcon}`}>
              star_border
            </span>
            <p className={styles.emptyTitle}>No favorites selected</p>
            <p className={styles.emptyDesc}>
              Check actions in Quick Actions to star and pin them here.
            </p>
            <button
              type="button"
              className={styles.emptyActionBtn}
              onClick={() => {
                onClose();
                onOpenCustomize();
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                add
              </span>
              Choose favorites
            </button>
          </div>
        )}
      </div>

      <div className={styles.footer}>
        <span className={styles.footerHint}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            {mode === 'bookmarks' ? 'push_pin' : 'touch_app'}
          </span>
          {mode === 'bookmarks'
            ? `Click to open · pin shows ${activeCount} bookmark${activeCount === 1 ? '' : 's'}`
            : 'Click to launch action'}
        </span>
        <span className={styles.footerPin}>
          {mode === 'bookmarks' ? 'Bookmark' : 'Favorite'} pin
        </span>
      </div>
    </div>
  );
}
