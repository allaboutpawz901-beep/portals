import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './StudioDrawer.module.css';
import {
  SUPPLIER_CATEGORY_DATA,
  useDesignCanvas,
} from '@/lib/designCanvasStore';
import {
  appendPlacementLayer,
  applyTemplate,
  enqueue,
  generateAiArt,
  getDesignDetail,
  listAssets,
  listDesigns,
  listQueue,
  removeQueueItem,
  searchInspiration,
  setDesignTemplate,
  updateQueueItem,
  uploadFile,
  type BlankDetail,
  type DesignAsset,
  type DesignListItem,
  type InspirationImage,
  type PlacementLayer,
  type QueueItem,
} from '@/lib/podApi';

export type StudioDrawerKind =
  | 'Upload'
  | 'AI'
  | 'Text'
  | 'My library'
  | 'Graphics'
  | 'My templates'
  | 'Images'
  | 'Shapes'
  | 'Themes'
  | 'Inspiration'
  | 'Supplier'
  | 'Queue';

interface StudioDrawerProps {
  open: boolean;
  kind: string;
  onClose: () => void;
  onToast: (message: string) => void;
  /** Navigate to a sidebar screen (design domain) — for My orders. */
  onNavigate?: (screenId: string) => void;
}

const KIND_META: Record<string, { icon: string; subtitle: string; action: string }> = {
  Upload: { icon: 'cloud_upload', subtitle: 'PNG, JPG, SVG, PDF — up to 25 MB', action: 'Browse files' },
  AI: { icon: 'auto_awesome', subtitle: 'Generate art from a prompt', action: 'Generate' },
  'Text': { icon: 'text_fields', subtitle: 'Add a text layer', action: 'Add to canvas' },
  'My library': { icon: 'folder_special', subtitle: 'Your saved assets', action: 'Upload to library' },
  Graphics: { icon: 'interests', subtitle: 'Icons and graphics', action: 'Add selected' },
  'My templates': { icon: 'view_quilt', subtitle: 'Your saved designs', action: 'Save current as template' },
  Images: { icon: 'image', subtitle: 'Free images from Wikimedia Commons', action: 'Search Commons' },
  Shapes: { icon: 'category', subtitle: 'Basic vector shapes', action: 'Place shape' },
  Themes: { icon: 'palette', subtitle: 'Palettes and font pairings', action: 'Apply theme' },
  Inspiration: { icon: 'explore', subtitle: 'Free images from Wikimedia Commons', action: 'Search Commons' },
  Supplier: { icon: 'inventory_2', subtitle: 'Live API data — select a variant to begin designing', action: 'Design with this SKU' },
  Queue: { icon: 'playlist_add', subtitle: 'Products queued for batch design', action: 'Start designing' },
};

const TEXT_PRESETS = [
  { label: 'Add a heading', sample: 'Aa', size: 32 },
  { label: 'Add a subheading', sample: 'Aa', size: 22 },
  { label: 'Add a little bit of body text', sample: 'Aa', size: 15 },
];

const FONTS = ['Anton', 'Inter', 'Playfair Display', 'Bebas Neue'];

const GRAPHIC_CATEGORIES = ['Shapes', 'Badges', 'Icons', 'Symbols', 'Labels', 'Borders'];
const LIBRARY_FOLDERS = ['Logos', 'Seasonal', 'Mockups', 'Exports'];

const AI_STYLES = ['Illustration', 'Photo', 'Vector', 'Watercolor'];

/* ── Vector shape set (canvas tools, B10 Shapes drawer) ── */
export interface StudioShape {
  id: string;
  label: string;
  /** SVG path-ish renderer key — the canvas knows how to draw each. */
  render: 'rect' | 'rectRound' | 'ellipse' | 'triangle' | 'line' | 'arrow' | 'star' | 'heart' | 'ring' | 'diamond';
}
export const STUDIO_SHAPES: StudioShape[] = [
  { id: 'rect', label: 'Rectangle', render: 'rect' },
  { id: 'rect-round', label: 'Rounded', render: 'rectRound' },
  { id: 'ellipse', label: 'Ellipse', render: 'ellipse' },
  { id: 'triangle', label: 'Triangle', render: 'triangle' },
  { id: 'line', label: 'Line', render: 'line' },
  { id: 'arrow', label: 'Arrow', render: 'arrow' },
  { id: 'star', label: 'Star', render: 'star' },
  { id: 'heart', label: 'Heart', render: 'heart' },
  { id: 'ring', label: 'Ring', render: 'ring' },
  { id: 'diamond', label: 'Diamond', render: 'diamond' },
];
export const STUDIO_SHAPE_COLORS = [
  '#111111', '#ffffff', '#6b7280', '#a32b3d', '#1d4422',
  '#1d2a44', '#b45309', '#0f766e', '#7c3aed', '#db2777',
];

/* ── Theme presets (B11 Themes drawer) ── */
export interface StudioTheme {
  id: string;
  name: string;
  colors: string[];
  fontPair: string;
  mood: string;
}
export const STUDIO_THEMES: StudioTheme[] = [
  { id: 'bold-street', name: 'Bold Street', colors: ['#111111', '#f97316', '#facc15', '#ffffff'], fontPair: 'Anton + Inter', mood: 'High-contrast streetwear' },
  { id: 'vintage-sun', name: 'Vintage Sun', colors: ['#7c2d12', '#b45309', '#f59e0b', '#fef3c7'], fontPair: 'Playfair Display + Inter', mood: 'Retro wash' },
  { id: 'garden-core', name: 'Garden Core', colors: ['#14532d', '#4d7c0f', '#a3e635', '#f7fee7'], fontPair: 'Bebas Neue + Inter', mood: 'Nature & botanical' },
  { id: 'midnight-tech', name: 'Midnight Tech', colors: ['#0f172a', '#155e75', '#22d3ee', '#ecfeff'], fontPair: 'Inter + Inter', mood: 'Clean tech' },
  { id: 'pastel-soft', name: 'Pastel Soft', colors: ['#fdf2f8', '#f9a8d4', '#c084fc', '#7c3aed'], fontPair: 'Playfair Display + Inter', mood: 'Soft pastel' },
  { id: 'mono-ink', name: 'Mono Ink', colors: ['#000000', '#374151', '#9ca3af', '#f3f4f6'], fontPair: 'Bebas Neue + Inter', mood: 'Ink & zine' },
];

/* ── Shared helpers ── */

function assetName(a: DesignAsset): string {
  const orig = a.metadata?.originalName;
  if (typeof orig === 'string' && orig) return orig;
  const parts = a.storagePath.split('/');
  return parts[parts.length - 1] ?? a.id.slice(0, 8);
}

function isImageAsset(a: DesignAsset): boolean {
  return (a.mimeType ?? '').startsWith('image/');
}

/** Center a w×h (inches) layer inside the current print box. */
function placementFor(
  blankDetail: BlankDetail | null,
  printArea: string,
  wIn: number,
  hIn: number,
): { view: string; xIn: number; yIn: number; wIn: number; hIn: number; rotationDeg: number } {
  const view =
    blankDetail?.views.find((v) => v.view.toLowerCase() === printArea.toLowerCase()) ??
    blankDetail?.views.find((v) => v.label.toLowerCase().includes(printArea.toLowerCase())) ??
    blankDetail?.views[0];
  const box = view?.boxIn ?? { xIn: 0, yIn: 0, wIn: 8, hIn: 10 };
  const w = Math.min(wIn, box.wIn);
  const h = Math.min(hIn, box.hIn);
  return {
    view: view?.view ?? 'FRONT',
    xIn: box.xIn + Math.max(0, (box.wIn - w) / 2),
    yIn: box.yIn + Math.max(0, (box.hIn - h) / 2),
    wIn: w,
    hIn: h,
    rotationDeg: 0,
  };
}

