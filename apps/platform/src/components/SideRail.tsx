'use client';
/**
 * SideRail — fixed sidebar navigation.
 *
 * Screen children are collapsible accordions (NOT stuck open inline):
 *   - Click a parent screen with children → toggles expand/collapse
 *   - Click a child screen → navigates
 *   - Parents auto-expand if they contain the active screen
 *   - Parents auto-expand when the filter matches a child
 *
 * The Design Studio's Catalog group mirrors the REAL catalog tree from
 * GET /api/v1/categories (departments → subcategories, with live keeper
 * product counts) — NOT the old hardcoded TOP_NAV fantasy whose links
 * (Women → Sweatshirts, Long Sleeves, Tank Tops…) don't exist in the real
 * catalog and silently fell back to unrelated products.
 */
import { useEffect, useMemo, useState } from 'react';
import {
  DOMAINS,
  DomainKey,
  GroupBgToken,
  ScreenItem,
  ScreenType,
  catalogScreenIdForPath,
  catalogPathFor,
  groupScreenCount,
  registerCatalogPaths,
} from '@/data/shellData';
import { TOP_NAV, STOREFRONT_NAV, NavChild, useDesignCanvas, resolveCatalogPathSlugs } from '@/lib/designCanvasStore';
import styles from './SideRail.module.css';

