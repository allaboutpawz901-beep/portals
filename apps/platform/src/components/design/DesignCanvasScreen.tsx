'use client';

/**
 * Design Studio — New design canvas screen.
 *
 * The full studio experience, everything reachable from ONE screen:
 *   - LEFT DOCK (Canva-style): a tool rail (Upload / AI / Text / Images /
 *     Graphics / Shapes / Themes / My library / My templates) that EXPANDS
 *     into a docked panel. Every panel is the same StudioPanelContent the
 *     sidebar drawer hosts — one source of truth.
 *   - CANVAS: renders the real mockup, the print-area box (inches + DPI from
 *     the blank's provider skeleton), the design's placement layers from the
 *     API, and local vector layers drawn with the floating toolbar.
 *   - TOOLS THAT WORK: Select / Text / Rect / Ellipse / Draw / Arrow / Line /
 *     Triangle — each draws a real layer on the canvas (drag to size) and
 *     routes to the matching dock panel.
 *   - API DATA SURFACED: base price + printer + delivery + suggested retail
 *     (GET /blanks/:id/price), variant colors, print areas, render state,
 *     design placement layers (GET /designs/:id).
 *   - Undo / Redo history, Save (PATCH the whole placement spec), zoom.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react';
import {
  BLANKS,
  useDesignCanvas,
} from '@/lib/designCanvasStore';
import {
  applyTemplate,
  getBlankPrice,
  getBlankSkeleton,
  getDesign,
  ingestBlank,
  listAssets,
  saveDesign,
  appendPlacementLayer,
  type BlankDetail,
  type BlankSkeleton,
  type PlacementLayer,
  type PriceQuote,
} from '@/lib/podApi';
import {
  StudioPanelContent,
  STUDIO_SHAPES,
  STUDIO_THEMES,
  uploadCommonsImage,
  type StudioShape,
  type StudioTheme,
} from '@/components/StudioDrawer';
import type { DomainKey } from '@/data/shellData';
import styles from './DesignCanvas.module.css';

interface DesignCanvasScreenProps {
  onToast: (msg: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}

// Create-action toolbar tools (tldraw-style floating toolbar). `route`
// tools don't draw — they open their dock panel (every canvas tool routes).
type ToolId = 'select' | 'text' | 'rect' | 'ellipse' | 'draw' | 'arrow' | 'line' | 'triangle' | 'upload' | 'ai' | 'images';
const TOOLS: { id: ToolId; icon: string; label: string; dock?: DockKind; route?: boolean }[] = [
  { id: 'select', icon: 'navigation', label: 'Select' },
  { id: 'text', icon: 'text_fields', label: 'Text', dock: 'Text' },
  { id: 'rect', icon: 'crop_square', label: 'Rectangle', dock: 'Shapes' },
  { id: 'ellipse', icon: 'circle', label: 'Ellipse', dock: 'Shapes' },
  { id: 'draw', icon: 'draw', label: 'Draw', dock: 'Graphics' },
  { id: 'arrow', icon: 'arrow_right_alt', label: 'Arrow', dock: 'Shapes' },
  { id: 'line', icon: 'horizontal_rule', label: 'Line', dock: 'Shapes' },
  { id: 'triangle', icon: 'change_history', label: 'Triangle', dock: 'Shapes' },
  { id: 'upload', icon: 'cloud_upload', label: 'Upload art', dock: 'Upload', route: true },
  { id: 'ai', icon: 'auto_awesome', label: 'AI art', dock: 'AI', route: true },
  { id: 'images', icon: 'image', label: 'Images', dock: 'Images', route: true },
];

/* ── Printify placement mapping — placeholders are the UI views ── */

/** Strip the technique suffix: front_dtf → front, back_embroidery → back. */
export function placementBase(position: string): string {
  return position
    .toLowerCase()
    .replace(/_(dtf|dtg|embroidery|sublimation|screen_print|screenprint|vinyl|cut_sew)$/i, '');
}

