import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { GameMode } from 'citadels-common';
import { useAppStore } from '@/store';
import roomsApi, { type RoomListItem } from '@/api/rooms';

// Mirrors Vue HomeScreen.vue. Vue data() (creatingRoom/createError/rooms/
// roomsLoading/roomsError/pollTimer/featureKeys) → useState + useRef. Vue
// computed isLoggedIn → store hook. Vue mounted/beforeUnmount poll loop →
// useEffect with setInterval. SCSS extracted to _home-screen.scss.
const FEATURE_KEYS = [
  { icon: '⚔️', title: 'ui.homepage.feat_3v3_t', desc: 'ui.homepage.feat_3v3_d' },
  { icon: '🤖', title: 'ui.homepage.feat_ai_t', desc: 'ui.homepage.feat_ai_d' },
  { icon: '🏆', title: 'ui.homepage.feat_rank_t', desc: 'ui.homepage.feat_rank_d' },
  { icon: '👁', title: 'ui.homepage.feat_spec_t', desc: 'ui.homepage.feat_spec_d' },
] as const;

export default function HomeScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isLoggedIn = Boolean(useAppStore((s) => s.authToken && s.authUser));
  const createRoom = useAppStore((s) => s.createRoom);

  const [creatingRoom, setCreatingRoom] = useState(false);
  const [createError, setCreateError] = useState('');
  const [rooms, setRooms] = useState<RoomListItem[]>([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [roomsError, setRoomsError] = useState('');
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadRooms = async () => {
    setRoomsLoading(true);
    setRoomsError('');
    try {
      setRooms(await roomsApi.list());
    } catch (e) {
      setRoomsError(e instanceof Error ? e.message : String(e));
    } finally {
      setRoomsLoading(false);
    }
  };

  const handleCreateRoom = async () => {
    setCreatingRoom(true);
    setCreateError('');
    try {
      const roomId = await createRoom();
      navigate(`/room/${roomId}`);
    } catch (error) {
      console.error('error when creating room', error);
      setCreateError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingRoom(false);
    }
  };

  const playerNames = (room: RoomListItem) => room.players.map((p) => p.username).join(', ') || '—';

  const phaseLabel = (phase: string) => {
    if (phase === 'lobby') return t('ui.rooms.phase_lobby');
    if (phase === 'in_game') return t('ui.rooms.phase_in_game');
    return t('ui.rooms.phase_finished');
  };

  const phaseBadge = (phase: string) => {
    if (phase === 'lobby') return 'badge-success';
    if (phase === 'in_game') return 'badge-primary';
    return 'badge-secondary';
  };

  const modeLabel = (room: RoomListItem) => {
    if (room.phase === 'lobby') {
      return room.playerCount === 6
        ? t('ui.lobby.settings.mode_team6')
        : t('ui.stats.casual');
    }
    if (room.gameMode === GameMode.COMPETITIVE_TEAM6) {
      return t('ui.lobby.settings.mode_team6');
    }
    return t('ui.stats.casual');
  };

  const goJoin = (roomId: string) => navigate(`/room/${roomId}`);
  const goSpectate = (roomId: string) => navigate(`/room/${roomId}?spectate=1`);

  // Vue mounted: loadRooms + 4s poll. Vue beforeUnmount: clearInterval.
  useEffect(() => {
    loadRooms();
    pollTimerRef.current = setInterval(loadRooms, 4000);
    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, []);

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero__glow" />
        <div className="container py-5">
          <div className="row align-items-center">
            <div className="col-lg-7 mb-4 mb-lg-0">
              <p className="home-hero__eyebrow">{t('ui.subtitle1')} · {t('ui.subtitle2')}</p>
              <h1 className="home-hero__title">{t('ui.title')}</h1>
              <p className="home-hero__lead">{t('ui.homepage.hero_lead')}</p>
              <ul className="home-hero__bullets">
                <li>{t('ui.homepage.bullet_3v3')}</li>
                <li>{t('ui.homepage.bullet_ai')}</li>
                <li>{t('ui.homepage.bullet_rank')}</li>
              </ul>
              <div className="d-flex flex-wrap align-items-center gap-2 mt-3">
                <button
                  type="button"
                  className="btn btn-lg btn-gold home-hero__cta"
                  disabled={creatingRoom || !isLoggedIn}
                  onClick={handleCreateRoom}
                >
                  {creatingRoom ? t('ui.loading') : t('ui.homepage.create_room')}
                </button>
                <button type="button" className="btn btn-lg btn-outline-gold" onClick={() => navigate('/stats')}>
                  {t('ui.stats.title')}
                </button>
              </div>
              {!isLoggedIn && (
                <p className="text-gold small mt-2 mb-0">{t('ui.homepage.login_to_play')}</p>
              )}
              {createError && <p className="text-danger small mt-2 mb-0">{createError}</p>}
            </div>
            <div className="col-lg-5">
              <div className="home-hero__card">
                <div className="home-hero__card-title">{t('ui.homepage.how_title')}</div>
                <ol className="home-hero__steps mb-0">
                  <li>{t('ui.homepage.how_1')}</li>
                  <li>{t('ui.homepage.how_2')}</li>
                  <li>{t('ui.homepage.how_3')}</li>
                  <li>{t('ui.homepage.how_4')}</li>
                </ol>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="container py-4 home-main">
        <div className="row">
          <div className="col-lg-8 mb-4">
            <div className="card home-rooms shadow-sm">
              <div className="card-header d-flex justify-content-between align-items-center">
                <div>
                  <strong className="text-gold">{t('ui.rooms.title')}</strong>
                  <span className="badge badge-secondary ml-2">{rooms.length}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-secondary"
                  disabled={roomsLoading}
                  onClick={loadRooms}
                >
                  {t('ui.rooms.refresh')}
                </button>
              </div>
              <div className="card-body">
                <p className="small text-muted mb-3">{t('ui.rooms.hint')}</p>
                {roomsError && <div className="alert alert-danger py-2">{roomsError}</div>}
                {roomsLoading && rooms.length === 0 && (
                  <div className="text-muted py-4 text-center">{t('ui.loading')}</div>
                )}
                {!roomsLoading && rooms.length === 0 && (
                  <div className="home-rooms__empty text-center py-4">
                    <div className="display-4 mb-2 opacity-50">🏛</div>
                    <p className="text-muted mb-3">{t('ui.rooms.empty')}</p>
                    <button
                      type="button"
                      className="btn btn-gold"
                      disabled={creatingRoom || !isLoggedIn}
                      onClick={handleCreateRoom}
                    >
                      {t('ui.homepage.create_room')}
                    </button>
                  </div>
                )}
                {rooms.length > 0 && (
                  <div className="table-responsive">
                    <table className="table table-hover mb-0 align-middle">
                      <thead className="home-rooms__head">
                        <tr>
                          <th>{t('ui.rooms.room_id')}</th>
                          <th>{t('ui.rooms.phase')}</th>
                          <th>{t('ui.rooms.mode')}</th>
                          <th>{t('ui.rooms.players')}</th>
                          <th> </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rooms.map((room) => (
                          <tr key={room.roomId}>
                            <td>
                              <code className="home-rooms__id">{room.roomId}</code>
                              <div className="small text-muted text-truncate" style={{ maxWidth: '14rem' }}>
                                {playerNames(room)}
                              </div>
                            </td>
                            <td>
                              <span className={`badge home-rooms__badge-lobby ${phaseBadge(room.phase)}`}>
                                {phaseLabel(room.phase)}
                              </span>
                              {room.spectatorCount > 0 && (
                                <span className="badge badge-light ml-1">
                                  {t('ui.rooms.spectators', { n: room.spectatorCount })}
                                </span>
                              )}
                            </td>
                            <td className="small">{modeLabel(room)}</td>
                            <td>
                              <strong>{room.playerCount}</strong>
                              <span className="text-muted">/{room.maxPlayers}</span>
                            </td>
                            <td className="text-right text-nowrap">
                              {room.canJoinAsPlayer && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-primary mr-1"
                                  disabled={!isLoggedIn}
                                  onClick={() => goJoin(room.roomId)}
                                >
                                  {t('ui.rooms.join')}
                                </button>
                              )}
                              {room.canSpectate && (
                                <button
                                  type="button"
                                  className="btn btn-sm btn-outline-secondary"
                                  onClick={() => goSpectate(room.roomId)}
                                >
                                  {t('ui.rooms.spectate')}
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="card mb-3 shadow-sm home-side">
              <div className="card-body">
                <h6 className="text-uppercase text-muted small mb-2">
                  {t('ui.homepage.features_title')}
                </h6>
                {FEATURE_KEYS.map((f) => (
                  <div className="home-feature" key={f.title}>
                    <div className="home-feature__icon">{f.icon}</div>
                    <div>
                      <div className="font-weight-bold">{t(f.title)}</div>
                      <div className="small text-muted">{t(f.desc)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="card shadow-sm home-side">
              <div className="card-body small text-muted">
                <div className="font-weight-bold text-dark mb-1">{t('ui.homepage.tip_title')}</div>
                <p className="mb-0">{t('ui.homepage.tip_body')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
