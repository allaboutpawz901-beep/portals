import { DemoRow } from '@/data/shellData';
import StatusPill from './StatusPill';
import styles from './PeekDrawer.module.css';

interface PeekDrawerProps {
  open: boolean;
  row: DemoRow | null;
  onClose: () => void;
  onOpenFull: () => void;
}

export default function PeekDrawer({ open, row, onClose, onOpenFull }: PeekDrawerProps) {
  const title = row
    ? row.no
      ? `Invoice #${row.no}`
      : String(
          row.title ||
            row.name ||
            row.seller ||
            row.dimension ||
            row.code ||
            row.vendor ||
            row.payee ||
            row.holder ||
            row.event ||
            'Record'
        )
    : 'Invoice #1002';

  const fields = row ? Object.entries(row).filter(([k]) => k !== 'status') : [];

  return (
    <div id="peek" className={`${styles.peek} ${open ? styles.open : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={`material-symbols-outlined ${styles.icon18Muted}`}>receipt_long</span>
          <span id="peek-title" className={styles.title}>
            {title}
          </span>
        </div>
        <div className={styles.headerRight}>
          <button
            id="peek-open-full"
            type="button"
            className={styles.openFullBtn}
            onClick={onOpenFull}
          >
            <span className={`material-symbols-outlined ${styles.icon14}`}>open_in_full</span>
            Open full
          </button>
          <button
            id="peek-close"
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
          >
            <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
          </button>
        </div>
      </div>
      <div id="peek-body" className={styles.body}>
        {row && (
          <>
            <div className={styles.statusRow}>
              {row.status ? <StatusPill status={String(row.status)} /> : null}
            </div>
            <dl className={styles.fieldList}>
              {fields.map(([k, v]) => (
                <div key={k} className={styles.fieldRow}>
                  <dt className={styles.fieldKey}>{k}</dt>
                  <dd className={styles.fieldVal}>{String(v)}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.section}>
              <h3 className={styles.sectionHeading}>Activity</h3>
              <div className={styles.activityList}>
                <div className={styles.activityItem}>
                  <span className={`material-symbols-outlined ${styles.icon14}`}>
                    check_circle
                  </span>
                  Created by SA
                </div>
                <div className={styles.activityItem}>
                  <span className={`material-symbols-outlined ${styles.icon14}`}>mail</span>
                  Emailed to customer
                </div>
                <div className={styles.activityItem}>
                  <span className={`material-symbols-outlined ${styles.icon14}`}>visibility</span>
                  Viewed 3 times
                </div>
              </div>
            </div>
            <div className={styles.section}>
              <h3 className={styles.sectionHeading}>Notes &amp; tasks</h3>
              <textarea className={styles.noteInput} placeholder="Add a note…" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
