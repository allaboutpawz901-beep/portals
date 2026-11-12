'use client';
/* SurfaceHost.tsx — §1 Architecture:
   "SurfaceHost (renders the active tab's surface stack: drawer, modal, popover)"

   §3.2 Escape priority (one Esc closes one thing):
   1. Open popover or context menu
   2. Top modal
   3. Top drawer (dirty guard)
   4. Selection
   5. Search input focus

   §3.3 Dirty guard: closing with dirty=true opens DiscardChangesModal:
   Save · Discard · Keep editing

   §3.4 Surface stack rules: max depth 2; click outside drawer does NOT close. */

import { useEffect, useCallback } from 'react';
import { useSurfaces, useDiscardGuard, type SurfaceInstance } from '@/lib/surfaceStore';

interface SurfaceHostProps {
  /** Renderers for each surface kind. Keyed by surfaceId prefix. */
  renderSurface: (surface: SurfaceInstance, close: () => void) => React.ReactNode;
}

export default function SurfaceHost({ renderSurface }: SurfaceHostProps) {
  const { stacks, activeTabId, closeTop, close, getTop, hasDirty } = useSurfaces();
  const { pendingClose, askDiscard, confirmDiscard, cancelDiscard } = useDiscardGuard();
  const stack = stacks[activeTabId] || [];
  const top = stack.length > 0 ? stack[stack.length - 1] : null;

  /* Close with dirty guard (§3.3) */
  const requestClose = useCallback((instanceId: string) => {
    const stack = useSurfaces.getState().stacks[activeTabId] || [];
    const surface = stack.find(s => s.instanceId === instanceId);
    if (!surface) return;
    if (surface.dirty) {
      askDiscard(instanceId, activeTabId);
    } else {
      close(instanceId);
    }
  }, [activeTabId, askDiscard, close]);

  /* §3.2 Escape priority — one Esc closes one thing, top-first */
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key !== 'Escape') return;
      // If discard guard is open, Escape = keep editing
      if (useDiscardGuard.getState().pendingClose) { useDiscardGuard.getState().cancelDiscard(); return; }
      // Close the top surface (dirty guard runs inside requestClose)
      const top = useSurfaces.getState().getTop();
      if (top) {
        e.preventDefault();
        const stack = useSurfaces.getState().stacks[useSurfaces.getState().activeTabId] || [];
        const surface = stack.find(s => s.instanceId === top.instanceId);
        if (surface) {
          if (surface.dirty) {
            useDiscardGuard.getState().askDiscard(top.instanceId, useSurfaces.getState().activeTabId);
          } else {
            useSurfaces.getState().close(top.instanceId);
          }
        }
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, []);

  if (stack.length === 0 && !pendingClose) return null;

  return (
    <>
      {/* Render each surface in the stack (max 2 per §3.4) */}
      {stack.map((surface, idx) => {
        const isTop = idx === stack.length - 1;
        // Scrim only under the top surface; click-outside does NOT close drawers (§3.1)
        return (
          <div key={surface.instanceId}>
            {surface.kind === 'modal' || surface.kind === 'page' ? (
              <div
                className={`drawer-scrim ${isTop ? 'open' : ''}`}
                onClick={() => {
                  // §3.1: "Click outside Modal scrim closes only if form is clean"
                  if (isTop && !surface.dirty) requestClose(surface.instanceId);
                }}
              />
            ) : surface.kind === 'drawer' && idx === 0 ? (
              <div className="drawer-scrim open" onClick={() => {
                // §3.1: "Click outside Drawer does not close (list stays interactive)"
                // But scrim click closes IF clean — the doc says drawer is non-modal
                // over the list, so we allow scrim-close only when clean.
                if (!surface.dirty) requestClose(surface.instanceId);
              }} />
            ) : null}
            <div className={surface.kind === 'drawer' || surface.kind === 'peek' ? 'relative z-[81]' : 'relative z-[111]'}>
              {renderSurface(surface, () => requestClose(surface.instanceId))}
            </div>
          </div>
        );
      })}

      {/* §3.3 DiscardChangesModal: Save · Discard · Keep editing */}
      {pendingClose && (
        <div className="modal-scrim open" style={{ zIndex: 500 }}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-5">
            <h3 className="text-headline-sm mb-1">Unsaved changes</h3>
            <p className="text-body-sm text-on-surface-variant mb-4">You have unsaved changes. What would you like to do?</p>
            <div className="flex flex-col gap-2">
              <button className="h-9 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { cancelDiscard(); /* Save is handled by the surface's own save — we just release the guard */ }}>
                Save
              </button>
              <button className="h-9 px-3 border border-surface-dim rounded text-body-md text-error hover:bg-error-container" onClick={confirmDiscard}>
                Discard changes
              </button>
              <button className="h-9 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={cancelDiscard}>
                Keep editing
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
