'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  listRenders,
  type PlacementSpec,
  type PriceQuote,
  type RenderStatus,
} from '../../lib/podApi';

export interface ApprovedCell {
  view: string;
  color: string;
  renderId: string;
}

export interface ReviewGridProps {
  designId: string;
  /** canonical_products.id — the blank these renders belong to. */
  blankId: string;
  /** View angles for the matrix (from the blank's template rows). */
  views: string[];
  /** Garment colors selected for publishing. */
  colors: string[];
  /** The session's placement (inches, from the canvas). Null until art is placed. */
  placement: PlacementSpec | null;
  /** Server price — rendered only, never computed in this component. */
  price: PriceQuote | null;
  /** False until every view of the blank is verified (render_ready gate). */
  templateVerified: boolean;
  /** Why the template is not verified, e.g. 'No stored base photo'. */
  templateBlocker?: string | null;
  /** Mockup target width; default 1200 (worker also writes 400/800). */
  targetPxWidth?: number;
  onApproveAll?: (cells: ApprovedCell[]) => void;
  onQueue?: (renders: RenderStatus[]) => void;
}

const cellKey = (view: string, color: string) => `${view}|${color}`;

const STATUS_LABEL: Record<string, string> = {
  queued: 'Queued',
  running: 'Rendering…',
  succeeded: 'Ready',
  failed: 'Failed',
  stale: 'Stale',
};

/** Public URL for a stored render — only when the public Supabase URL is
 * configured. Otherwise the cell shows the storage path as text; no URL is
 * guessed. */
