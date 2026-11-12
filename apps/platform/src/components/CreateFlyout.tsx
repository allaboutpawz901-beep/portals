import { useEffect, useRef, useState } from 'react';
import { CREATE_REGISTRY, CreateDotToken } from '@/data/shellData';
import styles from './CreateFlyout.module.css';

interface CreateFlyoutProps {
  open: boolean;
  onClose: () => void;
  onSelectCreate: (label: string) => void;
}

const DOT_CLASS_MAP: Record<CreateDotToken, string> = {
  'bg-primary': styles.dotPrimary,
  'bg-secondary': styles.dotSecondary,
  'bg-tertiary': styles.dotTertiary,
  'bg-qb-navy': styles.dotQbNavy,
  'bg-primary-container': styles.dotPrimaryContainer,
  'bg-error': styles.dotError,
};

export default function CreateFlyout({
  open,
  onClose,
  onSelectCreate,
}: CreateFlyoutProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      searchRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  const query = search.toLowerCase().trim();

  return (
    <div
      id="flyout-create"
      className={`${styles.scrim} ${open ? styles.open : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div className={styles.dialog}>
        <div className={styles.gradientBar} />
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.headerBrand}>
              <div className={styles.brandIcon}>
                <span className={`material-symbols-outlined ${styles.icon24}`}>
                  add_box
                </span>
              </div>
              <div>
                <div className={styles.titleRow}>
                  <span className={styles.title}>Create New</span>
                  <span className={styles.factoryBadge}>P1 Universal Factory</span>
                </div>
                <p className={styles.subtitle}>
                  Grouped by counterparty — CREATE_REGISTRY §B1.
                </p>
              </div>
            </div>
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
            </button>
          </div>
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.icon20Search}`}>
              search
            </span>
            <input
              ref={searchRef}
              id="create-search"
              className={styles.searchInput}
              placeholder="Search creates… (invoice, bill, customer, vendor, product, banner)"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd className={styles.escKbd}>ESC</kbd>
          </div>
        </div>

        <div id="create-grid" className={styles.grid}>
          {CREATE_REGISTRY.map((cat) => (
            <div key={cat.title} className={styles.categoryCard}>
              <div className={styles.categoryHeader}>
                <div className={styles.categoryHeaderLeft}>
                  <span className={`${styles.dot} ${DOT_CLASS_MAP[cat.dot]}`} />
                  <span className={styles.categoryTitle}>{cat.title}</span>
                </div>
                <span className={styles.categoryCount}>{cat.items.length}</span>
              </div>
              <nav className={styles.itemsNav}>
                {cat.items.map((item) => {
                  const fullText = `${item.icon}${item.label} ${item.desc}`.toLowerCase();
                  const visible = !query || fullText.includes(query);
                  if (!visible) return null;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      data-create-item={item.label}
                      className={styles.createItem}
                      onClick={() => onSelectCreate(item.label)}
                    >
                      <span className={styles.itemLabel}>
                        <span className={`material-symbols-outlined ${styles.itemIcon}`}>
                          {item.icon}
                        </span>
                        {item.label}
                      </span>
                      <span className={styles.itemDesc}>{item.desc}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span className={`material-symbols-outlined ${styles.icon16Primary}`}>
              verified
            </span>
            <span className={styles.footerGrammar}>
              Save grammar: <strong className={styles.strongPrimary}>Save</strong> •{' '}
              <strong className={styles.strongPrimary}>Save &amp; New</strong> •{' '}
              <strong className={styles.strongPrimary}>Save &amp; Close</strong>
            </span>
          </div>
          <span className={styles.footerRight}>
            Universal footer applies to every create
          </span>
        </div>
      </div>
    </div>
  );
}
