import crypto from 'crypto';
import {
  ActiveFmvView,
  CalendarComplianceItem,
  CapGrant,
  CapTransaction,
  CapVestingSchedule,
  CapVestingTranche,
  ConvertibleInstrumentSummary,
  DerivedCapTableResult,
  DerivedClassSummary,
  DerivedHolderRow,
  EquityStoreData,
  PlanAvailabilityView,
  Rule701Summary,
} from './equityTypes';

export const GENESIS_PREV_HASH = '0'.repeat(64);

export function sha256Hex(payload: string): string {
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

export function computeLedgerRowHash(fields: {
  seq: number;
  company_id: string;
  security_id: string;
  txn_type: string;
  qty_delta: number;
  split_multiplier?: number;
  price: number;
  counterparty: string | null;
  effective_date: string;
  board_approval_id: string | null;
  document_ids: string[];
  prev_hash: string;
}): string {
  const canonical = JSON.stringify({
    seq: fields.seq,
    company_id: fields.company_id,
    security_id: fields.security_id,
    txn_type: fields.txn_type,
    qty_delta: Number(fields.qty_delta.toFixed(4)),
    split_multiplier: fields.split_multiplier ?? 1,
    price: Number(fields.price.toFixed(4)),
    counterparty: fields.counterparty ?? null,
    effective_date: fields.effective_date,
    board_approval_id: fields.board_approval_id ?? null,
    document_ids: [...fields.document_ids].sort(),
    prev_hash: fields.prev_hash,
  });
  return sha256Hex(canonical);
}

export function verifyLedgerChain(transactions: CapTransaction[]): {
  valid: boolean;
  checked_rows: number;
  head_hash: string;
  broken_at_seq: number | null;
} {
  const ordered = [...transactions].sort((a, b) => a.seq - b.seq);
  let expectedPrev = GENESIS_PREV_HASH;
  for (const tx of ordered) {
    if (tx.prev_hash !== expectedPrev) {
      return {
        valid: false,
        checked_rows: ordered.length,
        head_hash: ordered[ordered.length - 1]?.row_hash || GENESIS_PREV_HASH,
        broken_at_seq: tx.seq,
      };
    }
    const recomputed = computeLedgerRowHash(tx);
    if (recomputed !== tx.row_hash) {
      return {
        valid: false,
        checked_rows: ordered.length,
        head_hash: ordered[ordered.length - 1]?.row_hash || GENESIS_PREV_HASH,
        broken_at_seq: tx.seq,
      };
    }
    expectedPrev = tx.row_hash;
  }
  return {
    valid: true,
    checked_rows: ordered.length,
    head_hash: expectedPrev,
    broken_at_seq: null,
  };
}

export function addMonthsIso(isoDate: string, months: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + months, d));
  return dt.toISOString().slice(0, 10);
}

export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

