'use client';
/**
 * useStoredPref — hydration-safe localStorage-backed prefs.
 *
 * WHY: reading localStorage in a useState initializer makes the server HTML
 * and the first client render diverge (React hydration mismatch), while
 * adopting stored values in a mount effect trips react-hooks/set-state-in-effect.
 * `useSyncExternalStore` is the React-sanctioned primitive for exactly this:
 *   - getServerSnapshot (the default) is used for SSR AND for the hydration
 *     render, so there is never a mismatch;
 *   - after hydration React calls getSnapshot (the stored value) and re-renders.
 *
 * Snapshot stability: getSnapshot MUST return the same reference while the
 * store is unchanged, so parsed JSON values are memoized by (key, raw string).
 */

import { useCallback, useSyncExternalStore } from 'react';

type Listener = () => void;
const listeners = new Set<Listener>();

function subscribe(cb: Listener): () => void {
  listeners.add(cb);
  window.addEventListener('storage', cb);
  return () => {
    listeners.delete(cb);
    window.removeEventListener('storage', cb);
  };
}

/** Notify every mounted consumer that a stored pref changed. */
export function emitStoredPrefChange(): void {
  for (const l of listeners) l();
}

/* ── snapshot cache: (key, raw) → parsed value (stable identity) ── */
const snapshotCache = new Map<string, { raw: string | null; value: unknown }>();

function readRawKey(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function cached<T>(key: string, raw: string | null, compute: () => T): T {
  const hit = snapshotCache.get(key);
  if (hit && hit.raw === raw) return hit.value as T;
  const value = compute();
  snapshotCache.set(key, { raw, value });
  return value;
}

/** Stable fallback per key (fallbacks are often constructed per render). */
const fallbackCache = new Map<string, unknown>();
function stableFallback<T>(key: string, fallback: T): T {
  if (!fallbackCache.has(key)) fallbackCache.set(key, fallback);
  return fallbackCache.get(key) as T;
}

/**
 * Raw-string pref (stored unquoted, e.g. 'bookmarks' | 'favorites').
 * `write` persists and notifies every consumer (including other hooks).
 */
export function useStoredString<T extends string>(
  key: string,
  fallback: T,
  isValid?: (v: string) => boolean,
): [T, (next: T) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => cached<T>(key, readRawKey(key), () => {
      const raw = readRawKey(key);
      if (raw != null && (!isValid || isValid(raw))) return raw as T;
      return stableFallback(key, fallback);
    }),
    () => stableFallback(key, fallback),
  );
  const write = useCallback(
    (next: T) => {
      try {
        localStorage.setItem(key, next);
      } catch {
        // ignore quota / privacy-mode errors
      }
      snapshotCache.delete(key);
      emitStoredPrefChange();
    },
    [key],
  );
  return [value, write];
}

/**
 * JSON pref with an optional updater form. `isValid` guards against corrupt
 * payloads; `transform` normalizes the parsed value before it is cached
 * (e.g. merging required defaults).
 */
export function useStoredJson<T>(
  key: string,
  fallback: T,
  isValid?: (v: unknown) => boolean,
  transform?: (v: T) => T,
): [T, (next: T | ((prev: T) => T)) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => cached<T>(key, readRawKey(key), () => {
      const raw = readRawKey(key);
      if (raw != null) {
        try {
          const parsed = JSON.parse(raw);
          if (isValid ? isValid(parsed) : parsed != null) {
            const finalValue = transform ? transform(parsed as T) : (parsed as T);
            return finalValue;
          }
        } catch {
          // corrupt payload → fall through to default
        }
      }
      return stableFallback(key, fallback);
    }),
    () => stableFallback(key, fallback),
  );

  const write = useCallback(
    (next: T | ((prev: T) => T)) => {
      const prev = cached<T>(key, readRawKey(key), () => stableFallback(key, fallback));
      const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
      try {
        localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        // ignore quota / privacy-mode errors
      }
      snapshotCache.delete(key);
      emitStoredPrefChange();
    },
    [key, fallback, isValid, transform],
  );
  return [value, write];
}
