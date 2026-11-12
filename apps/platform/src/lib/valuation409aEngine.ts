import {
  AllocationMethod,
  CapCompany,
  CapGrant,
  CapQualifiedIndividual,
  CapSecurity,
  CapSecurityClass,
  CapTableSnapshot,
  ClassAllocationOutput,
  DerivedCapTableResult,
  DlomModel,
  GateCheckItem,
  GateCheckResult,
  OpmBreakpoint,
  PwermScenario,
  Structured409aReportContent,
  ValAllocation,
  ValApproach,
  ValComp,
  ValDlom,
  ValInputs,
} from './equityTypes';
import { diffDaysIso } from './equityEngine';

export const ENGINE_VERSION = 'unsaid-409a-deterministic-v1.0.0';

export function normCdf(x: number): number {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x) / Math.sqrt(2);
  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t) * Math.exp(-absX * absX);

  return 0.5 * (1.0 + sign * y);
}

export function blackScholesCall(
  S: number,
  K: number,
  T: number,
  r: number,
  sigma: number,
  q = 0
): number {
  if (S <= 0) return 0;
  if (K <= 0) return S * Math.exp(-q * T);
  if (T <= 0 || sigma <= 0) {
    return Math.max(0, S * Math.exp(-q * T) - K * Math.exp(-r * T));
  }
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  return S * Math.exp(-q * T) * normCdf(d1) - K * Math.exp(-r * T) * normCdf(d2);
}

export function runGateCheck(params: {
  company: CapCompany;
  classes: CapSecurityClass[];
  securities: CapSecurity[];
  qi: CapQualifiedIndividual | undefined;
  qiName: string;
  noCic90d: boolean;
  noIpo180d: boolean;
  valuationDate: string;
}): GateCheckResult {
  const startDate = params.company.predecessor_start_date || params.company.incorp_date;
  const ageDays = diffDaysIso(startDate, params.valuationDate);
  const ageYears = ageDays / 365.25;
  const under10Years = ageDays >= 0 && ageYears < 10;
  const noTradedClass = !params.company.has_traded_class;
  const hasPutCall = params.classes.some((c) => c.has_put_call_redemption);

  const qiValid =
    Boolean(params.qi) &&
    (params.qi?.years_experience || 0) >= 5 &&
    Boolean(params.qi?.cv_document_id) &&
    Boolean(params.qi?.board_determination_doc_id) &&
    diffDaysIso(params.qi!.board_determined_at, params.valuationDate) <= 365;

  const items: GateCheckItem[] = [
    {
      key: 'age_under_10y',
      label: 'Issuer age < 10 years (incl. predecessor)',
      passed: under10Years,
      detail: `Operating ${ageYears.toFixed(2)} yrs since ${startDate} (< 10.00 yrs required).`,
    },
    {
      key: 'no_traded_class',
      label: 'No publicly traded security class',
      passed: noTradedClass,
      detail: noTradedClass
        ? 'No equity class traded on an established securities market.'
        : 'Disqualified: traded security class detected.',
    },
    {
      key: 'put_call_scan',
      label: 'No disqualifying put/call redemption rights',
      passed: !hasPutCall,
      detail: !hasPutCall
        ? 'Class & award terms scanned — no mandatory put/call features.'
        : 'Disqualified: mandatory put/call feature detected.',
    },
    {
      key: 'exit_anticipation',
      label: 'No anticipated CIC ≤ 90d or IPO ≤ 180d',
      passed: params.noCic90d && params.noIpo180d,
      detail:
        params.noCic90d && params.noIpo180d
          ? 'Board attestation verified: no CIC ≤ 90 days and no IPO ≤ 180 days.'
          : 'Disqualified: imminent CIC or IPO anticipated.',
    },
    {
      key: 'qualified_individual',
      label: 'Qualified Individual (≥ 5 yrs) & Board determination on file',
      passed: qiValid,
      detail: qiValid
        ? `${params.qiName} (${params.qi!.years_experience} yrs experience; determined ${params.qi!.board_determined_at}).`
        : 'Missing or stale Qualified Individual determination (< 5 yrs or > 12 mo old).',
    },
  ];

  return {
    eligible: items.every((i) => i.passed),
    checked_at: params.valuationDate,
    items,
  };
}

