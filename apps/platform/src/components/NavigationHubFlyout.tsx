'use client';

import { useEffect, useMemo, useState } from 'react';
import { DOMAINS, DomainKey, groupScreenCount } from '@/data/shellData';
import styles from './NavigationHubFlyout.module.css';

interface NavigationHubFlyoutProps {
  open: boolean;
  onClose: () => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
  onCreate?: (label: string) => void;
}

interface PillarMeta {
  key: DomainKey;
  num: string;
  label: string;
  tag: string;
  tagCls: string;
  blurb: string;
  iconBg: string;
  icon: string;
}

const PILLAR_META: PillarMeta[] = [
  {
    key: 'dashboard',
    num: '1',
    label: 'Dashboard',
    tag: 'Core',
    tagCls: styles.tagPrimary,
    blurb: 'Operations control tower, vital KPI monitoring, and triage queue.',
    iconBg: `${styles.iconBg} ${styles.iconBgPrimary}`,
    icon: 'dashboard',
  },
  {
    key: 'marketing',
    num: '2',
    label: 'Marketing',
    tag: 'Growth',
    tagCls: styles.tagSecondary,
    blurb: 'Content pipelines, storefront banners, creative popups, and ad channels.',
    iconBg: `${styles.iconBg} ${styles.iconBgSecondary}`,
    icon: 'campaign',
  },
  {
    key: 'catalog',
    num: '3',
    label: 'Catalog',
    tag: 'Products',
    tagCls: styles.tagPrimary,
    blurb: 'Blank supplier inventory, product variants, bundles, and channel listings.',
    iconBg: `${styles.iconBg} ${styles.iconBgPrimaryContainer}`,
    icon: 'inventory_2',
  },
  {
    key: 'design',
    num: '4',
    label: 'Design Studio',
    tag: 'Studio',
    tagCls: styles.tagSecondaryContainer,
    blurb: 'Canvas studio — new designs, variant inspector, catalogs, and published work.',
    iconBg: `${styles.iconBg} ${styles.iconBgSecondaryContainer}`,
    icon: 'apparel',
  },
  {
    key: 'orders',
    num: '5',
    label: 'Orders',
    tag: 'Routing',
    tagCls: styles.tagTertiary,
    blurb: 'Fulfillment pipelines, routing rules, batch slips, automated shipping labels.',
    iconBg: `${styles.iconBg} ${styles.iconBgTertiary}`,
    icon: 'local_shipping',
  },
  {
    key: 'finance',
    num: '6',
    label: 'Finance',
    tag: 'Fiscal',
    tagCls: styles.tagPrimary,
    blurb: 'Accounting, expenses & bills, sales, business tax, and cap table — one ledger.',
    iconBg: `${styles.iconBg} ${styles.iconBgPrimary}`,
    icon: 'account_balance',
  },
  {
    key: 'contacts',
    num: '7',
    label: 'Contacts',
    tag: 'CRM',
    tagCls: styles.tagSecondaryContainer,
    blurb: 'Customer registry, dynamic segmentation, lifetime value, wholesale clients.',
    iconBg: `${styles.iconBg} ${styles.iconBgSecondaryContainer}`,
    icon: 'groups',
  },
  {
    key: 'support',
    num: '8',
    label: 'Support',
    tag: 'Help Desk',
    tagCls: styles.tagTertiary,
    blurb: 'Unified inbox, ticket routing, macros, SLA compliance, trust & safety.',
    iconBg: `${styles.iconBg} ${styles.iconBgTertiaryContainer}`,
    icon: 'support_agent',
  },
  {
    key: 'connected-suppliers',
    num: '9',
    label: 'Connected Suppliers',
    tag: 'Network',
    tagCls: styles.tagSecondary,
    blurb: 'Supplier directory, integration feeds, onboarding, contracts, compliance.',
    iconBg: `${styles.iconBg} ${styles.iconBgSecondary}`,
    icon: 'hub',
  },
];

