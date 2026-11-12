'use client';

import React, { useState, useEffect, useMemo } from 'react';
import styles from './QuickActionsDrawer.module.css';

export interface ActionItem {
  id: string;
  name: string;
  icon: string;
  group: 'customers' | 'vendors' | 'team' | 'other' | 'tax' | 'inventory';
}

export interface ActionGroup {
  id: string;
  name: string;
  actions: ActionItem[];
}

export const ALL_ACTION_GROUPS: ActionGroup[] = [
  {
    id: 'customers',
    name: 'Customers',
    actions: [
      { id: 'c_paid', name: 'Get paid online', icon: 'payments', group: 'customers' },
      { id: 'c_invoice', name: 'Create invoice', icon: 'receipt_long', group: 'customers' },
      { id: 'c_estimate', name: 'Create estimate', icon: 'request_quote', group: 'customers' },
      { id: 'c_payment', name: 'Record payment', icon: 'price_check', group: 'customers' },
      { id: 'c_receipt', name: 'Create sales receipt', icon: 'point_of_sale', group: 'customers' },
      { id: 'c_add_cust', name: 'Add customer', icon: 'person_add', group: 'customers' },
      { id: 'c_link', name: 'Create payment link', icon: 'link', group: 'customers' },
      { id: 'c_rec_receipt', name: 'Recurring sales receipt', icon: 'autorenew', group: 'customers' },
      { id: 'c_statement', name: 'Create statement', icon: 'summarize', group: 'customers' },
      { id: 'c_rec_payment', name: 'Create recurring payment', icon: 'event_repeat', group: 'customers' },
    ],
  },
  {
    id: 'vendors',
    name: 'Vendors',
    actions: [
      { id: 'v_expense', name: 'Record expense', icon: 'credit_card', group: 'vendors' },
      { id: 'v_check', name: 'Create check', icon: 'payments', group: 'vendors' },
      { id: 'v_bill', name: 'Create bill', icon: 'description', group: 'vendors' },
      { id: 'v_pay_bills', name: 'Pay bills', icon: 'account_balance_wallet', group: 'vendors' },
      { id: 'v_add_vendor', name: 'Add vendor', icon: 'storefront', group: 'vendors' },
      { id: 'v_print_checks', name: 'Print checks', icon: 'print', group: 'vendors' },
      { id: 'v_rec_bill', name: 'Recurring bill', icon: 'autorenew', group: 'vendors' },
      { id: 'v_upload_bills', name: 'Upload multiple bills', icon: 'upload_file', group: 'vendors' },
      { id: 'v_sched_pay', name: 'Schedule online payment', icon: 'schedule', group: 'vendors' },
      { id: 'v_credit', name: 'Create vendor credit', icon: 'savings', group: 'vendors' },
    ],
  },
  {
    id: 'team',
    name: 'Team',
    actions: [
      { id: 't_add_employee', name: 'Add employee', icon: 'person_add', group: 'team' },
      { id: 't_time_entry', name: 'Add time entry', icon: 'schedule', group: 'team' },
    ],
  },
  {
    id: 'other',
    name: 'Other',
    actions: [
      { id: 'o_live_bookkeeping', name: 'Get Live Bookkeeping', icon: 'support_agent', group: 'other' },
      { id: 'o_bank_deposit', name: 'Add bank deposit', icon: 'account_balance', group: 'other' },
      { id: 'o_product_service', name: 'Add product or service', icon: 'inventory_2', group: 'other' },
      { id: 'o_journal_entry', name: 'Create journal entry', icon: 'menu_book', group: 'other' },
    ],
  },
  {
    id: 'tax',
    name: 'Business Tax',
    actions: [
      { id: 'x_tax_return', name: 'Create tax return', icon: 'description', group: 'tax' },
      { id: 'x_tax_review', name: 'Bookkeeper tax review', icon: 'fact_check', group: 'tax' },
      { id: 'x_tax_summary', name: 'Download tax summary', icon: 'download', group: 'tax' },
    ],
  },
  {
    id: 'inventory',
    name: 'Inventory',
    actions: [
      { id: 'i_product_service', name: 'Add inventory item', icon: 'inventory_2', group: 'inventory' },
      { id: 'i_design_studio', name: 'Design Studio', icon: 'apparel', group: 'inventory' },
      { id: 'i_support_ticket', name: 'Open Support Ticket', icon: 'confirmation_number', group: 'inventory' },
      { id: 'i_publish_design', name: 'Publish Design', icon: 'publish', group: 'inventory' },
      { id: 'i_social_post', name: 'Create Social Post', icon: 'share', group: 'inventory' },
    ],
  },
];

