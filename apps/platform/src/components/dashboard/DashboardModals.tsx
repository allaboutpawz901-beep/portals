'use client';

import { useState } from 'react';
import {
  ALL_CREATE_ACTION_OPTIONS,
  AttentionQueueItem,
  SellerQueueItem,
  SetupStepItem,
} from '@/data/dashboardData';
import styles from './DashboardScreens.module.css';

export interface VisualFormatConfig {
  currencySymbol: boolean;
  parenthesesNegatives: boolean;
  decimals: 0 | 2;
  divideBy1000: boolean;
}

export interface CustomColumnItem {
  key: string;
  label: string;
  visible: boolean;
  right?: boolean;
}

export function formatVisualNumber(
  amount: number,
  cfg: VisualFormatConfig,
  forcePlain?: boolean
): string {
  if (forcePlain) {
    return amount.toLocaleString();
  }
  const scaled = cfg.divideBy1000 ? amount / 1000 : amount;
  const absVal = Math.abs(scaled);
  const formatted = absVal.toLocaleString('en-US', {
    minimumFractionDigits: cfg.decimals,
    maximumFractionDigits: cfg.decimals,
  });
  const suffix = cfg.divideBy1000 ? 'K' : '';
  const prefix = cfg.currencySymbol ? '$' : '';
  if (scaled < 0) {
    return cfg.parenthesesNegatives
      ? `(${prefix}${formatted}${suffix})`
      : `−${prefix}${formatted}${suffix}`;
  }
  return `${prefix}${formatted}${suffix}`;
}

