/**
 * Shared render core — Lane 2 (render contract §3) + Lane 7 (Studio output).
 *
 * ONE function family used by the Studio (browser, via buildStage) and the
 * render worker (Node, same buildStage + inputHash). Pure TypeScript: no I/O,
 * no fetch, no storage access in this package, so the browser build and the
 * Node build compute identical results from identical inputs.
 *
 * Types already owned by podApi.ts are imported from there (type-only, so
 * this file has no runtime dependency on the browser client):
 *   PlacementSpec / PlacementLayer — the Studio's output shape.
 * What this file adds (per contract §3): BlankView (the RENDER shape —
 * storage paths + sha256s, distinct from podApi's client BlankView, which
 * carries display URLs + label), ViewAngle, RenderRequest, StageDescription,
 * boxToPixels, buildStage, scaleStage, RENDERER_VERSION, canonicalJSON,
 * sha256Hex, inputHash, placementFromLayers, blankViewFromTemplateRow.
 *
 * RENDERER_VERSION is "1". Bump it on ANY change to compositing math —
 * inputHash includes it, so a bump invalidates every cached render.
 *
 * Hash contract (§3): input_hash =
 *   sha256( RENDERER_VERSION + '|' + baseSha256 + '|' + shadingSha256 + '|'
 *   + maskSha256 + '|' + colorHex + '|' + view + '|' + kind + '|'
 *   + canonicalJSON(placement) + '|' + assetHashes + '|' + targetPxWidth
 *   + '|' + canonicalJSON(supplierTransform) )
 * where assetHashes is the sha256 of every referenced design asset, sorted
 * by assetId and joined with ',' (empty when the placement references no
 * asset). A null shading/mask hash contributes an empty segment — the
 * delimiters are always present, so a missing layer can never collide with
 * a present one.
 *
 * Canonical JSON: object keys sorted recursively; arrays keep order;
 * numbers are rounded to 6 decimal places (fixed formatting — no
 * exponent drift, no 0.1+0.2 artifacts) with trailing zeros trimmed.
 */
import type { PlacementLayer, PlacementSpec } from './podApi';

export const RENDERER_VERSION = '1';

export type ViewAngle =
  | 'FRONT'
  | 'BACK'
  | 'LEFT_SIDE'
  | 'RIGHT_SIDE'
  | 'WRAPAROUND'
  | 'TOP_DOWN'
  | 'INSIDE_LABEL';

export const VIEW_ANGLES: ViewAngle[] = [
  'FRONT',
  'BACK',
  'LEFT_SIDE',
  'RIGHT_SIDE',
  'WRAPAROUND',
  'TOP_DOWN',
  'INSIDE_LABEL',
];

export function isViewAngle(value: unknown): value is ViewAngle {
  return typeof value === 'string' && (VIEW_ANGLES as string[]).includes(value);
}

/**
 * One row of product_canvas_templates, as the renderer reads it. The only
 * thing the renderer reads (contract §1): base photo, shading, mask, print
 * box, pixels per inch, verified flag. Never a supplier URL.
 */
export interface BlankView {
  blankId: string;
  view: ViewAngle;
  basePath: string;
  shadingPath: string | null;
  maskPath: string | null;
  baseSha256: string;
  shadingSha256: string | null;
  maskSha256: string | null;
  pxPerInch: number;
  /** Print zone in base-photo pixels. */
  boxPx: { left: number; top: number; width: number; height: number };
  /** Print zone in inches, derived: px / pxPerInch. */
  boxIn: { xIn: number; yIn: number; wIn: number; hIn: number };
  verified: boolean;
  /** Base-photo dimensions in px — null when unknown (live template rows
   * do not carry them); the caller fills them from the loaded image. */
  photoWidthPx: number | null;
  photoHeightPx: number | null;
}

export interface RenderRequest {
  designId: string;
  blankId: string;
  view: ViewAngle;
  color: string;
  kind: 'mockup' | 'print';
  placement: PlacementSpec;
  targetPxWidth: number;
  /** Order-time only. */
  supplierTransform?: { offsetXIn: number; offsetYIn: number; scale: number };
}

/** One design layer positioned on the base photo, in photo pixels. */
export interface StageLayer {
  kind: 'image' | 'text' | 'shape';
  assetId?: string;
  text?: { value: string; fontId: string; sizeIn: number; fill: string };
  view: ViewAngle;
  /** Absolute position on the base photo (box offset applied). */
  xPx: number;
  yPx: number;
  widthPx: number;
  heightPx: number;
  /** Position/size in inches inside the print box, as authored. */
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  rotationDeg: number;
  z: number;
}

