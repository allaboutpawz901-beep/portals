'use client';
/**
 * CreateWizard — the wizard launched from the Catalog sidebar (move 4).
 *
 * A 3-step flow that combines catalog browsing + design selection:
 *   Step 1: Choose a category (mirrors TOP_NAV top-level categories)
 *   Step 2: Choose a blank type + color/variant
 *   Step 3: Confirm → loads the canvas with the selection + opens Design drawer
 *
 * This is the "wizard icon to start wizard" — launched from the Catalog group.
 */
import { useState } from 'react';
import { useDesignCanvas, BLANKS, SUPPLIER_COLORS } from '@/lib/designCanvasStore';
import type { DomainKey } from '@/data/shellData';

interface CreateWizardProps {
  onToast: (m: string) => void;
  onNavigate: (d: DomainKey, screenId: string) => void;
  /** Pre-selected category (set when launched from a catalog child's wizard icon) */
  initialCategory?: string;
  /** Pre-selected subcategory (set when launched from a subcategory's wizard icon) */
  initialSubcategory?: string;
}

const BLANK_OPTIONS = [
  { key: 'tee', label: 'T-shirt', icon: 'checkroom' },
  { key: 'hoodie', label: 'Hoodie', icon: 'checkroom' },
  { key: 'mug', label: 'Mug', icon: 'local_cafe' },
];

