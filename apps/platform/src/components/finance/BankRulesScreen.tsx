'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { exportToCsv } from '@/lib/csvExport';
import styles from './BankRulesScreen.module.css';

export interface BankRuleItem {
  id: string;
  name: string;
  conditionKeyword: string;
  category: string;
  categoryClass: string;
  matchedCount: number;
  active: boolean;
}

const SAMPLE_TXNS = [
  { desc: 'STAPLES #0412', date: '10/30/2026', amt: -142.5 },
  { desc: 'STAPLES #0418', date: '10/22/2026', amt: -88.15 },
  { desc: 'STAPLES #0412', date: '10/12/2026', amt: -210.0 },
  { desc: 'STAPLES.COM', date: '09/28/2026', amt: -45.99 },
  { desc: 'ADOBE CREATIVE', date: '10/26/2026', amt: -59.99 },
  { desc: 'ADOBE SYSTEMS', date: '09/26/2026', amt: -59.99 },
  { desc: 'STRIPE PAYOUT', date: '10/28/2026', amt: 1842.6 },
  { desc: 'STRIPE FEE', date: '10/28/2026', amt: -52.11 },
  { desc: 'AWS EMEA CHARGES', date: '10/27/2026', amt: -124.88 },
  { desc: 'AWS EMEA CHARGES', date: '09/27/2026', amt: -118.44 },
  { desc: 'UBER TRIP', date: '10/15/2026', amt: -22.4 },
  { desc: 'UBER EATS', date: '10/18/2026', amt: -34.55 },
];

const INITIAL_RULES: BankRuleItem[] = [
  {
    id: 'rule-1',
    name: 'Staples → Office supplies',
    conditionKeyword: 'STAPLES',
    category: 'Office supplies',
    categoryClass: styles.pillBlue,
    matchedCount: 11,
    active: true,
  },
  {
    id: 'rule-2',
    name: 'Adobe → Software',
    conditionKeyword: 'ADOBE',
    category: 'Software',
    categoryClass: styles.pillMaroon,
    matchedCount: 6,
    active: true,
  },
  {
    id: 'rule-3',
    name: 'Stripe payouts → Stripe clearing',
    conditionKeyword: 'STRIPE',
    category: 'Stripe clearing',
    categoryClass: styles.pillGreen,
    matchedCount: 8,
    active: true,
  },
  {
    id: 'rule-4',
    name: 'AWS → Software',
    conditionKeyword: 'AWS',
    category: 'Software',
    categoryClass: styles.pillMaroon,
    matchedCount: 3,
    active: true,
  },
  {
    id: 'rule-5',
    name: 'Uber → Travel (paused)',
    conditionKeyword: 'UBER',
    category: 'Travel',
    categoryClass: styles.pillTeal,
    matchedCount: 0,
    active: false,
  },
];

export interface BankRulesScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