export const ALL_ACTIONS_MAP: Map<string, ActionItem> = new Map(
  ALL_ACTION_GROUPS.flatMap((g) => g.actions.map((a) => [a.id, a] as [string, ActionItem]))
);

export const FAVORITES_STORAGE_KEY = 'qb_favorite_actions_v1';

export const DEFAULT_FAVORITE_IDS = [
  'c_invoice',
  'c_payment',
  'v_expense',
  'v_bill',
  'c_add_cust',
];

const MAX_SELECTIONS = 10;

interface QuickActionsDrawerProps {
  open: boolean;
  onClose: () => void;
  selectedActionIds: string[];
  onSelectedActionIdsChange: (ids: string[]) => void;
  onSelectAction?: (actionName: string) => void;
  onToast?: (message: string) => void;
}

export function QuickActionsDrawer({
  open,
  onClose,
  selectedActionIds,
  onSelectedActionIdsChange,
  onSelectAction,
  onToast,
}: QuickActionsDrawerProps) {
  const [searchQuery, setSearchQuery] = useState('');

  const toggleAction = (actionId: string) => {
    if (selectedActionIds.includes(actionId)) {
      onSelectedActionIdsChange(selectedActionIds.filter((id) => id !== actionId));
    } else {
      if (selectedActionIds.length >= MAX_SELECTIONS) {
        onToast?.(`You can only select up to ${MAX_SELECTIONS} actions.`);
        return;
      }
      onSelectedActionIdsChange([...selectedActionIds, actionId]);
    }
  };

  const removeFavorite = (actionId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    onSelectedActionIdsChange(selectedActionIds.filter((id) => id !== actionId));
  };

  const handleSaveFavorites = () => {
    if (selectedActionIds.length === 0) {
      onToast?.('Please select at least one action.');
      return;
    }
    try {
      localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(selectedActionIds));
    } catch {
      // ignore
    }
    onToast?.(`Saved ${selectedActionIds.length} favorite actions!`);
    onClose();
  };

  // Filter actions by search query
  const query = searchQuery.trim().toLowerCase();

  const filteredGroups = useMemo(() => {
    if (!query) return ALL_ACTION_GROUPS;
    return ALL_ACTION_GROUPS.map((group) => {
      const matched = group.actions.filter(
        (a) =>
          a.name.toLowerCase().includes(query) ||
          group.name.toLowerCase().includes(query)
      );
      return {
        ...group,
        actions: matched,
      };
    }).filter((group) => group.actions.length > 0);
  }, [query]);

  const totalVisibleActions = useMemo(() => {
    return filteredGroups.reduce((acc, g) => acc + g.actions.length, 0);
  }, [filteredGroups]);

  // Selected favorites objects
  const favoriteItems = useMemo(() => {
    return selectedActionIds
      .map((id) => ALL_ACTIONS_MAP.get(id))
      .filter((item): item is ActionItem => item !== undefined);
  }, [selectedActionIds]);

  return (
    <>
      <div
        className={`${styles.overlay} ${open ? styles.overlayOpen : ''}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
        aria-label="Create actions drawer"
        role="dialog"
        aria-modal="true"
      >
        {/* Drawer Header */}
        <div className={styles.header}>
          <div className={styles.headerTitleGroup}>
            <span className={`material-symbols-outlined ${styles.headerIcon}`}>
              add_circle
            </span>
            <h2 className={styles.headerTitle}>Create actions</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            title="Close drawer"
            aria-label="Close"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Search & Info Bar */}
        <div className={styles.searchBarContainer}>
          <div className={styles.searchWrapper}>
            <span className={`material-symbols-outlined ${styles.searchIcon}`}>
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search all create actions"
              className={styles.searchInput}
              aria-label="Search all create actions"
            />
            {searchQuery && (
              <button
                type="button"
                className={styles.clearSearchBtn}
                onClick={() => setSearchQuery('')}
                title="Clear search"
                aria-label="Clear search"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  close
                </span>
              </button>
            )}
          </div>

          <div className={styles.infoBar}>
            <span className={styles.infoText}>
              Choose your favorites. If you don&apos;t customize, your top actions will
              change as we learn more about you.
            </span>
            <span className={styles.counterBadge}>
              <strong>{selectedActionIds.length}</strong> / {MAX_SELECTIONS} selected
            </span>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className={styles.content}>
          {/* FAVORITES SECTION (Top sticky / highlights) */}
          {favoriteItems.length > 0 && !query && (
            <section className={styles.section} aria-label="Favorites section">
              <h3 className={styles.sectionHeading}>
                <span className={`material-symbols-outlined ${styles.starIcon}`}>
                  star
                </span>
                Favorites
              </h3>
              <div className={styles.actionsList}>
                {favoriteItems.map((item) => (
                  <div
                    key={`fav-${item.id}`}
                    className={`${styles.actionRow} ${styles.actionRowSelected}`}
                    onClick={() => {
                      if (onSelectAction) {
                        onSelectAction(item.name);
                      }
                      removeFavorite(item.id);
                    }}
                    title={`Click to remove from favorites (or perform ${item.name})`}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        removeFavorite(item.id);
                      }
                    }}
                  >
                    <div
                      className={`${styles.customCheckbox} ${styles.checkboxChecked}`}
                    >
                      <span className={`material-symbols-outlined ${styles.checkIcon}`}>
                        check
                      </span>
                    </div>
                    <span
                      className={`material-symbols-outlined ${styles.actionIcon} ${styles.actionIconSelected}`}
                    >
                      {item.icon}
                    </span>
                    <span
                      className={`${styles.actionLabel} ${styles.actionLabelSelected}`}
                    >
                      {item.name}
                    </span>
                    <button
                      type="button"
                      className={styles.favoriteRemoveBtn}
                      onClick={(e) => removeFavorite(item.id, e)}
                      title="Remove from favorites"
                      aria-label={`Remove ${item.name} from favorites`}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* CATEGORIZED ACTION GROUPS */}
          {filteredGroups.map((group) => (
            <section
              key={group.id}
              className={styles.section}
              aria-label={group.name}
            >
              <h3 className={styles.sectionHeading}>{group.name}</h3>
              <div className={styles.actionsList}>
                {group.actions.map((action) => {
                  const isSelected = selectedActionIds.includes(action.id);
                  return (
                    <div
                      key={action.id}
                      className={`${styles.actionRow} ${
                        isSelected ? styles.actionRowSelected : ''
                      }`}
                      onClick={() => toggleAction(action.id)}
                      role="checkbox"
                      aria-checked={isSelected}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          toggleAction(action.id);
                        }
                      }}
                    >
                      <div
                        className={`${styles.customCheckbox} ${
                          isSelected ? styles.checkboxChecked : ''
                        }`}
                      >
                        {isSelected && (
                          <span
                            className={`material-symbols-outlined ${styles.checkIcon}`}
                          >
                            check
                          </span>
                        )}
                      </div>
                      <span
                        className={`material-symbols-outlined ${styles.actionIcon} ${
                          isSelected ? styles.actionIconSelected : ''
                        }`}
                      >
                        {action.icon}
                      </span>
                      <span
                        className={`${styles.actionLabel} ${
                          isSelected ? styles.actionLabelSelected : ''
                        }`}
                      >
                        {action.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          {/* EMPTY SEARCH STATE */}
          {totalVisibleActions === 0 && (
            <div className={styles.noResults}>
              <span
                className={`material-symbols-outlined ${styles.noResultsIcon}`}
              >
                search_off
              </span>
              <h4 className={styles.noResultsTitle}>No actions found</h4>
              <p className={styles.noResultsDesc}>
                Try searching for a different keyword.
              </p>
            </div>
          )}
        </div>

        {/* Sticky Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => {
              onToast?.('Cancelled');
              onClose();
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            className={styles.saveBtn}
            onClick={handleSaveFavorites}
          >
            Save favorites
          </button>
        </div>
      </aside>
    </>
  );
}