export function runOpmAllocation(params: {
  requestId: string;
  concludedEv: number;
  equityValue: number;
  classes: CapSecurityClass[];
  grants: CapGrant[];
  derivedCapTable: DerivedCapTableResult;
  volatility: number;
  timeToLiquidityYrs: number;
  riskFreeRate: number;
  dividendYield: number;
}): ValAllocation {
  const {
    requestId,
    concludedEv,
    equityValue,
    classes,
    grants,
    derivedCapTable,
    volatility,
    timeToLiquidityYrs,
    riskFreeRate,
    dividendYield,
  } = params;

  const classShareMap = new Map<string, number>();
  for (const cs of derivedCapTable.class_summaries) {
    classShareMap.set(cs.class_id, cs.issued_shares);
  }

  const commonClass = classes.find((c) => c.class_type === 'common') || classes[0];
  const commonShares = classShareMap.get(commonClass.id) || 0;

  const preferredClasses = classes
    .filter((c) => c.class_type === 'preferred' && (classShareMap.get(c.id) || 0) > 0)
    .sort((a, b) => a.seniority_rank - b.seniority_rank);

  const optionBucketsMap = new Map<number, number>();
  for (const g of grants) {
    const holderRows = derivedCapTable.rows.filter(
      (r) => r.stakeholder_id === g.stakeholder_id && r.options_granted > 0
    );
    if (holderRows.length === 0) continue;
    optionBucketsMap.set(
      g.exercise_price,
      (optionBucketsMap.get(g.exercise_price) || 0) + g.quantity
    );
  }
  const rawOptionSum = Array.from(optionBucketsMap.values()).reduce((a, b) => a + b, 0);
  if (rawOptionSum !== derivedCapTable.total_options_outstanding && rawOptionSum > 0) {
    const scale = derivedCapTable.total_options_outstanding / rawOptionSum;
    for (const [k, v] of optionBucketsMap.entries()) {
      optionBucketsMap.set(k, v * scale);
    }
  }
  const optionStrikes = Array.from(optionBucketsMap.entries())
    .filter(([, qty]) => qty > 0)
    .sort((a, b) => a[0] - b[0]);

  const bucketDefs: { id: string; label: string; shares: number }[] = [
    ...preferredClasses.map((p) => ({
      id: p.id,
      label: p.name,
      shares: classShareMap.get(p.id) || 0,
    })),
    { id: commonClass.id, label: commonClass.name, shares: commonShares },
    ...optionStrikes.map(([strike, qty], idx) => ({
      id: `opt-${idx}-${strike.toFixed(4)}`,
      label: `Options @ $${strike.toFixed(2)}`,
      shares: qty,
    })),
  ];

  function waterfallPayoutAt(exitValue: number): Record<string, number> {
    const payouts: Record<string, number> = {};
    for (const b of bucketDefs) payouts[b.id] = 0;
    if (exitValue <= 0) return payouts;

    const convertedSet = new Set<string>();
    const sortedByConvPrice = [...preferredClasses].sort((a, b) => {
      const pa =
        (a.price_per_share_original * a.liquidation_preference_multiple) /
        Math.max(0.0001, a.conversion_ratio);
      const pb =
        (b.price_per_share_original * b.liquidation_preference_multiple) /
        Math.max(0.0001, b.conversion_ratio);
      return pa - pb;
    });

    const evalWithConversions = (convIds: Set<string>) => {
      const res: Record<string, number> = {};
      for (const b of bucketDefs) res[b.id] = 0;
      let remaining = exitValue;

      for (const p of preferredClasses) {
        if (convIds.has(p.id)) continue;
        const sh = classShareMap.get(p.id) || 0;
        const prefClaim = sh * p.price_per_share_original * p.liquidation_preference_multiple;
        const paid = Math.min(remaining, prefClaim);
        res[p.id] += paid;
        remaining -= paid;
      }

      if (remaining <= 0) return { res, perCommon: 0 };

      let low = 0;
      let high = Math.max(10, exitValue / Math.max(1, commonShares) + 100);
      for (let iter = 0; iter < 50; iter++) {
        const mid = 0.5 * (low + high);
        let residualClaimed = commonShares * mid;

        for (const p of preferredClasses) {
          const sh = classShareMap.get(p.id) || 0;
          const convShares = sh * p.conversion_ratio;
          if (convIds.has(p.id)) {
            residualClaimed += convShares * mid;
          } else if (p.participating) {
            const prefPaid = res[p.id];
            const uncappedAdd = convShares * mid;
            if (p.participation_cap_multiple && p.participation_cap_multiple > 0) {
              const maxTotal = sh * p.price_per_share_original * p.participation_cap_multiple;
              residualClaimed += Math.max(0, Math.min(uncappedAdd, maxTotal - prefPaid));
            } else {
              residualClaimed += uncappedAdd;
            }
          }
        }

        for (const [strike, qty] of optionStrikes) {
          if (mid > strike) residualClaimed += qty * (mid - strike);
        }

        if (residualClaimed > remaining) high = mid;
        else low = mid;
      }

      const perCommon = 0.5 * (low + high);
      res[commonClass.id] += commonShares * perCommon;
      for (const p of preferredClasses) {
        const sh = classShareMap.get(p.id) || 0;
        const convShares = sh * p.conversion_ratio;
        if (convIds.has(p.id)) {
          res[p.id] += convShares * perCommon;
        } else if (p.participating) {
          const prefPaid = res[p.id];
          const uncappedAdd = convShares * perCommon;
          if (p.participation_cap_multiple && p.participation_cap_multiple > 0) {
            const maxTotal = sh * p.price_per_share_original * p.participation_cap_multiple;
            res[p.id] += Math.max(0, Math.min(uncappedAdd, maxTotal - prefPaid));
          } else {
            res[p.id] += uncappedAdd;
          }
        }
      }

      optionStrikes.forEach(([strike, qty], idx) => {
        const bucketId = `opt-${idx}-${strike.toFixed(4)}`;
        if (perCommon > strike) res[bucketId] += qty * (perCommon - strike);
      });

      return { res, perCommon };
    };

    for (const p of sortedByConvPrice) {
      const currentRun = evalWithConversions(convertedSet);
      const testSet = new Set(convertedSet);
      testSet.add(p.id);
      const nextRun = evalWithConversions(testSet);
      if (nextRun.res[p.id] > currentRun.res[p.id] + 0.01) {
        convertedSet.add(p.id);
      }
    }

    return evalWithConversions(convertedSet).res;
  }

  const candidatePoints = new Set<number>([0]);
  const pointReasons = new Map<number, string>();
  pointReasons.set(0, 'Zero equity baseline');

  let cumLiqPref = 0;
  for (const p of preferredClasses) {
    const sh = classShareMap.get(p.id) || 0;
    const pref = sh * p.price_per_share_original * p.liquidation_preference_multiple;
    if (pref > 0) {
      cumLiqPref += pref;
      const rounded = Math.round(cumLiqPref * 100) / 100;
      candidatePoints.add(rounded);
      pointReasons.set(rounded, `${p.name} liquidation preference ($${(pref / 1e6).toFixed(2)}M)`);
    }
  }

  for (const [strike] of optionStrikes) {
    if (strike <= 0) continue;
    let lo = cumLiqPref;
    let hi = cumLiqPref + strike * derivedCapTable.total_fd_shares * 2 + 1_000_000;
    for (let i = 0; i < 45; i++) {
      const mid = 0.5 * (lo + hi);
      const pay = waterfallPayoutAt(mid);
      const commonPps = commonShares > 0 ? pay[commonClass.id] / commonShares : 0;
      if (commonPps >= strike) hi = mid;
      else lo = mid;
    }
    const kOpt = Math.round(0.5 * (lo + hi) * 100) / 100;
    if (kOpt > 0) {
      candidatePoints.add(kOpt);
      pointReasons.set(kOpt, `Option tranche @ $${strike.toFixed(2)} enters the money`);
    }
  }

  for (const p of preferredClasses) {
    const targetCommonPps =
      (p.price_per_share_original * p.liquidation_preference_multiple) /
      Math.max(0.0001, p.conversion_ratio);
    let lo = cumLiqPref;
    let hi = cumLiqPref + targetCommonPps * derivedCapTable.total_fd_shares * 2 + 5_000_000;
    for (let i = 0; i < 45; i++) {
      const mid = 0.5 * (lo + hi);
      const pay = waterfallPayoutAt(mid);
      const commonPps = commonShares > 0 ? pay[commonClass.id] / commonShares : 0;
      if (commonPps >= targetCommonPps) hi = mid;
      else lo = mid;
    }
    const kConv = Math.round(0.5 * (lo + hi) * 100) / 100;
    if (kConv > cumLiqPref + 1) {
      candidatePoints.add(kConv);
      pointReasons.set(
        kConv,
        `${p.name} converts to Common ($${targetCommonPps.toFixed(2)}/sh threshold)`
      );
    }
  }

  const sortedRaw = Array.from(candidatePoints).sort((a, b) => a - b);
  const K: number[] = [];
  for (const pt of sortedRaw) {
    if (K.length === 0 || pt - K[K.length - 1] > 10) K.push(pt);
  }

  const allocatedTotals: Record<string, number> = {};
  for (const b of bucketDefs) allocatedTotals[b.id] = 0;

  const breakpoints: OpmBreakpoint[] = [];

  for (let i = 0; i < K.length; i++) {
    const kStart = K[i];
    const kEnd = i + 1 < K.length ? K[i + 1] : null;

    const callStart = blackScholesCall(
      equityValue,
      kStart,
      timeToLiquidityYrs,
      riskFreeRate,
      volatility,
      dividendYield
    );
    const callEnd =
      kEnd !== null
        ? blackScholesCall(
            equityValue,
            kEnd,
            timeToLiquidityYrs,
            riskFreeRate,
            volatility,
            dividendYield
          )
        : 0;

    const trancheValue = Math.max(0, callStart - callEnd);
    const probeDelta = kEnd !== null ? Math.max(100, (kEnd - kStart) * 0.5) : 10_000_000;
    const payA = waterfallPayoutAt(kStart + 1);
    const payB = waterfallPayoutAt(kStart + 1 + probeDelta);

    const participations: Record<string, number> = {};
    let sumMarginal = 0;
    for (const b of bucketDefs) {
      const diff = Math.max(0, payB[b.id] - payA[b.id]);
      participations[b.id] = diff;
      sumMarginal += diff;
    }

    for (const b of bucketDefs) {
      const share = sumMarginal > 0 ? participations[b.id] / sumMarginal : 0;
      participations[b.id] = Number((share * 100).toFixed(2));
      allocatedTotals[b.id] += trancheValue * share;
    }

    const desc =
      kEnd !== null
        ? pointReasons.get(kEnd) ||
          `Tranche $${(kStart / 1e6).toFixed(2)}M – $${(kEnd / 1e6).toFixed(2)}M`
        : 'Residual upside (all classes converted & ITM)';

    breakpoints.push({
      index: i + 1,
      from_value: kStart,
      to_value: kEnd,
      description: desc,
      call_value_start: Number(callStart.toFixed(2)),
      call_value_end: Number(callEnd.toFixed(2)),
      tranche_value: Number(trancheValue.toFixed(2)),
      participations,
    });
  }

  const perClassValue: ClassAllocationOutput[] = bucketDefs.map((b) => {
    const val = allocatedTotals[b.id] || 0;
    const pps = b.shares > 0 ? val / b.shares : 0;
    return {
      bucket_id: b.id,
      label: b.label,
      shares: b.shares,
      total_allocated_value: Number(val.toFixed(2)),
      per_share_value: Number(pps.toFixed(4)),
    };
  });

  const commonOut = perClassValue.find((c) => c.bucket_id === commonClass.id);
  const commonPreDlom = commonOut ? commonOut.per_share_value : 0;

  return {
    id: `alloc-${requestId}`,
    request_id: requestId,
    method: 'opm',
    breakpoints,
    volatility,
    time_to_liquidity_yrs: timeToLiquidityYrs,
    risk_free_rate: riskFreeRate,
    dividend_yield: dividendYield,
    concluded_enterprise_value: Number(concludedEv.toFixed(2)),
    equity_value_in: Number(equityValue.toFixed(2)),
    per_class_value: perClassValue,
    common_per_share_pre_dlom: Number(commonPreDlom.toFixed(4)),
  };
}

