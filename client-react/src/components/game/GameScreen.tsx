import { useGameProgress } from '@/store';
import BoardScreen from './BoardScreen';
import LobbyScreen from './LobbyScreen';

// Mirrors Vue GameScreen.vue. Simple switch on gameProgress: IN_LOBBY →
// LobbyScreen; IN_GAME/FINISHED → BoardScreen; anything else → error msg.
export default function GameScreen() {
  const gameProgress = useGameProgress();

  const showLobby = gameProgress === 'IN_LOBBY';
  const showBoard = gameProgress === 'IN_GAME' || gameProgress === 'FINISHED';

  return (
    <div className="container-fluid p-0 h-100 game-screen">
      {showLobby && (
        <div className="container-lg h-100 py-4">
          <LobbyScreen />
        </div>
      )}
      {showBoard && (
        <div className="h-100 d-flex">
          <BoardScreen />
        </div>
      )}
      {!showLobby && !showBoard && (
        <div className="h-100">
          Invalid game state: {gameProgress}
        </div>
      )}
    </div>
  );
}
