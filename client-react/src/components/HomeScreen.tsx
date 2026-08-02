import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { GameMode } from 'citadels-common';
import { useAppStore } from '@/store';
import roomsApi, { type RoomListItem } from '@/api/rooms';
import ParticleField from '@/components/common/ParticleField';
import imgAssassin from '@/assets/characters/assassin.jpg';
import imgThief from '@/assets/characters/thief.jpg';
import imgMagician from '@/assets/characters/magician.jpg';
import imgKing from '@/assets/characters/king.jpg';
import imgBishop from '@/assets/characters/bishop.jpg';
import imgMerchant from '@/assets/characters/merchant.jpg';
import imgArchitect from '@/assets/characters/architect.jpg';
import imgWarlord from '@/assets/characters/warlord.jpg';

// Immersive single-viewport home screen. Left: a cinematic hero (background
// art + slogan + create CTA) crowned by the eight-character cast strip; right:
// a glass panel holding the live room list and three gameplay highlights. The
// app title + stats link stay in the shared header and are not repeated here.
// Character portraits map to i18n `characters[1..8]` (index 0 is the unknown
// placeholder). Art is lazy-loaded so the hero paints instantly.
const CHARACTERS = [
  { key: 1, img: imgAssassin },
  { key: 2, img: imgThief },
  { key: 3, img: imgMagician },
  { key: 4, img: imgKing },
  { key: 5, img: imgBishop },
  { key: 6, img: imgMerchant },
  { key: 7, img: imgArchitect },
  { key: 8, img: imgWarlord },
] as const;

const FACT_KEYS = [
  { icon: '🎭', title: 'ui.homepage.facts_roles_t', desc: 'ui.homepage.facts_roles_d' },
  { icon: '🏛', title: 'ui.homepage.facts_build_t', desc: 'ui.homepage.facts_build_d' },
  { icon: '⚔️', title: 'ui.homepage.facts_team_t', desc: 'ui.homepage.facts_team_d' },
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

  return (
    <div className="home-wrapper">
      {/* Full-viewport background layers (span entire screen on ultra-wide). */}
      <div className="home-bg" aria-hidden>
        <div className="home-bg__gradient" />
        <ParticleField />
        <div className="home-bg__veil" />
        <div className="home-bg__glow" />
      </div>

      {/* Constrained content. */}
      <div className="home">
      <section className="home-stage">

        <div className="home-stage__inner">
          <p className="home-stage__eyebrow">{t('ui.subtitle1')} · {t('ui.subtitle2')}</p>
          <h2 className="home-stage__slogan">{t('ui.homepage.slogan')}</h2>
          <p className="home-stage__tagline">{t('ui.homepage.tagline')}</p>
          <p className="home-stage__lead">{t('ui.homepage.lead')}</p>
          <div className="home-stage__cta">
            <button
              type="button"
              className="btn btn-gold home-stage__btn"
              disabled={creatingRoom || !isLoggedIn}
              onClick={handleCreateRoom}
            >
              {creatingRoom ? t('ui.loading') : t('ui.homepage.create_room')}
            </button>
            {!isLoggedIn && (
              <span className="home-stage__note text-gold">{t('ui.homepage.login_to_play')}</span>
            )}
            {createError && <span className="home-stage__note text-danger">{createError}</span>}
          </div>
        </div>

        <div className="home-stage__cast">
          <div className="home-stage__cast-head">
            <span className="home-stage__cast-title">{t('ui.homepage.chars_title')}</span>
            <span className="home-stage__cast-hint">{t('ui.homepage.chars_hint')}</span>
          </div>
          <div className="home-stage__chars">
            {CHARACTERS.map((c) => (
              <div className="home-char" key={c.key}>
                <div className="home-char__frame">
                  <div
                    className="home-char__img"
                    style={{ backgroundImage: `url(${c.img})` }}
                  />
                  <div className="home-char__veil" />
                </div>
                <span className="home-char__name">{t(`characters.${c.key}.name`)}</span>
                <span className="home-char__desc">{t(`characters.${c.key}.description`)}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Right: glass panel — live rooms + gameplay highlights ─────── */}
      <aside className="home-panel">
        <section className="home-rooms">
          <div className="home-rooms__bar">
            <div className="home-rooms__bar-left">
              <strong className="home-rooms__bar-title">{t('ui.homepage.rooms_panel')}</strong>
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
            {roomsError && <div className="alert alert-danger py-2">{roomsError}</div>}
            {roomsLoading && rooms.length === 0 && (
              <div className="home-rooms__state text-muted-gold">{t('ui.loading')}</div>
            )}
            {!roomsLoading && rooms.length === 0 && (
              <div className="home-rooms__state home-rooms__empty">
                <div className="home-rooms__empty-icon">🏛</div>
                <p className="text-muted-gold">{t('ui.rooms.empty')}</p>
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
              <div className="home-rooms__list">
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
                      <span className="home-rooms__fill-count">
                        <strong>{room.playerCount}</strong>/{room.maxPlayers}
                      </span>
                      {room.spectatorCount > 0 && (
                        <span className="home-rooms__spec">
                          {t('ui.rooms.spectators', { n: room.spectatorCount })}
                        </span>
                      )}
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
        </section>

        <section className="home-facts">
          {FACT_KEYS.map((f) => (
            <div className="home-fact" key={f.title}>
              <div className="home-fact__icon">{f.icon}</div>
              <div className="home-fact__text">
                <div className="home-fact__name">{t(f.title)}</div>
                <div className="home-fact__desc">{t(f.desc)}</div>
              </div>
            </div>
          ))}
        </section>
      </aside>
      </div>
    </div>
  );
}