/**
 * The stage description buildStage returns. Serializable data — not a
 * mounted Konva stage. The browser caller mounts a Konva stage from it
 * (base image + garment fill + shading multiply + mask + layers at xPx/yPx);
 * the Node worker consumes the identical description. Same inputs give the
 * same description in both environments.
 */
export interface StageDescription {
  version: string;
  blankId: string;
  view: ViewAngle;
  color: string;
  colorHex: string;
  photoWidthPx: number | null;
  photoHeightPx: number | null;
  boxPx: { left: number; top: number; width: number; height: number };
  boxIn: { xIn: number; yIn: number; wIn: number; hIn: number };
  pxPerInch: number;
  base: { path: string; sha256: string };
  shading: { path: string | null; sha256: string | null };
  mask: { path: string | null; sha256: string | null };
  /** Layers for this view only, sorted by z ascending. */
  layers: StageLayer[];
  verified: boolean;
}

// ── SHA-256 (pure TypeScript; sync in browser and Node — no WebCrypto
// async split, no node:crypto import, so both callers hash identically). ──

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(x: number, n: number): number {
  return (x >>> n) | (x << (32 - n));
}

/** SHA-256 hex digest of a UTF-8 string. Verified against node:crypto vectors. */
export function sha256Hex(input: string): string {
  const bytes = new TextEncoder().encode(input);
  const bitLenLow = (bytes.length << 3) >>> 0;
  const bitLenHigh = Math.floor(bytes.length / 0x20000000) >>> 0;
  const paddedLen = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLen);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const dv = new DataView(padded.buffer);
  dv.setUint32(paddedLen - 8, bitLenHigh);
  dv.setUint32(paddedLen - 4, bitLenLow);

  let h0 = 0x6a09e667;
  let h1 = 0xbb67ae85;
  let h2 = 0x3c6ef372;
  let h3 = 0xa54ff53a;
  let h4 = 0x510e527f;
  let h5 = 0x9b05688c;
  let h6 = 0x1f83d9ab;
  let h7 = 0x5be0cd19;

  const w = new Uint32Array(64);
  for (let off = 0; off < paddedLen; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let f = h5;
    let g = h6;
    let h = h7;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + SHA256_K[i] + w[i]) | 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    h0 = (h0 + a) | 0;
    h1 = (h1 + b) | 0;
    h2 = (h2 + c) | 0;
    h3 = (h3 + d) | 0;
    h4 = (h4 + e) | 0;
    h5 = (h5 + f) | 0;
    h6 = (h6 + g) | 0;
    h7 = (h7 + h) | 0;
  }

  const out = new DataView(new ArrayBuffer(32));
  out.setUint32(0, h0);
  out.setUint32(4, h1);
  out.setUint32(8, h2);
  out.setUint32(12, h3);
  out.setUint32(16, h4);
  out.setUint32(20, h5);
  out.setUint32(24, h6);
  out.setUint32(28, h7);
  return Array.from(new Uint8Array(out.buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Canonical JSON: sorted keys, fixed number formatting. ──

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`canonicalJSON: non-finite number ${n}`);
  // Round to 6 decimal places so 0.1+0.2-style artifacts never leak into a
  // hash; trailing zeros trimmed, so 12.5 stays "12.5" and 3600 stays "3600".
  const rounded = Math.round(n * 1e6) / 1e6;
  return String(rounded);
}

export function canonicalJSON(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number') return formatNumber(value);
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => canonicalJSON(v)).join(',')}]`;
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts: string[] = [];
    for (const k of keys) {
      if (obj[k] === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${canonicalJSON(obj[k])}`);
    }
    return `{${parts.join(',')}}`;
  }
  throw new Error(`canonicalJSON: unsupported value of type ${typeof value}`);
}

// ── Geometry ──

/** Print box in inches → print box in photo pixels. Math.round per contract. */
export function boxToPixels(
  box: BlankView['boxIn'],
  pxPerInch: number,
): { left: number; top: number; width: number; height: number } {
  return {
    left: Math.round(box.xIn * pxPerInch),
    top: Math.round(box.yIn * pxPerInch),
    width: Math.round(box.wIn * pxPerInch),
    height: Math.round(box.hIn * pxPerInch),
  };
}

/**
 * Map a live product_canvas_templates row to the render contract's BlankView.
 * Reads the contract §2 columns (canonical_product_id, view_angle,
 * stored_base_path/shading/mask, base_sha256/shading_sha256/mask_sha256,
 * px_per_inch, print_zone_x/y/width/height, verified). boxPx is the stored
 * print zone in photo pixels; boxIn is px / pxPerInch. Throws on an unknown
 * view_angle or a missing/zero px_per_inch — never silently coerces.
 */
