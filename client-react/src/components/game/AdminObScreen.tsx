import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { io, type Socket } from 'socket.io-client';
import { ClientGameState, parseClientGameState } from 'citadels-common';
import GodViewBoard, { ObTopBar } from './GodViewBoard';

const ADMIN_TOKEN_KEY = 'adminToken';

// Live admin-OB (god-view) screen.
//
// Connects a DEDICATED socket (separate from the app's singleton) using the
// admin token as the handshake auth. The server marks that socket as an admin,
// and when it joins a room as a spectator it receives omniscient god-view
// `update game state` pushes (all hands + roles revealed) instead of a
// player-scoped view. Renders the live state via the shared GodViewBoard.
export default function AdminObScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { roomId } = useParams<{ roomId: string }>();

  const [gs, setGs] = useState<ClientGameState | null>(null);
  const [error, setError] = useState('');
  const [chat, setChat] = useState<Array<{ playerId: string; username: string; text: string; role?: number }>>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    const token = localStorage.getItem(ADMIN_TOKEN_KEY);
    if (!token) {
      setError(t('ui.admin.token_required'));
      return;
    }

    // A fresh connection authenticated with the admin token (NOT the user JWT),
    // so it never disturbs the player's own singleton socket / session.
    const s: Socket = io('/', {
      path: '/s/',
      autoConnect: false,
      auth: { token },
    });
    socketRef.current = s;

    let disposed = false;

    const onState = (data: unknown) => {
      if (disposed) return;
      try {
        setGs(parseClientGameState(data));
      } catch {
        // ignore malformed pushes
      }
    };

    s.on('connect', () => {
      // join as spectator: no playerId, isAdmin already flagged server-side →
      // server pushes god-view state on join and on every update.
      s.emit('join room', roomId || '', '', `OB-${Date.now().toString(36)}`, true, (res: any) => {
        if (disposed) return;
        if (res?.status === 'error') {
          setError(res.message || 'join failed');
          return;
        }
        if (res?.gameState) {
          onState(res.gameState);
        }
      });
    });
    s.on('update game state', onState);
    s.on('chat message', (msg: { playerId: string; username: string; text: string; role?: number; ts?: number }) => {
      if (disposed) return;
      setChat((prev) => [...prev, msg]);
    });
    s.on('connect_error', (err: Error) => {
      if (!disposed) setError(err.message || 'connect failed');
    });

    s.connect();

    return () => {
      disposed = true;
      s.removeAllListeners();
      s.disconnect();
      socketRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const phaseName = !gs ? '' : gs.progress === 3 ? t('ui.game.messages.end')
    : gs.board?.gamePhase === 0 ? t('ui.game.phase_initial')
      : gs.board?.gamePhase === 1 ? t('ui.game.phase_choose')
        : t('ui.game.phase_actions');
  const round = gs ? (typeof gs.roundNumber === 'number' ? gs.roundNumber : 1) : 1;

  if (error) {
    return (
      <div className="ob-screen">
        <div className="ob-screen__center ob-screen__center--error">
          <p>{error}</p>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => navigate('/admin')}>
            {t('ui.admin.back')}
          </button>
        </div>
      </div>
    );
  }

  if (!gs) {
    return <div className="ob-screen"><div className="ob-screen__center">{t('ui.loading')}</div></div>;
  }

  return (
    <div className="ob-screen">
      <ObTopBar
        brand={`${t('ui.title')} · OB`}
        round={round}
        phaseName={phaseName}
        scoreA={gs.teamScores?.A ?? 0}
        scoreB={gs.teamScores?.B ?? 0}
        roomId={roomId}
        onBack={() => navigate('/admin')}
        backLabel={t('ui.admin.back')}
      />

      <GodViewBoard gs={gs} chat={chat} />
    </div>
  );
}
