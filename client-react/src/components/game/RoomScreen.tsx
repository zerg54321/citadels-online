import { useEffect, useState } from 'react';
import { useNavigate, useBlocker } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useAppStore, useIsInRoom } from '@/store';
import GameScreen from './GameScreen';
import RoomEntryScreen from './RoomEntryScreen';

// Mirrors Vue RoomScreen.vue. The Vue beforeRouteLeave guard → React Router
// 6.4+ useBlocker; the beforeunload listener → useEffect. The leave-confirm
// modal stays local state (pendingTarget/showLeaveModal/leaving).
export default function RoomScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const isInRoom = useIsInRoom();
  const leaveRoom = useAppStore((s) => s.leaveRoom);

  const [leaving, setLeaving] = useState(false);
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  // useBlocker gives us the pending target location when navigation is
  // attempted while a blocker function returns true.
  // Read getState() fresh: leaveRoom clears gameState synchronously, but the
  // `isInRoom` closure is stale until re-render, which would block the
  // post-leave navigate('/') and let RoomEntryScreen auto-rejoin.
  const blocker = useBlocker(() => useAppStore.getState().gameState !== undefined);

  // Open the confirm modal whenever the blocker triggers (user tried to
  // navigate away while still in a room). This mirrors Vue beforeRouteLeave.
  useEffect(() => {
    if (blocker.state === 'blocked') setShowLeaveModal(true);
  }, [blocker]);

  // beforeunload: warn when closing tab/refreshing while in a room.
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!isInRoom) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isInRoom]);

  const cancelLeave = () => {
    setShowLeaveModal(false);
    if (blocker.state === 'blocked') blocker.reset();
  };

  const confirmLeave = async () => {
    setLeaving(true);
    try {
      await leaveRoom();
    } catch (e) {
      console.error('leave room failed', e);
    }
    setShowLeaveModal(false);
    setLeaving(false);
    if (blocker.state === 'blocked') {
      const target = blocker.location.pathname || '/';
      blocker.proceed();
      if (target !== '/') navigate(target, { replace: true });
    }
  };

  return (
    <div className="h-100 d-flex room-screen">
      {isInRoom ? <GameScreen /> : <RoomEntryScreen />}

      {showLeaveModal && createPortal(
        <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content lobby-modal">
              <div className="modal-header border-0 pb-2">
                <h5 className="modal-title text-gold lobby-modal-title">
                  {t('ui.score.leave_room_confirm_title')}
                </h5>
              </div>
              <div className="modal-body">
                <p className="text-parchment mb-0">{t('ui.score.leave_room_confirm_body')}</p>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-outline-gold" onClick={cancelLeave}>
                  {t('ui.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={confirmLeave}
                  disabled={leaving}
                >
                  {t('ui.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