function publicRenderUrl(storagePath: string | null): string | null {
  if (!storagePath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base.replace(/\/$/, '')}/storage/v1/object/public/${storagePath}`;
}

export default function ReviewGrid({
  designId,
  blankId,
  views,
  colors,
  placement,
  price,
  templateVerified,
  templateBlocker,
  targetPxWidth = 1200,
  onApproveAll,
  onQueue,
}: ReviewGridProps) {
  const [renders, setRenders] = useState<RenderStatus[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());
  const [approved, setApproved] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);

  const pending = renders.some((r) => r.status === 'queued' || r.status === 'running');

  useEffect(() => {
    let stop = false;
    const load = async () => {
      try {
        const res = await listRenders(designId);
        if (!stop) {
          setRenders(res.renders ?? []);
          setLoadError(null);
        }
      } catch (e) {
        if (!stop) setLoadError(e instanceof Error ? e.message : 'Failed to load renders.');
      }
    };
    void load();
    if (!pending) return () => {
      stop = true;
    };
    const t = setInterval(() => void load(), 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [designId, pending]);

  const mockupByCell = useMemo(() => {
    const m = new Map<string, RenderStatus>();
    for (const r of renders) {
      if (r.kind !== 'mockup') continue;
      m.set(cellKey(r.view, r.color), r);
    }
    return m;
  }, [renders]);

  const printRows = useMemo(
    () => renders.filter((r) => r.kind === 'print'),
    [renders],
  );

  const includedCells = useMemo(
    () =>
      views.flatMap((view) =>
        colors
          .filter((color) => !excluded.has(cellKey(view, color)))
          .map((color) => ({ view, color })),
      ),
    [views, colors, excluded],
  );

  /** Dry run: cells that would actually be queued (not already succeeded,
   * queued, or running). This is a count only — nothing is queued. */
  const dryRunCount = includedCells.filter((c) => {
    const r = mockupByCell.get(cellKey(c.view, c.color));
    return !r || r.status === 'failed' || r.status === 'stale';
  }).length;

  const allSucceeded =
    includedCells.length > 0 &&
    includedCells.every((c) => mockupByCell.get(cellKey(c.view, c.color))?.status === 'succeeded');

  const queueBlockedReason = !templateVerified
    ? templateBlocker ?? 'No verified template for this blank — mockups cannot render yet.'
    : !placement
      ? 'No placement yet — add art on the canvas first.'
      : null;

  const toggleExclude = (view: string, color: string) => {
    const key = cellKey(view, color);
    const r = mockupByCell.get(key);
    if (r && (r.status === 'queued' || r.status === 'running')) return; // already in flight
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setApproved(false);
  };

  const queueBatch = async () => {
    if (queueBlockedReason || dryRunCount === 0 || !placement) return;
    setQueueing(true);
    setQueueError(null);
    setQueueNotice(null);
    try {
      const batch = includedCells
        .filter((c) => {
          const r = mockupByCell.get(cellKey(c.view, c.color));
          return !r || r.status === 'failed' || r.status === 'stale';
        })
        .map((c) => ({
          blankId,
          view: c.view,
          color: c.color,
          kind: 'mockup' as const,
          placement,
          targetPxWidth,
        }));
      const res = await fetch('/api/v1/renders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designId, renders: batch }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        renders?: RenderStatus[];
        errors?: { index: number; code: string; message: string }[];
        error?: { message: string };
      };
      if (!res.ok) {
        throw new Error(
          json.error?.message ??
            json.errors?.[0]?.message ??
            `Queue failed (${res.status}).`,
        );
      }
      const queued = json.renders ?? [];
      setQueueNotice(
        `Queued ${queued.length} render(s)` +
          (json.errors && json.errors.length > 0
            ? `; ${json.errors.length} cell(s) could not queue: ${json.errors[0].message}`
            : '.'),
      );
      if (onQueue) onQueue(queued);
      const fresh = await listRenders(designId);
      setRenders(fresh.renders ?? []);
    } catch (e) {
      setQueueError(e instanceof Error ? e.message : 'Failed to queue renders.');
    } finally {
      setQueueing(false);
    }
  };

  const approveAll = () => {
    if (!allSucceeded) return;
    const cells: ApprovedCell[] = includedCells
      .map((c) => {
        const r = mockupByCell.get(cellKey(c.view, c.color));
        return r ? { view: c.view, color: c.color, renderId: r.id } : null;
      })
      .filter((c): c is ApprovedCell => c !== null);
    setApproved(true);
    if (onApproveAll) onApproveAll(cells);
  };

  const fmtMoney = (n: number | null | undefined) =>
    n == null ? '—' : `$${n.toFixed(2)}`;

  return (
    <div className="w-full">
      {/* Price per product — server price only, rendered, never computed. */}
      <div className="mb-4 flex flex-wrap items-center gap-4 text-[13px]">
        <span className="font-semibold">Price per product</span>
        {price ? (
          <>
            <span>
              Base cost <b className="tabular-nums">{fmtMoney(price.cost)}</b>
              {price.printer?.name ? ` · ${price.printer.name}` : ''}
            </span>
            <span>
              Suggested retail <b className="tabular-nums">{fmtMoney(price.suggestedRetailPrice)}</b>
              <span className="text-on-surface-variant"> (suggestion only — you set the price)</span>
            </span>
            <span>
              Delivery{' '}
              {price.estimatedDelivery
                ? `${price.estimatedDelivery.average} ${price.estimatedDelivery.unit}`
                : '—'}
            </span>
          </>
        ) : (
          <span className="text-on-surface-variant">
            Price not loaded — open the product page to load the server price.
          </span>
        )}
      </div>

      {/* Template blocker — never a fake mockup. */}
      {!templateVerified && (
        <div className="mb-4 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-[13px]">
          <b>Render blocked.</b>{' '}
          {templateBlocker ?? 'No verified template for this blank — mockups cannot render yet.'}{' '}
          Queue and approve are disabled until the blank is render-ready.
        </div>
      )}

      {loadError && (
        <div className="mb-4 rounded border border-red-300 bg-red-50 px-3 py-2 text-[13px]">
          Could not load renders: {loadError}
        </div>
      )}

      {views.length === 0 || colors.length === 0 ? (
        <p className="py-6 text-center text-[13px] text-on-surface-variant">
          No views or colors configured for this blank — pick a product and its
          publish colors first.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="data-table w-full text-left text-[13px]">
              <thead>
                <tr>
                  <th>View</th>
                  {colors.map((color) => (
                    <th key={color}>{color}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {views.map((view) => (
                  <tr key={view}>
                    <td className="font-semibold">{view}</td>
                    {colors.map((color) => {
                      const key = cellKey(view, color);
                      const r = mockupByCell.get(key);
                      const isExcluded = excluded.has(key);
                      const inFlight = r?.status === 'queued' || r?.status === 'running';
                      const url = publicRenderUrl(r?.storagePath ?? null);
                      return (
                        <td key={color} className={isExcluded ? 'opacity-40' : ''}>
                          <div className="flex flex-col gap-1">
                            {r?.status === 'succeeded' && url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={url}
                                alt={`${view} ${color} mockup`}
                                className="h-24 w-24 rounded border object-cover"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                                }}
                              />
                            ) : r?.status === 'succeeded' ? (
                              <span className="text-on-surface-variant">
                                Ready — {r.storagePath ?? 'stored'}
                              </span>
                            ) : (
                              <span className="text-on-surface-variant">
                                {r ? STATUS_LABEL[r.status] ?? r.status : 'Not queued'}
                              </span>
                            )}
                            {r?.status === 'failed' && (
                              <span className="text-red-600">Failed — re-queue from the batch.</span>
                            )}
                            <button
                              type="button"
                              className="self-start text-[12px] text-on-surface-variant underline hover:text-on-surface disabled:no-underline disabled:opacity-40"
                              disabled={inFlight}
                              title={
                                inFlight
                                  ? 'Already queued — cannot remove while rendering'
                                  : isExcluded
                                    ? 'Add this cell back to the batch'
                                    : 'Remove this cell from the batch'
                              }
                              onClick={() => toggleExclude(view, color)}
                            >
                              {isExcluded ? '＋ Add back' : '✕ Remove'}
                            </button>
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Batch bar: dry-run count, queue, approve-all. */}
          <div className="mt-4 flex flex-wrap items-center gap-3 text-[13px]">
            <span>
              Dry run: <b className="tabular-nums">{dryRunCount}</b> render(s) would be
              queued
              {includedCells.length > 0 &&
                ` (${includedCells.length} cell(s) in batch, ${excluded.size} removed)`}
            </span>
            <button
              type="button"
              className="rounded bg-primary px-3 py-1.5 text-white disabled:opacity-40"
              disabled={queueing || dryRunCount === 0 || queueBlockedReason !== null}
              title={queueBlockedReason ?? undefined}
              onClick={() => void queueBatch()}
            >
              {queueing ? 'Queueing…' : `Queue ${dryRunCount} render(s)`}
            </button>
            <button
              type="button"
              className="rounded border px-3 py-1.5 disabled:opacity-40"
              disabled={!allSucceeded || queueBlockedReason !== null}
              title={
                queueBlockedReason ??
                (allSucceeded ? undefined : 'Every included cell needs a ready mockup first.')
              }
              onClick={approveAll}
            >
              {approved ? '✓ Approved' : 'Approve all'}
            </button>
            {approved && (
              <span className="text-green-700">
                All {includedCells.length} cell(s) approved.
              </span>
            )}
          </div>
          {queueError && (
            <p className="mt-2 text-[13px] text-red-600">Queue failed: {queueError}</p>
          )}
          {queueNotice && <p className="mt-2 text-[13px]">{queueNotice}</p>}
          {queueBlockedReason && (
            <p className="mt-2 text-[13px] text-on-surface-variant">{queueBlockedReason}</p>
          )}
        </>
      )}

      {/* Print files (kind=print) — listed, not in the mockup matrix. */}
      {printRows.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-2 text-[14px] font-semibold">Print files</h3>
          <table className="data-table w-full text-left text-[13px]">
            <thead>
              <tr>
                <th>View</th>
                <th>Color</th>
                <th>Status</th>
                <th>File</th>
              </tr>
            </thead>
            <tbody>
              {printRows.map((r) => (
                <tr key={r.id}>
                  <td>{r.view}</td>
                  <td>{r.color}</td>
                  <td>{STATUS_LABEL[r.status] ?? r.status}</td>
                  <td className="break-all">{r.storagePath ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
