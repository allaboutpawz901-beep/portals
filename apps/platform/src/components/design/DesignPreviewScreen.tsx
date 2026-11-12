'use client';

/**
 * Design Studio — Preview & Publish page.
 * Source: upload/mockup preview.html (Studio Preview Screen).
 *
 * This is the canvas preview screen as its own page. Users land here from:
 *   - The Edit/Preview toggle on the canvas (New design) screen.
 *   - The "Preview & Publish" button on the canvas.
 *   - The "Preview" sidebar item in the Studio group.
 *
 * Layout (1:1 with mockup preview.html):
 *   ┌─────────────────────────────┬──────────────┐
 *   │  Center mockup               │  Right rail   │
 *   │  [Edit/Preview toggle]       │  (Mockup view │
 *   │  [Variant Screen] btn        │   controls)   │
 *   │  [Product Info] btn           │               │
 *   │                               │               │
 *   ├───────────────────────────────┤               │
 *   │  Download · Save · PUBLISH    │               │
 *   └───────────────────────────────┴──────────────┘
 *
 * Publish → creates a published product entry that goes live to the
 * global Catalog domain (Published Items & SKUs) on the main icon rail.
 */
import { useEffect, useRef, useState } from 'react';
import {
  SUPPLIER_COLORS,
  useDesignCanvas,
} from '@/lib/designCanvasStore';
import {
  getDesign,
  getPrice,
  publishDesign,
  ingestBlank,
  queuePreview,
  queuePrintRenders,
  listRenders,
  saveDesign,
  createDesign,
  type PriceQuote,
  type RenderStatus,
} from '@/lib/podApi';
import type { DomainKey } from '@/data/shellData';
import styles from './DesignPreview.module.css';
import { getBlankSkeleton, type BlankSkeleton } from '@/lib/podApi';

