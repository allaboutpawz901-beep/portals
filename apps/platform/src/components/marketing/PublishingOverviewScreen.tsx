'use client';
/* PublishingOverviewScreen — 1:1 port of upload/marketing_extracted/Marketing/publishing overview.html
   The HTML's <style> block lives in src/app/marketing.css (global classes).
   The HTML's <body> is ported to JSX below; class names are identical.
   The HTML's <script> is ported to React state + handlers below. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { exportToCsv } from '@/lib/csvExport';

interface MarketingScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

/* ─── data (verbatim from HTML <script>) ─── */
interface Channel { name: string; handle: string; connected: boolean; kind: string; letter: string; }
interface Post { id: number; title: string; caption: string; channels: string[]; date: string; status: string; }
interface AttachItem { id: string; label: string; meta: string; }
interface AttachTarget { type: AttachType; id: string; label: string; }
type AttachType = 'product' | 'collection' | 'design';
type PageId = 'overview' | 'create' | 'calendar' | 'queue' | 'library' | 'channels' | 'performance';

const ATTACH_DATA: Record<AttachType, AttachItem[]> = {
  product: [
    { id: 'TEE-001', label: 'Classic Tee', meta: 'TEE-001 · $24.00' },
    { id: 'TOTE-014', label: 'Canvas Tote', meta: 'TOTE-014 · $18.00' },
    { id: 'MUG-003', label: 'Mug 11oz', meta: 'MUG-003 · $14.00' },
  ],
  collection: [
    { id: 'COL-FALL', label: 'Fall 2026 Drop', meta: '12 products' },
    { id: 'COL-HOLIDAY', label: 'Holiday Capsule', meta: '8 products' },
    { id: 'COL-CORE', label: 'Core Essentials', meta: '22 products' },
  ],
  design: [
    { id: 'DSG-001', label: 'Sunburst Tee design', meta: '2 variants · 1 product' },
    { id: 'DSG-002', label: 'Minimal Tote art', meta: '1 variant · 1 product' },
  ],
};

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

const POSTS_INIT: Post[] = [
  { id: 1, title: 'October product spotlight', caption: "A closer look at what's new this month.", channels: ['Instagram'], date: '2026-10-31T15:30', status: 'scheduled' },
  { id: 2, title: 'Behind the scenes', caption: 'A little look behind the scenes.', channels: ['TikTok'], date: '2026-11-01T10:00', status: 'scheduled' },
  { id: 3, title: 'Weekly company update', caption: "This week's updates from our team.", channels: ['LinkedIn'], date: '2026-11-03T09:00', status: 'scheduled' },
];

const CHANNELS_INIT: Channel[] = [
  { name: 'Instagram', handle: '@unsaidcompany', connected: true, kind: 'ig', letter: '◎' },
  { name: 'Facebook', handle: 'Unsaid Company', connected: true, kind: 'fb', letter: 'f' },
  { name: 'LinkedIn', handle: 'Unsaid Company', connected: true, kind: 'li', letter: 'in' },
  { name: 'TikTok', handle: '@unsaidcompany', connected: true, kind: 'tt', letter: '♪' },
  { name: 'YouTube', handle: 'Unsaid Company', connected: false, kind: 'yt', letter: '▶' },
  { name: 'Pinterest', handle: 'Unsaid Company', connected: false, kind: 'pin', letter: 'p' },
];

const PERF_DATA: [string, number][] = [['Instagram', 82], ['Facebook', 64], ['LinkedIn', 71], ['TikTok', 91]];

const PAGE_TABS: { id: PageId; label: string }[] = [
  { id: 'overview', label: 'Publishing Overview' },
  { id: 'calendar', label: 'Calendar' },
  { id: 'queue', label: 'Queue' },
  { id: 'create', label: 'Create Content' },
  { id: 'library', label: 'Content Library' },
  { id: 'channels', label: 'Connected Channels' },
  { id: 'performance', label: 'Performance' },
];

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;
const QUEUE_TABS: { id: 'all' | 'scheduled' | 'published' | 'draft' | 'failed'; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  { id: 'failed', label: 'Failed' },
];
const CAL_VIEWS: { id: 'month' | 'week' | 'list'; label: string }[] = [
  { id: 'month', label: 'Month' },
  { id: 'week', label: 'Week' },
  { id: 'list', label: 'List' },
];