export function runAllocationVariant(params: {
  requestId: string;
  method: AllocationMethod;
  concludedEv: number;
  equityValue: number;
  classes: CapSecurityClass[];
  grants: CapGrant[];
  derivedCapTable: DerivedCapTableResult;
  volatility: number;
  timeToLiquidityYrs: number;
  riskFreeRate: number;
  dividendYield: number;
  pwermScenarios?: PwermScenario[];
}): ValAllocation {
  if (params.method === 'opm') return runOpmAllocation(params);

  if (params.method === 'cvm') {
    const cvmRun = runOpmAllocation({
      ...params,
      timeToLiquidityYrs: 0.001,
      volatility: 0.01,
    });
    return { ...cvmRun, method: 'cvm' };
  }

  const scenarios: PwermScenario[] =
    params.pwermScenarios && params.pwermScenarios.length > 0
      ? params.pwermScenarios
      : [
          {
            name: 'High-Growth M&A / IPO',
            exit_type: 'M&A',
            exit_equity_value: params.equityValue * 2.4,
            probability_pct: 30,
            time_yrs: 3.0,
            discount_rate: 0.25,
          },
          {
            name: 'Base Case Stay Private (OPM)',
            exit_type: 'Stay Private',
            exit_equity_value: params.equityValue * 1.15,
            probability_pct: 50,
            time_yrs: params.timeToLiquidityYrs,
            discount_rate: 0.22,
          },
          {
            name: 'Downside Liquidation',
            exit_type: 'Liquidation',
            exit_equity_value: params.equityValue * 0.35,
            probability_pct: 20,
            time_yrs: 1.5,
            discount_rate: 0.20,
          },
        ];

  const baseOpm = runOpmAllocation(params);
  const weightedMap = new Map<string, number>();

  for (const sc of scenarios) {
    const prob = sc.probability_pct / 100;
    const pvFactor = Math.pow(1 + sc.discount_rate, -sc.time_yrs);
    const subRun = runOpmAllocation({
      ...params,
      equityValue: sc.exit_equity_value,
      timeToLiquidityYrs:
        params.method === 'hybrid' && sc.exit_type === 'Stay Private' ? sc.time_yrs : 0.001,
      volatility:
        params.method === 'hybrid' && sc.exit_type === 'Stay Private'
          ? params.volatility
          : 0.01,
    });

    for (const cls of subRun.per_class_value) {
      const discounted =
        params.method === 'hybrid' && sc.exit_type === 'Stay Private'
          ? cls.total_allocated_value
          : cls.total_allocated_value * pvFactor;
      weightedMap.set(
        cls.bucket_id,
        (weightedMap.get(cls.bucket_id) || 0) + prob * discounted
      );
    }
  }

  const perClassValue: ClassAllocationOutput[] = baseOpm.per_class_value.map((c) => {
    const val = weightedMap.get(c.bucket_id) || 0;
    const pps = c.shares > 0 ? val / c.shares : 0;
    return {
      ...c,
      total_allocated_value: Number(val.toFixed(2)),
      per_share_value: Number(pps.toFixed(4)),
    };
  });

  const commonClass =
    params.classes.find((c) => c.class_type === 'common') || params.classes[0];
  const commonOut = perClassValue.find((c) => c.bucket_id === commonClass.id);

  return {
    ...baseOpm,
    method: params.method,
    pwerm_scenarios: scenarios,
    per_class_value: perClassValue,
    common_per_share_pre_dlom: Number((commonOut?.per_share_value || 0).toFixed(4)),
  };
}