export function diffDaysIso(fromIso: string, toIso: string): number {
  const a = Date.parse(`${fromIso}T00:00:00Z`);
  const b = Date.parse(`${toIso}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

export function computeVestingTranches(
  schedule: CapVestingSchedule,
  totalQuantity: number
): CapVestingTranche[] {
  if (schedule.frequency === 'immediate' || schedule.total_months <= 0) {
    return [
      {
        tranche_index: 1,
        vest_date: schedule.start_date,
        qty: totalQuantity,
        vested_cumulative: totalQuantity,
        is_cliff: false,
      },
    ];
  }

  const stepMonths = schedule.frequency === 'quarterly' ? 3 : 1;
  const tranches: CapVestingTranche[] = [];
  let cumulative = 0;
  let index = 1;

  const firstMonth = schedule.cliff_months > 0 ? schedule.cliff_months : stepMonths;

  for (let m = firstMonth; m <= schedule.total_months; m += stepMonths) {
    const isLast = m + stepMonths > schedule.total_months;
    const targetCumulative = isLast
      ? totalQuantity
      : Math.floor((totalQuantity * m) / schedule.total_months);
    const trancheQty = Math.max(0, targetCumulative - cumulative);
    cumulative += trancheQty;
    tranches.push({
      tranche_index: index++,
      vest_date: addMonthsIso(schedule.start_date, m),
      qty: trancheQty,
      vested_cumulative: cumulative,
      is_cliff: schedule.cliff_months > 0 && m === schedule.cliff_months,
    });
  }

  if (cumulative < totalQuantity && tranches.length > 0) {
    const diff = totalQuantity - cumulative;
    const last = tranches[tranches.length - 1];
    last.qty += diff;
    last.vested_cumulative = totalQuantity;
  }

  return tranches;
}

export function computeVestedQuantityAsOf(
  grant: CapGrant,
  schedule: CapVestingSchedule | undefined,
  asOfDate: string,
  activeAwardQty?: number
): number {
  const capQty = activeAwardQty !== undefined ? activeAwardQty : grant.quantity;
  if (!schedule) return capQty;
  const tranches = computeVestingTranches(schedule, grant.quantity);
  let vested = 0;
  for (const t of tranches) {
    if (t.vest_date <= asOfDate) {
      vested = t.vested_cumulative;
    }
  }
  return Math.min(vested, capQty);
}

export function deriveCapTable(
  store: EquityStoreData,
  asOfDate: string,
  denominatorMethod: 'allocated_plus_pool' | 'allocated_only' = 'allocated_plus_pool'
): DerivedCapTableResult {
  const orderedTxns = [...store.transactions]
    .filter((t) => t.effective_date <= asOfDate)
    .sort((a, b) => a.seq - b.seq);

  // Track active balance per security_id purely from ledger transactions
  const securityBalance = new Map<string, number>();
  const securityInvested = new Map<string, number>();
  const exercisedByOptionSecurity = new Map<string, number>();
  let cumulativeSplitFactor = 1;

  for (const tx of orderedTxns) {
    if (tx.txn_type === 'split') {
      const mult = tx.split_multiplier && tx.split_multiplier > 0 ? tx.split_multiplier : 1;
      cumulativeSplitFactor *= mult;
      for (const [secId, bal] of securityBalance.entries()) {
        securityBalance.set(secId, bal * mult);
      }
      continue;
    }

    const prev = securityBalance.get(tx.security_id) || 0;
    const next = prev + tx.qty_delta;
    securityBalance.set(tx.security_id, Math.max(0, next));

    if (tx.txn_type === 'issue' || tx.txn_type === 'exercise') {
      const prevInv = securityInvested.get(tx.security_id) || 0;
      securityInvested.set(tx.security_id, prevInv + Math.max(0, tx.qty_delta) * tx.price);
    }

    if (tx.txn_type === 'exercise' && tx.qty_delta < 0) {
      const prevEx = exercisedByOptionSecurity.get(tx.security_id) || 0;
      exercisedByOptionSecurity.set(tx.security_id, prevEx + Math.abs(tx.qty_delta));
    }
  }

  const classMap = new Map(store.security_classes.map((c) => [c.id, c]));
  const stakeholderMap = new Map(store.stakeholders.map((s) => [s.id, s]));
  const grantBySecurityId = new Map(store.grants.map((g) => [g.security_id, g]));
  const scheduleMap = new Map(store.vesting_schedules.map((v) => [v.id, v]));

  const commonClass =
    store.security_classes.find((c) => c.class_type === 'common') ||
    store.security_classes[0];

  // Plan availability derived from ledger
  const plans: PlanAvailabilityView[] = store.equity_plans.map((plan) => {
    const planScaledReserve = plan.total_reserved * cumulativeSplitFactor;
    let activeOpts = 0;
    let exercisedShares = 0;

    for (const sec of store.securities) {
      if (sec.plan_id !== plan.id || sec.issue_date > asOfDate) continue;
      const bal = securityBalance.get(sec.id) || 0;
      if (sec.kind === 'option' || sec.kind === 'rsu') {
        activeOpts += bal;
      } else if (sec.kind === 'share' || sec.kind === 'rsa') {
        exercisedShares += bal;
      }
    }

    const available = Math.max(0, planScaledReserve - activeOpts - exercisedShares);
    return {
      plan_id: plan.id,
      plan_name: plan.name,
      total_reserved: planScaledReserve,
      active_options_outstanding: activeOpts,
      exercised_from_plan: exercisedShares,
      shares_available: available,
    };
  });

  const totalPoolAvailable = plans.reduce((acc, p) => acc + p.shares_available, 0);

  // Aggregate holder × class rows
  const rowBucketMap = new Map<string, DerivedHolderRow>();
  const convertibles: ConvertibleInstrumentSummary[] = [];

  for (const sec of store.securities) {
    if (sec.issue_date > asOfDate) continue;
    const holder = stakeholderMap.get(sec.stakeholder_id);
    if (!holder) continue;

    if (sec.kind === 'safe' || sec.kind === 'convertible_note') {
      const bal = securityBalance.get(sec.id) || 0;
      if (bal > 0) {
        convertibles.push({
          security_id: sec.id,
          certificate_code: sec.certificate_code,
          stakeholder_name: holder.name,
          kind: sec.kind,
          issue_date: sec.issue_date,
          principal_amount: sec.principal_amount || bal,
          valuation_cap: sec.valuation_cap ?? null,
          discount_pct: sec.discount_pct ?? null,
          interest_rate: sec.interest_rate ?? null,
        });
      }
      continue;
    }

    const bal = securityBalance.get(sec.id) || 0;
    if (bal <= 0) continue;

    const secClass = (sec.class_id && classMap.get(sec.class_id)) || commonClass;
    const key = `${holder.id}::${secClass.id}`;
    const existing = rowBucketMap.get(key) || {
      stakeholder_id: holder.id,
      stakeholder_name: holder.name,
      stakeholder_type: holder.type,
      class_id: secClass.id,
      class_name: secClass.name,
      issued_shares: 0,
      as_converted_common: 0,
      options_granted: 0,
      options_vested: 0,
      options_unvested: 0,
      warrants: 0,
      total_fd_shares: 0,
      basic_pct: 0,
      fd_pct: 0,
      invested_capital: 0,
    };

    if (sec.kind === 'share' || sec.kind === 'rsa') {
      existing.issued_shares += bal;
      existing.as_converted_common += bal * secClass.conversion_ratio;
      existing.total_fd_shares += bal * secClass.conversion_ratio;
      existing.invested_capital += securityInvested.get(sec.id) || 0;
    } else if (sec.kind === 'option' || sec.kind === 'rsu') {
      const grant = grantBySecurityId.get(sec.id);
      const sched = grant ? scheduleMap.get(grant.vesting_schedule_id) : undefined;
      const alreadyExercised =
        (exercisedByOptionSecurity.get(sec.id) || 0) * cumulativeSplitFactor;
      const totalVestedEver = grant
        ? computeVestedQuantityAsOf(
            { ...grant, quantity: grant.quantity * cumulativeSplitFactor },
            sched,
            asOfDate
          )
        : bal;
      const remainingVested = Math.min(bal, Math.max(0, totalVestedEver - alreadyExercised));
      const remainingUnvested = Math.max(0, bal - remainingVested);

      existing.options_granted += bal;
      existing.options_vested += remainingVested;
      existing.options_unvested += remainingUnvested;
      existing.total_fd_shares += bal;
    } else if (sec.kind === 'warrant') {
      existing.warrants += bal;
      existing.total_fd_shares += bal * secClass.conversion_ratio;
    }

    rowBucketMap.set(key, existing);
  }

  const rows = Array.from(rowBucketMap.values()).sort(
    (a, b) => b.total_fd_shares - a.total_fd_shares
  );

  const totalBasicShares = rows.reduce((s, r) => s + r.as_converted_common, 0);
  const totalOptionsOutstanding = rows.reduce((s, r) => s + r.options_granted, 0);
  const totalWarrants = rows.reduce((s, r) => s + r.warrants, 0);
  const totalFdShares =
    totalBasicShares +
    totalOptionsOutstanding +
    totalWarrants +
    (denominatorMethod === 'allocated_plus_pool' ? totalPoolAvailable : 0);

  for (const row of rows) {
    row.basic_pct = totalBasicShares > 0 ? (row.as_converted_common / totalBasicShares) * 100 : 0;
    row.fd_pct = totalFdShares > 0 ? (row.total_fd_shares / totalFdShares) * 100 : 0;
  }

  const classSummaries: DerivedClassSummary[] = store.security_classes
    .slice()
    .sort((a, b) => a.seniority_rank - b.seniority_rank)
    .map((cls) => {
      const clsRows = rows.filter((r) => r.class_id === cls.id);
      const issued = clsRows.reduce((s, r) => s + r.issued_shares, 0);
      const asConv = clsRows.reduce((s, r) => s + r.as_converted_common, 0);
      const fd = clsRows.reduce((s, r) => s + r.total_fd_shares, 0);
      const liqPref =
        cls.class_type === 'preferred'
          ? issued * cls.price_per_share_original * cls.liquidation_preference_multiple
          : 0;
      return {
        class_id: cls.id,
        class_name: cls.name,
        class_type: cls.class_type,
        seniority_rank: cls.seniority_rank,
        authorized_shares: cls.authorized_shares * cumulativeSplitFactor,
        issued_shares: issued,
        as_converted_shares: asConv,
        fd_shares: fd,
        liquidation_preference_total: liqPref,
        basic_pct: totalBasicShares > 0 ? (asConv / totalBasicShares) * 100 : 0,
        fd_pct: totalFdShares > 0 ? (fd / totalFdShares) * 100 : 0,
      };
    });

  return {
    as_of_date: asOfDate,
    denominator_method: denominatorMethod,
    total_basic_shares: totalBasicShares,
    total_options_outstanding: totalOptionsOutstanding,
    total_warrants: totalWarrants,
    total_pool_available: totalPoolAvailable,
    total_fd_shares: totalFdShares,
    rows,
    class_summaries: classSummaries,
    convertibles,
    plans,
  };
}

export function computeSnapshotHash(table: DerivedCapTableResult): string {
  return sha256Hex(JSON.stringify(table));
}

export function deriveActiveFmv(
  store: EquityStoreData,
  referenceDate: string
): ActiveFmvView {
  // Check unresolved material events that trigger revaluation
  const unresolvedMaterial = store.material_events.find(
    (ev) => ev.triggers_revaluation && !ev.resolved_val_request_id && ev.event_date <= referenceDate
  );

  const adoptedReports = store.val_reports
    .filter((r) => r.status === 'adopted')
    .sort((a, b) => b.report_date.localeCompare(a.report_date));

  const currentReport = adoptedReports[0];

  if (unresolvedMaterial) {
    return {
      locked: false,
      grants_blocked: true,
      block_reason: `Superseded by material event on ${unresolvedMaterial.event_date} (${unresolvedMaterial.type}: ${unresolvedMaterial.description}). New board-adopted 409A report required.`,
      report_id: currentReport?.id ?? null,
      fmv_per_share_common: null,
      valuation_date: currentReport?.valuation_date ?? null,
      adopted_at: null,
      valid_until: currentReport?.valid_until ?? null,
      days_until_expiry: null,
      snapshot_id: currentReport?.snapshot_id ?? null,
      snapshot_hash: null,
    };
  }

  if (!currentReport) {
    return {
      locked: false,
      grants_blocked: true,
      block_reason:
        'No active board-adopted 409A valuation report on file. Option grants are hard-blocked until board adoption.',
      report_id: null,
      fmv_per_share_common: null,
      valuation_date: null,
      adopted_at: null,
      valid_until: null,
      days_until_expiry: null,
      snapshot_id: null,
      snapshot_hash: null,
    };
  }

  const daysRemaining = diffDaysIso(referenceDate, currentReport.valid_until);
  if (daysRemaining < 0) {
    return {
      locked: false,
      grants_blocked: true,
      block_reason: `409A report (${currentReport.id}) expired on ${currentReport.valid_until}. Option grants are hard-blocked until a new 409A valuation is adopted.`,
      report_id: currentReport.id,
      fmv_per_share_common: null,
      valuation_date: currentReport.valuation_date,
      adopted_at: currentReport.report_date,
      valid_until: currentReport.valid_until,
      days_until_expiry: daysRemaining,
      snapshot_id: currentReport.snapshot_id,
      snapshot_hash: null,
    };
  }

  const approval = store.board_approvals.find(
    (b) => b.id === currentReport.board_approval_id
  );
  const snap = store.snapshots.find((s) => s.id === currentReport.snapshot_id);

  return {
    locked: true,
    grants_blocked: false,
    block_reason: null,
    report_id: currentReport.id,
    fmv_per_share_common: currentReport.fmv_per_share_common,
    valuation_date: currentReport.valuation_date,
    adopted_at: approval?.adopted_at || currentReport.report_date,
    valid_until: currentReport.valid_until,
    days_until_expiry: daysRemaining,
    snapshot_id: currentReport.snapshot_id,
    snapshot_hash: snap?.hash ?? null,
  };
}

export function deriveRule701AndCalendar(
  store: EquityStoreData,
  referenceDate: string
): { calendar_items: CalendarComplianceItem[]; rule_701: Rule701Summary } {
  const items: CalendarComplianceItem[] = [];
  const stakeholderMap = new Map(store.stakeholders.map((s) => [s.id, s]));
  const scheduleMap = new Map(store.vesting_schedules.map((v) => [v.id, v]));

  // 1. 409A Expiry / Material Event Block
  const fmv = deriveActiveFmv(store, referenceDate);
  if (fmv.grants_blocked) {
    items.push({
      id: 'cal-fmv-blocked',
      category: 'Material Event',
      due_date: referenceDate,
      days_delta: 0,
      severity: 'critical',
      title: 'Option Grants Blocked — 409A Revaluation Required',
      detail: fmv.block_reason || 'No active 409A FMV lock.',
    });
  } else if (fmv.valid_until && fmv.days_until_expiry !== null) {
    items.push({
      id: `cal-409a-${fmv.report_id}`,
      category: '409A Expiry',
      due_date: fmv.valid_until,
      days_delta: fmv.days_until_expiry,
      severity:
        fmv.days_until_expiry <= 30
          ? 'critical'
          : fmv.days_until_expiry <= 90
          ? 'warning'
          : 'ok',
      title: `409A Safe-Harbor Validity Window ($${fmv.fmv_per_share_common?.toFixed(2)}/sh)`,
      detail: `Adopted report ${fmv.report_id} expires min(valuation_date + 12mo, next material event).`,
    });
  }

  // 2. 83(b) 30-day Election Deadlines
  for (const g of store.grants) {
    if (!g.due_date_83b) continue;
    const holder = stakeholderMap.get(g.stakeholder_id);
    const delta = diffDaysIso(referenceDate, g.due_date_83b);
    if (!g.filed_at_83b) {
      items.push({
        id: `cal-83b-${g.id}`,
        category: '83(b) Deadline',
        due_date: g.due_date_83b,
        days_delta: delta,
        severity: delta < 0 ? 'critical' : delta <= 14 ? 'warning' : 'ok',
        title: `IRC §83(b) 30-Day Filing Deadline — ${holder?.name || 'Holder'}`,
        detail: `${g.quantity.toLocaleString()} ${g.iso_nso} shares granted ${g.grant_date} (early-exercise / RSA). Strict statutory 30-day IRS deadline.`,
        stakeholder_name: holder?.name,
      });
    } else {
      items.push({
        id: `cal-83b-filed-${g.id}`,
        category: '83(b) Deadline',
        due_date: g.due_date_83b,
        days_delta: delta,
        severity: 'ok',
        title: `IRC §83(b) Election Filed — ${holder?.name || 'Holder'}`,
        detail: `Timely filed on ${g.filed_at_83b} (due ${g.due_date_83b}). Proof retained in Vault.`,
        stakeholder_name: holder?.name,
      });
    }
  }

  // 3. Upcoming Vesting Cliffs & Tranches (next 120 days)
  for (const g of store.grants) {
    const sched = scheduleMap.get(g.vesting_schedule_id);
    if (!sched) continue;
    const holder = stakeholderMap.get(g.stakeholder_id);
    const tranches = computeVestingTranches(sched, g.quantity);
    const nextTranche = tranches.find((t) => t.vest_date >= referenceDate);
    if (nextTranche) {
      const delta = diffDaysIso(referenceDate, nextTranche.vest_date);
      items.push({
        id: `cal-vest-${g.id}-${nextTranche.tranche_index}`,
        category: 'Vesting',
        due_date: nextTranche.vest_date,
        days_delta: delta,
        severity: nextTranche.is_cliff && delta <= 45 ? 'warning' : 'ok',
        title: `${nextTranche.is_cliff ? '12-Month Cliff Vest' : 'Vesting Tranche'} — ${
          holder?.name || 'Holder'
        }`,
        detail: `${nextTranche.qty.toLocaleString()} shares vesting (${nextTranche.vested_cumulative.toLocaleString()} cumulative of ${g.quantity.toLocaleString()}).`,
        stakeholder_name: holder?.name,
      });
    }
  }

  // 4. Form 3921 Triggers (ISO exercises in current tax year -> due Jan 31 of next year)
  const yearPrefix = referenceDate.slice(0, 4);
  const nextYear = Number(yearPrefix) + 1;
  const isoExercises = store.transactions.filter((tx) => {
    if (tx.txn_type !== 'exercise' || tx.qty_delta >= 0) return false;
    if (!tx.effective_date.startsWith(yearPrefix)) return false;
    const grant = store.grants.find((g) => g.security_id === tx.security_id);
    return grant?.iso_nso === 'ISO';
  });

  for (const ex of isoExercises) {
    const grant = store.grants.find((g) => g.security_id === ex.security_id);
    const holder = grant ? stakeholderMap.get(grant.stakeholder_id) : undefined;
    const dueDate = `${nextYear}-01-31`;
    items.push({
      id: `cal-3921-${ex.id}`,
      category: 'Form 3921',
      due_date: dueDate,
      days_delta: diffDaysIso(referenceDate, dueDate),
      severity: 'warning',
      title: `IRS Form 3921 Required — ${holder?.name || 'Employee'}`,
      detail: `ISO exercise of ${Math.abs(ex.qty_delta).toLocaleString()} shares @ $${ex.price.toFixed(
        2
      )} on ${ex.effective_date}. Furnish copy B by Jan 31, ${nextYear}.`,
      stakeholder_name: holder?.name,
    });
  }

  // 5. Rule 701 Rolling 12-Month Exemption Calculation
  const oneYearAgo = addMonthsIso(referenceDate, -12);
  const recentGrants = store.grants.filter(
    (g) => g.grant_date > oneYearAgo && g.grant_date <= referenceDate
  );
  const rollingValue = recentGrants.reduce(
    (sum, g) => sum + g.quantity * Math.max(g.exercise_price, g.fmv_at_grant),
    0
  );
  const rollingShares = recentGrants.reduce((sum, g) => sum + g.quantity, 0);

  const derived = deriveCapTable(store, referenceDate, 'allocated_only');
  const hardCap1m = 1_000_000;
  const assets15Pct = store.company.total_assets * 0.15;
  const classShares15PctShares = derived.total_basic_shares * 0.15;
  const impliedFmv = fmv.fmv_per_share_common || 0.38;
  const classShares15PctValue = classShares15PctShares * impliedFmv;
  const maxRelyLimit = Math.max(hardCap1m, assets15Pct, classShares15PctValue);
  const enhancedDisclosure = rollingValue > 10_000_000;

  items.push({
    id: 'cal-rule-701',
    category: 'Rule 701',
    due_date: `${referenceDate.slice(0, 4)}-12-31`,
    days_delta: diffDaysIso(referenceDate, `${referenceDate.slice(0, 4)}-12-31`),
    severity: rollingValue > maxRelyLimit * 0.85 ? 'warning' : 'ok',
    title: 'SEC Rule 701 Annual Compensatory Exemption Monitor',
    detail: `12-mo aggregate sales/grants: $${rollingValue.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })} of $${maxRelyLimit.toLocaleString(undefined, {
      maximumFractionDigits: 0,
    })} ceiling (${((rollingValue / maxRelyLimit) * 100).toFixed(1)}% utilized).`,
  });

  items.sort((a, b) => a.days_delta - b.days_delta);

  return {
    calendar_items: items,
    rule_701: {
      rolling_12m_grant_value: rollingValue,
      hard_cap_1m: hardCap1m,
      assets_15pct_limit: assets15Pct,
      class_shares_15pct_limit: classShares15PctShares,
      max_rely_limit: maxRelyLimit,
      rolling_12m_shares_granted: rollingShares,
      enhanced_disclosure_triggered: enhancedDisclosure,
    },
  };
}
