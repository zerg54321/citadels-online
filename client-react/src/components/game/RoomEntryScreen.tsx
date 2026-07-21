import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams } from 'react-router-dom';
import { type RoomId } from 'citadels-common';
import { useAppStore } from '@/store';
import LoadingSpinner from './elements/LoadingSpinner';

// Mirrors Vue RoomEntryScreen.vue. Auto-enter room: logged-in users join as
// player (or spectator if full / mid-game). Role can be switched inside the
// lobby — no intermediate choose screen.
//
// Vue $route.params.roomId → useParams; $route.query.spectate → useSearchParams.
// Vue data() (loading/error/errorMessage/errorReason/needLogin) → useState.
// Vue computed (isConnected/isLoggedIn/authUser/authReady) → store hooks.
// Vue watch (authReady/isLoggedIn) → useEffect pairs. Vue mounted → useEffect.
export default function RoomEntryScreen() {
  const { t } = useTranslation();
  const { roomId: routeRoomId } = useParams();
  const [searchParams] = useSearchParams();
  const roomId = (routeRoomId || '') as RoomId;
  const wantSpectate = searchParams.get('spectate') === '1' || searchParams.get('spectate') === 'true';

  const authReady = useAppStore((s) => s.authReady);
  const isLoggedIn = Boolean(useAppStore((s) => s.authToken && s.authUser));
  const authUser = useAppStore((s) => s.authUser);
  const getRoomInfo = useAppStore((s) => s.getRoomInfo);
  const joinRoom = useAppStore((s) => s.joinRoom);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);
  const [errorReason, setErrorReason] = useState<string | undefined>(undefined);
  const [needLogin, setNeedLogin] = useState(false);

  const openLogin = () => {
    window.dispatchEvent(new CustomEvent('open-auth'));
  };

  const doJoin = async (playerId: string | null, asSpectator: boolean) => {
    setLoading(true);
    setError(false);
    try {
      await joinRoom({
        roomId,
        playerId: playerId || '',
        username: authUser?.displayName || 'Spectator',
        asSpectator,
      });
    } catch (reason) {
      setLoading(false);
      const msg = reason instanceof Error ? reason.message : String(reason);
      // room full as player → fall back to spectator
      if (!asSpectator && (msg.includes('full') || msg.includes('cannot'))) {
        try {
          await joinRoom({
            roomId,
            playerId: '',
            username: authUser?.displayName || 'Spectator',
            asSpectator: true,
          });
          return;
        } catch {
          /* fall through */
        }
      }
      if (msg.includes('login required')) {
        setNeedLogin(true);
        return;
      }
      setError(true);
      setErrorMessage('ui.room.error_join');
      setErrorReason(msg);
    }
  };

  const getRoomInfoAndJoin = async (rid: RoomId) => {
    if (!authReady) return;
    let hadError = false;
    try {
      setLoading(true);
      setError(false);
      setNeedLogin(false);
      const roomInfo = await getRoomInfo(rid);
      let open = false;
      switch (roomInfo.status) {
        case 'open':
          open = true;
          break;
        case 'closed':
          open = false;
          break;
        case 'not found':
          setErrorMessage('ui.room.error_does_not_exist');
          setError(true);
          hadError = true;
          break;
        default:
          setErrorMessage('ui.unknown_error');
          setError(true);
          hadError = true;
      }
      // Vue: if (this.error) { this.loading = false; return; }
      if (hadError) {
        setLoading(false);
        return;
      }

      // Deep link spectate
      if (wantSpectate) {
        await doJoin('', true);
        return;
      }

      // reconnect saved seat
      const savedPlayerId = localStorage.getItem(rid);
      if (savedPlayerId && isLoggedIn) {
        await doJoin(savedPlayerId, false);
        return;
      }

      // not logged in: can only spectate, or login first
      if (!isLoggedIn) {
        if (!open) {
          // mid-game: allow anonymous spectate
          await doJoin('', true);
          return;
        }
        setNeedLogin(true);
        setLoading(false);
        return;
      }

      // logged in: auto join as player if open, else spectator
      if (open) {
        await doJoin(localStorage.getItem(rid), false);
      } else {
        await doJoin('', true);
      }
    } catch (err) {
      console.log(err);
      setLoading(false);
      setError(true);
      setErrorMessage('ui.unknown_error');
    }
  };

  // Vue mounted: if authReady, getRoomInfo. Runs once on mount.
  useEffect(() => {
    if (authReady && roomId) {
      getRoomInfoAndJoin(roomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Vue watch authReady(val): if val → getRoomInfo. Handles initial load when
  // auth not yet ready at mount time.
  useEffect(() => {
    if (authReady && roomId) {
      getRoomInfoAndJoin(roomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady]);

  // Vue watch isLoggedIn(val): if val && needLogin → getRoomInfo. Handles the
  // case where the user logs in from the need-login prompt.
  useEffect(() => {
    if (isLoggedIn && needLogin && roomId) {
      getRoomInfoAndJoin(roomId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

  const joinAsSpectator = () => {
    doJoin('', true);
  };

  return (
    <div className="container-fluid d-flex justify-content-center align-items-center">
      {loading && (
        <div className="text-center">
          <LoadingSpinner />
        </div>
      )}
      {!loading && error && (
        <div className="text-center text-gold">
          {t(errorMessage || 'ui.unknown_error', { msg: errorReason })}
        </div>
      )}
      {!loading && !error && needLogin && (
        <div className="card p-4 text-center room-entry-card" style={{ minWidth: '20rem' }}>
          <p className="mb-3 text-gold">{t('ui.room.login_required')}</p>
          <p className="text-muted-gold small mb-3">{t('ui.room.login_required_hint')}</p>
          <button type="button" className="btn btn-gold mb-2" onClick={openLogin}>
            {t('ui.auth.login')}
          </button>
          <button type="button" className="btn btn-outline-gold" onClick={joinAsSpectator}>
            {t('ui.room.spectate')}
          </button>
        </div>
      )}
      {!loading && !error && !needLogin && (
        <div className="text-muted-gold small text-center">
          {t('ui.room.connecting')}
        </div>
      )}
    </div>
  );
}