export function solveBacksolveEquityValue(params: {
  targetClassId: string;
  targetPps: number;
  classes: CapSecurityClass[];
  grants: CapGrant[];
  derivedCapTable: DerivedCapTableResult;
  volatility: number;
  timeToLiquidityYrs: number;
  riskFreeRate: number;
  dividendYield: number;
}): { implied_equity_value: number; achieved_pps: number } {
  let low = 10_000;
  let high = Math.max(50_000_000, params.targetPps * params.derivedCapTable.total_fd_shares * 4);

  for (let iter = 0; iter < 60; iter++) {
    const mid = 0.5 * (low + high);
    const run = runOpmAllocation({
      requestId: 'backsolve-probe',
      concludedEv: mid,
      equityValue: mid,
      classes: params.classes,
      grants: params.grants,
      derivedCapTable: params.derivedCapTable,
      volatility: params.volatility,
      timeToLiquidityYrs: params.timeToLiquidityYrs,
      riskFreeRate: params.riskFreeRate,
      dividendYield: params.dividendYield,
    });
    const clsOut = run.per_class_value.find((c) => c.bucket_id === params.targetClassId);
    const pps = clsOut ? clsOut.per_share_value : 0;
    if (pps > params.targetPps) high = mid;
    else low = mid;
  }

  const solvedEquity = 0.5 * (low + high);
  const finalCheck = runOpmAllocation({
    requestId: 'backsolve-final',
    concludedEv: solvedEquity,
    equityValue: solvedEquity,
    classes: params.classes,
    grants: params.grants,
    derivedCapTable: params.derivedCapTable,
    volatility: params.volatility,
    timeToLiquidityYrs: params.timeToLiquidityYrs,
    riskFreeRate: params.riskFreeRate,
    dividendYield: params.dividendYield,
  });
  const achieved =
    finalCheck.per_class_value.find((c) => c.bucket_id === params.targetClassId)
      ?.per_share_value || 0;

  return {
    implied_equity_value: Number(solvedEquity.toFixed(2)),
    achieved_pps: Number(achieved.toFixed(4)),
  };
}

