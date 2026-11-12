'use client';

import { useMemo, useState } from 'react';
import {
  ACTIVITY,
  BRANDS,
  CAPS,
  MOD,
  PEOPLE,
  ROLES,
  RoleDef,
  blankRole,
  cloneRoles,
  countRole,
  diffRoleCount,
  grantedCount,
  hasPermission,
  peopleInRole,
  Person,
} from '@/data/settingsAccess';
import { DomainKey, DOMAINS, findScreen, screensOf } from '@/data/shellData';
import { ROLES_STORAGE_KEY } from '@/data/settingsAccess';
import { useStoredJson } from '@/hooks/useStoredPref';
import styles from './WorkspaceSettings.module.css';

/* Stored-roles validators for the hydration-safe pref hook. */
function isValidRoleMap(v: unknown): boolean {
  return (
    typeof v === 'object' && v !== null &&
    Object.values(v).every(
      (r) => typeof r === 'object' && r !== null && Array.isArray((r as RoleDef).g)
    )
  );
}
function ensureAdminPresent(roles: Record<string, RoleDef>): Record<string, RoleDef> {
  if (roles.Admin) return roles;
  return { ...roles, Admin: cloneRoles(ROLES).Admin };
}

interface WorkspaceSettingsProps {
  screenId: string;
  onGotoScreen: (screenId: string) => void;
  onToast: (msg: string) => void;
}

const BREADCRUMB = 'Settings / Workspace';

function statusTagClass(st: Person['st']): string {
  if (st === 'Active') return `${styles.tag} ${styles.tagOk}`;
  if (st === 'Invited') return `${styles.tag} ${styles.tagWarn}`;
  return `${styles.tag} ${styles.tagBad}`;
}

function rolesOf(p: Person): string {
  return Object.entries(p.r)
    .map(([brand, role]) => {
      const ext = ROLES[role]?.ext;
      return `<span class="${styles.roleChip} ${ext ? styles.roleChipExt : ''}">${brand}: ${role}</span>`;
    })
    .join(' ');
}

/* ──────────────────────────── HOME ──────────────────────────── */
function HomeView({ onGotoScreen }: { onGotoScreen: (id: string) => void }) {
  // Cards exactly as unsaid-settings-access.html V.home — icon square is a bold
  // letter on the purple tile (.ic: 36px, radius 8, bg #e8def8, ink #4a148c).
  const cards: { key: string; title: string; sub: string; go: string }[] = [
    { key: 'T', title: 'Teammates', sub: 'Manage or invite teammates and see who has access to what.', go: 'ws-teammates' },
    { key: 'R', title: 'Roles and permissions', sub: 'Build roles from 64 permissions, set data access, and test who can do what.', go: 'ws-roles' },
    { key: 'E', title: 'External access', sub: 'Partners, your accountant, and board members, with end dates.', go: 'ws-external' },
    { key: 'A', title: 'Approvals and limits', sub: 'Set dollar limits and require a second person for risky actions.', go: 'ws-approvals' },
    { key: 'O', title: 'Workspace owners', sub: 'Choose who receives security and billing announcements.', go: 'ws-owners' },
    { key: 'B', title: 'Brands', sub: 'Run several businesses from one login with separate access.', go: 'ws-brands' },
    { key: 'S', title: 'Security', sub: 'Two-step sign-in, SSO, sessions, IP rules, and impersonation.', go: 'ws-security' },
    { key: 'L', title: 'Activity log', sub: 'Every sign-in, access change, export, and approval.', go: 'ws-activity' },
  ];
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}>
            <span>{BREADCRUMB}</span>
          </div>
          <h1 className={styles.title}>Workspace</h1>
          <p className={styles.subtitle}>The access area of Settings. Other groups are unchanged.</p>
        </div>
      </div>
      <div className={styles.homeGrid}>
        {cards.map((c) => (
          <button
            key={c.key}
            type="button"
            className={styles.homeCard}
            data-go={c.go}
            onClick={() => onGotoScreen(c.go)}
          >
            <span className={styles.homeCardIcon}>{c.key}</span>
            <span>
              <h4 className={styles.homeCardTitle}>{c.title}</h4>
              <span className={styles.homeCardSub}>{c.sub}</span>
            </span>
          </button>
        ))}
      </div>
      <p className={styles.note}>Sample people and settings. Nothing here is saved.</p>
    </div>
  );
}

/* ──────────────────────────── TEAMMATES ──────────────────────────── */
const TEAMMATE_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'invited', label: 'Invited' },
  { id: 'susp', label: 'Suspended' },
  { id: 'ext', label: 'External' },
  { id: 'no2fa', label: 'No two-step' },
] as const;

