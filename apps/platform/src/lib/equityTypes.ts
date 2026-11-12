export type StakeholderType = 'founder' | 'employee' | 'advisor' | 'investor' | 'entity';

export type SecurityKind =
  | 'share'
  | 'option'
  | 'rsa'
  | 'rsu'
  | 'warrant'
  | 'safe'
  | 'convertible_note';

export type SecurityStatus =
  | 'active'
  | 'exercised'
  | 'cancelled'
  | 'converted'
  | 'repurchased';

export type LedgerTxnType =
  | 'issue'
  | 'grant'
  | 'exercise'
  | 'transfer'
  | 'repurchase'
  | 'cancel'
  | 'convert'
  | 'safe_convert'
  | 'note_convert'
  | 'split';

export type SnapshotReason = 'valuation' | 'grant' | 'financing' | 'board';

export type BoardApprovalType =
  | 'plan_adopt'
  | 'grant_batch'
  | 'valuation_adopt'
  | 'financing'
  | 'charter_amend'
  | 'qi_determination';

export type VaultDocKind =
  | 'charter'
  | 'bylaw'
  | 'report'
  | 'consent'
  | 'agreement'
  | '83b'
  | 'cv';

export type ValuationRequestStatus =
  | 'collecting'
  | 'drafting'
  | 'in_review'
  | 'adopted'
  | 'superseded'
  | 'expired'
  | 'ineligible_independent_required';

export type ValuationApproachMethod =
  | 'asset'
  | 'dcf'
  | 'market_guideline'
  | 'market_txn'
  | 'backsolve';

export type AllocationMethod = 'opm' | 'pwerm' | 'cvm' | 'hybrid';

export type DlomModel = 'finnerty' | 'chaffe' | 'restricted_study' | 'preipo_study';

export type MaterialEventType =
  | 'financing'
  | 'term_sheet'
  | 'patent'
  | 'litigation'
  | 'key_hire'
  | 'customer'
  | 'other';

export interface CapCompany {
  id: string;
  legal_name: string;
  ein_masked: string;
  state_of_incorp: string;
  incorp_date: string;
  predecessor_start_date: string | null;
  fiscal_year_end: string;
  has_traded_class: boolean;
  total_assets: number;
}

export interface CapStakeholder {
  id: string;
  company_id: string;
  name: string;
  type: StakeholderType;
  email: string;
  tax_id_masked: string;
  is_insider: boolean;
  is_board: boolean;
}

export interface CapQualifiedIndividual {
  id: string;
  company_id: string;
  stakeholder_id: string;
  qualifications_summary: string;
  years_experience: number;
  experience_categories: string[];
  cv_document_id: string;
  board_determined_at: string;
  board_determination_doc_id: string;
}

export interface CapSecurityClass {
  id: string;
  company_id: string;
  name: string;
  class_type: 'common' | 'preferred';
  authorized_shares: number;
  seniority_rank: number;
  liquidation_preference_multiple: number;
  par_value: number;
  conversion_ratio: number;
  participating: boolean;
  participation_cap_multiple: number | null;
  dividend_rate: number;
  voting_rights: boolean;
  price_per_share_original: number;
  has_put_call_redemption: boolean;
}

export interface CapEquityPlan {
  id: string;
  company_id: string;
  name: string;
  class_id: string;
  board_approved_at: string;
  shareholder_approved_at: string | null;
  total_reserved: number;
  board_approval_id: string;
}

export interface CapVestingSchedule {
  id: string;
  company_id: string;
  name: string;
  total_months: number;
  cliff_months: number;
  frequency: 'monthly' | 'quarterly' | 'immediate';
  start_date: string;
}

export interface CapVestingTranche {
  tranche_index: number;
  vest_date: string;
  qty: number;
  vested_cumulative: number;
  is_cliff: boolean;
}

export interface CapSecurity {
  id: string;
  company_id: string;
  certificate_code: string;
  stakeholder_id: string;
  class_id: string | null;
  plan_id: string | null;
  kind: SecurityKind;
  initial_quantity: number;
  price_per_share: number;
  principal_amount?: number;
  valuation_cap?: number;
  discount_pct?: number;
  interest_rate?: number;
  status: SecurityStatus;
  issue_date: string;
  board_approval_id: string;
}

export interface CapGrant {
  id: string;
  security_id: string;
  stakeholder_id: string;
  plan_id: string;
  grant_date: string;
  quantity: number;
  exercise_price: number;
  fmv_at_grant: number;
  val_report_id: string;
  snapshot_id: string;
  vesting_schedule_id: string;
  expiry_date: string;
  iso_nso: 'ISO' | 'NSO' | 'RSA' | 'RSU';
  early_exercise: boolean;
  due_date_83b: string | null;
  filed_at_83b: string | null;
}

export interface CapTransaction {
  id: string;
  seq: number;
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
  prev_hash: string;
  row_hash: string;
  notes: string;
  created_at: string;
}

