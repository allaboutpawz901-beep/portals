'use client';
/**
 * SellerFeedScreen — the Seller feed (Contacts → Seller relationships).
 *
 * REAL data from /api/sellers/feed: every seller_social_post, newest first,
 * with the seller display name joined in. Posts reference real seller_ids —
 * including sellers that only exist in enforcement data. "New post" drawer →
 * POST /api/sellers/feed → the card lands at the top of the feed.
 */
import { useMemo, useState } from 'react';
import {
  useSellerFeed,
  useSellers,
  createPost,
  sellerDisplayName,
  fmtDate,
  type SellerPost,
} from '@/hooks/useSellersApi';

interface SellerFeedScreenProps {
  onToast: (m: string) => void;
}

const NETWORKS = [
  { value: 'instagram', label: 'Instagram', icon: 'photo_camera' },
  { value: 'facebook', label: 'Facebook', icon: 'thumb_up' },
  { value: 'tiktok', label: 'TikTok', icon: 'music_note' },
  { value: 'x', label: 'X', icon: 'alternate_email' },
] as const;

type NetworkValue = (typeof NETWORKS)[number]['value'];

function networkMeta(network: string): { icon: string; chip: string; label: string } {
  const found = NETWORKS.find(n => n.value === network);
  if (found) {
    const chip =
      found.value === 'instagram' ? 'bg-rose-100 text-rose-800'
      : found.value === 'facebook' ? 'bg-amber-100 text-amber-800'
      : found.value === 'tiktok' ? 'bg-neutral-800 text-white'
      : 'bg-neutral-200 text-neutral-800';
    return { icon: found.icon, chip, label: found.label };
  }
  return { icon: 'public', chip: 'bg-surface-container-low text-on-surface-variant', label: network };
}

interface NewPostForm {
  seller_id: string;
  network: NetworkValue;
  title: string;
  note: string;
}

const EMPTY_FORM: NewPostForm = { seller_id: '', network: 'instagram', title: '', note: '' };

