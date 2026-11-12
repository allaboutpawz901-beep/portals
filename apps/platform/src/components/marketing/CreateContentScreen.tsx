'use client';
/* CreateContentScreen — 1:1 port of upload/marketing_extracted/Marketing/create content html.html
   The HTML's <style> block lives in src/app/marketing.css (global classes).
   The HTML's <body> is ported to JSX below; class names are identical.
   The HTML's <script> is ported to React state + handlers below. */
import { useMemo, useState } from 'react';

interface MarketingScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

/* ─── CONFIG + API stubs (verbatim from HTML <script>) ─── */
const APP_CONFIG = {
  API_BASE: '/api',
  routes: {
    overview: '/marketing/social', calendar: '/marketing/social/calendar', create: '/marketing/social/create',
    queue: '/marketing/social/queue', library: '/marketing/social/library',
    channels: '/marketing/social/channels', performance: '/marketing/social/performance',
  },
  endpoints: {
    posts: '/publishing/posts', media: '/publishing/media', publish: '/publishing/publish',
    attachProduct: (id: string) => `/catalog/products/${id}/attach`,
    attachCollection: (id: string) => `/catalog/collections/${id}/attach`,
    designStudio: (id: string) => `/catalog/studio/${id}`,
    newsletter: '/marketing/newsletter/create',
    campaign: '/marketing/campaigns/create',
    discount: '/marketing/discounts/create',
  },
};

/* API stub — integration points log to console (kept 1:1 with the HTML's API object). */
const API = {
  async request(path: string, options: { method?: string; body?: string } = {}) {
    const url = APP_CONFIG.API_BASE + path;
    console.info('[API integration point]', options.method || 'GET', url, options.body || '');
    return { ok: true, demo: true, url };
  },
  createPost: (p: unknown) => API.request(APP_CONFIG.endpoints.posts, { method: 'POST', body: JSON.stringify(p) }),
  uploadMedia: (f: { name: string }[]) => { console.info('[MEDIA UPLOAD integration point]', f); return API.request(APP_CONFIG.endpoints.media, { method: 'POST' }); },
  publish: (p: unknown) => API.request(APP_CONFIG.endpoints.publish, { method: 'POST', body: JSON.stringify(p) }),
  attachProduct: (id: string) => API.request(APP_CONFIG.endpoints.attachProduct(id), { method: 'POST' }),
  attachCollection: (id: string) => API.request(APP_CONFIG.endpoints.attachCollection(id), { method: 'POST' }),
  openStudio: (id: string) => API.request(APP_CONFIG.endpoints.designStudio(id), { method: 'POST' }),
};

/* ─── data (verbatim from HTML <script>) ─── */
interface Channel {
  name: string;
  handle: string;
  connected: boolean;
  kind: 'ig' | 'fb' | 'li' | 'tt' | 'yt' | 'pin';
  letter: string;
}

const CHANNELS: Channel[] = [
  { name: 'Instagram', handle: '@unsaidcompany', connected: true, kind: 'ig', letter: '◎' },
  { name: 'Facebook', handle: 'Unsaid Company', connected: true, kind: 'fb', letter: 'f' },
  { name: 'LinkedIn', handle: 'Unsaid Company', connected: true, kind: 'li', letter: 'in' },
  { name: 'TikTok', handle: '@unsaidcompany', connected: true, kind: 'tt', letter: '♪' },
  { name: 'YouTube', handle: 'Unsaid Company', connected: false, kind: 'yt', letter: '▶' },
  { name: 'Pinterest', handle: 'Unsaid Company', connected: false, kind: 'pin', letter: 'p' },
];

interface AttachItem { id: string; label: string; meta: string; }
type AttachType = 'product' | 'collection' | 'design';

const ATTACH_DATA: Record<AttachType, AttachItem[]> = {
  product: [
    { id: 'TEE-001', label: 'Classic Tee', meta: 'TEE-001 · $24.00 · Printful' },
    { id: 'TOTE-014', label: 'Canvas Tote', meta: 'TOTE-014 · $18.00 · Gelato' },
    { id: 'MUG-003', label: 'Mug 11oz', meta: 'MUG-003 · $14.00 · Printify' },
  ],
  collection: [
    { id: 'COL-FALL', label: 'Fall 2026 Drop', meta: '12 products · Instagram + TikTok' },
    { id: 'COL-HOLIDAY', label: 'Holiday Capsule', meta: '8 products · multi-channel' },
    { id: 'COL-CORE', label: 'Core Essentials', meta: '22 products · evergreen' },
  ],
  design: [
    { id: 'DSG-001', label: 'Sunburst Tee design', meta: '2 variants · 1 product' },
    { id: 'DSG-002', label: 'Minimal Tote art', meta: '1 variant · 1 product' },
  ],
};