interface SideRailProps {
  activeDomain: DomainKey;
  activeScreen: string;
  openGroups: string[];
  sideFilter: string;
  onSideFilterChange: (value: string) => void;
  onToggleGroup: (groupName: string) => void;
  onSelectScreen: (screenId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  screenBadges?: Record<string, number>;
  /** Launch the Create Wizard for a category (and optional subcategory).
   *  Wired as an icon next to every catalog child. */
  onLaunchWizard?: (category: string, subcategory?: string) => void;
}

const GROUP_BG_CLASS: Record<GroupBgToken, string> = {
  'bg-qb-navy': styles.bgQbNavy,
  'bg-qb-teal': styles.bgQbTeal,
  'bg-qb-maroon': styles.bgQbMaroon,
  'bg-qb-green': styles.bgQbGreen,
  'bg-qb-purple': styles.bgQbPurple,
  'bg-qb-orange': styles.bgQbOrange,
  'bg-error': styles.bgError,
  'bg-primary': styles.bgPrimary,
};

export default function SideRail({
  activeDomain,
  activeScreen,
  openGroups,
  sideFilter,
  onSideFilterChange,
  onToggleGroup,
  onSelectScreen,
  collapsed,
  onToggleCollapse,
  screenBadges,
  onLaunchWizard,
}: SideRailProps) {
  const domain = DOMAINS[activeDomain];
  const query = sideFilter.toLowerCase();

  // ── Storefront nav (hard-coded — no API/DB) ──
  // The Catalog group reads STOREFRONT_NAV directly. The previous code
  // fetched /api/v1/categories (the legacy Printify catalog dump with
  // Apparel/Wall Art/Drinkware as roots) — that was the wrong tree. The
  // user's storefront tree is hard-coded in designCanvasStore.ts and
  // rendered verbatim here, three levels deep (department → subcategory →
  // sub-subcategory). No fetch, no cache, no fallback.
  useEffect(() => {
    // No-op: nav is hard-coded. Kept so the sideFilter/auto-expand logic
    // below that referenced navStatus still type-checks.
  }, [activeDomain]);

  const realCatalogScreens = useMemo<ScreenItem[] | null>(() => {
    const paths: Record<string, string[]> = {};
    const walk = (nodes: NavChild[], pathNames: string[]) => {
      for (const n of nodes) {
        const p = [...pathNames, n.name];
        paths[catalogScreenIdForPath(p)] = p;
        if (n.children?.length) walk(n.children, p);
      }
    };
    walk(STOREFRONT_NAV, []);
    registerCatalogPaths(paths);

    const toScreenItem = (node: NavChild, parentPath: string[]): ScreenItem => {
      const path = [...parentPath, node.name];
      const kids = node.children ?? [];
      return {
        id: catalogScreenIdForPath(path),
        label: node.name,
        type: 'list' as ScreenType,
        ...(kids.length > 0
          ? { children: kids.map((k) => toScreenItem(k, path)) }
          : {}),
      };
    };

    return STOREFRONT_NAV.map((dept) => toScreenItem(dept, []));
  }, []);

  // Track which parent screens are manually expanded.
  const [expandedScreens, setExpandedScreens] = useState<Set<string>>(new Set());

  function toggleScreenExpand(screenId: string) {
    setExpandedScreens((prev) => {
      const next = new Set(prev);
      if (next.has(screenId)) next.delete(screenId);
      else next.add(screenId);
      return next;
    });
  }

  // A parent screen is expanded if:
  // 1. Manually expanded, OR
  // 2. It contains the active screen as a child (auto-expand on navigation), OR
  // 3. A deep path screen below one of its children is active
  //    (studio-apparel--women--t-shirts lives under studio-apparel--women), OR
  // 4. The filter matches one of its children (auto-expand on search)
  function isScreenExpanded(screen: ScreenItem): boolean {
    if (!screen.children || screen.children.length === 0) return false;
    if (expandedScreens.has(screen.id)) return true;
    if (screen.children.some((c) => c.id === activeScreen)) return true;
    if (screen.children.some((c) => activeScreen.startsWith(c.id + '--'))) return true;
    if (query && screen.children.some((c) => c.label.toLowerCase().includes(query))) return true;
    return false;
  }

  function handleScreenClick(screen: ScreenItem) {
    // Parent rows (any node with children) DON'T navigate — clicking them
    // only toggles expand/collapse, same as the chevron. The user MUST
    // open the chevron and pick a leaf child to route. Leaf rows navigate.
    if (screen.children && screen.children.length > 0) {
      toggleScreenExpand(screen.id);
      return;
    }
    onSelectScreen(screen.id);
  }

  function handleChevronClick(e: React.MouseEvent, screenId: string) {
    // Click the chevron ONLY toggles expand/collapse — doesn't navigate.
    e.stopPropagation();
    toggleScreenExpand(screenId);
  }

  // Extract the category path from a screen id for the wizard icon.
  function catalogInfoFor(screenId: string): { category: string; subcategory?: string } | null {
    if (activeDomain !== 'design') return null;
    if (!screenId.startsWith('studio-')) return null;
    const slug = screenId.replace('studio-', '');
    // Registry first — the exact names for BOTH path ids
    // (studio-apparel--women--t-shirts) and single-segment department ids
    // (studio-apparel).
    const registered = catalogPathFor(screenId);
    if (registered) return { category: registered[0], subcategory: registered[1] };
    if (slug.includes('--')) {
      const segs = slug.split('--');
      if (navCategories) {
        const resolved = resolveCatalogPathSlugs(navCategories, segs);
        if (resolved) return { category: resolved[0], subcategory: resolved[1] };
      }
      const pretty = (s: string) =>
        s.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
      return { category: pretty(segs[0]), subcategory: segs[1] ? pretty(segs[1]) : undefined };
    }
    // Legacy single-dash ids (the TOP_NAV placeholder or old open tabs):
    // studio-women → Women, studio-home-and-living-mugs → category + sub.
    const slugifyLocal = (s: string) => s.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    for (const [cat, subs] of Object.entries(TOP_NAV)) {
      const catSlug = slugifyLocal(cat);
      if (slug === catSlug) return { category: cat };
      const subSlug = slug.slice(catSlug.length + 1);
      if (slug.startsWith(catSlug + '-') && subSlug) {
        const sub = subs.find((s) => slugifyLocal(s) === subSlug);
        if (sub) return { category: cat, subcategory: sub };
      }
    }
    return null;
  }

  function handleWizardClick(e: React.MouseEvent, category: string, subcategory?: string) {
    e.stopPropagation();
    onLaunchWizard?.(category, subcategory);
  }

  return (
    <aside className={`${styles.sideRail} ${collapsed ? styles.sideRailCollapsed : ''}`}>
      <div className={styles.headerRow}>
        <div className={styles.headerLeft}>
          <button
            type="button"
            className={styles.collapseBtn}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!collapsed}
            onClick={onToggleCollapse}
          >
            <span className={`material-symbols-outlined ${styles.icon18}`}>
              {collapsed ? 'menu_open' : 'left_panel_close'}
            </span>
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className={styles.filterRow}>
          <div className={styles.filterInner}>
            <span className={`material-symbols-outlined ${styles.icon15Search}`}>search</span>
            <input
              id="side-filter"
              className={styles.filterInput}
              placeholder="Filter…"
              type="text"
              value={sideFilter}
              onChange={(e) => onSideFilterChange(e.target.value)}
            />
          </div>
        </div>
      )}

      <div className={styles.navScroll}>
        <nav id="siderail">
          {domain.groups.map((group) => {
            // The Design Studio's Catalog group renders the REAL tree once
            // loaded — every link maps to a node that actually exists.
            const groupScreens =
              group.name === 'Catalog' && realCatalogScreens ? realCatalogScreens : group.screens;
            // Filter: a screen matches on its own label or a child's label.
            // Children filter independently unless the parent itself matches.
            // Hidden screens never render in the sidebar (they are opened
            // by an icon or an action); findScreen still resolves them.
            const visibleScreens = groupScreens
              .filter((s) => !s.hidden)
              .map((s) => {
                if (!query) return s;
                if (s.label.toLowerCase().includes(query)) return s;
                const matchingChildren = (s.children ?? []).filter(
                  (c) => !c.hidden && c.label.toLowerCase().includes(query)
                );
                if (matchingChildren.length > 0) {
                  return { ...s, children: matchingChildren };
                }
                return null;
              })
              .filter((s): s is ScreenItem => s !== null);
            if (query && visibleScreens.length === 0) return null;

            const isOpen =
              !collapsed && (openGroups.includes(group.name) || Boolean(query && visibleScreens.length > 0));

            return (
              <div key={group.name} className={styles.groupBlock}>
                <button
                  type="button"
                  data-group={group.name}
                  className={`${styles.groupBtn} ${collapsed ? styles.groupBtnCollapsed : ''}`}
                  title={collapsed ? group.name : undefined}
                  onClick={() => !collapsed && onToggleGroup(group.name)}
                >
                  <div className={styles.groupBtnLeft}>
                    <div className={`${styles.groupBadge} ${GROUP_BG_CLASS[group.bg]}`}>
                      <span className={`material-symbols-outlined ${styles.icon13}`}>
                        {group.icon}
                      </span>
                    </div>
                    {!collapsed && <span className={styles.groupName}>{group.name}</span>}
                  </div>
                  {!collapsed && (
                    <div className={styles.groupBtnRight}>
                      <span
                        className={`${styles.groupCount} ${
                          group.badge !== undefined ? styles.groupCountAlert : ''
                        }`}
                      >
                        {groupScreenCount(group)}
                      </span>
                      <span
                        className={`material-symbols-outlined ${styles.icon16} ${styles.chevron} ${
                          isOpen ? styles.chevronOpen : ''
                        }`}
                      >
                        expand_more
                      </span>
                    </div>
                  )}
                </button>
                {!collapsed && isOpen && (
                  <div className={styles.screensList}>
                    {visibleScreens.map((screen) => {
                      const active = screen.id === activeScreen;
                      const isOv = screen.type === 'overview';
                      const hasChildren = screen.children && screen.children.length > 0;
                      const expanded = isScreenExpanded(screen);
                      const catalogInfo = catalogInfoFor(screen.id);
                      let btnClass = styles.screenBtn;
                      if (active) {
                        btnClass = `${styles.screenBtn} ${styles.screenBtnActive}`;
                      } else if (isOv) {
                        btnClass = `${styles.screenBtn} ${styles.screenBtnOverview}`;
                      }
                      if (hasChildren) {
                        btnClass = `${btnClass} ${styles.screenBtnParent}`;
                      }
                      const badgeCount =
                        screenBadges && screenBadges[screen.id] !== undefined
                          ? screenBadges[screen.id]
                          : screen.badge;
                      return (
                        <div key={screen.id} className={catalogInfo ? styles.catalogRow : undefined}>
                          <button
                            type="button"
                            data-screen={screen.id}
                            className={btnClass}
                            onClick={() => handleScreenClick(screen)}
                            aria-expanded={hasChildren ? expanded : undefined}
                          >
                            <span className={styles.screenLabel}>
                              {isOv && (
                                <span className={`material-symbols-outlined ${styles.icon13}`}>
                                  play_circle
                                </span>
                              )}
                              {!collapsed && screen.label}
                            </span>
                            {!collapsed && badgeCount !== undefined && badgeCount > 0 && (
                              <span
                                className={`${styles.screenBadge} ${
                                  active ? styles.screenBadgeActive : ''
                                }`}
                              >
                                {badgeCount}
                              </span>
                            )}
                            {/* Wizard icon ONLY on leaf catalog rows (no
                                children). Parent rows just expand/collapse —
                                you must open the chevron and pick a leaf. */}
                            {!collapsed && !hasChildren && catalogInfo && (
                              <span
                                className={`material-symbols-outlined ${styles.icon14} ${styles.wizardIcon}`}
                                role="button"
                                tabIndex={0}
                                title={`Create wizard for ${catalogInfo.category}${catalogInfo.subcategory ? ' · ' + catalogInfo.subcategory : ''}`}
                                aria-label={`Create wizard for ${catalogInfo.category}${catalogInfo.subcategory ? ' · ' + catalogInfo.subcategory : ''}`}
                                onClick={(e) => handleWizardClick(e, catalogInfo.category, catalogInfo.subcategory)}
                              >
                                auto_fix_high
                              </span>
                            )}
                            {hasChildren && (
                              <span
                                className={`material-symbols-outlined ${styles.icon14} ${styles.screenChevron} ${
                                  expanded ? styles.screenChevronOpen : ''
                                }`}
                                onClick={(e) => handleChevronClick(e, screen.id)}
                                role="button"
                                tabIndex={0}
                                aria-label={expanded ? 'Collapse' : 'Expand'}
                              >
                                expand_more
                              </span>
                            )}
                          </button>
                          {/* Children render ONLY when the parent is expanded
                              (accordion — not stuck open) */}
                          {hasChildren && expanded && (
                            <div className={styles.childList}>
                              {screen.children!.map((child) => {
                                const childActive = child.id === activeScreen;
                                const childClass = childActive
                                  ? `${styles.screenBtn} ${styles.screenBtnActive}`
                                  : styles.screenBtn;
                                const childCatalogInfo = catalogInfoFor(child.id);
                                const childHasChildren =
                                  child.children && child.children.length > 0;
                                const childExpanded = isScreenExpanded(child);
                                let childBtnClass = `${childClass} ${styles.screenBtnChild}`;
                                if (childHasChildren) {
                                  childBtnClass = `${childBtnClass} ${styles.screenBtnParent}`;
                                }
                                return (
                                  <div key={child.id} className={styles.catalogRow}>
                                    <button
                                      type="button"
                                      data-screen={child.id}
                                      className={childBtnClass}
                                      onClick={() => handleScreenClick(child)}
                                      aria-expanded={childHasChildren ? childExpanded : undefined}
                                    >
                                      <span className={styles.screenLabel}>{child.label}</span>
                                      {!collapsed && !childHasChildren && childCatalogInfo && (
                                        <span
                                          className={`material-symbols-outlined ${styles.icon14} ${styles.wizardIcon}`}
                                          role="button"
                                          tabIndex={0}
                                          title={`Create wizard for ${childCatalogInfo.category} · ${childCatalogInfo.subcategory}`}
                                          aria-label={`Create wizard for ${childCatalogInfo.category} · ${childCatalogInfo.subcategory}`}
                                          onClick={(e) => handleWizardClick(e, childCatalogInfo.category, childCatalogInfo.subcategory)}
                                        >
                                          auto_fix_high
                                        </span>
                                      )}
                                      {childHasChildren && (
                                        <span
                                          className={`material-symbols-outlined ${styles.icon14} ${styles.screenChevron} ${
                                            childExpanded ? styles.screenChevronOpen : ''
                                          }`}
                                          onClick={(e) => handleChevronClick(e, child.id)}
                                          role="button"
                                          tabIndex={0}
                                          aria-label={childExpanded ? 'Collapse' : 'Expand'}
                                        >
                                          expand_more
                                        </span>
                                      )}
                                    </button>
                                    {/* Grandchildren (level 3) — render when the
                                        child is expanded. */}
                                    {childHasChildren && childExpanded && (
                                      <div className={styles.childList}>
                                        {child.children!.map((grand) => {
                                          const grandActive = grand.id === activeScreen;
                                          const grandClass = grandActive
                                            ? `${styles.screenBtn} ${styles.screenBtnActive}`
                                            : styles.screenBtn;
                                          const grandCatalogInfo = catalogInfoFor(grand.id);
                                          return (
                                            <div key={grand.id} className={styles.catalogRow}>
                                              <button
                                                type="button"
                                                data-screen={grand.id}
                                                className={`${grandClass} ${styles.screenBtnChild}`}
                                                onClick={() => onSelectScreen(grand.id)}
                                              >
                                                <span className={styles.screenLabel}>{grand.label}</span>
                                                {!collapsed && grandCatalogInfo && (
                                                  <span
                                                    className={`material-symbols-outlined ${styles.icon14} ${styles.wizardIcon}`}
                                                    role="button"
                                                    tabIndex={0}
                                                    title={`Create wizard for ${grandCatalogInfo.category} · ${grandCatalogInfo.subcategory}`}
                                                    aria-label={`Create wizard for ${grandCatalogInfo.category} · ${grandCatalogInfo.subcategory}`}
                                                    onClick={(e) => handleWizardClick(e, grandCatalogInfo.category, grandCatalogInfo.subcategory)}
                                                  >
                                                    auto_fix_high
                                                  </span>
                                                )}
                                              </button>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </div>

      <div className={`${styles.footer} ${collapsed ? styles.footerCollapsed : ''}`}>
        {collapsed ? (
          <button type="button" className={styles.footerBtnIconOnly} title="Workspace">
            <span className={`material-symbols-outlined ${styles.icon14}`}>add_box</span>
          </button>
        ) : (
          <div className={styles.footerGrid}>
            <button type="button" className={styles.footerBtn}>
              <span className={`material-symbols-outlined ${styles.icon14}`}>add_box</span>
              Workspace
            </button>
            <button type="button" className={styles.footerBtn}>
              <span className={`material-symbols-outlined ${styles.icon14}`}>download</span>
              Export
            </button>
          </div>
        )}
        {!collapsed && (
          <div className={styles.syncRow}>
            <span>
              <span className={styles.syncDot} />
              Sync: 2s ago
            </span>
            <span>v3.8.4</span>
          </div>
        )}
      </div>
    </aside>
  );
}
