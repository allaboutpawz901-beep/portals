import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  AllocationMethod,
  BoardApprovalType,
  CapBoardApproval,
  CapCompany,
  CapDocument,
  CapEquityPlan,
  CapGrant,
  CapSecurity,
  CapSecurityClass,
  CapStakeholder,
  CapTableSnapshot,
  CapTransaction,
  CapVestingSchedule,
  DlomModel,
  EquityApiResponse,
  EquityStoreData,
  LedgerTxnType,
  MaterialEventType,
  PwermScenario,
  SecurityKind,
  SnapshotReason,
  StakeholderType,
  ValApproach,
  ValComp,
  ValInputs,
  ValMaterialEvent,
  ValReport,
  ValRequest,
} from './equityTypes';
import {
  GENESIS_PREV_HASH,
  addDaysIso,
  addMonthsIso,
  computeLedgerRowHash,
  computeSnapshotHash,
  computeVestedQuantityAsOf,
  deriveActiveFmv,
  deriveCapTable,
  deriveRule701AndCalendar,
  sha256Hex,
  verifyLedgerChain,
} from './equityEngine';
import {
  buildStructured409aReport,
  evaluateValuationApproaches,
  runAllocationVariant,
  runDlomCalculation,
  runGateCheck,
} from './valuation409aEngine';

export const DEFAULT_REFERENCE_DATE = '2026-11-02';
const STORE_FILE_PATH = path.join(os.tmpdir(), 'unsaid-equity-store-v1.json');

declare global {
  var __unsaidEquityStoreData: EquityStoreData | undefined;
}

function appendLedgerRow(
  transactions: CapTransaction[],
  params: {
    id: string;
    company_id: string;
    security_id: string;
    txn_type: LedgerTxnType;
    qty_delta: number;
    split_multiplier?: number;
    price: number;
    counterparty: string | null;
    effective_date: string;
    board_approval_id: string | null;
    document_ids: string[];
    notes: string;
    created_at?: string;
  }
): CapTransaction {
  const seq = transactions.length + 1;
  const prev_hash =
    transactions.length > 0
      ? transactions[transactions.length - 1].row_hash
      : GENESIS_PREV_HASH;

  const row_hash = computeLedgerRowHash({
    seq,
    company_id: params.company_id,
    security_id: params.security_id,
    txn_type: params.txn_type,
    qty_delta: params.qty_delta,
    split_multiplier: params.split_multiplier,
    price: params.price,
    counterparty: params.counterparty,
    effective_date: params.effective_date,
    board_approval_id: params.board_approval_id,
    document_ids: params.document_ids,
    prev_hash,
  });

  const tx: CapTransaction = {
    id: params.id,
    seq,
    company_id: params.company_id,
    security_id: params.security_id,
    txn_type: params.txn_type,
    qty_delta: Number(params.qty_delta.toFixed(4)),
    split_multiplier: params.split_multiplier,
    price: Number(params.price.toFixed(4)),
    counterparty: params.counterparty,
    effective_date: params.effective_date,
    board_approval_id: params.board_approval_id,
    document_ids: [...params.document_ids].sort(),
    prev_hash,
    row_hash,
    notes: params.notes,
    created_at: params.created_at || `${params.effective_date}T12:00:00Z`,
  };

  transactions.push(tx);
  return tx;
}

function makeDoc(params: {
  id: string;
  company_id: string;
  title: string;
  kind: CapDocument['kind'];
  storage_path: string;
  signed_at: string | null;
  retention_hold?: boolean;
  content_summary: string;
}): CapDocument {
  return {
    id: params.id,
    company_id: params.company_id,
    title: params.title,
    kind: params.kind,
    storage_path: params.storage_path,
    sha256: sha256Hex(`${params.id}|${params.title}|${params.content_summary}`),
    signed_at: params.signed_at,
    retention_hold: params.retention_hold ?? true,
    content_summary: params.content_summary,
  };
}