export function evaluateValuationApproaches(params: {
  requestId: string;
  inputs: ValInputs;
  comps: ValComp[];
  existingApproaches: ValApproach[];
  classes: CapSecurityClass[];
  grants: CapGrant[];
  derivedCapTable: DerivedCapTableResult;
  timeToLiquidityYrs: number;
}): {
  approaches: ValApproach[];
  concluded_ev: number;
  concluded_equity_value: number;
  median_volatility: number;
  median_beta: number;
} {
  const { inputs, comps } = params;

  const median = (arr: number[], fallback: number) => {
    if (arr.length === 0) return fallback;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1 ? sorted[mid] : 0.5 * (sorted[mid - 1] + sorted[mid]);
  };

  const medVol = median(
    comps.map((c) => c.volatility),
    0.65
  );
  const medBeta = median(
    comps.map((c) => c.beta),
    1.35
  );
  const medEvRev = median(
    comps.map((c) => c.ev_rev_multiple),
    4.5
  );

  const netAssetEv = Math.max(
    0,
    inputs.adjusted_book_assets - inputs.total_liabilities - inputs.cash + inputs.debt
  );

  const discountRate =
    inputs.dcf_risk_free_rate +
    medBeta * inputs.dcf_erp +
    inputs.dcf_size_premium +
    inputs.dcf_company_specific_risk;

  const calcDcfEv = (rDisc: number, termParam: number) => {
    const fcfs = inputs.projected_fcfs;
    if (fcfs.length === 0) return 0;
    let pvSum = 0;
    fcfs.forEach((p, idx) => {
      pvSum += p.fcf / Math.pow(1 + rDisc, idx + 1);
    });
    const last = fcfs[fcfs.length - 1];
    const terminalVal =
      inputs.dcf_terminal_method === 'gordon_growth'
        ? (last.fcf * (1 + Math.min(termParam, rDisc - 0.01))) /
          Math.max(0.01, rDisc - Math.min(termParam, rDisc - 0.01))
        : last.revenue * termParam;
    const pvTerminal = terminalVal / Math.pow(1 + rDisc, fcfs.length);
    return Math.max(0, pvSum + pvTerminal);
  };

  const baseTermParam =
    inputs.dcf_terminal_method === 'gordon_growth'
      ? inputs.dcf_terminal_growth
      : inputs.dcf_exit_ev_rev_multiple;

  const dcfEv = calcDcfEv(discountRate, baseTermParam);
  const sensitivityGrid = [-0.1, 0, 0.1].map((dShift) => {
    const rAdj = discountRate * (1 + dShift);
    return {
      discount_rate_pct: Number((rAdj * 100).toFixed(2)),
      cols: [-0.1, 0, 0.1].map((tShift) => {
        const tAdj = baseTermParam * (1 + tShift);
        return {
          terminal_param: Number(tAdj.toFixed(4)),
          ev: Math.round(calcDcfEv(rAdj, tAdj)),
        };
      }),
    };
  });

  const adjustedMultiple = medEvRev * (1 + inputs.guideline_size_growth_adj_pct);
  const subjectRev = inputs.ntm_revenue > 0 ? inputs.ntm_revenue : inputs.ltm_revenue;
  const marketGuidelineEv = Math.max(0, subjectRev * adjustedMultiple);

  let backsolveEv = 0;
  let backsolveEquity = 0;
  const targetCls =
    params.classes.find((c) => c.id === inputs.backsolve_class_id) ||
    params.classes.find((c) => c.class_type === 'preferred');

  if (targetCls && targetCls.price_per_share_original > 0) {
    const solved = solveBacksolveEquityValue({
      targetClassId: targetCls.id,
      targetPps: targetCls.price_per_share_original,
      classes: params.classes,
      grants: params.grants,
      derivedCapTable: params.derivedCapTable,
      volatility: medVol,
      timeToLiquidityYrs: params.timeToLiquidityYrs,
      riskFreeRate: inputs.dcf_risk_free_rate,
      dividendYield: 0,
    });
    backsolveEquity = solved.implied_equity_value;
    backsolveEv = Math.max(0, backsolveEquity - inputs.cash + inputs.debt);
  }

  const findWeight = (method: string, defaultWeight: number, defaultRationale: string) => {
    const found = params.existingApproaches.find((a) => a.method === method);
    if (found) {
      return {
        weight_pct: found.rejected ? 0 : found.weight_pct,
        rejected: found.rejected || found.weight_pct === 0,
        rationale: found.rationale,
      };
    }
    return {
      weight_pct: defaultWeight,
      rejected: defaultWeight === 0,
      rationale: defaultRationale,
    };
  };

  const wAsset = findWeight(
    'asset',
    0,
    'Asset approach weighted 0% — going-concern technology/commerce business.'
  );
  const wDcf = findWeight(
    'dcf',
    25,
    `Discounted cash flow model at ${(discountRate * 100).toFixed(1)}% discount rate.`
  );
  const wMarket = findWeight(
    'market_guideline',
    25,
    `Median guideline EV/Revenue (${medEvRev.toFixed(2)}x) adjusted ${(
      inputs.guideline_size_growth_adj_pct * 100
    ).toFixed(0)}% for scale.`
  );
  const wBacksolve = findWeight(
    'backsolve',
    50,
    targetCls
      ? `OPM bisection backsolve anchored to ${targetCls.name} round at $${targetCls.price_per_share_original.toFixed(2)}/sh.`
      : 'No recent arm’s-length preferred round within 12 months.'
  );

  const builtApproaches: ValApproach[] = [
    {
      id: `app-asset-${params.requestId}`,
      request_id: params.requestId,
      method: 'asset',
      enterprise_value_result: Number(netAssetEv.toFixed(2)),
      weight_pct: wAsset.weight_pct,
      rejected: wAsset.rejected,
      rationale: wAsset.rationale,
      inputs_jsonb: {
        adjusted_book_assets: inputs.adjusted_book_assets,
        total_liabilities: inputs.total_liabilities,
      },
    },
    {
      id: `app-dcf-${params.requestId}`,
      request_id: params.requestId,
      method: 'dcf',
      enterprise_value_result: Number(dcfEv.toFixed(2)),
      weight_pct: wDcf.weight_pct,
      rejected: wDcf.rejected,
      rationale: wDcf.rationale,
      inputs_jsonb: {
        discount_rate_pct: Number((discountRate * 100).toFixed(2)),
        terminal_method: inputs.dcf_terminal_method,
        sensitivity_grid: sensitivityGrid,
      },
    },
    {
      id: `app-mkt-${params.requestId}`,
      request_id: params.requestId,
      method: 'market_guideline',
      enterprise_value_result: Number(marketGuidelineEv.toFixed(2)),
      weight_pct: wMarket.weight_pct,
      rejected: wMarket.rejected,
      rationale: wMarket.rationale,
      inputs_jsonb: {
        median_ev_rev: Number(medEvRev.toFixed(2)),
        size_growth_adj_pct: inputs.guideline_size_growth_adj_pct,
        adjusted_multiple: Number(adjustedMultiple.toFixed(2)),
        subject_revenue: subjectRev,
      },
    },
    {
      id: `app-backsolve-${params.requestId}`,
      request_id: params.requestId,
      method: 'backsolve',
      enterprise_value_result: Number(backsolveEv.toFixed(2)),
      weight_pct: wBacksolve.weight_pct,
      rejected: wBacksolve.rejected,
      rationale: wBacksolve.rationale,
      inputs_jsonb: {
        target_class: targetCls?.name || null,
        target_pps: targetCls?.price_per_share_original || null,
        solved_equity_value: backsolveEquity,
      },
    },
  ];

  const totalWeight = builtApproaches.reduce((s, a) => s + a.weight_pct, 0);
  const normFactor = totalWeight > 0 ? 100 / totalWeight : 0;

  let concludedEv = 0;
  for (const app of builtApproaches) {
    concludedEv += app.enterprise_value_result * ((app.weight_pct * normFactor) / 100);
  }
  const concludedEquity = Math.max(0, concludedEv + inputs.cash - inputs.debt);

  return {
    approaches: builtApproaches,
    concluded_ev: Number(concludedEv.toFixed(2)),
    concluded_equity_value: Number(concludedEquity.toFixed(2)),
    median_volatility: Number(medVol.toFixed(4)),
    median_beta: Number(medBeta.toFixed(4)),
  };
}

