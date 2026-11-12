import styles from './StatusPill.module.css';

interface StatusPillProps {
  status: string;
}

const STATUS_STYLE_MAP: Record<string, string> = {
  Open: styles.open,
  Paid: styles.paid,
  Overdue: styles.overdue,
  'For review': styles.forReview,
  Unpaid: styles.unpaid,
  Draft: styles.draft,
  Published: styles.published,
  Active: styles.paid,
  Common: styles.qbBlue,
  'Preferred (Seed)': styles.qbGreen,
  Options: styles.qbMaroon,
  SAFE: styles.qbTeal,
  Closed: styles.paid,
  'In progress': styles.forReview,
  Outstanding: styles.forReview,
  Converted: styles.draft,
  Current: styles.paid,
  Superseded: styles.draft,
  Signed: styles.paid,
  'Fully vested': styles.paid,
  Exercised: styles.qbBlue,
  Critical: styles.overdue,
  'SLA breach': styles.overdue,
  'On hold': styles.overdue,
  'At risk': styles.overdue,
  'RMA open': styles.overdue,
  'SLA warning': styles.warning,
  'Needs follow-up': styles.warning,
  'Pending W-9': styles.warning,
  'Pending KYB': styles.forReview,
  'Catalog review': styles.forReview,
  Healthy: styles.paid,
  Synced: styles.paid,
  Resolved: styles.paid,
  Approved: styles.paid,
  Verified: styles.paid,
  VIP: styles.qbGreen,
  Snoozed: styles.draft,
  'Exempt (Corp)': styles.draft,
};

export default function StatusPill({ status }: StatusPillProps) {
  const variantClass = STATUS_STYLE_MAP[status] || styles.draft;
  return <span className={`${styles.pill} ${variantClass}`}>{status}</span>;
}
