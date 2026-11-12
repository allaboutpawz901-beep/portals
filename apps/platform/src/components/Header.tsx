'use client';

import { useState, useRef, useEffect } from 'react';
import type { DomainKey } from '@/data/shellData';
import styles from './Header.module.css';

export interface WorkspaceTab {
  key: string;
  domain: DomainKey;
  screenId: string;
  label: string;
}

interface HeaderProps {
  openTabs: WorkspaceTab[];
  activeTabKey: string;
  onSelectTab: (tab: WorkspaceTab) => void;
  onCloseTab: (tabKey: string) => void;
  onOpenCreateFlyout: () => void;
  onOpenNavigationHub: () => void;
  onOpenSettings: (screenId?: string) => void;
  viewMode: 'business' | 'accountant';
  onChangeViewMode: (mode: 'business' | 'accountant') => void;
  onToast?: (message: string) => void;
  /** Full-screen focus mode: hides the workspace tab bar (page chrome). */
  hideTabs?: boolean;
}

export default function Header({
  openTabs,
  activeTabKey,
  onSelectTab,
  onCloseTab,
  onOpenCreateFlyout,
  onOpenNavigationHub,
  onOpenSettings,
  viewMode,
  onChangeViewMode,
  onToast,
  hideTabs = false,
}: HeaderProps) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const avatarBtnRef = useRef<HTMLButtonElement | null>(null);
  const [orgMenuOpen, setOrgMenuOpen] = useState(false);
  const orgMenuRef = useRef<HTMLDivElement | null>(null);
  const orgBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!userMenuOpen && !orgMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        userMenuOpen &&
        userMenuRef.current &&
        !userMenuRef.current.contains(e.target as Node) &&
        avatarBtnRef.current &&
        !avatarBtnRef.current.contains(e.target as Node)
      ) {
        setUserMenuOpen(false);
      }
      if (
        orgMenuOpen &&
        orgMenuRef.current &&
        !orgMenuRef.current.contains(e.target as Node) &&
        orgBtnRef.current &&
        !orgBtnRef.current.contains(e.target as Node)
      ) {
        setOrgMenuOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setUserMenuOpen(false);
        setOrgMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [userMenuOpen]);

  return (
    <header className={styles.header}>
      <div className={styles.topBar}>
        <div className={styles.leftGroup}>
          <button
            id="btn-hamburger"
            type="button"
            className={styles.allAppsBtn}
            title="Navigation"
            onClick={onOpenNavigationHub}
          >
            <span className={`material-symbols-outlined ${styles.icon20}`}>menu</span>
          </button>
          <div style={{ position: 'relative' }}>
            <button
              ref={orgBtnRef}
              type="button"
              className={styles.companyBtn}
              title="Switch organization"
              aria-expanded={orgMenuOpen}
              onClick={() => setOrgMenuOpen((prev) => !prev)}
            >
              <span>Unsaid</span>
              <span className={`material-symbols-outlined ${styles.icon16Muted}`}>
                arrow_drop_down
              </span>
            </button>
            {orgMenuOpen && (
              <div
                ref={orgMenuRef}
                className={styles.orgMenu}
                role="menu"
                onClick={() => setOrgMenuOpen(false)}
              >
                <button
                  type="button"
                  className={`${styles.orgMenuItem} ${styles.orgMenuItemActive}`}
                >
                  <span className={`material-symbols-outlined ${styles.orgMenuItemIcon}`}>
                    check
                  </span>
                  Unsaid
                  <span className={styles.orgMenuItemMeta}>Current</span>
                </button>
                <div className={styles.orgMenuDivider} />
                <button
                  type="button"
                  className={styles.orgMenuItem}
                  onClick={() => onToast?.('Add org — tenant builder coming soon')}
                >
                  <span className={`material-symbols-outlined ${styles.orgMenuItemIcon}`}>
                    add
                  </span>
                  Add org
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={styles.searchContainer}>
          <div className={styles.searchInner}>
            <span className={`material-symbols-outlined ${styles.icon18Search}`}>search</span>
            <input
              className={styles.searchInput}
              placeholder="Search transactions, contacts, reports, ⌘K"
              type="search"
            />
            <span className={styles.shortcutBadge}>⌘K</span>
          </div>
        </div>
        <div className={styles.rightGroup}>
          <button
            id="btn-create"
            type="button"
            className={styles.quickActionBtn}
            title="Create"
            onClick={onOpenCreateFlyout}
            aria-label="Create"
          >
            <span className={`material-symbols-outlined ${styles.iconCirclePlus}`}>add_circle</span>
          </button>
          <span className={styles.dateText}>Sun, Nov 1, 2026</span>
          <button
            ref={avatarBtnRef}
            type="button"
            className={`${styles.avatarBtn} ${
              userMenuOpen ? styles.avatarBtnOpen : ''
            }`}
            aria-label="User menu"
            aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen((prev) => !prev)}
          >
            <div className={styles.avatar}>SA</div>
            <span
              className={`material-symbols-outlined ${styles.icon16Muted}`}
              style={{ fontSize: '18px' }}
            >
              arrow_drop_down
            </span>
          </button>
        </div>
      </div>

      {userMenuOpen && (
        <div ref={userMenuRef} className={styles.userMenu} role="menu">
          {/* User header */}
          <div className={styles.userMenuHeader}>
            <div className={styles.userMenuName}>Sarah Ahmed</div>
            <div className={styles.userMenuEmail}>sarah@unsaid.io</div>
          </div>

          {/* Role switcher */}
          <div className={styles.roleToggleWrap}>
            <span className={styles.roleToggleLabel}>View as</span>
            <div className={styles.roleToggle}>
              <button
                type="button"
                className={`${styles.roleToggleBtn} ${
                  viewMode === 'business' ? styles.roleToggleBtnActive : ''
                }`}
                onClick={() => {
                  onChangeViewMode('business');
                  onToast?.('Switched to Business view');
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '14px' }}
                >
                  storefront
                </span>
                Business
              </button>
              <button
                type="button"
                className={`${styles.roleToggleBtn} ${
                  viewMode === 'accountant' ? styles.roleToggleBtnActive : ''
                }`}
                onClick={() => {
                  onChangeViewMode('accountant');
                  onToast?.('Switched to Accountant view');
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '14px' }}
                >
                  calculate
                </span>
                Accountant
              </button>
            </div>
          </div>

          <div className={styles.userMenuDivider} />

          <div className={styles.userMenuSectionTitle}>Profile</div>
          <button
            type="button"
            className={styles.userMenuItem}
            onClick={() => {
              setUserMenuOpen(false);
              onOpenSettings();
            }}
          >
            <span className={`material-symbols-outlined ${styles.userMenuItemIcon}`}>
              manage_accounts
            </span>
            Account &amp; settings
          </button>
          <button
            type="button"
            className={styles.userMenuItem}
            onClick={() => {
              setUserMenuOpen(false);
              onOpenSettings('ws-teammates');
            }}
          >
            <span className={`material-symbols-outlined ${styles.userMenuItemIcon}`}>
              groups
            </span>
            Manage users
          </button>
          <button
            type="button"
            className={styles.userMenuItem}
            onClick={() => {
              setUserMenuOpen(false);
              onToast?.('What’s new');
            }}
          >
            <span className={`material-symbols-outlined ${styles.userMenuItemIcon}`}>
              new_releases
            </span>
            What’s new
          </button>
          <button
            type="button"
            className={styles.userMenuItem}
            onClick={() => {
              setUserMenuOpen(false);
              onToast?.('Feedback');
            }}
          >
            <span className={`material-symbols-outlined ${styles.userMenuItemIcon}`}>
              chat
            </span>
            Feedback
          </button>

          <div className={styles.userMenuDivider} />

          <button
            type="button"
            className={`${styles.userMenuItem} ${styles.userMenuDanger}`}
            onClick={() => {
              setUserMenuOpen(false);
              onToast?.('Signed out — redirecting to login');
              // In a real app, this would call the auth sign-out API and
              // redirect to /login. For now, reload to the dashboard.
              setTimeout(() => {
                window.location.href = '/';
              }, 1500);
            }}
          >
            <span className={`material-symbols-outlined ${styles.userMenuItemIcon}`}>
              logout
            </span>
            Sign out
          </button>
        </div>
      )}

      <div className={styles.tabBar} hidden={hideTabs || undefined} style={hideTabs ? { display: 'none' } : undefined}>
        <nav id="tabstrip" className={styles.tabStrip}>
          {openTabs.map((tab) => {
            const active = tab.key === activeTabKey;
            return (
              <div
                key={tab.key}
                role="tab"
                tabIndex={0}
                aria-selected={active}
                data-tab={tab.key}
                className={`${styles.tabLink} ${active ? styles.tabLinkActive : ''}`}
                onClick={() => onSelectTab(tab)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelectTab(tab);
                  }
                }}
              >
                <span className={styles.tabLabel}>{tab.label}</span>
                <button
                  type="button"
                  className={styles.tabCloseBtn}
                  title={`Close ${tab.label}`}
                  aria-label={`Close ${tab.label}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tab.key);
                  }}
                >
                  <span className={`material-symbols-outlined ${styles.icon14Close}`}>
                    close
                  </span>
                </button>
              </div>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