export default function BankRulesScreen({ onNavigate, onToast }: BankRulesScreenProps) {
  const [rules, setRules] = useState<BankRuleItem[]>(INITIAL_RULES);
  const [activeTab, setActiveTab] = useState<'all' | 'active' | 'paused'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Rule Editor Drawer
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formKeyword, setFormKeyword] = useState('');
  const [formCategory, setFormCategory] = useState('');
  const [formActive, setFormActive] = useState(true);

  // Row Menu
  const [rowMenuRuleId, setRowMenuRuleId] = useState<string | null>(null);
  const [rowMenuPos, setRowMenuPos] = useState({ top: 0, left: 0 });

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setToastMsg(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastMsg(null), 2000);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Close row menu on click outside
  useEffect(() => {
    const handleOutside = () => setRowMenuRuleId(null);
    document.addEventListener('click', handleOutside);
    return () => document.removeEventListener('click', handleOutside);
  }, []);

  // KPIs
  const totalRules = rules.length;
  const activeRules = rules.filter((r) => r.active).length;
  const pausedRules = rules.filter((r) => !r.active).length;
  const autoCategorized30d = rules.reduce((acc, r) => acc + r.matchedCount, 0);

  // Filtered rules
  const filteredRules = useMemo(() => {
    return rules.filter((r) => {
      if (activeTab === 'active' && !r.active) return false;
      if (activeTab === 'paused' && r.active) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const match =
          r.name.toLowerCase().includes(q) ||
          r.conditionKeyword.toLowerCase().includes(q) ||
          r.category.toLowerCase().includes(q);
        if (!match) return false;
      }
      return true;
    });
  }, [rules, activeTab, searchQuery]);

  // Bulk selection
  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(new Set(filteredRules.map((r) => r.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const handleToggleRow = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  // Toggle single rule active state
  const handleToggleRule = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setRules((prev) =>
      prev.map((r) => {
        if (r.id === id) {
          const nextState = !r.active;
          showToast(nextState ? 'Rule activated' : 'Rule paused');
          return { ...r, active: nextState };
        }
        return r;
      })
    );
  };

  // Open Drawer for Create
  const handleOpenCreateDrawer = () => {
    setEditingRuleId(null);
    setFormName('');
    setFormKeyword('');
    setFormCategory('');
    setFormActive(true);
    setIsDrawerOpen(true);
  };

  // Open Drawer for Edit
  const handleOpenEditDrawer = (rule: BankRuleItem) => {
    setEditingRuleId(rule.id);
    setFormName(rule.name);
    setFormKeyword(rule.conditionKeyword);
    setFormCategory(rule.category);
    setFormActive(rule.active);
    setIsDrawerOpen(true);
  };

  // Live preview matches
  const previewMatches = useMemo(() => {
    const kw = formKeyword.trim().toUpperCase();
    if (!kw) return [];
    return SAMPLE_TXNS.filter((t) => t.desc.toUpperCase().includes(kw));
  }, [formKeyword]);

  // Save Rule
  const handleSaveRule = (andClose: boolean) => {
    if (!formName.trim()) {
      showToast('Rule name is required');
      return;
    }
    if (!formKeyword.trim()) {
      showToast('Condition keyword is required');
      return;
    }
    if (!formCategory) {
      showToast('Select a category');
      return;
    }

    if (editingRuleId) {
      setRules((prev) =>
        prev.map((r) =>
          r.id === editingRuleId
            ? {
                ...r,
                name: formName.trim(),
                conditionKeyword: formKeyword.trim().toUpperCase(),
                category: formCategory,
                active: formActive,
              }
            : r
        )
      );
      showToast(`Rule "${formName}" updated`);
    } else {
      const created: BankRuleItem = {
        id: `rule-${Date.now()}`,
        name: formName.trim(),
        conditionKeyword: formKeyword.trim().toUpperCase(),
        category: formCategory,
        categoryClass: styles.pillBlue,
        matchedCount: 0,
        active: formActive,
      };
      setRules((prev) => [created, ...prev]);
      showToast(`Rule "${formName}" saved`);
    }

    if (andClose) {
      setIsDrawerOpen(false);
    } else {
      setFormName('');
      setFormKeyword('');
      setFormCategory('');
    }
  };

  return (
    <div className={styles.container}>
      {/* ═══════════ CONTEXT HEADER ═══════════ */}
      <div className={styles.contextHeader}>
        <div className={styles.breadcrumbsGroup}>
          <span className={`material-symbols-outlined ${styles.breadcrumbDomainIcon}`}>
            account_balance
          </span>
          <span className={styles.breadcrumbDomain}>Finance</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbSection}>Accounting</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbActive}>Rules</span>
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Bank rules</h1>
            <p className={styles.pageSubtitle}>
              Auto-categorize repeating transactions — when the bank description matches, apply the
              category.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => {
                const cols = [
                  { key: 'name', label: 'Rule name' },
                  { key: 'conditionKeyword', label: 'Condition keyword' },
                  { key: 'category', label: 'Category' },
                  { key: 'matchedCount', label: 'Matched count' },
                  { key: 'active', label: 'Active' },
                ];
                exportToCsv(filteredRules as unknown as Record<string, unknown>[], cols, 'bank-rules');
                showToast(`Exported ${filteredRules.length} records to CSV`);
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                download
              </span>
              Export
            </button>
            <button
              type="button"
              className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
              onClick={handleOpenCreateDrawer}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                add
              </span>
              New rule
            </button>
          </div>
        </div>

        {/* KPI Strip */}
        <div className={styles.kpiStrip}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Active rules</span>
            <div className={styles.kpiValue}>{activeRules}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Auto-categorized (30d)</span>
            <div className={styles.kpiValue}>{autoCategorized30d}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Paused</span>
            <div className={styles.kpiValue}>{pausedRules}</div>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Match rate</span>
            <div className={styles.kpiValue}>94%</div>
          </div>
        </div>

        {/* Table Card */}
        <div className={styles.tableCard}>
          {/* Tabs */}
          <div className={styles.tabsBar}>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'all' ? styles.tabBtnActive : ''}`}
              onClick={() => {
                setActiveTab('all');
                setSelectedIds(new Set());
              }}
            >
              All rules
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'active' ? styles.tabBtnActive : ''}`}
              onClick={() => {
                setActiveTab('active');
                setSelectedIds(new Set());
              }}
            >
              Active
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${activeTab === 'paused' ? styles.tabBtnActive : ''}`}
              onClick={() => {
                setActiveTab('paused');
                setSelectedIds(new Set());
              }}
            >
              Paused
            </button>
          </div>

          {/* Filter Bar */}
          <div className={styles.filterBar}>
            <div className={styles.searchInputWrap}>
              <span className={`material-symbols-outlined ${styles.searchIcon}`}>
                search
              </span>
              <input
                className={styles.searchInput}
                placeholder="Filter rules…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => showToast('Saved views panel')}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                bookmark
              </span>
              Saved views
            </button>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#5a6355' }}>
              1–{filteredRules.length} of {totalRules}
            </span>
          </div>

          {/* Bulk Bar */}
          {selectedIds.size > 0 && (
            <div className={styles.bulkBar}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{selectedIds.size} selected</span>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => {
                  setRules((prev) =>
                    prev.map((r) => (selectedIds.has(r.id) ? { ...r, active: true } : r))
                  );
                  showToast(`Activated ${selectedIds.size} rules`);
                  setSelectedIds(new Set());
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  play_arrow
                </span>
                Activate
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => {
                  setRules((prev) =>
                    prev.map((r) => (selectedIds.has(r.id) ? { ...r, active: false } : r))
                  );
                  showToast(`Paused ${selectedIds.size} rules`);
                  setSelectedIds(new Set());
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  pause
                </span>
                Pause
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => {
                  showToast(`Applied ${selectedIds.size} rules to existing bank transactions`);
                  setSelectedIds(new Set());
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  play_circle
                </span>
                Apply to existing
              </button>
              <button
                type="button"
                className={styles.bulkBtn}
                onClick={() => {
                  setRules((prev) => prev.filter((r) => !selectedIds.has(r.id)));
                  showToast(`Deleted ${selectedIds.size} rules`);
                  setSelectedIds(new Set());
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                  delete
                </span>
                Delete
              </button>
              <button
                type="button"
                style={{
                  marginLeft: 'auto',
                  color: '#ffffff',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
                onClick={() => setSelectedIds(new Set())}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  close
                </span>
              </button>
            </div>
          )}

          {/* Table */}
          <table className={styles.table}>
            <thead className={styles.thead}>
              <tr>
                <th style={{ width: 36, paddingLeft: 12 }}>
                  <input
                    type="checkbox"
                    checked={
                      filteredRules.length > 0 && selectedIds.size === filteredRules.length
                    }
                    onChange={handleSelectAll}
                    style={{ accentColor: '#0077c5' }}
                  />
                </th>
                <th>Rule name</th>
                <th>When (description)</th>
                <th>Then (category)</th>
                <th style={{ textAlign: 'right' }}>Matched (30d)</th>
                <th>Active</th>
                <th style={{ width: 36 }} />
              </tr>
            </thead>
            <tbody>
              {filteredRules.map((rule) => {
                const isSelected = selectedIds.has(rule.id);

                return (
                  <tr
                    key={rule.id}
                    className={`${styles.row} ${!rule.active ? styles.rowPaused : ''}`}
                    onClick={() => handleOpenEditDrawer(rule)}
                  >
                    <td
                      className={styles.td}
                      style={{ width: 36, paddingLeft: 12 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleRow(rule.id)}
                        style={{ accentColor: '#0077c5' }}
                      />
                    </td>
                    <td className={styles.td} style={{ fontWeight: 500 }}>
                      {rule.name}
                    </td>
                    <td className={styles.td}>
                      <span className={styles.codeBadge}>
                        contains &quot;{rule.conditionKeyword}&quot;
                      </span>
                    </td>
                    <td className={styles.td}>
                      <span className={`${styles.categoryPill} ${rule.categoryClass}`}>
                        {rule.category}
                      </span>
                    </td>
                    <td className={styles.td} style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {rule.matchedCount}
                    </td>
                    <td className={styles.td} onClick={(e) => e.stopPropagation()}>
                      <div
                        className={`${styles.switch} ${rule.active ? styles.switchOn : ''}`}
                        onClick={(e) => handleToggleRule(rule.id, e)}
                      />
                    </td>
                    <td
                      className={styles.td}
                      style={{ textAlign: 'right' }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        className={styles.headerBtn}
                        style={{ width: 28, height: 28, padding: 0, justifyContent: 'center' }}
                        onClick={(e) => {
                          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                          setRowMenuPos({
                            top: rect.bottom + 4,
                            left: Math.min(rect.right - 260, window.innerWidth - 280),
                          });
                          setRowMenuRuleId(rowMenuRuleId === rule.id ? null : rule.id);
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                          more_horiz
                        </span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </main>

      {/* Row Action Menu */}
      {rowMenuRuleId && (
        <div
          className={styles.menu}
          style={{ top: rowMenuPos.top, left: rowMenuPos.left }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={styles.menuHeader}>This rule</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const rule = rules.find((r) => r.id === rowMenuRuleId);
              if (rule) handleOpenEditDrawer(rule);
              setRowMenuRuleId(null);
            }}
          >
            <span className="material-symbols-outlined">edit</span>
            Edit rule
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const rule = rules.find((r) => r.id === rowMenuRuleId);
              if (rule) {
                const dup: BankRuleItem = {
                  ...rule,
                  id: `rule-${Date.now()}`,
                  name: `${rule.name} (Copy)`,
                };
                setRules((prev) => [dup, ...prev]);
                showToast(`Duplicated ${rule.name}`);
              }
              setRowMenuRuleId(null);
            }}
          >
            <span className="material-symbols-outlined">content_copy</span>
            Duplicate
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>Run</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              const matched = Math.floor(Math.random() * 8) + 3;
              setRules((prev) =>
                prev.map((r) =>
                  r.id === rowMenuRuleId ? { ...r, matchedCount: r.matchedCount + matched } : r
                )
              );
              showToast(`Applied to ${matched} past transactions`);
              setRowMenuRuleId(null);
            }}
          >
            <span className="material-symbols-outlined">play_circle</span>
            Apply to existing
          </button>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              showToast('Viewing matched transactions in Bank feed');
              onNavigate('finance', 'bank');
              setRowMenuRuleId(null);
            }}
          >
            <span className="material-symbols-outlined">list</span>
            View matched transactions
          </button>
          <div className={styles.menuSep} />
          <div className={styles.menuHeader}>State</div>
          <button
            type="button"
            className={styles.menuItem}
            onClick={() => {
              setRules((prev) =>
                prev.map((r) => (r.id === rowMenuRuleId ? { ...r, active: !r.active } : r))
              );
              showToast('Rule status updated');
              setRowMenuRuleId(null);
            }}
          >
            <span className="material-symbols-outlined">pause</span>
            Toggle active / pause
          </button>
          <button
            type="button"
            className={`${styles.menuItem} ${styles.menuItemDanger}`}
            onClick={() => {
              setRules((prev) => prev.filter((r) => r.id !== rowMenuRuleId));
              showToast('Rule deleted');
              setRowMenuRuleId(null);
            }}
          >
            <span className="material-symbols-outlined">delete</span>
            Delete rule
          </button>
        </div>
      )}

      {/* ═══════════ RULE EDITOR DRAWER ═══════════ */}
      <div
        className={`${styles.drawerScrim} ${isDrawerOpen ? styles.drawerScrimOpen : ''}`}
        onClick={() => setIsDrawerOpen(false)}
      />
      <aside className={`${styles.drawer} ${isDrawerOpen ? styles.drawerOpen : ''}`}>
        <div className={styles.drawerHeader}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className="material-symbols-outlined" style={{ color: '#0a6400', fontSize: 20 }}>
              tune
            </span>
            <div>
              <h2 style={{ fontSize: 16, fontWeight: 600, margin: 0 }}>
                {editingRuleId ? 'Edit rule' : 'New bank rule'}
              </h2>
              <div style={{ fontSize: 11, color: '#5a6355' }}>
                When the bank description matches, categorize
              </div>
            </div>
          </div>
          <button
            type="button"
            className={styles.headerBtn}
            style={{ width: 32, height: 32, padding: 0, justifyContent: 'center' }}
            onClick={() => setIsDrawerOpen(false)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>

        <div className={styles.drawerBody}>
          {/* Rule name */}
          <div>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 6 }}>
              Rule name
            </label>
            <input
              className={styles.condInput}
              style={{ width: '100%', height: 36 }}
              placeholder="e.g. Staples → Office supplies"
              value={formName}
              onChange={(e) => setFormName(e.target.value)}
            />
          </div>

          {/* WHEN */}
          <div style={{ borderTop: '1px solid #eeedf1', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>
                When (conditions)
              </div>
              <select className={styles.condSelect} style={{ fontSize: 11, height: 26 }}>
                <option>Match ALL conditions</option>
                <option>Match ANY condition</option>
              </select>
            </div>

            <div className={styles.condRow}>
              <span className={styles.condPrefix}>When</span>
              <select className={styles.condSelect} defaultValue="Bank description">
                <option>Bank description</option>
                <option>Payee</option>
                <option>Amount</option>
                <option>Type</option>
              </select>
              <select className={styles.condSelect} defaultValue="Contains">
                <option>Contains</option>
                <option>Does not contain</option>
                <option>Equals</option>
                <option>Starts with</option>
                <option>Ends with</option>
              </select>
              <input
                className={styles.condInput}
                placeholder="e.g. STAPLES"
                value={formKeyword}
                onChange={(e) => setFormKeyword(e.target.value)}
              />
            </div>
          </div>

          {/* THEN */}
          <div style={{ borderTop: '1px solid #eeedf1', paddingTop: 16 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355', marginBottom: 8 }}>
              Then (apply)
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6355', marginBottom: 4 }}>
                  Category
                </label>
                <select
                  className={styles.condInput}
                  style={{ width: '100%', height: 36 }}
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                >
                  <option value="">— Select category —</option>
                  <option value="Office supplies">Office supplies</option>
                  <option value="Shipping">Shipping</option>
                  <option value="Software">Software</option>
                  <option value="Advertising">Advertising</option>
                  <option value="Meals & entertainment">Meals &amp; entertainment</option>
                  <option value="Travel">Travel</option>
                  <option value="Stripe clearing">Stripe clearing</option>
                  <option value="Ask My Accountant">Ask My Accountant</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#5a6355', marginBottom: 4 }}>
                  Apply to bank account
                </label>
                <select className={styles.condInput} style={{ width: '100%', height: 36 }}>
                  <option>All accounts</option>
                  <option>Chase •9910</option>
                  <option>Visa •4421</option>
                  <option>Amex •2103</option>
                </select>
              </div>

              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={formActive}
                  onChange={(e) => setFormActive(e.target.checked)}
                  style={{ accentColor: '#0a6400' }}
                />
                Turn on rule immediately
              </label>
            </div>
          </div>

          {/* PREVIEW */}
          <div style={{ borderTop: '1px solid #eeedf1', paddingTop: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: '#5a6355' }}>
                Would have matched
              </div>
              <span style={{ fontSize: 11, color: '#5a6355' }}>
                {previewMatches.length} recent transactions
              </span>
            </div>

            <div
              style={{
                border: '1px solid #dad9dd',
                borderRadius: 8,
                overflow: 'hidden',
                backgroundColor: '#ffffff',
              }}
            >
              {previewMatches.length === 0 ? (
                <div style={{ padding: 16, textAlign: 'center', fontSize: 11, color: '#5a6355' }}>
                  {formKeyword.trim()
                    ? `No recent transactions match "${formKeyword.toUpperCase()}".`
                    : 'Enter a description keyword to preview matched transactions.'}
                </div>
              ) : (
                previewMatches.slice(0, 5).map((t, i) => (
                  <div key={i} className={styles.previewTxn}>
                    <span style={{ width: 80, color: '#5a6355' }}>{t.date}</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{t.desc}</span>
                    <span
                      style={{
                        fontWeight: 600,
                        fontVariantNumeric: 'tabular-nums',
                        color: t.amt < 0 ? '#ba1a1a' : '#006c47',
                      }}
                    >
                      {t.amt < 0 ? '−' : '+'}${Math.abs(t.amt).toFixed(2)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className={styles.drawerFooter}>
          <button
            type="button"
            className={styles.headerBtn}
            onClick={() => setIsDrawerOpen(false)}
          >
            Cancel
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={styles.headerBtn}
              onClick={() => handleSaveRule(false)}
            >
              Save and new
            </button>
            <button
              type="button"
              className={`${styles.headerBtn} ${styles.headerBtnPrimary}`}
              onClick={() => handleSaveRule(true)}
            >
              Save rule
            </button>
          </div>
        </div>
      </aside>

      {/* Toast */}
      {toastMsg && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