export function blankViewFromTemplateRow(row: Record<string, unknown>): BlankView {
  const viewRaw = String(row.view_angle ?? '');
  if (!isViewAngle(viewRaw)) {
    throw new Error(`blankViewFromTemplateRow: unknown view_angle "${viewRaw}"`);
  }
  const pxPerInch = Number(row.px_per_inch);
  if (!Number.isFinite(pxPerInch) || pxPerInch <= 0) {
    throw new Error(
      `blankViewFromTemplateRow: missing px_per_inch for view ${viewRaw}`,
    );
  }
  const boxPx = {
    left: Number(row.print_zone_x ?? 0),
    top: Number(row.print_zone_y ?? 0),
    width: Number(row.print_zone_width ?? 0),
    height: Number(row.print_zone_height ?? 0),
  };
  const r4 = (n: number) => Math.round(n * 10000) / 10000;
  return {
    blankId: String(row.canonical_product_id ?? ''),
    view: viewRaw,
    basePath: String(row.stored_base_path ?? ''),
    shadingPath: row.stored_shading_path == null ? null : String(row.stored_shading_path),
    maskPath: row.stored_mask_path == null ? null : String(row.stored_mask_path),
    baseSha256: String(row.base_sha256 ?? ''),
    shadingSha256: row.shading_sha256 == null ? null : String(row.shading_sha256),
    maskSha256: row.mask_sha256 == null ? null : String(row.mask_sha256),
    pxPerInch,
    boxPx,
    boxIn: {
      xIn: r4(boxPx.left / pxPerInch),
      yIn: r4(boxPx.top / pxPerInch),
      wIn: r4(boxPx.width / pxPerInch),
      hIn: r4(boxPx.height / pxPerInch),
    },
    verified: row.verified === true,
    photoWidthPx: null,
    photoHeightPx: null,
  };
}

// ── Stage ──

/**
 * The ONE function both callers use (contract §3). Browser: mounts a Konva
 * stage from the returned description. Worker: headless, consumes the same
 * description. Layers are filtered to the requested view and sorted by z;
 * positions are computed in photo pixels from the placement's inches.
 */
export function buildStage(
  blank: BlankView,
  view: ViewAngle,
  color: string,
  colorHex: string,
  placement: PlacementSpec,
): StageDescription {
  if (blank.view !== view) {
    throw new Error(
      `buildStage: blank view is ${blank.view}, requested ${view}`,
    );
  }
  const hex = colorHex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) {
    throw new Error(`buildStage: bad colorHex "${colorHex}"`);
  }
  const layers: StageLayer[] = (placement.layers ?? [])
    .filter((l) => l.view === view)
    .slice()
    .sort((a, b) => a.z - b.z)
    .map((l) => ({
      kind: l.kind,
      assetId: l.assetId,
      text: l.text,
      view,
      xPx: blank.boxPx.left + Math.round(l.xIn * blank.pxPerInch),
      yPx: blank.boxPx.top + Math.round(l.yIn * blank.pxPerInch),
      widthPx: Math.round(l.wIn * blank.pxPerInch),
      heightPx: Math.round(l.hIn * blank.pxPerInch),
      xIn: l.xIn,
      yIn: l.yIn,
      wIn: l.wIn,
      hIn: l.hIn,
      rotationDeg: l.rotationDeg ?? 0,
      z: l.z,
    }));
  return {
    version: RENDERER_VERSION,
    blankId: blank.blankId,
    view,
    color,
    colorHex: hex,
    photoWidthPx: blank.photoWidthPx,
    photoHeightPx: blank.photoHeightPx,
    boxPx: { ...blank.boxPx },
    boxIn: { ...blank.boxIn },
    pxPerInch: blank.pxPerInch,
    base: { path: blank.basePath, sha256: blank.baseSha256 },
    shading: { path: blank.shadingPath, sha256: blank.shadingSha256 },
    mask: { path: blank.maskPath, sha256: blank.maskSha256 },
    layers,
    verified: blank.verified,
  };
}

/**
 * Scale a stage description to a target photo width (mockup 400/800/1200,
 * or full print width). The caller supplies the source photo width — known
 * when the base image is loaded, or from the template's photo dims. All px
 * fields scale by target/source; inch fields are untouched.
 */