/* ─── helpers (from HTML <script>) ─── */
function statusPillClasses(s: string): string {
  const map: Record<string, string> = {
    scheduled: 'bg-tertiary/15 text-tertiary',
    published: 'bg-secondary-container text-on-secondary-container',
    draft: 'bg-surface-container text-on-surface-variant',
    failed: 'bg-error-container text-on-error-container',
  };
  return map[s] || 'bg-surface-container text-on-surface-variant';
}
function statusLabel(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
function attachIcon(type: AttachType): string {
  return type === 'product' ? 'checkroom' : type === 'collection' ? 'collections_bookmark' : 'palette';
}
function renderStatusPill(status: string) {
  return <span className={`px-2 py-0.5 rounded-full text-label-sm ${statusPillClasses(status)}`}>{statusLabel(status)}</span>;
}

export default function PublishingOverviewScreen({ onToast }: MarketingScreenProps) {
  /* ─── state (mirrors HTML's `step`, `publishMode`, `selectedChannels`, etc.) ─── */
  const [activePage, setActivePage] = useState<PageId>('overview');
  const [posts, setPosts] = useState<Post[]>(POSTS_INIT);
  const [channels, setChannels] = useState<Channel[]>(CHANNELS_INIT);

  // composer state
  const [step, setStep] = useState(1);
  const [publishMode, setPublishMode] = useState<'schedule' | 'now'>('schedule');
  const [selectedChannels, setSelectedChannels] = useState<string[]>(['Instagram']);
  const [mediaFiles, setMediaFiles] = useState<File[]>([]);
  const [composerAttach, setComposerAttach] = useState<AttachTarget | null>(null);
  const [channelOverrides, setChannelOverrides] = useState<Record<string, string>>({});

  // composer form fields
  const [postTitle, setPostTitle] = useState('');
  const [postCaption, setPostCaption] = useState('');
  const [postLink, setPostLink] = useState('');
  const [postTags, setPostTags] = useState('');
  const [scheduleDate, setScheduleDate] = useState(new Date().toISOString().slice(0, 10));
  const [scheduleTime, setScheduleTime] = useState('10:00');
  const [timezone, setTimezone] = useState('America/Chicago');
  const [approval, setApproval] = useState<'none' | 'approval'>('none');

  // queue
  const [queueFilter, setQueueFilter] = useState<'all' | 'scheduled' | 'published' | 'draft' | 'failed'>('all');

  // calendar
  const [calendarDate, setCalendarDate] = useState<Date>(new Date(2026, 9, 1));
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'list'>('month');
  const [calChannelFilter, setCalChannelFilter] = useState('All');

  // library
  const [libraryFiles, setLibraryFiles] = useState<File[]>([]);
  const [librarySearch, setLibrarySearch] = useState('');
  const [libraryType, setLibraryType] = useState<'All types' | 'Images' | 'Videos'>('All types');

  // performance
  const [perfRange, setPerfRange] = useState('Last 30 days');

  // attach modal
  const [attachModalOpen, setAttachModalOpen] = useState(false);
  const [attachType, setAttachType] = useState<AttachType>('product');
  const [attachSearch, setAttachSearch] = useState('');
  const [attachPick, setAttachPick] = useState<AttachItem | null>(null);
  const [attachResult, setAttachResult] = useState<AttachTarget | null>(null);

  // connect modal
  const [connectModalOpen, setConnectModalOpen] = useState(false);
  const [connectProvider, setConnectProvider] = useState('Instagram');
  const [connectAccount, setConnectAccount] = useState('');

  const libraryInputRef = useRef<HTMLInputElement>(null);

  /* ─── derived (mirrors HTML render functions) ─── */
  const upcomingPosts = useMemo(() => posts.filter(p => p.status === 'scheduled').slice(0, 3), [posts]);
  const queueRows = useMemo(() => posts.filter(p => queueFilter === 'all' || p.status === queueFilter), [posts, queueFilter]);

  const statScheduled = posts.filter(p => p.status === 'scheduled').length + 9;
  const statDrafts = posts.filter(p => p.status === 'draft').length + 5;
  const connectedCount = channels.filter(c => c.connected).length;

  const calendarData = useMemo(() => {
    const y = calendarDate.getFullYear();
    const m = calendarDate.getMonth();
    const first = new Date(y, m, 1);
    const start = first.getDay();
    const days = new Date(y, m + 1, 0).getDate();
    const filtered = posts.filter(p => calChannelFilter === 'All' || p.channels.includes(calChannelFilter));
    const today = new Date();
    const cells: { day: number; events: Post[]; isToday: boolean }[] = [];
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const events = filtered.filter(p => (p.date || '').startsWith(iso));
      cells.push({ day: d, events, isToday: d === today.getDate() && m === today.getMonth() });
    }
    const label = calendarDate.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    return { start, cells, label };
  }, [calendarDate, posts, calChannelFilter]);

  const libraryFiltered = useMemo(() => {
    const q = librarySearch.toLowerCase();
    let files = libraryFiles.filter(f => f.name.toLowerCase().includes(q));
    if (libraryType === 'Images') files = files.filter(f => f.type.startsWith('image'));
    if (libraryType === 'Videos') files = files.filter(f => f.type.startsWith('video'));
    return files;
  }, [libraryFiles, librarySearch, libraryType]);

  const attachFiltered = useMemo(() => {
    const q = attachSearch.toLowerCase();
    return (ATTACH_DATA[attachType] || []).filter(it =>
      it.label.toLowerCase().includes(q) || it.meta.toLowerCase().includes(q)
    );
  }, [attachType, attachSearch]);

  const previewCaption = postCaption.trim() || 'Your post caption will appear here as you write.';
  const previewPlatform = selectedChannels[0] || 'Social channel preview';
  const previewAccount = channels.find(c => c.name === selectedChannels[0])?.handle || 'Your brand';

  const previewMediaUrl = useMemo(() => {
    if (mediaFiles[0] && mediaFiles[0].type.startsWith('image')) {
      return URL.createObjectURL(mediaFiles[0]);
    }
    return null;
  }, [mediaFiles]);

  useEffect(() => {
    if (!previewMediaUrl) return;
    return () => URL.revokeObjectURL(previewMediaUrl);
  }, [previewMediaUrl]);

  const nextLabel = step === 4 ? (publishMode === 'now' ? 'Publish now' : 'Schedule post') : 'Continue';
  const nextIcon = step === 4 ? 'send' : 'arrow_forward';

  /* ─── handlers (from HTML <script>) ─── */
  function navigate(page: PageId) {
    setActivePage(page);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function startComposer() {
    resetComposer();
    navigate('create');
  }

  function resetComposer() {
    setStep(1);
    setMediaFiles([]);
    setSelectedChannels(['Instagram']);
    setComposerAttach(null);
    setChannelOverrides({});
    setPostTitle('');
    setPostCaption('');
    setPostLink('');
    setPostTags('');
    setScheduleDate(new Date().toISOString().slice(0, 10));
    setScheduleTime('10:00');
    setApproval('none');
    setPublishMode('schedule');
  }

  function validateStep(): boolean {
    if (step === 1 && !postCaption.trim()) { onToast('Add a caption before continuing'); return false; }
    if (step === 2 && !selectedChannels.length) { onToast('Select at least one connected channel'); return false; }
    if (step === 3 && publishMode === 'schedule' && !scheduleDate) { onToast('Choose a publishing date'); return false; }
    return true;
  }

  function nextStep() {
    if (!validateStep()) return;
    if (step < 4) setStep(s => s + 1);
    else submitPost();
  }
  function prevStep() {
    if (step > 1) setStep(s => s - 1);
  }

  function toggleChannel(name: string) {
    setSelectedChannels(prev => prev.includes(name) ? prev.filter(x => x !== name) : [...prev, name]);
  }
  function setOverride(name: string, value: string) {
    setChannelOverrides(prev => ({ ...prev, [name]: value }));
  }

  function onMediaInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setMediaFiles(prev => [...prev, ...files]);
    e.target.value = '';
  }
  function removeMedia(idx: number) {
    setMediaFiles(prev => prev.filter((_, i) => i !== idx));
  }

  function onLibraryInput(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    setLibraryFiles(prev => [...prev, ...files]);
    e.target.value = '';
  }

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

  function submitPost() {
    const payload = collectPayload();
    if (payload.approval === 'approval') {
      setPosts(prev => [{
        id: Date.now(),
        title: payload.title,
        caption: payload.caption,
        channels: payload.channels,
        date: 'Pending approval',
        status: 'draft',
      }, ...prev]);
      onToast('Saved for approval in this prototype');
    } else {
      setPosts(prev => [{
        id: Date.now(),
        title: payload.title,
        caption: payload.caption,
        channels: payload.channels,
        date: payload.date ? payload.date + 'T' + payload.time : 'Publishing now',
        status: publishMode === 'now' ? 'published' : 'scheduled',
      }, ...prev]);
      onToast('Post request prepared — connect backend to deliver it');
    }
    navigate('queue');
  }

  function saveDraft() {
    const p = collectPayload();
    setPosts(prev => [{
      id: Date.now(),
      title: p.title,
      caption: p.caption,
      channels: p.channels,
      date: '—',
      status: 'draft',
    }, ...prev]);
    onToast('Draft saved in this prototype');
    navigate('queue');
  }

  function postAction(id: number) {
    const p = posts.find(x => x.id === id);
    if (!p) return;
    if (p.status === 'draft') {
      if (confirm('Delete this draft?')) {
        setPosts(prev => prev.filter(x => x.id !== id));
        onToast('Draft deleted');
      }
    } else {
      onToast('Post details and retry actions connect to the publishing API');
    }
  }

  function toggleProvider(name: string) {
    const c = channels.find(x => x.name === name);
    if (!c) return;
    if (c.connected) {
      if (confirm(`Disconnect ${name}?`)) {
        setChannels(prev => prev.map(x => x.name === name ? { ...x, connected: false } : x));
        onToast(name + ' disconnected in local demo state');
      }
    } else {
      setConnectProvider(name);
      setConnectModalOpen(true);
    }
  }

  function confirmConnect() {
    onToast('OAuth start endpoint ready for ' + connectProvider + ' — wire backend redirect');
    setConnectModalOpen(false);
    setConnectAccount('');
  }

  function openAttach(type: AttachType) {
    setAttachType(type);
    setAttachSearch('');
    setAttachPick(null);
    setAttachModalOpen(true);
  }

  function confirmAttach() {
    if (!attachPick) return;
    const target: AttachTarget = { type: attachType, id: attachPick.id, label: attachPick.label };
    if (activePage === 'create') {
      setComposerAttach(target);
    } else {
      setAttachResult(target);
    }
    if (target.type === 'design') onToast('Design Studio route ready: ' + target.id);
    else if (target.type === 'product') onToast('Attached product: ' + target.label);
    else onToast('Attached collection: ' + target.label);
    setAttachModalOpen(false);
  }

  function handleExport() {
    exportToCsv(queueRows.map(p => ({
      title: p.title, caption: p.caption,
      channels: p.channels.join(', '),
      date: p.date, status: p.status,
    })), [
      { key: 'title', label: 'Title' },
      { key: 'caption', label: 'Caption' },
      { key: 'channels', label: 'Channels' },
      { key: 'date', label: 'Publish date' },
      { key: 'status', label: 'Status' },
    ], 'publishing-queue');
    onToast(`Exported ${queueRows.length} posts`);
  }

  /* ─── render ─── */
  return (
    <main className="px-6 pb-12">

      {/* ─── DOMAIN TABSTRIP (Marketing group) ─── */}
      <div className="flex items-center gap-1 mt-4 mb-1 border-b border-surface-dim overflow-x-auto">
        {PAGE_TABS.map(t => (
          <button
            key={t.id}
            className={`h-9 px-3 text-label-md tab-underline ${activePage === t.id ? 'active' : 'text-on-surface-variant'}`}
            onClick={() => navigate(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════
           OVERVIEW
           ═══════════════════════════════════════════════════════════ */}
      {activePage === 'overview' && (
        <section>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
                <span>Marketing</span><span className="text-outline">/</span><span>Social publishing</span>
              </div>
              <h1 className="text-headline-lg">Publishing Overview</h1>
              <p className="text-body-sm text-on-surface-variant mt-0.5">Plan, publish, and manage your brand&apos;s social content from one place.</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={() => navigate('calendar')}>
                <span className="material-symbols-outlined text-[16px]">calendar_month</span>View calendar
              </button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={startComposer}>
                <span className="material-symbols-outlined text-[16px]">add</span>Create post
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Scheduled posts</span>
              <div className="text-headline-lg mt-1">{statScheduled}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Across all connected channels</div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Published this month</span>
              <div className="text-headline-lg mt-1">48</div>
              <div className="text-[11px] text-secondary mt-1">+12% from last month</div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Drafts</span>
              <div className="text-headline-lg mt-1">{statDrafts}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Ready for review or editing</div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Connected channels</span>
              <div className="text-headline-lg mt-1">{connectedCount}</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Across 4 social platforms</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
            <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim">
              <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
                <div>
                  <h2 className="text-headline-sm">Quick actions</h2>
                  <div className="text-[11px] text-on-surface-variant">Pick up where you left off</div>
                </div>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-3">
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={startComposer}>
                  <span className="material-symbols-outlined text-[20px] text-primary">edit_square</span>
                  <div className="text-body-sm font-semibold mt-2">Create a post</div>
                  <div className="text-[11px] text-on-surface-variant">Start with text and media</div>
                </button>
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={() => navigate('calendar')}>
                  <span className="material-symbols-outlined text-[20px] text-primary">calendar_month</span>
                  <div className="text-body-sm font-semibold mt-2">Schedule content</div>
                  <div className="text-[11px] text-on-surface-variant">Plan your publishing calendar</div>
                </button>
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={() => navigate('library')}>
                  <span className="material-symbols-outlined text-[20px] text-primary">perm_media</span>
                  <div className="text-body-sm font-semibold mt-2">Upload media</div>
                  <div className="text-[11px] text-on-surface-variant">Organize images and video</div>
                </button>
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={() => navigate('channels')}>
                  <span className="material-symbols-outlined text-[20px] text-primary">add_link</span>
                  <div className="text-body-sm font-semibold mt-2">Connect a channel</div>
                  <div className="text-[11px] text-on-surface-variant">Manage provider accounts</div>
                </button>
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={() => navigate('queue')}>
                  <span className="material-symbols-outlined text-[20px] text-primary">outbox</span>
                  <div className="text-body-sm font-semibold mt-2">Review queue</div>
                  <div className="text-[11px] text-on-surface-variant">Check upcoming posts</div>
                </button>
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={() => navigate('performance')}>
                  <span className="material-symbols-outlined text-[20px] text-primary">insights</span>
                  <div className="text-body-sm font-semibold mt-2">View performance</div>
                  <div className="text-[11px] text-on-surface-variant">See content results</div>
                </button>
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim">
              <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
                <div>
                  <h2 className="text-headline-sm">Next to publish</h2>
                  <div className="text-[11px] text-on-surface-variant">Your upcoming content</div>
                </div>
                <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => navigate('queue')}>View queue</button>
              </div>
              <div className="p-5">
                {upcomingPosts.length ? upcomingPosts.map(p => (
                  <div key={p.id} className="flex items-center gap-3 py-2 border-b border-surface-dim last:border-b-0">
                    <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">image</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-body-sm font-medium truncate">{p.title}</div>
                      <div className="text-[11px] text-on-surface-variant">{p.date.replace('T', ' · ')} · {p.channels[0] || ''}</div>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-label-sm bg-tertiary/15 text-tertiary">Scheduled</span>
                  </div>
                )) : (
                  <div className="py-6 text-center text-body-sm text-on-surface-variant">Nothing scheduled.</div>
                )}
              </div>
            </div>
          </div>

          {/* Integrated product-level attach */}
          <div className="bg-white rounded-xl border border-surface-dim mt-3">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div>
                <h2 className="text-headline-sm">Attach to commerce &amp; design</h2>
                <div className="text-[11px] text-on-surface-variant">This social post can be created from or attached to a product, collection, or design.</div>
              </div>
              <span className="attach-badge"><span className="material-symbols-outlined">extension</span>Integrated product</span>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={() => openAttach('product')}>
                  <span className="material-symbols-outlined text-[20px] text-primary">checkroom</span>
                  <div className="text-body-sm font-semibold mt-2">Attach a product</div>
                  <div className="text-[11px] text-on-surface-variant">Link a SKU to this content</div>
                </button>
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={() => openAttach('collection')}>
                  <span className="material-symbols-outlined text-[20px] text-primary">collections_bookmark</span>
                  <div className="text-body-sm font-semibold mt-2">Attach a collection</div>
                  <div className="text-[11px] text-on-surface-variant">Feature a collection</div>
                </button>
                <button className="quick border border-surface-dim rounded-xl p-4 text-left hover:bg-surface-container-low" onClick={() => openAttach('design')}>
                  <span className="material-symbols-outlined text-[20px] text-primary">palette</span>
                  <div className="text-body-sm font-semibold mt-2">Open Design Studio</div>
                  <div className="text-[11px] text-on-surface-variant">Create a design from a product</div>
                </button>
              </div>
              {attachResult && (
                <div className="mt-3 flex items-center gap-2 px-3 py-2 rounded border border-outline-variant bg-surface-container-low text-[11px]">
                  <span className="material-symbols-outlined text-[16px] text-primary">{attachIcon(attachResult.type)}</span>
                  <div><strong>Attached:</strong> {attachResult.label} <span className="text-on-surface-variant">({attachResult.type} · {attachResult.id})</span></div>
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low ml-auto" onClick={() => setAttachResult(null)}>Remove</button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
           CREATE CONTENT (composer, 4 steps)
           ═══════════════════════════════════════════════════════════ */}
      {activePage === 'create' && (
        <section>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
                <span>Marketing</span><span className="text-outline">/</span><span>Social publishing</span><span className="text-outline">/</span><span>Create</span>
              </div>
              <h1 className="text-headline-lg">Create content</h1>
              <p className="text-body-sm text-on-surface-variant mt-0.5">Build one post, tailor it to each channel, and choose when it goes live.</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={saveDraft}>Save draft</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={nextStep}>
                {nextLabel}<span className="material-symbols-outlined text-[16px]">{nextIcon}</span>
              </button>
            </div>
          </div>

          <div className="stepper">
            <div className={`step ${step === 1 ? 'active' : ''} ${step > 1 ? 'done' : ''}`}><span className="step-num">1</span> Content</div>
            <div className="step-line"></div>
            <div className={`step ${step === 2 ? 'active' : ''} ${step > 2 ? 'done' : ''}`}><span className="step-num">2</span> Channels</div>
            <div className="step-line"></div>
            <div className={`step ${step === 3 ? 'active' : ''} ${step > 3 ? 'done' : ''}`}><span className="step-num">3</span> Schedule</div>
            <div className="step-line"></div>
            <div className={`step ${step === 4 ? 'active' : ''}`}><span className="step-num">4</span> Review</div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-start">
            <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
              {step === 1 && (
                <div>
                  <h2 className="text-headline-sm mb-1">Build your post</h2>
                  <div className="text-[11px] text-on-surface-variant mb-4">Start with a message and add the media you want to share.</div>
                  <div className="space-y-3">
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Internal post name</label>
                      <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="e.g. October product spotlight" value={postTitle} onChange={e => setPostTitle(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Caption / post copy</label>
                      <textarea className="w-full min-h-[120px] p-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary resize-y" placeholder="What would you like to share? Write your caption here..." value={postCaption} onChange={e => setPostCaption(e.target.value)} />
                      <div className="text-[10px] text-on-surface-variant mt-1"><span>{postCaption.length}</span> characters · Platform limits may vary</div>
                    </div>
                    <div>
                      <label className="block text-label-sm text-on-surface-variant mb-1">Media attachments</label>
                      <label className="upload-zone block" htmlFor="mediaInput">
                        <span className="material-symbols-outlined">cloud_upload</span>
                        <strong>Drop files here or browse</strong>
                        <small>Images and video · Multiple files supported</small>
                      </label>
                      <input type="file" id="mediaInput" accept="image/*,video/*" multiple hidden onChange={onMediaInput} />
                      <div className="media-list">
                        {mediaFiles.map((f, i) => (
                          <span key={i} className="media-chip">
                            <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{f.type.startsWith('video') ? 'movie' : 'image'}</span>
                            {f.name}
                            <button style={{ border: 0, background: 'none', color: 'inherit', padding: 0 }} onClick={() => removeMedia(i)}>×</button>
                          </span>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">Destination link (optional)</label>
                        <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="https://example.com" value={postLink} onChange={e => setPostLink(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">Hashtags</label>
                        <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="#brand #updates" value={postTags} onChange={e => setPostTags(e.target.value)} />
                      </div>
                    </div>
                    <div className="border border-surface-dim rounded-lg p-3 bg-surface-container-low">
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
                      {composerAttach && (
                        <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded border border-outline-variant bg-surface-container-low text-[11px]">
                          <span className="material-symbols-outlined text-[16px] text-primary">{attachIcon(composerAttach.type)}</span>
                          <div><strong>Attached:</strong> {composerAttach.label} <span className="text-on-surface-variant">({composerAttach.type} · {composerAttach.id})</span></div>
                          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low ml-auto" onClick={() => setComposerAttach(null)}>Remove</button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div>
                  <h2 className="text-headline-sm mb-1">Choose your channels</h2>
                  <div className="text-[11px] text-on-surface-variant mb-4">Select the connected accounts where this post should publish.</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {channels.map(c => (
                      <label key={c.name} className={`channel ${selectedChannels.includes(c.name) ? 'selected' : ''}`} style={c.connected ? undefined : { opacity: 0.5 }}>
                        <input
                          type="checkbox"
                          checked={selectedChannels.includes(c.name)}
                          disabled={!c.connected}
                          onChange={() => toggleChannel(c.name)}
                        />
                        <span className={`channel-logo ${c.kind}`}>{c.letter}</span>
                        <span><strong>{c.name}</strong><small>{c.connected ? c.handle : 'Not connected'}</small></span>
                      </label>
                    ))}
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
                          <textarea
                            rows={2}
                            className="w-full min-h-[65px] p-2 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                            placeholder="Leave blank to use the main caption"
                            value={channelOverrides[n] || ''}
                            onChange={e => setOverride(n, e.target.value)}
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {step === 3 && (
                <div>
                  <h2 className="text-headline-sm mb-1">Choose when to publish</h2>
                  <div className="text-[11px] text-on-surface-variant mb-4">Publish now or set a date and time for each selected channel.</div>
                  <div className="mb-3">
                    <label className="block text-label-sm text-on-surface-variant mb-1">Publishing method</label>
                    <div className="view-toggle">
                      <button className={publishMode === 'schedule' ? 'active' : ''} onClick={() => setPublishMode('schedule')}>Schedule</button>
                      <button className={publishMode === 'now' ? 'active' : ''} onClick={() => setPublishMode('now')}>Publish now</button>
                    </div>
                  </div>
                  {publishMode === 'schedule' && (
                    <div className="grid grid-cols-2 gap-3 mb-3">
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">Date</label>
                        <input type="date" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={scheduleDate} onChange={e => setScheduleDate(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-label-sm text-on-surface-variant mb-1">Time</label>
                        <input type="time" className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={scheduleTime} onChange={e => setScheduleTime(e.target.value)} />
                      </div>
                    </div>
                  )}
                  <div className="mb-3">
                    <label className="block text-label-sm text-on-surface-variant mb-1">Time zone</label>
                    <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={timezone} onChange={e => setTimezone(e.target.value)}>
                      <option value="America/Chicago">Central Time (US &amp; Canada)</option>
                      <option value="America/New_York">Eastern Time</option>
                      <option value="America/Denver">Mountain Time</option>
                      <option value="America/Los_Angeles">Pacific Time</option>
                      <option value="UTC">UTC</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-label-sm text-on-surface-variant mb-1">Approval workflow</label>
                    <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={approval} onChange={e => setApproval(e.target.value as 'none' | 'approval')}>
                      <option value="none">No approval required</option>
                      <option value="approval">Submit for approval before publishing</option>
                    </select>
                  </div>
                </div>
              )}

              {step === 4 && (
                <div>
                  <h2 className="text-headline-sm mb-1">Review and confirm</h2>
                  <div className="text-[11px] text-on-surface-variant mb-4">Check your content, destinations, and publishing details.</div>
                  <div className="bg-surface-container-low border border-surface-dim rounded-lg p-4 text-body-sm leading-relaxed">
                    <strong>{postTitle || 'Untitled post'}</strong>
                    <br />
                    <span className="text-on-surface-variant">Destinations:</span> {selectedChannels.join(', ')}
                    <br />
                    <span className="text-on-surface-variant">Publishing:</span> {publishMode === 'now' ? 'Immediately' : `${scheduleDate} at ${scheduleTime} (${timezone})`}
                    <br />
                    <span className="text-on-surface-variant">Media:</span> {mediaFiles.length} attachment(s)
                    {composerAttach && (
                      <>
                        <br />
                        <span className="text-on-surface-variant">Attached to:</span> {composerAttach.label}
                      </>
                    )}
                    <br />
                    <span className="text-on-surface-variant">Approval:</span> {approval === 'approval' ? 'Required' : 'Not required'}
                    <hr className="my-2 border-surface-dim" />
                    <div style={{ whiteSpace: 'pre-wrap' }}>{postCaption}</div>
                  </div>
                  <div className="mt-3 p-3 border border-outline-variant bg-surface-container-low rounded text-[10px] text-on-surface-variant">
                    This prototype prepares the publishing request. Actual delivery requires connected provider credentials and your backend publishing workers.
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-surface-dim pt-4 mt-4">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={prevStep} disabled={step === 1}>
                  <span className="material-symbols-outlined text-[16px]">arrow_back</span>Back
                </button>
                <span className="text-[11px] text-on-surface-variant">Step {step} of 4</span>
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={nextStep}>
                  {nextLabel}<span className="material-symbols-outlined text-[16px]">{nextIcon}</span>
                </button>
              </div>
            </div>

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
                      {previewMediaUrl ? (
                        <img src={previewMediaUrl} alt="" style={{ width: '100%', height: '180px', objectFit: 'cover' }} />
                      ) : mediaFiles[0] ? (
                        <span className="material-symbols-outlined">movie</span>
                      ) : (
                        <span className="material-symbols-outlined">image</span>
                      )}
                    </div>
                    <div className="preview-caption">{previewCaption}</div>
                    <div className="preview-actions"><span>♡ Like</span><span>◯ Comment</span><span>↗ Share</span></div>
                  </div>
                </div>
                <div className="text-[11px] text-on-surface-variant mt-3 text-center">Provider previews may vary from the final published post.</div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
           CALENDAR
           ═══════════════════════════════════════════════════════════ */}
      {activePage === 'calendar' && (
        <section>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
                <span>Marketing</span><span className="text-outline">/</span><span>Social publishing</span>
              </div>
              <h1 className="text-headline-lg">Calendar</h1>
              <p className="text-body-sm text-on-surface-variant mt-0.5">See what&apos;s planned across all your connected channels.</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setCalendarDate(d => { const n = new Date(d); n.setMonth(n.getMonth() - 1); return n; })}>
                <span className="material-symbols-outlined text-[16px]">chevron_left</span>
              </button>
              <strong className="text-body-md min-w-[110px] text-center">{calendarData.label}</strong>
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setCalendarDate(d => { const n = new Date(d); n.setMonth(n.getMonth() + 1); return n; })}>
                <span className="material-symbols-outlined text-[16px]">chevron_right</span>
              </button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={startComposer}>
                <span className="material-symbols-outlined text-[16px]">add</span>Create post
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-4 h-11 border-b border-surface-dim">
              <div className="flex items-center gap-1">
                {CAL_VIEWS.map(v => (
                  <button
                    key={v.id}
                    className={`h-full px-3 text-label-md tab-underline ${calendarView === v.id ? 'active' : 'text-on-surface-variant'}`}
                    onClick={() => setCalendarView(v.id)}
                  >
                    {v.label}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-on-surface-variant">Channel</span>
                <select className="h-7 px-2 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" value={calChannelFilter} onChange={e => setCalChannelFilter(e.target.value)}>
                  <option value="All">All channels</option>
                  <option value="Instagram">Instagram</option>
                  <option value="Facebook">Facebook</option>
                  <option value="LinkedIn">LinkedIn</option>
                  <option value="TikTok">TikTok</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto p-4">
              <div className="calendar">
                {calendarView !== 'month' && (
                  <div style={{ gridColumn: '1 / -1', padding: '22px', textAlign: 'center', color: '#5a6355' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: '28px', color: '#9aabae' }}>calendar_view_week</span>
                    <div style={{ marginTop: '6px' }}>{calendarView === 'week' ? 'Week' : 'List'} view is ready to be wired. The Month grid is fully interactive.</div>
                  </div>
                )}
                {WEEKDAYS.map(d => (
                  <div key={d} className="day" style={{ minHeight: '34px', background: '#fafbfb' }}>
                    <div className="day-head">{d}</div>
                  </div>
                ))}
                {Array.from({ length: calendarData.start }, (_, i) => (
                  <div key={`e${i}`} className="day" style={{ background: '#fafbfb' }} />
                ))}
                {calendarData.cells.map(cell => (
                  <div key={cell.day} className="day">
                    <div className="day-head">
                      <span className="day-num">{cell.day}</span>
                      {cell.isToday ? 'Today' : ''}
                    </div>
                    {cell.events.map((e, i) => (
                      <div
                        key={i}
                        className={`event ${i % 2 === 1 ? 'purple' : ''}`}
                        onClick={() => onToast(e.title + ' · ' + e.status)}
                      >
                        {e.title}<br />
                        <span style={{ opacity: 0.75 }}>{e.channels[0] || ''}</span>
                      </div>
                    ))}
                    <button className="text-[16px] text-outline mt-1" onClick={startComposer}>+</button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
           QUEUE
           ═══════════════════════════════════════════════════════════ */}
      {activePage === 'queue' && (
        <section>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
                <span>Marketing</span><span className="text-outline">/</span><span>Social publishing</span>
              </div>
              <h1 className="text-headline-lg">Publishing queue</h1>
              <p className="text-body-sm text-on-surface-variant mt-0.5">Track scheduled posts, drafts, and publishing outcomes.</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={handleExport}>
                <span className="material-symbols-outlined text-[16px]">download</span>Export
              </button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={startComposer}>
                <span className="material-symbols-outlined text-[16px]">add</span>Create post
              </button>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-4 h-11 border-b border-surface-dim">
              <div className="flex items-center gap-1">
                {QUEUE_TABS.map(t => (
                  <button
                    key={t.id}
                    className={`h-full px-3 text-label-md tab-underline ${queueFilter === t.id ? 'active' : 'text-on-surface-variant'}`}
                    onClick={() => setQueueFilter(t.id)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <span className="text-[11px] text-on-surface-variant">{queueRows.length} items</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-body-sm">
                <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                  <tr>
                    <th className="px-3 py-2">Content</th>
                    <th className="px-3 py-2">Channel</th>
                    <th className="px-3 py-2">Publish date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-dim">
                  {queueRows.length ? queueRows.map(p => (
                    <tr key={p.id} className="hover:bg-surface-container-low">
                      <td className="px-3 py-2">
                        <div className="text-body-sm font-medium">{p.title}</div>
                        <div className="text-[11px] text-on-surface-variant">{(p.caption || '').slice(0, 65)}</div>
                      </td>
                      <td className="px-3 py-2">{p.channels.join(', ')}</td>
                      <td className="px-3 py-2">{p.date || '—'}</td>
                      <td className="px-3 py-2">{renderStatusPill(p.status)}</td>
                      <td className="px-2 py-2 text-right relative">
                        <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => postAction(p.id)}>
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={5}>
                        <div className="py-10 text-center text-body-sm text-on-surface-variant">No posts in this view.</div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
           LIBRARY
           ═══════════════════════════════════════════════════════════ */}
      {activePage === 'library' && (
        <section>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
                <span>Marketing</span><span className="text-outline">/</span><span>Social publishing</span>
              </div>
              <h1 className="text-headline-lg">Content library</h1>
              <p className="text-body-sm text-on-surface-variant mt-0.5">Keep your approved images, videos, and reusable content organized.</p>
            </div>
            <div className="flex items-center gap-2">
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => libraryInputRef.current?.click()}>
                <span className="material-symbols-outlined text-[16px]">upload</span>Upload media
              </button>
              <input ref={libraryInputRef} type="file" accept="image/*,video/*" multiple hidden onChange={onLibraryInput} />
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-4 h-11 border-b border-surface-dim">
              <div>
                <h2 className="text-headline-sm">All assets</h2>
                <div className="text-[11px] text-on-surface-variant">Files uploaded in this browser prototype</div>
              </div>
              <div className="flex items-center gap-2">
                <input className="h-7 px-2 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search assets..." value={librarySearch} onChange={e => setLibrarySearch(e.target.value)} />
                <select className="h-7 px-2 border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" value={libraryType} onChange={e => setLibraryType(e.target.value as 'All types' | 'Images' | 'Videos')}>
                  <option>All types</option>
                  <option>Images</option>
                  <option>Videos</option>
                </select>
              </div>
            </div>
            <div className="p-5 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
              {libraryFiles.length === 0 ? (
                <div className="col-span-full py-10 text-center text-body-sm text-on-surface-variant">No uploaded assets yet. Add images or videos to start your library.</div>
              ) : libraryFiltered.length === 0 ? (
                <div className="col-span-full py-10 text-center text-body-sm text-on-surface-variant">No matching assets. Upload media to build your library.</div>
              ) : (
                libraryFiltered.map((f, i) => (
                  <div key={i} className="border border-surface-dim rounded-lg p-3">
                    <div className="w-full h-[105px] rounded-md bg-surface-container flex items-center justify-center">
                      <span className="material-symbols-outlined text-[28px] text-on-surface-variant">{f.type.startsWith('video') ? 'movie' : 'image'}</span>
                    </div>
                    <strong className="block text-[11px] mt-2 break-words">{f.name}</strong>
                    <span className="text-[10px] text-on-surface-variant">{(f.size / 1024 / 1024).toFixed(2)} MB</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
           CHANNELS
           ═══════════════════════════════════════════════════════════ */}
      {activePage === 'channels' && (
        <section>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
                <span>Marketing</span><span className="text-outline">/</span><span>Social publishing</span>
              </div>
              <h1 className="text-headline-lg">Connected channels</h1>
              <p className="text-body-sm text-on-surface-variant mt-0.5">Connect and manage the social accounts used by your publishing workspace.</p>
            </div>
            <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => setConnectModalOpen(true)}>
              <span className="material-symbols-outlined text-[16px]">add_link</span>Connect channel
            </button>
          </div>

          <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3 border-b border-surface-dim">
              <div>
                <h2 className="text-headline-sm">Your social accounts</h2>
                <div className="text-[11px] text-on-surface-variant">Connection state shown here is local demo data until OAuth is wired up.</div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-label-sm bg-secondary-container text-on-secondary-container">{connectedCount} connected</span>
            </div>
            <div>
              {channels.map((c, i) => (
                <div key={c.name} className={`flex items-center gap-3 px-5 py-3 border-b border-surface-dim ${i === channels.length - 1 ? 'last:border-b-0' : ''}`}>
                  <div className={`provider-logo ${c.kind}`}>{c.letter}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium">{c.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{c.connected ? c.handle : 'Not connected'}</div>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-label-sm ${c.connected ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant'}`}>
                    {c.connected ? 'Connected' : 'Not connected'}
                  </span>
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => toggleProvider(c.name)}>
                    {c.connected ? 'Manage' : 'Connect'}
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-xl border border-surface-dim mt-3 p-5">
            <h2 className="text-headline-sm">Provider integration requirements</h2>
            <div className="text-[11px] text-on-surface-variant mt-1 mb-3">Each provider adapter must handle its own scopes, media rules, publishing endpoint, and token lifecycle.</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div><strong className="text-[12px]">OAuth &amp; permissions</strong><p className="text-[11px] text-on-surface-variant">Account authorization, scopes, refresh tokens, expiration, and revocation.</p></div>
              <div><strong className="text-[12px]">Publishing capabilities</strong><p className="text-[11px] text-on-surface-variant">Supported post types, media constraints, scheduled publishing, and API limits.</p></div>
              <div><strong className="text-[12px]">Delivery status</strong><p className="text-[11px] text-on-surface-variant">Provider post IDs, status polling/webhooks, errors, and retries.</p></div>
              <div><strong className="text-[12px]">Account mapping</strong><p className="text-[11px] text-on-surface-variant">Workspace, organization, social profile, and provider identity relationships.</p></div>
            </div>
          </div>
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════
           PERFORMANCE
           ═══════════════════════════════════════════════════════════ */}
      {activePage === 'performance' && (
        <section>
          <div className="flex items-center justify-between gap-4 py-4">
            <div>
              <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mb-1">
                <span>Marketing</span><span className="text-outline">/</span><span>Social publishing</span>
              </div>
              <h1 className="text-headline-lg">Performance</h1>
              <p className="text-body-sm text-on-surface-variant mt-0.5">Understand how your published content is performing across channels.</p>
            </div>
            <select className="h-8 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={perfRange} onChange={e => { setPerfRange(e.target.value); onToast('Range: ' + e.target.value); }}>
              <option>Last 30 days</option>
              <option>Last 7 days</option>
              <option>This quarter</option>
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Total reach</span>
              <div className="text-headline-lg mt-1">128.4K</div>
              <div className="text-[11px] text-secondary mt-1">+8.4% vs previous period</div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Engagement</span>
              <div className="text-headline-lg mt-1">6.8%</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Across connected channels</div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Link clicks</span>
              <div className="text-headline-lg mt-1">2,416</div>
              <div className="text-[11px] text-on-surface-variant mt-1">Tracked post link clicks</div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim p-4">
              <span className="text-label-sm text-on-surface-variant uppercase tracking-wider">Published posts</span>
              <div className="text-headline-lg mt-1">48</div>
              <div className="text-[11px] text-on-surface-variant mt-1">In selected period</div>
            </div>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl border border-surface-dim">
              <div className="px-5 py-3 border-b border-surface-dim">
                <h2 className="text-headline-sm">Channel performance</h2>
                <div className="text-[11px] text-on-surface-variant">Illustrative metrics — replace with provider analytics</div>
              </div>
              <div className="p-5">
                {PERF_DATA.map(([n, v]) => (
                  <div key={n} className="mb-4">
                    <div className="flex justify-between text-[11px] mb-1"><strong>{n}</strong><span className="text-on-surface-variant">{v}% index</span></div>
                    <div className="bar"><span style={{ width: `${v}%` }}></span></div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-xl border border-surface-dim">
              <div className="px-5 py-3 border-b border-surface-dim">
                <h2 className="text-headline-sm">Top content</h2>
                <div className="text-[11px] text-on-surface-variant">Highest engagement this month</div>
              </div>
              <div className="p-5 divide-y divide-surface-dim">
                <div className="flex items-center gap-3 py-2">
                  <div className="w-10 h-10 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center text-label-sm font-semibold">01</div>
                  <div className="min-w-0"><div className="text-body-sm font-medium truncate">Product launch announcement</div><div className="text-[11px] text-on-surface-variant">Instagram · 8.2% engagement</div></div>
                </div>
                <div className="flex items-center gap-3 py-2">
                  <div className="w-10 h-10 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center text-label-sm font-semibold">02</div>
                  <div className="min-w-0"><div className="text-body-sm font-medium truncate">Behind the scenes video</div><div className="text-[11px] text-on-surface-variant">TikTok · 7.9% engagement</div></div>
                </div>
                <div className="flex items-center gap-3 py-2">
                  <div className="w-10 h-10 rounded-lg bg-surface-container text-on-surface-variant flex items-center justify-center text-label-sm font-semibold">03</div>
                  <div className="min-w-0"><div className="text-body-sm font-medium truncate">Team spotlight</div><div className="text-[11px] text-on-surface-variant">LinkedIn · 6.4% engagement</div></div>
                </div>
              </div>
            </div>
          </div>
        </section>
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
              {attachFiltered.length === 0 ? (
                <div className="px-3 py-6 text-center text-body-sm text-on-surface-variant">No matches.</div>
              ) : attachFiltered.map(it => (
                <label key={it.id} className="flex items-center gap-3 px-3 py-2 border-b border-surface-dim last:border-b-0 cursor-pointer hover:bg-surface-container-low">
                  <input
                    type="radio"
                    name="attachpick"
                    value={it.id}
                    checked={attachPick?.id === it.id}
                    onChange={() => setAttachPick(it)}
                    style={{ accentColor: '#0a6400' }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-body-sm font-medium">{it.label}</div>
                    <div className="text-[11px] text-on-surface-variant">{it.meta}</div>
                  </div>
                  <span className="product-pill"><span className="material-symbols-outlined">{attachIcon(attachType)}</span>{attachType}</span>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setAttachModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmAttach} disabled={!attachPick}>Attach</button>
            </div>
          </div>
        </div>
      )}

      {/* Connect channel modal */}
      {connectModalOpen && (
        <div className="modal-scrim open" onClick={() => setConnectModalOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-headline-sm mb-1">Connect a social channel</h3>
            <p className="text-body-sm text-on-surface-variant mb-3">Choose a provider to begin the authorization flow. OAuth must be implemented by your backend.</p>
            <div className="mb-3">
              <label className="block text-label-sm text-on-surface-variant mb-1">Provider</label>
              <select className="w-full h-9 px-2 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" value={connectProvider} onChange={e => setConnectProvider(e.target.value)}>
                <option>Instagram</option>
                <option>Facebook</option>
                <option>LinkedIn</option>
                <option>TikTok</option>
                <option>YouTube</option>
                <option>Pinterest</option>
              </select>
            </div>
            <div className="mb-3">
              <label className="block text-label-sm text-on-surface-variant mb-1">Account label (optional)</label>
              <input className="w-full h-9 px-2.5 border border-surface-dim rounded text-body-md focus:outline-none focus:border-primary" placeholder="@yourbrand" value={connectAccount} onChange={e => setConnectAccount(e.target.value)} />
            </div>
            <div className="flex justify-end gap-2">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setConnectModalOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={confirmConnect}>Continue to connect</button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