const QUICK_LAUNCH = [
  { key: 'invoice', label: '+ New Invoice', icon: 'post_add' },
  { key: 'product', label: '+ Create Product', icon: 'add_shopping_cart' },
  { key: 'konva', label: 'Konva Studio', icon: 'palette' },
  { key: 'banner', label: '+ Create Promo Banner', icon: 'campaign' },
  { key: 'ticket', label: '+ Log Support Ticket', icon: 'support_agent' },
] as const;

const FOOTER_UTILITIES = [
  { key: 'settings', label: 'Global Settings', icon: 'settings' },
  { key: 'staff', label: 'Staff & Roles', icon: 'shield_person' },
  { key: 'api', label: 'API Keys & Webhooks', icon: 'code' },
  { key: 'docs', label: 'Documentation', icon: 'menu_book' },
  { key: 'support', label: 'Enterprise Support', icon: 'help' },
] as const;

export default function NavigationHubFlyout({
  open,
  onClose,
  onNavigate,
  onToast,
  onCreate,
}: NavigationHubFlyoutProps) {
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const filteredPillars = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return PILLAR_META;
    return PILLAR_META.filter((p) => {
      const domain = DOMAINS[p.key];
      const groupNames = domain.groups.map((g) => g.name).join(' ');
      const screenLabels = domain.groups
        .flatMap((g) => g.screens)
        .map((s) => s.label)
        .join(' ');
      const haystack = `${p.label} ${p.blurb} ${groupNames} ${screenLabels}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [search]);

  if (!open) return null;

  const handlePillarClick = (key: DomainKey) => {
    const domain = DOMAINS[key];
    const firstScreen = domain.groups[0]?.screens[0];
    if (firstScreen) {
      onNavigate(key, firstScreen.id);
    }
    onClose();
  };

  const handleGroupLinkClick = (key: DomainKey, screenId: string) => {
    onNavigate(key, screenId);
    onClose();
  };

  const handleQuickLaunch = (item: (typeof QUICK_LAUNCH)[number]) => {
    onClose();
    if (item.key === 'konva') {
      onNavigate('design', 'new-design');
    } else if (item.key === 'invoice') {
      if (onCreate) onCreate('Invoice'); else onToast('Quick launch → New Invoice');
    } else if (item.key === 'product') {
      if (onCreate) onCreate('Product'); else onToast('Quick launch → Create Product');
    } else if (item.key === 'banner') {
      if (onCreate) onCreate('Banner'); else onToast('Quick launch → Create Promo Banner');
    } else if (item.key === 'ticket') {
      if (onCreate) onCreate('Ticket'); else onToast('Quick launch → Log Support Ticket');
    } else {
      onToast(`Quick launch → ${item.label.replace('+ ', '')}`);
    }
  };

  const handleFooterUtility = (item: (typeof FOOTER_UTILITIES)[number]) => {
    if (item.key === 'settings') {
      onNavigate('settings', 'ws-home');
      onClose();
    } else if (item.key === 'staff') {
      onNavigate('settings', 'ws-teammates');
      onClose();
    } else if (item.key === 'api') {
      onNavigate('settings', 'ws-integrations');
      onClose();
    } else {
      onClose();
      onToast(`${item.label} — opening`);
    }
  };

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div
        className={styles.panel}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.headerLeft}>
              <div className={styles.headerIcon}>
                <span className="material-symbols-outlined" style={{ fontSize: 26 }}>grid_view</span>
              </div>
              <div>
                <h1 className={styles.headerTitle}>Navigation</h1>
              </div>
            </div>
            <div className={styles.headerRight}>
              <div className={styles.searchWrap}>
                <span className={`material-symbols-outlined ${styles.searchIcon}`}>search</span>
                <input
                  className={styles.searchInput}
                  placeholder="Jump to module, tool, ledger, or queue... (Cmd+K)"
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  autoFocus
                />
                <div className={styles.searchKbds}>
                  <kbd className={styles.kbd}>⌘K</kbd>
                  <kbd className={styles.kbd}>ESC</kbd>
                </div>
              </div>
              <button
                type="button"
                className={styles.closeBtn}
                title="Close (Esc)"
                onClick={onClose}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
          </div>

          {/* Quick Launch strip */}
          <div className={styles.quickLaunchStrip}>
            <div className={styles.quickLaunchLeft}>
              <span className={styles.quickLaunchLabel}>
                <span className={`material-symbols-outlined ${styles.quickLaunchIcon}`}>bolt</span>
                Quick Launch:
              </span>
              <div className={styles.quickLaunchBtns}>
                {QUICK_LAUNCH.map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    className={styles.quickLaunchBtn}
                    onClick={() => handleQuickLaunch(item)}
                  >
                    <span className={`material-symbols-outlined ${styles.quickLaunchBtnIcon}`}>
                      {item.icon}
                    </span>
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
            <div className={styles.autoRouter}>
              <span className={styles.autoRouterDot} />
              <span className={styles.autoRouterText}>Auto-Router Active • Latency 28ms</span>
            </div>
          </div>
        </div>

        {/* Pillar grid */}
        <div className={styles.gridWrap}>
          <div className={styles.grid}>
            {filteredPillars.map((p) => {
              const domain = DOMAINS[p.key];
              const links = domain.groups.slice(0, 4).map((g) => ({
                label: g.name,
                screenId: g.screens[0]?.id,
                count: groupScreenCount(g),
              }));
              const totalRoutes = domain.groups.reduce(
                (sum, g) => sum + groupScreenCount(g),
                0
              );
              return (
                <div key={p.key} className={styles.pillarCard}>
                  <div className={styles.pillarCardTop}>
                    <div className={styles.pillarCardHeader}>
                      <div className={`${styles.pillarIcon} ${p.iconBg}`}>
                        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                          {p.icon}
                        </span>
                      </div>
                      <span className={styles.pillarTitle}>
                        {p.num}. {p.label}
                      </span>
                    </div>
                    <span className={`${styles.pillarTag} ${p.tagCls}`}>{p.tag}</span>
                  </div>
                  <p className={styles.pillarBlurb}>{p.blurb}</p>
                  <div className={styles.pillarLinks}>
                    {links.map((l) => (
                      <button
                        key={l.label}
                        type="button"
                        className={styles.pillarLink}
                        onClick={() => l.screenId && handleGroupLinkClick(p.key, l.screenId)}
                      >
                        <span className={styles.pillarLinkLeft}>
                          <span className={`material-symbols-outlined ${styles.pillarLinkIcon}`}>
                            chevron_right
                          </span>
                          {l.label}
                        </span>
                        <span className={styles.pillarLinkCount}>{l.count}</span>
                      </button>
                    ))}
                  </div>
                  <div className={styles.pillarFooter}>
                    <span className={styles.pillarFooterStat}>
                      {domain.groups.length} groups · {totalRoutes} routes
                    </span>
                    <button
                      type="button"
                      className={styles.pillarExplore}
                      onClick={() => handlePillarClick(p.key)}
                    >
                      Explore
                      <span className={`material-symbols-outlined ${styles.pillarExploreIcon}`}>
                        chevron_right
                      </span>
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredPillars.length === 0 && (
              <div className={styles.noResults}>
                <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#5a6355' }}>
                  search_off
                </span>
                <p>No modules match &ldquo;{search}&rdquo;</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span className={styles.footerUtilLabel}>
              <span className={`material-symbols-outlined ${styles.footerUtilLabelIcon}`}>
                construction
              </span>
              Utilities:
            </span>
            <div className={styles.footerUtils}>
              {FOOTER_UTILITIES.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={styles.footerUtilBtn}
                  onClick={() => handleFooterUtility(item)}
                >
                  <span className={`material-symbols-outlined ${styles.footerUtilIcon}`}>
                    {item.icon}
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.footerRight}>
            <div className={styles.tenantInfo}>
              <div className={styles.tenantDot} />
              <span className={styles.tenantLabel}>Production US-East</span>
              <span className={styles.tenantBadge}>Tenant #00281</span>
            </div>
            <button
              type="button"
              className={styles.switchOrgBtn}
              onClick={() => {
                onClose();
                onToast('Switch org — opening');
              }}
            >
              <span className={`material-symbols-outlined ${styles.switchOrgIcon}`}>
                swap_horiz
              </span>
              Switch Org
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