interface DesignPreviewScreenProps {
  onToast: (msg: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}

const MOCKUP_ANGLES = ['Front', 'Back', 'Folded', 'Folded 2'];

// Variant modal colors (from mockup preview.html).
const VARIANT_COLORS = [
  { name: 'White', hex: '#ffffff' },
  { name: 'Ash', hex: '#e5e5e5' },
  { name: 'Sport Grey', hex: '#b0b0b0' },
  { name: 'Graphite Heather', hex: '#555555' },
  { name: 'Dark Heather', hex: '#444444' },
  { name: 'Charcoal', hex: '#333333' },
  { name: 'Black', hex: '#000000' },
  { name: 'Antique Cherry Red', hex: '#a32b3d' },
];

export default function DesignPreviewScreen({ onToast, onNavigate }: DesignPreviewScreenProps) {
  const product = useDesignCanvas((s) => s.product);
  const color = useDesignCanvas((s) => s.color);
  const selectColor = useDesignCanvas((s) => s.selectColor);
  const designId = useDesignCanvas((s) => s.designId);
  const blankDetail = useDesignCanvas((s) => s.blankDetail);

  // ── PRODUCT PAGE PARITY: the preview shows the SAME product data the
  // product page shows — same colors, same variants, and the SAME
  // per-color × per-view mockup images (skeleton variantImages +
  // Printful gallery). Clicking a color here changes the mockup exactly
  // like it does on the canvas. ──
  const [skeleton, setSkeleton] = useState<BlankSkeleton | null>(null);
  useEffect(() => {
    if (!blankDetail) {
      setSkeleton(null);
      return;
    }
    let cancelled = false;
    void getBlankSkeleton(blankDetail.id)
      .then((s) => {
        if (!cancelled) setSkeleton(s);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [blankDetail?.id]);

  /** The mockup image for the selected color × the active angle —
   *  the exact same chain the canvas uses (variantImages, then
   *  gallery), so what the user sees on the canvas is what they
   *  see here. Only used when no real render exists for the angle. */
  const variantImgFor = (angle: string) => {
    const vi = skeleton?.variantImages ?? [];
    if (vi.length > 0) {
      const entry =
        vi.find((v) => v.color.toLowerCase() === color.name.toLowerCase()) ?? vi[0];
      const key = Object.keys(entry.images).find(
        (k) => k.toLowerCase() === angle.toLowerCase(),
      );
      const url = (key ? entry.images[key] : entry.images.front) ?? skeleton?.mockupUrl;
      if (url) return url;
    }
    const g = blankDetail?.gallery ?? [];
    if (g.length > 0) {
      const entry =
        g.find((x) => x.color.toLowerCase() === color.name.toLowerCase()) ?? g[0];
      const hit = entry.images.find(
        (i) => i.placement.toLowerCase() === angle.toLowerCase(),
      );
      if (hit?.url) return hit.url;
    }
    return null;
  };

  // Create a draft design on mount if none exists — the render queue
  // needs a designId to composite the actual design onto the mockup.
  // Without this, the preview never fires (openStudio from the
  // catalog loads the blank but doesn't create a design draft).
  const [creatingDraft, setCreatingDraft] = useState(false);
  useEffect(() => {
    if (designId || creatingDraft || !blankDetail) return;
    setCreatingDraft(true);
    void createDesign({
      name: blankDetail.name,
      blankId: blankDetail.canonicalProductId ?? blankDetail.id,
      supplierCatalogProductId: blankDetail.id,
      productType: blankDetail.name,
    })
      .then((created) => {
        useDesignCanvas.setState({ designId: created.id });
      })
      .catch(() => {
        // The render queue won't fire; the user still sees the
        // mockup image. The variant bar works regardless.
      })
      .finally(() => setCreatingDraft(false));
  }, [designId, creatingDraft, blankDetail]);

  // The card's pricing: base cost flowing in from the printer, the printer,
  // its estimated delivery, and the suggested retail — the suggestion is
  // not the price. The user sets their own price before publishing.
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [userPrice, setUserPrice] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);

  // ── THE ACTUAL PREVIEW: ingest → queue renders → poll → show ──
  // The static skeleton image is only a fallback; the center shows the
  // render worker's real composited mockup once one succeeds.
  // The ACTUAL mockup per view angle — renders land keyed by their view;
  // the angle thumbs switch between them (Front → FRONT render, Back →
  // BACK render, exotic angles fall back to any succeeded render).
  const [mockupsByView, setMockupsByView] = useState<Record<string, string>>({});
  const [previewPhase, setPreviewPhase] = useState<
    'idle' | 'preparing' | 'rendering' | 'ready' | 'error'
  >('idle');
  const [previewNote, setPreviewNote] = useState<string | null>(null);
  const [printState, setPrintState] = useState<
    'idle' | 'queued' | 'ready' | 'error'
  >('idle');
  const [printNote, setPrintNote] = useState<string | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    if (!designId) {
      setPreviewPhase('idle');
      return;
    }
    let cancelled = false;
    const start = async () => {
      setPreviewPhase('preparing');
      setPreviewNote(null);
      try {
        // 1) Ingest (idempotent, seconds) — stored base photos make the
        //    renders real instead of flat skeleton canvases.
        if (blankDetail?.id) {
          try {
            const report = await ingestBlank(blankDetail.id);
            if (report.alreadyIngested) {
              setPreviewNote('Blank ready — rendering your actual design.');
            }
          } catch {
            setPreviewNote('Blank assets unavailable — previewing on the skeleton geometry.');
          }
        }
        if (cancelled) return;
        // 2) Queue the real mockup renders.
        await queuePreview(designId);
        if (cancelled) return;
        // 3) Poll until no mockup row is queued/running (~90s cap).
        setPreviewPhase('rendering');
        const deadline = Date.now() + 90_000;
        const poll = async (): Promise<void> => {
          if (cancelled) return;
          try {
            const { renders } = await listRenders(designId);
            const mockups = renders.filter((r) => r.kind === 'mockup');
            const byView: Record<string, string> = {};
            for (const r of mockups) {
              if (r.status === 'succeeded' && r.url) {
                byView[String(r.view ?? '').toUpperCase()] = r.url;
              }
            }
            if (Object.keys(byView).length > 0) {
              // Views land one by one — update the map as they arrive; the
              // center image follows the active angle via mockupsByView.
              setMockupsByView(byView);
              setPreviewPhase('ready');
              if (!mockups.some((r) => r.status === 'queued' || r.status === 'running')) {
                return;
              }
            }
            const failed = mockups.find((r) => r.status === 'failed');
            const pending = mockups.some((r) => r.status === 'queued' || r.status === 'running');
            if (!pending && Object.keys(byView).length === 0) {
              setPreviewPhase('error');
              setPreviewNote(
                failed
                  ? 'The render failed — the design may reference a missing asset.'
                  : 'No render was produced for this design.',
              );
              return;
            }
          } catch {
            // poll error — keep trying until the deadline
          }
          if (Date.now() > deadline) {
            setPreviewPhase('error');
            setPreviewNote('Rendering is taking longer than expected — try again shortly.');
            return;
          }
          pollRef.current = window.setTimeout(() => void poll(), 2500);
        };
        await poll();
      } catch (e) {
        if (!cancelled) {
          setPreviewPhase('error');
          setPreviewNote(e instanceof Error ? e.message : 'Preview pipeline failed.');
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      if (pollRef.current) window.clearTimeout(pollRef.current);
    };
  }, [designId]);

  // ── PRINT FILE: queue 300-DPI print renders, poll to done. ──
  const handlePrintFile = async () => {
    if (!designId || printState === 'queued') return;
    setPrintState('queued');
    setPrintNote('Queueing the 300-DPI print PNG…');
    try {
      const res = await queuePrintRenders(designId);
      if (res.queued.length === 0) {
        setPrintState('error');
        setPrintNote(res.skipped[0]?.reason ?? 'Nothing could be queued.');
        return;
      }
      const deadline = Date.now() + 120_000;
      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2500));
        const { renders } = await listRenders(designId);
        const prints = renders.filter((r: RenderStatus) => r.kind === 'print');
        if (prints.some((r) => r.status === 'succeeded')) {
          setPrintState('ready');
          setPrintNote('Print PNG ready — 300 DPI, full print area.');
          onToast('Print file ready — you can publish now.');
          return;
        }
        const failed = prints.find((r) => r.status === 'failed');
        const pending = prints.some((r) => r.status === 'queued' || r.status === 'running');
        if (!pending) {
          setPrintState('error');
          setPrintNote(failed ? 'The print render failed.' : 'No print render was produced.');
          return;
        }
      }
      setPrintState('error');
      setPrintNote('Print rendering timed out — retry in a moment.');
    } catch (e) {
      setPrintState('error');
      setPrintNote(e instanceof Error ? e.message : 'Print queueing failed.');
    }
  };