/** Printify position key → the pill label the canvas shows. */
const PLACEMENT_LABELS: Record<string, string> = {
  front: 'Front side',
  back: 'Back side',
  left_sleeve: 'Sleeve left',
  right_sleeve: 'Sleeve right',
  neck: 'Neck label inner',
  label: 'Neck label inner',
  inside_label: 'Neck label inner',
  left_chest: 'Left chest',
  right_chest: 'Right chest',
  chest: 'Chest',
  wrap: 'Wrap',
  both_sides: 'Both sides',
  handle: 'Handle only',
  binder: 'Binder',
};
function placementLabel(position: string): string {
  const base = placementBase(position);
  if (PLACEMENT_LABELS[base]) return PLACEMENT_LABELS[base];
  return base
    .split('_')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

// ── Dock tools — FLAT list per design canvas.html spec.
//    All tools are siblings in the icon rail (no nesting):
//    Upload, Images, Graphics, Templates, Shapes, Add text, AI,
//    Product details, Layers, Layouts, Files, Themes, Settings.
//    The sidebar tree (shellData.ts) stays nested for navigation,
//    but the canvas drawer rail is flat.
type DockKind =
  | 'Upload'
  | 'AI'
  | 'Text'
  | 'Images'
  | 'Graphics'
  | 'Shapes'
  | 'Templates'
  | 'Themes'
  | 'Product details'
  | 'Layers'
  | 'Layouts'
  | 'Files'
  | 'Shutterstock'
  | 'Settings'
  | 'My library'
  | 'My templates';

const DOCK_TOOLS: { kind: DockKind; icon: string; label: string }[] = [
  { kind: 'Upload', icon: 'cloud_upload', label: 'Upload' },
  { kind: 'Images', icon: 'image', label: 'Images' },
  { kind: 'Graphics', icon: 'interests', label: 'Graphics' },
  { kind: 'Templates', icon: 'dashboard', label: 'Templates' },
  { kind: 'Shapes', icon: 'category', label: 'Shapes' },
  { kind: 'Text', icon: 'text_fields', label: 'Add text' },
  { kind: 'AI', icon: 'auto_awesome', label: 'AI' },
  { kind: 'Product details', icon: 'info', label: 'Product' },
  { kind: 'Layers', icon: 'layers', label: 'Layers' },
  { kind: 'Layouts', icon: 'dashboard', label: 'Layouts' },
  { kind: 'Files', icon: 'folder', label: 'Files' },
  { kind: 'Themes', icon: 'palette', label: 'Themes' },
  { kind: 'Settings', icon: 'settings', label: 'Settings' },
];

const DOCK_META: Record<DockKind, { icon: string; subtitle: string; action: string }> = {
  Upload: { icon: 'cloud_upload', subtitle: 'PNG, JPG, SVG, PDF — up to 25 MB', action: 'Browse files' },
  AI: { icon: 'auto_awesome', subtitle: 'Generate art from a prompt', action: 'Generate' },
  Text: { icon: 'text_fields', subtitle: 'Add a text layer', action: 'Add to canvas' },
  Images: { icon: 'image', subtitle: 'Free images from Wikimedia Commons', action: 'Search Commons' },
  Graphics: { icon: 'interests', subtitle: 'Icons and graphics', action: 'Add selected' },
  Shapes: { icon: 'category', subtitle: 'Basic vector shapes', action: 'Place shape' },
  Templates: { icon: 'dashboard', subtitle: 'Reusable templates', action: 'Apply template' },
  Themes: { icon: 'palette', subtitle: 'Palettes and font pairings', action: 'Apply theme' },
  'Product details': { icon: 'info', subtitle: 'Product info and layers', action: 'View details' },
  Layers: { icon: 'layers', subtitle: 'Design layers on the canvas', action: 'Manage layers' },
  Layouts: { icon: 'dashboard', subtitle: 'Layout templates', action: 'Apply layout' },
  Files: { icon: 'folder', subtitle: 'Your uploaded files', action: 'Browse files' },
  Shutterstock: { icon: 'photo_library', subtitle: 'Stock photos from Shutterstock', action: 'Search' },
  Settings: { icon: 'settings', subtitle: 'Grid, guides, bleeds, units, background', action: 'Apply' },
  'My library': { icon: 'folder_special', subtitle: 'Your saved assets', action: 'Upload to library' },
  'My templates': { icon: 'view_quilt', subtitle: 'Your saved designs', action: 'Save current as template' },
};

// Local working layer — a placement layer + render hints + a stable uid.
interface WorkLayer extends PlacementLayer {
  uid: string;
  /** Vector render key for kind='shape' layers drawn with the toolbar. */
  render?: 'rect' | 'rectRound' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'star' | 'heart' | 'ring' | 'diamond';
  /** Local fill for shape layers. */
  fill?: string;
  /** Remote preview URL (Commons fallback when the download was limited).
   *  Local-only — stripped before saving to the API. */
  remoteUrl?: string;
}

const uid = () => `l-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/** The render key for a STUDIO_SHAPES id ('rect-round' → 'rectRound'). */
function shapeRender(id: string): StudioShape['render'] {
  return STUDIO_SHAPES.find((s) => s.id === id)?.render ?? 'rect';
}

export default function DesignCanvasScreen({ onToast, onNavigate }: DesignCanvasScreenProps) {
  const product = useDesignCanvas((s) => s.product);
  const printArea = useDesignCanvas((s) => s.printArea);
  const setPrintArea = useDesignCanvas((s) => s.setPrintArea);
  const loadBlank = useDesignCanvas((s) => s.loadBlank);
  const designQueue = useDesignCanvas((s) => s.designQueue);
  const addToQueue = useDesignCanvas((s) => s.addToQueue);
  const removeFromQueue = useDesignCanvas((s) => s.removeFromQueue);
  const activeCategory = useDesignCanvas((s) => s.activeCategory);
  const activeSubcategory = useDesignCanvas((s) => s.activeSubcategory);
  const setCategory = useDesignCanvas((s) => s.setCategory);
  const navMap = useDesignCanvas((s) => s.navMap);
  const loadNavCategories = useDesignCanvas((s) => s.loadNavCategories);
  const catalogProducts = useDesignCanvas((s) => s.catalogProducts);
  const catalogCards = useDesignCanvas((s) => s.catalogCards);
  const catalogStatus = useDesignCanvas((s) => s.catalogStatus);
  const catalogError = useDesignCanvas((s) => s.catalogError);
  const loadCategoryProducts = useDesignCanvas((s) => s.loadCategoryProducts);
  const loadBlankDetail = useDesignCanvas((s) => s.loadBlankDetail);
  const startDesign = useDesignCanvas((s) => s.startDesign);
  const loadBlankFromDetail = useDesignCanvas((s) => s.loadBlankFromDetail);
  const blankDetail = useDesignCanvas((s) => s.blankDetail);
  // Blank-load status — drives the "loading onto canvas" state so a
  // Design click lands on the canvas immediately (navigate-first) and
  // shows a loading panel while the blank detail fetches.
  const blankDetailStatus = useDesignCanvas((s) => s.blankDetailStatus);
  const blankDetailError = useDesignCanvas((s) => s.blankDetailError);
  const designId = useDesignCanvas((s) => s.designId);
  const selectColor = useDesignCanvas((s) => s.selectColor);
  const color = useDesignCanvas((s) => s.color);

  // ── Canvas state ──
  const [dragover, setDragover] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [tool, setTool] = useState<ToolId>('select');
  /** Sliding tool drawer — per design canvas.html spec. Opens via the
   *  floating + button. Slides in from the right (or left if docked). */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerLeft, setDrawerLeft] = useState(false);
  /** Full-page product flyout — opened from the top-nav category tabs. */
  const [flyoutOpen, setFlyoutOpen] = useState(false);
  /** Skeleton view — Photo (realistic) vs. Outline (muted). */
  const [skeletonView, setSkeletonView] = useState(false);

  // The docked panel kind lives in the STORE — sidebar clicks can set it
  // before this screen mounts. When set, the drawer opens automatically.
  const dockKind = useDesignCanvas((s) => s.canvasDock) as DockKind | null;
  const setDockKind = useCallback(
    (kind: DockKind | null) => {
      useDesignCanvas.getState().setCanvasDock(kind);
    },
    [],
  );
  // When dockKind is set (from sidebar or dock rail), open the drawer.
  useEffect(() => {
    if (dockKind) setDrawerOpen(true);
  }, [dockKind]);
  /** Expandable dock — the panel grows 340 → 480 → 620 px (left-anchored). */
  const DOCK_WIDTHS = [340, 480, 620];
  const [dockWidthIdx, setDockWidthIdx] = useState(0);
  const [dockPrimary, setDockPrimary] = useState<{ label: string; run: () => void } | null>(null);
  // Referentially stable host for the panels' `onPrimary` registration
  // effect. The old inline arrow handed every panel a NEW function each
  // render, so a panel's `useEffect(() => onPrimary(...), [onPrimary, …])`
  // re-registered on every render → setState → re-render → loop — the
  // "Maximum update depth exceeded" storm that burned CPU on the canvas.
  const handleDockPrimary = useCallback(
    (label: string, run: () => void) => setDockPrimary({ label, run }),
    [],
  );
  // Reset the panel's primary button whenever the docked kind changes.
  useEffect(() => {
    setDockPrimary(null);
  }, [dockKind]);

  // Working layers + undo/redo history.
  const [layers, setLayers] = useState<WorkLayer[]>([]);
  const [history, setHistory] = useState<WorkLayer[][]>([]);
  const [histIndex, setHistIndex] = useState(-1);
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Draft shape being drawn (svg px coords).
  const [draft, setDraft] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null);
  const dragStateRef = useRef<
    | { mode: 'draw' | 'move'; startSvg: { x: number; y: number }; layerUid?: string; orig?: { xIn: number; yIn: number } }
    | null
  >(null);

  // Loaded mockup image natural size (for the svg viewBox).
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);

  // assetId → url map (renders image layers).
  const [assetUrls, setAssetUrls] = useState<Record<string, string>>({});

  // Price quote — everything the pricing API gives us.
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);

  // Guard target: when openStudio needs a product and the session has
  // none, it sets browseOpen and the flyout (Browse Products) opens here.
  const browseOpen = useDesignCanvas((s) => s.browseOpen);
  const setBrowseOpen = useDesignCanvas((s) => s.setBrowseOpen);
  useEffect(() => {
    if (browseOpen) {
      setFlyoutOpen(true);
      setBrowseOpen(false);
    }
  }, [browseOpen, setBrowseOpen]);

  useEffect(() => {
    void loadNavCategories();
    void loadCategoryProducts();
  }, [loadNavCategories, loadCategoryProducts]);

  // ── Active view + print box ──
  const family = product?.family ?? 'tops';
  const isDrinkware = family === 'drinkware';

  // Printify skeleton — live placeholders (printable regions with their
  // exact px bounds at 300 DPI) + the per-color/view variant images that
  // become the muted skeleton shell. Loaded whenever the blank changes.
  const [skeleton, setSkeleton] = useState<BlankSkeleton | null>(null);
  useEffect(() => {
    if (!blankDetail) {
      setSkeleton(null);
      return;
    }
    let cancelled = false;
    setSkeleton(null);
    void getBlankSkeleton(blankDetail.id)
      .then((s) => {
        if (!cancelled) setSkeleton(s);
      })
      .catch(() => {
        /* pills fall back to blankDetail.printAreas — canvas never blocks */
      });
    return () => {
      cancelled = true;
    };
  }, [blankDetail]);

  // ── Lazy-first ingestion, at DESIGN time ──
  // A blank whose views are still the category archetype (source !==
  // 'stored') gets ingested the moment the canvas opens: the supplier's
  // color×view photos are harvested into OUR bucket and the blank's own
  // render-contract rows are written. When it lands, blankDetail reloads
  // and the stage flips from the hotlinked skeleton to the stored base —
  // the same base the render worker composites. Idempotent + bounded, so
  // this is fire-and-forget; the canvas never blocks on it.
  const [ingesting, setIngesting] = useState(false);
  useEffect(() => {
    if (!blankDetail) return;
    if (blankDetail.views.some((v) => v.source === 'stored')) return;
    let cancelled = false;
    setIngesting(true);
    void ingestBlank(blankDetail.id)
      .then(() => {
        if (!cancelled) return loadBlankDetail(blankDetail.id);
      })
      .catch(() => {
        /* skeleton fallback stays — preview-time ingest retries */
      })
      .finally(() => {
        if (!cancelled) setIngesting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [blankDetail?.id, blankDetail?.views.every((v) => v.source === 'stored'), loadBlankDetail]);

  // Pills ARE the placeholders — every printable region the product
  // ACTUALLY has. When blankDetail is loaded, use its printAreas (the
  // real data from the DB). When the skeleton is loaded, use its
  // placeholders. ONLY fall back to the hardcoded PRINT_AREAS[family]
  // when neither has loaded yet — and even then, the pills are just
  // placeholders for what we EXPECT, not what exists.
  //
  // CRITICAL: the old code always fell back to PRINT_AREAS[family] which
  // showed "Front matter / Back matter / Binder" for every product,
  // even ones that only have a front view. Clicking "Back" did nothing
  // because there was no back view. Now we only show pills for views
  // that ACTUALLY exist.
  const pills = useMemo(() => {
    if (skeleton && skeleton.placeholders.length > 0) {
      return skeleton.placeholders.map((p) => ({
        id: p.position.toLowerCase(),
        label: placementLabel(p.position),
      }));
    }
    if (blankDetail && blankDetail.printAreas.length > 0) {
      return blankDetail.printAreas.map((p) => ({
        id: p.placement.toLowerCase(),
        label: placementLabel(p.placement),
      }));
    }
    // No fallback — show nothing until real data arrives. This prevents
    // the user from clicking "Back" on a product that has no back view.
    return [];
  }, [skeleton, blankDetail]);

  // Keep the active pill valid (a new blank may not have the old placement).
  useEffect(() => {
    if (pills.length > 0 && !pills.some((p) => p.id === printArea)) {
      setPrintArea(pills[0].id);
    }
  }, [pills, printArea, setPrintArea]);

  const activeView = useMemo(
    () =>
      blankDetail?.views.find((v) => placementBase(v.view) === placementBase(printArea)) ??
      blankDetail?.views.find((v) => v.label.toLowerCase().includes(printArea)) ??
      blankDetail?.views[0],
    [blankDetail, printArea],
  );

  // The placeholder for the active placement — exact production px + DPI.
  const activePlaceholder = useMemo(() => {
    const fromSkeleton = skeleton?.placeholders.find(
      (p) => placementBase(p.position) === placementBase(printArea),
    );
    if (fromSkeleton) return fromSkeleton;
    const fromDetail = blankDetail?.printAreas.find(
      (p) => placementBase(p.placement) === placementBase(printArea),
    );
    if (fromDetail)
      return {
        position: fromDetail.placement,
        width: fromDetail.widthPx,
        height: fromDetail.heightPx,
        dpi: fromDetail.dpi,
      };
    return null;
  }, [skeleton, blankDetail, printArea]);

  // The muted skeleton shell: the variant image for the selected color ×
  // view (Printify variants[].images), falling back to the stored view or
  // the product mockup.
  const variantImg = useMemo(() => {
    if (!skeleton || skeleton.variantImages.length === 0) return null;
    const entry =
      skeleton.variantImages.find((v) => v.color.toLowerCase() === color.name.toLowerCase()) ??
      skeleton.variantImages[0];
    const key = Object.keys(entry.images).find(
      (k) => placementBase(k) === placementBase(printArea),
    );
    return (key ? entry.images[key] : entry.images.front) ?? skeleton.mockupUrl;
  }, [skeleton, color.name, printArea]);

  // Gallery image for the selected color × view (Printful images endpoint:
  // per-color front/back/lifestyle). Same priority as variantImg — used
  // when the blank is Printful-enriched and has no Printify skeleton.
  const galleryImg = useMemo(() => {
    const g = blankDetail?.gallery ?? [];
    if (g.length === 0) return null;
    const entry =
      g.find((x) => x.color.toLowerCase() === color.name.toLowerCase()) ?? g[0];
    const hit = entry.images.find(
      (i) => placementBase(i.placement) === placementBase(printArea),
    );
    return hit?.url ?? entry.images[0]?.url ?? null;
  }, [blankDetail, color.name, printArea]);

  // The stage base — POD-designer priority:
  // 1. The VARIANT image for the selected COLOR × VIEW (live per-color
  //    mockup). When the user clicks a color swatch or a back view, the
  //    canvas image MUST change — this is how every POD designer works.
  // 2. The STORED view (our bucket, the render base) — only when there is
  //    no variant-specific image for this color × view.
  // 3. The active view's base URL (archetype), then the product mockup.
  // The old order put the stored FRONT view first, so color clicks and
  // back-view clicks did NOTHING — the canvas never changed. Fixed.
  const canvasImg =
    variantImg ||
    galleryImg ||
    (activeView?.source === 'stored' && activeView.baseUrl) ||
    activeView?.baseUrl ||
    product?.img;
  const box = activeView?.boxIn ?? null;

  // svg px per physical inch — the view's px_per_inch scaled from its
  // coordinate canvas to the ACTUALLY loaded image's natural size. Stored
  // views carry canvasPx null: their coordinates are already image-native,
  // so px_per_inch applies 1:1.
  const ppi = useMemo(() => {
    if (!activeView || !imgSize) return 100;
    const c = activeView.canvasPx;
    const base = activeView.pxPerInch || 100;
    if (!c || c.w <= 0 || imgSize.w <= 0) return base;
    return base * (imgSize.w / c.w);
  }, [activeView, imgSize]);

  // The view's print zone scaled into the loaded image's coordinate space
  // (1:1 for stored views whose zone px live on the stored image itself).
  const viewBoxRect = useMemo(() => {
    if (!activeView?.boxPx || !imgSize) return null;
    const c = activeView.canvasPx;
    const sx = c && c.w > 0 ? imgSize.w / c.w : 1;
    const sy = c && c.h > 0 ? imgSize.h / c.h : 1;
    const b = activeView.boxPx;
    return { left: b.left * sx, top: b.top * sy, width: b.width * sx, height: b.height * sy };
  }, [activeView, imgSize]);

  /** The bounding box. Exact view match → the scaled print zone. No view
   *  for the placement (sleeve / chest / neck) → a box with the
   *  placeholder's real print inches, anchored where that region sits. */
  const printRect = useMemo(() => {
    if (!imgSize) return null;
    const base = placementBase(printArea);
    const viewBase = activeView ? placementBase(activeView.view) : '';
    if (
      viewBase === base &&
      viewBoxRect &&
      viewBoxRect.width > 4 &&
      viewBoxRect.height > 4
    ) {
      return viewBoxRect;
    }
    if (activePlaceholder && activePlaceholder.width > 0 && activePlaceholder.height > 0 && ppi > 0) {
      const dpi = activePlaceholder.dpi || 300;
      let w = (activePlaceholder.width / dpi) * ppi;
      let h = (activePlaceholder.height / dpi) * ppi;
      w = Math.min(w, imgSize.w * 0.55);
      h = Math.min(h, imgSize.h * 0.62);
      const host = viewBoxRect;
      let left: number;
      let top: number;
      if (base === 'left_sleeve') {
        left = host ? host.left - w * 0.15 : imgSize.w * 0.06;
        top = host ? host.top + host.height * 0.05 : imgSize.h * 0.24;
      } else if (base === 'right_sleeve') {
        left = host ? host.left + host.width + w * 0.15 - w : imgSize.w * 0.94 - w;
        top = host ? host.top + host.height * 0.05 : imgSize.h * 0.24;
      } else if (base === 'neck' || base === 'label' || base === 'inside_label') {
        left = imgSize.w / 2 - w / 2;
        top = imgSize.h * 0.06;
      } else if (base.includes('chest')) {
        const cx = base.startsWith('left') ? 0.34 : 0.66;
        left = host ? host.left + host.width * cx - w / 2 : imgSize.w * cx - w / 2;
        top = host ? host.top + host.height * 0.1 : imgSize.h * 0.2;
      } else {
        left = host ? host.left + (host.width - w) / 2 : (imgSize.w - w) / 2;
        top = host ? host.top + host.height * 0.08 : imgSize.h * 0.18;
      }
      return { left, top, width: w, height: h };
    }
    const w = imgSize.w * 0.36;
    const h = imgSize.h * 0.5;
    return { left: (imgSize.w - w) / 2, top: (imgSize.h - h) / 2, width: w, height: h };
  }, [activeView, activePlaceholder, viewBoxRect, ppi, imgSize, printArea]);

  // Bounding-box label: the real print inches + Printify's production px.
  const boxLabel = useMemo(() => {
    if (activePlaceholder && activePlaceholder.width > 0 && activePlaceholder.height > 0) {
      const dpi = activePlaceholder.dpi || 300;
      return `${(activePlaceholder.width / dpi).toFixed(1)}×${(activePlaceholder.height / dpi).toFixed(1)} in · ${activePlaceholder.width}×${activePlaceholder.height}px @ ${dpi} DPI`;
    }
    if (box) return `${box.wIn}×${box.hIn} in`;
    return 'Print area';
  }, [activePlaceholder, box]);

  // The print box in INCHES — every placed/moved/drawn layer is clamped to
  // it. A print-on-demand canvas only prints inside the print area, so
  // nothing may be created, dragged, or drawn outside it. This is what
  // killed the "giant text spanning the whole canvas" defect.
  const printBoxIn = useMemo(() => {
    if (!printRect || ppi <= 0) return null;
    return {
      xIn: printRect.left / ppi,
      yIn: printRect.top / ppi,
      wIn: printRect.width / ppi,
      hIn: printRect.height / ppi,
    };
  }, [printRect, ppi]);

  /** Keep a layer's top-left so the layer stays fully inside the print box. */
  const clampIntoBox = useCallback(
    (xIn: number, yIn: number, wIn: number, hIn: number): { xIn: number; yIn: number } => {
      const b = printBoxIn;
      if (!b) return { xIn, yIn };
      const w = Math.min(wIn, b.wIn);
      const h = Math.min(hIn, b.hIn);
      return {
        xIn: Math.min(Math.max(xIn, b.xIn), b.xIn + b.wIn - w),
        yIn: Math.min(Math.max(yIn, b.yIn), b.yIn + b.hIn - h),
      };
    },
    [printBoxIn],
  );

  /** Cap a layer's size so it fits inside the print box (keeps aspect). */
  const fitToBox = useCallback(
    (wIn: number, hIn: number): { wIn: number; hIn: number } => {
      const b = printBoxIn;
      if (!b) return { wIn, hIn };
      const s = Math.min(1, b.wIn / Math.max(wIn, 0.01), b.hIn / Math.max(hIn, 0.01));
      return { wIn: wIn * s, hIn: hIn * s };
    },
    [printBoxIn],
  );

  // DPI for the active placement (from printAreas, matched by view name).
  const activeDpi = useMemo(() => {
    if (activePlaceholder) {
      return `${activePlaceholder.width}×${activePlaceholder.height}px @ ${activePlaceholder.dpi} DPI`;
    }
    if (!blankDetail) return null;
    const pa =
      blankDetail.printAreas.find((p) => p.placement.toLowerCase() === printArea) ??
      blankDetail.printAreas.find((p) => p.placement.toLowerCase() === (activeView?.view ?? '').toLowerCase()) ??
      blankDetail.printAreas[0];
    return pa ? `${pa.widthPx}×${pa.heightPx}px @ ${pa.dpi} DPI` : null;
  }, [activePlaceholder, blankDetail, printArea, activeView]);

  // ── Data loading ──

  // Price quote for the loaded blank (base cost, printer, delivery, suggestion).
  useEffect(() => {
    if (!blankDetail) {
      setQuote(null);
      setQuoteError(null);
      return;
    }
    let cancelled = false;
    setQuote(null);
    setQuoteError(null);
    void getBlankPrice(blankDetail.id)
      .then((q) => {
        if (!cancelled) setQuote(q);
      })
      .catch((e: Error) => {
        if (!cancelled) setQuoteError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [blankDetail]);

  // Design layers from the API + asset url map.
  const refreshDesign = useCallback(async () => {
    if (!designId) {
      setLayers([]);
      return;
    }
    try {
      const { design } = await getDesign(designId);
      const spec = design.placementSpec;
      setLayers((prev) => {
        // Keep unsaved local layers if the API snapshot is behind.
        const apiLayers = (spec?.layers ?? []).map((l) => ({ ...l, uid: `api-${l.assetId ?? l.kind}-${l.xIn}-${l.yIn}-${l.wIn}` }));
        return apiLayers.length > 0 ? apiLayers : prev;
      });
    } catch {
      /* keep whatever is on the canvas */
    }
  }, [designId]);

  const refreshAssets = useCallback(async () => {
    try {
      const { assets } = await listAssets({ limit: 200 });
      const map: Record<string, string> = {};
      for (const a of assets) if (a.url) map[a.id] = a.url;
      setAssetUrls(map);
    } catch {
      /* layers without urls render a placeholder */
    }
  }, []);

  useEffect(() => {
    void refreshDesign();
    void refreshAssets();
  }, [refreshDesign, refreshAssets]);

  // Any drawer panel that saves a layer (upload / AI / images / graphics)
  // dispatches studio-layer-saved — refresh so the canvas shows it.
  useEffect(() => {
    const handler = () => {
      void refreshDesign();
      void refreshAssets();
    };
    window.addEventListener('studio-layer-saved', handler);
    return () => window.removeEventListener('studio-layer-saved', handler);
  }, [refreshDesign, refreshAssets]);

  // ── History helpers ──
  const commit = useCallback((next: WorkLayer[]) => {
    setLayers(next);
    setHistory((h) => {
      const trimmed = h.slice(0, histIndexRef.current + 1);
      trimmed.push(next);
      return trimmed.slice(-40);
    });
    setHistIndex((i) => Math.min(i + 1, 39));
  }, []);
  const histIndexRef = useRef(-1);
  useEffect(() => {
    histIndexRef.current = histIndex;
  }, [histIndex]);

  const undo = useCallback(() => {
    const i = histIndexRef.current;
    if (i <= 0) return;
    setLayers(history[i - 1]);
    setHistIndex(i - 1);
  }, [history]);
  const redo = useCallback(() => {
    const i = histIndexRef.current;
    if (i >= history.length - 1) return;
    setLayers(history[i + 1]);
    setHistIndex(i + 1);
  }, [history]);

  // ── Coordinate conversion ──
  const stageRef = useRef<HTMLDivElement | null>(null);
  const toSvg = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const el = stageRef.current;
      if (!el || !imgSize) return null;
      const r = el.getBoundingClientRect();
      return {
        x: ((clientX - r.left) / r.width) * imgSize.w,
        y: ((clientY - r.top) / r.height) * imgSize.h,
      };
    },
    [imgSize],
  );

  // ── Layer factory (inches, view-absolute) ──
  const makeShapeLayer = useCallback(
    (render: WorkLayer['render'], x1: number, y1: number, x2: number, y2: number, color: string): WorkLayer | null => {
      if (!imgSize) return null;
      let xIn = Math.min(x1, x2) / ppi;
      let yIn = Math.min(y1, y2) / ppi;
      let wIn = Math.max(Math.abs(x2 - x1) / ppi, 0.25);
      let hIn = Math.max(Math.abs(y2 - y1) / ppi, 0.25);
      // Clamp the drawn shape into the print box — a drag that starts or
      // ends outside the print area still produces a layer INSIDE it.
      const b = printBoxIn;
      if (b) {
        if (wIn > b.wIn) {
          xIn = b.xIn;
          wIn = b.wIn;
        }
        if (hIn > b.hIn) {
          yIn = b.yIn;
          hIn = b.hIn;
        }
        const right = Math.min(Math.max(xIn + wIn, b.xIn + 0.25), b.xIn + b.wIn);
        const bottom = Math.min(Math.max(yIn + hIn, b.yIn + 0.25), b.yIn + b.hIn);
        xIn = Math.min(Math.max(xIn, b.xIn), b.xIn + b.wIn - 0.25);
        yIn = Math.min(Math.max(yIn, b.yIn), b.yIn + b.hIn - 0.25);
        wIn = Math.max(right - xIn, 0.25);
        hIn = Math.max(bottom - yIn, 0.25);
      }
      return {
        uid: uid(),
        kind: 'shape',
        render,
        fill: color,
        view: activeView?.view ?? 'FRONT',
        xIn,
        yIn,
        wIn,
        hIn,
        rotationDeg: 0,
        z: layers.length + 1,
      };
    },
    [imgSize, ppi, activeView, layers.length, printBoxIn],
  );

  const placeShapeAt = useCallback(
    (render: WorkLayer['render'], svg: { x: number; y: number }, color: string) => {
      // Default size relative to the print box (≈40% of its smaller side).
      const b = printBoxIn;
      const sizeIn = b ? Math.min(2.5, b.wIn * 0.4, b.hIn * 0.4) : 2.5;
      const size = sizeIn * ppi;
      const layer = makeShapeLayer(render, svg.x - size / 2, svg.y - size / 2, svg.x + size / 2, svg.y + size / 2, color);
      if (layer) {
        commit([...layers, layer]);
        setSelectedUid(layer.uid);
      }
    },
    [makeShapeLayer, commit, layers, printBoxIn, ppi],
  );

  // Dock callbacks — panels place layers locally (instant, visible).
  const handlePlaceShape = useCallback(
    (shape: StudioShape, color: string) => {
      if (!imgSize) {
        onToast('Load a product first — the print area defines where shapes can go.');
        return;
      }
      const cx = printRect ? printRect.left + printRect.width / 2 : imgSize.w / 2;
      const cy = printRect ? printRect.top + printRect.height / 2 : imgSize.h / 2;
      placeShapeAt(shape.render, { x: cx, y: cy }, color);
      onToast(`${shape.label} placed — drag to move, Delete to remove.`);
    },
    [imgSize, printRect, placeShapeAt, onToast],
  );

  const handlePlaceText = useCallback(
    (value: string, font: string, sizePt: number) => {
      if (!imgSize) {
        onToast('Load a product first — the print area defines where text can go.');
        return;
      }
      const cx = printRect ? printRect.left + printRect.width / 2 : imgSize.w / 2;
      const cy = printRect ? printRect.top + printRect.height / 2 : imgSize.h / 2;
      // Text size is proportional to the PRINT BOX, not fixed points: the
      // same "heading" preset lands correctly on a 12in front print and a
      // 4in chest print, and can never dwarf the product.
      const sizeIn = printBoxIn
        ? Math.max(0.2, printBoxIn.hIn * 0.16 * (sizePt / 32))
        : sizePt / 72;
      const wIn = printBoxIn ? Math.min(printBoxIn.wIn * 0.8, 8) : 4;
      const hIn = Math.max(sizeIn * 2, 0.4);
      const placed = clampIntoBox(
        (cx - (wIn * ppi) / 2) / ppi,
        (cy - (sizeIn * ppi)) / ppi,
        wIn,
        hIn,
      );
      const layer: WorkLayer = {
        uid: uid(),
        kind: 'text',
        text: { value, fontId: font, sizeIn, fill: '#111111' },
        view: activeView?.view ?? 'FRONT',
        xIn: placed.xIn,
        yIn: placed.yIn,
        wIn,
        hIn,
        rotationDeg: 0,
        z: layers.length + 1,
      };
      commit([...layers, layer]);
      setSelectedUid(layer.uid);
      onToast(`Text "${value}" placed.`);
    },
    [imgSize, printRect, printBoxIn, activeView, ppi, layers.length, commit, onToast, clampIntoBox],
  );

  const handleApplyTheme = useCallback(
    (theme: StudioTheme) => {
      // Recolor shape + text layers round-robin with the palette.
      let i = 0;
      const next = layers.map((l) => {
        if (l.kind === 'shape') {
          const fill = theme.colors[i++ % theme.colors.length];
          return { ...l, fill };
        }
        return l;
      });
      commit(next);
      onToast(`Theme "${theme.name}" applied — ${theme.fontPair}.`);
    },
    [layers, commit, onToast],
  );

  // ── Pointer interactions on the canvas ──
  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const p = toSvg(e.clientX, e.clientY);
    if (!p) return;
    if (tool === 'select') {
      setSelectedUid(null);
      return;
    }
    setSelectedUid(null);
    dragStateRef.current = { mode: 'draw', startSvg: p };
    setDraft({ x1: p.x, y1: p.y, x2: p.x, y2: p.y });
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    if (!drag) return;
    const p = toSvg(e.clientX, e.clientY);
    if (!p) return;
    if (drag.mode === 'draw') {
      setDraft((d) => (d ? { ...d, x2: p.x, y2: p.y } : d));
    } else if (drag.mode === 'move' && drag.layerUid && drag.orig) {
      const dxIn = (p.x - drag.startSvg.x) / ppi;
      const dyIn = (p.y - drag.startSvg.y) / ppi;
      setLayers((prev) =>
        prev.map((l) => {
          if (l.uid !== drag.layerUid) return l;
          // Moves stay inside the print box — layers cannot be dragged off
          // the printable area.
          const c = clampIntoBox((drag.orig?.xIn ?? 0) + dxIn, (drag.orig?.yIn ?? 0) + dyIn, l.wIn, l.hIn);
          return { ...l, xIn: c.xIn, yIn: c.yIn };
        }),
      );
    }
  };

  const onPointerUp = () => {
    const drag = dragStateRef.current;
    dragStateRef.current = null;
    if (drag?.mode === 'move') {
      // Commit the moved state to history.
      commit(layers);
      return;
    }
    const d = draft;
    setDraft(null);
    if (!d || !imgSize) return;

    // Zero-size click with a text tool → open the Text dock.
    if (tool === 'text') {
      const p = { x: (d.x1 + d.x2) / 2, y: (d.y1 + d.y2) / 2 };
      // Heading-size text proportional to the print box, placed where the
      // user clicked (clamped inside the print area).
      const sizeIn = printBoxIn ? Math.max(0.2, printBoxIn.hIn * 0.2) : 48 / 72;
      const wIn = printBoxIn ? Math.min(printBoxIn.wIn * 0.8, 8) : 4;
      const hIn = Math.max(sizeIn * 2, 0.4);
      const placed = clampIntoBox(p.x / ppi - wIn / 2, p.y / ppi - sizeIn, wIn, hIn);
      const layer: WorkLayer = {
        uid: uid(),
        kind: 'text',
        text: { value: 'Your text', fontId: 'Inter', sizeIn, fill: '#111111' },
        view: activeView?.view ?? 'FRONT',
        xIn: placed.xIn,
        yIn: placed.yIn,
        wIn,
        hIn,
        rotationDeg: 0,
        z: layers.length + 1,
      };
      commit([...layers, layer]);
      setSelectedUid(layer.uid);
      setDockKind('Text');
      onToast('Text layer placed — edit the words in the Text panel.');
      return;
    }

    const renderByTool: Record<string, WorkLayer['render']> = {
      rect: 'rect',
      ellipse: 'ellipse',
      triangle: 'triangle',
      line: 'line',
      arrow: 'arrow',
    };
    const render = renderByTool[tool];
    if (!render) return; // 'draw' freehand → treated as a line for v1
    const layer = makeShapeLayer(render, d.x1, d.y1, d.x2, d.y2, '#111111');
    if (layer) {
      commit([...layers, layer]);
      setSelectedUid(layer.uid);
    }
  };

  const startMoveLayer = (e: ReactPointerEvent<SVGElement>, layer: WorkLayer) => {
    if (tool !== 'select') return;
    e.stopPropagation();
    const p = toSvg(e.clientX, e.clientY);
    if (!p) return;
    setSelectedUid(layer.uid);
    dragStateRef.current = { mode: 'move', startSvg: p, layerUid: layer.uid, orig: { xIn: layer.xIn, yIn: layer.yIn } };
  };

  const deleteSelected = useCallback(() => {
    if (!selectedUid) return;
    commit(layers.filter((l) => l.uid !== selectedUid));
    setSelectedUid(null);
  }, [selectedUid, layers, commit]);

  // Keyboard: Delete removes the selection; Esc clears it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedUid) {
        e.preventDefault();
        deleteSelected();
      }
      if (e.key === 'Escape') setSelectedUid(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedUid, deleteSelected]);

  // ── Drops from the dock / drawer panels ──
  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragover(false);
    const svg = toSvg(e.clientX, e.clientY);
    // Catalog thumbnails drag a blank-type + catalog-product-id.
    const blankType = e.dataTransfer.getData('blank-type');
    if (blankType && BLANKS[blankType]) {
      loadBlank(blankType);
      onToast(`${BLANKS[blankType].name} loaded onto canvas.`);
      return;
    }
    if (!svg) return;
    // Inspiration drop — a Wikimedia Commons image (JSON: url/title/dims).
    // Downloaded, uploaded as an asset, then placed — the same path every
    // other image takes, so it saves into the design's placement spec. If
    // the download is rate-limited, a local preview layer renders from the
    // remote URL so the user still sees the design.
    const inspirationData = e.dataTransfer.getData('studio-inspiration');
    if (inspirationData) {
      void (async () => {
        let info: {
          url: string;
          title: string;
          width: number | null;
          height: number | null;
          thumbUrl?: string;
        };
        try {
          info = JSON.parse(inspirationData);
        } catch {
          return;
        }
        let wIn = info.width ? Math.min(info.width / 300, 6) : 4;
        let hIn = info.height ? Math.min(info.height / 300, 6) : 4;
        ({ wIn, hIn } = fitToBox(wIn, hIn));
        const dropPos = clampIntoBox(
          (svg.x - (wIn * ppi) / 2) / ppi,
          (svg.y - (hIn * ppi) / 2) / ppi,
          wIn,
          hIn,
        );
        const localLayer: WorkLayer = {
          uid: uid(),
          kind: 'image',
          view: activeView?.view ?? 'FRONT',
          xIn: dropPos.xIn,
          yIn: dropPos.yIn,
          wIn,
          hIn,
          rotationDeg: 0,
          z: layers.length + 1,
        };
        try {
          const asset = await uploadCommonsImage(info, designId);
          const layer: WorkLayer = { ...localLayer, assetId: asset.id };
          if (designId) {
            try {
              await appendPlacementLayer(designId, layer);
              await refreshDesign();
              onToast('Inspiration image saved to the design.');
            } catch {
              commit([...layers, layer]);
              onToast('Placed locally (could not save).');
            }
          } else {
            commit([...layers, layer]);
            onToast('Inspiration placed — load a product to save the design.');
          }
          await refreshAssets();
        } catch {
          // Download blocked (429/403) — place a remote preview layer.
          commit([...layers, { ...localLayer, remoteUrl: info.thumbUrl ?? info.url }]);
          onToast('Commons download was limited — placed a preview. Retry “Add to canvas” later to save it.');
        }
      })();
      return;
    }
    // Shape drop: "shapeId:color".
    const shapeData = e.dataTransfer.getData('studio-shape');
    if (shapeData) {
      const [shapeId, color = '#111111'] = shapeData.split(':');
      placeShapeAt(shapeRender(shapeId), svg, color);
      onToast(`${shapeId} placed on the canvas.`);
      return;
    }
    // Theme drop — apply the palette.
    const themeId = e.dataTransfer.getData('studio-theme');
    if (themeId) {
      const theme = STUDIO_THEMES.find((t) => t.id === themeId);
      if (theme) handleApplyTheme(theme);
      return;
    }
    // Text drop: "Add a heading" style presets.
    const textPreset = e.dataTransfer.getData('studio-text');
    if (textPreset) {
      const sizePt = textPreset.includes('heading') && !textPreset.includes('sub') ? 48 : textPreset.includes('sub') ? 28 : 16;
      handlePlaceText(textPreset, 'Inter', sizePt);
      return;
    }
    // Font drop — place sample text in that font.
    const font = e.dataTransfer.getData('studio-font');
    if (font) {
      handlePlaceText(font, font, 36);
      return;
    }
    // Image / graphic asset drops — persist through the API when a draft exists.
    const asset = e.dataTransfer.getData('studio-asset');
    if (asset) {
      void (async () => {
        const url = assetUrls[asset] ?? Object.values(assetUrls)[0];
        // Size capped to the print box, position clamped inside it.
        const { wIn: dropW, hIn: dropH } = fitToBox(3, 3);
        const dropPos = clampIntoBox(
          (svg.x - (dropW * ppi) / 2) / ppi,
          (svg.y - (dropH * ppi) / 2) / ppi,
          dropW,
          dropH,
        );
        const layer: WorkLayer = {
          uid: uid(),
          kind: 'image',
          assetId: asset,
          view: activeView?.view ?? 'FRONT',
          xIn: dropPos.xIn,
          yIn: dropPos.yIn,
          wIn: dropW,
          hIn: dropH,
          rotationDeg: 0,
          z: layers.length + 1,
        };
        if (designId) {
          try {
            await appendPlacementLayer(designId, layer);
            await refreshDesign();
            onToast('Image layer saved to the design.');
          } catch (err) {
            commit([...layers, layer]);
            onToast(`Placed locally (could not save): ${err instanceof Error ? err.message : 'failed'}`);
          }
        } else {
          commit([...layers, layer]);
          onToast(url ? 'Image placed — load a product to save the design.' : 'Asset placed (preview unavailable).');
        }
      })();
      return;
    }
    // Template drop — copy its placement onto this design.
    const templateId = e.dataTransfer.getData('studio-template');
    if (templateId) {
      if (!designId) {
        onToast('Start designing from a product first — then drop the template.');
        return;
      }
      void applyTemplate(templateId, designId)
        .then(() => refreshDesign())
        .then(() => onToast('Template applied to this design.'))
        .catch((err: Error) => onToast(err.message));
      return;
    }
  };

  const handleToolClick = (t: (typeof TOOLS)[number]) => {
    // Route tools open their panel — an on-canvas tool that routes to what
    // the user needs (Upload / AI / Images).
    if (t.route) {
      setTool('select');
      if (t.dock) setDockKind(t.dock);
      onToast(`${t.label} — opened the ${t.dock} panel.`);
      return;
    }
    setTool(t.id);
    if (t.dock) setDockKind(t.dock);
    if (t.id === 'select') return;
    onToast(
      t.dock
        ? `${t.label} tool armed — drag on the canvas to draw, or use the ${t.dock} panel.`
        : `${t.label} tool armed — drag on the canvas.`,
    );
  };

  // ── Save: PATCH the whole placement spec (API + local layers). ──
  // The spec serializer is shared by the explicit Save button AND the
  // Preview/Publish transitions — navigating to the preview used to drop
  // unsaved local layers on the floor, so the "actual preview" rendered an
  // EMPTY design. Auto-save before the handoff is what makes the preview
  // show the real thing.
  const persistLayers = useCallback(async (): Promise<boolean> => {
    if (!designId) return false;
    await saveDesign(designId, {
      placementSpec: {
        version: 1,
        layers: layers.map(({ uid: _uid, render, fill, remoteUrl, ...rest }) => ({
          ...rest,
          ...(render ? { render } : {}),
          ...(fill ? { fill } : {}),
        })),
      },
    });
    return true;
  }, [designId, layers]);

  const handleSave = async () => {
    if (!designId) {
      onToast('Nothing to save — load a product and start designing first.');
      return;
    }
    if (layers.length === 0) {
      onToast('The canvas is empty — place a layer first.');
      return;
    }
    setSaving(true);
    try {
      await persistLayers();
      onToast(`Saved ${layers.length} layer${layers.length === 1 ? '' : 's'} to the design draft.`);
    } catch (e) {
      onToast(`Save failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setSaving(false);
    }
  };

  // Preview & Publish: persist the local layers FIRST, then navigate —
  // the render pipeline reads the saved spec, never the local canvas.
  const handlePreviewPublish = () => {
    void (async () => {
      if (designId && layers.length > 0) {
        try {
          await persistLayers();
        } catch (e) {
          onToast(
            `Could not save before preview: ${e instanceof Error ? e.message : 'unknown error'} — previewing the last saved state.`,
          );
        }
      }
      onNavigate('design', 'design-preview');
    })();
  };

  const selectedLayer = layers.find((l) => l.uid === selectedUid) ?? null;

  // ── Render one work layer inside the svg ──
  const renderLayer = (l: WorkLayer) => {
    let x = l.xIn * ppi;
    let y = l.yIn * ppi;
    let w = l.wIn * ppi;
    let h = l.hIn * ppi;
    // RENDER-TIME CLAMP: whatever a layer's saved spec says, it draws inside
    // the print box. Legacy/oversized layers can never spill over the
    // product or the app chrome again.
    if (printRect) {
      if (w > printRect.width) {
        x = printRect.left;
        w = printRect.width;
      }
      if (h > printRect.height) {
        y = printRect.top;
        h = printRect.height;
      }
      x = Math.min(Math.max(x, printRect.left), printRect.left + printRect.width - Math.min(w, printRect.width));
      y = Math.min(Math.max(y, printRect.top), printRect.top + printRect.height - Math.min(h, printRect.height));
    }
    const sel = l.uid === selectedUid;
    const stroke = sel ? '#0a6400' : 'transparent';
    const commonProps = {
      onPointerDown: (e: ReactPointerEvent<SVGElement>) => startMoveLayer(e, l),
      style: { cursor: tool === 'select' ? 'move' : 'crosshair' } as React.CSSProperties,
    };
    if (l.kind === 'text' && l.text) {
      // Text can never be taller than the (clamped) layer box.
      const fontSize = Math.min(l.text.sizeIn * ppi, h);
      return (
        <g key={l.uid} {...commonProps}>
          <text
            x={x}
            y={Math.min(y + fontSize, y + h)}
            fontFamily={`${l.text.fontId}, Inter, system-ui, sans-serif`}
            fontSize={fontSize}
            fill={l.text.fill}
          >
            {l.text.value}
          </text>
          <rect x={x - 4} y={y - 2} width={Math.max(w, 40)} height={h + 4} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="4 3" />
        </g>
      );
    }
    if (l.kind === 'image') {
      const url = l.remoteUrl ?? (l.assetId ? assetUrls[l.assetId] : undefined);
      return (
        <g key={l.uid} {...commonProps}>
          {url ? (
            <image href={url} x={x} y={y} width={w} height={h} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <rect x={x} y={y} width={w} height={h} fill="#e8e2f4" stroke="#b0a8cc" strokeDasharray="4 3" />
          )}
          <rect x={x - 2} y={y - 2} width={w + 4} height={h + 4} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="4 3" />
        </g>
      );
    }
    // Shape layers — render by hint, fall back to rect.
    const fill = l.fill ?? '#111111';
    const shapeStroke = fill === '#ffffff' ? '#111111' : fill;
    let node: React.ReactNode = null;
    switch (l.render) {
      case 'ellipse':
        node = <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill={fill} />;
        break;
      case 'triangle':
        node = <polygon points={`${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`} fill={fill} />;
        break;
      case 'line':
        node = <line x1={x} y1={y + h / 2} x2={x + w} y2={y + h / 2} stroke={shapeStroke} strokeWidth={Math.max(3, h / 6)} strokeLinecap="round" />;
        break;
      case 'arrow':
        node = (
          <g>
            <line x1={x} y1={y + h / 2} x2={x + w * 0.75} y2={y + h / 2} stroke={shapeStroke} strokeWidth={Math.max(3, h / 6)} strokeLinecap="round" />
            <polygon points={`${x + w * 0.7},${y + h * 0.2} ${x + w},${y + h / 2} ${x + w * 0.7},${y + h * 0.8}`} fill={fill} />
          </g>
        );
        break;
      case 'star':
        node = (
          <polygon
            points={`${x + w / 2},${y} ${x + w * 0.61},${y + h * 0.35} ${x + w},${y + h * 0.38} ${x + w * 0.7},${y + h * 0.62} ${x + w * 0.79},${y + h} ${x + w / 2},${y + h * 0.78} ${x + w * 0.21},${y + h} ${x + w * 0.3},${y + h * 0.62} ${x},${y + h * 0.38} ${x + w * 0.39},${y + h * 0.35}`}
            fill={fill}
          />
        );
        break;
      case 'heart':
        node = <path d={`M ${x + w / 2} ${y + h} C ${x} ${y + h * 0.6} ${x + w * 0.05} ${y + h * 0.15} ${x + w / 2} ${y + h * 0.32} C ${x + w * 0.95} ${y + h * 0.15} ${x + w} ${y + h * 0.6} ${x + w / 2} ${y + h} Z`} fill={fill} />;
        break;
      case 'ring':
        node = <circle cx={x + w / 2} cy={y + h / 2} r={Math.min(w, h) / 2} fill="none" stroke={shapeStroke} strokeWidth={Math.max(3, Math.min(w, h) / 6)} />;
        break;
      case 'diamond':
        node = <polygon points={`${x + w / 2},${y} ${x + w},${y + h / 2} ${x + w / 2},${y + h} ${x},${y + h / 2}`} fill={fill} />;
        break;
      case 'rectRound':
        node = <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 4} fill={fill} />;
        break;
      default:
        node = <rect x={x} y={y} width={w} height={h} fill={fill} />;
    }
    return (
      <g key={l.uid} {...commonProps}>
        {node}
        <rect x={x - 3} y={y - 3} width={w + 6} height={h + 6} fill="none" stroke={stroke} strokeWidth={2} strokeDasharray="4 3" />
      </g>
    );
  };

  // Draft preview (while dragging a shape out).
  const renderDraft = () => {
    if (!draft) return null;
    const x = Math.min(draft.x1, draft.x2);
    const y = Math.min(draft.y1, draft.y2);
    const w = Math.abs(draft.x2 - draft.x1);
    const h = Math.abs(draft.y2 - draft.y1);
    if (tool === 'ellipse') return <ellipse cx={x + w / 2} cy={y + h / 2} rx={w / 2} ry={h / 2} fill="rgba(10,100,0,0.25)" stroke="#0a6400" strokeDasharray="5 4" />;
    if (tool === 'line') return <line x1={draft.x1} y1={draft.y1} x2={draft.x2} y2={draft.y2} stroke="#0a6400" strokeWidth={4} strokeLinecap="round" />;
    if (tool === 'arrow') {
      const dx = draft.x2 - draft.x1;
      const dy = draft.y2 - draft.y1;
      const len = Math.max(Math.hypot(dx, dy), 1);
      const ux = dx / len;
      const uy = dy / len;
      return (
        <g>
          <line x1={draft.x1} y1={draft.y1} x2={draft.x2 - ux * 14} y2={draft.y2 - uy * 14} stroke="#0a6400" strokeWidth={4} strokeLinecap="round" />
          <polygon
            points={`${draft.x2},${draft.y2} ${draft.x2 - ux * 16 - uy * 7},${draft.y2 - uy * 16 + ux * 7} ${draft.x2 - ux * 16 + uy * 7},${draft.y2 - uy * 16 - ux * 7}`}
            fill="#0a6400"
          />
        </g>
      );
    }
    if (tool === 'triangle') return <polygon points={`${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}`} fill="rgba(10,100,0,0.25)" stroke="#0a6400" strokeDasharray="5 4" />;
    if (tool === 'draw') return <line x1={draft.x1} y1={draft.y1} x2={draft.x2} y2={draft.y2} stroke="#0a6400" strokeWidth={3} strokeLinecap="round" />;
    if (tool === 'text') return <rect x={x} y={y} width={Math.max(w, 12)} height={Math.max(h, 12)} fill="none" stroke="#0a6400" strokeDasharray="5 4" />;
    return <rect x={x} y={y} width={w} height={h} fill="rgba(10,100,0,0.25)" stroke="#0a6400" strokeDasharray="5 4" />;
  };

  return (
    <div className={styles.root}>
      {/* TOP BAR NAVIGATION — RESTORED from git (924d5db): Studio logo +
          category tabs + Design Queue. No tabs cramping the canvas — the
          canvas itself stays clean. */}
      <header className={styles.topNav}>
        <div className={styles.navLogo}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>palette</span>
          Studio
        </div>
        <nav className={styles.navLinks} aria-label="Catalog categories">
          {Object.keys(navMap).map((category) => (
            <button
              key={category}
              type="button"
              className={styles.navBtn}
              onClick={() => {
                setCategory(category, navMap[category][0]);
                setFlyoutOpen(true);
              }}
            >
              {category}
            </button>
          ))}
        </nav>
        {/* Design Queue button with badge */}
        <button
          type="button"
          className={styles.queueBtn}
          onClick={() => {
            if (designQueue.length > 0) {
              window.dispatchEvent(new CustomEvent('open-studio-queue'));
            } else {
              setFlyoutOpen(true);
              onToast('Pick products from the catalog to fill the queue.');
            }
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>playlist_add</span>
          Design Queue
          {designQueue.length > 0 && <span className={styles.queueBadge}>{designQueue.length}</span>}
        </button>
      </header>

      {/* CANVAS TOP TOOLBAR — restored from 058f6c6. Per spec: undo/redo |
          Edit/Preview | Photo/Outline | ? | Save | Preview & Publish.
          This is the "preview bar" at the top of the canvas. The old
          bottomBar duplicated these same buttons — it's gone now. */}
      <header className={styles.topToolbar}>
        <div className={styles.topToolbarLeft}>
          <button className={styles.topBtn} title="Undo" onClick={undo} disabled={histIndex <= 0}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>undo</span>
          </button>
          <button className={styles.topBtn} title="Redo" onClick={redo} disabled={histIndex >= history.length - 1}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>redo</span>
          </button>
          <span className={styles.topProductName}>{product ? product.name : 'No product selected'}</span>
        </div>

        <div className={styles.topToolbarCenter}>
          <div className={styles.segGroup}>
            <button className={`${styles.segBtn2} ${styles.segOn}`}>Edit</button>
            <button className={styles.segBtn2} onClick={handlePreviewPublish}>Preview</button>
          </div>
          <div className={styles.segDivider} />
          <div className={styles.segGroup}>
            <button className={`${styles.segBtn2} ${!skeletonView ? styles.segOn : ''}`} onClick={() => setSkeletonView(false)}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>photo</span> Photo
            </button>
            <button className={`${styles.segBtn2} ${skeletonView ? styles.segOn : ''}`} onClick={() => setSkeletonView(true)}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>grid_on</span> Outline
            </button>
          </div>
          <button className={styles.helpBtn} title="Help">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>question_mark</span>
          </button>
        </div>

        <div className={styles.topToolbarRight}>
          <button className={styles.saveBtn2} onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : `Save${layers.length > 0 ? ` (${layers.length})` : ''}`}
          </button>
          <button className={styles.publishBtn3} onClick={handlePreviewPublish}>Preview & Publish</button>
        </div>
      </header>

      {/* FULL-PAGE PRODUCT FLYOUT — RESTORED from git (924d5db) */}
      {flyoutOpen && (
        <div className={styles.flyoutOverlay} onClick={() => setFlyoutOpen(false)}>
          <div className={styles.flyoutPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.flyoutHeader}>
              <div className={styles.flyoutHeaderLeft}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>inventory_2</span>
                <h2>{activeCategory} — Browse Products</h2>
              </div>
              <button type="button" className={styles.flyoutClose} onClick={() => setFlyoutOpen(false)}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>
            <div className={styles.flyoutBody}>
              <div className={styles.flyoutSidebar}>
                <div className={styles.flyoutSubList}>
                  {navMap[activeCategory]?.map((sub) => (
                    <button
                      key={sub}
                      type="button"
                      className={`${styles.flyoutSubItem} ${activeSubcategory === sub ? styles.flyoutSubActive : ''}`}
                      onClick={() => setCategory(activeCategory, sub)}
                    >
                      {sub}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.flyoutProducts}>
                <div className={styles.flyoutProductsHeader}>
                  {activeSubcategory} — check products to add to queue
                </div>
                <div className={styles.flyoutProductList}>
                  {catalogStatus === 'loading' && catalogCards.length === 0 && (
                    <div className={styles.empty}>
                      <h3>Loading products…</h3>
                      <p>Fetching the {activeSubcategory} cards from the catalog.</p>
                    </div>
                  )}
                  {catalogStatus === 'error' && (
                    <div className={styles.empty}>
                      <h3>Couldn’t load products</h3>
                      <p>{catalogError ?? 'The catalog API did not respond.'}</p>
                      <button type="button" className={styles.flyoutViewQueueBtn} onClick={() => void loadCategoryProducts()}>
                        Retry
                      </button>
                    </div>
                  )}
                  {catalogStatus === 'ready' && catalogCards.length === 0 && (
                    <div className={styles.empty}>
                      <h3>No products here yet</h3>
                      <p>Nothing is listed under {activeCategory} / {activeSubcategory}.</p>
                    </div>
                  )}
                  {catalogCards.map((card) => {
                    const p = catalogProducts.find((cp) => cp.id === card.id);
                    if (!p) return null;
                    const queued = designQueue.some((q) => q.id === p.id);
                    return (
                      <div key={p.id} className={`${styles.flyoutProductRow} ${queued ? styles.flyoutProductRowChecked : ''}`}>
                        <label className={styles.flyoutCheckboxLabel}>
                          <input
                            type="checkbox"
                            checked={queued}
                            onChange={() => {
                              if (queued) {
                                removeFromQueue(p.id);
                                onToast(`Removed "${p.name}" from queue.`);
                              } else {
                                addToQueue(p);
                                onToast(`Added "${p.name}" to queue (${designQueue.length + 1} total).`);
                              }
                            }}
                            className={styles.flyoutCheckbox}
                          />
                        </label>
                        <img src={card.mockupThumbUrl} alt={card.name} className={styles.flyoutProductImg} />
                        <div className={styles.flyoutProductInfo}>
                          <b>{card.name}</b>
                          <span>
                            {card.brand} · ${card.baseCost != null ? card.baseCost.toFixed(2) : '—'}
                            {card.variantCount ? ` · ${card.variantCount} variants` : ''}
                          </span>
                          {(card.supplierCount ?? 0) >= 2 ? (
                            <span style={{ color: '#92400e', fontWeight: 600, fontSize: 10 }}>
                              {card.supplierCount} suppliers
                            </span>
                          ) : null}
                        </div>
                        <button
                          type="button"
                          className={styles.flyoutViewBtn}
                          title="View product page"
                          onClick={() => {
                            setFlyoutOpen(false);
                            void loadBlankDetail(p.id);
                            onNavigate('design', 'product-page');
                          }}
                        >
                          View product page
                        </button>
                        <button
                          type="button"
                          className={styles.flyoutDesignBtn}
                          title="Load this product onto the canvas and start designing"
                          onClick={() => {
                            // No supplier overlay here — the canvas shows
                            // variants, price + print areas from the API.
                            // Create the draft design + load the canvas.
                            setFlyoutOpen(false);
                            void (async () => {
                              const detail = await loadBlankDetail(p.id);
                              if (!detail) {
                                onToast('Could not load that product — try again.');
                                return;
                              }
                              try {
                                await startDesign(detail);
                                onToast(`${detail.name} loaded — draft design created, layers will save.`);
                              } catch {
                                // Draft creation failed (network) — still design.
                                loadBlankFromDetail(detail);
                                onToast(`${detail.name} loaded (draft not saved — offline).`);
                              }
                            })();
                          }}
                        >
                          Design this
                        </button>
                      </div>
                    );
                  })}
                </div>
                <div className={styles.flyoutFooter}>
                  <span className={styles.flyoutQueueCount}>{designQueue.length} in queue</span>
                  <button
                    type="button"
                    className={styles.flyoutViewQueueBtn}
                    disabled={designQueue.length === 0}
                    onClick={() => {
                      setFlyoutOpen(false);
                      window.dispatchEvent(new CustomEvent('open-studio-queue'));
                    }}
                  >
                    View queue →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MAIN WORKSPACE */}
      <div className={styles.workspace}>
        {/* FLOATING + BUTTON */}
        {!drawerOpen && (
          <div className={`${styles.floatingBtnContainer} ${drawerLeft ? styles.floatPosLeft : styles.floatPosRight}`}>
            <button onClick={() => setDrawerOpen(true)} className={styles.floatingPlus}>
              <span className="material-symbols-outlined" style={{ fontSize: 28 }}>add</span>
            </button>
          </div>
        )}

        {/* CENTER CANVAS */}
        <main className={styles.canvasArea}>
          <div className={styles.mockupWrap}>
            {canvasImg ? (
              <img src={canvasImg} alt="Mockup" className={styles.mockupImg2}
                style={skeletonView ? { filter: 'grayscale(1) brightness(1.6) opacity(0.25)' } : undefined}
                onLoad={(e) => setImgSize({ w: e.currentTarget.naturalWidth || 800, h: e.currentTarget.naturalHeight || 800 })}
                draggable={false}
              />
            ) : (
              <div className={styles.empty}>
                <span className="material-symbols-outlined">upload_file</span>
                <h3>Canvas is empty</h3>
                <p>Pick a product from the catalog, or add content with the studio tools.</p>
                <button className={styles.emptyActionBtn} onClick={() => onNavigate('design', 'product-catalog')}>
                  Browse products
                </button>
              </div>
            )}

            {/* Print area + layers SVG overlay */}
            {imgSize && canvasImg && (
              <svg className={styles.stageSvg} viewBox={`0 0 ${imgSize.w} ${imgSize.h}`} aria-label="Design layers">
                {printRect && (
                  <g>
                    <rect x={printRect.left} y={printRect.top} width={printRect.width} height={printRect.height}
                      fill="none" stroke="#0a6400" strokeWidth={Math.max(1.5, imgSize.w / 500)}
                      strokeDasharray={`${imgSize.w / 90} ${imgSize.w / 140}`} />
                    <rect x={printRect.left} y={printRect.top - imgSize.h * 0.028}
                      width={Math.max(imgSize.w * 0.16, boxLabel.length * imgSize.w * 0.0088 + imgSize.w * 0.016)}
                      height={imgSize.h * 0.026} fill="#0a6400" rx={imgSize.w * 0.004} />
                    <text x={printRect.left + imgSize.w * 0.008} y={printRect.top - imgSize.h * 0.009}
                      fill="#ffffff" fontSize={imgSize.h * 0.018} fontWeight={600}>{boxLabel}</text>
                  </g>
                )}
                {layers.map(renderLayer)}
                {renderDraft()}
              </svg>
            )}
          </div>

          {/* Zoom Controls + Rotate Product — floating bottom-left cluster */}
          <div className={styles.zoomControls}>
            <button className={styles.zoomBtn2} onClick={() => setZoom((z) => Math.min(200, z + 5))}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
            </button>
            <button className={styles.zoomBtn2} onClick={() => setZoom((z) => Math.max(15, z - 5))}>
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>remove</span>
            </button>
            <span className={styles.zoomVal2}>{zoom}%</span>
            {pills.length > 1 && (
              <>
                <div className={styles.segDivider} style={{ height: 20 }} />
                <button className={styles.zoomBtn2} title="Rotate Product (cycle print area)"
                  onClick={() => {
                    const idx = pills.findIndex((p) => p.id === printArea);
                    const next = pills[(idx + 1) % pills.length];
                    if (next) setPrintArea(next.id);
                  }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>360</span>
                </button>
              </>
            )}
          </div>

          {/* Print-area pills — only shown when the product has REAL
              print areas (not the hardcoded fallback). Clicking a pill
              changes printArea → activeView → canvasImg rotates. */}
          {product && pills.length > 1 && (
            <div className={styles.pillFloat}>
              {pills.map((a) => (
                <button key={a.id} className={`${styles.pill} ${printArea === a.id ? styles.pillActive : ''}`}
                  onClick={() => setPrintArea(a.id)}>{a.label}</button>
              ))}
            </div>
          )}
        </main>

      </div>

      {/* TEMPORARY OVERLAY DRAWER — child of .root, NOT the workspace.
          It slides ABOVE both the top nav rail and the bottom rail
          (position:absolute over the full root height) because it's a
          TEMPORARY position: grab something, it snaps to the canvas,
          the drawer closes. */}
      <div className={`${styles.slideTool} ${drawerLeft ? styles.posLeft : styles.posRight} ${drawerOpen ? '' : styles.closed}`}>
          {/* Header */}
          <div className={styles.slideHeader}>
            <div className={styles.slideTitleWrap}>
              <span className="material-symbols-outlined">{DOCK_META[dockKind ?? 'Graphics'].icon}</span>
              <span className={styles.slideTitle}>{dockKind ?? 'Graphics'}</span>
            </div>
            <div className={styles.slideHeaderActions}>
              <button className={styles.dockToggle} onClick={() => setDrawerLeft((v) => !v)} title="Dock to Left/Right">
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{drawerLeft ? 'dock_to_right' : 'dock_to_left'}</span>
              </button>
              <button className={styles.slideClose} onClick={() => { setDrawerOpen(false); setDockKind(null); }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
              </button>
            </div>
          </div>

          {/* Content & Vertical Nav */}
          <div className={styles.slideContent}>
            {/* Vertical Icon Nav — per spec HTML */}
            <div className={styles.slideRail}>
              <button className={`${styles.toolBtn} ${dockKind === 'Upload' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Upload')}>
                <span className="material-symbols-outlined">cloud_upload</span><span>Upload</span>
              </button>
              <button className={`${styles.toolBtn} ${dockKind === 'Images' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Images')}>
                <span className="material-symbols-outlined">image</span><span>Images</span>
              </button>
              <button className={`${styles.toolBtn} ${dockKind === 'Graphics' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Graphics')}>
                <span className="material-symbols-outlined">interests</span><span>Graphics</span>
              </button>
              <div className={styles.toolChildGroup}>
                <button className={`${styles.toolBtnChild} ${dockKind === 'Templates' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Templates')}>
                  <span className="material-symbols-outlined">dashboard</span><span>Templates</span>
                </button>
                <button className={`${styles.toolBtnChild} ${dockKind === 'Shapes' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Shapes')}>
                  <span className="material-symbols-outlined">category</span><span>Shapes</span>
                </button>
              </div>
              <button className={`${styles.toolBtn} ${dockKind === 'Text' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Text')}>
                <span className="material-symbols-outlined">title</span><span>Add text</span>
              </button>
              <button className={`${styles.toolBtn} ${dockKind === 'AI' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('AI')}>
                <span className="material-symbols-outlined">magic_button</span><span>AI</span>
              </button>
              <button className={`${styles.toolBtn} ${dockKind === 'Product details' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Product details')}>
                <span className="material-symbols-outlined">inventory_2</span><span>Product</span>
              </button>
              <div className={styles.toolChildGroup}>
                <button className={`${styles.toolBtnChild} ${dockKind === 'Layers' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Layers')}>
                  <span className="material-symbols-outlined">layers</span><span>Layers</span>
                </button>
              </div>
              <button className={`${styles.toolBtn} ${dockKind === 'Layouts' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Layouts')}>
                <span className="material-symbols-outlined">view_quilt</span><span>Layouts</span>
              </button>
              <button className={`${styles.toolBtn} ${dockKind === 'Files' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Files')}>
                <span className="material-symbols-outlined">folder</span><span>Files</span>
              </button>
              <button className={`${styles.toolBtn} ${dockKind === 'Themes' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Themes')}>
                <span className="material-symbols-outlined">palette</span><span>Themes</span>
              </button>
              <button className={`${styles.toolBtn} ${dockKind === 'Settings' ? styles.toolBtnActive : ''}`} onClick={() => setDockKind('Settings')}>
                <span className="material-symbols-outlined">settings</span><span>Settings</span>
              </button>
            </div>

            {/* Panels Container — per spec HTML, all 13 views */}
            <div className={styles.panelsContainer}>
              {/* Graphics */}
              {(!dockKind || dockKind === 'Graphics') && (
                <div className={styles.viewPanel}>
                  <div className={styles.viewTabs}>
                    <button className={styles.viewTabActive}>Trending</button>
                    <button className={styles.viewTab}>Shapes</button>
                    <button className={styles.viewTab}>Lines</button>
                  </div>
                  <div className={styles.grid3}>
                    {['1618005182384-a83a8bd57fbe','1557682250-33bd709cbe85','1541701494587-cb58502866ab','1508615039623-a25605d2b022','1557682224-5b8590cd9ec5','1579546929518-9e396f3cc809'].map((id) => (
                      <div key={id} className={styles.gridCard}>
                        <img src={`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=200`} alt="" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Upload */}
              {dockKind === 'Upload' && (
                <div className={styles.viewPanel}>
                  <div className={styles.dropzone}>
                    <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#6f7a69' }}>cloud_upload</span>
                    <div className={styles.dropzoneTitle}>Click to upload or drag and drop</div>
                    <div className={styles.dropzoneSub}>SVG, PNG, JPG or GIF (max. 800x400px)</div>
                  </div>
                  <button className={styles.browseBtn}>Browse Files</button>
                  <div className={styles.recentSection}>
                    <div className={styles.recentLabel}>Recent Uploads</div>
                    <div className={styles.grid3}>
                      <div className={styles.gridCard}>
                        <img src="https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=150" alt="" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Images */}
              {dockKind === 'Images' && (
                <div className={styles.viewPanel}>
                  <div className={styles.grid2}>
                    {['1576566588028-4147f3842f27','1521572163474-6864f9cf17ab','1562157873-818bc0726f68','1583743814966-8936f5b7be1a'].map((id) => (
                      <div key={id} className={styles.gridCard}>
                        <img src={`https://images.unsplash.com/photo-${id}?auto=format&fit=crop&q=80&w=300`} alt="" />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Templates */}
              {dockKind === 'Templates' && (
                <div className={styles.viewPanel}>
                  <div className={styles.recentLabel}>Start with a template</div>
                  <div className={styles.grid2}>
                    <div className={`${styles.gridCard} ${styles.templateCard}`} style={{ background: 'linear-gradient(to bottom right, #dbeafe, #eff6ff)', border: '1px solid #bfdbfe' }}><span style={{ fontSize: 12, fontWeight: 500, color: '#1e40af' }}>Business Card</span></div>
                    <div className={`${styles.gridCard} ${styles.templateCard}`} style={{ background: 'linear-gradient(to bottom right, #fce7f3, #fdf2f8)', border: '1px solid #fbcfe8' }}><span style={{ fontSize: 12, fontWeight: 500, color: '#9d174d' }}>Social Post</span></div>
                    <div className={`${styles.gridCard} ${styles.templateCard}`} style={{ background: 'linear-gradient(to bottom right, #d1fae5, #ecfdf5)', border: '1px solid #a7f3d0' }}><span style={{ fontSize: 12, fontWeight: 500, color: '#166534' }}>Poster</span></div>
                    <div className={`${styles.gridCard} ${styles.templateCard}`} style={{ background: 'linear-gradient(to bottom right, #ede9fe, #f5f3ff)', border: '1px solid #ddd6fe' }}><span style={{ fontSize: 12, fontWeight: 500, color: '#6b21a8' }}>Flyer</span></div>
                  </div>
                </div>
              )}

              {/* Shapes */}
              {dockKind === 'Shapes' && (
                <div className={styles.viewPanel}>
                  <div className={styles.grid4}>
                    <div className={styles.shapeTile}><div className={styles.shapeRect} /></div>
                    <div className={styles.shapeTile}><div className={styles.shapeCircle} /></div>
                    <div className={styles.shapeTile}><div className={styles.shapeTriangle} /></div>
                    <div className={styles.shapeTile}><div className={styles.shapeDiamond} /></div>
                    <div className={styles.shapeTile}><div className={styles.shapePill} /></div>
                    <div className={styles.shapeTile}><div className={styles.shapeRhombus} /></div>
                  </div>
                </div>
              )}

              {/* Text */}
              {dockKind === 'Text' && (
                <div className={styles.viewPanel}>
                  <button className={styles.textHeadingBtn}>Add a heading</button>
                  <button className={styles.textSubBtn}>Add a subheading</button>
                  <button className={styles.textBodyBtn}>Add a body text</button>
                  <div className={styles.fontCombosSection}>
                    <div className={styles.recentLabel}>Font Combinations</div>
                    <div className={styles.grid2}>
                      <button className={styles.fontComboBtn}><div className={styles.fontNameBold}>Inter</div><div className={styles.fontSample}>The quick brown fox</div></button>
                      <button className={styles.fontComboBtn}><div className={styles.fontNameSerif}>Playfair</div><div className={styles.fontSampleSerif}>The quick brown fox</div></button>
                      <button className={styles.fontComboBtn}><div className={styles.fontNameMono}>Roboto Mono</div><div className={styles.fontSampleMono}>The quick brown fox</div></button>
                    </div>
                  </div>
                </div>
              )}

              {/* AI */}
              {dockKind === 'AI' && (
                <div className={styles.viewPanel}>
                  <label className={styles.aiLabel}>Describe the art you need</label>
                  <textarea className={styles.aiTextarea} placeholder="e.g. retro mountain sunset, vector style..." />
                  <button className={styles.aiGenerateBtn}>
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>auto_awesome</span> Generate 4 variations
                  </button>
                  <div className={styles.recentSection}>
                    <div className={styles.recentLabel}>Recent Generations</div>
                    <div className={styles.grid2}>
                      <div className={styles.gridCard}><img src="https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&q=80&w=200" alt="" /></div>
                      <div className={styles.aiEmptySlot}><span className="material-symbols-outlined">add</span></div>
                    </div>
                  </div>
                </div>
              )}

              {/* Product */}
              {dockKind === 'Product details' && (
                <div className={styles.viewPanel}>
                  <div className={styles.productInfoBox}>
                    <div className={styles.productInfoName}>{product?.name ?? 'No product'}</div>
                    <div className={styles.productInfoSku}>SKU: {blankDetail?.sku ?? '—'}</div>
                  </div>
                  <div className={styles.recentLabel}>Variant</div>
                  <div className={styles.variantRow}>
                    {(blankDetail?.variants.colors ?? [{ name: 'Black', hex: '#000000' }]).slice(0, 6).map((c, i) => (
                      <button key={c.sku ?? c.name + i} className={`${styles.variantSwatch} ${i === 0 ? styles.variantActive : ''}`}>
                        <div style={{ width: '100%', height: '100%', background: c.hex || '#ccc', borderRadius: '50%' }} />
                      </button>
                    ))}
                  </div>
                  <div className={styles.grid2col}>
                    <div>
                      <div className={styles.recentLabel}>Size</div>
                      <select className={styles.sizeSelect}>
                        <option>OSFA (One Size Fits All)</option>
                        <option>S/M</option>
                        <option>L/XL</option>
                      </select>
                    </div>
                    <div>
                      <div className={styles.recentLabel}>Quantity</div>
                      <div className={styles.qtyRow}>
                        <button className={styles.qtyBtn}>-</button>
                        <input type="text" defaultValue="1" className={styles.qtyInput} />
                        <button className={styles.qtyBtn}>+</button>
                      </div>
                    </div>
                  </div>
                  <div className={styles.recentLabel}>Print Locations</div>
                  <div className={styles.printLocList}>
                    {pills.map((p, i) => (
                      <div key={p.id} className={`${styles.printLocItem} ${i === 0 ? styles.printLocActive : ''}`}>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{p.label}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: i === 0 ? '#0a6400' : '#dad9dd' }}>{i === 0 ? 'check_circle' : 'circle'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Layers */}
              {dockKind === 'Layers' && (
                <div className={styles.viewPanel}>
                  {layers.length === 0 && <div style={{ textAlign: 'center', color: '#5a6355', fontSize: 12, marginTop: 20 }}>No layers yet. Add text, shapes, or images.</div>}
                  {layers.map((l) => (
                    <div key={l.uid} className={`${styles.layerItem} ${selectedUid === l.uid ? styles.layerItemActive : ''}`} onClick={() => setSelectedUid(l.uid)}>
                      <div className={styles.layerLabel}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{l.kind === 'text' ? 'title' : l.kind === 'image' ? 'image' : 'category'}</span>
                        <span style={{ fontSize: 12, fontWeight: 500 }}>{l.kind === 'text' ? l.text?.value || 'Text' : l.kind === 'image' ? 'Image' : 'Shape'}</span>
                      </div>
                      <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#5a6355', cursor: 'pointer' }}>visibility</span>
                    </div>
                  ))}
                  {layers.length > 1 && <div style={{ textAlign: 'center', fontSize: 11, color: '#5a6355', marginTop: 16, cursor: 'pointer' }}>Group selected layers</div>}
                </div>
              )}

              {/* Layouts */}
              {dockKind === 'Layouts' && (
                <div className={styles.viewPanel}>
                  <div className={styles.grid2}>
                    <div className={styles.layoutCard}>Centered</div>
                    <div className={styles.layoutCard}>Split Left</div>
                    <div className={styles.layoutCard}>Split Right</div>
                    <div className={styles.layoutCard}>Grid 2x2</div>
                  </div>
                </div>
              )}

              {/* Files */}
              {dockKind === 'Files' && (
                <div className={styles.viewPanel}>
                  <div className={styles.fileItem}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#f59e0b' }}>folder</span>
                    <div><div className={styles.fileName}>Brand Assets</div><div className={styles.fileMeta}>12 items</div></div>
                  </div>
                  <div className={styles.fileItem}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#f59e0b' }}>folder</span>
                    <div><div className={styles.fileName}>Project Logos</div><div className={styles.fileMeta}>4 items</div></div>
                  </div>
                  <div className={styles.fileItem}>
                    <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#3b82f6' }}>description</span>
                    <div><div className={styles.fileName}>style-guide.pdf</div><div className={styles.fileMeta}>2.4 MB</div></div>
                  </div>
                </div>
              )}

              {/* Themes */}
              {dockKind === 'Themes' && (
                <div className={styles.viewPanel}>
                  <div className={styles.themeCard}><div className={styles.themeSwatch} style={{ background: '#1e5a38' }}>Studio Green</div><div className={styles.themeName}>Primary Theme</div></div>
                  <div className={styles.themeCard}><div className={styles.themeSwatch} style={{ background: '#2563eb' }}>Ocean Blue</div><div className={styles.themeName}>Secondary Theme</div></div>
                  <div className={styles.themeCard}><div className={styles.themeSwatch} style={{ background: '#1a1c1e' }}>Midnight</div><div className={styles.themeName}>Dark Mode</div></div>
                </div>
              )}

              {/* Settings */}
              {dockKind === 'Settings' && (
                <div className={styles.viewPanel}>
                  <div className={styles.settingRow}>
                    <label className={styles.settingLabel}><input type="checkbox" defaultChecked className={styles.settingCheckbox} /><span className={styles.settingText}>Show grid</span></label>
                    <div className={styles.gridPreview} />
                    <p className={styles.settingHint}>Simple 10x10mm grid</p>
                  </div>
                  <hr className={styles.settingHr} />
                  <div className={styles.settingRow}>
                    <label className={styles.settingLabel}><input type="checkbox" defaultChecked className={styles.settingCheckbox} /><span className={styles.settingText}>Show guides</span></label>
                    <div className={styles.guidePreview} />
                    <p className={styles.settingHint}>Guides are helpful in establishing site content</p>
                  </div>
                  <hr className={styles.settingHr} />
                  <div className={styles.settingRow}>
                    <label className={styles.settingLabel}><input type="checkbox" defaultChecked className={styles.settingCheckbox} /><span className={styles.settingText}>Show bleeds</span></label>
                    <p className={styles.settingHint}>Bleed is the extra area of the design beyond the final print edge. It is trimmed off when printing.</p>
                  </div>
                  <hr className={styles.settingHr} />
                  <div className={styles.settingRow}>
                    <label className={styles.settingLabel}><input type="checkbox" defaultChecked className={styles.settingCheckbox} /><span className={styles.settingText}>Show rulers</span></label>
                    <div className={styles.rulerPreview} />
                    <p className={styles.settingHint}>Show rulers over design. You can move the ruler using a handle with position.</p>
                  </div>
                  <hr className={styles.settingHr} />
                  <div className={styles.settingRow}>
                    <div className={styles.settingText}>Units</div>
                    <div className={styles.toggleGroup}><div className={styles.toggleActive}>cm</div><div className={styles.toggleBtn2}>inch</div></div>
                  </div>
                  <hr className={styles.settingHr} />
                  <div className={styles.settingRow}>
                    <div className={styles.settingText}>Background color</div>
                    <button className={styles.noBgBtn}><span style={{ width: '16px', height: '1px', background: '#ef4444', transform: 'rotate(45deg)' }} /> No background</button>
                    <div className={styles.settingHint}>Pick from palette</div>
                    <div className={styles.colorPalette}>
                      {['#000000','#374151','#6b7280','#9ca3af','#d1d5db','#e5e7eb','#f3f4f6','#ffffff','#e87a7a','#e8c17a','#e8e87a','#b9e87a','#7ae8a3','#7ae8e8','#7ab9e8','#7a7ae8','#b97ae8','#e87ad1','#e87aa3','#cc7a7a'].map((c) => (
                        <div key={c} className={styles.colorSwatch} style={{ background: c }} />
                      ))}
                    </div>
                    <div className={styles.settingHint}>Create custom color</div>
                    <div className={styles.colorModeRow}><div className={styles.colorModeActive}>sRGB</div><div className={styles.colorMode}>CMYK</div></div>
                    <div className={styles.colorGrad1} />
                    <div className={styles.colorGrad2} />
                    <input type="text" placeholder="HEX" className={styles.hexInput} disabled />
                  </div>
                  <hr className={styles.settingHr} />
                  <div className={styles.settingRow}>
                    <div className={styles.settingRowFlex}>
                      <div className={styles.settingText}>Image format</div>
                      <div className={styles.formatGroup}>
                        <button className={styles.formatActive}>JPG</button>
                        <button className={styles.formatBtn}>WebP</button>
                        <button className={styles.formatBtn}>PNG</button>
                      </div>
                    </div>
                  </div>
                  <hr className={styles.settingHr} />
                  <button className={styles.resetBtn}>Reset settings to default</button>
                </div>
              )}
            </div>
          </div>
        </div>
    </div>
  );
}