interface PanelProps {
  onToast: (message: string) => void;
  designId: string | null;
  blankDetail: BlankDetail | null;
  printArea: string;
  /** Lets the panel set the footer's primary button for this kind. */
  onPrimary: (label: string, run: () => void) => void;
  /** Canvas-dock only: place a vector shape layer on the canvas. */
  onPlaceShape?: (shape: StudioShape, color: string) => void;
  /** Canvas-dock only: place a text layer on the canvas (local-first). */
  onPlaceText?: (value: string, font: string, sizePt: number) => void;
  /** Canvas-dock only: apply a theme to the canvas layers. */
  onApplyTheme?: (theme: StudioTheme) => void;
}

/** Save one layer into the draft design's placement_spec via PATCH. */
async function addLayer(
  designId: string | null,
  layer: PlacementLayer,
  onToast: (message: string) => void,
): Promise<boolean> {
  if (!designId) {
    onToast('No design draft loaded — start designing from a product first.');
    return false;
  }
  try {
    await appendPlacementLayer(designId, layer);
    onToast('Layer saved to the design.');
    // Let the canvas (dock host) know so it can re-render the placement.
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('studio-layer-saved'));
    }
    return true;
  } catch (e) {
    onToast(`Could not save the layer: ${e instanceof Error ? e.message : 'failed'}`);
    return false;
  }
}

function imageLayer(
  asset: DesignAsset,
  blankDetail: BlankDetail | null,
  printArea: string,
): PlacementLayer {
  const wIn = asset.width ? asset.width / 300 : 4;
  const hIn = asset.height ? asset.height / 300 : 4;
  return {
    kind: 'image',
    assetId: asset.id,
    ...placementFor(blankDetail, printArea, wIn, hIn),
    z: 0,
  };
}

function shapeLayer(
  asset: DesignAsset,
  blankDetail: BlankDetail | null,
  printArea: string,
): PlacementLayer {
  return {
    kind: 'shape',
    assetId: asset.id,
    ...placementFor(blankDetail, printArea, 3, 3),
    z: 0,
  };
}

/* ── B1 Upload ── */

