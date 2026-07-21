import { useEffect } from 'react';
import BoardScreen from '@/components/game/BoardScreen';
import { useAppStore } from '@/store';
import { mockGameState } from '@/dev/mockGameState';

/**
 * Dev-only preview route. Injects a mock ClientGameState into the store on
 * mount so BoardScreen renders with sample data — no backend needed. All
 * socket actions (sendMove/leaveRoom/etc.) fail silently in the catch blocks,
 * which is fine for visual verification. Remove this page once the full
 * RoomEntry → Lobby → live-game flow is migrated.
 */
export default function Preview() {
  const setGameState = useAppStore((s) => s.setGameState);
  const setCurrentRoomId = useAppStore((s) => s.setCurrentRoomId);

  useEffect(() => {
    setGameState(mockGameState);
    setCurrentRoomId('preview-room');
    return () => {
      // leave the state; navigating away is enough. A real reset would
      // require the full leave flow which we don't want in dev preview.
    };
  }, [setGameState, setCurrentRoomId]);

  return (
    <div className="h-100 d-flex">
      <BoardScreen />
    </div>
  );
}