function buildSeedEquityStore(): EquityStoreData {
  const companyId = 'comp-unsaid';
  const company: CapCompany = {
    id: companyId,
    legal_name: 'Unsaid, Inc.',
    ein_masked: '••-•••4819',
    state_of_incorp: 'DE',
    incorp_date: '2023-04-15',
    predecessor_start_date: '2023-04-15',
    fiscal_year_end: '12-31',
    has_traded_class: false,
    total_assets: 3_420_000,
  };

  const stakeholders: CapStakeholder[] = [
    {
      id: 'sh-sarah',
      company_id: companyId,
      name: 'Sarah Alvarez',
      type: 'founder',
      email: 'sarah@unsaid.app',
      tax_id_masked: '•••-••-9104',
      is_insider: true,
      is_board: true,
    },
    {
      id: 'sh-marcus',
      company_id: companyId,
      name: 'Marcus Chen',
      type: 'founder',
      email: 'marcus@unsaid.app',
      tax_id_masked: '•••-••-2271',
      is_insider: true,
      is_board: true,
    },
    {
      id: 'sh-horizon',
      company_id: companyId,
      name: 'Horizon Seed Ventures LP',
      type: 'investor',
      email: 'ops@horizonseed.vc',
      tax_id_masked: '••-•••7730',
      is_insider: true,
      is_board: true,
    },
    {
      id: 'sh-northstar',
      company_id: companyId,
      name: 'Northstar Angel Syndicate LLC',
      type: 'investor',
      email: 'syndicate@northstarangels.io',
      tax_id_masked: '••-•••6128',
      is_insider: false,
      is_board: false,
    },
    {
      id: 'sh-apex',
      company_id: companyId,
      name: 'Apex Catalyst Fund I, LP',
      type: 'investor',
      email: 'portfolio@apexcatalyst.vc',
      tax_id_masked: '••-•••3092',
      is_insider: false,
      is_board: false,
    },
    {
      id: 'sh-devon',
      company_id: companyId,
      name: 'Devon Brooks',
      type: 'employee',
      email: 'devon@unsaid.app',
      tax_id_masked: '•••-••-5582',
      is_insider: false,
      is_board: false,
    },
    {
      id: 'sh-priya',
      company_id: companyId,
      name: 'Priya Nair',
      type: 'employee',
      email: 'priya@unsaid.app',
      tax_id_masked: '•••-••-8410',
      is_insider: false,
      is_board: false,
    },
    {
      id: 'sh-elena',
      company_id: companyId,
      name: 'Elena Rostova, CFA, ASA',
      type: 'advisor',
      email: 'elena.rostova@valuationadvisors.io',
      tax_id_masked: '•••-••-4019',
      is_insider: false,
      is_board: false,
    },
  ];

  const documents: CapDocument[] = [
    makeDoc({
      id: 'doc-charter-2024',
      company_id: companyId,
      title: 'Amended & Restated Certificate of Incorporation (Series Seed)',
      kind: 'charter',
      storage_path: '/vault/corporate/2024-09-10-amended-restated-charter.pdf',
      signed_at: '2024-09-10',
      content_summary:
        'Authorizes 15,000,000 shares of Common Stock ($0.0001 par) and 3,000,000 shares of Series Seed Preferred Stock ($0.0001 par, 1.0x non-participating liquidation preference, $1.25 original issue price, 1:1 conversion).',
    }),
    makeDoc({
      id: 'doc-bylaws-2023',
      company_id: companyId,
      title: 'Bylaws of Unsaid, Inc.',
      kind: 'bylaw',
      storage_path: '/vault/corporate/2023-04-15-bylaws.pdf',
      signed_at: '2023-04-15',
      content_summary:
        'Corporate governance bylaws establishing board composition, stockholder voting, indemnification, and share transfer restrictions (ROFR).',
    }),
    makeDoc({
      id: 'doc-consent-incorp',
      company_id: companyId,
      title: 'Organizational Unanimous Written Consent — Founder Common Issuance',
      kind: 'consent',
      storage_path: '/vault/consents/2023-04-15-founder-issuance-uwc.pdf',
      signed_at: '2023-04-15',
      content_summary:
        'Approves issuance of 4,500,000 Common shares to Sarah Alvarez and 3,500,000 Common shares to Marcus Chen at $0.0001 par value per share.',
    }),
    makeDoc({
      id: 'doc-83b-founders',
      company_id: companyId,
      title: 'IRC §83(b) Protective Elections — Sarah Alvarez & Marcus Chen',
      kind: '83b',
      storage_path: '/vault/tax/2023-04-28-founders-83b-irs-stamped.pdf',
      signed_at: '2023-04-28',
      content_summary:
        'Certified mail receipts and signed IRC §83(b) elections timely filed within 30 days of initial founder stock purchase.',
    }),
    makeDoc({
      id: 'doc-consent-plan-2023',
      company_id: companyId,
      title: 'Board & Stockholder Consent — 2023 Equity Incentive Plan (1,500,000 Reserve)',
      kind: 'consent',
      storage_path: '/vault/consents/2023-05-01-2023-eip-adoption.pdf',
      signed_at: '2023-05-01',
      content_summary:
        'Adopts the 2023 Equity Incentive Plan reserving 1,500,000 shares of Common Stock for ISO, NSO, RSA, and RSU awards.',
    }),
    makeDoc({
      id: 'doc-consent-seed-2024',
      company_id: companyId,
      title: 'Board Consent — Series Seed Preferred Financing ($2.80M @ $1.25/sh)',
      kind: 'consent',
      storage_path: '/vault/consents/2024-09-10-series-seed-financing.pdf',
      signed_at: '2024-09-10',
      content_summary:
        'Approves sale and issuance of 2,240,000 shares of Series Seed Preferred Stock at $1.2500 per share ($2,800,000 aggregate gross proceeds).',
    }),
    makeDoc({
      id: 'doc-qi-cv-elena',
      company_id: companyId,
      title: 'Curriculum Vitae & ASA Accreditation — Elena Rostova, CFA, ASA',
      kind: 'cv',
      storage_path: '/vault/409a/2026-05-01-elena-rostova-cfa-asa-cv.pdf',
      signed_at: '2026-05-01',
      content_summary:
        '11 years relevant valuation, investment banking, and private-company 409A appraisal experience across 140+ venture-backed software & commerce issuers.',
    }),
    makeDoc({
      id: 'doc-consent-qi-2026',
      company_id: companyId,
      title: 'Board Determination of Qualified Individual (Treas. Reg. §1.409A-1(b)(5)(iv)(B)(2))',
      kind: 'consent',
      storage_path: '/vault/consents/2026-05-05-qi-determination-rostova.pdf',
      signed_at: '2026-05-05',
      content_summary:
        'Formal board resolution verifying >5 years of relevant valuation experience for Elena Rostova, CFA, ASA to perform illiquid start-up inside safe-harbor valuations.',
    }),
    makeDoc({
      id: 'doc-consent-safe-2026',
      company_id: companyId,
      title: 'Board Consent — Post-Money SAFE Issuance ($350,000 / $18M Cap)',
      kind: 'consent',
      storage_path: '/vault/consents/2026-02-15-apex-safe-uwc.pdf',
      signed_at: '2026-02-15',
      content_summary:
        'Authorizes YC Post-Money Valuation Cap & Discount SAFE with Apex Catalyst Fund I, LP for $350,000 principal ($18.0M post-money cap, 20% discount).',
    }),
  ];

  const board_approvals: CapBoardApproval[] = [
    {
      id: 'ba-incorp-2023',
      company_id: companyId,
      code: 'UWC-2023-01',
      title: 'Founder Common Stock Issuance',
      type: 'financing',
      adopted_at: '2023-04-15',
      document_id: 'doc-consent-incorp',
      signers: ['Sarah Alvarez', 'Marcus Chen'],
      recitals_jsonb: { common_issued: 8_000_000, par_value: 0.0001 },
    },
    {
      id: 'ba-plan-2023',
      company_id: companyId,
      code: 'UWC-2023-02',
      title: 'Adoption of 2023 Equity Incentive Plan',
      type: 'plan_adopt',
      adopted_at: '2023-05-01',
      document_id: 'doc-consent-plan-2023',
      signers: ['Sarah Alvarez', 'Marcus Chen'],
      recitals_jsonb: { total_reserved: 1_500_000, shareholder_approved: true },
    },
    {
      id: 'ba-seed-2024',
      company_id: companyId,
      code: 'UWC-2024-04',
      title: 'Series Seed Preferred Stock Purchase Authorization',
      type: 'financing',
      adopted_at: '2024-09-10',
      document_id: 'doc-consent-seed-2024',
      signers: ['Sarah Alvarez', 'Marcus Chen', 'Horizon Seed Ventures LP'],
      recitals_jsonb: { preferred_shares: 2_240_000, pps: 1.25, gross_proceeds: 2_800_000 },
    },
    {
      id: 'ba-grants-2025-q2',
      company_id: companyId,
      code: 'UWC-2025-03',
      title: 'Q2 2025 Employee Option Grant Batch',
      type: 'grant_batch',
      adopted_at: '2025-06-01',
      document_id: 'doc-consent-plan-2023',
      signers: ['Sarah Alvarez', 'Marcus Chen', 'Horizon Seed Ventures LP'],
      recitals_jsonb: { grants_count: 1, total_options: 240_000, strike_price: 0.24 },
    },
    {
      id: 'ba-safe-2026',
      company_id: companyId,
      code: 'UWC-2026-01',
      title: 'Post-Money SAFE Financing — Apex Catalyst Fund',
      type: 'financing',
      adopted_at: '2026-02-15',
      document_id: 'doc-consent-safe-2026',
      signers: ['Sarah Alvarez', 'Marcus Chen', 'Horizon Seed Ventures LP'],
      recitals_jsonb: { principal: 350_000, valuation_cap: 18_000_000, discount_pct: 20 },
    },
    {
      id: 'ba-qi-2026',
      company_id: companyId,
      code: 'UWC-2026-02',
      title: 'Qualified Individual Determination — Elena Rostova, CFA, ASA',
      type: 'qi_determination',
      adopted_at: '2026-05-05',
      document_id: 'doc-consent-qi-2026',
      signers: ['Sarah Alvarez', 'Marcus Chen', 'Horizon Seed Ventures LP'],
      recitals_jsonb: { qi_stakeholder_id: 'sh-elena', years_experience: 11 },
    },
  ];

  const qualified_individuals = [
    {
      id: 'qi-elena',
      company_id: companyId,
      stakeholder_id: 'sh-elena',
      qualifications_summary:
        'CFA Charterholder and Accredited Senior Appraiser (ASA, Business Valuation) with 11 years of private-company 409A, ASC 718, and venture capital valuation experience.',
      years_experience: 11,
      experience_categories: [
        'IRC §409A Safe-Harbor Appraisals',
        'ASC 718 Option Pricing (OPM / PWERM)',
        'Software & Commerce Guideline Multiples',
        'M&A Fairness & Venture Financing Advisory',
      ],
      cv_document_id: 'doc-qi-cv-elena',
      board_determined_at: '2026-05-05',
      board_determination_doc_id: 'doc-consent-qi-2026',
    },
  ];

  const security_classes: CapSecurityClass[] = [
    {
      id: 'cls-seed',
      company_id: companyId,
      name: 'Series Seed Preferred',
      class_type: 'preferred',
      authorized_shares: 3_000_000,
      seniority_rank: 1,
      liquidation_preference_multiple: 1.0,
      par_value: 0.0001,
      conversion_ratio: 1.0,
      participating: false,
      participation_cap_multiple: null,
      dividend_rate: 0,
      voting_rights: true,
      price_per_share_original: 1.25,
      has_put_call_redemption: false,
    },
    {
      id: 'cls-common',
      company_id: companyId,
      name: 'Common Stock',
      class_type: 'common',
      authorized_shares: 15_000_000,
      seniority_rank: 2,
      liquidation_preference_multiple: 0,
      par_value: 0.0001,
      conversion_ratio: 1.0,
      participating: false,
      participation_cap_multiple: null,
      dividend_rate: 0,
      voting_rights: true,
      price_per_share_original: 0.0001,
      has_put_call_redemption: false,
    },
  ];

  const equity_plans: CapEquityPlan[] = [
    {
      id: 'plan-2023',
      company_id: companyId,
      name: '2023 Equity Incentive Plan',
      class_id: 'cls-common',
      board_approved_at: '2023-05-01',
      shareholder_approved_at: '2023-05-02',
      total_reserved: 1_500_000,
      board_approval_id: 'ba-plan-2023',
    },
  ];

  const vesting_schedules: CapVestingSchedule[] = [
    {
      id: 'vest-standard-devon',
      company_id: companyId,
      name: '4-Year Standard (1-Year Cliff, Monthly)',
      total_months: 48,
      cliff_months: 12,
      frequency: 'monthly',
      start_date: '2025-06-01',
    },
    {
      id: 'vest-standard-priya',
      company_id: companyId,
      name: '4-Year Standard (1-Year Cliff, Monthly)',
      total_months: 48,
      cliff_months: 12,
      frequency: 'monthly',
      start_date: '2026-10-15',
    },
  ];

  const securities: CapSecurity[] = [
    {
      id: 'sec-cs-1',
      company_id: companyId,
      certificate_code: 'CS-001',
      stakeholder_id: 'sh-sarah',
      class_id: 'cls-common',
      plan_id: null,
      kind: 'share',
      initial_quantity: 4_500_000,
      price_per_share: 0.0001,
      status: 'active',
      issue_date: '2023-04-15',
      board_approval_id: 'ba-incorp-2023',
    },
    {
      id: 'sec-cs-2',
      company_id: companyId,
      certificate_code: 'CS-002',
      stakeholder_id: 'sh-marcus',
      class_id: 'cls-common',
      plan_id: null,
      kind: 'share',
      initial_quantity: 3_500_000,
      price_per_share: 0.0001,
      status: 'active',
      issue_date: '2023-04-15',
      board_approval_id: 'ba-incorp-2023',
    },
    {
      id: 'sec-ps-1',
      company_id: companyId,
      certificate_code: 'PS-001',
      stakeholder_id: 'sh-horizon',
      class_id: 'cls-seed',
      plan_id: null,
      kind: 'share',
      initial_quantity: 1_600_000,
      price_per_share: 1.25,
      status: 'active',
      issue_date: '2024-09-10',
      board_approval_id: 'ba-seed-2024',
    },
    {
      id: 'sec-ps-2',
      company_id: companyId,
      certificate_code: 'PS-002',
      stakeholder_id: 'sh-northstar',
      class_id: 'cls-seed',
      plan_id: null,
      kind: 'share',
      initial_quantity: 640_000,
      price_per_share: 1.25,
      status: 'active',
      issue_date: '2024-09-10',
      board_approval_id: 'ba-seed-2024',
    },
    {
      id: 'sec-opt-1',
      company_id: companyId,
      certificate_code: 'OPT-001',
      stakeholder_id: 'sh-devon',
      class_id: 'cls-common',
      plan_id: 'plan-2023',
      kind: 'option',
      initial_quantity: 240_000,
      price_per_share: 0.24,
      status: 'active',
      issue_date: '2025-06-01',
      board_approval_id: 'ba-grants-2025-q2',
    },
    {
      id: 'sec-safe-1',
      company_id: companyId,
      certificate_code: 'SAFE-001',
      stakeholder_id: 'sh-apex',
      class_id: null,
      plan_id: null,
      kind: 'safe',
      initial_quantity: 350_000,
      price_per_share: 1.0,
      principal_amount: 350_000,
      valuation_cap: 18_000_000,
      discount_pct: 20,
      status: 'active',
      issue_date: '2026-02-15',
      board_approval_id: 'ba-safe-2026',
    },
  ];

  const transactions: CapTransaction[] = [];

  appendLedgerRow(transactions, {
    id: 'txn-1',
    company_id: companyId,
    security_id: 'sec-cs-1',
    txn_type: 'issue',
    qty_delta: 4_500_000,
    price: 0.0001,
    counterparty: 'Sarah Alvarez',
    effective_date: '2023-04-15',
    board_approval_id: 'ba-incorp-2023',
    document_ids: ['doc-consent-incorp', 'doc-83b-founders'],
    notes: 'Founder Common Stock issuance (CS-001)',
  });

  appendLedgerRow(transactions, {
    id: 'txn-2',
    company_id: companyId,
    security_id: 'sec-cs-2',
    txn_type: 'issue',
    qty_delta: 3_500_000,
    price: 0.0001,
    counterparty: 'Marcus Chen',
    effective_date: '2023-04-15',
    board_approval_id: 'ba-incorp-2023',
    document_ids: ['doc-consent-incorp', 'doc-83b-founders'],
    notes: 'Founder Common Stock issuance (CS-002)',
  });

  appendLedgerRow(transactions, {
    id: 'txn-3',
    company_id: companyId,
    security_id: 'sec-ps-1',
    txn_type: 'issue',
    qty_delta: 1_600_000,
    price: 1.25,
    counterparty: 'Horizon Seed Ventures LP',
    effective_date: '2024-09-10',
    board_approval_id: 'ba-seed-2024',
    document_ids: ['doc-charter-2024', 'doc-consent-seed-2024'],
    notes: 'Series Seed Preferred lead investment ($2,000,000)',
  });

  appendLedgerRow(transactions, {
    id: 'txn-4',
    company_id: companyId,
    security_id: 'sec-ps-2',
    txn_type: 'issue',
    qty_delta: 640_000,
    price: 1.25,
    counterparty: 'Northstar Angel Syndicate LLC',
    effective_date: '2024-09-10',
    board_approval_id: 'ba-seed-2024',
    document_ids: ['doc-charter-2024', 'doc-consent-seed-2024'],
    notes: 'Series Seed Preferred co-investment ($800,000)',
  });

  const grants: CapGrant[] = [
    {
      id: 'gr-devon-2025',
      security_id: 'sec-opt-1',
      stakeholder_id: 'sh-devon',
      plan_id: 'plan-2023',
      grant_date: '2025-06-01',
      quantity: 240_000,
      exercise_price: 0.24,
      fmv_at_grant: 0.24,
      val_report_id: 'valrep-2026-05',
      snapshot_id: 'snap-val-2026-05',
      vesting_schedule_id: 'vest-standard-devon',
      expiry_date: '2035-06-01',
      iso_nso: 'ISO',
      early_exercise: false,
      due_date_83b: null,
      filed_at_83b: null,
    },
  ];

  const docDevonAgreement = makeDoc({
    id: 'doc-agr-opt-001',
    company_id: companyId,
    title: 'ISO Option Grant Notice & Agreement — Devon Brooks (OPT-001)',
    kind: 'agreement',
    storage_path: '/vault/grants/2025-06-01-opt-001-devon-brooks.pdf',
    signed_at: '2025-06-02',
    content_summary:
      'Incentive Stock Option grant for 240,000 shares of Common Stock at $0.24 exercise price under the 2023 Equity Incentive Plan; 48-month vesting with 12-month cliff.',
  });
  documents.push(docDevonAgreement);

  appendLedgerRow(transactions, {
    id: 'txn-5',
    company_id: companyId,
    security_id: 'sec-opt-1',
    txn_type: 'grant',
    qty_delta: 240_000,
    price: 0.24,
    counterparty: 'Devon Brooks',
    effective_date: '2025-06-01',
    board_approval_id: 'ba-grants-2025-q2',
    document_ids: ['doc-agr-opt-001'],
    notes: 'ISO grant OPT-001 (240,000 options @ $0.24/sh)',
  });

  appendLedgerRow(transactions, {
    id: 'txn-6',
    company_id: companyId,
    security_id: 'sec-safe-1',
    txn_type: 'issue',
    qty_delta: 350_000,
    price: 1.0,
    counterparty: 'Apex Catalyst Fund I, LP',
    effective_date: '2026-02-15',
    board_approval_id: 'ba-safe-2026',
    document_ids: ['doc-consent-safe-2026'],
    notes: 'Post-Money SAFE issuance ($350,000 principal, $18M cap, 20% discount)',
  });

  const store: EquityStoreData = {
    company,
    stakeholders,
    qualified_individuals,
    security_classes,
    equity_plans,
    vesting_schedules,
    securities,
    grants,
    transactions,
    snapshots: [],
    board_approvals,
    documents,
    val_requests: [],
    val_inputs: {},
    val_comps: {},
    val_approaches: {},
    val_allocations: {},
    val_dlom: {},
    val_reports: [],
    material_events: [],
  };

  // 1. Freeze pre-valuation snapshot as of 2026-05-15
  const valDate = '2026-05-15';
  const preValDerived = deriveCapTable(store, valDate, 'allocated_plus_pool');
  const preValSnap: CapTableSnapshot = {
    id: 'snap-val-2026-05',
    company_id: companyId,
    as_of_date: valDate,
    reason: 'valuation',
    snapshot_jsonb: preValDerived,
    total_basic_shares: preValDerived.total_basic_shares,
    total_fd_shares: preValDerived.total_fd_shares,
    denominator_method: 'allocated_plus_pool',
    hash: computeSnapshotHash(preValDerived),
    created_at: '2026-05-15T10:00:00Z',
  };
  store.snapshots.push(preValSnap);

  // 2. Run full deterministic 409A pipeline for valreq-2026-05
  const reqId = 'valreq-2026-05';
  const qi = store.qualified_individuals[0];
  const gateCheck = runGateCheck({
    company: store.company,
    classes: store.security_classes,
    securities: store.securities,
    qi,
    qiName: 'Elena Rostova, CFA, ASA',
    noCic90d: true,
    noIpo180d: true,
    valuationDate: valDate,
  });

  const valReq: ValRequest = {
    id: reqId,
    company_id: companyId,
    valuation_date: valDate,
    purpose: 'Annual IRC §409A Safe-Harbor Common Stock Valuation',
    qualified_individual_id: qi.id,
    status: 'adopted',
    material_event_id: null,
    gate_check: gateCheck,
    created_at: '2026-05-15T10:05:00Z',
  };
  store.val_requests.push(valReq);

  const seedInputs: ValInputs = {
    request_id: reqId,
    cash: 1_940_000,
    debt: 0,
    adjusted_book_assets: 3_420_000,
    total_liabilities: 480_000,
    ltm_revenue: 1_850_000,
    ntm_revenue: 2_950_000,
    ltm_ebitda: -420_000,
    historical_financials: [
      { period: 'FY2024', revenue: 640_000, ebitda: -890_000, fcf: -940_000 },
      { period: 'FY2025', revenue: 1_580_000, ebitda: -510_000, fcf: -560_000 },
    ],
    projected_fcfs: [
      { period: 'FY2026E', revenue: 2_650_000, ebitda: -190_000, fcf: -240_000 },
      { period: 'FY2027E', revenue: 4_400_000, ebitda: 520_000, fcf: 390_000 },
      { period: 'FY2028E', revenue: 6_900_000, ebitda: 1_380_000, fcf: 1_060_000 },
      { period: 'FY2029E', revenue: 9_800_000, ebitda: 2_350_000, fcf: 1_820_000 },
      { period: 'FY2030E', revenue: 13_200_000, ebitda: 3_430_000, fcf: 2_680_000 },
    ],
    dcf_risk_free_rate: 0.043,
    dcf_erp: 0.055,
    dcf_size_premium: 0.052,
    dcf_company_specific_risk: 0.065,
    dcf_terminal_method: 'gordon_growth',
    dcf_terminal_growth: 0.035,
    dcf_exit_ev_rev_multiple: 4.2,
    guideline_size_growth_adj_pct: -0.25,
    backsolve_class_id: 'cls-seed',
    no_cic_90d: true,
    no_ipo_180d: true,
    industry_notes:
      'Vertical SaaS & omnichannel commerce infrastructure; Damodaran Software (System & Application) + public commerce enablement peer group.',
  };
  store.val_inputs[reqId] = seedInputs;

  const seedComps: ValComp[] = [
    {
      id: 'comp-shop',
      request_id: reqId,
      ticker: 'SHOP',
      name: 'Shopify Inc.',
      ev_rev_multiple: 8.4,
      ev_ebitda_multiple: 44.2,
      volatility: 0.58,
      beta: 1.42,
      source: 'SEC 10-K / S&P Capital IQ',
      as_of: valDate,
    },
    {
      id: 'comp-bigc',
      request_id: reqId,
      ticker: 'BIGC',
      name: 'BigCommerce Holdings',
      ev_rev_multiple: 2.1,
      ev_ebitda_multiple: null,
      volatility: 0.68,
      beta: 1.31,
      source: 'SEC 10-K / Damodaran',
      as_of: valDate,
    },
    {
      id: 'comp-bill',
      request_id: reqId,
      ticker: 'BILL',
      name: 'BILL Holdings, Inc.',
      ev_rev_multiple: 4.6,
      ev_ebitda_multiple: 29.5,
      volatility: 0.64,
      beta: 1.38,
      source: 'SEC 10-K / Damodaran',
      as_of: valDate,
    },
    {
      id: 'comp-intu',
      request_id: reqId,
      ticker: 'INTU',
      name: 'Intuit Inc.',
      ev_rev_multiple: 9.8,
      ev_ebitda_multiple: 26.4,
      volatility: 0.34,
      beta: 1.18,
      source: 'SEC 10-K / Damodaran',
      as_of: valDate,
    },
    {
      id: 'comp-vtEX',
      request_id: reqId,
      ticker: 'VTEX',
      name: 'VTEX',
      ev_rev_multiple: 5.1,
      ev_ebitda_multiple: 34.0,
      volatility: 0.62,
      beta: 1.29,
      source: 'SEC 20-F / Damodaran',
      as_of: valDate,
    },
  ];
  store.val_comps[reqId] = seedComps;

  const timeToLiquidity = 3.5;
  const evEval = evaluateValuationApproaches({
    requestId: reqId,
    inputs: seedInputs,
    comps: seedComps,
    existingApproaches: [],
    classes: store.security_classes,
    grants: store.grants,
    derivedCapTable: preValDerived,
    timeToLiquidityYrs: timeToLiquidity,
  });
  store.val_approaches[reqId] = evEval.approaches;

  const alloc = runAllocationVariant({
    requestId: reqId,
    method: 'opm',
    concludedEv: evEval.concluded_ev,
    equityValue: evEval.concluded_equity_value,
    classes: store.security_classes,
    grants: store.grants,
    derivedCapTable: preValDerived,
    volatility: evEval.median_volatility,
    timeToLiquidityYrs: timeToLiquidity,
    riskFreeRate: seedInputs.dcf_risk_free_rate,
    dividendYield: 0,
  });
  store.val_allocations[reqId] = alloc;

  const dlom = runDlomCalculation({
    requestId: reqId,
    model: 'finnerty',
    preDlomCommonPps: alloc.common_per_share_pre_dlom,
    volatility: evEval.median_volatility,
    timeToLiquidityYrs: timeToLiquidity,
    riskFreeRate: seedInputs.dcf_risk_free_rate,
    dividendYield: 0,
  });
  store.val_dlom[reqId] = dlom;

  const reportDate = '2026-05-20';
  const validUntil = addMonthsIso(valDate, 12);
  const cvDoc = store.documents.find((d) => d.id === qi.cv_document_id)!;

  const structuredReport = buildStructured409aReport({
    company: store.company,
    valuationDate: valDate,
    reportDate,
    validUntil,
    purpose: valReq.purpose,
    gateCheck,
    qiName: 'Elena Rostova, CFA, ASA',
    qi,
    cvSha256: cvDoc.sha256,
    snapshot: preValSnap,
    inputs: seedInputs,
    approaches: evEval.approaches,
    allocation: alloc,
    dlom,
  });

  const reportDoc = makeDoc({
    id: 'doc-409a-report-2026-05',
    company_id: companyId,
    title: `IRC §409A Valuation Report ($${dlom.common_per_share_post_dlom.toFixed(
      2
    )}/sh Common FMV — As of ${valDate})`,
    kind: 'report',
    storage_path: `/vault/409a/2026-05-20-409a-report-${reqId}.pdf`,
    signed_at: reportDate,
    content_summary: `Signed inside safe-harbor 409A report by Elena Rostova, CFA, ASA. Concluded EV $${(
      alloc.concluded_enterprise_value / 1e6
    ).toFixed(2)}M, OPM pre-DLOM $${alloc.common_per_share_pre_dlom.toFixed(
      4
    )}/sh, Finnerty DLOM ${(dlom.dlom_pct * 100).toFixed(
      1
    )}%, concluded Common FMV $${dlom.common_per_share_post_dlom.toFixed(2)}/sh.`,
  });
  store.documents.push(reportDoc);

  const adoptConsentDoc = makeDoc({
    id: 'doc-consent-409a-2026-05',
    company_id: companyId,
    title: `Board Resolution Adopting 409A Common Stock FMV ($${dlom.common_per_share_post_dlom.toFixed(
      2
    )}/sh)`,
    kind: 'consent',
    storage_path: '/vault/consents/2026-05-20-409a-fmv-adoption.pdf',
    signed_at: reportDate,
    content_summary: `Unanimous Written Consent adopting the ${valDate} 409A report and locking Common Stock FMV at $${dlom.common_per_share_post_dlom.toFixed(
      2
    )}/share through ${validUntil}.`,
  });
  store.documents.push(adoptConsentDoc);

  const valAdoptApproval: CapBoardApproval = {
    id: 'ba-val-adopt-2026-05',
    company_id: companyId,
    code: 'UWC-2026-03',
    title: `Adoption of May 2026 409A Valuation ($${dlom.common_per_share_post_dlom.toFixed(
      2
    )}/sh)`,
    type: 'valuation_adopt',
    adopted_at: reportDate,
    document_id: adoptConsentDoc.id,
    signers: ['Sarah Alvarez', 'Marcus Chen', 'Horizon Seed Ventures LP'],
    recitals_jsonb: {
      fmv_per_share_common: dlom.common_per_share_post_dlom,
      valuation_date: valDate,
      valid_until: validUntil,
    },
  };
  store.board_approvals.push(valAdoptApproval);

  const seedReport: ValReport = {
    id: 'valrep-2026-05',
    request_id: reqId,
    snapshot_id: preValSnap.id,
    fmv_per_share_common: dlom.common_per_share_post_dlom,
    valuation_date: valDate,
    report_date: reportDate,
    qualified_individual_id: qi.id,
    report_document_id: reportDoc.id,
    board_approval_id: valAdoptApproval.id,
    status: 'adopted',
    valid_until: validUntil,
    superseded_by: null,
    structured_report: structuredReport,
  };
  store.val_reports.push(seedReport);

  // 3. Partial ISO Exercise by Devon Brooks on 2026-09-15 (triggers Form 3921 for tax year 2026)
  const devonExSec: CapSecurity = {
    id: 'sec-cs-3',
    company_id: companyId,
    certificate_code: 'CS-003',
    stakeholder_id: 'sh-devon',
    class_id: 'cls-common',
    plan_id: 'plan-2023',
    kind: 'share',
    initial_quantity: 20_000,
    price_per_share: 0.24,
    status: 'active',
    issue_date: '2026-09-15',
    board_approval_id: 'ba-grants-2025-q2',
  };
  store.securities.push(devonExSec);

  const docDevonEx = makeDoc({
    id: 'doc-ex-opt-001',
    company_id: companyId,
    title: 'ISO Exercise Notice & Stock Issuance Receipt — Devon Brooks (20,000 sh)',
    kind: 'agreement',
    storage_path: '/vault/exercises/2026-09-15-opt-001-exercise-cs-003.pdf',
    signed_at: '2026-09-15',
    content_summary:
      'Partial ISO exercise of 20,000 vested shares under OPT-001 at $0.24/sh ($4,800 aggregate exercise price); issued Common certificate CS-003. Triggers IRS Form 3921.',
  });
  store.documents.push(docDevonEx);

  appendLedgerRow(store.transactions, {
    id: 'txn-7',
    company_id: companyId,
    security_id: 'sec-opt-1',
    txn_type: 'exercise',
    qty_delta: -20_000,
    price: 0.24,
    counterparty: 'Devon Brooks',
    effective_date: '2026-09-15',
    board_approval_id: 'ba-grants-2025-q2',
    document_ids: ['doc-ex-opt-001'],
    notes: 'Partial ISO exercise (-20,000 options from OPT-001)',
  });

  appendLedgerRow(store.transactions, {
    id: 'txn-8',
    company_id: companyId,
    security_id: 'sec-cs-3',
    txn_type: 'exercise',
    qty_delta: 20_000,
    price: 0.24,
    counterparty: 'Devon Brooks',
    effective_date: '2026-09-15',
    board_approval_id: 'ba-grants-2025-q2',
    document_ids: ['doc-ex-opt-001'],
    notes: 'Common Stock issued upon ISO exercise (CS-003)',
  });

  // 4. Freeze pre-grant snapshot & grant Priya Nair 120,000 early-exercisable ISOs on 2026-10-15 at locked FMV
  const priyaGrantDate = '2026-10-15';
  const preGrantDerived = deriveCapTable(store, priyaGrantDate, 'allocated_plus_pool');
  const preGrantSnap: CapTableSnapshot = {
    id: 'snap-grant-2026-10',
    company_id: companyId,
    as_of_date: priyaGrantDate,
    reason: 'grant',
    snapshot_jsonb: preGrantDerived,
    total_basic_shares: preGrantDerived.total_basic_shares,
    total_fd_shares: preGrantDerived.total_fd_shares,
    denominator_method: 'allocated_plus_pool',
    hash: computeSnapshotHash(preGrantDerived),
    created_at: '2026-10-15T14:00:00Z',
  };
  store.snapshots.push(preGrantSnap);

  const lockedFmv = seedReport.fmv_per_share_common;

  const docPriyaGrantConsent = makeDoc({
    id: 'doc-consent-grant-2026-10',
    company_id: companyId,
    title: `Board Consent — Q4 2026 Option Grant (Priya Nair @ $${lockedFmv.toFixed(2)}/sh)`,
    kind: 'consent',
    storage_path: '/vault/consents/2026-10-15-q4-option-grant-uwc.pdf',
    signed_at: priyaGrantDate,
    content_summary: `Approves ISO grant of 120,000 options to Priya Nair at exercise price $${lockedFmv.toFixed(
      2
    )}/share (100% of locked May 2026 409A FMV) with early-exercise provision.`,
  });
  store.documents.push(docPriyaGrantConsent);

  const baPriyaGrant: CapBoardApproval = {
    id: 'ba-grants-2026-q4',
    company_id: companyId,
    code: 'UWC-2026-04',
    title: 'Q4 2026 Employee Option Grant — Priya Nair',
    type: 'grant_batch',
    adopted_at: priyaGrantDate,
    document_id: docPriyaGrantConsent.id,
    signers: ['Sarah Alvarez', 'Marcus Chen', 'Horizon Seed Ventures LP'],
    recitals_jsonb: {
      grantee: 'Priya Nair',
      quantity: 120_000,
      exercise_price: lockedFmv,
      val_report_id: seedReport.id,
    },
  };
  store.board_approvals.push(baPriyaGrant);

  const priyaOptSec: CapSecurity = {
    id: 'sec-opt-2',
    company_id: companyId,
    certificate_code: 'OPT-002',
    stakeholder_id: 'sh-priya',
    class_id: 'cls-common',
    plan_id: 'plan-2023',
    kind: 'option',
    initial_quantity: 120_000,
    price_per_share: lockedFmv,
    status: 'active',
    issue_date: priyaGrantDate,
    board_approval_id: baPriyaGrant.id,
  };
  store.securities.push(priyaOptSec);

  const docPriyaAgreement = makeDoc({
    id: 'doc-agr-opt-002',
    company_id: companyId,
    title: 'Early-Exercise ISO Option Agreement — Priya Nair (OPT-002)',
    kind: 'agreement',
    storage_path: '/vault/grants/2026-10-15-opt-002-priya-nair.pdf',
    signed_at: priyaGrantDate,
    content_summary: `Early-exercisable ISO grant for 120,000 Common shares at $${lockedFmv.toFixed(
      2
    )}/sh. IRC §83(b) election window open through ${addDaysIso(priyaGrantDate, 30)}.`,
  });
  store.documents.push(docPriyaAgreement);

  store.grants.push({
    id: 'gr-priya-2026',
    security_id: priyaOptSec.id,
    stakeholder_id: 'sh-priya',
    plan_id: 'plan-2023',
    grant_date: priyaGrantDate,
    quantity: 120_000,
    exercise_price: lockedFmv,
    fmv_at_grant: lockedFmv,
    val_report_id: seedReport.id,
    snapshot_id: preGrantSnap.id,
    vesting_schedule_id: 'vest-standard-priya',
    expiry_date: '2036-10-15',
    iso_nso: 'ISO',
    early_exercise: true,
    due_date_83b: addDaysIso(priyaGrantDate, 30),
    filed_at_83b: null,
  });

  appendLedgerRow(store.transactions, {
    id: 'txn-9',
    company_id: companyId,
    security_id: priyaOptSec.id,
    txn_type: 'grant',
    qty_delta: 120_000,
    price: lockedFmv,
    counterparty: 'Priya Nair',
    effective_date: priyaGrantDate,
    board_approval_id: baPriyaGrant.id,
    document_ids: ['doc-agr-opt-002', 'doc-consent-grant-2026-10'],
    notes: `Early-exercisable ISO grant OPT-002 (120,000 options @ $${lockedFmv.toFixed(
      2
    )}/sh locked FMV)`,
  });

  return store;
}

