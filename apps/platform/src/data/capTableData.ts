export interface CapHolder {
  name: string;
  role: string;
  type: 'Common' | 'Preferred (Seed)' | 'Options' | 'SAFE';
  shares: number;
  pct: string;
  options: number;
  safe: number;
  invested: string;
  fds: number;
  fdsPct: string;
}

export interface CapRound {
  name: string;
  date: string;
  type: string;
  amount: string;
  preMoney: string;
  postMoney: string;
  pricePerShare: string;
  sharesIssued: string;
  lead: string;
  status: string;
}

export interface CapOptionGrant {
  holder: string;
  role: string;
  grantDate: string;
  shares: number;
  strike: string;
  vested: string;
  unvested: string;
  vesting: string;
  type: string;
  status: string;
}

export interface CapSafe {
  holder: string;
  date: string;
  amount: string;
  valuationCap: string;
  discount: string;
  mfn: string;
  proRata: string;
  status: string;
}

export interface CapValuation {
  date: string;
  type: string;
  value: string;
  provider: string;
  pricePerShare: string;
  status: string;
}

export interface CapDocItem {
  name: string;
  category: string;
  date: string;
  size: string;
  status: string;
}

export interface CapEquityEvent {
  date: string;
  event: string;
  holder: string;
  shares: string;
  price: string;
  delta: string;
  note: string;
}