export interface DerivedHolderRow {
  stakeholder_id: string;
  stakeholder_name: string;
  stakeholder_type: StakeholderType;
  class_id: string;
  class_name: string;
  issued_shares: number;
  as_converted_common: number;
  options_granted: number;
  options_vested: number;
  options_unvested: number;
  warrants: number;
  total_fd_shares: number;
  basic_pct: number;
  fd_pct: number;
  invested_capital: number;
}

export interface DerivedClassSummary {
  class_id: string;
  class_name: string;
  class_type: 'common' | 'preferred';
  seniority_rank: number;
  authorized_shares: number;
  issued_shares: number;
  as_converted_shares: number;
  fd_shares: number;
  liquidation_preference_total: number;
  basic_pct: number;
  fd_pct: number;
}

export interface ConvertibleInstrumentSummary {
  security_id: string;
  certificate_code: string;
  stakeholder_name: string;
  kind: 'safe' | 'convertible_note';
  issue_date: string;
  principal_amount: number;
  valuation_cap: number | null;
  discount_pct: number | null;
  interest_rate: number | null;
}

export interface PlanAvailabilityView {
  plan_id: string;
  plan_name: string;
  total_reserved: number;
  active_options_outstanding: number;
  exercised_from_plan: number;
  shares_available: number;
}

export interface DerivedCapTableResult {
  as_of_date: string;
  denominator_method: 'allocated_plus_pool' | 'allocated_only';
  total_basic_shares: number;
  total_options_outstanding: number;
  total_warrants: number;
  total_pool_available: number;
  total_fd_shares: number;
  rows: DerivedHolderRow[];
  class_summaries: DerivedClassSummary[];
  convertibles: ConvertibleInstrumentSummary[];
  plans: PlanAvailabilityView[];
}

export interface CapTableSnapshot {
  id: string;
  company_id: string;
  as_of_date: string;
  reason: SnapshotReason;
  snapshot_jsonb: DerivedCapTableResult;
  total_basic_shares: number;
  total_fd_shares: number;
  denominator_method: string;
  hash: string;
  created_at: string;
}

export interface CapBoardApproval {
  id: string;
  company_id: string;
  code: string;
  title: string;
  type: BoardApprovalType;
  adopted_at: string;
  document_id: string;
  signers: string[];
  recitals_jsonb: Record<string, string | number | boolean>;
}

export interface CapDocument {
  id: string;
  company_id: string;
  title: string;
  kind: VaultDocKind;
  storage_path: string;
  sha256: string;
  signed_at: string | null;
  retention_hold: boolean;
  content_summary: string;
}

export interface GateCheckItem {
  key: string;
  label: string;
  passed: boolean;
  detail: string;
}

export interface GateCheckResult {
  eligible: boolean;
  checked_at: string;
  items: GateCheckItem[];
}

export interface ValRequest {
  id: string;
  company_id: string;
  valuation_date: string;
  purpose: string;
  qualified_individual_id: string;
  status: ValuationRequestStatus;
  material_event_id: string | null;
  gate_check: GateCheckResult;
  created_at: string;
}

export interface FinancialPeriod {
  period: string;
  revenue: number;
  ebitda: number;
  fcf: number;
}

export interface ValInputs {
  request_id: string;
  cash: number;
  debt: number;
  adjusted_book_assets: number;
  total_liabilities: number;
  ltm_revenue: number;
  ntm_revenue: number;
  ltm_ebitda: number;
  historical_financials: FinancialPeriod[];
  projected_fcfs: FinancialPeriod[];
  dcf_risk_free_rate: number;
  dcf_erp: number;
  dcf_size_premium: number;
  dcf_company_specific_risk: number;
  dcf_terminal_method: 'gordon_growth' | 'exit_multiple';
  dcf_terminal_growth: number;
  dcf_exit_ev_rev_multiple: number;
  guideline_size_growth_adj_pct: number;
  backsolve_class_id: string | null;
  no_cic_90d: boolean;
  no_ipo_180d: boolean;
  industry_notes: string;
}

export interface ValComp {
  id: string;
  request_id: string;
  ticker: string;
  name: string;
  ev_rev_multiple: number;
  ev_ebitda_multiple: number | null;
  volatility: number;
  beta: number;
  source: string;
  as_of: string;
}

export interface ValApproach {
  id: string;
  request_id: string;
  method: ValuationApproachMethod;
  enterprise_value_result: number;
  weight_pct: number;
  rationale: string;
  inputs_jsonb: Record<string, unknown>;
  rejected: boolean;
}

export interface OpmBreakpoint {
  index: number;
  from_value: number;
  to_value: number | null;
  description: string;
  call_value_start: number;
  call_value_end: number;
  tranche_value: number;
  participations: Record<string, number>;
}

export interface PwermScenario {
  name: string;
  exit_type: 'IPO' | 'M&A' | 'Stay Private' | 'Liquidation';
  exit_equity_value: number;
  probability_pct: number;
  time_yrs: number;
  discount_rate: number;
}

export interface ClassAllocationOutput {
  bucket_id: string;
  label: string;
  shares: number;
  total_allocated_value: number;
  per_share_value: number;
}