export default function CreateWizard({ onToast, onNavigate, initialCategory, initialSubcategory }: CreateWizardProps) {
  const [step, setStep] = useState<1 | 2 | 3>(initialCategory ? 2 : 1);
  const [category, setCategory] = useState<string | null>(initialCategory || null);
  const [subcategory, setSubcategory] = useState<string | null>(initialSubcategory || null);
  const [blankKey, setBlankKey] = useState<string>('tee');
  const [colorIdx, setColorIdx] = useState(0);

  // The REAL category tree nav (departments → subcategories), hydrated from
  // GET /api/v1/categories by the store. TOP_NAV stays only as the
  // pre-fetch placeholder.
  const navMap = useDesignCanvas((s) => s.navMap);

  const loadBlank = useDesignCanvas((s) => s.loadBlank);
  const selectColor = useDesignCanvas((s) => s.selectColor);
  const setSupplierCategory = useDesignCanvas((s) => s.setSupplierCategory);

  const color = SUPPLIER_COLORS[colorIdx] || SUPPLIER_COLORS[0];

  function next() {
    if (step === 1 && category) {
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }
  function back() {
    if (step > 1) setStep((s) => (s - 1) as 1 | 2 | 3);
  }
  function finish() {
    loadBlank(blankKey);
    selectColor(color);
    if (category) {
      const sub = navMap[category]?.[0] || subcategory || '';
      setSupplierCategory(category, sub);
    }
    onNavigate('design', 'new-design');
    onToast('Wizard complete — canvas loaded, Design drawer opened.');
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 text-body-sm text-on-surface-variant py-3">
        <span className="material-symbols-outlined text-[18px]">auto_fix_high</span>
        <span>Catalog</span>
        <span className="text-on-surface-variant/40">/</span>
        <span className="text-on-surface font-medium">Create wizard</span>
      </div>

      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-headline-lg">Create wizard</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Pick a category, choose a blank, and start designing
          </p>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((n) => (
          <div key={n} className="flex items-center gap-2">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-label-sm font-semibold ${
                step >= n ? 'bg-primary text-white' : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {n}
            </div>
            <span className={`text-label-md ${step >= n ? 'text-on-surface font-medium' : 'text-on-surface-variant'}`}>
              {n === 1 ? 'Category' : n === 2 ? 'Blank & variant' : 'Confirm'}
            </span>
            {n < 3 && <span className="w-8 h-px bg-surface-dim mx-1" />}
          </div>
        ))}
      </div>

      {/* Step body */}
      <div className="flex-1 bg-white rounded-xl border border-surface-dim p-6 overflow-y-auto">
        {step === 1 && (
          <>
            <h2 className="text-title-md mb-1">Choose a category</h2>
            <p className="text-body-sm text-on-surface-variant mb-4">
              The real catalog departments — the same tree as the sidebar and the top bar.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {Object.keys(navMap).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => { setCategory(c); setSubcategory(navMap[c]?.[0] ?? null); }}
                  className={`p-4 rounded-xl border text-left transition-colors ${
                    category === c
                      ? 'border-primary bg-primary-container/20'
                      : 'border-surface-dim hover:bg-surface-container-low'
                  }`}
                >
                  <span className="material-symbols-outlined text-[20px] text-on-surface-variant">
                    {c.toLowerCase().includes('home') ? 'bed'
                      : c.toLowerCase().includes('accessor') ? 'diamond'
                      : c.toLowerCase().includes('book') ? 'menu_book'
                      : c.toLowerCase().includes('card') ? 'mail'
                      : c.toLowerCase().includes('drink') ? 'local_cafe'
                      : c.toLowerCase().includes('tech') ? 'devices'
                      : c.toLowerCase().includes('game') ? 'extension'
                      : c.toLowerCase().includes('wellness') ? 'spa'
                      : c.toLowerCase().includes('wall') ? 'wall_art'
                      : c.toLowerCase().includes('keep') ? 'redeem'
                      : c.toLowerCase().includes('business') ? 'work'
                      : c.toLowerCase().includes('collection') ? 'collections_bookmark'
                      : 'checkroom'}
                  </span>
                  <div className="font-medium text-body-md mt-1">{c}</div>
                  <div className="text-[11px] text-on-surface-variant">
                    {navMap[c].length} subcategories
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h2 className="text-title-md mb-1">Choose a blank & variant</h2>
            <p className="text-body-sm text-on-surface-variant mb-4">
              Category: <b>{category}</b>
            </p>

            <div className="section-label">Blank type</div>
            <div className="grid grid-cols-3 gap-3 mb-6">
              {BLANK_OPTIONS.map((b) => (
                <button
                  key={b.key}
                  type="button"
                  onClick={() => setBlankKey(b.key)}
                  className={`p-4 rounded-xl border text-center transition-colors ${
                    blankKey === b.key
                      ? 'border-primary bg-primary-container/20'
                      : 'border-surface-dim hover:bg-surface-container-low'
                  }`}
                >
                  <span className="material-symbols-outlined text-[24px] text-on-surface-variant">{b.icon}</span>
                  <div className="font-medium text-body-md mt-1">{b.label}</div>
                </button>
              ))}
            </div>

            <div className="section-label">Color / variant</div>
            <div className="flex flex-wrap gap-2">
              {SUPPLIER_COLORS.map((c, i) => (
                <button
                  key={c.sku}
                  type="button"
                  onClick={() => setColorIdx(i)}
                  className={`w-10 h-10 rounded-full border-2 transition-colors ${
                    colorIdx === i ? 'border-on-surface' : 'border-transparent'
                  }`}
                  title={`${c.name} (${c.sku})`}
                >
                  <div className="w-full h-full rounded-full" style={{ background: c.hex }} />
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h2 className="text-title-md mb-1">Confirm</h2>
            <p className="text-body-sm text-on-surface-variant mb-4">
              Ready to load the canvas with your selection.
            </p>
            <dl className="grid grid-cols-2 gap-y-2 max-w-sm text-body-sm">
              <dt className="text-on-surface-variant">Category</dt>
              <dd className="font-medium">{category}</dd>
              <dt className="text-on-surface-variant">Blank</dt>
              <dd className="font-medium">{BLANKS[blankKey]?.name || blankKey}</dd>
              <dt className="text-on-surface-variant">Color</dt>
              <dd className="font-medium">{color.name}</dd>
            </dl>
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between mt-4">
        <button
          type="button"
          className="h-9 px-4 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
          onClick={back}
          disabled={step === 1}
        >
          Back
        </button>
        {step < 3 ? (
          <button
            type="button"
            className="h-9 px-4 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={next}
            disabled={step === 1 && !category}
          >
            Next
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        ) : (
          <button
            type="button"
            className="h-9 px-4 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1"
            onClick={finish}
          >
            <span className="material-symbols-outlined text-[16px]">palette</span>
            Start designing
          </button>
        )}
      </div>

      <style jsx>{`
        .section-label {
          font-size: 11px;
          font-weight: 700;
          color: #5a6355;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          margin-bottom: 8px;
        }
      `}</style>
    </main>
  );
}