function TeammatesView({ onToast }: { onToast: (m: string) => void }) {
  const [filter, setFilter] = useState<string>('all');
  const [brand, setBrand] = useState<string>('All brands');
  const [sel, setSel] = useState<Record<number, boolean>>({});

  const rows = useMemo(() => {
    return PEOPLE.filter((p) => {
      if (brand !== 'All brands' && !p.r[brand]) return false;
      const isExt = Object.values(p.r).some((r) => ROLES[r]?.ext);
      if (filter === 'all') return true;
      if (filter === 'invited') return p.st === 'Invited';
      if (filter === 'susp') return p.st === 'Suspended';
      if (filter === 'ext') return isExt;
      if (filter === 'no2fa') return !p.tf;
      return true;
    });
  }, [filter, brand]);

  const selectedCount = Object.values(sel).filter(Boolean).length;

  const toggleSel = (i: number) =>
    setSel((prev) => ({ ...prev, [i]: !prev[i] }));

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Teammates</h1>
          <p className={styles.subtitle}>
            {PEOPLE.length} people. A person can hold a different role in each brand.
          </p>
        </div>
        <div className={styles.headerRight}>
          <select
            className={styles.switchSelect}
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            aria-label="Brand filter"
          >
            <option>All brands</option>
            {BRANDS.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => onToast('Invite teammates — opening')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
            Invite teammates
          </button>
        </div>
      </div>

      <div className={styles.filterRow}>
        {TEAMMATE_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filterChip} ${filter === f.id ? styles.filterChipActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className={styles.card}>
        {selectedCount > 0 && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkBarText}>{selectedCount} selected</span>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm} ${styles.btnPrimary}`}
              onClick={() => {
                setSel({});
                onToast('Change role — opening');
              }}
            >
              Change role
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={() => {
                setSel({});
                onToast('Suspend — opening');
              }}
            >
              Suspend
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={() => {
                setSel({});
                onToast('Resend invite — opening');
              }}
            >
              Resend invite
            </button>
            <span className={styles.bulkBarMuted}>
              This will change access for {selectedCount} people.
            </span>
          </div>
        )}
        <table className={styles.table}>
          <thead>
            <tr>
              <th style={{ width: 30 }}></th>
              <th>Name</th>
              <th>Role by brand</th>
              <th>Status</th>
              <th>Last active</th>
              <th>Two-step</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p) => {
              const idx = PEOPLE.indexOf(p);
              return (
                <tr key={p.e}>
                  <td>
                    <input
                      type="checkbox"
                      checked={!!sel[idx]}
                      onChange={() => toggleSel(idx)}
                      aria-label={`Select ${p.n}`}
                    />
                  </td>
                  <td>
                    <div className={styles.cellName}>
                      <span className={styles.avatar}>{p.n[0]}</span>
                      <span className={styles.cellNameMain}>
                        <span className={styles.cellNameText}>{p.n}</span>
                        <span className={styles.cellSub}>{p.e}</span>
                      </span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                      {Object.entries(p.r).map(([b, r]) => {
                        const ext = ROLES[r]?.ext;
                        return (
                          <span
                            key={b}
                            className={`${styles.roleChip} ${ext ? styles.roleChipExt : ''}`}
                          >
                            {b}: {r}
                          </span>
                        );
                      })}
                      {p.end && (
                        <span className={`${styles.tag} ${styles.tagWarn}`}>Ends {p.end}</span>
                      )}
                    </div>
                  </td>
                  <td>
                    <span className={statusTagClass(p.st)}>{p.st}</span>
                  </td>
                  <td>{p.l}</td>
                  <td>
                    {p.tf ? (
                      <span className={`${styles.tag} ${styles.tagOk}`}>On</span>
                    ) : (
                      <span className={`${styles.tag} ${styles.tagWarn}`}>Off</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className={styles.emptyText}>
                  No teammates match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── ROLES ──────────────────────────── */
type RoleTab = 'perm' | 'data' | 'mem' | 'cmp';

// New-role modal form.
function NewRoleModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, description: string) => void;
}) {
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const trimmed = name.trim();
  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <h3 className={styles.modalTitle}>New role</h3>
        <p className={styles.modalSub}>
          Create a custom role. Start with no permissions, then grant only what the job needs.
        </p>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="nr-name">Role name</label>
          <input
            id="nr-name"
            type="text"
            className={styles.formInput}
            placeholder="e.g. Fulfillment Lead"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </div>
        <div className={styles.formField}>
          <label className={styles.formLabel} htmlFor="nr-desc">Description</label>
          <textarea
            id="nr-desc"
            className={styles.formTextarea}
            placeholder="What does this role do?"
            value={desc}
            onChange={(e) => setDesc(e.target.value)}
          />
        </div>
        <div className={styles.modalActions}>
          <button type="button" className={styles.btn} onClick={onClose}>Cancel</button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            disabled={!trimmed}
            onClick={() => onCreate(trimmed, desc.trim())}
          >
            Create role
          </button>
        </div>
      </div>
    </div>
  );
}

function RolesView({ onToast }: { onToast: (m: string) => void }) {
  // ── Mutable role state, persisted to localStorage ──
  // Hydration-safe read via useSyncExternalStore: SSR + hydration render use
  // the ROLES default; the stored copy streams in right after hydration.
  const [savedRoles, setSavedRoles] = useStoredJson<Record<string, RoleDef>>(
    ROLES_STORAGE_KEY,
    cloneRoles(ROLES),
    isValidRoleMap,
    ensureAdminPresent,
  );
  const [workingRoles, setWorkingRoles] = useState<Record<string, RoleDef>>(() =>
    cloneRoles(ROLES)
  );

  // Adopt the stored snapshot into the working copy exactly once per saved
  // identity — the documented "adjust state when a prop changes" pattern
  // (setState during render), not an effect.
  const [lastAdopted, setLastAdopted] = useState<Record<string, RoleDef> | null>(null);
  if (lastAdopted !== savedRoles) {
    setLastAdopted(savedRoles);
    setWorkingRoles(cloneRoles(savedRoles));
  }
  const [role, setRole] = useState<string>('Designer');
  const [tab, setTab] = useState<RoleTab>('perm');
  const [pq, setPq] = useState<string>('');
  const [showNewRole, setShowNewRole] = useState(false);

  // Derive the effective selected role — if the selected role was deleted,
  // fall back to Admin. (Derived inline, not via useEffect, to avoid
  // cascading renders.)
  const effectiveRole = workingRoles[role] ? role : 'Admin';
  const def: RoleDef = workingRoles[effectiveRole] ?? workingRoles.Admin;
  const granted = useMemo(() => {
    const total = CAPS.filter((c) => hasPermissionIn(workingRoles, effectiveRole, c.m, c.c)).length;
    const sensitive = CAPS.filter(
      (c) => c.sensitive && hasPermissionIn(workingRoles, effectiveRole, c.m, c.c)
    ).length;
    return { total, sensitive };
  }, [workingRoles, effectiveRole]);
  const roleCount = countRole(effectiveRole);
  const members = peopleInRole(effectiveRole);
  const unsavedCount = diffRoleCount(workingRoles, savedRoles);

  const filteredCaps = useMemo(() => {
    const q = pq.toLowerCase().trim();
    if (!q) return CAPS;
    return CAPS.filter((c) => c.label.toLowerCase().includes(q));
  }, [pq]);

  const capsByModule = useMemo(() => {
    const map = new Map<number, typeof CAPS>();
    filteredCaps.forEach((c) => {
      const arr = map.get(c.m) ?? [];
      arr.push(c);
      map.set(c.m, arr);
    });
    return map;
  }, [filteredCaps]);

  // ── Mutations ──
  const togglePermission = (roleName: string, mi: number, ci: number) => {
    setWorkingRoles((prev) => {
      const r = prev[roleName];
      if (!r || r.lock) return prev;
      const g = [...r.g];
      const bits = g[mi] ?? '';
      const padded = bits.padEnd(MOD[mi].caps.length, '0');
      const next = padded.split('');
      next[ci] = next[ci] === '1' ? '0' : '1';
      g[mi] = next.join('');
      return { ...prev, [roleName]: { ...r, g } };
    });
  };

  const handleSave = () => {
    // The stored-pref setter writes localStorage + notifies consumers.
    setSavedRoles(cloneRoles(workingRoles));
    onToast('Changes saved. Access updated for affected teammates.');
  };

  const handleDiscard = () => {
    setWorkingRoles(cloneRoles(savedRoles));
    onToast('Changes discarded.');
  };

  const handleCreateRole = (name: string, description: string) => {
    if (workingRoles[name]) {
      onToast('A role with that name already exists.');
      return;
    }
    setWorkingRoles((prev) => ({
      ...prev,
      [name]: blankRole(description),
    }));
    setShowNewRole(false);
    setRole(name);
    setTab('perm');
    onToast(`Role “${name}” created. Grant permissions below.`);
  };

  const handleDuplicate = () => {
    const src = workingRoles[effectiveRole];
    if (!src) return;
    let name = `${effectiveRole} (copy)`;
    let i = 2;
    while (workingRoles[name]) {
      name = `${effectiveRole} (copy ${i})`;
      i += 1;
    }
    setWorkingRoles((prev) => ({
      ...prev,
      [name]: {
        ...src,
        g: [...src.g],
        lock: false,
        d: src.d,
      },
    }));
    setRole(name);
    onToast(`Duplicated as “${name}”.`);
  };

  const handleDelete = () => {
    if (def.lock || roleCount > 0) return;
    const target = effectiveRole;
    setWorkingRoles((prev) => {
      const next = { ...prev };
      delete next[target];
      return next;
    });
    onToast(`Role “${target}” deleted.`);
  };

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Roles and permissions</h1>
          <p className={styles.subtitle}>
            Build roles from {CAPS.length} permissions, set data access, and test who can do what.
          </p>
        </div>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => setShowNewRole(true)}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>add</span>
            New role
          </button>
        </div>
      </div>

      <div className={styles.rolesLayout}>
        <div className={styles.rolesList}>
          {Object.keys(workingRoles).map((k) => (
            <button
              key={k}
              type="button"
              className={`${styles.rolesListBtn} ${effectiveRole === k ? styles.rolesListBtnActive : ''}`}
              onClick={() => setRole(k)}
            >
              <span>{k}</span>
              <span className={styles.rolesListBtnCount}>{countRole(k)}</span>
            </button>
          ))}
        </div>

        <div>
          <div className={styles.rolesHeader}>
            <h3 className={styles.rolesHeaderTitle}>{effectiveRole}</h3>
            {def.ext && <span className={`${styles.tag} ${styles.tagWarn}`}>External</span>}
            {def.lock && <span className={`${styles.tag} ${styles.tagMuted}`}>Locked</span>}
            <span style={{ flex: 1 }} />
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={handleDuplicate}
            >
              Duplicate
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
              disabled={def.lock || roleCount > 0}
              onClick={handleDelete}
            >
              Delete
            </button>
          </div>
          <p className={styles.sectionSub}>
            {def.d}
            {roleCount > 0 ? ` ${roleCount} people use it, so it can’t be deleted.` : ''}
          </p>

          <div className={styles.rolesTabs}>
            {(
              [
                ['perm', 'Permissions'],
                ['data', 'Data access'],
                ['mem', `Members (${roleCount})`],
                ['cmp', 'Compare'],
              ] as [RoleTab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                className={`${styles.rolesTab} ${tab === t ? styles.rolesTabActive : ''}`}
                onClick={() => setTab(t)}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'perm' && (
            <div>
              {def.lock && (
                <div className={styles.locked}>
                  Admin is locked so the workspace can never lose its last full-access role.
                </div>
              )}
              <div className={styles.permTopRow}>
                <input
                  type="text"
                  className={styles.permFilterInput}
                  placeholder="Filter permissions"
                  value={pq}
                  onChange={(e) => setPq(e.target.value)}
                  aria-label="Filter permissions"
                />
                <span className={styles.tag}>{granted.total} of {CAPS.length} granted</span>
                <span className={`${styles.tag} ${styles.tagWarn}`}>{granted.sensitive} sensitive</span>
                <span style={{ flex: 1 }} />
                <span className={styles.sectionSub} style={{ margin: 0 }}>
                  Edit or approve automatically includes View.
                </span>
              </div>
              <div className={styles.permModules}>
                {MOD.map((m, mi) => {
                  const caps = capsByModule.get(mi);
                  if (!caps || caps.length === 0) return null;
                  const grantedInMod = caps.filter((c) =>
                    hasPermissionIn(workingRoles, role, c.m, c.c)
                  ).length;
                  return (
                    <div key={m.name} className={styles.permModule}>
                      <div className={styles.permModuleHeader}>
                        <span className={styles.permModuleName}>{m.name}</span>
                        <span className={styles.permModuleCount}>
                          {grantedInMod} / {caps.length}
                        </span>
                      </div>
                      <div className={styles.permList}>
                        {caps.map((c) => {
                          const on = hasPermissionIn(workingRoles, role, c.m, c.c);
                          return (
                            <div key={`${c.m}-${c.c}`} className={styles.permRow}>
                              <span className={styles.permRowLabel}>
                                {c.sensitive && <span className={styles.permSensitiveDot} />}
                                {c.label}
                              </span>
                              <button
                                type="button"
                                className={`${styles.permToggle} ${on ? styles.permToggleOn : ''}`}
                                aria-pressed={on}
                                aria-label={`${on ? 'Revoke' : 'Grant'} ${c.label}`}
                                disabled={def.lock}
                                onClick={() => togglePermission(effectiveRole, c.m, c.c)}
                              >
                                <span className={styles.permToggleKnob} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
                {filteredCaps.length === 0 && (
                  <div className={styles.emptyText}>No permissions match “{pq}”.</div>
                )}
              </div>
            </div>
          )}

          {tab === 'data' && (
            <div className={styles.kvList}>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Data scope</span>
                <span className={styles.kvValue}>
                  {def.sc === 'all' ? 'All records' : 'Own records only'}
                </span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Cost visibility</span>
                <span className={styles.kvValue}>{def.cost}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>PII visibility</span>
                <span className={styles.kvValue}>{def.pii}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Bank / tax visibility</span>
                <span className={styles.kvValue}>{def.bank}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Aggregate only</span>
                <span className={styles.kvValue}>{def.agg ? 'Yes — no drill-down' : 'No'}</span>
              </div>
              <div className={styles.kvRow}>
                <span className={styles.kvLabel}>Bulk action limit</span>
                <span className={styles.kvValue}>{def.bulk}</span>
              </div>
            </div>
          )}

          {tab === 'mem' && (
            <div className={styles.card}>
              {members.length === 0 ? (
                <div className={styles.emptyText}>No one holds this role yet.</div>
              ) : (
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Brand</th>
                      <th>Status</th>
                      <th>Last active</th>
                      <th>Two-step</th>
                    </tr>
                  </thead>
                  <tbody>
                    {members.flatMap((p) =>
                      Object.entries(p.r)
                        .filter(([, r]) => r === effectiveRole)
                        .map(([b]) => (
                          <tr key={`${p.e}-${b}`}>
                            <td>
                              <div className={styles.cellName}>
                                <span className={styles.avatar}>{p.n[0]}</span>
                                <span className={styles.cellNameMain}>
                                  <span className={styles.cellNameText}>{p.n}</span>
                                  <span className={styles.cellSub}>{p.e}</span>
                                </span>
                              </div>
                            </td>
                            <td>{b}</td>
                            <td><span className={statusTagClass(p.st)}>{p.st}</span></td>
                            <td>{p.l}</td>
                            <td>
                              {p.tf ? (
                                <span className={`${styles.tag} ${styles.tagOk}`}>On</span>
                              ) : (
                                <span className={`${styles.tag} ${styles.tagWarn}`}>Off</span>
                              )}
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {tab === 'cmp' && (
            <div className={styles.card}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>People</th>
                    <th>Granted</th>
                    <th>Sensitive</th>
                    <th>Data scope</th>
                    <th>Bulk limit</th>
                    <th>External</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(workingRoles).map(([k, r]) => {
                    const g = countGranted(workingRoles, k);
                    return (
                      <tr key={k} style={k === effectiveRole ? { backgroundColor: '#faf9fc' } : undefined}>
                        <td><strong>{k}</strong></td>
                        <td>{countRole(k)}</td>
                        <td>{g.total}</td>
                        <td>{g.sensitive}</td>
                        <td>{r.sc === 'all' ? 'All' : 'Own'}</td>
                        <td>{r.bulk}</td>
                        <td>{r.ext ? <span className={`${styles.tag} ${styles.tagWarn}`}>Yes</span> : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Unsaved-changes save bar */}
      {unsavedCount > 0 && (
        <div className={styles.saveBar}>
          <span className={styles.saveBarText}>
            {unsavedCount} unsaved change{unsavedCount === 1 ? '' : 's'} · affects{' '}
            {countRole(effectiveRole)} people in {effectiveRole}
          </span>
          <button
            type="button"
            className={`${styles.saveBarBtn} ${styles.saveBarBtnGhost}`}
            onClick={handleDiscard}
          >
            Discard
          </button>
          <button
            type="button"
            className={`${styles.saveBarBtn} ${styles.saveBarBtnPrimary}`}
            onClick={handleSave}
          >
            Review and save
          </button>
        </div>
      )}

      {showNewRole && (
        <NewRoleModal
          onClose={() => setShowNewRole(false)}
          onCreate={handleCreateRole}
        />
      )}
    </div>
  );
}

// Local permission check that uses the mutable working copy.
function hasPermissionIn(
  roles: Record<string, RoleDef>,
  roleName: string,
  mi: number,
  ci: number
): boolean {
  const r = roles[roleName];
  if (!r) return false;
  const bits = r.g[mi] ?? '';
  return bits.charAt(ci) === '1';
}

function countGranted(
  roles: Record<string, RoleDef>,
  roleName: string
): { total: number; sensitive: number } {
  let total = 0;
  let sensitive = 0;
  CAPS.forEach((c) => {
    if (hasPermissionIn(roles, roleName, c.m, c.c)) {
      total += 1;
      if (c.sensitive) sensitive += 1;
    }
  });
  return { total, sensitive };
}

/* ──────────────────────────── EXTERNAL ──────────────────────────── */
function ExternalView({ onToast }: { onToast: (m: string) => void }) {
  const externalPeople = PEOPLE.filter((p) =>
    Object.values(p.r).some((r) => ROLES[r]?.ext)
  );
  const [require2fa, setRequire2fa] = useState(true);
  const [emailEnd, setEmailEnd] = useState(true);

  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>External access</h1>
          <p className={styles.subtitle}>
            People outside your team. Every external role has an end date and requires two-step sign-in.
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ marginBottom: 16 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Name</th>
              <th>Role by brand</th>
              <th>Status</th>
              <th>Access ends</th>
              <th>Two-step</th>
            </tr>
          </thead>
          <tbody>
            {externalPeople.map((p) => (
              <tr key={p.e}>
                <td>
                  <div className={styles.cellName}>
                    <span className={styles.avatar}>{p.n[0]}</span>
                    <span className={styles.cellNameMain}>
                      <span className={styles.cellNameText}>{p.n}</span>
                      <span className={styles.cellSub}>{p.e}</span>
                    </span>
                  </div>
                </td>
                <td>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.entries(p.r).map(([b, r]) => (
                      <span key={b} className={`${styles.roleChip} ${styles.roleChipExt}`}>
                        {b}: {r}
                      </span>
                    ))}
                  </div>
                </td>
                <td><span className={statusTagClass(p.st)}>{p.st}</span></td>
                <td>{p.end ?? '—'}</td>
                <td>
                  {p.tf ? (
                    <span className={`${styles.tag} ${styles.tagOk}`}>On</span>
                  ) : (
                    <span className={`${styles.tag} ${styles.tagWarn}`}>Off</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.card}>
        <div className={styles.switchRow}>
          <span className={styles.switchText}>
            <span className={styles.switchTitle}>Require two-step for all external roles</span>
            <span className={styles.switchSub}>Recommended. Applies to partners, accountants, and board members.</span>
          </span>
          <span className={styles.switchControl}>
            <button
              type="button"
              className={`${styles.permToggle} ${require2fa ? styles.permToggleOn : ''}`}
              aria-pressed={require2fa}
              aria-label="Require two-step for all external roles"
              onClick={() => setRequire2fa((v) => !v)}
            >
              <span className={styles.permToggleKnob} />
            </button>
          </span>
        </div>
        <div className={styles.switchRow}>
          <span className={styles.switchText}>
            <span className={styles.switchTitle}>Email me 7 days before external access ends</span>
          </span>
          <span className={styles.switchControl}>
            <button
              type="button"
              className={`${styles.permToggle} ${emailEnd ? styles.permToggleOn : ''}`}
              aria-pressed={emailEnd}
              aria-label="Email me before external access ends"
              onClick={() => {
                setEmailEnd((v) => !v);
                onToast('Preference saved');
              }}
            >
              <span className={styles.permToggleKnob} />
            </button>
          </span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── APPROVALS ──────────────────────────── */
function ApprovalsView({ onToast }: { onToast: (m: string) => void }) {
  const [creatorCannotApprove, setCreatorCannotApprove] = useState(true);
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Approvals and limits</h1>
          <p className={styles.subtitle}>
            Set dollar limits and require a second person for risky actions.
          </p>
        </div>
      </div>

      <div className={styles.card} style={{ marginBottom: 16 }}>
        <div className={styles.switchRow}>
          <span className={styles.switchText}>
            <span className={styles.switchTitle}>Creator cannot approve own bills</span>
            <span className={styles.switchSub}>Requires a second person to approve any bill or payment the creator made.</span>
          </span>
          <span className={styles.switchControl}>
            <button
              type="button"
              className={`${styles.permToggle} ${creatorCannotApprove ? styles.permToggleOn : ''}`}
              aria-pressed={creatorCannotApprove}
              aria-label="Creator cannot approve own bills"
              onClick={() => {
                setCreatorCannotApprove((v) => !v);
                onToast('Approval rule updated');
              }}
            >
              <span className={styles.permToggleKnob} />
            </button>
          </span>
        </div>
      </div>

      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Role</th>
              <th>Bulk action limit</th>
              <th>Bill approval</th>
              <th>Refund limit</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(ROLES).map(([k, r]) => (
              <tr key={k}>
                <td><strong>{k}</strong></td>
                <td>{r.bulk}</td>
                <td>{r.ext || r.lock ? 'Auto' : 'Required'}</td>
                <td>{r.bulk === 'No limit' ? 'No limit' : r.bulk}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── OWNERS ──────────────────────────── */
function OwnersView() {
  const owners = [
    { name: 'Sunny A.', sec: true, bill: true, svc: true },
    { name: 'Almeta R.', sec: true, bill: false, svc: true },
  ];
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Workspace owners</h1>
          <p className={styles.subtitle}>
            Owners receive security alerts, billing notices, and service announcements. Keep at least two.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Owner</th>
              <th>Security</th>
              <th>Billing</th>
              <th>Service</th>
            </tr>
          </thead>
          <tbody>
            {owners.map((o) => (
              <tr key={o.name}>
                <td>
                  <div className={styles.cellName}>
                    <span className={styles.avatar}>{o.name[0]}</span>
                    <span className={styles.cellNameText}>{o.name}</span>
                  </div>
                </td>
                <td><input type="checkbox" defaultChecked={o.sec} aria-label="security" /></td>
                <td><input type="checkbox" defaultChecked={o.bill} aria-label="billing" /></td>
                <td><input type="checkbox" defaultChecked={o.svc} aria-label="service" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.sectionSub} style={{ marginTop: 12 }}>
        Only an owner can delete the workspace or remove another owner.
      </p>
    </div>
  );
}

/* ──────────────────────────── BRANDS ──────────────────────────── */
function BrandsView() {
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Brands</h1>
          <p className={styles.subtitle}>
            Run several businesses from one login with separate access.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Brand</th>
              <th>People</th>
              <th>Default role</th>
            </tr>
          </thead>
          <tbody>
            {BRANDS.map((b) => {
              const peopleInBrand = PEOPLE.filter((p) => p.r[b]).length;
              return (
                <tr key={b}>
                  <td><strong>{b}</strong></td>
                  <td>{peopleInBrand}</td>
                  <td>Team Member</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── SECURITY ──────────────────────────── */
function SecurityView() {
  const rows: [string, string, 'select' | 'check', string | number][] = [
    ['Require two-step sign-in', 'Admins and external roles always. Everyone else is a choice.', 'select', 0],
    ['Single sign-on (SAML)', 'Sign in with your company identity provider.', 'check', 0],
    ['Session length', 'Sign out after this long without activity.', 'select', 0],
    ['Restrict sign-in by IP address', 'Allow only your office or VPN ranges.', 'check', 0],
    ['Trusted devices', 'Ask for two-step again on a new device.', 'check', 1],
    ['Alert owners on new-country sign-in', 'Email workspace owners.', 'check', 1],
    ['Impersonating a customer', 'Requires a reason, lasts 30 minutes, and is logged. Never allowed on payment screens.', 'select', 0],
    ['API tokens', 'Tokens are scoped to a role and expire.', 'select', 0],
  ];
  const selectOpts: Record<number, string[]> = {
    0: ['Everyone', 'Admins and external', 'Admins only'],
    2: ['8 hours', '24 hours', '7 days'],
    6: ['Admins only', 'Admins and Support leads', 'Off'],
    7: ['90 days', '30 days', 'Never expire'],
  };
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Security</h1>
          <p className={styles.subtitle}>
            Two-step sign-in, SSO, sessions, IP rules, and impersonation.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        {rows.map((r, i) => (
          <div key={r[0]} className={styles.switchRow}>
            <span className={styles.switchText}>
              <span className={styles.switchTitle}>{r[0]}</span>
              <span className={styles.switchSub}>{r[1]}</span>
            </span>
            <span className={styles.switchControl}>
              {r[2] === 'select' ? (
                <select
                  className={styles.switchSelect}
                  defaultValue={selectOpts[i]?.[0]}
                  aria-label={r[0]}
                >
                  {(selectOpts[i] ?? []).map((opt) => (
                    <option key={opt}>{opt}</option>
                  ))}
                </select>
              ) : (
                <button
                  type="button"
                  className={`${styles.permToggle} ${r[3] ? styles.permToggleOn : ''}`}
                  aria-pressed={!!r[3]}
                  aria-label={r[0]}
                >
                  <span className={styles.permToggleKnob} />
                </button>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────────── ACTIVITY ──────────────────────────── */
const ACTIVITY_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'role', label: 'Role changes' },
  { id: 'team', label: 'Teammates' },
  { id: 'export', label: 'Exports' },
  { id: 'approval', label: 'Approvals' },
  { id: 'imp', label: 'Impersonation' },
  { id: 'sign', label: 'Sign-ins' },
] as const;

function ActivityView({ onToast }: { onToast: (m: string) => void }) {
  const [filter, setFilter] = useState<string>('all');
  const rows = ACTIVITY.filter((e) => filter === 'all' || e.kind === filter);
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Activity log</h1>
          <p className={styles.subtitle}>Kept for 12 months. Changes to access can’t be deleted.</p>
        </div>
        <div className={styles.headerRight}>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={() => onToast('Export started. We’ll email the CSV.')}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>
            Export CSV
          </button>
        </div>
      </div>
      <div className={styles.filterRow}>
        {ACTIVITY_FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={`${styles.filterChip} ${filter === f.id ? styles.filterChipActive : ''}`}
            onClick={() => setFilter(f.id)}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Who</th>
              <th>What</th>
              <th>When</th>
              <th>Where</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e, i) => (
              <tr key={`${e.when}-${i}`}>
                <td><strong>{e.who}</strong></td>
                <td>{e.what}</td>
                <td>{e.when}</td>
                <td>{e.where}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className={styles.emptyText}>No events match this filter.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── MULTILINGUAL ──────────────────────────── */
function MultilingualView() {
  const langs = [
    { code: 'en', label: 'English (US)', default: true, active: true },
    { code: 'es', label: 'Spanish (Latin America)', default: false, active: true },
    { code: 'fr', label: 'French (France)', default: false, active: false },
    { code: 'de', label: 'German', default: false, active: false },
  ];
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Multilingual</h1>
          <p className={styles.subtitle}>
            Languages teammates and customers can use. Translations are per-brand.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Language</th>
              <th>Code</th>
              <th>Default</th>
              <th>Active</th>
            </tr>
          </thead>
          <tbody>
            {langs.map((l) => (
              <tr key={l.code}>
                <td><strong>{l.label}</strong></td>
                <td>{l.code}</td>
                <td>{l.default ? <span className={`${styles.tag} ${styles.tagOk}`}>Default</span> : '—'}</td>
                <td>
                  <button
                    type="button"
                    className={`${styles.permToggle} ${l.active ? styles.permToggleOn : ''}`}
                    aria-pressed={l.active}
                    aria-label={`Toggle ${l.label}`}
                  >
                    <span className={styles.permToggleKnob} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── OFFICE HOURS ──────────────────────────── */
function HoursView() {
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>Office hours</h1>
          <p className={styles.subtitle}>
            When teammates are expected to be available. Drives routing and out-of-office replies.
          </p>
        </div>
      </div>
      <div className={styles.card}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Day</th>
              <th>Open</th>
              <th>Close</th>
              <th>Timezone</th>
            </tr>
          </thead>
          <tbody>
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].map((d) => (
              <tr key={d}>
                <td><strong>{d}</strong></td>
                <td>09:00</td>
                <td>17:00</td>
                <td>America/Chicago</td>
              </tr>
            ))}
            <tr>
              <td><strong>Sat</strong></td>
              <td colSpan={3} style={{ color: '#5a6355' }}>Closed</td>
            </tr>
            <tr>
              <td><strong>Sun</strong></td>
              <td colSpan={3} style={{ color: '#5a6355' }}>Closed</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ──────────────────────────── GENERAL ──────────────────────────── */
function GeneralView() {
  return (
    <div>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.breadcrumb}><span>{BREADCRUMB}</span></div>
          <h1 className={styles.title}>General</h1>
          <p className={styles.subtitle}>Workspace name, region, and defaults.</p>
        </div>
      </div>
      <div className={styles.kvList}>
        <div className={styles.kvRow}>
          <span className={styles.kvLabel}>Workspace name</span>
          <span className={styles.kvValue}>Unsaid</span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvLabel}>Region</span>
          <span className={styles.kvValue}>US-East</span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvLabel}>Default brand</span>
          <span className={styles.kvValue}>Unsaid</span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvLabel}>Timezone</span>
          <span className={styles.kvValue}>America/Chicago</span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvLabel}>Currency</span>
          <span className={styles.kvValue}>USD ($)</span>
        </div>
        <div className={styles.kvRow}>
          <span className={styles.kvLabel}>Fiscal year start</span>
          <span className={styles.kvValue}>January</span>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────── RENDERER ──────────────────────────── */
const WS_SCREEN_IDS = new Set<string>([
  'ws-home',
  'settings-overview',
  'ws-general',
  'ws-teammates',
  'ws-roles',
  'ws-external',
  'ws-approvals',
  'ws-owners',
  'ws-hours',
  'ws-brands',
  'ws-security',
  'ws-activity',
  'ws-multilingual',
]);

export { WS_SCREEN_IDS };

export default function WorkspaceSettings({
  screenId,
  onGotoScreen,
  onToast,
}: WorkspaceSettingsProps) {
  let body: React.ReactNode;
  switch (screenId) {
    case 'ws-home':
    case 'settings-overview':
      body = <HomeView onGotoScreen={onGotoScreen} />;
      break;
    case 'ws-teammates':
      body = <TeammatesView onToast={onToast} />;
      break;
    case 'ws-roles':
      body = <RolesView onToast={onToast} />;
      break;
    case 'ws-external':
      body = <ExternalView onToast={onToast} />;
      break;
    case 'ws-approvals':
      body = <ApprovalsView onToast={onToast} />;
      break;
    case 'ws-owners':
      body = <OwnersView />;
      break;
    case 'ws-brands':
      body = <BrandsView />;
      break;
    case 'ws-security':
      body = <SecurityView />;
      break;
    case 'ws-activity':
      body = <ActivityView onToast={onToast} />;
      break;
    case 'ws-multilingual':
      body = <MultilingualView />;
      break;
    case 'ws-hours':
      body = <HoursView />;
      break;
    case 'ws-general':
      body = <GeneralView />;
      break;
    default:
      body = <HomeView onGotoScreen={onGotoScreen} />;
  }
  return <div className={styles.container}>{body}</div>;
}