export const CAP = {
  company: {
    name: 'Unsaid',
    entity: 'Delaware C-Corp',
    authorized: 12000000,
    issued: 8420000,
    parValue: 0.0001,
  },
  asOf: '2026-11-01',
  holders: [
    {
      name: 'Sarah Ahmed',
      role: 'Founder / CEO',
      type: 'Common',
      shares: 3200000,
      pct: '38.01%',
      options: 0,
      safe: 0,
      invested: '$0',
      fds: 3200000,
      fdsPct: '38.01%',
    },
    {
      name: 'Marcus Lee',
      role: 'Co-founder / CTO',
      type: 'Common',
      shares: 2100000,
      pct: '24.94%',
      options: 0,
      safe: 0,
      invested: '$0',
      fds: 2100000,
      fdsPct: '24.94%',
    },
    {
      name: 'Priya Nair',
      role: 'Founder / COO',
      type: 'Common',
      shares: 900000,
      pct: '10.69%',
      options: 0,
      safe: 0,
      invested: '$0',
      fds: 900000,
      fdsPct: '10.69%',
    },
    {
      name: 'Northwind Ventures',
      role: 'Lead Investor',
      type: 'Preferred (Seed)',
      shares: 1200000,
      pct: '14.25%',
      options: 0,
      safe: 0,
      invested: '$1,200,000',
      fds: 1200000,
      fdsPct: '14.25%',
    },
    {
      name: 'Blue Ridge Capital',
      role: 'Investor',
      type: 'Preferred (Seed)',
      shares: 400000,
      pct: '4.75%',
      options: 0,
      safe: 0,
      invested: '$400,000',
      fds: 400000,
      fdsPct: '4.75%',
    },
    {
      name: 'Orion Angels SPV',
      role: 'Investor',
      type: 'Preferred (Seed)',
      shares: 120000,
      pct: '1.43%',
      options: 0,
      safe: 0,
      invested: '$120,000',
      fds: 120000,
      fdsPct: '1.43%',
    },
    {
      name: 'Employee Option Pool',
      role: 'Pool (reserved)',
      type: 'Options',
      shares: 0,
      pct: '0.00%',
      options: 600000,
      safe: 0,
      invested: '$0',
      fds: 600000,
      fdsPct: '7.13%',
    },
    {
      name: 'SAFE — Acme Strategic',
      role: 'Convertible',
      type: 'SAFE',
      shares: 0,
      pct: '0.00%',
      options: 0,
      safe: 150000,
      invested: '$150,000',
      fds: 150000,
      fdsPct: '1.78%',
    },
  ] as CapHolder[],
  rounds: [
    {
      name: 'Friends & Family',
      date: '2024-03-15',
      type: 'SAFE',
      amount: '$250,000',
      preMoney: '$3,000,000',
      postMoney: '$3,250,000',
      pricePerShare: '$0.50',
      sharesIssued: '—',
      lead: '—',
      status: 'Closed',
    },
    {
      name: 'Seed',
      date: '2025-06-01',
      type: 'Preferred',
      amount: '$1,720,000',
      preMoney: '$8,000,000',
      postMoney: '$9,720,000',
      pricePerShare: '$1.00',
      sharesIssued: '1,720,000',
      lead: 'Northwind Ventures',
      status: 'Closed',
    },
    {
      name: 'Series A',
      date: '2026-09-30',
      type: 'Preferred',
      amount: '$6,000,000',
      preMoney: '$24,000,000',
      postMoney: '$30,000,000',
      pricePerShare: '$3.00',
      sharesIssued: '2,000,000',
      lead: 'TBD',
      status: 'In progress',
    },
  ] as CapRound[],
  optionPool: {
    total: 600000,
    granted: 412000,
    exercised: 180000,
    available: 188000,
    unvested: 232000,
    grants: [
      {
        holder: 'Dana Whitfield',
        role: 'VP Engineering',
        grantDate: '2025-02-01',
        shares: 120000,
        strike: '$0.50',
        vested: '45,000',
        unvested: '75,000',
        vesting: '4yr / 1yr cliff',
        type: 'ISO',
        status: 'Active',
      },
      {
        holder: 'Raj Patel',
        role: 'Head of Sales',
        grantDate: '2025-08-15',
        shares: 80000,
        strike: '$1.00',
        vested: '20,000',
        unvested: '60,000',
        vesting: '4yr / 1yr cliff',
        type: 'ISO',
        status: 'Active',
      },
      {
        holder: 'Elena Sokolov',
        role: 'Staff Designer',
        grantDate: '2025-11-01',
        shares: 60000,
        strike: '$1.00',
        vested: '7,500',
        unvested: '52,500',
        vesting: '4yr / 1yr cliff',
        type: 'NSO',
        status: 'Active',
      },
      {
        holder: 'Tom Becker',
        role: 'Advisor',
        grantDate: '2024-09-01',
        shares: 25000,
        strike: '$0.50',
        vested: '25,000',
        unvested: '0',
        vesting: '2yr / 6mo cliff',
        type: 'NSO',
        status: 'Fully vested',
      },
      {
        holder: 'Former — J. Kim',
        role: 'Ex-Contractor',
        grantDate: '2024-05-01',
        shares: 5000,
        strike: '$0.50',
        vested: '5,000',
        unvested: '0',
        vesting: '—',
        type: 'NSO',
        status: 'Exercised',
      },
    ] as CapOptionGrant[],
  },
  safes: [
    {
      holder: 'Acme Strategic',
      date: '2026-01-20',
      amount: '$150,000',
      valuationCap: '$10,000,000',
      discount: '20%',
      mfn: 'Yes',
      proRata: 'Yes',
      status: 'Outstanding',
    },
    {
      holder: 'Maple Angels',
      date: '2026-03-10',
      amount: '$100,000',
      valuationCap: '$12,000,000',
      discount: '—',
      mfn: 'No',
      proRata: 'No',
      status: 'Outstanding',
    },
    {
      holder: 'Friends & Family SAFE',
      date: '2024-03-15',
      amount: '$250,000',
      valuationCap: '$4,000,000',
      discount: '15%',
      mfn: 'No',
      proRata: 'No',
      status: 'Converted',
    },
  ] as CapSafe[],
  valuations: [
    {
      date: '2026-09-15',
      type: '409A',
      value: '$18,000,000',
      provider: 'Armanino LLP',
      pricePerShare: '$2.20',
      status: 'Current',
    },
    {
      date: '2025-05-20',
      type: '409A',
      value: '$7,500,000',
      provider: 'Armanino LLP',
      pricePerShare: '$0.92',
      status: 'Superseded',
    },
    {
      date: '2024-02-01',
      type: '409A',
      value: '$3,000,000',
      provider: 'Carta',
      pricePerShare: '$0.40',
      status: 'Superseded',
    },
  ] as CapValuation[],
  documents: [
    {
      name: 'Restated Certificate of Incorporation',
      category: 'Charter',
      date: '2025-06-01',
      size: '412 KB',
      status: 'Signed',
    },
    {
      name: 'Seed Preferred Stock Purchase Agreement',
      category: 'Financing',
      date: '2025-06-01',
      size: '1.2 MB',
      status: 'Signed',
    },
    {
      name: "Investors' Rights Agreement",
      category: 'Financing',
      date: '2025-06-01',
      size: '318 KB',
      status: 'Signed',
    },
    {
      name: 'Voting Agreement',
      category: 'Financing',
      date: '2025-06-01',
      size: '204 KB',
      status: 'Signed',
    },
    {
      name: '2025 Equity Incentive Plan',
      category: 'Plan',
      date: '2025-01-15',
      size: '560 KB',
      status: 'Signed',
    },
    {
      name: 'Bylaws',
      category: 'Charter',
      date: '2024-01-10',
      size: '188 KB',
      status: 'Signed',
    },
  ] as CapDocItem[],
  events: [
    {
      date: '2026-09-30',
      event: 'Series A authorized',
      holder: 'All',
      shares: '2,000,000',
      price: '$3.00',
      delta: '+2,000,000',
      note: 'Board approved',
    },
    {
      date: '2026-06-01',
      event: 'Option grant',
      holder: 'Elena Sokolov',
      shares: '60,000',
      price: '$1.00',
      delta: '+60,000',
      note: 'New hire',
    },
    {
      date: '2026-01-20',
      event: 'SAFE issued',
      holder: 'Acme Strategic',
      shares: '—',
      price: '—',
      delta: '—',
      note: '$150K cap $10M',
    },
    {
      date: '2025-11-01',
      event: 'Option exercise',
      holder: 'Tom Becker',
      shares: '25,000',
      price: '$0.50',
      delta: '+25,000 common',
      note: 'Cashless',
    },
    {
      date: '2025-06-01',
      event: 'Seed round close',
      holder: 'All',
      shares: '1,720,000',
      price: '$1.00',
      delta: '+1,720,000',
      note: '$1.72M raised',
    },
  ] as CapEquityEvent[],
};