export default function SellerFeedScreen({ onToast }: SellerFeedScreenProps) {
  const { data: posts, loaded, refresh } = useSellerFeed();
  const { data: sellers, refresh: refreshSellers } = useSellers(); // seller picker for the new-post drawer

  /* seller_social_posts.seller_id carries an FK to the seller profile —
     only profiled sellers can publish. Offer those in the picker. */
  const publishableSellers = useMemo(() => sellers.filter(s => s.has_profile), [sellers]);

  function openNewPost() {
    setForm(EMPTY_FORM);
    setDrawerOpen(true);
    // Pull the freshest seller list so sellers created on OTHER screens
    // (e.g. just-added profiles) are immediately publishable here.
    refreshSellers();
  }

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [form, setForm] = useState<NewPostForm>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const total = posts.length;
  const byNetwork = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of posts) counts.set(p.network, (counts.get(p.network) || 0) + 1);
    return counts;
  }, [posts]);

  async function savePost() {
    if (!form.seller_id) { onToast('Select a seller'); return; }
    if (!form.title.trim()) { onToast('Title is required'); return; }
    setSaving(true);
    const res = await createPost({
      seller_id: form.seller_id,
      network: form.network,
      title: form.title.trim(),
      note: form.note.trim() || undefined,
    });
    setSaving(false);
    if (!res.ok) { onToast(`Publish failed: ${res.error}`); return; }
    onToast(`Post published to ${form.network}`);
    setDrawerOpen(false);
    setForm(EMPTY_FORM);
    refresh();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* BREADCRUMB */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Seller feed</span>
      </div>

      {/* PAGE HEADER */}
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Seller feed</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            Social posts published by sellers · {total} post{total === 1 ? '' : 's'}
          </p>
        </div>
        <button
          className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
          onClick={openNewPost}
        >
          <span className="material-symbols-outlined text-[16px]">add</span>New post
        </button>
      </div>

      {/* NETWORK CHIPS */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Networks:</span>
        {NETWORKS.map(n => (
          <span key={n.value} className="pill info">
            <span className="material-symbols-outlined text-[13px]">{n.icon}</span>
            {n.label} · {byNetwork.get(n.value) || 0}
          </span>
        ))}
      </div>

      {/* FEED */}
      {posts.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-dim py-12 px-6 text-center">
          <div className="w-14 h-14 mx-auto rounded-full bg-surface-container-low flex items-center justify-center mb-3">
            <span className="material-symbols-outlined text-[28px] text-outline">campaign</span>
          </div>
          <h3 className="text-headline-sm mb-1">{loaded ? 'No posts yet' : 'Loading feed…'}</h3>
          <p className="text-body-sm text-on-surface-variant mb-3 max-w-md mx-auto">
            {loaded
              ? 'Seller social posts appear here the moment they are published — create the first one.'
              : 'The feed paints instantly once loaded.'}
          </p>
          <button
            className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
            onClick={openNewPost}
          >
            New post
          </button>
        </div>
      ) : (
        <div className="space-y-3 max-h-[calc(100vh-260px)] overflow-y-auto pr-1">
          {posts.map(p => (
            <PostCard key={p.id} post={p} />
          ))}
        </div>
      )}

      {/* New post drawer */}
      {drawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => !saving && setDrawerOpen(false)} />
          <div className="drawer open" role="dialog" aria-label="New post">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">campaign</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">New post</div>
                  <div className="text-[11px] text-on-surface-variant">Publish a social post for a seller.</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDrawerOpen(false)} aria-label="Close"><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <section>
                <div className="section-h">Post</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label" htmlFor="np-seller">Seller *</label>
                    <select
                      id="np-seller"
                      className="field-input"
                      value={form.seller_id}
                      onChange={e => setForm(p => ({ ...p, seller_id: e.target.value }))}
                    >
                      <option value="">Select a seller…</option>
                      {publishableSellers.map(s => (
                        <option key={s.seller_id} value={s.seller_id}>
                          {sellerDisplayName(s)}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-on-surface-variant mt-1">
                      Posts reference the seller profile — sellers known only from enforcement data can&apos;t publish yet.
                    </p>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="np-network">Network *</label>
                    <select
                      id="np-network"
                      className="field-input"
                      value={form.network}
                      onChange={e => setForm(p => ({ ...p, network: e.target.value as NetworkValue }))}
                    >
                      {NETWORKS.map(n => <option key={n.value} value={n.value}>{n.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="field-label" htmlFor="np-title">Title *</label>
                    <input
                      id="np-title"
                      className="field-input"
                      placeholder="e.g. New drop — Autumn series"
                      value={form.title}
                      onChange={e => setForm(p => ({ ...p, title: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="np-note">Note</label>
                    <textarea
                      id="np-note"
                      className="field-textarea"
                      placeholder="Context for the ops team…"
                      value={form.note}
                      onChange={e => setForm(p => ({ ...p, note: e.target.value }))}
                    />
                  </div>
                </div>
              </section>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setDrawerOpen(false)} disabled={saving}>Cancel</button>
              <button
                className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50"
                onClick={savePost}
                disabled={saving}
              >
                {saving ? 'Publishing…' : 'Publish post'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

/* ─── Post card ─── */
function PostCard({ post }: { post: SellerPost }) {
  const net = networkMeta(post.network);
  const sellerName = post.seller_name || `Seller ${post.seller_id.slice(0, 8)}`;
  return (
    <article className="bg-white rounded-xl border border-surface-dim p-4 flex gap-3 hover:shadow-sm transition-shadow">
      <div className={`w-10 h-10 rounded-full grid place-items-center shrink-0 ${net.chip}`} aria-hidden="true">
        <span className="material-symbols-outlined text-[20px]">{net.icon}</span>
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium truncate">{sellerName}</span>
          <span className="pill info">{net.label}</span>
          <span className={`pill ${post.status === 'published' ? 'ok' : 'neutral'}`}>{post.status}</span>
          {post.seller_has_profile === false && (
            <span className="text-[10px] text-on-surface-variant italic">seller has no profile — from enforcement data</span>
          )}
        </div>
        <div className="font-semibold mt-1">{post.payload?.title || 'Untitled post'}</div>
        {post.payload?.note && <div className="text-body-sm text-on-surface-variant mt-0.5">{post.payload.note}</div>}
        <div className="text-[11px] text-on-surface-variant mt-1">{fmtDate(post.created_at)}</div>
      </div>
    </article>
  );
}
