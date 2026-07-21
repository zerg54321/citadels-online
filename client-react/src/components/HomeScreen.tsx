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

  // Visual seat-fill row: 6 dots, first `count` filled, rest hollow.
  const renderSeatDots = (count: number, max: number) => (
    <span className="home-rooms__seats" aria-hidden>
      {Array.from({ length: max }, (_, i) => (
        <span key={i} className={`home-rooms__seat${i < count ? ' home-rooms__seat--on' : ''}`} />
      ))}
    </span>
  );

  return (
    <div className="home">
      <section className="home-hero">
        <div className="home-hero__glow" />
        <div className="home-hero__ornament" />
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
              <div className="d-flex flex-wrap align-items-center gap-2 mt-4 home-hero__actions">
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
                <p className="text-gold small mt-3 mb-0">{t('ui.homepage.login_to_play')}</p>
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
            <div className="home-rooms">
              <div className="home-rooms__bar">
                <div className="d-flex align-items-center">
                  <strong className="text-gold home-rooms__bar-title">{t('ui.rooms.title')}</strong>
                  <span className="home-rooms__count">{rooms.length}</span>
                </div>
                <button
                  type="button"
                  className="btn btn-sm btn-outline-gold home-rooms__refresh"
                  disabled={roomsLoading}
                  onClick={loadRooms}
                >
                  {roomsLoading ? t('ui.loading') : t('ui.rooms.refresh')}
                </button>
              </div>
              <div className="home-rooms__body">
                <p className="small text-muted-gold mb-3">{t('ui.rooms.hint')}</p>
                {roomsError && <div className="alert alert-danger py-2">{roomsError}</div>}
                {roomsLoading && rooms.length === 0 && (
                  <div className="text-muted-gold py-5 text-center home-rooms__loading">{t('ui.loading')}</div>
                )}
                {!roomsLoading && rooms.length === 0 && (
                  <div className="home-rooms__empty text-center py-5">
                    <div className="home-rooms__empty-icon">🏛</div>
                    <p className="text-muted-gold mb-3">{t('ui.rooms.empty')}</p>
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
                  <div className="home-rooms__grid">
                    {rooms.map((room) => (
                      <div
                        key={room.roomId}
                        className={`home-rooms__card home-rooms__card--${room.phase}`}
                      >
                        <div className="home-rooms__card-top">
                          <code className="home-rooms__id">{room.roomId}</code>
                          <span className="home-rooms__status">
                            <span className="home-rooms__status-dot" />
                            {phaseLabel(room.phase)}
                          </span>
                        </div>
                        <div className="home-rooms__card-mid">
                          <span className="home-rooms__mode">{modeLabel(room)}</span>
                          {room.spectatorCount > 0 && (
                            <span className="home-rooms__spec">
                              {t('ui.rooms.spectators', { n: room.spectatorCount })}
                            </span>
                          )}
                        </div>
                        <div className="home-rooms__fill">
                          {renderSeatDots(room.playerCount, room.maxPlayers)}
                          <span className="home-rooms__fill-count">
                            <strong>{room.playerCount}</strong>/{room.maxPlayers}
                          </span>
                        </div>
                        <div className="home-rooms__names text-truncate" title={playerNames(room)}>
                          {playerNames(room)}
                        </div>
                        <div className="home-rooms__card-actions">
                          {room.canJoinAsPlayer && (
                            <button
                              type="button"
                              className="btn btn-sm btn-gold home-rooms__btn"
                              disabled={!isLoggedIn}
                              onClick={() => goJoin(room.roomId)}
                            >
                              {t('ui.rooms.join')}
                            </button>
                          )}
                          {room.canSpectate && (
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-gold home-rooms__btn"
                              onClick={() => goSpectate(room.roomId)}
                            >
                              {t('ui.rooms.spectate')}
                            </button>
                          )}
                          {!room.canJoinAsPlayer && !room.canSpectate && (
                            <span className="home-rooms__closed text-muted-gold small">—</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="col-lg-4">
            <div className="home-side home-side--features">
              <h6 className="home-side__title">
                {t('ui.homepage.features_title')}
              </h6>
              {FEATURE_KEYS.map((f) => (
                <div className="home-feature" key={f.title}>
                  <div className="home-feature__icon">{f.icon}</div>
                  <div className="home-feature__text">
                    <div className="home-feature__name">{t(f.title)}</div>
                    <div className="small text-muted-gold">{t(f.desc)}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="home-side home-side--tip">
              <div className="home-side__tip-icon">💡</div>
              <div>
                <div className="home-side__tip-title">{t('ui.homepage.tip_title')}</div>
                <p className="mb-0 small text-muted-gold">{t('ui.homepage.tip_body')}</p>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