export function computeFinnertyDlomPct(sigma: number, T: number, q = 0): number {
  if (sigma <= 0 || T <= 0) return 0;
  const s2T = sigma * sigma * T;
  const expS2T = Math.exp(s2T);
  const num = 2 * (expS2T - s2T - 1);
  const den = Math.pow(expS2T - 1, 2);
  const v2T = Math.max(0.0001, Math.log(1 + num / Math.max(1e-9, den)));
  const halfRoot = 0.5 * Math.sqrt(v2T);
  const raw = Math.exp(-q * T) * (normCdf(halfRoot) - normCdf(-halfRoot));
  return Math.min(0.45, Math.max(0.05, raw));
}

export function computeChaffeDlomPct(
  sigma: number,
  T: number,
  r: number,
  q = 0
): number {
  if (sigma <= 0 || T <= 0) return 0;
  const callUnit = blackScholesCall(1, 1, T, r, sigma, q);
  const putUnit = callUnit - Math.exp(-q * T) + Math.exp(-r * T);
  return Math.min(0.55, Math.max(0.05, putUnit));
}

export function runDlomCalculation(params: {
  requestId: string;
  model: DlomModel;
  preDlomCommonPps: number;
  volatility: number;
  timeToLiquidityYrs: number;
  riskFreeRate: number;
  dividendYield: number;
  studyCitation?: string;
  studyPct?: number;
  rationale?: string;
}): ValDlom {
  const finnertyPct = computeFinnertyDlomPct(
    params.volatility,
    params.timeToLiquidityYrs,
    params.dividendYield
  );
  const chaffePct = computeChaffeDlomPct(
    params.volatility,
    params.timeToLiquidityYrs,
    params.riskFreeRate,
    params.dividendYield
  );

  let selectedPct = finnertyPct;
  let defaultRationale = `Finnerty (2012) average-strike Asian put model (σ=${(
    params.volatility * 100
  ).toFixed(1)}%, T=${params.timeToLiquidityYrs.toFixed(
    2
  )} yrs); Chaffe (1993) protective put cross-check = ${(chaffePct * 100).toFixed(1)}%.`;

  if (params.model === 'chaffe') {
    selectedPct = chaffePct;
    defaultRationale = `Chaffe (1993) protective ATM put model (σ=${(
      params.volatility * 100
    ).toFixed(1)}%, T=${params.timeToLiquidityYrs.toFixed(2)} yrs).`;
  } else if (
    (params.model === 'restricted_study' || params.model === 'preipo_study') &&
    params.studyPct !== undefined
  ) {
    selectedPct = Math.min(0.5, Math.max(0.05, params.studyPct));
    defaultRationale = `Empirical ${params.model.replace('_', ' ')} (${
      params.studyCitation || 'Stout Restricted Stock Study'
    }) cross-checked against Finnerty (${(finnertyPct * 100).toFixed(1)}%).`;
  }

  const postDlom = Math.max(
    0.01,
    Math.ceil(params.preDlomCommonPps * (1 - selectedPct) * 100) / 100
  );

  return {
    id: `dlom-${params.requestId}`,
    request_id: params.requestId,
    model: params.model,
    inputs_jsonb: {
      volatility: params.volatility,
      time_to_liquidity_yrs: params.timeToLiquidityYrs,
      risk_free_rate: params.riskFreeRate,
      dividend_yield: params.dividendYield,
      finnerty_dlom_pct: Number(finnertyPct.toFixed(4)),
      chaffe_dlom_pct: Number(chaffePct.toFixed(4)),
      study_citation: params.studyCitation,
      study_dlom_pct: params.studyPct,
    },
    dlom_pct: Number(selectedPct.toFixed(4)),
    rationale: params.rationale || defaultRationale,
    common_per_share_post_dlom: Number(postDlom.toFixed(4)),
  };
}

