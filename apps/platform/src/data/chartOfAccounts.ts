// Full Chart of Accounts — per user specification.
// This is the canonical COA for the Unsaid ERP. Every account has a number,
// name, type, and description. Product drawers and transaction forms map to
// these accounts.

export type AccountType =
  | 'Current Assets'
  | 'Fixed Assets'
  | 'Other Assets'
  | 'Current Liabilities'
  | 'Long-Term Liabilities'
  | 'Equity'
  | 'Revenue'
  | 'Cost of Goods Sold'
  | 'Operating Expenses'
  | 'Overhead Costs'
  | 'Other Income'
  | 'Other Expense';

export type AccountCategory = 'Assets' | 'Liabilities' | 'Equity' | 'Revenue' | 'Expenses' | 'Other Income' | 'Other Expense';

export interface CoaAccount {
  number: string;
  name: string;
  type: AccountType;
  category: AccountCategory;
  description: string;
}

export const COA_ACCOUNTS: CoaAccount[] = [
  // ── Current Assets (100-139) ──
  { number: '101', name: 'Cash on Hand', type: 'Current Assets', category: 'Assets', description: 'Physical currency kept at your business' },
  { number: '105', name: 'Checking Account', type: 'Current Assets', category: 'Assets', description: 'Your primary business bank account' },
  { number: '110', name: 'Savings Account', type: 'Current Assets', category: 'Assets', description: 'Business savings and reserves' },
  { number: '120', name: 'Accounts Receivable', type: 'Current Assets', category: 'Assets', description: 'Money owed to you by customers' },
  { number: '125', name: 'Inventory', type: 'Current Assets', category: 'Assets', description: 'Goods held for sale (if applicable)' },
  { number: '130', name: 'Prepaid Expenses', type: 'Current Assets', category: 'Assets', description: 'Services paid for in advance (insurance, rent)' },

  // ── Fixed Assets (140-169) ──
  { number: '140', name: 'Equipment', type: 'Fixed Assets', category: 'Assets', description: 'Computers, machinery, tools' },
  { number: '145', name: 'Accumulated Depreciation - Equipment', type: 'Fixed Assets', category: 'Assets', description: 'Tracks value reduction over time' },
  { number: '150', name: 'Vehicles', type: 'Fixed Assets', category: 'Assets', description: 'Business-owned vehicles' },
  { number: '155', name: 'Accumulated Depreciation - Vehicles', type: 'Fixed Assets', category: 'Assets', description: 'Vehicle depreciation' },
  { number: '160', name: 'Furniture and Fixtures', type: 'Fixed Assets', category: 'Assets', description: 'Office furniture, display cases' },
  { number: '165', name: 'Leasehold Improvements', type: 'Fixed Assets', category: 'Assets', description: 'Improvements to rented space' },

  // ── Other Assets (170-199) ──
  { number: '170', name: 'Security Deposits', type: 'Other Assets', category: 'Assets', description: 'Deposits paid on leases or utilities' },
  { number: '175', name: 'Long-Term Investments', type: 'Other Assets', category: 'Assets', description: 'Investments held beyond one year' },
  { number: '180', name: 'Intangible Assets', type: 'Other Assets', category: 'Assets', description: 'Patents, trademarks, goodwill' },

  // ── Current Liabilities (200-249) ──
  { number: '200', name: 'Accounts Payable', type: 'Current Liabilities', category: 'Liabilities', description: 'Money you owe to vendors and suppliers' },
  { number: '210', name: 'Credit Card Payable', type: 'Current Liabilities', category: 'Liabilities', description: 'Outstanding credit card balances' },
  { number: '220', name: 'Payroll Liabilities', type: 'Current Liabilities', category: 'Liabilities', description: 'Wages and taxes owed to employees' },
  { number: '225', name: 'Sales Tax Payable', type: 'Current Liabilities', category: 'Liabilities', description: 'Collected sales tax awaiting remittance' },
  { number: '230', name: 'Short-Term Loans', type: 'Current Liabilities', category: 'Liabilities', description: 'Loans due within one year' },
  { number: '235', name: 'Current Portion of Long-Term Debt', type: 'Current Liabilities', category: 'Liabilities', description: "This year's payments on long-term loans" },
  { number: '240', name: 'Unearned Revenue', type: 'Current Liabilities', category: 'Liabilities', description: 'Payments received for services not yet delivered' },

  // ── Long-Term Liabilities (250-299) ──
  { number: '250', name: 'Long-Term Loans', type: 'Long-Term Liabilities', category: 'Liabilities', description: 'Bank loans, equipment financing beyond one year' },
  { number: '260', name: 'Mortgage Payable', type: 'Long-Term Liabilities', category: 'Liabilities', description: 'Property loans' },
  { number: '270', name: 'Lease Obligations', type: 'Long-Term Liabilities', category: 'Liabilities', description: 'Long-term lease commitments' },

  // ── Equity (300-399) ──
  { number: '300', name: "Owner's Capital", type: 'Equity', category: 'Equity', description: 'Original investment in the business' },
  { number: '305', name: "Owner's Draw", type: 'Equity', category: 'Equity', description: 'Money taken out by the owner (reduces equity)' },
  { number: '310', name: 'Retained Earnings', type: 'Equity', category: 'Equity', description: 'Accumulated profits kept in the business' },
  { number: '320', name: 'Common Stock', type: 'Equity', category: 'Equity', description: 'Shares issued (for corporations)' },
  { number: '330', name: 'Additional Paid-In Capital', type: 'Equity', category: 'Equity', description: 'Amounts above par value (corporations)' },

  // ── Revenue (400-499) ──
  { number: '400', name: 'Sales Revenue', type: 'Revenue', category: 'Revenue', description: 'Income from products sold' },
  { number: '410', name: 'Service Revenue', type: 'Revenue', category: 'Revenue', description: 'Income from services provided' },
  { number: '420', name: 'Consulting Revenue', type: 'Revenue', category: 'Revenue', description: 'Income from consulting work' },
  { number: '450', name: 'Interest Income', type: 'Revenue', category: 'Revenue', description: 'Interest earned on bank accounts' },
  { number: '460', name: 'Other Income', type: 'Revenue', category: 'Revenue', description: 'Miscellaneous income sources' },
  { number: '490', name: 'Sales Returns and Allowances', type: 'Revenue', category: 'Revenue', description: 'Reduces revenue for returns (contra-revenue)' },

  // ── Cost of Goods Sold (500-519) ──
  { number: '500', name: 'Cost of Goods Sold', type: 'Cost of Goods Sold', category: 'Expenses', description: 'Direct costs of products sold' },
  { number: '505', name: 'Direct Labor', type: 'Cost of Goods Sold', category: 'Expenses', description: 'Labor directly producing goods/services' },
  { number: '510', name: 'Materials and Supplies', type: 'Cost of Goods Sold', category: 'Expenses', description: 'Raw materials for production' },
  { number: '515', name: 'Subcontractor Costs', type: 'Cost of Goods Sold', category: 'Expenses', description: 'Outsourced production costs' },

  // ── Operating Expenses (520-649) ──
  { number: '520', name: 'Advertising and Marketing', type: 'Operating Expenses', category: 'Expenses', description: 'All marketing costs' },
  { number: '530', name: 'Bank Fees and Charges', type: 'Operating Expenses', category: 'Expenses', description: 'Bank and payment processing fees' },
  { number: '540', name: 'Depreciation Expense', type: 'Operating Expenses', category: 'Expenses', description: 'Annual equipment value reduction' },
  { number: '550', name: 'Insurance', type: 'Operating Expenses', category: 'Expenses', description: 'Business insurance premiums' },
  { number: '560', name: 'Legal and Professional Fees', type: 'Operating Expenses', category: 'Expenses', description: 'Lawyers, accountants, consultants' },
  { number: '570', name: 'Office Supplies', type: 'Operating Expenses', category: 'Expenses', description: 'Paper, pens, general supplies' },
  { number: '580', name: 'Rent Expense', type: 'Operating Expenses', category: 'Expenses', description: 'Office or facility rent' },
  { number: '590', name: 'Repairs and Maintenance', type: 'Operating Expenses', category: 'Expenses', description: 'Equipment and facility upkeep' },

  // ── Overhead Costs (600-649) ──
  { number: '600', name: 'Software and Subscriptions', type: 'Overhead Costs', category: 'Expenses', description: 'Business software costs' },
  { number: '610', name: 'Telephone and Internet', type: 'Overhead Costs', category: 'Expenses', description: 'Communication costs' },
  { number: '620', name: 'Travel and Entertainment', type: 'Overhead Costs', category: 'Expenses', description: 'Business travel expenses' },
  { number: '630', name: 'Utilities', type: 'Overhead Costs', category: 'Expenses', description: 'Electric, gas, water' },
  { number: '640', name: 'Wages and Salaries', type: 'Overhead Costs', category: 'Expenses', description: 'Employee compensation' },
  { number: '645', name: 'Payroll Taxes', type: 'Overhead Costs', category: 'Expenses', description: 'Employer portion of payroll taxes' },

  // ── Other Expenses (650-699) ──
  { number: '650', name: 'Interest Expense', type: 'Other Expense', category: 'Other Expense', description: 'Interest on loans and credit' },
  { number: '660', name: 'Income Tax Expense', type: 'Other Expense', category: 'Other Expense', description: 'Federal and state income taxes' },
  { number: '670', name: 'Miscellaneous Expense', type: 'Other Expense', category: 'Other Expense', description: 'Expenses not fitting other categories' },
];