export interface ValAllocation {
  id: string;
  request_id: string;
  method: AllocationMethod;
  breakpoints: OpmBreakpoint[];
  pwerm_scenarios?: PwermScenario[];
  volatility: number;
  time_to_liquidity_yrs: number;
  risk_free_rate: number;
  dividend_yield: number;
  concluded_enterprise_value: number;
  equity_value_in: number;
  per_class_value: ClassAllocationOutput[];
  common_per_share_pre_dlom: number;
}

export interface ValDlom {
  id: string;
  request_id: string;
  model: DlomModel;
  inputs_jsonb: {
    volatility: number;
    time_to_liquidity_yrs: number;
    risk_free_rate: number;
    dividend_yield: number;
    finnerty_dlom_pct: number;
    chaffe_dlom_pct: number;
    study_citation?: string;
    study_dlom_pct?: number;
  };
  dlom_pct: number;
  rationale: string;
  common_per_share_post_dlom: number;
}

export interface Structured409aReportContent {
  engine_version: string;
  generated_at: string;
  cover: {
    company_name: string;
    valuation_date: string;
    report_date: string;
    fmv_per_share_common: number;
    valid_until: string;
    purpose: string;
  };
  eligibility: GateCheckResult;
  qualified_individual: {
    name: string;
    years_experience: number;
    qualifications_summary: string;
    experience_categories: string[];
    board_determined_at: string;
    cv_doc_sha256: string;
  };
  company_profile: CapCompany;
  cap_snapshot: {
    snapshot_id: string;
    as_of_date: string;
    snapshot_hash: string;
    total_basic_shares: number;
    total_fd_shares: number;
    class_summaries: DerivedClassSummary[];
  };
  financial_summary: {
    cash: number;
    debt: number;
    ltm_revenue: number;
    ntm_revenue: number;
    ltm_ebitda: number;
    historical: FinancialPeriod[];
    projected: FinancialPeriod[];
  };
  approaches: {
    items: ValApproach[];
    concluded_ev: number;
    concluded_equity_value: number;
  };
  allocation: ValAllocation;
  dlom: ValDlom;
  conclusion: {
    pre_dlom_common_pps: number;
    dlom_pct: number;
    concluded_fmv_common_pps: number;
    validity_note: string;
  };
}

export interface ValReport {
  id: string;
  request_id: string;
  snapshot_id: string;
  fmv_per_share_common: number;
  valuation_date: string;
  report_date: string;
  qualified_individual_id: string;
  report_document_id: string;
  board_approval_id: string | null;
  status: 'in_review' | 'adopted' | 'superseded' | 'expired';
  valid_until: string;
  superseded_by: string | null;
  structured_report: Structured409aReportContent;
}

export interface ValMaterialEvent {
  id: string;
  company_id: string;
  type: MaterialEventType;
  event_date: string;
  description: string;
  triggers_revaluation: boolean;
  resolved_val_request_id: string | null;
  created_at: string;
}

export interface ActiveFmvView {
  locked: boolean;
  grants_blocked: boolean;
  block_reason: string | null;
  report_id: string | null;
  fmv_per_share_common: number | null;
  valuation_date: string | null;
  adopted_at: string | null;
  valid_until: string | null;
  days_until_expiry: number | null;
  snapshot_id: string | null;
  snapshot_hash: string | null;
}

export interface CalendarComplianceItem {
  id: string;
  category: '409A Expiry' | 'Material Event' | '83(b) Deadline' | 'Vesting' | 'Rule 701' | 'Form 3921';
  due_date: string;
  days_delta: number;
  severity: 'critical' | 'warning' | 'ok';
  title: string;
  detail: string;
  stakeholder_name?: string;
}

export interface Rule701Summary {
  rolling_12m_grant_value: number;
  hard_cap_1m: number;
  assets_15pct_limit: number;
  class_shares_15pct_limit: number;
  max_rely_limit: number;
  rolling_12m_shares_granted: number;
  enhanced_disclosure_triggered: boolean;
}

export interface EquityStoreData {
  company: CapCompany;
  stakeholders: CapStakeholder[];
  qualified_individuals: CapQualifiedIndividual[];
  security_classes: CapSecurityClass[];
  equity_plans: CapEquityPlan[];
  vesting_schedules: CapVestingSchedule[];
  securities: CapSecurity[];
  grants: CapGrant[];
  transactions: CapTransaction[];
  snapshots: CapTableSnapshot[];
  board_approvals: CapBoardApproval[];
  documents: CapDocument[];
  val_requests: ValRequest[];
  val_inputs: Record<string, ValInputs>;
  val_comps: Record<string, ValComp[]>;
  val_approaches: Record<string, ValApproach[]>;
  val_allocations: Record<string, ValAllocation>;
  val_dlom: Record<string, ValDlom>;
  val_reports: ValReport[];
  material_events: ValMaterialEvent[];
}

export interface EquityApiResponse {
  reference_date: string;
  store: EquityStoreData;
  derived_cap_table: DerivedCapTableResult;
  active_fmv: ActiveFmvView;
  ledger_integrity: {
    valid: boolean;
    checked_rows: number;
    head_hash: string;
    broken_at_seq: number | null;
  };
  calendar_items: CalendarComplianceItem[];
  rule_701: Rule701Summary;
}