export function scaleStage(
  stage: StageDescription,
  sourcePhotoWidthPx: number,
  targetPxWidth: number,
): StageDescription {
  if (!Number.isFinite(sourcePhotoWidthPx) || sourcePhotoWidthPx <= 0) {
    throw new Error('scaleStage: sourcePhotoWidthPx must be a positive number');
  }
  if (!Number.isFinite(targetPxWidth) || targetPxWidth <= 0) {
    throw new Error('scaleStage: targetPxWidth must be a positive number');
  }
  const f = targetPxWidth / sourcePhotoWidthPx;
  const scaleBox = (b: { left: number; top: number; width: number; height: number }) => ({
    left: Math.round(b.left * f),
    top: Math.round(b.top * f),
    width: Math.round(b.width * f),
    height: Math.round(b.height * f),
  });
  return {
    ...stage,
    photoWidthPx: targetPxWidth,
    photoHeightPx:
      stage.photoHeightPx == null ? null : Math.round(stage.photoHeightPx * f),
    boxPx: scaleBox(stage.boxPx),
    layers: stage.layers.map((l) => ({
      ...l,
      xPx: Math.round(l.xPx * f),
      yPx: Math.round(l.yPx * f),
      widthPx: Math.round(l.widthPx * f),
      heightPx: Math.round(l.heightPx * f),
    })),
  };
}

// ── Input hash (contract §3) ──

/**
 * The cache key. `colorHex` is passed separately: RenderRequest carries the
 * color NAME; the hash needs the hex (resolved from
 * canonical_products.render_colors, else the known-name table). Throws when
 * a referenced design asset has no recorded sha256 — a render must never be
 * queued (or cached) on an unknown asset. `assetSha256` maps assetId →
 * sha256 hex of the asset file bytes.
 */
export function inputHash(
  blank: BlankView,
  req: RenderRequest,
  assetSha256: Record<string, string>,
  colorHex: string,
): string {
  // Geometry-only blanks (provider exposes no photo) carry no baseSha256 —
  // they render on the flat garment-color base, whose identity is fully
  // captured by the geometry fields already hashed below (boxIn/pxPerInch
  // via canonicalJSON of the placement + targetPxWidth). The old guard
  // threw, making those blanks un-renderable.
  if (req.view !== blank.view) {
    throw new Error(`inputHash: request view ${req.view} != blank view ${blank.view}`);
  }
  const hex = colorHex.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(hex)) {
    throw new Error(`inputHash: bad colorHex "${colorHex}"`);
  }
  const referenced = Array.from(
    new Set(
      (req.placement.layers ?? [])
        .map((l) => l.assetId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0),
    ),
  ).sort();
  const missing = referenced.filter((id) => !assetSha256[id]);
  if (missing.length > 0) {
    throw new Error(`inputHash: no sha256 for asset(s) ${missing.join(', ')}`);
  }
  const assetSegment = referenced.map((id) => assetSha256[id]).join(',');
  const parts = [
    RENDERER_VERSION,
    blank.baseSha256,
    blank.shadingSha256 ?? '',
    blank.maskSha256 ?? '',
    hex,
    req.view,
    req.kind,
    canonicalJSON(req.placement),
    assetSegment,
    String(req.targetPxWidth),
    canonicalJSON(req.supplierTransform ?? null),
  ];
  return sha256Hex(parts.join('|'));
}

// ── PlacementSpec from canvas layers (Lane 7) ──

/**
 * A canvas layer as the session store holds it: Konva node attributes in
 * inches, measured from the print box top-left (the contract's PlacementSpec
 * coordinate space). The parent wires this into the session store once
 * Konva layers land there; until then callers pass their layer list
 * directly. `view` is the ViewAngle the layer belongs to.
 */
export interface CanvasLayerInput {
  kind: 'image' | 'text' | 'shape';
  assetId?: string;
  text?: { value: string; fontId: string; sizeIn: number; fill: string };
  view: ViewAngle;
  xIn: number;
  yIn: number;
  wIn: number;
  hIn: number;
  rotationDeg?: number;
  z?: number;
}

/**
 * Convert canvas layers (inches, from the print box top-left) into the
 * contract's PlacementSpec (version 1). rotationDeg defaults to 0; z
 * defaults to the layer's index, so insertion order is the stack order.
 * Throws on non-finite geometry — a placement with NaN inches must never
 * be saved or queued.
 */
export function placementFromLayers(layers: CanvasLayerInput[]): PlacementSpec {
  const out: PlacementLayer[] = layers.map((l, i) => {
    for (const [k, v] of [
      ['xIn', l.xIn],
      ['yIn', l.yIn],
      ['wIn', l.wIn],
      ['hIn', l.hIn],
    ] as const) {
      if (!Number.isFinite(v)) {
        throw new Error(`placementFromLayers: layer ${i} has non-finite ${k}`);
      }
    }
    return {
      kind: l.kind,
      assetId: l.assetId,
      text: l.text,
      view: l.view,
      xIn: l.xIn,
      yIn: l.yIn,
      wIn: l.wIn,
      hIn: l.hIn,
      rotationDeg: l.rotationDeg ?? 0,
      z: l.z ?? i,
    };
  });
  return { version: 1, layers: out };
}