// Account type groups for display
export const COA_TYPE_GROUPS: { type: AccountType; range: string }[] = [
  { type: 'Current Assets', range: '100-139' },
  { type: 'Fixed Assets', range: '140-169' },
  { type: 'Other Assets', range: '170-199' },
  { type: 'Current Liabilities', range: '200-249' },
  { type: 'Long-Term Liabilities', range: '250-299' },
  { type: 'Equity', range: '300-399' },
  { type: 'Revenue', range: '400-499' },
  { type: 'Cost of Goods Sold', range: '500-519' },
  { type: 'Operating Expenses', range: '520-649' },
  { type: 'Overhead Costs', range: '600-649' },
  { type: 'Other Expense', range: '650-699' },
];

// Helper: lookup account by number
export function findAccount(number: string): CoaAccount | undefined {
  return COA_ACCOUNTS.find((a) => a.number === number);
}

// Helper: get accounts by type
export function accountsByType(type: AccountType): CoaAccount[] {
  return COA_ACCOUNTS.filter((a) => a.type === type);
}

// Helper: get income accounts (for product Sales section)
export function incomeAccounts(): CoaAccount[] {
  return COA_ACCOUNTS.filter((a) => a.category === 'Revenue');
}

// Helper: get expense/COGS accounts (for product Purchasing section)
export function expenseAccounts(): CoaAccount[] {
  return COA_ACCOUNTS.filter(
    (a) => a.category === 'Expenses' || a.category === 'Other Expense'
  );
}
