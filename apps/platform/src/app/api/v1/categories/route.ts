import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import {
  apiError,
  allCatalogPairs,
  KEEPER_SUPPLIER_SLUGS,
  loadCategories,
} from '@/lib/podServer';

/** In-process cache: the catalog diff is expensive to rebuild (25 pages). */
let cached: { at: number; payload: unknown } | null = null;
const CACHE_MS = 5 * 60 * 1000;

/**
 * GET /api/v1/categories — the designer navigation, built from the live
 * catalog and diffed against ALL suppliers: every top category with its
 * subcategories, and for each, which suppliers carry products there and
 * how many. The client renders the top nav from this — the ~14 real
 * categories (Apparel, Home & Living, Drinkware, …), not a hardcoded list.
 * Drops (Gooten, Gelato, …) appear in the diff with their counts, but the
 * designer only lists keeper-supplier products (`keeperProducts`).
 */
export async function GET() {
  try {
    if (cached && Date.now() - cached.at < CACHE_MS) {
      return NextResponse.json(cached.payload);
    }
    const nodes = await loadCategories();
    const { data: suppliers, error: supErr } = await supabaseAdmin()
      .from('suppliers')
      .select('id,name,slug');
    if (supErr) throw new Error(`suppliers: ${supErr.message}`);
    const supplierById = new Map((suppliers ?? []).map((s) => [s.id as string, s]));

    // One pass over the whole catalog: (category_id, supplier_id) pairs.
    const products = await allCatalogPairs();

    // Counts per (category, supplier), rolled up to every ancestor.
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const childrenOf = new Map<string, typeof nodes>();
    for (const n of nodes) {
      if (!n.parent_id) continue;
      const list = childrenOf.get(n.parent_id) ?? [];
      list.push(n);
      childrenOf.set(n.parent_id, list);
    }
    const ancestors = (id: string): string[] => {
      const out: string[] = [];
      let cur = byId.get(id);
      let guard = 0;
      while (cur && guard < 10) {
        out.push(cur.id);
        cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
        guard++;
      }
      return out;
    };
    const counts = new Map<string, Map<string, number>>();
    const bump = (catId: string, supId: string) => {
      const m = counts.get(catId) ?? new Map<string, number>();
      m.set(supId, (m.get(supId) ?? 0) + 1);
      counts.set(catId, m);
    };
    for (const p of products ?? []) {
      const supId = p.supplier_id as string;
      for (const catId of ancestors(p.category_id as string)) bump(catId, supId);
    }

    const toNode = (n: (typeof nodes)[number]): Record<string, unknown> => {
      const m = counts.get(n.id) ?? new Map<string, number>();
      const supplierList = [...m.entries()]
        .map(([supId, productCount]) => {
          const s = supplierById.get(supId);
          return { id: supId, name: s?.name ?? 'Unknown', slug: s?.slug ?? 'unknown', productCount };
        })
        .sort((a, b) => b.productCount - a.productCount);
      const total = supplierList.reduce((s, x) => s + x.productCount, 0);
      const keeperProducts = supplierList
        .filter((s) => KEEPER_SUPPLIER_SLUGS.includes(s.slug))
        .reduce((s, x) => s + x.productCount, 0);
      return {
        id: n.id,
        name: n.name,
        slug: n.slug,
        totalProducts: total,
        keeperProducts,
        suppliers: supplierList,
        children: (childrenOf.get(n.id) ?? []).map(toNode),
      };
    };

    const top = nodes
      .filter((n) => !n.parent_id)
      .map(toNode)
      .filter((n) => (n.totalProducts as number) > 0)
      .sort((a, b) => (b.totalProducts as number) - (a.totalProducts as number));
    const payload = { categories: top };
    cached = { at: Date.now(), payload };
    return NextResponse.json(payload);
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load categories.');
  }
}