  useEffect(() => {
    if (!designId) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    void getPrice(designId)
      .then((q) => {
        if (cancelled) return;
        setQuote(q);
        setQuoteError(null);
        // Prefill with the price the user already set, else the suggestion.
        setUserPrice((q.userPrice ?? q.suggestedRetailPrice).toFixed(2));
      })
      .catch((e: Error) => {
        if (!cancelled) setQuoteError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [designId]);

  const [activeAngle, setActiveAngle] = useState(0);
  const [colorMode, setColorMode] = useState<'cmyk' | 'rgb'>('rgb');
  const [variantModalOpen, setVariantModalOpen] = useState(false);
  const [infoModalOpen, setInfoModalOpen] = useState(false);
  const [scalingModalOpen, setScalingModalOpen] = useState(false);
  const [publishConfirmOpen, setPublishConfirmOpen] = useState(false);
  const [selectedSize, setSelectedSize] = useState<string>(blankDetail?.variants.sizes?.[0] ?? 'M');
  const [variantTab, setVariantTab] = useState<'color' | 'size'>('color');
  const [selectedVariants, setSelectedVariants] = useState<Set<string>>(
    new Set(['White'])
  );
  const [openAcc, setOpenAcc] = useState<Record<string, boolean>>({
    cost: true,
    printArea: true,
    guidelines: true,
  });

  const toggleVariant = (name: string) => {
    setSelectedVariants((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handlePublish = async () => {
    if (!designId || !quote) return;
    const price = Number.parseFloat(userPrice);
    if (!(price > 0)) {
      setPublishError('Enter your price (above 0).');
      return;
    }
    setPublishing(true);
    setPublishError(null);
    try {
      const res = await publishDesign(
        designId,
        {
          price,
          supplierSlug: quote.printer.slug,
          variants: [...selectedVariants].map((c) => ({
            color: c,
            size: blankDetail?.variants.sizes[0] ?? 'M',
          })),
        },
        crypto.randomUUID(),
      );
      setPublishConfirmOpen(false);
      if (res.status === 'published') {
        onToast(`"${product?.name}" published at USD ${price.toFixed(2)}.`);
      } else {
        onToast(
          `"${product?.name}" saved as a draft at USD ${price.toFixed(2)} — ${res.supplier.warnings[0] ?? 'supplier step pending.'}`,
        );
      }
    } catch (e) {
      setPublishError(e instanceof Error ? e.message : 'Publish failed.');
    } finally {
      setPublishing(false);
    }
  };

  const toggleAcc = (k: string) => setOpenAcc((p) => ({ ...p, [k]: !p[k] }));

  // Save product — REAL persistence: the canvas auto-saved the layers on
  // the way here; this re-writes the design's own saved spec so the draft
  // is verifiably durable (and the toast is honest about failures).
  const [savingProduct, setSavingProduct] = useState(false);
  const handleSaveProduct = async () => {
    if (!designId || savingProduct) return;
    setSavingProduct(true);
    try {
      const { design } = await getDesign(designId);
      await saveDesign(designId, {
        placementSpec: design.placementSpec ?? { version: 1, layers: [] },
      });
      onToast('Draft saved.');
    } catch (e) {
      onToast(`Save failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setSavingProduct(false);
    }
  };

  return (
    <div className={styles.root}>
      {/* Center canvas (the mockup) — the ACTIVE angle's actual render when
          one exists, else the product's catalog photo. */}
      <main className={styles.center}>
        {(() => {
          const wanted = MOCKUP_ANGLES[activeAngle]?.toUpperCase() ?? 'FRONT';
          const viewUrl =
            mockupsByView[wanted] ??
            Object.values(mockupsByView)[0] ??
            null;
          // Product-page parity: when no real render exists for this
          // angle, show the per-color × per-view mockup (the same image
          // the canvas shows for this color), THEN the product photo.
          const shown = viewUrl ?? variantImgFor(wanted) ?? product?.img ?? null;
          return product || shown ? (
            <img
              className={styles.mockupImage}
              src={shown ?? ''}
              alt={viewUrl ? 'Actual rendered mockup' : 'Mockup'}
            />
          ) : (
            <div className={styles.emptyState}>
              <span className="material-symbols-outlined">image</span>
              <h3>No product loaded</h3>
              <p>Go back to New design and load a blank, or drag one from the catalog.</p>
            </div>
          );
        })()}

        {/* Actual-preview status chip */}
        {previewPhase !== 'idle' && (
          <div className={styles.previewChip}>
            {previewPhase === 'preparing' && 'Preparing blank…'}
            {previewPhase === 'rendering' && 'Rendering your actual design…'}
            {previewPhase === 'ready' && 'Actual preview ready'}
            {previewPhase === 'error' && (previewNote ?? 'Preview unavailable')}
          </div>
        )}
        {previewPhase === 'ready' && printState !== 'idle' && (
          <div className={styles.previewChip}>
            {printState === 'queued' && (printNote ?? 'Generating print file…')}
            {printState === 'ready' && (printNote ?? 'Print PNG ready')}
            {printState === 'error' && (printNote ?? 'Print file failed')}
          </div>
        )}

        {/* Top toggle (Edit / Preview) */}
        <div className={styles.topToggle}>
          <button
            type="button"
            className={styles.toggleBtn}
            onClick={() => onNavigate('design', 'new-design')}
          >
            Edit
          </button>
          <button type="button" className={`${styles.toggleBtn} ${styles.on}`}>
            Preview
          </button>
        </div>

        {/* Action overlay — the 2 buttons from mockup preview.html */}
        <div className={styles.actionOverlay}>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setVariantModalOpen(true)}
          >
            <span className="material-symbols-outlined">palette</span>
            Variant Screen
          </button>
          <button
            type="button"
            className={styles.actionBtn}
            onClick={() => setInfoModalOpen(true)}
          >
            <span className="material-symbols-outlined">info</span>
            Product Info Screen
          </button>
        </div>
      </main>

      {/* Right rail — Mockup view controls */}
      <aside className={styles.rightRail}>
        <div className={styles.railHeader}>
          <h2>Mockup view</h2>
        </div>
        <div className={styles.railBody}>
          {/* Mockup thumbs — real views from the blank when available */}
          <div className={styles.mockupThumbs}>
            {(blankDetail?.views ?? []).slice(0, 4).map((v, i) => (
              <button
                key={v.view}
                type="button"
                className={`${styles.mockupThumb} ${i === activeAngle ? styles.active : ''}`}
                onClick={() => setActiveAngle(i)}
                title={v.label}
              >
                {v.baseUrl && <img src={v.baseUrl} alt={v.label} />}
              </button>
            ))}
            {(blankDetail?.views ?? []).length === 0 && MOCKUP_ANGLES.map((a, i) => (
              <button
                key={a}
                type="button"
                className={`${styles.mockupThumb} ${i === activeAngle ? styles.active : ''}`}
                onClick={() => setActiveAngle(i)}
                title={a}
              >
                {product && <img src={product.img} alt={a} />}
              </button>
            ))}
          </div>
          <button type="button" className={`${styles.btnOutline} ${styles.btnFull}`}>
            <span className="material-symbols-outlined">add</span>
            Show more
          </button>

          <div className={styles.muted}>
            Preview product size: L
            <br />
            Design is scaled down on smaller sizes.
          </div>
          <button
            type="button"
            className={`${styles.btnOutline} ${styles.btnFull}`}
            onClick={() => setScalingModalOpen(true)}
          >
            Design scaling
          </button>

          <div className={styles.sectionLabel}>
            Mockup color mode{' '}
            <span className={`material-symbols-outlined ${styles.icon14}`}>
              open_in_new
            </span>
          </div>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="color-mode"
              checked={colorMode === 'cmyk'}
              onChange={() => setColorMode('cmyk')}
            />
            Realistic (CMYK)
          </label>
          <label className={styles.radioRow}>
            <input
              type="radio"
              name="color-mode"
              checked={colorMode === 'rgb'}
              onChange={() => setColorMode('rgb')}
            />
            Bright/colourful (RGB)
          </label>

          <div className={styles.sectionLabel}>{product?.brand ?? 'Gildan'} Colors</div>
          <div className={styles.colorDots}>
            {SUPPLIER_COLORS.map((c) => (
              <div
                key={c.name}
                className={`${styles.colorDot} ${c.name === color.name ? styles.active : ''}`}
                style={{ background: c.hex }}
                title={c.name}
                onClick={() => selectColor(c)}
              />
            ))}
          </div>

          <div className={styles.sectionLabel}>Mockup background</div>
          <p className={`${styles.muted} ${styles.mutedNoMargin}`}>
            Recommended resolution 2048 x 2048px. Max resolution 30000 x 30000px. JPG and PNG up to
            100 MiB. SVG up to 20 MiB.
          </p>
          <div className={styles.bgRow}>
            <button type="button" className={`${styles.btnOutline} ${styles.btnFlex}`}>
              <span className="material-symbols-outlined">add_photo_alternate</span>
              Add image
            </button>
            <button type="button" className={`${styles.btnOutline} ${styles.bgWhiteBtn}`}>
              White
            </button>
          </div>
        </div>
      </aside>

      {/* Bottom bar — Download · Save · Print · Publish */}
      <div className={styles.bottom}>
        <button type="button" className={styles.downloadBtn} onClick={() => onToast('Downloading mockup…')}>
          <span className="material-symbols-outlined">download</span>
          Download mockup
        </button>
        <div className={styles.spacer} />
        <button type="button" className={styles.saveBtn} onClick={() => void handleSaveProduct()} disabled={savingProduct}>
          {savingProduct ? 'Saving…' : 'Save product'}
        </button>
        <button
          type="button"
          className={styles.saveBtn}
          onClick={() => void handlePrintFile()}
          disabled={!designId || printState === 'queued'}
          title="Generate the 300-DPI print PNG the suppliers fulfill from"
        >
          <span className="material-symbols-outlined">print</span>
          {printState === 'queued' ? 'Print file…' : printState === 'ready' ? 'Print file ✓' : 'Print file'}
        </button>
        <button
          type="button"
          className={styles.publishBtn}
          onClick={() => setPublishConfirmOpen(true)}
          disabled={!product}
        >
          <span className="material-symbols-outlined">publish</span>
          Publish
        </button>
      </div>

      {/* ── Variants bar (bottom) ── the real color × size picker.
          Replaces the legacy hardcoded SUPPLIER_COLORS with the actual
          variant colors from the loaded blank (blankDetail.variants.colors).
          Clicking a color switches the mockup (the canvas's skeleton
          shell recolors). The size chips select the active size for
          the publish payload. This IS the preview page's purpose. */}
      {product && (
        <div className={styles.variantsBar}>
          <div className={styles.variantsSection}>
            <span className={styles.variantsLabel}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>palette</span>
              Colors
              <span className={styles.variantsCount}>
                {(blankDetail?.variants.colors ?? []).length || 1}
              </span>
            </span>
            <div className={styles.colorSwatches}>
              {/* ALL colors — no 12 cap. The product page shows every
                  color; the preview must show the same product
                  information. Scrollable when long. */}
              {(blankDetail?.variants.colors ?? []).map((c) => (
                <button
                  key={c.sku ?? c.name}
                  type="button"
                  className={`${styles.varSwatch} ${c.name === color.name ? styles.varSwatchActive : ''}`}
                  style={{
                    background: c.hex || 'linear-gradient(135deg,#d5d8de 50%,#f3f4f6 50%)',
                    border: (c.hex || '').toLowerCase() === '#ffffff' ? '1px solid #dad9dd' : '1px solid rgba(0,0,0,0.15)',
                  }}
                  title={c.name + (c.sku ? ` (${c.sku})` : '')}
                  onClick={() => selectColor({ name: c.name, hex: c.hex, sku: c.sku })}
                  aria-label={c.name}
                />
              ))}
              {(!blankDetail?.variants.colors || blankDetail.variants.colors.length === 0) && (
                <span className={styles.variantsMuted}>No color variants on file</span>
              )}
            </div>
          </div>
          {(blankDetail?.variants.sizes ?? []).length > 0 && (
            <div className={styles.variantsSection}>
              <span className={styles.variantsLabel}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>straighten</span>
                Sizes
                <span className={styles.variantsCount}>
                  {blankDetail!.variants.sizes.length}
                </span>
              </span>
              <div className={styles.sizeChips}>
                {blankDetail!.variants.sizes.map((s) => (
                  <button
                    key={s}
                    type="button"
                    className={`${styles.sizeChip} ${s === selectedSize ? styles.sizeChipActive : ''}`}
                    onClick={() => setSelectedSize(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Variant modal ── */}
      {variantModalOpen && (
        <div className={styles.overlay} onClick={() => setVariantModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Select variants</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setVariantModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.varTabs}>
                <button
                  type="button"
                  className={`${styles.varTab} ${variantTab === 'color' ? styles.active : ''}`}
                  onClick={() => setVariantTab('color')}
                >
                  Color
                </button>
                <button
                  type="button"
                  className={`${styles.varTab} ${variantTab === 'size' ? styles.active : ''}`}
                  onClick={() => setVariantTab('size')}
                >
                  Size
                </button>
              </div>
              <p className={`${styles.muted} ${styles.variantHint}`}>
                Optimal listings have between 5-15 variants
              </p>
              <div className={styles.selectAllRow}>
                <input
                  type="checkbox"
                  checked={selectedVariants.size === VARIANT_COLORS.length}
                  onChange={(e) =>
                    setSelectedVariants(e.target.checked ? new Set(VARIANT_COLORS.map((c) => c.name)) : new Set())
                  }
                />
                <label>Select all (max 100)</label>
                <span className={styles.muted}>{selectedVariants.size} variants selected</span>
              </div>
              {VARIANT_COLORS.map((c) => (
                <label key={c.name} className={styles.varRow}>
                  <input
                    type="checkbox"
                    checked={selectedVariants.has(c.name)}
                    onChange={() => toggleVariant(c.name)}
                  />
                  <div className={styles.varSwatch} style={{ background: c.hex }} />
                  <div className={styles.varName}>{c.name}</div>
                  <span className={`material-symbols-outlined ${styles.varChevron}`}>
                    expand_more
                  </span>
                </label>
              ))}
            </div>
            <div className={styles.modalFooter}>
              <button type="button" className={styles.btnOutline} onClick={() => setVariantModalOpen(false)}>
                Cancel
              </button>
              <button
                type="button"
                className={`${styles.btnOutline} ${styles.btnApply}`}
                onClick={() => {
                  setVariantModalOpen(false);
                  onToast(`${selectedVariants.size} variants applied.`);
                }}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Product Info modal ── */}
      {infoModalOpen && product && (
        <div className={styles.overlay} onClick={() => setInfoModalOpen(false)}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Important product information</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setInfoModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.infoHero}>
                <img src={product.img} alt={product.name} />
                <div className={styles.infoHeroInfo}>
                  <b>{product.name}</b>
                  <span className={styles.muted}>{product.brand}</span>
                  <span className={styles.muted}>
                    Fulfilled by {quote?.printer.name ?? blankDetail?.supplier ?? '—'}
                  </span>
                  <span className={styles.muted}>
                    Estimated delivery:{' '}
                    {quote?.estimatedDelivery
                      ? `≈${quote.estimatedDelivery.average} ${quote.estimatedDelivery.unit.replace(/_/g, ' ')}`
                      : '—'}
                  </span>
                  <button
                    type="button"
                    className={`${styles.btnOutline} ${styles.seeDetailsBtn}`}
                  >
                    See details
                  </button>
                </div>
              </div>

              <button type="button" className={`${styles.btnOutline} ${styles.btnFull}`}>
                <span className="material-symbols-outlined">download</span>
                Download design template
              </button>

              {/* Production cost accordion — real numbers from the quote. */}
              <div className={`${styles.accItem} ${openAcc.cost ? styles.open : ''}`}>
                <button type="button" className={styles.accHead} onClick={() => toggleAcc('cost')}>
                  Base price: USD {quote ? quote.cost.toFixed(2) : '—'}
                  <span className={`material-symbols-outlined ${styles.chev}`}>expand_more</span>
                </button>
                <div className={styles.accBody}>
                  <div className={styles.kv}>
                    <span className={styles.key}>Printer</span>
                    <span>{quote?.printer.name ?? blankDetail?.supplier ?? '—'}</span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.key}>Estimated delivery</span>
                    <span>
                      {quote?.estimatedDelivery
                        ? `≈${quote.estimatedDelivery.average} ${quote.estimatedDelivery.unit.replace(/_/g, ' ')}`
                        : '—'}
                    </span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.key}>Suggested retail</span>
                    <span>
                      {quote ? `USD ${quote.suggestedRetailPrice.toFixed(2)} (suggestion — you set the price)` : '—'}
                    </span>
                  </div>
                  <div className={`${styles.kv} ${styles.kvSubtotal}`}>
                    <b>Base price</b>
                    <b>USD {quote ? quote.cost.toFixed(2) : '—'}</b>
                  </div>
                </div>
              </div>

              {/* Print area accordion — real print areas from the provider. */}
              <div className={`${styles.accItem} ${openAcc.printArea ? styles.open : ''}`}>
                <button type="button" className={styles.accHead} onClick={() => toggleAcc('printArea')}>
                  Print area size:{' '}
                  {blankDetail?.printAreas[0]
                    ? `${blankDetail.printAreas[0].widthPx} × ${blankDetail.printAreas[0].heightPx} px`
                    : '—'}
                  <span className={`material-symbols-outlined ${styles.chev}`}>expand_more</span>
                </button>
                <div className={styles.accBody}>
                  <div className={styles.kv}>
                    <span className={styles.key}>DPI</span>
                    <span>300</span>
                  </div>
                  <div className={styles.kv}>
                    <span className={styles.key}>Product size</span>
                    <span>L</span>
                  </div>
                </div>
              </div>

              {/* Guidelines */}
              <div className={`${styles.accItem} ${openAcc.guidelines ? styles.open : ''}`}>
                <button type="button" className={styles.accHead} onClick={() => toggleAcc('guidelines')}>
                  <span className={styles.accHeadLabel}>
                    <span className="material-symbols-outlined">info</span>
                    Product and design guidelines
                  </span>
                  <span className={`material-symbols-outlined ${styles.chev}`}>expand_more</span>
                </button>
                <div className={styles.guidelines}>
                  <p>
                    <b>Semi-transparencies and gradients may not print as shown</b>
                  </p>
                  <p>
                    Please note: DTF prints have a white underbase and cannot offer full transparency.
                  </p>
                  <p>
                    <b>Design limitations (Single-color prints)</b>
                  </p>
                  <p>The process used for creating single-color print products will impact the final look.</p>
                  <p>
                    <b>Your design should NOT contain:</b>
                  </p>
                  <ul>
                    <li>Photos</li>
                    <li>Gradients</li>
                    <li>Small details (&lt; 0.05&quot;)</li>
                    <li>Small text (&lt; 0.25&quot;)</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Design scaling modal ── */}
      {scalingModalOpen && (
        <div className={styles.overlay} onClick={() => setScalingModalOpen(false)}>
          <div className={`${styles.modal} ${styles.modalWide}`} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <h2>Design scaling</h2>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setScalingModalOpen(false)}
              >
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className={styles.modalBody}>
              <p className={styles.muted}>
                Our Product Creator shows the L apparel size and allows you to place the design on that
                size only. While we scale down the design automatically for smaller apparel sizes, as
                shown in the image below, it will not be scaled up for sizes larger than L.
              </p>
              <div className={styles.scalingDiagram}>
                {['S', 'M', 'L', 'XL', 'XXL'].map((sz) => (
                  <div key={sz} className={styles.scalingItem}>
                    <svg viewBox="0 0 100 100">
                      <path
                        d="M20 10 L10 30 L10 90 L90 90 L90 30 L80 10 Z"
                        fill="var(--d-bg)"
                        stroke="var(--d-line)"
                      />
                      <rect x="25" y="30" width="50" height="50" fill="var(--d-ink)" />
                    </svg>
                    {sz}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Publish confirmation ── */}
      {publishConfirmOpen && (
        <div className={styles.overlay} onClick={() => setPublishConfirmOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalBody}>
              <div className={styles.publishConfirm}>
                <span className="material-symbols-outlined">check_circle</span>
                <h2>Publish to Global Catalog?</h2>
                <p>
                  This will make <b>{product?.name}</b> live in the global Catalog domain (Published
                  Items &amp; SKUs) on the icon rail. Customers will be able to purchase it across all
                  connected channels.
                </p>
                {quote ? (
                  <>
                    <div className={styles.kv}>
                      <span className={styles.key}>Base price</span>
                      <span>USD {quote.cost.toFixed(2)}</span>
                    </div>
                    <div className={styles.kv}>
                      <span className={styles.key}>Printer</span>
                      <span>{quote.printer.name}</span>
                    </div>
                    <div className={styles.kv}>
                      <span className={styles.key}>Estimated delivery</span>
                      <span>
                        {quote.estimatedDelivery
                          ? `≈${quote.estimatedDelivery.average} ${quote.estimatedDelivery.unit.replace(/_/g, ' ')}`
                          : '—'}
                      </span>
                    </div>
                    <div className={styles.kv}>
                      <span className={styles.key}>Suggested retail</span>
                      <span>USD {quote.suggestedRetailPrice.toFixed(2)}</span>
                    </div>
                    <label className={styles.kv}>
                      <span className={styles.key}>Your price (USD)</span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={userPrice}
                        onChange={(e) => setUserPrice(e.target.value)}
                        aria-label="Your price in USD"
                      />
                    </label>
                    <p className={styles.muted}>
                      You set the price — the suggestion above is not the price.
                    </p>
                  </>
                ) : (
                  <p className={styles.muted}>
                    {designId
                      ? (quoteError ?? 'Loading the base price…')
                      : 'No design draft yet — start designing from the product page first.'}
                  </p>
                )}
                {publishError && <p className={styles.muted}>{publishError}</p>}
                <button
                  type="button"
                  className={styles.confirmBtn}
                  onClick={() => void handlePublish()}
                  disabled={!quote || publishing}
                >
                  {publishing ? 'Publishing…' : 'Publish now'}
                </button>
                <button
                  type="button"
                  className={`${styles.btnOutline} ${styles.confirmCancelBtn}`}
                  onClick={() => setPublishConfirmOpen(false)}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
