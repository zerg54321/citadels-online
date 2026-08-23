import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MatchResult, TeamId } from 'citadels-common';
import adminApi, {
  type AdminUser,
  type AdminMatch,
  type AdminAuditRow,
} from '@/api/admin';
import roomsApi, { type RoomListItem } from '@/api/rooms';
import { avatarUrl } from '@/utils/avatarUrl';

const STORAGE_KEY = 'adminToken';

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function teamName(team: number, t: (k: string) => string): string {
  if (team === TeamId.A) return t('ui.team.a');
  if (team === TeamId.B) return t('ui.team.b');
  return '—';
}

function matchResultLabel(m: AdminMatch, t: (k: string) => string): string {
  if (m.matchResult === MatchResult.TEAM_A_WIN) return t('ui.score.team_a_win');
  if (m.matchResult === MatchResult.TEAM_B_WIN) return t('ui.score.team_b_win');
  if (m.matchResult === MatchResult.DRAW) return t('ui.score.draw');
  return '—';
}

export default function AdminScreen() {
  const { t } = useTranslation();
  const [token, setToken] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [tab, setTab] = useState<'users' | 'matches' | 'audit'>('users');

  useEffect(() => {
    let cancelled = false;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      setChecking(false);
      return;
    }
    adminApi
      .ping(stored)
      .then(() => {
        if (!cancelled) {
          setToken(stored);
          setChecking(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          localStorage.removeItem(STORAGE_KEY);
          setChecking(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    setTab('users');
  };

  if (checking) {
    return <div className="container py-4 admin-screen"><div className="admin-screen__empty">{t('ui.admin.verifying')}</div></div>;
  }

  if (!token) {
    return <AdminLogin onAuthed={(tk) => { setToken(tk); }} t={t} />;
  }

  return (
    <div className="container py-4 admin-screen">
      <div className="admin-screen__head">
        <h3 className="admin-screen__title">{t('ui.admin.title')}</h3>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={handleSignOut}>
          {t('ui.admin.sign_out')}
        </button>
      </div>

      <div className="admin-tabs">
        <button
          type="button"
          className={`admin-tabs__btn${tab === 'users' ? ' admin-tabs__btn--active' : ''}`}
          onClick={() => setTab('users')}
        >
          {t('ui.admin.tab_users')}
        </button>
        <button
          type="button"
          className={`admin-tabs__btn${tab === 'matches' ? ' admin-tabs__btn--active' : ''}`}
          onClick={() => setTab('matches')}
        >
          {t('ui.admin.tab_matches')}
        </button>
        <button
          type="button"
          className={`admin-tabs__btn${tab === 'audit' ? ' admin-tabs__btn--active' : ''}`}
          onClick={() => setTab('audit')}
        >
          {t('ui.admin.tab_audit')}
        </button>
      </div>

      {tab === 'users' && <UsersTab token={token} t={t} />}
      {tab === 'matches' && <MatchesTab token={token} t={t} />}
      {tab === 'audit' && <AuditTab token={token} t={t} />}
    </div>
  );
}

type TFunc = (k: string, opts?: Record<string, unknown>) => string;

function AdminLogin({ onAuthed, t }: { onAuthed: (token: string) => void; t: TFunc }) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setBusy(true);
    setError('');
    try {
      await adminApi.ping(trimmed);
      localStorage.setItem(STORAGE_KEY, trimmed);
      onAuthed(trimmed);
      setValue('');
    } catch {
      setError(t('ui.admin.invalid_token'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-login">
      <h3 className="admin-login__title">{t('ui.admin.title')}</h3>
      <p className="admin-login__hint">{t('ui.admin.login_hint')}</p>
      {error && <div className="admin-alert admin-alert--danger">{error}</div>}
      <input
        type="password"
        className="admin-login__field"
        placeholder={t('ui.admin.token')}
        value={value}
        autoComplete="off"
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
      />
      <button type="button" className="admin-btn admin-btn--gold" disabled={busy || !value.trim()} onClick={submit}>
        {busy ? t('ui.admin.verifying') : t('ui.admin.sign_in')}
      </button>
    </div>
  );
}

function UsersTab({ token, t }: { token: string; t: TFunc }) {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [prefixInput, setPrefixInput] = useState('');
  const [appliedPrefix, setAppliedPrefix] = useState<string | undefined>(undefined);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [batchConfirm, setBatchConfirm] = useState(false);
  const [singleDeleteTarget, setSingleDeleteTarget] = useState<AdminUser | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  const limit = 50;

  const reload = (p?: string) => {
    setOffset(0);
    setAppliedPrefix(p);
    setChecked(new Set());
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await adminApi.users(token, limit, offset, appliedPrefix);
        if (!cancelled) {
          setUsers(res.users || []);
          setTotal(res.total || 0);
          setChecked(new Set());
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token, offset, appliedPrefix]);

  useEffect(() => {
    const selectedId = selected?.id;
    if (!selectedId) return;
    let cancelled = false;
    adminApi
      .user(token, selectedId)
      .then((res) => { if (!cancelled) setSelected(res.user); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [token, selected?.id]);

  const toggleCheck = (id: string) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allOnPageChecked = users.length > 0 && users.every((u) => checked.has(u.id));
  const toggleAll = () => {
    setChecked((prev) => {
      if (allOnPageChecked) {
        const next = new Set(prev);
        users.forEach((u) => next.delete(u.id));
        return next;
      }
      const next = new Set(prev);
      users.forEach((u) => next.add(u.id));
      return next;
    });
  };

  const doBatchDelete = async () => {
    const ids = Array.from(checked);
    if (!ids.length) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await adminApi.batchDeleteUsers(token, ids);
      setActionMsg({ kind: 'ok', text: t('ui.admin.deleted_n', { n: res.deleted, path: res.backup }) });
      setBatchConfirm(false);
      setChecked(new Set());
      const r = await adminApi.users(token, limit, offset, appliedPrefix);
      setUsers(r.users || []);
      setTotal(r.total || 0);
    } catch (e) {
      setActionMsg({ kind: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const doSingleDelete = async (u: AdminUser) => {
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await adminApi.deleteUser(token, u.id);
      setActionMsg({ kind: 'ok', text: t('ui.admin.deleted_n', { n: 1, path: res.backup }) });
      setSingleDeleteTarget(null);
      if (selected?.id === u.id) setSelected(null);
      const r = await adminApi.users(token, limit, offset, appliedPrefix);
      setUsers(r.users || []);
      setTotal(r.total || 0);
    } catch (e) {
      setActionMsg({ kind: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {error && <div className="admin-alert admin-alert--danger">{t('ui.admin.load_failed', { msg: error })}</div>}
      {actionMsg && <div className={`admin-alert admin-alert--${actionMsg.kind}`}>{actionMsg.text}</div>}

      <div className="admin-filter">
        <input
          className="admin-filter__input"
          placeholder={t('ui.admin.filter_prefix')}
          value={prefixInput}
          onChange={(e) => setPrefixInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') reload(prefixInput.trim() || undefined); }}
        />
        <button type="button" className="admin-btn admin-btn--gold" onClick={() => reload(prefixInput.trim() || undefined)}>
          {t('ui.admin.filter_apply')}
        </button>
        {appliedPrefix && (
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => { setPrefixInput(''); reload(undefined); }}>
            {t('ui.admin.filter_clear')}
          </button>
        )}
        {appliedPrefix && <span className="admin-filter__info">{appliedPrefix}* · {total}</span>}
      </div>

      {checked.size > 0 && (
        <div className="admin-batchbar">
          <span>{t('ui.admin.selected_count', { n: checked.size })}</span>
          {!batchConfirm ? (
            <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={() => setBatchConfirm(true)}>
              {t('ui.admin.delete_selected')}
            </button>
          ) : (
            <>
              <span className="admin-alert admin-alert--warn" style={{ flex: 1 }}>
                {t('ui.admin.confirm_batch_delete', { n: checked.size })}
              </span>
              <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={doBatchDelete}>
                {t('ui.admin.confirm_delete_yes')}
              </button>
              <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => setBatchConfirm(false)}>
                {t('ui.admin.cancel')}
              </button>
            </>
          )}
        </div>
      )}

      {loading && <div className="admin-screen__empty">{t('ui.loading')}</div>}
      {!loading && users.length === 0 && !error && <div className="admin-screen__empty">{t('ui.admin.no_data')}</div>}
      {!loading && users.length > 0 && (
        <>
          <div className="admin-table admin-table--users">
            <div className="admin-table__head">
              <span><input type="checkbox" checked={allOnPageChecked} onChange={toggleAll} aria-label={t('ui.admin.select_all')} /></span>
              <span />
              <span>{t('ui.admin.col_username')}</span>
              <span>{t('ui.admin.col_displayname')}</span>
              <span>{t('ui.admin.col_created')}</span>
              <span>{t('ui.admin.col_actions')}</span>
            </div>
            {users.map((u) => (
              <div className="admin-table__row" key={u.id}>
                <span><input type="checkbox" checked={checked.has(u.id)} onChange={() => toggleCheck(u.id)} aria-label={u.username} /></span>
                <span><img className="admin-table__avatar" src={avatarUrl(u.avatar)} alt="" /></span>
                <span>{u.username}</span>
                <span>{u.displayName}</span>
                <span className="admin-table__cell--muted">{formatTime(u.createdAt)}</span>
                <span className="admin-table__cell--actions">
                  <button
                    type="button"
                    className="admin-btn admin-btn--gold"
                    onClick={() => setSelected(selected && selected.id === u.id ? null : u)}
                  >
                    {t('ui.admin.edit')}
                  </button>
                  {!singleDeleteTarget || singleDeleteTarget.id !== u.id ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn--danger"
                      disabled={busy}
                      onClick={() => setSingleDeleteTarget(u)}
                    >
                      {t('ui.admin.delete')}
                    </button>
                  ) : (
                    <>
                      <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={() => doSingleDelete(u)}>
                        {t('ui.admin.confirm_delete_yes')}
                      </button>
                      <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => setSingleDeleteTarget(null)}>
                        {t('ui.admin.cancel')}
                      </button>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>
          <Pagination
            offset={offset}
            limit={limit}
            total={total}
            onPrev={() => setOffset(Math.max(0, offset - limit))}
            onNext={() => setOffset(offset + limit)}
            t={t}
          />
        </>
      )}
      {selected && (
        <UserPanel
          key={selected.id}
          user={selected}
          token={token}
          t={t}
          onClose={() => setSelected(null)}
          onChanged={(u) => setSelected(u)}
        />
      )}
    </div>
  );
}

function UserPanel({
  user,
  token,
  t,
  onClose,
  onChanged,
}: {
  user: AdminUser;
  token: string;
  t: TFunc;
  onClose: () => void;
  onChanged: (u: AdminUser) => void;
}) {
  const [displayName, setDisplayName] = useState(user.displayName);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [tempPw, setTempPw] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await adminApi.updateUser(token, user.id, { displayName: displayName.trim() });
      onChanged(res.user);
      setMsg({ kind: 'ok', text: t('ui.admin.saved') });
    } catch (e) {
      setMsg({ kind: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const doReset = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await adminApi.resetPassword(token, user.id);
      setTempPw(res.password);
      setConfirmReset(false);
      onChanged(res.user);
      setMsg({ kind: 'ok', text: t('ui.admin.password_reset_ok') });
    } catch (e) {
      setMsg({ kind: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  const copyPw = async () => {
    if (!tempPw) return;
    try {
      await navigator.clipboard.writeText(tempPw);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard may be unavailable */ }
  };

  return (
    <div className="admin-panel">
      <div className="admin-panel__title">{t('ui.admin.edit')} — {user.username}</div>
      <div className="admin-panel__meta">
        <div>{t('ui.admin.col_username')}: <code>{user.username}</code></div>
        <div>ID: <code>{user.id}</code></div>
        <div>{t('ui.admin.avatar')}: {user.avatar.type} ({user.avatar.ref})</div>
        <div>{t('ui.admin.col_created')}: {formatTime(user.createdAt)}</div>
      </div>

      {msg && <div className={`admin-alert admin-alert--${msg.kind}`}>{msg.text}</div>}

      <div className="admin-panel__row">
        <label className="admin-panel__label">{t('ui.admin.new_displayname')}</label>
        <input
          className="admin-panel__field"
          style={{ maxWidth: '20rem' }}
          value={displayName}
          maxLength={32}
          onChange={(e) => setDisplayName(e.target.value)}
        />
        <button type="button" className="admin-btn admin-btn--gold" disabled={busy || !displayName.trim()} onClick={save}>
          {t('ui.admin.save')}
        </button>
      </div>

      <div className="admin-panel__row">
        <label className="admin-panel__label">{t('ui.admin.reset_password')}</label>
        {!confirmReset ? (
          <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={() => { setConfirmReset(true); setTempPw(null); setMsg(null); }}>
            {t('ui.admin.reset_password')}
          </button>
        ) : (
          <>
            <span className="admin-alert admin-alert--warn" style={{ flex: 1 }}>{t('ui.admin.confirm_reset')}</span>
            <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={doReset}>
              {t('ui.admin.confirm_reset_yes')}
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => setConfirmReset(false)}>
              {t('ui.admin.cancel')}
            </button>
          </>
        )}
      </div>

      {tempPw && (
        <div className="admin-alert admin-alert--ok">
          {t('ui.admin.temp_password')}
          <div className="admin-tmppw">
            <code>{tempPw}</code>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={copyPw}>
              {copied ? t('ui.admin.copied') : t('ui.admin.copy')}
            </button>
          </div>
        </div>
      )}

      <div className="admin-panel__row" style={{ marginTop: '1rem' }}>
        <button type="button" className="admin-btn admin-btn--ghost" onClick={onClose}>{t('ui.admin.cancel')}</button>
      </div>
    </div>
  );
}

// Live OB entry — lists rooms straight from the public GET /api/rooms feed
// (no manual room-id typing). In-game rooms first, then lobbies; auto-refresh
// every 15s so the list stays honest as games start and end.
function ObRoomsPanel({ t }: { t: TFunc }) {
  const navigate = useNavigate();
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async (silent: boolean) => {
      if (!silent) setLoading(true);
      try {
        const list = await roomsApi.list();
        if (!cancelled) {
          setRooms(list.filter((r) => r.canSpectate));
          setError('');
        }
      } catch (e) {
        if (!cancelled && !silent) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled && !silent) setLoading(false);
      }
    };
    load(false);
    const timer = setInterval(() => load(true), 15000);
    return () => { cancelled = true; clearInterval(timer); };
  }, []);

  return (
    <div className="admin-ob-rooms">
      <div className="admin-ob-rooms__head">
        <span className="admin-ob-rooms__title">{t('ui.admin.ob_rooms_title')}</span>
        <button
          type="button"
          className="admin-btn admin-btn--ghost"
          onClick={() => {
            setLoading(true);
            roomsApi.list()
              .then((list) => { setRooms(list.filter((r) => r.canSpectate)); setError(''); })
              .catch((e) => { setError(e instanceof Error ? e.message : String(e)); })
              .finally(() => setLoading(false));
          }}
        >
          ↻ {t('ui.admin.ob_refresh')}
        </button>
      </div>
      {error && <div className="admin-alert admin-alert--danger">{t('ui.admin.load_failed', { msg: error })}</div>}
      {loading && <div className="admin-screen__empty">{t('ui.loading')}</div>}
      {!loading && !error && rooms.length === 0 && (
        <div className="admin-screen__empty">{t('ui.admin.ob_no_rooms')}</div>
      )}
      {!loading && rooms.length > 0 && (
        <div className="admin-ob-rooms__list">
          {rooms.map((r) => (
            <div className="admin-ob-rooms__row" key={r.roomId}>
              <code className="admin-ob-rooms__id">{r.roomId}</code>
              <span className={`admin-badge ${r.phase === 'in_game' ? 'admin-badge--ranked' : 'admin-badge--casual'}`}>
                {r.phase === 'in_game' ? t('ui.admin.ob_phase_ingame') : t('ui.admin.ob_phase_lobby')}
              </span>
              <span className="admin-ob-rooms__players" title={r.players.map((p) => p.username).join(', ')}>
                {r.playerCount}/{r.maxPlayers} · {r.players.map((p) => p.username).join('、')}
                {r.spectatorCount > 0 && (
                  <span className="admin-ob-rooms__spectators"> · {t('ui.admin.ob_spectators', { n: r.spectatorCount })}</span>
                )}
              </span>
              <button
                type="button"
                className="admin-btn admin-btn--gold"
                onClick={() => navigate(`/admin/ob/${r.roomId}`)}
              >
                {t('ui.admin.ob_watch')}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MatchesTab({ token, t }: { token: string; t: TFunc }) {
  const navigate = useNavigate();
  const [matches, setMatches] = useState<AdminMatch[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [detail, setDetail] = useState<AdminMatch | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState<{ kind: 'ok' | 'danger'; text: string } | null>(null);
  const limit = 50;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await adminApi.matches(token, limit, offset);
        if (!cancelled) {
          setMatches(res.matches || []);
          setTotal(res.total || 0);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token, offset]);

  const openDetail = async (m: AdminMatch) => {
    setActionMsg(null);
    setConfirmDelete(false);
    try {
      const res = await adminApi.match(token, m.id);
      setDetail(res.match);
    } catch {
      setDetail(m);
    }
  };

  const doDelete = async () => {
    if (!detail) return;
    setBusy(true);
    setActionMsg(null);
    try {
      const res = await adminApi.deleteMatch(token, detail.id);
      setActionMsg({ kind: 'ok', text: t('ui.admin.backup_created', { path: res.backup }) });
      setConfirmDelete(false);
      setMatches((prev) => prev.filter((m) => m.id !== detail.id));
      setTotal((n) => Math.max(0, n - 1));
      setDetail(null);
    } catch (e) {
      setActionMsg({ kind: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      {error && <div className="admin-alert admin-alert--danger">{t('ui.admin.load_failed', { msg: error })}</div>}
      {actionMsg && <div className={`admin-alert admin-alert--${actionMsg.kind}`}>{actionMsg.text}</div>}
      <ObRoomsPanel t={t} />
      {loading && <div className="admin-screen__empty">{t('ui.loading')}</div>}
      {!loading && matches.length === 0 && !error && <div className="admin-screen__empty">{t('ui.admin.no_data')}</div>}
      {!loading && matches.length > 0 && (
        <>
          <div className="admin-table admin-table--matches">
            <div className="admin-table__head">
              <span>{t('ui.admin.col_ended')}</span>
              <span>{t('ui.admin.col_mode')}</span>
              <span>{t('ui.admin.col_has_ai')}</span>
              <span>{t('ui.admin.col_scores')}</span>
              <span>{t('ui.admin.col_result')}</span>
            </div>
            {matches.map((m) => (
              <div
                className="admin-table__row admin-table__row--clickable"
                key={m.id}
                onClick={() => openDetail(m)}
              >
                <span className="admin-table__cell--muted">{formatTime(m.endedAt)}</span>
                <span>
                  <span className={`admin-badge ${m.ranked ? 'admin-badge--ranked' : 'admin-badge--casual'}`}>
                    {m.ranked ? t('ui.stats.ranked') : t('ui.stats.casual')}
                  </span>
                </span>
                <span>{m.hasAi ? t('ui.admin.yes') : t('ui.admin.no')}</span>
                <span className="admin-table__cell--muted">
                  {m.teamScoreA != null ? `A ${m.teamScoreA} · B ${m.teamScoreB}` : '—'}
                </span>
                <span>{matchResultLabel(m, t)}</span>
              </div>
            ))}
          </div>
          <Pagination
            offset={offset}
            limit={limit}
            total={total}
            onPrev={() => setOffset(Math.max(0, offset - limit))}
            onNext={() => setOffset(offset + limit)}
            t={t}
          />
        </>
      )}

      {detail && (
        <div className="admin-panel">
          <div className="admin-panel__title">{t('ui.admin.detail')}</div>
          <div className="admin-panel__meta">
            <div>ID: <code>{detail.id}</code></div>
            <div>Room: <code>{detail.roomId}</code></div>
            <div>{t('ui.admin.col_mode')}: {detail.ranked ? t('ui.stats.ranked') : t('ui.stats.casual')} · {t('ui.admin.col_has_ai')}: {detail.hasAi ? t('ui.admin.yes') : t('ui.admin.no')}</div>
            <div>{t('ui.admin.col_result')}: {matchResultLabel(detail, t)}</div>
            <div>{t('ui.stats.ended_at')}: {formatTime(detail.endedAt)}</div>
          </div>

          <div className="admin-table admin-table--users" style={{ marginTop: '0.5rem' }}>
            <div className="admin-table__head">
              <span />
              <span>{t('ui.admin.col_displayname')}</span>
              <span>{t('ui.admin.col_seat')}</span>
              <span>{t('ui.admin.col_team')}</span>
              <span>{t('ui.admin.col_personal')}</span>
            </div>
            {detail.players.map((p) => (
              <div className="admin-table__row" key={p.player_id}>
                <span />
                <span>{p.display_name}{p.is_ai ? ' (AI)' : ''}</span>
                <span>{p.seat}</span>
                <span>{teamName(p.team, t)}</span>
                <span className="admin-table__cell--muted">{p.personal_score}</span>
              </div>
            ))}
          </div>

          <div className="admin-panel__row" style={{ marginTop: '1rem' }}>
            {!confirmDelete ? (
              <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={() => setConfirmDelete(true)}>
                {t('ui.admin.delete_match')}
              </button>
            ) : (
              <>
                <span className="admin-alert admin-alert--warn" style={{ flex: 1 }}>{t('ui.admin.confirm_delete')}</span>
                <button type="button" className="admin-btn admin-btn--danger" disabled={busy} onClick={doDelete}>
                  {t('ui.admin.confirm_delete_yes')}
                </button>
                <button type="button" className="admin-btn admin-btn--ghost" disabled={busy} onClick={() => setConfirmDelete(false)}>
                  {t('ui.admin.cancel')}
                </button>
              </>
            )}
            <button type="button" className="admin-btn admin-btn--gold" onClick={() => navigate(`/admin/replay/${detail.id}`)}>
              {t('ui.admin.replay')}
            </button>
            <button type="button" className="admin-btn admin-btn--ghost" onClick={() => setDetail(null)}>{t('ui.admin.cancel')}</button>
          </div>
        </div>
      )}
    </div>
  );
}

function AuditTab({ token, t }: { token: string; t: TFunc }) {
  const [rows, setRows] = useState<AdminAuditRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const limit = 50;

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await adminApi.audit(token, limit, offset);
        if (!cancelled) {
          setRows(res.audit || []);
          setTotal(res.total || 0);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [token, offset]);

  const actionLabel = (action: string): string => {
    if (action === 'user.update') return t('ui.admin.edit');
    if (action === 'user.reset_password') return t('ui.admin.reset_password');
    if (action === 'match.delete') return t('ui.admin.delete_match');
    return action;
  };

  return (
    <div>
      {error && <div className="admin-alert admin-alert--danger">{t('ui.admin.load_failed', { msg: error })}</div>}
      {loading && <div className="admin-screen__empty">{t('ui.loading')}</div>}
      {!loading && rows.length === 0 && !error && <div className="admin-screen__empty">{t('ui.admin.no_data')}</div>}
      {!loading && rows.length > 0 && (
        <>
          <div className="admin-table admin-table--audit">
            <div className="admin-table__head">
              <span>{t('ui.admin.col_ts')}</span>
              <span>{t('ui.admin.col_ip')}</span>
              <span>{t('ui.admin.col_action')}</span>
              <span>{t('ui.admin.col_target')}</span>
            </div>
            {rows.map((r) => (
              <div
                className="admin-table__row admin-table__row--clickable"
                key={r.id}
                onClick={() => setExpanded(expanded === r.id ? null : r.id)}
              >
                <span className="admin-table__cell--muted">{formatTime(r.ts)}</span>
                <span className="admin-table__cell--mono">{r.ip}</span>
                <span>{actionLabel(r.action)}</span>
                <span className="admin-table__cell--mono">{r.targetId || '—'}</span>
              </div>
            ))}
          </div>
          {expanded !== null && (() => {
            const r = rows.find((x) => x.id === expanded);
            if (!r) return null;
            return (
              <div className="admin-panel">
                <div className="admin-panel__title">{actionLabel(r.action)}</div>
                <div className="admin-panel__meta">
                  <div>{t('ui.admin.col_ts')}: {formatTime(r.ts)}</div>
                  <div>{t('ui.admin.col_ip')}: <code>{r.ip}</code></div>
                  <div>{t('ui.admin.col_target')}: <code>{r.targetId || '—'}</code></div>
                </div>
                {r.before != null && (
                  <div className="admin-panel__meta">
                    <div>before:</div>
                    <pre
                      style={{
                        color: 'var(--parchment)',
                        fontSize: '0.78rem',
                        overflowX: 'auto',
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(r.before, null, 2)}
                    </pre>
                  </div>
                )}
                {r.after != null && (
                  <div className="admin-panel__meta">
                    <div>after:</div>
                    <pre
                      style={{
                        color: 'var(--parchment)',
                        fontSize: '0.78rem',
                        overflowX: 'auto',
                        margin: 0,
                      }}
                    >
                      {JSON.stringify(r.after, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            );
          })()}
          <Pagination
            offset={offset}
            limit={limit}
            total={total}
            onPrev={() => setOffset(Math.max(0, offset - limit))}
            onNext={() => setOffset(offset + limit)}
            t={t}
          />
        </>
      )}
    </div>
  );
}

function Pagination({
  offset,
  limit,
  total,
  onPrev,
  onNext,
  t,
}: {
  offset: number;
  limit: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  t: TFunc;
}) {
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  return (
    <div className="admin-pagination">
      <button type="button" className="admin-btn admin-btn--ghost" disabled={offset === 0} onClick={onPrev}>
        ‹ {t('ui.admin.prev')}
      </button>
      <span>{from}–{to} / {total}</span>
      <button type="button" className="admin-btn admin-btn--ghost" disabled={to >= total} onClick={onNext}>
        {t('ui.admin.next')} ›
      </button>
    </div>
  );
}