function UploadPanel({ onToast, designId, blankDetail, printArea, onPrimary }: PanelProps) {
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { assets: rows } = await listAssets({ kind: 'upload' });
      setAssets(rows);
      setStatus('ready');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load uploads.');
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPicker = useCallback(() => inputRef.current?.click(), []);
  useEffect(() => {
    onPrimary('Browse files', openPicker);
  }, [onPrimary, openPicker]);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { asset } = await uploadFile(file, { designId: designId ?? undefined });
      setAssets((prev) => [asset, ...prev]);
      onToast(`Uploaded ${assetName(asset)}.`);
    } catch (e) {
      onToast(`Upload failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <button
        type="button"
        className={styles.dropzone}
        data-studio-dropzone
        onClick={openPicker}
        disabled={uploading}
      >
        <span className={`material-symbols-outlined ${styles.dropzoneIcon}`}>cloud_upload</span>
        <span className={styles.dropzoneTitle}>
          {uploading ? 'Uploading…' : 'Drag & drop or browse'}
        </span>
        <span className={styles.dropzoneHint}>PNG, JPG, SVG, PDF — up to 25 MB</span>
      </button>
      <div className={styles.sectionHeading}>Recent uploads</div>
      {status === 'loading' && <p className={styles.subtitle}>Loading uploads…</p>}
      {status === 'error' && <p className={styles.subtitle}>{error}</p>}
      {status === 'ready' && assets.length === 0 && (
        <p className={styles.subtitle}>No uploads yet — browse a file to add your first asset.</p>
      )}
      <ul className={styles.listRows}>
        {assets.map((a) => (
          <li
            key={a.id}
            draggable
            className={styles.draggable}
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-asset', a.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => void addLayer(designId, imageLayer(a, blankDetail, printArea), onToast)}
            title="Click to add to the canvas"
          >
            {isImageAsset(a) && a.url ? (
              <img src={a.url} alt={assetName(a)} style={{ width: 32, height: 32, objectFit: 'cover' }} />
            ) : (
              <span className={`material-symbols-outlined ${styles.rowIcon}`}>image</span>
            )}
            <span className={styles.rowLabel}>{assetName(a)}</span>
            <span className={styles.rowMeta}>
              {a.mimeType?.replace('image/', '').toUpperCase() ?? 'FILE'} ·{' '}
              {new Date(a.createdAt).toLocaleDateString()}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── B2 AI ── */

/** Cross-panel handoff: the Inspiration panel sends a reference to the AI
 *  panel. The AI panel may not be mounted yet when this is set (the dock
 *  switches kinds), so the pending value is consumed on its next mount. */
let pendingAiReference: InspirationImage | null = null;

function AiPanel({ onToast, designId, blankDetail, printArea, onPrimary }: PanelProps) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState(AI_STYLES[0]);
  const [generations, setGenerations] = useState<DesignAsset[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  /** Inspiration reference sent from the Inspiration panel/drawer — the
   *  high-res Commons image the user picked, shown above the prompt. */
  const [reference, setReference] = useState<InspirationImage | null>(null);

  // The Inspiration panel dispatches studio-ai-reference when a user picks
  // an image — it lands here with the full-resolution URL + title. The
  // event covers an already-open panel; the pending holder covers the
  // switch (Inspiration → AI), which unmounts/remounts this panel after
  // the event has already fired.
  useEffect(() => {
    const apply = (detail: InspirationImage) => {
      setReference(detail);
      setPrompt((p) =>
        p.trim()
          ? p
          : `Screen-print design inspired by: ${detail.title}. Bold, limited palette, clean vector edges.`,
      );
      onToast('Inspiration attached — describe what to keep, then Generate.');
    };
    if (pendingAiReference) {
      apply(pendingAiReference);
      pendingAiReference = null;
    }
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as InspirationImage | undefined;
      if (detail) apply(detail);
    };
    window.addEventListener('studio-ai-reference', handler);
    return () => window.removeEventListener('studio-ai-reference', handler);
  }, [onToast]);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { assets } = await listAssets({ kind: 'ai' });
      setGenerations(assets);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const generate = useCallback(async () => {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    try {
      const { asset } = await generateAiArt({
        prompt: reference
          ? `${prompt.trim()} (reference: ${reference.title})`
          : prompt.trim(),
        style,
        designId: designId ?? undefined,
      });
      setGenerations((prev) => [asset, ...prev]);
      onToast('Art generated and saved to your assets.');
    } catch (e) {
      onToast(`Generation failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    } finally {
      setBusy(false);
    }
  }, [prompt, style, busy, designId, reference, onToast]);

  useEffect(() => {
    onPrimary('Generate', () => void generate());
  }, [onPrimary, generate]);

  return (
    <>
      {reference && (
        <div className={styles.refCard} data-ai-reference>
          <img src={reference.thumbUrl} alt={reference.title} className={styles.refThumb} />
          <div className={styles.refInfo}>
            <span className={styles.refLabel}>Inspiration reference</span>
            <span className={styles.refTitle}>{reference.title}</span>
            <span className={styles.refMeta}>{reference.width ?? '—'}×{reference.height ?? '—'}px full-res</span>
          </div>
          <button
            type="button"
            className={styles.refClose}
            title="Remove the reference"
            onClick={() => setReference(null)}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}
      <label className={styles.fieldLabel}>Describe the art you need</label>
      <textarea
        className={styles.promptArea}
        placeholder="e.g. retro mountain sunset with bold outline, 3-color screen print…"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      <div className={styles.fieldLabel}>Style</div>
      <div className={styles.chipRow}>
        {AI_STYLES.map((s) => (
          <button
            key={s}
            type="button"
            className={`${styles.chip} ${s === style ? styles.chipActive : ''}`}
            onClick={() => setStyle(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <button
        type="button"
        className={styles.primaryBtn}
        data-ai-generate
        onClick={() => void generate()}
        disabled={!prompt.trim() || busy}
      >
        <span className={`material-symbols-outlined ${styles.icon16}`}>auto_awesome</span>
        {busy ? 'Generating…' : 'Generate 4 variations'}
      </button>
      <div className={styles.sectionHeading}>Recent generations</div>
      {status === 'loading' && <p className={styles.subtitle}>Loading generations…</p>}
      {status === 'error' && <p className={styles.subtitle}>Could not load generations.</p>}
      {status === 'ready' && generations.length === 0 && (
        <p className={styles.subtitle}>No generations yet — describe the art and generate.</p>
      )}
      <div className={styles.tileGrid}>
        {generations.map((a, i) => (
          <div
            key={a.id}
            className={styles.tile}
            data-ai-variation={i}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-asset', a.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => void addLayer(designId, imageLayer(a, blankDetail, printArea), onToast)}
            title={a.prompt ?? assetName(a)}
          >
            {a.url ? <img src={a.url} alt={a.prompt ?? assetName(a)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : null}
          </div>
        ))}
      </div>
    </>
  );
}

/* ── B3 Add text ── */

function TextPanel({ onToast, designId, blankDetail, printArea, onPrimary, onPlaceText }: PanelProps) {
  const [value, setValue] = useState('');
  const [font, setFont] = useState('Inter');
  const [size, setSize] = useState(TEXT_PRESETS[0].size);

  const addText = useCallback(
    async (presetSize?: number) => {
      const text = value.trim() || 'Your text';
      const pt = presetSize ?? size;
      // Canvas dock wiring — place a local text layer on the canvas.
      if (onPlaceText) {
        onPlaceText(text, font, pt);
        return;
      }
      const sizeIn = pt / 72;
      const box = placementFor(blankDetail, printArea, 8, sizeIn * 2);
      await addLayer(
        designId,
        {
          kind: 'text',
          text: { value: text, fontId: font, sizeIn, fill: '#111111' },
          ...box,
          z: 0,
        },
        onToast,
      );
    },
    [value, font, size, designId, blankDetail, printArea, onToast, onPlaceText],
  );

  useEffect(() => {
    onPrimary('Add to canvas', () => void addText());
  }, [onPrimary, addText]);

  return (
    <>
      <label className={styles.fieldLabel}>Your text</label>
      <textarea
        className={styles.promptArea}
        placeholder="Type your text…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
      />
      <div className={styles.sectionHeading}>Text presets</div>
      <div className={styles.textPresets}>
        {TEXT_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            className={styles.textPresetBtn}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-text', p.label);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => {
              setSize(p.size);
              void addText(p.size);
            }}
          >
            <span className={styles.textPresetSample} style={{ fontSize: p.size }}>
              {p.sample}
            </span>
            <span className={styles.textPresetLabel}>{p.label}</span>
          </button>
        ))}
      </div>
      <div className={styles.sectionHeading}>Fonts</div>
      <ul className={styles.listRows}>
        {FONTS.map((f) => (
          <li
            key={f}
            draggable
            className={styles.draggable}
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-font', f);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => setFont(f)}
          >
            <span className={styles.fontSample}>{f}</span>
            <span className={styles.rowMeta}>{f === font ? 'Selected' : 'Font'}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── B4 My library ── */

function LibraryPanel({ onToast, designId, blankDetail, printArea, onPrimary }: PanelProps) {
  const [folder, setFolder] = useState('All');
  const [assets, setAssets] = useState<DesignAsset[]>([]);
  const [designs, setDesigns] = useState<DesignListItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [{ assets: rows }, { items }] = await Promise.all([
        listAssets({ limit: 50 }),
        listDesigns({ limit: 20 }),
      ]);
      setAssets(rows);
      setDesigns(items);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openPicker = useCallback(() => inputRef.current?.click(), []);
  useEffect(() => {
    onPrimary('Upload to library', openPicker);
  }, [onPrimary, openPicker]);

  const handleFiles = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file) return;
    try {
      const { asset } = await uploadFile(file, {
        designId: designId ?? undefined,
        folder: folder === 'All' ? undefined : folder,
      });
      setAssets((prev) => [asset, ...prev]);
      onToast(`Uploaded ${assetName(asset)} to the library.`);
    } catch (e) {
      onToast(`Upload failed: ${e instanceof Error ? e.message : 'unknown error'}`);
    }
  };

  const visible =
    folder === 'All'
      ? assets
      : assets.filter((a) => (a.metadata?.folder as string | undefined) === folder);

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/svg+xml,image/webp,application/pdf"
        style={{ display: 'none' }}
        onChange={(e) => void handleFiles(e.target.files)}
      />
      <div className={styles.sectionHeading}>Folders</div>
      <div className={styles.chipRow}>
        {['All', ...LIBRARY_FOLDERS].map((f) => (
          <button
            key={f}
            type="button"
            className={`${styles.chip} ${f === folder ? styles.chipActive : ''}`}
            onClick={() => setFolder(f)}
          >
            {f}
          </button>
        ))}
      </div>
      {status === 'loading' && <p className={styles.subtitle}>Loading your library…</p>}
      {status === 'error' && <p className={styles.subtitle}>Could not load your library.</p>}
      {status === 'ready' && visible.length === 0 && (
        <p className={styles.subtitle}>
          No assets in this folder yet — upload one to the library.
        </p>
      )}
      <div className={styles.tileGrid}>
        {visible.map((a) => (
          <div
            key={a.id}
            className={styles.tile}
            data-library-asset={a.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-asset', a.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => void addLayer(designId, imageLayer(a, blankDetail, printArea), onToast)}
            title={assetName(a)}
          >
            {isImageAsset(a) && a.url ? (
              <img src={a.url} alt={assetName(a)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <span className={`material-symbols-outlined ${styles.rowIcon}`}>image</span>
            )}
          </div>
        ))}
      </div>
      <div className={styles.sectionHeading}>Saved designs — click to apply to this draft</div>
      {designs.length === 0 && status === 'ready' && (
        <p className={styles.subtitle}>No saved designs yet.</p>
      )}
      <ul className={styles.listRows}>
        {designs.map((d) => (
          <li
            key={d.id}
            className={styles.draggable}
            onClick={async () => {
              if (!designId) {
                onToast('No design draft loaded — start designing from a product first.');
                return;
              }
              try {
                await applyTemplate(d.id, designId);
                onToast(`Applied "${d.name}" to this draft.`);
              } catch (e) {
                onToast(e instanceof Error ? e.message : 'Could not apply that design.');
              }
            }}
          >
            <span className={`material-symbols-outlined ${styles.rowIcon}`}>design_services</span>
            <span className={styles.rowLabel}>
              {d.name}
              <span className={styles.rowSub}>{d.product_type ?? 'Design'}</span>
            </span>
            <span className={styles.rowMeta}>{d.status}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── B5 Graphics ── */

function GraphicsPanel({ onToast, designId, blankDetail, printArea, onPrimary }: PanelProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState(GRAPHIC_CATEGORIES[0]);
  const [shapes, setShapes] = useState<DesignAsset[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<DesignAsset | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { assets } = await listAssets({ kind: 'shape', limit: 100 });
      setShapes(assets);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    onPrimary('Add selected', () => {
      if (selected) void addLayer(designId, shapeLayer(selected, blankDetail, printArea), onToast);
      else onToast('Select a graphic first.');
    });
  }, [onPrimary, selected, designId, blankDetail, printArea, onToast]);

  const shapeName = (a: DesignAsset): string =>
    (a.metadata?.shape as string | undefined) ?? assetName(a).replace(/\.svg$/i, '');

  const visible = shapes.filter((a) => {
    const name = shapeName(a).toLowerCase();
    if (query && !name.includes(query.toLowerCase())) return false;
    if (category === 'Shapes') return true;
    if (category === 'Badges') return name === 'badge';
    return false;
  });

  return (
    <>
      <div className={styles.searchRow}>
        <span className={`material-symbols-outlined ${styles.searchIcon}`}>search</span>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search graphics…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>
      <div className={styles.chipRow}>
        {GRAPHIC_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            className={`${styles.chip} ${c === category ? styles.chipActive : ''}`}
            onClick={() => setCategory(c)}
          >
            {c}
          </button>
        ))}
      </div>
      {status === 'loading' && <p className={styles.subtitle}>Loading graphics…</p>}
      {status === 'error' && <p className={styles.subtitle}>Could not load graphics.</p>}
      {status === 'ready' && visible.length === 0 && (
        <p className={styles.subtitle}>
          No {category.toLowerCase()} yet — upload shape files to the library to grow this set.
        </p>
      )}
      <div className={styles.tileGrid}>
        {visible.map((a) => (
          <div
            key={a.id}
            className={styles.tile}
            data-graphic-tile={a.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-graphic', a.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => {
              setSelected(a);
              void addLayer(designId, shapeLayer(a, blankDetail, printArea), onToast);
            }}
            title={shapeName(a)}
          >
            {a.url ? (
              <img src={a.url} alt={shapeName(a)} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
            ) : (
              <span className={`material-symbols-outlined ${styles.rowIcon}`}>interests</span>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/* ── B6 My templates ── */

function TemplatesPanel({ onToast, designId, onPrimary }: PanelProps) {
  const [templates, setTemplates] = useState<DesignListItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { items } = await listDesigns({ template: true, limit: 50 });
      setTemplates(items);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveCurrent = useCallback(async () => {
    if (!designId) {
      onToast('No design draft loaded — start designing from a product first.');
      return;
    }
    try {
      await setDesignTemplate(designId, true);
      await load();
      onToast('Current design saved as a template.');
    } catch (e) {
      onToast(`Could not save the template: ${e instanceof Error ? e.message : 'failed'}`);
    }
  }, [designId, load, onToast]);

  useEffect(() => {
    onPrimary('Save current as template', () => void saveCurrent());
  }, [onPrimary, saveCurrent]);

  return (
    <>
      {status === 'loading' && <p className={styles.subtitle}>Loading templates…</p>}
      {status === 'error' && <p className={styles.subtitle}>Could not load templates.</p>}
      {status === 'ready' && templates.length === 0 && (
        <p className={styles.subtitle}>
          No templates yet — save a design as a template to reuse it.
        </p>
      )}
      <ul className={styles.listRows}>
        {templates.map((t) => (
          <li
            key={t.id}
            draggable
            className={styles.draggable}
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-template', t.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
          >
            <span className={`material-symbols-outlined ${styles.rowIcon}`}>view_quilt</span>
            <span className={styles.rowLabel}>
              {t.name}
              <span className={styles.rowSub}>{t.product_type ?? 'Design'}</span>
            </span>
            <span className={styles.rowMeta}>
              {new Date(t.updated_at).toLocaleDateString()}
            </span>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={async () => {
                if (!designId) {
                  onToast('No design draft loaded — start designing from a product first.');
                  return;
                }
                try {
                  await applyTemplate(t.id, designId);
                  onToast(`Template "${t.name}" applied to this draft.`);
                } catch (e) {
                  onToast(e instanceof Error ? e.message : 'Could not use that template.');
                }
              }}
            >
              Use template
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}

/* ── B7 Images — the REAL image browser: Wikimedia Commons ──
   Search bar + preloaded curated themes (see InspirationPanel below).
   Both the `Images` and `Inspiration` kinds render the same panel — one
   image source, one experience, no fake "licensed stock" theater. */

/* ── Inspiration — Wikimedia Commons design references ── */

/** Curated themes, preloaded in parallel when the drawer mounts.
 *  The search bar overrides them with a live query. */
export const INSPIRATION_THEMES: { id: string; label: string; query: string }[] = [
  { id: 'vintage-tee', label: 'Vintage tee graphics', query: 'vintage t-shirt design' },
  { id: 'retro-badges', label: 'Retro badges & emblems', query: 'heraldic crest emblem' },
  { id: 'woodblock', label: 'Japanese woodblock', query: 'ukiyo-e woodblock print' },
  { id: 'art-deco', label: 'Art deco posters', query: 'art deco poster' },
  { id: 'matchbook', label: 'Matchbook art', query: 'matchbook art' },
  { id: 'western', label: 'Western & rodeo', query: 'western rodeo illustration' },
];

interface InspSection {
  id: string;
  label: string;
  query: string;
  images: InspirationImage[];
  status: 'loading' | 'ready' | 'error';
}

/** Client-side theme cache — remounting the panel (dock ↔ drawer) must not
 *  re-fire the curated searches. The server caches too; this saves the trip. */
const themeCache = new Map<string, InspirationImage[]>();

/** Download a Commons image with retry. upload.wikimedia.org answers
 *  bursts with 429/403, and thumb.wikimedia.org refuses to RENDER larger
 *  derivatives for a rate-limited client (400) while still serving small
 *  ones. So the chain runs largest→smallest until one answers:
 *  full-res → 1200px → 500px → the API's own 250px thumb. */
function widerThumb(thumbUrl: string, targetWidth: number): string | null {
  if (!/\/\d+px-/.test(thumbUrl)) return null;
  return thumbUrl.replace(/\/(\d+)px-/, `/${Math.max(200, Math.round(targetWidth))}px-`);
}

export async function downloadCommonsImage(img: {
  url: string;
  width: number | null;
  thumbUrl?: string;
}): Promise<Blob> {
  const fullUrl = img.url.split('?')[0];
  const natural = img.width && img.width > 0 ? img.width : null;
  const candidates: string[] = [fullUrl];
  for (const size of [1200, 500]) {
    // Skip sizes above the natural width — Commons rejects upscaling (400).
    if (natural && size > natural) continue;
    const d = img.thumbUrl ? widerThumb(img.thumbUrl, size) : null;
    if (d && !candidates.includes(d)) candidates.push(d);
  }
  if (img.thumbUrl) {
    const small = img.thumbUrl.split('?')[0];
    if (!candidates.includes(small)) candidates.push(small);
  }
  let lastErr: Error = new Error('download failed');
  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
      try {
        const res = await fetch(candidate, { mode: 'cors' });
        if (res.ok) return await res.blob();
        lastErr = new Error(`download ${res.status}`);
        if (res.status !== 429 && res.status !== 403) break;
      } catch (e) {
        lastErr = e instanceof Error ? e : new Error('download failed');
      }
    }
  }
  throw lastErr;
}

/** Commons download → uploaded asset (design_assets row). Shared by the
 *  Inspiration panel's add-to-canvas and the canvas drop handler. */
export async function uploadCommonsImage(
  img: { url: string; title: string; width: number | null; thumbUrl?: string },
  designId: string | null,
): Promise<DesignAsset> {
  const blob = await downloadCommonsImage(img);
  const ext = (blob.type.split('/')[1] ?? 'png').replace(/[^a-z0-9]/gi, '');
  const file = new File(
    [blob],
    `${img.title.slice(0, 60).replace(/[^\w-]+/g, '_') || 'inspiration'}.${ext}`,
    { type: blob.type || 'image/png' },
  );
  const { asset } = await uploadFile(file, {
    designId: designId ?? undefined,
    kind: 'image',
    license: 'Wikimedia Commons',
  });
  return asset;
}

function InspirationPanel({ onToast, designId, blankDetail, printArea, onPrimary }: PanelProps) {
  const [sections, setSections] = useState<InspSection[]>([]);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [searchedQuery, setSearchedQuery] = useState<string | null>(null);
  const [busyTile, setBusyTile] = useState<string | null>(null);

  // Preload the curated themes — STAGGERED (~250ms apart) so six parallel
  // hits don't trip Wikimedia's burst limiter. Each carousel loads on its own.
  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    setSections(
      INSPIRATION_THEMES.map((t) => ({ ...t, images: [], status: 'loading' as const })),
    );
    INSPIRATION_THEMES.forEach((theme, i) => {
      const cachedImages = themeCache.get(theme.id);
      const run = () => {
        if (cachedImages) {
          setSections((prev) =>
            prev.map((s) =>
              s.id === theme.id ? { ...s, images: cachedImages, status: 'ready' } : s,
            ),
          );
          return;
        }
        void searchInspiration(theme.query, 12)
          .then((images) => {
            if (cancelled) return;
            themeCache.set(theme.id, images);
            setSections((prev) =>
              prev.map((s) =>
                s.id === theme.id ? { ...s, images, status: 'ready' } : s,
              ),
            );
          })
          .catch(() => {
            if (cancelled) return;
            setSections((prev) =>
              prev.map((s) => (s.id === theme.id ? { ...s, status: 'error' } : s)),
            );
          });
      };
      if (cachedImages) run();
      else timers.push(setTimeout(run, i * 250));
    });
    return () => {
      cancelled = true;
      for (const t of timers) clearTimeout(t);
    };
  }, []);

  // The active search overrides the curated themes.
  const runSearch = useCallback(
    async (q: string) => {
      const term = q.trim();
      if (!term || searching) return;
      setSearching(true);
      setSearchedQuery(term);
      setSections([{ id: 'results', label: `“${term}”`, query: term, images: [], status: 'loading' }]);
      try {
        const images = await searchInspiration(term, 40);
        setSections([{ id: 'results', label: `“${term}”`, query: term, images, status: 'ready' }]);
      } catch {
        setSections([{ id: 'results', label: `“${term}”`, query: term, images: [], status: 'error' }]);
      } finally {
        setSearching(false);
      }
    },
    [searching],
  );

  const backToThemes = useCallback(() => {
    setSearchedQuery(null);
    setQuery('');
    setSections(
      INSPIRATION_THEMES.map((t) => ({
        ...t,
        images: themeCache.get(t.id) ?? [],
        status: themeCache.has(t.id) ? ('ready' as const) : ('loading' as const),
      })),
    );
    INSPIRATION_THEMES.forEach((theme, i) => {
      if (themeCache.has(theme.id)) return;
      setTimeout(() => {
        void searchInspiration(theme.query, 12)
          .then((images) => {
            themeCache.set(theme.id, images);
            setSections((prev) =>
              prev.map((s) =>
                s.id === theme.id ? { ...s, images, status: 'ready' } : s,
              ),
            );
          })
          .catch(() =>
            setSections((prev) =>
              prev.map((s) => (s.id === theme.id ? { ...s, status: 'error' } : s)),
            ),
          );
      }, i * 250);
    });
  }, []);

  const sendToAi = useCallback(
    (img: InspirationImage) => {
      pendingAiReference = img;
      window.dispatchEvent(
        new CustomEvent('studio-ai-reference', { detail: img }),
      );
      useDesignCanvas.getState().setCanvasDock('AI');
    },
    [],
  );

  /** Download the full-res image → upload as an asset → place on the canvas. */
  const addToCanvas = useCallback(
    async (img: InspirationImage) => {
      if (busyTile) return;
      setBusyTile(img.url);
      try {
        const asset = await uploadCommonsImage(img, designId);
        await addLayer(designId, imageLayer(asset, blankDetail, printArea), onToast);
        useDesignCanvas.getState().saveImage({
          name: img.title,
          origin: 'inspiration',
          src: img.thumbUrl,
          sourceUrl: img.url,
        });
      } catch (e) {
        onToast(
          `Could not add that image (${e instanceof Error ? e.message : 'failed'}) — drag it onto the canvas to place a preview instead.`,
        );
      } finally {
        setBusyTile(null);
      }
    },
    [busyTile, designId, blankDetail, printArea, onToast],
  );

  useEffect(() => {
    onPrimary('Search Commons', () => {
      if (query.trim()) void runSearch(query);
      else onToast('Type an idea first — e.g. “1930s matchbook art”.');
    });
  }, [onPrimary, query, runSearch, onToast]);

  return (
    <>
      <form
        className={styles.searchRow}
        onSubmit={(e) => {
          e.preventDefault();
          void runSearch(query);
        }}
      >
        <span className={`material-symbols-outlined ${styles.searchIcon}`}>search</span>
        <input
          className={styles.searchInput}
          type="text"
          placeholder="Search free images — e.g. vintage badge, woodblock wave"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search free images on Wikimedia Commons"
        />
      </form>
      {searchedQuery && (
        <button type="button" className={styles.backToThemes} onClick={backToThemes}>
          <span className="material-symbols-outlined">arrow_back</span> Back to curated themes
        </button>
      )}
      {searching && <p className={styles.subtitle}>Searching Commons…</p>}
      {sections.map((s) => (
        <section key={s.id} className={styles.inspSection} data-insp-section={s.id}>
          <div className={styles.inspHeader}>
            <span className={styles.inspTitle}>{s.label}</span>
            <span className={styles.inspCount}>
              {s.status === 'loading' ? 'loading…' : s.status === 'error' ? 'failed' : `${s.images.length}`}
            </span>
          </div>
          {s.status === 'error' && (
            <p className={styles.subtitle}>Could not load this theme — try the search bar.</p>
          )}
          {s.status !== 'error' && (
            <div className={styles.inspCarousel}>
              {s.status === 'loading' &&
                Array.from({ length: 6 }).map((_, i) => <div key={i} className={styles.inspTileSkeleton} />)}
              {s.images.map((img) => (
                <div
                  key={img.url}
                  className={styles.inspTile}
                  data-insp-tile={img.title.slice(0, 40)}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      'studio-inspiration',
                      JSON.stringify({
                        url: img.url,
                        title: img.title,
                        width: img.width,
                        height: img.height,
                        thumbUrl: img.thumbUrl,
                      }),
                    );
                    e.dataTransfer.effectAllowed = 'copy';
                  }}
                  title={`${img.title} — drag onto the canvas, use with AI, or open on Commons`}
                >
                  <img src={img.thumbUrl} alt={img.title} loading="lazy" className={styles.inspImg} />
                  <div className={styles.inspOverlay}>
                    <button
                      type="button"
                      className={styles.inspAction}
                      title="Use as AI reference (full-res URL)"
                      onClick={() => sendToAi(img)}
                    >
                      <span className="material-symbols-outlined">auto_awesome</span>
                    </button>
                    <button
                      type="button"
                      className={styles.inspAction}
                      title="Add to canvas as an image layer"
                      disabled={busyTile === img.url}
                      onClick={() => void addToCanvas(img)}
                    >
                      <span className="material-symbols-outlined">
                        {busyTile === img.url ? 'hourglass_top' : 'add_to_photos'}
                      </span>
                    </button>
                    <a
                      className={styles.inspAction}
                      href={img.pageUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      title="Open on Wikimedia Commons (attribution / license)"
                    >
                      <span className="material-symbols-outlined">open_in_new</span>
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ))}
      <p className={styles.subtitle}>
        Free images from Wikimedia Commons — check each file page for its license.
      </p>
    </>
  );
}

/* ── B10 Shapes — vector shape set + color palette ── */

function ShapePreview({ render, color }: { render: StudioShape['render']; color: string }) {
  const stroke = color === '#ffffff' ? '#111111' : color;
  switch (render) {
    case 'rect':
      return <rect x="4" y="8" width="24" height="16" rx="0" fill={color} />;
    case 'rectRound':
      return <rect x="4" y="8" width="24" height="16" rx="5" fill={color} />;
    case 'ellipse':
      return <ellipse cx="16" cy="16" rx="12" ry="8.5" fill={color} />;
    case 'triangle':
      return <polygon points="16,5 28,27 4,27" fill={color} />;
    case 'line':
      return <line x1="5" y1="16" x2="27" y2="16" stroke={stroke} strokeWidth="3" strokeLinecap="round" />;
    case 'arrow':
      return (
        <g>
          <line x1="4" y1="16" x2="24" y2="16" stroke={stroke} strokeWidth="3" strokeLinecap="round" />
          <polygon points="24,10 30,16 24,22" fill={color} />
        </g>
      );
    case 'star':
      return (
        <polygon
          points="16,4 19.5,11.5 28,12.3 21.6,17.8 23.5,26 16,21.6 8.5,26 10.4,17.8 4,12.3 12.5,11.5"
          fill={color}
        />
      );
    case 'heart':
      return (
        <path
          d="M16 26 C6 19 4 12 8 8.5 C11 6 14.5 7 16 10 C17.5 7 21 6 24 8.5 C28 12 26 19 16 26 Z"
          fill={color}
        />
      );
    case 'ring':
      return <circle cx="16" cy="16" r="10" fill="none" stroke={stroke} strokeWidth="4" />;
    case 'diamond':
      return <polygon points="16,4 28,16 16,28 4,16" fill={color} />;
    default:
      return <rect x="4" y="8" width="24" height="16" fill={color} />;
  }
}

function ShapesPanel({ onToast, designId, blankDetail, printArea, onPrimary, onPlaceShape }: PanelProps) {
  const [color, setColor] = useState(STUDIO_SHAPE_COLORS[0]);
  const [shape, setShape] = useState<StudioShape>(STUDIO_SHAPES[0]);

  const place = useCallback(
    (s: StudioShape, c: string) => {
      // Canvas dock wiring — the layer lands visually on the canvas.
      if (onPlaceShape) {
        onPlaceShape(s, c);
        return;
      }
      // Drawer-only wiring (sidebar click outside the canvas): persist a
      // shape layer into the draft placement_spec when one exists.
      void addLayer(
        designId,
        {
          kind: 'shape',
          ...placementFor(blankDetail, printArea, 3, 3),
          z: 0,
        },
        onToast,
      );
    },
    [onPlaceShape, designId, blankDetail, printArea, onToast],
  );

  useEffect(() => {
    onPrimary('Place shape', () => place(shape, color));
  }, [onPrimary, place, shape, color]);

  return (
    <>
      <div className={styles.fieldLabel}>Shape</div>
      <div className={styles.tileGrid}>
        {STUDIO_SHAPES.map((s) => (
          <div
            key={s.id}
            className={`${styles.tile} ${shape.id === s.id ? styles.tileSelected : ''}`}
            data-shape-tile={s.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-shape', `${s.id}:${color}`);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => {
              setShape(s);
              place(s, color);
            }}
            title={s.label}
          >
            <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden="true">
              <ShapePreview render={s.render} color={color} />
            </svg>
          </div>
        ))}
      </div>
      <div className={styles.sectionHeading}>Color</div>
      <div className={styles.chipRow}>
        {STUDIO_SHAPE_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            aria-label={`Color ${c}`}
            className={`${styles.colorDot} ${c === color ? styles.colorDotActive : ''}`}
            style={{ background: c }}
            onClick={() => {
              setColor(c);
              place(shape, c);
            }}
          />
        ))}
      </div>
    </>
  );
}

/* ── B11 Themes — palettes + font pairings ── */

function ThemesPanel({ onToast, onApplyTheme }: PanelProps) {
  const apply = useCallback(
    (t: StudioTheme) => {
      if (onApplyTheme) {
        onApplyTheme(t);
        return;
      }
      onToast(`Theme "${t.name}" — ${t.mood}. Font pair: ${t.fontPair}.`);
    },
    [onApplyTheme, onToast],
  );

  return (
    <>
      <div className={styles.themeList}>
        {STUDIO_THEMES.map((t) => (
          <div
            key={t.id}
            className={styles.themeCard}
            data-theme-card={t.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('studio-theme', t.id);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => apply(t)}
            title={`${t.name} — ${t.mood}`}
          >
            <div className={styles.themeSwatches}>
              {t.colors.map((c) => (
                <span key={c} className={styles.themeSwatch} style={{ background: c }} />
              ))}
            </div>
            <div className={styles.themeInfo}>
              <b className={styles.themeName}>{t.name}</b>
              <span className={styles.themeMeta}>{t.mood}</span>
              <span className={styles.themeFont}>{t.fontPair}</span>
            </div>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={(e) => {
                e.stopPropagation();
                apply(t);
              }}
            >
              Apply
            </button>
          </div>
        ))}
      </div>
    </>
  );
}

async function patchDesign(id: string, body: Record<string, unknown>): Promise<boolean> {
  const res = await fetch(`/api/v1/designs/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.ok;
}

/**
 * Create actions — the sidebar no longer carries Preview, View product page
 * or My orders; they live here, in every drawer, beside the save actions.
 * Preview / product page switch the session view (the session guards them:
 * with no product loaded they open Browse Products instead). Save to
 * Collection writes designs.collection_id; Save to My templates writes
 * designs.is_template. Both need a saved design — the buttons say so when
 * there is none yet.
 */
function CreateActions({
  onClose,
  onToast,
  onNavigate,
}: {
  onClose: () => void;
  onToast: (message: string) => void;
  onNavigate?: (screenId: string) => void;
}) {
  const designId = useDesignCanvas((s) => s.designId);
  const setView = useDesignCanvas((s) => s.setView);
  const [collections, setCollections] = useState<{ id: string; name: string }[]>([]);
  const [collectionId, setCollectionId] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/collections');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setCollections(data.items ?? []);
      } catch {
        // Collections stay empty — the select says so.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveToCollection = async () => {
    if (!designId || !collectionId) return;
    setSaving(true);
    try {
      const ok = await patchDesign(designId, { collectionId });
      const name = collections.find((c) => c.id === collectionId)?.name ?? 'Collection';
      onToast(ok ? `Saved to ${name}.` : 'Could not save to that collection.');
    } finally {
      setSaving(false);
    }
  };
  const saveToTemplates = async () => {
    if (!designId) return;
    setSaving(true);
    try {
      const ok = await patchDesign(designId, { isTemplate: true });
      onToast(ok ? 'Saved to My templates.' : 'Could not save to My templates.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ borderTop: '1px solid #e8eaed', marginTop: 16, paddingTop: 12 }}>
      <div className={styles.sectionHeading}>Create actions</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={() => {
            setView('preview');
            onClose();
          }}
        >
          Preview
        </button>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={() => {
            setView('product');
            onClose();
          }}
        >
          View product page
        </button>
        <button
          type="button"
          className={styles.cancelBtn}
          onClick={() => {
            onNavigate?.('studio-orders');
            onClose();
          }}
        >
          My orders
        </button>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <select
          aria-label="Collection"
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
          disabled={!designId || saving}
          style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid #dadce0', fontSize: 13, minWidth: 160 }}
        >
          <option value="">{collections.length === 0 ? 'No collections' : 'Pick a collection…'}</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!designId || !collectionId || saving}
          onClick={() => void saveToCollection()}
        >
          Save to Collection
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={!designId || saving}
          onClick={() => void saveToTemplates()}
        >
          Save to My templates
        </button>
      </div>
      {!designId && (
        <p className={styles.subtitle} style={{ marginTop: 8 }}>
          Save actions need a saved design — save the canvas first.
        </p>
      )}
    </div>
  );
}

/**
 * ONE source of truth for every tool panel. Used by the StudioDrawer
 * overlay (right side, opened from the sidebar) AND by the canvas left
 * dock (Canva-style expandable rail). Both hosts render the exact same
 * panels with the exact same data — no divergent experiences.
 */
export interface StudioPanelContentProps extends PanelProps {
  kind: string;
  onNavigate?: (screenId: string) => void;
  /** Host close — closes the drawer overlay / collapses the dock. */
  onClosePanel: () => void;
}

export function StudioPanelContent({
  kind,
  onToast,
  designId,
  blankDetail,
  printArea,
  onPrimary,
  onPlaceShape,
  onPlaceText,
  onApplyTheme,
  onNavigate,
  onClosePanel,
}: StudioPanelContentProps) {
  const panelProps: PanelProps = { onToast, designId, blankDetail, printArea, onPrimary, onPlaceShape, onPlaceText, onApplyTheme };
  return (
    <>
      {kind === 'Upload' && <UploadPanel {...panelProps} />}
      {kind === 'AI' && <AiPanel {...panelProps} />}
      {kind === 'Text' && <TextPanel {...panelProps} />}
      {kind === 'My library' && <LibraryPanel {...panelProps} />}
      {kind === 'Graphics' && <GraphicsPanel {...panelProps} />}
      {kind === 'My templates' && <TemplatesPanel {...panelProps} />}
      {kind === 'Images' && <InspirationPanel {...panelProps} />}
      {kind === 'Shapes' && <ShapesPanel {...panelProps} />}
      {kind === 'Themes' && <ThemesPanel {...panelProps} />}
      {kind === 'Inspiration' && <InspirationPanel {...panelProps} />}
      {kind === 'Supplier' && <SupplierInspector onToast={onToast} />}
      {kind === 'Queue' && <QueueInspector onToast={onToast} />}
      {/* Create actions — Preview, View product page and My orders no
          longer live in the sidebar; they live here, in the drawers,
          next to the save actions for Collections and My templates. */}
      {kind !== 'Supplier' && kind !== 'Queue' && (
        <CreateActions onClose={onClosePanel} onToast={onToast} onNavigate={onNavigate} />
      )}
    </>
  );
}

export default function StudioDrawer({ open, kind, onClose, onToast, onNavigate }: StudioDrawerProps) {
  const meta = KIND_META[kind] || KIND_META.Upload;
  const designId = useDesignCanvas((s) => s.designId);
  const blankDetail = useDesignCanvas((s) => s.blankDetail);
  const printArea = useDesignCanvas((s) => s.printArea);

  const [primary, setPrimary] = useState<{ label: string; run: () => void }>({
    label: meta.action,
    run: () => onToast(`${meta.action} — ${kind}`),
  });
  const onPrimary = useCallback((label: string, run: () => void) => {
    setPrimary({ label, run });
  }, []);

  return (
    <>
      <div
        id="studio-scrim"
        className={`${styles.scrim} ${open ? styles.scrimOpen : ''}`}
        onClick={onClose}
      />
      <div
        id="studio-drawer"
        className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
        role="dialog"
        aria-label={`${kind} panel`}
      >
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={`material-symbols-outlined ${styles.icon20Primary}`}>{meta.icon}</span>
            <div>
              <div id="studio-drawer-title" className={styles.title}>
                {kind}
              </div>
              <div className={styles.subtitle}>{meta.subtitle}</div>
            </div>
          </div>
          <div className={styles.headerRight}>
            <button type="button" className={styles.iconBtn} title="Maximize">
              <span className={`material-symbols-outlined ${styles.icon18}`}>open_in_full</span>
            </button>
            <button
              id="studio-drawer-close"
              type="button"
              className={styles.iconBtn}
              title="Close"
              onClick={onClose}
            >
              <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
            </button>
          </div>
        </div>

        <div className={styles.body}>
          <StudioPanelContent
            kind={kind}
            onToast={onToast}
            designId={designId}
            blankDetail={blankDetail}
            printArea={printArea}
            onPrimary={onPrimary}
            onNavigate={onNavigate}
            onClosePanel={onClose}
          />
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.cancelBtn} onClick={onClose}>
            Close
          </button>
          <button type="button" className={styles.primaryBtn} onClick={() => primary.run()}>
            {kind === 'Queue' ? `Start designing` : primary.label}
          </button>
        </div>
      </div>
    </>
  );
}

// ── Supplier inspector — shown when a top-bar category is clicked.
function SupplierInspector({ onToast }: { onToast: (msg: string) => void }) {
  const supplierCategory = useDesignCanvas((s) => s.supplierCategory);
  const loadBlank = useDesignCanvas((s) => s.loadBlank);
  const data = SUPPLIER_CATEGORY_DATA;

  if (!supplierCategory) {
    return (
      <div className={styles.supplierEmpty}>
        <span className={`material-symbols-outlined ${styles.supplierEmptyIcon}`}>
          inventory_2
        </span>
        <p className={styles.supplierEmptyText}>
          Select a category from the top bar to view supplier data.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Breadcrumb header */}
      <div className={styles.supplierHero}>
        <div className={styles.supplierBreadcrumb}>
          {supplierCategory.category} / {supplierCategory.subcategory}
        </div>
        <h2 className={styles.supplierProductName}>{data.productName}</h2>
        <div className={styles.supplierTags}>
          <span className={styles.supplierTag}>Supplier: {data.supplier}</span>
          <span className={styles.supplierTag}>SKU: {data.sku}</span>
        </div>
        <p className={styles.supplierHint}>
          Live API data. Select a variant to begin designing.
        </p>
      </div>

      {/* Available Colors */}
      <h4 className={styles.supplierSectionTitle}>
        Available Colors ({data.colors.length})
      </h4>
      <div className={styles.supplierColorGrid}>
        {data.colors.map((c, i) => (
          <button
            key={c.sku}
            type="button"
            className={`${styles.supplierColorBtn} ${i === 0 ? styles.supplierColorBtnActive : ''}`}
            onClick={() => {
              useDesignCanvas.getState().selectColor({ name: c.name, hex: c.hex, sku: c.sku });
              onToast(`Selected color: ${c.name} (${c.sku})`);
            }}
          >
            <div
              className={styles.supplierColorSwatch}
              style={{ background: c.hex }}
            />
            <span className={styles.supplierColorName}>{c.name}</span>
            <span className={styles.supplierColorSku}>{c.sku}</span>
          </button>
        ))}
      </div>

      {/* Available Sizes */}
      <h4 className={styles.supplierSectionTitleSpaced}>Available Sizes</h4>
      <div className={styles.supplierSizes}>
        {data.sizes.map((s) => (
          <span
            key={s}
            className={styles.supplierSizeTag}
            onClick={() => onToast(`Size ${s} selected`)}
          >
            {s}
          </span>
        ))}
      </div>

      {/* Available Models (Mockups) */}
      <h4 className={styles.supplierSectionTitleSpaced}>
        Available Models (Mockups)
      </h4>
      <div className={styles.supplierModels}>
        {data.models.map((m, i) => (
          <div
            key={m}
            className={`${styles.supplierModelThumb} ${i === 0 ? styles.supplierModelThumbActive : ''}`}
            onClick={() => onToast(`Model: ${m}`)}
          >
            <span className={`material-symbols-outlined ${styles.supplierModelIcon}`}>
              image
            </span>
          </div>
        ))}
      </div>

      {/* Design with this SKU + View product page link */}
      <button
        type="button"
        className={styles.supplierDesignBtn}
        onClick={() => {
          loadBlank('tee');
          onToast(`${data.productName} loaded onto canvas.`);
        }}
      >
        Design with this SKU
      </button>
      <button
        type="button"
        className={styles.supplierProductPageLink}
        onClick={() => {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('navigate-product-page'));
          }
        }}
      >
        View product page →
      </button>
    </>
  );
}

// ── B9 Queue inspector — persisted per user in design_queue.
// "Start designing" opens each queued blank in turn in the Studio;
// finishing one marks it done and advances to the next.
function QueueInspector({ onToast }: { onToast: (msg: string) => void }) {
  const localQueue = useDesignCanvas((s) => s.designQueue);
  const addToQueue = useDesignCanvas((s) => s.addToQueue);
  const removeFromQueue = useDesignCanvas((s) => s.removeFromQueue);
  const loadBlankDetail = useDesignCanvas((s) => s.loadBlankDetail);
  const startDesign = useDesignCanvas((s) => s.startDesign);

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState(false);
  const syncedRef = useRef(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const { queue: rows } = await listQueue();
      setQueue(rows);
      setStatus('ready');
    } catch {
      setStatus('error');
    }
  }, []);

  // Persist anything the flyout queued locally but never saved to the DB.
  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;
    void (async () => {
      try {
        const { queue: rows } = await listQueue();
        const queuedIds = new Set(rows.map((r) => r.supplierCatalogProductId));
        for (const q of localQueue) {
          if (!queuedIds.has(q.id)) {
            try {
              await enqueue({ supplierCatalogProductId: q.id });
            } catch {
              /* already queued (409) — skip */
            }
          }
        }
        // And mirror the persisted queue into the local list so the
        // canvas screen and the inspector show the same items.
        const localIds = new Set(localQueue.map((q) => q.id));
        for (const r of rows) {
          if (r.supplierCatalogProductId && !localIds.has(r.supplierCatalogProductId)) {
            addToQueue({
              id: r.supplierCatalogProductId,
              name: r.name ?? 'Queued product',
              brand: r.brand ?? '',
              price: 0,
              blankKey: r.supplierCatalogProductId,
              img: r.imageUrl ?? '',
            });
          }
        }
      } catch {
        /* queue persistence unavailable — the inspector shows the error */
      }
      await load();
    })();
  }, [localQueue, addToQueue, load]);

  const startNext = useCallback(async () => {
    if (busy) return;
    const first = queue[0];
    if (!first) return;
    setBusy(true);
    try {
      let productId = first.supplierCatalogProductId;
      if (!productId && first.designId) {
        const { design } = await getDesignDetail(first.designId);
        productId = design.blankId as string | null;
      }
      if (!productId) throw new Error('Queued item has no blank attached.');
      await updateQueueItem(first.id, 'active');
      const detail = await loadBlankDetail(productId);
      if (!detail) throw new Error('Could not load that blank.');
      await startDesign(detail);
      await updateQueueItem(first.id, 'done');
      const remaining = queue.length - 1;
      setQueue((prev) => prev.filter((q) => q.id !== first.id));
      onToast(
        remaining > 0
          ? `Loaded "${detail.name}" onto canvas. ${remaining} remaining in the queue.`
          : `Loaded "${detail.name}" onto canvas. Queue complete.`,
      );
    } catch (e) {
      await updateQueueItem(first.id, 'queued').catch(() => undefined);
      onToast(`Could not start that item: ${e instanceof Error ? e.message : 'failed'}`);
    } finally {
      setBusy(false);
    }
  }, [busy, queue, loadBlankDetail, startDesign, onToast]);

  if (status === 'loading') {
    return <p className={styles.queueEmptyText}>Loading the queue…</p>;
  }
  if (status === 'error') {
    return (
      <div className={styles.queueEmpty}>
        <span className={`material-symbols-outlined ${styles.queueEmptyIcon}`}>
          playlist_add
        </span>
        <p className={styles.queueEmptyText}>Could not load the queue.</p>
      </div>
    );
  }
  if (queue.length === 0) {
    return (
      <div className={styles.queueEmpty}>
        <span className={`material-symbols-outlined ${styles.queueEmptyIcon}`}>
          playlist_add
        </span>
        <p className={styles.queueEmptyText}>
          No items in queue. Add products from the category flyout.
        </p>
      </div>
    );
  }

  return (
    <>
      {queue.map((q) => (
        <div key={q.id} className={styles.queueItem}>
          {q.imageUrl ? (
            <img src={q.imageUrl} alt={q.name ?? 'Queued product'} className={styles.queueItemImg} />
          ) : (
            <span className={`material-symbols-outlined ${styles.queueItemImg}`}>image</span>
          )}
          <div className={styles.queueItemInfo}>
            <b className={styles.queueItemName}>{q.name ?? 'Queued product'}</b>
            <span className={styles.queueItemMeta}>{q.brand ?? ''}</span>
          </div>
          <button
            type="button"
            className={styles.queueItemRemove}
            onClick={async (e) => {
              e.stopPropagation();
              try {
                await removeQueueItem(q.id);
                if (q.supplierCatalogProductId) removeFromQueue(q.supplierCatalogProductId);
                setQueue((prev) => prev.filter((x) => x.id !== q.id));
                onToast(`Removed "${q.name ?? 'item'}" from queue.`);
              } catch (err) {
                onToast(`Could not remove it: ${err instanceof Error ? err.message : 'failed'}`);
              }
            }}
          >
            <span className={`material-symbols-outlined ${styles.queueItemRemoveIcon}`}>
              close
            </span>
          </button>
        </div>
      ))}
      <button
        type="button"
        className={styles.queueStartBtn}
        onClick={() => void startNext()}
        disabled={busy}
      >
        {busy ? 'Loading…' : `Start designing (${queue.length})`}
      </button>
    </>
  );
}