export function buildStructured409aReport(params: {
  company: CapCompany;
  valuationDate: string;
  reportDate: string;
  validUntil: string;
  purpose: string;
  gateCheck: GateCheckResult;
  qiName: string;
  qi: CapQualifiedIndividual;
  cvSha256: string;
  snapshot: CapTableSnapshot;
  inputs: ValInputs;
  approaches: ValApproach[];
  allocation: ValAllocation;
  dlom: ValDlom;
}): Structured409aReportContent {
  return {
    engine_version: ENGINE_VERSION,
    generated_at: `${params.reportDate}T12:00:00Z`,
    cover: {
      company_name: params.company.legal_name,
      valuation_date: params.valuationDate,
      report_date: params.reportDate,
      fmv_per_share_common: params.dlom.common_per_share_post_dlom,
      valid_until: params.validUntil,
      purpose: params.purpose,
    },
    eligibility: params.gateCheck,
    qualified_individual: {
      name: params.qiName,
      years_experience: params.qi.years_experience,
      qualifications_summary: params.qi.qualifications_summary,
      experience_categories: params.qi.experience_categories,
      board_determined_at: params.qi.board_determined_at,
      cv_doc_sha256: params.cvSha256,
    },
    company_profile: params.company,
    cap_snapshot: {
      snapshot_id: params.snapshot.id,
      as_of_date: params.snapshot.as_of_date,
      snapshot_hash: params.snapshot.hash,
      total_basic_shares: params.snapshot.total_basic_shares,
      total_fd_shares: params.snapshot.total_fd_shares,
      class_summaries: params.snapshot.snapshot_jsonb.class_summaries,
    },
    financial_summary: {
      cash: params.inputs.cash,
      debt: params.inputs.debt,
      ltm_revenue: params.inputs.ltm_revenue,
      ntm_revenue: params.inputs.ntm_revenue,
      ltm_ebitda: params.inputs.ltm_ebitda,
      historical: params.inputs.historical_financials,
      projected: params.inputs.projected_fcfs,
    },
    approaches: {
      items: params.approaches,
      concluded_ev: params.allocation.concluded_enterprise_value,
      concluded_equity_value: params.allocation.equity_value_in,
    },
    allocation: params.allocation,
    dlom: params.dlom,
    conclusion: {
      pre_dlom_common_pps: params.allocation.common_per_share_pre_dlom,
      dlom_pct: params.dlom.dlom_pct,
      concluded_fmv_common_pps: params.dlom.common_per_share_post_dlom,
      validity_note: `Valid until ${params.validUntil} (12 months from Valuation Date ${params.valuationDate}) or earlier occurrence of a material event.`,
    },
  };
}