export function loadEquityStore(): EquityStoreData {
  if (globalThis.__unsaidEquityStoreData) {
    return globalThis.__unsaidEquityStoreData;
  }
  try {
    if (fs.existsSync(STORE_FILE_PATH)) {
      const raw = fs.readFileSync(STORE_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw) as EquityStoreData;
      globalThis.__unsaidEquityStoreData = parsed;
      return parsed;
    }
  } catch {
    // Fallback to clean seed if temp file is unreadable
  }
  const seeded = buildSeedEquityStore();
  saveEquityStore(seeded);
  return seeded;
}

export function saveEquityStore(store: EquityStoreData): void {
  globalThis.__unsaidEquityStoreData = store;
  try {
    fs.writeFileSync(STORE_FILE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // Ignore read-only fs errors in serverless environments; globalThis retains state
  }
}

export function getEquityApiResponse(options?: {
  asOfDate?: string;
  snapshotId?: string;
  denominatorMethod?: 'allocated_plus_pool' | 'allocated_only';
  referenceDate?: string;
}): EquityApiResponse {
  const store = loadEquityStore();
  const refDate = options?.referenceDate || DEFAULT_REFERENCE_DATE;
  const denom = options?.denominatorMethod || 'allocated_plus_pool';

  let derivedCapTable = deriveCapTable(
    store,
    options?.asOfDate || refDate,
    denom
  );

  if (options?.snapshotId) {
    const snap = store.snapshots.find((s) => s.id === options.snapshotId);
    if (snap) {
      derivedCapTable = snap.snapshot_jsonb;
    }
  }

  const activeFmv = deriveActiveFmv(store, refDate);
  const ledgerIntegrity = verifyLedgerChain(store.transactions);
  const { calendar_items, rule_701 } = deriveRule701AndCalendar(store, refDate);

  return {
    reference_date: refDate,
    store,
    derived_cap_table: derivedCapTable,
    active_fmv: activeFmv,
    ledger_integrity: ledgerIntegrity,
    calendar_items,
    rule_701,
  };
}

function getSecurityActiveBalance(store: EquityStoreData, securityId: string, asOfDate: string): number {
  const ordered = [...store.transactions]
    .filter((t) => t.effective_date <= asOfDate)
    .sort((a, b) => a.seq - b.seq);

  const balances = new Map<string, number>();
  for (const tx of ordered) {
    if (tx.txn_type === 'split') {
      const mult = tx.split_multiplier && tx.split_multiplier > 0 ? tx.split_multiplier : 1;
      for (const [k, v] of balances.entries()) balances.set(k, v * mult);
      continue;
    }
    const prev = balances.get(tx.security_id) || 0;
    balances.set(tx.security_id, Math.max(0, prev + tx.qty_delta));
  }
  return balances.get(securityId) || 0;
}

export function updateCompanyProfile(patch: Partial<CapCompany>): EquityApiResponse {
  const store = loadEquityStore();
  store.company = { ...store.company, ...patch, id: store.company.id };
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function createStakeholder(input: {
  name: string;
  type: StakeholderType;
  email: string;
  tax_id_masked?: string;
  is_insider?: boolean;
  is_board?: boolean;
}): EquityApiResponse {
  if (!input.name.trim()) throw new Error('Stakeholder name is required.');
  const store = loadEquityStore();
  const id = `sh-${Date.now()}`;
  store.stakeholders.push({
    id,
    company_id: store.company.id,
    name: input.name.trim(),
    type: input.type,
    email: input.email.trim() || 'holder@example.com',
    tax_id_masked: input.tax_id_masked?.trim() || '•••-••-0000',
    is_insider: Boolean(input.is_insider),
    is_board: Boolean(input.is_board),
  });
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function createSecurityClass(input: {
  name: string;
  class_type: 'common' | 'preferred';
  authorized_shares: number;
  seniority_rank: number;
  liquidation_preference_multiple: number;
  conversion_ratio: number;
  participating: boolean;
  participation_cap_multiple: number | null;
  dividend_rate: number;
  voting_rights: boolean;
  price_per_share_original: number;
  has_put_call_redemption?: boolean;
}): EquityApiResponse {
  if (!input.name.trim()) throw new Error('Class name is required.');
  if (input.authorized_shares <= 0) throw new Error('Authorized shares must be positive.');
  const store = loadEquityStore();
  store.security_classes.push({
    id: `cls-${Date.now()}`,
    company_id: store.company.id,
    name: input.name.trim(),
    class_type: input.class_type,
    authorized_shares: Number(input.authorized_shares),
    seniority_rank: Number(input.seniority_rank),
    liquidation_preference_multiple: Number(input.liquidation_preference_multiple),
    par_value: 0.0001,
    conversion_ratio: Number(input.conversion_ratio) || 1,
    participating: Boolean(input.participating),
    participation_cap_multiple: input.participation_cap_multiple
      ? Number(input.participation_cap_multiple)
      : null,
    dividend_rate: Number(input.dividend_rate) || 0,
    voting_rights: Boolean(input.voting_rights),
    price_per_share_original: Number(input.price_per_share_original) || 0.0001,
    has_put_call_redemption: Boolean(input.has_put_call_redemption),
  });
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function createEquityPlan(input: {
  name: string;
  class_id: string;
  total_reserved: number;
  board_approved_at: string;
  shareholder_approved_at: string | null;
  board_approval_id: string;
}): EquityApiResponse {
  if (!input.name.trim()) throw new Error('Plan name is required.');
  if (!input.board_approval_id) throw new Error('Board approval is required to adopt an equity plan.');
  if (input.total_reserved <= 0) throw new Error('Reserved share pool must be positive.');
  const store = loadEquityStore();
  store.equity_plans.push({
    id: `plan-${Date.now()}`,
    company_id: store.company.id,
    name: input.name.trim(),
    class_id: input.class_id,
    board_approved_at: input.board_approved_at,
    shareholder_approved_at: input.shareholder_approved_at,
    total_reserved: Number(input.total_reserved),
    board_approval_id: input.board_approval_id,
  });
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function createBoardApproval(input: {
  code: string;
  title: string;
  type: BoardApprovalType;
  adopted_at: string;
  signers: string[];
  summary: string;
}): EquityApiResponse {
  if (!input.title.trim()) throw new Error('Resolution title is required.');
  const store = loadEquityStore();
  const docId = `doc-consent-${Date.now()}`;
  const doc = makeDoc({
    id: docId,
    company_id: store.company.id,
    title: `${input.code || 'UWC'} — ${input.title.trim()}`,
    kind: 'consent',
    storage_path: `/vault/consents/${input.adopted_at}-${docId}.pdf`,
    signed_at: input.adopted_at,
    content_summary: input.summary.trim() || `Board consent adopted on ${input.adopted_at}.`,
  });
  store.documents.push(doc);

  store.board_approvals.push({
    id: `ba-${Date.now()}`,
    company_id: store.company.id,
    code: input.code.trim() || `UWC-${store.board_approvals.length + 1}`,
    title: input.title.trim(),
    type: input.type,
    adopted_at: input.adopted_at,
    document_id: docId,
    signers: input.signers.length > 0 ? input.signers : ['Sarah Alvarez', 'Marcus Chen'],
    recitals_jsonb: { summary: input.summary.trim() },
  });
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function freezeCapSnapshot(input: {
  reason: SnapshotReason;
  as_of_date?: string;
}): CapTableSnapshot {
  const store = loadEquityStore();
  const asOf = input.as_of_date || DEFAULT_REFERENCE_DATE;
  const derived = deriveCapTable(store, asOf, 'allocated_plus_pool');
  const snap: CapTableSnapshot = {
    id: `snap-${input.reason}-${Date.now()}`,
    company_id: store.company.id,
    as_of_date: asOf,
    reason: input.reason,
    snapshot_jsonb: derived,
    total_basic_shares: derived.total_basic_shares,
    total_fd_shares: derived.total_fd_shares,
    denominator_method: 'allocated_plus_pool',
    hash: computeSnapshotHash(derived),
    created_at: new Date().toISOString(),
  };
  store.snapshots.push(snap);
  saveEquityStore(store);
  return snap;
}

export function issueSecurity(input: {
  stakeholder_id: string;
  class_id: string | null;
  kind: Extract<SecurityKind, 'share' | 'warrant' | 'safe' | 'convertible_note'>;
  quantity: number;
  price_per_share: number;
  issue_date: string;
  board_approval_id: string;
  principal_amount?: number;
  valuation_cap?: number;
  discount_pct?: number;
  interest_rate?: number;
  notes?: string;
}): EquityApiResponse {
  const store = loadEquityStore();
  const holder = store.stakeholders.find((s) => s.id === input.stakeholder_id);
  if (!holder) throw new Error('Valid stakeholder is required.');
  const approval = store.board_approvals.find((b) => b.id === input.board_approval_id);
  if (!approval) throw new Error('Board approval resolution is required for every issuance.');
  if (input.quantity <= 0) throw new Error('Quantity / principal must be greater than zero.');

  if (input.kind === 'share' || input.kind === 'warrant') {
    const cls = store.security_classes.find((c) => c.id === input.class_id);
    if (!cls) throw new Error('Security class is required for share or warrant issuance.');
    const derived = deriveCapTable(store, DEFAULT_REFERENCE_DATE, 'allocated_plus_pool');
    const summary = derived.class_summaries.find((cs) => cs.class_id === cls.id);
    const currentIssued = summary ? summary.issued_shares : 0;
    if (currentIssued + input.quantity > cls.authorized_shares) {
      throw new Error(
        `Issuance exceeds authorized shares for ${cls.name} (${currentIssued.toLocaleString()} issued of ${cls.authorized_shares.toLocaleString()} authorized). Amend charter first.`
      );
    }
  }

  const prefix =
    input.kind === 'safe'
      ? 'SAFE'
      : input.kind === 'convertible_note'
      ? 'NOTE'
      : input.kind === 'warrant'
      ? 'WAR'
      : input.class_id === 'cls-common'
      ? 'CS'
      : 'PS';
  const countOfKind =
    store.securities.filter((s) => s.certificate_code.startsWith(prefix)).length + 1;
  const certCode = `${prefix}-${String(countOfKind).padStart(3, '0')}`;

  const secId = `sec-${Date.now()}`;
  const agrDoc = makeDoc({
    id: `doc-iss-${Date.now()}`,
    company_id: store.company.id,
    title: `${certCode} Issuance Agreement — ${holder.name}`,
    kind: 'agreement',
    storage_path: `/vault/issuances/${input.issue_date}-${certCode.toLowerCase()}.pdf`,
    signed_at: input.issue_date,
    content_summary: `Issued ${certCode} (${input.quantity.toLocaleString()} ${input.kind}) to ${
      holder.name
    } pursuant to board approval ${approval.code}.`,
  });
  store.documents.push(agrDoc);

  const sec: CapSecurity = {
    id: secId,
    company_id: store.company.id,
    certificate_code: certCode,
    stakeholder_id: holder.id,
    class_id: input.kind === 'safe' || input.kind === 'convertible_note' ? null : input.class_id,
    plan_id: null,
    kind: input.kind,
    initial_quantity: Number(input.quantity),
    price_per_share: Number(input.price_per_share),
    principal_amount: input.principal_amount,
    valuation_cap: input.valuation_cap,
    discount_pct: input.discount_pct,
    interest_rate: input.interest_rate,
    status: 'active',
    issue_date: input.issue_date,
    board_approval_id: approval.id,
  };
  store.securities.push(sec);

  appendLedgerRow(store.transactions, {
    id: `txn-${Date.now()}`,
    company_id: store.company.id,
    security_id: secId,
    txn_type: 'issue',
    qty_delta: Number(input.quantity),
    price: Number(input.price_per_share),
    counterparty: holder.name,
    effective_date: input.issue_date,
    board_approval_id: approval.id,
    document_ids: [approval.document_id, agrDoc.id],
    notes: input.notes?.trim() || `Issued ${certCode} to ${holder.name}`,
  });

  saveEquityStore(store);
  return getEquityApiResponse();
}

export function grantEquityAward(input: {
  stakeholder_id: string;
  plan_id: string;
  grant_date: string;
  quantity: number;
  exercise_price: number;
  iso_nso: 'ISO' | 'NSO' | 'RSA' | 'RSU';
  total_months: number;
  cliff_months: number;
  frequency: 'monthly' | 'quarterly' | 'immediate';
  vesting_start_date: string;
  early_exercise: boolean;
  board_approval_id: string;
}): EquityApiResponse {
  const store = loadEquityStore();
  const holder = store.stakeholders.find((s) => s.id === input.stakeholder_id);
  if (!holder) throw new Error('Grantee stakeholder is required.');

  const plan = store.equity_plans.find((p) => p.id === input.plan_id);
  if (!plan) throw new Error('Valid equity incentive plan is required.');

  const approval = store.board_approvals.find((b) => b.id === input.board_approval_id);
  if (!approval) throw new Error('Board approval resolution is required for equity grants.');

  if (input.quantity <= 0) throw new Error('Grant quantity must be greater than zero.');

  // §409A FMV Lock Check
  const checkDate =
    input.grant_date > DEFAULT_REFERENCE_DATE ? input.grant_date : DEFAULT_REFERENCE_DATE;
  const activeFmv = deriveActiveFmv(store, checkDate);
  if (activeFmv.grants_blocked || activeFmv.fmv_per_share_common === null || !activeFmv.report_id) {
    throw new Error(
      `IRC §409A Hard Block: ${
        activeFmv.block_reason || 'No active board-adopted 409A valuation report.'
      }`
    );
  }

  if (
    input.iso_nso !== 'RSU' &&
    Number(input.exercise_price) + 1e-9 < activeFmv.fmv_per_share_common
  ) {
    throw new Error(
      `IRC §409A Hard Block: Exercise price ($${Number(input.exercise_price).toFixed(
        2
      )}) cannot be below locked Common Stock FMV ($${activeFmv.fmv_per_share_common.toFixed(
        2
      )}/sh from report ${activeFmv.report_id}).`
    );
  }

  // Plan reserve check
  const currentDerived = deriveCapTable(store, checkDate, 'allocated_plus_pool');
  const planAvail = currentDerived.plans.find((p) => p.plan_id === plan.id);
  if (!planAvail || planAvail.shares_available < input.quantity) {
    throw new Error(
      `Insufficient shares in ${plan.name}: ${
        planAvail?.shares_available.toLocaleString() || 0
      } available, ${input.quantity.toLocaleString()} requested.`
    );
  }

  // Freeze pre-grant snapshot (Architecture Principle #2)
  const snapDerived = deriveCapTable(store, input.grant_date, 'allocated_plus_pool');
  const preGrantSnap: CapTableSnapshot = {
    id: `snap-grant-${Date.now()}`,
    company_id: store.company.id,
    as_of_date: input.grant_date,
    reason: 'grant',
    snapshot_jsonb: snapDerived,
    total_basic_shares: snapDerived.total_basic_shares,
    total_fd_shares: snapDerived.total_fd_shares,
    denominator_method: 'allocated_plus_pool',
    hash: computeSnapshotHash(snapDerived),
    created_at: new Date().toISOString(),
  };
  store.snapshots.push(preGrantSnap);

  const schedId = `vest-${Date.now()}`;
  store.vesting_schedules.push({
    id: schedId,
    company_id: store.company.id,
    name: `${input.total_months}m (${input.cliff_months}m cliff, ${input.frequency})`,
    total_months: Number(input.total_months),
    cliff_months: Number(input.cliff_months),
    frequency: input.frequency,
    start_date: input.vesting_start_date || input.grant_date,
  });

  const optNum = store.grants.length + 1;
  const certCode = `${input.iso_nso === 'RSA' ? 'RSA' : input.iso_nso === 'RSU' ? 'RSU' : 'OPT'}-${String(
    optNum
  ).padStart(3, '0')}`;
  const secId = `sec-award-${Date.now()}`;
  const kind: SecurityKind =
    input.iso_nso === 'RSA' ? 'rsa' : input.iso_nso === 'RSU' ? 'rsu' : 'option';

  store.securities.push({
    id: secId,
    company_id: store.company.id,
    certificate_code: certCode,
    stakeholder_id: holder.id,
    class_id: plan.class_id,
    plan_id: plan.id,
    kind,
    initial_quantity: Number(input.quantity),
    price_per_share: Number(input.exercise_price),
    status: 'active',
    issue_date: input.grant_date,
    board_approval_id: approval.id,
  });

  const needs83b = Boolean(input.early_exercise || input.iso_nso === 'RSA');
  const due83b = needs83b ? addDaysIso(input.grant_date, 30) : null;

  const grantId = `gr-${Date.now()}`;
  store.grants.push({
    id: grantId,
    security_id: secId,
    stakeholder_id: holder.id,
    plan_id: plan.id,
    grant_date: input.grant_date,
    quantity: Number(input.quantity),
    exercise_price: Number(input.exercise_price),
    fmv_at_grant: activeFmv.fmv_per_share_common,
    val_report_id: activeFmv.report_id,
    snapshot_id: preGrantSnap.id,
    vesting_schedule_id: schedId,
    expiry_date: addMonthsIso(input.grant_date, 120),
    iso_nso: input.iso_nso,
    early_exercise: Boolean(input.early_exercise),
    due_date_83b: due83b,
    filed_at_83b: null,
  });

  const agrDoc = makeDoc({
    id: `doc-grant-${Date.now()}`,
    company_id: store.company.id,
    title: `${input.iso_nso} Award Agreement — ${holder.name} (${certCode})`,
    kind: 'agreement',
    storage_path: `/vault/grants/${input.grant_date}-${certCode.toLowerCase()}.pdf`,
    signed_at: input.grant_date,
    content_summary: `${input.iso_nso} grant of ${input.quantity.toLocaleString()} shares @ $${Number(
      input.exercise_price
    ).toFixed(2)}/sh (locked FMV $${activeFmv.fmv_per_share_common.toFixed(
      2
    )}/sh, pre-grant snapshot ${preGrantSnap.id}).`,
  });
  store.documents.push(agrDoc);

  appendLedgerRow(store.transactions, {
    id: `txn-${Date.now()}`,
    company_id: store.company.id,
    security_id: secId,
    txn_type: 'grant',
    qty_delta: Number(input.quantity),
    price: Number(input.exercise_price),
    counterparty: holder.name,
    effective_date: input.grant_date,
    board_approval_id: approval.id,
    document_ids: [approval.document_id, agrDoc.id],
    notes: `${input.iso_nso} grant ${certCode} (${input.quantity.toLocaleString()} @ $${Number(
      input.exercise_price
    ).toFixed(2)}/sh)`,
  });

  saveEquityStore(store);
  return getEquityApiResponse();
}

export function recordSecurityTransaction(
  action: 'exercise' | 'transfer' | 'repurchase' | 'cancel' | 'convert' | 'split' | 'file83b',
  payload: Record<string, unknown>
): EquityApiResponse {
  const store = loadEquityStore();
  const effectiveDate = String(payload.effective_date || DEFAULT_REFERENCE_DATE);

  if (action === 'file83b') {
    const grantId = String(payload.grant_id || '');
    const grant = store.grants.find((g) => g.id === grantId);
    if (!grant) throw new Error('Grant not found.');
    if (!grant.due_date_83b) throw new Error('This grant is not subject to an IRC §83(b) election.');
    if (effectiveDate > grant.due_date_83b) {
      throw new Error(
        `IRC §83(b) Hard Block: Filing date (${effectiveDate}) is past the strict 30-day statutory deadline (${grant.due_date_83b}).`
      );
    }
    const holder = store.stakeholders.find((s) => s.id === grant.stakeholder_id);
    grant.filed_at_83b = effectiveDate;
    store.documents.push(
      makeDoc({
        id: `doc-83b-${Date.now()}`,
        company_id: store.company.id,
        title: `IRC §83(b) Election Filing Proof — ${holder?.name || 'Grantee'}`,
        kind: '83b',
        storage_path: `/vault/tax/${effectiveDate}-83b-${grant.id}.pdf`,
        signed_at: effectiveDate,
        content_summary: `Timely filed IRC §83(b) election on ${effectiveDate} (statutory due date ${grant.due_date_83b}).`,
      })
    );
    saveEquityStore(store);
    return getEquityApiResponse();
  }

  const approvalId = String(payload.board_approval_id || '');
  const approval = store.board_approvals.find((b) => b.id === approvalId);
  if (!approval) throw new Error('Board approval resolution is required for ledger transactions.');

  if (action === 'split') {
    const mult = Number(payload.split_multiplier || 0);
    if (mult <= 0 || mult === 1) {
      throw new Error('Stock split multiplier must be positive and not equal to 1.0.');
    }
    const anchorSec = store.securities[0];
    appendLedgerRow(store.transactions, {
      id: `txn-split-${Date.now()}`,
      company_id: store.company.id,
      security_id: anchorSec.id,
      txn_type: 'split',
      qty_delta: 0,
      split_multiplier: mult,
      price: 0,
      counterparty: 'All Stockholders & Plan Reserves',
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [approval.document_id],
      notes: `${mult}:1 forward/reverse stock split effective ${effectiveDate} (derived balances & plan reserves scaled proportionally)`,
    });
    saveEquityStore(store);
    return getEquityApiResponse();
  }

  const securityId = String(payload.security_id || '');
  const sec = store.securities.find((s) => s.id === securityId);
  if (!sec) throw new Error('Target security lot not found.');

  const currentBal = getSecurityActiveBalance(store, sec.id, DEFAULT_REFERENCE_DATE);
  const qty = Number(payload.quantity || currentBal);
  if (qty <= 0 || qty > currentBal + 1e-6) {
    throw new Error(
      `Invalid quantity (${qty.toLocaleString()}): active security balance is ${currentBal.toLocaleString()}.`
    );
  }

  const holder = store.stakeholders.find((s) => s.id === sec.stakeholder_id);

  if (action === 'exercise') {
    const grant = store.grants.find((g) => g.security_id === sec.id);
    if (!grant) throw new Error('Only option/award securities with a grant record can be exercised.');
    const sched = store.vesting_schedules.find((v) => v.id === grant.vesting_schedule_id);
    const alreadyExercised = store.transactions
      .filter((t) => t.security_id === sec.id && t.txn_type === 'exercise' && t.qty_delta < 0)
      .reduce((s, t) => s + Math.abs(t.qty_delta), 0);
    const totalVested = grant.early_exercise
      ? grant.quantity
      : computeVestedQuantityAsOf(grant, sched, effectiveDate);
    const exercisable = Math.min(currentBal, Math.max(0, totalVested - alreadyExercised));

    if (qty > exercisable + 1e-6) {
      throw new Error(
        `Exercise blocked: only ${exercisable.toLocaleString()} shares are vested/exercisable as of ${effectiveDate}.`
      );
    }

    const csCount =
      store.securities.filter((s) => s.certificate_code.startsWith('CS-')).length + 1;
    const newCert = `CS-${String(csCount).padStart(3, '0')}`;
    const newShareSecId = `sec-ex-${Date.now()}`;

    store.securities.push({
      id: newShareSecId,
      company_id: store.company.id,
      certificate_code: newCert,
      stakeholder_id: sec.stakeholder_id,
      class_id: sec.class_id || 'cls-common',
      plan_id: sec.plan_id,
      kind: 'share',
      initial_quantity: qty,
      price_per_share: grant.exercise_price,
      status: 'active',
      issue_date: effectiveDate,
      board_approval_id: approval.id,
    });

    const exDoc = makeDoc({
      id: `doc-ex-${Date.now()}`,
      company_id: store.company.id,
      title: `Option Exercise Notice (${sec.certificate_code} → ${newCert}) — ${holder?.name || ''}`,
      kind: 'agreement',
      storage_path: `/vault/exercises/${effectiveDate}-${newCert.toLowerCase()}.pdf`,
      signed_at: effectiveDate,
      content_summary: `Exercised ${qty.toLocaleString()} ${grant.iso_nso} options @ $${grant.exercise_price.toFixed(
        2
      )}/sh.`,
    });
    store.documents.push(exDoc);

    appendLedgerRow(store.transactions, {
      id: `txn-ex-debit-${Date.now()}`,
      company_id: store.company.id,
      security_id: sec.id,
      txn_type: 'exercise',
      qty_delta: -qty,
      price: grant.exercise_price,
      counterparty: holder?.name || null,
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [exDoc.id],
      notes: `Exercised ${qty.toLocaleString()} options from ${sec.certificate_code}`,
    });

    appendLedgerRow(store.transactions, {
      id: `txn-ex-credit-${Date.now() + 1}`,
      company_id: store.company.id,
      security_id: newShareSecId,
      txn_type: 'exercise',
      qty_delta: qty,
      price: grant.exercise_price,
      counterparty: holder?.name || null,
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [exDoc.id],
      notes: `Issued ${qty.toLocaleString()} Common shares (${newCert}) upon exercise`,
    });

    if (currentBal - qty <= 1e-6) sec.status = 'exercised';
  } else if (action === 'transfer') {
    const toStakeholderId = String(payload.to_stakeholder_id || '');
    const recipient = store.stakeholders.find((s) => s.id === toStakeholderId);
    if (!recipient) throw new Error('Recipient stakeholder is required for a secondary transfer.');
    const transferPrice = Number(payload.price || sec.price_per_share);

    const newSecId = `sec-tr-${Date.now()}`;
    const certCode = `${sec.certificate_code}-T`;
    store.securities.push({
      ...sec,
      id: newSecId,
      certificate_code: certCode,
      stakeholder_id: recipient.id,
      initial_quantity: qty,
      price_per_share: transferPrice,
      issue_date: effectiveDate,
      board_approval_id: approval.id,
    });

    appendLedgerRow(store.transactions, {
      id: `txn-tr-out-${Date.now()}`,
      company_id: store.company.id,
      security_id: sec.id,
      txn_type: 'transfer',
      qty_delta: -qty,
      price: transferPrice,
      counterparty: recipient.name,
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [approval.document_id],
      notes: `Secondary transfer of ${qty.toLocaleString()} sh from ${holder?.name} to ${recipient.name}`,
    });

    appendLedgerRow(store.transactions, {
      id: `txn-tr-in-${Date.now() + 1}`,
      company_id: store.company.id,
      security_id: newSecId,
      txn_type: 'transfer',
      qty_delta: qty,
      price: transferPrice,
      counterparty: holder?.name || null,
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [approval.document_id],
      notes: `Received ${qty.toLocaleString()} sh (${certCode}) from ${holder?.name}`,
    });
  } else if (action === 'repurchase') {
    const repPrice = Number(payload.price || sec.price_per_share);
    appendLedgerRow(store.transactions, {
      id: `txn-rep-${Date.now()}`,
      company_id: store.company.id,
      security_id: sec.id,
      txn_type: 'repurchase',
      qty_delta: -qty,
      price: repPrice,
      counterparty: holder?.name || null,
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [approval.document_id],
      notes: `Company repurchase of ${qty.toLocaleString()} shares from ${sec.certificate_code}`,
    });
    if (currentBal - qty <= 1e-6) sec.status = 'repurchased';
  } else if (action === 'cancel') {
    appendLedgerRow(store.transactions, {
      id: `txn-can-${Date.now()}`,
      company_id: store.company.id,
      security_id: sec.id,
      txn_type: 'cancel',
      qty_delta: -qty,
      price: 0,
      counterparty: holder?.name || null,
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [approval.document_id],
      notes: `Cancelled / forfeited ${qty.toLocaleString()} units of ${sec.certificate_code} (returned to pool if plan award)`,
    });
    if (currentBal - qty <= 1e-6) sec.status = 'cancelled';
  } else if (action === 'convert') {
    const commonCls =
      store.security_classes.find((c) => c.class_type === 'common') || store.security_classes[0];
    let convertedShares = qty;
    let txnType: LedgerTxnType = 'convert';
    let convPps = sec.price_per_share;

    if (sec.kind === 'safe' || sec.kind === 'convertible_note') {
      txnType = sec.kind === 'safe' ? 'safe_convert' : 'note_convert';
      const roundPps = Number(payload.conversion_price || 1.5);
      convPps = roundPps;
      convertedShares = Math.floor((sec.principal_amount || qty) / Math.max(0.0001, roundPps));
    } else if (sec.class_id) {
      const srcCls = store.security_classes.find((c) => c.id === sec.class_id);
      convertedShares = qty * (srcCls?.conversion_ratio || 1);
    }

    const newSecId = `sec-conv-${Date.now()}`;
    const certCode = `CS-CONV-${store.securities.length + 1}`;
    store.securities.push({
      id: newSecId,
      company_id: store.company.id,
      certificate_code: certCode,
      stakeholder_id: sec.stakeholder_id,
      class_id: commonCls.id,
      plan_id: null,
      kind: 'share',
      initial_quantity: convertedShares,
      price_per_share: convPps,
      status: 'active',
      issue_date: effectiveDate,
      board_approval_id: approval.id,
    });

    appendLedgerRow(store.transactions, {
      id: `txn-conv-out-${Date.now()}`,
      company_id: store.company.id,
      security_id: sec.id,
      txn_type: txnType,
      qty_delta: -qty,
      price: convPps,
      counterparty: holder?.name || null,
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [approval.document_id],
      notes: `Converted ${sec.certificate_code} into ${convertedShares.toLocaleString()} shares of ${commonCls.name}`,
    });

    appendLedgerRow(store.transactions, {
      id: `txn-conv-in-${Date.now() + 1}`,
      company_id: store.company.id,
      security_id: newSecId,
      txn_type: txnType,
      qty_delta: convertedShares,
      price: convPps,
      counterparty: holder?.name || null,
      effective_date: effectiveDate,
      board_approval_id: approval.id,
      document_ids: [approval.document_id],
      notes: `Issued ${convertedShares.toLocaleString()} shares (${certCode}) upon conversion`,
    });

    if (currentBal - qty <= 1e-6) sec.status = 'converted';
  }

  saveEquityStore(store);
  return getEquityApiResponse();
}

export function createValuationRequest(input: {
  valuation_date: string;
  purpose: string;
  qualified_individual_id: string;
  material_event_id?: string | null;
  no_cic_90d?: boolean;
  no_ipo_180d?: boolean;
}): { request: ValRequest; state: EquityApiResponse } {
  const store = loadEquityStore();
  const qi = store.qualified_individuals.find((q) => q.id === input.qualified_individual_id);
  const qiHolder = qi
    ? store.stakeholders.find((s) => s.id === qi.stakeholder_id)
    : undefined;

  const noCic = input.no_cic_90d !== undefined ? input.no_cic_90d : true;
  const noIpo = input.no_ipo_180d !== undefined ? input.no_ipo_180d : true;

  const gateCheck = runGateCheck({
    company: store.company,
    classes: store.security_classes,
    securities: store.securities,
    qi,
    qiName: qiHolder?.name || 'Unassigned Appraiser',
    noCic90d: noCic,
    noIpo180d: noIpo,
    valuationDate: input.valuation_date,
  });

  const reqId = `valreq-${Date.now()}`;
  const req: ValRequest = {
    id: reqId,
    company_id: store.company.id,
    valuation_date: input.valuation_date,
    purpose: input.purpose.trim() || 'IRC §409A Common Stock Valuation',
    qualified_individual_id: input.qualified_individual_id,
    status: gateCheck.eligible ? 'collecting' : 'ineligible_independent_required',
    material_event_id: input.material_event_id || null,
    gate_check: gateCheck,
    created_at: new Date().toISOString(),
  };
  store.val_requests.unshift(req);

  // Clone baseline financial inputs & guideline comps from prior run so analyst can edit directly
  const templateReqId = Object.keys(store.val_inputs)[0];
  const baseInputs = templateReqId ? store.val_inputs[templateReqId] : undefined;
  store.val_inputs[reqId] = baseInputs
    ? {
        ...JSON.parse(JSON.stringify(baseInputs)),
        request_id: reqId,
        no_cic_90d: noCic,
        no_ipo_180d: noIpo,
      }
    : {
        request_id: reqId,
        cash: 1_940_000,
        debt: 0,
        adjusted_book_assets: 3_420_000,
        total_liabilities: 480_000,
        ltm_revenue: 2_100_000,
        ntm_revenue: 3_300_000,
        ltm_ebitda: -280_000,
        historical_financials: [
          { period: 'FY2025', revenue: 1_580_000, ebitda: -510_000, fcf: -560_000 },
        ],
        projected_fcfs: [
          { period: 'FY2027E', revenue: 4_400_000, ebitda: 520_000, fcf: 390_000 },
          { period: 'FY2028E', revenue: 6_900_000, ebitda: 1_380_000, fcf: 1_060_000 },
          { period: 'FY2029E', revenue: 9_800_000, ebitda: 2_350_000, fcf: 1_820_000 },
        ],
        dcf_risk_free_rate: 0.043,
        dcf_erp: 0.055,
        dcf_size_premium: 0.052,
        dcf_company_specific_risk: 0.065,
        dcf_terminal_method: 'gordon_growth',
        dcf_terminal_growth: 0.035,
        dcf_exit_ev_rev_multiple: 4.2,
        guideline_size_growth_adj_pct: -0.25,
        backsolve_class_id: 'cls-seed',
        no_cic_90d: noCic,
        no_ipo_180d: noIpo,
        industry_notes: 'Omnichannel SaaS & commerce peer group.',
      };

  const baseComps = templateReqId ? store.val_comps[templateReqId] : [];
  store.val_comps[reqId] = baseComps.map((c, idx) => ({
    ...c,
    id: `comp-${reqId}-${idx + 1}`,
    request_id: reqId,
    as_of: input.valuation_date,
  }));

  saveEquityStore(store);
  return { request: req, state: getEquityApiResponse() };
}

export function saveValuationInputs(
  requestId: string,
  patch: Partial<ValInputs>
): EquityApiResponse {
  const store = loadEquityStore();
  const req = store.val_requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Valuation request not found.');
  if (req.status === 'adopted') throw new Error('Adopted valuation runs are immutable.');

  const merged: ValInputs = {
    ...store.val_inputs[requestId],
    ...patch,
    request_id: requestId,
  };
  store.val_inputs[requestId] = merged;

  const qi = store.qualified_individuals.find((q) => q.id === req.qualified_individual_id);
  const qiHolder = qi
    ? store.stakeholders.find((s) => s.id === qi.stakeholder_id)
    : undefined;

  req.gate_check = runGateCheck({
    company: store.company,
    classes: store.security_classes,
    securities: store.securities,
    qi,
    qiName: qiHolder?.name || 'Unassigned Appraiser',
    noCic90d: merged.no_cic_90d,
    noIpo180d: merged.no_ipo_180d,
    valuationDate: req.valuation_date,
  });
  req.status = req.gate_check.eligible ? 'drafting' : 'ineligible_independent_required';

  saveEquityStore(store);
  return getEquityApiResponse();
}

export function saveValuationComps(
  requestId: string,
  comps: Omit<ValComp, 'id' | 'request_id'>[]
): EquityApiResponse {
  const store = loadEquityStore();
  const req = store.val_requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Valuation request not found.');
  if (req.status === 'adopted') throw new Error('Adopted valuation runs are immutable.');

  store.val_comps[requestId] = comps.map((c, idx) => ({
    ...c,
    id: `comp-${requestId}-${idx + 1}`,
    request_id: requestId,
  }));
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function saveValuationApproaches(
  requestId: string,
  weights: {
    method: ValApproach['method'];
    weight_pct: number;
    rejected: boolean;
    rationale: string;
  }[],
  timeToLiquidityYrs = 3.5
): EquityApiResponse {
  const store = loadEquityStore();
  const req = store.val_requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Valuation request not found.');
  if (req.status === 'adopted') throw new Error('Adopted valuation runs are immutable.');

  const activeSum = weights
    .filter((w) => !w.rejected)
    .reduce((s, w) => s + Number(w.weight_pct || 0), 0);
  if (Math.abs(activeSum - 100) > 0.5) {
    throw new Error(`Active valuation approach weights must sum to 100% (currently ${activeSum}%).`);
  }

  const derived = deriveCapTable(store, req.valuation_date, 'allocated_plus_pool');
  const existingMapped: ValApproach[] = weights.map((w) => ({
    id: `app-${w.method}-${requestId}`,
    request_id: requestId,
    method: w.method,
    enterprise_value_result: 0,
    weight_pct: Number(w.weight_pct),
    rejected: Boolean(w.rejected),
    rationale: w.rationale,
    inputs_jsonb: {},
  }));

  const evalRes = evaluateValuationApproaches({
    requestId,
    inputs: store.val_inputs[requestId],
    comps: store.val_comps[requestId] || [],
    existingApproaches: existingMapped,
    classes: store.security_classes,
    grants: store.grants.filter((g) => g.grant_date <= req.valuation_date),
    derivedCapTable: derived,
    timeToLiquidityYrs,
  });

  store.val_approaches[requestId] = evalRes.approaches;
  if (req.gate_check.eligible) req.status = 'drafting';
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function runValuationAllocation(
  requestId: string,
  params: {
    method: AllocationMethod;
    volatility?: number;
    time_to_liquidity_yrs?: number;
    risk_free_rate?: number;
    dividend_yield?: number;
    pwerm_scenarios?: PwermScenario[];
  }
): EquityApiResponse {
  const store = loadEquityStore();
  const req = store.val_requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Valuation request not found.');
  if (!req.gate_check.eligible) {
    throw new Error(
      'Inside safe-harbor gate check failed (`ineligible_independent_required`). Resolve eligibility before running OPM allocation.'
    );
  }

  const inputs = store.val_inputs[requestId];
  const comps = store.val_comps[requestId] || [];
  const ttl = Number(params.time_to_liquidity_yrs || 3.5);
  const derived = deriveCapTable(store, req.valuation_date, 'allocated_plus_pool');

  const evEval = evaluateValuationApproaches({
    requestId,
    inputs,
    comps,
    existingApproaches: store.val_approaches[requestId] || [],
    classes: store.security_classes,
    grants: store.grants.filter((g) => g.grant_date <= req.valuation_date),
    derivedCapTable: derived,
    timeToLiquidityYrs: ttl,
  });
  store.val_approaches[requestId] = evEval.approaches;

  const alloc = runAllocationVariant({
    requestId,
    method: params.method || 'opm',
    concludedEv: evEval.concluded_ev,
    equityValue: evEval.concluded_equity_value,
    classes: store.security_classes,
    grants: store.grants.filter((g) => g.grant_date <= req.valuation_date),
    derivedCapTable: derived,
    volatility: Number(params.volatility ?? evEval.median_volatility),
    timeToLiquidityYrs: ttl,
    riskFreeRate: Number(params.risk_free_rate ?? inputs.dcf_risk_free_rate),
    dividendYield: Number(params.dividend_yield ?? 0),
    pwermScenarios: params.pwerm_scenarios,
  });

  store.val_allocations[requestId] = alloc;
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function runValuationDlom(
  requestId: string,
  params: {
    model: DlomModel;
    study_citation?: string;
    study_pct?: number;
    rationale?: string;
  }
): EquityApiResponse {
  const store = loadEquityStore();
  const req = store.val_requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Valuation request not found.');

  let alloc = store.val_allocations[requestId];
  if (!alloc) {
    runValuationAllocation(requestId, { method: 'opm' });
    alloc = store.val_allocations[requestId];
  }

  const dlom = runDlomCalculation({
    requestId,
    model: params.model || 'finnerty',
    preDlomCommonPps: alloc.common_per_share_pre_dlom,
    volatility: alloc.volatility,
    timeToLiquidityYrs: alloc.time_to_liquidity_yrs,
    riskFreeRate: alloc.risk_free_rate,
    dividendYield: alloc.dividend_yield,
    studyCitation: params.study_citation,
    studyPct: params.study_pct,
    rationale: params.rationale,
  });

  store.val_dlom[requestId] = dlom;
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function generateValuationReport(requestId: string): EquityApiResponse {
  const store = loadEquityStore();
  const req = store.val_requests.find((r) => r.id === requestId);
  if (!req) throw new Error('Valuation request not found.');
  if (!req.gate_check.eligible) {
    throw new Error('Cannot generate inside safe-harbor report when gate check is ineligible.');
  }

  if (!store.val_allocations[requestId]) {
    runValuationAllocation(requestId, { method: 'opm' });
  }
  if (!store.val_dlom[requestId]) {
    runValuationDlom(requestId, { model: 'finnerty' });
  }

  const alloc = store.val_allocations[requestId];
  const dlom = store.val_dlom[requestId];
  const inputs = store.val_inputs[requestId];
  const approaches = store.val_approaches[requestId];

  // Freeze dedicated valuation snapshot as of valuation_date
  const snapDerived = deriveCapTable(store, req.valuation_date, 'allocated_plus_pool');
  const valSnap: CapTableSnapshot = {
    id: `snap-val-${Date.now()}`,
    company_id: store.company.id,
    as_of_date: req.valuation_date,
    reason: 'valuation',
    snapshot_jsonb: snapDerived,
    total_basic_shares: snapDerived.total_basic_shares,
    total_fd_shares: snapDerived.total_fd_shares,
    denominator_method: 'allocated_plus_pool',
    hash: computeSnapshotHash(snapDerived),
    created_at: new Date().toISOString(),
  };
  store.snapshots.push(valSnap);

  const qi = store.qualified_individuals.find((q) => q.id === req.qualified_individual_id)!;
  const qiHolder = store.stakeholders.find((s) => s.id === qi.stakeholder_id);
  const cvDoc = store.documents.find((d) => d.id === qi.cv_document_id);

  const reportDate = DEFAULT_REFERENCE_DATE;
  const validUntil = addMonthsIso(req.valuation_date, 12);

  const structured = buildStructured409aReport({
    company: store.company,
    valuationDate: req.valuation_date,
    reportDate,
    validUntil,
    purpose: req.purpose,
    gateCheck: req.gate_check,
    qiName: qiHolder?.name || 'Qualified Individual',
    qi,
    cvSha256: cvDoc?.sha256 || sha256Hex(qi.id),
    snapshot: valSnap,
    inputs,
    approaches,
    allocation: alloc,
    dlom,
  });

  const repDocId = `doc-rep-${Date.now()}`;
  store.documents.push(
    makeDoc({
      id: repDocId,
      company_id: store.company.id,
      title: `IRC §409A Valuation Report ($${dlom.common_per_share_post_dlom.toFixed(
        2
      )}/sh — As of ${req.valuation_date})`,
      kind: 'report',
      storage_path: `/vault/409a/${reportDate}-${requestId}.pdf`,
      signed_at: reportDate,
      content_summary: `Structured 409A valuation report. Concluded EV $${(
        alloc.concluded_enterprise_value / 1e6
      ).toFixed(2)}M, Common FMV $${dlom.common_per_share_post_dlom.toFixed(2)}/share.`,
    })
  );

  const existingIdx = store.val_reports.findIndex((r) => r.request_id === requestId);
  const repObj: ValReport = {
    id: existingIdx >= 0 ? store.val_reports[existingIdx].id : `valrep-${Date.now()}`,
    request_id: requestId,
    snapshot_id: valSnap.id,
    fmv_per_share_common: dlom.common_per_share_post_dlom,
    valuation_date: req.valuation_date,
    report_date: reportDate,
    qualified_individual_id: qi.id,
    report_document_id: repDocId,
    board_approval_id: null,
    status: 'in_review',
    valid_until: validUntil,
    superseded_by: null,
    structured_report: structured,
  };

  if (existingIdx >= 0) {
    store.val_reports[existingIdx] = repObj;
  } else {
    store.val_reports.unshift(repObj);
  }

  req.status = 'in_review';
  saveEquityStore(store);
  return getEquityApiResponse();
}

export function adoptValuationReport(
  reportId: string,
  input?: { signers?: string[]; adopted_at?: string }
): EquityApiResponse {
  const store = loadEquityStore();
  const report = store.val_reports.find((r) => r.id === reportId);
  if (!report) throw new Error('409A valuation report not found.');

  const req = store.val_requests.find((r) => r.id === report.request_id);
  const adoptedAt = input?.adopted_at || DEFAULT_REFERENCE_DATE;
  const signers =
    input?.signers && input.signers.length > 0
      ? input.signers
      : ['Sarah Alvarez', 'Marcus Chen', 'Horizon Seed Ventures LP'];

  const consentDocId = `doc-val-adopt-${Date.now()}`;
  store.documents.push(
    makeDoc({
      id: consentDocId,
      company_id: store.company.id,
      title: `Board Resolution Adopting 409A Valuation ($${report.fmv_per_share_common.toFixed(
        2
      )}/sh)`,
      kind: 'consent',
      storage_path: `/vault/consents/${adoptedAt}-adopt-${report.id}.pdf`,
      signed_at: adoptedAt,
      content_summary: `Adopts 409A report ${report.id} and locks Common Stock FMV at $${report.fmv_per_share_common.toFixed(
        2
      )}/sh through ${report.valid_until}.`,
    })
  );

  const approvalId = `ba-val-${Date.now()}`;
  store.board_approvals.push({
    id: approvalId,
    company_id: store.company.id,
    code: `UWC-409A-${store.board_approvals.length + 1}`,
    title: `Board Adoption of 409A Common Stock FMV ($${report.fmv_per_share_common.toFixed(2)}/sh)`,
    type: 'valuation_adopt',
    adopted_at: adoptedAt,
    document_id: consentDocId,
    signers,
    recitals_jsonb: {
      report_id: report.id,
      fmv_per_share_common: report.fmv_per_share_common,
      valid_until: report.valid_until,
    },
  });

  // Supersede prior adopted reports
  for (const prev of store.val_reports) {
    if (prev.id !== report.id && prev.status === 'adopted') {
      prev.status = 'superseded';
      prev.superseded_by = report.id;
      const prevReq = store.val_requests.find((rq) => rq.id === prev.request_id);
      if (prevReq) prevReq.status = 'superseded';
    }
  }

  report.status = 'adopted';
  report.board_approval_id = approvalId;
  if (req) {
    req.status = 'adopted';
    // Resolve pending material events on or before this valuation date
    for (const ev of store.material_events) {
      if (
        !ev.resolved_val_request_id &&
        (ev.id === req.material_event_id || ev.event_date <= req.valuation_date)
      ) {
        ev.resolved_val_request_id = req.id;
      }
    }
  }

  saveEquityStore(store);
  return getEquityApiResponse();
}

export function logMaterialEvent(input: {
  type: MaterialEventType;
  event_date: string;
  description: string;
  triggers_revaluation: boolean;
}): EquityApiResponse {
  if (!input.description.trim()) throw new Error('Material event description is required.');
  const store = loadEquityStore();
  const ev: ValMaterialEvent = {
    id: `mev-${Date.now()}`,
    company_id: store.company.id,
    type: input.type,
    event_date: input.event_date || DEFAULT_REFERENCE_DATE,
    description: input.description.trim(),
    triggers_revaluation: Boolean(input.triggers_revaluation),
    resolved_val_request_id: null,
    created_at: new Date().toISOString(),
  };
  store.material_events.unshift(ev);

  if (ev.triggers_revaluation) {
    for (const rep of store.val_reports) {
      if (rep.status === 'adopted') {
        rep.status = 'superseded';
        const rq = store.val_requests.find((r) => r.id === rep.request_id);
        if (rq) rq.status = 'superseded';
      }
    }
  }

  saveEquityStore(store);
  return getEquityApiResponse();
}