/* 1. Company Setup Wizard Modal (§G Settings -> Company setup wizard) */
export function CompanySetupWizardModal({
  steps,
  initialStepIndex,
  onSaveSteps,
  onClose,
  onToast,
}: {
  steps: SetupStepItem[];
  initialStepIndex: number;
  onSaveSteps: (updated: SetupStepItem[]) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [draftSteps, setDraftSteps] = useState<SetupStepItem[]>(steps);
  const [activeIdx, setActiveIdx] = useState<number>(initialStepIndex);

  const current = draftSteps[activeIdx] || draftSteps[0];

  const handleFieldChange = (fieldKey: string, val: string) => {
    setDraftSteps((prev) =>
      prev.map((step, idx) =>
        idx === activeIdx
          ? {
              ...step,
              fields: step.fields.map((f) =>
                f.key === fieldKey ? { ...f, value: val } : f
              ),
            }
          : step
      )
    );
  };

  const handleCompleteStep = (andAdvance: boolean) => {
    const nextSteps = draftSteps.map((step, idx) =>
      idx === activeIdx ? { ...step, completed: true } : step
    );
    setDraftSteps(nextSteps);
    onSaveSteps(nextSteps);
    onToast(`Saved "${current.title}"`);
    if (andAdvance && activeIdx < nextSteps.length - 1) {
      setActiveIdx(activeIdx + 1);
    } else if (!andAdvance) {
      onClose();
    }
  };

  const handleToggleCompleted = () => {
    const nextSteps = draftSteps.map((step, idx) =>
      idx === activeIdx ? { ...step, completed: !step.completed } : step
    );
    setDraftSteps(nextSteps);
    onSaveSteps(nextSteps);
  };

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.modalBoxWide} onClick={(e) => e.stopPropagation()}>
        <div className={styles.overlayHeader}>
          <div>
            <div className={styles.overlayTitle}>Company Setup Wizard</div>
            <div className={styles.overlaySubtitle}>
              Business profile → Connect bank → Payments → Branding → Operating goals
            </div>
          </div>
          <button type="button" className={styles.closeIconBtn} onClick={onClose}>
            <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
          </button>
        </div>

        <div className={styles.wizardStepTabs}>
          {draftSteps.map((st, idx) => (
            <button
              key={st.id}
              type="button"
              className={`${styles.wizardTabBtn} ${
                idx === activeIdx ? styles.wizardTabBtnActive : ''
              }`}
              onClick={() => setActiveIdx(idx)}
            >
              <span className={`material-symbols-outlined ${styles.icon14}`}>
                {st.completed ? 'check_circle' : st.icon}
              </span>
              {st.stepNumber}. {st.title}
            </button>
          ))}
        </div>

        <div className={styles.overlayBody}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.panelTitle}>
                Step {current.stepNumber}: {current.title}
              </div>
              <div className={styles.panelSubtitle}>{current.subtitle}</div>
            </div>
            <button
              type="button"
              className={styles.btnGhostSm}
              onClick={handleToggleCompleted}
            >
              <span className={`material-symbols-outlined ${styles.icon14}`}>
                {current.completed ? 'Restart_alt' : 'check'}
              </span>
              {current.completed ? 'Mark incomplete' : 'Mark complete'}
            </button>
          </div>

          {current.fields.map((field) => (
            <div key={field.key} className={styles.formGroup}>
              <label className={styles.formLabel}>{field.label}</label>
              <input
                type="text"
                className={styles.formInput}
                value={field.value}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
              />
              {field.hint ? <span className={styles.formHint}>{field.hint}</span> : null}
            </div>
          ))}
        </div>

        <div className={styles.overlayFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <div className={styles.footerRightGroup}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => handleCompleteStep(false)}
            >
              Save and close
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => handleCompleteStep(true)}
            >
              {activeIdx < draftSteps.length - 1 ? 'Complete & next step' : 'Finish setup'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 2. Customize Create Actions Row Drawer (§A Create actions row: Select up to 10, Favorites + reorder) */
export function CreateActionsCustomizerDrawer({
  pinnedLabels,
  onSave,
  onClose,
  onToast,
}: {
  pinnedLabels: string[];
  onSave: (nextPinned: string[]) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [selected, setSelected] = useState<string[]>(pinnedLabels);
  const [filterMode, setFilterMode] = useState<'All' | 'Favorites'>('All');

  const toggleAction = (label: string) => {
    if (selected.includes(label)) {
      setSelected(selected.filter((l) => l !== label));
    } else {
      if (selected.length >= 10) {
        onToast('Maximum of 10 create actions reached');
        return;
      }
      setSelected([...selected, label]);
    }
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= selected.length) return;
    const copy = [...selected];
    const [moved] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, moved);
    setSelected(copy);
  };

  const visibleCatalog = ALL_CREATE_ACTION_OPTIONS.filter((opt) =>
    filterMode === 'Favorites' ? opt.favorite : true
  );

  return (
    <div className={styles.drawerScrim} onClick={onClose}>
      <div className={styles.rightDrawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.overlayHeader}>
          <div>
            <div className={styles.overlayTitle}>Customize Create Actions</div>
            <div className={styles.overlaySubtitle}>
              Select up to 10 quick-create chips ({selected.length}/10 selected)
            </div>
          </div>
          <button type="button" className={styles.closeIconBtn} onClick={onClose}>
            <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
          </button>
        </div>

        <div className={styles.overlayBody}>
          <div>
            <div className={styles.panelHeader}>
              <span className={styles.formLabel}>Pinned order on Overview</span>
              <span className={styles.badgeNeutral}>{selected.length} / 10</span>
            </div>
            <div className={styles.suggestionList}>
              {selected.map((label, idx) => {
                const meta = ALL_CREATE_ACTION_OPTIONS.find((o) => o.label === label);
                return (
                  <div key={label} className={styles.reorderItem}>
                    <div className={styles.reorderLeft}>
                      <span className={`material-symbols-outlined ${styles.icon16}`}>
                        {meta?.icon || 'add'}
                      </span>
                      <span>{label}</span>
                    </div>
                    <div className={styles.reorderArrows}>
                      <button
                        type="button"
                        className={styles.btnGhostSm}
                        disabled={idx === 0}
                        onClick={() => moveItem(idx, -1)}
                        title="Move up"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className={styles.btnGhostSm}
                        disabled={idx === selected.length - 1}
                        onClick={() => moveItem(idx, 1)}
                        title="Move down"
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        className={styles.btnGhostSm}
                        onClick={() => toggleAction(label)}
                        title="Remove"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <div className={styles.panelHeader}>
              <span className={styles.formLabel}>Available in CREATE_REGISTRY</span>
              <div className={styles.segmented}>
                <button
                  type="button"
                  className={`${styles.segBtn} ${
                    filterMode === 'All' ? styles.segBtnActive : ''
                  }`}
                  onClick={() => setFilterMode('All')}
                >
                  All
                </button>
                <button
                  type="button"
                  className={`${styles.segBtn} ${
                    filterMode === 'Favorites' ? styles.segBtnActive : ''
                  }`}
                  onClick={() => setFilterMode('Favorites')}
                >
                  Favorites ★
                </button>
              </div>
            </div>

            <div className={styles.suggestionList}>
              {visibleCatalog.map((opt) => {
                const checked = selected.includes(opt.label);
                return (
                  <label key={opt.label} className={styles.checkRowLabel}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={checked}
                      onChange={() => toggleAction(opt.label)}
                    />
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      {opt.icon}
                    </span>
                    <div>
                      <div className={styles.formLabel}>
                        {opt.label} {opt.favorite ? '★' : ''}
                      </div>
                      <div className={styles.formHint}>{opt.domainGroup}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>
        </div>

        <div className={styles.overlayFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <div className={styles.footerRightGroup}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                onSave(selected);
                onToast('Updated Create Actions bar');
                onClose();
              }}
            >
              Save and close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 3. List & Report Customizer Drawer (§A Lists: Data tab + Visual tab) */
export function ListCustomizeDrawer({
  title,
  columns,
  visualConfig,
  onSave,
  onClose,
  onToast,
}: {
  title: string;
  columns: CustomColumnItem[];
  visualConfig: VisualFormatConfig;
  onSave: (nextCols: CustomColumnItem[], nextVisual: VisualFormatConfig) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [tab, setTab] = useState<'data' | 'visual'>('data');
  const [draftCols, setDraftCols] = useState<CustomColumnItem[]>(columns);
  const [draftVis, setDraftVis] = useState<VisualFormatConfig>(visualConfig);

  const toggleCol = (key: string) => {
    setDraftCols((prev) =>
      prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c))
    );
  };

  const moveCol = (idx: number, delta: -1 | 1) => {
    const next = idx + delta;
    if (next < 0 || next >= draftCols.length) return;
    const copy = [...draftCols];
    const [moved] = copy.splice(idx, 1);
    copy.splice(next, 0, moved);
    setDraftCols(copy);
  };

  return (
    <div className={styles.drawerScrim} onClick={onClose}>
      <div className={styles.rightDrawer} onClick={(e) => e.stopPropagation()}>
        <div className={styles.overlayHeader}>
          <div>
            <div className={styles.overlayTitle}>Customize — {title}</div>
            <div className={styles.overlaySubtitle}>
              Data columns &amp; Visual number formatting
            </div>
          </div>
          <button type="button" className={styles.closeIconBtn} onClick={onClose}>
            <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
          </button>
        </div>

        <div className={styles.viewTabsBar}>
          <button
            type="button"
            className={`${styles.viewTab} ${tab === 'data' ? styles.viewTabActive : ''}`}
            onClick={() => setTab('data')}
          >
            Data (Columns &amp; Audit)
          </button>
          <button
            type="button"
            className={`${styles.viewTab} ${tab === 'visual' ? styles.viewTabActive : ''}`}
            onClick={() => setTab('visual')}
          >
            Visual (Numbers &amp; Scale)
          </button>
        </div>

        <div className={styles.overlayBody}>
          {tab === 'data' ? (
            <div className={styles.suggestionList}>
              <div className={styles.formHint}>
                Toggle or reorder columns, including audit metadata (Created by/on, Modified by/on).
              </div>
              {draftCols.map((col, idx) => (
                <div key={col.key} className={styles.reorderItem}>
                  <label className={styles.reorderLeft}>
                    <input
                      type="checkbox"
                      className={styles.checkbox}
                      checked={col.visible}
                      onChange={() => toggleCol(col.key)}
                    />
                    <span>{col.label}</span>
                  </label>
                  <div className={styles.reorderArrows}>
                    <button
                      type="button"
                      className={styles.btnGhostSm}
                      disabled={idx === 0}
                      onClick={() => moveCol(idx, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className={styles.btnGhostSm}
                      disabled={idx === draftCols.length - 1}
                      onClick={() => moveCol(idx, 1)}
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.suggestionList}>
              <label className={styles.checkRowLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={draftVis.currencySymbol}
                  onChange={(e) =>
                    setDraftVis({ ...draftVis, currencySymbol: e.target.checked })
                  }
                />
                <div>
                  <div className={styles.formLabel}>Show currency symbol ($)</div>
                  <div className={styles.formHint}>Prefix monetary columns with USD symbol</div>
                </div>
              </label>

              <label className={styles.checkRowLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={draftVis.parenthesesNegatives}
                  onChange={(e) =>
                    setDraftVis({ ...draftVis, parenthesesNegatives: e.target.checked })
                  }
                />
                <div>
                  <div className={styles.formLabel}>Format negatives as ($1,234)</div>
                  <div className={styles.formHint}>
                    Accounting parentheses instead of minus sign
                  </div>
                </div>
              </label>

              <label className={styles.checkRowLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={draftVis.decimals === 2}
                  onChange={(e) =>
                    setDraftVis({ ...draftVis, decimals: e.target.checked ? 2 : 0 })
                  }
                />
                <div>
                  <div className={styles.formLabel}>Show 2 decimal places (.00)</div>
                  <div className={styles.formHint}>Uncheck for rounded whole-dollar display</div>
                </div>
              </label>

              <label className={styles.checkRowLabel}>
                <input
                  type="checkbox"
                  className={styles.checkbox}
                  checked={draftVis.divideBy1000}
                  onChange={(e) =>
                    setDraftVis({ ...draftVis, divideBy1000: e.target.checked })
                  }
                />
                <div>
                  <div className={styles.formLabel}>Divide by 1,000 ($K)</div>
                  <div className={styles.formHint}>
                    Scale large GMV &amp; COGS figures into thousands
                  </div>
                </div>
              </label>
            </div>
          )}
        </div>

        <div className={styles.overlayFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <div className={styles.footerRightGroup}>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => {
                onSave(draftCols, draftVis);
                onToast('Applied Data & Visual settings');
                onClose();
              }}
            >
              Apply &amp; close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 4. Contractor & Seller Invite Modal (§B4 Contractor invite modal) */
export function ContractorInviteModal({
  onInvite,
  onClose,
  onToast,
}: {
  onInvite: (item: SellerQueueItem) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [name, setName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [role, setRole] = useState<SellerQueueItem['role']>('1099 Contractor');
  const [sendW9Email, setSendW9Email] = useState<boolean>(true);

  const submit = (keepOpen: boolean) => {
    const cleanName = name.trim() || 'New Creative Partner';
    const cleanEmail = email.trim() || 'partner@studio.co';
    const newItem: SellerQueueItem = {
      id: `SLR-Q${Date.now().toString().slice(-3)}`,
      seller: cleanName,
      contactEmail: cleanEmail,
      role,
      stage: sendW9Email ? 'Payouts & 1099' : 'Onboarding & KYB',
      gmvOrSpend: 0,
      takeOrMarginPct: role === 'Marketplace Seller' ? 18.0 : 100.0,
      openItems: sendW9Email
        ? 'W-9 & profile onboarding invite emailed · awaiting e-signature'
        : 'Profile draft created · pending KYB review',
      slaPct: 100.0,
      w9Status: 'Pending W-9',
      payoutHold: 0,
      updatedOn: '11/01/2026',
      status: sendW9Email ? 'Pending W-9' : 'Pending KYB',
    };
    onInvite(newItem);
    onToast(
      sendW9Email
        ? `Sent W-9 & profile invite to ${cleanName}`
        : `Added ${cleanName} to Seller Queue`
    );
    if (keepOpen) {
      setName('');
      setEmail('');
    } else {
      onClose();
    }
  };

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.overlayHeader}>
          <div>
            <div className={styles.overlayTitle}>Invite Contractor or Seller</div>
            <div className={styles.overlaySubtitle}>
              Feeds Seller Queue, Expenses &amp; Bills &gt; Contractors, and 1099-NEC filing
            </div>
          </div>
          <button type="button" className={styles.closeIconBtn} onClick={onClose}>
            <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
          </button>
        </div>

        <div className={styles.overlayBody}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Display or legal name</label>
            <input
              type="text"
              className={styles.formInput}
              placeholder="e.g., Studio Meridian LLC"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Email address</label>
            <input
              type="email"
              className={styles.formInput}
              placeholder="billing@studiomeridian.co"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Counterparty role</label>
            <select
              className={styles.formInput}
              value={role}
              onChange={(e) => setRole(e.target.value as SellerQueueItem['role'])}
            >
              <option value="1099 Contractor">1099 Contractor</option>
              <option value="Marketplace Seller">Marketplace Seller</option>
              <option value="POD Supplier">POD Supplier</option>
              <option value="Design Partner">Design Partner</option>
            </select>
          </div>

          <label className={styles.checkRowLabel}>
            <input
              type="checkbox"
              className={styles.checkbox}
              checked={sendW9Email}
              onChange={(e) => setSendW9Email(e.target.checked)}
            />
            <div>
              <div className={styles.formLabel}>
                Email counterparty to complete their profile &amp; signed W-9
              </div>
              <div className={styles.formHint}>
                Automatically tracks W-9 status and holds 1099 payouts until TIN verification
              </div>
            </div>
          </label>
        </div>

        <div className={styles.overlayFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <div className={styles.footerRightGroup}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => submit(true)}
            >
              Save and new
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => submit(false)}
            >
              Send invite &amp; close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* 5. Quick Operational Task Modal (§B1 Task [M]) */
export function QuickTaskModal({
  onAddTask,
  onClose,
  onToast,
}: {
  onAddTask: (item: AttentionQueueItem) => void;
  onClose: () => void;
  onToast: (msg: string) => void;
}) {
  const [title, setTitle] = useState<string>('');
  const [category, setCategory] =
    useState<AttentionQueueItem['category']>('Orders & SLA');
  const [entity, setEntity] = useState<string>('Acme Corp');
  const [impact, setImpact] = useState<string>('1200');

  const submit = (keepOpen: boolean) => {
    const cleanTitle = title.trim() || 'Follow up on custom rush fulfillment';
    const parsedAmt = parseFloat(impact.replace(/[^0-9.]/g, '')) || 0;
    const item: AttentionQueueItem = {
      id: `ATN-${Date.now().toString().slice(-3)}`,
      code: `TSK-${Math.floor(100 + Math.random() * 899)}`,
      title: cleanTitle,
      category,
      severity: 'Critical',
      entity: entity.trim() || 'Unsaid Ops',
      owner: 'SA',
      impactAmount: parsedAmt,
      slaRemaining: '4h 00m',
      createdOn: '11/01/2026 15:10',
      modifiedBy: 'SA',
      status: 'For review',
      targetDomain:
        category === 'Orders & SLA'
          ? 'orders'
          : category === 'Finance & Bills'
            ? 'finance'
            : category === 'Catalog & Preflight'
              ? 'catalog'
              : 'support',
      targetScreen:
        category === 'Orders & SLA'
          ? 'orders'
          : category === 'Finance & Bills'
            ? 'bills'
            : category === 'Catalog & Preflight'
              ? 'studio'
              : 'tickets',
      summary: `Manual operational task created by SA (${cleanTitle}).`,
    };
    onAddTask(item);
    onToast(`Added "${cleanTitle}" to Attention Queue`);
    if (keepOpen) {
      setTitle('');
    } else {
      onClose();
    }
  };

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div className={styles.overlayHeader}>
          <div>
            <div className={styles.overlayTitle}>New Attention Task</div>
            <div className={styles.overlaySubtitle}>
              Route an operational action directly into the Attention Queue
            </div>
          </div>
          <button type="button" className={styles.closeIconBtn} onClick={onClose}>
            <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
          </button>
        </div>

        <div className={styles.overlayBody}>
          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Action / exception summary</label>
            <input
              type="text"
              className={styles.formInput}
              placeholder="e.g., Expedite Printful PO #88420 for VIP launch"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Queue category</label>
            <select
              className={styles.formInput}
              value={category}
              onChange={(e) =>
                setCategory(e.target.value as AttentionQueueItem['category'])
              }
            >
              <option value="Orders & SLA">Orders &amp; SLA</option>
              <option value="Finance & Bills">Finance &amp; Bills</option>
              <option value="Catalog & Preflight">Catalog &amp; Preflight</option>
              <option value="Support & RMA">Support &amp; RMA</option>
            </select>
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>Counterparty / SKU reference</label>
            <input
              type="text"
              className={styles.formInput}
              value={entity}
              onChange={(e) => setEntity(e.target.value)}
            />
          </div>

          <div className={styles.formGroup}>
            <label className={styles.formLabel}>GMV / AP exposure ($)</label>
            <input
              type="text"
              className={styles.formInput}
              value={impact}
              onChange={(e) => setImpact(e.target.value)}
            />
          </div>
        </div>

        <div className={styles.overlayFooter}>
          <button type="button" className={styles.btnSecondary} onClick={onClose}>
            Cancel
          </button>
          <div className={styles.footerRightGroup}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => submit(true)}
            >
              Save and new
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => submit(false)}
            >
              Save and close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