interface ComposerAttach {
  type: AttachType;
  id: string;
  label: string;
}

interface MediaFile {
  name: string;
  type: string;
  size: number;
  url?: string; // object URL for image preview
}

const ATTACH_TITLES: Record<AttachType, string> = {
  product: 'Attach to a product',
  collection: 'Attach to a collection',
  design: 'Open Design Studio',
};

const ATTACH_SUBS: Record<AttachType, string> = {
  product: 'Choose the product this content should reference. The post becomes product-level.',
  collection: 'Choose the collection this content should feature.',
  design: 'Pick an existing design to open in Design Studio, or create a new one.',
};

const ATTACH_ICON: Record<AttachType, string> = {
  product: 'checkroom',
  collection: 'collections_bookmark',
  design: 'palette',
};

export default function CreateContentScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's composer state vars) ─── */
  const [step, setStep] = useState(1);
  const [publishMode, setPublishMode] = useState<'schedule' | 'now'>('schedule');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['Instagram']);
  const [mediaFiles, setMediaFiles] = useState<MediaFile[]>([]);
  const [composerAttach, setComposerAttach] = useState<ComposerAttach | null>(null);
  const [dirty, setDirty] = useState(false);
  const [pendingNav, setPendingNav] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  // composer form state (HTML reads these via document.getElementById)
  const [postTitle, setPostTitle] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [postLink, setPostLink] = useState('');
  const [postTags, setPostTags] = useState('');
  const [scheduleDate, setScheduleDate] = useState('');
  const [scheduleTime, setScheduleTime] = useState('10:00');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [approval, setApproval] = useState<'none' | 'approval'>('none');
  // channel-specific caption overrides (HTML uses dynamic override-<name> textareas)
  const [channelOverrides, setChannelOverrides] = useState<Record<string, string>>({});

  // UI open/close state
  const [continueMenuOpen, setContinueMenuOpen] = useState(false);
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [attachType, setAttachType] = useState<AttachType>('product');
  const [attachSearch, setAttachSearch] = useState('');
  const [attachPickId, setAttachPickId] = useState<string | null>(null);
  const [otherCreateOpen, setOtherCreateOpen] = useState(false);
  const [otherCreateLabel, setOtherCreateLabel] = useState('Newsletter');
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [designDrawerOpen, setDesignDrawerOpen] = useState(false);

  /* ─── derived (mirrors HTML's render / update functions) ─── */
  const previewCaption = postCaption.trim() || 'Your post caption will appear here as you write.';
  const previewPlatform = selectedChannels[0] || 'Social channel preview';
  const previewAccount = CHANNELS.find(c => c.name === selectedChannels[0])?.handle || 'Your brand';
  const charCount = postCaption.length;

  const attachList = useMemo(() => ATTACH_DATA[attachType] || [], [attachType]);
  const filteredAttachList = useMemo(() => {
    const q = attachSearch.trim().toLowerCase();
    if (!q) return attachList;
    return attachList.filter(it => (it.label + ' ' + it.meta).toLowerCase().includes(q));
  }, [attachList, attachSearch]);

  const contLabel = step === 4 ? (publishMode === 'now' ? 'Publish now' : 'Schedule post') : 'Continue';
  const contIcon = step === 4 ? 'send' : 'arrow_forward';

  /* ─── handlers (1:1 with HTML <script>) ─── */
  function markDirty() { setDirty(true); }

  function resetComposer() {
    setStep(1);
    setMediaFiles([]);
    setSelectedChannels(['Instagram']);
    setComposerAttach(null);
    setPostTitle('');
    setPostCaption('');
    setPostLink('');
    setPostTags('');
    setScheduleDate('');
    setScheduleTime('10:00');
    setApproval('none');
    setChannelOverrides({});
    setPublishMode('schedule');
    setSubmitted(false);
    setDirty(false);
  }

  function navigate(page: string) {
    if (page !== 'create' && dirty) {
      setPendingNav(page);
      setLeaveModalOpen(true);
      return;
    }
    if (page === 'create') resetComposer();
    onToast('Navigate → ' + page);
  }

  function validateStep(): boolean {
    if (step === 1 && !postCaption.trim()) { onToast('Add a caption before continuing'); return false; }
    if (step === 2 && selectedChannels.length === 0) { onToast('Select at least one connected channel'); return false; }
    if (step === 3 && publishMode === 'schedule' && !scheduleDate) { onToast('Choose a publishing date'); return false; }
    return true;
  }

  function nextStep() {
    if (!validateStep()) return;
    if (step < 4) { setStep(step + 1); markDirty(); }
    else void submitPost();
  }
  function prevStep() { if (step > 1) setStep(step - 1); }

  function collectPayload() {
    return {
      title: postTitle || 'Untitled post',
      caption: postCaption,
      link: postLink,
      hashtags: postTags,
      channels: selectedChannels,
      channelOverrides,
      media: mediaFiles.map(f => ({ name: f.name, type: f.type, size: f.size })),
      attach: composerAttach,
      publishMode,
      date: publishMode === 'schedule' ? scheduleDate : null,
      time: publishMode === 'schedule' ? scheduleTime : null,
      timezone,
      approval,
    };
  }

  async function submitPost() {
    const payload = collectPayload();
    await API.createPost(payload);
    await API.publish(payload);
    onToast(payload.publishMode === 'now' ? 'Publish request prepared' : 'Schedule request prepared');
    setDirty(false);
    setSubmitted(true);
  }

  function doSaveDraft() {
    const p = collectPayload();
    void API.createPost({ ...p, status: 'draft' });
    onToast('Draft saved');
    setDirty(false);
  }

  function handleSaveMenu(v: string) {
    if (v === 'Save and close') { doSaveDraft(); onToast('Saved and closed'); }
    else if (v === 'Save and new') { doSaveDraft(); resetComposer(); onToast('Saved. New composer ready.'); }
    else if (v === 'Schedule and close') {
      if (step < 3) { setStep(3); onToast('Jumped to schedule step'); }
      else void submitPost();
    }
  }

  function cancelComposer() {
    if (dirty) { setLeaveModalOpen(true); setPendingNav('overview'); }
    else navigate('overview');
  }

  function leaveStay() { setLeaveModalOpen(false); setPendingNav(null); }
  function leaveDiscard() {
    setLeaveModalOpen(false);
    resetComposer();
    if (pendingNav) { const p = pendingNav; setPendingNav(null); navigate(p); }
  }
  function leaveSave() {
    setLeaveModalOpen(false);
    doSaveDraft();
    if (pendingNav) { const p = pendingNav; setPendingNav(null); navigate(p); }
  }

  function continueTo(target: 'channels' | 'schedule' | 'review') {
    setContinueMenuOpen(false);
    if (target === 'channels') setStep(2);
    else if (target === 'schedule') setStep(3);
    else if (target === 'review') setStep(4);
  }

  function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const added: MediaFile[] = Array.from(files).map(f => ({
      name: f.name,
      type: f.type,
      size: f.size,
      url: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }));
    setMediaFiles(prev => [...prev, ...added]);
    void API.uploadMedia(added);
    markDirty();
  }
  function removeMedia(i: number) {
    setMediaFiles(prev => {
      const m = prev[i];
      if (m?.url) URL.revokeObjectURL(m.url);
      return prev.filter((_, j) => j !== i);
    });
    markDirty();
  }

  function toggleChannel(name: string) {
    setSelectedChannels(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
    markDirty();
  }

  function openAttach(type: AttachType) {
    setAttachType(type);
    setAttachSearch('');
    setAttachPickId(null);
    setAttachModalOpen(true);
  }

  function confirmAttach() {
    if (!attachPickId) return;
    const item = attachList.find(it => it.id === attachPickId);
    if (!item) return;
    const target: ComposerAttach = { type: attachType, id: item.id, label: item.label };
    if (attachType === 'design') {
      setComposerAttach(target);
      setDesignDrawerOpen(true);
      void API.openStudio(target.id);
      setAttachModalOpen(false);
      markDirty();
      return;
    }
    if (attachType === 'product') void API.attachProduct(target.id);
    else void API.attachCollection(target.id);
    setComposerAttach(target);
    setAttachModalOpen(false);
    markDirty();
    onToast(attachType === 'product' ? 'Product attached' : 'Collection attached');
  }

  function removeAttach() {
    setComposerAttach(null);
    markDirty();
  }

  function closeDesignDrawer() { setDesignDrawerOpen(false); }

  function openOtherCreate(label: string) {
    setOtherCreateLabel(label);
    setOtherCreateOpen(true);
  }

  function confirmOtherCreate() {
    const url = otherCreateLabel === 'Newsletter' ? APP_CONFIG.endpoints.newsletter
      : otherCreateLabel === 'Campaign' ? APP_CONFIG.endpoints.campaign
      : APP_CONFIG.endpoints.discount;
    void API.request(url, { method: 'POST' });
    onToast('Opened ' + otherCreateLabel + ' create surface');
    setOtherCreateOpen(false);
  }

  const firstMediaIsImage = mediaFiles[0]?.type.startsWith('image/') && !!mediaFiles[0]?.url;

  /* review summary block */
  const reviewSummary = submitted ? (
    <>
      <strong className="text-secondary">Request prepared</strong>
      <div className="text-[11px] text-on-surface-variant mt-1">
        This prototype prepared a {publishMode === 'now' ? 'publish' : 'schedule'} request for
        {' '}{selectedChannels.length} channel(s). Connect your backend publishing workers to deliver it.
      </div>
    </>
  ) : (
    <>
      <strong>{postTitle || 'Untitled post'}</strong>
      <br /><span className="text-on-surface-variant">Destinations:</span> {selectedChannels.join(', ')}
      <br /><span className="text-on-surface-variant">Publishing:</span> {publishMode === 'now' ? 'Immediately' : `${scheduleDate} at ${scheduleTime} (${timezone})`}
      <br /><span className="text-on-surface-variant">Media:</span> {mediaFiles.length} attachment(s)
      {composerAttach && (
        <><br /><span className="text-on-surface-variant">Attached to:</span> {composerAttach.label} <span className="text-on-surface-variant">({composerAttach.type} · {composerAttach.id})</span></>
      )}
      <br /><span className="text-on-surface-variant">Approval:</span> {approval === 'approval' ? 'Required' : 'Not required'}
      <hr className="my-2 border-surface-dim" />
      <div className="whitespace-pre-wrap">{postCaption}</div>
    </>
  );

  /* attached list (right column) */
  const attachedList = composerAttach ? (
    <div className="flex items-center gap-2 px-3 py-2 rounded border border-outline-variant bg-surface-container-low text-[11px]">
      <span className="material-symbols-outlined text-[16px] text-primary">{ATTACH_ICON[composerAttach.type]}</span>
      <div><strong>{composerAttach.label}</strong><div className="text-on-surface-variant">{composerAttach.type} · {composerAttach.id}</div></div>
      <span className="product-pill ml-auto"><span className="material-symbols-outlined">extension</span>Product-level</span>
    </div>
  ) : (
    <span className="text-body-sm text-on-surface-variant">No products or designs attached yet.</span>
  );

  /* inline attached result (below attach-card on step 1) */
  const composerAttachResult = composerAttach ? (
    <div className="flex items-center gap-2 px-3 py-2 rounded border border-outline-variant bg-surface-container-low text-[11px]">
      <span className="material-symbols-outlined text-[16px] text-primary">{ATTACH_ICON[composerAttach.type]}</span>
      <div><strong>Attached:</strong> {composerAttach.label} <span className="text-on-surface-variant">({composerAttach.type} · {composerAttach.id})</span></div>
      <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low ml-auto" onClick={removeAttach}>Remove</button>
    </div>
  ) : null;

  return (
    <main className="px-6 pb-12">

      {/* ─── DOMAIN TABSTRIP ─── */}
      <div className="flex items-center gap-1 mt-4 mb-1 border-b border-surface-dim overflow-x-auto">
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => navigate('overview')}>Publishing Overview</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => navigate('calendar')}>Calendar</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => navigate('queue')}>Queue</button>
        <button className="h-9 px-3 text-label-md tab-underline active" onClick={() => navigate('create')}>Create Content</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => navigate('library')}>Content Library</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => navigate('channels')}>Connected Channels</button>
        <button className="h-9 px-3 text-label-md tab-underline text-on-surface-variant" onClick={() => navigate('performance')}>Performance</button>
      </div>

      {/* ─── HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4">
        <div>
          <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
            <span>Marketing</span><span className="text-outline">/</span><span>Social publishing</span><span className="text-outline">/</span><span>Create</span>
          </div>
          <h1 className="text-headline-lg">Create content</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Build one post, tailor it to each channel, and choose when it goes live.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={doSaveDraft}>
            <span className="material-symbols-outlined text-[16px]">save</span>Save draft
          </button>
          <div className="flex">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container split-btn-main flex items-center gap-1" onClick={nextStep}>
              {contLabel}<span className="material-symbols-outlined text-[16px]">{contIcon}</span>
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow relative" onClick={e => { e.stopPropagation(); setContinueMenuOpen(v => !v); }}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* ─── STEPPER ─── */}
      <div className="stepper">
        <div className={`step ${step === 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}><span className="step-num">1</span>Content</div>
        <div className="step-line"></div>
        <div className={`step ${step === 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}><span className="step-num">2</span>Channels</div>
        <div className="step-line"></div>
        <div className={`step ${step === 3 ? 'active' : ''} ${step > 3 ? 'done' : ''}`}><span className="step-num">3</span>Schedule</div>
        <div className="step-line"></div>
        <div className={`step ${step === 4 ? 'active' : ''} ${step > 4 ? 'done' : ''}`}><span className="step-num">4</span>Review</div>
      </div>

      {/* ─── COMPOSER ─── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">

        {/* LEFT: active step */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">

          {/* Step 1: Content */}
          {step === 1 && (
            <div id="composerStep1">
              <h2 className="text-headline-sm mb-1">Build your post</h2>
              <div className="text-[11px] text-on-surface-variant mb-4">Start with a message and add the media you want to share.</div>

              <div className="space-y-3">
                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Internal post name</label>
                  <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="e.g. October product spotlight" value={postTitle} onChange={e => { setPostTitle(e.target.value); markDirty(); }} />
                </div>

                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Caption / post copy</label>
                  <textarea className="w-full min-h-[120px] p-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary resize-y" placeholder="What would you like to share? Write your caption here..." value={postCaption} onChange={e => { setPostCaption(e.target.value); markDirty(); }} />
                  <div className="flex items-center justify-between text-[10px] text-on-surface-variant mt-1">
                    <span><span>{charCount}</span> characters · Platform limits may vary</span>
                    <span className="hidden-imp text-error"></span>
                  </div>
                </div>

                <div>
                  <label className="block text-label-sm text-on-surface-variant mb-1">Media attachments</label>
                  <label className="upload-zone" htmlFor="mediaInput">
                    <span className="material-symbols-outlined">cloud_upload</span>
                    <strong>Drop files here or browse</strong>
                    <small>Images and video · Multiple files supported</small>
                  </label>
                  <input type="file" id="mediaInput" accept="image/*,video/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
                  {mediaFiles.length > 0 && (
                    <div className="media-list">
                      {mediaFiles.map((f, i) => (
                        <span key={i} className="media-chip">
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>{f.type.startsWith('video') ? 'movie' : 'image'}</span>
                          {f.name}
                          <button type="button" style={{ border: 0, background: 'none', color: 'inherit', padding: 0, cursor: 'pointer' }} onClick={() => removeMedia(i)}>×</button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Destination link (optional)</label>
                    <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="https://example.com" value={postLink} onChange={e => { setPostLink(e.target.value); markDirty(); }} />
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Hashtags</label>
                    <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="#brand #updates" value={postTags} onChange={e => { setPostTags(e.target.value); markDirty(); }} />
                  </div>
                </div>

                {/* Product-level attach */}
                <div className="attach-card">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <strong className="text-[12px]">Attach to product / design</strong>
                      <div className="text-[11px] text-on-surface-variant">Pick a product or open Design Studio to create one.</div>
                    </div>
                    <span className="product-pill"><span className="material-symbols-outlined">extension</span>Product-level</span>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <button type="button" className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openAttach('product')}><span className="material-symbols-outlined text-[14px]">checkroom</span>Product</button>
                    <button type="button" className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openAttach('collection')}><span className="material-symbols-outlined text-[14px]">collections_bookmark</span>Collection</button>
                    <button type="button" className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openAttach('design')}><span className="material-symbols-outlined text-[14px]">palette</span>Design Studio</button>
                  </div>
                  {composerAttachResult && <div className="mt-2">{composerAttachResult}</div>}
                </div>

                {/* Advanced: links to other creation doors */}
                <div className="pt-3 border-t border-surface-dim">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-label-sm text-on-surface-variant uppercase tracking-wider font-bold mr-1">Create actions:</span>
                    <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openOtherCreate('Newsletter')}><span className="material-symbols-outlined text-[14px]">mail</span>Newsletter</button>
                    <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openOtherCreate('Campaign')}><span className="material-symbols-rounded text-[14px]">campaign</span>Campaign</button>
                    <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1" onClick={() => openOtherCreate('Discount code')}><span className="material-symbols-outlined text-[14px]">sell</span>Discount code</button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Channels */}
          {step === 2 && (
            <div id="composerStep2">
              <h2 className="text-headline-sm mb-1">Choose your channels</h2>
              <div className="text-[11px] text-on-surface-variant mb-4">Select the connected accounts where this post should publish.</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {CHANNELS.map(c => {
                  const sel = selectedChannels.includes(c.name);
                  return (
                    <label key={c.name} className={`channel ${sel ? 'selected' : ''}`} style={c.connected ? undefined : { opacity: .5 }}>
                      <input type="checkbox" checked={sel} disabled={!c.connected} onChange={() => toggleChannel(c.name)} />
                      <span className={`channel-logo ${c.kind}`}>{c.letter}</span>
                      <span><strong>{c.name}</strong><small>{c.connected ? c.handle : 'Not connected'}</small></span>
                    </label>
                  );
                })}
              </div>
              <div className="mt-3 p-3 bg-surface-container-low rounded-lg text-[10px] text-on-surface-variant">
                <span className="material-symbols-outlined text-[14px] align-middle text-primary">info</span>
                Each selected channel becomes its own publish job. You can tailor the content for each provider before publishing.
              </div>
              {selectedChannels.length > 0 && (
                <div className="mt-4">
                  <div className="text-[12px] font-semibold mb-2">Channel-specific caption overrides</div>
                  {selectedChannels.map(n => (
                    <div key={n} className="mb-3">
                      <label className="block text-label-sm text-on-surface-variant mb-1">{n} caption (optional override)</label>
                      <textarea rows={2} className="w-full min-h-[65px] p-2 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary resize-y" placeholder="Leave blank to use the main caption" value={channelOverrides[n] || ''} onChange={e => { setChannelOverrides(prev => ({ ...prev, [n]: e.target.value })); markDirty(); }} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Step 3: Schedule */}
          {step === 3 && (
            <div id="composerStep3">
              <h2 className="text-headline-sm mb-1">Choose when to publish</h2>
              <div className="text-[11px] text-on-surface-variant mb-4">Publish now or set a date and time for each selected channel.</div>

              <div className="mb-3">
                <label className="block text-label-sm text-on-surface-variant mb-1">Publishing method</label>
                <div className="view-toggle">
                  <button className={publishMode === 'schedule' ? 'active' : ''} onClick={() => { setPublishMode('schedule'); markDirty(); }}>Schedule</button>
                  <button className={publishMode === 'now' ? 'active' : ''} onClick={() => { setPublishMode('now'); markDirty(); }}>Publish now</button>
                </div>
              </div>

              {publishMode === 'schedule' && (
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Date</label>
                    <input type="date" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={scheduleDate} onChange={e => { setScheduleDate(e.target.value); markDirty(); }} />
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Time</label>
                    <input type="time" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={scheduleTime} onChange={e => { setScheduleTime(e.target.value); markDirty(); }} />
                  </div>
                </div>
              )}

              <div className="mb-3">
                <label className="block text-label-sm text-on-surface-variant mb-1">Time zone</label>
                <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={timezone} onChange={e => { setTimezone(e.target.value); markDirty(); }}>
                  <option value="America/Chicago">Central Time (US &amp; Canada)</option>
                  <option value="America/New_York">Eastern Time</option>
                  <option value="America/Denver">Mountain Time</option>
                  <option value="America/Los_Angeles">Pacific Time</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>

              <div>
                <label className="block text-label-sm text-on-surface-variant mb-1">Approval workflow</label>
                <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={approval} onChange={e => { setApproval(e.target.value as 'none' | 'approval'); markDirty(); }}>
                  <option value="none">No approval required</option>
                  <option value="approval">Submit for approval before publishing</option>
                </select>
              </div>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div id="composerStep4">
              <h2 className="text-headline-sm mb-1">Review and confirm</h2>
              <div className="text-[11px] text-on-surface-variant mb-4">Check your content, destinations, and publishing details.</div>
              <div className="bg-surface-container-low border border-surface-dim rounded-lg p-4 text-body-sm leading-relaxed">{reviewSummary}</div>
              <div className="mt-3 p-3 border border-outline-variant bg-surface-container-low rounded text-[10px] text-on-surface-variant">
                This prototype prepares the publishing request. Actual delivery requires connected provider credentials and your backend publishing workers.
              </div>
            </div>
          )}

          {/* Universal footer */}
          <div className="flex items-center justify-between border-t border-surface-dim pt-4 mt-4">
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={prevStep} disabled={step === 1}>
              <span className="material-symbols-outlined text-[16px]">arrow_back</span>Back
            </button>
            <span className="text-[11px] text-on-surface-variant">Step {step} of 4</span>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={cancelComposer}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={nextStep}>
                {contLabel}<span className="material-symbols-outlined text-[16px]">{contIcon}</span>
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT: live preview + attach + save grammar */}
        <div className="flex flex-col gap-3">

          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div>
                <h2 className="text-headline-sm">Live preview</h2>
                <div className="text-[11px] text-on-surface-variant">A preview of your post content</div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-label-sm bg-surface-container text-on-surface-variant">Preview</span>
            </div>
            <div className="p-4">
              <div className="preview-shell">
                <div className="preview-card">
                  <div className="preview-head">
                    <div className="preview-avatar">U</div>
                    <div><strong>{previewAccount}</strong><small>{previewPlatform}</small></div>
                  </div>
                  <div className="preview-media">
                    {firstMediaIsImage && mediaFiles[0]?.url
                      ? <img src={mediaFiles[0].url} alt="" style={{ width: '100%', height: 200, objectFit: 'cover' }} />
                      : mediaFiles[0] && mediaFiles[0].type.startsWith('video')
                        ? <span className="material-symbols-outlined">movie</span>
                        : <span className="material-symbols-outlined">image</span>}
                  </div>
                  <div className="preview-caption">{previewCaption}</div>
                  <div className="preview-actions"><span>♡ Like</span><span>◯ Comment</span><span>↗ Share</span></div>
                </div>
              </div>
              <div className="text-[11px] text-on-surface-variant mt-3 text-center">Provider previews may vary from the final published post.</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="px-5 py-3 border-b border-surface-dim">
              <h2 className="text-headline-sm">Attached products / designs</h2>
              <div className="text-[11px] text-on-surface-variant">Content is created against these commerce objects.</div>
            </div>
            <div className="p-4">
              <div>{attachedList}</div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-dim">
            <div className="px-5 py-3 border-b border-surface-dim">
              <h2 className="text-headline-sm">Save grammar</h2>
              <div className="text-[11px] text-on-surface-variant">Primary save menu options.</div>
            </div>
            <div className="p-4 flex flex-col gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-between" onClick={() => handleSaveMenu('Save and close')}><span>Save and close</span><span className="text-[11px] text-on-surface-variant">⌘↵</span></button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-between" onClick={() => handleSaveMenu('Save and new')}><span>Save and new</span><span className="text-[11px] text-on-surface-variant">⇧↵</span></button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center justify-between" onClick={() => handleSaveMenu('Schedule and close')}><span>Schedule and close</span><span className="text-[11px] text-on-surface-variant">S</span></button>
            </div>
          </div>

        </div>
      </div>

      {/* Continue split menu */}
      {continueMenuOpen && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 119 }} onClick={() => setContinueMenuOpen(false)} />
          <div className="popover" style={{ position: 'fixed', minWidth: 260, top: 'auto', bottom: 'auto', right: 24, zIndex: 120 }} onClick={e => e.stopPropagation()}>
            <div className="px-3 py-1 text-[10px] text-outline uppercase tracking-wider font-bold">Continue to</div>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => continueTo('channels')}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">hub</span>Channels</button>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => continueTo('schedule')}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">schedule</span>Schedule</button>
            <button className="w-full text-left px-3 py-1.5 text-body-sm hover:bg-surface-container-low flex items-center gap-2" onClick={() => continueTo('review')}><span className="material-symbols-outlined text-[16px] text-on-surface-variant">fact_check</span>Review</button>
          </div>
        </>
      )}

      {/* Attach modal */}
      {attachModalOpen && (
        <div className="modal-scrim open" onClick={() => setAttachModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">{ATTACH_TITLES[attachType]}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">{ATTACH_SUBS[attachType]}</p>
            <div className="mb-2">
              <label className="block text-label-sm text-on-surface-variant mb-1">Search {attachType}s</label>
              <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="Search…" value={attachSearch} onChange={e => setAttachSearch(e.target.value)} />
            </div>
            <div className="max-h-[240px] overflow-y-auto border border-surface-dim rounded">
              {filteredAttachList.map(it => (
                <label key={it.id} className={`flex items-center gap-3 px-3 py-2 border-b border-surface-dim last:border-b-0 cursor-pointer hover:bg-surface-container-low ${attachPickId === it.id ? 'bg-surface-container-low' : ''}`}>
                  <input type="radio" name="attachpick" value={it.id} checked={attachPickId === it.id} style={{ accentColor: '#0a6400' }} onChange={() => setAttachPickId(it.id)} />
                  <div className="min-w-0 flex-1"><div className="text-body-sm font-medium">{it.label}</div><div className="text-[11px] text-on-surface-variant">{it.meta}</div></div>
                  <span className="product-pill"><span className="material-symbols-outlined">{ATTACH_ICON[attachType]}</span>{attachType}</span>
                </label>
              ))}
              {filteredAttachList.length === 0 && (
                <div className="px-3 py-4 text-center text-[11px] text-on-surface-variant">No matches.</div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setAttachModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50" disabled={!attachPickId} onClick={confirmAttach}>Attach</button>
            </div>
          </div>
        </div>
      )}

      {/* Other create modal */}
      {otherCreateOpen && (
        <div className="modal-scrim open" onClick={() => setOtherCreateOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Create {otherCreateLabel.toLowerCase()}</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">This opens the {otherCreateLabel} create surface. It&apos;s here so nobody assumes what happens when you press a create action.</p>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setOtherCreateOpen(false)}>Close</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmOtherCreate}>Open create</button>
            </div>
          </div>
        </div>
      )}

      {/* Leave guard modal */}
      {leaveModalOpen && (
        <div className="modal-scrim open">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
            <h3 className="text-headline-sm mb-1">Leave without saving?</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">You have unsaved changes. Leaving will discard this draft.</p>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={leaveStay}>Keep editing</button>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md text-error hover:bg-error-container/40" onClick={leaveDiscard}>Discard</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={leaveSave}>Save draft</button>
            </div>
          </div>
        </div>
      )}

      {/* Scrim + Design Studio drawer */}
      {designDrawerOpen && (
        <>
          <div className="scrim open" onClick={closeDesignDrawer} />
          <div className="drawer drawer-narrow open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">palette</span>
                <div>
                  <div className="text-headline-sm">Design Studio</div>
                  <div className="text-[11px] text-on-surface-variant">Design from product</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={closeDesignDrawer}><span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg border border-outline-variant bg-surface-container-low">
                <div>
                  <strong className="text-[12px]">Attached design</strong>
                  <div className="text-[11px] text-on-surface-variant">{composerAttach ? `${composerAttach.label} · ${composerAttach.id}` : 'None yet'}</div>
                </div>
                <span className="product-pill"><span className="material-symbols-outlined">palette</span>Design</span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <button className="h-20 border border-surface-dim rounded-lg flex flex-col items-center justify-center text-[11px] hover:bg-surface-container-low" onClick={() => onToast('Design Studio — upload')}><span className="material-symbols-outlined text-[20px] text-primary">add_photo_alternate</span>Upload</button>
                <button className="h-20 border border-surface-dim rounded-lg flex flex-col items-center justify-center text-[11px] hover:bg-surface-container-low" onClick={() => onToast('Design Studio — text tool')}><span className="material-symbols-outlined text-[20px] text-primary">text_fields</span>Text</button>
                <button className="h-20 border border-surface-dim rounded-lg flex flex-col items-center justify-center text-[11px] hover:bg-surface-container-low" onClick={() => onToast('Design Studio — shapes')}><span className="material-symbols-outlined text-[20px] text-primary">category</span>Shapes</button>
              </div>
              <div className="border border-surface-dim rounded-lg p-4 text-center text-[11px] text-on-surface-variant">
                Canvas preview area — drawing surface, print guides, and DPI checks live here.
              </div>
              <div className="flex items-center justify-between border-t border-surface-dim pt-3">
                <div className="text-[11px] text-on-surface-variant">Preflight: <strong className="text-primary">OK</strong></div>
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => { onToast('Design saved to product — publish request will include design metadata'); closeDesignDrawer(); }}>Save design to product</button>
              </div>
            </div>
          </div>
        </>
      )}

    </main>
  );
}
